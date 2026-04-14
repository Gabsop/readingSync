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

    init() {
        do {
            database = try AppDatabase.makeDefault()
        } catch {
            fatalError("Failed to initialize database: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environment(apiClient)
                .environment(\.appDatabase, database)
        }
    }
}
