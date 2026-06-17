import Foundation

#if DEBUG
/// DEBUG-only native migration guard for the Apple/Google auth adapter seam.
/// The project does not currently define an XCTest App target, so these run only
/// when the opt-in SwiftUI root is explicitly enabled via BYT_NATIVE_ROOT=1.
@MainActor
enum NativeAuthSeamSelfTests {
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
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        Task { await run() }
    }

    private static func run() async {
        await assertAppleSuccessWiresSessionToken()
        await assertGoogleSuccessWiresSessionToken()
        await assertAdapterFailureKeepsSessionSignedOut()
    }

    private static func assertAppleSuccessWiresSessionToken() async {
        let store = BytspotSessionStore()
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: SuccessAppleAdapter(), googleAdapter: FailingGoogleAdapter())
        coordinator.handle(.signIn(.apple), sessionStore: store)
        await waitFor { store.token == "selftest_apple_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Apple success did not authenticate the session.")
        precondition(coordinator.status == .signedIn(provider: .apple, displayName: "Apple Self-Test"), "NativeAuthSeamSelfTests: Apple success status drifted.")
        store.signOut()
    }

    private static func assertGoogleSuccessWiresSessionToken() async {
        let store = BytspotSessionStore()
        store.signOut()
        let coordinator = NativeAuthCoordinator(appleAdapter: FailingAppleAdapter(), googleAdapter: SuccessGoogleAdapter())
        coordinator.handle(.signIn(.google), sessionStore: store)
        await waitFor { store.token == "selftest_google_token" }
        precondition(store.isAuthenticated, "NativeAuthSeamSelfTests: Google success did not authenticate the session.")
        precondition(coordinator.status == .signedIn(provider: .google, displayName: "Google Self-Test"), "NativeAuthSeamSelfTests: Google success status drifted.")
        store.signOut()
    }

    private static func assertAdapterFailureKeepsSessionSignedOut() async {
        let store = BytspotSessionStore()
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

    private static func waitFor(_ predicate: @MainActor @escaping () -> Bool) async {
        for _ in 0..<20 {
            if predicate() { return }
            await Task.yield()
        }
    }
}
#endif
