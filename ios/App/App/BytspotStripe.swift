import Foundation
import StripeApplePay

/// Resolves the Stripe publishable key and installs it on the Stripe SDK.
///
/// Fastlane substitutes `$(STRIPE_PUBLISHABLE_KEY)` into Info.plist at archive
/// time. Simulator and unit tests can override that value with the same env var
/// without rebuilding. Secret and restricted keys are rejected so a mis-copied
/// `sk_` / `rk_` never reaches `StripeAPI`.
enum BytspotStripe {
    /// Build-time key (Info.plist) filled from `STRIPE_PUBLISHABLE_KEY`.
    static let publishableKeyInfoPlistKey = "BytspotStripePublishableKey"
    /// Runtime override used by simulator, CI, and tests.
    static let publishableKeyEnvironmentKey = "STRIPE_PUBLISHABLE_KEY"

    /// Environment override, then Info.plist. Nil when neither is a publishable key.
    static func resolvedPublishableKey(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        infoValue: String? = Bundle.main.object(forInfoDictionaryKey: publishableKeyInfoPlistKey) as? String
    ) -> String? {
        if let key = sanitized(environment[publishableKeyEnvironmentKey]) { return key }
        return sanitized(infoValue)
    }

    /// Trims and accepts only `pk_live_` / `pk_test_` keys. Unexpanded xcconfig
    /// placeholders and secret/restricted keys fail closed.
    static func sanitized(_ raw: String?) -> String? {
        let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count >= 20 else { return nil }
        if value.hasPrefix("$("), value.hasSuffix(")") { return nil }
        let prefix = value.prefix(8).lowercased()
        guard prefix == "pk_live_" || prefix == "pk_test_" else { return nil }
        return value
    }

    /// Installs a valid publishable key on `StripeAPI`. Returns the key that was
    /// applied, or nil when checkout should keep using hosted Stripe Checkout.
    @discardableResult
    static func configure(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        infoValue: String? = Bundle.main.object(forInfoDictionaryKey: publishableKeyInfoPlistKey) as? String,
        apply: ((String) -> Void)? = nil
    ) -> String? {
        guard let key = resolvedPublishableKey(environment: environment, infoValue: infoValue) else { return nil }
        if let apply {
            apply(key)
        } else {
            StripeAPI.defaultPublishableKey = key
        }
        return key
    }
}
