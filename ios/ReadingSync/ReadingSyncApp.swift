import SwiftUI
import SyncCore
import LibraryUI

@main
struct ReadingSyncApp: App {
    #if DEBUG
    private static let serverURL = URL(string: "http://localhost:3000")!
    #else
    private static let serverURL = URL(string: "https://readingsync.example.com")!
    #endif

    @State private var apiClient = APIClient(baseURL: serverURL)

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environment(apiClient)
        }
    }
}
