import UIKit
import SwiftUI
import GoogleSignIn
import UserNotifications

@UIApplicationMain
@MainActor
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    /// Process-wide setup only. The window belongs to the scene: under the
    /// scene lifecycle iOS routes cold-start URLs, activities and notification
    /// taps through `UIScene.ConnectionOptions`, not `launchOptions`, so
    /// nothing here may publish a route or the arrival fires twice.
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NativePushService.shared.configure(delegate: self)
        BytspotDiagnostics.shared.start()
        UserDefaults.standard.removeObject(forKey: NativeHomeVibeCard.dismissedKey)
        return true
    }

}

// MARK: - Scene lifecycle

/// Owns the single window. iOS 27 requires scene adoption at runtime for apps
/// linked against its SDK: an app-delegate window trapped on launch with
/// "UIScene life cycle is required for apps built with this SDK" before the
/// first frame, so the app could not open at all on that runtime.
@MainActor
final class BytspotSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    let lifecycle = NativeSceneLifecycle()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let appWindow = UIWindow(windowScene: windowScene)
        // App Store release invariant: the app is pure native SwiftUI — no
        // Capacitor/React webview. The SwiftUI shell is the unconditional root.
        lifecycle.update(NativeSceneLifecycle.phase(for: windowScene.activationState))
        appWindow.rootViewController = UIHostingController(rootView: NativeScenePhaseRoot(lifecycle: lifecycle, content: BytspotNativeAppRoot()))
        appWindow.makeKeyAndVisible()
        window = appWindow
        // Cold start: the launch URL, universal link or notification tap that
        // opened the app arrives here, and is buffered by the URL center until
        // the SwiftUI coordinator is listening.
        NativeLaunchRouting.publishColdStart(connectionOptions)
    }

    func sceneWillEnterForeground(_ scene: UIScene) { lifecycle.update(.inactive) }
    func sceneDidBecomeActive(_ scene: UIScene) { lifecycle.update(.active) }
    func sceneWillResignActive(_ scene: UIScene) { lifecycle.update(.inactive) }
    func sceneDidEnterBackground(_ scene: UIScene) { lifecycle.update(.background) }
    func sceneDidDisconnect(_ scene: UIScene) { lifecycle.update(.background) }

    /// Custom-scheme deep links (bytspot://…) while already running.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        NativeLaunchRouting.publish(openedURLs: URLContexts.map(\.url))
    }

    /// Universal Links (https://bytspot.app/…) while already running.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        NativeLaunchRouting.publish(userActivities: [userActivity])
    }
}

/// UIKit owns this app's scenes, so its delegate must supply SwiftUI's phase.
/// Each window keeps its own state; no process-wide "any scene is active" rule
/// may expose a private pass in a different, inactive scene.
@MainActor
final class NativeSceneLifecycle: ObservableObject {
    @Published private(set) var phase: ScenePhase

    init(activationState: UIScene.ActivationState = .unattached) {
        phase = Self.phase(for: activationState)
    }

    static func phase(for activationState: UIScene.ActivationState) -> ScenePhase {
        switch activationState {
        case .foregroundActive: return .active
        case .foregroundInactive: return .inactive
        case .background, .unattached: return .background
        @unknown default: return .background
        }
    }

    func update(_ newPhase: ScenePhase) {
        guard phase != newPhase else { return }
        phase = newPhase
    }
}

/// Observe phase without replacing the hosting controller or resetting the
/// root's StateObjects, navigation, forms or account-scoped presentation state.
struct NativeScenePhaseRoot<Content: View>: View {
    @ObservedObject var lifecycle: NativeSceneLifecycle
    let content: Content

    var body: some View {
        content.environment(\.scenePhase, lifecycle.phase)
    }
}

// MARK: - Launch routing

/// One place where every arrival — deep link, universal link, notification tap,
/// cold or warm — becomes a published route. Values rather than
/// `UIScene.ConnectionOptions` so each entry point is directly testable;
/// `ConnectionOptions` cannot be constructed outside UIKit.
@MainActor
enum NativeLaunchRouting {
    /// Google Sign-In consumes its own callback URL and it must never reach the
    /// route pipeline. Injectable so tests can prove that without a configured
    /// client.
    static var handleExternalSignIn: (URL) -> Bool = { GIDSignIn.sharedInstance.handle($0) }

