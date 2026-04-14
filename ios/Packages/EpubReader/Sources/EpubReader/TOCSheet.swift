import ReadiumShared
import SwiftUI

private struct FlatTOCEntry: Identifiable {
    let id = UUID()
    let link: ReadiumShared.Link
    let depth: Int
    let title: String
}

struct TOCSheet: View {
    let tableOfContents: [ReadiumShared.Link]
    let currentHref: String?
    let onSelect: (ReadiumShared.Link) -> Void

    @Environment(\.dismiss) private var dismiss

    private var entries: [FlatTOCEntry] {
        var result: [FlatTOCEntry] = []
        func flatten(_ links: [ReadiumShared.Link], depth: Int) {
            for link in links {
                let title = link.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !title.isEmpty {
                    result.append(FlatTOCEntry(link: link, depth: depth, title: title))
                }
                flatten(link.children, depth: depth + 1)
            }
        }
        flatten(tableOfContents, depth: 0)
        return result
    }

    var body: some View {
        NavigationStack {
            List(entries) { entry in
                Button {
                    onSelect(entry.link)
                    dismiss()
                } label: {
                    HStack(spacing: 0) {
                        if entry.depth > 0 {
                            Spacer()
                                .frame(width: CGFloat(entry.depth) * 20)
                        }

                        Text(entry.title)
                            .font(entry.depth == 0 ? .body : .subheadline)
                            .foregroundStyle(isCurrent(entry) ? Color.accentColor : .primary)
                            .fontWeight(isCurrent(entry) ? .semibold : .regular)

                        Spacer()

                        if isCurrent(entry) {
                            Circle()
                                .fill(Color.accentColor)
                                .frame(width: 7, height: 7)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            }
            .listStyle(.plain)
            .navigationTitle("Contents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func isCurrent(_ entry: FlatTOCEntry) -> Bool {
        guard let currentHref else { return false }
        let entryHref = entry.link.href
        return currentHref.hasSuffix(entryHref)
            || entryHref.hasSuffix(currentHref)
            || currentHref.contains(entryHref)
            || entryHref.contains(currentHref)
    }
}
