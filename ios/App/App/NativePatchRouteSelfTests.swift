import Foundation

#if DEBUG
/// DEBUG-only native migration guard for patch/scanner route normalization.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativePatchRouteSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        assertPatchRoute()
        assertAccessRouteWithOneTimeMetadata()
        assertDirectRootTagDefaultsToEveryday()
        assertTierCodedSuffixRoute()
        assertScannerAliasRoute()
        assertCanonicalAccessAndPatchPaths()
        assertSpecialFlowCanonicalPatchPaths()
        assertScanSourceContract()
        assertScannerTrustLabelMatrix()
        assertRequiresSignedTokenContract()
        assertCanonicalPathsNeverLeakRawToken()
    }

    /// Locks the `NativePatchScanSource` surface so every ingestion path (NFC,
    /// QR, virtual sheet, universal link, deep link) routes through the single
    /// `NativeNavigationCoordinator.notifyPatchScanned(url:source:)` funnel.
    private static func assertScanSourceContract() {
        precondition(NativePatchScanSource.allCases.map(\.rawValue) == ["nfc", "qr", "virtual", "universalLink", "deepLink"], "NativePatchRouteSelfTests: NativePatchScanSource cases/order drifted from the scanner-funnel contract.")
        precondition(nativePatchScanBridgeChannel == "bytspotNativePatchScanned", "NativePatchRouteSelfTests: JS-bridge channel literal drifted from React-side mirror.")
        precondition(NativeIncomingURLCenter.scanSourceUserInfoKey == "scanSource", "NativePatchRouteSelfTests: NativeIncomingURLCenter userInfo key drifted.")
        precondition(nativePatchScanBridgeSmokeURLEnvironmentKey == "BYT_NATIVE_BRIDGE_SMOKE_URL", "NativePatchRouteSelfTests: bridge smoke-test env key drifted.")
    }

    private static func assertPatchRoute() {
        let route = make("bytspot://p/BYT424?t=tok&tier=black&tagUseMode=everyday&venue=Aviation")
        precondition(route.patchId == "BYT424", "NativePatchRouteSelfTests: /p patchId drifted.")
        precondition(route.routeKind == .patch, "NativePatchRouteSelfTests: /p route kind drifted.")
        precondition(route.tier == .black, "NativePatchRouteSelfTests: /p tier drifted.")
        precondition(route.token == "tok", "NativePatchRouteSelfTests: token alias drifted.")
        precondition(route.useMode == .everyday, "NativePatchRouteSelfTests: everyday use mode drifted.")
    }

    private static func assertAccessRouteWithOneTimeMetadata() {
        let route = make("bytspot://access/BYT424?t=access-token&use=single&action=guest&party=3&r=FRIEND-7&uid=04AABBCCDDEE11&counter=42&c=CUST-9")
        precondition(route.routeKind == .access, "NativePatchRouteSelfTests: /access route kind drifted.")
        precondition(route.useMode == .oneTime, "NativePatchRouteSelfTests: one-time use alias drifted.")
        precondition(route.tagIntent == .friendTap, "NativePatchRouteSelfTests: friend tap intent alias drifted.")
        precondition(route.groupSize == 3, "NativePatchRouteSelfTests: party/group alias drifted.")
        precondition(route.referralCode == "FRIEND-7", "NativePatchRouteSelfTests: referral alias drifted.")
        precondition(route.uid == "04AABBCCDDEE11", "NativePatchRouteSelfTests: UID alias drifted.")
        precondition(route.readCounter == 42, "NativePatchRouteSelfTests: counter alias drifted.")
        precondition(route.customerId == "CUST-9", "NativePatchRouteSelfTests: customer alias drifted.")
        precondition(route.scannerTrustLabel == "NFC counter-ready", "NativePatchRouteSelfTests: scanner trust label drifted.")
    }

    private static func assertDirectRootTagDefaultsToEveryday() {
        let route = make("bytspot://BYT424-0301?scanner=green&tap=social")
        precondition(route.patchId == "BYT424-0301", "NativePatchRouteSelfTests: direct BYT patchId drifted.")
        precondition(route.routeKind == .directBYT, "NativePatchRouteSelfTests: direct route kind drifted.")
        precondition(route.tier == .green, "NativePatchRouteSelfTests: scanner tier alias drifted.")
        precondition(route.useMode == .everyday, "NativePatchRouteSelfTests: root BYT everyday default drifted.")
        precondition(route.tagIntent == .socialTap, "NativePatchRouteSelfTests: social tap alias drifted.")
    }

    private static func assertTierCodedSuffixRoute() {
        let route = make("https://bytspot.com/BYT424-0301-B?event=matchday&intent=share")
        precondition(route.patchId == "BYT424-0301-B", "NativePatchRouteSelfTests: tier-coded root patchId drifted.")
        precondition(route.tier == .black, "NativePatchRouteSelfTests: BYT suffix tier drifted.")
        precondition(route.useMode == .oneTime, "NativePatchRouteSelfTests: event marker use mode drifted.")
        precondition(route.tagIntent == .share, "NativePatchRouteSelfTests: share intent drifted.")
    }

    private static func assertScannerAliasRoute() {
        let route = make("bytspot://t/BYT-P-777?usage=subscription&owner=OWNER-1&groupSize=-2")
        precondition(route.routeKind == .tap, "NativePatchRouteSelfTests: /t route kind drifted.")
        precondition(route.tier == .platinum, "NativePatchRouteSelfTests: BYT-P tier drifted.")
        precondition(route.referralCode == "OWNER-1", "NativePatchRouteSelfTests: owner referral alias drifted.")
        precondition(route.groupSize == 0, "NativePatchRouteSelfTests: negative group size clamp drifted.")
        precondition(route.canonicalAccessPath.contains("tagUseMode=everyday"), "NativePatchRouteSelfTests: canonical use mode drifted.")
    }

    private static func assertCanonicalAccessAndPatchPaths() {
        let route = make("bytspot://access/BYT424-P?tier=platinum&use=event&intent=guest&venue=VIP%20Stadium&service=platinum-entry&r=OWNER-7&party=2")
        precondition(route.canonicalAccessPath.hasPrefix("/access/BYT424-P?"), "NativePatchRouteSelfTests: canonical access prefix drifted.")
        precondition(route.canonicalAccessPath.contains("tier=platinum"), "NativePatchRouteSelfTests: canonical access tier missing.")
        precondition(route.canonicalAccessPath.contains("tagUseMode=one_time"), "NativePatchRouteSelfTests: canonical access use missing.")
        precondition(route.canonicalAccessPath.contains("venue=VIP%20Stadium"), "NativePatchRouteSelfTests: canonical access venue encoding drifted.")
        precondition(route.canonicalAccessPath.contains("service=platinum-entry"), "NativePatchRouteSelfTests: canonical access service missing.")
        precondition(route.canonicalAccessPath.contains("ref=OWNER-7"), "NativePatchRouteSelfTests: canonical access referral missing.")
        precondition(route.canonicalAccessPath.contains("group=2"), "NativePatchRouteSelfTests: canonical access group missing.")
        precondition(!route.canonicalAccessPath.contains("?t=") && !route.canonicalAccessPath.contains("&t="), "NativePatchRouteSelfTests: canonical access should not expose raw token.")
        precondition(route.canonicalPatchPath.hasPrefix("/p/BYT424-P?patch=BYT424-P&"), "NativePatchRouteSelfTests: canonical patch alias drifted.")
    }

    private static func assertSpecialFlowCanonicalPatchPaths() {
        let broni = make("bytspot://access/BYT-BRONI-P?tier=platinum&service=platinum-dining&venue=Broni%20Home%20Taste")
        precondition(broni.canonicalPatchPath.contains("patch=BYT-BRONI-P"), "NativePatchRouteSelfTests: Broni patch alias missing.")
        precondition(broni.canonicalPatchPath.contains("venue=Broni%20Home%20Taste"), "NativePatchRouteSelfTests: Broni venue canonicalization drifted.")
        let gh = make("https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass")
        precondition(gh.canonicalPatchPath.contains("patch=gh-akwaaba-fifa-ghana"), "NativePatchRouteSelfTests: GH patch alias missing.")
        precondition(gh.canonicalPatchPath.contains("service=gh-akwaaba-fifa"), "NativePatchRouteSelfTests: GH service canonicalization drifted.")
        precondition(gh.canonicalPatchPath.contains("venue=GH%20Akwaaba%20Pass"), "NativePatchRouteSelfTests: GH venue canonicalization drifted.")
    }

    /// Locks `BytspotPatchRoute.scannerTrustLabel` across the four trust tiers that
    /// drove the (now-removed) scanner trust UI. Backend audit + checkout policy
    /// still read this label, so drift here is a silent production regression.
    private static func assertScannerTrustLabelMatrix() {
        let counter = make("bytspot://access/BYT424?counter=42&uid=04AABBCC")
        precondition(counter.scannerTrustLabel == "NFC counter-ready", "NativePatchRouteSelfTests: scanner trust label for counter-ready drifted.")
        let uidOnly = make("bytspot://access/BYT424?uid=04AABBCC")
        precondition(uidOnly.scannerTrustLabel == "NFC UID-ready", "NativePatchRouteSelfTests: scanner trust label for UID-only drifted.")
        let tokenOnly = make("bytspot://p/BYT424?t=sig-abc&tier=platinum")
        precondition(tokenOnly.scannerTrustLabel == "Signed token", "NativePatchRouteSelfTests: scanner trust label for signed token drifted.")
        let staticDiscovery = make("bytspot://access/BYT424?tier=green")
        precondition(staticDiscovery.scannerTrustLabel == "Static discovery", "NativePatchRouteSelfTests: scanner trust label for static discovery drifted.")
    }

    /// Locks `BytspotPatchRoute.requiresSignedToken` so the checkout/access flow
    /// can route NFC-unverified taps to the production verifier without relying
    /// on the (now-removed) debug grid for visibility.
    private static func assertRequiresSignedTokenContract() {
        let unsigned = make("bytspot://access/BYT424?tier=platinum")
        precondition(unsigned.requiresSignedToken, "NativePatchRouteSelfTests: requiresSignedToken must be true when no token is present.")
        let signed = make("bytspot://p/BYT424?t=sig-abc&tier=platinum")
        precondition(!signed.requiresSignedToken, "NativePatchRouteSelfTests: requiresSignedToken must be false when a token is present.")
    }

    /// Locks the invariant that canonical patch + access paths never expose the
    /// raw `t=` token to logs, deep links, or shared URLs. Mirrors the access-path
    /// guard at `assertCanonicalAccessAndPatchPaths` and extends it to `/p`.
    private static func assertCanonicalPathsNeverLeakRawToken() {
        let route = make("bytspot://p/BYT424?t=secret-bearer&tier=black&venue=Aviation")
        precondition(!route.canonicalAccessPath.contains("?t=") && !route.canonicalAccessPath.contains("&t="), "NativePatchRouteSelfTests: canonical access path leaked raw token.")
        precondition(!route.canonicalPatchPath.contains("?t=") && !route.canonicalPatchPath.contains("&t="), "NativePatchRouteSelfTests: canonical patch path leaked raw token.")
        precondition(!route.canonicalAccessPath.contains("secret-bearer"), "NativePatchRouteSelfTests: canonical access path leaked raw token value.")
        precondition(!route.canonicalPatchPath.contains("secret-bearer"), "NativePatchRouteSelfTests: canonical patch path leaked raw token value.")
    }

    private static func make(_ raw: String) -> BytspotPatchRoute {
        guard let url = URL(string: raw), let route = BytspotPatchRoute(url: url) else {
            preconditionFailure("NativePatchRouteSelfTests: failed to parse \(raw)")
        }
        return route
    }
}
#endif
