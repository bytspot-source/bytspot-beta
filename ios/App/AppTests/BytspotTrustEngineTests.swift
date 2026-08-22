import XCTest
import CoreLocation
import UIKit
@testable import App

private final class NativePartyURLProtocolStub: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    static func bodyData(for request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 1_024)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data.isEmpty ? nil : data
    }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "party.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let (status, data) = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

/// CI-runnable promotion of the launch-time `NativeMapParitySelfTests` pure-function
/// suites for the L2/L3 trust engine. These exercise the same locked, pure API the
/// `precondition` self-tests do (so drift is caught on every PR, not only when the
/// opt-in `BYT_NATIVE_ROOT=1` simulator root boots) — the engine, the descent rings,
/// and the irreversibility invariant. Mirrors contracts/native-trust-contract.json.
final class BytspotTrustEngineTests: XCTestCase {
    private let arm = NativeProximityGate.radiusMeters
    private let exit = NativeProximityGate.exitMeters
    private let floor = NativeProximityGate.accuracyFloorMeters
    private let preStage = NativeProximityGate.preStageMeters
    private let discovery = NativeProximityGate.discoveryMeters

    @MainActor
    func testLocationPermissionRequestPolicyPromptsOnlyWhenUndecided() {
        XCTAssertEqual(NativeLocationStore.requestAction(locationServicesEnabled: true, authorizationState: .notDetermined), .requestWhenInUse)
        XCTAssertEqual(NativeLocationStore.requestAction(locationServicesEnabled: true, authorizationState: .allowed), .requestLocation)
        XCTAssertEqual(NativeLocationStore.requestAction(locationServicesEnabled: true, authorizationState: .denied), .none)
        XCTAssertEqual(NativeLocationStore.requestAction(locationServicesEnabled: true, authorizationState: .restricted), .none)
        XCTAssertEqual(NativeLocationStore.requestAction(locationServicesEnabled: false, authorizationState: .notDetermined), .none)
    }

    @MainActor
    func testNearbyTabsTriggerLocationResolution() {
        XCTAssertTrue(BytspotNativeShellView.requiresLocationForNearbyContent(.discover))
        XCTAssertTrue(BytspotNativeShellView.requiresLocationForNearbyContent(.map))
        XCTAssertFalse(BytspotNativeShellView.requiresLocationForNearbyContent(.home))
        XCTAssertFalse(BytspotNativeShellView.requiresLocationForNearbyContent(.concierge))
        XCTAssertFalse(BytspotNativeShellView.requiresLocationForNearbyContent(.profile))
    }

    @MainActor
    func testDeepLinkedNearbyTabsUseTheLocationResolutionPolicy() throws {
        let coordinator = NativeNavigationCoordinator()
        XCTAssertTrue(coordinator.handle(url: try XCTUnwrap(URL(string: "bytspot://discover"))))
        XCTAssertEqual(coordinator.requestedTab, .discover)
        XCTAssertTrue(BytspotNativeShellView.requiresLocationForNearbyContent(try XCTUnwrap(coordinator.requestedTab)))

        XCTAssertTrue(coordinator.handle(url: try XCTUnwrap(URL(string: "bytspot://map"))))
        XCTAssertEqual(coordinator.requestedTab, .map)
        XCTAssertTrue(BytspotNativeShellView.requiresLocationForNearbyContent(try XCTUnwrap(coordinator.requestedTab)))
    }

    @MainActor
    func testNativeRoutingDoesNotRouteLegacyGroupEvents() throws {
        let coordinator = NativeNavigationCoordinator()
        XCTAssertFalse(coordinator.handle(url: try XCTUnwrap(URL(string: "bytspot://group/legacy-event"))))
        XCTAssertNil(coordinator.requestedDestination)
    }

    @MainActor
    func testNativeRoutingPreservesCanonicalPartyPassHandoffs() throws {
        let coordinator = NativeNavigationCoordinator()
        let universal = try XCTUnwrap(URL(string: "https://bytspot.app/party/party-1?source=host-studio-party&handoff=1"))
        XCTAssertTrue(coordinator.handle(url: universal))
        guard case .party(let universalRoute) = coordinator.requestedDestination else { return XCTFail("Expected Party destination") }
        XCTAssertEqual(universalRoute.partyID, "party-1")

        let deepLink = try XCTUnwrap(URL(string: "bytspot://party/party-1"))
        XCTAssertTrue(coordinator.handle(url: deepLink))
        guard case .party(let deepLinkRoute) = coordinator.requestedDestination else { return XCTFail("Expected Party destination") }
        XCTAssertEqual(deepLinkRoute.partyID, "party-1")
        XCTAssertNil(NativePartyPassRoute(url: try XCTUnwrap(URL(string: "https://example.com/party/party-1"))))
    }

    func testPartyPassContinuationBypassesFirstRunLaunchFlow() throws {
        let partyURL = try XCTUnwrap(URL(string: "https://bytspot.app/party/party-1?checkout=success"))
        let partyRoute = try XCTUnwrap(NativePartyPassRoute(url: partyURL))

        XCTAssertTrue(NativeAuthLaunchContract.bypassesLaunchFlow(for: .party(partyRoute)))
        XCTAssertFalse(NativeAuthLaunchContract.bypassesLaunchFlow(for: .accessWallet))
        XCTAssertFalse(NativeAuthLaunchContract.bypassesLaunchFlow(for: nil))
    }

    func testExternalLinkDestinationsBypassLaunchSuppression() throws {
        // Party share links and Stripe Checkout returns arrive as `.party`
        // destinations during the cold-start / post-auth hold window; they are
        // explicit user intent and must not be swallowed like stale tab requests.
        let partyURL = try XCTUnwrap(URL(string: "https://bytspot.app/party/party-1?checkout=success"))
        let partyRoute = try XCTUnwrap(NativePartyPassRoute(url: partyURL))
        XCTAssertTrue(BytspotNativeShellView.destinationBypassesLaunchSuppression(.party(partyRoute)))

        let patchURL = try XCTUnwrap(URL(string: "https://bytspot.app/p/BYT424-0301"))
        let patchRoute = try XCTUnwrap(BytspotPatchRoute(url: patchURL))
        XCTAssertTrue(BytspotNativeShellView.destinationBypassesLaunchSuppression(.patch(patchRoute)))

        XCTAssertFalse(BytspotNativeShellView.destinationBypassesLaunchSuppression(.profile))
        XCTAssertFalse(BytspotNativeShellView.destinationBypassesLaunchSuppression(.accessWallet))
    }

    private func evidence(
        discovery: Bool = true,
        meters: CLLocationDistance? = nil,
        accuracy: CLLocationAccuracy = 0,
        wasInZone: Bool = false,
        token: Bool = false,
        nfc: Bool = false
    ) -> BytspotTrustEvidence {
        BytspotTrustEvidence(staticDiscoveryReached: discovery, nearestVerifiedMeters: meters, horizontalAccuracy: accuracy, wasInZone: wasInZone, signedTokenVerified: token, nfcCounterVerified: nfc)
    }

    // MARK: - directScanPermitted (the load-bearing L2 gate)

