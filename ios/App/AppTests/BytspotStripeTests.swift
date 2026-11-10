import Foundation
import Testing
@testable import App

@Suite("Stripe publishable key")
struct BytspotStripeTests {
    @Test func liveAndTestPublishableKeysAreAccepted() {
        #expect(BytspotStripe.sanitized("pk_live_abcdefghijklmnopqrstuv") == "pk_live_abcdefghijklmnopqrstuv")
        #expect(BytspotStripe.sanitized(" pk_test_abcdefghijklmnopqrstuv ") == "pk_test_abcdefghijklmnopqrstuv")
    }

    @Test(arguments: [
        "",
        "pk_live_",
        "$(STRIPE_PUBLISHABLE_KEY)",
        "sk_live_abcdefghijklmnopqrstuv",
        "rk_live_abcdefghijklmnopqrstuv",
        "pk_prod_abcdefghijklmnopqrstuv",
        "not-a-key",
    ])
    func invalidKeysAreRejected(_ raw: String) {
        #expect(BytspotStripe.sanitized(raw) == nil)
    }

    @Test func environmentOverridesInfoPlist() {
        let env = ["STRIPE_PUBLISHABLE_KEY": "pk_test_environmentoverridekey"]
        #expect(BytspotStripe.resolvedPublishableKey(environment: env, infoValue: "pk_live_infoplistvaluekeyxx") == "pk_test_environmentoverridekey")
        #expect(BytspotStripe.resolvedPublishableKey(environment: [:], infoValue: "pk_live_infoplistvaluekeyxx") == "pk_live_infoplistvaluekeyxx")
        #expect(BytspotStripe.resolvedPublishableKey(environment: [:], infoValue: "$(STRIPE_PUBLISHABLE_KEY)") == nil)
    }

    @Test func configureAppliesOnlyValidKeys() {
        var applied: String?
        #expect(BytspotStripe.configure(environment: [:], infoValue: "sk_live_secretshouldneverapply", apply: { applied = $0 }) == nil)
        #expect(applied == nil)
        #expect(BytspotStripe.configure(environment: ["STRIPE_PUBLISHABLE_KEY": "pk_live_configuredpublishable"], infoValue: nil, apply: { applied = $0 }) == "pk_live_configuredpublishable")
        #expect(applied == "pk_live_configuredpublishable")
    }
}
