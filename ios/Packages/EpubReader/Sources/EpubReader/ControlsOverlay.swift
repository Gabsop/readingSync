import SwiftUI

struct ControlsOverlay: View {
    let progressPercent: Int
    var onOpenContents: () -> Void = {}
    var onOpenSearch: () -> Void = {}
    var onOpenSettings: () -> Void = {}

    var body: some View {
        VStack {
            Spacer()

            VStack(spacing: 8) {
                toolbar
                actionRow
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 4)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private var toolbar: some View {
        VStack(spacing: 0) {
            toolbarButton(
                label: "Contents",
                detail: "· \(progressPercent)%",
                icon: "list.bullet",
                action: onOpenContents
            )

            Divider().padding(.leading, 16)

            toolbarButton(
                label: "Search Book",
                icon: "magnifyingglass",
                action: onOpenSearch
            )

            Divider().padding(.leading, 16)

            toolbarButton(
                label: "Themes & Settings",
                iconText: "Aa",
                action: onOpenSettings
            )
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private func toolbarButton(
        label: String,
        detail: String? = nil,
        icon: String? = nil,
        iconText: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                HStack(spacing: 4) {
                    Text(label)
                    if let detail {
                        Text(detail)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let icon {
                    Image(systemName: icon)
                        .font(.subheadline)
                }
                if let iconText {
                    Text(iconText)
                        .font(.subheadline.weight(.semibold))
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var actionRow: some View {
        HStack {
            ForEach(actionButtons, id: \.icon) { item in
                Spacer()
                Button(action: item.action) {
                    Image(systemName: item.icon)
                        .font(.title3)
                        .padding(8)
                }
                .buttonStyle(.plain)
                Spacer()
            }
        }
        .padding(.vertical, 2)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var actionButtons: [(icon: String, action: () -> Void)] {
        [
            ("square.and.arrow.up", {}),
            ("iphone", {}),
            ("lock", {}),
            ("bookmark", {}),
        ]
    }
}