    func testGateDeniedWhenDistanceUnknown() {
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: nil))
    }

    func testGateBoundaryArmsAtRadiusAndInside() {
        XCTAssertTrue(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: arm))
        XCTAssertTrue(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: 0))
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: arm + 1))
    }

    func testGateAccuracyFusionFailsafe() {
        XCTAssertTrue(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: floor))
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: floor + 1))
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: -1))
    }

    func testGateSchmittHysteresis() {
        let between = arm + 5
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: between, wasInZone: false))
        XCTAssertTrue(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: between, wasInZone: true))
        XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: exit + 1, wasInZone: true))
        XCTAssertGreaterThan(exit, arm, "Schmitt release radius must be wider than the arm radius.")
    }

    // MARK: - BytspotTrustEngine.reduce (the single authority)

    func testReducerFailSafeBaseline() {
        XCTAssertEqual(BytspotTrustEngine.reduce(.none), .anonymous)
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(discovery: false, meters: 0, token: true, nfc: true)), .anonymous)
    }

    func testReducerL2FailSafeOnBadLocation() {
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(meters: nil)), .staticDiscovery)
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(meters: 0, accuracy: -1)), .staticDiscovery)
    }

    func testReducerNoRungSkip() {
        let outOfZone: CLLocationDistance = 9_999
        let inZone = arm - 10
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(meters: outOfZone, token: true, nfc: true)), .staticDiscovery)
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(meters: inZone, nfc: true)), .proximate)
    }

    func testReducerStrictMonotonicity() {
        let outOfZone: CLLocationDistance = 9_999
        let inZone = arm - 10
        let ladder: [BytspotTrustLevel] = [
            BytspotTrustEngine.reduce(evidence(meters: outOfZone)),
            BytspotTrustEngine.reduce(evidence(meters: inZone)),
            BytspotTrustEngine.reduce(evidence(meters: inZone, token: true)),
            BytspotTrustEngine.reduce(evidence(meters: inZone, token: true, nfc: true)),
        ]
        XCTAssertEqual(ladder, [.staticDiscovery, .proximate, .signedToken, .nfcCounterVerified])
        XCTAssertTrue(zip(ladder, ladder.dropFirst()).allSatisfy { $0 < $1 }, "Reducer must be strictly monotonic as evidence accrues.")
    }

    func testReducerL2RungMatchesGate() {
        let inZone = arm - 10
        XCTAssertEqual(BytspotTrustEngine.reduce(evidence(meters: inZone)) >= .proximate, NativeProximityGate.directScanPermitted(nearestVerifiedMeters: inZone))
    }

    // MARK: - Advisory descent rings (WS-A #3) — must leak no trust

    func testDescentRingConstantsAndNesting() {
        XCTAssertEqual(preStage, 250)
        XCTAssertEqual(discovery, 600)
        XCTAssertTrue(discovery > preStage && preStage > arm, "Rings must nest strictly outside the arm radius.")
    }

    func testDescentStageClassificationBoundaries() {
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: nil), .faraway)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: 0), .armed)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: arm), .armed)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: arm + 1), .preStage)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: preStage), .preStage)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: preStage + 1), .discovery)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: discovery), .discovery)
        XCTAssertEqual(NativeProximityGate.descentStage(nearestVerifiedMeters: discovery + 1), .faraway)
    }

    func testDescentRingsGrantNoTrust() {
        func reduced(at meters: CLLocationDistance) -> BytspotTrustLevel {
            BytspotTrustEngine.reduce(evidence(meters: meters))
        }
        for meters in [discovery, preStage, arm + 1] {
            XCTAssertFalse(NativeProximityGate.directScanPermitted(nearestVerifiedMeters: meters), "An advisory ring must never permit direct scan.")
            XCTAssertEqual(reduced(at: meters), .staticDiscovery, "An advisory ring must never raise trust above L1.")
        }
        for meters in [discovery, preStage, arm + 1, arm, 0] {
            let armed = NativeProximityGate.descentStage(nearestVerifiedMeters: meters) == .armed
            XCTAssertEqual(armed, NativeProximityGate.directScanPermitted(nearestVerifiedMeters: meters), "Descent .armed must coincide exactly with the gate.")
        }
    }

    // MARK: - Capability matrix + irreversibility invariant (WS-A #4)

    func testCapabilityMatrix() {
        XCTAssertEqual(BytspotTrustCapability.initiateDirectScan.requiredLevel, .proximate)
        XCTAssertEqual(BytspotTrustCapability.saveToWallet.requiredLevel, .staticDiscovery)
        XCTAssertEqual(BytspotTrustCapability.createCheckoutHold.requiredLevel, .signedToken)
        XCTAssertEqual(BytspotTrustCapability.burnOneTimeAccess.requiredLevel, .nfcCounterVerified)
    }

    func testNoIrreversibleCapabilityAtOrBelowL2() {
        XCTAssertEqual(Set(BytspotTrustCapability.allCases.filter(\.isIrreversible)), [.createCheckoutHold, .burnOneTimeAccess])
        XCTAssertTrue(BytspotTrustCapability.allCases.filter(\.isIrreversible).allSatisfy { $0.requiredLevel > .proximate }, "An irreversible capability must require trust above L2 (proximate).")
    }

    // MARK: - Native Venue Details contract (WS-C)

    func testVenueDetailSurfaceIsL0ReadOnly() {
        XCTAssertEqual(NativeVenueDetailContract.surfaceCapability, .viewVenue)
        XCTAssertEqual(NativeVenueDetailContract.surfaceCapability.requiredLevel, .anonymous)
    }

    func testVenueDetailActionsMirrorContract() {
        XCTAssertEqual(NativeVenueDetailContract.checkinEndpoint, "venues.checkin")
        XCTAssertTrue(NativeVenueDetailContract.checkinIdempotent)
        XCTAssertEqual(NativeVenueDetailContract.actionIDs, ["navigate", "call", "share", "save", "getTickets", "checkIn", "concierge", "bookRide"])
    }

    func testVenueDetailCapabilityBindings() {
        XCTAssertEqual(NativeVenueDetailContract.actions.first(where: { $0.id == "getTickets" })?.kind, .capability(.saveToWallet))
        XCTAssertEqual(NativeVenueDetailContract.actions.first(where: { $0.id == "bookRide" })?.kind, .device)
        XCTAssertEqual(NativeVenueDetailContract.actions.first(where: { $0.id == "checkIn" })?.kind, .authedWrite(endpoint: "venues.checkin", idempotent: true))
    }

    func testManualCheckInEligibilityStaysVenueOnly() {
        XCTAssertTrue(NativeVenueDetailPresentation.supportsManualCheckIn(venue(name: "Nightlife Momentum", category: "nightlife", address: "Social venue")))
        XCTAssertTrue(NativeVenueDetailPresentation.supportsManualCheckIn(venue(name: "Morning Coffee Walk", category: "coffee", address: "Coffee nearby")))
        XCTAssertFalse(NativeVenueDetailPresentation.supportsManualCheckIn(venue(name: "Midtown Smart Parking", category: "parking", address: "Parking garage")))
        XCTAssertFalse(NativeVenueDetailPresentation.supportsManualCheckIn(venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass")))
    }

    func testManualCheckInStoreScopesHistoryAndPointsByAccount() {
        let accountA = NativeManualCheckInScope.testingAccount("manual-checkin-a-\(UUID().uuidString)")
        let accountB = NativeManualCheckInScope.testingAccount("manual-checkin-b-\(UUID().uuidString)")
        defer { NativeManualCheckInStore.clear(scope: accountA); NativeManualCheckInStore.clear(scope: accountB) }
        let checkedVenue = venue(name: "Account A Coffee", category: "coffee", address: "One profile only")
        let checkedAt = Date(timeIntervalSince1970: 1_735_000_000)
        let accountBBaseline = NativeManualCheckInStore.pointsBalance(scope: accountB)

        let (record, created) = NativeManualCheckInStore.record(venue: checkedVenue, idempotencyKey: "scope-a", scope: accountA, date: checkedAt)

        XCTAssertTrue(created)
        XCTAssertEqual(NativeManualCheckInStore.all(scope: accountA).map(\.id), [record.id])
        XCTAssertTrue(NativeManualCheckInStore.all(scope: accountB).isEmpty)
        XCTAssertEqual(NativeManualCheckInStore.pendingPoints(scope: accountA), NativeManualCheckInStore.manualPointAward)
        XCTAssertEqual(NativeManualCheckInStore.pointsBalance(scope: accountA), accountBBaseline + NativeManualCheckInStore.manualPointAward)
        XCTAssertEqual(NativeManualCheckInStore.pointsBalance(scope: accountB), accountBBaseline)
        XCTAssertTrue(NativeManualCheckInStore.hasRecentCheckIn(venueID: checkedVenue.id, scope: accountA, now: checkedAt.addingTimeInterval(60)))
        XCTAssertFalse(NativeManualCheckInStore.hasRecentCheckIn(venueID: checkedVenue.id, scope: accountB, now: checkedAt.addingTimeInterval(60)))
    }

    func testManualCheckInStoreSignedOutScopeDoesNotExposeLegacyOrAccountRecords() throws {
        let account = NativeManualCheckInScope.testingAccount("manual-checkin-private-\(UUID().uuidString)")
        defer { NativeManualCheckInStore.clear(scope: account); UserDefaults.standard.removeObject(forKey: NativeManualCheckInStore.legacyStorageKey) }
        let checkedVenue = venue(name: "Private Dinner", category: "dining", address: "Account scoped")
        let legacyRecord = NativeManualCheckInRecord.manual(venue: checkedVenue, idempotencyKey: "legacy", date: Date(timeIntervalSince1970: 1_735_000_100))
        let signedOutBaseline = NativeManualCheckInStore.pointsBalance(scope: .signedOut)
        UserDefaults.standard.set(try JSONEncoder().encode([legacyRecord]), forKey: NativeManualCheckInStore.legacyStorageKey)
        _ = NativeManualCheckInStore.record(venue: checkedVenue, idempotencyKey: "account", scope: account, date: Date(timeIntervalSince1970: 1_735_000_200))

        XCTAssertTrue(NativeManualCheckInStore.all(scope: .signedOut).isEmpty)
        XCTAssertNil(UserDefaults.standard.data(forKey: NativeManualCheckInStore.legacyStorageKey))
        XCTAssertEqual(NativeManualCheckInStore.pointsBalance(scope: .signedOut), signedOutBaseline)
        XCTAssertFalse(NativeManualCheckInStore.hasRecentCheckIn(venueID: checkedVenue.id, scope: .signedOut, now: Date(timeIntervalSince1970: 1_735_000_260)))
    }

    func testManualCheckInSyncContextUsesCapturedTokenAfterSessionSwitch() throws {
        var liveToken: String? = "account-a-token"
        let context = NativeManualCheckInSyncContext.authenticated(token: liveToken)
        let accountAScope = context.scope
        liveToken = "account-b-token"

        let request = try context.apiClient().makeRequest(path: "/trpc/venues.checkin")

        XCTAssertTrue(context.canSync)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer account-a-token")
        XCTAssertNotEqual(NativeManualCheckInScope.authenticated(token: liveToken), accountAScope)
    }

    func testNativeCheckInV2ContractLocksManualCreateInput() throws {
        XCTAssertEqual(NativeCheckInV2Contract.createRoute, "/trpc/checkins.create")
        XCTAssertEqual(NativeCheckInV2Contract.providerCountsRoute, "/trpc/checkins.providerCounts")

        let input = NativeCheckInV2Contract.manualCreateInput(venueId: "venue-42", idempotencyKey: "idem-42", observedAt: "2026-07-17T12:00:00Z", patchId: "BYT424-0301-P")
        XCTAssertEqual(input["venueId"] as? String, "venue-42")
        XCTAssertEqual(input["idempotencyKey"] as? String, "idem-42")
        XCTAssertEqual(input["trustLevel"] as? String, "staticDiscovery")
        XCTAssertEqual(input["source"] as? String, "native_ios_manual")
        XCTAssertEqual(input["patchId"] as? String, "BYT424-0301-P")
    }

    func testNativeCheckInV2UsesStandardTRPCEnvelope() throws {
        let input = NativeCheckInV2Contract.manualCreateInput(venueId: "venue-42", idempotencyKey: "idem-42")
        let body = try JSONSerialization.data(withJSONObject: ["json": input])
        let bodyObject = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let json = try XCTUnwrap(bodyObject["json"] as? [String: Any])

        XCTAssertEqual(json["venueId"] as? String, "venue-42")
        XCTAssertEqual(json["trustLevel"] as? String, "staticDiscovery")
        XCTAssertNil(bodyObject["venueId"], "v2 checkins use the standard tRPC json envelope, unlike transformer-less groupEvents routes.")
    }

    func testNativeLiveContentV2ContractLocksExternalAdapterRoutes() throws {
        XCTAssertEqual(NativeLiveContentV2Contract.eventsListRoute, "/trpc/events.list")
        XCTAssertEqual(NativeLiveContentV2Contract.ticketmasterProvider, "ticketmaster")
        XCTAssertEqual(NativeLiveContentV2Contract.placesEnrichRoute, "/trpc/places.enrich")
        XCTAssertEqual(NativeLiveContentV2Contract.vendorsMatchRoute, "/trpc/vendors.match")
        XCTAssertEqual(NativeLiveContentV2Contract.venueIntelligenceRoute, "/trpc/venues.intelligence")
        XCTAssertEqual(NativeLiveContentV2Contract.googleRoutesProxyStatus, "pending_backend_route")
        XCTAssertEqual(NativeLiveContentV2Contract.parkingSearchRoute, "/trpc/parking.search")
        XCTAssertEqual(NativeLiveContentV2Contract.parkingQuoteRoute, "/trpc/parking.quote")
        XCTAssertEqual(NativeLiveContentV2Contract.parkingReserveRoute, "/trpc/parking.reserve")
        XCTAssertEqual(NativeLiveContentV2Contract.parkingAvailabilityRoute, "/trpc/parking.availability")
        XCTAssertEqual(NativeLiveContentV2Contract.parkingCancelRoute, "/trpc/parking.cancel")
        XCTAssertEqual(NativeLiveContentV2Contract.menusListRoute, "/trpc/menus.list")
        XCTAssertEqual(NativeLiveContentV2Contract.menusGetRoute, "/trpc/menus.get")
        XCTAssertEqual(NativeLiveContentV2Contract.ordersQuoteRoute, "/trpc/orders.quote")
        XCTAssertEqual(NativeLiveContentV2Contract.ordersCreateRoute, "/trpc/orders.create")
        XCTAssertEqual(NativeLiveContentV2Contract.tablesSearchRoute, "/trpc/tables.search")
        XCTAssertEqual(NativeLiveContentV2Contract.tablesReserveRoute, "/trpc/tables.reserve")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsListRoute, "/trpc/social.groups.list")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsCreateRoute, "/trpc/social.groups.create")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsDeleteRoute, "/trpc/social.groups.delete")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsMembersAddRoute, "/trpc/social.groups.members.add")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesCreateRoute, "/trpc/social.invites.create")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesListRoute, "/trpc/social.invites.list")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesRespondRoute, "/trpc/social.invites.respond")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesCancelRoute, "/trpc/social.invites.cancel")
        XCTAssertEqual(NativeLiveContentV2Contract.partyDraftDeleteRoute, "/trpc/events.drafts.delete")
    }

    func testVenueDetailPresentationUsesCategorySpecificPrimaryLabels() {
        let primaryAction = NativeVenueDetailContract.actions.first { $0.id == "getTickets" }!
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking · Pickup or delivery")), "View Menu")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass · Premium Event Access")), "View Pass")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Events Worth Leaving For", category: "entertainment", address: "Shows and event experiences")), "Get Tickets")
    }

    // MARK: - Discover card control gate (local vs vendor)

    func testDiscoverControlGateOnlyControlsCanonicalVendorsAndRealPatches() {
        // Canonical vendor IDs are controlled.
        XCTAssertTrue(NativeDiscoverCardControl.isControlled(cardID: "broni-home-taste"))
        XCTAssertTrue(NativeDiscoverCardControl.isControlled(cardID: "gh-akwaaba-pass"))
        // Local dining/coverage/Google-shaped IDs are not.
        XCTAssertFalse(NativeDiscoverCardControl.isControlled(cardID: "dinner-vibe"))
        XCTAssertFalse(NativeDiscoverCardControl.isControlled(cardID: "coverage-dining-1-dinner-vibe"))
        // A real hardware patch controls the venue; the DISCOVER-VERIFIED pseudo-badge does not.
        XCTAssertTrue(NativeDiscoverCardControl.isControlled(venue: venue(name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", patchId: "BYT424-0301-P")))
        XCTAssertFalse(NativeDiscoverCardControl.isControlled(venue: venue(name: "Local Diner", category: "dining", address: "Somewhere", patchId: "DISCOVER-VERIFIED")))
        XCTAssertFalse(NativeDiscoverCardControl.isControlled(venue: venue(name: "Local Diner", category: "dining", address: "Somewhere", patchId: nil)))
    }

    func testLocalDiningVenueNeverEarnsMenuChrome() {
        let primaryAction = NativeVenueDetailContract.actions.first { $0.id == "getTickets" }!
        let localDiner = venue(name: "Local Diner", category: "dining", address: "Open now")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: localDiner), "Plan Dining")
        XCTAssertEqual(NativeVenueDetailPresentation.actionSystemImage(for: primaryAction, venue: localDiner), "fork.knife")
        let section = NativeVenueDetailPresentation.detailSection(for: localDiner)
        XCTAssertEqual(section?.title, "Good for")
        XCTAssertFalse(section?.highlights.contains("Menu preview") ?? true, "Local dining must not advertise menu items.")
    }

    func testControlledDiningVenueKeepsMenuChrome() {
        let primaryAction = NativeVenueDetailContract.actions.first { $0.id == "getTickets" }!
        let patchDiner = venue(name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", patchId: "BYT424-0301-P")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: patchDiner), "View Menu")
        XCTAssertEqual(NativeVenueDetailPresentation.detailSection(for: patchDiner)?.title, "Included")
    }

    func testCanonicalDiscoverCardsCarryVendorControlAndClonesStayLocal() {
        XCTAssertTrue(NativeTabContentSnapshot.canonicalServiceCards.allSatisfy { $0.control == NativeDiscoverCardControl.vendor })
        XCTAssertTrue(NativeTabContentSnapshot.canonicalMobilityCards.allSatisfy { $0.control == NativeDiscoverCardControl.vendor })
        XCTAssertTrue(NativeTabContentSnapshot.fallbackDiscoverCards.allSatisfy { $0.control == NativeDiscoverCardControl.local }, "Curated fallback cards must stay local.")
    }

    func testServicesRailOnlyListsControlledVendorCards() {
        let snapshot = NativeTabContentSnapshot.fallback
        let services = NativeLocationAwareUIContent.discoverCards(in: snapshot, matching: "service")
        XCTAssertFalse(services.isEmpty)
        XCTAssertTrue(services.allSatisfy { $0.control == NativeDiscoverCardControl.vendor || NativeDiscoverCardControl.isControlled(cardID: $0.id) })
    }

    @MainActor
    func testLocationAwareDistanceRebuildPreservesVendorControl() {
        let midtown = NativeLocationCoordinate.verifiedMidtown
        let patchVenue = NativeVenueSummary(id: "patch-diner", name: "Patch Diner", category: "restaurant", address: "Midtown", distance: "—", rating: 4.8, latitude: midtown.latitude + 0.002, longitude: midtown.longitude, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: ""), verifiedPatchId: "BYT424-0301-P", imageUrl: nil)
        let patchCard = NativeDiscoverSummary(id: "venue-patch-diner", type: "dining", title: "Patch Diner", subtitle: "Midtown", distance: "—", rating: "4.8", icon: "fork.knife", verified: true, entryType: "free", cta: "View Menu", imageUrl: nil, categoryLabel: "Dining", badgeText: "LIVE", metadataLine: "Live", features: [], vibeScore: 8, availability: "Open", membershipRequired: false, control: NativeDiscoverCardControl.vendor)

        let rebuilt = NativeTabContentStore.locationAwareCards([patchCard], sourceVenues: [patchVenue], location: midtown)

        let card = rebuilt.first { $0.id == patchCard.id }
        XCTAssertNotNil(card, "A nearby patch venue card must survive location-aware filtering.")
        XCTAssertNotEqual(card?.distance, "—", "Distance must be recalculated from the source venue.")
        XCTAssertEqual(card?.control, NativeDiscoverCardControl.vendor, "Distance rebuild must not drop vendor control from a patch-verified venue card.")
    }

    func testVenueDetailHeaderBadgesStayConsumerFacing() {
        XCTAssertNil(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Dinner Spots", category: "dining", address: "Open now", patchId: nil)))
        XCTAssertEqual(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Dinner Spots", category: "dining", address: "Open now", patchId: "DISCOVER-VERIFIED")), "DINING")
        XCTAssertEqual(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking", patchId: "DISCOVER-VERIFIED")), "DINING")
        XCTAssertEqual(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", patchId: "BYT424-0301-P")), "VERIFIED PATCH")
    }

    func testVenueDetailCategorySectionsArePurposeBuilt() {
        let broni = NativeVenueDetailPresentation.detailSection(for: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking · Pickup or delivery"))
        XCTAssertEqual(broni?.title, "Included")
        XCTAssertEqual(broni?.systemImage, "fork.knife")
        XCTAssertTrue(broni?.highlights.contains("Jollof + chicken") == true)

        let gh = NativeVenueDetailPresentation.detailSection(for: venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass · Premium Event Access"))
        XCTAssertEqual(gh?.title, "Included")
        XCTAssertEqual(gh?.systemImage, "ticket.fill")
        XCTAssertTrue(gh?.highlights.contains("Digital pass delivery") == true)
    }

    func testVenueHoursCoffeeParity() {
        XCTAssertEqual(NativeVenueHours.openStatus(category: "coffee", hour: 8, minute: 0, weekday: 3).label, "Open Now")
        XCTAssertFalse(NativeVenueHours.openStatus(category: "coffee", hour: 5, minute: 0, weekday: 3).isOpen)
    }

    private func venue(name: String, category: String, address: String, patchId: String? = nil) -> NativeVenueSummary {
        NativeVenueSummary(id: name.lowercased().replacingOccurrences(of: " ", with: "-"), name: name, category: category, address: address, distance: "0.4 mi", rating: 4.9, latitude: 33.7866, longitude: -84.3833, crowd: NativeCrowdSummary(level: 2, label: "Open", waitMins: nil), parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Free"), verifiedPatchId: patchId, imageUrl: nil)
    }

    // MARK: - Premium Map Functions entitlement matrix (WS-B)
    // Mirrors contracts/native-trust-contract.json mapFunctions.

    func testPremiumMapFunctionTokensMatchContract() {
        XCTAssertEqual(BytspotMapFunctionCatalog.premiumFunctionTokens, ["ai-navigation", "spot-radar", "traffic-intelligence"])
    }

    func testFreeMapFunctionTokensMatchContract() {
        XCTAssertEqual(BytspotMapFunctionCatalog.freeFunctions, ["smart-parking", "live-venue-data", "trending-hotspots"])
    }

    func testFreeAndPremiumFunctionSetsAreDisjoint() {
        let free = Set(BytspotMapFunctionCatalog.freeFunctions)
        let premium = Set(BytspotMapFunctionCatalog.premiumFunctionTokens)
        XCTAssertTrue(free.isDisjoint(with: premium), "A map function must not be both free and premium.")
    }

    func testPremiumFunctionsRequirePlatinumMembership() {
        XCTAssertEqual(BytspotMapFunctionCatalog.requiredMembershipTier, .platinum)
    }

    func testCanonicalMembershipAccess() {
        XCTAssertFalse(BytspotTier.green.hasPlatinumAccess)
        XCTAssertTrue(BytspotTier.platinum.hasPlatinumAccess)
        XCTAssertTrue(BytspotTier.black.hasPlatinumAccess)
    }

    func testNativeTabContentFallbackStartsWithoutBestValueOverlay() {
        XCTAssertTrue(NativeTabContentSnapshot.fallback.bestValueOptions.isEmpty)
    }

    func testNativeTabContentCanCarryBestValueOptions() {
        let option = NativeLiveValueOption(id: "parking-value-1", productType: "parking", title: "Midtown Smart Parking", providerName: "Bytspot", source: "mixed", estimatedTotalCents: 1200, marketReferenceCents: 1800, distanceMeters: 320, availability: "Available", priceParityScore: 92, valueScore: 88, eligible: true, explanation: ["Below market reference"])
        let snapshot = NativeTabContentSnapshot(venues: [], discoverCards: [], events: [], source: .mixed, lastUpdated: nil, errorMessage: nil, bestValueOptions: [option])

        XCTAssertEqual(snapshot.bestValueOptions.first?.id, "parking-value-1")
        XCTAssertEqual(snapshot.bestValueOptions.first?.priceParityScore, 92)
        XCTAssertEqual(snapshot.bestValueOptions.first?.valueScore, 88)
    }

    func testBestValueOptionsRequireMeasuredDistanceWithinLocalRadius() {
        func option(id: String, distanceMeters: Double?) -> NativeLiveValueOption {
            NativeLiveValueOption(id: id, productType: "parking", title: id, providerName: "Bytspot", source: "live", estimatedTotalCents: 800, marketReferenceCents: 1200, distanceMeters: distanceMeters, availability: "Available", priceParityScore: 90, valueScore: 90, eligible: true, explanation: [])
        }
        let radiusMeters = NativeTabContentStore.localVenueRadiusMiles * 1_609.344
        let local = option(id: "local", distanceMeters: 320)
        let boundary = option(id: "boundary", distanceMeters: radiusMeters)
        let far = option(id: "far", distanceMeters: radiusMeters + 1)
        let missing = option(id: "missing", distanceMeters: nil)
        let invalid = option(id: "invalid", distanceMeters: .infinity)

        XCTAssertEqual(NativeTabContentStore.localValueOptions([far, missing, local, invalid, boundary]).map(\.id), [local.id, boundary.id])
    }

    func testLocationScopedBestValueRejectsFallbackAndStaleRegionalOrigins() {
        let atlanta = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: false)
        let nearbyAtlanta = NativeLocationCoordinate(latitude: 33.7900, longitude: -84.3800, isFallback: false)
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)

        XCTAssertTrue(NativeTabContentStore.canPresentLocationScopedContent(origin: atlanta, current: nearbyAtlanta))
        XCTAssertFalse(NativeTabContentStore.canPresentLocationScopedContent(origin: atlanta, current: seattle))
        XCTAssertFalse(NativeTabContentStore.canPresentLocationScopedContent(origin: .midtown, current: seattle))
        XCTAssertFalse(NativeTabContentStore.canPresentLocationScopedContent(origin: nil, current: seattle))
    }

    @MainActor
    func testLocationChangeInvalidationRemovesBestValueRowsAndDerivedCards() {
        let option = NativeLiveValueOption(id: "atlanta-parking", productType: "parking", title: "Midtown Parking", providerName: "Bytspot", source: "live", estimatedTotalCents: 800, marketReferenceCents: 1200, distanceMeters: 320, availability: "Available", priceParityScore: 90, valueScore: 90, eligible: true, explanation: [])
        let valueCard = NativeDiscoverSummary(id: "best-value-atlanta-parking", type: "parking", title: "Midtown Parking", subtitle: "Ranked value", distance: "0.2 mi", rating: "Value 90", icon: "parkingsign", verified: true, entryType: "paid", cta: "View", imageUrl: nil, categoryLabel: "Parking", badgeText: "BEST VALUE", metadataLine: "$8", features: [], vibeScore: 9, availability: "Available", membershipRequired: true)
        let localCard = NativeDiscoverSummary(id: "local-place", type: "coffee", title: "Local Place", subtitle: "Live provider", distance: "0.4 mi", rating: "Nearby", icon: "cup.and.saucer", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Coffee", badgeText: "APPLE MAPS", metadataLine: "Live place", features: [], vibeScore: 6, availability: "Open", membershipRequired: false)
        let snapshot = NativeTabContentSnapshot(venues: [], discoverCards: [valueCard, localCard], events: [], source: .mixed, lastUpdated: Date(), errorMessage: nil, bestValueOptions: [option])

        let invalidated = NativeTabContentStore.removingLocationScopedContent(from: snapshot)

        XCTAssertEqual(invalidated.discoverCards.map(\.id), [localCard.id])
        XCTAssertTrue(invalidated.bestValueOptions.isEmpty)
        XCTAssertEqual(invalidated.source, .live)
    }

    @MainActor
    func testRegionalSnapshotOriginRejectsAllStaleAtlantaContentForSeattleAndProfileConsumers() {
        let atlanta = NativeLocationCoordinate.verifiedMidtown
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let option = NativeLiveValueOption(id: "atlanta-parking", productType: "parking", title: "Midtown Parking", providerName: "Bytspot", source: "live", estimatedTotalCents: 800, marketReferenceCents: 1200, distanceMeters: 320, availability: "Available", priceParityScore: 90, valueScore: 90, eligible: true, explanation: [])
        let atlantaSnapshot = NativeTabContentSnapshot(venues: NativeTabContentSnapshot.fallback.venues, discoverCards: NativeTabContentSnapshot.fallback.discoverCards, events: NativeTabContentSnapshot.fallback.events, source: .mixed, lastUpdated: Date(), errorMessage: nil, bestValueOptions: [option])

        let current = NativeTabContentStore.locationSafeSnapshot(atlantaSnapshot, origin: atlanta, bestValueOrigin: atlanta, current: atlanta)
        let stale = NativeTabContentStore.locationSafeSnapshot(atlantaSnapshot, origin: atlanta, bestValueOrigin: atlanta, current: seattle)
        let unresolved = NativeTabContentStore.locationSafeSnapshot(atlantaSnapshot, origin: atlanta, bestValueOrigin: atlanta, current: .midtown)

        XCTAssertFalse(current.venues.isEmpty)
        for snapshot in [stale, unresolved] {
            XCTAssertTrue(snapshot.venues.isEmpty)
            XCTAssertTrue(snapshot.events.isEmpty)
            XCTAssertTrue(snapshot.bestValueOptions.isEmpty)
            XCTAssertTrue(Set(snapshot.discoverCards.map(\.id)).isDisjoint(with: Set(NativeTabContentSnapshot.specialDiscoverCards.map(\.id))))
            let copy = snapshot.discoverCards.flatMap { [$0.title, $0.subtitle, $0.metadataLine] }.joined(separator: " ")
            XCTAssertFalse(copy.localizedCaseInsensitiveContains("Atlanta"))
            XCTAssertFalse(copy.localizedCaseInsensitiveContains("Midtown"))
        }
    }

    @MainActor
    func testUnresolvedLocationPublishesNeutralContentAndRejectsDerivedBestValueCards() {
        let option = NativeLiveValueOption(id: "fallback-parking", productType: "parking", title: "Midtown Smart Parking", providerName: "Bytspot", source: "live", estimatedTotalCents: 800, marketReferenceCents: 1200, distanceMeters: 320, availability: "Available", priceParityScore: 90, valueScore: 90, eligible: true, explanation: [])
        let unresolvedCards = NativeTabContentStore.liveDiscoverCards(apiCards: NativeTabContentSnapshot.fallback.discoverCards, venues: NativeTabContentSnapshot.fallback.venues, events: NativeTabContentSnapshot.fallback.events, services: NativeTabContentSnapshot.specialDiscoverCards, valueOptions: [option], location: .midtown)
        let verifiedAtlantaCards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [], valueOptions: [option], location: .verifiedMidtown)
        let store = NativeTabContentStore()
        let unresolvedCopy = (unresolvedCards.flatMap { [$0.title, $0.subtitle, $0.metadataLine] } + [NativeLocationCoordinate.midtown.displayName, NativeLocationCoordinate.midtown.shortLabel]).joined(separator: " ")

        XCTAssertTrue(store.snapshot.venues.isEmpty)
        XCTAssertTrue(store.snapshot.events.isEmpty)
        XCTAssertTrue(store.snapshot.bestValueOptions.isEmpty)
        XCTAssertTrue(NativeTabContentStore.fallbackVenues(for: .midtown).isEmpty)
        XCTAssertFalse(unresolvedCards.contains { $0.badgeText.localizedCaseInsensitiveContains("BEST VALUE") })
        XCTAssertTrue(Set(unresolvedCards.map(\.id)).isDisjoint(with: Set(NativeTabContentSnapshot.specialDiscoverCards.map(\.id))))
        XCTAssertFalse(unresolvedCopy.localizedCaseInsensitiveContains("Atlanta"))
        XCTAssertFalse(unresolvedCopy.localizedCaseInsensitiveContains("Midtown"))
        XCTAssertTrue(verifiedAtlantaCards.contains { $0.badgeText.localizedCaseInsensitiveContains("BEST VALUE") })
    }

    @MainActor
    func testLiveDiscoverCardsExpandBootstrapWithVenueAndEventRows() {
        let apiCard = NativeDiscoverSummary(id: "api-fado", type: "nightlife", title: "Fado Irish Pub", subtitle: "Live API bootstrap", distance: "0.4 mi", rating: "4.6", icon: "music.note", verified: true, entryType: "paid", cta: "Open details", imageUrl: nil, categoryLabel: "Nightlife", badgeText: "LIVE API", metadataLine: "Busy tonight", features: ["Nightlife"], vibeScore: 8, availability: "Busy", membershipRequired: false)
        let venues = [
            venue(name: "Fado Irish Pub", category: "bar", address: "Bootstrap duplicate"),
            venue(name: "Tongue & Groove", category: "club", address: "Venue-only API row")
        ]
        let events = [NativeEventSummary(id: "midtown-tonight", title: "Midtown Tonight", venue: "Atlanta", time: "Tonight", price: "Free", emoji: "🎟️", imageUrl: nil, category: "community")]

        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [apiCard], venues: venues, events: events, location: .verifiedMidtown)

        XCTAssertEqual(cards.filter { $0.title == "Fado Irish Pub" }.count, 1)
        XCTAssertTrue(cards.contains { $0.title == "Tongue & Groove" && $0.type == "nightlife" })
        XCTAssertTrue(cards.contains { $0.title == "Midtown Tonight" && $0.type == "entertainment" })
        XCTAssertEqual(cards.first?.title, "Fado Irish Pub")
    }

    @MainActor
    func testLiveDiscoverCardsAddsNightlifeCompanionsForMusicEvents() {
        let events = [NativeEventSummary(id: "steven-g", title: "Steven G", venue: "The Masquerade - Purgatory", time: "Tonight", price: "Paid", emoji: "🎶", imageUrl: nil, category: "concert")]

        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [], events: events, location: .verifiedMidtown)

        XCTAssertTrue(cards.contains { $0.id == "event-steven-g" && $0.type == "entertainment" })
        XCTAssertTrue(cards.contains { $0.id == "nightlife-event-steven-g" && $0.type == "nightlife" && $0.title.contains("Night out") })
    }

    @MainActor
    func testLiveDiscoverCardsAddsCategoryCompanionsForApiVenues() {
        let dining = venue(name: "South City Kitchen", category: "restaurant", address: "API dining row")
        let shopping = venue(name: "Ponce City Market", category: "market", address: "API shopping row")
        let parking = NativeVenueSummary(id: "generic-deck", name: "Generic API Deck", category: "venue", address: "API parking row", distance: "0.5 mi", rating: 4.3, latitude: 33.78, longitude: -84.38, crowd: nil, parking: NativeParkingSummary(totalAvailable: 18, priceLabel: "$8/hr"), verifiedPatchId: nil, imageUrl: nil)

        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [dining, shopping, parking], location: .verifiedMidtown)

        XCTAssertTrue(cards.contains { $0.title == "Dinner plan: South City Kitchen" && $0.type == "dining" })
        XCTAssertTrue(cards.contains { $0.title == "Shop stop: Ponce City Market" && $0.type == "shopping" })
        XCTAssertTrue(cards.contains { $0.title == "Parking nearby: Generic API Deck" && $0.type == "parking" })
    }

    @MainActor
    func testLiveDiscoverCardsGuaranteeUsableCategoryFeedsWhenApiIsSparse() {
        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [venue(name: "One Restaurant", category: "restaurant", address: "API dining row")], events: [], location: .verifiedMidtown)
        let minimums = ["dining": 4, "nightlife": 4, "entertainment": 6, "shopping": 3, "parking": 3, "coffee": 3, "fitness": 3, "boutique_apartment": 3, "mobility": 3]

        for (type, count) in minimums {
            XCTAssertGreaterThanOrEqual(cards.filter { $0.type == type }.count, count, "\(type) should not open as an empty or thin Discover feed.")
        }
        XCTAssertTrue(cards.contains { $0.type == "dining" && $0.badgeText == "LIVE API" })
        XCTAssertTrue(cards.contains { $0.type == "shopping" && $0.badgeText == "CURATED" })
        XCTAssertTrue(cards.allSatisfy { $0.type != "mobility" || $0.categoryLabel == "Mobility" })
        XCTAssertTrue(cards.allSatisfy { $0.type != "boutique_apartment" || $0.categoryLabel == "Boutique Stay" })
    }

    @MainActor
    func testDiscoverSourceReflectsMixedLiveAndCuratedCoverage() {
        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [venue(name: "One Restaurant", category: "restaurant", address: "API dining row")], events: [], location: .verifiedMidtown)

        XCTAssertEqual(NativeTabContentStore.source(forVisibleDeck: cards, hasLiveInputs: true), .mixed)
        XCTAssertEqual(NativeTabContentStore.source(forVisibleDeck: [cards.first { $0.badgeText == "LIVE API" }!], hasLiveInputs: true), .live)
        XCTAssertEqual(NativeTabContentStore.source(forVisibleDeck: [cards.first { $0.badgeText == "CURATED" }!], hasLiveInputs: false), .fallback)
    }

    @MainActor
    func testLiveVenueRowsUseLiveApiBadge() {
        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: [], venues: [venue(name: "South City Kitchen", category: "restaurant", address: "API dining row")], events: [], location: .verifiedMidtown)

        XCTAssertEqual(cards.first { $0.title == "South City Kitchen" }?.badgeText, "LIVE API")
    }

    func testServiceHereNoSelectionAsksForAMapPlace() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(bestValueTitle: "Midtown Smart Parking", bestValueSummary: "$8 · score 88"))

        XCTAssertEqual(plan.title, "Service Here")
        XCTAssertEqual(plan.eyebrow, "RECOMMENDED")
        XCTAssertEqual(plan.bestMove.action, .choosePlace)
        XCTAssertEqual(plan.bestMove.title, "Choose a place")
        XCTAssertEqual(NativeServiceHerePlanner.mapModeAfterSelection(plan.bestMove.action), "Nearby")
        XCTAssertTrue(plan.quickActions.isEmpty)
    }

    func testServiceHereParkingSelectionPrioritizesParkingReservation() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(selectedKind: .parking, selectedTitle: "Deck A", selectedSubtitle: "18 spots · $8/hr"))

        XCTAssertEqual(plan.bestMove.action, .reserveParking)
        XCTAssertEqual(plan.bestMove.title, "Reserve this parking")
        XCTAssertTrue(plan.bestMove.subtitle.contains("Deck A"))
        XCTAssertEqual(plan.quickActions.first?.action, .route)
        XCTAssertFalse(plan.quickActions.contains { $0.action == .reserveParking })
    }

    func testServiceHereSelectedParkingIgnoresDifferentBestValueCopy() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(selectedKind: .parking, selectedTitle: "Deck A", selectedSubtitle: "18 spots · $8/hr", bestValueTitle: "Midtown Smart Parking", bestValueSummary: "$6 · score 91"))

        XCTAssertEqual(plan.bestMove.action, .reserveParking)
        XCTAssertEqual(plan.bestMove.title, "Reserve this parking")
        XCTAssertTrue(plan.bestMove.subtitle.contains("Deck A"))
        XCTAssertFalse(plan.bestMove.subtitle.contains("Midtown Smart Parking"))
    }

    func testServiceHerePartnerInVerifiedZonePrioritizesAccessScan() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(selectedKind: .partner, selectedTitle: "Colony Square", selectedSubtitle: "Verified Tap Zone", isWithinVerifiedZone: true))

        XCTAssertEqual(plan.bestMove.action, .accessScan)
        XCTAssertEqual(plan.bestMove.title, "Check in here")
        XCTAssertEqual(plan.bestMove.subtitle, "You're close enough to check in.")
        XCTAssertFalse(plan.bestMove.subtitle.contains("QR"))
    }

    func testServiceHereRouteActionIsReachableForSelectedPins() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(selectedKind: .partner, selectedTitle: "Colony Square", selectedSubtitle: "Verified Tap Zone"))

        let route = plan.quickActions.first { $0.action == .route }
        XCTAssertNil(route, "Directions are already the recommended action and should not be repeated.")
        XCTAssertEqual(plan.bestMove.title, "Get directions")
        XCTAssertTrue(plan.bestMove.subtitle.contains("Colony Square"))
    }

    func testServiceHereQuickActionsAreUniqueAndUseful() {
        let plan = NativeServiceHerePlanner.plan(context: serviceHereContext(selectedKind: .partner, selectedTitle: "Colony Square", selectedSubtitle: "Nearby"))
        let actions = plan.quickActions.map(\.action)

        XCTAssertEqual(actions.count, Set(actions).count)
        XCTAssertTrue(actions.contains(.reserveParking))
        XCTAssertTrue(actions.contains(.bookVenue))
        XCTAssertTrue(actions.contains(.concierge))
        XCTAssertTrue(actions.contains(.accessScan))
        XCTAssertFalse(actions.contains(.valet))
        XCTAssertFalse(actions.contains(.seeAllServices))
        XCTAssertFalse(actions.contains(plan.bestMove.action))
    }

    @MainActor
    func testNightlifeRequestsFollowTheUsersLocation() throws {
        let location = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let input = NativeTabContentStore.eventQueryInput(location: location)
        let point = try XCTUnwrap(input["location"] as? [String: Any])

        XCTAssertEqual(point["lat"] as? Double, 47.6062)
        XCTAssertEqual(point["lng"] as? Double, -122.3321)
        XCTAssertEqual(point["radiusMiles"] as? Double, NativeTabContentStore.nightlifeRadiusMiles)
        XCTAssertNil(input["city"])
        XCTAssertFalse(NativeTabContentStore.canUseCurrentEventFeed(at: location))
        XCTAssertFalse(NativeTabContentStore.canUseCurrentEventFeed(at: .midtown))
        XCTAssertTrue(NativeTabContentStore.canUseCurrentEventFeed(at: .verifiedMidtown))
    }

    @MainActor
    func testFarVenuesDoNotEnterTheLocalFeed() {
        let location = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: false)
        let nearby = NativeVenueSummary(id: "near-night", name: "Nearby Lounge", category: "nightlife", address: "Atlanta", distance: "—", rating: 4.7, latitude: 33.79, longitude: -84.38, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: ""), verifiedPatchId: nil, imageUrl: nil)
        let far = NativeVenueSummary(id: "far-night", name: "Far Lounge", category: "nightlife", address: "Far away", distance: "—", rating: 4.7, latitude: 32.08, longitude: -81.09, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: ""), verifiedPatchId: nil, imageUrl: nil)
        let farDining = NativeVenueSummary(id: "far-food", name: "Far Restaurant", category: "restaurant", address: "Far away", distance: "—", rating: 4.7, latitude: 32.08, longitude: -81.09, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: ""), verifiedPatchId: nil, imageUrl: nil)

        let venues = NativeTabContentStore.locationAwareVenues([far, nearby, farDining], location: location)

        XCTAssertTrue(venues.contains { $0.id == nearby.id })
        XCTAssertFalse(venues.contains { $0.id == far.id })
        XCTAssertFalse(venues.contains { $0.id == farDining.id })
    }

    @MainActor
    func testNonAtlantaHomePresentationAndVenueDeckStayLocal() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let atlanta = NativeVenueSummary(id: "atlanta", name: "Atlanta Venue", category: "restaurant", address: "Atlanta", distance: "—", rating: nil, latitude: 33.7866, longitude: -84.3833, crowd: nil, parking: NativeParkingSummary(totalAvailable: 20, priceLabel: "$8/hr"), verifiedPatchId: nil, imageUrl: nil)
        let local = NativeVenueSummary(id: "seattle", name: "Seattle Venue", category: "restaurant", address: "Seattle", distance: "—", rating: nil, latitude: 47.61, longitude: -122.33, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: ""), verifiedPatchId: nil, imageUrl: nil)
        let atlantaCard = NativeDiscoverSummary(id: "venue-atlanta", type: "dining", title: "Atlanta Venue", subtitle: "Atlanta", distance: "—", rating: "Live", icon: "fork.knife", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Dining", badgeText: "LIVE", metadataLine: "Live", features: [], vibeScore: 0, availability: "Live", membershipRequired: false)
        let unknownLiveCard = NativeDiscoverSummary(id: "unknown-live", type: "dining", title: "Unknown Venue", subtitle: "Unknown", distance: "—", rating: "Live", icon: "fork.knife", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Dining", badgeText: "LIVE", metadataLine: "Live", features: [], vibeScore: 0, availability: "Live", membershipRequired: false)
        let localPlaceCard = NativeDiscoverSummary(id: "local-place", type: "dining", title: "Local Place", subtitle: "Seattle", distance: "0.4 mi", rating: "Nearby", icon: "fork.knife", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Dining", badgeText: "APPLE MAPS", metadataLine: "Nearby", features: [], vibeScore: 0, availability: "Nearby", membershipRequired: false)
        let unmeasuredPlaceCard = NativeDiscoverSummary(id: "unmeasured-place", type: "dining", title: "Unmeasured Place", subtitle: "Unknown", distance: "Nearby", rating: "Nearby", icon: "fork.knife", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Dining", badgeText: "GOOGLE PLACES", metadataLine: "Nearby", features: [], vibeScore: 0, availability: "Nearby", membershipRequired: false)
        let farPlaceCard = NativeDiscoverSummary(id: "far-place", type: "dining", title: "Far Place", subtitle: "Far", distance: "100 mi", rating: "Nearby", icon: "fork.knife", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Dining", badgeText: "GOOGLE PLACES", metadataLine: "Nearby", features: [], vibeScore: 0, availability: "Nearby", membershipRequired: false)

        let venues = NativeTabContentStore.locationAwareVenues([atlanta, local], location: seattle)
        let cards = NativeTabContentStore.locationAwareCards([atlantaCard, unknownLiveCard, localPlaceCard, unmeasuredPlaceCard, farPlaceCard], sourceVenues: [atlanta, local], location: seattle)
        let eyebrow = NativeHomeRegionPresentation.contextualEyebrow(hour: 13, location: seattle)

        XCTAssertEqual(venues.map(\.id), [local.id])
        XCTAssertEqual(cards.map(\.id), [localPlaceCard.id])
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: seattle), "Nearby")
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: seattle, locality: "Seattle"), "Seattle")
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: seattle, locality: "  Decatur  "), "Decatur")
        XCTAssertFalse((eyebrow.0 + eyebrow.1).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertFalse(NativeHomeRegionPresentation.launchTitle(intent: "parking", location: seattle).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: .midtown), "Nearby")
        XCTAssertFalse(NativeHomeRegionPresentation.launchTitle(intent: "parking", location: .midtown).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: .verifiedMidtown, locality: "Atlanta"), "Atlanta")
    }

    @MainActor
    func testProviderPlacesRequireValidCoordinatesWithinTheLocalRadius() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let localGoogle = NativePlaceSearchResult(id: "local-google", name: "Local Google", address: "Seattle", category: "restaurant", latitude: 47.61, longitude: -122.33, rating: 4.7, photoUrl: nil, provider: "google_places")
        let localApple = NativePlaceSearchResult(id: "local-apple", name: "Local Apple", address: "Seattle", category: "cafe", latitude: 47.608, longitude: -122.335, rating: nil, photoUrl: nil, provider: "apple_maps")
        let farGoogle = NativePlaceSearchResult(id: "far-google", name: "Far Google", address: "Atlanta", category: "restaurant", latitude: 33.7866, longitude: -84.3833, rating: 4.7, photoUrl: nil, provider: "google_places")
        let missingGoogle = NativePlaceSearchResult(id: "missing-google", name: "Missing Google", address: "Unknown", category: "restaurant", latitude: nil, longitude: nil, rating: nil, photoUrl: nil, provider: "google_places")
        let zeroGoogle = NativePlaceSearchResult(id: "zero-google", name: "Zero Google", address: "Unknown", category: "restaurant", latitude: 0, longitude: 0, rating: nil, photoUrl: nil, provider: "google_places")

        let places = NativeLiveDiscoveryAPI.validatedLocalPlaces([farGoogle, missingGoogle, zeroGoogle, localGoogle, localApple], origin: seattle)

        XCTAssertEqual(places.map(\.id), [localGoogle.id, localApple.id])
    }

    func testLocalPlaceWithMissingAddressUsesRegionNeutralFallback() throws {
        let row: [String: Any] = ["id": "seattle-local", "name": "Seattle Local", "lat": 47.61, "lng": -122.33, "provider": "apple_maps"]
        let pair: EnumeratedSequence<[Any]>.Element = (offset: 0, element: row)

        let place = try XCTUnwrap(NativeLiveDiscoveryAPI.placeResult(pair))

        XCTAssertEqual(place.address, "Address unavailable")
        XCTAssertFalse(place.address.localizedCaseInsensitiveContains("Atlanta"))
        XCTAssertFalse(place.address.localizedCaseInsensitiveContains("Midtown"))
    }

    func testRegionalProfileContactAndBlankRouteCopyStayNeutral() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let venue = NativeVenueSummary(id: "seattle-cafe", name: "Seattle Cafe", category: "cafe", address: "1 Pike St, Seattle, WA", distance: "0.4 mi", rating: 4.7, latitude: 47.61, longitude: -122.33, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Check nearby"), verifiedPatchId: nil, imageUrl: nil)
        let blankRouteSuggestions = NativeSearchRouter.suggestions(query: "route to", snapshot: .fallback, location: seattle)
        let namedRouteSuggestions = NativeSearchRouter.suggestions(query: "route to Pike Place", snapshot: .fallback, location: seattle)
        let copy = [NativeProfileRegionalPresentation.cityPlaceholder, NativeVenueDetailRegionalPresentation.contactSearchQuery(for: venue)].joined(separator: " ")

        XCTAssertFalse(copy.localizedCaseInsensitiveContains("Atlanta"))
        XCTAssertFalse(copy.localizedCaseInsensitiveContains("Midtown"))
        XCTAssertTrue(NativeVenueDetailRegionalPresentation.contactSearchQuery(for: venue).contains("Seattle"))
        XCTAssertFalse(blankRouteSuggestions.contains { $0.title.hasPrefix("Route to ") })
        XCTAssertTrue(namedRouteSuggestions.contains { $0.title == "Route to Pike Place" && $0.address == "Pike Place" })
    }

    @MainActor
    func testHomeEmptyStateDoesNotDependOnLaunchCompletion() {
        let emptySnapshot = NativeTabContentSnapshot(venues: [], discoverCards: NativeTabContentSnapshot.fallback.discoverCards, events: [], source: .fallback, lastUpdated: nil, errorMessage: nil)
        let eventOnlySnapshot = NativeTabContentSnapshot(venues: [], discoverCards: NativeTabContentSnapshot.fallback.discoverCards, events: NativeTabContentSnapshot.fallback.events, source: .fallback, lastUpdated: nil, errorMessage: nil)
        let valueOnlyCard = NativeDiscoverSummary(id: "best-value", type: "parking", title: "Best Value", subtitle: "Local query", distance: "Nearby", rating: "Value 88", icon: "parkingsign", verified: true, entryType: "paid", cta: "View", imageUrl: nil, categoryLabel: "Parking", badgeText: "BEST VALUE", metadataLine: "$8", features: [], vibeScore: 8, availability: "Available", membershipRequired: true)
        let valueOnlySnapshot = NativeTabContentSnapshot(venues: [], discoverCards: [valueOnlyCard], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)
        let localPlace = NativeDiscoverSummary(id: "local-place", type: "coffee", title: "Local Place", subtitle: "Seattle", distance: "0.4 mi", rating: "Nearby", icon: "cup.and.saucer", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Coffee", badgeText: "APPLE MAPS", metadataLine: "Live place", features: [], vibeScore: 6, availability: "Live place", membershipRequired: false)
        let unmeasuredPlace = NativeDiscoverSummary(id: "unmeasured-place", type: "coffee", title: "Unmeasured Place", subtitle: "Unknown", distance: "Nearby", rating: "Nearby", icon: "cup.and.saucer", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Coffee", badgeText: "GOOGLE PLACES", metadataLine: "Live place", features: [], vibeScore: 6, availability: "Live place", membershipRequired: false)
        let localSnapshot = NativeTabContentSnapshot(venues: [], discoverCards: [localPlace], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)
        let unmeasuredSnapshot = NativeTabContentSnapshot(venues: [], discoverCards: [unmeasuredPlace], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)

        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: emptySnapshot, launchPicksCompleted: false, launchPickCount: 0))
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: emptySnapshot, launchPicksCompleted: true, launchPickCount: 0))
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: eventOnlySnapshot, launchPicksCompleted: false, launchPickCount: 0))
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: valueOnlySnapshot, launchPicksCompleted: false, launchPickCount: 0))
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: unmeasuredSnapshot, launchPicksCompleted: false, launchPickCount: 0))
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: localSnapshot, launchPicksCompleted: false, launchPickCount: 0))
        XCTAssertEqual(NativeHomeRegionPresentation.trustedProviderCards(in: localSnapshot).map(\.id), ["local-place"])
    }

    @MainActor
    func testNearbyPlacesLeadTheVisibleDeck() {
        let curated = NativeTabContentSnapshot.fallback.discoverCards
        let local = NativeDiscoverSummary(id: "local-nightlife", type: "nightlife", title: "Nearby Nightlife", subtitle: "Near you", distance: "0.4 mi", rating: "Nearby", icon: "music.note", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Nightlife", badgeText: "APPLE MAPS", metadataLine: "Nearby", features: ["Nightlife"], vibeScore: 7, availability: "Nearby", membershipRequired: false)
        let location = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)

        let cards = NativeTabContentStore.liveDiscoverCards(apiCards: curated, venues: [], placeCards: [local], location: location)

        XCTAssertEqual(cards.first?.id, local.id)
        XCTAssertGreaterThan(NativeDiscoverRanking.nearbySourcePriority(local.badgeText), NativeDiscoverRanking.nearbySourcePriority("CURATED"))
        XCTAssertTrue(Set(cards.map(\.id)).isDisjoint(with: Set(NativeTabContentSnapshot.specialDiscoverCards.map(\.id))))
        let fallback = cards.first { $0.id == "nightlife-momentum" }
        XCTAssertEqual(fallback?.title, "Nightlife Near You")
        XCTAssertEqual(fallback?.distance, "Nearby")
        XCTAssertEqual(fallback?.badgeText, "CURATED")
    }

    @MainActor
    func testNonAtlantaFallbackIsGenericAndRegionSafe() {
        let location = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let cards = NativeTabContentStore.locationAwareCards(NativeTabContentSnapshot.fallback.discoverCards, sourceVenues: NativeTabContentSnapshot.fallback.venues, location: location)
        let specialIDs = NativeTabContentSnapshot.specialDiscoverCards.map(\.id)

        XCTAssertTrue(NativeTabContentStore.fallbackVenues(for: location).isEmpty)
        XCTAssertFalse(cards.contains { card in specialIDs.contains { card.id.contains($0) } })
        XCTAssertFalse(cards.contains { $0.id.contains("midtown-boutique-suite") })
        XCTAssertTrue(cards.allSatisfy { $0.distance == "Nearby" && $0.metadataLine == "Suggestions for your area" && $0.availability == "Check nearby" })
        XCTAssertFalse(cards.contains { $0.metadataLine.rangeOfCharacter(from: .decimalDigits) != nil || $0.metadataLine.contains("$") })
    }

    @MainActor
    func testNonAtlantaUIConsumersKeepEmptyRegionalContentEmpty() {
        let location = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let cards = NativeTabContentStore.locationAwareCards(NativeTabContentSnapshot.fallback.discoverCards, sourceVenues: NativeTabContentSnapshot.fallback.venues, location: location)
        let snapshot = NativeTabContentSnapshot(venues: [], discoverCards: cards, events: [], source: .fallback, lastUpdated: nil, errorMessage: nil)
        let forbiddenTitles = ["Midtown Boutique Suite", "Private Airport Transfer", "Group Transport", "Broni Home Taste", "GH Akwaaba Pass"]

        XCTAssertTrue(NativeLocationAwareUIContent.venues(in: snapshot).isEmpty)
        XCTAssertTrue(NativeAuthLaunchContract.launchVenueCandidates(from: snapshot.venues).isEmpty)
        XCTAssertTrue(NativeLocationAwareUIContent.discoverCards(in: snapshot, matching: "boutique_apartment").isEmpty)
        XCTAssertTrue(NativeLocationAwareUIContent.discoverCards(in: snapshot, matching: "mobility").isEmpty)
        XCTAssertTrue(NativeLocationAwareUIContent.discoverCards(in: snapshot, matching: "service").isEmpty)
        XCTAssertTrue(Set(NativeSearchRouter.suggestions(query: "food", snapshot: snapshot, location: location).map(\.title)).isDisjoint(with: Set(forbiddenTitles)))

        let unresolved = NativeLocationAwareUIContent.unresolvedVenue(id: "local-idea", name: "Local idea", category: "parking", address: "Check nearby", distance: "Nearby", imageURL: nil)
        XCTAssertEqual(unresolved.id, "suggestion-local-idea")
        XCTAssertFalse(NativeLocationAwareUIContent.hasKnownCoordinates(unresolved))
        XCTAssertNil(unresolved.rating)
        XCTAssertNil(unresolved.crowd)
        XCTAssertEqual(unresolved.parking, NativeParkingSummary(totalAvailable: 0, priceLabel: "Check nearby"))
        XCTAssertFalse(NativeVenueDetailPresentation.supportsManualCheckIn(unresolved))

        let mapFallback = NativeLocationAwareUIContent.mapFallback(for: location)
        XCTAssertEqual(mapFallback.mode, "Nearby")
        XCTAssertFalse(mapFallback.destination.localizedCaseInsensitiveContains("Midtown"))
        XCTAssertNil(NativeLocationAwareUIContent.mapHandoffVenue(destination: mapFallback.destination, mode: mapFallback.mode, venues: snapshot.venues))
        XCTAssertNil(NativeLocationAwareUIContent.mapHandoffVenue(destination: unresolved.name, mode: "Smart Parking", venues: snapshot.venues))
    }

    func testNonAtlantaMapPresentationCentersLocallyAndSuppressesAtlantaSamples() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let region = NativeMapRegionPresentation.region(for: seattle)
        let labels = NativeMapRegionPresentation.backdropLabels(for: seattle)

        XCTAssertEqual(region.center.latitude, seattle.latitude, accuracy: 0.000_001)
        XCTAssertEqual(region.center.longitude, seattle.longitude, accuracy: 0.000_001)
        XCTAssertEqual(labels, NativeMapRegionPresentation.localBackdropLabels)
        XCTAssertFalse(NativeMapRegionPresentation.showsAtlantaSamples(for: seattle))
        XCTAssertTrue(Set(labels).isDisjoint(with: Set(NativeMapRegionPresentation.atlantaBackdropLabels)))
    }

    func testAtlantaMapPresentationRetainsRegionalBackdropSamples() {
        XCTAssertEqual(NativeMapRegionPresentation.backdropLabels(for: .verifiedMidtown), NativeMapRegionPresentation.atlantaBackdropLabels)
        XCTAssertTrue(NativeMapRegionPresentation.showsAtlantaSamples(for: .verifiedMidtown))
    }

    func testUnresolvedMapLocationFailsClosedInsteadOfPresentingAtlantaFallback() {
        XCTAssertEqual(
            NativeMapRegionPresentation.backdropLabels(for: .midtown, hasResolvedLocation: false),
            NativeMapRegionPresentation.localBackdropLabels
        )
        XCTAssertFalse(NativeMapRegionPresentation.showsAtlantaSamples(for: .midtown, hasResolvedLocation: false))
        XCTAssertEqual(
            NativeMapRegionPresentation.backdropLabels(for: .midtown, hasResolvedLocation: true),
            NativeMapRegionPresentation.localBackdropLabels
        )
        XCTAssertFalse(NativeMapRegionPresentation.showsAtlantaSamples(for: .midtown, hasResolvedLocation: true))
    }

    func testMapZoomClampsAndUpdatesRegionSpanMonotonically() {
        XCTAssertEqual(NativeMapRegionPresentation.clampedZoomScale(0.1), NativeMapRegionPresentation.minimumZoomScale)
        XCTAssertEqual(NativeMapRegionPresentation.clampedZoomScale(10), NativeMapRegionPresentation.maximumZoomScale)

        let zoomedOut = NativeMapRegionPresentation.span(forZoomScale: NativeMapRegionPresentation.minimumZoomScale)
        let normal = NativeMapRegionPresentation.span(forZoomScale: 1)
        let zoomedIn = NativeMapRegionPresentation.span(forZoomScale: NativeMapRegionPresentation.maximumZoomScale)
        XCTAssertGreaterThan(zoomedOut.latitudeDelta, normal.latitudeDelta)
        XCTAssertLessThan(zoomedIn.latitudeDelta, normal.latitudeDelta)
        XCTAssertEqual(zoomedIn.latitudeDelta, zoomedIn.longitudeDelta, accuracy: 0.000_001)
    }

    func testNonAtlantaConciergeCopyFailsClosedToTheCurrentArea() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let copy = [
            NativeConciergeRegionPresentation.welcomeMessage(for: seattle),
            NativeConciergeRegionPresentation.cityName(for: seattle),
            NativeConciergeRegionPresentation.fallbackResponse(for: .parking, location: seattle),
            NativeConciergeRegionPresentation.fallbackResponse(for: .stay, location: seattle),
            NativeConciergeRegionPresentation.fallbackResponse(for: .open, location: seattle),
            NativeConciergeRegionPresentation.fallbackResponse(for: .general, location: seattle)
        ].joined(separator: " ")

        for forbidden in ["Midtown", "Atlanta", "Colony Square", "Arts Center", "Broni", "Akwaaba"] {
            XCTAssertFalse(copy.localizedCaseInsensitiveContains(forbidden), "Non-Atlanta Concierge copy leaked \(forbidden).")
        }
        XCTAssertEqual(NativeConciergeRegionPresentation.cityName(for: seattle), "Near you")
    }

    func testAtlantaConciergeCopyRetainsMidtownContext() {
        let atlanta = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: false)
        XCTAssertEqual(NativeConciergeRegionPresentation.cityName(for: atlanta), "Midtown")
        XCTAssertTrue(NativeConciergeRegionPresentation.welcomeMessage(for: atlanta).contains("Midtown"))
        XCTAssertTrue(NativeConciergeRegionPresentation.fallbackResponse(for: .parking, location: atlanta).contains("Midtown Smart Parking"))
        XCTAssertTrue(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Find parking nearby", location: atlanta))
    }

    func testFallbackMidtownCoordinateIsNotVerifiedAtlantaConciergeContext() {
        XCTAssertEqual(NativeConciergeRegionPresentation.cityName(for: .midtown), "Near you")
        XCTAssertEqual(NativeConciergeRegionPresentation.welcomeMessage(for: .midtown), NativeConciergeRegionPresentation.genericWelcomeMessage)
        XCTAssertFalse(NativeConciergeRegionPresentation.fallbackResponse(for: .parking, location: .midtown).contains("Midtown"))
        XCTAssertFalse(NativeConciergeRegionPresentation.isVerifiedAtlanta(.midtown))
    }

    func testNonAtlantaConciergeRejectsRemoteAtlantaDefaultsUnlessExplicitlyRequested() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)

        XCTAssertFalse(NativeConciergeRegionPresentation.permitsRemoteContent(["Two verified parking options are nearby."], query: "Find parking nearby", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsRemoteContent(["Try Colony Square in Midtown."], query: "Find parking nearby", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsRemoteContent(["Open details", "Ponce City Market"], query: "What's open?", location: seattle))
        XCTAssertTrue(NativeConciergeRegionPresentation.permitsRemoteContent(["Try Colony Square in Midtown."], query: "Plan a trip to Atlanta", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsRemoteContent(["Try Colony Square in Midtown."], query: "Find parking nearby", location: .midtown))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Find parking nearby", location: seattle))
        XCTAssertTrue(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Plan a trip to Atlanta", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Find parking nearby", location: .midtown))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Show Seattle options, no Atlanta", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Anything outside Midtown", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Restaurants near Midtown", location: seattle))
        XCTAssertTrue(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "Restaurants near Midtown Atlanta", location: seattle))
        XCTAssertTrue(NativeConciergeRegionPresentation.permitsLiveConcierge(query: "ATL parking for my trip", location: seattle))
        XCTAssertFalse(NativeConciergeRegionPresentation.permitsRemoteContent(["1197 Peachtree St NE", "Mercedes-Benz Stadium", "ATL Airport transfer", "Downtown"], query: "Find parking nearby", location: seattle))
    }

    func testSmartParkingHandoffKeepsNamedVenueAndRejectsUnknownNames() {
        let parking = NativeParkingSummary(totalAvailable: 12, priceLabel: "$8/hr")
        let deckA = NativeVenueSummary(id: "deck-a", name: "Deck A", category: "parking", address: "1 First St", distance: "0.2 mi", rating: 4.5, latitude: 47.61, longitude: -122.33, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let deckB = NativeVenueSummary(id: "deck-b", name: "Deck B", category: "parking", address: "2 Second St", distance: "0.4 mi", rating: 4.6, latitude: 47.62, longitude: -122.34, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let restaurantB = NativeVenueSummary(id: "restaurant-b", name: "Deck B", category: "restaurant", address: "3 Third St", distance: "0.3 mi", rating: 4.4, latitude: 47.615, longitude: -122.335, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let collidingDeckA = NativeVenueSummary(id: "deck-a-collision", name: "Deck-A", category: "parking", address: "4 Fourth St", distance: "0.5 mi", rating: 4.3, latitude: 47.625, longitude: -122.345, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let venues = [restaurantB, deckA, deckB, collidingDeckA]

        XCTAssertEqual(NativeLocationAwareUIContent.mapHandoffVenue(destination: "  DECK B  ", mode: "Smart Parking", venues: venues)?.id, deckB.id)
        XCTAssertNil(NativeLocationAwareUIContent.mapHandoffVenue(destination: "Unknown Deck", mode: "Smart Parking", venues: venues))
        XCTAssertEqual(NativeLocationAwareUIContent.mapHandoffVenue(destination: "Parking near me", mode: "Smart Parking", venues: venues)?.id, deckA.id)
        XCTAssertNil(NativeLocationAwareUIContent.mapHandoffVenue(destination: "Deck A", mode: "Smart Parking", venues: venues))
    }

    @MainActor
    func testMalformedLiveParkingRowsCannotBecomeMapCandidates() {
        let row: [String: Any] = ["id": "remote-deck", "name": "Remote Deck", "category": "parking", "address": "Seattle"]
        let venues = [row].compactMap(NativeTabContentStore.venue(from:))
        let snapshot = NativeTabContentSnapshot(venues: venues, discoverCards: [], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)
        let location = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)

        XCTAssertTrue(snapshot.venues.isEmpty)
        XCTAssertFalse(NativeVenueSummary.hasValidMapCoordinate(latitude: 0, longitude: 0))
        XCTAssertFalse(NativeVenueSummary.hasValidMapCoordinate(latitude: .infinity, longitude: -122.3321))
        XCTAssertFalse(NativeVenueSummary.hasValidMapCoordinate(latitude: 91, longitude: -122.3321))
        XCTAssertNil(NativeLocationAwareUIContent.mapHandoffVenue(destination: "Remote Deck", mode: "Smart Parking", venues: snapshot.venues))
        XCTAssertEqual(NativeLocationAwareUIContent.mapFallback(for: location).mode, "Nearby")
    }

    func testMapFocusHandoffRejectsUnresolvedParkingCoordinates() {
        let suiteName = "NativeMapFocusHandoffTests.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return XCTFail("Could not create isolated defaults") }
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let parking = NativeParkingSummary(totalAvailable: 0, priceLabel: "Check nearby")
        let valid = NativeVenueSummary(id: "valid-deck", name: "Valid Deck", category: "parking", address: "1 First St", distance: "Nearby", rating: nil, latitude: 47.61, longitude: -122.33, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let unresolved = NativeVenueSummary(id: "unresolved-deck", name: "Unresolved Deck", category: "parking", address: "Check nearby", distance: "Nearby", rating: nil, latitude: 0, longitude: 0, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)

        NativeMapFocusHandoff.store(venue: valid, defaults: defaults)
        XCTAssertTrue(NativeMapFocusHandoff.hasPendingFocus(in: defaults))
        NativeMapFocusHandoff.store(venue: unresolved, defaults: defaults)
        XCTAssertFalse(NativeMapFocusHandoff.hasPendingFocus(in: defaults))
        XCTAssertNil(defaults.object(forKey: NativeMapFocusHandoff.latitudeKey))
        XCTAssertNil(defaults.object(forKey: NativeMapFocusHandoff.longitudeKey))
    }

    func testMapFocusConsumerKeepsAuthoritativeCoordinateAgainstTitleCollision() {
        let handoffLatitude = 33.7870
        let handoffLongitude = -84.3830
        let candidates = [
            NativeMapFocusPinCandidate(id: "different-provider", title: "Provider Cafe", latitude: 33.7970, longitude: -84.3930),
            NativeMapFocusPinCandidate(id: "provider-annex", title: "Provider Cafe Annex", latitude: 33.7870, longitude: -84.3830)
        ]

        XCTAssertNil(NativeMapFocusPinResolutionPolicy.matchingIndex(handoffID: "place-provider-cafe", handoffTitle: "Provider Cafe", latitude: handoffLatitude, longitude: handoffLongitude, candidates: candidates))
        XCTAssertNil(NativeMapFocusPinResolutionPolicy.matchingIndex(handoffID: "different-provider", handoffTitle: "Provider Cafe", latitude: handoffLatitude, longitude: handoffLongitude, candidates: candidates))
        let coordinateConsistent = NativeMapFocusPinCandidate(id: "native-provider", title: "Provider Cafe", latitude: handoffLatitude + 0.00001, longitude: handoffLongitude)
        XCTAssertEqual(NativeMapFocusPinResolutionPolicy.matchingIndex(handoffID: "place-provider-cafe", handoffTitle: "Provider Cafe", latitude: handoffLatitude, longitude: handoffLongitude, candidates: [coordinateConsistent]), 0)
        let focused = NativeMapFocusPinCandidate(id: "place-provider-cafe", title: "Provider Cafe", latitude: handoffLatitude, longitude: handoffLongitude)
        let sameIDElsewhere = NativeMapFocusPinCandidate(id: focused.id, title: focused.title, latitude: 33.8070, longitude: -84.4030)
        XCTAssertEqual(NativeMapFocusPinResolutionPolicy.mergeAction(focused: focused, candidates: [sameIDElsewhere]), .replaceExisting(indices: [0]))
        XCTAssertEqual(NativeMapFocusPinResolutionPolicy.mergeAction(focused: focused, candidates: [coordinateConsistent]), .append)
        let sameIDNearby = NativeMapFocusPinCandidate(id: focused.id, title: focused.title, latitude: handoffLatitude + 0.00001, longitude: handoffLongitude)
        XCTAssertEqual(NativeMapFocusPinResolutionPolicy.mergeAction(focused: focused, candidates: [sameIDNearby]), .keepExisting(index: 0))
    }

    @MainActor
    func testDiscoverRouteEligibilityResolvesGeneratedVenueCardsAndFailsClosedWithoutCoordinates() throws {
        let parking = NativeParkingSummary(totalAvailable: 12, priceLabel: "$8/hr")
        let venue = NativeVenueSummary(id: "route-deck", name: "Route Deck", category: "parking", address: "1 Route St", distance: "0.2 mi", rating: 4.7, latitude: 33.7866, longitude: -84.3833, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let event = NativeEventSummary(id: "route-event", title: "Route Event", venue: "Event Hall", time: "Tonight", price: "Free", emoji: "🎟️", imageUrl: nil, address: "99 Event Way", latitude: 33.7870, longitude: -84.3830)
        let generated = NativeTabContentStore.homeDiscoverCards(venues: [venue], events: [event])
        let venueCard = try XCTUnwrap(generated.first { $0.id == "venue-\(venue.id)" })
        let companionCard = try XCTUnwrap(generated.first { $0.id.hasPrefix("companion-") })
        let eventCard = try XCTUnwrap(generated.first { $0.id == "event-\(event.id)" })
        let providerCard = NativeDiscoverSummary(id: "place-provider-cafe", type: "coffee", title: "Provider Cafe", subtitle: "2 Route St", distance: "0.3 mi", rating: "4.8", icon: "cup.and.saucer", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Coffee", badgeText: "APPLE MAPS", metadataLine: "Live place", features: [], vibeScore: 7, availability: "Live place", membershipRequired: false, latitude: 33.7870, longitude: -84.3830)
        let unresolved = NativeDiscoverSummary(id: "unresolved", type: "parking", title: "Unknown Deck", subtitle: "Address pending", distance: "Nearby", rating: "Explore", icon: "parkingsign", verified: false, entryType: "free", cta: "Explore", imageUrl: nil, categoryLabel: "Parking", badgeText: "CURATED", metadataLine: "Check nearby", features: [], vibeScore: 1, availability: "Check nearby", membershipRequired: false)
        let localProviderCards = NativeTabContentStore.locationAwareCards([providerCard], sourceVenues: [], location: .verifiedMidtown)

        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: venueCard, venues: [venue])?.id, venue.id)
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: companionCard, venues: [venue])?.id, venue.id)
        XCTAssertEqual(eventCard.subtitle, event.address)
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: eventCard, venues: [])?.address, event.address)
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: eventCard, venues: [])?.latitude, event.latitude)
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: eventCard, venues: [])?.longitude, event.longitude)
        XCTAssertEqual(eventCard.cta, "Book Ride")
        let unresolvedEventWithVenueCollision = NativeDiscoverSummary(id: "event-route-deck", type: "entertainment", title: venue.name, subtitle: venue.address, distance: "Tonight", rating: "Live", icon: "ticket.fill", verified: true, entryType: "free", cta: "View Event", imageUrl: nil, categoryLabel: "Events", badgeText: "LIVE EVENT", metadataLine: "Tonight", features: [], vibeScore: 8, availability: "Tonight", membershipRequired: false)
        XCTAssertNil(NativeDiscoverRouteResolver.routeVenue(for: unresolvedEventWithVenueCollision, venues: [venue]))
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: providerCard, venues: [])?.id, providerCard.id)
        XCTAssertEqual(localProviderCards.first?.latitude, providerCard.latitude)
        XCTAssertEqual(localProviderCards.first?.longitude, providerCard.longitude)
        XCTAssertNil(NativeDiscoverRouteResolver.routeVenue(for: unresolved, venues: [venue]))

        let providerLatitude = try XCTUnwrap(providerCard.latitude)
        let providerLongitude = try XCTUnwrap(providerCard.longitude)
        let sameTitleElsewhere = NativeVenueSummary(id: "different-provider", name: providerCard.title, category: "coffee", address: "Wrong place", distance: "0.5 mi", rating: nil, latitude: 33.7970, longitude: -84.3930, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let exactIDElsewhere = NativeVenueSummary(id: providerCard.id, name: providerCard.title, category: "coffee", address: "Wrong ID place", distance: "0.6 mi", rating: nil, latitude: 33.8070, longitude: -84.4030, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let partialTitleNearby = NativeVenueSummary(id: "provider-annex", name: "Provider Cafe Annex", category: "coffee", address: "Nearby annex", distance: "0.3 mi", rating: nil, latitude: providerLatitude, longitude: providerLongitude, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let suiteName = "NativeProviderDiscoverRouteHandoff.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        for candidate in [sameTitleElsewhere, exactIDElsewhere, partialTitleNearby] {
            let resolved = try XCTUnwrap(NativeDiscoverRouteResolver.routeVenue(for: providerCard, venues: [candidate]))
            XCTAssertEqual(resolved.id, providerCard.id)
            XCTAssertEqual(resolved.latitude, providerCard.latitude)
            XCTAssertEqual(resolved.longitude, providerCard.longitude)
            NativeMapFocusHandoff.store(venue: resolved, defaults: defaults)
            XCTAssertEqual(defaults.string(forKey: NativeMapFocusHandoff.idKey), providerCard.id)
            XCTAssertEqual(defaults.double(forKey: NativeMapFocusHandoff.latitudeKey), providerLatitude)
            XCTAssertEqual(defaults.double(forKey: NativeMapFocusHandoff.longitudeKey), providerLongitude)
            if candidate.id == providerCard.id {
                let focused = NativeMapFocusPinCandidate(id: resolved.id, title: resolved.name, latitude: resolved.latitude, longitude: resolved.longitude)
                let live = NativeMapFocusPinCandidate(id: candidate.id, title: candidate.name, latitude: candidate.latitude, longitude: candidate.longitude)
                XCTAssertEqual(NativeMapFocusPinResolutionPolicy.mergeAction(focused: focused, candidates: [live]), .replaceExisting(indices: [0]))
            }
        }
    }

    func testEventRideQuoteInputRequiresVerifiedCoordinatePairs() throws {
        let event = NativeVenueSummary(id: "event-ride", name: "Coordinate Event", category: "entertainment", address: "1 Event Way", distance: "Tonight", rating: nil, latitude: 33.787, longitude: -84.383, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let pickup = NativeLocationCoordinate(latitude: 33.781, longitude: -84.390, isFallback: false)
        let input = try XCTUnwrap(NativeEventRideBookingContract.quoteInput(event: event, pickup: pickup))

        XCTAssertEqual(input["source"] as? String, "native-event-discovery")
        XCTAssertEqual(input["bookingType"] as? String, "event_ride")
        XCTAssertEqual(input["eventId"] as? String, event.id)
        XCTAssertEqual(input["pickupLat"] as? Double, pickup.latitude)
        XCTAssertEqual(input["pickupLng"] as? Double, pickup.longitude)
        XCTAssertEqual(input["dropoffLat"] as? Double, event.latitude)
        XCTAssertEqual(input["dropoffLng"] as? Double, event.longitude)
        XCTAssertEqual((input["pickupLocation"] as? [String: Double])?["lat"], pickup.latitude)
        XCTAssertEqual((input["dropoffLocation"] as? [String: Double])?["lng"], event.longitude)

        let unresolvedEvent = NativeVenueSummary(id: "unresolved-event", name: "Unresolved Event", category: "entertainment", address: "Address pending", distance: "Tonight", rating: nil, latitude: 0, longitude: 0, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        XCTAssertNil(NativeEventRideBookingContract.quoteInput(event: unresolvedEvent, pickup: pickup))
        XCTAssertNil(NativeEventRideBookingContract.quoteInput(event: event, pickup: .midtown))
    }

    func testEventRidePickupRequiresFreshAccurateFixAndReservationKeepsQuotedCoordinate() throws {
        let now = Date()
        let freshLocation = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 33.781, longitude: -84.390), altitude: 0, horizontalAccuracy: 25, verticalAccuracy: 25, timestamp: now)
        let quotedPickup = try XCTUnwrap(NativeLocationStore.coordinateForRideBooking(location: freshLocation, now: now))
        let staleLocation = CLLocation(coordinate: freshLocation.coordinate, altitude: 0, horizontalAccuracy: 25, verticalAccuracy: 25, timestamp: now.addingTimeInterval(-61))
        let inaccurateLocation = CLLocation(coordinate: freshLocation.coordinate, altitude: 0, horizontalAccuracy: 251, verticalAccuracy: 25, timestamp: now)
        XCTAssertNil(NativeLocationStore.coordinateForRideBooking(location: staleLocation, now: now))
        XCTAssertNil(NativeLocationStore.coordinateForRideBooking(location: inaccurateLocation, now: now))

        let nearbyCurrent = NativeLocationCoordinate(latitude: 33.7812, longitude: -84.3901, isFallback: false)
        let movedCurrent = NativeLocationCoordinate(latitude: 33.791, longitude: -84.400, isFallback: false)
        XCTAssertTrue(NativeEventRideBookingContract.quotedPickupMatchesCurrent(quotedPickup, current: nearbyCurrent))
        XCTAssertFalse(NativeEventRideBookingContract.quotedPickupMatchesCurrent(quotedPickup, current: movedCurrent))

        let event = NativeVenueSummary(id: "event-ride", name: "Coordinate Event", category: "entertainment", address: "1 Event Way", distance: "Tonight", rating: nil, latitude: 33.787, longitude: -84.383, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let quote = NativeMobilityQuoteRecord(id: "quote-123", provider: "bytspot", providerQuoteId: nil, serviceClass: "standard", serviceTitle: "Event ride", priceLabel: "$24", etaLabel: "6 min", pickupLabel: nil, dropoffLabel: nil, cancellationLabel: nil, providerBookingMode: nil, requiresAccountLink: nil, currency: nil, expiresAt: nil)
        let reservation = try XCTUnwrap(NativeEventRideBookingContract.reservationInput(quote: quote, event: event, pickup: quotedPickup))
        XCTAssertEqual(reservation["quoteId"] as? String, quote.id)
        XCTAssertEqual(reservation["pickupLat"] as? Double, quotedPickup.latitude)
        XCTAssertEqual(reservation["pickupLng"] as? Double, quotedPickup.longitude)
    }

    @MainActor
    func testNativeRideBookingRouteRetainsReservationRecord() throws {
        let coordinator = NativeNavigationCoordinator()
        let ride = NativeMobilityRideRecord(id: "ride-123", provider: "bytspot", providerReservationId: "reservation-123", status: "confirmed", serviceTitle: "Event ride", priceLabel: "$24", etaLabel: "6 min", pickupLabel: "Current location", dropoffLabel: "1 Event Way")

        coordinator.presentBooking(ride: ride)

        XCTAssertEqual(coordinator.requestedTab, .home)
        guard case let .booking(status, url, routedRide?) = coordinator.requestedDestination else { return XCTFail("Expected record-aware booking destination") }
        XCTAssertEqual(status, "confirmed")
        XCTAssertEqual(routedRide, ride)
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "rideId" })?.value, ride.id)
    }

    @MainActor
    func testEventDecoderPreservesVerifiedNormalizedAndTicketmasterVenueLocations() throws {
        let normalized = try XCTUnwrap(NativeTabContentStore.event(from: [
            "id": "normalized-event", "title": "Normalized Event", "venue": "Venue", "address": "10 Event Way, Atlanta, GA", "lat": 33.7866, "lng": -84.3833
        ]))
        let ticketmaster = try XCTUnwrap(NativeTabContentStore.event(from: [
            "id": "ticketmaster-event", "name": "Ticketmaster Event", "lat": 33.7866,
            "_embedded": ["venues": [[
                "name": "Venue", "address": ["line1": "1 AMB Dr NW"], "city": ["name": "Atlanta"], "state": ["stateCode": "GA"], "postalCode": "30313",
                "location": ["latitude": "33.7553", "longitude": "-84.4006"]
            ]]]
        ]))

        XCTAssertEqual(normalized.address, "10 Event Way, Atlanta, GA")
        XCTAssertEqual(normalized.latitude, 33.7866)
        XCTAssertEqual(normalized.longitude, -84.3833)
        XCTAssertEqual(ticketmaster.address, "1 AMB Dr NW, Atlanta, GA, 30313")
        XCTAssertEqual(ticketmaster.latitude, 33.7553)
        XCTAssertEqual(ticketmaster.longitude, -84.4006)
    }

    func testDiscoverRouteResolverPrefersExactAndLongestCompanionVenueIDs() {
        let parking = NativeParkingSummary(totalAvailable: 5, priceLabel: "$6/hr")
        let garage = NativeVenueSummary(id: "garage", name: "Garage", category: "parking", address: "1 Short St", distance: "0.2 mi", rating: nil, latitude: 33.7870, longitude: -84.3830, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let parkside = NativeVenueSummary(id: "parkside-garage", name: "Parkside Garage", category: "parking", address: "2 Long St", distance: "0.3 mi", rating: nil, latitude: 33.7871, longitude: -84.3831, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let venues = [garage, parkside]

        XCTAssertEqual(NativeDiscoverRouteResolver.matchingVenue(cardID: "venue-parkside-garage", title: parkside.name, venues: venues)?.id, parkside.id)
        XCTAssertEqual(NativeDiscoverRouteResolver.matchingVenue(cardID: "companion-parking-parkside-garage", title: "Parking nearby: \(parkside.name)", venues: venues)?.id, parkside.id)
    }

    func testSavedMapRouteCodecIsDeterministicAndIgnoresBlankRows() {
        let raw = NativeMapSavedRoutes.rawValue(for: ["route-b", "route-a"])

        XCTAssertEqual(raw, "route-a\nroute-b")
        XCTAssertEqual(NativeMapSavedRoutes.ids(from: "\n\(raw)\n\n"), ["route-a", "route-b"])
        XCTAssertEqual(NativeMapSavedRoutes.storageKey, "bytspot_native_saved_map_route_ids")
    }

    func testOrdinaryMapHandoffDoesNotImplyPartnerOrAccessVerification() {
        let suiteName = "NativeOrdinaryMapHandoffTests.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return XCTFail("Could not create isolated defaults") }
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let venue = NativeVenueSummary(id: "provider-cafe", name: "Provider Cafe", category: "coffee", address: "2 Route St", distance: "0.3 mi", rating: 4.8, latitude: 33.7870, longitude: -84.3830, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)

        NativeMapFocusHandoff.store(venue: venue, defaults: defaults)

        XCTAssertEqual(defaults.string(forKey: NativeMapFocusHandoff.kindKey), "venue")
        XCTAssertEqual(NativeMapPinKind.forVenue(venue), .venue)
        XCTAssertNotEqual(NativeMapPinKind.forVenue(venue), .access)
        XCTAssertEqual(NativeMapPinKind.forVenue(NativeVenueSummary(id: "verified", name: "Verified", category: "coffee", address: "3 Route St", distance: "0.4 mi", rating: nil, latitude: 33.7871, longitude: -84.3831, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: "BYT-VERIFIED", imageUrl: nil)), .partner)
        XCTAssertEqual(NativeMapPinKind.forVenue(NativeVenueSummary(id: "parking", name: "Parking", category: "parking", address: "4 Route St", distance: "0.5 mi", rating: nil, latitude: 33.7872, longitude: -84.3832, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Check nearby"), verifiedPatchId: nil, imageUrl: nil)), .parking)
        let verifiedParking = NativeVenueSummary(id: "verified-parking", name: "Verified Parking", category: "parking", address: "5 Route St", distance: "0.6 mi", rating: nil, latitude: 33.7873, longitude: -84.3833, crowd: nil, parking: NativeParkingSummary(totalAvailable: 8, priceLabel: "$8/hr"), verifiedPatchId: "BYT-PARKING", imageUrl: nil)
        NativeMapFocusHandoff.store(venue: verifiedParking, defaults: defaults)
        XCTAssertEqual(NativeMapPinKind.forVenue(verifiedParking), .partner)
        XCTAssertEqual(defaults.string(forKey: NativeMapFocusHandoff.kindKey), NativeMapPinKind.forVenue(verifiedParking).storageValue)
    }

    func testMapSearchRoutePolicyFailsClosedForUnresolvedTextDestination() {
        let snapshot = NativeTabContentSnapshot(venues: [], discoverCards: [], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)
        let suggestion = NativeSearchSuggestion(id: "parking-near-me", title: "Parking near me", subtitle: "Search nearby", address: "Parking near me", icon: "parkingsign", actionLabel: "Route", badge: "Map", score: 100, route: .map(destination: "Parking near me", mode: "Route"))

        XCTAssertNil(NativeMapSearchRoutePolicy.routeVenue(for: suggestion, snapshot: snapshot, venues: []))
    }

    func testMapSearchRoutePolicyRejectsPartialVenueNamesAndAcceptsExactNames() {
        let snapshot = NativeTabContentSnapshot(venues: [], discoverCards: [], events: [], source: .live, lastUpdated: Date(), errorMessage: nil)
        let venue = NativeVenueSummary(id: "parkside-garage", name: "Parkside Garage", category: "parking", address: "10 Park St", distance: "0.4 mi", rating: nil, latitude: 33.7874, longitude: -84.3834, crowd: nil, parking: NativeParkingSummary(totalAvailable: 5, priceLabel: "$6/hr"), verifiedPatchId: nil, imageUrl: nil)
        let partial = NativeSearchSuggestion(id: "route-park", title: "Route to Park", subtitle: "Open Map", address: "Park", icon: "arrow.triangle.turn.up.right.diamond.fill", actionLabel: "Route", badge: "Map", score: 200, route: .map(destination: "Park", mode: "Route"))
        let exact = NativeSearchSuggestion(id: "route-parkside", title: "Route to Parkside Garage", subtitle: "Open Map", address: venue.name, icon: "arrow.triangle.turn.up.right.diamond.fill", actionLabel: "Route", badge: "Map", score: 200, route: .map(destination: venue.name, mode: "Route"))
        let normalizedExact = NativeSearchSuggestion(id: "route-normalized-parkside", title: "Route to Parkside---Garage", subtitle: "Open Map", address: venue.name, icon: "arrow.triangle.turn.up.right.diamond.fill", actionLabel: "Route", badge: "Map", score: 200, route: .map(destination: "  Parkside---   Garage  ", mode: "Route"))
        let duplicateName = NativeVenueSummary(id: "other-parkside", name: venue.name, category: "parking", address: "11 Park St", distance: "0.5 mi", rating: nil, latitude: 33.7875, longitude: -84.3835, crowd: nil, parking: NativeParkingSummary(totalAvailable: 2, priceLabel: "$7/hr"), verifiedPatchId: nil, imageUrl: nil)

        XCTAssertNil(NativeMapSearchRoutePolicy.routeVenue(for: partial, snapshot: snapshot, venues: [venue]))
        XCTAssertEqual(NativeMapSearchRoutePolicy.routeVenue(for: exact, snapshot: snapshot, venues: [venue])?.id, venue.id)
        XCTAssertEqual(NativeMapSearchRoutePolicy.routeVenue(for: normalizedExact, snapshot: snapshot, venues: [venue])?.id, venue.id)
        XCTAssertNil(NativeMapSearchRoutePolicy.routeVenue(for: exact, snapshot: snapshot, venues: [venue, duplicateName]))
    }

    func testMapFunctionSheetUsesAViewportBoundedScrollableHeight() {
        XCTAssertGreaterThan(NativeMapInteractionContract.functionSheetMaxHeightFraction, 0.5)
        XCTAssertLessThan(NativeMapInteractionContract.functionSheetMaxHeightFraction, 1.0)
    }

    func testRegionalMapFocusHandoffExpiresOutsideItsOriginWhileExplicitFocusRemainsValid() {
        let suiteName = "NativeRegionalMapFocusHandoffTests.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return XCTFail("Could not create isolated defaults") }
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let atlanta = NativeLocationCoordinate.verifiedMidtown
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        let parking = NativeParkingSummary(totalAvailable: 18, priceLabel: "$8/hr")
        let venue = NativeVenueSummary(id: "midtown-deck", name: "Midtown Deck", category: "parking", address: "Atlanta", distance: "0.2 mi", rating: 4.8, latitude: 33.7866, longitude: -84.3833, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)

        NativeMapFocusHandoff.store(venue: venue, locationScopeOrigin: atlanta, defaults: defaults)
        XCTAssertTrue(NativeMapFocusHandoff.isLocationScoped(in: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.requestID(in: defaults).isEmpty)
        XCTAssertTrue(NativeMapFocusHandoff.canConsume(at: atlanta, defaults: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.canConsume(at: seattle, defaults: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.canConsume(at: .midtown, defaults: defaults))

        NativeMapFocusHandoff.store(venue: venue, defaults: defaults)
        XCTAssertFalse(NativeMapFocusHandoff.isLocationScoped(in: defaults))
        XCTAssertEqual(defaults.string(forKey: NativeMapFocusHandoff.sourceKey), NativeMapFocusHandoff.explicitSource)
        XCTAssertTrue(NativeMapFocusHandoff.canConsume(at: seattle, defaults: defaults))

        // A Discover Route tap is direct user intent, so it remains usable
        // while the Map screen is mounting rather than being treated as a
        // location-scoped regional recommendation.
        NativeMapFocusHandoff.store(venue: venue, modeOverride: "Route", defaults: defaults)
        XCTAssertEqual(defaults.string(forKey: NativeMapFocusHandoff.sourceKey), NativeMapFocusHandoff.explicitSource)
        XCTAssertFalse(NativeMapFocusHandoff.isLocationScoped(in: defaults))
        XCTAssertTrue(NativeMapFocusHandoff.canConsume(at: seattle, defaults: defaults))
        NativeMapFocusHandoff.store(venue: venue, locationScopeOrigin: .midtown, defaults: defaults)
        XCTAssertFalse(NativeMapFocusHandoff.hasPendingFocus(in: defaults))
    }

    @MainActor
    func testDiscoverRouteHandoffKeepsTheExplicitVenueUntilMapConsumesIt() throws {
        let venue = NativeVenueSummary(id: "route-cafe", name: "Route Cafe", category: "coffee", address: "1 Route St", distance: "0.3 mi", rating: 4.8, latitude: 33.7870, longitude: -84.3830, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let handoff = NativeDirectMapRouteStore()

        handoff.stageRoute(to: venue)

        XCTAssertTrue(handoff.hasPendingRoute)
        XCTAssertEqual(try XCTUnwrap(handoff.consumeRoute()).venue.id, venue.id)
        XCTAssertFalse(handoff.hasPendingRoute)
    }

    func testDirectRoutePrecedenceDiscardsLatePersistedFocusWithoutResettingTheRoute() {
        let directID = "route-cafe"

        XCTAssertTrue(NativeMapHandoffPrecedencePolicy.directRouteIsActive(directRoutePinID: directID, selectedMode: "Route", selectedPinID: directID, routeFocusedPinID: directID, activeRoutePinID: directID))
        XCTAssertEqual(NativeMapHandoffPrecedencePolicy.persistedFocusDisposition(directRoutePinID: directID, selectedMode: "Route", selectedPinID: directID, routeFocusedPinID: directID, activeRoutePinID: directID), .discard)
        XCTAssertTrue(NativeMapHandoffPrecedencePolicy.hasMatchingRequestID("fresh-request", storedRequestID: "fresh-request"))
        XCTAssertFalse(NativeMapHandoffPrecedencePolicy.hasMatchingRequestID("", storedRequestID: "fresh-request"))
        XCTAssertFalse(NativeMapHandoffPrecedencePolicy.hasMatchingRequestID("stale-request", storedRequestID: "fresh-request"))

        XCTAssertEqual(NativeMapHandoffPrecedencePolicy.persistedFocusDisposition(directRoutePinID: directID, selectedMode: "Nearby", selectedPinID: nil, routeFocusedPinID: nil, activeRoutePinID: nil), .apply)
    }

    func testLegacyMapFocusHandoffWithoutPositiveProvenanceFailsClosed() {
        let suiteName = "NativeLegacyMapFocusHandoffTests.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return XCTFail("Could not create isolated defaults") }
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set("legacy-midtown", forKey: NativeMapFocusHandoff.idKey)
        defaults.set("Legacy Midtown Recommendation", forKey: NativeMapFocusHandoff.titleKey)
        defaults.set(33.7866, forKey: NativeMapFocusHandoff.latitudeKey)
        defaults.set(-84.3833, forKey: NativeMapFocusHandoff.longitudeKey)

        XCTAssertTrue(NativeMapFocusHandoff.hasPendingFocus(in: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.canConsume(at: .verifiedMidtown, defaults: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.canConsume(at: NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false), defaults: defaults))
        XCTAssertFalse(NativeMapFocusHandoff.canConsume(at: .midtown, defaults: defaults))
    }

    func testOnboardingCopyRequiresVerifiedAtlantaLocationForAtlantaAndMidtownLabels() {
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        for location in [NativeLocationCoordinate.midtown, seattle] {
            let copy = ([NativeAuthLaunchContract.landingSubtitle(for: location)]
                + NativeAuthLaunchContract.landingFeatures(for: location)
                + [NativeLaunchQuizContext.day.line(for: location), NativeLaunchQuizContext.evening.line(for: location), NativeLaunchQuizContext.lateNight.line(for: location)])
                .joined(separator: " ")
            XCTAssertFalse(copy.localizedCaseInsensitiveContains("Atlanta"))
            XCTAssertFalse(copy.localizedCaseInsensitiveContains("Midtown"))
            XCTAssertTrue(copy.localizedCaseInsensitiveContains("near you") || copy.localizedCaseInsensitiveContains("nearby"))
        }

        let atlantaCopy = ([NativeAuthLaunchContract.landingSubtitle(for: .verifiedMidtown)]
            + NativeAuthLaunchContract.landingFeatures(for: .verifiedMidtown)
            + [NativeLaunchQuizContext.evening.line(for: .verifiedMidtown)])
            .joined(separator: " ")
        XCTAssertTrue(atlantaCopy.localizedCaseInsensitiveContains("Atlanta"))
        XCTAssertTrue(atlantaCopy.localizedCaseInsensitiveContains("Midtown"))
    }

    func testBestValueUsesTRPCQueryTransport() throws {
        let path = try NativeTabContentStore.bestValueQueryPath()
        let request = try BytspotAPIClient().makeRequest(path: path)

        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.httpBody)
        XCTAssertTrue(path.hasPrefix("/trpc/live.bestValue?input="))
    }

    func testPlacesNearbyUsesTRPCQueryTransport() throws {
        let path = try BytspotAPIClient.trpcQueryPath(NativeLiveContentV2Contract.placesNearbySearchRoute, input: ["lat": 33.7866, "lng": -84.3833, "type": "parking", "maxResults": 8])
        let request = try BytspotAPIClient().makeRequest(path: path)
        let components = URLComponents(string: path)
        let rawInput = try XCTUnwrap(components?.queryItems?.first(where: { $0.name == "input" })?.value)
        let data = try XCTUnwrap(rawInput.data(using: .utf8))
        let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.httpBody)
        XCTAssertTrue(path.hasPrefix("/trpc/places.nearbySearch?input="))
        XCTAssertEqual(decoded["lat"] as? Double, 33.7866)
        XCTAssertEqual(decoded["lng"] as? Double, -84.3833)
        XCTAssertEqual(decoded["type"] as? String, "parking")
        XCTAssertEqual(decoded["maxResults"] as? Int, 8)
    }

    func testPlacesTextSearchUsesTRPCQueryTransport() throws {
        let query = "bars & clubs = late"
        let path = try BytspotAPIClient.trpcQueryPath(NativeLiveContentV2Contract.placesTextSearchRoute, input: ["query": query, "lat": 33.7866, "lng": -84.3833, "maxResults": 5])
        let request = try BytspotAPIClient().makeRequest(path: path)
        let components = URLComponents(string: path)
        let rawInput = try XCTUnwrap(components?.queryItems?.first(where: { $0.name == "input" })?.value)
        let data = try XCTUnwrap(rawInput.data(using: .utf8))
        let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.httpBody)
        XCTAssertTrue(path.hasPrefix("/trpc/places.textSearch?input="))
        XCTAssertEqual(decoded["query"] as? String, query)
    }

    func testDiscoverCategoryNormalizerMapsNightlifeAliases() {
        let nightlifeAliases = ["bar", "bars", "club", "night_club", "cocktail lounge", "strip club", "adult entertainment", "pub", "rooftop bar", "speakeasy", "wine lounge", "karaoke"]

        for alias in nightlifeAliases {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: alias), "nightlife", "\(alias) should appear under Nightlife in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedNightlifeUniverse() {
        let categories = ["EDM club", "hip-hop club", "Latin club", "LGBTQ club", "sports bar", "cigar lounge", "hookah lounge", "jazz club", "blues club", "comedy club", "improv theater", "salsa club", "casino", "poker room", "cabaret", "burlesque", "gentlemen club", "VR gaming center", "esports lounge", "bowling alley", "billiards hall", "escape room", "axe throwing", "trivia night", "after-hours venue", "night spa", "thermal baths"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "nightlife", "\(category) should be discoverable from Nightlife.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedEventUniverse() {
        let categories = ["concert", "music festival", "comedy show", "theater play", "musical", "opera", "ballet", "dance performance", "magic show", "circus", "movie screening", "outdoor cinema", "talent show", "open mic night", "karaoke event", "club night", "DJ set", "pool party", "beach party", "rooftop party", "yacht party", "house party", "silent disco", "after party", "cocktail event", "happy hour", "bar crawl", "singles mixer", "professional sports", "tournament", "marathon", "golf tournament", "boxing event", "MMA event", "conference", "trade show", "expo", "networking event", "seminar", "workshop", "product launch", "career fair", "startup pitch", "award ceremony", "lecture", "webinar", "panel discussion", "book talk", "science fair", "coding bootcamp", "art exhibition", "museum event", "gallery opening", "cultural festival", "poetry reading", "book signing", "film festival", "fashion show", "food festival", "wine tasting", "beer festival", "cooking class", "farmers market", "community festival", "charity event", "volunteer activity", "town hall", "kids workshop", "holiday celebration", "New Year's Eve party", "Pride celebration", "health fair", "meditation session", "spa event", "worship service", "prayer meeting", "hackathon", "LAN party", "gaming tournament", "VR experience", "car show", "racing event", "hiking trip", "fishing tournament", "flea market", "wedding", "birthday party", "graduation party", "campaign event", "debate", "virtual conference", "live stream", "hybrid conference", "anime convention", "comic convention", "pet show", "boat show", "maker faire", "cosplay event"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "entertainment", "\(category) should appear under Events in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedDiningUniverse() {
        let categories = ["fine dining", "family style", "fast casual", "QSR", "buffet", "food court", "ghost kitchen", "food truck", "diner", "bistro", "brasserie", "bakery", "patisserie", "ice cream shop", "juice bar", "wine bar", "gastropub", "brewpub", "taproom", "Southern", "soul food", "Cajun Creole", "BBQ", "Mexican", "Tex-Mex", "Latin American", "Caribbean", "Italian", "Greek", "Middle Eastern", "Lebanese", "Indian", "Chinese", "Japanese", "Korean", "Thai", "Vietnamese", "African", "Ethiopian", "Nigerian", "Brazilian", "Fusion", "seafood", "steakhouse", "sushi", "ramen", "pizza", "burger", "sandwich shop", "deli", "wings", "tacos", "hot dogs", "breakfast", "brunch", "salad bar", "vegan", "plant-based", "gluten-free", "halal", "kosher", "rooftop dining", "chef's table", "private dining", "dinner theater", "live music dining", "table service", "drive-thru", "curbside pickup", "late-night dining", "mocktail bar", "brewery restaurant", "distillery restaurant", "dinner show", "live music restaurant", "comedy dinner club", "sports restaurant", "karaoke restaurant", "tasting menu restaurant", "wine pairing experience", "airport restaurant", "hotel restaurant", "casino restaurant", "cruise ship dining"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "dining", "\(category) should appear under Dining in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedShoppingUniverse() {
        let categories = ["party supplies", "balloons", "decorations", "costumes", "invitations", "gift wrap", "wedding supplies", "gifts", "personalized gifts", "gift baskets", "flowers", "greeting cards", "souvenirs", "seasonal gifts", "designer fashion", "luxury watches", "fine jewelry", "luxury beauty", "premium home decor", "collectible art", "eco-friendly products", "handmade goods", "fair trade products", "vintage items", "antique items", "refurbished products", "local products", "department store", "discount store", "outlet store", "warehouse club", "convenience store", "specialty store", "supermarket", "hypermarket", "shopping mall", "boutique shop", "online marketplace", "pop-up shop"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "shopping", "\(category) should appear under Shopping in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedBoutiqueStayUniverse() {
        let categories = ["yoga retreat", "meditation retreat", "wellness retreat", "spiritual retreat", "detox retreat", "bed & breakfast", "B&B", "country inn", "boutique inn", "camping", "glamping", "RV park", "caravan park", "tiny house", "treehouse", "farm stay", "ranch stay", "safari lodge", "yurt", "dome stay", "castle hotel", "palace hotel", "floating hotel", "houseboat", "overwater bungalow", "ice hotel", "cave hotel", "lighthouse stay", "luxury tent", "beach resort", "mountain resort", "ski resort", "golf resort", "spa resort", "eco resort", "wellness resort", "family resort", "all-inclusive resort", "island resort", "vacation rental", "holiday home", "villa", "apartment rental", "condo rental", "serviced apartment", "townhouse rental", "cabin", "cottage", "chalet"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "boutique_apartment", "\(category) should appear under Boutique Stay in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedMobilityUniverse() {
        let categories = ["ATV rental", "UTV rental", "snowmobile rental", "jet ski rental", "luxury car rental", "exotic car rental", "off-road vehicle tours", "horseback riding", "marine transportation", "cruise ship", "yacht charter", "boat rental", "water shuttle", "sailboat charter", "kayak rental", "canoe rental", "commercial flights", "charter flights", "private jet", "helicopter charter", "air taxi", "seaplane", "hot air balloon", "chauffeur service", "limousine service"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "mobility", "\(category) should appear under Mobility in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedFitnessUniverse() {
        let categories = ["commercial gym", "boutique fitness studio", "personal training", "functional training", "strength training", "weightlifting", "powerlifting", "Olympic weightlifting", "CrossFit", "HIIT", "circuit training", "bootcamp", "group fitness classes", "running", "jogging", "walking clubs", "cycling", "spin classes", "indoor cycling", "rowing", "stair climbing", "swimming", "triathlon training", "yoga", "pilates", "barre", "tai chi", "qigong", "meditation", "breathwork", "stretching", "mobility training", "dance fitness", "Zumba", "hip-hop fitness", "salsa fitness", "boxing", "kickboxing", "Muay Thai", "Brazilian Jiu-Jitsu", "judo", "karate", "taekwondo", "Krav Maga", "MMA", "wrestling", "basketball training", "soccer training", "golf fitness", "trail running", "rock climbing", "bouldering", "mountain biking", "kayaking", "paddleboarding", "aqua aerobics", "lap swimming", "physical therapy", "sports massage", "cryotherapy", "infrared sauna", "cold plunge", "compression therapy", "recovery lounge", "senior fitness", "women's fitness", "kids fitness", "prenatal fitness", "corporate wellness", "nutrition coaching", "health club", "recreation center", "hotel gym", "outdoor fitness park", "climbing gym", "trampoline park", "ninja warrior gym"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "fitness", "\(category) should appear under Fitness in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerMapsExpandedParkingUniverse() {
        let categories = ["public parking", "street parking", "public parking lot", "public parking garage", "municipal parking", "downtown parking", "event parking", "private parking lot", "residential parking", "apartment parking", "office parking", "hotel parking", "restaurant parking", "retail parking", "shopping mall parking", "airport parking", "train station parking", "bus station parking", "ferry terminal parking", "park-and-ride", "transit parking", "self-parking", "valet parking", "covered parking", "underground parking", "multi-level garage", "surface lot", "reserved parking", "assigned parking", "motorcycle parking", "bicycle parking", "RV parking", "bus parking", "truck parking", "EV parking", "accessible ADA parking", "family parking", "senior parking", "VIP parking", "visitor parking", "carpool parking", "EV charging stations", "Tesla Supercharger parking", "solar-powered parking", "gated parking", "secured parking", "CCTV-monitored parking", "24/7 parking", "free parking", "paid parking", "hourly parking", "monthly parking", "metered parking", "festival parking", "stadium parking", "concert parking", "convention center parking", "wedding parking", "shuttle parking", "airport long-term parking", "airport short-term parking", "hotel valet", "vehicle storage", "car wash while parked", "automated parking garage"]

        for category in categories {
            XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: category), "parking", "\(category) should appear under Parking in native Discover.")
        }
    }

    func testDiscoverCategoryNormalizerAvoidsNightlifeFalsePositives() {
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "coffee bar"), "coffee")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "barber shop"), "shopping")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "restaurant bar"), "dining")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "dog park"), "venue")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "cruise ship dining"), "dining")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "kayak rental"), "mobility")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "kayaking"), "fitness")
        XCTAssertEqual(NativeDiscoverCategoryNormalizer.type(for: "yacht party"), "entertainment")
    }

    func testNativeVenueDiscoverTypeUsesSharedNightlifeMapping() {
        let venue = venue(name: "Tongue & Groove", category: "club", address: "Atlanta nightlife")

        XCTAssertEqual(venue.discoverType, "nightlife")
        XCTAssertEqual(NativeTabContentStore.icon(for: venue.discoverType), "music.note")
    }

    func testBestValueQueryPathCarriesRawInputJSON() throws {
        let path = try NativeTabContentStore.bestValueQueryPath(input: ["productType": "parking", "lat": 33.7, "lng": -84.3, "limit": 2, "strict": false])
        let components = URLComponents(string: path)
        let rawInput = try XCTUnwrap(components?.queryItems?.first(where: { $0.name == "input" })?.value)
        let data = try XCTUnwrap(rawInput.data(using: .utf8))
        let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(decoded["productType"] as? String, "parking")
        XCTAssertEqual(decoded["lat"] as? Double, 33.7)
        XCTAssertEqual(decoded["lng"] as? Double, -84.3)
        XCTAssertEqual(decoded["limit"] as? Int, 2)
        XCTAssertEqual(decoded["strict"] as? Bool, false)
    }

    func testBestValueDefaultInputUsesLocationCoordinate() {
        let coordinate = NativeLocationCoordinate(latitude: 34.1, longitude: -84.2, isFallback: false)
        let input = NativeTabContentStore.bestValueQueryInput(location: coordinate)

        XCTAssertEqual(input["lat"] as? Double, 34.1)
        XCTAssertEqual(input["lng"] as? Double, -84.2)
        XCTAssertEqual(input["productType"] as? String, "any")
        XCTAssertEqual(input["strict"] as? Bool, false)
    }

    func testNativeLocationCoordinateFormatsNearbyDistances() {
        let here = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: false)

        XCTAssertEqual(here.displayName, "your location")
        XCTAssertEqual(here.distanceLabel(toLatitude: 33.7878, longitude: -84.3832), "Here")
        XCTAssertEqual(NativeLocationCoordinate.midtown.displayName, "your area")
        XCTAssertTrue(here.distanceLabel(toLatitude: 33.7900, longitude: -84.3890)?.hasSuffix("mi") == true)
    }

    func testLocalTravelEstimateDoesNotClaimGoogleRoutes() throws {
        let api = NativeLiveDiscoveryAPI(client: BytspotAPIClient())
        let estimate = try XCTUnwrap(api.localTravelEstimate(origin: .midtown, destinationLat: 33.7900, destinationLng: -84.3890))

        XCTAssertEqual(estimate.provider, "local_distance")
        XCTAssertTrue(estimate.distanceText.hasSuffix("mi"))
        XCTAssertTrue(estimate.durationText.hasPrefix("~"))
    }

    func testPremiumFunctionsLockedWithoutEntitlement() {
        for function in BytspotPremiumMapFunction.allCases {
            XCTAssertFalse(BytspotMapFunctionCatalog.isUnlocked(function, for: .green), "\(function.rawValue) must stay locked for Green membership.")
            XCTAssertTrue(BytspotMapFunctionCatalog.isUnlocked(function, for: .platinum), "\(function.rawValue) must unlock for Platinum membership.")
            XCTAssertTrue(BytspotMapFunctionCatalog.isUnlocked(function, for: .black), "\(function.rawValue) must unlock for Black membership.")
        }
    }

    func testPremiumFunctionEnumCoversExactlyTheGatedTokens() {
        XCTAssertEqual(Set(BytspotPremiumMapFunction.allCases.map(\.rawValue)), Set(BytspotMapFunctionCatalog.premiumFunctionTokens))
    }

    private func serviceHereContext(
        selectedKind: NativeServiceHerePinKind? = nil,
        selectedTitle: String? = nil,
        selectedSubtitle: String? = nil,
        bestValueTitle: String? = nil,
        bestValueSummary: String? = nil,
        isWithinVerifiedZone: Bool = false
    ) -> NativeServiceHereContext {
        NativeServiceHereContext(
            selectedKind: selectedKind,
            selectedTitle: selectedTitle,
            selectedSubtitle: selectedSubtitle,
            parkingTitle: selectedKind == .parking ? selectedTitle : "Midtown Smart Parking",
            parkingSubtitle: selectedKind == .parking ? selectedSubtitle : "22 spots · $8/hr",
            partnerTitle: selectedKind == .partner || selectedKind == .access ? selectedTitle : "Colony Square",
            partnerSubtitle: selectedKind == .partner || selectedKind == .access ? selectedSubtitle : "Verified Tap Zone · Active",
            bestValueTitle: bestValueTitle,
            bestValueSummary: bestValueSummary,
            isWithinVerifiedZone: isWithinVerifiedZone,
            isAuthenticated: false
        )
    }

    // MARK: - Live membership decode (NativeMembershipTierStore tRPC parity)

    func testMembershipDecodeToleratesPlainTRPCEnvelope() {
        let payload: [String: Any] = ["result": ["data": ["isPremium": true, "isVendorPremium": false]]]
        XCTAssertEqual(NativeMembershipTierStore.findBool(named: "isPremium", in: payload), true)
    }

    func testMembershipDecodeToleratesSuperjsonTRPCEnvelope() {
        let payload: [String: Any] = ["result": ["data": ["json": ["isPremium": false]]]]
        XCTAssertEqual(NativeMembershipTierStore.findBool(named: "isPremium", in: payload), false)
    }

    func testMembershipDecodePrefersExplicitBlackTier() {
        let payload: [String: Any] = ["result": ["data": ["json": ["membershipTier": "black", "isPremium": true]]]]
        XCTAssertEqual(NativeMembershipTierStore.findString(named: "membershipTier", in: payload), "black")
        XCTAssertEqual(BytspotTier(rawValue: NativeMembershipTierStore.findString(named: "membershipTier", in: payload) ?? ""), .black)
    }

    func testMembershipDecodeFailsSafeWhenKeyMissing() {
        let payload: [String: Any] = ["result": ["data": ["isVendorPremium": true]]]
        XCTAssertNil(NativeMembershipTierStore.findBool(named: "isPremium", in: payload))
    }

    func testMembershipRefreshRejectsStaleGenerationOrSession() {
        XCTAssertTrue(NativeMembershipTierStore.canApplyRefresh(
            generation: 2, currentGeneration: 2,
            expectedToken: "token-a", currentToken: "token-a",
            expectedUserID: "user-a", currentUserID: "user-a"
        ))
        XCTAssertFalse(NativeMembershipTierStore.canApplyRefresh(
            generation: 1, currentGeneration: 2,
            expectedToken: "token-a", currentToken: "token-a",
            expectedUserID: "user-a", currentUserID: "user-a"
        ))
        XCTAssertFalse(NativeMembershipTierStore.canApplyRefresh(
            generation: 2, currentGeneration: 2,
            expectedToken: "token-a", currentToken: nil,
            expectedUserID: "user-a", currentUserID: nil
        ))
    }
}

