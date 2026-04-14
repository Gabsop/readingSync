/**
 * Storage manager — calculates disk usage of downloaded EPUBs and covers,
 * and provides a cache-clearing function.
 *
 * EPUBs: Documents/books/
 * Covers: Documents/covers/
 */

import {
  Paths,
  Directory,
  File as ExpoFile,
} from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

function getBooksDir() {
  return new Directory(Paths.document, "books");
}

function getCoversDir() {
  return new Directory(Paths.document, "covers");
}

function getDirectorySize(dir: Directory): number {
  if (!dir.exists) return 0;

  let total = 0;
  for (const item of dir.list()) {
    if (item instanceof ExpoFile) {
      total += item.size ?? 0;
    } else if (item instanceof Directory) {
      total += getDirectorySize(item);
    }
  }
  return total;
}

export interface StorageInfo {
  epubBytes: number;
  coverBytes: number;
  totalBytes: number;
  bookCount: number;
}

/** Calculate total disk usage for downloaded EPUBs and cached covers. */
export async function getStorageInfo(db: SQLiteDatabase): Promise<StorageInfo> {
  const epubBytes = getDirectorySize(getBooksDir());
  const coverBytes = getDirectorySize(getCoversDir());

  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM books",
  );
  const bookCount = row?.count ?? 0;

  return {
    epubBytes,
    coverBytes,
    totalBytes: epubBytes + coverBytes,
    bookCount,
  };
}

/**
 * Clear all downloaded EPUBs and cached covers from disk.
 * Updates the SQLite `books` table to clear `epub_path` and `cover_path`,
 * keeping book records intact (they can re-download from backend R2).
 */
export async function clearDownloadCache(db: SQLiteDatabase) {
  const booksDir = getBooksDir();
  if (booksDir.exists) {
    booksDir.delete();
    booksDir.create();
  }

  const coversDir = getCoversDir();
  if (coversDir.exists) {
    coversDir.delete();
    coversDir.create();
  }

  await db.runAsync(
    "UPDATE books SET epub_path = NULL, cover_path = NULL",
  );
  // Delete books imported from mobile (no cloud backup to re-download from)
  await db.runAsync(
    "DELETE FROM books WHERE source = 'mobile'",
  );
}

/** Format bytes into a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
