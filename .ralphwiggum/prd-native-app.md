# ReadingSync — iOS Native Rewrite PRD

## Goal

Replace the Expo/React Native mobile app with a native iOS (Swift/SwiftUI) app that shares the existing Next.js REST backend and the KOReader plugin. Keep cross-device reading progress sync between Kindle and iPhone.

## Scope

**In scope**
- New iOS app (`ios/`) built with Swift, SwiftUI, Readium Swift Toolkit, GRDB.
- Minor backend change to decouple `bookId` from filename (shipped).
- KOReader plugin update to emit canonical `bookId` from `dc:identifier` (shipped).

**Out of scope**
- Android (iOS-only; confirmed).
- Web reader (removed in prior milestone, not reintroduced).
- Backend rewrite. All endpoints under `src/app/api/**` stay as-is.

## Why rewrite instead of iterate

The React Native mobile app accumulated substantial EPUB-rendering complexity fighting the platform:

- Custom text paginator (`mobile/lib/text-paginator.tsx`).
- Forked `react-native-page-flipper` for page curl animation.
- Unused WebView + Skia paginators kept "for reference".
- Custom page-image cache, view-shot capture, etc.

Open defects at time of decision: images don't render, controls overlay needs redesign, progress saving broke when chapter boundaries were removed, reader settings don't re-paginate.

Readium Swift Toolkit solves all of these as a single dependency. `UIPageViewController(transitionStyle: .pageCurl)` is the native Apple Books page-curl effect in one line. The cost of rewriting auth/sync/offline logic in Swift is smaller than the cost of continuing to maintain the RN reader.

Tradeoff accepted: iOS-only, no Android path without a second codebase.

---

## Architecture

### What stays

- `src/` — Next.js REST API (auth, progress, upload, api-keys).
- `kindle/reading_sync.koplugin/` — KOReader plugin.
- `drizzle/` schema and Postgres database.
- R2 bucket for EPUB storage.

### What's replaced

The entire `mobile/` directory is archived to a `legacy-rn-mobile` branch and deleted from `main`.

### What's new

`ios/ReadingSync.xcodeproj` — native iOS app targeting **iOS 17+**. iOS 17 for `@Observable`, liquid-glass materials, modern scroll APIs.

---

## `bookId` contract (shared across all clients)

The same book must produce the same `bookId` on every client. Previously it was derived from filename, which diverged across clients due to different sanitization rules.

**Rule (canonical):**

1. Prefer EPUB `dc:identifier` from `content.opf` (ISBN, UUID, etc.).
2. Fall back to the source filename when `dc:identifier` is absent.
3. Sanitize the chosen value: **lowercase, replace `[^a-z0-9._-]` with `-`, collapse runs of `-`, trim leading/trailing `-`. Empty → `"unknown"`.**

**Server validation:** `/api/upload` PUT rejects any `bookId` not matching `/^[a-z0-9._-]+$/` with HTTP 400. The server does not re-derive; clients are authoritative.

**Shipped:**

- `src/app/api/upload/route.ts` — PUT now requires `bookId` (and optional `bookTitle`); no longer uses `safeName` as id. R2 key still uses `safeName` (storage path only).
- `kindle/reading_sync.koplugin/main.lua` — new `sanitizeId()`, `readDcIdentifier()`, updated `getBookId()`, `uploadEpub()` signature changed to `(filepath, bookId, bookTitle)`.

**Database wipe (one-off):** existing rows have mismatched ids; no data to preserve.

```sql
TRUNCATE TABLE web_reading_progress, web_sync_history RESTART IDENTITY;
```

Auth, users, API keys, and R2 objects untouched. Next sync from each client re-registers books under the new canonical ids.

---

## Position format — EPUB CFI

Today the `position` column stores whatever string each client emits (KOReader XPointer on Kindle, char offsets on RN). Clients don't actually parse each other's positions — navigation works via `excerpt` text search with page-number fallback.

