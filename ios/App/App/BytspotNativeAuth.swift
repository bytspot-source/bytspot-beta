import Foundation
import AuthenticationServices
import UIKit
import GoogleSignIn

enum NativeAuthProvider: String, CaseIterable, Identifiable {
    case apple
    case google

    var id: String { rawValue }

    var title: String {
        switch self {
        case .apple: return "Continue with Apple"
        case .google: return "Continue with Google"
        }
    }

    var systemImage: String {
        switch self {
        case .apple: return "apple.logo"
        case .google: return "person.crop.circle.badge.plus"
        }
    }

    var shortName: String {
        switch self {
        case .apple: return "Apple"
        case .google: return "Google"
        }
    }
}

enum NativeAuthIntent: Equatable {
    case signIn(NativeAuthProvider)
    case continueAsGuest
    case signOut
}

struct NativeAuthAdapterResult: Equatable {
    let provider: NativeAuthProvider
    let token: String
    let userID: String?
    let displayName: String?
    /// True when this provider sign-in cancelled a pending account deletion.
    var deletionCancelled: Bool = false
    var refreshToken: String? = nil
}

enum NativeAuthAdapterError: Error, Equatable {
    case requiresLegacyFallback(provider: NativeAuthProvider)
    case appleProviderFailed
    case appleBackendVerificationFailed
    case googleConfigurationUnavailable
    case googleProviderFailed
    case googleBackendVerificationFailed
    case accountConflict(provider: NativeAuthProvider)
    /// The email's account was sent a code; entering it adds this provider.
    case linkRequired(NativeProviderLinkChallenge)
    case tooManyAttempts
    case accountSuspended
    case mockedFailure(provider: NativeAuthProvider)

    var status: NativeAuthStatus {
        switch self {
        case .requiresLegacyFallback(let provider): return .requiresLegacyFallback(provider: provider)
        case .appleProviderFailed:
            return .failed(message: "Apple Sign-In didn't complete. Confirm your Apple Account in Settings, then try again.")
        case .appleBackendVerificationFailed:
            return .failed(message: "Apple confirmed your account, but Bytspot couldn't verify this sign-in. Please try again.")
        case .googleConfigurationUnavailable:
            return .failed(message: "Google Sign-In isn't configured in this app build. Use email or try again later.")
        case .googleProviderFailed:
            return .failed(message: "Google Sign-In didn't complete. Please try again.")
        case .googleBackendVerificationFailed:
            return .failed(message: "Google confirmed your account, but Bytspot couldn't verify this sign-in. Please try again.")
        case .accountConflict(let provider):
            return .failed(message: "A Bytspot account already exists for this email. Log in another way, then add \(provider.shortName) in Profile › Personal Information › Sign-in methods.")
        case .linkRequired(let link):
            return .failed(message: "Enter the code we emailed to \(link.maskedEmail) to add \(link.provider.shortName) sign-in.")
        case .tooManyAttempts:
            return .failed(message: "Too many attempts. Wait a moment and try again.")
        case .accountSuspended: return .failed(message: NativeAuthDataAPI.suspendedMessage)
        case .mockedFailure(let provider): return .failed(message: "DEBUG mock \(provider.title) failure.")
        }
    }

    /// What a refused `auth.appleSignIn` or `auth.googleSignIn` means for the member.
    static func fromBackend(_ error: Error, provider: NativeAuthProvider) -> NativeAuthAdapterError {
        if let link = NativeAuthDataAPI.linkChallenge(in: error) { return .linkRequired(link) }
        if NativeAuthDataAPI.isAccountConflict(error) { return .accountConflict(provider: provider) }
        if NativeAuthDataAPI.isAccountSuspended(error) { return .accountSuspended }
        if case let BytspotAPIClient.APIError.server(status, _) = error, status == 429 { return .tooManyAttempts }
        return provider == .apple ? .appleBackendVerificationFailed : .googleBackendVerificationFailed
    }
}

@MainActor
protocol AppleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult
    /// The provider's ID token alone, for adding this provider to the signed-in account.
    func providerIDToken() async throws -> String
}

@MainActor
protocol GoogleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult
    func providerIDToken() async throws -> String
}

