import XCTest
import Combine
import CoreLocation
import UIKit
@testable import App

/// Release A tests live in an existing compiled XCTest file; no project membership changes.
@MainActor
final class NativeConciergeDiscoveryTests: XCTestCase {
    private let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)

    private func card(_ changes: [String: Any] = [:]) -> [String: Any] {
        var value: [String: Any] = [
            "id": "gp:place-one", "kind": "place", "placeId": "ChIJ-place-one",
            "name": "Neighborhood Coffee", "address": "1 Main Street", "lat": 47.61, "lng": -122.33,
            "category": "coffee", "rating": 4.5, "isOpen": NSNull(), "photoUrl": NSNull(),
            "crowd": NSNull(), "reasons": ["Matches coffee"], "capability": "details", "source": "google", "rail": "eat_drink"
        ]
        value.merge(changes) { _, new in new }
        return value
    }

    private func response(cards: [[String: Any]]? = nil, changes: [String: Any] = [:]) -> [String: Any] {
        var value: [String: Any] = ["version": 1, "reply": "Here is a nearby option.", "status": "ready",
                                    "cards": cards ?? [card()], "refinements": ["Find dinner instead"]]
        value.merge(changes) { _, new in new }
        return value
    }

    private func decode(_ value: [String: Any], decoder: JSONDecoder = JSONDecoder()) throws -> NativeConciergeResponse {
        try decoder.decode(NativeConciergeResponse.self, from: JSONSerialization.data(withJSONObject: value))
    }

    private let menuAPIBase = URL(string: "https://menu-api.example:8443")!

    private func menuEvidence(_ changes: [String: Any] = [:]) -> [String: Any] {
        var value: [String: Any] = [
            "dishId": "dish_Ab-123", "revision": "1790856000000",
            "dishName": "Jollof rice", "source": "vendor_menu", "mediaId": "menu_Ab-123",
            "sourceUrl": "https://menu-api.example:8443/media/menu-evidence/dish_Ab-123/1790856000000",
            "reviewedAt": "2026-10-01T12:00:00.000Z", "retrievedAt": "2026-10-02T12:00:00Z",
            "expiresAt": "2026-10-31T12:00:00Z"
        ]
        value.merge(changes) { _, new in new }
        return value
    }

    private func decodeMenuCard(_ evidence: Any, changes: [String: Any] = [:], base: URL? = nil) throws -> NativeConciergeCard {
        var fields: [String: Any] = ["kind": "venue", "id": "canonical-venue", "source": "bytspot"]
        fields.merge(changes) { _, new in new }
        fields["menuEvidence"] = evidence
        let api = NativeConciergeAPI(client: BytspotAPIClient(baseURL: base ?? menuAPIBase))
        let decoded = try api.decodeResponse(JSONSerialization.data(withJSONObject: response(cards: [card(fields)])))
        guard let first = decoded.cards.first else { throw BytspotAPIClient.APIError.invalidResponse }
        return first
    }

    private func identification(_ value: [String: Any]) throws -> NativeDishIdentification {
        try JSONDecoder().decode(NativeDishIdentification.self, from: JSONSerialization.data(withJSONObject: value))
    }

    private let opentableAction: [String: Any] = ["type": "book_table", "provider": "opentable", "label": "OpenTable",
                                                  "url": "https://www.opentable.com/r/neighborhood-coffee"]

    func testCardActionsDecodeOnlySupportedServerFacts() throws {
        let actions: [[String: Any]] = [["type": "directions"], ["type": "website"], opentableAction, ["type": "add_to_plan"], ["type": "save"]]
        let full = try decode(response(cards: [card(["websiteUrl": "https://coffee.example.com", "actions": actions])]))
        XCTAssertEqual(full.cards[0].actions, [.directions, .website,
            .bookTable(url: URL(string: "https://www.opentable.com/r/neighborhood-coffee")!, label: "OpenTable"), .addToPlan, .save])
        XCTAssertEqual(try decode(response(cards: [card(["actions": [["type": "add_to_plan", "planId": "plan-1"], ["type": "save"]]])])).cards[0].actions, [.save])
        let dropped: [[[String: Any]]] = [
            [["type": "pay"], ["type": "website"], ["type": "directions", "url": "https://evil.example.com"], ["type": "save"]],
            [opentableAction.merging(["url": "https://evil.example.com/r"]) { _, new in new }, ["type": "save"]],
            [opentableAction.merging(["label": "Resy"]) { _, new in new }, ["type": "save"]],
            [opentableAction.merging(["url": "http://www.opentable.com/r"]) { _, new in new }, ["type": "save"], ["type": "save"]]
        ]
        for actions in dropped {
            XCTAssertEqual(try decode(response(cards: [card(["actions": actions])])).cards[0].actions, [.save])
        }
        XCTAssertEqual(try decode(response(cards: [card(["placeId": NSNull(), "kind": "venue", "id": "venue-one", "source": "bytspot",
                                                        "actions": [opentableAction]])])).cards[0].actions, [])
        XCTAssertThrowsError(try decode(response(cards: [card(["actions": Array(repeating: ["type": "save"], count: 6)])])))
        XCTAssertEqual(try decode(response(cards: [card(["websiteUrl": "https://coffee.example.com"])])).cards[0].actions,
                       [.directions, .website, .save])
    }

    func testProposalMustNameAShownCardAction() throws {
        let shown = card(["actions": [["type": "directions"], ["type": "save"]]])
        let valid = try decode(response(cards: [shown], changes: ["proposal": ["type": "directions", "cardId": "gp:place-one"]]))
        XCTAssertEqual(valid.proposedAction?.card.id, "gp:place-one")
        XCTAssertEqual(valid.proposedAction?.action, .directions)
        let rejected: [Any] = [["type": "website", "cardId": "gp:place-one"], ["type": "directions", "cardId": "gp:other"],
                               ["type": "pay", "cardId": "gp:place-one"], ["type": "directions", "cardId": "gp:place-one", "auto": "true"],
                               ["type": 1], NSNull()]
        for proposal in rejected {
            XCTAssertNil(try decode(response(cards: [shown], changes: ["proposal": proposal])).proposedAction)
        }
        XCTAssertNil(try decode(response(cards: [shown])).proposal)
    }

    func testApprovalTextNamesThePlaceAndNeverClaimsABooking() throws {
        let coffee = try decode(response(cards: [card(["websiteUrl": "https://coffee.example.com"])])).cards[0]
        let booking = NativeConciergeAction.bookTable(url: URL(string: "https://resy.com/cities/x")!, label: "Resy")
        XCTAssertEqual(NativeConciergeActionPresentation.approveTitle(.directions, isSaved: false), "Open Apple Maps")
        XCTAssertEqual(NativeConciergeActionPresentation.approvalTitle(booking, card: coffee, isSaved: false), "Open Resy for Neighborhood Coffee?")
        XCTAssertTrue(NativeConciergeActionPresentation.approvalMessage(booking, card: coffee, isSaved: false)
            .contains("Bytspot does not make or confirm the booking."))
        XCTAssertTrue(NativeConciergeActionPresentation.approvalMessage(.website, card: coffee, isSaved: false).contains("coffee.example.com"))
        XCTAssertEqual(NativeConciergeActionPresentation.buttonTitle(.save, card: coffee, isSaved: true), "Saved")
        XCTAssertEqual(NativeConciergeActionPresentation.approveTitle(.save, isSaved: true), "Remove")
        XCTAssertEqual(NativeConciergeActionPresentation.approveTitle(.addToPlan, isSaved: false), "Choose a Plan")
        XCTAssertTrue(NativeConciergeActionPresentation.approvalMessage(.addToPlan, card: coffee, isSaved: false).contains("added as a reference, not a booking"))
        for action in [NativeConciergeAction.directions, .website, booking, .addToPlan, .save] {
            for saved in [false, true] {
                let text = NativeConciergeActionPresentation.approvalTitle(action, card: coffee, isSaved: saved) + " "
                    + NativeConciergeActionPresentation.approvalMessage(action, card: coffee, isSaved: saved)
                XCTAssertTrue(text.contains("Neighborhood Coffee"), text)
                XCTAssertNil(text.range(of: #"\b(booked|confirmed|ordered|paid|reserved)\b"#, options: [.regularExpression, .caseInsensitive]), text)
            }
        }
    }

    private func plan(items: [[String: Any]]) throws -> NativePlan {
        let value: [String: Any] = [
            "id": "plan-1", "title": "Friday night", "intent": "Out", "creatorUserId": "member-1", "startsAt": NSNull(),
            "endsAt": NSNull(), "areaLabel": NSNull(), "partySize": NSNull(), "needs": ["dining"], "lifecycle": "proposed",
            "state": "proposed", "readiness": ["going": 1, "maybe": 0, "pending": 0, "declined": 0, "total": 1],
            "openNeeds": [], "participants": [], "items": items, "joinToken": NSNull()
        ]
        return try JSONDecoder().decode(NativePlan.self, from: JSONSerialization.data(withJSONObject: value))
    }

    private func planItem(_ id: String, title: String, placeId: Any = NSNull(), status: String = "available",
                          destination: Any = NSNull()) -> [String: Any] {
        ["id": id, "needKind": "dining", "title": title, "partyId": NSNull(), "coffeeReservationId": NSNull(),
         "capability": "details", "status": status, "reservation": NSNull(), "placeId": placeId, "destination": destination]
    }

    func testArrivalUsesThePlanStopAndLeavesFromTheStopBeforeIt() throws {
        let coffee = try decode(response()).cards[0]
        let fallback = NativeConciergeArrival.make(planID: "plan-1", plan: nil, card: coffee, accountID: "member-1")
        XCTAssertEqual(fallback.stop, NativePlan.Destination(name: "Neighborhood Coffee", address: "1 Main Street", lat: 47.61, lng: -122.33))
        XCTAssertNil(fallback.origin)
        XCTAssertEqual(fallback.addedMessage, "Added Neighborhood Coffee to your Plan as a reference. Nothing is booked.")

        let dinner: [String: Any] = ["name": "Dinner Spot", "address": NSNull(), "lat": 47.6, "lng": -122.3]
        let server: [String: Any] = ["name": "Neighborhood Coffee (Google)", "address": "1 Main St", "lat": 47.611, "lng": -122.331]
        let full = try plan(items: [
            planItem("a", title: "Dinner", destination: dinner),
            planItem("b", title: "Old copy", placeId: "ChIJ-place-one", status: "cancelled"),
            planItem("c", title: "Neighborhood Coffee", placeId: "ChIJ-place-one", destination: server),
        ])
        let arrival = NativeConciergeArrival.make(planID: "plan-1", plan: full, card: coffee, accountID: "member-1")
        XCTAssertEqual(arrival.stop.name, "Neighborhood Coffee (Google)")
        XCTAssertEqual(arrival.origin?.name, "Dinner Spot")
        XCTAssertEqual(arrival.addedMessage, "Added Neighborhood Coffee (Google) to “Friday night” as a reference. Nothing is booked.")
        let other = try plan(items: [planItem("x", title: "Neighborhood Coffee", placeId: "ChIJ-other", destination: server)])
        XCTAssertEqual(NativeConciergeArrival.make(planID: "plan-1", plan: other, card: coffee, accountID: "member-1").stop, fallback.stop)

        let steps = NativeConciergeArrivalStep.steps(for: arrival)
        XCTAssertEqual(steps.map(\.buttonTitle), ["Directions", "Uber", "Lyft"])
        for step in steps {
            XCTAssertTrue(step.title.contains("Neighborhood Coffee (Google)"), step.title)
            XCTAssertNil(step.message.range(of: #"\b(booked|confirmed|ordered|paid|reserved)\b"#, options: [.regularExpression, .caseInsensitive]), step.message)
        }
        let uber = try XCTUnwrap(steps.first { $0.kind == .ride(.uber) })
        XCTAssertTrue(uber.message.contains("leaving from Dinner Spot"))
        XCTAssertTrue(uber.message.contains("Bytspot does not book the ride."))
        XCTAssertEqual(uber.rideURL?.host, "m.uber.com")
        XCTAssertTrue(NativeConciergeArrivalStep(kind: .ride(.lyft), arrival: fallback).message.contains("leaving from your location"))
        XCTAssertNil(steps[0].rideURL)
    }

    func testSignedOutModelCannotQueueOrApproveAnAction() throws {
        let model = NativeConciergeModel()
        let coffee = try decode(response(cards: [card(["actions": [["type": "add_to_plan"]]])])).cards[0]
        model.requestAction(.addToPlan, on: coffee)
        XCTAssertNil(model.planSelection)
        model.planAdded(planID: "plan-1", selectionID: UUID())
        XCTAssertNil(model.arrival)
        let arrival = NativeConciergeArrival.make(planID: "plan-1", plan: nil, card: coffee, accountID: "someone")
        let step = NativeConciergeArrivalStep(kind: .directions, arrival: arrival)
        model.requestArrival(step)
        XCTAssertNil(model.pendingArrival)
        XCTAssertNil(model.approveArrival(step))
        model.requestAction(.directions, on: coffee)
        XCTAssertNil(model.pendingAction)
        XCTAssertNil(model.proposal)
        let forged = NativeConciergePendingAction(card: coffee, action: .save, accountID: "someone", fromProposal: false, isSaved: false)
        XCTAssertNil(model.approve(forged))
        XCTAssertEqual(model.actionNotice, "This action is no longer available. Search again.")
        XCTAssertFalse(NativeVenueSavedState.contains(venueID: coffee.venueSummary.id, userID: "someone"))
    }

    func testDishIdentificationDecodesOnlyValidatedShapes() throws {
        let valid: [String: Any] = ["version": 1, "status": "identified", "reply": "This looks like the dish below.",
            "candidates": [["name": "Jollof rice", "confidence": "high"], ["name": "Fried rice", "confidence": "medium"]]]
        XCTAssertEqual(try identification(valid).candidates.map(\.name), ["Jollof rice", "Fried rice"])
        XCTAssertEqual(try identification(["version": 1, "status": "uncertain", "reply": "Not sure.", "candidates": []]).candidates, [])
        XCTAssertEqual(try identification(["version": 1, "status": "not_food", "reply": "No food.", "candidates": []]).status, .notFood)
        let invalidChanges: [[String: Any]] = [
            ["version": 2], ["status": "booked"], ["status": "not_food"], ["status": "unavailable"], ["status": "invalid_photo"],
            ["candidates": [["name": "Rice", "confidence": "medium"]]],
            ["candidates": [["name": "Rice", "confidence": "high"], ["name": "rice", "confidence": "low"]]],
            ["candidates": [["name": "https://evil.test", "confidence": "high"]]],
            ["candidates": [["name": " Rice", "confidence": "high"]]],
            ["candidates": [["name": "Rice\nnow", "confidence": "high"]]],
            ["candidates": [["name": String(repeating: "a", count: 61), "confidence": "high"]]],
            ["candidates": (1...4).map { ["name": "Dish \($0)", "confidence": "high"] }],
            ["candidates": [["name": "Rice", "confidence": "certain"]]],
            ["reply": " "], ["reply": String(repeating: "a", count: 301)]
        ]
        for change in invalidChanges {
            XCTAssertThrowsError(try identification(valid.merging(change) { _, new in new }), "\(change.keys.sorted())")
        }
    }

    func testDishPhotoRequestRequiresSignInAndSendsOnlyAJPEGDataURI() throws {
        let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9])
        XCTAssertThrowsError(try NativeConciergeAPI(client: BytspotAPIClient(baseURL: menuAPIBase, tokenProvider: { nil }))
            .makeIdentifyDishRequest(jpeg: jpeg))
        XCTAssertThrowsError(try NativeConciergeAPI(client: BytspotAPIClient(baseURL: menuAPIBase, tokenProvider: { "guest_session" }))
            .makeIdentifyDishRequest(jpeg: jpeg))
        let api = NativeConciergeAPI(client: BytspotAPIClient(baseURL: menuAPIBase, tokenProvider: { "member-test-token" }))
        let request = try api.makeIdentifyDishRequest(jpeg: jpeg)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/trpc/concierge.identifyDish")
        XCTAssertEqual(request.timeoutInterval, 20)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String])
        XCTAssertEqual(Array(body.keys), ["image"])
        XCTAssertEqual(body["image"], "data:image/jpeg;base64," + jpeg.base64EncodedString())
        XCTAssertThrowsError(try api.makeIdentifyDishRequest(jpeg: Data([0x89, 0x50, 0x4E, 0x47])))
        XCTAssertThrowsError(try api.makeIdentifyDishRequest(jpeg: Data([0xFF, 0xD8, 0xFF]) + Data(count: NativeDishPhotoContract.maximumBytes)))
    }

    func testDishPhotoPreparerResizesAndBoundsTheUpload() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let large = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000), format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
        }
        let prepared = try XCTUnwrap(NativeDishPhotoPreparer.prepare(large))
        XCTAssertEqual(prepared.preview.size, CGSize(width: 1024, height: 683))
        XCTAssertLessThanOrEqual(prepared.jpeg.count, NativeDishPhotoContract.maximumBytes)
        XCTAssertTrue(prepared.jpeg.starts(with: [0xFF, 0xD8, 0xFF]))
        XCTAssertNoThrow(try NativeDishPhotoContract.requestBody(jpeg: prepared.jpeg))
        XCTAssertNil(NativeDishPhotoPreparer.prepare(UIImage()))
    }

    func testSignedOutPhotoIsNotKeptOrSent() {
        let model = NativeConciergeModel()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { _ in }
        model.attachPhoto(image)
        XCTAssertNil(model.photoPreview)
        XCTAssertFalse(model.isIdentifying)
        XCTAssertEqual(model.photoNotice, "Sign in to search with a photo.")
        model.removePhoto()
        XCTAssertNil(model.photoNotice)
    }

    func testMenuEvidenceIsAdditiveAndBindsCanonicalRevisionToRequestingAPI() throws {
        let legacy = try XCTUnwrap(decode(response()).cards.first)
        XCTAssertTrue(legacy.menuEvidence.isEmpty)
        XCTAssertEqual(try decode(response()).version, 1)
        XCTAssertTrue(try decodeMenuCard([]).menuEvidence.isEmpty)
        let decoded = try decodeMenuCard([menuEvidence()])
        let evidence = try XCTUnwrap(decoded.menuEvidence.first)
        XCTAssertEqual(evidence.dishId, "dish_Ab-123")
        XCTAssertEqual(evidence.revision, "1790856000000")
        XCTAssertEqual(evidence.dishName, "Jollof rice")
        XCTAssertEqual(evidence.source, "vendor_menu")
        XCTAssertEqual(evidence.mediaId, "menu_Ab-123")
        XCTAssertEqual(evidence.sourceUrl.absoluteString, "https://menu-api.example:8443/media/menu-evidence/dish_Ab-123/1790856000000")
        XCTAssertEqual(decoded.currentMenuEvidence(at: evidence.retrievedAt), [evidence])
        let three = (1...3).map { index in
            menuEvidence(["dishId": "dish-\(index)",
                "sourceUrl": "https://menu-api.example:8443/media/menu-evidence/dish-\(index)/1790856000000"])
        }
        XCTAssertEqual(try decodeMenuCard(three).menuEvidence.count, 3)
        XCTAssertThrowsError(try decodeMenuCard(three + [menuEvidence()]))
        // Legacy provider cards cannot acquire canonical menu evidence.
        XCTAssertThrowsError(try decode(response(cards: [card(["menuEvidence": [menuEvidence()]])])))
    }

    func testMenuEvidenceRejectsUnsafeOrUnboundSourceURLs() throws {
        let origin = "https://menu-api.example:8443"
        let path = "/media/menu-evidence/dish_Ab-123/1790856000000"
        let invalid = [
            "https://foreign.example" + path, "https://menu-api.example.evil:8443" + path,
            "https://menu-api.example" + path, "http://menu-api.example:8443" + path,
            origin + "/other/menu_Ab-123", origin + "/media/vendor/menu_Ab-123", origin + path + "/",
            origin + "/media/menu-evidence/dish_Ab-123/1790856000001",
            origin + "/media/menu-evidence/other/1790856000000",
            origin + "/media/menu-evidence/dish_Ab-123/01790856000000",
            "HTTPS://menu-api.example:8443" + path, "https://MENU-API.example:8443" + path,
            origin + path + "?download=1", origin + path + "?", origin + path + "#menu", origin + path + "#",
            "https://reader@menu-api.example:8443" + path,
            "https://@menu-api.example:8443" + path,
            "https://reader:unused@menu-api.example:8443" + path,
            origin + "/media/menu-evidence/%64ish_Ab-123/1790856000000",
            origin + "/media/menu-evidence/extra/../dish_Ab-123/1790856000000",
            origin + path + "%2F", origin + "/media/menu-evidence/dish_Ab-123/%31790856000000",
            "//menu-api.example:8443" + path, path, " " + origin + path,
            origin + "\\media\\vendor\\menu_Ab-123", "javascript:alert(1)"
        ]
        for raw in invalid {
            XCTAssertThrowsError(try decodeMenuCard([menuEvidence(["sourceUrl": raw])]), raw)
        }
        for field in ["dishId", "mediaId"] {
            for id in ["", "../menu_Ab-123", "menu/Ab-123", "menu.Ab-123", "mé nu", "menu\n", String(repeating: "a", count: 65)] {
                XCTAssertThrowsError(try decodeMenuCard([menuEvidence([field: id])]), field)
            }
        }
        // mediaId identifies the file but is not the revision-bound route's identity.
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence(["mediaId": "other"])]))
        for revision in ["", "0", "01", "-1", "+1", "1.0", "1e12", " 1", "1\n", "١"] {
            let raw = origin + "/media/menu-evidence/dish_Ab-123/" + revision
            XCTAssertThrowsError(try decodeMenuCard([menuEvidence(["revision": revision, "sourceUrl": raw])]))
        }
        let maxID = String(repeating: "a", count: 64)
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence(["dishId": maxID, "mediaId": maxID,
            "sourceUrl": origin + "/media/menu-evidence/" + maxID + "/1790856000000"])]))
        let localhost = URL(string: "http://localhost:3000")!
        let local = menuEvidence(["sourceUrl": "http://localhost:3000" + path])
        XCTAssertEqual(try decodeMenuCard([local], base: localhost).menuEvidence.first?.sourceUrl.absoluteString,
                       "http://localhost:3000" + path)
        XCTAssertThrowsError(try decodeMenuCard([local]))
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence(["sourceUrl": "http://foreign.example" + path])],
            base: URL(string: "http://foreign.example")!))
        let standard = BytspotAPIClient(baseURL: URL(string: "https://menu-api.example")!)
        XCTAssertNil(standard.conciergeMenuURL("https://menu-api.example:443" + path, dishID: "dish_Ab-123", revision: "1790856000000"))
        XCTAssertEqual(standard.conciergeMenuURL("https://menu-api.example" + path,
            dishID: "dish_Ab-123", revision: "1790856000000")?.absoluteString, "https://menu-api.example" + path)
        for base in ["https://menu-api.example:8443/prefix", "https://menu-api.example:8443?query=1",
                     "https://menu-api.example:8443#fragment", "https://reader@menu-api.example:8443"] {
            XCTAssertThrowsError(try decodeMenuCard([menuEvidence()], base: XCTUnwrap(URL(string: base))))
        }
        let slashBase = URL(string: "https://menu-api.example:8443/")!
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence()], base: slashBase))
        let explicitPort = BytspotAPIClient(baseURL: URL(string: "https://menu-api.example:443")!)
        XCTAssertEqual(explicitPort.conciergeMenuURL("https://menu-api.example:443" + path,
            dishID: "dish_Ab-123", revision: "1790856000000")?.absoluteString, "https://menu-api.example:443" + path)
        XCTAssertNil(explicitPort.conciergeMenuURL("https://menu-api.example" + path,
            dishID: "dish_Ab-123", revision: "1790856000000"))
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence(["dishId": "a", "mediaId": "b", "revision": "1",
            "sourceUrl": origin + "/media/menu-evidence/a/1"])]))
    }

    func testMenuEvidenceRejectsInvalidShapeSourceAndTimes() throws {
        let invalid: [[String: Any]] = [
            ["source": "google"], ["source": "vendor_menu "], ["source": NSNull()],
            ["dishId": NSNull()], ["dishId": 1], ["revision": 1_790_856_000_000], ["revision": NSNull()],
            ["dishName": "  "], ["dishName": 1], ["dishName": "Dish\nname"],
            ["reviewedAt": "not-a-date"], ["retrievedAt": "Infinity"], ["expiresAt": "NaN"],
            ["reviewedAt": "2026-02-30T12:00:00Z"], ["reviewedAt": "2026-10-01"],
            ["reviewedAt": "2026-10-01T24:00:00Z"], ["reviewedAt": "2026-10-01T12:60:00Z"],
            ["reviewedAt": "2026-10-01T12:00:60Z"], ["reviewedAt": "2026-10-01T12:00:00Z\n"],
            ["reviewedAt": "2026-10-01T12:00:00+25:00"],
            ["retrievedAt": "2026-09-30T12:00:00Z"], ["retrievedAt": "2026-10-31T12:00:00Z"],
            ["retrievedAt": "2026-11-01T12:00:00Z"], ["expiresAt": "2026-10-31T12:00:00.001Z"],
            ["expiresAt": "2026-09-30T12:00:00Z"], ["reviewedAt": 1_790_000_000],
            ["availability": "in_stock"]
        ]
        for change in invalid {
            XCTAssertThrowsError(try decodeMenuCard([menuEvidence(change)]), "Invalid evidence: \(change.keys.sorted())")
        }
        for field in menuEvidence().keys {
            var missing = menuEvidence()
            missing.removeValue(forKey: field)
            XCTAssertThrowsError(try decodeMenuCard([missing]), field)
        }
        let malformedValues: [Any] = [NSNull(), "menu", ["dishName": "Rice"], [1]]
        for malformed in malformedValues {
            XCTAssertThrowsError(try decodeMenuCard(malformed))
        }
        XCTAssertThrowsError(try decodeMenuCard(Array(repeating: menuEvidence(), count: 4)))
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence(["retrievedAt": "2026-10-01T12:00:00Z"])]))
        XCTAssertNoThrow(try decodeMenuCard([menuEvidence(["reviewedAt": "2026-10-01T13:00:00+01:00"])]))
    }

    func testMenuEvidenceRequiresCanonicalFoodVenueAndUniqueDishSource() throws {
        let invalidScopes: [[String: Any]] = [
            ["kind": "place", "source": "google"], ["kind": "place", "source": "google-stale"],
            ["kind": "place"], ["source": "google"], ["rail": "experience"]
        ]
        for scope in invalidScopes {
            XCTAssertThrowsError(try decodeMenuCard([menuEvidence()], changes: scope))
        }
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence(), menuEvidence()]))
        let newer = menuEvidence(["revision": "1790856000001", "mediaId": "new-file",
            "sourceUrl": "https://menu-api.example:8443/media/menu-evidence/dish_Ab-123/1790856000001"])
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence(), newer]))
        let otherDish = menuEvidence(["dishId": "other-dish",
            "sourceUrl": "https://menu-api.example:8443/media/menu-evidence/other-dish/1790856000000"])
        XCTAssertEqual(try decodeMenuCard([menuEvidence(), otherDish]).menuEvidence.count, 2)
        // The requesting client's origin is authoritative, even for canonical cards.
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence()], base: URL(string: "https://other-api.example")!))
    }

    func testMenuEvidenceTimestampsDecodeToExactInstantsWithoutWallClock() throws {
        let evidence = try XCTUnwrap(decodeMenuCard([menuEvidence()]).menuEvidence.first)
        XCTAssertEqual(evidence.reviewedAt.timeIntervalSince1970, 1_790_856_000, accuracy: 0.000001)
        XCTAssertEqual(evidence.retrievedAt.timeIntervalSince1970, 1_790_942_400, accuracy: 0.000001)
        XCTAssertEqual(evidence.expiresAt.timeIntervalSince1970, 1_793_448_000, accuracy: 0.000001)
        for timestamp in ["2026-10-01T12:00:00.125Z", "2026-10-01T13:00:00.125+01:00",
                          "2026-10-01T07:00:00.125-05:00"] {
            let item = try XCTUnwrap(decodeMenuCard([menuEvidence(["reviewedAt": timestamp])]).menuEvidence.first)
            XCTAssertEqual(item.reviewedAt.timeIntervalSince1970, 1_790_856_000.125, accuracy: 0.000001)
        }
        let fractional = try XCTUnwrap(decodeMenuCard([menuEvidence([
            "retrievedAt": "2026-10-02T12:00:00.125Z", "expiresAt": "2026-10-31T11:59:59.875Z"
        ])]).menuEvidence.first)
        XCTAssertEqual(fractional.retrievedAt.timeIntervalSince1970, 1_790_942_400.125, accuracy: 0.000001)
        XCTAssertEqual(fractional.expiresAt.timeIntervalSince1970, 1_793_447_999.875, accuracy: 0.000001)
        XCTAssertFalse(fractional.isCurrent(at: fractional.retrievedAt.addingTimeInterval(-0.001)))
        XCTAssertTrue(fractional.isCurrent(at: fractional.retrievedAt))
        XCTAssertFalse(fractional.isCurrent(at: fractional.expiresAt))
    }

    func testWebsiteIsOptionalNavigationNotMenuEvidenceOrAuthority() throws {
        let legacy = try XCTUnwrap(decode(response()).cards.first)
        XCTAssertNil(legacy.websiteUrl)
        XCTAssertNil(legacy.websiteURL)
        XCTAssertNil(try decodeMenuCard([], changes: ["websiteUrl": NSNull()]).websiteUrl)
        let raw = "https://restaurant.example/visit?location=downtown&lang=en&postcode=98101#hours"
        let scopes: [[String: Any]] = [[:], ["kind": "place", "source": "google"],
                                    ["kind": "place", "source": "google-stale"]]
        for scope in scopes {
            var fields = scope
            fields["websiteUrl"] = raw
            let food = try decodeMenuCard([], changes: fields)
            XCTAssertEqual(food.websiteUrl, raw)
            XCTAssertEqual(food.websiteURL?.absoluteString, raw)
            XCTAssertEqual(food.websiteLabel, "Restaurant website")
            XCTAssertEqual(food.ratingLabel, "Google restaurant rating 4.5 out of 5")
            XCTAssertEqual(food.menuEvidenceNotice(at: Date(timeIntervalSince1970: 1_790_942_400)), "Dish unconfirmed")
            XCTAssertTrue(food.menuEvidence.isEmpty)
            XCTAssertEqual(food.capability, .details)
            XCTAssertNil(food.venueSummary.checkInVenueID)
            XCTAssertNil(food.venueSummary.verifiedPatchId)
            XCTAssertNil(food.venueSummary.imageUrl)
            XCTAssertEqual(food.venueSummary.control, .listed)
            fields["rail"] = "experience"
            let place = try decodeMenuCard([], changes: fields)
            XCTAssertEqual(place.websiteLabel, "Place website")
            XCTAssertEqual(place.ratingLabel, "Google place rating 4.5 out of 5")
        }
        let withEvidence = try decodeMenuCard([menuEvidence()], changes: ["websiteUrl": raw])
        XCTAssertEqual(withEvidence.menuEvidence.count, 1)
        XCTAssertEqual(withEvidence.websiteURL?.absoluteString, raw)
        XCTAssertNil(try decodeMenuCard([], changes: ["rating": NSNull()]).ratingLabel)
    }

    func testWebsiteRejectsUnsafeURLsButAllowsOrdinaryBusinessQueries() throws {
        let invalid = [
            "", "http://restaurant.example", "javascript:alert(1)", "//restaurant.example", "/visit", "https:///",
            "https://reader@restaurant.example", "https://reader:unused@restaurant.example", "https://@restaurant.example",
            " https://restaurant.example", "https://restaurant.example/\nvisit", "https://restaurant.example/%0A",
            "https://restaurant.example/%5Cvisit", "https://restaurant.example\\@other.example",
            "https://localhost", "https://localhost.", "https://restaurant.localhost", "https://restaurant.local",
            "https://127.0.0.1", "https://127.1", "https://2130706433", "https://0x7f000001",
            "https://10.1.2.3", "https://172.16.0.1", "https://192.168.1.1", "https://169.254.169.254",
            "https://[::1]", "https://[fc00::1]", "https://[fe80::1]", "https://[::ffff:127.0.0.1]",
            "https://restaurant.example?access_token=fixture", "https://restaurant.example?api_key=fixture",
            "https://restaurant.example?%74oken=fixture", "https://restaurant.example?password=fixture"
        ]
        for raw in invalid {
            XCTAssertNil(NativeConciergeCard.safeWebsiteURL(raw))
            XCTAssertThrowsError(try decodeMenuCard([], changes: ["websiteUrl": raw]))
        }
        let malformedValues: [Any] = [1, true, ["url": "https://restaurant.example"]]
        for malformed in malformedValues {
            XCTAssertThrowsError(try decodeMenuCard([], changes: ["websiteUrl": malformed]))
        }
        for raw in ["https://restaurant.example", "https://restaurant.example/?lang=en&location=main",
                    "https://restaurant.example/search?q=rice%20bowl&utm_source=google", "https://restaurant.example/#hours"] {
            XCTAssertEqual(try decodeMenuCard([], changes: ["websiteUrl": raw]).websiteURL?.absoluteString, raw)
        }
    }

    func testCachedMenuEvidenceExpiresAndDoesNotAssertFoodClaimsForOtherRails() throws {
        let food = try decodeMenuCard([menuEvidence()])
        let item = try XCTUnwrap(food.menuEvidence.first)
        XCTAssertTrue(item.isCurrent(at: item.retrievedAt))
        XCTAssertTrue(item.isCurrent(at: item.expiresAt.addingTimeInterval(-0.001)))
        XCTAssertNil(food.menuEvidenceNotice(at: item.retrievedAt))
        for now in [item.retrievedAt.addingTimeInterval(-1), item.expiresAt,
                    item.expiresAt.addingTimeInterval(86_400), Date(timeIntervalSince1970: .infinity), Date(timeIntervalSince1970: .nan)] {
            XCTAssertFalse(item.isCurrent(at: now))
            XCTAssertTrue(food.currentMenuEvidence(at: now).isEmpty)
            XCTAssertEqual(food.menuEvidenceNotice(at: now), "Dish unconfirmed")
        }
        let absentFood = try decodeMenuCard([])
        XCTAssertEqual(absentFood.menuEvidenceNotice(at: item.retrievedAt), "Dish unconfirmed")
        XCTAssertEqual(food.ratingLabel, "Google restaurant rating 4.5 out of 5")
        let nonfood = try decodeMenuCard([], changes: ["rail": "experience", "category": "art_gallery"])
        XCTAssertFalse(nonfood.isFoodCard)
        XCTAssertNil(nonfood.menuEvidenceNotice(at: item.retrievedAt))
        XCTAssertEqual(nonfood.ratingLabel, "Google place rating 4.5 out of 5")
        let cached = try decodeMenuCard([], changes: ["kind": "place", "source": "google-stale"])
        XCTAssertTrue(cached.currentMenuEvidence(at: item.expiresAt).isEmpty)
        XCTAssertEqual(cached.menuEvidenceNotice(at: item.expiresAt), "Dish unconfirmed")
    }

    func testMenuEvidenceGrantsNoCheckInControlOrBookabilityAndKeepsDetailIdentity() throws {
        let variants: [[String: Any]] = [[:], ["placeId": NSNull()]]
        for changes in variants {
            let withEvidence = try decodeMenuCard([menuEvidence()], changes: changes)
            let withoutEvidence = try decodeMenuCard([], changes: changes)
            XCTAssertEqual(withEvidence.venueSummary.id, withoutEvidence.venueSummary.id)
            XCTAssertEqual(withEvidence.venueSummary.googlePlaceID, withoutEvidence.venueSummary.googlePlaceID)
            XCTAssertEqual(withEvidence.capability, .details)
            XCTAssertEqual(withEvidence.venueSummary.control, .listed)
            XCTAssertNil(withEvidence.venueSummary.checkInVenueID)
            XCTAssertNil(withEvidence.venueSummary.verifiedPatchId)
            XCTAssertNil(withEvidence.venueSummary.imageUrl)
            XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(withEvidence.venueSummary))
            XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: withEvidence.venueSummary, offering: nil).map(\.id),
                           NativeM5DetailPolicy.compactActions(for: withoutEvidence.venueSummary, offering: nil).map(\.id))
        }
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence()], changes: ["capability": "book"]))
        XCTAssertThrowsError(try decodeMenuCard([menuEvidence()], changes: ["capability": "order"]))
    }

    func testStrictCardsPreserveIdentityWithoutInventingAuthorityOrMedia() throws {
        let external = try XCTUnwrap(decode(response()).cards.first)
        XCTAssertEqual(external.venueSummary.id, "suggestion-gp:place-one")
        XCTAssertEqual(external.venueSummary.googlePlaceID, "ChIJ-place-one")
        XCTAssertNil(external.venueSummary.checkInVenueID)
        XCTAssertNil(external.venueSummary.verifiedPatchId)
        XCTAssertNil(external.venueSummary.crowd)
        XCTAssertNil(external.venueSummary.imageUrl)
        XCTAssertFalse(external.venueSummary.parking.isKnown)
        XCTAssertEqual(external.venueSummary.control, .listed)
        XCTAssertEqual(external.venueSummary.sourceCategory, "eat_drink")
        let gallery = try XCTUnwrap(decode(response(cards: [card(["category": "art_gallery", "rail": "experience"])])).cards.first)
        XCTAssertEqual(gallery.category, "art_gallery")
        XCTAssertEqual(NativeDiscoverBookablePresentation.referenceRail(type: gallery.venueSummary.discoverType,
            sourceCategory: gallery.venueSummary.sourceCategory), "experience")
        XCTAssertEqual(external.capability, .details)
        XCTAssertNil(external.isOpen)

        let venue = try XCTUnwrap(decode(response(cards: [card([
            "id": "canonical-venue", "kind": "venue", "placeId": NSNull(), "source": "bytspot",
            "rating": NSNull(), "photoUrl": "https://example.com/not-loaded.jpg"
        ])])).cards.first)
        XCTAssertEqual(venue.venueSummary.id, "canonical-venue")
        XCTAssertNil(venue.venueSummary.rating)
        XCTAssertNil(venue.venueSummary.imageUrl)
        XCTAssertNil(venue.venueSummary.checkInVenueID)
        XCTAssertEqual(venue.venueSummary.control, .listed)
    }

    func testDetailPreservesEveryValidatedRailAcrossLegacyProviderCategories() throws {
        let cases: [(String, String)] = [
            ("explore", "place"), ("eat_drink", "restaurant"), ("shop_style", "clothing_store"),
            ("experience", "art_gallery"), ("social", "community_center"), ("events", "event_venue"),
            ("wellness", "spa"), ("create_learn", "cooking_class"), ("nightlife", "night_club"),
            ("stay", "hotel"), ("move", "car_rental"), ("celebrate", "wedding_venue"),
            ("services", "beauty_salon")
        ]
        XCTAssertEqual(Set(cases.map { $0.0 }), Set(NativeDiscoverBookablePresentation.railTokens))
        for (rail, category) in cases {
            let decoded = try XCTUnwrap(decode(response(cards: [card(["category": category, "rail": rail])])).cards.first)
            let venue = decoded.venueSummary
            XCTAssertEqual(decoded.category, category)
            XCTAssertEqual(NativeDiscoverBookablePresentation.referenceRail(type: venue.discoverType,
                sourceCategory: venue.sourceCategory), rail, "Detail changed the server rail for \(category)")
            XCTAssertEqual(decoded.capability, .details)
            XCTAssertNil(venue.checkInVenueID)
        }
    }

    func testStrictCardRejectsHostileNumericIdentityAndCapabilityFields() {
        let invalid: [[String: Any]] = [
            ["id": ""], ["id": "with space"], ["id": "suggestion-forged"], ["name": "  "],
            ["kind": "booking"], ["placeId": NSNull()], ["placeId": "  ChIJ-trimmed"], ["placeId": "../../other"],
            ["source": "model"], ["source": "bytspot"], ["capability": "book"],
            ["lat": 91], ["lng": -181], ["lat": 0, "lng": 0], ["lat": true], ["lat": "47.61"],
            ["lat": Double.greatestFiniteMagnitude], ["rating": Double.greatestFiniteMagnitude],
            ["rating": -1], ["rating": 6], ["rating": true], ["isOpen": 1],
            ["crowd": ["level": Double.greatestFiniteMagnitude]], ["rail": ""], ["rail": "invented"], ["reasons": [1]]
        ]
        for change in invalid {
            XCTAssertThrowsError(try decode(response(cards: [card(change)])), "Invalid field: \(change.keys.sorted())")
        }
        for key in ["id", "placeId", "rating", "isOpen", "photoUrl", "crowd", "capability"] {
            var missing = card()
            missing.removeValue(forKey: key)
            XCTAssertThrowsError(try decode(response(cards: [missing])), key)
        }
        let decoder = JSONDecoder()
        decoder.nonConformingFloatDecodingStrategy = .convertFromString(positiveInfinity: "Infinity", negativeInfinity: "-Infinity", nan: "NaN")
        for field in ["lat", "lng", "rating"] {
            for value in ["Infinity", "-Infinity", "NaN"] {
                XCTAssertThrowsError(try decode(response(cards: [card([field: value])]), decoder: decoder))
            }
        }
    }

    func testResponseRejectsVersionStatusDuplicatesAndMoreThanThreeCards() {
        let invalid: [[String: Any]] = [["version": 2], ["version": true], ["version": 1e100], ["status": "booked"], ["reply": " "], ["status": "empty"]]
        for change in invalid {
            XCTAssertThrowsError(try decode(response(changes: change)))
        }
        XCTAssertThrowsError(try decode(response(cards: [])))
        XCTAssertThrowsError(try decode(response(cards: [card(), card()])))
        XCTAssertThrowsError(try decode(response(cards: [card(), card(["id": "different-display-id"])])))
        let four = (0..<4).map { card(["id": "place-\($0)", "placeId": "ChIJ-\($0)"]) }
        XCTAssertThrowsError(try decode(response(cards: four)))
    }

    func testNonReadyResponsesHaveNoCardsAndOnlyActionableRefinements() throws {
        for status in ["needs_location", "unavailable", "empty"] {
            let decoded = try decode(response(cards: [], changes: ["status": status]))
            XCTAssertTrue(decoded.cards.isEmpty)
            XCTAssertEqual(decoded.actionableRefinements, status != "unavailable" ? ["Find dinner instead"] : [])
        }
        let cached = try XCTUnwrap(decode(response(cards: [card(["source": "google-stale"])])).cards.first)
        XCTAssertTrue(cached.sourceLabel.contains("cached"))
        let refined = try decode(response(changes: ["refinements": ["Coffee", "Coffee", "Dinner", "Outing"]]))
        XCTAssertEqual(refined.actionableRefinements, ["Coffee", "Dinner", "Outing"])
    }

    func testRequestBoundsHistoryAndUsesOnlyRealCoordinatesAndSavedQuizKeys() throws {
        let suite = "NativeConciergeDiscoveryTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("dinner", forKey: NativeLaunchPersonalizationStorage.vibeKey)
        defaults.set("close", forKey: NativeLaunchPersonalizationStorage.walkKey)
        defaults.set("couple", forKey: NativeLaunchPersonalizationStorage.crewKey)
        let messages = (0..<13).map { index in
            NativeConciergeMessage(role: index == 12 ? .user : .assistant, content: "\(index) " + String(repeating: "🌎", count: 2_001))
        }
        let request = try NativeConciergeRequest(messages: messages, location: seattle, quizAnswers: .saved(in: defaults))
        XCTAssertEqual(request.messages.count, 10)
        XCTAssertTrue(request.messages[0].content.hasPrefix("3 "))
        XCTAssertTrue(request.messages.allSatisfy { $0.content.utf16.count <= 2_000 })
        XCTAssertEqual(request.location.lat, seattle.latitude)
        XCTAssertEqual(request.location.lng, seattle.longitude)
        XCTAssertEqual(request.quizAnswers.vibe, "dinner")
        XCTAssertEqual(request.quizAnswers.walk, "close")
        XCTAssertEqual(request.quizAnswers.group, "couple")
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["messages", "location", "quizAnswers"])
        let quiz = try XCTUnwrap(object["quizAnswers"] as? [String: String])
        XCTAssertEqual(quiz, ["vibe": "dinner", "walk": "close", "group": "couple"])
        let empty = NativeConciergeRequest.QuizAnswers(vibe: " ", walk: nil, crew: nil)
        XCTAssertNil(empty.vibe)
        let long = NativeConciergeRequest.QuizAnswers(vibe: String(repeating: "🌎", count: 100), walk: nil, crew: nil)
        XCTAssertEqual(long.vibe?.utf16.count, 40)
        let invalidCoordinates: [NativeLocationCoordinate?] = [nil, .midtown,
            .init(latitude: .nan, longitude: 1, isFallback: false),
            .init(latitude: 1, longitude: .infinity, isFallback: false),
            .init(latitude: 91, longitude: 1, isFallback: false)]
        for coordinate in invalidCoordinates {
            XCTAssertThrowsError(try NativeConciergeRequest(messages: messages, location: coordinate, quizAnswers: empty))
        }
        XCTAssertThrowsError(try NativeConciergeRequest(messages: [], location: seattle, quizAnswers: empty))
        XCTAssertThrowsError(try NativeConciergeRequest(messages: [.init(role: .user, content: " ")], location: seattle, quizAnswers: empty))
    }

    func testDiscoveryLocationToleratesRoutineUpdatesButRejectsStaleOrDistantFixes() {
        let now = Date()
        func fix(_ age: TimeInterval, accuracy: Double = 100) -> CLLocation {
            CLLocation(coordinate: CLLocationCoordinate2D(latitude: seattle.latitude, longitude: seattle.longitude),
                       altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1,
                       timestamp: now.addingTimeInterval(-age))
        }
        XCTAssertEqual(NativeConciergeContract.searchCoordinate(location: fix(600), authorized: true, now: now), seattle)
        XCTAssertNil(NativeConciergeContract.searchCoordinate(location: fix(901), authorized: true, now: now))
        XCTAssertNil(NativeConciergeContract.searchCoordinate(location: fix(0), authorized: false, now: now))
        XCTAssertNil(NativeConciergeContract.searchCoordinate(location: fix(0, accuracy: 1001), authorized: true, now: now))
        let jitter = NativeLocationCoordinate(latitude: seattle.latitude + 0.0001, longitude: seattle.longitude, isFallback: false)
        XCTAssertEqual(NativeConciergeContract.stableOrigin(jitter, previous: seattle), seattle)
        XCTAssertEqual(NativeConciergeContract.stableOrigin(.verifiedMidtown, previous: seattle), .verifiedMidtown)
        XCTAssertNil(NativeConciergeContract.stableOrigin(nil, previous: seattle))
    }

    func testGenerationScopeCancellationAndAccountRoundTripRejectOldReplies() throws {
        var gate = NativeConciergeRequestGuard()
        let firstA = try XCTUnwrap(gate.begin(accountID: "account-a", location: seattle))
        XCTAssertTrue(gate.accepts(firstA, accountID: "account-a", location: seattle, isCancelled: false))
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-a", location: seattle, isCancelled: true))
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-b", location: seattle, isCancelled: false))
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-a", location: .verifiedMidtown, isCancelled: false))
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-a", location: nil, isCancelled: false))
        gate.invalidate() // Stop, token refresh, logout, location change or disappearance.
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-a", location: seattle, isCancelled: false))
        let b = try XCTUnwrap(gate.begin(accountID: "account-b", location: seattle))
        let secondA = try XCTUnwrap(gate.begin(accountID: "account-a", location: seattle))
        XCTAssertFalse(gate.accepts(firstA, accountID: "account-a", location: seattle, isCancelled: false))
        XCTAssertFalse(gate.accepts(b, accountID: "account-b", location: seattle, isCancelled: false))
        XCTAssertTrue(gate.accepts(secondA, accountID: "account-a", location: seattle, isCancelled: false))
        XCTAssertNil(gate.begin(accountID: nil, location: seattle))
        XCTAssertFalse(gate.isCurrent(secondA))
        XCTAssertNil(gate.begin(accountID: "account-a", location: .midtown))
    }

    func testClientRejectsAnonymousRequestsBeforeNetworking() async throws {
        let request = try NativeConciergeRequest(messages: [.init(role: .user, content: "Coffee")],
            location: seattle, quizAnswers: .init(vibe: nil, walk: nil, crew: nil))
        for client in [BytspotAPIClient(), BytspotAPIClient(tokenProvider: { "guest_session" })] {
            do {
                _ = try await NativeConciergeAPI(client: client).discover(request)
                XCTFail("An anonymous discovery request must not reach the network")
            } catch NativeConciergeAPI.AccessError.signInRequired {
                // Expected local guard, not an HTTP failure.
            } catch {
                XCTFail("Expected the local authentication guard")
            }
        }
    }

    func testUnsignedModelDoesNotAppendPrivateHistoryOrStartSearch() {
        let model = NativeConciergeModel()
        model.draft = "Coffee near me"
        model.send(model.draft)
        XCTAssertTrue(model.turns.isEmpty)
        XCTAssertFalse(model.isSearching)
        XCTAssertEqual(model.notice, "Sign in to search for nearby places.")
        model.clear()
        XCTAssertTrue(model.draft.isEmpty)
        XCTAssertNil(model.result)
        XCTAssertNil(model.detailVenue)
        XCTAssertNil(model.notice)
        XCTAssertFalse(model.canRetry)
    }

    func testDiscoverRouteBodyAndNativeDetailWiring() throws {
        let request = try NativeConciergeRequest(messages: [.init(role: .user, content: "Coffee")],
            location: seattle, quizAnswers: .init(vibe: nil, walk: nil, crew: nil))
        let body = try JSONEncoder().encode(request)
        // A local, nonfunctional fixture only; this test never sends a request.
        let api = NativeConciergeAPI(client: BytspotAPIClient(tokenProvider: { "concierge-test-only" }))
        let urlRequest = try api.makeRequest(request)
        XCTAssertEqual(urlRequest.url?.path, "/trpc/concierge.discover")
        XCTAssertEqual(urlRequest.httpMethod, "POST")
        // JSON key ordering is unspecified, so compare parsed bodies rather than byte order.
        let encoded = try JSONSerialization.jsonObject(with: body) as? NSDictionary
        let sent = try JSONSerialization.jsonObject(with: XCTUnwrap(urlRequest.httpBody)) as? NSDictionary
        XCTAssertEqual(sent, encoded)
        XCTAssertNotNil(urlRequest.value(forHTTPHeaderField: "Authorization"))
        let envelope: [String: Any] = ["result": ["data": response()]]
        let payload = try XCTUnwrap(BytspotAPIClient.unwrapTRPCData(envelope) as? [String: Any])
        XCTAssertEqual(try decode(payload).version, 1)

        let shellURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("App/NativeShellView.swift")
        let shell = try String(contentsOf: shellURL, encoding: .utf8)
        let start = try XCTUnwrap(shell.range(of: "final class NativeConciergeModel:"))
        let end = try XCTUnwrap(shell.range(of: "private struct NativeHorizontalSection", range: start.upperBound..<shell.endIndex))
        let concierge = String(shell[start.lowerBound..<end.lowerBound])
        for binding in ["session.$token.dropFirst()", "session.$authenticatedUserID.dropFirst()", "location.$lastLocation.dropFirst()", "location.$authorizationState.dropFirst()"] {
            XCTAssertTrue(concierge.contains(binding), binding)
        }
        XCTAssertTrue(concierge.contains("NativeVenueDetailView(venue: venue"))
        XCTAssertTrue(concierge.contains("model.detailVenue = card.venueSummary"))
        XCTAssertTrue(concierge.contains(".sheet(item: $model.detailVenue)"))
        XCTAssertTrue(concierge.contains("TimelineView(.periodic(from: Date(), by: 1))"))
        XCTAssertTrue(concierge.contains("menuEvidence(at: context.date)"))
        XCTAssertTrue(concierge.contains("card.currentMenuEvidence(at: now)"))
        XCTAssertTrue(concierge.contains("card.menuEvidenceNotice(at: now)"))
        XCTAssertTrue(concierge.contains("Listed on reviewed menu"))
        XCTAssertTrue(concierge.contains("Reviewed \\(item.reviewedAt, style: .date)"))
        XCTAssertTrue(concierge.contains("Link(\"View source menu\", destination: item.sourceUrl)"))
        XCTAssertTrue(concierge.contains("does not guarantee current availability or dietary safety"))
        XCTAssertTrue(concierge.contains("Text(ratingLabel)"))
        XCTAssertTrue(concierge.contains("ForEach(card.actions, id: \\.self)"))
        XCTAssertTrue(concierge.contains("Button(title) { requestAction(action) }"))
        XCTAssertTrue(concierge.contains("if let url = approved.card.websiteURL { openURL(url) }"))
        XCTAssertTrue(concierge.contains("guard let approved = model.approve(pending) else { return }"))
        XCTAssertFalse(concierge.contains("Link(card.websiteLabel"))
        XCTAssertTrue(concierge.contains(".sheet(item: $model.planSelection"))
        XCTAssertTrue(concierge.contains("onAdded: { planID in model.planAdded(planID: planID, selectionID: selection.id) }"))
        XCTAssertTrue(concierge.contains("guard let approved = model.approveArrival(step) else { return }"))
        XCTAssertTrue(concierge.contains("Button(step.buttonTitle) { model.requestArrival(step) }"))
        XCTAssertTrue(concierge.contains("not a verified menu"))
        XCTAssertFalse(concierge.contains("Link(\"Menu\", destination: websiteURL)"))
        XCTAssertFalse(concierge.contains("vendor onboarding"))
        XCTAssertFalse(concierge.contains("Google rating %.1f"))
        XCTAssertTrue(concierge.contains(".onDisappear { model.disappear() }"))
        XCTAssertTrue(concierge.contains("Button(\"Sign in\", action: openNativeAuth)"))
        for retired in ["concierge.chat", "concierge.actions", "Concierge review required", "mic.fill", "Check stay dates", "openNativeTab(.discover)", "asyncAfter"] {
            XCTAssertFalse(concierge.contains(retired), retired)
        }
    }
}

