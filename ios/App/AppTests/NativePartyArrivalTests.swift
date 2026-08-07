import XCTest
@testable import App

final class NativePartyArrivalTests: XCTestCase {
    private func context(provider: String = "apple-maps", latitude: Double = 33.749, longitude: Double = -84.388) -> NativePartyArrivalContext {
        NativePartyArrivalContext(
            partyId: "party-1",
            destination: .init(venueId: "venue-1", name: "The Loft", address: "100 Peachtree St", latitude: latitude, longitude: longitude),
            map: .init(provider: provider, directionsUrl: "http://maps.apple.com/?daddr=33.749,-84.388")
        )
    }

    func testAppleMapsItemUsesTheVerifiedDestinationCoordinates() throws {
        let item = try XCTUnwrap(context().appleMapsItem)

        XCTAssertEqual(item.name, "The Loft")
        XCTAssertEqual(item.placemark.coordinate.latitude, 33.749, accuracy: 0.000_001)
        XCTAssertEqual(item.placemark.coordinate.longitude, -84.388, accuracy: 0.000_001)
    }

    func testAppleMapsItemFailsClosedForAnotherProviderOrInvalidCoordinates() {
        XCTAssertNil(context(provider: "unconfigured").appleMapsItem)
        XCTAssertNil(context(latitude: 91).appleMapsItem)
        XCTAssertNil(context(longitude: -181).appleMapsItem)
    }
}