**Decision:** standardize on **EPUB CFI**.

- W3C/IDPF spec for canonical intra-EPUB locations.
- Readium Swift emits CFI natively via `Locator.locations`.
- KOReader plugin will be updated to emit CFI (approach: XPath → CFI converter in Lua, ~50 LoC).
- Server remains opaque — `position` stays `VARCHAR`.
- `excerpt` kept forever as a navigation fallback (cheap insurance for EPUB re-exports with shifted CFIs).

Since both clients download the same EPUB bytes from R2, spine item ids and element hierarchy are stable — CFIs will match.

---

## iOS app structure

```
ios/
├── ReadingSync/                 # app target: SwiftUI entry, routing, DI
│   ├── ReadingSyncApp.swift
│   ├── AppRoot.swift
│   └── Assets.xcassets
├── Packages/                    # local SPM packages
│   ├── SyncCore/                # pure logic, no UIKit — unit-testable
│   │   ├── SyncEngine.swift
│   │   ├── ProgressResolver.swift   # port of resolveProgressOnOpen
│   │   ├── SyncQueue.swift
│   │   ├── APIClient.swift          # URLSession + bearer token
│   │   ├── Models.swift             # Progress, RemoteProgress, Book
│   │   └── BookIdentity.swift       # sanitize rule — mirrors server/Lua
│   ├── Persistence/
│   │   ├── AppDatabase.swift        # GRDB setup
│   │   ├── Migrations.swift
│   │   └── Records.swift            # BookRecord, ProgressRecord, SyncQueueRecord
│   ├── EpubReader/                  # wraps Readium
│   │   ├── ReaderView.swift         # SwiftUI wrapper for EPUBNavigatorViewController
│   │   ├── PageCurlTransition.swift # UIPageViewController adapter
│   │   ├── ControlsOverlay.swift
│   │   ├── TOCSheet.swift
│   │   ├── SettingsSheet.swift
│   │   └── Scrubber.swift
│   └── LibraryUI/
│       ├── LibraryView.swift
│       ├── BookImportService.swift
│       └── SettingsView.swift
└── Tests/
    └── SyncCoreTests/               # push/pull, 409 deferral, conflict resolution
```

**Why this split:** `SyncCore` has no UI deps → full unit-test coverage of the behavior that was hardest to verify in RN. `EpubReader` is the only module touching Readium → swap risk is contained.

### Dependencies (SPM only)

| Package | Purpose |
|---|---|
| `readium/swift-toolkit` | EPUB parsing, rendering, `Locator`, CFI |
| `groue/GRDB.swift` | SQLite with type-safe records + observation |
| `apple/swift-log` | structured logging |

No networking library (`URLSession` is enough). No DI framework (constructor injection + environment). No Combine (`AsyncSequence` + `@Observable`).

### Storage

GRDB schema mirrors the RN one 1:1 so the port is mechanical:

```
books              (book_id PK, title, author, cover_path, local_epub_path, file_size, source)
reading_positions  (book_id PK, position, current_page, total_pages, progress,
                    updated_at, source, device_id, excerpt)
sync_queue         (id PK, book_id, position, ..., status, retry_count, created_at)
```

Database file → `applicationSupportDirectory`.
Token + device id → Keychain (`kSecClassGenericPassword`).
EPUB files + covers → Application Support, per-book subdirectory keyed by `bookId`.

### Background sync

- `BGAppRefreshTask` registered at launch.
- `SyncEngine.flush()` on foreground resume — same trigger points as the RN `AppState` listener.
- No background EPUB downloads; iOS throttles them and they aren't needed.

### Key type contracts

