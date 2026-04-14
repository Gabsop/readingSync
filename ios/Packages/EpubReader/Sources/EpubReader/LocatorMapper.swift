import Foundation
import ReadiumShared

struct CFIPosition: Codable, Sendable {
    let href: String
    let type: String
    let cfi: String?
    let progression: Double?
    let totalProgression: Double?
}

enum LocatorMapper {
    static func toCFIString(_ locator: Locator) -> String? {
        let cfi = locator.locations.fragments.first { $0.hasPrefix("epubcfi(") }
        let position = CFIPosition(
            href: locator.href.string,
            type: locator.mediaType.string,
            cfi: cfi,
            progression: locator.locations.progression,
            totalProgression: locator.locations.totalProgression
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let data = try? encoder.encode(position) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func toLocator(_ positionString: String) -> Locator? {
        guard let data = positionString.data(using: .utf8) else { return nil }

        if let cfiPosition = try? JSONDecoder().decode(CFIPosition.self, from: data),
           let mediaType = MediaType(cfiPosition.type),
           let url = AnyURL(string: cfiPosition.href) {
            var fragments: [String] = []
            if let cfi = cfiPosition.cfi {
                fragments.append(cfi)
            }
            return Locator(
                href: url,
                mediaType: mediaType,
                locations: .init(
                    fragments: fragments,
                    progression: cfiPosition.progression,
                    totalProgression: cfiPosition.totalProgression
                )
            )
        }

        // Fallback: full Readium Locator JSON (backward compat)
        return try? Locator(jsonString: positionString)
    }
}