/// A listed partner with a supplied category and no granted authority.
private func partnerKitchenCard() -> NativeDiscoverSummary {
    NativeDiscoverSummary(id: "partner-kitchen", type: "service", title: "Partner Kitchen", subtitle: "", distance: "Service", rating: "New", icon: "fork.knife", verified: false, entryType: "free", cta: "Details", imageUrl: nil, categoryLabel: "Dining", badgeText: "", metadataLine: "", features: [], vibeScore: 6, availability: "", membershipRequired: false)
}

@MainActor
final class NativeM5DetailTests: XCTestCase {
    private func offering(_ capability: String, kind: NativePlanBookableSelection.SourceKind = .party,
                          category: String = "events") -> NativePlanBookableOffering {
        .init(id: "catalog-1", sourceKind: kind, sourceId: "source-1", category: category,
              title: "Premium Live Confirmed", subtitle: nil, capability: capability)
    }

    private func venue(category: String = "coffee", address: String = "") -> NativeVenueSummary {
        NativeLocationAwareUIContent.unresolvedVenue(id: "place-1", name: "Place",
            category: category, address: address, distance: "—", imageURL: nil)
    }

    func testGlobalHeaderKeepsMapAndBackOnLeftProfileOnRight() throws {
        let shell = try shellSource()
        let header = try region(in: shell, from: "    @ViewBuilder private var shellNavigationRow: some View {",
                                to: "    static func showsGlobalHeaderControls")
        let map = try XCTUnwrap(header.range(of: "native-global-map-button"))
        let back = try XCTUnwrap(header.range(of: "native-map-back-button"))
        let profile = try XCTUnwrap(header.range(of: "native-global-profile-avatar"))
        XCTAssertLessThan(map.lowerBound, profile.lowerBound)
        XCTAssertLessThan(back.lowerBound, profile.lowerBound)
        XCTAssertTrue(header.contains("commitSelectedTab(mapReturnTab)"))
        XCTAssertTrue(header.contains("openNativeProfile(panel: nil)"))
    }