extension AppleAuthAdapter {
    func providerIDToken() async throws -> String { throw NativeAuthAdapterError.requiresLegacyFallback(provider: .apple) }
}

extension GoogleAuthAdapter {
    func providerIDToken() async throws -> String { throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google) }
}

/// Runs the Apple or Google sheet for an ID token, without signing in with it.
@MainActor
enum NativeProviderIDToken {
    static func fetch(_ provider: NativeAuthProvider) async throws -> String {
        switch provider {
        case .apple: return try await NativeAuthAdapterFactory.makeAppleAdapter().providerIDToken()
        case .google: return try await NativeAuthAdapterFactory.makeGoogleAdapter().providerIDToken()
        }
    }
}

enum NativeAuthStatus: Equatable {
    case ready
    case authenticating(provider: NativeAuthProvider)
    case requiresLegacyFallback(provider: NativeAuthProvider)
    case signedIn(provider: NativeAuthProvider, displayName: String?)
    case guest
    case signedOut
    case failed(message: String)

    var message: String {
        switch self {
        case .ready: return "Ready to sign in."
        case .authenticating(let provider): return "Opening \(provider.title)."
        case .requiresLegacyFallback(let provider): return "\(provider.title) isn't available right now. Use email or try again later."
        case .signedIn(let provider, let displayName): return "Signed in with \(provider.title)\(displayName.map { " as \($0)" } ?? "")."
        case .guest: return "Browsing as guest."
        case .signedOut: return "Signed out."
        case .failed(let message): return message
        }
    }
}

/// Non-secret display identity for the signed-in member. Stored in
/// UserDefaults (never Keychain) so greeting surfaces can render a name
/// without another profile fetch; cleared on sign-out and guest sessions.
enum NativeSignedInIdentity {
    static let displayNameKey = "bytspot_signed_in_display_name"
    static let pendingWelcomeKey = "bytspot_signed_in_pending_welcome"
    static let restoredAccountKey = "bytspot_signed_in_restored_account"

    /// Signing in cancels a pending deletion server-side. Recording it here
    /// lets the next welcome say so, rather than silently undoing a deletion
    /// the member asked for.
    ///
    /// The marker stores the restored account's id, not a bare flag: on a
    /// shared device an unconsumed marker must never announce one member's
    /// restoration to the next person who signs in.
    static func recordRestoration(_ restored: Bool, userID: String?) {
        let trimmed = userID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard restored, !trimmed.isEmpty else {
            UserDefaults.standard.removeObject(forKey: restoredAccountKey)
            return
        }
        UserDefaults.standard.set(trimmed, forKey: restoredAccountKey)
    }

    static func store(displayName: String?) {
        let trimmed = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: displayNameKey)
        } else {
            UserDefaults.standard.set(trimmed, forKey: displayNameKey)
        }
        UserDefaults.standard.set(true, forKey: pendingWelcomeKey)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: displayNameKey)
        UserDefaults.standard.removeObject(forKey: pendingWelcomeKey)
        UserDefaults.standard.removeObject(forKey: restoredAccountKey)
    }

    /// One-shot: true only for the first call after a fresh sign-in.
    static func consumePendingWelcome() -> Bool {
        guard UserDefaults.standard.bool(forKey: pendingWelcomeKey) else { return false }
        UserDefaults.standard.removeObject(forKey: pendingWelcomeKey)
        return true
    }

    static var displayName: String? {
        let stored = UserDefaults.standard.string(forKey: displayNameKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return stored.isEmpty ? nil : stored
    }

    static func firstName(from displayName: String?) -> String? {
        let trimmed = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty else { return nil }
        return trimmed.split(separator: " ").first.map(String.init)
    }

    static func welcomeMessage(displayName: String?) -> String {
        guard let first = firstName(from: displayName) else { return "Welcome to Bytspot" }
        return "Welcome, \(first)"
    }

    /// One-shot: true only for the first call after the given account signed
    /// in and cancelled its own pending deletion. A marker belonging to a
    /// different account is discarded rather than shown.
    static func consumeAccountRestored(userID: String?) -> Bool {
        guard let marker = UserDefaults.standard.string(forKey: restoredAccountKey), !marker.isEmpty else { return false }
        UserDefaults.standard.removeObject(forKey: restoredAccountKey)
        let current = userID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return !current.isEmpty && marker == current
    }

    static func welcomeMessage(displayName: String?, accountRestored: Bool) -> String {
        guard accountRestored else { return welcomeMessage(displayName: displayName) }
        guard let first = firstName(from: displayName) else { return "Welcome back. Your account deletion was cancelled." }
        return "Welcome back, \(first). Your account deletion was cancelled."
    }
}

