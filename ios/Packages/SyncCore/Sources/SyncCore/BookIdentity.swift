import Foundation

public enum BookIdentity {
    public static func sanitize(_ raw: String) -> String {
        let pattern = /[^a-z0-9._\-]/
        var result = raw
            .lowercased()
            .replacing(pattern, with: "-")

        while result.contains("--") {
            result = result.replacingOccurrences(of: "--", with: "-")
        }

        result = result.trimmingCharacters(in: CharacterSet(charactersIn: "-"))

        return result.isEmpty ? "unknown" : result
    }
}