    static func publishColdStart(_ connectionOptions: UIScene.ConnectionOptions) {
        publish(openedURLs: connectionOptions.urlContexts.map(\.url),
                userActivities: Array(connectionOptions.userActivities),
                notificationPayload: connectionOptions.notificationResponse?.notification.request.content.userInfo)
    }

    static func publish(openedURLs: [URL] = [], userActivities: [NSUserActivity] = [],
                        notificationPayload: [AnyHashable: Any]? = nil) {
        for url in openedURLs {
            guard !handleExternalSignIn(url) else { continue }
            // Deep links route through the native incoming-URL pipeline
            // consumed by the SwiftUI navigation coordinator.
            NativeIncomingURLCenter.publish(url, scanSource: .deepLink)
        }
        for activity in userActivities {
            guard let url = activity.webpageURL else { continue }
            // Universal links route through the same pipeline as deep links
            // and in-app patch scans.
            NativeIncomingURLCenter.publish(url, scanSource: .universalLink)
        }
        if let notificationPayload {
            NativePushService.publishRoute(from: notificationPayload)
        }
    }
}

// MARK: - Native APNs push

extension AppDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NativePushService.shared.didReceiveDeviceToken(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Do not log provider or device details. Users can retry from settings.
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        NativePushService.publishRoute(from: response.notification.request.content.userInfo)
        completionHandler()
    }
}

/// Allows notification-tap navigation only to an explicit Bytspot route.
enum NativePushURLPolicy {
    private static let allowedCustomHosts: Set<String> = [
        "map", "discover", "venue", "v", "concierge", "profile", "access",
        "party", "booking", "privacy", "terms", "disclaimer", "patch", "p", "clip", "requests", "plan", "feedback"
    ]

    static func routeURL(from payload: [AnyHashable: Any]) -> URL? {
        for key in ["deepLink", "url"] {
            if let value = payload[key] as? String, let url = allowedURL(value) { return url }
        }
        return nil
    }

    static func allowedURL(_ rawValue: String) -> URL? {
        let candidate = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.isEmpty,
              let url = URL(string: candidate),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil else { return nil }
        switch components.scheme?.lowercased() {
        case "https":
            guard components.host?.lowercased() == "bytspot.app", components.port == nil else { return nil }
            return url
        case "bytspot":
            guard let host = components.host?.lowercased(), allowedCustomHosts.contains(host) else { return nil }
            return url
        default:
            return nil
        }
    }
}

private enum NativePushTokenPolicy {
    static func normalized(_ rawValue: String) -> String? {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard value.count == 64, value.allSatisfy({ $0.isHexDigit }) else { return nil }
        return value
    }

    static func normalized(_ data: Data) -> String? {
        guard data.count == 32 else { return nil }
        return normalized(data.map { String(format: "%02x", $0) }.joined())
    }
}

enum NativePushSystemAlertStatus: Equatable {
    case notDetermined, enabled, denied, restricted

    var title: String {
        switch self {
        case .notDetermined: return "System Alerts Not Enabled"
        case .enabled: return "System Alerts Enabled"
        case .denied: return "System Alerts Blocked"
        case .restricted: return "System Alerts Restricted"
        }
    }

    var subtitle: String {
        switch self {
        case .notDetermined: return "Enable iOS alerts before Bytspot can deliver push updates."
        case .enabled: return "iOS alerts are enabled for this device."
        case .denied: return "Enable Notifications for Bytspot in iOS Settings to receive push updates."
        case .restricted: return "Notifications are restricted by this device's system policy."
        }
    }

    var actionTitle: String {
        switch self {
        case .notDetermined: return "Enable System Alerts"
        case .enabled: return "Refresh System Alerts"
        case .denied, .restricted: return "Open iOS Notification Settings"
        }
    }
}

@MainActor
final class NativePushService: NSObject, ObservableObject {
    static let shared = NativePushService()
    static let tokenDidChangeNotification = Notification.Name("BytspotNativePushTokenDidChange")
    private static let storedTokenKey = "bytspot_apns_device_token"

    @Published private(set) var systemAlertStatus: NativePushSystemAlertStatus = .notDetermined
    @Published private(set) var isRequestingAuthorization = false
    @Published private(set) var reminderPromptVisible = false
    @Published private(set) var reminderPromptMoment: NativeReminderPromptMoment = .commitment
    private var lastSyncedRegistrationKey: String?

