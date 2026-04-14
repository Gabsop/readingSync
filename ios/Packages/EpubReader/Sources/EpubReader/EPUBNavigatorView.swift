import ReadiumNavigator
import ReadiumShared
import SwiftUI

struct EPUBNavigatorView: UIViewControllerRepresentable {
    let publication: Publication
    let initialLocation: Locator?
    let onLocationChanged: (Locator) -> Void
    let onTap: () -> Void

    func makeUIViewController(context: Context) -> PageCurlController {
        let controller = PageCurlController(
            publication: publication,
            initialLocation: initialLocation
        )
        controller.onLocationChanged = onLocationChanged
        controller.onTap = onTap
        return controller
    }

    func updateUIViewController(_ uiViewController: PageCurlController, context: Context) {}
}
