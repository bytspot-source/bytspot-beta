import XCTest
import CoreLocation
@testable import App

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
        XCTAssertEqual(NativeVenueDetailContract.actions.first(where: { $0.id == "bookRide" })?.kind, .capability(.createCheckoutHold))
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
        XCTAssertEqual(NativeCheckInV2Contract.groupJoinRoute, "/trpc/groupEvents.join")

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
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesCreateRoute, "/trpc/social.invites.create")
        XCTAssertEqual(NativeLiveContentV2Contract.socialInvitesListRoute, "/trpc/social.invites.list")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsDraftsCreateRoute, "/trpc/events.drafts.create")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsDraftsUpdateRoute, "/trpc/events.drafts.update")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsPublishRoute, "/trpc/events.publish")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsRSVPRespondRoute, "/trpc/events.rsvp.respond")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsRSVPListRoute, "/trpc/events.rsvp.list")
        XCTAssertEqual(NativeLiveContentV2Contract.groupJoinRoute, "/trpc/groupEvents.join")
    }

    func testVenueDetailPresentationUsesCategorySpecificPrimaryLabels() {
        let primaryAction = NativeVenueDetailContract.actions.first { $0.id == "getTickets" }!
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking · Pickup or delivery")), "View Menu")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass · Premium Event Access")), "View Pass")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Events Worth Leaving For", category: "entertainment", address: "Shows and event experiences")), "Get Tickets")
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

    func testPremiumEntitlementPlanMatchesContract() {
        XCTAssertEqual(BytspotMapFunctionCatalog.premiumEntitlementPlan, "insider-premium")
    }

    func testMembershipIsPremiumFlag() {
        XCTAssertFalse(BytspotMembership.free.isPremium)
        XCTAssertTrue(BytspotMembership.premium.isPremium)
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
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: seattle), "HERE")
        XCTAssertFalse((eyebrow.0 + eyebrow.1).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertFalse(NativeHomeRegionPresentation.launchTitle(intent: "parking", location: seattle).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: .midtown), "HERE")
        XCTAssertFalse(NativeHomeRegionPresentation.launchTitle(intent: "parking", location: .midtown).localizedCaseInsensitiveContains("Midtown"))
        XCTAssertEqual(NativeHomeRegionPresentation.cityBadge(for: .verifiedMidtown), "ATL")
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
    }

    @MainActor
    func testDiscoverRouteEligibilityResolvesGeneratedVenueCardsAndFailsClosedWithoutCoordinates() throws {
        let parking = NativeParkingSummary(totalAvailable: 12, priceLabel: "$8/hr")
        let venue = NativeVenueSummary(id: "route-deck", name: "Route Deck", category: "parking", address: "1 Route St", distance: "0.2 mi", rating: 4.7, latitude: 33.7866, longitude: -84.3833, crowd: nil, parking: parking, verifiedPatchId: nil, imageUrl: nil)
        let generated = NativeTabContentStore.homeDiscoverCards(venues: [venue], events: [])
        let venueCard = try XCTUnwrap(generated.first { $0.id == "venue-\(venue.id)" })
        let companionCard = try XCTUnwrap(generated.first { $0.id.hasPrefix("companion-") })
        let providerCard = NativeDiscoverSummary(id: "place-provider-cafe", type: "coffee", title: "Provider Cafe", subtitle: "2 Route St", distance: "0.3 mi", rating: "4.8", icon: "cup.and.saucer", verified: false, entryType: "free", cta: "Open details", imageUrl: nil, categoryLabel: "Coffee", badgeText: "APPLE MAPS", metadataLine: "Live place", features: [], vibeScore: 7, availability: "Live place", membershipRequired: false, latitude: 33.7870, longitude: -84.3830)
        let unresolved = NativeDiscoverSummary(id: "unresolved", type: "parking", title: "Unknown Deck", subtitle: "Address pending", distance: "Nearby", rating: "Explore", icon: "parkingsign", verified: false, entryType: "free", cta: "Explore", imageUrl: nil, categoryLabel: "Parking", badgeText: "CURATED", metadataLine: "Check nearby", features: [], vibeScore: 1, availability: "Check nearby", membershipRequired: false)
        let localProviderCards = NativeTabContentStore.locationAwareCards([providerCard], sourceVenues: [], location: .verifiedMidtown)

        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: venueCard, venues: [venue])?.id, venue.id)
        XCTAssertEqual(NativeDiscoverRouteResolver.routeVenue(for: companionCard, venues: [venue])?.id, venue.id)
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
            XCTAssertEqual(defaults.double(forKey: NativeMapFocusHandoff.latitudeKey), providerLatitude)
            XCTAssertEqual(defaults.double(forKey: NativeMapFocusHandoff.longitudeKey), providerLongitude)
        }
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
        NativeMapFocusHandoff.store(venue: venue, locationScopeOrigin: .midtown, defaults: defaults)
        XCTAssertFalse(NativeMapFocusHandoff.hasPendingFocus(in: defaults))
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
            XCTAssertFalse(BytspotMapFunctionCatalog.isUnlocked(function, for: .free), "\(function.rawValue) must stay locked for a free membership.")
            XCTAssertTrue(BytspotMapFunctionCatalog.isUnlocked(function, for: .premium), "\(function.rawValue) must unlock for a premium membership.")
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
            isAuthenticated: false,
            isPremium: false
        )
    }

    // MARK: - Live membership decode (NativeMembershipStore tRPC parity)

    func testMembershipDecodeToleratesPlainTRPCEnvelope() {
        let payload: [String: Any] = ["result": ["data": ["isPremium": true, "isVendorPremium": false]]]
        XCTAssertEqual(NativeMembershipStore.findBool(named: "isPremium", in: payload), true)
    }

    func testMembershipDecodeToleratesSuperjsonTRPCEnvelope() {
        let payload: [String: Any] = ["result": ["data": ["json": ["isPremium": false]]]]
        XCTAssertEqual(NativeMembershipStore.findBool(named: "isPremium", in: payload), false)
    }

    func testMembershipDecodeFailsSafeWhenKeyMissing() {
        let payload: [String: Any] = ["result": ["data": ["isVendorPremium": true]]]
        XCTAssertNil(NativeMembershipStore.findBool(named: "isPremium", in: payload))
    }
}

