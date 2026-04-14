import OSLog
import Persistence
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
    var navigateTo: Locator?
    var conflictState: ConflictState?

    struct ConflictState {
        let remote: RemoteProgress
        let localProgress: Double
        let remoteProgress: Double
    }

    private let entry: ProgressEntry
    private let loader: EpubLoader
    private let token: String?
    private let database: AppDatabase
    private let syncEngine: SyncEngine?
    private var userHasNavigated = false

    init(entry: ProgressEntry, token: String?, database: AppDatabase, syncEngine: SyncEngine?) {
        self.entry = entry
        self.loader = EpubLoader()
        self.token = token
        self.database = database
        self.syncEngine = syncEngine
    }

    var title: String { entry.displayTitle }

    var progressPercent: Int {
        guard let loc = currentLocator,
              let progression = loc.locations.totalProgression else {
            return 0
        }
        return Int(progression * 100)
    }

    var savedLocator: Locator? {
        guard let record = try? database.readingPosition(for: entry.bookId),
              let position = record.position else {
            return nil
        }
        return LocatorMapper.toLocator(position)
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

    func resolveSync() async {
        guard let syncEngine else { return }

        let resolution = await syncEngine.resolveProgressOnOpen(bookId: entry.bookId)
        guard !userHasNavigated else { return }

        switch resolution {
        case .useLocal:
            break
        case .useRemote(let remote):
            applyRemoteProgress(remote)
        case .prompt(let remote, let localProg, let remoteProg):
            conflictState = ConflictState(
                remote: remote,
                localProgress: localProg,
                remoteProgress: remoteProg
            )
        }
    }

    func pickLocal() {
        userHasNavigated = true
        conflictState = nil
    }

    func pickRemote() {
        guard let conflict = conflictState else { return }
        userHasNavigated = true
        conflictState = nil
        applyRemoteProgress(conflict.remote)
    }

    private func applyRemoteProgress(_ remote: RemoteProgress) {
        if let position = remote.position,
           let locator = LocatorMapper.toLocator(position) {
            navigateTo = locator
        }

        let record = ReadingPositionRecord(
            bookId: entry.bookId,
            position: remote.position,
            currentPage: remote.currentPage,
            totalPages: remote.totalPages,
            progress: remote.progress,
            updatedAt: remote.updatedAt,
            source: remote.source,
            deviceId: remote.deviceId,
            excerpt: remote.excerpt
        )
        try? database.saveReadingPosition(record)
    }

    func savePosition(_ locator: Locator) {
        userHasNavigated = true
        currentLocator = locator

        let cfiString = LocatorMapper.toCFIString(locator)
        let progress = locator.locations.totalProgression

        let record = ReadingPositionRecord(
            bookId: entry.bookId,
            position: cfiString,
            progress: progress,
            updatedAt: Int(Date().timeIntervalSince1970),
            source: "ios"
        )
        do {
            try database.saveReadingPosition(record)
        } catch {
            logger.error("Failed to save position: \(error)")
        }

        if let syncEngine {
            let payload = SyncPayload(
                bookId: entry.bookId,
                position: cfiString,
                progress: progress
            )
            try? syncEngine.enqueueSync(payload)
        }
    }

    func toggleControls() {
        showControls.toggle()
    }

    func cleanup() {
        syncEngine?.cancelPendingFlush()
        Task {
            await syncEngine?.flush()
        }
    }
}

public struct ReaderView: View {
    @State private var viewModel: ReaderViewModel?
    private let entry: ProgressEntry
    @Environment(APIClient.self) private var apiClient
    @Environment(\.appDatabase) private var database
    @Environment(SyncEngine.self) private var syncEngine: SyncEngine?

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
            guard let database else { return }
            let vm = ReaderViewModel(
                entry: entry,
                token: apiClient.token,
                database: database,
                syncEngine: syncEngine
            )
            viewModel = vm
            await vm.load()
            if vm.publication != nil {
                await vm.resolveSync()
            }
        }
        .onDisappear {
            viewModel?.cleanup()
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
                    navigateTo: Binding(
                        get: { vm.navigateTo },
                        set: { vm.navigateTo = $0 }
                    ),
                    onLocationChanged: { vm.savePosition($0) },
                    onTap: { vm.toggleControls() }
                )

                if vm.showControls {
                    controlsOverlay(vm)
                }

                if let conflict = vm.conflictState {
                    syncConflictOverlay(vm, conflict: conflict)
                }
            }
            .navigationTitle(vm.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func controlsOverlay(_ vm: ReaderViewModel) -> some View {
        ControlsOverlay(
            progressPercent: vm.progressPercent
        )
    }

    @ViewBuilder
    private func syncConflictOverlay(
        _ vm: ReaderViewModel,
        conflict: ReaderViewModel.ConflictState
    ) -> some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Text("Sync Conflict")
                    .font(.headline)

                Text("Your reading position differs on another device.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: 12) {
                    conflictOption(
                        icon: "iphone",
                        label: "This Device",
                        progress: conflict.localProgress,
                        action: { vm.pickLocal() }
                    )

                    conflictOption(
                        icon: sourceIcon(conflict.remote.source),
                        label: sourceLabel(conflict.remote.source),
                        progress: conflict.remoteProgress,
                        action: { vm.pickRemote() }
                    )
                }
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 40)
        }
    }

    @ViewBuilder
    private func conflictOption(
        icon: String,
        label: String,
        progress: Double,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title3)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.subheadline.weight(.medium))
                    Text("\(Int(progress * 100))% complete")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func sourceIcon(_ source: String?) -> String {
        switch source {
        case "kindle": return "book.fill"
        case "ios": return "iphone"
        default: return "device.laptop"
        }
    }

    private func sourceLabel(_ source: String?) -> String {
        switch source {
        case "kindle": return "Kindle"
        case "ios": return "iPhone"
        default: return "Other Device"
        }
    }
}
