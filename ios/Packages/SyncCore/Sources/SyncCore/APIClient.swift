import Foundation
import OSLog

private let logger = Logger(subsystem: "com.readingsync", category: "APIClient")

@MainActor
@Observable
public final class APIClient {
    public var isAuthenticated: Bool { token != nil }

    private var token: String?
    private let baseURL: URL
    private let keychain: KeychainStore
    private let session: URLSession

    private static let tokenKey = "session-token"

    public init(baseURL: URL, keychain: KeychainStore = .init(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.keychain = keychain
        self.session = session
        self.token = keychain.load(forKey: Self.tokenKey)
    }

    public func setToken(_ newToken: String) throws {
        try keychain.save(newToken, forKey: Self.tokenKey)
        token = newToken
    }

    public func logout() {
        keychain.delete(forKey: Self.tokenKey)
        token = nil
    }

    public var signInURL: URL {
        let callbackPath = "/api/auth/mobile-callback?redirect_uri=\("readingsync://auth-callback".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        let encoded = callbackPath.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? callbackPath
        return baseURL.appending(path: "api/auth/mobile-signin")
            .appending(queryItems: [
                URLQueryItem(name: "provider", value: "google"),
                URLQueryItem(name: "callbackURL", value: encoded),
            ])
    }

    public func fetchProgress() async throws -> [ProgressEntry] {
        let currentToken = token
        let url = baseURL.appending(path: "api/progress")
        let entries: [ProgressEntry] = try await Self.performRequest(
            url: url,
            token: currentToken,
            session: session
        )
        return entries
    }

    private static nonisolated func performRequest<T: Decodable>(
        url: URL,
        token: String?,
        session: URLSession
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        logger.debug("GET \(url.path())")
        let (data, response) = try await session.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard http.statusCode == 200 else {
            logger.error("HTTP \(http.statusCode) from \(url.path())")
            throw APIError.httpError(http.statusCode)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}

public enum APIError: Error, LocalizedError {
    case invalidResponse
    case httpError(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "Invalid server response"
        case .httpError(401):
            "Session expired. Please sign in again."
        case .httpError(let code):
            "Server error (\(code))"
        }
    }
}