    func configure(delegate: UNUserNotificationCenterDelegate) {
        UNUserNotificationCenter.current().delegate = delegate
    }

    /// Refreshes system state without prompting. Re-registering when already
    /// authorized lets APNs deliver a current token after relaunch or rotation.
    func refreshAuthorizationStatus() async {
        systemAlertStatus = Self.status(from: await UNUserNotificationCenter.current().notificationSettings().authorizationStatus)
        if systemAlertStatus == .enabled { await UIApplication.shared.registerForRemoteNotifications() }
    }

    /// Invoked only by the explicit notification-settings action.
    func requestAuthorizationFromUser() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            isRequestingAuthorization = true
            _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
            isRequestingAuthorization = false
            await refreshAuthorizationStatus()
        case .authorized, .provisional, .ephemeral:
            systemAlertStatus = .enabled
            await UIApplication.shared.registerForRemoteNotifications()
        case .denied:
            systemAlertStatus = Self.status(from: settings.authorizationStatus)
            if let settingsURL = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(settingsURL) }
        @unknown default:
            systemAlertStatus = .restricted
        }
    }

    func didReceiveDeviceToken(_ data: Data) {
        guard let token = NativePushTokenPolicy.normalized(data) else { return }
        UserDefaults.standard.set(token, forKey: Self.storedTokenKey)
        lastSyncedRegistrationKey = nil
        NotificationCenter.default.post(name: Self.tokenDidChangeNotification, object: nil)
    }

    /// The contextual reminder card. Called after a signed-in Plan add, RSVP,
    /// ticket checkout, party publish, confirmed check-in, or once after sign-in;
    /// the policy keeps it to undecided devices and a 7-day cooldown.
    func offerReminderPrompt(signedIn: Bool, moment: NativeReminderPromptMoment = .commitment) async {
        guard signedIn, !reminderPromptVisible else { return }
        systemAlertStatus = Self.status(from: await UNUserNotificationCenter.current().notificationSettings().authorizationStatus)
        guard !reminderPromptVisible,
              NativeReminderPermissionPolicy.shouldOffer(moment, status: systemAlertStatus, signedIn: signedIn,
                  declinedAt: NativeReminderPermissionPolicy.declinedAt(),
                  signInOffered: NativeReminderPermissionPolicy.signInOffered()) else { return }
        if moment == .signIn { NativeReminderPermissionPolicy.recordSignInOffered() }
        reminderPromptMoment = moment
        reminderPromptVisible = true
    }

    func acceptReminderPrompt() async {
        reminderPromptVisible = false
        await requestAuthorizationFromUser()
    }

    func declineReminderPrompt() {
        reminderPromptVisible = false
        NativeReminderPermissionPolicy.recordDecline()
    }

    #if DEBUG
    func debugShowReminderPrompt() { reminderPromptVisible = true }
    #endif

    /// Registers only with an authenticated session.
    func reconcile(sessionToken: String?) async {
        guard let sessionToken, !sessionToken.isEmpty, sessionToken != "guest_session",
              let token = persistedToken,
              systemAlertStatus == .enabled else { return }
        let key = "\(sessionToken)|\(token)"
        guard key != lastSyncedRegistrationKey,
              let registration = NativePushDeviceRegistration.production(token: token) else { return }
        do {
            try await NativePushDeviceAPI(client: BytspotAPIClient(tokenProvider: { sessionToken })).register(registration)
            lastSyncedRegistrationKey = key
        } catch {
            // Keep the token so a later authenticated lifecycle can retry.
        }
    }

    /// Sign-out: this device stops receiving the ending account's pushes. The
    /// token stays stored so the next sign-in registers it again.
    func unregister(sessionToken: String) async {
        lastSyncedRegistrationKey = nil
        guard let token = persistedToken else { return }
        try? await NativePushDeviceAPI(client: BytspotAPIClient(tokenProvider: { sessionToken })).unregister(token: token)
    }

    private var persistedToken: String? {
        UserDefaults.standard.string(forKey: Self.storedTokenKey).flatMap(NativePushTokenPolicy.normalized)
    }

    private static func status(from authorizationStatus: UNAuthorizationStatus) -> NativePushSystemAlertStatus {
        switch authorizationStatus {
        case .notDetermined: return .notDetermined
        case .authorized, .provisional, .ephemeral: return .enabled
        case .denied: return .denied
        @unknown default: return .restricted
        }
    }

    nonisolated static func normalizedToken(_ rawValue: String) -> String? { NativePushTokenPolicy.normalized(rawValue) }
    nonisolated static func normalizedToken(_ data: Data) -> String? { NativePushTokenPolicy.normalized(data) }

    static func publishRoute(from payload: [AnyHashable: Any]) {
        guard let url = NativePushURLPolicy.routeURL(from: payload) else { return }
        let source: NativePatchScanSource = url.scheme?.lowercased() == "bytspot" ? .deepLink : .universalLink
        NativeIncomingURLCenter.publish(url, scanSource: source)
    }
}

