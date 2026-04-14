import OSLog
import ReadiumShared
import SyncCore
import SwiftUI

private let logger = Logger(subsystem: "com.readingsync", category: "Reader")

@MainActor
@Observable
final class ReaderViewModel {
    var publication: Publication?
    var isLoading = true
    var error: String?
    var showControls = false
    var currentLocator: Locator?

    private let entry: ProgressEntry
    private let loader: EpubLoader
    private let token: String?

    private static let positionKeyPrefix = "reader.position."

    init(entry: ProgressEntry, token: String?) {
        self.entry = entry
        self.loader = EpubLoader()
        self.token = token
    }

    var title: String { entry.displayTitle }

    var savedLocator: Locator? {
        guard let json = UserDefaults.standard.string(forKey: Self.positionKeyPrefix + entry.bookId) else {
            return nil
        }
        return try? Locator(jsonString: json)
    }

    func load() async {
        guard let epubUrl = entry.epubUrl else {
            error = "No EPUB URL available for this book."
            isLoading = false
            return
        }

        do {
            let fileURL = try await loader.ensureDownloaded(
                bookId: entry.bookId,
                from: epubUrl,
                token: token
            )
            publication = try await loader.openPublication(at: fileURL)
            logger.info("Opened publication: \(self.entry.bookId)")
        } catch {
            self.error = error.localizedDescription
            logger.error("Failed to load: \(error)")
        }
        isLoading = false
    }

    func savePosition(_ locator: Locator) {
        currentLocator = locator
        if let json = locator.jsonString {
            UserDefaults.standard.set(json, forKey: Self.positionKeyPrefix + entry.bookId)
        }
    }

    func toggleControls() {
        showControls.toggle()
    }
}

public struct ReaderView: View {
    @State private var viewModel: ReaderViewModel?
    private let entry: ProgressEntry
    @Environment(APIClient.self) private var apiClient

    public init(entry: ProgressEntry) {
        self.entry = entry
    }

    public var body: some View {
        Group {
            if let vm = viewModel {
                readerContent(vm)
            } else {
                ProgressView()
            }
        }
        .navigationBarBackButtonHidden(viewModel?.publication != nil && !(viewModel?.showControls ?? true))
        .toolbar(viewModel?.publication != nil && !(viewModel?.showControls ?? true) ? .hidden : .visible, for: .navigationBar)
        .statusBarHidden(viewModel?.publication != nil && !(viewModel?.showControls ?? true))
        .ignoresSafeArea(.all, edges: .bottom)
        .task {
            let vm = ReaderViewModel(entry: entry, token: apiClient.token)
            viewModel = vm
            await vm.load()
        }
    }

    @ViewBuilder
    private func readerContent(_ vm: ReaderViewModel) -> some View {
        if vm.isLoading {
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading book…")
                    .foregroundStyle(.secondary)
            }
        } else if let error = vm.error {
            ContentUnavailableView {
                Label("Unable to Open", systemImage: "book.closed")
            } description: {
                Text(error)
            }
        } else if let publication = vm.publication {
            ZStack {
                EPUBNavigatorView(
                    publication: publication,
                    initialLocation: vm.savedLocator,
                    onLocationChanged: { vm.savePosition($0) },
                    onTap: { vm.toggleControls() }
                )

                if vm.showControls {
                    controlsOverlay(vm)
                }
            }
            .navigationTitle(vm.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func controlsOverlay(_ vm: ReaderViewModel) -> some View {
        VStack {
            Spacer()
            HStack {
                if let loc = vm.currentLocator,
                   let progression = loc.locations.totalProgression {
                    Text("\(Int(progression * 100))%")
                        .font(.caption)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                Spacer()
            }
            .padding()
        }
    }
}
