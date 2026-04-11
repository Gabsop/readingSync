/**
 * Background sync task using expo-background-fetch + expo-task-manager.
 *
 * Periodically flushes the sync queue when the app is backgrounded.
 * iOS minimum interval is ~15 minutes; the OS decides exact timing.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../db/schema";

const BACKGROUND_SYNC_TASK = "READINGSYNC_BACKGROUND_SYNC";

/**
 * Define the background task. Must be called at module scope (top level)
 * before any component renders — TaskManager requires early registration.
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);

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
    }>(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10`,
    );

    if (pending.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const { authFetch } = await import("./api");

    let synced = 0;
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
          await db.runAsync(
            `UPDATE sync_queue SET status = 'deferred' WHERE id = ?`,
            [item.id],
          );
        } else if (res.ok) {
          await db.runAsync(
            `UPDATE sync_queue SET status = 'synced' WHERE id = ?`,
            [item.id],
          );
          synced++;
        }
      } catch {
        // Network unavailable — leave as pending for next background fetch
      }
    }

    await db.closeAsync();

    return synced > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/** Register the background fetch task. Call once during app initialization. */
export async function registerBackgroundSync() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_SYNC_TASK,
  );
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

/** Unregister the background fetch task. */
export async function unregisterBackgroundSync() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_SYNC_TASK,
  );
  if (!isRegistered) return;

  await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}
