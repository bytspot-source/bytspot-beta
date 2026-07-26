import Foundation
import Security

#if DEBUG
/// DEBUG-only native migration guard for the Apple/Google auth adapter seam.
/// The project does not currently define an XCTest App target, so these run only
/// when the opt-in SwiftUI root is explicitly enabled via BYT_NATIVE_ROOT=1.
@MainActor
enum NativeAuthSeamSelfTests {
    private static var didScheduleRun = false

    private struct SuccessAppleAdapter: AppleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .apple, token: "selftest_apple_token", displayName: "Apple Self-Test")
        }
    }

    private struct SuccessGoogleAdapter: GoogleAuthAdapter {
        func signIn() async throws -> NativeAuthAdapterResult {
            NativeAuthAdapterResult(provider: .google, token: "selftest_google_token", displayName: "Google Self-Test")
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
        let verifyDurableRestore = canRoundTripKeychain()
        await assertAppleSuccessWiresSessionToken(verifyDurableRestore: verifyDurableRestore)
        await assertGoogleSuccessWiresSessionToken(verifyDurableRestore: verifyDurableRestore)
        await assertAdapterFailureKeepsSessionSignedOut(verifyDurableRestore: verifyDurableRestore)
    }

    private static func assertAppleSuccessWiresSessionToken(verifyDurableRestore: Bool) async {
        let store = isolatedStore(account: "apple")
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: SuccessAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        coordinator.handle(.signIn(.apple), sessionStore: store)
        await waitFor { store.token == "selftest_apple_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Apple success did not authenticate the session.")
        if verifyDurableRestore { precondition(restoredToken(account: "apple") == "selftest_apple_token", "NativeAuthSeamSelfTests: Apple success did not persist through keychain reload.") }
        precondition(coordinator.status == .signedIn(provider: .apple, displayName: "Apple Self-Test"), "NativeAuthSeamSelfTests: Apple success status drifted.")
        store.signOut()
    }

    private static func assertGoogleSuccessWiresSessionToken(verifyDurableRestore: Bool) async {
        let store = isolatedStore(account: "google")
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: SuccessGoogleAdapter())
        coordinator.handle(.signIn(.google), sessionStore: store)
        await waitFor { store.token == "selftest_google_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Google success did not authenticate the session.")
        if verifyDurableRestore { precondition(restoredToken(account: "google") == "selftest_google_token", "NativeAuthSeamSelfTests: Google success did not persist through keychain reload.") }
        precondition(coordinator.status == .signedIn(provider: .google, displayName: "Google Self-Test"), "NativeAuthSeamSelfTests: Google success status drifted.")
        store.signOut()
    }

    private static func assertAdapterFailureKeepsSessionSignedOut(verifyDurableRestore: Bool) async {
        let store = isolatedStore(account: "failure")
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        coordinator.handle(.signIn(.apple), sessionStore: store)
        await waitFor {
            if case .failed = coordinator.status { return true }
            return false
        }
        precondition(store.token == nil, "NativeAuthSeamSelfTests: failing adapter unexpectedly wrote a session token.")
        if verifyDurableRestore { precondition(restoredToken(account: "failure") == nil, "NativeAuthSeamSelfTests: failing adapter unexpectedly persisted a session token.") }
        store.signOut()
    }

    private static func canRoundTripKeychain() -> Bool {
        let account = "native_auth_selftest_probe_\(UUID().uuidString)"
        let service = "com.bytspot.native-auth-selftests"
        let data = Data("probe".utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        var item = query
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

    private static func isolatedStore(account: String) -> BytspotSessionStore {
        BytspotSessionStore(account: "native_auth_selftest_\(account)", service: "com.bytspot.native-auth-selftests")
    }

    private static func restoredToken(account: String) -> String? {
        let store = isolatedStore(account: account)
        store.reloadFromKeychain()
        return store.token
    }

    private static func waitFor(_ predicate: @MainActor @escaping () -> Bool) async {
        for _ in 0..<20 {
            if predicate() { return }
            await Task.yield()
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
        precondition(NativeAuthLaunchContract.appFlow == ["splash", "landing", "vibe", "walk", "crew", "atlanta", "main"], "NativeAuthSplashSelfTests: App flow drifted from launch personalization source-of-truth.")
        precondition(NativeAuthLaunchContract.reactSources.contains("SplashScreen.tsx"), "NativeAuthSplashSelfTests: missing SplashScreen source guard.")
        precondition(NativeAuthLaunchContract.reactSources.contains("App.tsx onboarding quiz"), "NativeAuthSplashSelfTests: missing App.tsx onboarding quiz source guard.")
        precondition(NativeAuthLaunchContract.reactSources.contains("AuthenticationFlow.tsx"), "NativeAuthSplashSelfTests: missing auth source guard.")
        precondition(NativeAuthLaunchContract.splashDurationSeconds == 1.8, "NativeAuthSplashSelfTests: splash timing must mirror approved native premium-minimal intro.")
        precondition(NativeAuthLaunchContract.landingHeadline == "Know Before You Go.", "NativeAuthSplashSelfTests: landing headline drifted.")
        precondition(NativeAuthLaunchContract.vibeQuestion == "What kind of night are we shaping?", "NativeAuthSplashSelfTests: vibe question drifted.")
        precondition(NativeAuthLaunchContract.walkOptions == ["📍 Right nearby", "🚶 A short walk", "🚗 Easy arrival", "🗺️ Show me a hidden gem"], "NativeAuthSplashSelfTests: walk options drifted.")
        precondition(NativeAuthLaunchContract.atlantaHeadline == "Recommended for you", "NativeAuthSplashSelfTests: picks preview headline drifted.")
        precondition(NativeAuthLaunchContract.atlantaPicks.contains("Midtown Smart Parking") && !NativeAuthLaunchContract.atlantaPicks.contains("Ladybird Grove & Mess Hall"), "NativeAuthSplashSelfTests: Atlanta pick fixture must stay venue-backed, not legacy hardcoded restaurants.")
        precondition(NativeLaunchPersonalizationStorage.vibeKey == "bytspot_native_launch_vibe", "NativeAuthSplashSelfTests: launch vibe storage key drifted.")
        precondition(NativeLaunchPersonalizationStorage.token(for: "🍸 Keep the night going") == "drinks", "NativeAuthSplashSelfTests: launch vibe token normalization drifted.")
        precondition(NativeLaunchPersonalizationStorage.token(for: "🚶 A short walk") == "close", "NativeAuthSplashSelfTests: launch walk token normalization drifted.")
        precondition(ProcessInfo.processInfo.environment["BYT_NATIVE_LAUNCH_AUTORUN"] == nil || NativeAuthLaunchContract.autoRunsLaunchJourney, "NativeAuthSplashSelfTests: launch autorun hook drifted.")
    }

    private static func assertAuthRouteContractsAreNativeOnly() {
        precondition(NativeAuthLaunchContract.authRoutes == ["auth.signup", "auth.login", "auth.googleSignIn", "auth.appleSignIn"], "NativeAuthSplashSelfTests: auth route list drifted.")
        precondition(NativeAuthLaunchContract.authModes == ["signup", "login"], "NativeAuthSplashSelfTests: auth modes drifted.")
        precondition(NativeAuthLaunchContract.signupPasswordMinimum == 8, "NativeAuthSplashSelfTests: native signup password minimum must stay strict at 8.")
        precondition(NativeAuthLaunchContract.reactSignupPasswordMinimum == 6, "NativeAuthSplashSelfTests: React mismatch marker drifted; re-audit AuthenticationFlow.tsx.")
        precondition(NativeAuthInputValidator.emailIsValid("member@example.com"), "NativeAuthSplashSelfTests: email validation contract drifted.")
        precondition(!NativeAuthInputValidator.canSubmit(mode: .signup, name: "A", email: "bad", password: "1234567"), "NativeAuthSplashSelfTests: invalid signup should stay blocked.")
        precondition(NativeAuthInputValidator.submitValidationMessage(mode: .signup).contains("at least 8 characters"), "NativeAuthSplashSelfTests: signup validation copy drifted.")
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
