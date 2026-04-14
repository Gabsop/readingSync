# PRD: ReadingSync Native App

## Overview

A React Native app that replaces the current web reader and becomes the primary reading client in the ReadingSync ecosystem. It replicates the Apple Books experience as faithfully as possible — fluid page turns, native typography, and system-level integration — while syncing reading progress bidirectionally with Kindle (via KOReader).

The web app is being retired. The mobile app becomes the only non-Kindle reader.

---

## Goals

1. **Apple Books fidelity** — match the visual design, interactions, and reading UX of Apple Books as closely as possible
2. **Seamless Kindle sync** — continue reading from Kindle without friction, using a KOSync-inspired architecture
3. **Offline-first** — books download to device, reading works without connectivity, progress syncs when back online
4. **Native feel** — the app must feel native regardless of rendering approach. Use iOS 26's Liquid Glass design language for all chrome (tab bars, toolbars, overlays, sheets). If a WebView is used for EPUB rendering (see Open Questions), it must be invisible to the user — native chrome, native gestures, native animations around it

---

## Target Platform

- iOS first (primary focus)
- Android second (shared codebase via React Native)
- Minimum iOS 18, Android 13 (Liquid Glass requires iOS 26 but degrades gracefully on 18+)

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | React Native (Expo) | Shared codebase, native modules access, OTA updates |
| Navigation | React Navigation (native stack) | Native transitions, gesture-driven back navigation |
| EPUB Parsing | Custom parser (zip + XML) | Full control over rendering; no WebView dependency |
| Text Rendering | React Native `<Text>` with native font metrics | True native typography, matches system rendering |
| Page Layout | Custom pagination engine | Pixel-perfect page breaks, columnar layout like Apple Books |
| Animations | React Native Reanimated 3 | 60fps page curl / slide animations on the UI thread |
| Gestures | React Native Gesture Handler | Native tap zones, swipes, pinch-to-zoom text |
| Storage | SQLite (expo-sqlite) | Local book library, reading positions, offline queue |
| File Storage | expo-file-system | Downloaded EPUBs stored on device |
| Networking | fetch + background sync | Progress sync with existing ReadingSync API |
| State | Zustand | Lightweight, no boilerplate, works well with persistence |
| Auth | better-auth | Modern auth library, Google OAuth, session tokens, replaces NextAuth |

### Native Module Requirements

React Native provides basic native components out of the box (`View` → `UIView`, `Text` → `UILabel`, etc.), but the full iOS 26 experience requires additional native bridging:

| Component | Approach | Phase |
|---|---|---|
| Tab bar | React Navigation bottom tabs (standard native tab bar — gets Liquid Glass automatically on iOS 26) | M1 |
| Navigation bar | React Navigation native stack (standard `UINavigationBar` — gets glass automatically) | M1 |
| Context menus | `react-native-context-menu-view` (wraps `UIContextMenuInteraction`) | M1 |
| Half-sheet modal | `react-native-bottom-sheet` or `@gorhom/bottom-sheet` (wraps `UISheetPresentationController`) | M2 |
| Haptic feedback | `expo-haptics` (wraps `UIImpactFeedbackGenerator`) | M2 |
| Blur effects | `expo-blur` (wraps `UIVisualEffectView`) | M2 |
| Liquid Glass material | Custom Swift native module exposing `.glassEffect` modifier via SwiftUI interop | M4 |
| Dynamic Type | React Native `allowFontScaling` + native font metrics | M1 |
| Secure storage | `expo-secure-store` (wraps iOS Keychain) | M1 |
| Google Sign-In | `expo-auth-session` (wraps `ASWebAuthenticationSession`) | M1 |
| Background fetch | `expo-background-fetch` + `expo-task-manager` | M3 |
| Document picker | `expo-document-picker` (wraps `UIDocumentPickerViewController`) | M3 |
| Brightness control | `expo-brightness` (wraps `UIScreen.main.brightness`) | M2 |

