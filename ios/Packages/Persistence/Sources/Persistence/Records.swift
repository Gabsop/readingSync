import Foundation
import GRDB

public struct ReadingPositionRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "reading_positions"

    public var bookId: String
    public var position: String?
    public var currentPage: Int?
    public var totalPages: Int?
    public var progress: Double?
    public var updatedAt: Int?
    public var source: String?
    public var deviceId: String?
    public var excerpt: String?

    public init(
        bookId: String,
        position: String? = nil,
        currentPage: Int? = nil,
        totalPages: Int? = nil,
        progress: Double? = nil,
        updatedAt: Int? = nil,
        source: String? = nil,
        deviceId: String? = nil,
        excerpt: String? = nil
    ) {
        self.bookId = bookId
        self.position = position
        self.currentPage = currentPage
        self.totalPages = totalPages
        self.progress = progress
        self.updatedAt = updatedAt
        self.source = source
        self.deviceId = deviceId
        self.excerpt = excerpt
    }

    enum CodingKeys: String, CodingKey {
        case bookId = "book_id"
        case position
        case currentPage = "current_page"
        case totalPages = "total_pages"
        case progress
        case updatedAt = "updated_at"
        case source
        case deviceId = "device_id"
        case excerpt
    }
}

public struct SyncQueueRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "sync_queue"

    public var id: Int64?
    public var bookId: String
    public var position: String?
    public var currentPage: Int?
    public var totalPages: Int?
    public var progress: Double?
    public var excerpt: String?
    public var source: String?
    public var deviceId: String?
    public var timestamp: Int?
    public var status: String
    public var retryCount: Int
    public var createdAt: Int?

    public init(
        id: Int64? = nil,
        bookId: String,
        position: String? = nil,
        currentPage: Int? = nil,
        totalPages: Int? = nil,
        progress: Double? = nil,
        excerpt: String? = nil,
        source: String? = nil,
        deviceId: String? = nil,
        timestamp: Int? = nil,
        status: String = "pending",
        retryCount: Int = 0,
        createdAt: Int? = nil
    ) {
        self.id = id
        self.bookId = bookId
        self.position = position
        self.currentPage = currentPage
        self.totalPages = totalPages
        self.progress = progress
        self.excerpt = excerpt
        self.source = source
        self.deviceId = deviceId
        self.timestamp = timestamp
        self.status = status
        self.retryCount = retryCount
        self.createdAt = createdAt
    }

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }

    enum CodingKeys: String, CodingKey {
        case id
        case bookId = "book_id"
        case position
        case currentPage = "current_page"
        case totalPages = "total_pages"
        case progress
        case excerpt
        case source
        case deviceId = "device_id"
        case timestamp
        case status
        case retryCount = "retry_count"
        case createdAt = "created_at"
    }
}
