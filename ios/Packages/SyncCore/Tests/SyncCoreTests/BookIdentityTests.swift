import Testing
@testable import SyncCore

@Suite("BookIdentity sanitization")
struct BookIdentityTests {
    @Test("lowercases input")
    func lowercases() {
        #expect(BookIdentity.sanitize("MyBook") == "mybook")
    }

    @Test("replaces invalid chars with dash")
    func replacesInvalid() {
        #expect(BookIdentity.sanitize("My Book (2024)") == "my-book-2024")
    }

    @Test("collapses consecutive dashes")
    func collapsesDashes() {
        #expect(BookIdentity.sanitize("a---b") == "a-b")
    }

    @Test("trims leading and trailing dashes")
    func trimsDashes() {
        #expect(BookIdentity.sanitize("-hello-") == "hello")
    }

    @Test("preserves dots and dashes")
    func preservesValid() {
        #expect(BookIdentity.sanitize("book.v2-final") == "book.v2-final")
    }

    @Test("returns unknown for empty input")
    func emptyInput() {
        #expect(BookIdentity.sanitize("") == "unknown")
        #expect(BookIdentity.sanitize("---") == "unknown")
    }

    @Test("handles ISBN-like identifier")
    func isbn() {
        #expect(BookIdentity.sanitize("978-0-13-468599-1") == "978-0-13-468599-1")
    }
}
