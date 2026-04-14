import Foundation
import GRDB
import OSLog

private let logger = Logger(subsystem: "com.readingsync", category: "Database")

public final class AppDatabase: Sendable {
    private let dbQueue: DatabaseQueue

    public init(path: String) throws {
        var config = Configuration()
        config.foreignKeysEnabled = true
        dbQueue = try DatabaseQueue(path: path, configuration: config)
        try migrate()
        logger.info("Database opened at \(path)")
    }

    private func migrate() throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1-reading-positions") { db in
            try db.create(table: "reading_positions") { t in
                t.primaryKey("book_id", .text)
                t.column("position", .text)
                t.column("current_page", .integer)
                t.column("total_pages", .integer)
                t.column("progress", .double)
                t.column("updated_at", .integer)
                t.column("source", .text)
                t.column("device_id", .text)
                t.column("excerpt", .text)
            }
        }

        migrator.registerMigration("v2-sync-queue") { db in
            try db.create(table: "sync_queue") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("book_id", .text).notNull()
                t.column("position", .text)
                t.column("current_page", .integer)
                t.column("total_pages", .integer)
                t.column("progress", .double)
                t.column("excerpt", .text)
                t.column("source", .text)
                t.column("device_id", .text)
                t.column("timestamp", .integer)
                t.column("status", .text).notNull().defaults(to: "pending")
                t.column("retry_count", .integer).notNull().defaults(to: 0)
                t.column("created_at", .integer)
            }
        }

        try migrator.migrate(dbQueue)
    }

    public func saveReadingPosition(_ record: ReadingPositionRecord) throws {
        try dbQueue.write { db in
            try record.save(db)
        }
    }

    public func readingPosition(for bookId: String) throws -> ReadingPositionRecord? {
        try dbQueue.read { db in
            try ReadingPositionRecord.fetchOne(db, key: bookId)
        }
    }

    // MARK: - Sync Queue

    public func coalesceSyncQueue(bookId: String) throws {
        try dbQueue.write { db in
            try db.execute(
                sql: "DELETE FROM sync_queue WHERE book_id = ? AND status IN ('pending', 'deferred')",
                arguments: [bookId]
            )
        }
    }

    public func insertSyncQueueItem(_ record: SyncQueueRecord) throws {
        try dbQueue.write { db in
            try record.insert(db)
        }
    }

    public func pendingSyncQueueItems() throws -> [SyncQueueRecord] {
        try dbQueue.read { db in
            try SyncQueueRecord
                .filter(Column("status") == "pending")
                .order(Column("created_at").asc)
                .fetchAll(db)
        }
    }

    public func updateSyncQueueStatus(id: Int64, status: String, retryCount: Int? = nil) throws {
        try dbQueue.write { db in
            if var record = try SyncQueueRecord.fetchOne(db, key: id) {
                record.status = status
                if let retryCount {
                    record.retryCount = retryCount
                }
                try record.update(db)
            }
        }
    }

    public func cleanOldSyncQueueItems() throws {
        let cutoff = Int(Date().timeIntervalSince1970) - 86400
        try dbQueue.write { db in
            try db.execute(
                sql: "DELETE FROM sync_queue WHERE status IN ('synced', 'failed', 'deferred') AND created_at < ?",
                arguments: [cutoff]
            )
        }
    }

    public static func makeDefault() throws -> AppDatabase {
        let url = URL.applicationSupportDirectory.appending(path: "ReadingSync", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        let dbPath = url.appending(path: "readingsync.sqlite").path()
        return try AppDatabase(path: dbPath)
    }
}
