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
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionStore = BytspotSessionStore()
    @StateObject private var bridgeStore = NativeBridgeStore()
    @StateObject private var navigation = NativeNavigationCoordinator()
    @StateObject private var authCoordinator = NativeAuthCoordinator()
    @StateObject private var apiState = NativeAPIState()
    @StateObject private var tabContentStore = NativeTabContentStore()
    @StateObject private var walletLedgerStore = NativeWalletLedgerStore()
    @StateObject private var membershipStore = NativeMembershipTierStore()
    @StateObject private var contactSyncStore = BytspotContactSyncStore()
    @StateObject private var appearanceRuntimeStore = NativeAppearanceRuntimeStore()
    @StateObject private var locationStore = NativeLocationStore()
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue
    @AppStorage(NativeLaunchPersonalizationStorage.atmosphereKey) private var launchAtmosphere = ""
    @State private var didCompleteLaunchFlow = false

    private var effectiveAppearance: NativeAppearanceMode {
        appearanceRuntimeStore.selectedMode ?? NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw)
    }

    init() {
        #if DEBUG
        if NativeMigrationConfig.shouldRunDebugSelfTests {
            NativeAuthSeamSelfTests.runIfRequested()
            NativeAuthSplashSelfTests.runIfRequested()
            NativeLaunchQuizIntentSelfTests.runIfRequested()
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
        }
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
            .environmentObject(walletLedgerStore)
            .environmentObject(membershipStore)
            .environmentObject(contactSyncStore)
            .environmentObject(appearanceRuntimeStore)
            .environmentObject(locationStore)
            .onAppear {
                NativeAppearanceMode.applyWindowStyle(NativeJourneyAtmosphere(rawValue: launchAtmosphere) == .nightlight ? .dark : effectiveAppearance)
                navigation.drainPendingURLs()
                bridgeStore.injectPatchScanBridgeSmokeTestIfRequested()
                locationStore.startIfAuthorized()
                Task {
                    await NativePushService.shared.refreshAuthorizationStatus()
                    await NativePushService.shared.reconcile(sessionToken: sessionStore.canAttachBearerToken ? sessionStore.token : nil)
                }
            }
            .task {
                await tabContentStore.refresh(sessionStore: sessionStore, location: locationStore.coordinate)
                await walletLedgerStore.refresh(sessionStore: sessionStore)
                await membershipStore.refresh(sessionStore: sessionStore)
                await contactSyncStore.refresh(sessionStore: sessionStore)
            }
            .onChange(of: sessionStore.token ?? "") { _ in
                Task {
                    await tabContentStore.refresh(sessionStore: sessionStore, location: locationStore.coordinate)
                    await walletLedgerStore.refresh(sessionStore: sessionStore)
                    await membershipStore.refresh(sessionStore: sessionStore)
                    await contactSyncStore.refresh(sessionStore: sessionStore)
                    await NativePushService.shared.reconcile(sessionToken: sessionStore.canAttachBearerToken ? sessionStore.token : nil)
                }
            }
            .onChange(of: scenePhase) { phase in
                guard phase == .active else { return }
                Task {
                    await membershipStore.refresh(sessionStore: sessionStore)
                    await NativePushService.shared.refreshAuthorizationStatus()
                    await NativePushService.shared.reconcile(sessionToken: sessionStore.canAttachBearerToken ? sessionStore.token : nil)
                }
            }
            .onChange(of: locationStore.lastLocation?.timestamp) { _ in
                tabContentStore.invalidateLocationScopedContent(for: locationStore.coordinate)
                Task { await tabContentStore.refresh(sessionStore: sessionStore, location: locationStore.coordinate) }
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
            .onReceive(NotificationCenter.default.publisher(for: NativePushService.tokenDidChangeNotification)) { _ in
                Task { await NativePushService.shared.reconcile(sessionToken: sessionStore.canAttachBearerToken ? sessionStore.token : nil) }
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
        if NativeAuthLaunchContract.bypassesLaunchFlow(for: navigation.requestedDestination) { return false }
        if NativeAuthLaunchContract.autoRunsLaunchJourney, didCompleteLaunchFlow || sessionStore.hasSecureToken { return false }
        if NativeAuthLaunchContract.requestedLaunchStage != nil { return true }
        if didCompleteLaunchFlow || sessionStore.hasSecureToken { return false }
        if NativeAuthLaunchContract.bypassesLaunchFlowForPreview { return false }
        return true
    }
}

enum NativeAuthLaunchContract {
    static let reactSources = ["SplashScreen.tsx", "LandingPage.tsx", "AuthenticationFlow.tsx", "AppleSignInButton.tsx", "GoogleSignInButton.tsx", "PasswordRecoveryScreen.tsx", "App.tsx onboarding quiz"]
    static let appFlow = ["splash", "landing", "location", "vibe", "walk", "crew", "recommendations", "main"]
    static let splashDurationSeconds = 1.8
    static let splashTagline = "Your perfect spot awaits"
    static let splashCapabilities = ["Parking", "Venues", "AI-Powered"]
    static let splashStartTitle = "Start your walkthrough"
    static let splashStartSubtitle = "Tap to follow the journey from Splash to picks."
    static let landingHeadline = "Know Before You Go."
    static let landingSubtitle = "Discover the right place, understand the arrival, and move with confidence."
    static let landingFeatures = ["Discover places matched to your moment", "See parking, crowd, and arrival context", "Keep access and reservations together"]
    static let atlantaLandingSubtitle = "Atlanta discovery made easier — from the right spot to the smoothest arrival."
    static let atlantaLandingFeatures = ["Discover trusted Atlanta places for your moment", "See parking, crowd, and arrival context", "Keep access and reservations together"]
    static let vibeQuestion = "What kind of night are we shaping?"
    static let vibeOptions = ["Dinner", "A good drink", "Something happening", "Date night"]
    static let walkQuestion = "How far are you comfortable going?"
    // "Easy arrival" used to sit here, but the resolver reads "arrival" as a
    // parking intent, so choosing it stored a category where a distance
    // belonged and the answer was silently lost.
    static let walkOptions = ["Right nearby", "A short walk", "Across town", "Somewhere new"]
    static let crewQuestion = "Who's coming with you?"
    static let crewOptions = ["Just me", "Two of us", "A group", "Work"]
    static let legacyAtlantaPickNames = ["Ladybird Grove & Mess Hall", "Livingston", "Lyla Lila"]
    static let legacyAtlantaPickNameTokens = legacyAtlantaPickNames.map(normalizedAtlantaPickName)
    static let authRoutes = NativeAuthRouteContract.routes
    static let authModes = ["signup", "login"]
    static let signupPasswordMinimum = 6
    static let reactSignupPasswordMinimum = 6
    static let emailValidationMessage = "Enter a valid email address."
    static let signupPasswordValidationMessage = "Use at least 6 characters."
    static let nameValidationMessage = "Enter your full name."
    static let signupSubmitValidationMessage = "Enter your name, a valid email address, and a password with at least 6 characters."
    static let loginSubmitValidationMessage = "Please enter a valid email address and password."

    static var requestedLaunchStage: NativeLaunchStage? {
        let env = ProcessInfo.processInfo.environment
        if truthy(env["BYT_NATIVE_PREVIEW_SPLASH"]) { return .splash }
        if truthy(env["BYT_NATIVE_PREVIEW_LANDING"]) { return .landing }
        if truthy(env["BYT_NATIVE_PREVIEW_LOCATION"]) { return .location }
        if env["BYT_NATIVE_PREVIEW_AUTH"] != nil { return .auth }
        switch env["BYT_NATIVE_PREVIEW_PERSONALIZATION"]?.lowercased() {
        case "vibe", "1", "true": return .vibe
        case "walk": return .walk
        case "crew": return .crew
        case "atlanta", "recommendations", "picks": return .recommendations
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

    /// A post-checkout Party universal link must continue directly to its
    /// verified Party Pass; first-run discovery onboarding is unrelated.
    static func bypassesLaunchFlow(for destination: NativeContextualDestination?) -> Bool {
        guard case .party = destination else { return false }
        return true
    }

    static func landingSubtitle(for location: NativeLocationCoordinate) -> String {
        NativeHomeRegionPresentation.isAtlanta(location) ? atlantaLandingSubtitle : landingSubtitle
    }

    static func landingFeatures(for location: NativeLocationCoordinate) -> [String] {
        NativeHomeRegionPresentation.isAtlanta(location) ? atlantaLandingFeatures : landingFeatures
    }

    static func isLegacyAtlantaPickName(_ name: String) -> Bool {
        legacyAtlantaPickNameTokens.contains(normalizedAtlantaPickName(name))
    }

    static func launchVenueCandidates(from venues: [NativeVenueSummary]) -> [NativeVenueSummary] {
        venues.filter { !isLegacyAtlantaPickName($0.name) }
    }

    static func normalizedAtlantaPickName(_ name: String) -> String {
        name
            .replacingOccurrences(of: "&", with: " and ")
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func truthy(_ raw: String?) -> Bool { ["1", "true", "yes"].contains(raw?.lowercased() ?? "") }
}

enum NativeLaunchStage { case splash, landing, location, vibe, walk, crew, recommendations, auth }
enum NativeAuthMode: String, CaseIterable { case signup, login }

enum NativeLaunchLocationContract {
    enum Phase: Equatable { case request, locating, ready, settings, unavailable }

    static let eyebrow = "MAKE IT LOCAL"
    static let headline = "Find what fits, right where you are."
    static let subtitle = "Location keeps recommendations close, makes arrival details useful, and prevents far-away results."
    static let benefits = [
        "Nearby discovery that follows you",
        "Relevant parking and arrival context",
        "Location only while you use Bytspot"
    ]

    static func phase(authorization: NativeLocationStore.AuthorizationState, hasResolvedLocation: Bool) -> Phase {
        switch authorization {
        case .notDetermined: return .request
        case .allowed: return hasResolvedLocation ? .ready : .locating
        case .denied, .restricted: return .settings
        case .unavailable: return .unavailable
        }
    }
}

enum NativeLaunchRecommendationPresentation {
    enum Mode: Equatable { case livePicks, loading, locationNeeded, localSync }

    static let capabilityTitles = ["Discover with context", "Simplify your arrival", "Keep everything together"]

    static func mode(location: NativeLocationCoordinate, hasPicks: Bool, hasTrustworthyLiveVenueInventory: Bool, isRefreshing: Bool) -> Mode {
        if hasPicks && hasTrustworthyLiveVenueInventory { return .livePicks }
        if location.isFallback { return .locationNeeded }
        return isRefreshing ? .loading : .localSync
    }
}

enum NativeLaunchPersonalizationStorage {
    static let atmosphereKey = "bytspot_native_launch_atmosphere"
    static let vibeKey = "bytspot_native_launch_vibe"
    static let walkKey = "bytspot_native_launch_walk"
    static let crewKey = "bytspot_native_launch_crew"
    static let completedKey = "bytspot_native_launch_completed"

    static func token(for option: String) -> String {
        let normalized = option.lowercased()
        if normalized.contains("drinks") || normalized.contains("good drink") || normalized.contains("keep the night going") || normalized.contains("keep going") { return "drinks" }
        if normalized.contains("coffee") { return "coffee" }
        if normalized.contains("dinner") { return "food" }
        if normalized.contains("food") || normalized.contains("real meal") || normalized.contains("something to eat") { return "food" }
        if normalized.contains("fitness") { return "fitness" }
        // "Somewhere quiet" is the daytime way of asking to sit and work.
        if normalized.contains("work") || normalized.contains("somewhere quiet") { return "work" }
        if normalized.contains("event") || normalized.contains("happening") { return "events" }
        if normalized.contains("parking") || normalized.contains("arrival") { return normalized.contains("covered") ? "covered_parking" : "parking" }
        if normalized.contains("place to stay") { return "sleep" }
        if normalized.contains("sleep") { return "sleep" }
        if normalized.contains("stay nearby") || normalized.contains("comfortable stay") { return "sleep" }
        if normalized.contains("ride") { return "ride" }
        if normalized.contains("5 min") || normalized.contains("short walk") { return "close" }
        if normalized.contains("10 min") || normalized.contains("across town") { return "medium" }
        if normalized.contains("open to explore") || normalized.contains("hidden gem") || normalized.contains("somewhere new") { return "far" }
        if normalized.contains("closest") || normalized.contains("right nearby") { return "closest" }
        if normalized.contains("boutique") { return "boutique" }
        if normalized.contains("hotel") { return "hotel" }
        if normalized.contains("apartment") || normalized.contains("private suite") { return "apartment" }
        if normalized.contains("short stay") || normalized.contains("tonight only") { return "short_stay" }
        if normalized.contains("just me") || normalized.contains("solo") { return "solo" }
        if normalized.contains("date") || normalized.contains("two of us") { return "date_night" }
        if normalized.contains("group") { return "group" }
        if normalized.contains("price") || normalized.contains("value") { return "price" }
        if normalized.contains("rated") || normalized.contains("reviewed") { return "rated" }
        if normalized.contains("safest") || normalized.contains("comfortable arrival") || normalized.contains("most comfortable") { return "safe" }
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
    /// The logo lockup is defined on near-black in BrandLogo.tsx, and the mark's
    /// own gradients are the only colours it is allowed to carry. Brand surfaces
    /// read these directly instead of the journey theme, whose accents change
    /// with intent and time of day.
    static let brandBackground = LinearGradient(colors: [Color.black, Color(hex: 0x140825), Color(hex: 0x020617)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let brandGlowPalette: [Color] = [cyan, purple, magenta]
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
    @EnvironmentObject private var tabContentStore: NativeTabContentStore
    @EnvironmentObject private var locationStore: NativeLocationStore
    @State private var stage = NativeAuthLaunchContract.requestedLaunchStage ?? .splash
    @State private var didScheduleAutorun = false

    var body: some View {
        Group {
            switch stage {
            case .splash:
                NativeSplashScreen(freeze: NativeAuthLaunchContract.freezesSplash) { advance(to: .landing) }
            case .landing:
                NativeLandingScreen(location: locationStore.coordinate, onGetStarted: { advance(to: .location) })
            case .location:
                NativeLaunchLocationScreen(onContinue: { advance(to: .vibe) }, onSkip: { advance(to: .vibe) })
            case .vibe:
                NativePersonalizationScreen(step: .vibe, location: locationStore.coordinate, onSelect: { selectedVibe = NativeLaunchPersonalizationStorage.token(for: $0); advance(to: .walk) }, onSkip: finishPersonalization)
            case .walk:
                NativePersonalizationScreen(step: .walk, location: locationStore.coordinate, selectedIntent: selectedVibe, onSelect: { selectedWalk = NativeLaunchPersonalizationStorage.token(for: $0); advance(to: .crew) }, onSkip: finishPersonalization)
            case .crew:
                NativePersonalizationScreen(step: .crew, location: locationStore.coordinate, selectedIntent: selectedVibe, onSelect: { selectedCrew = NativeLaunchPersonalizationStorage.token(for: $0); finishPersonalization() }, onSkip: finishPersonalization)
            case .recommendations:
                NativeLaunchReadyScreen(snapshot: tabContentStore.snapshot(for: locationStore.coordinate), location: locationStore.coordinate, isRefreshing: tabContentStore.isRefreshing, onContinue: completeAsGuest, onSignIn: { advance(to: .auth) })
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

    private func finishPersonalization() {
        completedPersonalization = true
        advance(to: .recommendations)
    }

    private func scheduleAutorunIfNeeded() {
        guard NativeAuthLaunchContract.autoRunsLaunchJourney, !didScheduleAutorun else { return }
        didScheduleAutorun = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { advance(to: .location) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { advance(to: .vibe) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { selectedVibe = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.vibe.options(context: NativeLaunchQuizContext.current, selectedIntent: "")[0]); advance(to: .walk) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { selectedWalk = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.walk.options(context: NativeLaunchQuizContext.current, selectedIntent: selectedVibe)[0]); advance(to: .crew) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { selectedCrew = NativeLaunchPersonalizationStorage.token(for: NativePersonalizationStep.crew.options(context: NativeLaunchQuizContext.current, selectedIntent: selectedVibe)[0]); finishPersonalization() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.2) { completeAsGuest() }
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
enum NativeLaunchQuizIntentSelfTests {
    /// Every answer the quiz can offer must resolve to an intent, across all
    /// three steps, all three times of day, and the sleep variants. The visible
    /// label is the storage key -- token(for:) matches substrings of it -- so a
    /// copy edit silently rewrites what an answer means, and an answer that
    /// resolves to nothing stores a token no consumer reads.
    ///
    /// Pinned as an explicit table rather than by detecting fallthrough: a label
    /// can legitimately equal its own token ("Work" -> "work"), so fallthrough is
    /// not observable by comparing the token against the filtered label.
    static let pinnedIntents: [String: String] = [
        "Dinner": "food", "A good drink": "drinks", "Something happening": "events", "Date night": "date_night",
        "Coffee": "coffee", "A real meal": "food", "Somewhere quiet": "work", "Easy parking": "parking",
        "Keep going": "drinks", "Something to eat": "food", "A place to stay": "sleep", "A ride home": "ride",
        "Right nearby": "closest", "A short walk": "close", "Across town": "medium", "Somewhere new": "far",
        "Just me": "solo", "Two of us": "date_night", "A group": "group", "Work": "work",
        "Full-service hotel": "hotel", "Boutique stay": "boutique", "Private suite": "apartment", "Tonight only": "short_stay",
        "Best value": "price", "Best reviewed": "rated", "Most comfortable": "safe",
    ]

    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        var offered: Set<String> = []
        for step in [NativePersonalizationStep.vibe, .walk, .crew] {
            for context in [NativeLaunchQuizContext.day, .evening, .lateNight] {
                for intent in ["", "sleep"] {
                    offered.formUnion(step.options(context: context, selectedIntent: intent))
                }
            }
        }
        for option in offered {
            guard let expected = pinnedIntents[option] else {
                preconditionFailure("NativeLaunchQuizIntentSelfTests: offered answer \"\(option)\" has no pinned intent.")
            }
            precondition(NativeLaunchPersonalizationStorage.token(for: option) == expected, "NativeLaunchQuizIntentSelfTests: offered answer \"\(option)\" resolved to \(NativeLaunchPersonalizationStorage.token(for: option)) instead of \(expected).")
        }
        // The distance step must never offer an arrival answer: the resolver
        // reads "arrival" as parking, so the distance would be silently lost.
        for context in [NativeLaunchQuizContext.day, .evening, .lateNight] {
            precondition(NativePersonalizationStep.walk.options(context: context, selectedIntent: "").allSatisfy { NativeLaunchPersonalizationStorage.token(for: $0) != "parking" }, "NativeLaunchQuizIntentSelfTests: a distance option resolved to a parking intent.")
        }
    }
}

enum NativeJourneyThemeSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        precondition(NativeJourneyAtmosphere.allCases.map(\.rawValue) == ["daylight", "nightlight"], "NativeJourneyThemeSelfTests: atmosphere names drifted.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .daylight, intent: "parking").intent == "parking", "NativeJourneyThemeSelfTests: intent should pass through resolver.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .nightlight, intent: "").intent == "brand", "NativeJourneyThemeSelfTests: empty intent should resolve to brand.")
        precondition(NativeJourneyTheme.resolve(atmosphere: .daylight, intent: "parking").glowOpacity < NativeJourneyTheme.resolve(atmosphere: .nightlight, intent: "parking").glowOpacity, "NativeJourneyThemeSelfTests: nightlight should carry stronger glow.")
        // The logo lockup carries only the mark's own colours. The journey theme
        // is deliberately intent- and time-of-day dependent, so the splash must
        // not read from it: in daylight its tertiary is emerald and its accents
        // follow the stored intent, which put a green glow and an hour-dependent
        // wordmark gradient beside a fixed cyan/purple/magenta mark.
        precondition(NativeLaunchTheme.brandGlowPalette == [NativeLaunchTheme.cyan, NativeLaunchTheme.purple, NativeLaunchTheme.magenta], "NativeJourneyThemeSelfTests: brand palette drifted from the mark.")
        precondition(![NativeLaunchTheme.orange, NativeLaunchTheme.red400, NativeLaunchTheme.emerald].contains(where: NativeLaunchTheme.brandGlowPalette.contains), "NativeJourneyThemeSelfTests: an intent accent leaked into the brand palette.")
    }
}
#endif

private struct NativeSplashScreen: View {
    static let glowOpacity: Double = 0.26
    let freeze: Bool
    let onComplete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let centerX = proxy.size.width * 0.5
            let centerY = proxy.size.height * 0.5
            ZStack {
                // Fixed brand palette, not the journey theme: in daylight the
                // theme's tertiary is emerald and its accents follow the stored
                // intent, so the first screen of the app rendered a green glow
                // and a different wordmark gradient depending on the hour.
                NativeLaunchTheme.brandBackground.ignoresSafeArea()
                splashOrb(color: NativeLaunchTheme.cyan, size: 420, x: centerX, y: centerY, intensity: NativeSplashScreen.glowOpacity)
                splashOrb(color: NativeLaunchTheme.purple, size: 320, x: centerX, y: proxy.size.height * 0.68, intensity: NativeSplashScreen.glowOpacity * 0.70)
                splashOrb(color: NativeLaunchTheme.magenta, size: 280, x: proxy.size.width * 0.82, y: centerY * 0.96, intensity: NativeSplashScreen.glowOpacity * 0.46)
                VStack(spacing: sizing.splashSpacing) {
                    NativeBytspotMark(size: sizing.splashMark, showGlow: true)
                        .scaleEffect(animate && !reduceMotion ? 1.025 : 1)
                    Text("BYTSPOT")
                        .font(.system(size: sizing.splashTitle, weight: .bold))
                        .foregroundStyle(NativeLaunchTheme.brandGradient)
                    HStack(spacing: 8) { ForEach(NativeLaunchTheme.brandGlowPalette, id: \.description) { Circle().fill($0).frame(width: 8.5, height: 8.5).opacity(animate && !reduceMotion ? 0.95 : 0.45).scaleEffect(animate && !reduceMotion ? 1.12 : 1) } }
                    Text(NativeAuthLaunchContract.splashTagline)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.76))
                    HStack(spacing: 8) {
                        ForEach(NativeAuthLaunchContract.splashCapabilities, id: \.self) { capability in
                            Text(capability)
                                .font(.system(size: 11, weight: .black))
                                .foregroundColor(.white.opacity(0.72))
                                .padding(.horizontal, 11)
                                .frame(minHeight: 30)
                                .background(Color.white.opacity(0.07))
                                .overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1))
                                .clipShape(Capsule())
                        }
                    }
                    if freeze {
                        VStack(spacing: 8) {
                            Button(action: { nativeAuthImpactLight(); onComplete() }) {
                                NativeLaunchCTA(title: NativeAuthLaunchContract.splashStartTitle, color: NativeLaunchTheme.brandGradient, foreground: .white, height: sizing.compactHeight ? 50 : 54, cornerRadius: 17, showArrow: true)
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
                .accessibilityLabel("BYTSPOT, \(NativeAuthLaunchContract.splashTagline), \(NativeAuthLaunchContract.splashCapabilities.joined(separator: ", "))")
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
    let location: NativeLocationCoordinate
    let onGetStarted: () -> Void

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
                NativeBytspotMark(size: sizing.landingMark, showGlow: true)
                    .position(x: centerX, y: proxy.size.height * 0.286)
                VStack(spacing: 8) {
                    NativeLaunchHeadline(size: sizing.landingTitle)
                    Text(NativeAuthLaunchContract.landingSubtitle(for: location)).font(.system(size: 15, weight: .regular)).foregroundColor(.white.opacity(0.60)).multilineTextAlignment(.center).lineSpacing(6)
                }
                .frame(width: contentWidth)
                .position(x: centerX, y: proxy.size.height * 0.426)
                VStack(spacing: 12) { ForEach(Array(NativeAuthLaunchContract.landingFeatures(for: location).enumerated()), id: \.offset) { _, feature in NativeLaunchFeaturePill(title: feature, compact: sizing.compactHeight) } }
                    .frame(width: contentWidth)
                    .position(x: centerX, y: featureY)
                Button(action: { nativeAuthImpactLight(); onGetStarted() }) { NativeLaunchCTA(title: "Get Started", color: theme.ctaGradient, foreground: .white, height: sizing.landingCTAHeight, cornerRadius: 16, showArrow: true) }
                    .buttonStyle(.plain)
                    .frame(width: contentWidth)
                    .position(x: centerX, y: ctaY)
                    .accessibilityHint("Explains location benefits before starting personalization.")
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

private struct NativeLaunchLocationScreen: View {
    let onContinue: () -> Void
    let onSkip: () -> Void
    @EnvironmentObject private var locationStore: NativeLocationStore
    @Environment(\.openURL) private var openURL
    @State private var didScheduleAdvance = false

    private var phase: NativeLaunchLocationContract.Phase {
        NativeLaunchLocationContract.phase(authorization: locationStore.authorizationState, hasResolvedLocation: locationStore.lastLocation != nil)
    }

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            let theme = NativeJourneyTheme.current()
            ZStack {
                theme.background.ignoresSafeArea()
                Circle().fill(theme.primary.opacity(theme.glowOpacity * 0.76)).frame(width: 420, height: 420).blur(radius: 110).offset(x: -130, y: -250)
                Circle().fill(theme.secondary.opacity(theme.glowOpacity * 0.58)).frame(width: 360, height: 360).blur(radius: 110).offset(x: 150, y: 260)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: sizing.compactHeight ? 16 : 20) {
                        HStack {
                            Text(NativeLaunchLocationContract.eyebrow).font(.system(size: 11, weight: .black)).tracking(1.5).foregroundColor(theme.primary)
                            Spacer()
                            Text("1 OF 4").font(.system(size: 11, weight: .black)).foregroundColor(.white.opacity(0.34))
                        }
                        locationMark(theme: theme)
                        VStack(spacing: 10) {
                            Text(NativeLaunchLocationContract.headline).font(.system(size: sizing.questionTitle + 2, weight: .black, design: .rounded)).foregroundColor(.white).multilineTextAlignment(.center)
                            Text(NativeLaunchLocationContract.subtitle).font(.system(size: 15, weight: .semibold)).foregroundColor(.white.opacity(0.58)).multilineTextAlignment(.center).lineSpacing(4)
                        }
                        VStack(spacing: 10) {
                            ForEach(Array(NativeLaunchLocationContract.benefits.enumerated()), id: \.offset) { index, benefit in
                                locationBenefit(index: index, title: benefit, theme: theme)
                            }
                        }
                        locationActions(theme: theme, sizing: sizing)
                        Text("You stay in control. Change location access anytime in iOS Settings.").font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.34)).multilineTextAlignment(.center)
                    }
                    .padding(sizing.cardPadding)
                    .frame(maxWidth: sizing.landingMaxWidth)
                    .nativeLaunchGlass(radius: 30, borderOpacity: 0.14)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, sizing.sheetHorizontalInset)
                    .padding(.vertical, sizing.compactHeight ? 12 : 28)
                }
            }
        }
        .accessibilityIdentifier("native-launch-location")
        .onAppear { if phase == .locating { locationStore.requestWhenInUseIfNeeded() }; scheduleAdvanceIfReady() }
        .onChange(of: locationStore.lastLocation?.timestamp) { _ in scheduleAdvanceIfReady() }
    }

    private func locationMark(theme: NativeJourneyTheme) -> some View {
        ZStack {
            Circle().fill(theme.primary.opacity(0.12)).frame(width: 92, height: 92)
            Circle().stroke(theme.primary.opacity(0.28), lineWidth: 1).frame(width: 92, height: 92)
            Image(systemName: phase == .ready ? "location.fill.viewfinder" : "location.viewfinder").font(.system(size: 38, weight: .semibold)).foregroundStyle(theme.ctaGradient)
        }
        .accessibilityHidden(true)
    }

    private func locationBenefit(index: Int, title: String, theme: NativeJourneyTheme) -> some View {
        let icons = ["sparkles", "car.side.fill", "hand.raised.fill"]
        return HStack(spacing: 12) {
            Image(systemName: icons[index]).font(.system(size: 15, weight: .bold)).foregroundColor(theme.primary).frame(width: 32, height: 32).background(theme.primary.opacity(0.10)).clipShape(Circle())
            Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(.white.opacity(0.82))
            Spacer(minLength: 0)
            Image(systemName: "checkmark").font(.system(size: 11, weight: .black)).foregroundColor(NativeLaunchTheme.emerald)
        }
        .padding(.horizontal, 14).frame(minHeight: 52).nativeLaunchTransparentCard(radius: 15)
        .accessibilityElement(children: .combine).accessibilityLabel(title)
    }

    @ViewBuilder private func locationActions(theme: NativeJourneyTheme, sizing: NativeLaunchSizing) -> some View {
        switch phase {
        case .request:
            Button(action: { nativeAuthImpactLight(); locationStore.requestWhenInUseIfNeeded() }) { NativeLaunchCTA(title: "Use My Location", color: theme.ctaGradient, foreground: .white, height: sizing.ctaHeight, showArrow: true) }.buttonStyle(.plain).accessibilityHint("Opens the iOS location permission request.")
            secondaryButton("Not Now", action: onSkip)
        case .locating:
            HStack(spacing: 10) { ProgressView().tint(theme.primary); Text("Finding your location…").font(.system(size: 15, weight: .bold)).foregroundColor(.white.opacity(0.78)) }.frame(maxWidth: .infinity).frame(height: sizing.ctaHeight).nativeLaunchTransparentCard(radius: 16)
            secondaryButton("Continue Without Location", action: onSkip)
        case .ready:
            Button(action: onContinue) { NativeLaunchCTA(title: "Location Ready", color: theme.ctaGradient, foreground: .white, height: sizing.ctaHeight, showArrow: true) }.buttonStyle(.plain)
        case .settings:
            Button(action: openSettings) { NativeLaunchCTA(title: "Open Location Settings", color: theme.ctaGradient, foreground: .white, height: sizing.ctaHeight, showArrow: true) }.buttonStyle(.plain)
            secondaryButton("Continue Without Location", action: onSkip)
        case .unavailable:
            Text("Location services are unavailable right now. You can still explore Bytspot.").font(.system(size: 13, weight: .bold)).foregroundColor(.white.opacity(0.58)).multilineTextAlignment(.center)
            secondaryButton("Continue Without Location", action: onSkip)
        }
    }

    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: { nativeAuthImpactLight(); action() }) { Text(title).font(.system(size: 14, weight: .black)).foregroundColor(.white.opacity(0.62)).frame(maxWidth: .infinity).frame(minHeight: 44) }
            .buttonStyle(.plain)
            .accessibilityHint("Continues onboarding without using your location.")
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
    }

    private func scheduleAdvanceIfReady() {
        guard phase == .ready, !didScheduleAdvance else { return }
        didScheduleAdvance = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { onContinue() }
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
        // Drawn natively to match BrandLogo.tsx geometry (120pt viewBox): the
        // gem is 28x36 and rides 10 units above the rings' centre, with the dot
        // and glow at the gem's own centre.
        // Asset-catalog SVG rendering drops gradient fills in Release builds,
        // so the mark must not depend on the catalog image.
        ZStack {
            Circle().stroke(outerRingGradient, lineWidth: size * (3.0 / 120.0))
                .frame(width: size * (96.0 / 120.0), height: size * (96.0 / 120.0))
            Circle().stroke(middleRingGradient, lineWidth: size * (2.0 / 120.0))
                .frame(width: size * (76.0 / 120.0), height: size * (76.0 / 120.0))
                .opacity(0.4)
            Hexagon().fill(hexFillGradient)
                .frame(width: size * (28.0 / 120.0), height: size * (36.0 / 120.0))
                .opacity(0.95)
                .overlay(Hexagon().stroke(hexBorderGradient, lineWidth: size * (1.5 / 120.0)).opacity(0.8))
                .offset(y: -size * (10.0 / 120.0))
            Circle().fill(centerGlowGradient)
                .frame(width: size * (24.0 / 120.0), height: size * (24.0 / 120.0))
                .offset(y: -size * (10.0 / 120.0))
            Circle().fill(centerDotGradient)
                .frame(width: size * (16.0 / 120.0), height: size * (16.0 / 120.0))
                .offset(y: -size * (10.0 / 120.0))
        }
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
    private var color: Color { title.contains("parking") ? NativeLaunchTheme.cyan400 : title.contains("Ride") ? NativeLaunchTheme.purple400 : NativeLaunchTheme.magenta }
}

enum NativeLaunchQuizContext {
    case day, evening, lateNight

    static var current: NativeLaunchQuizContext {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 22 || hour < 5 { return .lateNight }
        if hour >= 16 { return .evening }
        return .day
    }

    func line(for location: NativeLocationCoordinate) -> String {
        let area = NativeHomeRegionPresentation.isAtlanta(location) ? "near Midtown" : "near you"
        switch self {
        case .day: return "Daytime \(area) · coffee, food, quiet corners, and easy arrivals"
        case .evening: return "Evening \(area) · dinner, drinks, events, and easy arrivals"
        case .lateNight: return "Late night \(area) · keep going, get home, or land softly"
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
            return context == .lateNight ? "What would make tonight easier?" : context == .day ? "What would make the next hour easier?" : NativeAuthLaunchContract.vibeQuestion
        case .walk:
            return Self.isSleepIntent(selectedIntent) ? "What kind of landing feels right?" : NativeAuthLaunchContract.walkQuestion
        case .crew:
            return Self.isSleepIntent(selectedIntent) ? "What should feel effortless?" : NativeAuthLaunchContract.crewQuestion
        }
    }

    func contextLine(context: NativeLaunchQuizContext, location: NativeLocationCoordinate) -> String? { self == .vibe ? context.line(for: location) : nil }

    func options(context: NativeLaunchQuizContext, selectedIntent: String) -> [String] {
        switch self {
        case .vibe:
            switch context {
            case .day: return ["Coffee", "A real meal", "Somewhere quiet", "Easy parking"]
            case .evening: return NativeAuthLaunchContract.vibeOptions
            case .lateNight: return ["Keep going", "Something to eat", "A place to stay", "A ride home"]
            }
        case .walk:
            return Self.isSleepIntent(selectedIntent) ? ["Full-service hotel", "Boutique stay", "Private suite", "Tonight only"] : NativeAuthLaunchContract.walkOptions
        case .crew:
            return Self.isSleepIntent(selectedIntent) ? ["Right nearby", "Best value", "Best reviewed", "Most comfortable"] : NativeAuthLaunchContract.crewOptions
        }
    }

    static func isSleepIntent(_ token: String) -> Bool { token == "sleep" || token == "stay" }
}

private struct NativePersonalizationScreen: View {
    let step: NativePersonalizationStep
    let location: NativeLocationCoordinate
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
                    NativePersonalizationProgress(step: step.index + 1, total: 4)
                    Spacer()
                    Button(action: { nativeAuthImpactLight(); onSkip() }) { Text("Skip").font(.system(size: 14, weight: .bold)).foregroundColor(.white.opacity(0.36)).padding(.horizontal, 15).frame(height: 40).overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1)) }.buttonStyle(.plain).accessibilityLabel("Skip personalization").accessibilityHint("Moves to your Bytspot ready screen.")
                }
                Text(emoji).font(.system(size: sizing.compactHeight ? 24 : 28)).accessibilityHidden(true)
                if let contextLine = step.contextLine(context: context, location: location) { Text(contextLine).font(.system(size: 11, weight: .bold)).foregroundColor(theme.primary.opacity(0.88)).multilineTextAlignment(.center).padding(.horizontal, 12).padding(.vertical, 7).background(theme.primary.opacity(0.10)).overlay(Capsule().stroke(theme.primary.opacity(0.20), lineWidth: 1)).clipShape(Capsule()) }
                Text(question).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white).multilineTextAlignment(.center)
                LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    ForEach(options, id: \.self) { option in
                        Button(action: { nativeAuthImpactLight(); onSelect(option) }) { Text(option).font(.system(size: 17, weight: .black)).foregroundColor(.white).multilineTextAlignment(.center).minimumScaleFactor(0.7).lineLimit(2).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 10).padding(.vertical, 8).frame(maxWidth: .infinity).frame(minHeight: sizing.compactHeight ? 56 : 62).background(Color.white.opacity(0.075)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(theme.primary.opacity(0.24), lineWidth: 2)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)) }
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

