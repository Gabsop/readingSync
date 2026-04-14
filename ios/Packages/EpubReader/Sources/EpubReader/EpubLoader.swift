import Foundation
import OSLog
import ReadiumShared
import ReadiumStreamer

private let logger = Logger(subsystem: "com.readingsync", category: "EpubLoader")

public enum EpubLoaderError: Error, LocalizedError {
    case downloadFailed(String)
    case openFailed(String)
    case invalidURL

    public var errorDescription: String? {
        switch self {
        case .downloadFailed(let reason): "Download failed: \(reason)"
        case .openFailed(let reason): "Failed to open EPUB: \(reason)"
        case .invalidURL: "Invalid EPUB URL"
        }
    }
}

@MainActor
public final class EpubLoader {
    private let httpClient: DefaultHTTPClient
    private let assetRetriever: AssetRetriever
    private let opener: PublicationOpener

    private static let booksDir: URL = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = appSupport.appendingPathComponent("Books", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    public init() {
        httpClient = DefaultHTTPClient()
        assetRetriever = AssetRetriever(httpClient: httpClient)
        let parser = DefaultPublicationParser(
            httpClient: httpClient,
            assetRetriever: assetRetriever,
            pdfFactory: DefaultPDFDocumentFactory()
        )
        opener = PublicationOpener(parser: parser)
    }

    public func localPath(for bookId: String) -> URL {
        Self.booksDir.appendingPathComponent("\(bookId).epub")
    }

    public func ensureDownloaded(bookId: String, from epubURLString: String, token: String?) async throws -> URL {
        let localURL = localPath(for: bookId)

        if FileManager.default.fileExists(atPath: localURL.path) {
            logger.debug("EPUB already cached: \(bookId)")
            return localURL
        }

        guard let remoteURL = URL(string: epubURLString) else {
            throw EpubLoaderError.invalidURL
        }

        logger.info("Downloading EPUB for \(bookId)")
        var request = URLRequest(url: remoteURL)
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (tempURL, response) = try await URLSession.shared.download(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw EpubLoaderError.downloadFailed("HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
        }

        try FileManager.default.moveItem(at: tempURL, to: localURL)
        logger.info("EPUB saved: \(localURL.lastPathComponent)")
        return localURL
    }

    public nonisolated func openPublication(at fileURL: URL) async throws -> Publication {
        guard let readiumURL = FileURL(url: fileURL) else {
            throw EpubLoaderError.openFailed("Invalid file URL")
        }

        let assetResult = await assetRetriever.retrieve(url: readiumURL)
        let asset: Asset
        switch assetResult {
        case .success(let a): asset = a
        case .failure(let error): throw EpubLoaderError.openFailed("\(error)")
        }

        let pubResult = await opener.open(asset: asset, allowUserInteraction: false)
        switch pubResult {
        case .success(let pub): return pub
        case .failure(let error): throw EpubLoaderError.openFailed("\(error)")
        }
    }
}
