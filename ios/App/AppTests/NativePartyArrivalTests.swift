import XCTest
@testable import App

final class NativePartyArrivalTests: XCTestCase {
    private func context(provider: String = "apple-maps", latitude: Double = 33.749, longitude: Double = -84.388) -> NativePartyArrivalContext {
        NativePartyArrivalContext(
            partyId: "party-1",
            destination: .init(venueId: "venue-1", name: "Sample Venue", address: "1 Example Way", latitude: latitude, longitude: longitude),
            map: .init(provider: provider, directionsUrl: "http://maps.apple.com/?daddr=33.749,-84.388")
        )
    }

    func testAppleMapsItemUsesTheAuthorizedDestinationCoordinates() throws {
        let item = try XCTUnwrap(context().appleMapsItem)

        XCTAssertEqual(item.name, "Sample Venue")
        XCTAssertEqual(item.placemark.coordinate.latitude, 33.749, accuracy: 0.000_001)
        XCTAssertEqual(item.placemark.coordinate.longitude, -84.388, accuracy: 0.000_001)
    }

    func testAppleMapsItemFailsClosedForAnotherProviderOrInvalidCoordinates() {
        XCTAssertNil(context(provider: "unconfigured").appleMapsItem)
        XCTAssertNil(context(latitude: 91).appleMapsItem)
        XCTAssertNil(context(longitude: -181).appleMapsItem)
    }

    func testVenueCandidateListRequiresAnExactRegisteredVenueNameMatch() {
        let payload: [String: Any] = ["venues": [
            ["id": "match", "name": "Sample Venue", "address": "1 Example Way"],
            ["id": "wrong-name", "name": "Other Venue", "address": "1 Example Way"],
        ]]

        XCTAssertEqual(NativePartyArrivalAPI.registeredVenueCandidates(from: payload, named: " Sample   Venue ").map(\.id), ["match"])
    }
}