private struct NativeLaunchReadyScreen: View {
    let snapshot: NativeTabContentSnapshot
    let location: NativeLocationCoordinate
    let isRefreshing: Bool
    let onContinue: () -> Void
    let onSignIn: () -> Void
    @AppStorage(NativeLaunchPersonalizationStorage.vibeKey) private var selectedVibe = ""
    @AppStorage(NativeLaunchPersonalizationStorage.walkKey) private var selectedWalk = ""
    @AppStorage(NativeLaunchPersonalizationStorage.crewKey) private var selectedCrew = ""

    private var picks: [NativeLaunchPick] {
        Self.rankedPicks(snapshot: snapshot, location: location, intent: selectedVibe, walk: selectedWalk, crew: selectedCrew)
    }

    private var presentation: NativeLaunchRecommendationPresentation.Mode {
        NativeLaunchRecommendationPresentation.mode(location: location, hasPicks: !picks.isEmpty, hasTrustworthyLiveVenueInventory: snapshot.hasTrustworthyLiveVenueInventory, isRefreshing: isRefreshing)
    }

    private var headline: String { presentation == .livePicks ? "Your picks are ready" : "Your Bytspot is ready" }

    private var subtitle: String {
        switch presentation {
        case .livePicks: return "Matched to your preferences, location, and what is available now."
        case .loading: return "Building your nearby shortlist. You can start exploring while live matches finish loading."
        case .locationNeeded: return "Explore the full experience now. Turn on location anytime to unlock verified nearby picks."
        case .localSync: return "Your preferences are saved. Nearby recommendations will keep updating as local inventory becomes available."
        }
    }

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
                HStack { Label("PERSONALIZED FOR YOU", systemImage: "checkmark.seal.fill").font(.system(size: 11, weight: .black)).foregroundColor(theme.primary); Spacer() }
                VStack(spacing: 8) { Image(systemName: presentation == .livePicks ? "sparkles" : "checkmark.circle.fill").font(.system(size: sizing.compactHeight ? 28 : 34, weight: .bold)).foregroundStyle(theme.ctaGradient).accessibilityHidden(true); Text(headline).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white); Text(subtitle).font(.system(size: 14.5, weight: .bold)).foregroundColor(.white.opacity(0.54)).multilineTextAlignment(.center).lineSpacing(3) }
                recommendationContent(theme: theme)
                Text("Explore as a guest. Sign in anytime to save places, preferences, and reservations.").font(.system(size: 12, weight: .bold)).foregroundColor(.white.opacity(0.38)).multilineTextAlignment(.center)
                Button(action: { nativeAuthImpactLight(); onContinue() }) { NativeLaunchCTA(title: "Start Exploring", color: theme.ctaGradient, foreground: .black, height: sizing.ctaHeight, showArrow: true) }.buttonStyle(.plain).accessibilityHint("Opens the Bytspot Home experience in guest mode.")
                Button(action: { nativeAuthImpactLight(); onSignIn() }) { Text("Sign in to save your experience").font(.system(size: 14, weight: .black)).foregroundColor(theme.primary).frame(maxWidth: .infinity).frame(minHeight: 44).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(theme.primary.opacity(0.28), lineWidth: 1)) }
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
                .accessibilityIdentifier("native-launch-ready")
            }
        }
    }

    @ViewBuilder private func recommendationContent(theme: NativeJourneyTheme) -> some View {
        if presentation == .livePicks {
            VStack(spacing: 10) { ForEach(Array(picks.enumerated()), id: \.element.id) { index, pick in NativeLaunchPickRow(medal: ["1", "2", "3"][index], title: pick.title, address: pick.subtitle, label: pick.label, color: pick.color) } }
        } else {
            VStack(spacing: 10) {
                if presentation == .loading { HStack(spacing: 9) { ProgressView().tint(theme.primary); Text("Syncing nearby recommendations…").font(.system(size: 12.5, weight: .black)).foregroundColor(theme.primary) }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4) }
                readinessRow(icon: "sparkles", title: "Discover with context", subtitle: "Places shaped around your mood, timing, and distance.", theme: theme)
                readinessRow(icon: "car.side.fill", title: "Simplify your arrival", subtitle: "Parking, routing, and access details in the same flow.", theme: theme)
                readinessRow(icon: "square.stack.3d.up.fill", title: "Keep everything together", subtitle: "Save places, passes, reservations, and preferences.", theme: theme)
            }
        }
    }

    private func readinessRow(icon: String, title: String, subtitle: String, theme: NativeJourneyTheme) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .bold)).foregroundColor(theme.primary).frame(width: 34, height: 34).background(theme.primary.opacity(0.10)).clipShape(Circle()).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 14.5, weight: .black)).foregroundColor(.white); Text(subtitle).font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.42)).lineLimit(2) }
            Spacer(minLength: 0)
        }
        .padding(13).nativeLaunchTransparentCard(radius: 16, fillOpacity: 0.065)
        .accessibilityElement(children: .combine).accessibilityLabel("\(title). \(subtitle)")
    }

    static func rankedPicks(snapshot: NativeTabContentSnapshot, location: NativeLocationCoordinate, intent: String, walk: String, crew: String, limit: Int = 3) -> [NativeLaunchPick] {
        guard snapshot.hasTrustworthyLiveVenueInventory else { return [] }
        let candidates = NativeAuthLaunchContract.launchVenueCandidates(from: snapshot.trustworthyLiveVenues)
        return candidates.sorted { first, second in
            let firstScore = score(first, location: location, intent: intent, walk: walk, crew: crew)
            let secondScore = score(second, location: location, intent: intent, walk: walk, crew: crew)
            if firstScore != secondScore { return firstScore > secondScore }
            let firstDistance = location.distanceMiles(toLatitude: first.latitude, longitude: first.longitude) ?? .greatestFiniteMagnitude
            let secondDistance = location.distanceMiles(toLatitude: second.latitude, longitude: second.longitude) ?? .greatestFiniteMagnitude
            return firstDistance == secondDistance ? first.name < second.name : firstDistance < secondDistance
        }.prefix(limit).map { NativeLaunchPick(venue: $0, location: location) }
    }

    private static func score(_ venue: NativeVenueSummary, location: NativeLocationCoordinate, intent: String, walk: String, crew: String) -> Double {
        let type = venue.discoverType
        let preferred = preferredTypes(intent: intent, crew: crew)
        let miles = location.distanceMiles(toLatitude: venue.latitude, longitude: venue.longitude) ?? 8
        var value = 100.0 - min(miles * 8, 48)
        if preferred.first == type { value += 64 } else if preferred.contains(type) { value += 36 }
        if venue.verifiedPatchId != nil { value += 14 }
        if isParkingIntent(intent) && (type == "parking" || venue.parking.totalAvailable > 0) { value += 28 + min(Double(venue.parking.totalAvailable) / 2, 18) }
        if crew == "safe" && (venue.verifiedPatchId != nil || type == "parking") { value += 12 }
        if let maxWalk = maxWalkMiles(walk), miles > maxWalk { value -= min((miles - maxWalk) * 18, 42) }
        if let crowdLevel = venue.crowd?.level { value += Double(max(0, 4 - crowdLevel)) * 3 }
        return value
    }

    private static func preferredTypes(intent: String, crew: String) -> [String] {
        var types: [String]
        switch intent {
        case "parking", "covered_parking": types = ["parking"]
        case "coffee", "work": types = ["coffee", "dining"]
        case "events": types = ["entertainment", "nightlife"]
        case "drinks": types = ["nightlife", "dining"]
        case "food": types = ["dining", "coffee"]
        case "ride": types = ["parking", "venue"]
        default: types = ["dining", "coffee", "parking", "entertainment"]
        }
        if crew == "safe" { types.insert("parking", at: 0) }
        if crew == "group" { types.append(contentsOf: ["nightlife", "entertainment"]) }
        if crew == "date_night" { types.append(contentsOf: ["dining", "nightlife"]) }
        return types.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
    }

    private static func isParkingIntent(_ intent: String) -> Bool { intent == "parking" || intent == "covered_parking" }

    private static func maxWalkMiles(_ walk: String) -> Double? {
        switch walk {
        case "close", "closest": return 1.0
        case "medium": return 3.0
        default: return nil
        }
    }
}

