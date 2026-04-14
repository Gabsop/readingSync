import ReadiumNavigator
import ReadiumShared
import SwiftUI
import WebKit

struct EPUBNavigatorView: UIViewControllerRepresentable {
    let publication: Publication
    let initialLocation: Locator?
    let onLocationChanged: (Locator) -> Void
    let onTap: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onLocationChanged: onLocationChanged, onTap: onTap)
    }

    func makeUIViewController(context: Context) -> EPUBNavigatorViewController {
        let config = EPUBNavigatorViewController.Configuration()

        let nav = try! EPUBNavigatorViewController(
            publication: publication,
            initialLocation: initialLocation,
            config: config
        )
        nav.delegate = context.coordinator
        context.coordinator.navigator = nav
        return nav
    }

    func updateUIViewController(_ uiViewController: EPUBNavigatorViewController, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, EPUBNavigatorDelegate {
        weak var navigator: EPUBNavigatorViewController?
        private let onLocationChanged: (Locator) -> Void
        private let onTap: () -> Void

        init(onLocationChanged: @escaping (Locator) -> Void, onTap: @escaping () -> Void) {
            self.onLocationChanged = onLocationChanged
            self.onTap = onTap
        }

        func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
            onLocationChanged(locator)
        }

        func navigator(_ navigator: VisualNavigator, didTapAt point: CGPoint) {
            onTap()
        }

        func navigator(_ navigator: Navigator, didJumpTo locator: Locator) {}
        func navigator(_ navigator: Navigator, presentError error: NavigatorError) {}
    }
}
