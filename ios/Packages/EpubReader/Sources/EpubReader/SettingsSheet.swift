import ReadiumNavigator
import SwiftUI

// MARK: - Reader Preferences Model

@MainActor
@Observable
final class ReaderPreferences {
    var theme: ReaderTheme = .light
    var fontFamily: ReaderFont = .original
    var fontSize: Double = 1.0
    var lineHeight: ReaderLineHeight = .normal
    var pageMargins: ReaderMargins = .normal
    var textAlign: ReaderTextAlign = .start

    private static let storageKey = "com.readingsync.reader-preferences"

    init() {
        load()
    }

    var epubPreferences: EPUBPreferences {
        var prefs = EPUBPreferences()
        prefs.theme = theme.readiumTheme
        if theme.readiumTheme == nil {
            prefs.backgroundColor = theme.backgroundColor
            prefs.textColor = theme.textColor
        }
        if fontFamily != .original {
            prefs.fontFamily = fontFamily.readiumFamily
        }
        prefs.fontSize = fontSize
        prefs.lineHeight = lineHeight.value
        prefs.pageMargins = pageMargins.value
        prefs.textAlign = textAlign.readiumAlign
        prefs.publisherStyles = fontFamily == .original
        return prefs
    }

    func save() {
        let data = StoredPreferences(
            theme: theme.rawValue,
            fontFamily: fontFamily.rawValue,
            fontSize: fontSize,
            lineHeight: lineHeight.rawValue,
            pageMargins: pageMargins.rawValue,
            textAlign: textAlign.rawValue
        )
        if let encoded = try? JSONEncoder().encode(data) {
            UserDefaults.standard.set(encoded, forKey: Self.storageKey)
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey),
              let stored = try? JSONDecoder().decode(StoredPreferences.self, from: data)
        else { return }

        theme = ReaderTheme(rawValue: stored.theme) ?? .light
        fontFamily = ReaderFont(rawValue: stored.fontFamily) ?? .original
        fontSize = stored.fontSize
        lineHeight = ReaderLineHeight(rawValue: stored.lineHeight) ?? .normal
        pageMargins = ReaderMargins(rawValue: stored.pageMargins) ?? .normal
        textAlign = ReaderTextAlign(rawValue: stored.textAlign) ?? .start
    }
}

private struct StoredPreferences: Codable {
    var theme: String
    var fontFamily: String
    var fontSize: Double
    var lineHeight: String
    var pageMargins: String
    var textAlign: String
}

// MARK: - Enums

enum ReaderTheme: String, CaseIterable {
    case light, sepia, gray, dark

    var label: String {
        switch self {
        case .light: "White"
        case .sepia: "Sepia"
        case .gray: "Gray"
        case .dark: "Black"
        }
    }

    var readiumTheme: Theme? {
        switch self {
        case .light: .light
        case .sepia: .sepia
        case .dark: .dark
        case .gray: nil
        }
    }

    var backgroundColor: ReadiumNavigator.Color? {
        switch self {
        case .gray: ReadiumNavigator.Color(hex: "#2C2C2E")
        default: nil
        }
    }

    var textColor: ReadiumNavigator.Color? {
        switch self {
        case .gray: ReadiumNavigator.Color(hex: "#E5E5E7")
        default: nil
        }
    }

    var swiftUIBackground: SwiftUI.Color {
        switch self {
        case .light: .white
        case .sepia: SwiftUI.Color(red: 0.98, green: 0.96, blue: 0.91)
        case .gray: SwiftUI.Color(red: 0.17, green: 0.17, blue: 0.18)
        case .dark: .black
        }
    }

    var swiftUIForeground: SwiftUI.Color {
        switch self {
        case .light, .sepia: .primary
        case .gray, .dark: .white
        }
    }

    var isDark: Bool {
        self == .gray || self == .dark
    }
}

enum ReaderFont: String, CaseIterable {
    case original, serif, sansSerif, athelas, iowan, seravek

    var label: String {
        switch self {
        case .original: "Original"
        case .serif: "Serif"
        case .sansSerif: "Sans Serif"
        case .athelas: "Athelas"
        case .iowan: "Iowan"
        case .seravek: "Seravek"
        }
    }

    var readiumFamily: FontFamily? {
        switch self {
        case .original: nil
        case .serif: .serif
        case .sansSerif: .sansSerif
        case .athelas: .athelas
        case .iowan: .iowanOldStyle
        case .seravek: .seravek
        }
    }

    var previewFont: Font {
        switch self {
        case .original: .body
        case .serif: .custom("Georgia", size: 16)
        case .sansSerif: .body
        case .athelas: .custom("Athelas", size: 16)
        case .iowan: .custom("Iowan Old Style", size: 16)
        case .seravek: .custom("Seravek", size: 16)
        }
    }
}

enum ReaderLineHeight: String, CaseIterable {
    case compact, normal, loose

    var label: String {
        switch self {
        case .compact: "Compact"
        case .normal: "Normal"
        case .loose: "Loose"
        }
    }

    var value: Double {
        switch self {
        case .compact: 1.0
        case .normal: 1.4
        case .loose: 1.8
        }
    }

    var icon: String {
        switch self {
        case .compact: "text.line.first.and.arrowtriangle.forward"
        case .normal: "text.alignleft"
        case .loose: "text.justify.leading"
        }
    }
}

enum ReaderMargins: String, CaseIterable {
    case narrow, normal, wide

    var label: String {
        switch self {
        case .narrow: "Narrow"
        case .normal: "Normal"
        case .wide: "Wide"
        }
    }