private struct NativeLaunchPick: Identifiable {
    let id: String; let title: String; let subtitle: String; let label: String; let color: Color

    init(venue: NativeVenueSummary, location: NativeLocationCoordinate) {
        let distance = location.distanceLabel(toLatitude: venue.latitude, longitude: venue.longitude) ?? venue.distance
        id = venue.id
        title = venue.name
        subtitle = [distance == "—" ? "Nearby" : distance, venue.address].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.joined(separator: " · ")
        label = venue.crowd?.label ?? (venue.discoverType == "parking" ? "Parking" : "Nearby")
        color = venue.discoverType == "parking" ? NativeLaunchTheme.emerald : (venue.crowd?.level ?? 2) <= 1 ? NativeLaunchTheme.cyan : NativeLaunchTheme.emerald
    }
}

private struct NativeLaunchPickRow: View {
    let medal: String; let title: String; let address: String; let label: String; let color: Color
    var body: some View { HStack(spacing: 12) { Text(medal).font(.system(size: 20)).accessibilityHidden(true); VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 17, weight: .black)).foregroundColor(.white).lineLimit(1); Text(address).font(.system(size: 13, weight: .bold)).foregroundColor(.white.opacity(0.36)).lineLimit(1) }; Spacer(); Text(label).font(.system(size: 12, weight: .black)).foregroundColor(color).padding(.horizontal, 10).padding(.vertical, 5).background(color.opacity(0.16)).overlay(Capsule().stroke(color.opacity(0.34), lineWidth: 1)).clipShape(Capsule()) }.padding(14).nativeLaunchTransparentCard(radius: 16, fillOpacity: 0.065).accessibilityElement(children: .ignore).accessibilityLabel("\(title), \(address), \(label)") }
}

