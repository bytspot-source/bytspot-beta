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
            XCTAssertEqual(card.statusLabel, "Listed")
            XCTAssertNil(card.actionHex)
            XCTAssertNil(card.primaryActionTitle)
        }
        let party = NativeDiscoverBookablePresentation(offering: offering("book"))
        XCTAssertEqual(party.capability, .details)
        XCTAssertNil(party.primaryActionTitle)
        XCTAssertEqual(party.statusLabel, "Listed")
        XCTAssertEqual(party.ringStyle, .dot)
        XCTAssertNil(party.actionHex)
        XCTAssertFalse(party.availabilityLine.contains("Confirmed"))
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
        XCTAssertEqual(NativeDiscoverBookablePresentation().statusLabel, "Listed")
    }

    func testNamedHTTPSHandoffRemainsNeutralAndExternal() throws {
        let url = try XCTUnwrap(URL(string: "https://tickets.example.com/event/1"))
        let card = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Example Tickets")
        XCTAssertEqual(card.capability, .redirect)
        XCTAssertEqual(card.primaryActionTitle, "Open Example Tickets ↗")
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

final class NativeDiscoverServerRankTests: XCTestCase {
    private let here = NativeLocationCoordinate(latitude: 33.7816, longitude: -84.3831, isFallback: false)

    func testServerOrderLeadsUnseenCardsFollowInLocalOrderAndHiddenCardsGo() {
        let ranking = NativeDiscoverRanking(order: ["c", "a"], hidden: ["b"])
        let ordered = NativeDiscoverBrowsePolicy.ordered(["a", "b", "c", "e", "d"], ranking: ranking, id: { $0 }, localPrecedes: <)
        XCTAssertEqual(ordered, ["c", "a", "d", "e"])
        XCTAssertEqual(NativeDiscoverBrowsePolicy.ordered(["b", "a"], ranking: nil, id: { $0 }, localPrecedes: <), ["a", "b"],
                       "no answer keeps the local order and hides nothing")
    }

    func testCandidateKindAndFactsComeFromTheCard() {
        let facts = NativeDiscoverRankFacts(types: ["cafe"], primaryType: "cafe", priceLevel: "PRICE_LEVEL_INEXPENSIVE", ratingCount: 120, isOpen: true)
        let place = NativeDiscoverBrowsePolicy.rankCandidate(browseID: "reference:place-abc", cardID: "place-abc", isParty: false, isOffering: false,
            rail: "coffee", rating: "4.6", latitude: 33.78, longitude: -84.38, actionable: false, facts: facts)
        XCTAssertEqual(place.kind, .place)
        let row = place.input
        XCTAssertEqual(row["id"] as? String, "reference:place-abc")
        XCTAssertEqual(row["kind"] as? String, "place")
        XCTAssertEqual(row["rail"] as? String, "coffee")
        XCTAssertEqual(row["rating"] as? Double, 4.6)
        XCTAssertEqual(row["types"] as? [String], ["cafe"])
        XCTAssertEqual(row["priceLevel"] as? String, "PRICE_LEVEL_INEXPENSIVE")
        XCTAssertEqual(row["ratingCount"] as? Int, 120)
        XCTAssertEqual(row["isOpen"] as? Bool, true)
        XCTAssertNil(row["actionable"])

        let unrated = NativeDiscoverBrowsePolicy.rankCandidate(browseID: "reference:venue-1", cardID: "venue-1", isParty: false, isOffering: false,
            rail: "dining", rating: "Nearby", latitude: nil, longitude: nil, actionable: false, facts: nil)
        XCTAssertEqual(unrated.kind, .venue)
        XCTAssertNil(unrated.input["rating"], "a label is not a rating")
        XCTAssertNil(unrated.input["lat"])

        let party = NativeDiscoverBrowsePolicy.rankCandidate(browseID: "invitation:p1", cardID: "party-p1", isParty: true, isOffering: false,
            rail: "event", rating: "", latitude: nil, longitude: nil, actionable: true, facts: nil)
        XCTAssertEqual(party.kind, .party)
        XCTAssertEqual(party.input["actionable"] as? Bool, true)
    }

    func testInputCarriesAnswersAndPreferencesAndNeedsARealFix() {
        let candidate = NativeDiscoverRankCandidate(id: "reference:place-a", kind: .place, rail: "dining")
        let filter = NativePreferenceFilter(avoid: ["bars"], priceCeiling: 2)
        let input = NativeDiscoverRankAPI.input(candidates: [candidate], location: here, vibe: "food", walk: "", crew: "date_night", hour: 30, preferences: filter)
        XCTAssertEqual(input?["vibe"] as? String, "food")
        XCTAssertNil(input?["walk"])
        XCTAssertEqual(input?["group"] as? String, "date_night")
        XCTAssertEqual(input?["hour"] as? Int, 23)
        XCTAssertEqual((input?["candidates"] as? [[String: Any]])?.count, 1)
        XCTAssertNotNil(input?["preferences"])
        let fallback = NativeLocationCoordinate(latitude: 33.7816, longitude: -84.3831, isFallback: true)
        XCTAssertNil(NativeDiscoverRankAPI.input(candidates: [candidate], location: fallback, vibe: "", walk: "", crew: "", hour: 12, preferences: .empty))
        XCTAssertNil(NativeDiscoverRankAPI.input(candidates: [], location: here, vibe: "", walk: "", crew: "", hour: 12, preferences: .empty))
    }

    func testDecodesTheServerAnswer() {
        let ranking = NativeDiscoverRanking.decode(from: ["order": ["a", "b"], "hidden": [["id": "c", "hiddenBy": "bars"]]])
        XCTAssertEqual(ranking, NativeDiscoverRanking(order: ["a", "b"], hidden: ["c"]))
        XCTAssertEqual(ranking?.positions["b"], 1)
        XCTAssertNil(NativeDiscoverRanking.decode(from: ["hidden": []]))
    }

    func testGoogleFactsAreDecodedFromNearbySearchRows() {
        let row: [Any] = [["placeId": "abc", "name": "Cafe", "address": "1 Main", "lat": 33.78, "lng": -84.38, "rating": 4.5,
                           "ratingCount": 88, "priceLevel": "PRICE_LEVEL_MODERATE", "types": ["cafe", "coffee_shop"], "primaryType": "cafe", "isOpen": false]]
        let place = row.enumerated().compactMap(NativeLiveDiscoveryAPI.placeResult).first
        XCTAssertEqual(place?.facts, NativeDiscoverRankFacts(types: ["cafe", "coffee_shop"], primaryType: "cafe", priceLevel: "PRICE_LEVEL_MODERATE", ratingCount: 88, isOpen: false))
    }
}
