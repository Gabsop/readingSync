import SwiftUI
import SyncCore
import LibraryUI
import EpubReader

struct AppRoot: View {
    @Environment(APIClient.self) private var apiClient

    var body: some View {
        if apiClient.isAuthenticated {
            LibraryView()
                .navigationDestination(for: ProgressEntry.self) { entry in
                    ReaderView(entry: entry)
                }
        } else {
            LoginView()
        }
    }
}