```swift
public struct BookIdentity {
    public static let pattern = /^[a-z0-9._-]+$/
    public static func sanitize(_ s: String) -> String { /* lowercase, regex replace, collapse, trim */ }
    public static func from(publication: Publication) -> String {
        // publication.metadata.identifier ?? sourceFilename, then sanitize
    }
}

public struct RemoteProgress: Codable {
    let bookId: String
    let bookTitle: String?
    let position: String          // EPUB CFI
    let currentPage: Int?
    let totalPages: Int?
    let progress: Double
    let excerpt: String?
    let source: String?
    let deviceId: String?
    let updatedAt: Int            // Unix seconds
}
```

`position` stays `String` at type level (server opaque). Inside the reader, wrap via Readium `Locator` when reading/writing.

---

## Milestones

### M1 — Auth + Library (proves API contract)

- Xcode project + SPM packages skeleton.
- `APIClient` with login via `/api/auth/mobile-signin` → token in Keychain.
- `LibraryView` listing books from `GET /api/progress`.
- No import, no reader, no sync.
- ~500 LoC. Exit criterion: log in and see Kindle-synced books rendered in a list.

### M2 — Reader (Readium)

- Open EPUB from R2 with Readium `EPUBNavigatorViewController`.
- Page curl transition via `UIPageViewController`.
- No progress sync yet; position is local-only.
- Exit criterion: open a book, swipe pages with curl, close, reopen to same page.

### M3 — Progress sync

- Port `sync-engine.ts` to `SyncCore` verbatim (same timestamps, 409 deferral, device-id rule).
- Map Readium `Locator` ↔ EPUB CFI for the `position` field.
- Port `resolveProgressOnOpen` (use_local / use_remote / prompt) with the same thresholds.
- Exit criterion: read on Kindle, open on iPhone, prompted to jump to Kindle position; read on iPhone, open on Kindle, prompted to jump back.

### M4 — Offline + background sync

- GRDB `sync_queue` flushed on foreground + via `BGAppRefreshTask`.
- Local EPUB cache under Application Support.
- Offline page turns enqueue; flush on reconnect.
- Exit criterion: airplane mode → read → reconnect → progress arrives server-side.

### M5 — Polish

- Controls overlay, TOC sheet, search, settings, scrubber.
- Liquid glass materials on overlays (`.ultraThinMaterial`).
- Font / theme / brightness.
- Exit criterion: feature parity with current RN app minus the known defects.

---

## KOReader plugin — remaining work

- XPath → EPUB CFI converter in Lua (~50 LoC) so `position` becomes CFI.
- Send `book_title` alongside `bookId` (shipped).
- Keep `excerpt` field as navigation fallback.

---

## Deliberately excluded

- **UI snapshot tests.** Maintenance cost outweighs value for a solo project.
- **Analytics / crash reporter.** Add on evidence of a real need.
- **Feature flags.** Solo developer; ship or don't.
- **Combine.** `AsyncSequence` + `@Observable` suffice.
- **Android port.** Not on the roadmap. If ever added, it would be a separate Kotlin codebase, not shared code.

---

## Open questions

- **Minimum iOS version final.** Currently stated as iOS 17+. Revisit only if a user with older hardware appears.
- **`bookId` migration for long-term.** Current plan wipes DB once. If the app ever has multiple users, a proper backfill script (download each EPUB, parse `dc:identifier`, update row) would be required instead.
- **Existing RN `mobile/` directory.** Plan is to archive to `legacy-rn-mobile` branch and delete from `main` before starting `ios/` work. Confirm timing.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Readium CFI output differs from KOReader CFI output | `excerpt` fallback handles mismatches; canonicalize via test corpus of 5–10 real EPUBs before M3 ships |
| Kindle and iOS download slightly different EPUB variants | Both clients read from R2, which serves exact uploaded bytes — verified |
| `dc:identifier` missing or non-unique across a user's library | Sanitized-filename fallback is deterministic; collision requires two distinct books with identical filenames and no identifiers (unlikely for one user) |
| `BGAppRefreshTask` throttled to the point of uselessness | Foreground-resume flush is primary; background is a nice-to-have. Matches the RN approach. |
