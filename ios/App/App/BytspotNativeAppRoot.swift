import SwiftUI
import UIKit

enum NativeAppearanceMode: String, CaseIterable, Identifiable {
    case system, dark, light

    static let defaultsKey = "bytspot_native_appearance_mode"
    static let environmentKey = "BYT_NATIVE_APPEARANCE"
    static let panelAutorunEnvironmentKey = "BYT_NATIVE_APPEARANCE_PANEL_AUTORUN"
    static let userSelectionNotification = Notification.Name("BytspotNativeAppearanceUserSelectionDidChange")
    static let userSelectionUserInfoKey = "mode"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "Auto"
        case .dark: return "Dark"
        case .light: return "Light"
        }
    }

    var chipTitle: String { "\(title) theme" }

    var subtitle: String {
        switch self {
        case .system: return "Follows your iPhone appearance and accessibility settings."
        case .dark: return "Keeps Bytspot in its premium night interface."
        case .light: return "Uses high-contrast daytime surfaces when available."
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .dark: return "moon.stars.fill"
        case .light: return "sun.max.fill"
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .dark: return .dark
        case .light: return .light
        }
    }

    var uiUserInterfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: return .unspecified
        case .dark: return .dark
        case .light: return .light
        }
    }

    static func resolved(raw: String?) -> NativeAppearanceMode {
        NativeAppearanceMode(rawValue: raw?.lowercased() ?? "") ?? .system
    }

    static var previewOverride: NativeAppearanceMode? {
        guard NativeMigrationConfig.isNativeRootEnabled else { return nil }
        return ProcessInfo.processInfo.environment[environmentKey].map { resolved(raw: $0) }
    }

    @MainActor static func applyWindowStyle(_ mode: NativeAppearanceMode) {
        for case let windowScene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in windowScene.windows {
                window.overrideUserInterfaceStyle = mode.uiUserInterfaceStyle
            }
        }
    }

    @MainActor static func currentWindowColorScheme() -> ColorScheme? {
        if let rawSystemStyle = UserDefaults.standard.string(forKey: "AppleInterfaceStyle")?.lowercased() {
            return rawSystemStyle.contains("dark") ? .dark : .light
        }
        #if targetEnvironment(simulator)
        return .light
        #endif
        let style = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })?
            .traitCollection.userInterfaceStyle ?? UIScreen.main.traitCollection.userInterfaceStyle
        switch style {
        case .dark: return .dark
        default: return .light
        }
    }

    static func postUserSelection(_ mode: NativeAppearanceMode) {
        NotificationCenter.default.post(name: userSelectionNotification, object: nil, userInfo: [userSelectionUserInfoKey: mode.rawValue])
    }
}

final class NativeAppearanceRuntimeStore: ObservableObject {
    @Published var selectedMode: NativeAppearanceMode?
    @Published var systemColorScheme: ColorScheme?

    @MainActor func applyUserSelection(_ mode: NativeAppearanceMode) {
        selectedMode = mode
        NativeAppearanceMode.applyWindowStyle(mode)
        systemColorScheme = mode == .system ? NativeAppearanceMode.currentWindowColorScheme() : nil
    }
}

struct BytspotNativeAppRoot: View {
    @StateObject private var sessionStore = BytspotSessionStore()
    @StateObject private var bridgeStore = NativeBridgeStore()
    @StateObject private var navigation = NativeNavigationCoordinator()
    @StateObject private var authCoordinator = NativeAuthCoordinator()
    @StateObject private var apiState = NativeAPIState()
    @StateObject private var tabContentStore = NativeTabContentStore()
    @StateObject private var membershipStore = NativeMembershipStore()
    @StateObject private var contactSyncStore = BytspotContactSyncStore()
    @StateObject private var appearanceRuntimeStore = NativeAppearanceRuntimeStore()
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue
    @AppStorage(NativeLaunchPersonalizationStorage.atmosphereKey) private var launchAtmosphere = ""
    @State private var didCompleteLaunchFlow = false

    private var effectiveAppearance: NativeAppearanceMode {
        appearanceRuntimeStore.selectedMode ?? NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw)
    }

    init() {
        #if DEBUG
        NativeAuthSeamSelfTests.runIfRequested()
        NativeAuthSplashSelfTests.runIfRequested()
        NativeJourneyThemeSelfTests.runIfRequested()
        NativePatchRouteSelfTests.runIfRequested()
        NativePatchBookingSelfTests.runIfRequested()
        NativePatchSpecialFlowSelfTests.runIfRequested()
        NativeShellThemeSelfTests.runIfRequested()
        NativeHomeParitySelfTests.runIfRequested()
        NativePostAuthIntentSelfTests.runIfRequested()
        NativeMapParitySelfTests.runIfRequested()
        NativeAccessParitySelfTests.runIfRequested()
        NativeBookingParitySelfTests.runIfRequested()
        NativeAccountParitySelfTests.runIfRequested()
        NativeDiscoverParitySelfTests.runIfRequested()
        NativeConciergeParitySelfTests.runIfRequested()
        NativePhase4TabContentSelfTests.runIfRequested()
        NativeContactSyncSelfTests.runIfRequested()
        NativeMenuParitySelfTests.runIfRequested()
        #endif
    }

    var body: some View {
        Group {
            if shouldShowLaunchFlow {
                NativeLaunchFlowView(sessionStore: sessionStore, authCoordinator: authCoordinator) { didCompleteLaunchFlow = true }
                    .preferredColorScheme(journeyPreferredColorScheme)
            } else {
                BytspotNativeShellView(bridgeStore: bridgeStore, navigation: navigation, preferHomeAfterLaunch: didCompleteLaunchFlow)
                    .preferredColorScheme(journeyPreferredColorScheme)
            }
        }
            .environmentObject(sessionStore)
            .environmentObject(authCoordinator)
            .environmentObject(apiState)
            .environmentObject(tabContentStore)
            .environmentObject(membershipStore)
            .environmentObject(contactSyncStore)
            .environmentObject(appearanceRuntimeStore)
            .onAppear {
                NativeAppearanceMode.applyWindowStyle(NativeJourneyAtmosphere(rawValue: launchAtmosphere) == .nightlight ? .dark : effectiveAppearance)
                navigation.drainPendingURLs()
                bridgeStore.injectPatchScanBridgeSmokeTestIfRequested()
            }
            .task {
                await tabContentStore.refresh(sessionStore: sessionStore)
                await membershipStore.refresh(sessionStore: sessionStore)
                await contactSyncStore.refresh(sessionStore: sessionStore)
            }
            .onChange(of: sessionStore.token ?? "") { _ in
                Task {
                    await tabContentStore.refresh(sessionStore: sessionStore)
                    await membershipStore.refresh(sessionStore: sessionStore)
                    await contactSyncStore.refresh(sessionStore: sessionStore)
                }
            }
            .onChange(of: launchAtmosphere) { _ in
                NativeAppearanceMode.applyWindowStyle(NativeJourneyAtmosphere(rawValue: launchAtmosphere) == .nightlight ? .dark : effectiveAppearance)
            }
            .onOpenURL { navigation.notifyPatchScanned(url: $0, source: .deepLink); _ = navigation.handle(url: $0) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL {
                    navigation.notifyPatchScanned(url: url, source: .universalLink)
                    _ = navigation.handle(url: url)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: NativeIncomingURLCenter.notification)) { notification in
                guard let url = notification.object as? URL else { return }
                let sourceRaw = notification.userInfo?[NativeIncomingURLCenter.scanSourceUserInfoKey] as? String
                let source = sourceRaw.flatMap(NativePatchScanSource.init(rawValue:)) ?? .universalLink
                navigation.notifyPatchScanned(url: url, source: source)
                if BytspotPatchRoute(url: url) == nil { _ = navigation.handle(url: url) }
            }
            .onReceive(NotificationCenter.default.publisher(for: NativeAppearanceMode.userSelectionNotification)) { notification in
                let selected = NativeAppearanceMode.resolved(raw: notification.userInfo?[NativeAppearanceMode.userSelectionUserInfoKey] as? String)
                appearanceRuntimeStore.applyUserSelection(selected)
            }
            .onChange(of: appearanceRaw) { _ in NativeAppearanceMode.applyWindowStyle(effectiveAppearance) }
    }

    private var journeyPreferredColorScheme: ColorScheme? {
        NativeJourneyAtmosphere(rawValue: launchAtmosphere) == .nightlight ? .dark : effectiveAppearance.preferredColorScheme
    }

    private var shouldShowLaunchFlow: Bool {
        guard NativeMigrationConfig.isNativeRootEnabled else { return false }
        if NativeAuthLaunchContract.autoRunsLaunchJourney, didCompleteLaunchFlow || sessionStore.hasSecureToken { return false }
        if NativeAuthLaunchContract.requestedLaunchStage != nil { return true }
        if didCompleteLaunchFlow || sessionStore.hasSecureToken { return false }
        if NativeAuthLaunchContract.bypassesLaunchFlowForPreview { return false }
        return true
    }
}

