import Foundation

#if DEBUG
/// DEBUG-only native migration guard for Broni/GH Akwaaba special-flow parity.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativePatchSpecialFlowSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        assertBroniDetectionAndCart()
        assertGhAkwaabaDetectionAndCart()
        assertSpecialFlowCheckoutIntentFeedsIdempotency()
    }

    private static func assertBroniDetectionAndCart() {
        let route = make("bytspot://p/BYT-BRONI-P?tier=platinum&service=platinum-dining&venue=Broni%20Home%20Taste")
        guard let flow = NativePatchSpecialFlow.resolve(route: route) else {
            preconditionFailure("NativePatchSpecialFlowSelfTests: Broni flow was not detected.")
        }
        precondition(flow.kind == .broniHomeTaste, "NativePatchSpecialFlowSelfTests: Broni kind drifted.")
        precondition(flow.vendorName == "Broni Home Taste", "NativePatchSpecialFlowSelfTests: Broni vendor drifted.")
        precondition(flow.lineItems.count == 6, "NativePatchSpecialFlowSelfTests: Broni line-item count drifted.")
        precondition(flow.lineItems.first?.label == "Jollof Rice with Chicken", "NativePatchSpecialFlowSelfTests: Broni first item drifted.")
        precondition(flow.totalCents == 1_500, "NativePatchSpecialFlowSelfTests: Broni default total drifted.")
    }

    private static func assertGhAkwaabaDetectionAndCart() {
        let route = make("https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass")
        guard let flow = NativePatchSpecialFlow.resolve(route: route) else {
            preconditionFailure("NativePatchSpecialFlowSelfTests: GH Akwaaba flow was not detected.")
        }
        precondition(flow.kind == .ghAkwaabaFifa, "NativePatchSpecialFlowSelfTests: GH kind drifted.")
        precondition(flow.vendorName == "GH Akwaaba Pass", "NativePatchSpecialFlowSelfTests: GH vendor drifted.")
        precondition(flow.lineItems.map(\.label) == ["Ticket Sales", "Souvenirs", "Ghana Home Jersey"], "NativePatchSpecialFlowSelfTests: GH line items drifted.")
        precondition(flow.totalCents == 5_000, "NativePatchSpecialFlowSelfTests: GH default total drifted.")
    }

    private static func assertSpecialFlowCheckoutIntentFeedsIdempotency() {
        let route = make("bytspot://access/BYT-EVENT-P?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass&party=2")
        guard let flow = NativePatchSpecialFlow.resolve(route: route) else {
            preconditionFailure("NativePatchSpecialFlowSelfTests: GH checkout flow was not detected.")
        }
        let intent = flow.checkoutIntent(route: route)
        let key = NativeVirtualPatchCheckoutPolicy.buildIdempotencyKey(route: route, intent: intent)
        precondition(key == "vpatch:checkout:v1:byt-event-p:booking:gh-akwaaba-pass:gh-akwaaba-fifa:5000:2", "NativePatchSpecialFlowSelfTests: GH idempotency key drifted: \(key)")
    }

    private static func make(_ raw: String) -> BytspotPatchRoute {
        guard let url = URL(string: raw), let route = BytspotPatchRoute(url: url) else {
            preconditionFailure("NativePatchSpecialFlowSelfTests: failed to parse \(raw)")
        }
        return route
    }
}
#endif