/// Removes every account-derived value this device cached, so a deleted
/// account cannot keep rendering its owner's name, email, phone, birthday or
/// vehicle plate in the signed-out shell.
///
/// The sweep is deny-by-default: everything under the `bytspot_` namespace is
/// removed except an explicit allowlist of device-scoped settings. A new
/// account-scoped key added later is therefore purged automatically, which is
/// the safe direction to fail for a deletion promise.
enum NativeAccountLocalData {
    static let namespace = "bytspot_"

    /// Belongs to the device, not the member: appearance, migration and launch
    /// gating, debug switches, and the APNs token whose server row is removed
    /// by the account cascade.
    static let deviceScopedKeys: Set<String> = [
        "bytspot_native_appearance_mode",
        "bytspot_native_root_enabled",
        "bytspot_native_launch_completed",
        "bytspot_apns_device_token",
    ]

    static func isAccountScoped(_ key: String) -> Bool {
        guard key.hasPrefix(namespace) else { return false }
        if deviceScopedKeys.contains(key) { return false }
        return !key.hasPrefix("bytspot_debug_")
    }

    @discardableResult
    static func purge(_ defaults: UserDefaults = .standard) -> Int {
        let keys = defaults.dictionaryRepresentation().keys.filter(isAccountScoped)
        for key in keys { defaults.removeObject(forKey: key) }
        return keys.count
    }
}

/// Remembers that the signed-in account's email is not yet proven, so the app
/// can offer the emailed code. Keyed by account id, so a marker left by one
/// member never shows for the next person who signs in on the same device.
@MainActor
final class NativeEmailVerificationState: ObservableObject {
    static let shared = NativeEmailVerificationState()
    static let unverifiedAccountKey = "bytspot_email_unverified_account"

    @Published private(set) var unverifiedAccountID: String?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        unverifiedAccountID = defaults.string(forKey: Self.unverifiedAccountKey)
    }

    func needsVerification(userID: String?) -> Bool {
        let current = userID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let unverifiedAccountID, !current.isEmpty else { return false }
        return unverifiedAccountID == current
    }

    /// A nil `emailVerified` comes from an older server and changes nothing.
    func record(emailVerified: Bool?, userID: String?) {
        let trimmed = userID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let emailVerified, !trimmed.isEmpty else { return }
        store(emailVerified ? nil : trimmed)
    }

    func clear() { store(nil) }

    func refresh(sessionStore: BytspotSessionStore) async {
        guard sessionStore.isAuthenticated, let token = sessionStore.token else { return }
        let api = NativeAuthDataAPI(client: BytspotAPIClient(tokenProvider: { token }))
        guard let me = try? await api.me() else { return }
        record(emailVerified: me.user?.emailVerified, userID: me.user?.id ?? sessionStore.authenticatedUserID)
    }

    private func store(_ accountID: String?) {
        if let accountID { defaults.set(accountID, forKey: Self.unverifiedAccountKey) } else { defaults.removeObject(forKey: Self.unverifiedAccountKey) }
        unverifiedAccountID = accountID
    }
}

/// Keeps a member signed in. Trades the stored refresh token for a new access
/// token shortly before the current one lapses, and again when the server
/// refuses one. Only a refusal from `auth.refresh` itself ends the session;
/// network and server errors leave it in place to try again later.
@MainActor
final class NativeSessionRenewer {
    static let shared = NativeSessionRenewer()

    weak var sessionStore: BytspotSessionStore?
    var refresh: (String) async throws -> NativeSessionRefreshResponse = { refreshToken in
        try await NativeAuthDataAPI(client: BytspotAPIClient()).refresh(refreshToken: refreshToken)
    }
    private var inFlight: Task<String?, Never>?