enum NativeAuthLaunchContract {
    static let reactSources = ["SplashScreen.tsx", "LandingPage.tsx", "AuthenticationFlow.tsx", "AppleSignInButton.tsx", "GoogleSignInButton.tsx", "PasswordRecoveryScreen.tsx", "App.tsx onboarding quiz"]
    static let appFlow = ["splash", "landing", "vibe", "walk", "crew", "atlanta", "main"]
    static let splashDurationSeconds = 1.8
    static let splashStartTitle = "Start your walkthrough"
    static let splashStartSubtitle = "Tap to follow the journey from Splash to picks."
    static let landingHeadline = "Know Before You Go."
    static let landingSubtitle = "Live crowd levels, parking & ride ETAs for Atlanta Midtown — all in one place."
    static let landingFeatures = ["Live crowd levels at Midtown venues", "Smart parking with live spot availability", "Ride ETAs & valet options nearby"]
    static let vibeQuestion = "What's your evening vibe?"
    static let vibeOptions = ["🍽️ Dinner", "🍸 Drinks", "🎶 Events", "💕 Date night"]
    static let walkQuestion = "How close should it be?"
    static let walkOptions = ["📍 Closest", "🚶 5 min walk", "🚗 Easy parking", "🗺️ Open to explore"]
    static let crewQuestion = "Who's this for?"
    static let crewOptions = ["🙋 Just me", "💕 Date night", "👥 Group", "💼 Work/client"]
    static let atlantaHeadline = "Recommended for you"
    static let atlantaSubtitle = "Based on your vibe, location, and local conditions"
    static let atlantaPicks = ["Ladybird Grove & Mess Hall", "Livingston", "Lyla Lila"]
    static let authRoutes = NativeAuthRouteContract.routes
    static let authModes = ["signup", "login"]
    static let signupPasswordMinimum = 8
    static let reactSignupPasswordMinimum = 6
    static let emailValidationMessage = "Enter a valid email address."
    static let signupPasswordValidationMessage = "Use at least 8 characters."
    static let nameValidationMessage = "Enter the name reviewers will see on the new account."
    static let signupSubmitValidationMessage = "Please enter your name, a valid email address, and a password with at least 8 characters."
    static let loginSubmitValidationMessage = "Please enter a valid email address and password."

    static var requestedLaunchStage: NativeLaunchStage? {
        let env = ProcessInfo.processInfo.environment
        if truthy(env["BYT_NATIVE_PREVIEW_SPLASH"]) { return .splash }
        if truthy(env["BYT_NATIVE_PREVIEW_LANDING"]) { return .landing }
        if env["BYT_NATIVE_PREVIEW_AUTH"] != nil { return .auth }
        switch env["BYT_NATIVE_PREVIEW_PERSONALIZATION"]?.lowercased() {
        case "vibe", "1", "true": return .vibe
        case "walk": return .walk
        case "crew": return .crew
        case "atlanta", "recommendations", "picks": return .atlanta
        default: return nil
        }
    }