final class NativeProfileDataAPITests: XCTestCase {
    func testTRPCDecodeUnwrapsSuperjsonProfileEnvelope() throws {
        let envelope: [String: Any] = ["result": ["data": ["json": ["id": "user_1", "email": "member@example.com", "name": "Test Member", "phone": "+1 555 0100", "address": "Example City", "birthday": "1994-04-03"]]]]
        let record = try decode(NativeUserProfileRecord.self, from: envelope)
        XCTAssertEqual(record.email, "member@example.com")
        XCTAssertEqual(record.name, "Test Member")
    }

    func testTRPCDecodeUnwrapsVehicleArrayEnvelope() throws {
        let vehicle: [String: Any] = ["id": "veh_1", "type": "sedan", "make": "Tesla", "model": "Model 3", "year": 2026, "color": "Midnight Blue", "licensePlate": "BYT-424", "transmissionType": "automatic", "trunkCategory": "full"]
        let records = try decode([NativeVehicleRecord].self, from: ["result": ["data": ["json": [vehicle]]]])
        XCTAssertEqual(records.first?.title, "2026 Tesla Model 3")
        XCTAssertEqual(records.first?.licensePlate, "BYT-424")
    }

    func testMobilityRideDecodeNormalizesDriverAndPlateTemplate() throws {
        let ride: [String: Any] = [
            "id": "ride_1",
            "providerBookingId": "ELF-123",
            "status": "driver matching",
            "driver": ["name": "Kwame Mensah"],
            "vehicle": ["color": "Black", "makeModel": "Tesla Model Y", "licensePlate": "ATL-4821"],
            "tracking": ["url": "https://track.example/ELF-123"]
        ]
        let record = try decode(NativeMobilityRideRecord.self, from: ["result": ["data": ["json": ride]]])
        XCTAssertEqual(record.normalizedProviderReservationId, "ELF-123")
        XCTAssertEqual(record.normalizedStatus, "driver_matching")
        XCTAssertEqual(record.normalizedDriverName, "Kwame Mensah")
        XCTAssertEqual(record.normalizedPlateLabel, "ATL-4821")
        XCTAssertEqual(record.normalizedVehicleLine, "Black Tesla Model Y")
        XCTAssertEqual(record.normalizedTrackingURL?.absoluteString, "https://track.example/ELF-123")
    }

