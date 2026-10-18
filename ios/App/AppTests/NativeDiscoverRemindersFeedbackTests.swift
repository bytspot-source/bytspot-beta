import XCTest
@testable import App

final class NativeDiscoverRemindersFeedbackTests: XCTestCase {
    private let openRow: [String: Any] = [
        "id": "open-party", "title": "Open room", "venueName": "Host's room", "startsAt": "2099-09-28T20:00:00Z",
        "accessMode": "free-rsvp", "capability": "details", "door": "open", "locationHidden": false,
        "hostCategory": "sports", "hostType": "watch-party", "requiredMembershipTier": "green",
        "latitude": 40.7128, "longitude": -74.0060, "distanceMiles": 0.2, "spacesRemaining": 12,
        "coverURL": "https://cdn.bytspot.app/open.jpg"
    ]
    private let approvalRow: [String: Any] = [
        "id": "approval-party", "title": "House night", "venueName": NSNull(), "startsAt": "2099-09-28T20:00:00Z",
        "accessMode": "private-approval", "capability": "request", "door": "approval", "locationHidden": true,
        "hostCategory": "party", "hostType": "house", "requiredMembershipTier": "green",
        "latitude": NSNull(), "longitude": NSNull(), "distanceMiles": NSNull(), "spacesRemaining": 8,
        "coverURL": "https://cdn.bytspot.app/house.jpg"
    ]

    // MARK: Discover wire decoding

    @MainActor
    func testOpenDoorRowKeepsTodaysLabelsAndAddsHostTags() throws {
        let card = try XCTUnwrap(NativeTabContentStore.partyDiscoverCard(from: openRow))
        XCTAssertEqual(card.subtitle, "Host's room")
        XCTAssertEqual(card.distance, "0.2 mi")
        XCTAssertEqual(card.latitude, 40.7128)
        XCTAssertEqual(card.imageUrl?.absoluteString, "https://cdn.bytspot.app/open.jpg")
        XCTAssertNotEqual(card.badgeText, "REQUEST")
        let party = try XCTUnwrap(card.nearbyParty)
        XCTAssertFalse(party.requiresApproval)
        XCTAssertEqual(party.hostCategory, .sports)
        XCTAssertEqual(party.hostType, "watch-party")
        XCTAssertEqual(party.discoverRail, "experience")
    }

    @MainActor
    func testApprovalRowShowsRequestLabelsWithoutPlaceDistanceOrPin() throws {
        let card = try XCTUnwrap(NativeTabContentStore.partyDiscoverCard(from: approvalRow))
        XCTAssertEqual(card.badgeText, "REQUEST")
        XCTAssertEqual(card.categoryLabel, "Host approves guests")
        XCTAssertEqual(card.cta, "Request to join")
        XCTAssertEqual(card.subtitle, "Location after approval")
        XCTAssertEqual(card.distance, "")
        XCTAssertNil(card.latitude)
        XCTAssertNil(card.longitude)
        XCTAssertFalse(card.hasKnownCoordinates)
        XCTAssertEqual(card.imageUrl?.absoluteString, "https://cdn.bytspot.app/house.jpg")
        let party = try XCTUnwrap(card.nearbyParty)
        XCTAssertTrue(party.requiresApproval)
        XCTAssertTrue(party.locationHidden)
        XCTAssertEqual(party.discoverRail, "celebrate")
        let line = NativeDiscoverBrowsePolicy.availabilityLine(offering: nil, nearbyParty: party)
        XCTAssertTrue(line.contains("Host approves guests"))
        XCTAssertFalse(line.contains("mi"))
    }

    @MainActor
    func testApprovalRowSurvivesLocationFilteringWithoutAcquiringCoordinates() throws {
        let card = try XCTUnwrap(NativeTabContentStore.partyDiscoverCard(from: approvalRow))
        let local = NativeLocationCoordinate(latitude: 40.7128, longitude: -74.0060, isFallback: false)
        let kept = NativeTabContentStore.locationAwareCards([card], sourceVenues: [], location: local)
        XCTAssertEqual(kept, [card])
        XCTAssertNil(kept.first?.latitude)
        XCTAssertTrue(NativeTabContentStore.locationAwareCards([card], sourceVenues: [], location: .midtown).isEmpty)
    }