    static var requestedAuthMode: NativeAuthMode {
        NativeAuthMode(rawValue: ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_AUTH"]?.lowercased() ?? "") ?? .signup
    }

    static var freezesSplash: Bool { truthy(ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_SPLASH"]) }
    static var autoRunsLaunchJourney: Bool { truthy(ProcessInfo.processInfo.environment["BYT_NATIVE_LAUNCH_AUTORUN"]) }

    static var bypassesLaunchFlowForPreview: Bool {
        let env = ProcessInfo.processInfo.environment
        return env["BYT_NATIVE_PREVIEW_PROFILE"] != nil || env["BYT_NATIVE_PREVIEW_TAB"] != nil || env["BYT_NATIVE_PROFILE_PANEL_SMOKE"] != nil
    }

    private static func truthy(_ raw: String?) -> Bool { ["1", "true", "yes"].contains(raw?.lowercased() ?? "") }
}

enum NativeLaunchStage { case splash, landing, vibe, walk, crew, atlanta, auth }
enum NativeAuthMode: String, CaseIterable { case signup, login }

enum NativeLaunchPersonalizationStorage {
    static let atmosphereKey = "bytspot_native_launch_atmosphere"
    static let vibeKey = "bytspot_native_launch_vibe"
    static let walkKey = "bytspot_native_launch_walk"
    static let crewKey = "bytspot_native_launch_crew"
    static let completedKey = "bytspot_native_launch_completed"

    static func token(for option: String) -> String {
        let normalized = option.lowercased()
        if normalized.contains("drinks") { return "drinks" }
        if normalized.contains("coffee") { return "coffee" }
        if normalized.contains("dinner") { return "food" }
        if normalized.contains("food") { return "food" }
        if normalized.contains("fitness") { return "fitness" }
        if normalized.contains("work") { return "work" }
        if normalized.contains("event") { return "events" }
        if normalized.contains("parking") { return normalized.contains("covered") ? "covered_parking" : "parking" }
        if normalized.contains("keep going") { return "drinks" }
        if normalized.contains("sleep") { return "sleep" }
        if normalized.contains("stay nearby") { return "stay" }
        if normalized.contains("ride") { return "ride" }
        if normalized.contains("5 min") || normalized.contains("short walk") { return "close" }
        if normalized.contains("10 min") { return "medium" }
        if normalized.contains("open to explore") { return "far" }
        if normalized.contains("closest") { return "closest" }
        if normalized.contains("hotel") { return normalized.contains("boutique") ? "boutique" : "hotel" }
        if normalized.contains("apartment") { return "apartment" }
        if normalized.contains("short stay") { return "short_stay" }
        if normalized.contains("just me") || normalized.contains("solo") { return "solo" }
        if normalized.contains("date") { return "date_night" }
        if normalized.contains("group") { return "group" }
        if normalized.contains("price") { return "price" }
        if normalized.contains("rated") { return "rated" }
        if normalized.contains("safest") { return "safe" }
        return normalized.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
    }
}

enum NativeAuthInputValidator {
    static func emailIsValid(_ email: String) -> Bool {
        email.trimmingCharacters(in: .whitespacesAndNewlines).range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }

    static func passwordIsValid(_ password: String, mode: NativeAuthMode) -> Bool {
        mode == .signup ? password.count >= NativeAuthLaunchContract.signupPasswordMinimum : !password.isEmpty
    }

    static func nameIsValid(_ name: String, mode: NativeAuthMode) -> Bool {
        mode == .login || name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    static func canSubmit(mode: NativeAuthMode, name: String, email: String, password: String, loading: Bool = false) -> Bool {
        !loading && emailIsValid(email) && passwordIsValid(password, mode: mode) && nameIsValid(name, mode: mode)
    }

    static func submitValidationMessage(mode: NativeAuthMode) -> String {
        mode == .signup ? NativeAuthLaunchContract.signupSubmitValidationMessage : NativeAuthLaunchContract.loginSubmitValidationMessage
    }
}

private enum NativeAuthField: Hashable { case name, invite, email, password }

private enum NativeLaunchTheme {
    static let background = Color.black
    static let panel = Color(red: 15 / 255, green: 15 / 255, blue: 27 / 255).opacity(0.88)
    static let border = Color.white.opacity(0.13)
    static let title = Color.white
    static let body = Color.white.opacity(0.68)
    static let muted = Color.white.opacity(0.36)
    static let cyan = Color(red: 0, green: 191 / 255, blue: 1)
    static let purple = Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255)
    static let pink = Color(red: 217 / 255, green: 70 / 255, blue: 239 / 255)
    static let magenta = Color(red: 1, green: 0, blue: 1)
    static let orange = Color(red: 1, green: 69 / 255, blue: 0)
    static let emerald = Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255)
    static let red400 = Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)
    static let purple400 = Color(red: 192 / 255, green: 132 / 255, blue: 252 / 255)
    static let cyan400 = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)
    static let cyan500 = Color(red: 6 / 255, green: 182 / 255, blue: 212 / 255)
    static let card = Color(red: 13 / 255, green: 13 / 255, blue: 24 / 255).opacity(0.96)
    static let gradient = LinearGradient(colors: [purple, pink, cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let ctaGradient = LinearGradient(colors: [purple, Color(red: 117 / 255, green: 155 / 255, blue: 1), cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let brandGradient = LinearGradient(colors: [cyan, purple, magenta], startPoint: .leading, endPoint: .trailing)
    static let beforeGradient = LinearGradient(colors: [purple400, cyan400], startPoint: .leading, endPoint: .trailing)
    static let landingCTAGradient = LinearGradient(colors: [purple, cyan500], startPoint: .topLeading, endPoint: .bottomTrailing)
}

enum NativeJourneyAtmosphere: String, CaseIterable {
    case daylight, nightlight

    static var current: NativeJourneyAtmosphere {
        if let raw = ProcessInfo.processInfo.environment["BYT_NATIVE_ATMOSPHERE"]?.lowercased(), let value = Self(rawValue: raw) { return value }
        let hour = Calendar.current.component(.hour, from: Date())
        return (hour >= 6 && hour < 18) ? .daylight : .nightlight
    }

    static var storedOrCurrent: NativeJourneyAtmosphere {
        if let forced = ProcessInfo.processInfo.environment["BYT_NATIVE_ATMOSPHERE"]?.lowercased(), let value = Self(rawValue: forced) { return value }
        if let stored = UserDefaults.standard.string(forKey: NativeLaunchPersonalizationStorage.atmosphereKey), let value = Self(rawValue: stored) { return value }
        return .current
    }
}

struct NativeJourneyTheme {
    let atmosphere: NativeJourneyAtmosphere
    let intent: String
    let primary: Color
    let secondary: Color
    let tertiary: Color
    let background: LinearGradient
    let ctaGradient: LinearGradient
    let glassFill: [Color]
    let glowOpacity: Double

    static func current(intent: String = "") -> NativeJourneyTheme { resolve(atmosphere: .storedOrCurrent, intent: intent) }

    static func resolve(atmosphere: NativeJourneyAtmosphere, intent rawIntent: String) -> NativeJourneyTheme {
        let intent = rawIntent.isEmpty ? "brand" : rawIntent
        let accents = accentColors(for: intent)
        let base: [Color] = atmosphere == .daylight
            ? [Color(hex: 0x071827), Color(hex: 0x092F3E), Color.black]
            : [Color.black, Color(hex: 0x140825), Color(hex: 0x020617)]
        return NativeJourneyTheme(
            atmosphere: atmosphere,
            intent: intent,
            primary: accents.0,
            secondary: accents.1,
            tertiary: atmosphere == .daylight ? NativeLaunchTheme.emerald : NativeLaunchTheme.magenta,
            background: LinearGradient(colors: base, startPoint: .topLeading, endPoint: .bottomTrailing),
            ctaGradient: LinearGradient(colors: [accents.0, accents.1], startPoint: .topLeading, endPoint: .bottomTrailing),
            glassFill: atmosphere == .daylight ? [Color.white.opacity(0.06), Color(hex: 0x082F49).opacity(0.82), Color.black.opacity(0.58)] : [Color.white.opacity(0.035), NativeLaunchTheme.card.opacity(0.98), Color.black.opacity(0.72)],
            glowOpacity: atmosphere == .daylight ? 0.18 : 0.26
        )
    }

    static func accentColors(for intent: String) -> (Color, Color) {
        switch intent {
        case "food", "dining": return (NativeLaunchTheme.orange, NativeLaunchTheme.pink)
        case "drinks", "nightlife", "events": return (NativeLaunchTheme.purple, NativeLaunchTheme.magenta)
        case "parking", "covered_parking": return (NativeLaunchTheme.emerald, NativeLaunchTheme.cyan)
        case "ride": return (NativeLaunchTheme.orange, NativeLaunchTheme.cyan)
        case "sleep", "stay": return (NativeLaunchTheme.purple400, NativeLaunchTheme.cyan)
        case "coffee", "work": return (NativeLaunchTheme.cyan, NativeLaunchTheme.emerald)
        default: return (NativeLaunchTheme.cyan, NativeLaunchTheme.purple)
        }
    }
}

extension View {
    /// CSS-style transparent card: use for landing feature pills and inner rows.
    /// No iOS Material and no dark tint; it should read as transparent over the page.
    func nativeLaunchTransparentCard(radius: CGFloat, fillOpacity: Double = 0.05, borderOpacity: Double = 0.10) -> some View {
        self
            .background(Color.white.opacity(fillOpacity))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color.white.opacity(borderOpacity), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// Dark material glass: use only for primary floating surfaces like quiz/auth sheets.
    func nativeLaunchGlass(radius: CGFloat, borderOpacity: Double = 0.14, shadow: Bool = true) -> some View {
        self
            .background(
                LinearGradient(
                    colors: [Color.white.opacity(0.035), NativeLaunchTheme.card.opacity(0.98), Color.black.opacity(0.72)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .background(.ultraThinMaterial)
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color.white.opacity(borderOpacity), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: shadow ? Color.black.opacity(0.34) : .clear, radius: shadow ? 22 : 0, x: 0, y: shadow ? 14 : 0)
    }
}

private extension Color {
    init(hex: Int, alpha: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

private struct NativeLaunchFlowView: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    @ObservedObject var authCoordinator: NativeAuthCoordinator
    let onComplete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(NativeLaunchPersonalizationStorage.vibeKey) private var selectedVibe = ""
    @AppStorage(NativeLaunchPersonalizationStorage.walkKey) private var selectedWalk = ""
    @AppStorage(NativeLaunchPersonalizationStorage.crewKey) private var selectedCrew = ""
    @AppStorage(NativeLaunchPersonalizationStorage.completedKey) private var completedPersonalization = false
    @AppStorage(NativeLaunchPersonalizationStorage.atmosphereKey) private var launchAtmosphere = ""
    @State private var stage = NativeAuthLaunchContract.requestedLaunchStage ?? .splash
    @State private var didScheduleAutorun = false

    var body: some View {
        Group {
            switch stage {
            case .splash:
                NativeSplashScreen(freeze: NativeAuthLaunchContract.freezesSplash) { advance(to: .landing) }
            case .landing:
                NativeLandingScreen(onGetStarted: { advance(to: .vibe) }, onContinueGuest: completeAsGuest)
            case .vibe:
                NativePersonalizationScreen(step: .vibe, onSelect: { selectedVibe = NativeLaunchPersonalizationStorage.token(for: $0); advance(to: .walk) }, onSkip: completeAsGuest)
            case .walk:
                NativePersonalizationScreen(step: .walk, selectedIntent: selectedVibe, onSelect: { selectedWalk = NativeLaunchPersonalizationStorage.token(for: $0); advance(to: .crew) }, onSkip: completeAsGuest)
            case .crew:
                NativePersonalizationScreen(step: .crew, selectedIntent: selectedVibe, onSelect: { selectedCrew = NativeLaunchPersonalizationStorage.token(for: $0); completedPersonalization = true; advance(to: .atlanta) }, onSkip: completeAsGuest)
            case .atlanta:
                NativeAtlantaPicksScreen(onContinue: completeAsGuest, onSignIn: { advance(to: .auth) })
            case .auth:
                NativeAuthenticationScreen(mode: NativeAuthLaunchContract.requestedAuthMode, sessionStore: sessionStore, authCoordinator: authCoordinator, onComplete: onComplete, onBack: { advance(to: .landing) })
            }
        }
        .background(NativeJourneyTheme.current(intent: selectedVibe).background.ignoresSafeArea())
        .transition(reduceMotion ? .identity : .opacity.combined(with: .scale(scale: 0.985)))
        .onAppear { captureLaunchAtmosphereIfNeeded(); scheduleAutorunIfNeeded() }
        .onChange(of: sessionStore.token ?? "") { _ in if sessionStore.hasSecureToken { onComplete() } }
    }

    private func advance(to next: NativeLaunchStage) {
        if reduceMotion { stage = next } else { withAnimation(.spring(response: 0.38, dampingFraction: 0.88)) { stage = next } }
    }

    private func captureLaunchAtmosphereIfNeeded() {
        let resolved = NativeJourneyAtmosphere.current.rawValue
        if launchAtmosphere != resolved { launchAtmosphere = resolved }
    }

    private func completeAsGuest() {
        completedPersonalization = true
        sessionStore.continueAsGuest()
        onComplete()
    }

    private func scheduleAutorunIfNeeded() {
        guard NativeAuthLaunchContract.autoRunsLaunchJourney, !didScheduleAutorun else { return }
        didScheduleAutorun = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { advance(to: .vibe) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { selectedVibe = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.vibe.options(context: NativeLaunchQuizContext.current, selectedIntent: "")[0]); advance(to: .walk) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { selectedWalk = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.walk.options(context: NativeLaunchQuizContext.current, selectedIntent: selectedVibe)[0]); advance(to: .crew) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { selectedCrew = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.crew.options(context: NativeLaunchQuizContext.current, selectedIntent: selectedVibe)[0]); completedPersonalization = true; advance(to: .atlanta) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.4) { completeAsGuest() }
    }
}

private struct NativeLaunchSizing {
    let size: CGSize
    var compactHeight: Bool { size.height < 720 }
    var narrowWidth: Bool { size.width < 380 }
    var horizontalPadding: CGFloat { narrowWidth ? 18 : 24 }
    var landingMaxWidth: CGFloat { 393 }
    var cardPadding: CGFloat { compactHeight ? 22 : 28 }
    var splashSpacing: CGFloat { compactHeight ? 26 : 34 }
    var splashMark: CGFloat { compactHeight ? 140 : 156 }
    var splashTitle: CGFloat { narrowWidth ? 50 : 54 }
    var landingMark: CGFloat { compactHeight ? 88 : 100 }
    var landingTitle: CGFloat { narrowWidth ? 28 : 32 }
    var landingCTAHeight: CGFloat { compactHeight ? 56 : 60 }
    var sheetHorizontalInset: CGFloat { narrowWidth ? 14 : 18 }
    var sheetMaxHeightFraction: CGFloat { compactHeight ? 0.80 : 0.84 }
    var questionTitle: CGFloat { compactHeight ? 23 : 26 }
    var authTopPadding: CGFloat { compactHeight ? 14 : 24 }
    var ctaHeight: CGFloat { compactHeight ? 52 : 56 }
}

#if DEBUG
enum NativeJourneyThemeSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        precondition(NativeJourneyAtmosphere.allCases.map(\.rawValue) == ["daylight", "nightlight"], "NativeJourneyThemeSelfTests: atmosphere names drifted.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .daylight, intent: "parking").intent == "parking", "NativeJourneyThemeSelfTests: intent should pass through resolver.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .nightlight, intent: "").intent == "brand", "NativeJourneyThemeSelfTests: empty intent should resolve to brand.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .daylight, intent: "parking").glowOpacity < NativeJourneyTheme.resolve(atmosphere: .nightlight, intent: "parking").glowOpacity, "NativeJourneyThemeSelfTests: nightlight should carry stronger glow.")
    }
}
#endif

private struct NativeSplashScreen: View {
    let freeze: Bool
    let onComplete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let theme = NativeJourneyTheme.current()
            let centerX = proxy.size.width * 0.5
            let centerY = proxy.size.height * 0.5
            ZStack {
                theme.background.ignoresSafeArea()
                splashOrb(color: theme.primary, size: 420, x: centerX, y: centerY, intensity: theme.glowOpacity)
                splashOrb(color: theme.secondary, size: 320, x: centerX, y: proxy.size.height * 0.68, intensity: theme.glowOpacity * 0.70)
                splashOrb(color: theme.tertiary, size: 280, x: proxy.size.width * 0.82, y: centerY * 0.96, intensity: theme.glowOpacity * 0.46)
                VStack(spacing: sizing.splashSpacing) {
                    NativeBytspotMark(size: sizing.splashMark, showGlow: true)
                        .scaleEffect(animate && !reduceMotion ? 1.025 : 1)
                    Text("BYTSPOT")
                        .font(.system(size: sizing.splashTitle, weight: .bold))
                        .foregroundStyle(theme.ctaGradient)
                    HStack(spacing: 8) { ForEach([theme.primary, theme.secondary, theme.tertiary], id: \.description) { Circle().fill($0).frame(width: 8.5, height: 8.5).opacity(animate && !reduceMotion ? 0.95 : 0.45).scaleEffect(animate && !reduceMotion ? 1.12 : 1) } }
                    if freeze {
                        VStack(spacing: 8) {
                            Button(action: { nativeAuthImpactLight(); onComplete() }) {
                                NativeLaunchCTA(title: NativeAuthLaunchContract.splashStartTitle, color: theme.ctaGradient, foreground: .white, height: sizing.compactHeight ? 50 : 54, cornerRadius: 17, showArrow: true)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("native-launch-splash-start")
                            Text(NativeAuthLaunchContract.splashStartSubtitle)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white.opacity(0.46))
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, sizing.compactHeight ? 4 : 8)
                    }
                }
                .padding(.horizontal, sizing.horizontalPadding)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("BYTSPOT")
                .accessibilityIdentifier("native-launch-splash")
            }
        }
        .onAppear {
            if !reduceMotion { withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { animate = true } }
            guard !freeze, !NativeAuthLaunchContract.autoRunsLaunchJourney else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + NativeAuthLaunchContract.splashDurationSeconds) { onComplete() }
        }
    }

    private func splashOrb(color: Color, size: CGFloat, x: CGFloat, y: CGFloat, intensity: Double) -> some View {
        Circle()
            .fill(RadialGradient(stops: [
                .init(color: color.opacity(intensity), location: 0.0),
                .init(color: Color.clear, location: 0.70)
            ], center: .center, startRadius: 0, endRadius: size * 0.5))
            .frame(width: size, height: size)
            .position(x: x, y: y)
            .blur(radius: size * 0.10)
            .scaleEffect(animate && !reduceMotion ? 1.08 : 1)
    }
}

private struct NativeLandingScreen: View {
    let onGetStarted: () -> Void
    let onContinueGuest: () -> Void

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let railWidth = min(proxy.size.width, sizing.landingMaxWidth)
            let contentWidth = railWidth - (sizing.horizontalPadding * 2)
            let theme = NativeJourneyTheme.current()
            let centerX = proxy.size.width * 0.5
            let featureY = proxy.size.height * 0.602
            let featurePillHeight: CGFloat = sizing.compactHeight ? 56 : 60
            let featureGroupHeight = (featurePillHeight * 3) + (12 * 2)
            let ctaY = featureY + (featureGroupHeight * 0.5) + 40 + (sizing.landingCTAHeight * 0.5)
            ZStack {
                theme.background.ignoresSafeArea()
                landingOrb(color: theme.primary, size: 500, x: centerX, y: proxy.size.height * 0.15 + 250, intensity: theme.glowOpacity)
                landingOrb(color: theme.secondary, size: 400, x: centerX, y: proxy.size.height * 0.90 - 200, intensity: theme.glowOpacity * 0.82)
                landingOrb(color: theme.tertiary, size: 300, x: proxy.size.width * 0.95 - 150, y: proxy.size.height * 0.50, intensity: theme.glowOpacity * 0.56)
                NativeBytspotMark(size: 100)
                    .position(x: centerX, y: proxy.size.height * 0.286)
                VStack(spacing: 8) {
                    NativeLaunchHeadline(size: 32)
                    Text("Live crowd levels, parking & ride ETAs\nfor Atlanta Midtown — all in one place.").font(.system(size: 15, weight: .regular)).foregroundColor(.white.opacity(0.60)).multilineTextAlignment(.center).lineSpacing(6)
                }
                .frame(width: contentWidth)
                .position(x: centerX, y: proxy.size.height * 0.426)
                VStack(spacing: 12) { ForEach(Array(NativeAuthLaunchContract.landingFeatures.enumerated()), id: \.offset) { _, feature in NativeLaunchFeaturePill(title: feature, compact: sizing.compactHeight) } }
                    .frame(width: contentWidth)
                    .position(x: centerX, y: featureY)
                Button(action: { nativeAuthImpactLight(); onGetStarted() }) { NativeLaunchCTA(title: "Let's Go", color: theme.ctaGradient, foreground: .white, height: sizing.landingCTAHeight, cornerRadius: 16, showArrow: true) }
                    .buttonStyle(.plain)
                    .frame(width: contentWidth)
                    .position(x: centerX, y: ctaY)
                    .accessibilityHint("Starts the launch personalization questions. You can still skip from the personalization steps.")
                Text("By continuing, you agree to our Terms & Privacy").font(.system(size: 12, weight: .regular)).foregroundColor(.white.opacity(0.30))
                    .position(x: centerX, y: proxy.size.height * 0.938)
            }
            .accessibilityIdentifier("native-launch-landing")
        }
    }

    private func landingOrb(color: Color, size: CGFloat, x: CGFloat, y: CGFloat, intensity: Double) -> some View {
        Circle()
            .fill(RadialGradient(stops: [
                .init(color: color.opacity(intensity), location: 0.0),
                .init(color: Color.clear, location: 0.70)
            ], center: .center, startRadius: 0, endRadius: size * 0.5))
            .frame(width: size, height: size)
            .position(x: x, y: y)
    }
}

private struct NativeBytspotMark: View {
    let size: CGFloat
    var showGlow: Bool = false
    private var outerRingGradient: LinearGradient {
        LinearGradient(colors: [NativeLaunchTheme.cyan, NativeLaunchTheme.purple, NativeLaunchTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    private var middleRingGradient: LinearGradient {
        LinearGradient(colors: [NativeLaunchTheme.purple, NativeLaunchTheme.pink], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    private var hexFillGradient: LinearGradient {
        LinearGradient(stops: [
            .init(color: NativeLaunchTheme.purple, location: 0.0),
            .init(color: NativeLaunchTheme.pink, location: 0.5),
            .init(color: NativeLaunchTheme.magenta, location: 1.0)
        ], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    private var hexBorderGradient: LinearGradient {
        LinearGradient(colors: [NativeLaunchTheme.cyan, NativeLaunchTheme.magenta, NativeLaunchTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    private var centerDotGradient: RadialGradient {
        RadialGradient(colors: [NativeLaunchTheme.cyan, Color(red: 0, green: 153 / 255, blue: 204 / 255)], center: .center, startRadius: 0, endRadius: size * 0.0665)
    }
    private var centerGlowGradient: RadialGradient {
        RadialGradient(colors: [NativeLaunchTheme.cyan.opacity(0.30), Color.clear], center: .center, startRadius: 0, endRadius: size * 0.10)
    }
    var body: some View {
        Image("BytspotBrandMark")
            .resizable()
            .scaledToFit()
        .frame(width: size, height: size)
        .shadow(color: showGlow ? NativeLaunchTheme.cyan.opacity(0.40) : .clear, radius: showGlow ? size * 0.10 : 0)
        .shadow(color: showGlow ? NativeLaunchTheme.purple.opacity(0.30) : .clear, radius: showGlow ? size * 0.20 : 0)
        .accessibilityLabel("Bytspot logo")
    }
}

private struct Hexagon: Shape {
    func path(in rect: CGRect) -> Path {
        // Matches BrandLogo.tsx path: M60 32 L74 41 L74 59 L60 68 L46 59 L46 41 Z
        // Vertical-sided hexagon with vertices at (0.5w,0), (w,0.25h), (w,0.75h), (0.5w,h), (0,0.75h), (0,0.25h)
        let w = rect.width, h = rect.height
        let q = h * 0.25
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + w * 0.5, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + q))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - q))
        path.addLine(to: CGPoint(x: rect.minX + w * 0.5, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - q))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + q))
        path.closeSubpath()
        return path
    }
}

private struct NativeLaunchHeadline: View {
    let size: CGFloat
    private var font: Font { .system(size: size, weight: .bold) }
    private var beforeGradient: LinearGradient {
        LinearGradient(colors: [NativeLaunchTheme.purple400, NativeLaunchTheme.cyan400], startPoint: .leading, endPoint: .trailing)
    }
    var body: some View {
        HStack(spacing: 0) {
            Text("Know ").font(font).foregroundColor(.white)
            Text("Before").font(font).foregroundColor(.clear)
                .overlay(beforeGradient.mask(Text("Before").font(font)))
            Text(" You Go.").font(font).foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Know Before You Go.")
    }
}


private struct NativeLaunchFeaturePill: View {
    let title: String
    let compact: Bool
    var body: some View { HStack(spacing: 12) { ZStack { Circle().fill(Color.white.opacity(0.08)); Image(systemName: icon).font(.system(size: 16, weight: .regular)).foregroundColor(color) }.frame(width: 32, height: 32).accessibilityHidden(true); Text(title).font(.system(size: 14, weight: .medium)).foregroundColor(.white.opacity(0.80)); Spacer(minLength: 0) }.padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: compact ? 56 : 60).nativeLaunchTransparentCard(radius: 14).accessibilityElement(children: .combine).accessibilityLabel(title) }
    private var icon: String { title.contains("parking") ? "car" : title.contains("Ride") ? "clock" : "dot.radiowaves.left.and.right" }
    private var color: Color { title.contains("parking") ? NativeLaunchTheme.cyan400 : title.contains("Ride") ? NativeLaunchTheme.purple400 : NativeLaunchTheme.red400 }
}

private enum NativeLaunchQuizContext {
    case day, evening, lateNight

    static var current: NativeLaunchQuizContext {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 22 || hour < 5 { return .lateNight }
        if hour >= 16 { return .evening }
        return .day
    }

    var line: String {
        switch self {
        case .day: return "Daytime near Midtown · coffee, food, work spots, and parking"
        case .evening: return "Evening near Midtown · dinner, drinks, events, and easy parking"
        case .lateNight: return "Late night near Midtown · keep going, get home, or stay nearby"
        }
    }
}

private enum NativePersonalizationStep: Equatable {
    case vibe, walk, crew
    var index: Int { self == .vibe ? 1 : self == .walk ? 2 : 3 }

    func emoji(context: NativeLaunchQuizContext, selectedIntent: String) -> String {
        if self == .vibe { return context == .lateNight ? "🌙" : context == .day ? "☀️" : "✨" }
        if self == .walk { return Self.isSleepIntent(selectedIntent) ? "🛏️" : "🗺️" }
        return Self.isSleepIntent(selectedIntent) ? "🔒" : "👥"
    }

    func question(context: NativeLaunchQuizContext, selectedIntent: String) -> String {
        switch self {
        case .vibe:
            return context == .lateNight ? "What do you need tonight?" : context == .day ? "What are you looking for nearby?" : NativeAuthLaunchContract.vibeQuestion
        case .walk:
            return Self.isSleepIntent(selectedIntent) ? "What kind of stay fits tonight?" : NativeAuthLaunchContract.walkQuestion
        case .crew:
            return Self.isSleepIntent(selectedIntent) ? "What matters most?" : NativeAuthLaunchContract.crewQuestion
        }
    }

    func contextLine(context: NativeLaunchQuizContext) -> String? { self == .vibe ? context.line : nil }

    func options(context: NativeLaunchQuizContext, selectedIntent: String) -> [String] {
        switch self {
        case .vibe:
            switch context {
            case .day: return ["☕ Coffee", "🍔 Food", "💻 Work spot", "🚗 Parking"]
            case .evening: return NativeAuthLaunchContract.vibeOptions
            case .lateNight: return ["🍸 Keep going", "🍔 Late food", "🛏️ Sleep nearby", "🚕 Ride home"]
            }
        case .walk:
            return Self.isSleepIntent(selectedIntent) ? ["🏨 Hotel", "✨ Boutique hotel", "🏢 Apartment stay", "⏱️ Short stay"] : NativeAuthLaunchContract.walkOptions
        case .crew:
            return Self.isSleepIntent(selectedIntent) ? ["📍 Closest", "💸 Best price", "⭐ Best rated", "🔒 Safest area"] : NativeAuthLaunchContract.crewOptions
        }
    }

    static func isSleepIntent(_ token: String) -> Bool { token == "sleep" || token == "stay" }
}

private struct NativePersonalizationScreen: View {
    let step: NativePersonalizationStep
    var selectedIntent: String = ""
    let onSelect: (String) -> Void
    let onSkip: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let context = NativeLaunchQuizContext.current
            let theme = NativeJourneyTheme.current(intent: selectedIntent)
            let emoji = step.emoji(context: context, selectedIntent: selectedIntent)
            let question = step.question(context: context, selectedIntent: selectedIntent)
            let options = step.options(context: context, selectedIntent: selectedIntent)
            ZStack(alignment: .bottom) {
                theme.background.ignoresSafeArea()
                Circle().fill(theme.primary.opacity(theme.glowOpacity * 0.66)).frame(width: 280, height: 280).blur(radius: 90).offset(x: -120, y: 180)
                Circle().fill(theme.secondary.opacity(theme.glowOpacity * 0.78)).frame(width: 340, height: 340).blur(radius: 100).offset(x: 130, y: -20)
                VStack(spacing: sizing.compactHeight ? 18 : 22) {
                HStack {
                    NativePersonalizationProgress(step: step.index, total: 3)
                    Spacer()
                    Button(action: { nativeAuthImpactLight(); onSkip() }) { Text("Skip").font(.system(size: 14, weight: .bold)).foregroundColor(.white.opacity(0.36)).padding(.horizontal, 15).frame(height: 40).overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1)) }.buttonStyle(.plain).accessibilityLabel("Skip personalization").accessibilityHint("Opens Bytspot in guest mode.")
                }
                Text(emoji).font(.system(size: sizing.compactHeight ? 24 : 28)).accessibilityHidden(true)
                if let contextLine = step.contextLine(context: context) { Text(contextLine).font(.system(size: 11, weight: .bold)).foregroundColor(theme.primary.opacity(0.88)).multilineTextAlignment(.center).padding(.horizontal, 12).padding(.vertical, 7).background(theme.primary.opacity(0.10)).overlay(Capsule().stroke(theme.primary.opacity(0.20), lineWidth: 1)).clipShape(Capsule()) }
                Text(question).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white).multilineTextAlignment(.center)
                LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    ForEach(options, id: \.self) { option in
                        Button(action: { nativeAuthImpactLight(); onSelect(option) }) { Text(option).font(.system(size: 17, weight: .black)).foregroundColor(.white).minimumScaleFactor(0.82).lineLimit(1).frame(maxWidth: .infinity).frame(minHeight: sizing.compactHeight ? 56 : 62).background(Color.white.opacity(0.075)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(theme.primary.opacity(0.24), lineWidth: 2)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)) }
                            .buttonStyle(.plain)
                            .accessibilityLabel(option)
                            .accessibilityHint("Selects this answer and moves to the next launch step.")
                            .accessibilityIdentifier("native-launch-option-\(NativeLaunchPersonalizationStorage.token(for: option))")
                    }
                }
            }
            .padding(sizing.cardPadding)
            .frame(maxWidth: .infinity)
            .nativeLaunchGlass(radius: 30, borderOpacity: 0.14)
            .padding(.horizontal, sizing.sheetHorizontalInset)
            .padding(.bottom, 10)
            .accessibilityIdentifier("native-launch-personalization")
            }
        }
    }
}