    func testTRPCDecodeUnwrapsPlainPaymentEnvelope() throws {
        let envelope: [String: Any] = ["result": ["data": ["id": "pm_1", "type": "card", "brand": "visa", "last4": "4242", "expiryMonth": "04", "expiryYear": "30", "isDefault": true]]]
        let record = try decode(NativePaymentMethodRecord.self, from: envelope)
        XCTAssertEqual(record.label, "Visa •••• 4242")
        XCTAssertEqual(record.detail, "04/30")
        XCTAssertTrue(record.isDefault)
    }

    func testPaymentSetupSessionAllowsOnlyApprovedSecureHosts() {
        XCTAssertEqual(NativePaymentSetupSession(url: "https://billing.stripe.com/p/session_123").safeSetupURLString, "https://billing.stripe.com/p/session_123")
        XCTAssertEqual(NativePaymentSetupSession(url: "https://bytspot.app/payments/setup").safeSetupURLString, "https://bytspot.app/payments/setup")
        XCTAssertNil(NativePaymentSetupSession(url: "javascript:alert(1)").safeSetupURLString)
        XCTAssertNil(NativePaymentSetupSession(url: "http://checkout.stripe.com/insecure").safeSetupURLString)
        XCTAssertNil(NativePaymentSetupSession(url: "https://stripe.evil.example/setup").safeSetupURLString)
    }