@MainActor enum NativeEmailAuthSessionPersistence {
    static func persist(_ response: NativeAuthResponse, in sessionStore: BytspotSessionStore) -> Bool {
        let token = response.token?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let userID = response.user?.id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !token.isEmpty, !userID.isEmpty else {
            NativeSignedInIdentity.clear()
            sessionStore.signOut()
            return false
        }
        guard sessionStore.updateSession(token: token, userID: userID) else { return false }
        NativeSignedInIdentity.store(displayName: response.user?.name)
        NativeSignedInIdentity.recordRestoration(response.deletionCancelled == true, userID: userID)
        return true
    }
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
    @State private var didCompleteAuth = false
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
                NativeSocialAuthButton(title: "Continue with Apple", icon: "apple.logo", loading: loading || isAuthenticating(.apple)) { signIn(.apple) }
                NativeSocialAuthButton(title: "Continue with Google", icon: "person.crop.circle.badge.plus", loading: loading || isAuthenticating(.google)) { signIn(.google) }
                HStack { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1); Text("or use email").font(.system(size: 12, weight: .bold)).foregroundColor(NativeLaunchTheme.muted); Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }.accessibilityHidden(true)
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
                    if !error.isEmpty { Text(error).font(.system(size: 13, weight: .bold)).foregroundColor(.red.opacity(0.92)).frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color.red.opacity(0.16)).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)).accessibilityLabel("Account error. \(error)") }
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
        .onChange(of: authCoordinator.status) { status in
            if case .signedIn = status { completeAuthIfReady() }
            else if case .failed(let message) = status { error = message }
            else if case .requiresLegacyFallback(let provider) = status { error = "\(provider.title) isn't available right now. Use email or try again later." }
        }
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
    private func completeAuthIfReady() { guard !didCompleteAuth, sessionStore.isAuthenticated else { return }; didCompleteAuth = true; onComplete() }
    @ViewBuilder private func validationCopy(_ message: String) -> some View { Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(.orange.opacity(0.92)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4).accessibilityLabel(message) }
    private func advanceFocus(after field: NativeAuthField) { touchedFields.insert(field); switch field { case .name: focusedField = .invite; case .invite: focusedField = .email; case .email: focusedField = .password; case .password: submitEmailAuth() } }
    private func submitEmailAuth() {
        guard canSubmit else { touchedFields.formUnion([.name, .email, .password]); error = NativeAuthInputValidator.submitValidationMessage(mode: currentMode); focusedField = firstInvalidField; nativeAuthImpactLight(); return }
        error = ""; focusedField = nil; nativeAuthImpactLight()
        loading = true; let selectedMode = currentMode
        Task {
            do {
                let response = selectedMode == .signup
                    ? try await api.signup(email: email, password: password, name: name, ref: inviteCode.isEmpty ? nil : inviteCode)
                    : try await api.login(email: email, password: password)
                await MainActor.run {
                    if NativeEmailAuthSessionPersistence.persist(response, in: sessionStore) {
                        completeAuthIfReady()
                    } else {
                        error = "We couldn't save your sign-in. Please try again."
                    }
                    loading = false
                }
            } catch {
                let message = NativeAuthDataAPI.userMessage(for: error, mode: selectedMode)
                await MainActor.run { self.error = message; loading = false }
            }
        }
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
    var body: some View { Button(action: action) { HStack(spacing: 10) { Image(systemName: icon).font(.system(size: 18, weight: .black)).accessibilityHidden(true); Text(loading ? "Connecting…" : title).font(.system(size: 17, weight: .black)) }.foregroundColor(.black).frame(maxWidth: .infinity).frame(minHeight: 48).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)).shadow(color: Color.black.opacity(0.24), radius: 12, x: 0, y: 8) }.buttonStyle(.plain).disabled(loading).accessibilityLabel(title).accessibilityValue(loading ? "Connecting" : "Ready").accessibilityHint("Sign in with this account. Email sign in is also available.") }
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