private struct NativePersonalizationProgress: View {
    let step: Int
    let total: Int
    var color: Color = NativeLaunchTheme.cyan
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.12), lineWidth: 4)
            Circle().trim(from: 0, to: CGFloat(step) / CGFloat(total)).stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round)).rotationEffect(.degrees(-90))
            Text("\(step)/\(total)").font(.system(size: 12, weight: .black)).foregroundColor(.white)
        }
        .frame(width: 50, height: 50)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(step) of \(total)")
    }
}

private struct NativeAtlantaPicksScreen: View {
    let onContinue: () -> Void
    let onSignIn: () -> Void
    @AppStorage(NativeLaunchPersonalizationStorage.vibeKey) private var selectedVibe = ""
    private let picks = [
        ("🥇", "Ladybird Grove & Mess Hall", "684 John Wesley Dobbs Ave NE", "Chill", NativeLaunchTheme.cyan),
        ("🥈", "Livingston", "659 Peachtree St NE", "Chill", NativeLaunchTheme.cyan),
        ("🥉", "Lyla Lila", "972 Brady Ave NW", "Active", NativeLaunchTheme.emerald)
    ]

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let theme = NativeJourneyTheme.current(intent: selectedVibe)
            ZStack(alignment: .bottom) {
                theme.background.ignoresSafeArea()
                Circle().fill(theme.primary.opacity(theme.glowOpacity * 0.78)).frame(width: 420, height: 420).blur(radius: 110).offset(y: -120)
                Circle().fill(theme.secondary.opacity(theme.glowOpacity * 0.52)).frame(width: 320, height: 320).blur(radius: 100).offset(x: 120, y: 190)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: sizing.compactHeight ? 13 : 16) {
                HStack { NativePersonalizationProgress(step: 3, total: 3, color: theme.primary).overlay(Image(systemName: "checkmark").font(.system(size: 18, weight: .black)).foregroundColor(theme.primary)); Spacer() }
                VStack(spacing: 8) { Text("🗺️").font(.system(size: sizing.compactHeight ? 28 : 34)).accessibilityHidden(true); Text(NativeAuthLaunchContract.atlantaHeadline).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white); Text(NativeAuthLaunchContract.atlantaSubtitle).font(.system(size: 15, weight: .bold)).foregroundColor(.white.opacity(0.50)).multilineTextAlignment(.center) }
                VStack(spacing: 10) { ForEach(Array(picks.enumerated()), id: \.offset) { _, pick in NativeAtlantaPickRow(medal: pick.0, title: pick.1, address: pick.2, label: pick.3, color: pick.4) } }
                Text("You can explore now. Sign in anytime to save favorites and sync your picks.").font(.system(size: 12, weight: .bold)).foregroundColor(.white.opacity(0.38)).multilineTextAlignment(.center)
                Button(action: { nativeAuthImpactLight(); onContinue() }) { NativeLaunchCTA(title: "Explore These Spots", color: theme.ctaGradient, foreground: .black, height: sizing.ctaHeight) }.buttonStyle(.plain).accessibilityHint("Opens Bytspot in guest mode with these picks.")
                Button(action: { nativeAuthImpactLight(); onSignIn() }) { Text("Sign in to save these picks").font(.system(size: 14, weight: .black)).foregroundColor(theme.primary).frame(maxWidth: .infinity).frame(height: 42).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(theme.primary.opacity(0.28), lineWidth: 1)) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the sign in screen before saving picks.")
                    .accessibilityIdentifier("native-launch-sign-in-after-picks")
                    }
                    .padding(sizing.cardPadding)
                    .frame(maxWidth: .infinity)
                }
                .frame(maxHeight: proxy.size.height * sizing.sheetMaxHeightFraction)
                .nativeLaunchGlass(radius: 30, borderOpacity: 0.14)
                .padding(.horizontal, sizing.sheetHorizontalInset)
                .padding(.bottom, 10)
                .accessibilityIdentifier("native-launch-atlanta-picks")
            }
        }
    }
}