    func testNativePushTokenNormalizationAndRejection() {
        let uppercaseToken = String(repeating: "AB", count: 32)
        let normalizedToken = String(repeating: "ab", count: 32)
        XCTAssertEqual(NativePushService.normalizedToken(" \(uppercaseToken) "), normalizedToken)
        XCTAssertEqual(NativePushService.normalizedToken(Data(repeating: 0xAB, count: 32)), normalizedToken)
        XCTAssertNil(NativePushService.normalizedToken(""))
        XCTAssertNil(NativePushService.normalizedToken(String(repeating: "a", count: 63)))
        XCTAssertNil(NativePushService.normalizedToken(Data(repeating: 0xAB, count: 31)))
        XCTAssertNil(NativePushService.normalizedToken("aa bb"))
        XCTAssertNil(NativePushService.normalizedToken(String(repeating: "z", count: 64)))
    }

    @MainActor
    func testNativePushPayloadAcceptsOnlyBytspotRoutes() {
        let partyURL = NativePushURLPolicy.routeURL(from: ["deepLink": "bytspot://party/party_123"])
        XCTAssertEqual(partyURL?.absoluteString, "bytspot://party/party_123")
        XCTAssertEqual(NativePushURLPolicy.routeURL(from: ["url": "https://bytspot.app/party/party_123"])?.host, "bytspot.app")
        let navigation = NativeNavigationCoordinator()
        XCTAssertTrue(navigation.handle(url: try! XCTUnwrap(partyURL)))
        XCTAssertEqual(navigation.requestedDestination?.id, "party-party_123")
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["url": "https://app.bytspot.app/party/party_123"]))
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["url": "https://bytspot.app.evil.example/party/party_123"]))
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["url": "http://bytspot.app/party/party_123"]))
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["url": "bytspot://evil/redirect"]))
        XCTAssertNil(NativePushURLPolicy.routeURL(from: ["redirect": "bytspot://party/party_123"]))
    }

    func testNativePushRegistrationInputMatchesProductionContract() throws {
        XCTAssertEqual(NativePushDeviceAPI.registerPath, "/trpc/push.registerIosDevice")
        XCTAssertEqual(NativePushDeviceAPI.unregisterPath, "/trpc/push.unregisterIosDevice")
        let uppercaseToken = String(repeating: "AB", count: 32)
        let normalizedToken = String(repeating: "ab", count: 32)
        let registration = try XCTUnwrap(NativePushDeviceRegistration.production(token: uppercaseToken))
        XCTAssertEqual(registration.input["token"] as? String, normalizedToken)
        XCTAssertEqual(registration.input["environment"] as? String, "production")
        XCTAssertEqual(registration.input["bundleId"] as? String, "com.bytspot.app")

        let body = try BytspotAPIClient.trpcMutationBody(registration.input)
        let input = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(input["environment"] as? String, "production")
    }

    func testTRPCDecodeUnwrapsNotificationPreferenceEnvelope() throws {
        let prefs: [String: Any] = ["push": ["reservations": true, "promotions": true, "reminders": true, "insider": true, "nearby": false], "email": ["reservations": true, "promotions": false, "newsletter": true, "receipts": true], "sms": ["reservations": true, "reminders": true, "emergencies": true]]
        let record = try decode(NativeNotificationPreferences.self, from: ["result": ["data": ["json": prefs]]])
        XCTAssertEqual(record, .webDefaults)
        XCTAssertFalse(record.push.nearby)
        XCTAssertFalse(record.email.promotions)
    }

    func testTRPCDecodeUnwrapsUserPreferenceEnvelope() throws {
        let prefs: [String: Any] = ["vibes": ["drinks"], "parking": ["covered": true, "evCharging": true, "security": "premium"]]
        let record = try decode(NativeUserPreferencesRecord.self, from: ["result": ["data": ["json": prefs]]])
        XCTAssertEqual(record.vibes, ["drinks"])
        XCTAssertEqual(record.parking?.covered, true)
        XCTAssertEqual(record.parking?.security, "premium")
    }

    func testPreferenceMutationInputsMirrorReactContracts() throws {
        let notificationInput = NativeProfileDataAPI.notificationInput(.webDefaults)
        XCTAssertEqual((notificationInput["push"] as? [String: Bool])?["reservations"], true)
        XCTAssertEqual((notificationInput["push"] as? [String: Bool])?["nearby"], false)
        XCTAssertEqual((notificationInput["email"] as? [String: Bool])?["promotions"], false)

        let parking = NativeUserPreferencesRecord.Parking(covered: true, evCharging: true, security: "premium")
        let userInput = NativeProfileDataAPI.userPreferencesInput(vibeToken: "drinks", parking: parking)
        XCTAssertEqual(userInput["vibes"] as? [String], ["drinks"])
        XCTAssertEqual((userInput["parking"] as? [String: Any])?["covered"] as? Bool, true)
        XCTAssertEqual((userInput["parking"] as? [String: Any])?["security"] as? String, "premium")
    }

    func testNetworkUsesSocialCircleAndInvitationRoutes() throws {
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsListRoute, "/trpc/social.groups.list")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsCreateRoute, "/trpc/social.groups.create")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsDeleteRoute, "/trpc/social.groups.delete")
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsMembersAddRoute, "/trpc/social.groups.members.add")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesListRoute, "/trpc/social.invites.list")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesCreateRoute, "/trpc/social.invites.create")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesRespondRoute, "/trpc/social.invites.respond")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesCancelRoute, "/trpc/social.invites.cancel")
        XCTAssertEqual(NativeLiveContentV2Contract.partyDraftDeleteRoute, "/trpc/events.drafts.delete")
        XCTAssertEqual(NativeLiveContentV2Contract.socialPeopleMetOptInRoute, "/trpc/social.peopleMet.optIn")
        XCTAssertEqual(NativeLiveContentV2Contract.socialPeopleMetOptOutRoute, "/trpc/social.peopleMet.optOut")
        XCTAssertEqual(NativeLiveContentV2Contract.socialPeopleMetStatusRoute, "/trpc/social.peopleMet.status")
        XCTAssertEqual(NativeLiveContentV2Contract.socialPeopleMetListRoute, "/trpc/social.peopleMet.list")
        XCTAssertEqual(NativeProfileDataAPI.socialCircleListInput()["surface"] as? String, "network")

        let path = try BytspotAPIClient.trpcQueryPath(NativeLiveContentV2Contract.socialGroupsListRoute, input: NativeProfileDataAPI.socialCircleListInput())
        let components = URLComponents(string: path)
        let rawInput = try XCTUnwrap(components?.queryItems?.first(where: { $0.name == "input" })?.value)
        let data = try XCTUnwrap(rawInput.data(using: .utf8))
        let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(decoded["surface"] as? String, "network")
    }

    func testNetworkSwipePolicyOnlyEnablesRealDeleteCancelAndDismissPaths() {
        XCTAssertTrue(NativeNetworkSwipePolicy.canDeleteRoom())
        XCTAssertTrue(NativeNetworkSwipePolicy.canDeleteCircle(role: "owner"))
        XCTAssertFalse(NativeNetworkSwipePolicy.canDeleteCircle(role: "member"))
        XCTAssertFalse(NativeNetworkSwipePolicy.canDeleteCircle(role: "admin"))
        XCTAssertTrue(NativeNetworkSwipePolicy.canCancelInvitation(direction: "outgoing", status: "pending"))
        XCTAssertFalse(NativeNetworkSwipePolicy.canCancelInvitation(direction: "incoming", status: "pending"))
        XCTAssertFalse(NativeNetworkSwipePolicy.canCancelInvitation(direction: "outgoing", status: "accepted"))
        XCTAssertTrue(NativeNetworkSwipePolicy.canDismissContact())
        XCTAssertEqual(NativeNetworkDismissedContacts.storageKey(userID: "user-1"), "bytspot.network.dismissed-contacts.user-1")
        XCTAssertEqual(NativeNetworkDismissedContacts.storageKey(userID: "  "), "bytspot.network.dismissed-contacts.signed-out")
    }

    func testNetworkSwipeRevealRequiresAHorizontalThresholdAndDoesNotToggleOnSmallDrags() {
        XCTAssertFalse(NativeNetworkSwipeReveal.isRevealed(translation: -18, currentlyRevealed: false))
        XCTAssertTrue(NativeNetworkSwipeReveal.isRevealed(translation: -40, currentlyRevealed: false))
        XCTAssertTrue(NativeNetworkSwipeReveal.isRevealed(translation: 12, currentlyRevealed: true))
        XCTAssertFalse(NativeNetworkSwipeReveal.isRevealed(translation: 40, currentlyRevealed: true))
        XCTAssertEqual(NativeNetworkSwipeReveal.width, 84)
    }

    func testNetworkAuthenticationContinuationUsesTheStandardSignInIntent() {
        XCTAssertEqual(NativePostAuthIntent.network.rawValue, "network")
        XCTAssertEqual(NativePostAuthIntent.network.authMode, .login)
        XCTAssertEqual(NativePostAuthIntent.allCases.map(\.rawValue), ["explorePicks", "mapPicks", "savePicks", "network"])
    }

    func testSocialNormalizationSupportsCirclesAndInvitations() throws {
        let payload: [String: Any] = ["groups": [
            ["id": "circle-1", "name": "Trust Crew", "ownerUserId": "user-1", "memberCount": 12, "memberIDs": ["user-2", ["userId": "user-3"]], "role": "owner"],
            ["groupId": "circle-2", "title": "Family", "membersCount": "4"]
        ]]

        let groups = NativeSocialCircle.normalizeSocialCircles(payload)

        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups.first?.id, "circle-1")
        XCTAssertEqual(groups.first?.name, "Trust Crew")
        XCTAssertEqual(groups.first?.memberCount, 12)
        XCTAssertEqual(groups.first?.memberIDs, ["user-2", "user-3"])
        XCTAssertEqual(groups.last?.id, "circle-2")
        XCTAssertEqual(groups.last?.name, "Family")
        XCTAssertEqual(groups.last?.memberCount, 4)

        let invites = NativeSocialInvitation.normalizeList(["invitations": [
            ["inviteId": "invite-in", "incoming": true, "status": "pending", "sender": ["id": "sender-1", "displayName": "Ama"], "groupId": "circle-1", "groupName": "Trust Crew"],
            ["id": "invite-out", "direction": "OUTGOING", "status": "ACCEPTED", "recipient": ["userId": "recipient-1", "name": "Kojo"], "circle": ["id": "circle-2", "name": "Family"]]
        ]])
        XCTAssertEqual(invites.map(\.direction), ["incoming", "outgoing"])
        XCTAssertEqual(invites.first?.personName, "Ama")
        XCTAssertEqual(invites.first?.circleID, "circle-1")
        XCTAssertEqual(invites.last?.status, "accepted")
        XCTAssertEqual(invites.last?.circleName, "Family")
    }

    func testPeopleMetNormalizationFailsClosedAndSupportsInviteStatus() {
        let people = NativePeopleMetPerson.normalizeList(["people": [
            ["userId": "user-1", "name": "Ama", "inviteStatus": "PENDING"],
            ["id": "user-2", "displayName": "Kojo"],
            ["name": "No ID row must be dropped"],
            ["userId": "   "]
        ]])

        XCTAssertEqual(people.map(\.userId), ["user-1", "user-2"])
        XCTAssertEqual(people.first?.inviteStatus, "pending")
        XCTAssertEqual(people.first?.inviteStatusLabel, "Invite sent")
        XCTAssertFalse(people.first?.canSendInvite ?? true)
        XCTAssertEqual(people.last?.name, "Kojo")
        XCTAssertNil(people.last?.inviteStatus)
        XCTAssertTrue(people.last?.canSendInvite ?? false)
        XCTAssertEqual(people.last?.inviteStatusLabel, "Met at this party")

        XCTAssertTrue(NativePeopleMetPerson.normalizeList(["unexpected": "shape"]).isEmpty)
    }

    func testPeopleMetOptInStatusDecodesConsentFirst() {
        XCTAssertTrue(NativePeopleMetPerson.normalizeOptInStatus(["optedIn": true]))
        XCTAssertFalse(NativePeopleMetPerson.normalizeOptInStatus(["optedIn": false]))
        XCTAssertFalse(NativePeopleMetPerson.normalizeOptInStatus([:]))
        XCTAssertFalse(NativePeopleMetPerson.normalizeOptInStatus("not a dictionary"))

        XCTAssertEqual(NativePeopleMetPerson.normalizedPartyID("  party-1  "), "party-1")
        XCTAssertNil(NativePeopleMetPerson.normalizedPartyID("   "))
        XCTAssertEqual(NativePeopleMetPerson.normalizedPartyID("https://bytspot.app/party/party-9"), "party-9")
        XCTAssertEqual(NativePeopleMetPerson.normalizedPartyID("https://www.bytspot.com/party/party-9"), "party-9")
        XCTAssertNil(NativePeopleMetPerson.normalizedPartyID("https://evil.example/party/party-9"))
        XCTAssertNil(NativePeopleMetPerson.normalizedPartyID("https://bytspot.app/other/party-9"))
    }

    func testNativeNetworkHasExactlyPeopleCirclesInvitationsAndPeopleMet() {
        XCTAssertEqual(NativeProfileWireframeGuard.menuSectionTitles, ["Places & Activity", "Preferences", "App Settings", "Safety & Legal"])
        XCTAssertEqual(NativeProfileWireframeGuard.networkSegments, ["People", "Social Circles", "Invitations", "People You Met"])
        XCTAssertFalse(NativeProfileWireframeGuard.networkSegments.contains("Plans"))
        XCTAssertEqual(NativeProfilePanel.allCases.count, Set(NativeProfilePanel.allCases.map(\.rawValue)).count)
    }

    func testNativeHostStudioContractCoversPartyOperatingSystem() {
        XCTAssertEqual(NativePartyTemplate.catalog.map(\.id), [.listeningParty, .comedyNight, .premiere, .privateParty, .fanMeetup, .releaseParty, .popUp])
        XCTAssertEqual(NativeHostCategory.allCases.map(\.rawValue), ["party", "nightlife", "music", "sports", "food-drink", "social", "culture", "cars", "outdoor", "community"])
        XCTAssertEqual(NativeHostTaxonomySelection.recommendedCapacity, 20)
        XCTAssertEqual(Set(NativeHostType.catalog.map(\.printer)), Set(NativePartyTemplateID.allCases))
        XCTAssertTrue(NativeHostCategory.allCases.allSatisfy { !NativeHostType.types(in: $0).isEmpty })
        XCTAssertTrue(NativeHostType.catalog.allSatisfy { item in NativeHostType.types(in: item.category).contains(where: { type in type.id == item.id }) })
        XCTAssertEqual(NativeHostType.type(id: "afrobeats")?.printer, .popUp)
        XCTAssertEqual(NativeHostType.type(id: "afrobeats")?.category, .nightlife)
        XCTAssertEqual(NativeHostType.type(id: "watch-party")?.printer, .premiere)
        XCTAssertEqual(NativeHostType.type(id: "house")?.printer, .privateParty)
        XCTAssertEqual(NativeLiveContentV2Contract.partyDraftCreateRoute, "/trpc/events.drafts.create")
        XCTAssertEqual(NativeLiveContentV2Contract.partyPublishRoute, "/trpc/events.publish")
        XCTAssertEqual(NativeLiveContentV2Contract.partyMediaUploadRoute, "/trpc/events.media.upload")
        XCTAssertEqual(NativeLiveContentV2Contract.partyMediaResetRoute, "/trpc/events.media.reset")
        XCTAssertEqual(NativeLiveContentV2Contract.partyRSVPRoute, "/trpc/events.rsvp.create")
        XCTAssertEqual(NativeLiveContentV2Contract.partyTicketCheckoutRoute, "/trpc/events.tickets.createCheckout")
        XCTAssertEqual(NativeLiveContentV2Contract.partyItineraryRoute, "/trpc/events.itinerary.upsert")
        XCTAssertEqual(NativeLiveContentV2Contract.partyRoleAssignRoute, "/trpc/events.roles.assign")
        XCTAssertEqual(NativeLiveContentV2Contract.partyAudienceAttachRoute, "/trpc/events.audiences.attach")
        XCTAssertEqual(NativeLiveContentV2Contract.partyControlHostedRoute, "/trpc/events.control.hosted")
    }

    func testHostedPartyListDecodesControlReentryShape() throws {
        let list = try JSONDecoder().decode(NativeHostedPartyList.self, from: Data("""
        {"parties":[{"id":"party-1","title":"First Listen","venueName":"The Basement","startsAt":"2026-08-16T00:00:00.000Z","endsAt":null,"admissionPaused":false,"shareLinkExpiresAt":"2026-08-16T06:00:00.000Z","shareLinkExpired":false,"capacity":80}]}
        """.utf8))
        XCTAssertEqual(list.parties.count, 1)
        XCTAssertEqual(list.parties[0].id, "party-1")
        XCTAssertEqual(list.parties[0].title, "First Listen")
        XCTAssertEqual(list.parties[0].venueName, "The Basement")
        XCTAssertFalse(list.parties[0].admissionPaused)
        XCTAssertFalse(list.parties[0].shareLinkExpired)
        XCTAssertNotNil(list.parties[0].startsAtDate)
        XCTAssertNil(list.parties[0].shareUrl)
        XCTAssertNil(list.parties[0].passCode)
        XCTAssertEqual(list.parties[0].retrievedShareURL, URL(string: "https://bytspot.app/party/party-1"))

        let withShare = try JSONDecoder().decode(NativeHostedPartyList.self, from: Data("""
        {"parties":[{"id":"party-1","title":"First Listen","venueName":"The Basement","startsAt":"2026-08-16T00:00:00.000Z","endsAt":null,"admissionPaused":false,"shareUrl":"https://bytspot.app/party/party-1","passCode":"BYT-EXISTING","shareLinkExpiresAt":"2026-08-16T06:00:00.000Z","shareLinkExpired":false,"capacity":80}]}
        """.utf8))
        XCTAssertEqual(withShare.parties[0].retrievedPassCode, "BYT-EXISTING")
        XCTAssertEqual(withShare.parties[0].retrievedShareURL, URL(string: "https://bytspot.app/party/party-1"))
        XCTAssertEqual(NativePartyShareLink.url(for: "party-1"), URL(string: "https://bytspot.app/party/party-1"))
        XCTAssertNil(NativePartyShareLink.url(for: "https://evil.example/party/x"))
        XCTAssertNil(NativePartyShareLink.url(from: "http://bytspot.app/party/party-1"))
    }

    func testNativeHostStudioRolesAreCapabilityScoped() {
        XCTAssertTrue(NativePartyRoleContract.can(.owner, .payouts))
        XCTAssertTrue(NativePartyRoleContract.can(.cohost, .invite))
        XCTAssertTrue(NativePartyRoleContract.can(.door, .checkIn))
        XCTAssertFalse(NativePartyRoleContract.can(.door, .edit))
        XCTAssertTrue(NativePartyRoleContract.can(.finance, .refund))
        XCTAssertFalse(NativePartyRoleContract.can(.finance, .checkIn))
    }

    func testNativeHostStudioDraftCarriesTierCirclesTicketsItineraryAndRoles() throws {
        let draft = partyDraft()
        XCTAssertNil(draft.validationMessage)
        XCTAssertEqual(draft.rpcInput["source"] as? String, "host-studio")
        XCTAssertEqual(draft.rpcInput["requiredMembershipTier"] as? String, "platinum")
        XCTAssertEqual(draft.rpcInput["audienceCircleIds"] as? [String], ["circle-1"])
        XCTAssertEqual((draft.rpcInput["ticketTiers"] as? [[String: Any]])?.first?["priceCents"] as? Int, 3_500)
        XCTAssertEqual((draft.rpcInput["itinerary"] as? [[String: Any]])?.last?["offsetMinutes"] as? Int, 120)
        XCTAssertEqual((draft.rpcInput["cohosts"] as? [[String: Any]])?.first?["role"] as? String, "door")
        XCTAssertEqual((draft.rpcInput["templateConfig"] as? [String: Any])?["kind"] as? String, "standard")
        XCTAssertEqual(draft.rpcInput["locationDisclosure"] as? String, "public")
        XCTAssertEqual(NativePartyStudioAPI.draftCreateInput(draft, idempotencyKey: "moment-1")["idempotencyKey"] as? String, "moment-1")
        XCTAssertEqual(NativePartyStudioAPI.publishInput(partyID: "party-1", idempotencyKey: "moment-1")["idempotencyKey"] as? String, "moment-1")
        XCTAssertNoThrow(try JSONSerialization.data(withJSONObject: draft.rpcInput))
    }

    func testNativeHostStudioMapsOnlyCanonicalOfficialDestinations() {
        let destinations = NativePartyHostDestinations(musicURL: "https://music.example.com/host", merchURL: "https://shop.example.com/host", websiteURL: "https://host.example.com", primarySocialPlatform: .instagram, primarySocialURL: "https://instagram.com/host")
        let draft = NativePartyDraftInput(templateID: .comedyNight, title: "No Cameras Comedy", tagline: "One room.", startsAt: Date(), venueName: "Aster Room", locationDisclosure: .withheld, capacity: 80, accessMode: .paidTicket, requiredMembershipTier: .green, hostDestinations: destinations, audienceCircleIDs: [], itinerary: [], ticketTiers: [NativePartyTicketTier(name: "First Drop", priceCents: 2500, quantity: 80, requiredMembershipTier: .green)], cohosts: [], templateConfiguration: .standard)
        let payload = draft.rpcInput["hostDestinations"] as? [String: Any]
        XCTAssertNil(draft.validationMessage)
        XCTAssertEqual(draft.rpcInput["locationDisclosure"] as? String, "withheld")
        XCTAssertEqual(payload?["musicUrl"] as? String, "https://music.example.com/host")
        XCTAssertEqual((payload?["primarySocial"] as? [String: Any])?["platform"] as? String, "Instagram")
        XCTAssertEqual(NativePartyHostDestinations(musicURL: "http://not-secure.example.com", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "https://instagram.com/host").validationMessage, "Music links must use HTTPS.")
        // Empty legacy destinations are valid: new drafts omit them entirely
        // and rely on the publish-time Official Host identity snapshot.
        XCTAssertNil(NativePartyHostDestinations.empty.validationMessage)
        XCTAssertEqual(NativePartyHostDestinations(musicURL: "https://music.example.com", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "").validationMessage, "Add one primary social link.")
        XCTAssertNil(NativePartyDraftInput(templateID: .comedyNight, title: "No Cameras Comedy", tagline: "One room.", startsAt: Date(), venueName: "Aster Room", capacity: 80, accessMode: .freeRSVP, requiredMembershipTier: .green, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .standard).rpcInput["hostDestinations"])
    }

    func testNativeHostStudioUploadsCompressedPartyMediaThroughAuthenticatedRoute() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        var paths: [String] = []
        NativePartyURLProtocolStub.handler = { request in
            paths.append(request.url?.path ?? "")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer host-token")
            let bodyData = try XCTUnwrap(NativePartyURLProtocolStub.bodyData(for: request))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
            XCTAssertEqual(body["partyId"] as? String, "party-1")
            if request.url?.path == NativeLiveContentV2Contract.partyMediaResetRoute {
                return (200, try JSONSerialization.data(withJSONObject: ["result": ["data": ["json": ["status": "ready"]]]]))
            }
            XCTAssertEqual(body["kind"] as? String, "album")
            XCTAssertEqual(body["index"] as? Int, 0)
            XCTAssertTrue((body["dataUri"] as? String)?.hasPrefix("data:image/jpeg;base64,") == true)
            return (200, try JSONSerialization.data(withJSONObject: ["result": ["data": ["json": ["url": "https://res.cloudinary.com/bytspot/image/upload/album-0.jpg"]]]]))
        }
        defer { NativePartyURLProtocolStub.handler = nil }
        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, tokenProvider: { "host-token" }, urlSession: URLSession(configuration: configuration))
        let api = NativePartyStudioAPI(client: client)
        try await api.resetMedia(partyID: "party-1")
        let url = try await api.uploadMedia(partyID: "party-1", kind: .album, index: 0, dataURI: "data:image/jpeg;base64,QUJD")
        XCTAssertEqual(url.host, "res.cloudinary.com")
        XCTAssertEqual(paths, [NativeLiveContentV2Contract.partyMediaResetRoute, NativeLiveContentV2Contract.partyMediaUploadRoute])
    }

    func testNativeHostStudioExecutesDraftThenPublishThroughURLSession() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        var paths: [String] = []
        NativePartyURLProtocolStub.handler = { request in
            paths.append(request.url?.path ?? "")
            let bodyData = try XCTUnwrap(NativePartyURLProtocolStub.bodyData(for: request))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
            XCTAssertEqual(body["idempotencyKey"] as? String, "moment-1")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer host-token")
            let payload: [String: Any] = request.url?.path == NativeLiveContentV2Contract.partyDraftCreateRoute
                ? ["result": ["data": ["json": ["id": "party-1"]]]]
                : ["result": ["data": ["json": ["id": "party-1", "shareUrl": "https://bytspot.app/party/party-1", "passCode": "LAUGH26"]]]]
            return (200, try JSONSerialization.data(withJSONObject: payload))
        }
        defer { NativePartyURLProtocolStub.handler = nil }
        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, tokenProvider: { "host-token" }, urlSession: URLSession(configuration: configuration))
        let api = NativePartyStudioAPI(client: client)

        let partyID = try await api.createDraft(partyDraft(), idempotencyKey: "moment-1")
        let party = try await api.publish(partyID: partyID, draft: partyDraft(), idempotencyKey: "moment-1")

        XCTAssertEqual(paths, [NativeLiveContentV2Contract.partyDraftCreateRoute, NativeLiveContentV2Contract.partyPublishRoute])
        XCTAssertEqual(party.passCode, "LAUGH26")
    }

    func testNativePartyDoorModeSendsExactCredentialContract() async throws {
        let credential = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        NativePartyURLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/trpc/events.control.checkIn")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer host-token")
            let data = try XCTUnwrap(NativePartyURLProtocolStub.bodyData(for: request))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertEqual(body["partyId"] as? String, "party-1")
            XCTAssertEqual(body["attendeeCredential"] as? String, credential)
            XCTAssertNil(body["attendeePassSecret"])
            return (200, try JSONSerialization.data(withJSONObject: ["result": ["data": ["json": ["status": "checked-in", "guestName": "Ada"]]]]))
        }
        defer { NativePartyURLProtocolStub.handler = nil }

        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, tokenProvider: { "host-token" }, urlSession: URLSession(configuration: configuration))
        let result = try await NativePartyControlAPI(client: client).checkIn("party-1", attendeeCredential: credential)
        XCTAssertEqual(result, NativePartyCheckInResult(status: "checked-in", guestName: "Ada"))
    }

    func testNativePartyDoorModeRejectsUnexpectedCheckInStatus() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        NativePartyURLProtocolStub.handler = { _ in
            return (200, try JSONSerialization.data(withJSONObject: ["result": ["data": ["json": ["status": "pending", "guestName": "Ada"]]]]))
        }
        defer { NativePartyURLProtocolStub.handler = nil }

        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, tokenProvider: { "host-token" }, urlSession: URLSession(configuration: configuration))
        do {
            _ = try await NativePartyControlAPI(client: client).checkIn("party-1", attendeeCredential: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde")
            XCTFail("Unexpected check-in status must fail closed.")
        } catch {
            // Expected: only the documented checked-in status is accepted.
        }
    }

    func testNativePartyDoorModeAcceptsOnlyTrimmedOpaqueCredential() {
        let credential = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"
        XCTAssertEqual(NativePartyDoorPassInput.normalized(" \n\(credential)\t "), credential)
        XCTAssertNil(NativePartyDoorPassInput.normalized(" \n\t "))
        XCTAssertNil(NativePartyDoorPassInput.normalized("raw/opaque-pass"))
        XCTAssertNil(NativePartyDoorPassInput.normalized("https://bytspot.app/party/pass"))
        XCTAssertNotNil(NativePartyDoorPassInput.normalized(String(repeating: "x", count: 43)))
        XCTAssertNil(NativePartyDoorPassInput.normalized(String(repeating: "x", count: 42) + "/"))
        XCTAssertNil(NativePartyDoorPassInput.normalized(String(repeating: "A", count: 44)))
    }

    func testNativePartyPassInviteFailsClosedForMissingLocationDisclosure() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        NativePartyURLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/trpc/events.invite")
            let payload: [String: Any] = ["result": ["data": ["json": [
                "id": "party-1", "source": "host-studio-party", "title": "Secret Drop",
                "scheduledDate": "2026-08-10T20:00:00Z", "locationLabel": "Secret rooftop",
                "accessMode": "private-approval", "tier": "green"
            ]]]]
            return (200, try JSONSerialization.data(withJSONObject: payload))
        }
        defer { NativePartyURLProtocolStub.handler = nil }

        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, urlSession: URLSession(configuration: configuration))
        let party = try await NativePartyPassAPI(client: client).invite(partyID: "party-1")

        XCTAssertTrue(party.isLocationWithheld)
        XCTAssertEqual(party.locationLabel, "Location shared after approval")
    }

    func testNativePartyPassInviteDecodesServerRedactedWithheldLocation() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NativePartyURLProtocolStub.self]
        NativePartyURLProtocolStub.handler = { _ in
            let payload: [String: Any] = ["result": ["data": ["json": [
                "id": "party-1", "source": "host-studio-party", "title": "Secret Drop",
                "scheduledDate": "2026-08-10T20:00:00Z", "locationLabel": NSNull(), "locationDisclosure": "withheld",
                "accessMode": "private-approval", "tier": "green"
            ]]]]
            return (200, try JSONSerialization.data(withJSONObject: payload))
        }
        defer { NativePartyURLProtocolStub.handler = nil }

        let client = BytspotAPIClient(baseURL: URL(string: "https://party.test")!, urlSession: URLSession(configuration: configuration))
        let party = try await NativePartyPassAPI(client: client).invite(partyID: "party-1")

        XCTAssertTrue(party.isLocationWithheld)
        XCTAssertEqual(party.locationDisclosure, "withheld")
        XCTAssertEqual(party.locationLabel, "Location withheld by host")
    }

    func testNativeHostStudioFailsClosedWithoutValidPaidTicketOrPartyPass() throws {
        let unpaid = partyDraft(priceCents: 0)
        XCTAssertEqual(unpaid.validationMessage, "Paid parties need a ticket price.")
        XCTAssertEqual(NativePartyStudioAPI.partyID(from: ["party": ["partyId": "party-1"]]), "party-1")

        let published = try XCTUnwrap(NativePartyStudioAPI.publishedParty(from: ["party": ["id": "party-1", "shareUrl": "https://bytspot.com/party/party-1", "passCode": "LAUGH26"]], fallbackID: "fallback", draft: partyDraft()))
        XCTAssertEqual(published.id, "party-1")
        XCTAssertEqual(published.passCode, "LAUGH26")
        XCTAssertNil(NativePartyStudioAPI.publishedParty(from: ["shareUrl": "javascript:alert(1)", "passCode": "BAD"], fallbackID: "party-1", draft: partyDraft()))
        XCTAssertNil(NativePartyStudioAPI.publishedParty(from: ["shareUrl": "https://evil.example/party/1", "passCode": "BAD"], fallbackID: "party-1", draft: partyDraft()))
    }

    func testNativeHostStudioPublishFailuresGiveActionableSafeMessages() {
        let expired = BytspotAPIClient.APIError.server(status: 401, body: "")
        let invalidDraft = BytspotAPIClient.APIError.server(status: 422, body: "")
        let limited = BytspotAPIClient.APIError.server(status: 429, body: "")

        XCTAssertEqual(NativePartyStudioError.publishUserMessage(for: expired), "Your sign-in session expired. Sign in again before publishing.")
        XCTAssertEqual(NativePartyStudioError.publishUserMessage(for: invalidDraft), "Review the party setup and try again.")
        XCTAssertEqual(NativePartyStudioError.publishUserMessage(for: limited), "Too many publish attempts. Wait a moment and try again.")
    }

    func testNativeHostStudioTemplateConfigurationRequiresMatchingSecureFormat() {
        let destinations = NativePartyHostDestinations(musicURL: "", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "https://instagram.com/host")
        let release = NativePartyDraftInput(templateID: .releaseParty, title: "The Drop", tagline: "Tonight", startsAt: Date(), venueName: "The Loft", capacity: 40, accessMode: .freeRSVP, requiredMembershipTier: .green, hostDestinations: destinations, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .releaseParty(.mix, ""))
        XCTAssertEqual(release.validationMessage, "Add the release title.")

        let hiddenPopUp = NativePartyDraftInput(templateID: .popUp, title: "Secret Drop", tagline: "Tonight", startsAt: Date(), venueName: "The Loft", capacity: 40, accessMode: .freeRSVP, requiredMembershipTier: .green, hostDestinations: destinations, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .popUp(.afterApproval))
        XCTAssertEqual(hiddenPopUp.validationMessage, "Hidden Pop-Up locations require host approval.")

        let privateParty = NativePartyDraftInput(templateID: .privateParty, title: "After Hours", tagline: "Tonight", startsAt: Date(), venueName: "The Loft", capacity: 12, accessMode: .privateApproval, requiredMembershipTier: .green, hostDestinations: destinations, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .privateParty(.namedGuestsPlusOne))
        XCTAssertNil(privateParty.validationMessage)
        XCTAssertEqual((privateParty.rpcInput["templateConfig"] as? [String: Any])?["guestPolicy"] as? String, "named-guests-plus-one")
    }

    func testHostTaxonomyTagsRideOnExistingTemplateConfigWithoutChangingKind() {
        var taxonomy = NativeHostTaxonomySelection.default
        taxonomy.select(category: .nightlife)
        taxonomy.select(type: NativeHostType.type(id: "afrobeats")!)
        taxonomy.format = .rooftop
        taxonomy.age = .twentyOnePlus
        XCTAssertEqual(taxonomy.type.printer, .popUp)
        XCTAssertEqual(taxonomy.rpcTags["hostCategory"], "nightlife")
        XCTAssertEqual(taxonomy.rpcTags["hostType"], "afrobeats")
        XCTAssertEqual(taxonomy.rpcTags["hostFormat"], "rooftop")
        XCTAssertEqual(taxonomy.rpcTags["hostAge"], "21-plus")

        let destinations = NativePartyHostDestinations(musicURL: "", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "https://instagram.com/host")
        let draft = NativePartyDraftInput(
            templateID: taxonomy.type.printer,
            title: "Afrobeats rooftop",
            tagline: "One room.",
            startsAt: Date(),
            venueName: "Colony Square",
            capacity: NativeHostTaxonomySelection.recommendedCapacity,
            accessMode: .freeRSVP,
            requiredMembershipTier: .green,
            hostDestinations: destinations,
            audienceCircleIDs: [],
            itinerary: [],
            ticketTiers: [],
            cohosts: [],
            templateConfiguration: .popUp(.public),
            taxonomy: taxonomy
        )
        XCTAssertNil(draft.validationMessage)
        let config = draft.rpcInput["templateConfig"] as? [String: Any]
        XCTAssertEqual(config?["kind"] as? String, "pop-up")
        XCTAssertEqual(config?["hostCategory"] as? String, "nightlife")
        XCTAssertEqual(config?["hostType"] as? String, "afrobeats")
        XCTAssertEqual(config?["hostFormat"] as? String, "rooftop")
        XCTAssertEqual(draft.rpcInput["capacity"] as? Int, 20)
        XCTAssertEqual(draft.rpcInput["templateId"] as? String, "pop-up")
    }

    func testPartyShareQRRendersConcreteImageWithDarkModules() throws {
        let image = NativePartyShareQR.image("https://bytspot.app/party/party-1")
        let cgImage = try XCTUnwrap(image.cgImage)
        XCTAssertGreaterThan(cgImage.width, 0)
        XCTAssertGreaterThan(cgImage.height, 0)

        let width = 64
        let height = 64
        var pixels = [UInt8](repeating: 255, count: width * height * 4)
        let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.interpolationQuality = .none
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }

        XCTAssertTrue(rendered)
        let hasDarkModule = stride(from: 0, to: pixels.count, by: 4).contains { index in
            pixels[index] < 64 && pixels[index + 1] < 64 && pixels[index + 2] < 64
        }
        XCTAssertTrue(hasDarkModule, "The Party share QR must contain visible scannable modules.")
    }

    func testSuccessfulPartyPublishClearsProgressBeforePartyPassIsShown() {
        let party = NativePublishedParty(
            id: "party-1",
            shareURL: URL(string: "https://bytspot.app/party/party-1")!,
            passCode: "BYT-1234",
            draft: partyDraft()
        )
        var presentation = NativePartyPassPresentation()
        presentation.message = "Preparing Party media…"

        presentation.completePublish(with: party)

        XCTAssertTrue(presentation.isPartyPassVisible)
        XCTAssertEqual(presentation.party, party)
        XCTAssertEqual(presentation.message, "")
    }

    func testArrivalLookupFailureAfterPublishKeepsPartyPassAndClearStatus() {
        let party = NativePublishedParty(
            id: "party-1",
            shareURL: URL(string: "https://bytspot.app/party/party-1")!,
            passCode: "BYT-1234",
            draft: partyDraft()
        )
        var presentation = NativePartyPassPresentation()
        presentation.message = "Preparing Party media…"
        presentation.completePublish(with: party)

        presentation.completeArrivalLookupFailure()

        XCTAssertTrue(presentation.isPartyPassVisible)
        XCTAssertEqual(presentation.party, party)
        XCTAssertEqual(presentation.message, "")
    }

    func testHostIdentityValidatesHandlesAndDecodesProfilePayloadInOrder() {
        // Socials take handles, links take HTTPS, handle rules enforced.
        XCTAssertNil(NativeHostIdentityDestination(kind: .instagram, value: "@MidtownJohn", primary: true).validationMessage)
        XCTAssertNotNil(NativeHostIdentityDestination(kind: .instagram, value: "https://instagram.com/host", primary: false).validationMessage)
        XCTAssertNil(NativeHostIdentityDestination(kind: .music, value: "https://music.example.com", primary: false).validationMessage)
        XCTAssertNotNil(NativeHostIdentityDestination(kind: .music, value: "http://insecure.example.com", primary: false).validationMessage)
        XCTAssertNotNil(NativeHostIdentity(handle: "x", destinations: []).validationMessage)
        XCTAssertNil(NativeHostIdentity(handle: "@midtownjohn", destinations: []).validationMessage)

        // Payload decode preserves the host's order and the primary flag.
        let payload: [String: Any] = ["handle": "midtownjohn", "destinations": [
            ["kind": "tiktok", "value": "@midtownjohn", "primary": true],
            ["kind": "music", "value": "https://music.example.com/host"],
            ["kind": "unknown", "value": "x"],
        ]]
        let identity = NativeHostIdentity.fromPayload(payload)
        XCTAssertEqual(identity.handle, "@midtownjohn")
        XCTAssertEqual(identity.destinations.map(\.kind), [.tiktok, .music])
        XCTAssertEqual(identity.destinations.first?.primary, true)
        XCTAssertEqual(NativeHostIdentity.fromPayload([String: Any]()), .empty)

        // Round-trip: rpcInput carries order and only flags the primary.
        let rpc = identity.rpcInput
        XCTAssertEqual(rpc["handle"] as? String, "@midtownjohn")
        let entries = rpc["destinations"] as? [[String: Any]]
        XCTAssertEqual(entries?.map { $0["kind"] as? String }, ["tiktok", "music"])
        XCTAssertEqual(entries?.first?["primary"] as? Bool, true)
        XCTAssertNil(entries?.last?["primary"])

        // A cleared editor is still a persistable identity: save must send
        // destinations: [] so publish cannot snapshot a stale profile.
        let cleared = NativeHostIdentity.empty.rpcInput
        XCTAssertEqual((cleared["destinations"] as? [[String: Any]])?.isEmpty, true)
        XCTAssertNil(cleared["handle"])
        XCTAssertTrue(NativeHostIdentity.empty == NativeHostIdentity(handle: "", destinations: []))
    }

    func testRunOfShowClockMathRollsToNextDayAndDerivesNowWithFallback() {
        let calendar = Calendar(identifier: .gregorian)
        let start = calendar.date(from: DateComponents(year: 2026, month: 8, day: 10, hour: 20, minute: 0))!

        // Same-evening beat: simple positive offset.
        let tenPM = calendar.date(from: DateComponents(year: 2026, month: 8, day: 10, hour: 22, minute: 0))!
        XCTAssertEqual(NativeRunOfShowSchedule.offsetMinutes(pickedTime: tenPM, startsAt: start, calendar: calendar), 120)
        // A beat "earlier" than the start rolls to the next day (all-day model).
        let oneAM = calendar.date(from: DateComponents(year: 2026, month: 8, day: 10, hour: 1, minute: 30))!
        XCTAssertEqual(NativeRunOfShowSchedule.offsetMinutes(pickedTime: oneAM, startsAt: start, calendar: calendar), 330)
        XCTAssertEqual(NativeRunOfShowSchedule.beatDate(offsetMinutes: 330, startsAt: start), start.addingTimeInterval(330 * 60))

        // "Now" selection: latest beat at-or-before now while the party runs.
        let beats = [start, start.addingTimeInterval(2 * 3600)]
        XCTAssertNil(NativeRunOfShowSchedule.currentBeatIndex(beats: beats, endsAt: nil, now: start.addingTimeInterval(-60)))
        XCTAssertEqual(NativeRunOfShowSchedule.currentBeatIndex(beats: beats, endsAt: nil, now: start.addingTimeInterval(3600)), 0)
        XCTAssertEqual(NativeRunOfShowSchedule.currentBeatIndex(beats: beats, endsAt: nil, now: start.addingTimeInterval(2 * 3600 + 60)), 1)
        // Fallback close: no endsAt → last beat + 60m ends the show.
        XCTAssertNil(NativeRunOfShowSchedule.currentBeatIndex(beats: beats, endsAt: nil, now: start.addingTimeInterval(3 * 3600 + 60)))
        // Host end wins over the fallback.
        XCTAssertNil(NativeRunOfShowSchedule.currentBeatIndex(beats: beats, endsAt: start.addingTimeInterval(2 * 3600 + 30 * 60), now: start.addingTimeInterval(2 * 3600 + 45 * 60)))
    }

    func testNativePartyPassDecodesScheduledBeatsSortedAndFailsClosedPerBeat() {
        let row: [String: Any] = ["runOfShow": [
            ["title": "Headliner", "scheduledAt": "2026-08-10T22:00:00.000Z"],
            ["title": "Doors open", "scheduledAt": "2026-08-10T20:00:00.000Z"],
            ["title": "Broken beat"],
        ]]
        let beats = NativePartyPassAPI.beats(from: row)
        XCTAssertEqual(beats.map(\.title), ["Doors open", "Headliner"])
        XCTAssertEqual(NativePartyPassAPI.beats(from: [:]), [])
    }

    func testNativePartyPassProjectsOnlyCanonicalOfficialHostDestinations() {
        // New ordered identity list: order preserved, primary flagged, and a
        // raw URL can never render as a label.
        let identityRow: [String: Any] = ["host": [
            "handle": "midtownjohn",
            "destinationList": [
                ["kind": "instagram", "label": "@MidtownJohn", "url": "https://instagram.com/MidtownJohn", "primary": true],
                ["kind": "music", "label": "Music", "url": "https://music.example.com/host"],
                ["kind": "merch", "label": "https://leaky.example.com", "url": "https://leaky.example.com"],
                ["kind": "website", "label": "Website", "url": "http://insecure.example.com"],
            ],
        ]]
        let identityDestinations = NativePartyPassAPI.destinations(from: identityRow)
        XCTAssertEqual(identityDestinations.map(\.kind), [.instagram, .music])
        XCTAssertEqual(identityDestinations.first?.label, "@MidtownJohn")
        XCTAssertEqual(identityDestinations.first?.primary, true)
        XCTAssertEqual(NativePartyPassAPI.hostHandle(from: identityRow), "@midtownjohn")

        // Legacy object fallback still projects for already-published parties.
        let legacyRow: [String: Any] = [
            "musicUrl": "https://music.example.com/root-alias",
            "host": ["destinations": [
                "musicUrl": "https://music.example.com/host",
                "merchUrl": "http://insecure.example.com",
                "primarySocial": ["platform": "Instagram", "url": "https://instagram.com/host"],
            ]],
        ]
        let destinations = NativePartyPassAPI.destinations(from: legacyRow)
        XCTAssertEqual(destinations.map(\.kind), [.music, .instagram])
        XCTAssertEqual(destinations.last?.label, "Instagram")
        XCTAssertNil(NativePartyPassAPI.hostHandle(from: legacyRow))
        // A crafted URL as the legacy platform never renders as public text.
        let leakyLegacy: [String: Any] = ["host": ["destinations": ["primarySocial": ["platform": "https://evil.example.com", "url": "https://instagram.com/host"]]]]
        XCTAssertEqual(NativePartyPassAPI.destinations(from: leakyLegacy).map(\.label), ["Social"])
        // Root-level aliases and non-HTTPS links never reach recipients.
        XCTAssertEqual(NativePartyPassAPI.destinations(from: ["musicUrl": "https://music.example.com/root-alias"]), [])
    }

    @MainActor
    func testPartySharePresentationAnchorsPopoverToPresenterView() throws {
        let presenter = UIViewController()
        presenter.view = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))

        let activity = NativePartySharePresentation.activityController(
            for: try XCTUnwrap(URL(string: "https://bytspot.app/party/party-1")),
            presenter: presenter
        )
        let popover = try XCTUnwrap(activity.popoverPresentationController)

        XCTAssertTrue(popover.sourceView === presenter.view)
        XCTAssertEqual(popover.sourceRect, presenter.view.bounds)
        XCTAssertEqual(popover.permittedArrowDirections, [])
    }

    @MainActor
    func testPartyShareTopPresenterWalksToDeepestPresentedController() {
        // The share sheet must present from the topmost presented controller;
        // presenting from the window root fails silently when Host Studio is
        // already shown inside a sheet.
        let root = UIViewController()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.rootViewController = root
        window.makeKeyAndVisible()
        let sheet = UIViewController()
        root.present(sheet, animated: false)

        let presenter = NativePartySharePresentation.topPresenter()
        XCTAssertTrue(presenter === sheet)
        window.isHidden = true
    }

    func testCrowdSummaryOnlyTreatsDoorHostOrSensorAsLive() {
        let typical = NativeCrowdSummary(level: 3, label: "Busy", waitMins: 12, source: "typical")
        let missing = NativeCrowdSummary(level: 3, label: "Busy", waitMins: 12)
        let leftoverSim = NativeCrowdSummary(level: 4, label: "Packed", waitMins: 20, source: "simulation")
        let door = NativeCrowdSummary(level: 4, label: "Packed", waitMins: 8, source: "bytspot")
        let report = NativeCrowdSummary(level: 2, label: "Active", waitMins: 5, source: "user_report")
        XCTAssertFalse(typical.isLiveOccupancy)
        XCTAssertFalse(missing.isLiveOccupancy)
        XCTAssertFalse(leftoverSim.isLiveOccupancy)
        XCTAssertTrue(door.isLiveOccupancy)
        XCTAssertTrue(report.isLiveOccupancy)
    }

    func testPartyControlSummaryDecodesWithAndWithoutShareLinkExpiry() throws {
        let legacy = try JSONDecoder().decode(NativePartyControlSummary.self, from: Data("""
        {"partyId":"party-1","title":"First Listen","admissionPaused":false,"capacity":80,"confirmed":41,"spacesRemaining":39,"pending":6,"checkedIn":12}
        """.utf8))
        XCTAssertNil(legacy.shareLinkExpiresAt)
        XCTAssertNil(legacy.shareLinkExpired)

        let current = try JSONDecoder().decode(NativePartyControlSummary.self, from: Data("""
        {"partyId":"party-1","title":"First Listen","admissionPaused":false,"capacity":80,"confirmed":41,"spacesRemaining":39,"pending":6,"checkedIn":12,"shareLinkExpiresAt":"2026-08-16T04:00:00.000Z","shareLinkExpired":false,"shareLinkExpiryIsDefault":true}
        """.utf8))
        XCTAssertEqual(current.shareLinkExpiresAt, "2026-08-16T04:00:00.000Z")
        XCTAssertEqual(current.shareLinkExpired, false)
        XCTAssertEqual(current.shareLinkExpiryIsDefault, true)
        XCTAssertNil(legacy.shareUrl)
        XCTAssertNil(legacy.passCode)
        XCTAssertEqual(legacy.retrievedShareURL, URL(string: "https://bytspot.app/party/party-1"))

        let retrieved = try JSONDecoder().decode(NativePartyControlSummary.self, from: Data("""
        {"partyId":"party-1","title":"First Listen","admissionPaused":false,"capacity":80,"confirmed":41,"spacesRemaining":39,"pending":6,"checkedIn":12,"shareUrl":"https://bytspot.app/party/party-1","passCode":"BYT-EXISTING","shareLinkExpiresAt":"2026-08-16T04:00:00.000Z","shareLinkExpired":false,"shareLinkExpiryIsDefault":true}
        """.utf8))
        XCTAssertEqual(retrieved.retrievedPassCode, "BYT-EXISTING")
        XCTAssertEqual(retrieved.retrievedShareURL, URL(string: "https://bytspot.app/party/party-1"))
    }

    func testPartyControlInstantParsingAcceptsServerMillisecondTimestamps() {
        XCTAssertNotNil(ISO8601DateFormatter.partyControlDate(from: "2026-08-16T04:00:00.000Z"))
        XCTAssertNotNil(ISO8601DateFormatter.partyControlDate(from: "2026-08-16T04:00:00Z"))
        XCTAssertNil(ISO8601DateFormatter.partyControlDate(from: "not-a-date"))
    }

    func testAuthenticatedFixtureContractIsNonSecretAndSafeForSmoke() {
        XCTAssertEqual(NativeProfileDataAPI.fixtureEnvironmentKey, "BYT_NATIVE_PROFILE_DATA_FIXTURES")
        XCTAssertEqual(NativeProfileDataAPI.fixtureProfile.email, "member@example.com")
        XCTAssertEqual(NativeProfileDataAPI.fixtureVehicles.first?.licensePlate, "BYT-424")
        XCTAssertEqual(NativeProfileDataAPI.fixturePaymentMethods.first?.last4, "4242")
        XCTAssertEqual(NativeProfileDataAPI.fixtureNotificationPreferences, .webDefaults)
        XCTAssertEqual(NativeProfileDataAPI.fixtureUserPreferences.vibes, ["drinks"])
        XCTAssertEqual(NativeProfileDataAPI.fixtureSocialCircles.first?.memberCount, 8)
        let fixtureStrings = [NativeProfileDataAPI.fixtureProfile.email, NativeProfileDataAPI.fixtureVehicles.first?.licensePlate, NativeProfileDataAPI.fixturePaymentMethods.first?.last4, NativeProfileDataAPI.fixturePaymentMethods.first?.brand].compactMap { $0 }
        XCTAssertFalse(fixtureStrings.contains { $0.contains("sk_") || $0.contains("pk_live") || $0.contains("Bearer ") })
    }

    func testRequestAttachesBearerOnlyWhenProviderReturnsToken() throws {
        let authed = BytspotAPIClient(tokenProvider: { "fixture-token" })
        XCTAssertEqual(try authed.makeRequest(path: "/health").value(forHTTPHeaderField: "Authorization"), "Bearer fixture-token")

        let guest = BytspotAPIClient(tokenProvider: { nil })
        XCTAssertNil(try guest.makeRequest(path: "/health").value(forHTTPHeaderField: "Authorization"))
    }

    private func partyDraft(priceCents: Int = 3_500) -> NativePartyDraftInput {
        NativePartyDraftInput(
            templateID: .comedyNight, title: "No Cameras Comedy", tagline: "One room. One inside joke.", startsAt: Date(timeIntervalSince1970: 1_800_000_000), venueName: "Aster Room", capacity: 80, accessMode: .paidTicket, requiredMembershipTier: .platinum, hostDestinations: NativePartyHostDestinations(musicURL: "", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "https://instagram.com/host"), audienceCircleIDs: ["circle-1"],
            itinerary: [NativePartyItineraryItem(title: "Doors open", offsetMinutes: 0), NativePartyItineraryItem(title: "Warm-up set", offsetMinutes: 60), NativePartyItineraryItem(title: "Headliner", offsetMinutes: 120)],
            ticketTiers: [NativePartyTicketTier(name: "First Drop", priceCents: priceCents, quantity: 80, requiredMembershipTier: .platinum)],
            cohosts: [NativePartyHostAssignment(email: "door@example.com", role: .door)], templateConfiguration: .standard
        )
    }

    private func decode<T: Decodable>(_ type: T.Type, from envelope: Any) throws -> T {
        let payload = BytspotAPIClient.unwrapTRPCData(envelope)
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(T.self, from: data)
    }
}

