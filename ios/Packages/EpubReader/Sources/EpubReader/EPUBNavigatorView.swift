import ReadiumNavigator
import ReadiumShared
import SwiftUI
import UIKit

struct EPUBNavigatorView: UIViewControllerRepresentable {
    let publication: Publication
    let initialLocation: Locator?
    let preferences: EPUBPreferences
    @Binding var navigateTo: Locator?
    let onLocationChanged: (Locator) -> Void
    let onTap: () -> Void

    final class Coordinator: NSObject {
        let onLocationChanged: (Locator) -> Void
        let onTap: () -> Void
        var currentPreferences: EPUBPreferences
        weak var navigator: EPUBNavigatorViewController?

        init(
            onLocationChanged: @escaping (Locator) -> Void,
            onTap: @escaping () -> Void,
            preferences: EPUBPreferences
        ) {
            self.onLocationChanged = onLocationChanged
            self.onTap = onTap
            self.currentPreferences = preferences
        }

        @objc func handleTap() {
            onTap()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onLocationChanged: onLocationChanged,
            onTap: onTap,
            preferences: preferences
        )
    }

    func makeUIViewController(context: Context) -> EPUBNavigatorViewController {
        let config = EPUBNavigatorViewController.Configuration(preferences: preferences)
        let navigator = try! EPUBNavigatorViewController(
            publication: publication,
            initialLocation: initialLocation,
            config: config
        )
        navigator.delegate = context.coordinator
        context.coordinator.navigator = navigator

        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap)
        )
        navigator.view.addGestureRecognizer(tap)
        return navigator
    }

    func updateUIViewController(
        _ navigator: EPUBNavigatorViewController,
        context: Context
    ) {
        if let target = navigateTo {
            Task { @MainActor in
                _ = await navigator.go(to: target)
            }
            DispatchQueue.main.async {
                navigateTo = nil
            }
        }

        if context.coordinator.currentPreferences != preferences {
            context.coordinator.currentPreferences = preferences
            navigator.submitPreferences(preferences)
        }
    }
}

extension EPUBNavigatorView.Coordinator: EPUBNavigatorDelegate {
    func navigator(_ navigator: any Navigator, locationDidChange locator: Locator) {
        onLocationChanged(locator)
    }

    func navigator(_ navigator: any Navigator, presentError error: NavigatorError) {
        // Ignored — we surface errors through the loader / view-model path.
    }
}
