/**
 * Book import module — handles picking an EPUB from the device,
 * parsing its metadata, copying it to local storage, and saving
 * to the SQLite database. Optionally uploads to the backend R2.
 */

import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  Paths,
  File as ExpoFile,
  Directory,
} from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { parseEpub, extractCoverImage } from "./epub-parser";
import { authFetch } from "./api";

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

let booksDirReady = false;
let coversDirReady = false;

function getBooksDir() {
  return new Directory(Paths.document, "books");
}

function getCoversDir() {
  return new Directory(Paths.document, "covers");
}

function ensureBooksDir() {
  if (booksDirReady) return;
  const dir = getBooksDir();
  if (!dir.exists) dir.create();
  booksDirReady = true;
}

function ensureCoversDir() {
  if (coversDirReady) return;
  const dir = getCoversDir();
  if (!dir.exists) dir.create();
  coversDirReady = true;
}

// ---------------------------------------------------------------------------
// Import from document picker
// ---------------------------------------------------------------------------

/**
 * Opens the system document picker filtered to .epub files, then:
 *   1. Copies the selected file to Documents/books/
 *   2. Parses EPUB metadata (title, author, cover)
 *   3. Extracts and caches cover image
 *   4. Inserts into SQLite `books` table
 *   5. Kicks off a background upload to backend R2
 *
 * Returns the new book's SQLite row id, or null if cancelled/failed.
 */
export async function importFromDocumentPicker(
  db: SQLiteDatabase,
): Promise<number | null> {
  // 1. Pick EPUB file
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/epub+zip",
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0]!;
  const fileName = asset.name ?? "unknown.epub";
  const bookId = fileName; // use filename as bookId (matches KOReader convention)

  // Check if book already exists
  const existing = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM books WHERE book_id = ?",
    [bookId],
  );
  if (existing) {
    Alert.alert("Already imported", `"${fileName}" is already in your library.`);
    return existing.id;
  }

  try {
    // 2. Copy to persistent storage
    ensureBooksDir();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destFile = new ExpoFile(getBooksDir(), safeFileName);

    // Copy from cache to permanent location
    const sourceFile = new ExpoFile(asset.uri);
    sourceFile.move(destFile);

    const epubPath = destFile.uri.replace(/^file:\/\//, "");

    // 3. Parse EPUB metadata
    const epub = await parseEpub(epubPath);
    const title = epub.metadata.title || titleFromFileName(fileName);
    const author = epub.metadata.creator || null;

    // 4. Extract & cache cover
    let coverPath: string | null = null;
    try {
      const dataUri = await extractCoverImage(epub);
      if (dataUri) {
        coverPath = await saveCoverFromDataUri(dataUri, bookId);
      }
    } catch {
      // Cover extraction is best-effort
    }

    // 5. Get file size
    const fileSize = asset.size ?? null;

    // 6. Insert into SQLite
    const insertResult = await db.runAsync(
      `INSERT INTO books (book_id, title, author, cover_path, epub_path, file_size, source)
       VALUES (?, ?, ?, ?, ?, ?, 'mobile')`,
      [bookId, title, author, coverPath, epubPath, fileSize],
    );

    // 7. Background upload to R2 (non-blocking)
    uploadToBackend(fileName, epubPath).catch(() => {
      // Upload failure is non-fatal — book is usable locally
    });

    return insertResult.lastInsertRowId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    Alert.alert("Import failed", `Could not import "${fileName}": ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cover helper
// ---------------------------------------------------------------------------

async function saveCoverFromDataUri(
  dataUri: string,
  bookId: string,
): Promise<string | null> {
  const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) return null;

  const ext = match[1] === "jpeg" ? "jpg" : match[1]!;
  const base64Data = match[2]!;
  const safeId = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const coverFileName = `${safeId}.${ext}`;

  ensureCoversDir();

  const coverFile = new ExpoFile(getCoversDir(), coverFileName);
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  coverFile.write(bytes);

  return coverFile.uri.replace(/^file:\/\//, "");
}

// ---------------------------------------------------------------------------
// Backend upload (R2 via presigned URL)
// ---------------------------------------------------------------------------

async function uploadToBackend(fileName: string, localPath: string) {
  // Step 1: Request presigned URL
  const presignRes = await authFetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName }),
  });

  if (!presignRes.ok) return;

  const { signedUrl, key, safeName } = (await presignRes.json()) as {
    signedUrl: string;
    key: string;
    safeName: string;
  };

  // Step 2: Upload file to R2 — ExpoFile implements Blob
  const file = new ExpoFile(localPath.startsWith("file://") ? localPath : `file://${localPath}`);

  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/epub+zip" },
    body: file,
  });

  if (!uploadRes.ok) return;

  // Step 3: Finalize upload
  const finalizeRes = await authFetch("/api/upload", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, safeName }),
  });

  if (!finalizeRes.ok) return;

  const { url } = (await finalizeRes.json()) as { url: string };

  // The epub_url is now available, but we don't need to store it locally
  // since we have the file on device. It's stored on the backend for
  // cross-device access.
  return url;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.epub$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