final class NativeAuthLaunchInputTests: XCTestCase {
    private struct KeychainAppleAdapter: AppleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .apple, token: "keychain_apple_test_token", userID: "apple-user-id", displayName: "Apple Test")
        }
    }

    private struct KeychainGoogleAdapter: GoogleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .google, token: "keychain_google_test_token", userID: "google-user-id", displayName: "Google Test")
        }
    }

    private struct FailingAppleAdapter: AppleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            throw NativeAuthAdapterError.mockedFailure(provider: .apple)
        }
    }

    private struct FailingGoogleAdapter: GoogleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            throw NativeAuthAdapterError.mockedFailure(provider: .google)
        }
    }

    func testSignupValidationMatchesTheSixCharacterAccountRule() {
        XCTAssertFalse(NativeAuthInputValidator.canSubmit(mode: .signup, name: "Avery", email: "member@example.com", password: "12345"))
        XCTAssertTrue(NativeAuthInputValidator.canSubmit(mode: .signup, name: "Avery", email: "member@example.com", password: "123456"))
        XCTAssertEqual(NativeAuthLaunchContract.signupPasswordValidationMessage, "Use at least 6 characters.")
        XCTAssertTrue(NativeAuthInputValidator.submitValidationMessage(mode: .signup).contains("at least 6 characters"))
    }

    func testLoginValidationRequiresEmailAndNonEmptyPasswordOnly() {
        XCTAssertFalse(NativeAuthInputValidator.canSubmit(mode: .login, name: "", email: "bad", password: "pw"))
        XCTAssertFalse(NativeAuthInputValidator.canSubmit(mode: .login, name: "", email: "member@example.com", password: ""))
        XCTAssertTrue(NativeAuthInputValidator.canSubmit(mode: .login, name: "", email: "member@example.com", password: "p"))
        XCTAssertEqual(NativeAuthInputValidator.submitValidationMessage(mode: .login), "Please enter a valid email address and password.")
    }

    func testAuthMutationInputsTrimAndNormalizeWithoutLoggingSecrets() {
        let signup = NativeAuthDataAPI.signupInput(email: " member@example.com ", password: "12345678", name: " Test Member ", ref: " ab12 ")
        XCTAssertEqual(signup["email"] as? String, "member@example.com")
        XCTAssertEqual(signup["name"] as? String, "Test Member")
        XCTAssertEqual(signup["ref"] as? String, "AB12")

        let login = NativeAuthDataAPI.loginInput(email: " member@example.com ", password: "pw")
        XCTAssertEqual(login["email"] as? String, "member@example.com")
        XCTAssertEqual(login["password"] as? String, "pw")
    }

    func testMutationBodyMatchesTheWorkingWebClient() throws {
        let body = try BytspotAPIClient.trpcMutationBody(["email": "member@example.com", "name": "Avery"])
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])

        XCTAssertEqual(Set(root.keys), ["email", "name"])
        XCTAssertNil(root["json"])
    }

    func testAccountErrorsGiveClearNextSteps() {
        let existing = BytspotAPIClient.APIError.server(status: 409, body: #"{"error":{"json":{"message":"Email already registered"}}}"#)
        let incorrect = BytspotAPIClient.APIError.server(status: 401, body: #"{"error":{"json":{"message":"Invalid credentials"}}}"#)
        let busy = BytspotAPIClient.APIError.server(status: 429, body: "")

        XCTAssertEqual(NativeAuthDataAPI.userMessage(for: existing, mode: .signup), "An account already exists for this email. Log in instead.")
        XCTAssertEqual(NativeAuthDataAPI.userMessage(for: incorrect, mode: .login), "The email or password is incorrect.")
        XCTAssertEqual(NativeAuthDataAPI.userMessage(for: busy, mode: .login), "Too many attempts. Wait a moment and try again.")
    }

    func testProviderSignInSurfacesExistingAccountConflict() {
        let conflictByStatus = BytspotAPIClient.APIError.server(status: 409, body: "")
        let conflictByMessage = BytspotAPIClient.APIError.server(
            status: 400,
            body: #"{"error":{"json":{"message":"An account already exists for this email. Sign in with its existing method first."}}}"#
        )
        let conflictByCode = BytspotAPIClient.APIError.server(
            status: 400,
            body: #"{"error":{"json":{"message":"Provider sign-in rejected","code":"CONFLICT"}}}"#
        )
        let verification = BytspotAPIClient.APIError.server(status: 401, body: #"{"error":{"json":{"message":"Apple sign-in could not be verified"}}}"#)
        let unrelatedConflictWording = BytspotAPIClient.APIError.server(status: 401, body: #"{"error":{"json":{"message":"token conflict detected"}}}"#)

        XCTAssertTrue(NativeAuthDataAPI.isAccountConflict(conflictByStatus))
        XCTAssertTrue(NativeAuthDataAPI.isAccountConflict(conflictByMessage))
        XCTAssertTrue(NativeAuthDataAPI.isAccountConflict(conflictByCode))
        XCTAssertFalse(NativeAuthDataAPI.isAccountConflict(verification))
        XCTAssertFalse(NativeAuthDataAPI.isAccountConflict(unrelatedConflictWording), "Generic 'conflict' wording on non-409 must not surface account-linking copy.")
        XCTAssertFalse(NativeAuthDataAPI.isAccountConflict(URLError(.timedOut)))

        XCTAssertEqual(
            NativeAuthAdapterError.accountConflict(provider: .apple).status,
            .failed(message: "A Bytspot account already exists for this email. Log in with your email and password first — Apple sign-in can't be linked automatically.")
        )
        XCTAssertEqual(
            NativeAuthAdapterError.accountConflict(provider: .google).status,
            .failed(message: "A Bytspot account already exists for this email. Log in with your email and password first — Google sign-in can't be linked automatically.")
        )
    }

    func testSignedInIdentityStoresAndGreetsByFirstName() {
        defer { NativeSignedInIdentity.clear() }

        NativeSignedInIdentity.store(displayName: "  Avery Johnson  ")
        XCTAssertEqual(NativeSignedInIdentity.displayName, "Avery Johnson")
        XCTAssertTrue(NativeSignedInIdentity.consumePendingWelcome())
        XCTAssertFalse(NativeSignedInIdentity.consumePendingWelcome(), "Welcome must be one-shot per sign-in.")
        XCTAssertEqual(NativeSignedInIdentity.firstName(from: "Avery Johnson"), "Avery")
        XCTAssertEqual(NativeSignedInIdentity.welcomeMessage(displayName: "Avery Johnson"), "Welcome, Avery")

        NativeSignedInIdentity.store(displayName: nil)
        XCTAssertNil(NativeSignedInIdentity.displayName)
        XCTAssertTrue(NativeSignedInIdentity.consumePendingWelcome(), "Nameless providers still trigger the welcome moment.")
        XCTAssertEqual(NativeSignedInIdentity.welcomeMessage(displayName: nil), "Welcome to Bytspot")

        NativeSignedInIdentity.store(displayName: "Sam")
        NativeSignedInIdentity.clear()
        XCTAssertNil(NativeSignedInIdentity.displayName)
        XCTAssertFalse(NativeSignedInIdentity.consumePendingWelcome(), "Sign-out must clear the pending welcome.")
    }

    @MainActor
    func testSessionStoreSignOutAndGuestClearSignedInIdentity() {
        let store = BytspotSessionStore(account: "native_identity_cleanup_\(UUID().uuidString)", service: "com.bytspot.identity-cleanup-tests")

        NativeSignedInIdentity.store(displayName: "Avery")
        store.signOut()
        XCTAssertNil(NativeSignedInIdentity.displayName)
        XCTAssertFalse(NativeSignedInIdentity.consumePendingWelcome())

        NativeSignedInIdentity.store(displayName: "Avery")
        store.continueAsGuest()
        XCTAssertNil(NativeSignedInIdentity.displayName)
        XCTAssertFalse(NativeSignedInIdentity.consumePendingWelcome())
        store.signOut()
    }

    func testGoogleNativeOAuthAudienceConfigurationIsResolved() throws {
        let serverClientID = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String)
        XCTAssertFalse(serverClientID.isEmpty)
        XCTAssertFalse(serverClientID.hasPrefix("$("))

        let serviceURL = try XCTUnwrap(Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"))
        let service = try XCTUnwrap(NSDictionary(contentsOf: serviceURL) as? [String: Any])
        let iosClientID = try XCTUnwrap(service["CLIENT_ID"] as? String)
        XCTAssertNotEqual(serverClientID, iosClientID)
    }

    func testGoogleSignInFailuresIdentifyTheirSafeBoundary() {
        XCTAssertEqual(
            NativeAuthAdapterError.googleConfigurationUnavailable.status,
            .failed(message: "Google Sign-In isn't configured in this app build. Use email or try again later.")
        )
        XCTAssertEqual(
            NativeAuthAdapterError.googleProviderFailed.status,
            .failed(message: "Google Sign-In didn't complete. Please try again.")
        )
        XCTAssertEqual(
            NativeAuthAdapterError.googleBackendVerificationFailed.status,
            .failed(message: "Google confirmed your account, but Bytspot couldn't verify this sign-in. Please try again.")
        )
    }

    func testAppleSignInFailuresIdentifyTheirSafeBoundary() {
        XCTAssertEqual(
            NativeAuthAdapterError.appleProviderFailed.status,
            .failed(message: "Apple Sign-In didn't complete. Confirm your Apple Account in Settings, then try again.")
        )
        XCTAssertEqual(
            NativeAuthAdapterError.appleBackendVerificationFailed.status,
            .failed(message: "Apple confirmed your account, but Bytspot couldn't verify this sign-in. Please try again.")
        )
    }

    @MainActor
    func testHomeVisibleCopyAvoidsUnprovenAvailabilityClaims() {
        let lateNightHeader = NativeHomeRegionPresentation.contextualEyebrow(hour: 23, location: .verifiedMidtown)
        let visibleCopy = [NativeHomeCopyContract.boutiqueStayQuickActionSubtitle, lateNightHeader.0, lateNightHeader.1] + NativeHomeCopyContract.visibleSurfaceLabels
        XCTAssertFalse(NativeHomeCopyContract.containsUnprovenAvailabilityClaim(visibleCopy))
        XCTAssertEqual(NativeHomeCopyContract.boutiqueStayQuickActionSubtitle, "Browse stays")

        let unproven = NativeVenueSummary(id: "unproven", name: "Unproven Venue", category: "venue", address: "100 Neutral St", distance: "0.4 mi", rating: nil, latitude: 33.7865, longitude: -84.3830, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"), verifiedPatchId: nil, imageUrl: nil)
        let proven = NativeVenueSummary(id: "proven", name: "Proven Venue", category: "parking", address: "200 Live St", distance: "0.3 mi", rating: nil, latitude: 33.7866, longitude: -84.3831, crowd: NativeCrowdSummary(level: 1, label: "Open", waitMins: 0), parking: NativeParkingSummary(totalAvailable: 18, priceLabel: "$6/hr"), verifiedPatchId: nil, imageUrl: nil)
        XCTAssertEqual(NativeHomeRegionPresentation.nearbySubtitle(for: unproven), "100 Neutral St")
        XCTAssertEqual(NativeHomeRegionPresentation.nearbySubtitle(for: proven), "18 spots · Open")
        XCTAssertEqual(NativeHomeRegionPresentation.headerInventoryStat(for: [unproven]).value, "1")
        XCTAssertEqual(NativeHomeRegionPresentation.headerInventoryStat(for: [unproven]).label, "local place")
        XCTAssertEqual(NativeHomeRegionPresentation.headerInventoryStat(for: [proven]).value, "18")
        XCTAssertEqual(NativeHomeRegionPresentation.headerInventoryStat(for: [proven]).label, "spots nearby")

        let fallbackWeather = NativeHomeCopyContract.weatherPresentation(for: .fallback)
        XCTAssertEqual(fallbackWeather.headline, "Weather update unavailable")
        XCTAssertEqual(fallbackWeather.headerTemperature, "—")

        let completeWeather: [String: Any] = ["temperature_2m": 64.2, "apparent_temperature": 63.8, "relative_humidity_2m": 62, "precipitation": 0, "weather_code": 2, "wind_speed_10m": 7.4, "is_day": 1]
        let liveWeather = try? NativeLiveDiscoveryAPI.weatherSnapshot(from: completeWeather, updatedAt: Date(timeIntervalSince1970: 100))
        XCTAssertEqual(liveWeather?.source, .live)
        XCTAssertEqual(liveWeather?.temperatureF, 64)

        var missingTemperature = completeWeather
        missingTemperature.removeValue(forKey: "temperature_2m")
        XCTAssertThrowsError(try NativeLiveDiscoveryAPI.weatherSnapshot(from: missingTemperature))
        let malformedPresentation = NativeHomeCopyContract.weatherPresentation(for: (try? NativeLiveDiscoveryAPI.weatherSnapshot(from: missingTemperature)) ?? .fallback)
        XCTAssertEqual(malformedPresentation.headline, "Weather update unavailable")
        XCTAssertEqual(malformedPresentation.headerTemperature, "—")
        XCTAssertNotEqual(malformedPresentation.badge, "LIVE")

        let decodedMissingCrowdLabel = NativeTabContentStore.venue(from: ["id": "missing-crowd-label", "name": "Missing Crowd Label", "lat": 33.7867, "lng": -84.3832, "crowd": ["level": 1]])
        XCTAssertNil(decodedMissingCrowdLabel?.crowd)
    }

    @MainActor
    func testAppleAndGoogleProviderSessionsPersistThroughKeychain() async {
        let account = "native_auth_persistence_\(UUID().uuidString)"
        let service = "com.bytspot.native-auth-persistence-tests"
        let store = BytspotSessionStore(account: account, service: service)
        defer { store.signOut(); NativeSignedInIdentity.clear() }

        let apple = NativeAuthCoordinator(appleAdapter: KeychainAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        apple.handle(.signIn(.apple), sessionStore: store)
        await waitForToken("keychain_apple_test_token", in: store)
        XCTAssertEqual(apple.status, .signedIn(provider: .apple, displayName: "Apple Test"))
        let restoredApple = BytspotSessionStore(account: account, service: service)
        restoredApple.reloadFromKeychain()
        XCTAssertEqual(restoredApple.token, "keychain_apple_test_token")
        XCTAssertEqual(restoredApple.authenticatedUserID, "apple-user-id")

        XCTAssertTrue(store.updateSession(token: "refreshed_apple_test_token", userID: "apple-user-id"))
        let refreshedApple = BytspotSessionStore(account: account, service: service)
        XCTAssertEqual(refreshedApple.token, "refreshed_apple_test_token")
        XCTAssertEqual(refreshedApple.authenticatedUserID, "apple-user-id")

        store.signOut()
        let google = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: KeychainGoogleAdapter())
        google.handle(.signIn(.google), sessionStore: store)
        await waitForToken("keychain_google_test_token", in: store)
        XCTAssertEqual(google.status, .signedIn(provider: .google, displayName: "Google Test"))
        let restoredGoogle = BytspotSessionStore(account: account, service: service)
        restoredGoogle.reloadFromKeychain()
        XCTAssertEqual(restoredGoogle.token, "keychain_google_test_token")
        XCTAssertEqual(restoredGoogle.authenticatedUserID, "google-user-id")
    }

    @MainActor
    func testEmailAuthSessionPersistsStableIdentity() throws {
        let account = "native_email_auth_persistence_\(UUID().uuidString)"
        let service = "com.bytspot.native-email-auth-persistence-tests"
        let sessionStore = BytspotSessionStore(account: account, service: service)
        defer {
            sessionStore.signOut()
        }

        let response = NativeAuthResponse(token: "email_session_token", user: NativeAuthUserRecord(id: "email-user-id", email: "member@example.com", name: "Member"), isNewUser: false)
        XCTAssertTrue(NativeEmailAuthSessionPersistence.persist(response, in: sessionStore))

        let restoredSession = BytspotSessionStore(account: account, service: service)
        XCTAssertEqual(restoredSession.token, "email_session_token")
        XCTAssertEqual(restoredSession.authenticatedUserID, "email-user-id")
    }

    @MainActor
    func testEmailAuthSessionFailsClosedWithoutStableUserIdentity() {
        let account = "native_email_auth_missing_identity_\(UUID().uuidString)"
        let service = "com.bytspot.native-email-auth-missing-identity-tests"
        let sessionStore = BytspotSessionStore(account: account, service: service)
        defer { sessionStore.signOut() }
        XCTAssertTrue(sessionStore.updateSession(token: "old_token", userID: "old-user"))

        let missingIdentity = NativeAuthResponse(token: "new_token", user: NativeAuthUserRecord(id: nil, email: "member@example.com", name: "Member"), isNewUser: false)
        XCTAssertFalse(NativeEmailAuthSessionPersistence.persist(missingIdentity, in: sessionStore))
        XCTAssertNil(sessionStore.token)
        XCTAssertNil(sessionStore.authenticatedUserID)

        let restoredSession = BytspotSessionStore(account: account, service: service)
        XCTAssertNil(restoredSession.token)
        XCTAssertNil(restoredSession.authenticatedUserID)
    }

    @MainActor
    private func waitForToken(_ expected: String, in store: BytspotSessionStore) async {
        for _ in 0..<40 {
            if store.token == expected { return }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Timed out waiting for the provider session token to reach Keychain storage.")
    }

    func testLaunchPersonalizationStorageKeysAndTokensAreStable() {
        XCTAssertEqual(NativeMigrationConfig.selfTestsEnvironmentKey, "BYT_NATIVE_SELF_TESTS")
        XCTAssertEqual(NativeAuthRouteContract.googleConsumerSurface, "parker")
        XCTAssertEqual(NativeAuthLaunchContract.splashTagline, "Your perfect spot awaits")
        XCTAssertEqual(NativeAuthLaunchContract.splashCapabilities, ["Parking", "Venues", "AI-Powered"])
        XCTAssertEqual(NativeLaunchPersonalizationStorage.vibeKey, "bytspot_native_launch_vibe")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.walkKey, "bytspot_native_launch_walk")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.crewKey, "bytspot_native_launch_crew")
        XCTAssertEqual(NativeAuthLaunchContract.appFlow, ["splash", "landing", "location", "vibe", "walk", "crew", "recommendations", "main"])
        XCTAssertEqual(BytspotNativeTab.allCases.map(\.rawValue), ["home", "discover", "map", "concierge", "profile"])
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "🍸 Drinks"), "drinks")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "🚶‍♀️ 10 min"), "medium")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "👫 Date night"), "date_night")
    }

    @MainActor
    func testLaunchLocationPresentationFollowsAuthorizationAndResolution() {
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .notDetermined, hasResolvedLocation: false), .request)
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .allowed, hasResolvedLocation: false), .locating)
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .allowed, hasResolvedLocation: true), .ready)
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .denied, hasResolvedLocation: false), .settings)
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .restricted, hasResolvedLocation: false), .settings)
        XCTAssertEqual(NativeLaunchLocationContract.phase(authorization: .unavailable, hasResolvedLocation: false), .unavailable)
    }

    @MainActor
    func testLaunchRecommendationsRequireTrustworthyLiveVenueProvenance() {
        XCTAssertEqual(NativeLaunchRecommendationPresentation.mode(location: .midtown, hasPicks: false, hasTrustworthyLiveVenueInventory: false, isRefreshing: false), .locationNeeded)
        XCTAssertEqual(NativeLaunchRecommendationPresentation.mode(location: .verifiedMidtown, hasPicks: false, hasTrustworthyLiveVenueInventory: false, isRefreshing: true), .loading)
        XCTAssertEqual(NativeLaunchRecommendationPresentation.mode(location: .verifiedMidtown, hasPicks: true, hasTrustworthyLiveVenueInventory: false, isRefreshing: false), .localSync)
        XCTAssertEqual(NativeLaunchRecommendationPresentation.mode(location: .verifiedMidtown, hasPicks: true, hasTrustworthyLiveVenueInventory: true, isRefreshing: false), .livePicks)

        let liveVenue = NativeVenueSummary(id: "live-midtown-parking", name: "Live Midtown Parking", category: "parking", address: "1200 Peachtree St NE", distance: "0.3 mi", rating: 4.7, latitude: 33.7865, longitude: -84.3830, crowd: NativeCrowdSummary(level: 1, label: "Open", waitMins: 0), parking: NativeParkingSummary(totalAvailable: 18, priceLabel: "$6/hr"), verifiedPatchId: "LIVE-PARKING", imageUrl: nil)
        let providerCard = NativeDiscoverSummary(id: "provider-local-cafe", type: "coffee", title: "Local Cafe", subtitle: "Provider result", distance: "0.2 mi", rating: "4.8", icon: "cup.and.saucer.fill", verified: true, entryType: "free", cta: "View", imageUrl: nil, categoryLabel: "Coffee", badgeText: "APPLE MAPS", metadataLine: "Nearby", features: [], vibeScore: 8, availability: "Open", membershipRequired: false)
        let mixedFallback = NativeTabContentSnapshot(venues: NativeTabContentSnapshot.fallback.venues, discoverCards: [providerCard] + NativeTabContentSnapshot.fallback.discoverCards, events: NativeTabContentSnapshot.fallback.events, source: .mixed, lastUpdated: Date(), errorMessage: nil)
        let erroredLive = NativeTabContentSnapshot(venues: [liveVenue], discoverCards: [], events: [], source: .live, lastUpdated: Date(), errorMessage: "Refresh failed", hasLiveVenueInventory: true)
        let spoofedFallback = NativeTabContentSnapshot(venues: NativeTabContentSnapshot.fallback.venues, discoverCards: [providerCard], events: [], source: .live, lastUpdated: Date(), errorMessage: nil, hasLiveVenueInventory: true)
        let venueCard = NativeDiscoverSummary(id: "venue-live-midtown-parking", type: "parking", title: "Live Midtown Parking", subtitle: "Live venue", distance: "0.3 mi", rating: "4.7", icon: "parkingsign.circle.fill", verified: true, entryType: "free", cta: "Route", imageUrl: nil, categoryLabel: "Parking", badgeText: "LIVE API", metadataLine: "18 spots", features: [], vibeScore: 8, availability: "Open", membershipRequired: false)
        let liveEvent = NativeEventSummary(id: "live-midtown-event", title: "Live Midtown Event", venue: "Live Hall", time: "Tonight", price: "Free", emoji: "🎟️", imageUrl: nil)
        let liveEventCard = NativeDiscoverSummary(id: "event-live-midtown-event", type: "entertainment", title: "Live Midtown Event", subtitle: "Live Hall", distance: "Tonight", rating: "Live", icon: "ticket.fill", verified: true, entryType: "free", cta: "View Event", imageUrl: nil, categoryLabel: "Events", badgeText: "LIVE EVENT", metadataLine: "Tonight", features: [], vibeScore: 8, availability: "Tonight", membershipRequired: false)
        let opaqueIDSpoof = NativeDiscoverSummary(id: "promo-venue-live-midtown-parking", type: "service", title: "Unproven Promotion", subtitle: "Opaque API card", distance: "0.1 mi", rating: "Live", icon: "sparkles", verified: true, entryType: "paid", cta: "Book", imageUrl: nil, categoryLabel: "Service", badgeText: "LIVE API", metadataLine: "Available now", features: [], vibeScore: 10, availability: "Available now", membershipRequired: false)
        let eventOnlyLive = NativeTabContentSnapshot(venues: [], discoverCards: [liveEventCard], events: [liveEvent], source: .live, lastUpdated: Date(), errorMessage: nil, hasLiveEventInventory: true)
        let trustedLive = NativeTabContentSnapshot(venues: [liveVenue], discoverCards: [venueCard, liveEventCard, opaqueIDSpoof] + NativeTabContentSnapshot.fallback.discoverCards, events: [liveEvent] + NativeTabContentSnapshot.fallback.events, source: .live, lastUpdated: Date(), errorMessage: nil, hasLiveVenueInventory: true, hasLiveEventInventory: true)
        XCTAssertFalse(mixedFallback.hasTrustworthyLiveVenueInventory)
        XCTAssertFalse(erroredLive.hasTrustworthyLiveVenueInventory)
        XCTAssertFalse(spoofedFallback.hasTrustworthyLiveVenueInventory)
        XCTAssertTrue(spoofedFallback.trustworthyLiveVenues.isEmpty)
        XCTAssertTrue(trustedLive.hasTrustworthyLiveVenueInventory)
        XCTAssertFalse(NativeHomeRegionPresentation.canPresentLaunchPicks(in: mixedFallback))
        XCTAssertFalse(NativeHomeRegionPresentation.hasTrustedLocalRecommendations(in: mixedFallback))
        XCTAssertEqual(NativeHomeRegionPresentation.trustedProviderCards(in: mixedFallback).map(\.id), ["provider-local-cafe"])
        XCTAssertTrue(NativeHomeRegionPresentation.venueRailVenues(in: mixedFallback).isEmpty)
        let providerOnlyHome = NativeHomeRegionPresentation.homeSafeSnapshot(mixedFallback)
        XCTAssertTrue(providerOnlyHome.venues.isEmpty)
        XCTAssertTrue(providerOnlyHome.discoverCards.isEmpty)
        XCTAssertTrue(providerOnlyHome.events.isEmpty)
        XCTAssertTrue(NativeHomeRegionPresentation.eventRailEvents(in: mixedFallback).isEmpty)
        XCTAssertTrue(NativeHomeRegionPresentation.hasTrustedLocalRecommendations(in: eventOnlyLive))
        XCTAssertTrue(NativeHomeRegionPresentation.venueRailVenues(in: spoofedFallback).isEmpty)
        XCTAssertTrue(NativeHomeRegionPresentation.canPresentLaunchPicks(in: trustedLive))
        XCTAssertTrue(NativeHomeRegionPresentation.hasTrustedLocalRecommendations(in: trustedLive))
        XCTAssertEqual(NativeHomeRegionPresentation.venueRailVenues(in: trustedLive).map(\.id), ["live-midtown-parking"])
        XCTAssertEqual(NativeHomeRegionPresentation.eventRailEvents(in: trustedLive).map(\.id), ["live-midtown-event"])
        let trustedHomeIDs = NativeHomeRegionPresentation.homeSafeSnapshot(trustedLive).discoverCards.map(\.id)
        XCTAssertTrue(trustedHomeIDs.contains("venue-live-midtown-parking"))
        XCTAssertTrue(trustedHomeIDs.contains("event-live-midtown-event"))
        XCTAssertFalse(trustedHomeIDs.contains("promo-venue-live-midtown-parking"))
        XCTAssertEqual(NativeLaunchRecommendationPresentation.capabilityTitles.count, 3)
    }
}

