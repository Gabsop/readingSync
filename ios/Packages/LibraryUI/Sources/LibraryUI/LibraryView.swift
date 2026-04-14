import SwiftUI
import SyncCore

@MainActor
@Observable
final class LibraryViewModel {
    var books: [ProgressEntry] = []
    var isLoading = false
    var error: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = books.isEmpty
        error = nil

        do {
            books = try await apiClient.fetchProgress()
                .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

public struct LibraryView: View {
    @Environment(APIClient.self) private var apiClient
    @State private var viewModel: LibraryViewModel?

    public init() {}

    public var body: some View {
        Group {
            if let viewModel {
                content(viewModel)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Library")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Sign Out", role: .destructive) {
                    apiClient.logout()
                }
            }
        }
        .task {
            let vm = LibraryViewModel(apiClient: apiClient)
            viewModel = vm
            await vm.load()
        }
    }

    @ViewBuilder
    private func content(_ vm: LibraryViewModel) -> some View {
        if vm.isLoading {
            ProgressView("Loading library…")
        } else if let error = vm.error {
            ContentUnavailableView {
                Label("Something went wrong", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Retry") {
                    Task { await vm.load() }
                }
            }
        } else if vm.books.isEmpty {
            ContentUnavailableView(
                "No Books Yet",
                systemImage: "books.vertical",
                description: Text("Books synced from your Kindle will appear here.")
            )
        } else {
            bookList(vm)
        }
    }

    private func bookList(_ vm: LibraryViewModel) -> some View {
        List(vm.books) { entry in
            NavigationLink(value: entry) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(coverColor(for: entry.bookId))
                    .frame(width: 44, height: 64)
                    .overlay {
                        Text(String(entry.displayTitle.prefix(1)))
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.displayTitle)
                        .font(.body)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        ProgressView(value: entry.progress ?? 0)
                            .frame(width: 60)
                        Text("\(entry.progressPercent)%")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let source = entry.source {
                            Text("·")
                                .foregroundStyle(.tertiary)
                            Text(source)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
            }
        }
        .refreshable {
            await vm.load()
        }
    }

    private func coverColor(for bookId: String) -> Color {
        var hash = 0
        for char in bookId.unicodeScalars {
            hash = 31 &* hash &+ Int(char.value)
        }
        let hue = Double(abs(hash) % 360) / 360.0
        return Color(hue: hue, saturation: 0.5, brightness: 0.6)
    }
}