    #if DEBUG
    func testHomeStartupAssertionsAcceptListedPartnerWithoutGrantingControl() {
        // Exercise the actual opt-in launch assertions, not just the detail
        // projection. A passing UI policy suite previously missed this trap.
        NativeHomeParitySelfTests.runIfRequested()
    }

    func testMapStartupAssertionsKeepUnverifiedHoursUnknown() {
        NativeMapParitySelfTests.runIfRequested()
    }

    func testAllDebugStartupAssertionsMatchCurrentAppContracts() {
        // This is the same complete ordered guard list called by the app root.
        NativeStartupSelfTests.run()
    }
    #endif

    func testDetailShowsTheSameBrowseCategoryAsItsCard() {
        // A partner appearing as Eat & Drink on the card and Services on the
        // detail reads as two different places.
        let card = partnerKitchenCard()
        let venue = NativeLocationAwareUIContent.unresolvedVenue(id: card.id, name: card.title, category: card.type,
            address: "", distance: card.distance, imageURL: card.imageUrl, sourceCategory: card.categoryLabel)
        let cardRail = NativeDiscoverBookablePresentation.referenceRail(type: card.type, sourceCategory: card.categoryLabel)
        let detailRail = NativeDiscoverBookablePresentation.referenceRail(type: venue.discoverType, sourceCategory: venue.sourceCategory ?? venue.category)
        XCTAssertEqual(cardRail, "eat_drink")
        XCTAssertEqual(detailRail, cardRail)
        XCTAssertEqual(NativeDiscoverBrowsePolicy.categoryLabel(detailRail!), "Eat & Drink")
    }

