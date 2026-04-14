import SwiftUI
import BackgroundTasks
import SyncCore
import Persistence
import LibraryUI
import EpubReader

@main
struct ReadingSyncApp: App {
    #if DEBUG
    private static let serverURL = URL(string: "http://localhost:3000")!
    #else
    private static let serverURL = URL(string: "https://readingsync.example.com")!
    #endif

    private static let bgTaskIdentifier = "com.readingsync.sync-refresh"

    @State private var apiClient: APIClient
    private let database: AppDatabase
    @State private var syncEngine: SyncEngine

    init() {
        do {
            let db = try AppDatabase.makeDefault()
            database = db
            let client = APIClient(baseURL: Self.serverURL)
            _apiClient = State(initialValue: client)
            let engine = SyncEngine(database: db, apiClient: client)
            _syncEngine = State(initialValue: engine)
            Self.registerBackgroundTask(syncEngine: engine)
        } catch {
            fatalError("Failed to initialize database: \(error)")
        }
    }

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environment(apiClient)
                .environment(syncEngine)
                .environment(\.appDatabase, database)
        }
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .active && oldPhase != .active {
                Task { @MainActor in
                    await syncEngine.flush()
                }
            }
            if newPhase == .background {
                Self.scheduleBackgroundRefresh()
            }
        }
    }

    private static func registerBackgroundTask(syncEngine: SyncEngine) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: bgTaskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handleBackgroundRefresh(refreshTask, syncEngine: syncEngine)
        }
    }

    private static func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: bgTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handleBackgroundRefresh(
        _ task: BGAppRefreshTask,
        syncEngine: SyncEngine
    ) {
        scheduleBackgroundRefresh()

        let flushTask = Task { @MainActor in
            await syncEngine.flush()
            task.setTaskCompleted(success: true)
        }

        task.expirationHandler = {
            flushTask.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
