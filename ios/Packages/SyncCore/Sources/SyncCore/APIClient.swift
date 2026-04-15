import Foundation
import OSLog

private let logger = Logger(subsystem: "com.readingsync", category: "APIClient")

@MainActor
@Observable
public final class APIClient {
    public var isAuthenticated: Bool { token != nil }

    public private(set) var token: String?
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
        // The server-side `/api/auth/mobile-callback` route defaults its
        // redirect_uri to `readingsync://auth-callback`, so we don't pass
        // either `callbackURL` or `redirect_uri` here. Embedding a custom
        // scheme in the callbackURL query trips Better Auth's validator.
        baseURL.appending(path: "api/auth/mobile-signin")
            .appending(queryItems: [
                URLQueryItem(name: "provider", value: "google"),
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

    public func syncProgress(_ body: SyncProgressBody) async throws -> Int {
        let url = baseURL.appending(path: "api/progress")
        let currentToken = token
        return try await Self.performPost(url: url, token: currentToken, session: session, body: body)
    }

    public func fetchBookProgress(bookId: String) async throws -> RemoteProgress {
        let encoded = bookId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? bookId
        let url = baseURL.appending(path: "api/progress/\(encoded)")
        let currentToken = token
        return try await Self.performRequest(url: url, token: currentToken, session: session)
    }

    // MARK: - API keys

    public func listApiKeys() async throws -> [ApiKey] {
        let url = baseURL.appending(path: "api/auth/api-keys")
        return try await Self.performRequest(url: url, token: token, session: session)
    }

    public func createApiKey(name: String) async throws -> NewApiKey {
        struct Body: Encodable, Sendable { let name: String }
        let url = baseURL.appending(path: "api/auth/api-keys")
        return try await Self.performJSONPost(
            url: url,
            token: token,
            session: session,
            body: Body(name: name)
        )
    }

    public func revokeApiKey(id: Int) async throws {
        struct Body: Encodable, Sendable { let id: Int }
        let url = baseURL.appending(path: "api/auth/api-keys")
        try await Self.performDelete(
            url: url,
            token: token,
            session: session,
            body: Body(id: id)
        )
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

    private static nonisolated func performJSONPost<T: Decodable>(
        url: URL,
        token: String?,
        session: URLSession,
        body: some Encodable & Sendable
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(body)

        logger.debug("POST \(url.path())")
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

    private static nonisolated func performDelete(
        url: URL,
        token: String?,
        session: URLSession,
        body: some Encodable & Sendable
    ) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(body)

        logger.debug("DELETE \(url.path())")
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard http.statusCode == 200 else {
            logger.error("HTTP \(http.statusCode) from \(url.path())")
            throw APIError.httpError(http.statusCode)
        }
    }

    private static nonisolated func performPost(
        url: URL,
        token: String?,
        session: URLSession,
        body: some Encodable & Sendable
    ) async throws -> Int {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = try JSONEncoder().encode(body)

        logger.debug("POST \(url.path())")
        let (_, response) = try await session.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard http.statusCode == 200 || http.statusCode == 409 else {
            logger.error("HTTP \(http.statusCode) from \(url.path())")
            throw APIError.httpError(http.statusCode)
        }

        return http.statusCode
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