    @MainActor
    func testContradictoryRowsAreRejected() {
        var cases: [(String, [String: Any])] = []
        for (key, value) in [("venueName", "Secret flat" as Any), ("latitude", 40.7 as Any), ("longitude", -74.0 as Any), ("distanceMiles", 0.4 as Any)] {
            var row = approvalRow; row[key] = value; cases.append(("approval+\(key)", row))
        }
        var notHidden = approvalRow; notHidden["locationHidden"] = false; cases.append(("approval visible", notHidden))
        var openHidden = openRow; openHidden["locationHidden"] = true; cases.append(("open hidden", openHidden))
        var unknownDoor = openRow; unknownDoor["door"] = "side"; cases.append(("unknown door", unknownDoor))
        var openApprovalMode = openRow; openApprovalMode["accessMode"] = "private-approval"; cases.append(("open private mode", openApprovalMode))
        var approvalTicket = approvalRow; approvalTicket["accessMode"] = "paid-ticket"; cases.append(("approval ticket", approvalTicket))
        for (label, row) in cases {
            XCTAssertNil(NativeTabContentStore.partyDiscoverCard(from: row), label)
        }
    }

    // MARK: Rail mapping

    @MainActor
    func testEveryHostTypeJoinsAllEventsAndItsCategoryRail() throws {
        let expected: [NativeHostCategory: String] = [
            .nightlife: "nightlife", .music: "events", .sports: "experience", .culture: "experience",
            .outdoor: "experience", .food: "eat_drink", .social: "social", .community: "social",
            .cars: "move", .party: "celebrate"
        ]
        XCTAssertEqual(Set(expected.keys), Set(NativeHostCategory.allCases))
        XCTAssertFalse(NativeHostType.catalog.isEmpty)
        for type in NativeHostType.catalog {
            var row = openRow
            row["id"] = "p-\(type.id)"
            row.removeValue(forKey: "hostCategory")
            row["hostType"] = type.id
            let card = try XCTUnwrap(NativeTabContentStore.partyDiscoverCard(from: row), type.id)
            let rail = try XCTUnwrap(expected[type.category])
            XCTAssertEqual(card.nearbyParty?.discoverRail, rail, type.id)
            XCTAssertTrue(NativeDiscoverBrowsePolicy.matchesInvitation(card, filter: nil), type.id)
            XCTAssertTrue(NativeDiscoverBrowsePolicy.matchesInvitation(card, filter: "events"), type.id)
            XCTAssertTrue(NativeDiscoverBrowsePolicy.matchesInvitation(card, filter: rail), type.id)
            let unrelated = rail == "move" ? "stay" : "move"
            XCTAssertFalse(NativeDiscoverBrowsePolicy.matchesInvitation(card, filter: unrelated), type.id)
        }
    }

    // MARK: Invitation detail with a withheld venue

    func testInviteWithheldVenueOnApprovalDoorReadsAsAfterApproval() throws {
        let row: [String: Any] = [
            "source": "host-studio-party", "id": "approval-party", "title": "House night",
            "scheduledDate": "2099-09-28T20:00:00Z", "accessMode": "private-approval", "tier": "green",
            "locationDisclosure": "public", "locationLabel": NSNull(), "latitude": NSNull(), "longitude": NSNull()
        ]
        let record = try XCTUnwrap(NativePartyPassAPI.record(from: row))
        XCTAssertTrue(record.isLocationWithheld)
        XCTAssertEqual(NativePartyInvitationPresentation(party: record).locationLabel, "Location shared after approval")
        var openDoor = row
        openDoor["accessMode"] = "free-rsvp"
        XCTAssertNil(NativePartyPassAPI.record(from: openDoor), "An open door with no public place stays unavailable")
    }

    // MARK: Push routing

    @MainActor
    private func route(_ payload: [AnyHashable: Any]) throws -> NativeNavigationCoordinator {
        let url = try XCTUnwrap(NativePushURLPolicy.routeURL(from: payload), "\(payload)")
        let navigation = NativeNavigationCoordinator()
        XCTAssertTrue(navigation.handle(url: url), url.absoluteString)
        return navigation
    }

