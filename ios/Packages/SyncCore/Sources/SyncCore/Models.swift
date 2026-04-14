import Foundation

public struct ProgressEntry: Codable, Identifiable, Hashable, Sendable {
    public let id: Int
    public let bookId: String
    public let bookTitle: String?
    public let position: String?
    public let currentPage: Int?
    public let totalPages: Int?
    public let progress: Double?
    public let epubUrl: String?
    public let excerpt: String?
    public let source: String?
    public let deviceId: String?
    public let updatedAt: String?

    public var displayTitle: String {
        if let bookTitle, !bookTitle.isEmpty {
            return bookTitle
        }
        return bookId.replacingOccurrences(of: "-", with: " ").capitalized
    }

    public var progressPercent: Int {
        Int((progress ?? 0) * 100)
    }
}

public struct RemoteProgress: Codable, Sendable {
    public let bookId: String
    public let bookTitle: String?
    public let position: String?
    public let currentPage: Int?
    public let totalPages: Int?
    public let progress: Double
    public let excerpt: String?
    public let source: String?
    public let deviceId: String?
    public let updatedAt: Int

    enum CodingKeys: String, CodingKey {
        case bookId = "book_id"
        case bookTitle = "book_title"
        case position
        case currentPage = "current_page"
        case totalPages = "total_pages"
        case progress
        case excerpt
        case source
        case deviceId = "device_id"
        case updatedAt = "updated_at"
    }
}

public struct SyncPayload: Sendable {
    public let bookId: String
    public let position: String?
    public let currentPage: Int?
    public let totalPages: Int?
    public let progress: Double?
    public let excerpt: String?

    public init(
        bookId: String,
        position: String? = nil,
        currentPage: Int? = nil,
        totalPages: Int? = nil,
        progress: Double? = nil,
        excerpt: String? = nil
    ) {
        self.bookId = bookId
        self.position = position
        self.currentPage = currentPage
        self.totalPages = totalPages
        self.progress = progress
        self.excerpt = excerpt
    }
}

public struct SyncProgressBody: Encodable, Sendable {
    public let bookId: String
    public let position: String?
    public let currentPage: Int?
    public let totalPages: Int?
    public let progress: Double?
    public let excerpt: String?
    public let source: String?
    public let deviceId: String?
    public let updatedAt: Int?

    public init(
        bookId: String,
        position: String? = nil,
        currentPage: Int? = nil,
        totalPages: Int? = nil,
        progress: Double? = nil,
        excerpt: String? = nil,
        source: String? = nil,
        deviceId: String? = nil,
        updatedAt: Int? = nil
    ) {
        self.bookId = bookId
        self.position = position
        self.currentPage = currentPage
        self.totalPages = totalPages
        self.progress = progress
        self.excerpt = excerpt
        self.source = source
        self.deviceId = deviceId
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case bookId = "book_id"
        case position
        case currentPage = "current_page"
        case totalPages = "total_pages"
        case progress
        case excerpt
        case source
        case deviceId = "device_id"
        case updatedAt = "updated_at"
    }
}
