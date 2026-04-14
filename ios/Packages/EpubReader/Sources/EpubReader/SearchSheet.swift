import ReadiumShared
import SwiftUI

struct SearchSheet: View {
    let publication: Publication
    let onSelect: (Locator) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Locator] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Group {
                if results.isEmpty && !isSearching && !query.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else if results.isEmpty && !isSearching {
                    ContentUnavailableView(
                        "Search Book",
                        systemImage: "magnifyingglass",
                        description: Text("Find text in this book")
                    )
                } else {
                    resultsList
                }
            }
            .overlay {
                if isSearching {
                    ProgressView("Searching…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.ultraThinMaterial)
                }
            }
            .searchable(text: $query, prompt: "Search in book")
            .onSubmit(of: .search) { performSearch() }
            .onChange(of: query) {
                if query.isEmpty {
                    searchTask?.cancel()
                    results = []
                    isSearching = false
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var resultsList: some View {
        List(Array(results.enumerated()), id: \.offset) { _, locator in
            Button {
                onSelect(locator)
                dismiss()
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    if let title = locator.title, !title.isEmpty {
                        Text(title)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    highlightedText(locator.text)
                        .font(.subheadline)
                        .lineLimit(3)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
        }
        .listStyle(.plain)
    }

    private func highlightedText(_ text: Locator.Text) -> Text {
        let before = text.before?.suffix(40).description ?? ""
        let highlight = text.highlight ?? ""
        let after = text.after?.prefix(40).description ?? ""

        return Text(before)
            .foregroundStyle(.secondary)
            + Text(highlight)
                .foregroundStyle(.primary)
                .fontWeight(.semibold)
            + Text(after)
                .foregroundStyle(.secondary)
    }

    private func performSearch() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        searchTask?.cancel()
        results = []
        isSearching = true

        searchTask = Task {
            defer { isSearching = false }

            let searchResult = await publication.search(query: trimmed)
            guard !Task.isCancelled else { return }

            switch searchResult {
            case .success(let iterator):
                while !Task.isCancelled {
                    let page = await iterator.next()
                    switch page {
                    case .success(let collection?):
                        results.append(contentsOf: collection.locators)
                    case .success(nil):
                        return
                    case .failure:
                        return
                    }
                }
            case .failure:
                break
            }
        }
    }
}