final class NativeProfileDataAPITests: XCTestCase {
    func testTRPCDecodeUnwrapsSuperjsonProfileEnvelope() throws {
        let envelope: [String: Any] = ["result": ["data": ["json": ["id": "user_1", "email": "member@example.com", "name": "Avery Parker", "phone": "+1 404 555 0198", "address": "Atlanta, GA", "birthday": "1994-04-03"]]]]
        let record = try decode(NativeUserProfileRecord.self, from: envelope)
        XCTAssertEqual(record.email, "member@example.com")
        XCTAssertEqual(record.name, "Avery Parker")
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

    func testProfileNetworkCardUsesSocialCirclesRpcSurface() throws {
        XCTAssertEqual(NativeLiveContentV2Contract.socialGroupsListRoute, "/trpc/social.groups.list")
        XCTAssertEqual(NativeLiveContentV2Contract.eventsDraftsCreateRoute, "/trpc/events.drafts.create")
        XCTAssertEqual(NativeProfileDataAPI.socialCircleListInput()["surface"] as? String, "profile_network_card")

        let path = try BytspotAPIClient.trpcQueryPath(NativeLiveContentV2Contract.socialGroupsListRoute, input: NativeProfileDataAPI.socialCircleListInput())
        let components = URLComponents(string: path)
        let rawInput = try XCTUnwrap(components?.queryItems?.first(where: { $0.name == "input" })?.value)
        let data = try XCTUnwrap(rawInput.data(using: .utf8))
        let decoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(decoded["surface"] as? String, "profile_network_card")
    }

    func testPrimaryEventDraftBuilderUsesProfileNetworkCardSurfaceAndSocialCircleID() throws {
        let payment = NativePrimaryEventManualPayment(method: "Venmo", label: "Host Venmo", url: "https://venmo.example/pay", note: "Split after dinner")
        let record = NativeGroupEventRecord.created(type: "Dinner", title: "Trust Crew Dinner", hostName: "Ama", tier: .black, privacyStatus: .privateInvite, audienceCircle: "Trust Crew", coHosts: ["Kojo"], ticketingLabel: "RSVP required", chipInLabel: "$25", manualPayment: payment, customQuestions: ["Any allergies?"], hideGuestList: true, eventNotes: "API-first draft")

        let input = NativePrimaryEventDraftBuilder.input(for: record, audienceGroupId: "circle-trust-crew")

        XCTAssertEqual(input["surface"] as? String, "profile_network_card")
        XCTAssertEqual(input["title"] as? String, "Trust Crew Dinner")
        XCTAssertEqual(input["visibility"] as? String, "private")
        XCTAssertEqual(input["audienceGroupIds"] as? [String], ["circle-trust-crew"])
        XCTAssertEqual(input["capacityLimit"] as? Int, NativeGroupEventContract.entitlement(for: .black).participantCapacity)
        let rsvp = try XCTUnwrap(input["rsvp"] as? [String: Any])
        XCTAssertEqual(rsvp["customQuestions"] as? [String], ["Any allergies?"])
        XCTAssertEqual(rsvp["hideGuestList"] as? Bool, true)
        let payments = try XCTUnwrap(input["paymentLinks"] as? [[String: Any]])
        XCTAssertEqual(payments.first?["verification"] as? String, "manual_unverified")
        XCTAssertEqual(payments.first?["url"] as? String, "https://venmo.example/pay")
    }

    func testNormalizeSocialCircleMirrorsPrimaryEventRpcShape() throws {
        let payload: [String: Any] = ["groups": [
            ["id": "circle-1", "name": "Trust Crew", "ownerUserId": "user-1", "memberCount": 12, "privacy": "private", "role": "owner"],
            ["groupId": "circle-2", "title": "Family", "membersCount": "4"]
        ]]

        let groups = NativeSocialCircle.normalizeSocialCircles(payload)

        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups.first?.id, "circle-1")
        XCTAssertEqual(groups.first?.name, "Trust Crew")
        XCTAssertEqual(groups.first?.memberCount, 12)
        XCTAssertEqual(groups.first?.privacy, "private")
        XCTAssertEqual(groups.last?.id, "circle-2")
        XCTAssertEqual(groups.last?.name, "Family")
        XCTAssertEqual(groups.last?.memberCount, 4)
        XCTAssertEqual(groups.last?.privacy, "invite_only")
    }