// MARK: - BytspotTier (App-target mirror)
// File-scoped duplicate of the Clip-target BytspotTier so the native patch
// experience can route + theme independently of the Clip bundle.
// Keep cases/detect/eyebrow/defaultSubtitle in sync with
// ios/App/Clip/ClipPatchVerifier.swift.
enum BytspotTier: String, Equatable, CaseIterable, Codable {
    case black
    case platinum
    case green

    var eyebrow: String {
        switch self {
        case .black: return "BYTSPOT BLACK"
        case .platinum: return "BYTSPOT PLATINUM"
        case .green: return "BYTSPOT GREEN"
        }
    }

    var displayName: String {
        switch self {
        case .black: return "Black"
        case .platinum: return "Platinum"
        case .green: return "Green"
        }
    }

    var defaultSubtitle: String {
        switch self {
        case .black: return "Curated ultra-luxury experiences. Verified by tap."
        case .platinum: return "Trusted local providers. Reserve and verify with one tap."
        case .green: return "Neighborhood services from your community. Tap to support."
        }
    }

    /// The tier the link itself codes, or nil when it carries none.
    static func detectIfCoded(url: URL?, patchId: String?) -> BytspotTier? {
        if let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            let items = components.queryItems ?? []
            if let raw = items.first(where: { ["tier", "scanner"].contains($0.name.lowercased()) })?.value,
               let tier = BytspotTier(rawValue: raw.lowercased()) {
                return tier
            }
            if let invite = items.first(where: { $0.name.lowercased() == "invite" })?.value?.uppercased() {
                if invite.hasPrefix("BLACK-") { return .black }
                if invite.hasPrefix("PLATINUM-") { return .platinum }
                if invite.hasPrefix("GREEN-") { return .green }
            }
            let parts = components.path.split(separator: "/").map { $0.lowercased() }
            if parts.count >= 2 {
                let first = parts[0], second = parts[1]
                if first == "p" || first == "patch" {
                    if second.hasPrefix("black-") { return .black }
                    if second.hasPrefix("platinum-") { return .platinum }
                    if second.hasPrefix("green-") { return .green }
                }
                if first == "black" { return .black }
                if first == "platinum" { return .platinum }
                if first == "green" { return .green }
            }
        }
        if let patchId, let tier = Self.codedTier(patchId) { return tier }
        return nil
    }

    static func detect(url: URL?, patchId: String?) -> BytspotTier {
        detectIfCoded(url: url, patchId: patchId) ?? .black
    }

    /// Tokens that code this tier inside a patch identifier.
    var codeTokens: [String] {
        switch self {
        case .black: return ["BLACK", "B"]
        case .platinum: return ["PLATINUM", "P"]
        case .green: return ["GREEN", "G"]
        }
    }

    /// Single tier-coding contract for patch identifiers, matching the Clip.
    /// A patch id is separator-delimited, and a tier is coded by its first or
    /// last segment or a `BYT-<token>-` batch prefix, so an identifier that
    /// merely ends in those letters is no longer mistaken for a tier marker.
    static func codedTier(_ value: String) -> BytspotTier? {
        let segments = value.uppercased()
            .split(whereSeparator: { $0 == "-" || $0 == "_" || $0 == "." })
            .map(String.init)
        guard let first = segments.first, let last = segments.last else { return nil }
        for tier in [BytspotTier.black, .platinum, .green] {
            let tokens = tier.codeTokens
            if tokens.contains(first) || tokens.contains(last) { return tier }
            if segments.count >= 2, first == "BYT", tokens.contains(segments[1]) { return tier }
        }
        return nil
    }
}
