import Foundation
import OSLog
import Persistence

private let logger = Logger(subsystem: "com.readingsync", category: "SyncEngine")

public enum SyncResolution: Sendable {
    case useLocal
    case useRemote(RemoteProgress)
    case prompt(remote: RemoteProgress, localProgress: Double, remoteProgress: Double)
}

@MainActor
@Observable
public final class SyncEngine {
    private static let deviceIdKey = "device-id"
    private static let syncDebounceSeconds: UInt64 = 3
    private static let maxRetryCount = 5
    private static let stalenessThreshold = 7 * 24 * 60 * 60

    private let database: AppDatabase
    private let apiClient: APIClient
    private let keychain: KeychainStore

    private var cachedDeviceId: String?
    private var flushTask: Task<Void, Never>?
    private var isFlushing = false

    public init(database: AppDatabase, apiClient: APIClient, keychain: KeychainStore = .init()) {
        self.database = database
        self.apiClient = apiClient
        self.keychain = keychain
    }

    // MARK: - Device ID

    public func getDeviceId() -> String {
        if let cached = cachedDeviceId { return cached }

        if let stored = keychain.load(forKey: Self.deviceIdKey) {
            cachedDeviceId = stored
            return stored
        }

        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let id = bytes.map { String(format: "%02x", $0) }.joined()

        try? keychain.save(id, forKey: Self.deviceIdKey)
        cachedDeviceId = id
        return id
    }

    // MARK: - Push

    public func enqueueSync(_ payload: SyncPayload) throws {
        let deviceId = getDeviceId()
        let timestamp = Int(Date().timeIntervalSince1970)

        try database.coalesceSyncQueue(bookId: payload.bookId)

        let record = SyncQueueRecord(
            bookId: payload.bookId,
            position: payload.position,
            currentPage: payload.currentPage,
            totalPages: payload.totalPages,
            progress: payload.progress,
            excerpt: payload.excerpt,
            source: "ios",
            deviceId: deviceId,
            timestamp: timestamp,
            status: "pending",
            retryCount: 0,
            createdAt: timestamp
        )
        try database.insertSyncQueueItem(record)

        scheduleFlush()
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task {
            try? await Task.sleep(for: .seconds(Self.syncDebounceSeconds))
            guard !Task.isCancelled else { return }
            await flush()
        }
    }

    public func flush() async {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        do {
            let pending = try database.pendingSyncQueueItems()

            for item in pending {
                guard let itemId = item.id else { continue }

                do {
                    let body = SyncProgressBody(
                        bookId: item.bookId,
                        position: item.position,
                        currentPage: item.currentPage,
                        totalPages: item.totalPages,
                        progress: item.progress,
                        excerpt: item.excerpt,
                        source: item.source,
                        deviceId: item.deviceId,
                        updatedAt: item.timestamp
                    )
                    let statusCode = try await apiClient.syncProgress(body)

                    if statusCode == 409 {
                        try database.updateSyncQueueStatus(id: itemId, status: "deferred")
                        logger.info("Deferred sync for \(item.bookId) (409)")
                        continue
                    }

                    try database.updateSyncQueueStatus(id: itemId, status: "synced")
                    logger.info("Synced \(item.bookId)")
                } catch {
                    let newRetryCount = item.retryCount + 1
                    let newStatus = newRetryCount >= Self.maxRetryCount ? "failed" : item.status
                    try? database.updateSyncQueueStatus(id: itemId, status: newStatus, retryCount: newRetryCount)
                    logger.error("Sync failed for \(item.bookId): \(error)")
                }
            }

            try database.cleanOldSyncQueueItems()
        } catch {
            logger.error("Flush failed: \(error)")
        }
    }

    // MARK: - Pull

    public func fetchRemoteProgress(bookId: String) async -> RemoteProgress? {
        do {
            return try await apiClient.fetchBookProgress(bookId: bookId)
        } catch {
            logger.debug("No remote progress for \(bookId): \(error)")
            return nil
        }
    }

    public func resolveProgressOnOpen(bookId: String) async -> SyncResolution {
        let deviceId = getDeviceId()
        let local = try? database.readingPosition(for: bookId)

        guard let remote = await fetchRemoteProgress(bookId: bookId) else {
            return .useLocal
        }

        guard let local else {
            return .useRemote(remote)
        }

        if remote.deviceId == deviceId && remote.source == "ios" {
            return .useLocal
        }

        let localUpdatedAt = local.updatedAt ?? 0
        if remote.updatedAt <= localUpdatedAt {
            return .useLocal
        }

        let now = Int(Date().timeIntervalSince1970)
        if now - remote.updatedAt > Self.stalenessThreshold {
            return .useLocal
        }

        let localProgress = local.progress ?? 0
        let progressDiff = abs(remote.progress - localProgress)

        if progressDiff < 0.05 {
            return .useRemote(remote)
        }

        return .prompt(remote: remote, localProgress: localProgress, remoteProgress: remote.progress)
    }

    public func cancelPendingFlush() {
        flushTask?.cancel()
        flushTask = nil
    }
}