    /// A partner is a place. Omitting coordinates from its card does not make
    /// it location independent, so an unresolved viewer must not be shown an
    /// Atlanta restaurant — partner visibility is earned with a real address,
    /// never by exempting supply from location scoping.
    func testLocationBoundPartnerStaysHiddenUntilLocationResolves() {
        XCTAssertTrue(NativeTabContentSnapshot.unresolved.discoverCards.isEmpty)
        XCTAssertTrue(NativeTabContentSnapshot.unresolved.venues.isEmpty)
        XCTAssertTrue(NativeTabContentSnapshot.unresolved.events.isEmpty)
        // A sample partner is never shown as if it were live, wherever the guest is.
        XCTAssertTrue(NativeTabContentSnapshot.fallback.discoverCards.isEmpty)
    }

    // MARK: Four-surface authority contract

    /// Discover, Venue detail, Review and Arrival must read one capability from
    /// supply. A surface that re-derives it can upgrade authority by rendering.
    func testAllFourSurfacesResolveOneCapabilityFromSupply() {
        let cases: [(String, NativePlanBookableSelection.SourceKind, NativeDiscoverBookableCapability)] = [
            ("request", .coffeeSpot, .request),
            ("book", .coffeeSpot, .details),
            ("order", .coffeeSpot, .order),
            ("book", .party, .details),
            ("redirect", .party, .details)
        ]
        for (capability, kind, expected) in cases {
            let supply = NativeDiscoverBookablePresentation(offering: offering(capability, kind: kind, category: "dining"))
            XCTAssertEqual(supply.capability, expected, "\(kind) \(capability) resolved the wrong capability")

            // Surface 1 — Discover card.
            XCTAssertEqual(NativeDiscoverBrowsePolicy.presentation(offering: offering(capability, kind: kind, category: "dining")).capability, expected)
            // Surface 2 — Venue detail.
            let detailAction: NativeM5PrimaryAction = expected == .request ? .requestCoffee
                : (expected == .order ? .unavailable(.order) : .route)
            XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: supply), detailAction)
            XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: supply), expected == .request ? "Request"
                : (expected == .order ? "Ordering unavailable" : "Route"))
            // Surface 3 — Review. Only the mounted route may execute.
            let rows = NativeVendorCapabilityTable.rows(for: supply)
            XCTAssertEqual(rows.map(\.intent), NativeVendorCapabilityIntent.allCases)
            XCTAssertEqual(rows.filter(\.isExecutable).map(\.intent), expected == .request ? [.requesting] : [])
            XCTAssertTrue(rows.allSatisfy { $0.isExecutable || $0.actionTitle == nil })
            // Surface 4 — Arrival never carries fulfillment, whatever the capability.
            XCTAssertEqual(NativeM5DetailPolicy.addToPlanTitle, "Add to Plan")
            XCTAssertTrue(NativeM5DetailPolicy.planDisclaimer.contains("does not book or request"))
        }
    }

    /// Booking and Ordering are intent vocabulary only: no supply currently
    /// mounts them, so no surface may render an executable row for them.
    func testBookingAndOrderingIntentsNeverExecuteOnAnySurface() {
        let partnerCard = partnerKitchenCard()
        let supplies = [
            NativeDiscoverBookablePresentation(),
            NativeDiscoverBookablePresentation(offering: offering("request", kind: .coffeeSpot, category: "coffee")),
            NativeDiscoverBookablePresentation(offering: offering("book", kind: .party)),
            NativeDiscoverBookablePresentation(offering: offering("order", kind: .coffeeSpot, category: "dining")),
            NativeDiscoverBrowsePolicy.referencePresentation(for: partnerCard)
        ]
        for supply in supplies {
            let rows = NativeVendorCapabilityTable.rows(for: supply)
            for intent in [NativeVendorCapabilityIntent.booking, .ordering] {
                let row = rows.first { $0.intent == intent }!
                XCTAssertFalse(row.isExecutable, "\(intent) must stay unmounted")
                XCTAssertNil(row.actionTitle)
                XCTAssertEqual(row.availabilityTitle, "Not available")
            }
            XCTAssertTrue(NativeVendorCapabilityTable.reviewDisclaimer.contains("does not book, order or send a request"))
        }
        // Intent vocabulary stays stable and carries no permission wording.
        XCTAssertEqual(NativeVendorCapabilityTable.stableTokens, ["booking", "ordering", "requesting"])
    }

    /// Category name, partner badge, verified flag and curated placement are
    /// presentation. None of them may move capability on any surface.
    func testCategoryBadgeAndPlacementNeverGrantAuthorityOnAnySurface() {
        let listed = NativeDiscoverBookablePresentation()
        for rail in NativeDiscoverBookablePresentation.railTokens {
            let dressed = NativeDiscoverBookablePresentation(offering: offering("book", kind: .party, category: rail))
            XCTAssertEqual(dressed.capability, listed.capability)
            XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: dressed), NativeM5DetailPolicy.primaryTitle(for: listed))
            XCTAssertEqual(NativeVendorCapabilityTable.rows(for: dressed).filter(\.isExecutable).count, 0)
        }
        // Exactly thirteen pills, and no guest rail is introduced alongside them.
        // The pill rail itself is NativeDiscoverView.categoryLabels, which is
        // private to the app target; the startup guard asserts it equals these.
        XCTAssertEqual(NativeDiscoverBookablePresentation.railLabels, [
            "Explore", "Eat & Drink", "Shop & Style", "Experience", "Social", "Events",
            "Wellness", "Create & Learn", "Nightlife", "Stay", "Move", "Celebrate", "Services"
        ])
        XCTAssertEqual(NativeDiscoverBookablePresentation.railTokens.count, 13)
        for absent in ["host", "guest", "partner", "featured", "sponsored", "broni"] {
            XCTAssertNil(NativeDiscoverBookablePresentation.rail(category: absent), "\(absent) must not be a rail")
        }
    }

    func testListedDefaultsToRouteAndAddToPlanWithoutControl() {
        let listed = NativeDiscoverBookablePresentation()
        XCTAssertEqual(listed.statusLabel, "Listed")
        XCTAssertEqual(listed.capability, .details)
        XCTAssertNil(listed.actionHex)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: listed), .route)
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: listed), "Route")
        XCTAssertEqual(NativeM5DetailPolicy.addToPlanTitle, "Add to Plan")
        XCTAssertTrue(listed.availabilityLine.contains("does not control"))
        XCTAssertTrue(NativeM5DetailPolicy.planDisclaimer.contains("does not book or request"))
    }

    func testPartyNeverBecomesBookOrRequestForAnyRail() {
        for rail in NativeDiscoverBookablePresentation.railTokens {
            for capability in ["book", "request", "redirect", "details"] {
                let party = offering(capability, category: rail)
                let presentation = NativeDiscoverBookablePresentation(offering: party,
                    externalURL: URL(string: "https://tickets.example.com/event/1"), externalProvider: "Tickets")
                XCTAssertEqual(presentation.capability, .details)
                XCTAssertEqual(presentation.statusLabel, "Listed")
                XCTAssertNil(presentation.primaryActionTitle)
                XCTAssertNil(NativeDiscoverBrowsePolicy.executableActionTitle(offering: party))
                XCTAssertNotNil(NativeDiscoverBrowsePolicy.partyRoute(offering: party))
            }
        }
    }

    func testNoCurrentCatalogKindUnlocksControlledBooking() {
        let kinds: [NativePlanBookableSelection.SourceKind] = [.coffeeSpot, .party]
        for kind in kinds {
            let presentation = NativeDiscoverBookablePresentation(offering: offering("book", kind: kind))
            XCTAssertEqual(presentation.capability, .details)
            XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: presentation), .route)
        }
    }

    func testOnlyExactCoffeeRequestGetsSupportedRequestAction() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let presentation = NativeDiscoverBookablePresentation(offering: coffee)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: presentation), .requestCoffee)
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: presentation), "Request")
        XCTAssertEqual(presentation.availabilityLine, "Subject to host acceptance")
        XCTAssertEqual(presentation.actionHex, 0x00BFFF)
        XCTAssertEqual(NativeDiscoverBrowsePolicy.executableActionTitle(offering: coffee), "Request")
    }

    func testVendorCapabilityTaxonomyIsStableAndFailClosed() throws {
        XCTAssertEqual(NativeVendorCapabilityTable.stableTokens, ["booking", "ordering", "requesting"])
        XCTAssertEqual(NativeVendorCapabilityIntent.allCases.map(\.title), ["Booking", "Ordering", "Requesting"])
        XCTAssertEqual(NativeVendorCapabilityIntent.allCases.map(\.requirement), [
            "Bookable: time and capacity", "Orderable: purchase and fulfillment",
            "Requestable: provider-mediated request"
        ])
        XCTAssertEqual(NativeVendorCapabilityTable.reviewDisclaimer,
            "Opening this review does not book, order or send a request.",
            "The review must not deny an existing request or booking")

        let listedRows = NativeVendorCapabilityTable.rows(for: NativeDiscoverBookablePresentation())
        XCTAssertEqual(listedRows.map(\.intent), [.booking, .ordering, .requesting])
        XCTAssertTrue(listedRows.allSatisfy { $0.route == .unavailable && !$0.isExecutable })

        let request = NativeDiscoverBookablePresentation(
            offering: offering("request", kind: .coffeeSpot, category: "coffee"))
        let requestRows = NativeVendorCapabilityTable.rows(for: request)
        XCTAssertEqual(requestRows.first(where: { $0.intent == .booking })?.route, .unavailable)
        XCTAssertEqual(requestRows.first(where: { $0.intent == .ordering })?.route, .unavailable)
        XCTAssertEqual(requestRows.first(where: { $0.intent == .requesting })?.route, .requestCoffee)

        let url = try XCTUnwrap(URL(string: "https://provider.example.com/booking/1"))
        let external = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Provider")
        XCTAssertTrue(NativeVendorCapabilityTable.rows(for: external).allSatisfy { !$0.isExecutable },
            "An external destination alone does not establish a booking or ordering intent")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: external), .external(url))
        XCTAssertTrue(listedRows.allSatisfy { $0.availabilityTitle == "Not available" })
        XCTAssertEqual(requestRows.last?.accessibilityTitle, "Requesting: Available")
    }

    func testPartnerProfileDoesNotInventAuthority() throws {
        let card = partnerKitchenCard()
        XCTAssertEqual(card.control, NativeDiscoverCardControl.local)
        XCTAssertFalse(NativeDiscoverCardControl.isControlled(cardID: card.id))
        let presentation = NativeDiscoverBrowsePolicy.referencePresentation(for: card)
        XCTAssertEqual(presentation.capability, .details)
        XCTAssertTrue(NativeVendorCapabilityTable.rows(for: presentation).allSatisfy { !$0.isExecutable })
    }

    func testSyntheticCategoryFillersAreExcludedWithoutPromotingOtherReferences() {
        for id in ["coverage-dining-1-broni", "starter-coffee-1", "companion-parking-venue-1"] {
            XCTAssertFalse(NativeVendorExperience.isDiscoveryReference(id: id))
        }
        XCTAssertTrue(NativeVendorExperience.isDiscoveryReference(id: "venue-real-1"))
        // Both sources retain party identity, but nearby invitations must
        // never enter the generic reference/venue routing branch. Catalog
        // deduplication is a separate exact-identity policy.
        XCTAssertTrue(NativeVendorExperience.isDiscoveryReference(id: "party:party-1"))
        XCTAssertFalse(NativeVendorExperience.isDiscoveryReference(id: "party-party-1"))
        XCTAssertEqual(NativeVendorCapabilityTable.rows(for: .init()).filter(\.isExecutable).count, 0)
    }

    func testNearbyHomeAndDiscoverOpenInvitationOnlyAndNeverSynthesizeBookables() throws {
        let shell = try shellSource()
        let home = try region(in: shell, from: "private struct NativeHomeDashboardView: View {",
                              to: "private struct NativeHomeSearchSheet: View {")
        let discover = try region(in: shell, from: "private struct NativeDiscoverView: View {",
                                  to: "private struct NativeDiscoverFilterChip: View {")
        let card = try region(in: shell, from: "private struct NativeDiscoverFeatureCard: View {",
                             to: "private struct NativeSpecialDiscoverCard: View {")
        let invitationPath = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("App/NativePartyInvitationDetail.swift")
        let invitation = try String(contentsOf: invitationPath, encoding: .utf8)
        // The detail opens inside a sheet NavigationView that inherits the
        // shell's ground-drawn flag; without its own ground, white text sits
        // on a white navigation background and the page reads blank.
        XCTAssertFalse(invitation.contains(".background(NativeDeepSpaceGround())"))
        XCTAssertEqual(invitation.components(separatedBy: "NativeDeepSpaceGround().environment(\\.nativeDeepSpaceGroundDrawn, false)").count - 1, 2)
        XCTAssertTrue(invitation.contains(".preferredColorScheme(.dark)"))
        for (surface, sheet) in [(home, "homePartyInvitation"), (discover, "nearbyInvitationDetail")] {
            XCTAssertTrue(surface.contains(".sheet(item: $\(sheet))"))
            XCTAssertTrue(surface.contains("NativePartyInvitationDetail(partyID: party.partyID"))
            XCTAssertFalse(surface.contains("NativePartyPassView("))
            XCTAssertFalse(surface.contains("NativePartyPassSurface("))
        }
        let homePrimary = try region(in: home, from: "    private func triggerPrimaryAIPick(",
                                     to: "    private static func isValetPremiumRide(")
        XCTAssertEqual(homePrimary.components(separatedBy: "homePartyInvitation = party").count - 1, 2)
        XCTAssertEqual(homePrimary.components(separatedBy: "regionalSnapshot.trustworthyNearbyPartyCards.contains(card)").count - 1, 2)
        XCTAssertEqual(discover.components(separatedBy: "if card.nearbyParty != nil { openNearbyInvitation(card); return }").count - 1, 2)
        let plan = try region(in: discover, from: "    private func beginPlanSelection(",
                             to: "    private func finishPlanDismissal()")
        XCTAssertTrue(plan.contains("guard card.nearbyParty == nil else { return }"))
        XCTAssertTrue(card.contains("if card.nearbyParty == nil {"), "Nearby-only cards have no Add to Plan button")
        XCTAssertTrue(discover.contains("nearbyInvitations(in: regionalSnapshot, catalog: catalogRows)"))
        XCTAssertTrue(discover.contains("NativeVendorExperience.isDiscoveryReference(id: $0.id)"))
        XCTAssertTrue(discover.contains("nearbyParty: card.nearbyParty"))
        XCTAssertTrue(shell.contains("tabContentStore.synchronizeAccount(userID: userID, forceReset: forceReset)"))
    }

    func testNearbyProvenanceComesOnlyFromNearbyDecoderAndIsInvalidatedWithAccount() throws {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("App/BytspotAPIClient.swift")
        let api = try String(contentsOf: path, encoding: .utf8)
        let fetch = try region(in: api, from: "    private func fetchNearbyParties(", to: "    private func fetchVendorServices(")
        XCTAssertTrue(fetch.contains("NativeLiveContentV2Contract.partiesNearbyRoute"))
        XCTAssertTrue(fetch.contains("Self.partyDiscoverCard(from: item)"))
        let bootstrapDecoder = try region(in: api, from: "    private static func discoverCard(from item:",
                                          to: "    private static func event(from pair:")
        XCTAssertFalse(bootstrapDecoder.contains("nearbyParty"), "Generic payloads cannot mint provenance")
        let reset = try region(in: api, from: "    func synchronizeAccount(", to: "    func snapshot(for location:")
        XCTAssertTrue(reset.contains("refreshGeneration += 1"), "Late reads cannot restore an old account's invitations")
        XCTAssertTrue(reset.contains("snapshot.discoverCards.filter { $0.nearbyParty == nil }"))
    }

    func testExternalRequiresExplicitNamedValidatedHandoff() throws {
        let url = try XCTUnwrap(URL(string: "https://provider.example.com/booking/1"))
        let external = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Example Provider")
        XCTAssertEqual(external.statusLabel, "External")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: external), .external(url))
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: external), "Open Example Provider ↗")
        XCTAssertNil(external.actionHex)
        XCTAssertTrue(external.availabilityLine.contains("not Bytspot"))
        let unnamed = NativeDiscoverBookablePresentation(externalURL: url)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: unnamed), .route)
        let insecure = NativeDiscoverBookablePresentation(externalURL: URL(string: "http://provider.example.com"), externalProvider: "Example Provider")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: insecure), .route)
    }

    func testCategoryNeverInventsFulfillmentOrVerifiedHours() throws {
        let legacyTicketAction = try XCTUnwrap(NativeVenueDetailContract.actions.first { $0.id == "getTickets" })
        for rail in NativeDiscoverBookablePresentation.railTokens {
            let place = venue(category: rail)
            let section = try XCTUnwrap(NativeVenueDetailPresentation.detailSection(for: place))
            XCTAssertEqual(section.highlights, ["Route", "Add to Plan"])
            XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: legacyTicketAction, venue: place), "Details")
            let actionIDs = NativeM5DetailPolicy.compactActions(for: place).map(\.id)
            XCTAssertTrue(Set(actionIDs).isSubset(of: ["save", "share", "checkIn"]))
            XCTAssertFalse(NativeVenueHours.hasVerifiedHours(for: rail))
            let hours = NativeVenueHours.openStatus(category: rail, hour: 12, minute: 0, weekday: 3)
            XCTAssertEqual(hours.label, "Hours unknown")
            XCTAssertFalse(hours.isOpen)
        }
    }

    func testMissingPlaceFactsAreUnknownAndNoCoordinateIsInvented() {
        let place = venue()
        XCTAssertEqual(NativeM5DetailPolicy.address(for: place), "Address not provided")
        XCTAssertEqual(NativeM5DetailPolicy.activity(for: place), NativeM5DetailPolicy.activityUnknown)
        let route = NativeM2RouteDestination(venue: place)
        XCTAssertNil(route.point)
        XCTAssertNil(route.directionsURL(for: .apple))
        XCTAssertNil(route.directionsURL(for: .google))
    }

    func testCatalogOfferingCannotCheckInUsingSourceID() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: venue(), offering: coffee).map(\.id), ["save", "share"])
    }

    func testInvalidatedCatalogOfferingDoesNotBecomeACheckInVenue() {
        // Use an otherwise eligible venue so the catalog exclusion is the
        // reason Check In is suppressed, not the suggestion-ID guard.
        let eligibleVenue = NativeVenueSummary(id: "venue-1", name: "Local Cafe",
            category: "coffee", address: "1 Example Street", distance: "—", rating: nil,
            latitude: 33.78, longitude: -84.38, crowd: nil,
            parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—", isKnown: false),
            verifiedPatchId: nil, imageUrl: nil)
        XCTAssertTrue(NativeVenueDetailPresentation.supportsManualCheckIn(eligibleVenue))
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: eligibleVenue, offering: nil,
            isCatalogSource: true).map(\.id), ["save", "share"])
        XCTAssertTrue(NativeM5DetailPolicy.compactActions(for: eligibleVenue).contains { $0.id == "checkIn" })
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: eligibleVenue, offering: coffee)
            .map(\.id), ["save", "share"])
        let suggestion = venue()
        XCTAssertTrue(suggestion.id.hasPrefix("suggestion-"))
        XCTAssertFalse(NativeM5DetailPolicy.compactActions(for: suggestion).contains { $0.id == "checkIn" })
    }

    func testAdaptiveActionRowsRemainCompatibleWithIOS15() throws {
        let shell = try shellSource()
        let card = try region(in: shell, from: "private struct NativeDiscoverFeatureCard: View {",
                              to: "private struct NativeSpecialDiscoverCard: View {")
        let detail = try region(in: shell, from: "    private var placeBottomActions: some View {",
                                to: "    private func placeButton(")
        for (surface, buttons) in [(card, "cardActionButtons"), (detail, "placeActionButtons")] {
            for unsupportedAPI in ["AnyLayout(", "HStackLayout(", "VStackLayout("] {
                XCTAssertFalse(surface.contains(unsupportedAPI))
            }
            XCTAssertTrue(surface.contains("dynamicTypeSize.isAccessibilitySize"))
            XCTAssertTrue(surface.contains("VStack(spacing: 8) { \(buttons) }"))
            XCTAssertTrue(surface.contains("HStack(spacing: 8) { \(buttons) }"))
        }
        XCTAssertTrue(shell.contains("compactActions(for: venue, offering: exactOffering, isCatalogSource: offering != nil)"))
    }

    func testCoffeeContinuationRequiresSuccessfulExactAddAndRunsOnce() throws {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let selection = NativeDiscoverPlanSelection(title: coffee.title, needKind: coffee.category, offering: coffee)
        var intent = NativeDiscoverPlanIntent()
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: UUID(), userID: "user-1"))
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-2"))
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        let next = try XCTUnwrap(intent.takeCoffeeRequest(userID: "user-1"))
        XCTAssertEqual(next.spotID, coffee.sourceId)
        XCTAssertEqual(next.planID, "plan-1")
        XCTAssertEqual(next.userID, "user-1")
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
    }

    func testCancellationNormalPlanAddAndAccountSwapNeverRequest() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let selection = NativeDiscoverPlanSelection(title: coffee.title, needKind: coffee.category, offering: coffee)
        var intent = NativeDiscoverPlanIntent()
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
        intent.begin(selection: selection, userID: "user-1", requestCoffee: false)
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-2"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
    }

    // Source wiring regressions supplement pure policy tests; simulator smoke
    // coverage must still tap both entry points and test accessibility sizes.
    func testCardAndDetailRouteThroughSheetRatherThanImmediateMaps() throws {
        let shell = try shellSource()
        let discover = try region(in: shell, from: "private struct NativeDiscoverView: View {", to: "private struct NativeDiscoverFilterChip: View {")
        XCTAssertTrue(discover.contains(".sheet(item: $routeVenue)"))
        XCTAssertTrue(discover.contains("NativeM2RouteSheet(venue: venue)"))
        XCTAssertTrue(discover.contains("case .route: routeVenue = venueForDetail(card)"))
        XCTAssertTrue(discover.contains("detailVenue = venueForDetail(card)"))
        XCTAssertFalse(discover.contains("openDirectRoute("))
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {", to: "private struct NativeEventRideBookingSheet: View {")
        XCTAssertTrue(detail.contains(".sheet(isPresented: $showRoute) { NativeM2RouteSheet(venue: venue) }"))
        XCTAssertTrue(detail.contains("case .route: showRoute = true"))
        XCTAssertFalse(detail.contains("NativeMapFocusHandoff.store"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showParkingBooking)"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showStayBooking)"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showPartnerMenu)"))
        XCTAssertTrue(detail.contains("var offering: NativePlanBookableOffering? = nil"))
        XCTAssertTrue(detail.contains("var externalURL: URL? = nil"))
        XCTAssertTrue(detail.contains("safeAreaInset(edge: .bottom"))
        for removed in ["NativeVendorCapabilityTable", "native-vendor-capability-table", "vendorReview", "pendingVendorContinuation", "NativeVendorReviewSheet"] {
            XCTAssertFalse(detail.contains(removed), "The venue must not render a capability table or review sheet")
        }
        XCTAssertTrue(detail.contains("requestStatusReady && currentTransaction == nil"))
        XCTAssertTrue(detail.contains("case .requestCoffee: beginDetailPlanSelection(requestCoffee: true)"))
        let card = try region(in: shell, from: "private struct NativeDiscoverFeatureCard: View {", to: "private struct NativeSpecialDiscoverCard: View {")
        XCTAssertFalse(card.contains("NativeVendorCapabilityTable"))
        XCTAssertFalse(card.contains("capabilitySummary"))
        XCTAssertTrue(card.contains("NativeVenueCheckInChip"))
        XCTAssertTrue(card.contains(".background(NativeVendorSurface())"))
        XCTAssertFalse(discover.contains("DEMO"))
    }

    func testRenderedDetailUsesActualMediaAndSafeDynamicTypeSurface() throws {
        let shell = try shellSource()
        let surface = try region(in: shell, from: "    private var placeHeader: some View {", to: "    private func performPlacePrimaryAction() {")
        // The hero still shows the venue's own media, but only once provenance
        // has earned it; `venue.imageUrl` may no longer reach the frame raw.
        XCTAssertTrue(surface.contains("NativeVenueHeroMedia.heroURLs(venueImage: venue.imageUrl"))
        XCTAssertFalse(surface.contains("if let url = venue.imageUrl"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.address(for: venue)"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.hoursUnknown"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.activity(for: venue)"))
        XCTAssertFalse(surface.contains("unsplash"))
        XCTAssertFalse(surface.contains("minimumScaleFactor"))
        XCTAssertFalse(surface.contains("lineLimit(1)"))
        XCTAssertFalse(surface.contains("Free entry"))
        XCTAssertFalse(surface.contains("4.9"))
        XCTAssertTrue(surface.contains("minHeight: 44"))
    }

    func testFinalM5M2CheckInIsSeparateAndUsesOnlyAuthoritativeVenueIdentity() throws {
        var place = venue()
        place.checkInVenueID = place.id
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(place), "Synthetic suggestions remain ineligible")
        let payload: [String: Any] = ["id": "real-venue", "name": "Cafe", "category": "coffee", "lat": 33.78, "lng": -84.38]
        let canonical = try XCTUnwrap(NativeTabContentStore.canonicalVenue(from: payload))
        let reference = try XCTUnwrap(NativeTabContentStore.venue(from: payload))
        XCTAssertTrue(NativeM5DetailPolicy.canValidateVisit(canonical), "Listed capability doesn't block authoritative visit validation")
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(reference))
        var mismatched = canonical
        mismatched.checkInVenueID = "other-venue"
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(mismatched))
        let shell = try shellSource()
        XCTAssertTrue(shell.contains("NativeVenueCheckInChip(venue: venue"))
        let chip = try region(in: shell, from: "private struct NativeVenueCheckInChip", to: "private struct NativeVenueVibeSheet")
        XCTAssertTrue(chip.contains("state.isConfirmed"))
        XCTAssertTrue(chip.contains("NativeVenueVisitLocation.freshCoordinate"))
        XCTAssertTrue(chip.contains("visits.submit(context:"))
        XCTAssertFalse(chip.contains("NativeManualCheckInStore.record"))
        let submit = try region(in: shell, from: "    private func submitCheckIn() async {", to: "    private func detailActionTitle(")
        XCTAssertFalse(submit.contains("NativeManualCheckInStore.record"))
        XCTAssertFalse(submit.contains("didCheckIn = true"))
    }

    func testFinalDetailUtilitiesVibeAndTransactionsAreSuppliedAndSeparate() throws {
        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {", to: "private struct NativeEventRideBookingSheet: View {")
        let rendered = try region(in: detail, from: "    private var placeHeader: some View {", to: "    private func performPlacePrimaryAction() {")
        for optional in ["details?.phoneURL", "details?.menuURL", "details?.websiteURL", "details?.vibeVideoURL"] {
            XCTAssertTrue(rendered.contains(optional), optional)
        }
        XCTAssertTrue(rendered.contains("showVibe = true"))
        XCTAssertTrue(rendered.contains("heroControl(\"Back\""))
        XCTAssertTrue(rendered.contains("NativeM2ArrivalModule(venue: venue"))
        XCTAssertTrue(rendered.contains("currentTransaction?.primaryTitle"))
        XCTAssertTrue(detail.contains("requestStatusReady && currentTransaction == nil"))
        XCTAssertFalse(rendered.contains("PartnerMenu.sample"))
        XCTAssertFalse(rendered.contains("startParkingCheckout"))
        let player = try region(in: shell, from: "private struct NativeVenueVibeSheet", to: "private struct NativeDiscoverPlanDestination")
        XCTAssertTrue(player.contains("Recorded Vibe · not live"))
        XCTAssertTrue(player.contains("player?.pause()"))
    }

    func testDistanceDoesNotPromoteMarketingTextAndSaveIsAccountScoped() throws {
        for raw in ["", "—", "Dining", "Stay", "Near you", "3 min walk"] {
            XCTAssertNil(NativeM5DetailPolicy.distance(raw))
        }
        XCTAssertEqual(NativeM5DetailPolicy.distance("0.4 mi"), "0.4 mi")
        XCTAssertEqual(NativeM5DetailPolicy.distance("Here"), "Here")
        let name = "NativeVenueSavedStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        XCTAssertTrue(NativeVenueSavedState.toggle(venueID: "venue", userID: "one", defaults: defaults))
        XCTAssertTrue(NativeVenueSavedState.contains(venueID: "venue", userID: "one", defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.contains(venueID: "venue", userID: "two", defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.contains(venueID: "venue", userID: nil, defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.toggle(venueID: "venue", userID: "one", defaults: defaults))
    }

    func testDiscoverAndMountedDetailReloadOnAccountInvalidationNotOnlyUserID() throws {
        let shell = try shellSource()
        XCTAssertTrue(shell.contains(".task(id: transactions.accountRevision) { await refreshTransactions() }"))
        XCTAssertTrue(shell.contains(".task(id: transactions.accountRevision) { await refreshDetailTransactions() }"))
        XCTAssertFalse(shell.contains(".task(id: catalogUserID) { await refreshTransactions() }"))
        XCTAssertFalse(shell.contains(".task(id: detailUserID) { await refreshDetailTransactions() }"))
        let credentialChange = try region(in: shell, from: ".onChange(of: sessionStore.token ?? \"\")", to: ".onChange(of: sessionStore.authenticatedUserID)")
        XCTAssertTrue(credentialChange.contains("synchronizePlaceAccount(forceReset: true)"))
    }

    func testHeroAcceptsOnlyOwnedMediaAndFailsClosedOnUnknownProvenance() {
        let owned = URL(string: "https://cdn.bytspot.com/owned.jpg")!
        let borrowed = URL(string: "https://places.example/borrowed.jpg")!

        XCTAssertEqual(NativeVenuePhotoProvenance.parse("bytspot_owned"), .bytspotOwned)
        XCTAssertEqual(NativeVenuePhotoProvenance.parse("party_media"), .partyMedia)
        for unknown: Any? in [nil, "", "google", "owned", 7, ["bytspot_owned"]] {
            XCTAssertEqual(NativeVenuePhotoProvenance.parse(unknown), .borrowed)
        }

        XCTAssertTrue(NativeVenueHeroMedia.heroURLs(venueImage: borrowed,
            provenance: .borrowed, details: nil).isEmpty)
        XCTAssertEqual(NativeVenueHeroMedia.heroURLs(venueImage: owned,
            provenance: .bytspotOwned, details: nil), [owned])
        XCTAssertEqual(NativeVenueHeroMedia.heroURLs(venueImage: owned,
            provenance: .partyMedia, details: nil), [owned])

        var borrowedDetails = NativeVenueRichDetails()
        borrowedDetails.photoURLs = [borrowed]
        borrowedDetails.photoProvenance = .borrowed
        XCTAssertTrue(NativeVenueHeroMedia.heroURLs(venueImage: nil,
            provenance: .borrowed, details: borrowedDetails).isEmpty)

        var ownedDetails = NativeVenueRichDetails()
        ownedDetails.photoURLs = [owned]
        ownedDetails.photoProvenance = .partyMedia
        XCTAssertEqual(NativeVenueHeroMedia.heroURLs(venueImage: nil,
            provenance: .borrowed, details: ownedDetails), [owned])
    }

    func testGooglePhotosStayBorrowedWhenTheyFillAVenueWithNoMedia() {
        let borrowed = URL(string: "https://places.example/borrowed.jpg")!
        var google = NativeVenueRichDetails(source: .googlePlaces(placeID: "abc"))
        google.photoURLs = [borrowed]
        XCTAssertEqual(google.photoProvenance, .borrowed)

        let supplemented = NativeVenueRichDetails().supplementing(with: google)
        XCTAssertEqual(supplemented.photoURLs, [borrowed])
        XCTAssertEqual(supplemented.photoProvenance, .borrowed)
        XCTAssertTrue(NativeVenueHeroMedia.heroURLs(venueImage: nil,
            provenance: .borrowed, details: supplemented).isEmpty)

        var owned = NativeVenueRichDetails()
        owned.photoURLs = [URL(string: "https://cdn.bytspot.com/owned.jpg")!]
        owned.photoProvenance = .bytspotOwned
        XCTAssertEqual(owned.supplementing(with: google).photoProvenance, .bytspotOwned)
    }

    func testUnsuppliedSlotsDimByOneSharedNumberThatClearsContrast() throws {
        // An unsupplied slot is a sentence the screen repeats in several
        // places, so it has to look the same in all of them. Two labels once
        // carried their own 0.45 literal, which is how they would drift.
        XCTAssertEqual(NativeVenueSlotCopy.unsuppliedOpacity, 0.55, accuracy: 0.0001)
        // Measured against the material's composited fill, AA is not crossed
        // until ~0.525 and the first round value clearing the tighter utility
        // tile is 0.53. The floor is set there, not at the 0.52 a nominal
        // colour suggests, so nobody trims to a value that only passes on
        // paper.
        XCTAssertGreaterThanOrEqual(NativeVenueSlotCopy.unsuppliedOpacity, 0.53)
        // And still unmistakably secondary beside a supplied slot.
        XCTAssertLessThan(NativeVenueSlotCopy.unsuppliedOpacity, 0.75)

        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {",
                                to: "private struct NativeEventRideBookingSheet: View {")
        XCTAssertEqual(detail.components(separatedBy: "supplied ? 1 : NativeVenueSlotCopy.unsuppliedOpacity").count - 1, 2,
                       "Both the vibe and utility labels must dim by the shared number.")
        XCTAssertFalse(detail.contains("supplied ? 1 : 0.45"), "A slot reintroduced its own dimming literal.")
    }

    func testEveryDetailSlotStaysPresentWhenNothingIsSupplied() throws {
        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {",
                                to: "private struct NativeEventRideBookingSheet: View {")
        for identifier in ["native-m2-hero-empty", "native-m2-play-vibe-empty",
                           "native-m2-description-empty", "native-m2-price-empty"] {
            XCTAssertTrue(detail.contains(identifier), identifier)
        }
        // The three utility slots share one interpolated identifier, so the
        // empty state is proven at its single source rather than per title.
        XCTAssertTrue(detail.contains("native-m2-utility-\\(title.lowercased())-empty"))
        let utilities = try region(in: detail, from: "    private var venueUtilities: some View {",
                                   to: "    private func utilityLabel(")
        for slot in ["utility(\"Call\"", "utility(\"Menu\"", "utility(\"Site\""] {
            XCTAssertTrue(utilities.contains(slot), slot)
        }
        XCTAssertFalse(utilities.contains("if let url = details?"))
        XCTAssertTrue(detail.contains("NativeVenueHeroMedia.heroURLs(venueImage: venue.imageUrl"))
    }

    /// Book, Order, Request, External and Listed each own one word, one ring and
    /// one colour, defined once and read by every surface.
    func testCardIndicatorVocabularyIsSingleSourcedAndDistinguishable() {
        let all = NativeDiscoverBookableCapability.displayOrder
        XCTAssertEqual(all.map(\.statusLabel), ["Book", "Order", "Request", "External", "Listed"])
        XCTAssertEqual(all.count, NativeDiscoverBookableCapability.allCases.count)
        XCTAssertEqual(all.map(\.ringStyle), [.solid, .segmented, .dashed, .dot, .dot])
        // Blue marks a Bytspot action; an external link or a listing never earns it.
        XCTAssertEqual(all.map(\.actionHex), [0x00BFFF, 0x00BFFF, 0x00BFFF, nil, nil])
        XCTAssertEqual(NativeDiscoverBookableRingStyle.solid.dashPattern, [])
        XCTAssertEqual(NativeDiscoverBookableRingStyle.segmented.dashPattern, [4, 2])
        XCTAssertEqual(NativeDiscoverBookableRingStyle.dashed.dashPattern, [2, 2])
        XCTAssertTrue(all.allSatisfy { !$0.availabilityLine.isEmpty })
        // The presentation may not restate the vocabulary, only forward it.
        let listed = NativeDiscoverBookablePresentation()
        XCTAssertEqual(listed.statusLabel, listed.capability.statusLabel)
        XCTAssertEqual(listed.ringStyle, listed.capability.ringStyle)
        XCTAssertEqual(listed.availabilityLine, listed.capability.availabilityLine)
    }

    /// Ordering is not mounted, so it may only arrive as a server assertion and
    /// the detail must refuse it by name rather than offering booking wording.
    func testOrderIsOnlyEverAServerAssertionAndStaysUnmounted() {
        XCTAssertNotEqual(NativeDiscoverBookablePresentation().capability, .order)
        let ordering = NativeDiscoverBookablePresentation(offering: offering("order", kind: .coffeeSpot, category: "dining"))
        XCTAssertEqual(ordering.capability, .order)
        XCTAssertEqual(ordering.statusLabel, "Order")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: ordering), .unavailable(.order))
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: ordering), "Ordering unavailable")
        XCTAssertTrue(NativeM5DetailPolicy.primaryAction(for: ordering).isUnavailable)
    }

    /// The premium presentation is earned by supply. A rail never selects it.
    func testChassisIsEarnedBySupplyAndNeverByRail() {
        XCTAssertEqual(NativeDiscoverBookableCapability.book.chassis, .premium)
        XCTAssertEqual(NativeDiscoverBookableCapability.order.chassis, .premium)
        XCTAssertEqual(NativeDiscoverBookableCapability.request.chassis, .premium)
        // Bytspot did not earn that hero — the provider did.
        XCTAssertEqual(NativeDiscoverBookableCapability.redirect.chassis, .plain)
        XCTAssertEqual(NativeDiscoverBookableCapability.details.chassis, .plain)

        // Same capability, different rails — identical chassis.
        for rail in ["nightlife", "stay", "eat_drink", "celebrate"] {
            let presentation = NativeDiscoverBookablePresentation(offering: offering("request", kind: .coffeeSpot, category: rail))
            XCTAssertEqual(NativeDiscoverChassisPolicy.chassis(for: presentation, offering: nil), .premium, rail)
        }
    }

    /// A published party is supply, and carries `details` only because it runs
    /// on the RSVP/ticket path. If this fails because someone folded the party
    /// override back into the plain capability switch, every host has been
    /// silently demoted to the plain chassis — restore the override.
    func testPublishedPartyKeepsPremiumDespiteCarryingDetails() {
        let party = offering("details", kind: .party, category: "party")
        let presentation = NativeDiscoverBookablePresentation(offering: party)
        XCTAssertEqual(presentation.capability, .details)
        XCTAssertEqual(presentation.capability.chassis, .plain)
        XCTAssertEqual(NativeDiscoverChassisPolicy.chassis(for: presentation, offering: party), .premium,
                       "A published party must keep the premium chassis; the host supplied admission and capacity.")
        XCTAssertEqual(NativeDiscoverChassisPolicy.chassis(for: .details, isPublishedParty: true), .premium)
        XCTAssertEqual(NativeDiscoverChassisPolicy.chassis(for: .details, isPublishedParty: false), .plain)
    }

    func testStarfieldCarriesSeventyTwoStars() throws {
        let design = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("App/NativeShellDesignSystem.swift"), encoding: .utf8)
        XCTAssertTrue(design.contains("(0..<72).map"))
        XCTAssertTrue(design.contains("144 stars"))
    }

    func testHeroIsOneFullPhotoAndExtraMediaHidesBehindTheCluster() throws {
        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {",
                                to: "private struct NativeEventRideBookingSheet: View {")
        let hero = try region(in: detail, from: "    private var placeHero: some View {",
                              to: "    private func transactionPanel(")
        // One photograph, not a paging filmstrip.
        XCTAssertFalse(hero.contains("TabView"))
        XCTAssertFalse(hero.contains("tabViewStyle"))
        XCTAssertTrue(hero.contains("native-m2-hero-photo"))
        XCTAssertTrue(hero.contains("native-m2-photo-cluster"))
        XCTAssertTrue(hero.contains("native-m2-photo-cluster-strip"))
        // The cluster and its strip only exist when there is more than the hero.
        XCTAssertEqual(hero.components(separatedBy: "galleryURLs.count > 1").count - 1, 2)
        XCTAssertTrue(hero.contains("showPhotoCluster.toggle()"))
        XCTAssertTrue(hero.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertTrue(hero.contains("heroPhotoIndex = index"))
        XCTAssertTrue(hero.contains("reduceMotion ? nil :"))
        XCTAssertTrue(detail.contains("@State private var showPhotoCluster = false"))
    }

    func testOnlyApprovedVenuesAndCatalogSupplyGetTheBytspotDisplay() throws {
        var place = venue()
        XCTAssertFalse(NativeM5DetailPolicy.usesBytspotDisplay(place, isCatalogSource: false))
        XCTAssertTrue(NativeM5DetailPolicy.usesBytspotDisplay(place, isCatalogSource: true))
        place.control = .bytspot
        XCTAssertTrue(NativeM5DetailPolicy.usesBytspotDisplay(place, isCatalogSource: false))

        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {", to: "private struct NativeEventRideBookingSheet: View {")
        XCTAssertTrue(detail.contains("if usesBytspotDisplay { bytspotContent } else { listedContent }"))
        // Container ids must not replace their children's ids.
        for id in ["native-venue-detail", "native-venue-detail-bytspot", "native-venue-detail-listed"] {
            XCTAssertTrue(detail.contains(".accessibilityElement(children: .contain)\n        .accessibilityIdentifier(\"\(id)\")"), id)
        }
        // A controlled venue shows only Bytspot details, never Google's.
        XCTAssertTrue(detail.contains("guard !usesBytspotDisplay, venue.googlePlaceID != nil else { return }"))
        let listed = try region(in: detail, from: "    private var listedContent: some View {", to: "    @ViewBuilder private var listedFacts: some View {")
        for bytspotOnly in ["placeHero", "vibeSlot", "venueUtilities", "placeFacts", "arrivalModule", "NativeVenueSlotCopy",
                            "NativeVenueHeroMedia", "hoursUnknown", "activity(for:", "statusLabel", "availabilityLine"] {
            XCTAssertFalse(listed.contains(bytspotOnly), bytspotOnly)
        }
        for listedAction in ["NativeVenueCheckInChip(venue: venue", "showRoute = true", "details?.googlePhotos",
                             "NativeM5DetailPolicy.googlePhotoCredit(photo)", "details?.phoneURL", "details?.websiteURL"] {
            XCTAssertTrue(listed.contains(listedAction), listedAction)
        }
    }

    func testGooglePhotosKeepEachPhotographerCreditOnItsOwnPhoto() throws {
        let payload: [String: Any] = ["result": ["data": ["place": [
            "placeId": "ChIJ_example-1",
            "photoUrls": ["https://api.bytspot.com/places/photo?name=a", "not a url", "https://api.bytspot.com/places/photo?name=c"],
            "photoAttributions": ["Ada L.", "Dropped", "  "],
        ]]]]
        let details = try XCTUnwrap(NativeVenueDetailsDTO.placeDetails(from: payload, googlePlaceID: "ChIJ_example-1"))
        let photos = try XCTUnwrap(details.googlePhotos)
        XCTAssertEqual(photos.map(\.url.absoluteString), ["https://api.bytspot.com/places/photo?name=a", "https://api.bytspot.com/places/photo?name=c"])
        XCTAssertEqual(photos.map(\.attribution), ["Ada L.", nil])
        XCTAssertEqual(NativeM5DetailPolicy.googlePhotoCredit(photos[0]), "Photo: Ada L. · Google")
        XCTAssertEqual(NativeM5DetailPolicy.googlePhotoCredit(photos[1]), "Photo from Google")
        // Supplementing a venue's own details keeps Google's photos separate.
        let merged = NativeVenueRichDetails(description: "Own").supplementing(with: details)
        XCTAssertEqual(merged.googlePhotos, photos)
        XCTAssertNil(NativeVenueDetailsDTO.googlePhotos(nil, attributions: nil))
    }

    /// Arrival's ride rows only mount for a destination they can name, so a
    /// card that knew where it was must not arrive at the detail as (0, 0).
    /// This broke Uber and Lyft on every place opened from Discover: the
    /// providers were correct and their tests passed, but no venue ever
    /// reached them with coordinates.
    func testACardWithCoordinatesReachesTheDetailWithThem() throws {
        let located = NativeLocationAwareUIContent.unresolvedVenue(
            id: "ponce", name: "Ponce City Market", category: "market",
            address: "675 Ponce De Leon Ave NE", distance: "0.8 mi", imageURL: nil,
            sourceCategory: "Market", latitude: 33.7726, longitude: -84.3654)
        XCTAssertTrue(located.hasKnownCoordinates)

        let destination = NativeM2RouteDestination(venue: located)
        for provider in NativeM2RideProvider.allCases {
            XCTAssertNotNil(destination.rideURL(for: provider),
                            "\(provider.title) must mount for a venue with coordinates.")
        }

        // A genuinely location-less suggestion still reads as coordinate-free
        // rather than as a venue sitting in the Gulf of Guinea.
        let unlocated = venue()
        XCTAssertFalse(unlocated.hasKnownCoordinates)
        for provider in NativeM2RideProvider.allCases {
            XCTAssertNil(NativeM2RouteDestination(venue: unlocated).rideURL(for: provider))
        }
    }

    /// Every conversion that builds a detail from a card must forward the
    /// coordinates the card carried. Scans all call sites rather than named
    /// functions: the names are ambiguous (there are three `venueForDetail`
    /// overloads, one a thin wrapper) and a future call site would otherwise
    /// be added without this guard noticing.
    func testEveryCardToDetailConversionForwardsCoordinates() throws {
        let source = try shellSource()
        var searchStart = source.startIndex
        var checked = 0

        while let found = source.range(of: "unresolvedVenue(", range: searchStart..<source.endIndex) {
            searchStart = found.upperBound
            // Skip the declaration itself; we only care about callers.
            let prefix = source[..<found.lowerBound].suffix(20)
            if prefix.contains("func ") { continue }

            let call = String(source[found.upperBound...].prefix(600))
            let arguments = String(call.prefix(upTo: call.firstIndex(of: "\n") ?? call.endIndex))
            guard arguments.contains("card.") else { continue }

            checked += 1
            XCTAssertTrue(arguments.contains("latitude: card.latitude"),
                          "A card→detail conversion drops the card's latitude, so Arrival loses its ride providers: \(arguments)")
            XCTAssertTrue(arguments.contains("longitude: card.longitude"),
                          "A card→detail conversion drops the card's longitude, so Arrival loses its ride providers: \(arguments)")
        }

        XCTAssertEqual(checked, 2, "Expected exactly two card→detail conversions; if this changed, the new one needs the same guard.")
    }

    func testDetailRideOffersUberAndLyftOnly() throws {
        let arrival = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("App/NativeM2RouteSheet.swift"), encoding: .utf8)
        XCTAssertTrue(arrival.contains("case uber, lyft\n"))
        for removed in ["privateCar", "elite", "Elite", "unconnectedDetail"] {
            XCTAssertFalse(arrival.contains(removed), removed)
        }
    }

    private func shellSource() throws -> String {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("App/NativeShellView.swift")
        return try String(contentsOf: path, encoding: .utf8)
    }

    private func region(in source: String, from start: String, to end: String) throws -> String {
        let begin = try XCTUnwrap(source.range(of: start))
        let finish = try XCTUnwrap(source.range(of: end, range: begin.upperBound..<source.endIndex))
        return String(source[begin.lowerBound..<finish.lowerBound])
    }
}

@MainActor
final class NativeDiscoverTransactionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 2_000_000_000)

    private func offering(sourceID: String = "spot-1", kind: NativePlanBookableSelection.SourceKind = .coffeeSpot,
                          capability: String = "request") -> NativePlanBookableOffering {
        .init(id: "catalog-1", sourceKind: kind, sourceId: sourceID, category: "coffee",
              title: "Same cafe title", subtitle: nil, capability: capability)
    }

    private func item(spotID: String? = "spot-1", reservationID: String? = "reservation-1",
                      status: String = "pending", reservationStatus: String? = "pending",
                      expiry: String? = nil, hasReservation: Bool = true) -> NativePlan.Item {
        .init(id: "item-1", needKind: "coffee", title: "Same cafe title", partyId: nil,
              coffeeReservationId: reservationID, coffeeSpotId: spotID, selectionKey: "coffeeSpot:spot-1",
              booked: true, capability: "request", status: status,
              reservation: hasReservation ? .init(holdExpiresAt: expiry, status: reservationStatus) : nil)
    }

    private func plan(_ items: [NativePlan.Item], id: String = "plan-1", creator: String = "user-1") -> NativePlan {
        .init(id: id, title: "Coffee Plan", intent: "Coffee", creatorUserId: creator,
              startsAt: nil, endsAt: nil, areaLabel: nil, partySize: nil, needs: ["coffee"],
              lifecycle: "confirmed", state: "booked",
              readiness: .init(going: 1, maybe: 0, pending: 0, declined: 0, total: 1), openNeeds: [],
              participants: [.init(userId: "user-1", role: "guest", status: "accepted")], items: items,
              joinToken: nil)
    }

    private func project(_ plans: [NativePlan], offering: NativePlanBookableOffering? = nil,
                         userID: String? = "user-1") -> NativeDiscoverTransaction? {
        NativeDiscoverTransaction.transaction(for: offering ?? self.offering(), plans: plans, userID: userID, now: now)
    }

    func testExactSourceAndRealReservationContinueToExistingPlan() throws {
        let transaction = try XCTUnwrap(project([plan([item()])]))
        XCTAssertEqual(transaction.planID, "plan-1")
        XCTAssertEqual(transaction.planTitle, "Coffee Plan")
        XCTAssertEqual(transaction.reservationID, "reservation-1")
        XCTAssertEqual(transaction.statusLabel, "Requested")
        XCTAssertEqual(transaction.primaryTitle, "View request")
        XCTAssertTrue(transaction.detail.contains("subject to host acceptance"))
    }

    func testTitlesSelectionKeysAndReservationIDsCannotSubstituteForExactSource() {
        // Every row keeps the same title and matching selectionKey; none has
        // the exact source identity required to continue this offering.
        for spotID in [nil, "spot-2", "SPOT-1", " spot-1", "spot-1 "] as [String?] {
            XCTAssertNil(project([plan([item(spotID: spotID)])]))
        }
        XCTAssertNil(project([plan([item(spotID: nil, reservationID: "spot-1")])]))
        XCTAssertNil(project([plan([item()])], offering: offering(sourceID: "spot-2")))
    }

    func testBareSelectionReferenceAndMissingReservationSummaryNeverProject() {
        for reservationID in [nil, "", "  "] as [String?] {
            XCTAssertNil(project([plan([item(reservationID: reservationID)])]))
        }
        XCTAssertNil(project([plan([item(hasReservation: false)])]))
        XCTAssertNil(project([plan([item(spotID: nil, reservationID: nil, hasReservation: false)])]))
    }

    func testUnsupportedOfferingsNeverInventTransactions() {
        for capability in ["book", "details", "redirect"] {
            XCTAssertNil(project([plan([item()])], offering: offering(capability: capability)))
        }
        XCTAssertNil(project([plan([item()])], offering: offering(kind: .party)))
        XCTAssertNil(project([plan([item(spotID: "")])], offering: offering(sourceID: "")))
    }

    func testAcceptedAndConfirmedHoldsAreRequestedNotPaidOrBooked() throws {
        for status in ["pending", "accepted", "confirmed"] {
            let transaction = try XCTUnwrap(project([plan([item(status: "booked", reservationStatus: status)])]))
            // Both Plan.state and item.booked deliberately claim booked in
            // the fixture. Neither can promote a coffee hold into payment.
            XCTAssertEqual(transaction.statusLabel, "Requested")
            XCTAssertEqual(transaction.primaryTitle, "View request")
            XCTAssertNotEqual(transaction.statusLabel, "Booked")
            if status != "pending" {
                XCTAssertTrue(transaction.detail.contains("not a paid booking confirmation"))
            }
        }
    }

    func testTerminalReservationAndItemStatusesUseDetails() throws {
        for (status, label) in [("expired", "Expired"), ("cancelled", "Cancelled"), ("declined", "Declined")] {
            for row in [item(reservationStatus: status), item(status: status)] {
                let transaction = try XCTUnwrap(project([plan([row])]))
                XCTAssertEqual(transaction.statusLabel, label)
                XCTAssertEqual(transaction.primaryTitle, "View details")
            }
        }
    }

    func testPendingHoldExpiryUsesActualWindowIncludingBoundaryAndFractionalSeconds() throws {
        let formatter = ISO8601DateFormatter()
        let formats: [ISO8601DateFormatter.Options] = [.withInternetDateTime, [.withInternetDateTime, .withFractionalSeconds]]
        for options in formats {
            formatter.formatOptions = options
            for interval in [-1, 0, 1] as [TimeInterval] {
                let expiry = formatter.string(from: now.addingTimeInterval(interval))
                let transaction = try XCTUnwrap(project([plan([item(expiry: expiry)])]))
                XCTAssertEqual(transaction.statusLabel, interval <= 0 ? "Expired" : "Requested")
            }
        }
        // Confirmed supply is not expired just because the old pending hold
        // window passed. Only a terminal status can end an accepted hold.
        XCTAssertEqual(project([plan([item(reservationStatus: "confirmed", expiry: "2000-01-01T00:00:00Z")])])?.statusLabel, "Requested")
        XCTAssertEqual(project([plan([item(expiry: "invalid-date")])])?.statusLabel, "Requested")
    }

    func testUnknownReservationStatusDoesNotClaimRequestedOrAllowNewAcquisition() {
        for status in [nil, "future-status"] as [String?] {
            let transaction = project([plan([item(reservationStatus: status)])])
            XCTAssertEqual(transaction?.statusLabel, "Status unavailable")
            XCTAssertEqual(transaction?.primaryTitle, "View details")
        }
    }

    func testGuestMembershipAndAnonymousUsersDoNotOwnCreatorsRequest() {
        XCTAssertNil(project([plan([item()], creator: "other-user")]))
        XCTAssertNil(project([plan([item()])], userID: nil))
        XCTAssertNil(project([plan([item()])], userID: ""))
        XCTAssertNil(project([plan([item()])], userID: "user-2"))
    }

    func testLiveRequestWinsOverHistoricalTerminalRequest() {
        let historical = plan([item(reservationStatus: "expired")], id: "old-plan")
        let live = plan([item()], id: "live-plan")
        XCTAssertEqual(project([historical, live])?.planID, "live-plan")
        XCTAssertEqual(project([live, historical])?.planID, "live-plan")
    }

    func testStoreDistinguishesInitialLoadingFailureAndSuccessfulEmptyState() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        XCTAssertFalse(store.hasLoaded)
        XCTAssertFalse(store.isLoading)
        XCTAssertFalse(store.failed)
        await store.refresh(userID: "user-1", load: {
            XCTAssertTrue(store.isLoading)
            XCTAssertFalse(store.hasLoaded)
            throw TestFailure.unavailable
        })
        XCTAssertTrue(store.failed)
        XCTAssertFalse(store.isLoading)
        XCTAssertFalse(store.hasLoaded)
        await store.refresh(userID: "user-1", load: { [] })
        XCTAssertTrue(store.hasLoaded)
        XCTAssertFalse(store.failed)
        XCTAssertFalse(store.isLoading)
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
    }

    func testStoreScopesRowsResetsAccountAndDoesNotLoadWhenSignedOut() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()], creator: "other-user")] })
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()])] })
        XCTAssertNotNil(store.transaction(for: offering(), userID: "user-1"))
        XCTAssertNil(store.transaction(for: offering(), userID: "other-user"))
        store.synchronize(userID: "user-1")
        XCTAssertTrue(store.hasLoaded)
        store.synchronize(userID: "user-1", forceReset: true)
        XCTAssertFalse(store.hasLoaded)
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
        store.synchronize(userID: nil)
        await store.refresh(userID: nil, load: { XCTFail("Signed-out refresh must not load Plans"); return [] })
        XCTAssertNil(store.userID)
        XCTAssertFalse(store.hasLoaded)
    }

    func testConcurrentRefreshCannotReplaceNewerRowsOrReportStaleFailure() async {
        for shouldFail in [false, true] {
            let store = NativeDiscoverTransactionStore()
            let suspended = SuspendedLoad()
            let old = await startRefresh(store, userID: "user-1", suspended: suspended)
            await store.refresh(userID: "user-1", load: { [self.plan([self.item()], id: "new-plan")] })
            suspended.finish(shouldFail ? .failure(TestFailure.unavailable) : .success([plan([item()], id: "stale-plan")]))
            await old.value
            XCTAssertEqual(store.transaction(for: offering(), userID: "user-1")?.planID, "new-plan")
            XCTAssertFalse(store.isLoading)
            XCTAssertFalse(store.failed)
            XCTAssertTrue(store.hasLoaded)
        }
    }

    func testAccountRoundTripAndForceResetInvalidateInFlightRefresh() async {
        for changeAccount in [true, false] {
            let store = NativeDiscoverTransactionStore()
            let suspended = SuspendedLoad()
            let old = await startRefresh(store, userID: "user-1", suspended: suspended)
            if changeAccount {
                store.synchronize(userID: "user-2")
                store.synchronize(userID: "user-1")
            } else {
                store.synchronize(userID: "user-1", forceReset: true)
            }
            suspended.finish(.success([plan([item()])]))
            await old.value
            XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
            XCTAssertFalse(store.hasLoaded)
            XCTAssertFalse(store.isLoading)
            XCTAssertFalse(store.failed)
        }
    }

    func testQueuedOldAccountRefreshCannotRestoreAnotherUsersState() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "new-user")
        await store.refresh(userID: "old-user", load: {
            XCTFail("A queued request for another account must not execute")
            return []
        })
        XCTAssertEqual(store.userID, "new-user")
        XCTAssertFalse(store.hasLoaded)
    }

    func testSameUserCredentialResetPublishesNewRefreshIdentity() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()])] })
        let previousRevision = store.accountRevision
        var revisions: [UUID] = []
        let observation = store.$accountRevision.sink { revisions.append($0) }
        defer { observation.cancel() }

        store.synchronize(userID: "user-1", forceReset: true)

        XCTAssertEqual(store.userID, "user-1")
        XCTAssertNotEqual(store.accountRevision, previousRevision)
        XCTAssertEqual(revisions, [previousRevision, store.accountRevision])
        XCTAssertFalse(store.hasLoaded)
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
        // The newly keyed view task reloads even though its user ID is unchanged.
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()], id: "renewed-plan")] })
        XCTAssertTrue(store.hasLoaded)
        XCTAssertFalse(store.isLoading)
        XCTAssertFalse(store.failed)
        XCTAssertEqual(store.transaction(for: offering(), userID: "user-1")?.planID, "renewed-plan")
        XCTAssertEqual(revisions.count, 2, "Loading and completion must not restart the view task")
    }

    func testRefreshIdentityIsStableUntilAccountOrCredentialInvalidation() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        let signedInRevision = store.accountRevision
        store.synchronize(userID: "user-1")
        await store.refresh(userID: "user-1", load: { throw TestFailure.unavailable })
        XCTAssertEqual(store.accountRevision, signedInRevision)
        await store.refresh(userID: "user-1", load: { [] })
        XCTAssertEqual(store.accountRevision, signedInRevision)

        store.synchronize(userID: "user-2")
        XCTAssertNotEqual(store.accountRevision, signedInRevision)
        let otherRevision = store.accountRevision
        store.synchronize(userID: nil)
        XCTAssertNotEqual(store.accountRevision, otherRevision)
        let signedOutRevision = store.accountRevision
        await store.refresh(userID: nil, load: { XCTFail("Signed-out refresh must not load"); return [] })
        store.synchronize(userID: nil)
        XCTAssertEqual(store.accountRevision, signedOutRevision)
        XCTAssertFalse(store.hasLoaded)
    }

    func testRenewalReloadRejectsStaleSuccessAndFailureFromPreviousCredential() async {
        for shouldFail in [false, true] {
            let store = NativeDiscoverTransactionStore()
            let suspended = SuspendedLoad()
            let old = await startRefresh(store, userID: "user-1", suspended: suspended)
            store.synchronize(userID: "user-1", forceReset: true)
            let renewedRevision = store.accountRevision
            await store.refresh(userID: "user-1", load: { [self.plan([self.item()], id: "renewed-plan")] })
            suspended.finish(shouldFail ? .failure(TestFailure.unavailable) : .success([plan([item()], id: "stale-plan")]))
            await old.value
            XCTAssertEqual(store.accountRevision, renewedRevision)
            XCTAssertTrue(store.hasLoaded)
            XCTAssertFalse(store.failed)
            XCTAssertFalse(store.isLoading)
            XCTAssertEqual(store.transaction(for: offering(), userID: "user-1")?.planID, "renewed-plan")
        }
    }

    private enum TestFailure: Error { case unavailable }

    @MainActor
    private final class SuspendedLoad {
        var onStart: (() -> Void)?
        private var continuation: CheckedContinuation<[NativePlan], Error>?
        func load() async throws -> [NativePlan] {
            try await withCheckedThrowingContinuation {
                continuation = $0
                onStart?()
            }
        }
        func finish(_ result: Result<[NativePlan], Error>) {
            continuation?.resume(with: result)
            continuation = nil
        }
    }

    private func startRefresh(_ store: NativeDiscoverTransactionStore, userID: String,
                              suspended: SuspendedLoad) async -> Task<Void, Never> {
        store.synchronize(userID: userID)
        return await withCheckedContinuation { started in
            let task = Task { await store.refresh(userID: userID, load: { try await suspended.load() }) }
            suspended.onStart = { started.resume(returning: task) }
        }
    }
}
