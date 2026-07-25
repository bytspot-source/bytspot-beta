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
}

enum NativeAuthIntent: Equatable {
    case signIn(NativeAuthProvider)
    case continueAsGuest
    case signOut
}

struct NativeAuthAdapterResult: Equatable {
    let provider: NativeAuthProvider
    let token: String
    let displayName: String?
}

enum NativeAuthAdapterError: Error, Equatable {
    case requiresLegacyFallback(provider: NativeAuthProvider)
    case mockedFailure(provider: NativeAuthProvider)

    var status: NativeAuthStatus {
        switch self {
        case .requiresLegacyFallback(let provider): return .requiresLegacyFallback(provider: provider)
        case .mockedFailure(let provider): return .failed(message: "DEBUG mock \(provider.title) failure.")
        }
    }
}

@MainActor
protocol AppleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult
}

@MainActor
protocol GoogleAuthAdapter {
    func signIn() async throws -> NativeAuthAdapterResult
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
        case .ready: return "Native session is ready."
        case .authenticating(let provider): return "Preparing \(provider.title) through the native adapter seam."
        case .requiresLegacyFallback(let provider): return "\(provider.title) is not configured for native production on this build."
        case .signedIn(let provider, let displayName): return "DEBUG \(provider.title) mock signed in\(displayName.map { " as \($0)" } ?? "")."
        case .guest: return "Guest session enabled for native migration preview."
        case .signedOut: return "Signed out locally."
        case .failed(let message): return message
        }
    }
}

@MainActor
final class NativeAuthCoordinator: ObservableObject {
    @Published private(set) var status: NativeAuthStatus = .ready
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

    func handle(_ intent: NativeAuthIntent, sessionStore: BytspotSessionStore) {
        switch intent {
        case .signIn(let provider):
            status = .authenticating(provider: provider)
            Task { await signIn(provider: provider, sessionStore: sessionStore) }
        case .continueAsGuest:
            sessionStore.continueAsGuest()
            status = .guest
        case .signOut:
            sessionStore.signOut()
            status = .signedOut
        }
    }

    #if DEBUG
    func runDebugAutorunIfRequested(sessionStore: BytspotSessionStore) {
        guard !didRunDebugAutorun, NativeMigrationConfig.isNativeRootEnabled else { return }
        guard let rawProvider = ProcessInfo.processInfo.environment[NativeMigrationConfig.authAutorunEnvironmentKey]?.lowercased(),
              let provider = NativeAuthProvider(rawValue: rawProvider) else { return }
        didRunDebugAutorun = true
        handle(.signIn(provider), sessionStore: sessionStore)
    }
    #endif

    private func signIn(provider: NativeAuthProvider, sessionStore: BytspotSessionStore) async {
        do {
            let result: NativeAuthAdapterResult
            switch provider {
            case .apple: result = try await appleAdapter.signIn()
            case .google: result = try await googleAdapter.signIn()
            }
            sessionStore.updateToken(result.token)
            status = .signedIn(provider: provider, displayName: result.displayName)
        } catch let error as NativeAuthAdapterError {
            status = error.status
        } catch {
            status = .failed(message: "Native auth adapter failed. Use email sign-in or try again later.")
        }
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
        guard let presentingViewController = Self.presentingViewController() else {
            throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
        }
        try Self.configureIfNeeded()
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)
        let user = try await Self.refreshedUser(result.user)
        guard let idToken = user.idToken?.tokenString, !idToken.isEmpty else {
            throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
        }
        let response = try await NativeAuthDataAPI(client: BytspotAPIClient()).googleSignIn(idToken: idToken)
        guard let token = response.token, !token.isEmpty else {
            throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
        }
        return NativeAuthAdapterResult(provider: .google, token: token, displayName: response.user?.name ?? user.profile?.name)
    }

    private static func configureIfNeeded() throws {
        guard let clientID = googleServiceString("CLIENT_ID") else {
            throw NativeAuthAdapterError.requiresLegacyFallback(provider: .google)
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
    private var continuation: CheckedContinuation<NativeAuthAdapterResult, Error>?

    func signIn() async throws -> NativeAuthAdapterResult {
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
            finish(.failure(NativeAuthAdapterError.requiresLegacyFallback(provider: .apple)))
            return
        }
        let displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                let api = NativeAuthDataAPI(client: BytspotAPIClient())
                let response = try await api.appleSignIn(identityToken: identityToken, email: credential.email, name: displayName.isEmpty ? nil : displayName)
                guard let token = response.token, !token.isEmpty else { throw NativeAuthAdapterError.requiresLegacyFallback(provider: .apple) }
                finish(.success(NativeAuthAdapterResult(provider: .apple, token: token, displayName: response.user?.name ?? (displayName.isEmpty ? nil : displayName))))
            } catch {
                finish(.failure(error))
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish(.failure(error))
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = (scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene) ?? scenes.first as? UIWindowScene
        return windowScene?.keyWindow ?? windowScene?.windows.first ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<NativeAuthAdapterResult, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        switch result {
        case .success(let value): continuation.resume(returning: value)
        case .failure(let error): continuation.resume(throwing: error)
        }
    }
}

#if DEBUG
private struct DebugMockAppleAuthAdapter: AppleAuthAdapter {
    let mode: String

    func signIn() async throws -> NativeAuthAdapterResult {
        if mode == "apple_error" || mode == "error" { throw NativeAuthAdapterError.mockedFailure(provider: .apple) }
        return NativeAuthAdapterResult(provider: .apple, token: "debug_apple_native_auth_token", displayName: "Apple Preview")
    }
}

private struct DebugMockGoogleAuthAdapter: GoogleAuthAdapter {
    let mode: String

    func signIn() async throws -> NativeAuthAdapterResult {
        if mode == "google_error" || mode == "error" { throw NativeAuthAdapterError.mockedFailure(provider: .google) }
        return NativeAuthAdapterResult(provider: .google, token: "debug_google_native_auth_token", displayName: "Google Preview")
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
