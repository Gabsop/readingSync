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

    public static func makeDefault() throws -> AppDatabase {
        let url = URL.applicationSupportDirectory.appending(path: "ReadingSync", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        let dbPath = url.appending(path: "readingsync.sqlite").path()
        return try AppDatabase(path: dbPath)
    }
}
