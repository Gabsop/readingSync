import SwiftUI
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

    @State private var apiClient = APIClient(baseURL: serverURL)
    private let database: AppDatabase
    @State private var syncEngine: SyncEngine

    init() {
        do {
            let db = try AppDatabase.makeDefault()
            database = db
            let client = APIClient(baseURL: Self.serverURL)
            _apiClient = State(initialValue: client)
            _syncEngine = State(initialValue: SyncEngine(database: db, apiClient: client))
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
        }
    }
}