private struct NativeAtlantaPickRow: View {
    let medal: String; let title: String; let address: String; let label: String; let color: Color
    var body: some View { HStack(spacing: 12) { Text(medal).font(.system(size: 20)).accessibilityHidden(true); VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 17, weight: .black)).foregroundColor(.white).lineLimit(1); Text(address).font(.system(size: 13, weight: .bold)).foregroundColor(.white.opacity(0.36)).lineLimit(1) }; Spacer(); Text(label).font(.system(size: 12, weight: .black)).foregroundColor(color).padding(.horizontal, 10).padding(.vertical, 5).background(color.opacity(0.16)).overlay(Capsule().stroke(color.opacity(0.34), lineWidth: 1)).clipShape(Capsule()) }.padding(14).nativeLaunchTransparentCard(radius: 16, fillOpacity: 0.065).accessibilityElement(children: .ignore).accessibilityLabel("\(title), \(address), \(label)") }
}

struct NativeAuthenticationScreen: View {
    let mode: NativeAuthMode
    @ObservedObject var sessionStore: BytspotSessionStore
    @ObservedObject var authCoordinator: NativeAuthCoordinator
    let onComplete: () -> Void
    let onBack: () -> Void
    @State private var currentMode: NativeAuthMode
    @State private var name = ""
    @State private var inviteCode = ""
    @State private var email = ""
    @State private var password = ""
    @State private var loading = false
    @State private var error = ""
    @State private var showRecovery = false
    @State private var touchedFields = Set<NativeAuthField>()
    @AppStorage(NativeLaunchPersonalizationStorage.vibeKey) private var launchIntent = ""
    @FocusState private var focusedField: NativeAuthField?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(mode: NativeAuthMode, sessionStore: BytspotSessionStore, authCoordinator: NativeAuthCoordinator, onComplete: @escaping () -> Void, onBack: @escaping () -> Void) {
        self.mode = mode; self.sessionStore = sessionStore; self.authCoordinator = authCoordinator; self.onComplete = onComplete; self.onBack = onBack; _currentMode = State(initialValue: mode)
    }

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let theme = NativeJourneyTheme.current(intent: launchIntent)
            ScrollView(showsIndicators: false) {
                VStack(spacing: sizing.compactHeight ? 15 : 18) {
                    HStack { Button(action: onBack) { Image(systemName: "chevron.left").font(.system(size: 16, weight: .black)).foregroundColor(.white).frame(width: 42, height: 42).background(NativeLaunchTheme.panel).clipShape(Circle()) }.buttonStyle(.plain).accessibilityLabel("Back").accessibilityHint("Returns to the landing screen."); Spacer() }
                    VStack(spacing: 10) { Text("👋").font(.system(size: sizing.compactHeight ? 28 : 34)).frame(width: sizing.compactHeight ? 56 : 64, height: sizing.compactHeight ? 56 : 64).background(theme.ctaGradient).clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)).accessibilityHidden(true); Text("Welcome to Bytspot").font(.system(size: dynamicTypeSize.isAccessibilitySize ? 28 : sizing.compactHeight ? 30 : 34, weight: .black)).foregroundColor(.white).multilineTextAlignment(.center); Text(currentMode == .signup ? "Create your account to save spots, preferences, and reservations." : "Sign in to continue with your picks.").font(.system(size: 15, weight: .semibold)).foregroundColor(NativeLaunchTheme.body).multilineTextAlignment(.center) }
                    .accessibilityElement(children: .combine)
                authModeToggle
                #if DEBUG
                NativeSocialAuthButton(title: "Continue with Apple", icon: "apple.logo", loading: loading || isAuthenticating(.apple)) { signIn(.apple) }
                NativeSocialAuthButton(title: "Continue with Google", icon: "person.crop.circle.badge.plus", loading: loading || isAuthenticating(.google)) { signIn(.google) }
                HStack { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1); Text("or use email").font(.system(size: 12, weight: .bold)).foregroundColor(NativeLaunchTheme.muted); Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }.accessibilityHidden(true)
                #endif
                VStack(spacing: 12) {
                    if currentMode == .signup {
                        NativeLaunchTextField(title: "Full name", icon: "person.fill", text: $name, focus: $focusedField, field: .name, submitLabel: .next, onSubmit: { advanceFocus(after: .name) })
                        if shouldShowNameValidation { validationCopy(NativeAuthLaunchContract.nameValidationMessage) }
                        NativeLaunchTextField(title: "Invite code (optional)", icon: "key.fill", text: $inviteCode, capitalization: .characters, focus: $focusedField, field: .invite, submitLabel: .next, onSubmit: { advanceFocus(after: .invite) })
                    }
                    NativeLaunchTextField(title: "Email address", icon: "envelope.fill", text: $email, keyboard: .emailAddress, capitalization: .never, focus: $focusedField, field: .email, submitLabel: .next, onSubmit: { advanceFocus(after: .email) })
                    if shouldShowEmailValidation { validationCopy(NativeAuthLaunchContract.emailValidationMessage) }
                    NativeLaunchSecureField(title: "Password", text: $password, focus: $focusedField, field: .password, submitLabel: .go, onSubmit: submitEmailAuth)
                    if shouldShowPasswordValidation { validationCopy(NativeAuthLaunchContract.signupPasswordValidationMessage) }
                    if currentMode == .login { Button("Forgot password?") { showRecovery = true }.font(.system(size: 13, weight: .bold)).foregroundColor(theme.primary).frame(maxWidth: .infinity, alignment: .trailing).accessibilityHint("Opens password recovery.") }
                    if !error.isEmpty { Text(error).font(.system(size: 13, weight: .bold)).foregroundColor(.red.opacity(0.92)).frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color.red.opacity(0.16)).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)).accessibilityLabel("Authentication error. \(error)") }
                    Button(action: submitEmailAuth) { NativeLaunchCTA(title: loading ? "Connecting…" : currentMode == .signup ? "Create Account" : "Log In", color: theme.ctaGradient, foreground: .white, height: sizing.ctaHeight) }.buttonStyle(.plain).disabled(!canSubmit || loading).opacity(canSubmit ? 1 : 0.45).accessibilityHint(canSubmit ? "Submits the email authentication form." : "Complete the required fields to continue.")
                }
                Text("By continuing, you agree to our Terms of Service and Privacy Policy").font(.system(size: 11, weight: .semibold)).foregroundColor(NativeLaunchTheme.muted).multilineTextAlignment(.center)
                }
                .padding(sizing.cardPadding)
                .frame(maxWidth: sizing.landingMaxWidth)
                .nativeLaunchGlass(radius: 30, borderOpacity: 0.14)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, sizing.sheetHorizontalInset)
                .padding(.top, sizing.authTopPadding)
                .padding(.bottom, 42)
            }
        }
        .background(NativeJourneyTheme.current(intent: launchIntent).background.ignoresSafeArea())
        .accessibilityIdentifier("native-launch-auth")
        .sheet(isPresented: $showRecovery) { NativePasswordRecoverySheet(email: email) }
        .onAppear { focusedField = currentMode == .signup ? .name : .email }
        .onChange(of: currentMode) { _ in error = ""; touchedFields.removeAll(); focusedField = currentMode == .signup ? .name : .email }
        .onChange(of: focusedField) { newValue in if let field = newValue { touchedFields.insert(field) } }
        .onChange(of: authCoordinator.status) { status in if case .failed(let message) = status { error = message } else if case .requiresLegacyFallback(let provider) = status { error = "\(provider.title) is not configured for native production on this build. Use email sign-in or try again after provider setup." } }
    }

    private var authModeToggle: some View { HStack(spacing: 4) { ForEach(NativeAuthMode.allCases, id: \.rawValue) { item in Button(action: { currentMode = item; error = "" }) { Text(item == .signup ? "Sign Up" : "Log In").font(.system(size: 15, weight: .black)).foregroundColor(currentMode == item ? .black : .white.opacity(0.62)).frame(maxWidth: .infinity).frame(height: 42).background(currentMode == item ? Color.white : Color.clear).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)) }.buttonStyle(.plain).accessibilityLabel(item == .signup ? "Sign Up" : "Log In").accessibilityValue(currentMode == item ? "Selected" : "Not selected") } }.padding(4).background(Color.white.opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).accessibilityElement(children: .contain) }
    private var emailValid: Bool { NativeAuthInputValidator.emailIsValid(email) }
    private var canSubmit: Bool { NativeAuthInputValidator.canSubmit(mode: currentMode, name: name, email: email, password: password, loading: loading) }
    private var shouldShowNameValidation: Bool { currentMode == .signup && !name.isEmpty && !NativeAuthInputValidator.nameIsValid(name, mode: currentMode) }
    private var shouldShowEmailValidation: Bool { !email.isEmpty && !emailValid }
    private var shouldShowPasswordValidation: Bool { !password.isEmpty && !NativeAuthInputValidator.passwordIsValid(password, mode: currentMode) }
    private var api: NativeAuthDataAPI { NativeAuthDataAPI(client: BytspotAPIClient()) }
    private func isAuthenticating(_ provider: NativeAuthProvider) -> Bool { if case .authenticating(let active) = authCoordinator.status { return active == provider }; return false }
    private func signIn(_ provider: NativeAuthProvider) { error = ""; nativeAuthImpactLight(); authCoordinator.handle(.signIn(provider), sessionStore: sessionStore) }
    @ViewBuilder private func validationCopy(_ message: String) -> some View { Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(.orange.opacity(0.92)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4).accessibilityLabel(message) }
    private func advanceFocus(after field: NativeAuthField) { touchedFields.insert(field); switch field { case .name: focusedField = .invite; case .invite: focusedField = .email; case .email: focusedField = .password; case .password: submitEmailAuth() } }
    private func submitEmailAuth() {
        guard canSubmit else { touchedFields.formUnion([.name, .email, .password]); error = NativeAuthInputValidator.submitValidationMessage(mode: currentMode); focusedField = firstInvalidField; nativeAuthImpactLight(); return }
        error = ""; focusedField = nil; nativeAuthImpactLight()
        loading = true; let selectedMode = currentMode
        Task { do { let response = selectedMode == .signup ? try await api.signup(email: email, password: password, name: name, ref: inviteCode.isEmpty ? nil : inviteCode) : try await api.login(email: email, password: password); await MainActor.run { if let token = response.token, !token.isEmpty { sessionStore.updateToken(token); onComplete() } else { error = "Something went wrong. Please try again." }; loading = false } } catch { let message = error.localizedDescription.isEmpty ? "Connection error. Please try again." : error.localizedDescription; await MainActor.run { self.error = message; loading = false } } }
    }
    private var firstInvalidField: NativeAuthField { currentMode == .signup && !NativeAuthInputValidator.nameIsValid(name, mode: currentMode) ? .name : !emailValid ? .email : .password }
}