    /// Run at launch and on return to the foreground.
    func renewIfExpiringSoon(now: Date = Date()) async {
        guard let store = sessionStore, store.isAuthenticated, let token = store.token,
              let expiresAt = NativeSessionRenewalContract.claims(of: token).expiresAt else { return }
        if expiresAt <= now {
            _ = await renew(refusedToken: token, now: now)
        } else if expiresAt.timeIntervalSince(now) < NativeSessionRenewalContract.renewWithin, store.refreshToken != nil {
            _ = await renewOnce(store)
        }
    }

    /// After the server refused `refusedToken`. Returns the token to retry with.
    func renew(refusedToken: String, now: Date = Date()) async -> String? {
        guard let store = sessionStore, store.isAuthenticated, let current = store.token else { return nil }
        if current != refusedToken { return current }
        let claims = NativeSessionRenewalContract.claims(of: refusedToken)
        if let issuedAt = claims.issuedAt, now.timeIntervalSince(issuedAt) < NativeSessionRenewalContract.freshTokenGrace { return nil }
        guard store.refreshToken != nil else {
            // Signed in before refresh tokens existed. Only a token that has
            // visibly lapsed ends the session; any other 401 is left to the screen.
            if let expiresAt = claims.expiresAt, expiresAt <= now { store.endExpiredSession() }
            return nil
        }
        return await renewOnce(store)
    }

    /// One request at a time: a refresh token is single use, and spending it
    /// twice would revoke the sign-in.
    private func renewOnce(_ store: BytspotSessionStore) async -> String? {
        if let inFlight { return await inFlight.value }
        let refresh = self.refresh
        let task = Task { () -> String? in
            guard let refreshToken = store.refreshToken else { return nil }
            do {
                let renewed = try await refresh(refreshToken)
                return store.renewSession(token: renewed.token, refreshToken: renewed.refreshToken) ? renewed.token : nil
            } catch let BytspotAPIClient.APIError.server(status, _) where status == 401 {
                store.endExpiredSession()
                return nil
            } catch {
                return nil
            }
        }
        inFlight = task
        let renewed = await task.value
        inFlight = nil
        return renewed
    }
}

@MainActor
protocol NativeAuthSessionStoring: AnyObject {
    @discardableResult func updateToken(_ newToken: String?) -> Bool
    @discardableResult func updateSession(token: String?, userID: String?, refreshToken: String?) -> Bool
    func continueAsGuest()
    func signOut()
}

extension BytspotSessionStore: NativeAuthSessionStoring {}

@MainActor
final class NativeAuthCoordinator: ObservableObject {
    @Published private(set) var status: NativeAuthStatus = .ready
    /// Set when a provider sign-in found an existing account and emailed it a code.
    @Published private(set) var pendingLink: NativeProviderLinkChallenge?
    var confirmLinkRequest: (String, String) async throws -> NativeAuthResponse = { challengeId, code in
        try await NativeAuthDataAPI(client: BytspotAPIClient()).confirmLink(challengeId: challengeId, code: code)
    }
    private let appleAdapter: any AppleAuthAdapter
    private let googleAdapter: any GoogleAuthAdapter
    #if DEBUG
    private var didRunDebugAutorun = false
    #endif

    init() {
        self.appleAdapter = NativeAuthAdapterFactory.makeAppleAdapter()
        self.googleAdapter = NativeAuthAdapterFactory.makeGoogleAdapter()
    }

    init(appleAdapter: any AppleAuthAdapter, googleAdapter: any GoogleAuthAdapter) {
        self.appleAdapter = appleAdapter
        self.googleAdapter = googleAdapter
    }

    func handle(_ intent: NativeAuthIntent, sessionStore: any NativeAuthSessionStoring) {
        switch intent {
        case .signIn(let provider):
            status = .authenticating(provider: provider)
            Task { await signIn(provider: provider, sessionStore: sessionStore) }
        case .continueAsGuest:
            NativeSignedInIdentity.clear()
            sessionStore.continueAsGuest()
            status = .guest
        case .signOut:
            NativeSignedInIdentity.clear()
            sessionStore.signOut()
            status = .signedOut
        }
    }

