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