final class NativeAppearanceModeContractTests: XCTestCase {
    func testAppearanceModeInteractiveSelectionContract() {
        XCTAssertEqual(NativeAppearanceMode.defaultsKey, "bytspot_native_appearance_mode")
        XCTAssertEqual(NativeAppearanceMode.environmentKey, "BYT_NATIVE_APPEARANCE")
        XCTAssertEqual(NativeAppearanceMode.panelAutorunEnvironmentKey, "BYT_NATIVE_APPEARANCE_PANEL_AUTORUN")
        XCTAssertEqual(NativeAppearanceMode.userSelectionNotification.rawValue, "BytspotNativeAppearanceUserSelectionDidChange")
        XCTAssertEqual(NativeAppearanceMode.userSelectionUserInfoKey, "mode")
        XCTAssertEqual(NativeAppearanceMode.allCases.map(\.rawValue), ["system", "dark", "light"])
        XCTAssertEqual(NativeAppearanceMode.resolved(raw: "DARK"), .dark)
        XCTAssertEqual(NativeAppearanceMode.resolved(raw: "bad-value"), .system)
        XCTAssertNil(NativeAppearanceMode.system.preferredColorScheme)
        XCTAssertEqual(NativeAppearanceMode.dark.uiUserInterfaceStyle, .dark)
        XCTAssertEqual(NativeAppearanceMode.light.uiUserInterfaceStyle, .light)
    }
}

