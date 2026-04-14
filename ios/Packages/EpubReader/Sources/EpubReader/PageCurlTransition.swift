import ReadiumNavigator
import ReadiumShared
import UIKit

/// Wraps EPUBNavigatorViewController inside a UIPageViewController to provide
/// the native iOS page curl transition (same as Apple Books).
///
/// The Readium navigator renders behind the UIPageViewController. Page snapshots
/// are pre-captured for adjacent pages so the curl animation has content to reveal.
@MainActor
final class PageCurlController: UIViewController {

    private(set) var navigator: EPUBNavigatorViewController!

    private let pageVC = UIPageViewController(
        transitionStyle: .pageCurl,
        navigationOrientation: .horizontal
    )

    private let publication: Publication
    private let initialLocation: Locator?

    private var forwardSnapshot: UIImage?
    private var backwardSnapshot: UIImage?
    private var isPreloading = false
    private var didInitialSetup = false

    var onLocationChanged: ((Locator) -> Void)?
    var onTap: (() -> Void)?

    init(publication: Publication, initialLocation: Locator?) {
        self.publication = publication
        self.initialLocation = initialLocation
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let config = EPUBNavigatorViewController.Configuration()
        navigator = try! EPUBNavigatorViewController(
            publication: publication,
            initialLocation: initialLocation,
            config: config
        )

        addChild(navigator)
        navigator.view.frame = view.bounds
        navigator.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(navigator.view)
        navigator.didMove(toParent: self)

        addChild(pageVC)
        pageVC.view.frame = view.bounds
        pageVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(pageVC.view)
        pageVC.didMove(toParent: self)

        pageVC.dataSource = self
        pageVC.delegate = self

        let placeholder = PageSnapshotVC(direction: .current)
        placeholder.view.backgroundColor = view.backgroundColor
        pageVC.setViewControllers([placeholder], direction: .forward, animated: false)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        pageVC.view.addGestureRecognizer(tap)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didInitialSetup else { return }
        didInitialSetup = true

        Task {
            try? await Task.sleep(for: .milliseconds(500))

            let snapshot = captureSnapshot()
            let page = PageSnapshotVC(snapshot: snapshot, direction: .current)
            pageVC.setViewControllers([page], direction: .forward, animated: false)

            if let locator = navigator.currentLocation {
                onLocationChanged?(locator)
            }

            await preloadAdjacentSnapshots()
        }
    }

    @objc private func handleTap() {
        onTap?()
    }

    // MARK: - Snapshot Capture

    private func captureSnapshot() -> UIImage {
        let renderer = UIGraphicsImageRenderer(bounds: navigator.view.bounds)
        return renderer.image { _ in
            navigator.view.drawHierarchy(in: navigator.view.bounds, afterScreenUpdates: true)
        }
    }

    private func preloadAdjacentSnapshots() async {
        guard !isPreloading else { return }
        isPreloading = true

        if await navigator.goForward() {
            try? await Task.sleep(for: .milliseconds(300))
            forwardSnapshot = captureSnapshot()
            _ = await navigator.goBackward()
            try? await Task.sleep(for: .milliseconds(200))
        } else {
            forwardSnapshot = nil
        }

        if await navigator.goBackward() {
            try? await Task.sleep(for: .milliseconds(300))
            backwardSnapshot = captureSnapshot()
            _ = await navigator.goForward()
            try? await Task.sleep(for: .milliseconds(200))
        } else {
            backwardSnapshot = nil
        }

        isPreloading = false
    }
}

// MARK: - UIPageViewControllerDataSource

extension PageCurlController: UIPageViewControllerDataSource {

    func pageViewController(
        _ pageViewController: UIPageViewController,
        viewControllerBefore viewController: UIViewController
    ) -> UIViewController? {
        guard let snapshot = backwardSnapshot else { return nil }
        return PageSnapshotVC(snapshot: snapshot, direction: .backward)
    }

    func pageViewController(
        _ pageViewController: UIPageViewController,
        viewControllerAfter viewController: UIViewController
    ) -> UIViewController? {
        guard let snapshot = forwardSnapshot else { return nil }
        return PageSnapshotVC(snapshot: snapshot, direction: .forward)
    }
}

// MARK: - UIPageViewControllerDelegate

extension PageCurlController: UIPageViewControllerDelegate {

    func pageViewController(
        _ pageViewController: UIPageViewController,
        didFinishAnimating finished: Bool,
        previousViewControllers: [UIViewController],
        transitionCompleted completed: Bool
    ) {
        guard completed,
              let page = pageViewController.viewControllers?.first as? PageSnapshotVC
        else { return }

        Task {
            switch page.direction {
            case .forward:
                _ = await navigator.goForward()
            case .backward:
                _ = await navigator.goBackward()
            case .current:
                return
            }

            try? await Task.sleep(for: .milliseconds(200))

            let snapshot = captureSnapshot()
            let current = PageSnapshotVC(snapshot: snapshot, direction: .current)
            pageVC.setViewControllers([current], direction: .forward, animated: false)

            if let locator = navigator.currentLocation {
                onLocationChanged?(locator)
            }

            await preloadAdjacentSnapshots()
        }
    }
}

// MARK: - Snapshot Page View Controller

private final class PageSnapshotVC: UIViewController {

    enum Direction {
        case forward, backward, current
    }

    let direction: Direction
    private let snapshot: UIImage?

    init(snapshot: UIImage? = nil, direction: Direction) {
        self.direction = direction
        self.snapshot = snapshot
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        if let snapshot {
            let imageView = UIImageView(image: snapshot)
            imageView.contentMode = .scaleToFill
            imageView.frame = view.bounds
            imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(imageView)
        }
    }
}