private struct NativeLaunchTextField: View {
    let title: String; let icon: String; @Binding var text: String; var keyboard: UIKeyboardType = .default; var capitalization: TextInputAutocapitalization = .sentences; var focus: FocusState<NativeAuthField?>.Binding? = nil; var field: NativeAuthField? = nil; var submitLabel: SubmitLabel = .next; var onSubmit: (() -> Void)? = nil
    var body: some View { HStack(spacing: 12) { Image(systemName: icon).foregroundColor(.white.opacity(0.42)).frame(width: 22).accessibilityHidden(true); TextField(title, text: $text).keyboardType(keyboard).textInputAutocapitalization(capitalization).disableAutocorrection(true).font(.system(size: 17, weight: .semibold)).foregroundColor(.white).tint(NativeLaunchTheme.cyan).submitLabel(submitLabel).onSubmit { onSubmit?() }.nativeAuthFocused(focus, equals: field) }.padding(.horizontal, 14).frame(minHeight: 52).background(Color.white.opacity(0.10)).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(text.isEmpty ? Color.white.opacity(0.16) : NativeLaunchTheme.emerald.opacity(0.35), lineWidth: 1.5)).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).accessibilityLabel(title) }
}

private struct NativeLaunchSecureField: View {
    let title: String; @Binding var text: String; var focus: FocusState<NativeAuthField?>.Binding? = nil; var field: NativeAuthField? = nil; var submitLabel: SubmitLabel = .go; var onSubmit: (() -> Void)? = nil
    var body: some View { HStack(spacing: 12) { Image(systemName: "lock.fill").foregroundColor(.white.opacity(0.42)).frame(width: 22).accessibilityHidden(true); SecureField(title, text: $text).font(.system(size: 17, weight: .semibold)).foregroundColor(.white).tint(NativeLaunchTheme.cyan).submitLabel(submitLabel).onSubmit { onSubmit?() }.nativeAuthFocused(focus, equals: field) }.padding(.horizontal, 14).frame(minHeight: 52).background(Color.white.opacity(0.10)).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(text.isEmpty ? Color.white.opacity(0.16) : NativeLaunchTheme.emerald.opacity(0.35), lineWidth: 1.5)).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).accessibilityLabel(title) }
}