    func testNativeProfileWireframeRemovesRedundantFriendsMenuGroup() {
        XCTAssertEqual(NativeProfileWireframeGuard.menuSectionTitles, ["Places & Activity", "Preferences", "App Settings", "Safety & Legal"])
        XCTAssertFalse(NativeProfileWireframeGuard.socialActivityPanels.contains(.friends))
        XCTAssertEqual(NativeProfileWireframeGuard.friendsPanelTitle, "Find Friends")
        XCTAssertEqual(NativeProfileWireframeGuard.friendsPanelEyebrow, "NETWORK")
        XCTAssertEqual(NativeProfileWireframeGuard.networkCardTitle, "Profile Network")
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

    private func decode<T: Decodable>(_ type: T.Type, from envelope: Any) throws -> T {
        let payload = BytspotAPIClient.unwrapTRPCData(envelope)
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(T.self, from: data)
    }
}

final class NativeAuthLaunchInputTests: XCTestCase {
    private struct KeychainAppleAdapter: AppleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .apple, token: "keychain_apple_test_token", displayName: "Apple Test")
        }
    }

    private struct KeychainGoogleAdapter: GoogleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .google, token: "keychain_google_test_token", displayName: "Google Test")
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
        let signup = NativeAuthDataAPI.signupInput(email: " member@example.com ", password: "12345678", name: " Avery Parker ", ref: " ab12 ")
        XCTAssertEqual(signup["email"] as? String, "member@example.com")
        XCTAssertEqual(signup["name"] as? String, "Avery Parker")
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

    func testGoogleNativeOAuthAudienceConfigurationIsResolved() throws {
        let serverClientID = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String)
        XCTAssertFalse(serverClientID.isEmpty)
        XCTAssertFalse(serverClientID.hasPrefix("$("))

        let serviceURL = try XCTUnwrap(Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"))
        let service = try XCTUnwrap(NSDictionary(contentsOf: serviceURL) as? [String: Any])
        let iosClientID = try XCTUnwrap(service["CLIENT_ID"] as? String)
        XCTAssertNotEqual(serverClientID, iosClientID)
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
        defer { store.signOut() }

        let apple = NativeAuthCoordinator(appleAdapter: KeychainAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        apple.handle(.signIn(.apple), sessionStore: store)
        await waitForToken("keychain_apple_test_token", in: store)
        XCTAssertEqual(apple.status, .signedIn(provider: .apple, displayName: "Apple Test"))
        let restoredApple = BytspotSessionStore(account: account, service: service)
        restoredApple.reloadFromKeychain()
        XCTAssertEqual(restoredApple.token, "keychain_apple_test_token")

        store.signOut()
        let google = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: KeychainGoogleAdapter())
        google.handle(.signIn(.google), sessionStore: store)
        await waitForToken("keychain_google_test_token", in: store)
        XCTAssertEqual(google.status, .signedIn(provider: .google, displayName: "Google Test"))
        let restoredGoogle = BytspotSessionStore(account: account, service: service)
        restoredGoogle.reloadFromKeychain()
        XCTAssertEqual(restoredGoogle.token, "keychain_google_test_token")
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

final class NativeGroupEventContractTests: XCTestCase {
    func testConsumerTierEntitlementsFollowGreenPlatinumBlackHierarchy() {
        let green = NativeGroupEventProbe.entitlementSnapshot(tier: .green)
        XCTAssertEqual(green.activeEventLimit, 1)
        XCTAssertEqual(green.participantCapacity, 5)
        XCTAssertEqual(green.liveDurationHours, 2)
        XCTAssertEqual(green.allowedTimingStates.map(\.label), ["Now", "Today"])
        XCTAssertFalse(green.allowsCustomBannerImage)

        let platinum = NativeGroupEventProbe.entitlementSnapshot(tier: .platinum)
        XCTAssertEqual(platinum.activeEventLimit, 3)
        XCTAssertEqual(platinum.participantCapacity, 25)
        XCTAssertEqual(platinum.liveDurationHours, 12)
        XCTAssertTrue(platinum.allowedTimingStates.contains(.weekly))

        let black = NativeGroupEventProbe.entitlementSnapshot(tier: .black)
        XCTAssertEqual(black.activeEventLimit, 10)
        XCTAssertEqual(black.participantCapacity, 100)
        XCTAssertEqual(black.liveDurationHours, 48)
        XCTAssertEqual(black.offerPriority, "Exclusive matched offers")
    }

    func testVendorLTOTierEntitlementsScaleBroadcastAndAnalytics() {
        XCTAssertEqual(NativeGroupEventProbe.vendorSnapshot(tier: .green).activeOfferLimit, 1)
        XCTAssertEqual(NativeGroupEventProbe.vendorSnapshot(tier: .platinum).activeOfferLimit, 5)
        XCTAssertEqual(NativeGroupEventProbe.vendorSnapshot(tier: .black).activeOfferLimit, 20)
        XCTAssertEqual(NativeGroupEventProbe.vendorSnapshot(tier: .green).analyticsLevel, "Views + claims")
        XCTAssertEqual(NativeGroupEventProbe.vendorSnapshot(tier: .black).boostAccess, "Featured boosts")
    }

    func testHomepageBannerUsesInstantAccessBytspotCopy() {
        let banner = NativeGroupEventProbe.homepageBanner(tier: .black)
        XCTAssertEqual(banner.sectionTitle, "Live Event Happening Now")
        XCTAssertEqual(banner.eyebrow, "LIVE NOW")
        XCTAssertEqual(banner.title, "Family Dinner")
        XCTAssertEqual(banner.tierBadge, "Black")
        XCTAssertEqual(banner.privacyBadge, "Private Group")
        XCTAssertEqual(banner.ctaTitle, "Open Group")
        XCTAssertTrue(banner.subtitle.contains("48h live window"))

        XCTAssertEqual(NativeGroupEventProbe.homepageBanner(tier: .platinum, timing: .weekly).eyebrow, "WEEKLY")
        XCTAssertEqual(NativeGroupEventProbe.homepageBanner(tier: .platinum, timing: .weekly).ctaTitle, "Join Instantly")
    }

    func testInviteURLIsAppClipInstantJoinFriendly() {
        let url = NativeGroupEventProbe.inviteURLString(tier: .green)
        XCTAssertTrue(url.hasPrefix("https://bytspot.app/group/family-dinner?"))
        XCTAssertTrue(url.contains("tier=green"))
        XCTAssertTrue(url.contains("timing=now"))
        XCTAssertTrue(url.contains("title=Family%20Dinner"))
        XCTAssertTrue(url.contains("type=Family"))
        XCTAssertTrue(url.contains("participants=3"))
        XCTAssertTrue(url.contains("scheduled="))
        XCTAssertTrue(url.contains("host=Bytspot%20Member"))
        XCTAssertTrue(url.contains("location="))
        XCTAssertTrue(url.contains("theme="))
        XCTAssertTrue(url.contains("guestSummary="))
        XCTAssertTrue(url.contains("activities="))
        XCTAssertTrue(url.contains("hero=https"))
        XCTAssertTrue(url.contains("thumbnail=https"))
        XCTAssertTrue(url.contains("source=app_clip"))
    }

    func testInviteActionFeedbackKeepsButtonsResponsiveForDraftAndPublishedStates() {
        XCTAssertEqual(NativeGroupInviteActionKind.copy.draftStatus, "Draft invite link copied.")
        XCTAssertEqual(NativeGroupInviteActionKind.qr.draftStatus, "QR invite preview opened and link copied.")
        XCTAssertEqual(NativeGroupInviteActionKind.nfc.draftStatus, "NFC invite preview opened and link copied.")
        XCTAssertTrue(NativeGroupInviteActionKind.copy.publishedStatus.contains("Invite link copied"))
        XCTAssertTrue(NativeGroupInviteActionKind.qr.publishedStatus.contains("QR invite opened"))
        XCTAssertTrue(NativeGroupInviteActionKind.nfc.publishedStatus.contains("NFC invite opened"))
    }

    func testInviteAccessSheetCopyIsDraftAwareUntilPublishSucceeds() {
        XCTAssertEqual(NativeGroupInvitePublishState.published.qrTitle, "Scan to Join")
        XCTAssertTrue(NativeGroupInvitePublishState.published.nfcSubtitle.contains("App Clip ready"))
        XCTAssertEqual(NativeGroupInvitePublishState.draftSignedOut.qrTitle, "Draft QR Preview")
        XCTAssertTrue(NativeGroupInvitePublishState.draftSignedOut.noticeBody.contains("Sign in and publish"))
        XCTAssertTrue(NativeGroupInvitePublishState.draftAuthenticated.qrDetail.contains("after this group publishes"))
        XCTAssertTrue(NativeGroupInvitePublishState.publishing.nfcInstruction.contains("Wait for publish"))
        XCTAssertTrue(NativeGroupInvitePublishState.draftSignedOut.copiedStatus.contains("Draft invite link copied"))
    }

    func testSilentPublishCanBeUpgradedToAnnouncedByUserAction() {
        let eventID = "family-dinner"
        let silent = NativeGroupInvitePublishAnnouncement.updatedIDs([], eventID: eventID, announce: false)
        XCTAssertFalse(NativeGroupInvitePublishAnnouncement.shouldAnnounceCompletion(eventID: eventID, announcedIDs: silent))
        let upgraded = NativeGroupInvitePublishAnnouncement.updatedInFlightIDs(silent, eventID: eventID, announce: true)
        XCTAssertTrue(NativeGroupInvitePublishAnnouncement.shouldAnnounceCompletion(eventID: eventID, announcedIDs: upgraded))
        let reset = NativeGroupInvitePublishAnnouncement.updatedIDs(upgraded, eventID: eventID, announce: false)
        XCTAssertFalse(NativeGroupInvitePublishAnnouncement.shouldAnnounceCompletion(eventID: eventID, announcedIDs: reset))
    }

    func testSilentDuplicatePublishDoesNotDowngradeAnnouncedInFlightPublish() {
        let eventID = "family-dinner"
        let announced = NativeGroupInvitePublishAnnouncement.updatedIDs([], eventID: eventID, announce: true)
        let silentDuplicate = NativeGroupInvitePublishAnnouncement.updatedInFlightIDs(announced, eventID: eventID, announce: false)
        XCTAssertTrue(NativeGroupInvitePublishAnnouncement.shouldAnnounceCompletion(eventID: eventID, announcedIDs: silentDuplicate))
    }

    func testTieredGroupCreationCarriesPlatinumAndBlackMetadataIntoInviteURLs() {
        let platinum = NativeGroupEventRecord.created(
            type: "Dinner",
            title: "Platinum Dinner Group",
            timing: .weekly,
            inviteNote: "Host-led arrival.",
            allowNearbyOffers: true,
            hostName: "Kojo Asante",
            tier: .platinum,
            scheduledDate: "Tonight · 8:00 PM",
            locationLabel: "Host-selected private table",
            theme: "Premium dinner",
            activityHighlights: ["Chef menu", "Private arrival"]
        )
        XCTAssertEqual(platinum.tier, .platinum)
        XCTAssertEqual(platinum.timing, .weekly)
        XCTAssertEqual(platinum.hostName, "Kojo Asante")
        XCTAssertEqual(platinum.guestSummary, "1 joined · up to 25 guests")
        let platinumURL = NativeGroupEventContract.inviteURL(for: platinum).absoluteString
        XCTAssertTrue(platinumURL.contains("tier=platinum"))
        XCTAssertTrue(platinumURL.contains("scheduled=Tonight"))
        XCTAssertTrue(platinumURL.contains("host=Kojo%20Asante"))
        XCTAssertTrue(platinumURL.contains("location=Host-selected%20private%20table"))
        XCTAssertTrue(platinumURL.contains("theme=Premium%20dinner"))
        XCTAssertTrue(platinumURL.contains("activities=Chef%20menu,Private%20arrival"))

        let black = NativeGroupEventRecord.created(type: "Family", hostName: "Black Host", tier: .black)
        XCTAssertEqual(black.tier, .black)
        XCTAssertTrue(black.guestSummary.contains("100 guests"))
        XCTAssertTrue(NativeGroupEventContract.inviteURL(for: black).absoluteString.contains("tier=black"))
    }

    @MainActor
    func testGroupInviteURLRoutesToAppClipStyleJoinDestination() {
        let urlString = "https://bytspot.app/group/platinum-private-dinner?tier=Platinum&timing=this-week&source=app_clip&participants=12&scheduled=Tonight%20%C2%B7%208%3A00%20PM&host=Kojo%20Asante&location=Host-selected%20private%20table&theme=Premium%20dinner&activities=Chef%20menu,Private%20arrival"
        let invite = NativeGroupEventProbe.parsedInvite(urlString: urlString)
        XCTAssertEqual(invite?.id, "platinum-private-dinner")
        XCTAssertEqual(invite?.tier, .platinum)
        XCTAssertEqual(invite?.timing, .thisWeek)
        XCTAssertEqual(invite?.hostName, "Kojo Asante")
        XCTAssertEqual(invite?.locationLabel, "Host-selected private table")
        XCTAssertEqual(invite?.theme, "Premium dinner")
        XCTAssertEqual(invite?.activityHighlights, ["Chef menu", "Private arrival"])
        XCTAssertEqual(invite?.privateAssociation, .joinedViaInvite)

        let coordinator = NativeNavigationCoordinator()
        XCTAssertTrue(coordinator.handle(url: URL(string: urlString)!))
        XCTAssertEqual(coordinator.requestedTab, .home)
        if case .groupEvent(let routedInvite) = coordinator.requestedDestination {
            XCTAssertEqual(routedInvite.id, "platinum-private-dinner")
            XCTAssertEqual(routedInvite.privateAssociation, .joinedViaInvite)
        } else {
            XCTFail("Group invite links must route to the App Clip-style group destination, not Profile.")
        }
    }

    func testGroupEventStorePersistsPrimaryLiveEvent() {
        NativeGroupEventStore.clear()
        XCTAssertNil(NativeGroupEventStore.primaryLiveEvent())
        let record = NativeGroupEventRecord.created(type: "Dinner", hostName: "Bytspot Member", tier: .green)
        NativeGroupEventStore.upsert(record)
        XCTAssertEqual(NativeGroupEventStore.primaryLiveEvent()?.title, "Dinner Group")
        XCTAssertEqual(NativeGroupEventStore.primaryLiveEvent()?.tier, .green)
        NativeGroupEventStore.clear()
    }

    func testPreLiveTemplateDetailsFlowIntoCreatedRecord() {
        let record = NativeGroupEventRecord.created(
            type: "Birthday",
            title: "Ama's Birthday Dinner",
            timing: .today,
            inviteNote: "Meet at 7 — offer claim before ordering.",
            allowNearbyOffers: false,
            hostName: "Bytspot Member",
            tier: .green
        )
        XCTAssertEqual(record.title, "Ama's Birthday Dinner")
        XCTAssertEqual(record.timing, .today)
        XCTAssertEqual(record.inviteNote, "Meet at 7 — offer claim before ordering.")
        XCTAssertFalse(record.allowNearbyOffers)
    }

    func testPrimaryEventTemplatePreservesSocialCircleMetadataAndManualPayments() throws {
        let payment = NativePrimaryEventManualPayment(method: "Venmo", label: "Venmo @ama", url: "https://venmo.example/ama", note: "Add your name")
        let record = NativeGroupEventRecord.created(
            type: "Listening Party",
            title: "Primary Event Social Night",
            timing: .thisWeek,
            hostName: "Ama",
            tier: .platinum,
            privacyStatus: .publicDiscovery,
            audienceCircle: "Creators",
            fontStyle: "Serif Luxe",
            coHosts: ["DJ Kojo", "Broni Home Taste"],
            playlistURLString: "https://music.example/playlist",
            ticketingLabel: "$20 standard ticket",
            chipInLabel: "Pay what you can",
            manualPayment: payment,
            rsvpCutoff: "Friday · 6 PM",
            customQuestions: ["Any allergies?"],
            hideActivityTimestamps: true,
            hideGuestList: true,
            dressCode: "All black",
            foodSituation: "Small bites",
            parkingInstructions: "Use rear garage",
            accommodation: "Nearby hotel block",
            eventNotes: "Bring photo ID",
            linkURLString: "https://example.com/event",
            iconName: "music.note"
        )

        XCTAssertEqual(record.privacyStatus, .publicDiscovery)
        XCTAssertEqual(record.audienceCircle, "Creators")
        XCTAssertEqual(record.fontStyle, "Serif Luxe")
        XCTAssertEqual(record.coHosts, ["DJ Kojo", "Broni Home Taste"])
        XCTAssertEqual(record.manualPayment?.verificationStatus, "manual_unverified")
        XCTAssertEqual(record.primaryEventMetadataPayload["parking"] as? String, "Use rear garage")

        let invite = try XCTUnwrap(NativeGroupEventContract.groupInvite(from: NativeGroupEventContract.inviteURL(for: record)))
        XCTAssertEqual(invite.privateAssociation, .joinedViaInvite)
        XCTAssertEqual(invite.audienceCircle, "Creators")
        XCTAssertEqual(invite.fontStyle, "Serif Luxe")
        XCTAssertEqual(invite.coHosts, ["DJ Kojo", "Broni Home Taste"])
        XCTAssertEqual(invite.manualPayment?.verificationStatus, "manual_unverified")
        XCTAssertEqual(invite.customQuestions, ["Any allergies?"])
        XCTAssertTrue(invite.hideGuestList)

        let decoded = try JSONDecoder().decode(NativeGroupEventRecord.self, from: try JSONEncoder().encode(record))
        XCTAssertEqual(decoded.dressCode, "All black")
        XCTAssertEqual(decoded.manualPayment?.label, "Venmo @ama")
    }

    func testHomepagePrivacyHidesDinnerAndFamilyWithoutPrivateAssociation() {
        let unaffiliatedFamily = NativeGroupEventRecord(id: "family-public", title: "Family Dinner", groupType: "Family", hostName: "Host", tier: .green, timing: .now, participantCount: 4, allowNearbyOffers: true, inviteNote: nil, privacyStatus: .publicDiscovery, privateAssociation: .none)
        XCTAssertTrue(unaffiliatedFamily.requiresPrivateHomepageAssociation)
        XCTAssertFalse(unaffiliatedFamily.isHomepageVisibleToCurrentViewer)

        let unaffiliatedDinner = NativeGroupEventRecord(id: "dinner-public", title: "Dinner Group", groupType: "Dinner", hostName: "Host", tier: .green, timing: .now, participantCount: 4, allowNearbyOffers: true, inviteNote: nil, privacyStatus: .publicDiscovery, privateAssociation: .none)
        XCTAssertTrue(unaffiliatedDinner.requiresPrivateHomepageAssociation)
        XCTAssertFalse(unaffiliatedDinner.isHomepageVisibleToCurrentViewer)

        let joinedFamily = NativeGroupEventRecord(id: "family-joined", title: "Family Dinner", groupType: "Family", hostName: "Host", tier: .green, timing: .now, participantCount: 4, allowNearbyOffers: true, inviteNote: nil, privacyStatus: .publicDiscovery, privateAssociation: .joinedViaInvite)
        XCTAssertTrue(joinedFamily.isHomepageVisibleToCurrentViewer)
    }

    func testHomepageRetrievalSkipsPrivateUnaffiliatedEvents() {
        NativeGroupEventStore.clear()
        let privatePickup = NativeGroupEventRecord(id: "pickup-private", title: "Pickup Group", groupType: "Pickup", hostName: "Host", tier: .green, timing: .now, participantCount: 2, allowNearbyOffers: true, inviteNote: nil, privacyStatus: .privateInvite, privateAssociation: .none)
        let publicPickup = NativeGroupEventRecord(id: "pickup-public", title: "Pickup Crew", groupType: "Pickup", hostName: "Host", tier: .green, timing: .now, participantCount: 2, allowNearbyOffers: true, inviteNote: nil, privacyStatus: .publicDiscovery, privateAssociation: .none)
        NativeGroupEventStore.upsert(publicPickup)
        NativeGroupEventStore.upsert(privatePickup)
        XCTAssertEqual(NativeGroupEventStore.primaryLiveEvent()?.id, "pickup-private")
        XCTAssertEqual(NativeGroupEventStore.primaryHomepageVisibleEvent()?.id, "pickup-public")
        NativeGroupEventStore.clear()
    }

    // MARK: - Host approval mode (record Codable + tRPC wire value)

    func testApprovalModeCodableRoundTripAndWireValue() throws {
        let approval = NativeGroupEventRecord.created(type: "Dinner", requiresApproval: true, hostName: "Host", tier: .green)
        XCTAssertTrue(approval.requiresApproval)
        XCTAssertEqual(approval.approvalMode, "approval")

        let open = NativeGroupEventRecord.created(type: "Dinner", requiresApproval: false, hostName: "Host", tier: .green)
        XCTAssertFalse(open.requiresApproval)
        XCTAssertEqual(open.approvalMode, "open")

        // Encode → decode preserves requiresApproval and its wire value.
        let decoded = try JSONDecoder().decode(NativeGroupEventRecord.self, from: try JSONEncoder().encode(approval))
        XCTAssertTrue(decoded.requiresApproval)
        XCTAssertEqual(decoded.approvalMode, "approval")

        // Backward compatibility: legacy payloads without the key default to open.
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: try JSONEncoder().encode(approval)) as? [String: Any])
        object.removeValue(forKey: "requiresApproval")
        let legacy = try JSONDecoder().decode(NativeGroupEventRecord.self, from: try JSONSerialization.data(withJSONObject: object))
        XCTAssertFalse(legacy.requiresApproval)
        XCTAssertEqual(legacy.approvalMode, "open")
    }

    func testGroupEventDataAPIUsesRawTRPCWireFormat() throws {
        // Mutation body is the raw input dictionary — NOT the {"json":…} envelope.
        let body = try NativeGroupEventDataAPI.rawMutationBody(["id": "family-dinner", "approvalMode": "approval"])
        let bodyObject = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(bodyObject["id"] as? String, "family-dinner")
        XCTAssertEqual(bodyObject["approvalMode"] as? String, "approval")
        XCTAssertNil(bodyObject["json"], "Mutation body must be raw, not the {\"json\":…} envelope.")

        // Query carries the raw input in `?input=<url-encoded json>`.
        let prefix = "/trpc/groupEvents.host?input="
        let path = try NativeGroupEventDataAPI.rawQueryPath("/trpc/groupEvents.host", input: ["eventId": "family-dinner"])
        XCTAssertTrue(path.hasPrefix(prefix))
        let decodedQuery = try XCTUnwrap(String(path.dropFirst(prefix.count)).removingPercentEncoding)
        let queryObject = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(decodedQuery.utf8)) as? [String: Any])
        XCTAssertEqual(queryObject["eventId"] as? String, "family-dinner")
        XCTAssertNil(queryObject["json"], "Query input must be raw, not the {\"json\":…} envelope.")
    }

    // MARK: - Unguessable invite slug (private events must not be enumerable)

    func testCreatedInviteSlugIsUnguessableAndURLSafe() {
        let a = NativeGroupEventRecord.created(type: "Dinner", hostName: "Host", tier: .green)
        let b = NativeGroupEventRecord.created(type: "Dinner", hostName: "Host", tier: .green)

        // Two events of the same type/second must not collide — rules out the old
        // predictable `group-<type>-<unix-seconds>` scheme.
        XCTAssertNotEqual(a.id, b.id)

        let prefix = "group-dinner-"
        XCTAssertTrue(a.id.hasPrefix(prefix))
        let suffix = String(a.id.dropFirst(prefix.count))
        XCTAssertEqual(suffix.count, 22, "Random suffix must carry high entropy.")
        XCTAssertFalse(suffix.allSatisfy { $0.isNumber }, "Suffix must not be a plain timestamp.")

        // URL-path safe: only lowercase/uppercase letters, digits, and hyphens.
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")
        XCTAssertTrue(a.id.allSatisfy { allowed.contains($0) })

        // Entropy sanity: many tokens stay unique.
        let tokens = Set((0..<200).map { _ in NativeGroupEventRecord.inviteToken() })
        XCTAssertEqual(tokens.count, 200)
    }
}

/// CI-runnable promotion of the launch-time `NativeMenuParitySelfTests` order +
/// ledger checks. These lock the same pure contract the `precondition` self-tests
/// do — so drift is caught on every PR, not only when the opt-in
/// `BYT_NATIVE_ROOT=1` simulator root boots — reaching the private order/checkout
/// types through the internal `NativeMenuCheckoutProbe` façade.
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
}
