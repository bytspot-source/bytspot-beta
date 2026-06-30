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

    func testVenueDetailPresentationUsesCategorySpecificPrimaryLabels() {
        let primaryAction = NativeVenueDetailContract.actions.first { $0.id == "getTickets" }!
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking · Pickup or delivery")), "View Menu")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass · Premium Event Access")), "View Pass")
        XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: primaryAction, venue: venue(name: "Events Worth Leaving For", category: "entertainment", address: "Shows and event experiences")), "Get Tickets")
    }

    func testVenueDetailHeaderBadgesStayConsumerFacing() {
        XCTAssertNil(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Dinner Spots", category: "dining", address: "Open now", patchId: nil)))
        XCTAssertNil(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Dinner Spots", category: "dining", address: "Open now", patchId: "DISCOVER-VERIFIED")))
        XCTAssertEqual(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking", patchId: "DISCOVER-VERIFIED")), "MEMBER SERVICE")
        XCTAssertEqual(NativeVenueDetailPresentation.headerBadgeTitle(for: venue(name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", patchId: "BYT424-0301-P")), "VERIFIED PATCH")
    }

    func testVenueDetailCategorySectionsArePurposeBuilt() {
        let broni = NativeVenueDetailPresentation.detailSection(for: venue(name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking · Pickup or delivery"))
        XCTAssertEqual(broni?.title, "Dining highlights")
        XCTAssertEqual(broni?.systemImage, "fork.knife")
        XCTAssertTrue(broni?.highlights.contains("Jollof + chicken") == true)

        let gh = NativeVenueDetailPresentation.detailSection(for: venue(name: "GH Akwaaba Pass", category: "service", address: "FIFA Matchday Pass · Premium Event Access"))
        XCTAssertEqual(gh?.title, "Pass access")
        XCTAssertEqual(gh?.systemImage, "ticket.fill")
        XCTAssertTrue(gh?.highlights.contains("Digital pass") == true)
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

    func testPremiumFunctionsLockedWithoutEntitlement() {
        for function in BytspotPremiumMapFunction.allCases {
            XCTAssertFalse(BytspotMapFunctionCatalog.isUnlocked(function, for: .free), "\(function.rawValue) must stay locked for a free membership.")
            XCTAssertTrue(BytspotMapFunctionCatalog.isUnlocked(function, for: .premium), "\(function.rawValue) must unlock for a premium membership.")
        }
    }

    func testPremiumFunctionEnumCoversExactlyTheGatedTokens() {
        XCTAssertEqual(Set(BytspotPremiumMapFunction.allCases.map(\.rawValue)), Set(BytspotMapFunctionCatalog.premiumFunctionTokens))
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

    func testAuthenticatedFixtureContractIsNonSecretAndSafeForSmoke() {
        XCTAssertEqual(NativeProfileDataAPI.fixtureEnvironmentKey, "BYT_NATIVE_PROFILE_DATA_FIXTURES")
        XCTAssertEqual(NativeProfileDataAPI.fixtureProfile.email, "member@example.com")
        XCTAssertEqual(NativeProfileDataAPI.fixtureVehicles.first?.licensePlate, "BYT-424")
        XCTAssertEqual(NativeProfileDataAPI.fixturePaymentMethods.first?.last4, "4242")
        XCTAssertEqual(NativeProfileDataAPI.fixtureNotificationPreferences, .webDefaults)
        XCTAssertEqual(NativeProfileDataAPI.fixtureUserPreferences.vibes, ["drinks"])
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
    func testSignupValidationUsesBackendSafeEightCharacterMinimum() {
        XCTAssertFalse(NativeAuthInputValidator.canSubmit(mode: .signup, name: "Avery", email: "member@example.com", password: "1234567"))
        XCTAssertTrue(NativeAuthInputValidator.canSubmit(mode: .signup, name: "Avery", email: "member@example.com", password: "12345678"))
        XCTAssertEqual(NativeAuthLaunchContract.signupPasswordValidationMessage, "Use at least 8 characters.")
        XCTAssertTrue(NativeAuthInputValidator.submitValidationMessage(mode: .signup).contains("at least 8 characters"))
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

    func testLaunchPersonalizationStorageKeysAndTokensAreStable() {
        XCTAssertEqual(NativeLaunchPersonalizationStorage.vibeKey, "bytspot_native_launch_vibe")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.walkKey, "bytspot_native_launch_walk")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.crewKey, "bytspot_native_launch_crew")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "🍸 Drinks"), "drinks")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "🚶‍♀️ 10 min"), "walk_10")
        XCTAssertEqual(NativeLaunchPersonalizationStorage.token(for: "👫 Date night"), "date_night")
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
