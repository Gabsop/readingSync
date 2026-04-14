/**
 * Sync engine for pushing/pulling reading progress with the ReadingSync backend.
 *
 * Push flow: page turn → save to SQLite → enqueue to sync_queue → flush to API
 * Pull flow: book open → fetch remote progress → compare with local → resolve
 *
 * Offline-first: all writes go to local SQLite first. The sync queue flushes
 * when connectivity is available. Deferred items (409 from server) wait for a
 * fresh page turn to generate a new timestamp.
 */

import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SQLiteDatabase } from "expo-sqlite";
import { authFetch } from "./api";

// --- Device ID ---

const DEVICE_ID_KEY = "device-id";
let cachedDeviceId: string | null = null;

/** Get or create a stable device identifier for this install. */
export async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  const bytes = await import("expo-crypto").then((m) => m.getRandomBytes(16));
  const id = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  cachedDeviceId = id;
  return id;
}

// --- Sync Queue (Push) ---

const SYNC_DEBOUNCE_MS = 3000;
const MAX_RETRY_COUNT = 5;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

interface SyncPayload {
  bookId: string;
  bookTitle?: string;
  position: string;
  currentPage: number;
  totalPages: number;
  progress: number;
  excerpt?: string;
}

/** Enqueue a progress update into sync_queue and schedule a flush. */
export async function enqueueSync(db: SQLiteDatabase, payload: SyncPayload) {
  const deviceId = await getDeviceId();
  const timestamp = new Date().toISOString();

  // Coalesce: remove any pending/deferred entries for this book (only latest matters)
  await db.runAsync(
    `DELETE FROM sync_queue WHERE book_id = ? AND status IN ('pending', 'deferred')`,
    [payload.bookId],
  );

  await db.runAsync(
    `INSERT INTO sync_queue (book_id, position, current_page, total_pages, progress, excerpt, source, device_id, timestamp, status)
     VALUES (?, ?, ?, ?, ?, ?, 'mobile', ?, ?, 'pending')`,
    [
      payload.bookId,
      payload.position,
      payload.currentPage,
      payload.totalPages,
      payload.progress,
      payload.excerpt ?? null,
      deviceId,
      timestamp,
    ],
  );

  scheduleFlush(db);
}

/** Schedule a debounced flush of the sync queue. */
function scheduleFlush(db: SQLiteDatabase) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushSyncQueue(db);
  }, SYNC_DEBOUNCE_MS);
}

/** Immediately flush all pending items in the sync queue to the backend. */
export async function flushSyncQueue(db: SQLiteDatabase) {
  if (isFlushing) return;
  isFlushing = true;

  try {
    const pending = await db.getAllAsync<{
      id: number;
      book_id: string;
      position: string;
      current_page: number;
      total_pages: number;
      progress: number;
      excerpt: string | null;
      source: string;
      device_id: string | null;
      timestamp: string;
      retry_count: number;
    }>(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`,
    );

    for (const item of pending) {
      try {
        const updatedAtUnix = Math.floor(
          new Date(item.timestamp).getTime() / 1000,
        );

        const res = await authFetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book_id: item.book_id,
            position: item.position,
            current_page: item.current_page,
            total_pages: item.total_pages,
            progress: item.progress,
            excerpt: item.excerpt,
            source: item.source,
            device_id: item.device_id,
            updated_at: updatedAtUnix,
          }),
        });

        if (res.status === 409) {
          // Server has a newer timestamp — mark as deferred.
          // The next page turn generates a fresh timestamp that will succeed.
          await db.runAsync(
            `UPDATE sync_queue SET status = 'deferred' WHERE id = ?`,
            [item.id],
          );
          continue;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        await db.runAsync(
          `UPDATE sync_queue SET status = 'synced' WHERE id = ?`,
          [item.id],
        );
      } catch {
        const newRetryCount = item.retry_count + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          await db.runAsync(
            `UPDATE sync_queue SET status = 'failed', retry_count = ? WHERE id = ?`,
            [newRetryCount, item.id],
          );
        } else {
          await db.runAsync(
            `UPDATE sync_queue SET retry_count = ? WHERE id = ?`,
            [newRetryCount, item.id],
          );
        }
      }
    }

    // Clean up old synced/failed/deferred entries (keep last 24h for debugging)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE status IN ('synced', 'failed', 'deferred') AND created_at < datetime('now', '-1 day')`,
    );
  } finally {
    isFlushing = false;
  }
}

