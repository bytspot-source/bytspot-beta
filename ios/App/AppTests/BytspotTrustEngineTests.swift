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