private struct NativeSocialAuthButton: View {
    let title: String; let icon: String; let loading: Bool; let action: () -> Void
    var body: some View { Button(action: action) { HStack(spacing: 10) { Image(systemName: icon).font(.system(size: 18, weight: .black)).accessibilityHidden(true); Text(loading ? "Connecting…" : title).font(.system(size: 17, weight: .black)) }.foregroundColor(.black).frame(maxWidth: .infinity).frame(minHeight: 48).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)).shadow(color: Color.black.opacity(0.24), radius: 12, x: 0, y: 8) }.buttonStyle(.plain).disabled(loading).accessibilityLabel(title).accessibilityValue(loading ? "Connecting" : "Ready").accessibilityHint("Uses the native authentication adapter when provider setup is available. Email sign in remains available.") }
}

private extension View {
    @ViewBuilder func nativeAuthFocused(_ focus: FocusState<NativeAuthField?>.Binding?, equals field: NativeAuthField?) -> some View {
        if let focus, let field { self.focused(focus, equals: field) } else { self }
    }
}

private struct NativeLaunchCTA: View {
    let title: String; let color: LinearGradient; let foreground: Color; var height: CGFloat = 56; var cornerRadius: CGFloat = 16; var showArrow: Bool = false
    var body: some View { HStack(spacing: 8) { Text(title).font(.system(size: 17, weight: .bold)); if showArrow { Image(systemName: "arrow.right").font(.system(size: 20, weight: .semibold)) } }.foregroundColor(foreground).frame(maxWidth: .infinity).frame(height: height).background(color).clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)).shadow(color: NativeLaunchTheme.purple.opacity(0.25), radius: 18, x: 0, y: 12) }
}