// --- Remote Progress (Pull) ---

interface RemoteProgress {
  bookId: string;
  bookTitle?: string;
  position: string;
  currentPage?: number;
  totalPages?: number;
  progress: number;
  excerpt?: string;
  source?: string;
  deviceId?: string;
  updatedAt: number; // Unix seconds
}

/**
 * Fetch the latest remote progress for a book.
 * Returns null if not found or network unavailable.
 */
export async function fetchRemoteProgress(
  bookId: string,
): Promise<RemoteProgress | null> {
  try {
    const res = await authFetch(`/api/progress/${encodeURIComponent(bookId)}`);

    if (!res.ok) return null;

    const json = (await res.json()) as {
      book_id: string;
      book_title?: string;
      position: string;
      current_page?: number;
      total_pages?: number;
      progress: number;
      excerpt?: string;
      source?: string;
      device_id?: string;
      updated_at: number;
    };

    if (!json.book_id) return null;

    return {
      bookId: json.book_id,
      bookTitle: json.book_title,
      position: json.position,
      currentPage: json.current_page,
      totalPages: json.total_pages,
      progress: json.progress,
      excerpt: json.excerpt,
      source: json.source,
      deviceId: json.device_id,
      updatedAt: json.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * On book open: compare local and remote progress.
 * Returns the position the reader should navigate to, or null if local is fine.
 */
export async function resolveProgressOnOpen(
  db: SQLiteDatabase,
  bookId: string,
): Promise<{
  action: "use_local" | "use_remote" | "prompt";
  remote?: RemoteProgress;
  localProgress?: number;
  remoteProgress?: number;
} | null> {
  const deviceId = await getDeviceId();

  const local = await db.getFirstAsync<{
    progress: number;
    updated_at: string;
    source: string;
    device_id: string | null;
  }>(
    `SELECT progress, updated_at, source, device_id FROM reading_positions WHERE book_id = ?`,
    [bookId],
  );

  const remote = await fetchRemoteProgress(bookId);
  if (!remote) {
    return { action: "use_local" };
  }

  if (!local) {
    return {
      action: "use_remote",
      remote,
      remoteProgress: remote.progress,
    };
  }

  const localUpdatedAt = Math.floor(new Date(local.updated_at).getTime() / 1000);

  if (remote.deviceId === deviceId && remote.source === "mobile") {
    return { action: "use_local" };
  }

  if (remote.updatedAt <= localUpdatedAt) {
    return { action: "use_local" };
  }

  const STALENESS_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  if (now - remote.updatedAt > STALENESS_THRESHOLD_SECONDS) {
    return { action: "use_local" };
  }

  const progressDiff = Math.abs(remote.progress - local.progress);

  if (progressDiff < 0.05) {
    return {
      action: "use_remote",
      remote,
      localProgress: local.progress,
      remoteProgress: remote.progress,
    };
  }

  return {
    action: "prompt",
    remote,
    localProgress: local.progress,
    remoteProgress: remote.progress,
  };
}

/** Cancel any pending flush timer (call on app background / unmount). */
export function cancelPendingFlush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

// --- App State Sync (foreground resume) ---

let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let registeredDb: SQLiteDatabase | null = null;

/**
 * Register an AppState listener that flushes the sync queue whenever the app
 * returns to the foreground. Call once from the root layout.
 */
export function registerAppStateSync(db: SQLiteDatabase) {
  if (appStateSubscription) return;
  registeredDb = db;

  appStateSubscription = AppState.addEventListener(
    "change",
    handleAppStateChange,
  );
}

/** Unregister the AppState listener. Call on app teardown. */
export function unregisterAppStateSync() {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  registeredDb = null;
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === "active" && registeredDb) {
    flushSyncQueue(registeredDb);
  }
}
