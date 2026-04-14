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
