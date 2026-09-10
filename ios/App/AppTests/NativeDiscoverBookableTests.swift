import XCTest
@testable import App

final class NativeDiscoverBookablePolicyTests: XCTestCase {
    private func offering(_ capability: String, kind: NativePlanBookableSelection.SourceKind = .party,
                          sourceID: String = "party-1", category: String = "events") -> NativePlanBookableOffering {
        .init(id: "catalog-1", sourceKind: kind, sourceId: sourceID, category: category,
              title: "Premium Live Confirmed", subtitle: nil, capability: capability)
    }

    func testCapabilityIsSupplyDrivenNotCategoryOrMarketing() {
        for category in NativeDiscoverBookablePresentation.railTokens {
            let card = NativeDiscoverBookablePresentation(offering: offering("details", category: category))
            XCTAssertEqual(card.capability, .details)
            XCTAssertEqual(card.statusLabel, "Reference")
            XCTAssertNil(card.actionHex)
            XCTAssertNil(card.primaryActionTitle)
        }
        let book = NativeDiscoverBookablePresentation(offering: offering("book"))
        XCTAssertEqual(book.capability, .book)
        XCTAssertEqual(book.primaryActionTitle, "Book")
        XCTAssertEqual(book.statusLabel, "Bookable")
        XCTAssertEqual(book.ringStyle, .solid)
        XCTAssertEqual(book.actionHex, 0x00BFFF)
        XCTAssertFalse(book.availabilityLine.contains("Confirmed"))
        let coffee = NativeDiscoverBookablePresentation(offering: offering("request", kind: .coffeeSpot))
        XCTAssertEqual(coffee.capability, .request)
        XCTAssertEqual(coffee.ringStyle, .dashed)
        XCTAssertEqual(coffee.primaryActionTitle, "Request")
        XCTAssertEqual(coffee.availabilityLine, "Subject to host acceptance")
    }

    func testInvalidOrUnsupportedSupplyFailsClosed() {
        for capability in ["", "BOOK", "unknown", "redirect"] {
            XCTAssertEqual(NativeDiscoverBookablePresentation(offering: offering(capability)).capability, .details)
        }
        XCTAssertEqual(NativeDiscoverBookablePresentation(offering: offering("book", kind: .coffeeSpot)).capability, .details)
        for id in ["", " ", "a/b", "a?b", "a\nb"] {
            XCTAssertEqual(NativeDiscoverBookablePresentation(offering: offering("book", sourceID: id)).capability, .details)
        }
        XCTAssertEqual(NativeDiscoverBookablePresentation().statusLabel, "Reference")
    }

    func testNamedHTTPSHandoffRemainsNeutralAndExternal() throws {
        let url = try XCTUnwrap(URL(string: "https://tickets.example.com/event/1"))
        let card = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Example Tickets")
        XCTAssertEqual(card.capability, .redirect)
        XCTAssertEqual(card.primaryActionTitle, "Book on Example Tickets ↗")
        XCTAssertEqual(card.externalURL, url)
        XCTAssertEqual(card.statusLabel, "External")
        XCTAssertEqual(card.ringStyle, .dot)
        XCTAssertNil(card.actionHex)
    }

    func testUnsafeOrUnnamedHandoffsDoNotEarnAnAction() throws {
        for value in ["http://example.com", "javascript:alert(1)", "https://localhost", "https://example.com:8080"] {
            let url = try XCTUnwrap(URL(string: value))
            let card = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Provider")
            XCTAssertEqual(card.capability, .details)
            XCTAssertNil(card.externalURL)
            XCTAssertNil(card.primaryActionTitle)
        }
        let url = try XCTUnwrap(URL(string: "https://example.com"))
        for provider in ["", " ", "Provider\nBook"] {
            XCTAssertEqual(NativeDiscoverBookablePresentation(externalURL: url, externalProvider: provider).capability, .details)
        }
    }

    func testM6SurfaceStaysAchromaticAndDark() {
        let hex = NativeDiscoverBookablePresentation.surfaceHex
        XCTAssertEqual((hex >> 16) & 255, (hex >> 8) & 255)
        XCTAssertEqual((hex >> 8) & 255, hex & 255)
        XCTAssertLessThan(hex & 255, 32)
    }
}