**Strategy**: standard React Native + community libraries cover 90% of the native feel from M1. The remaining 10% (Liquid Glass material specifically) requires a custom Swift module in M4. Since iOS 26's standard UIKit components (tab bar, navigation bar, alerts) get Liquid Glass automatically, most of the app will look correct without custom work — the custom module is only needed for the reader's floating toolbar and settings sheet where we use custom views instead of standard UIKit.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    React Native App                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Library  │  │  Reader  │  │   Sync Engine     │  │
│  │  Screen  │→ │  Screen  │  │  (background)     │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│       │              │               │               │
│  ┌──────────────────────────────────────────────┐   │
│  │              Local SQLite DB                  │   │
│  │  books | positions | sync_queue | settings    │   │
│  └──────────────────────────────────────────────┘   │
│       │                                              │
│  ┌──────────────────────────────────────────────┐   │
│  │           expo-file-system                    │   │
│  │         /Documents/books/*.epub               │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────────┐   ┌──────────────────────────┐
│  ReadingSync Backend │   │   Kindle (KOReader)      │
│  (Next.js API)       │   │                          │
│                      │   │   reading_sync.koplugin  │
│  POST /api/progress  │   │   Syncs via same API     │
│  GET  /api/progress  │   │   Auth: x-api-key        │
│  GET  /api/progress/ │   │                          │
│       :id            │   │   Position: XPointer     │
│  POST /api/upload    │   │   Identity: filename     │
│  /api/auth/*         │   │                          │
└──────────────────────┘   └──────────────────────────┘
```

### Clients

| Client | Role | Position Format | Status |
|---|---|---|---|
| Mobile app (React Native) | **Primary reader** | EPUB CFI | New (this PRD) |
| Kindle (KOReader plugin) | Secondary reader | XPointer (DOM path) | Existing |
| Web app (Next.js + epub.js) | **Retired** | EPUB CFI | Being removed |

---

## Core Flows

### Flow 1: Adding a New Book

```
User has an EPUB file
    │
    ├── Option A: Import from Kindle (automatic, preferred)
    │   │
    │   │   User puts EPUB on Kindle via USB and starts reading
    │   │       │
    │   │       ▼
    │   │   KOReader plugin syncs progress → POST /api/progress
    │   │       │
    │   │       ▼
    │   │   Backend responds: this book has no EPUB file yet
    │   │       │
    │   │       ▼
    │   │   Plugin requests presigned upload URL → POST /api/upload
    │   │       │
    │   │       ▼
    │   │   Plugin reads EPUB from Kindle filesystem (/mnt/us/...)
    │   │   and streams it directly to R2 via presigned PUT URL
    │   │   (using ltn12.source.file() for memory-efficient streaming)
    │   │       │
    │   │       ▼
    │   │   Plugin confirms upload → PUT /api/upload
    │   │       │
    │   │       ▼
    │   │   Done. Book now has progress + EPUB file on backend.
    │   │   Next time the app opens, the book appears in the library
    │   │   with cover, progress, and ready to read.
    │   │
    │   └── The user never touches the app to add the book.
    │       Read on Kindle → it shows up in the app automatically.
    │
    ├── Option B: Import from Files app (manual)
    │   │
    │   │   User taps "+" button in Library → "Import from Files"
    │   │       │
    │   │       ▼
    │   │   iOS document picker opens → user selects .epub file
    │   │       │
    │   │       ▼
    │   │   App parses EPUB metadata (title, author, cover)
    │   │       │
    │   │       ▼
    │   │   App uploads EPUB to R2 (presigned URL, same flow as web)
    │   │       │
    │   │       ▼
    │   │   Book appears in library, ready to read
    │   │
    │   └── If this book was already synced from Kindle (by filename match),
    │       the EPUB is linked automatically — no manual linking needed.
    │
    └── Option C: Import from URL
        │
        │   User taps "+" → "Import from URL" → pastes link
        │       │
        │       ▼
        │   App downloads EPUB → parses metadata → uploads to R2
        │       │
        │       ▼
        │   Book appears in library
```

### Flow 2: Syncing with Kindle

```
Scenario: User reads a book on Kindle, then continues on the app
═══════════════════════════════════════════════════════════════

1. User reads "Dune" on Kindle to page 50
       │
       ▼
2. KOReader plugin auto-syncs:
   POST /api/progress {
     bookId: "dune.epub",
     progress: 0.15,
     excerpt: "He shall know your ways as if born to them...",  (500 chars)
     source: "kindle"
   }
   Plugin also uploads the EPUB file if backend doesn't have it yet.
       │
       ▼
3. User opens the app
       │
       ▼
4. App loads local position (none — first time opening this book)
   App fetches remote → finds Kindle position at 15%, 500-char excerpt
       │
       ▼
5. App searches the local EPUB for the excerpt text
   Found at a specific position → navigates there
       │
       ▼
6. User sees: "Dune" open at exactly where they left off on Kindle
   No prompts needed (first open, no conflict)
       │
       ▼
7. User reads to page 80, closes app
   Progress synced: { source: "mobile", progress: 0.25, excerpt: "..." }


Scenario: User goes back to Kindle after reading on the app
════════════════════════════════════════════════════════════

8. User opens "Dune" on Kindle
       │
       ▼
9. KOReader plugin auto-fetches latest progress (plugin update)
   Sees mobile position at 25% (newer than Kindle's 15%)
       │
       ▼
10. Plugin searches Kindle's copy for the mobile excerpt
    Found → prompts: "Continue from mobile app? (25%)"
       │
       ▼
11. User accepts → Kindle jumps to page 80
    User declines → stays at Kindle's page 50


Scenario: User reads on both devices, then opens the app
════════════════════════════════════════════════════════

12. Kindle at page 80 (25%), synced at 3pm
    App at page 120 (38%), last read at 1pm (offline, unsynced)
       │
       ▼
13. App comes online, pushes page 120 with timestamp 1pm
    Server rejects (409) — Kindle's 3pm is newer
    Push marked as "deferred"
       │
       ▼
14. App fetches remote → Kindle at 25% (3pm), Mobile at 25% (old server record)
    Local SQLite has page 120 (38%)
    Kindle remote is newer by timestamp but local is further ahead
       │
       ▼
15. App shows picker:
    ┌─────────────────────────────────────┐
    │  Continue reading Dune              │
    │                                     │
    │  📱 Mobile: Page 120 (38%)         │
    │  "The spice must flow. He who..."   │
    │                                     │
    │  📖 Kindle: Page 80 (25%)          │
    │  "He shall know your ways as if..." │
    │                                     │
    │  [Use Mobile]    [Use Kindle]       │
    └─────────────────────────────────────┘
       │
       ▼
16. User picks one → app navigates there
    Next page turn generates a fresh timestamp → syncs successfully
```

---

## Screens & UX

### 0. Login / Sign Up

Shown on first launch and when not authenticated. Clean, minimal, Apple-native feel.

**Layout:**
- App icon/logo centered at the top
- App name "ReadingSync" below the logo
- Tagline: "Pick up where you left off" in secondary text
- **"Continue with Google"** button — large, rounded, full-width, with Google "G" icon. Uses the native Google Sign-In flow via `expo-auth-session` (opens system browser or Google's native sign-in sheet on iOS).
- Small "By continuing, you agree to..." text at the bottom (privacy, terms)

**Auth flow:**
1. User taps "Continue with Google"
2. System browser opens Google OAuth consent screen
3. User authenticates with Google
4. Redirect back to app with auth code
5. App exchanges code for session token via better-auth's `/api/auth/callback/google`
6. Session token stored securely in `expo-secure-store` (Keychain on iOS, Keystore on Android)
7. App navigates to Library

**Session management:**
- Session token sent as `Authorization: Bearer <token>` header on all API requests
- Token refresh handled automatically by better-auth
- If token expires or is invalid, app redirects to login screen
- "Sign out" option in Settings screen

**KOReader plugin auth:**
- The KOReader plugin needs a way to authenticate too. Since it can't do OAuth flows, it uses an **API key** generated from the app's Settings screen.
- Settings → "Kindle API Key" → "Generate Key" → shows a key the user copies to the KOReader plugin config
- The plugin sends this key as `x-api-key` header on all requests
- better-auth validates it as a bearer token tied to the user's account

**Why Google OAuth:**
- Single tap sign-in on iOS (native Google sign-in sheet)
- No password to manage
- Replaces the old Discord OAuth (which required a Discord account — not everyone has one)
- better-auth supports it out of the box

---

### 1. Library (Home)

Replicates Apple Books' "Library" tab exactly.

> Reference: `docs/images/IMG_3348.PNG`

**Layout:**
- Large bold "Library" title, left-aligned (iOS large title navigation style)
- Two icons top-right: list/sort toggle (three horizontal lines icon) and more options (three dots in circle)
- 2-column grid of book covers (default view)
- Bottom tab bar with 3 tabs: Reading Now, Library (selected, filled), Search — each with icon + label. Uses iOS 26 Liquid Glass tab bar (translucent, adapts to content behind it).
- Pull-to-refresh syncs library from backend

**Sorting:**
- Recent (default — last read)
- Title (A-Z)
- Author (A-Z)

**Book cover cards:**
- Covers rendered with realistic 3D perspective — slight tilt with depth shadow giving a physical book appearance, not flat cards
- Rounded corners (~4px radius)
- Below each cover: reading progress percentage (e.g., "1%", "3%", "99%") left-aligned in small gray text
- Small action icons next to percentage: speech/note icon, more options (three dots)
- Unread/new books show a green "NEW" pill badge on the bottom-right corner of the cover
- Long-press on a book shows context menu (Delete, Mark as Finished, Book Details)
- Empty state: centered illustration + "No books yet" + import button

**Cover generation:**
- Extract cover image from EPUB metadata
- Fallback: generate a styled placeholder with title + author text on a colored background

**Bottom tab bar:**
- Reading Now: book icon — shows current book cover, progress, and "Continue Reading" button. Also shows recently finished books and Kindle-synced books awaiting EPUB linking.
- Library: books icon (selected state) — the main grid view
- Search: magnifying glass icon — search across library

---

### 2. Book Detail (optional, stretch)

Shows when tapping "Book Details" in context menu:
- Large cover image
- Title, author, description from EPUB metadata
- Reading stats (progress %, time spent, pages read)
- "Read" / "Continue Reading" button

---

### 3. Reader

The core screen. Must match Apple Books page-by-page reading exactly.

> Reference: `docs/images/IMG_3349.PNG` (clean reading), `docs/images/IMG_3350.PNG` (controls visible)

**Page rendering:**
- EPUB content parsed into styled native `<Text>` and `<Image>` components
- Content paginated to fit screen dimensions minus margins
- Binary search algorithm to find optimal page break points
- Justified text alignment by default
- Generous horizontal margins (~24px each side)
- Two rendering modes:
  - **Scroll mode**: continuous vertical scroll (like Kindle app)
  - **Page mode** (default): discrete pages with page turn animation

**Clean reading state** (no controls):
- **Top**: book title centered in small text, with X (close) button on the right to return to library
- **Bottom-left**: page indicator in small gray text — "15 of 561" format (current page of total)
- **Bottom-right**: table of contents icon (three horizontal lines)
- Status bar visible at top with time, signal, battery
- Everything else is clean — just the text content

**Page turn animations:**
- **Slide** (default): horizontal translation with slight shadow, matching Apple Books' default
- **Curl**: simulated page curl effect using Reanimated transforms and gradients
- **None**: instant transition

**Navigation:**
- Tap right 40% of screen → next page
- Tap left 40% of screen → previous page
- Tap center 20% → toggle controls overlay
- Horizontal swipe → page turn with gesture-following animation (finger-tracked, interruptible)
- Vertical swipe in scroll mode → scroll

**Controls overlay** (appears on center tap):
- **Top**: "N pages left in chapter" in small gray text below the status bar
- **Bottom toolbar**: Liquid Glass floating bar — translucent, refracts and tints the page content behind it. Contains:
  - "Contents · 2%" with list icon — shows chapter name and overall progress percentage
  - "Search Book" with magnifying glass icon
  - "Themes & Settings" with Aa icon
- **Bottom action row**: Liquid Glass icon buttons below the toolbar:
  - Share icon (square with arrow)
  - Screen/page icon
  - Circle icon (possibly orientation lock)
  - Bookmark icon
- Text continues visible behind the overlay — the glass material lets content show through with depth
- Smooth fade in/out with Reanimated

**Status bar:**
- Always visible (Apple Books keeps it shown)
- Light/dark based on current theme

**Progress tracking:**
- On each page turn, calculate CFI position and progress percentage
- Debounce save to local SQLite (1 second)
- Background sync to ReadingSync API (debounced 3 seconds)
- Capture ~500 char excerpt for cross-device sync (see Sync Engine)

---

### 4. Themes & Settings Panel

Slides up from bottom as a Liquid Glass half-sheet modal. Title: "Themes & Settings" with X close button. The sheet uses the translucent glass material, letting the page content show through with a frosted depth effect.

> Reference: `docs/images/IMG_3351.PNG`

**Top controls row:**
- Small "A" button (decrease font size) — left side
- Large "A" button (increase font size) — next to small A
- Speech/narration icon (text-to-speech toggle)
- Dark/light mode toggle icon (circle, half-filled)

**Brightness:**
- Horizontal slider with sun icon on the left (dim) and sun icon on the right (bright)
- Links to device brightness

**Themes grid:**
- 3x2 grid of theme cards (not circles — rectangular rounded cards)
- Each card shows "Aa" text rendered in the theme's colors, with theme name below
- 6 themes total:
  - **Original** — white background, black text (the default clean look)
  - **Quiet** — very light warm gray background, dark text
  - **Paper** — cream/beige background, dark brown text (classic sepia)
  - **Bold** — dark/black background, white text
  - **Calm** — warm tan/gold background, dark text
  - **Focus** — dark gray background, light text
- Selected theme has a visible border/highlight
- These match the Apple Books theme set and the existing render settings schema

**Bottom:**
- "Customize" button with gear icon — opens extended settings for font family, line spacing, margins, alignment

**Extended settings (via Customize):**
- Font family picker: scrollable list
  - Default: San Francisco (system)
  - Options: Georgia, Palatino, New York, Athelas, Charter, Iowan Old Style
- Line spacing: compact / normal / loose (3-option segmented control)
- Margins: narrow / normal / wide (3-option segmented control)
- Alignment: left / justified toggle

**Persistence:**
- All settings saved to local SQLite immediately
- Synced to backend as `renderSettings` JSON for cross-device consistency

---

### 5. Table of Contents

Full-screen modal with native list.

- Chapter list with indent levels for sub-chapters
- Current chapter highlighted
- Tap to jump, modal dismisses
- Three tabs at top (like Apple Books): Contents | Bookmarks | Notes

---

### 6. Settings

Accessible from a gear icon on the Library screen (inside the "..." menu).

**Account:**
- Signed in as: Google account email + avatar
- **Kindle API Key** — "Generate Key" button. Shows a copyable API key for the KOReader plugin. User pastes this into the plugin's config on Kindle. Can regenerate (invalidates old key).
- **Sign out** — clears session, returns to login screen. Downloaded books stay on device.

**Sync:**
- **Sync behavior** — per-source toggle: Kindle sync prompts (always prompt / auto-apply / ignore)
- **Staleness threshold** — slider or picker: how many days before remote positions are ignored (default: 7)

**Storage:**
- Total space used by downloaded EPUBs
- Button to clear cache (removes downloaded EPUBs, re-downloads on next open)

**About:**
- Version, backend status (connected/disconnected)

---

### 7. Search

- Search bar at top
- Results show matching text with surrounding context
- Tap result → jump to location in book
- Debounced search (300ms) as user types

---

## EPUB Parsing Engine

This is the most critical technical component. The goal is native rendering, with WebView as a pragmatic fallback (see Open Questions).

### Parsing Pipeline

```
.epub (zip)
    │
    ├── META-INF/container.xml → find rootfile path
    │
    ├── content.opf → parse manifest + spine (reading order)
    │
    ├── toc.ncx / nav.xhtml → table of contents
    │
    └── chapters/*.xhtml → parse each chapter
            │
            ├── HTML → custom AST (lightweight DOM)
            │
            ├── CSS → style resolution (cascade + specificity)
            │
            └── AST → React Native components
                    │
                    └── Pagination engine → page breaks
```

### Supported EPUB Features

| Feature | Support |
|---|---|
| EPUB 2 & 3 | Yes |
| XHTML content | Full |
| Inline CSS | Full |
| External CSS | Full |
| Embedded fonts | Yes (load via expo-font) |
| Images (PNG, JPG, SVG) | Yes |
| Headings, paragraphs, lists | Yes |
| Tables | Basic (rendered as styled blocks) |
| Footnotes / endnotes | Tap to show popover |
| Ruby text (CJK) | Stretch goal |
| MathML | No (fallback to image if available) |
| Audio / Video | No |

### Pagination Algorithm

1. Parse chapter XHTML into component tree
2. Measure each text block using `onTextLayout` to get exact line heights
3. Accumulate heights until page is full (screen height - margins - header/footer)
4. Split text at word boundaries when a paragraph spans a page break
5. Cache page break indices per chapter for instant navigation
6. Invalidate cache when font size / margins / screen dimensions change

---

## Sync Engine

Inspired by KOReader's KOSync plugin — the simplest architecture that actually works for cross-device reading sync.

### Lessons from KOSync

KOSync's design is worth understanding because it powers reliable cross-device sync for thousands of KOReader users with a ~100 line server:

1. **Server is a dumb key-value store** — stores one progress record per user+document. No history, no merge logic. Last write wins.
2. **Document identity via content hash** — MD5 of the file's binary content. Same file on any device = same key.
3. **Position is a structural reference** — XPointer (DOM path like `/body/DocFragment[20]/body/p[22]/text().42`), not a page number or percentage. Independent of screen size, font, margins.
4. **All conflict resolution is client-side** — if remote is from the same device, skip. Otherwise, compare timestamps: most recently touched wins (not "furthest ahead" — users re-read and skip around).
5. **Percentage is metadata, not truth** — used only for display ("Sync to 31%?"), never for navigation.

### Where We Diverge from KOSync

KOSync's "fully dumb server" works because all its clients run the same renderer on the same file. We can't be that simple — we have two different renderers and potentially different file copies. Our server needs to be **slightly smarter**:

1. **Server rejects stale updates** — the backend compares `updated_at` in the incoming payload against what's stored. If the stored timestamp is newer, the update is rejected. This prevents offline sync queues from overwriting newer progress (e.g., you read on mobile at 2pm offline, Kindle syncs at 3pm, then mobile comes online at 4pm and flushes its 2pm state — without server-side timestamp checks, the stale mobile push would overwrite the Kindle's 3pm progress).

2. **Server stores position per device, not just per book** — KOSync stores one position per book. We store the latest position from **each source** (mobile, kindle) separately. This lets the client show: "You're at chapter 10 on mobile, chapter 2 on Kindle — which one?" instead of blindly picking whichever wrote last. The `sync_history` table already supports this with its `source` field.

3. **Staleness threshold** — positions older than 7 days from a different device are treated as informational, not actionable. The app won't prompt "Continue from Kindle?" for a 3-month-old Kindle session. It may show it passively in book details, but it won't interrupt the reading flow.

### Why Our Problem Is Harder (and How We Solve It)

KOSync works because all devices run the same renderer (CREngine) reading the same file. XPointers resolve identically everywhere. We break that assumption: Kindle uses CREngine with XPointers, the mobile app uses its own EPUB renderer with CFI.

**The solution is excerpt-based text matching** — simple, robust, and renderer-agnostic.

| Sync path | Complexity | Strategy |
|---|---|---|
| Mobile alone (no Kindle) | Trivial | Same file from R2, EPUB CFI positions are exact |
| Kindle ↔ Mobile | Moderate | Excerpt-based text matching (no position format translation needed) |

### Kindle ↔ Mobile Position Sync

Instead of trying to translate between XPointer and CFI (fragile, complex, breaks when EPUB copies differ), we skip position formats entirely and sync via **text content**.

**How it works:**
- Every sync payload includes ~500 chars of text at the current reading position
- When the app receives a Kindle sync, it searches the EPUB for that text snippet
- If found → jump to that location. Done.
- If multiple matches are found (rare with 500 chars, but possible), use the progress percentage as a tiebreaker — pick the match closest to the expected position
- Self-verifying: if the text matches, you *know* you're at the right place. No DOM alignment assumptions.

**Why not structural mapping (XPointer ↔ CFI)?**
- Requires identical DOM structure between EPUB copies — breaks with different editions, re-packaged files, or minor XHTML differences
- Complex translation code (parse XPointer paths, map DocFragment indices to spine items, rewrite as CFI)
- Not self-verifying — you translate the path and hope it lands right
- Excerpt matching handles every case structural mapping handles, plus cases it doesn't

**Fallback — percentage approximation:**
- If the excerpt text isn't found at all (completely different edition), use the progress float (0.0–1.0) to jump to approximately the right location
- Imprecise but better than nothing — a 31% position on Kindle will be close to 31% in the app
- The app shows a notice: "Approximate position — text not found in this edition"

### Document Identity

- **Primary**: filename-based matching. When the KOReader plugin syncs `dune.epub` and the app imports a file also named `dune.epub`, they match automatically.
- **Manual book linking**: the existing `progress.linkBooks` mutation merges two book entries (e.g., a Kindle-synced entry with a different filename and an uploaded EPUB) into one. This is the escape hatch when filenames differ.
- With the KOReader auto-upload feature, most books will only have one entry (plugin uploads the file itself), making manual linking rare.

### Offline-First Strategy

1. All writes go to local SQLite first — reading never blocks on network
2. Background sync queue picks up pending changes with **the original page-turn timestamp** (not the time the sync job runs)
3. On connectivity, flush queue to ReadingSync API — server rejects if its stored timestamp is newer, preventing stale overwrites
4. On book open, fetch latest position from **each source** (mobile + kindle) via sync history
5. Conflict resolution is **client-side, timestamp-based**:
   - If remote update is from the same device, skip
   - If remote is newer (by timestamp) AND less than 7 days old, prompt user: "Continue from [excerpt]? (synced from Kindle)"
   - If remote is newer but older than 7 days, show passively in book details but don't interrupt
   - If remote is older, ignore (local wins)
   - If both sources have recent positions that diverge significantly (>5% apart), show a picker: "Mobile: Chapter 10 (45%) / Kindle: Chapter 2 (8%) — which one?"
   - User can configure: always prompt, auto-apply, or ignore per-source

### Sync Flow

```
[Page Turn at time T]
    │
    ├── Write to local SQLite (immediate, timestamp = T)
    │
    ├── Debounce 3s → enqueue sync job (carries original timestamp T)
    │
    └── Sync worker (when online) — PUSH ONLY, never prompt during reading
            │
            └── POST /api/progress
                {
                  bookId, position (CFI), progress (%),
                  excerpt (500 chars), source: "mobile",
                  device_id (unique per install),
                  updated_at: T  ← original page-turn time, NOT now
                }
                Server compares T against stored timestamp.
                If stored is newer → rejects with 409 (stale).
                If T is newer → stores it.

    The user is actively reading — NEVER interrupt with a sync prompt.
    All conflict resolution happens on Book Open, not during reading.
```

```
[Book Open]
    │
    ├── Load local position from SQLite → show it IMMEDIATELY
    │   (user sees their last mobile position, can start reading right away)
    │
    ├── Fetch remote positions (all sources) in background
    │   (non-blocking — if offline, skip silently)
    │
    ├── When fetch completes, compare local vs remote(s):
    │     - All sources agree or local is newest? → do nothing
    │     - Remote older than 7 days? → ignore
    │     - Offline? → skip, use local, sync later
    │     - Remote is newer + same source (mobile)? → apply CFI directly
    │     - Remote is newer + different source (kindle)?
    │         → Search EPUB for remote excerpt text
    │             ├── Found once → use that position
    │             ├── Found multiple → pick closest to remote progress %
    │             └── Not found → use remote progress % (approximate),
    │                 show notice: "Approximate position"
    │     - Then:
    │         - Remote close to local (< 5%)? → auto-apply silently
    │         - Remote far from local (> 5%)? → show prompt/picker:
    │             "Continue from Kindle? (Chapter 5, 31%)"
    │             with excerpt preview so user can verify
    │         - Both sources have recent positions far apart?
    │             → show picker with both: "Mobile: Ch.10 / Kindle: Ch.5"
    │
    └── If user already turned a page before fetch completes → their new page wins,
        suppress any prompt (they've moved on, don't interrupt)
```

### Handling Rejected Pushes

When the server returns 409 (stale), the app's local position is newer in content but older in timestamp. This creates a stuck state — the position never reaches the server until the user turns another page (generating a fresh timestamp).

**Solution**: on 409 rejection, the app marks the sync job as "deferred" instead of retrying. The position stays in local SQLite. On the next page turn, the new timestamp will succeed. If the user opens the app and closes without reading:
- First open: they see the prompt ("Continue from Kindle?"), they decline, they stay at their local position
- The local position remains unsynced but that's fine — they haven't moved, so there's nothing new to sync
- Next page turn resolves it

The key rule: **never re-stamp a position with a fake timestamp.** The timestamp must always reflect when the user actually read that page. Lying about timestamps breaks the whole conflict resolution model.

### KOReader Plugin Update Required

The existing KOReader plugin pushes progress on page change but only fetches on manual trigger ("Sync from web reader" menu item). Three updates are needed:

1. **Auto-fetch on book open** — when the user opens a book on Kindle, fetch the latest position from the backend. If a newer mobile position exists, prompt: "Continue from mobile app? (25%)" with excerpt preview. Uses the existing excerpt-matching logic from "Sync from web reader."

2. **Auto-upload EPUB on first sync** — when the plugin syncs progress for a book and the backend responds that no EPUB file exists for this bookId:
   - Request a presigned upload URL from `POST /api/upload { fileName }`
   - Read the EPUB from Kindle filesystem using `io.open(filepath, "rb")`
   - Stream it directly to R2 via HTTP PUT to the presigned URL, using `ltn12.source.file()` for memory-efficient streaming (no need to load the whole file into memory)
   - Confirm upload via `PUT /api/upload { key, safeName }`
   - This happens once per book, in the background, after the first progress sync
   - Show a subtle notification: "Uploading book to cloud..." (upload may take 30-60s over Kindle WiFi for large EPUBs)
   - If upload fails (no WiFi, timeout), retry on next progress sync — non-blocking

3. **Include `has_epub` in progress response** — the backend's `POST /api/progress` response should include whether an EPUB file exists for this bookId, so the plugin knows whether to trigger an upload.

Without these updates, the user has to manually import EPUBs into the app and manually trigger sync on Kindle — workable but defeats the seamless experience.

### Background Sync

- Use `expo-background-fetch` for periodic sync (minimum 15 min interval on iOS)
- Use `expo-task-manager` for background task registration
- On app resume (foreground): immediate sync check
- Sync check on book open: non-blocking background fetch (see Book Open flow above)

### Authentication on Sync Requests

All API requests are authenticated:
- **Mobile app**: `Authorization: Bearer <session-token>` (obtained via Google OAuth, stored in expo-secure-store)
- **KOReader plugin**: `x-api-key: <api-key>` (generated from app Settings, stored in plugin config on Kindle)
- better-auth validates both formats and resolves to the same user account
- All progress data is now **per-user** — multiple users can share the same backend without seeing each other's books

### Data Format

Outgoing payload matches existing API contract:

```json
{
  "bookId": "my-book.epub",
  "bookTitle": "Book Title",
  "position": "epubcfi(/6/4[chap02]!/4/2/1:0)",
  "currentPage": 42,
  "totalPages": 350,
  "progress": 0.12,
  "excerpt": "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him. The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall.",
  "source": "mobile",
  "device_id": "A1B2C3D4",
  "renderSettings": {
    "fontSize": 18,
    "fontFamily": "Georgia",
    "lineHeight": 1.6,
    "theme": "sepia"
  }
}
```

### Backend Simplification

With the web app retired, the backend can be simplified:

- **Keep**: REST API routes (`/api/progress`, `/api/upload`) — used by both mobile app and KOReader plugin
- **Keep**: R2/S3 storage for EPUB files — mobile app downloads from here
- **Keep**: PostgreSQL + Drizzle for progress storage and sync history
- **Remove**: tRPC layer (was only used by the React web frontend)
- **Remove**: epub.js web reader, Next.js pages, React components
- **Replace**: NextAuth/Discord OAuth → better-auth with Google OAuth + API key auth for KOReader plugin
- **Change**: `POST /api/progress` now compares incoming `updated_at` against stored value and returns 409 if stale. Response includes `has_epub: boolean` so KOReader plugin knows whether to upload the file.
- **Change**: `GET /api/progress/:bookId` supports `?sources=all` to return latest position from each source (mobile, kindle) separately
- **Change**: excerpt field increased from 150 to 500 chars in schema
- **Add**: `device_id` field to progress records to enable same-device detection

---

## Book Management

### Import Methods

1. **From ReadingSync backend** — fetch books that already have `epubUrl` (uploaded to R2), download the EPUB to device
2. **From Files app** — iOS share sheet / document picker to import local `.epub` files, then upload to R2 for backup
3. **From URL** — paste a direct link to an EPUB file
4. **Auto-discovery from Kindle** — when KOReader syncs a new book, it appears in the app's library. User can then link an EPUB file to it.

### Kindle-Only Books (No EPUB Linked)

With the KOReader plugin auto-upload feature, this state should be rare — the plugin uploads the EPUB on first sync. But it can happen if the upload failed (no WiFi, timeout, Kindle turned off mid-upload).

When a book has progress data but no EPUB file, it appears in the library with a distinct visual state:
- Cover shows a placeholder with the book title (no cover image available without the EPUB)
- A subtle badge or overlay indicates "Kindle only — waiting for upload"
- Reading progress is shown (e.g., "31%") so the user knows their Kindle progress is tracked
- Tapping the book shows a prompt: "EPUB not yet uploaded from Kindle. You can:" with options:
  - Wait (the plugin will retry on next Kindle sync)
  - Import manually from Files app
  - Import from URL
- Once the EPUB arrives (from Kindle auto-upload or manual import), the book becomes fully readable and the cover image is extracted

### Local Storage

- EPUBs stored in app's Documents directory (`/Documents/books/{bookId}/`)
- Each book unzipped on import for fast chapter access
- Cover images cached separately for library grid performance
- SQLite tracks: bookId, title, author, coverPath, epubPath, fileSize, importDate

### Deletion

- Swipe-to-delete or long-press context menu
- Confirm dialog: "Remove from device" vs "Delete everywhere" (also removes from backend)

---

## Theming & Visual Design

### Design Language

Follow Apple's Human Interface Guidelines for iOS 26. The app should feel like it ships with the OS — fully adopting the **Liquid Glass** design language.

**Liquid Glass usage:**
- Tab bar: translucent glass, adapts to content scrolled behind it
- Reader controls overlay: floating glass toolbar and action buttons
- Settings/Themes sheet: glass half-sheet modal
- Navigation bars: glass material with large title collapsing behavior
- Context menus: native UIContextMenuInteraction (automatically gets glass treatment on iOS 26)
- Alerts and prompts (sync picker, delete confirmation): native system alerts

**Typography:**
- SF Pro Display for UI chrome (headers, buttons, labels)
- SF Pro Text for body UI text
- Reading fonts are user-selectable (see Reader Settings)

**Colors:**
- Use semantic system colors (`UIColor.label`, `UIColor.secondaryLabel`, `UIColor.systemBackground`, `UIColor.tintColor`) rather than hardcoded hex values
- This ensures correct appearance across light mode, dark mode, and the new Liquid Glass tinting
- Accent color: system blue (default) — follows user's system tint preference on iOS 26

**System integration:**
- Respect system dark mode preference
- Support Dynamic Type (accessibility text sizes)
- Haptic feedback on page turns (light impact)
- Native context menus (UIContextMenuInteraction)
- iOS 26 Liquid Glass across all chrome elements

---

## Performance Targets

| Metric | Target |
|---|---|
| App cold start → library visible | < 800ms |
| Open book → first page rendered | < 500ms |
| Page turn animation | 60fps, < 16ms frame budget |
| Chapter change (load next chapter) | < 200ms |
| Search results (full book) | < 2s |
| Memory usage while reading | < 150MB |
| EPUB import (50MB file) | < 3s |

---

## Milestones

### M1 — Foundation (Week 1-2)
- Project scaffolding (Expo + TypeScript)
- Navigation structure (Login → Library → Reader)
- better-auth setup: Google OAuth on backend, login screen in app
- API key generation endpoint for KOReader plugin
- EPUB parser: unzip, parse OPF, extract spine order
- Basic XHTML → React Native component mapping
- Local SQLite database schema
- Backend: add `device_id` field, replace NextAuth with better-auth

### M2 — Reading Experience (Week 3-4)
- Pagination engine with accurate text measurement
- Page turn gestures + slide animation
- Reader settings panel (font, size, theme)
- Controls overlay (top/bottom bars)
- Progress tracking (local)

### M3 — Library & Sync (Week 5-6)
- Library grid with cover extraction
- Book import (from backend R2 + document picker + Kindle auto-discovery)
- Sync engine: push/pull with ReadingSync API
- Excerpt-based text matching for Kindle sync
- Client-side conflict resolution with position picker
- Offline queue with background sync + deferred push handling (409s)
- KOReader plugin update: auto-fetch on book open + auto-upload EPUB to R2

### M4 — Polish & Ship (Week 7-8)
- Table of contents navigation
- Search within book
- Page scrubber (bottom slider)
- Offline storage management
- Liquid Glass custom Swift module for reader toolbar + settings sheet
- Backend cleanup: remove tRPC, web reader
- App Store build + TestFlight

### Stretch Goals
- Page curl animation
- Highlights & annotations (with sync)
- Reading stats / streaks
- Bookmarks
- Collections / shelves
- iPad split-view support
- Widget showing current book + progress
- Live Activity for reading sessions

---

## Open Questions

1. **Native EPUB rendering feasibility** — building a full EPUB renderer without WebView is ambitious. Fallback plan: use epub.js in a WebView with native chrome around it (this is what most production reading apps do, including Libby, Kobo, and Google Play Books). Either approach produces CFI positions for sync. Decision should be made during M1 prototyping.

2. **Pagination accuracy** — if going fully native, React Native `onTextLayout` may not give pixel-perfect measurements for all font/size combinations. May need a native module (Objective-C/Swift) for precise text measurement using Core Text.

3. ~~**Authentication**~~ — **Resolved.** Using better-auth with Google OAuth for the mobile app and API keys for the KOReader plugin. All API endpoints are now authenticated. Per-user data isolation comes for free.

4. **Backend migration** — removing tRPC, web reader from the backend. Replacing NextAuth with better-auth. The REST API routes (`/api/progress`, `/api/upload`) stay as-is since the KOReader plugin already uses them directly. Need to decide whether to keep Next.js as the backend or migrate to something lighter (Express, Hono, or just serverless functions).

5. **EPUB DRM** — no DRM support planned. Only DRM-free EPUBs.

6. **Excerpt matching edge cases** — 500 chars should be unique in most books, but needs monitoring for: books with highly repetitive text, poetry with short repeated stanzas, or technical books with repeated code snippets. The percentage tiebreaker handles most ambiguity, but completely different editions where the text was re-translated or heavily edited will fall through to percentage-only (approximate).

7. ~~**Staleness threshold tuning**~~ — **Resolved.** Defaults to 7 days, user-configurable in Settings.