    @MainActor
    func testEveryPushTypeRoutesToItsScreen() throws {
        let partyTypes = ["reminder.party", "party.rsvp", "party.decision.approved", "party.decision.declined", "party.arrival", "party.recap"]
        for type in partyTypes {
            let navigation = try route(["type": type, "url": "https://bytspot.app/party/p_123"])
            guard case .party(let party)? = navigation.requestedDestination else { return XCTFail(type) }
            XCTAssertEqual(party.partyID, "p_123", type)
        }
        let arrival = try route(["type": "reminder.party", "url": "https://bytspot.app/party/p_123?intent=arrival"])
        guard case .party(let arrivalRoute)? = arrival.requestedDestination else { return XCTFail("arrival") }
        XCTAssertEqual(arrivalRoute.intent, "arrival")
        XCTAssertNil(NativePartyPassRoute(url: URL(string: "https://bytspot.app/party/p_1?intent=pay")!)?.intent)

        for type in ["reminder.plan", "plan.item_added"] {
            let navigation = try route(["type": type, "url": "https://bytspot.app/plan/plan_9"])
            XCTAssertEqual(navigation.requestedTab, .plan, type)
            XCTAssertEqual(navigation.requestedDestination, .plan(planId: "plan_9", token: nil), type)
        }

        for kind in NativeFeedbackTargetKind.allCases {
            let navigation = try route(["type": "feedback.request", "url": "https://bytspot.app/feedback?kind=\(kind.rawValue)&id=t_1"])
            XCTAssertEqual(navigation.requestedFeedback?.kind, kind)
            XCTAssertEqual(navigation.requestedFeedback?.targetID, "t_1")
            XCTAssertEqual(navigation.requestedTab, .home)
        }

        for type in ["offer.accepted", "offer-refunded"] {
            XCTAssertTrue(try route(["type": type, "url": "https://bytspot.app/requests"]).requestsRequested, type)
        }
        for type in ["ticket.purchased", "ticket-refunded"] {
            XCTAssertEqual(try route(["type": type, "url": "https://bytspot.app/access"]).requestedDestination, .accessWallet, type)
        }
        XCTAssertNotNil(NativePushURLPolicy.routeURL(from: ["url": "bytspot://feedback?kind=plan&id=t_2"]))
        XCTAssertNotNil(NativePushURLPolicy.routeURL(from: ["url": "bytspot://plan/plan_9"]))
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["url": "https://evil.example/feedback?kind=party&id=x"]))
    }

    func testFeedbackRouteRejectsMalformedLinks() {
        for raw in ["https://bytspot.app/feedback?kind=venue&id=x", "https://bytspot.app/feedback?kind=party",
                    "https://bytspot.app/feedback?kind=party&id=", "https://bytspot.app/feedback/extra?kind=party&id=x",
                    "https://other.app/feedback?kind=party&id=x"] {
            XCTAssertNil(NativeFeedbackRoute(url: URL(string: raw)!), raw)
        }
        XCTAssertEqual(NativeFeedbackRoute(url: URL(string: "bytspot://feedback?kind=PARTY&id=p1")!)?.target.kind, .party)
    }

    // MARK: Feedback

    func testFeedbackDraftRequiresARatingAndCapsTheNote() throws {
        let target = try XCTUnwrap(NativeFeedbackTarget(kind: "party", targetID: "p1"))
        var draft = NativeFeedbackDraft()
        XCTAssertFalse(draft.canSubmit)
        XCTAssertNil(draft.input(for: target))
        draft.rating = 6
        XCTAssertFalse(draft.canSubmit)
        draft.rating = 4
        draft.tags = ["Safety", "Music"]
        draft.note = "  great host  "
        let input = try XCTUnwrap(draft.input(for: target))
        XCTAssertEqual(input["targetKind"] as? String, "party")
        XCTAssertEqual(input["targetId"] as? String, "p1")
        XCTAssertEqual(input["rating"] as? Int, 4)
        XCTAssertEqual(input["tags"] as? [String], ["Music", "Safety"])
        XCTAssertEqual(input["note"] as? String, "great host")
        draft.note = String(repeating: "a", count: 501)
        XCTAssertFalse(draft.canSubmit)
        draft.note = ""
        draft.tags = ["Invented"]
        XCTAssertFalse(draft.canSubmit)
        draft.tags = []
        XCTAssertNil(try XCTUnwrap(draft.input(for: target))["note"])
    }

    func testPendingListKeepsServerOrderAndDropsUntrustedRows() {
        let payload: [String: Any] = ["pending": [
            ["targetKind": "plan", "targetId": "pl1", "title": "Saturday plan", "coverURL": NSNull(), "endedAt": "2026-10-17T03:00:00Z"],
            ["targetKind": "party", "targetId": "p1", "title": "House night", "coverURL": "https://cdn.bytspot.app/c.jpg", "endedAt": "2026-10-16T03:00:00Z"],
            ["targetKind": "party", "targetId": "p2", "title": "Insecure cover", "coverURL": "http://cdn.bytspot.app/c.jpg", "endedAt": "2026-10-15T03:00:00Z"],
            ["targetKind": "venue", "targetId": "v1", "title": "Unknown kind"],
            ["targetKind": "party", "targetId": "p1", "title": "Duplicate"],
            ["targetKind": "party", "targetId": "p3", "title": " "]
        ]]
        let items = NativeFeedbackPendingItem.list(from: payload)
        XCTAssertEqual(items.map(\.target.targetID), ["pl1", "p1", "p2"])
        XCTAssertNil(items[0].coverURL)
        XCTAssertEqual(items[1].coverURL?.absoluteString, "https://cdn.bytspot.app/c.jpg")
        XCTAssertNil(items[2].coverURL)
        XCTAssertEqual(NativeFeedbackSheet.title(for: items[1], kind: .party), "How was House night?")
        XCTAssertEqual(NativeFeedbackSheet.title(for: nil, kind: .plan), "How was the plan?")
        XCTAssertTrue(NativeFeedbackPendingItem.list(from: ["unexpected": true]).isEmpty)
    }

    func testFeedbackAggregateLabel() {
        XCTAssertEqual(NativePartyFeedbackAggregate(count: 12, average: 4.6).label, "4.6 ★ from 12 guests")
        XCTAssertEqual(NativePartyFeedbackAggregate(count: 1, average: 5).label, "5.0 ★ from 1 guest")
        XCTAssertNil(NativePartyFeedbackAggregate(count: 0, average: nil).label)
        XCTAssertNil(NativePartyFeedbackAggregate(count: 3, average: nil).label)
    }

    func testShowOnDiscoverDefaultsOnOnlyForPartyCategory() {
        XCTAssertTrue(NativeShowOnDiscoverToggle.defaultValue(category: .party))
        XCTAssertFalse(NativeShowOnDiscoverToggle.defaultValue(category: .cars))
    }

    // MARK: Reminder permission throttle

    func testReminderPromptNeedsASignedInUndecidedDeviceAndHonoursTheSevenDayCooldown() {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        XCTAssertTrue(NativeReminderPermissionPolicy.shouldOffer(status: .notDetermined, signedIn: true, declinedAt: nil, now: now))
        XCTAssertFalse(NativeReminderPermissionPolicy.shouldOffer(status: .notDetermined, signedIn: false, declinedAt: nil, now: now))
        for status in [NativePushSystemAlertStatus.enabled, .denied, .restricted] {
            XCTAssertFalse(NativeReminderPermissionPolicy.shouldOffer(status: status, signedIn: true, declinedAt: nil, now: now))
        }
        let sixDays = now.addingTimeInterval(-6 * 24 * 3600)
        let sevenDays = now.addingTimeInterval(-7 * 24 * 3600)
        XCTAssertFalse(NativeReminderPermissionPolicy.shouldOffer(status: .notDetermined, signedIn: true, declinedAt: sixDays, now: now))
        XCTAssertTrue(NativeReminderPermissionPolicy.shouldOffer(status: .notDetermined, signedIn: true, declinedAt: sevenDays, now: now))

        let defaults = UserDefaults(suiteName: "reminder-throttle-\(UUID().uuidString)")!
        XCTAssertNil(NativeReminderPermissionPolicy.declinedAt(in: defaults))
        NativeReminderPermissionPolicy.recordDecline(at: sixDays, in: defaults)
        XCTAssertEqual(NativeReminderPermissionPolicy.declinedAt(in: defaults), sixDays)
    }
}