final class NativeMenuCheckoutTests: XCTestCase {
    private func fixture() -> (venue: NativeVenueSummary, menu: PartnerMenu, firstItem: MenuItem) {
        let venue = NativeVenueSummary(id: "broni", name: "Broni Home Taste", category: "dining", address: "Authentic Ghanaian Home Cooking", distance: "Dining", rating: 4.9, latitude: 0, longitude: 0, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Paid"), verifiedPatchId: "DISCOVER-VERIFIED", imageUrl: nil)
        let menu = PartnerMenu.sample(for: venue)
        return (venue, menu, menu.sections.first!.items.first!)
    }

    func testPlacedOrderSnapshotMirrorsSelectedLineItems() {
        let (venue, menu, firstItem) = fixture()
        let placement = NativeMenuCheckoutProbe.placeOrder(menu: menu, quantities: [firstItem.id: 2], paymentLabel: NativeMenuCheckoutProbe.paymentMethods[0], authenticated: true)
        let order = placement.order
        XCTAssertEqual(order.status, "confirmed")
        XCTAssertEqual(order.totalLabel, PartnerMenu.formatPrice(cents: firstItem.priceCents * 2, currencyCode: menu.currencyCode))
        XCTAssertEqual(order.itemCountLabel, "2 items")
        XCTAssertEqual(order.venueName, venue.name)
        XCTAssertTrue(order.orderCode.hasPrefix("BYO"), "Menu order code must use the BYO prefix.")
        XCTAssertTrue(order.itemSummary.contains("2× \(firstItem.name)"), "Order summary must reflect the selected quantity × item name.")
    }

    func testConfirmedOrderSurfacesInMyAccessLedger() {
        let (venue, menu, firstItem) = fixture()
        let placement = NativeMenuCheckoutProbe.placeOrder(menu: menu, quantities: [firstItem.id: 2], paymentLabel: NativeMenuCheckoutProbe.paymentMethods[0], authenticated: true)
        let ledger = placement.ledger
        XCTAssertEqual(ledger.title, "Menu Order")
        XCTAssertEqual(ledger.venue, venue.name)
        XCTAssertEqual(ledger.statusBadge, "CONFIRMED")
        XCTAssertEqual(ledger.reservation, "Confirmed")
        XCTAssertEqual(ledger.actionTitle, "View order in My Access")
        XCTAssertEqual(ledger.window, placement.order.fulfillmentLabel)
        XCTAssertEqual(ledger.payment, "\(placement.order.paymentLabel) · \(placement.order.totalLabel)")
    }

    func testEmptyCartOrderIsZeroedButStillWellFormed() {
        let (_, menu, _) = fixture()
        let order = NativeMenuCheckoutProbe.placeOrder(menu: menu, quantities: [:], paymentLabel: NativeMenuCheckoutProbe.paymentMethods[0], authenticated: true).order
        XCTAssertEqual(order.itemCountLabel, "0 items")
        XCTAssertEqual(order.totalLabel, "$0")
        XCTAssertEqual(order.itemSummary, "Menu order")
    }

    func testFulfillmentLabelReflectsAuthenticationState() {
        let (_, menu, firstItem) = fixture()
        let quantities = [firstItem.id: 1]
        XCTAssertEqual(NativeMenuCheckoutProbe.placeOrder(menu: menu, quantities: quantities, paymentLabel: NativeMenuCheckoutProbe.paymentMethods[0], authenticated: true).order.fulfillmentLabel, "Ready for pickup · ~20 min")
        XCTAssertEqual(NativeMenuCheckoutProbe.placeOrder(menu: menu, quantities: quantities, paymentLabel: NativeMenuCheckoutProbe.paymentMethods[0], authenticated: false).order.fulfillmentLabel, "Ready for pickup · confirm on arrival")
    }

    func testCheckoutOffersTheSharedNativePaymentMethods() {
        XCTAssertEqual(NativeMenuCheckoutProbe.paymentMethods, ["Apple Pay", "Credit / Debit Card"])
        XCTAssertTrue(NativeMenuCheckoutProbe.sharesNativeCheckoutPaymentMethods, "Menu checkout must offer the same payment methods as other native checkouts.")
    }

    func testCatalogOccupancyCannotBeLive() {
        let plan = NativeCollapseInstrument.collapse(
            hang: NativeHangInput(id: "patio-1", name: "Chilled Patio", vibeTokens: ["chill"], occupancySource: "typical"),
            stall: NativeStallInput(name: "1380 W Peachtree Garage", source: .vendor, walkMinutes: 3, paid: true)
        )
        XCTAssertEqual(plan.occupancy.kind, .typical)
        XCTAssertTrue(plan.because.localizedCaseInsensitiveContains("usually"))
        XCTAssertFalse(plan.canCheckout)
    }

    func testOnlyADoorWriteIsLive() {
        let plan = NativeCollapseInstrument.collapse(
            hang: NativeHangInput(id: "patio-1", name: "Chilled Patio", vibeTokens: ["chill"], occupancySource: "user_report"),
            stall: NativeStallInput(name: "1380 W Peachtree Garage", source: .vendor, walkMinutes: 3, paid: true),
            detector: .room,
            settlementReady: true
        )
        XCTAssertEqual(plan.occupancy.kind, .live)
        XCTAssertTrue(plan.because.localizedCaseInsensitiveContains("door wrote"))
        XCTAssertTrue(plan.canCheckout)
    }

    func testPlaceDetectorNeverSettles() {
        XCTAssertFalse(NativeCollapseInstrument.detectorCanSettle(.place, stallSource: .vendor, settlementReady: true))
        let plan = NativeCollapseInstrument.collapse(
            hang: NativeHangInput(id: "patio-1", name: "Chilled Patio"),
            stall: NativeStallInput(name: "1380 W Peachtree Garage", source: .vendor, walkMinutes: 3, paid: true),
            detector: .place,
            settlementReady: true
        )
        XCTAssertFalse(plan.canCheckout)
    }

    func testFortyAtlantaDoorsStayTypicalCatalog() {
        XCTAssertEqual(NativeAtlantaCorridor.midtown.count, NativeAtlantaCorridor.kitDoorCount)
        XCTAssertEqual(NativeAtlantaCorridor.kitDoorCount, 10)
        XCTAssertEqual(NativeAtlantaCorridor.atlanta.count, NativeAtlantaCorridor.catalogDoorCount)
        XCTAssertEqual(NativeAtlantaCorridor.catalogDoorCount, 40)
        for plan in NativeAtlantaCorridor.catalogPlans() {
            XCTAssertEqual(plan.occupancy.kind, .typical)
            XCTAssertFalse(plan.canCheckout)
            XCTAssertTrue(plan.because.contains("min walk"))
            XCTAssertFalse(NativeAtlantaCorridor.crowdLabel(for: plan).localizedCaseInsensitiveContains("Live"))
        }
        let kinds = Set(NativeAtlantaCorridor.atlanta.map(\.kind))
        XCTAssertTrue(kinds.contains(.sport))
        XCTAssertTrue(kinds.contains(.event))
        XCTAssertEqual(NativeAtlantaCorridor.atlanta.filter { $0.kind == .sport }.count, 6)
        XCTAssertEqual(NativeAtlantaCorridor.atlanta.filter { $0.kind == .event }.count, 13)
        XCTAssertEqual(Set(NativeAtlantaCorridor.atlanta.map(\.id)).count, NativeAtlantaCorridor.atlanta.count)
    }

    func testTypicalHomePlanIsOfferedOnAtlantaOrFallbackAndNeverOnSeattle() {
        XCTAssertNotNil(NativeAtlantaCorridor.homePlan(at: .midtown, hour: 19))
        XCTAssertNotNil(NativeAtlantaCorridor.homePlan(at: .verifiedMidtown, hour: 9))
        let seattle = NativeLocationCoordinate(latitude: 47.6062, longitude: -122.3321, isFallback: false)
        XCTAssertNil(NativeAtlantaCorridor.homePlan(at: seattle, hour: 19))
        XCTAssertFalse(NativeAtlantaCorridor.canOfferTypicalHomePlan(at: seattle))
        XCTAssertTrue(NativeAtlantaCorridor.canOfferTypicalHomePlan(at: .midtown))
        let evening = NativeAtlantaCorridor.homePlan(at: .midtown, hour: 20)
        XCTAssertNotEqual(evening?.hang.id.hasPrefix("door-host-"), true)
        XCTAssertEqual(evening?.occupancy.kind, .typical)
    }

    func testTypicalHomePlanDoesNotChangeEmptyStatePredicate() {
        let emptySnapshot = NativeTabContentSnapshot(venues: [], discoverCards: NativeTabContentSnapshot.fallback.discoverCards, events: [], source: .fallback, lastUpdated: nil, errorMessage: nil)
        XCTAssertTrue(NativeHomeRegionPresentation.shouldShowLocalEmptyState(in: emptySnapshot, launchPicksCompleted: true, launchPickCount: 0))
        XCTAssertFalse(NativeHomeRegionPresentation.hasTrustedLocalRecommendations(in: emptySnapshot))
    }
}

extension BytspotTrustEngineTests {
    func testVibeFocusCatalogOnlyOffersTokensTheRankingDistinguishes() {
        // A control that maps to a token the scorer ignores would be a switch
        // wired to nothing, which is what this panel used to be.
        var leadingTypes: [String] = []
        for token in NativeVibeFocusCatalog.offeredIntentTokens {
            let types = NativeVibeFocusCatalog.focusTypes(intent: token, walk: "", crew: "")
            XCTAssertFalse(types.isEmpty, "intent \(token) produces no ranking preference")
            leadingTypes.append(types[0])
        }
        XCTAssertEqual(Set(leadingTypes).count, Set(NativeVibeFocusCatalog.offeredIntentTokens).count - 1,
                       "coffee and work intentionally share a leading type; every other intent must differ")
    }

    func testVibeFocusWalkChoicesMatchTheDistanceTheyPromise() {
        XCTAssertEqual(NativeVibeFocusCatalog.maxFocusWalkMiles("closest"), 1.0)
        XCTAssertEqual(NativeVibeFocusCatalog.maxFocusWalkMiles("medium"), 3.0)
        XCTAssertNil(NativeVibeFocusCatalog.maxFocusWalkMiles("far"))

        for choice in NativeVibeFocusCatalog.walks {
            let miles = NativeVibeFocusCatalog.maxFocusWalkMiles(choice.value)
            if choice.subtitle == "No limit" { XCTAssertNil(miles, "\(choice.value) claims no limit but has one") }
            else { XCTAssertNotNil(miles, "\(choice.value) promises a distance the ranking does not apply") }
        }
    }

    func testVibeFocusSummaryDescribesTheRankingItReadsBack() {
        let drinks = NativeVibeFocusCatalog.focusSummary(intent: "drinks", walk: "closest", crew: "solo")
        XCTAssertEqual(drinks, "Home leads with Nightlife, within 1 mile.")

        let coffee = NativeVibeFocusCatalog.focusSummary(intent: "coffee", walk: "medium", crew: "solo")
        XCTAssertEqual(coffee, "Home leads with Coffee, within 3 miles.")

        let unlimited = NativeVibeFocusCatalog.focusSummary(intent: "food", walk: "far", crew: "solo")
        XCTAssertEqual(unlimited, "Home leads with Dining.")

        // No focus chosen yet: say nothing rather than claim a personalization.
        XCTAssertNil(NativeVibeFocusCatalog.focusSummary(intent: "", walk: "", crew: ""))
    }

    func testVibeFocusPanelEditsTheSameKeysHomeRanksOn() {
        XCTAssertEqual(NativeLaunchPersonalizationStorage.vibeKey, "bytspot_native_launch_vibe")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.walkKey, "bytspot_native_launch_walk")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.crewKey, "bytspot_native_launch_crew")

        // The quiz and the panel must agree on token spelling, or editing in
        // Profile would silently reset what onboarding captured.
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "🍸 A good drink"), "drinks")
        XCTAssertTrue(NativeVibeFocusCatalog.offeredIntentTokens.contains("drinks"))
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "👥 A group"), "group")
        XCTAssertTrue(NativeVibeFocusCatalog.offeredCrewTokens.contains("group"))
    }
}