    #if DEBUG
    func runDebugAutorunIfRequested(sessionStore: any NativeAuthSessionStoring) {
        guard !didRunDebugAutorun, NativeMigrationConfig.isNativeRootEnabled else { return }
        guard let rawProvider = ProcessInfo.processInfo.environment[NativeMigrationConfig.authAutorunEnvironmentKey]?.lowercased(),
              let provider = NativeAuthProvider(rawValue: rawProvider) else { return }
        didRunDebugAutorun = true
        handle(.signIn(provider), sessionStore: sessionStore)
    }
    #endif

    private func signIn(provider: NativeAuthProvider, sessionStore: any NativeAuthSessionStoring) async {
        do {
            let result: NativeAuthAdapterResult
            switch provider {
            case .apple: result = try await appleAdapter.signIn()
            case .google: result = try await googleAdapter.signIn()
            }
            if sessionStore.updateSession(token: result.token, userID: result.userID, refreshToken: result.refreshToken) {
                NativeSignedInIdentity.store(displayName: result.displayName)
                NativeSignedInIdentity.recordRestoration(result.deletionCancelled, userID: result.userID)
                NativeEmailVerificationState.shared.clear()
                status = .signedIn(provider: provider, displayName: result.displayName)
            } else {
                status = .failed(message: "We couldn't save your sign-in. Please try again.")
            }
        } catch NativeAuthAdapterError.linkRequired(let link) {
            pendingLink = link
            status = .ready
        } catch let error as NativeAuthAdapterError {
            status = error.status
        } catch {
            status = .failed(message: "We couldn't sign you in with \(provider.title). Use email or try again later.")
        }
    }

    /// Trades the emailed code for a sign-in to the existing account, which now
    /// also has this provider. Returns the message to show, or nil when signed in.
    func confirmLink(code: String, sessionStore: any NativeAuthSessionStoring) async -> String? {
        guard let link = pendingLink else { return nil }
        do {
            let response = try await confirmLinkRequest(link.challengeId, code)
            let userID = response.user?.id
            guard let token = response.token, !token.isEmpty,
                  sessionStore.updateSession(token: token, userID: userID, refreshToken: response.refreshToken) else {
                return "We couldn't save your sign-in. Please try again."
            }
            NativeSignedInIdentity.store(displayName: response.user?.name)
            NativeSignedInIdentity.recordRestoration(response.deletionCancelled == true, userID: userID)
            NativeEmailVerificationState.shared.clear()
            pendingLink = nil
            status = .signedIn(provider: link.provider, displayName: response.user?.name)
            return nil
        } catch {
            return NativeAuthDataAPI.signInMethodMessage(for: error, fallback: "We couldn't check that code. Please try again.")
        }
    }

    func cancelLink() {
        pendingLink = nil
    }
}

private struct LegacyFallbackAppleAuthAdapter: AppleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult {
        throw NativeAuthAdapterError.requiresLegacyFallback(provider: .apple)
    }
}

private struct LegacyFallbackGoogleAuthAdapter: GoogleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult {
        throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
    }
}

