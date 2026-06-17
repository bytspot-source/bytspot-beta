import Foundation

#if DEBUG
/// DEBUG-only native migration guard for virtual-patch booking/hold policy parity.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativePatchBookingSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        assertMembershipMode()
        assertIdempotencyKeyShape()
        assertIdenticalActiveHoldIsReused()
        assertBlackEverydayAllowsDistinctService()
        assertExpiredHoldCanCreateAgain()
        assertOneTimeTagBlocksDistinctActiveService()
    }

    private static func assertMembershipMode() {
        precondition(NativeVirtualPatchCheckoutPolicy.membershipMode(for: blackEverydayRoute) == .blackEverydayMembership, "NativePatchBookingSelfTests: black everyday membership mode drifted.")
        precondition(NativeVirtualPatchCheckoutPolicy.membershipMode(for: oneTimeRoute) == .oneTime, "NativePatchBookingSelfTests: one-time membership mode drifted.")
    }

    private static func assertIdempotencyKeyShape() {
        let key = NativeVirtualPatchCheckoutPolicy.buildIdempotencyKey(route: blackEverydayRoute, intent: aviationIntent)
        precondition(key == "vpatch:checkout:v1:byt424-0301-b:booking:stratos:black-aviation:2800000:2", "NativePatchBookingSelfTests: idempotency key drifted: \(key)")
    }

    private static func assertIdenticalActiveHoldIsReused() {
        let key = NativeVirtualPatchCheckoutPolicy.buildIdempotencyKey(route: blackEverydayRoute, intent: aviationIntent)
        let result = NativeVirtualPatchCheckoutPolicy.resolve(route: blackEverydayRoute, intent: aviationIntent, existingRequests: [activeRequest(idempotencyKey: key)], now: date(610))
        precondition(result.decision == .reuseActive, "NativePatchBookingSelfTests: identical active hold was not reused.")
        precondition(result.existingRequest?.id == "hold-jet-active", "NativePatchBookingSelfTests: reused hold id drifted.")
        precondition(result.reason == "identical_active_hold", "NativePatchBookingSelfTests: reuse reason drifted.")
    }

    private static func assertBlackEverydayAllowsDistinctService() {
        let result = NativeVirtualPatchCheckoutPolicy.resolve(route: blackEverydayRoute, intent: diningIntent, existingRequests: [activeRequest()], now: date(610))
        precondition(result.decision == .create, "NativePatchBookingSelfTests: black everyday distinct service did not create.")
        precondition(result.membershipMode == .blackEverydayMembership, "NativePatchBookingSelfTests: black everyday result mode drifted.")
        precondition(result.reason == "membership_allows_distinct_service", "NativePatchBookingSelfTests: black everyday reason drifted.")
    }

    private static func assertExpiredHoldCanCreateAgain() {
        let result = NativeVirtualPatchCheckoutPolicy.resolve(route: blackEverydayRoute, intent: aviationIntent, existingRequests: [activeRequest()], now: date(46 * 60))
        precondition(result.decision == .create, "NativePatchBookingSelfTests: expired hold unexpectedly blocked create.")
    }

    private static func assertOneTimeTagBlocksDistinctActiveService() {
        let result = NativeVirtualPatchCheckoutPolicy.resolve(route: oneTimeRoute, intent: diningIntent, existingRequests: [activeRequest()], now: date(610))
        precondition(result.decision == .blockedOneTime, "NativePatchBookingSelfTests: one-time tag did not block distinct active service.")
        precondition(result.reason == "one_time_tag_active_request_exists", "NativePatchBookingSelfTests: one-time reason drifted.")
    }

    private static var blackEverydayRoute: BytspotPatchRoute { make("bytspot://p/BYT424-0301-B?tagUseMode=everyday") }
    private static var oneTimeRoute: BytspotPatchRoute { make("bytspot://p/BYT-EVENT-1?tier=black&tagUseMode=one_time") }

    private static var aviationIntent: NativeVirtualPatchCheckoutIntent {
        NativeVirtualPatchCheckoutIntent(serviceId: "black-aviation", serviceName: "Private Aviation", vendorId: "stratos", amountCents: 2_800_000, guestCount: 2)
    }

    private static var diningIntent: NativeVirtualPatchCheckoutIntent {
        NativeVirtualPatchCheckoutIntent(serviceId: "black-dining", serviceName: "Elite Dining", vendorId: "chef-atelier", amountCents: 120_000, guestCount: 2)
    }

    private static func activeRequest(idempotencyKey: String? = nil) -> NativeVirtualPatchSavedServiceRequest {
        NativeVirtualPatchSavedServiceRequest(
            id: "hold-jet-active",
            serviceId: "black-aviation",
            serviceName: "Private Aviation",
            vendorId: "stratos",
            amountCents: 2_800_000,
            guestCount: 2,
            requestedAt: date(0),
            holdExpiresAt: date(45 * 60),
            idempotencyKey: idempotencyKey
        )
    }

    private static func make(_ raw: String) -> BytspotPatchRoute {
        guard let url = URL(string: raw), let route = BytspotPatchRoute(url: url) else {
            preconditionFailure("NativePatchBookingSelfTests: failed to parse \(raw)")
        }
        return route
    }

    private static func date(_ seconds: TimeInterval) -> Date {
        Date(timeIntervalSince1970: 1_780_000_000 + seconds)
    }
}
#endif
