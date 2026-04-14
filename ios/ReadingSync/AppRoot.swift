import SwiftUI
import SyncCore
import LibraryUI

struct AppRoot: View {
    @Environment(APIClient.self) private var apiClient

    var body: some View {
        if apiClient.isAuthenticated {
            LibraryView()
        } else {
            LoginView()
        }
    }
}
