/**
 * Local SQLite database schema for the ReadingSync mobile app.
 *
 * Tables:
 * - books: Local book library metadata
 * - reading_positions: Current reading position per book
 * - sync_queue: Offline sync queue for pending progress pushes
 * - settings: Key-value store for app/reader settings
 */

export const DB_NAME = "readingsync.db";

export const DATABASE_VERSION = 1;

/**
 * SQL statements to create all tables. Executed during database initialization.
 * Uses IF NOT EXISTS so it's safe to run on every app launch.
 */
export const CREATE_TABLES_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT NOT NULL UNIQUE,
    title TEXT,
    author TEXT,
    cover_path TEXT,
    epub_path TEXT,
    epub_url TEXT,
    file_size INTEGER,
    import_date TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'mobile'
  );

  CREATE TABLE IF NOT EXISTS reading_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    position TEXT NOT NULL,
    current_page INTEGER,
    total_pages INTEGER,
    progress REAL NOT NULL DEFAULT 0,
    excerpt TEXT,
    source TEXT NOT NULL DEFAULT 'mobile',
    device_id TEXT,
    render_settings TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reading_positions_book_id
    ON reading_positions(book_id);

  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    position TEXT NOT NULL,
    current_page INTEGER,
    total_pages INTEGER,
    progress REAL NOT NULL,
    excerpt TEXT,
    source TEXT NOT NULL DEFAULT 'mobile',
    device_id TEXT,
    render_settings TEXT,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sync_queue_status
    ON sync_queue(status);

  CREATE INDEX IF NOT EXISTS idx_sync_queue_book_id
    ON sync_queue(book_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;