    var value: Double {
        switch self {
        case .narrow: 0.5
        case .normal: 1.0
        case .wide: 2.0
        }
    }
}

enum ReaderTextAlign: String, CaseIterable {
    case start, justify

    var label: String {
        switch self {
        case .start: "Left"
        case .justify: "Justified"
        }
    }

    var icon: String {
        switch self {
        case .start: "text.alignleft"
        case .justify: "text.justify.leading"
        }
    }

    var readiumAlign: ReadiumNavigator.TextAlignment {
        switch self {
        case .start: .start
        case .justify: .justify
        }
    }
}

// MARK: - Settings Sheet View

struct SettingsSheet: View {
    @Bindable var preferences: ReaderPreferences
    var onPreferencesChanged: () -> Void

    var body: some View {
        NavigationStack {
            List {
                themeSection
                fontSizeSection
                fontFamilySection
                layoutSection
            }
            .navigationTitle("Themes & Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { }
                        .hidden()
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Theme

    @ViewBuilder
    private var themeSection: some View {
        Section("Theme") {
            HStack(spacing: 12) {
                ForEach(ReaderTheme.allCases, id: \.rawValue) { theme in
                    themeButton(theme)
                }
            }
            .listRowBackground(SwiftUI.Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
        }
    }

    @ViewBuilder
    private func themeButton(_ theme: ReaderTheme) -> some View {
        let isSelected = preferences.theme == theme
        Button {
            preferences.theme = theme
            preferences.save()
            onPreferencesChanged()
        } label: {
            VStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(theme.swiftUIBackground)
                    .frame(height: 44)
                    .overlay(
                        Text("Aa")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(theme.swiftUIForeground)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(
                                isSelected ? SwiftUI.Color.accentColor : .secondary.opacity(0.3),
                                lineWidth: isSelected ? 2.5 : 1
                            )
                    )

                Text(theme.label)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? .primary : .secondary)
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Font Size

    @ViewBuilder
    private var fontSizeSection: some View {
        Section("Font Size") {
            HStack(spacing: 16) {
                Button {
                    adjustFontSize(by: -0.1)
                } label: {
                    Text("A")
                        .font(.system(size: 14, weight: .medium))
                        .frame(width: 36, height: 36)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(preferences.fontSize <= 0.5)

                GeometryReader { geo in
                    let fraction = (preferences.fontSize - 0.5) / 2.5
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(.quaternary)
                            .frame(height: 4)

                        Capsule()
                            .fill(SwiftUI.Color.accentColor)
                            .frame(width: max(4, geo.size.width * fraction), height: 4)
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                }

                Button {
                    adjustFontSize(by: 0.1)
                } label: {
                    Text("A")
                        .font(.system(size: 22, weight: .medium))
                        .frame(width: 36, height: 36)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(preferences.fontSize >= 3.0)
            }
            .padding(.vertical, 4)
        }
    }

    private func adjustFontSize(by delta: Double) {
        let newSize = max(0.5, min(3.0, preferences.fontSize + delta))
        let rounded = (newSize * 10).rounded() / 10
        preferences.fontSize = rounded
        preferences.save()
        onPreferencesChanged()
    }

    // MARK: - Font Family

    @ViewBuilder
    private var fontFamilySection: some View {
        Section("Font") {
            ForEach(ReaderFont.allCases, id: \.rawValue) { font in
                let isSelected = preferences.fontFamily == font
                Button {
                    preferences.fontFamily = font
                    preferences.save()
                    onPreferencesChanged()
                } label: {
                    HStack {
                        Text(font.label)
                            .font(font.previewFont)
                            .foregroundStyle(.primary)
                        Spacer()
                        if isSelected {
                            Image(systemName: "checkmark")
                                .foregroundStyle(SwiftUI.Color.accentColor)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Layout

    @ViewBuilder
    private var layoutSection: some View {
        Section("Layout") {
            segmentedRow("Line Height", values: ReaderLineHeight.allCases, selected: preferences.lineHeight) {
                preferences.lineHeight = $0
                preferences.save()
                onPreferencesChanged()
            }

            segmentedRow("Margins", values: ReaderMargins.allCases, selected: preferences.pageMargins) {
                preferences.pageMargins = $0
                preferences.save()
                onPreferencesChanged()
            }

            segmentedRow("Alignment", values: ReaderTextAlign.allCases, selected: preferences.textAlign) {
                preferences.textAlign = $0
                preferences.save()
                onPreferencesChanged()
            }
        }
    }

    @ViewBuilder
    private func segmentedRow<T: RawRepresentable & CaseIterable>(
        _ title: String,
        values: [T],
        selected: T,
        onChange: @escaping (T) -> Void
    ) -> some View where T: Hashable, T.RawValue == String {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 0) {
                ForEach(values, id: \.self) { value in
                    let isSelected = value == selected
                    Button {
                        onChange(value)
                    } label: {
                        Text(labelFor(value))
                            .font(.subheadline)
                            .fontWeight(isSelected ? .semibold : .regular)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(isSelected ? SwiftUI.Color.accentColor.opacity(0.15) : SwiftUI.Color.clear, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
        }
        .padding(.vertical, 2)
    }

    private func labelFor<T>(_ value: T) -> String {
        switch value {
        case let lh as ReaderLineHeight: lh.label
        case let m as ReaderMargins: m.label
        case let ta as ReaderTextAlign: ta.label
        default: ""
        }
    }
}
