import Foundation
import Security

#if DEBUG
/// DEBUG-only native migration guard for the Apple/Google auth adapter seam.
/// The project does not currently define an XCTest App target, so these run only
/// when crash-on-drift checks are explicitly enabled via BYT_NATIVE_SELF_TESTS=1.
@MainActor
enum NativeAuthSeamSelfTests {
    private static var didScheduleRun = false

    private final class InMemorySessionStore: NativeAuthSessionStoring {
        private(set) var token: String?
        private(set) var userID: String?
        var isAuthenticated: Bool { token?.isEmpty == false && token != "guest_session" }
        @discardableResult func updateToken(_ newToken: String?) -> Bool { token = newToken; userID = nil; return true }
        @discardableResult func updateSession(token: String?, userID: String?) -> Bool { self.token = token; self.userID = userID; return true }
        func continueAsGuest() { token = "guest_session"; userID = nil }
        func signOut() { token = nil; userID = nil }
    }

    private struct SuccessAppleAdapter: AppleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .apple, token: "selftest_apple_token", userID: "selftest-apple-user", displayName: "Apple Self-Test")
        }
    }

    private struct SuccessGoogleAdapter: GoogleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .google, token: "selftest_google_token", userID: "selftest-google-user", displayName: "Google Self-Test")
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

    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled, !didScheduleRun else { return }
        didScheduleRun = true
        Task { await run() }
    }

    private static func run() async {
        _ = canRoundTripKeychain()
        await assertAppleSuccessWiresSessionToken()
        await assertGoogleSuccessWiresSessionToken()
        await assertAdapterFailureKeepsSessionSignedOut()
    }

    private static func assertAppleSuccessWiresSessionToken() async {
        let store = InMemorySessionStore()
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: SuccessAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        coordinator.handle(.signIn(.apple), sessionStore: store)
        await waitFor { store.token == "selftest_apple_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Apple success did not authenticate the session.")
        precondition(store.userID == "selftest-apple-user", "NativeAuthSeamSelfTests: Apple success did not persist stable account identity.")
        precondition(coordinator.status == .signedIn(provider: .apple, displayName: "Apple Self-Test"), "NativeAuthSeamSelfTests: Apple success status drifted.")
        store.signOut()
    }

    private static func assertGoogleSuccessWiresSessionToken() async {
        let store = InMemorySessionStore()
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: SuccessGoogleAdapter())
        coordinator.handle(.signIn(.google), sessionStore: store)
        await waitFor { store.token == "selftest_google_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Google success did not authenticate the session.")
        precondition(store.userID == "selftest-google-user", "NativeAuthSeamSelfTests: Google success did not persist stable account identity.")
        precondition(coordinator.status == .signedIn(provider: .google, displayName: "Google Self-Test"), "NativeAuthSeamSelfTests: Google success status drifted.")
        store.signOut()
    }

    private static func assertAdapterFailureKeepsSessionSignedOut() async {
        let store = InMemorySessionStore()
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        coordinator.handle(.signIn(.apple), sessionStore: store)
        await waitFor {
            if case .failed = coordinator.status { return true }
            return false
        }
        precondition(store.token == nil, "NativeAuthSeamSelfTests: failing adapter unexpectedly wrote a session token.")
        store.signOut()
    }

    private static func canRoundTripKeychain() -> Bool {
        let account = "native_auth_selftest_probe_\(UUID().uuidString)"
        let service = "com.bytspot.native-auth-selftests"
        let data = Data("probe".utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        var item = query
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        item[kSecValueData as String] = data
        SecItemDelete(query as CFDictionary)
        defer { SecItemDelete(query as CFDictionary) }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { return false }
        var readQuery = query
        readQuery[kSecReturnData as String] = true
        readQuery[kSecMatchLimit as String] = kSecMatchLimitOne
        var restored: CFTypeRef?
        guard SecItemCopyMatching(readQuery as CFDictionary, &restored) == errSecSuccess, let restoredData = restored as? Data else { return false }
        return restoredData == data
    }

    private static func waitFor(_ predicate: @MainActor @escaping () -> Bool) async {
        for _ in 0..<40 {
            if predicate() { return }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }
}

/// DEBUG-only source-of-truth guard for the native Splash → Landing → Auth P1 flow.
/// Locks React copy/routes and the native-only backend boundary before smoke capture.
@MainActor
enum NativeAuthSplashSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        assertReactLaunchCopyIsMirrored()
        assertAuthRouteContractsAreNativeOnly()
        assertPreviewHooksAreDeterministic()
    }

    private static func assertReactLaunchCopyIsMirrored() {
        precondition(NativeAuthLaunchContract.appFlow == ["splash", "landing", "location", "vibe", "walk", "crew", "recommendations", "main"], "NativeAuthSplashSelfTests: App flow drifted from launch personalization source-of-truth.")
        precondition(NativeAuthLaunchContract.reactSources.contains("SplashScreen.tsx"), "NativeAuthSplashSelfTests: missing SplashScreen source guard.")
        precondition(NativeAuthLaunchContract.reactSources.contains("App.tsx onboarding quiz"), "NativeAuthSplashSelfTests: missing App.tsx onboarding quiz source guard.")
        precondition(NativeAuthLaunchContract.reactSources.contains("AuthenticationFlow.tsx"), "NativeAuthSplashSelfTests: missing auth source guard.")
        precondition(NativeAuthLaunchContract.splashDurationSeconds == 1.8, "NativeAuthSplashSelfTests: splash timing must mirror approved native premium-minimal intro.")
        precondition(NativeAuthLaunchContract.splashTagline == "Your perfect spot awaits" && NativeAuthLaunchContract.splashCapabilities == ["Parking", "Venues", "AI-Powered"], "NativeAuthSplashSelfTests: splash value copy drifted.")
        precondition(NativeAuthLaunchContract.landingHeadline == "Know Before You Go.", "NativeAuthSplashSelfTests: landing headline drifted.")
        precondition(NativeAuthLaunchContract.vibeQuestion == "What kind of night are we shaping?", "NativeAuthSplashSelfTests: vibe question drifted.")
        precondition(NativeAuthLaunchContract.walkOptions == ["📍 Right nearby", "🚶 A short walk", "🚗 Easy arrival", "🗺️ Show me a hidden gem"], "NativeAuthSplashSelfTests: walk options drifted.")
        precondition(NativeLaunchLocationContract.benefits.count == 3, "NativeAuthSplashSelfTests: location value screen must explain the user benefit before prompting.")
        precondition(NativeLaunchRecommendationPresentation.capabilityTitles == ["Discover with context", "Simplify your arrival", "Keep everything together"], "NativeAuthSplashSelfTests: empty recommendations must hand off to a complete product preview.")
        let legacyVariants = [" ladybird grove and mess hall ", "LIVINGSTON", "Lyla   Lila"]
        precondition(legacyVariants.allSatisfy(NativeAuthLaunchContract.isLegacyAtlantaPickName), "NativeAuthSplashSelfTests: legacy Atlanta pick filtering must normalize case, whitespace, and '&'/'and' variants.")
        let filtered = NativeAuthLaunchContract.launchVenueCandidates(from: legacyVariants.enumerated().map { NativeVenueSummary(id: "legacy-\($0.offset)", name: $0.element, category: "parking", address: "Legacy", distance: "Here", rating: 5, latitude: 33.7866, longitude: -84.3833, crowd: nil, parking: NativeParkingSummary(totalAvailable: 99, priceLabel: "Free"), verifiedPatchId: nil, imageUrl: nil) })
        precondition(filtered.isEmpty, "NativeAuthSplashSelfTests: stale legacy rows must stay empty instead of being replaced with Atlanta fallback venues.")
        precondition(NativeLaunchPersonalizationStorage.vibeKey == "bytspot_native_launch_vibe", "NativeAuthSplashSelfTests: launch vibe storage key drifted.")
        precondition(NativeLaunchPersonalizationStorage.token(for: "🍸 Keep the night going") == "drinks", "NativeAuthSplashSelfTests: launch vibe token normalization drifted.")
        precondition(NativeLaunchPersonalizationStorage.token(for: "🚶 A short walk") == "close", "NativeAuthSplashSelfTests: launch walk token normalization drifted.")
        precondition(ProcessInfo.processInfo.environment["BYT_NATIVE_LAUNCH_AUTORUN"] == nil || NativeAuthLaunchContract.autoRunsLaunchJourney, "NativeAuthSplashSelfTests: launch autorun hook drifted.")
    }

    private static func assertAuthRouteContractsAreNativeOnly() {
        precondition(NativeAuthLaunchContract.authRoutes == ["auth.signup", "auth.login", "auth.googleSignIn", "auth.appleSignIn"], "NativeAuthSplashSelfTests: auth route list drifted.")
        precondition(NativeAuthLaunchContract.authModes == ["signup", "login"], "NativeAuthSplashSelfTests: auth modes drifted.")
        precondition(NativeAuthLaunchContract.signupPasswordMinimum == 6, "NativeAuthSplashSelfTests: signup password rule drifted.")
        precondition(NativeAuthLaunchContract.reactSignupPasswordMinimum == 6, "NativeAuthSplashSelfTests: signup rules must stay aligned.")
        precondition(NativeAuthInputValidator.emailIsValid("member@example.com"), "NativeAuthSplashSelfTests: email validation contract drifted.")
        precondition(!NativeAuthInputValidator.canSubmit(mode: .signup, name: "A", email: "bad", password: "12345"), "NativeAuthSplashSelfTests: invalid signup should stay blocked.")
        precondition(NativeAuthInputValidator.submitValidationMessage(mode: .signup).contains("at least 6 characters"), "NativeAuthSplashSelfTests: signup validation copy drifted.")
        precondition(NativeAuthRouteContract.storageKeys.contains("bytspot_auth_token"), "NativeAuthSplashSelfTests: React auth token storage key guard missing.")
        precondition(NativeAuthRouteContract.passwordRecoveryRoutes.contains("/#/forgot-password"), "NativeAuthSplashSelfTests: password recovery route guard missing.")
        precondition(NativeAuthDataAPI.signupInput(email: "  USER@Example.com ", password: "12345678", name: " Ada ", ref: " ab12 ")["ref"] as? String == "AB12", "NativeAuthSplashSelfTests: signup invite ref normalization drifted.")
        precondition(NativeAuthDataAPI.loginInput(email: "  user@example.com ", password: "pw")["email"] as? String == "user@example.com", "NativeAuthSplashSelfTests: login email trimming drifted.")
    }

    private static func assertPreviewHooksAreDeterministic() {
        precondition(NativeAuthLaunchContract.requestedAuthMode == .signup || NativeAuthLaunchContract.requestedAuthMode == .login, "NativeAuthSplashSelfTests: preview auth mode must be deterministic.")
        precondition(NativeAuthLaunchContract.bypassesLaunchFlowForPreview == (ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_PROFILE"] != nil || ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_TAB"] != nil || ProcessInfo.processInfo.environment["BYT_NATIVE_PROFILE_PANEL_SMOKE"] != nil), "NativeAuthSplashSelfTests: launch bypass hooks drifted.")
    }
}
#endif