@MainActor
private final class NativeGoogleSignInAdapter: GoogleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult {
        let (idToken, user) = try await authorize()
        let response: NativeAuthResponse
        do {
            response = try await NativeAuthDataAPI(client: BytspotAPIClient()).googleSignIn(idToken: idToken)
        } catch {
            Self.recordGoogleBackendFailure(error)
            throw NativeAuthAdapterError.fromBackend(error, provider: .google)
        }
        guard let token = response.token, !token.isEmpty else {
            throw NativeAuthAdapterError.googleBackendVerificationFailed
        }
        return NativeAuthAdapterResult(provider: .google, token: token, userID: response.user?.id, displayName: response.user?.name ?? user.profile?.name, deletionCancelled: response.deletionCancelled == true, refreshToken: response.refreshToken)
    }

    func providerIDToken() async throws -> String {
        try await authorize().0
    }

    private func authorize() async throws -> (String, GIDGoogleUser) {
        Self.clearGoogleProviderFailure()
        guard let presentingViewController = Self.presentingViewController() else {
            throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
        }
        try Self.configureIfNeeded()
        let result: GIDSignInResult
        do {
            result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)
        } catch {
            Self.recordGoogleProviderFailure(error)
            throw NativeAuthAdapterError.googleProviderFailed
        }
        let user: GIDGoogleUser
        do {
            user = try await Self.refreshedUser(result.user)
        } catch {
            Self.recordGoogleProviderFailure(error)
            throw NativeAuthAdapterError.googleProviderFailed
        }
        guard let idToken = user.idToken?.tokenString, !idToken.isEmpty else {
            throw NativeAuthAdapterError.googleProviderFailed
        }
        return (idToken, user)
    }

    private static func configureIfNeeded() throws {
        guard let clientID = googleServiceString("CLIENT_ID") else {
            throw NativeAuthAdapterError.googleConfigurationUnavailable
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: infoString("GIDServerClientID")
        )
    }

    private static func infoString(_ key: String) -> String? {
        usable(Bundle.main.object(forInfoDictionaryKey: key) as? String)
    }

    private static func googleServiceString(_ key: String) -> String? {
        guard let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let dictionary = NSDictionary(contentsOf: url) as? [String: Any] else { return nil }
        return usable(dictionary[key] as? String)
    }

    private static func usable(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, !trimmed.hasPrefix("$(") else { return nil }
        return trimmed
    }

    private static func recordGoogleProviderFailure(_ error: Error) {
        #if DEBUG
        // Keep troubleshooting safe: persist only the provider code, never
        // tokens, account data, or the provider's error message.
        let providerError = error as NSError
        let code = providerError.code
        UserDefaults.standard.set(code, forKey: "bytspot_debug_google_provider_failure_code")
        UserDefaults.standard.set(
            providerError.domain == kGIDSignInErrorDomain,
            forKey: "bytspot_debug_google_provider_failure_is_google_domain"
        )
        #endif
    }

    private static func clearGoogleProviderFailure() {
        #if DEBUG
        UserDefaults.standard.removeObject(forKey: "bytspot_debug_google_provider_failure_code")
        UserDefaults.standard.removeObject(forKey: "bytspot_debug_google_provider_failure_is_google_domain")
        UserDefaults.standard.removeObject(forKey: "bytspot_debug_google_backend_failure_status")
        #endif
    }

    private static func recordGoogleBackendFailure(_ error: Error) {
        #if DEBUG
        let status: Int
        if case let BytspotAPIClient.APIError.server(httpStatus, _) = error {
            status = httpStatus
        } else {
            status = 0
        }
        UserDefaults.standard.set(status, forKey: "bytspot_debug_google_backend_failure_status")
        #endif
    }

    private static func refreshedUser(_ user: GIDGoogleUser) async throws -> GIDGoogleUser {
        try await withCheckedThrowingContinuation { continuation in
            user.refreshTokensIfNeeded { refreshedUser, error in
                if let error { continuation.resume(throwing: error); return }
                guard let refreshedUser else {
                    continuation.resume(throwing: NativeAuthAdapterError.requiresLegacyFallback(provider: .google))
                    return
                }
                continuation.resume(returning: refreshedUser)
            }
        }
    }

    private static func presentingViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = (scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene) ?? scenes.first as? UIWindowScene
        let root = windowScene?.keyWindow?.rootViewController ?? windowScene?.windows.first?.rootViewController
        return topViewController(from: root)
    }

    private static func topViewController(from root: UIViewController?) -> UIViewController? {
        if let navigation = root as? UINavigationController { return topViewController(from: navigation.visibleViewController) }
        if let tab = root as? UITabBarController { return topViewController(from: tab.selectedViewController) }
        if let presented = root?.presentedViewController { return topViewController(from: presented) }
        return root
    }
}

