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

    private static let catalog = NativePartyArrivalAPI.allRegisteredVenues(from: ["venues": [
        ["id": "pcm", "name": "Ponce City Market", "address": "675 Ponce De Leon Ave NE"],
        ["id": "piedmont", "name": "Piedmont Park", "address": "400 Park Dr NE"],
        ["id": "krog", "name": "Krog Street Market", "address": "99 Krog St NE"],
        ["id": "mbar", "name": "MBar", "address": "1199 Peachtree St NE"],
    ]])

    private func suggestions(_ typed: String) -> [String] {
        NativePartyArrivalAPI.suggestedRegisteredVenues(Self.catalog, matching: typed).map(\.id)
    }

    func testSuggestionsSurfaceTheRegisteredSpellingAHostWasReachingFor() {
        XCTAssertEqual(suggestions("ponce"), ["pcm"])
        XCTAssertEqual(suggestions("  PONCE city  "), ["pcm"])
        // A word the host typed out of order still finds the venue they meant,
        // first — even though "market" also drags in the other market.
        XCTAssertEqual(suggestions("ponce market"), ["pcm", "krog"])
        // Shared words rank together; the tighter name is offered first.
        XCTAssertEqual(suggestions("market"), ["pcm", "krog"])
    }

    func testSuggestionsStayQuietWhenTheyHaveNothingToCorrect() {
        // An exact registered name is already bindable; there is nothing to fix.
        XCTAssertEqual(suggestions("Ponce City Market"), [])
        XCTAssertEqual(suggestions("  ponce   city   market "), [])
        // A secret location must not be nudged toward a registered venue.
        XCTAssertEqual(suggestions("Boss down Atl"), [])
        XCTAssertEqual(suggestions(""), [])
        XCTAssertEqual(suggestions("m"), [])
        XCTAssertEqual(suggestions("a"), [])
    }

    func testSuggestionsAreCappedAndNeverBindOnTheirOwn() {
        XCTAssertEqual(suggestions("ma"), ["pcm", "krog"])
        XCTAssertEqual(NativePartyArrivalAPI.suggestedRegisteredVenues(Self.catalog, matching: "ma", limit: 1).map(\.id), ["pcm"])
        // Suggesting is looser than binding: a partial name that suggests must
        // still fail the exact-match rule that actually attaches an address.
        let payload: [String: Any] = ["venues": [["id": "pcm", "name": "Ponce City Market", "address": "675 Ponce De Leon Ave NE"]]]
        XCTAssertEqual(suggestions("ponce"), ["pcm"])
        XCTAssertEqual(NativePartyArrivalAPI.registeredVenueCandidates(from: payload, named: "ponce").map(\.id), [])
        XCTAssertEqual(NativePartyArrivalAPI.registeredVenueCandidates(from: payload, named: "Ponce City Market").map(\.id), ["pcm"])
    }

    func testBindPlaceResponseParsesTheServerBoundVenue() {
        let payload: [String: Any] = ["partyId": "party-1", "venue": ["id": "venue-9", "name": "  Rooftop ", "address": " 9 Sky Ave "]]
        let venue = NativePartyArrivalAPI.venue(fromBindPayload: payload)
        XCTAssertEqual(venue, NativePartyArrivalVenue(id: "venue-9", name: "Rooftop", address: "9 Sky Ave"))
        // A venue with no address still binds; the label falls back rather than
        // showing an empty line.
        XCTAssertEqual(NativePartyArrivalAPI.venue(fromBindPayload: ["venue": ["id": "v", "name": "Spot"]])?.address, "Arrival destination")
        // Malformed responses never yield a phantom binding.
        XCTAssertNil(NativePartyArrivalAPI.venue(fromBindPayload: ["venue": ["name": "No Id"]]))
        XCTAssertNil(NativePartyArrivalAPI.venue(fromBindPayload: ["error": "nope"]))
    }

    func testOnlyGoogleBackedSearchRowsAreOfferedForBinding() {
        func place(_ id: String, provider: String) -> NativePlaceSearchResult {
            NativePlaceSearchResult(id: id, name: "Spot", address: "1 Way", category: "venue", latitude: 33.7, longitude: -84.3, rating: nil, photoUrl: nil, provider: provider)
        }
        let rows = [
            place("ChIJreal", provider: "google_places"),   // bindable
            place("place-3", provider: "google_places"),    // index fallback, no real id
            place("apple-rooftop", provider: "apple_maps"), // Apple id, unresolvable
            place("ChIJother", provider: "apple_maps"),     // non-Google provider
            place("  ", provider: "google_places"),          // empty id
        ]
        XCTAssertEqual(NativePartyArrivalAPI.bindablePlaceResults(rows).map(\.id), ["ChIJreal"])
    }
}