private struct NativePasswordRecoverySheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var email: String
    @State private var didStage = false
    var body: some View { VStack(alignment: .leading, spacing: 16) { Button(action: { dismiss() }) { Label("Back to login", systemImage: "chevron.left").font(.system(size: 14, weight: .bold)).foregroundColor(.white.opacity(0.72)) }.buttonStyle(.plain); Text("Forgot your password?").font(.system(size: 34, weight: .black)).foregroundColor(.white); Text("Enter your email and we'll send a secure reset link if an account exists.").font(.system(size: 15, weight: .semibold)).foregroundColor(NativeLaunchTheme.body); NativeLaunchTextField(title: "Email address", icon: "envelope.fill", text: $email, keyboard: .emailAddress, capitalization: .never); Button(action: { nativeAuthImpactLight(); didStage = true }) { NativeLaunchCTA(title: didStage ? "Reset Link Staged" : "Send Reset Link", color: NativeLaunchTheme.gradient, foreground: .white) }.buttonStyle(.plain); if didStage { Text("If an account exists for that email, a reset link will be sent. Native route mirrors /auth/forgot without logging credentials.").font(.system(size: 13, weight: .bold)).foregroundColor(NativeLaunchTheme.emerald) }; Spacer() }.padding(24).background(NativeLaunchTheme.background.ignoresSafeArea()).accessibilityIdentifier("native-launch-password-recovery") }
}

private func nativeAuthImpactLight() {
    #if os(iOS)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    #endif
}
