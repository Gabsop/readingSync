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
    let readerPreferences = ReaderPreferences()

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

    var totalProgression: Double {
        currentLocator?.locations.totalProgression ?? 0
    }

    var currentChapterTitle: String? {
        currentLocator?.title
    }

    func navigateToProgression(_ progression: Double) {
        guard let publication else { return }
        Task {
            if let locator = await publication.locate(progression: progression) {
                navigateTo = locator
            }
        }
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

    /// Search the publication for a snippet of text and return the first match.
    /// Used as the fallback when the remote position string isn't parseable.
    private func locateByExcerpt(publication: Publication, excerpt: String) async -> Locator? {
        // Trim and shorten — KOReader uses the first 80 chars; do the same so
        // both clients lock onto the same anchor and to keep the search fast.
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 8 else { return nil }
        let needle = String(trimmed.prefix(80))

        let result = await publication.search(query: needle)
        guard case .success(let iterator) = result else { return nil }

        // Take the first hit and stop iterating.
        let page = await iterator.next()
        if case .success(let collection?) = page {
            return collection.locators.first
        }
        return nil
    }

    /// Pull the latest remote progress and jump to it, ignoring local state.
    func forceSyncFromRemote() async {
        guard let syncEngine else { return }
        if let remote = await syncEngine.fetchRemoteProgress(bookId: entry.bookId) {
            applyRemoteProgress(remote)
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
        // Layered fallback: exact position → excerpt search → progression.
        if let position = remote.position,
           let locator = LocatorMapper.toLocator(position) {
            navigateTo = locator
        } else if let publication {
            Task {
                if let excerpt = remote.excerpt,
                   let locator = await locateByExcerpt(publication: publication, excerpt: excerpt) {
                    navigateTo = locator
                    return
                }
                if remote.progress > 0,
                   let locator = await publication.locate(progression: remote.progress) {
                    navigateTo = locator
                }
            }
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
    @State private var showTOC = false
    @State private var showSearch = false
    @State private var showSettings = false
    private let entry: ProgressEntry
    @Environment(APIClient.self) private var apiClient
    @Environment(\.appDatabase) private var database
    @Environment(SyncEngine.self) private var syncEngine: SyncEngine?
    @Environment(\.dismiss) private var dismiss

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
        .navigationBarHidden(true)
        .statusBarHidden(viewModel?.publication != nil && !(viewModel?.showControls ?? true))
        .toolbar(.hidden, for: .navigationBar)
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
        let _ = logger.debug("readerContent eval — isLoading=\(vm.isLoading) error=\(vm.error ?? "nil") publication=\(vm.publication != nil ? "set" : "nil")")
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
                    preferences: vm.readerPreferences.epubPreferences,
                    navigateTo: Binding(
                        get: { vm.navigateTo },
                        set: { vm.navigateTo = $0 }
                    ),
                    onLocationChanged: { vm.savePosition($0) },
                    onTap: { vm.toggleControls() }
                )
                .safeAreaInset(edge: .top, spacing: 0) { topBar(vm) }
                .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar(vm) }
                .background(vm.readerPreferences.theme.swiftUIBackground.ignoresSafeArea())
                .sheet(isPresented: Binding(
                    get: { vm.showControls },
                    set: { vm.showControls = $0 }
                )) {
                    controlsOverlay(vm)
                        .presentationDetents([.height(280)])
                        .presentationBackground(.regularMaterial)
                        .presentationBackgroundInteraction(.enabled)
                        .presentationDragIndicator(.visible)
                }

                if let conflict = vm.conflictState {
                    syncConflictOverlay(vm, conflict: conflict)
                }
            }
            .sheet(isPresented: $showTOC) {
                if let publication = vm.publication {
                    TOCSheet(
                        tableOfContents: publication.manifest.tableOfContents,
                        currentHref: vm.currentLocator?.href.string
                    ) { link in
                        let locator = Locator(
                            href: link.url(),
                            mediaType: link.mediaType ?? .html,
                            title: link.title
                        )
                        vm.navigateTo = locator
                    }
                }
            }
            .sheet(isPresented: $showSearch) {
                if let publication = vm.publication {
                    SearchSheet(publication: publication) { locator in
                        vm.navigateTo = locator
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsSheet(
                    preferences: vm.readerPreferences,
                    onPreferencesChanged: {}
                )
            }
        }
    }

    @ViewBuilder
    private func topBar(_ vm: ReaderViewModel) -> some View {
        HStack(spacing: 12) {
            Spacer().frame(width: 36)
            Spacer()
            Text(vm.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button {
                vm.cleanup()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func bottomBar(_ vm: ReaderViewModel) -> some View {
        HStack {
            Spacer().frame(width: 36)
            Spacer()
            Text(pageIndicatorText(vm))
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                vm.toggleControls()
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.body.weight(.semibold))
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func pageIndicatorText(_ vm: ReaderViewModel) -> String {
        "\(vm.progressPercent)%"
    }

    @ViewBuilder
    private func controlsOverlay(_ vm: ReaderViewModel) -> some View {
        ControlsOverlay(
            progressPercent: vm.progressPercent,
            totalProgression: vm.totalProgression,
            chapterTitle: vm.currentChapterTitle,
            onOpenContents: { showTOC = true },
            onOpenSearch: { showSearch = true },
            onOpenSettings: { showSettings = true },
            onSyncFromKindle: {
                vm.showControls = false
                Task { await vm.forceSyncFromRemote() }
            },
            onScrub: { vm.navigateToProgression($0) }
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