@MainActor
private final class NativeAppleSignInAdapter: NSObject, AppleAuthAdapter, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private struct Credential {
        let identityToken: String
        let email: String?
        let displayName: String?
    }

    private var continuation: CheckedContinuation<Credential, Error>?

    func signIn() async throws -> NativeAuthAdapterResult {
        let credential = try await authorize()
        let response: NativeAuthResponse
        do {
            response = try await NativeAuthDataAPI(client: BytspotAPIClient()).appleSignIn(identityToken: credential.identityToken, email: credential.email, name: credential.displayName)
        } catch {
            Self.recordAppleBackendFailure(error)
            throw NativeAuthAdapterError.fromBackend(error, provider: .apple)
        }
        guard let token = response.token, !token.isEmpty else { throw NativeAuthAdapterError.appleBackendVerificationFailed }
        return NativeAuthAdapterResult(provider: .apple, token: token, userID: response.user?.id, displayName: response.user?.name ?? credential.displayName, deletionCancelled: response.deletionCancelled == true, refreshToken: response.refreshToken)
    }

    func providerIDToken() async throws -> String {
        try await authorize().identityToken
    }

    private func authorize() async throws -> Credential {
        Self.clearAppleFailure()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            finish(.failure(NativeAuthAdapterError.appleProviderFailed))
            return
        }
        let displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        finish(.success(Credential(identityToken: identityToken, email: credential.email, displayName: displayName.isEmpty ? nil : displayName)))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        Self.recordAppleProviderFailure(error)
        finish(.failure(NativeAuthAdapterError.appleProviderFailed))
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = (scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene) ?? scenes.first as? UIWindowScene
        return windowScene?.keyWindow ?? windowScene?.windows.first ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<Credential, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        switch result {
        case .success(let value): continuation.resume(returning: value)
        case .failure(let error): continuation.resume(throwing: error)
        }
    }

    private static func clearAppleFailure() {
        #if DEBUG
        UserDefaults.standard.removeObject(forKey: "bytspot_debug_apple_provider_failure_code")
        UserDefaults.standard.removeObject(forKey: "bytspot_debug_apple_backend_failure_status")
        #endif
    }

    private static func recordAppleProviderFailure(_ error: Error) {
        #if DEBUG
        UserDefaults.standard.set((error as NSError).code, forKey: "bytspot_debug_apple_provider_failure_code")
        #endif
    }

    private static func recordAppleBackendFailure(_ error: Error) {
        #if DEBUG
        let status: Int
        if case let BytspotAPIClient.APIError.server(httpStatus, _) = error {
            status = httpStatus
        } else {
            status = 0
        }
        UserDefaults.standard.set(status, forKey: "bytspot_debug_apple_backend_failure_status")
        #endif
    }
}

#if DEBUG
private struct DebugMockAppleAuthAdapter: AppleAuthAdapter {
    let mode: String

    func signIn() async throws -> NativeAuthAdapterResult {
        if mode == "apple_error" || mode == "error" { throw NativeAuthAdapterError.mockedFailure(provider: .apple) }
        return NativeAuthAdapterResult(provider: .apple, token: "debug_apple_native_auth_token", userID: "debug-apple-user", displayName: "Apple Preview")
    }
}

private struct DebugMockGoogleAuthAdapter: GoogleAuthAdapter {
    let mode: String

    func signIn() async throws -> NativeAuthAdapterResult {
        if mode == "google_error" || mode == "error" { throw NativeAuthAdapterError.mockedFailure(provider: .google) }
        return NativeAuthAdapterResult(provider: .google, token: "debug_google_native_auth_token", userID: "debug-google-user", displayName: "Google Preview")
    }
}
#endif

private enum NativeAuthAdapterFactory {
    @MainActor
    static func makeAppleAdapter() -> any AppleAuthAdapter {
        #if DEBUG
        if NativeMigrationConfig.isNativeRootEnabled,
           let mode = ProcessInfo.processInfo.environment[NativeMigrationConfig.authMockEnvironmentKey]?.lowercased(),
           mode == "apple_success" || mode == "apple_error" || mode == "success" || mode == "error" {
            return DebugMockAppleAuthAdapter(mode: mode)
        }
        #endif
        return NativeAppleSignInAdapter()
    }

    @MainActor
    static func makeGoogleAdapter() -> any GoogleAuthAdapter {
        #if DEBUG
        if NativeMigrationConfig.isNativeRootEnabled,
           let mode = ProcessInfo.processInfo.environment[NativeMigrationConfig.authMockEnvironmentKey]?.lowercased(),
           mode == "google_success" || mode == "google_error" || mode == "success" || mode == "error" {
            return DebugMockGoogleAuthAdapter(mode: mode)
        }
        #endif
        return NativeGoogleSignInAdapter()
    }
}
