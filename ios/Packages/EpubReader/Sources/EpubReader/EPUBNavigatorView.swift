import ReadiumNavigator
import ReadiumShared
import SwiftUI

struct EPUBNavigatorView: UIViewControllerRepresentable {
    let publication: Publication
    let initialLocation: Locator?
    let preferences: EPUBPreferences
    @Binding var navigateTo: Locator?
    let onLocationChanged: (Locator) -> Void
    let onTap: () -> Void

    func makeUIViewController(context: Context) -> PageCurlController {
        let controller = PageCurlController(
            publication: publication,
            initialLocation: initialLocation,
            preferences: preferences
        )
        controller.onLocationChanged = onLocationChanged
        controller.onTap = onTap
        return controller
    }

    func updateUIViewController(_ controller: PageCurlController, context: Context) {
        if let target = navigateTo {
            Task { @MainActor in
                await controller.go(to: target)
            }
            DispatchQueue.main.async {
                navigateTo = nil
            }
        }

        if controller.currentPreferences != preferences {
            Task { @MainActor in
                await controller.updatePreferences(preferences)
            }
        }
    }
}
