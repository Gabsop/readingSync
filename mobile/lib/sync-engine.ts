/**
 * Sync engine for pushing/pulling reading progress with the ReadingSync backend.
 *
 * Push flow: page turn → save to SQLite → enqueue to sync_queue → flush to API
 * Pull flow: book open → fetch remote progress → compare with local → resolve
 */

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

  // Generate a random ID: 16 random bytes as hex (32 chars)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
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

  // Coalesce: remove any pending entries for this book (only latest matters)
  await db.runAsync(
    `DELETE FROM sync_queue WHERE book_id = ? AND status = 'pending'`,
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

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as { status: string };

        if (json.status === "ok" || json.status === "skipped") {
          // "skipped" means server has a newer timestamp — our push is stale.
          // Either way, mark as synced (don't retry stale data).
          await db.runAsync(
            `UPDATE sync_queue SET status = 'synced' WHERE id = ?`,
            [item.id],
          );
        }
      } catch {
        // Network error or server error — increment retry count
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

    // Clean up old synced/failed entries (keep last 24h for debugging)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE status IN ('synced', 'failed') AND created_at < datetime('now', '-1 day')`,
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
    // Network unavailable — offline is fine, just skip
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

  // Load local progress
  const local = await db.getFirstAsync<{
    progress: number;
    updated_at: string;
    source: string;
    device_id: string | null;
  }>(
    `SELECT progress, updated_at, source, device_id FROM reading_positions WHERE book_id = ?`,
    [bookId],
  );

  // Fetch remote
  const remote = await fetchRemoteProgress(bookId);
  if (!remote) {
    // Offline or no remote record — use local
    return { action: "use_local" };
  }

  // No local position — use remote if available
  if (!local) {
    return {
      action: "use_remote",
      remote,
      remoteProgress: remote.progress,
    };
  }

  const localUpdatedAt = Math.floor(new Date(local.updated_at).getTime() / 1000);

  // Same device — remote is just our own echo, use local
  if (remote.deviceId === deviceId && remote.source === "mobile") {
    return { action: "use_local" };
  }

  // Remote is older — use local
  if (remote.updatedAt <= localUpdatedAt) {
    return { action: "use_local" };
  }

  // Remote is newer — check staleness (7 day threshold)
  const STALENESS_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  if (now - remote.updatedAt > STALENESS_THRESHOLD_SECONDS) {
    return { action: "use_local" };
  }

  // Remote is newer and fresh — check distance
  const progressDiff = Math.abs(remote.progress - local.progress);

  if (progressDiff < 0.05) {
    // Close enough — silently apply remote
    return {
      action: "use_remote",
      remote,
      localProgress: local.progress,
      remoteProgress: remote.progress,
    };
  }

  // Significant difference — prompt the user
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
