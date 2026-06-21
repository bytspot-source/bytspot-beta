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
    @State private var didCompleteLaunchFlow = false

    private var effectiveAppearance: NativeAppearanceMode {
        appearanceRuntimeStore.selectedMode ?? NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw)
    }

    init() {
        #if DEBUG
        NativeAuthSeamSelfTests.runIfRequested()
        NativeAuthSplashSelfTests.runIfRequested()
        NativePatchRouteSelfTests.runIfRequested()
        NativePatchBookingSelfTests.runIfRequested()
        NativePatchSpecialFlowSelfTests.runIfRequested()
        NativeShellThemeSelfTests.runIfRequested()
        NativeHomeParitySelfTests.runIfRequested()
        NativeMapParitySelfTests.runIfRequested()
        NativeAccessParitySelfTests.runIfRequested()
        NativeBookingParitySelfTests.runIfRequested()
        NativeAccountParitySelfTests.runIfRequested()
        NativeDiscoverParitySelfTests.runIfRequested()
        NativeConciergeParitySelfTests.runIfRequested()
        NativePhase4TabContentSelfTests.runIfRequested()
        NativeContactSyncSelfTests.runIfRequested()
        #endif
    }

    var body: some View {
        Group {
            if shouldShowLaunchFlow {
                NativeLaunchFlowView(sessionStore: sessionStore, authCoordinator: authCoordinator) { didCompleteLaunchFlow = true }
                    .preferredColorScheme(effectiveAppearance.preferredColorScheme)
            } else {
                BytspotNativeShellView(bridgeStore: bridgeStore, navigation: navigation)
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
                NativeAppearanceMode.applyWindowStyle(effectiveAppearance)
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
    static let splashDurationSeconds = 3.0
    static let splashTagline = "Your perfect spot awaits"
    static let splashFeatureChips = ["Parking", "Venues", "AI-Powered"]
    static let landingHeadline = "Know Before You Go."
    static let landingSubtitle = "Live crowd levels, parking & ride ETAs for Atlanta Midtown — all in one place."
    static let landingFeatures = ["Live crowd levels at Midtown venues", "Smart parking with live spot availability", "Ride ETAs & valet options nearby"]
    static let vibeQuestion = "What's your vibe tonight?"
    static let vibeOptions = ["🍸 Drinks", "☕ Coffee", "🍔 Food", "🏋️ Fitness"]
    static let walkQuestion = "How far will you walk?"
    static let walkOptions = ["🚶 < 5 min", "🚶‍♀️ 10 min", "🚌 Anywhere"]
    static let crewQuestion = "Solo or with crew?"
    static let crewOptions = ["🙋 Solo", "👫 Date night", "👥 Group"]
    static let atlantaHeadline = "Here's your Atlanta"
    static let atlantaSubtitle = "Tonight's top picks, just for you"
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
    static let vibeKey = "bytspot_native_launch_vibe"
    static let walkKey = "bytspot_native_launch_walk"
    static let crewKey = "bytspot_native_launch_crew"
    static let completedKey = "bytspot_native_launch_completed"

    static func token(for option: String) -> String {
        let normalized = option.lowercased()
        if normalized.contains("drinks") { return "drinks" }
        if normalized.contains("coffee") { return "coffee" }
        if normalized.contains("food") { return "food" }
        if normalized.contains("fitness") { return "fitness" }
        if normalized.contains("5 min") { return "walk_lt_5" }
        if normalized.contains("10 min") { return "walk_10" }
        if normalized.contains("anywhere") { return "walk_anywhere" }
        if normalized.contains("solo") { return "solo" }
        if normalized.contains("date") { return "date_night" }
        if normalized.contains("group") { return "group" }
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
    static let background = Color(red: 0.004, green: 0.004, blue: 0.012)
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
    static let card = Color(red: 13 / 255, green: 13 / 255, blue: 24 / 255).opacity(0.96)
    static let gradient = LinearGradient(colors: [purple, pink, cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let ctaGradient = LinearGradient(colors: [purple, Color(red: 117 / 255, green: 155 / 255, blue: 1), cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
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
                NativePersonalizationScreen(step: .walk, onSelect: { selectedWalk = NativeLaunchPersonalizationStorage.token(for: $0); advance(to: .crew) }, onSkip: completeAsGuest)
            case .crew:
                NativePersonalizationScreen(step: .crew, onSelect: { selectedCrew = NativeLaunchPersonalizationStorage.token(for: $0); completedPersonalization = true; advance(to: .atlanta) }, onSkip: completeAsGuest)
            case .atlanta:
                NativeAtlantaPicksScreen(onContinue: completeAsGuest, onSignIn: { advance(to: .auth) })
            case .auth:
                NativeAuthenticationScreen(mode: NativeAuthLaunchContract.requestedAuthMode, sessionStore: sessionStore, authCoordinator: authCoordinator, onComplete: onComplete, onBack: { advance(to: .landing) })
            }
        }
        .background(NativeLaunchTheme.background.ignoresSafeArea())
        .transition(reduceMotion ? .identity : .opacity.combined(with: .scale(scale: 0.985)))
        .onAppear { scheduleAutorunIfNeeded() }
        .onChange(of: sessionStore.token ?? "") { _ in if sessionStore.hasSecureToken { onComplete() } }
    }

    private func advance(to next: NativeLaunchStage) {
        if reduceMotion { stage = next } else { withAnimation(.spring(response: 0.38, dampingFraction: 0.88)) { stage = next } }
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { selectedVibe = NativeLaunchPersonalizationStorage.token(for: NativeAuthLaunchContract.vibeOptions[0]); advance(to: .walk) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { selectedWalk = NativeLaunchPersonalizationStorage.token(for: NativeAuthLaunchContract.walkOptions[0]); advance(to: .crew) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { selectedCrew = NativeLaunchPersonalizationStorage.token(for: NativeAuthLaunchContract.crewOptions[0]); completedPersonalization = true; advance(to: .atlanta) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.4) { completeAsGuest() }
    }
}

private struct NativeLaunchSizing {
    let size: CGSize
    var compactHeight: Bool { size.height < 720 }
    var narrowWidth: Bool { size.width < 380 }
    var horizontalPadding: CGFloat { narrowWidth ? 18 : 24 }
    var cardPadding: CGFloat { compactHeight ? 22 : 28 }
    var splashSpacing: CGFloat { compactHeight ? 22 : 30 }
    var splashMark: CGFloat { compactHeight ? 132 : min(172, size.height * 0.205) }
    var splashTitle: CGFloat { narrowWidth ? 48 : 58 }
    var landingMark: CGFloat { compactHeight ? 84 : 96 }
    var landingTitle: CGFloat { narrowWidth ? 31 : 35 }
    var landingCTAHeight: CGFloat { compactHeight ? 62 : 70 }
    var sheetHorizontalInset: CGFloat { narrowWidth ? 14 : 18 }
    var sheetMaxHeightFraction: CGFloat { compactHeight ? 0.80 : 0.84 }
    var questionTitle: CGFloat { compactHeight ? 23 : 26 }
    var authTopPadding: CGFloat { compactHeight ? 14 : 24 }
    var ctaHeight: CGFloat { compactHeight ? 52 : 56 }
}

private struct NativeSplashScreen: View {
    let freeze: Bool
    let onComplete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            ZStack {
                NativeLaunchTheme.background.ignoresSafeArea()
                splashOrb(color: NativeLaunchTheme.cyan, size: 260, x: -110, y: -210, opacity: 0.10)
                splashOrb(color: NativeLaunchTheme.purple, size: 430, x: 0, y: 30, opacity: 0.16)
                splashOrb(color: NativeLaunchTheme.magenta, size: 360, x: 105, y: 250, opacity: 0.10)
                VStack(spacing: sizing.splashSpacing) {
                    NativeBytspotMark(size: sizing.splashMark)
                    .scaleEffect(animate && !reduceMotion ? 1.04 : 1)
                    .shadow(color: NativeLaunchTheme.purple.opacity(0.46), radius: 30, x: 0, y: 16)
                Text("BYTSPOT")
                    .font(.system(size: sizing.splashTitle, weight: .black, design: .rounded))
                    .foregroundStyle(LinearGradient(colors: [NativeLaunchTheme.magenta, NativeLaunchTheme.pink, NativeLaunchTheme.purple], startPoint: .leading, endPoint: .trailing))
                HStack(spacing: 9) { ForEach([NativeLaunchTheme.cyan, NativeLaunchTheme.magenta, NativeLaunchTheme.orange], id: \.description) { Circle().fill($0).frame(width: 11, height: 11).scaleEffect(animate && !reduceMotion ? 1.28 : 1) } }
                Text(NativeAuthLaunchContract.splashTagline).font(.system(size: 17, weight: .bold)).foregroundColor(.white.opacity(0.78))
                HStack(spacing: 8) { ForEach(NativeAuthLaunchContract.splashFeatureChips, id: \.self) { Text($0).font(.system(size: 11, weight: .black)).foregroundColor(chipColor($0)).padding(.horizontal, 14).padding(.vertical, 7).background(Color.black.opacity(0.30)).overlay(Capsule().stroke(chipColor($0).opacity(0.68), lineWidth: 1)).clipShape(Capsule()) } }
                    .accessibilityLabel(NativeAuthLaunchContract.splashFeatureChips.joined(separator: ", "))
                }
                .padding(.horizontal, sizing.horizontalPadding)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("BYTSPOT. \(NativeAuthLaunchContract.splashTagline). \(NativeAuthLaunchContract.splashFeatureChips.joined(separator: ", ")).")
                .accessibilityIdentifier("native-launch-splash")
            }
        }
        .onAppear {
            if !reduceMotion { withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { animate = true } }
            guard !freeze else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + NativeAuthLaunchContract.splashDurationSeconds) { onComplete() }
        }
    }

    private func splashOrb(color: Color, size: CGFloat, x: CGFloat, y: CGFloat, opacity: Double) -> some View { Circle().fill(color.opacity(opacity)).frame(width: size, height: size).blur(radius: 70).offset(x: x, y: y).scaleEffect(animate && !reduceMotion ? 1.10 : 1) }
    private func chipColor(_ title: String) -> Color { title == "Parking" ? NativeLaunchTheme.cyan : title == "Venues" ? NativeLaunchTheme.magenta : NativeLaunchTheme.purple }
}

private struct NativeLandingScreen: View {
    let onGetStarted: () -> Void
    let onContinueGuest: () -> Void

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            ZStack {
                NativeLaunchTheme.background.ignoresSafeArea()
                Circle().fill(NativeLaunchTheme.purple.opacity(0.14)).frame(width: 480, height: 480).blur(radius: 110).offset(y: -95)
                Circle().fill(NativeLaunchTheme.cyan.opacity(0.10)).frame(width: 380, height: 380).blur(radius: 110).offset(y: 285)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: sizing.compactHeight ? 20 : 24) {
                Spacer(minLength: sizing.compactHeight ? 48 : 92)
                NativeBytspotMark(size: sizing.landingMark)
                VStack(spacing: 14) {
                    HStack(spacing: 0) {
                        Text("Know ").foregroundColor(.white)
                        Text("Before").foregroundStyle(NativeLaunchTheme.gradient)
                        Text(" You Go.").foregroundColor(.white)
                    }
                    .font(.system(size: sizing.landingTitle, weight: .black, design: .rounded))
                    .multilineTextAlignment(.center)
                    Text(NativeAuthLaunchContract.landingSubtitle).font(.system(size: 17, weight: .bold)).foregroundColor(NativeLaunchTheme.body).multilineTextAlignment(.center).lineSpacing(5)
                }
                VStack(spacing: 14) { ForEach(Array(NativeAuthLaunchContract.landingFeatures.enumerated()), id: \.offset) { _, feature in NativeLaunchFeaturePill(title: feature, compact: sizing.compactHeight) } }
                Button(action: { nativeAuthImpactLight(); onGetStarted() }) { NativeLaunchCTA(title: "Let's Go  →", color: NativeLaunchTheme.ctaGradient, foreground: .white, height: sizing.landingCTAHeight, cornerRadius: 18) }.buttonStyle(.plain).accessibilityHint("Starts the launch personalization questions. You can still skip from the personalization steps.")
                Spacer(minLength: sizing.compactHeight ? 44 : 96)
                Text("By continuing, you agree to our Terms & Privacy").font(.system(size: 12, weight: .semibold)).foregroundColor(NativeLaunchTheme.muted).padding(.bottom, 10)
                    }
                    .frame(minHeight: proxy.size.height)
                    .padding(.horizontal, sizing.horizontalPadding)
                    .accessibilityIdentifier("native-launch-landing")
                }
            }
        }
    }
}

private struct NativeBytspotMark: View {
    let size: CGFloat
    var body: some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [NativeLaunchTheme.purple.opacity(0.22), Color.black.opacity(0.76)], center: .center, startRadius: 2, endRadius: size * 0.48))
            Circle().stroke(NativeLaunchTheme.cyan, lineWidth: max(4, size * 0.038))
            Circle().stroke(NativeLaunchTheme.purple.opacity(0.72), lineWidth: max(2.2, size * 0.024)).padding(size * 0.18)
            Hexagon().fill(LinearGradient(colors: [NativeLaunchTheme.cyan, NativeLaunchTheme.pink, NativeLaunchTheme.purple], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: size * 0.32, height: size * 0.32)
                .overlay(Hexagon().stroke(NativeLaunchTheme.cyan.opacity(0.82), lineWidth: max(1.7, size * 0.015)))
                .shadow(color: NativeLaunchTheme.purple.opacity(0.70), radius: size * 0.13, x: 0, y: 0)
            Circle().fill(LinearGradient(colors: [NativeLaunchTheme.cyan, Color(red: 66 / 255, green: 120 / 255, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: size * 0.16, height: size * 0.16)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Bytspot logo")
    }
}

private struct Hexagon: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        var path = Path()
        for index in 0..<6 {
            let angle = CGFloat(index) * .pi / 3 - .pi / 2
            let point = CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
            index == 0 ? path.move(to: point) : path.addLine(to: point)
        }
        path.closeSubpath()
        return path
    }
}

private struct NativeLaunchFeaturePill: View {
    let title: String
    let compact: Bool
    var body: some View { HStack(spacing: 14) { Image(systemName: icon).font(.system(size: 15, weight: .black)).foregroundColor(color).frame(width: 36, height: 36).accessibilityHidden(true); Text(title).font(.system(size: compact ? 14 : 15, weight: .bold)).foregroundColor(.white.opacity(0.78)); Spacer() }.padding(.horizontal, 18).frame(minHeight: compact ? 58 : 70).background(NativeLaunchTheme.panel).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(NativeLaunchTheme.border, lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).accessibilityElement(children: .combine).accessibilityLabel(title) }
    private var icon: String { title.contains("parking") ? "car.fill" : title.contains("Ride") ? "clock.fill" : "dot.radiowaves.left.and.right" }
    private var color: Color { title.contains("parking") ? NativeLaunchTheme.cyan : title.contains("Ride") ? NativeLaunchTheme.purple : NativeLaunchTheme.orange }
}

private enum NativePersonalizationStep: Equatable {
    case vibe, walk, crew
    var index: Int { self == .vibe ? 1 : self == .walk ? 2 : 3 }
    var emoji: String { self == .vibe ? "✨" : self == .walk ? "🗺️" : "👥" }
    var question: String { self == .vibe ? NativeAuthLaunchContract.vibeQuestion : self == .walk ? NativeAuthLaunchContract.walkQuestion : NativeAuthLaunchContract.crewQuestion }
    var options: [String] { self == .vibe ? NativeAuthLaunchContract.vibeOptions : self == .walk ? NativeAuthLaunchContract.walkOptions : NativeAuthLaunchContract.crewOptions }
}

private struct NativePersonalizationScreen: View {
    let step: NativePersonalizationStep
    let onSelect: (String) -> Void
    let onSkip: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            ZStack(alignment: .bottom) {
                NativeLaunchTheme.background.ignoresSafeArea()
                Circle().fill(NativeLaunchTheme.cyan.opacity(0.10)).frame(width: 280, height: 280).blur(radius: 90).offset(x: -120, y: 180)
                Circle().fill(NativeLaunchTheme.purple.opacity(0.14)).frame(width: 340, height: 340).blur(radius: 100).offset(x: 130, y: -20)
                VStack(spacing: sizing.compactHeight ? 18 : 22) {
                HStack {
                    NativePersonalizationProgress(step: step.index, total: 3)
                    Spacer()
                    Button(action: { nativeAuthImpactLight(); onSkip() }) { Text("Skip").font(.system(size: 14, weight: .bold)).foregroundColor(.white.opacity(0.36)).padding(.horizontal, 15).frame(height: 40).overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1)) }.buttonStyle(.plain).accessibilityLabel("Skip personalization").accessibilityHint("Opens Bytspot in guest mode.")
                }
                Text(step.emoji).font(.system(size: sizing.compactHeight ? 24 : 28)).accessibilityHidden(true)
                Text(step.question).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white).multilineTextAlignment(.center)
                LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    ForEach(step.options, id: \.self) { option in
                        Button(action: { nativeAuthImpactLight(); onSelect(option) }) { Text(option).font(.system(size: 17, weight: .black)).foregroundColor(.white).minimumScaleFactor(0.82).lineLimit(1).frame(maxWidth: .infinity).frame(minHeight: sizing.compactHeight ? 56 : 62).background(Color.white.opacity(0.075)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.15), lineWidth: 2)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)) }
                            .buttonStyle(.plain)
                            .accessibilityLabel(option)
                            .accessibilityHint("Selects this answer and moves to the next launch step.")
                            .accessibilityIdentifier("native-launch-option-\(NativeLaunchPersonalizationStorage.token(for: option))")
                    }
                }
            }
            .padding(sizing.cardPadding)
            .frame(maxWidth: .infinity)
            .background(NativeLaunchTheme.card)
            .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
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
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.12), lineWidth: 4)
            Circle().trim(from: 0, to: CGFloat(step) / CGFloat(total)).stroke(NativeLaunchTheme.cyan, style: StrokeStyle(lineWidth: 4, lineCap: .round)).rotationEffect(.degrees(-90))
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
    private let picks = [
        ("🥇", "Ladybird Grove & Mess Hall", "684 John Wesley Dobbs Ave NE", "Chill", NativeLaunchTheme.cyan),
        ("🥈", "Livingston", "659 Peachtree St NE", "Chill", NativeLaunchTheme.cyan),
        ("🥉", "Lyla Lila", "972 Brady Ave NW", "Active", NativeLaunchTheme.emerald)
    ]

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            ZStack(alignment: .bottom) {
                NativeLaunchTheme.background.ignoresSafeArea()
                Circle().fill(NativeLaunchTheme.purple.opacity(0.14)).frame(width: 420, height: 420).blur(radius: 110).offset(y: -120)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: sizing.compactHeight ? 13 : 16) {
                HStack { NativePersonalizationProgress(step: 3, total: 3).overlay(Image(systemName: "checkmark").font(.system(size: 18, weight: .black)).foregroundColor(NativeLaunchTheme.cyan)); Spacer() }
                VStack(spacing: 8) { Text("🗺️").font(.system(size: sizing.compactHeight ? 28 : 34)).accessibilityHidden(true); Text(NativeAuthLaunchContract.atlantaHeadline).font(.system(size: sizing.questionTitle, weight: .black, design: .rounded)).foregroundColor(.white); Text(NativeAuthLaunchContract.atlantaSubtitle).font(.system(size: 15, weight: .bold)).foregroundColor(.white.opacity(0.45)) }
                VStack(spacing: 10) { ForEach(Array(picks.enumerated()), id: \.offset) { _, pick in NativeAtlantaPickRow(medal: pick.0, title: pick.1, address: pick.2, label: pick.3, color: pick.4) } }
                Button(action: { nativeAuthImpactLight(); onContinue() }) { NativeLaunchCTA(title: "Let's Go 🚀", color: LinearGradient(colors: [NativeLaunchTheme.cyan, NativeLaunchTheme.purple], startPoint: .leading, endPoint: .trailing), foreground: .black, height: sizing.ctaHeight) }.buttonStyle(.plain).accessibilityHint("Opens Bytspot in guest mode with these picks.")
                Button(action: { nativeAuthImpactLight(); onSignIn() }) { Text("Sign in to save these picks").font(.system(size: 14, weight: .black)).foregroundColor(NativeLaunchTheme.cyan).frame(maxWidth: .infinity).frame(height: 42).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(NativeLaunchTheme.cyan.opacity(0.28), lineWidth: 1)) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the sign in screen before saving picks.")
                    .accessibilityIdentifier("native-launch-sign-in-after-picks")
                    }
                    .padding(sizing.cardPadding)
                    .frame(maxWidth: .infinity)
                }
                .frame(maxHeight: proxy.size.height * sizing.sheetMaxHeightFraction)
                .background(NativeLaunchTheme.card)
                .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .padding(.horizontal, sizing.sheetHorizontalInset)
                .padding(.bottom, 10)
                .accessibilityIdentifier("native-launch-atlanta-picks")
            }
        }
    }
}

private struct NativeAtlantaPickRow: View {
    let medal: String; let title: String; let address: String; let label: String; let color: Color
    var body: some View { HStack(spacing: 12) { Text(medal).font(.system(size: 20)).accessibilityHidden(true); VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 17, weight: .black)).foregroundColor(.white).lineLimit(1); Text(address).font(.system(size: 13, weight: .bold)).foregroundColor(.white.opacity(0.36)).lineLimit(1) }; Spacer(); Text(label).font(.system(size: 12, weight: .black)).foregroundColor(color).padding(.horizontal, 10).padding(.vertical, 5).background(color.opacity(0.16)).overlay(Capsule().stroke(color.opacity(0.34), lineWidth: 1)).clipShape(Capsule()) }.padding(14).background(Color.white.opacity(0.065)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)).accessibilityElement(children: .ignore).accessibilityLabel("\(title), \(address), \(label)") }
}

private struct NativeAuthenticationScreen: View {
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
    @FocusState private var focusedField: NativeAuthField?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(mode: NativeAuthMode, sessionStore: BytspotSessionStore, authCoordinator: NativeAuthCoordinator, onComplete: @escaping () -> Void, onBack: @escaping () -> Void) {
        self.mode = mode; self.sessionStore = sessionStore; self.authCoordinator = authCoordinator; self.onComplete = onComplete; self.onBack = onBack; _currentMode = State(initialValue: mode)
    }

    var body: some View {
        GeometryReader { proxy in
            let sizing = NativeLaunchSizing(size: proxy.size)
            ScrollView(showsIndicators: false) {
                VStack(spacing: sizing.compactHeight ? 15 : 18) {
                    HStack { Button(action: onBack) { Image(systemName: "chevron.left").font(.system(size: 16, weight: .black)).foregroundColor(.white).frame(width: 42, height: 42).background(NativeLaunchTheme.panel).clipShape(Circle()) }.buttonStyle(.plain).accessibilityLabel("Back").accessibilityHint("Returns to the landing screen."); Spacer() }
                    VStack(spacing: 10) { Text("👋").font(.system(size: sizing.compactHeight ? 28 : 34)).frame(width: sizing.compactHeight ? 56 : 64, height: sizing.compactHeight ? 56 : 64).background(NativeLaunchTheme.gradient).clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)).accessibilityHidden(true); Text("Welcome to Bytspot").font(.system(size: dynamicTypeSize.isAccessibilitySize ? 28 : sizing.compactHeight ? 30 : 34, weight: .black)).foregroundColor(.white).multilineTextAlignment(.center); Text(currentMode == .signup ? "Create your account to save spots, preferences, and reservations." : "Sign in to access your saved Bytspot profile.").font(.system(size: 15, weight: .semibold)).foregroundColor(NativeLaunchTheme.body).multilineTextAlignment(.center) }
                    .accessibilityElement(children: .combine)
                authModeToggle
                NativeSocialAuthButton(title: "Continue with Apple", icon: "apple.logo", loading: loading || isAuthenticating(.apple)) { signIn(.apple) }
                NativeSocialAuthButton(title: "Continue with Google", icon: "person.crop.circle.badge.plus", loading: loading || isAuthenticating(.google)) { signIn(.google) }
                Text("Apple and Google use native adapter seams; email sign-in stays available if provider setup is unavailable on this build.").font(.system(size: 12, weight: .semibold)).foregroundColor(NativeLaunchTheme.muted).multilineTextAlignment(.center).accessibilityLabel("Apple and Google sign in use native adapters. Email sign in remains available if provider setup is unavailable.")
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
                    if currentMode == .login { Button("Forgot password?") { showRecovery = true }.font(.system(size: 13, weight: .bold)).foregroundColor(NativeLaunchTheme.cyan).frame(maxWidth: .infinity, alignment: .trailing).accessibilityHint("Opens password recovery.") }
                    if !error.isEmpty { Text(error).font(.system(size: 13, weight: .bold)).foregroundColor(.red.opacity(0.92)).frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color.red.opacity(0.16)).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)).accessibilityLabel("Authentication error. \(error)") }
                    Button(action: submitEmailAuth) { NativeLaunchCTA(title: loading ? "Connecting…" : currentMode == .signup ? "Create Account" : "Log In", color: NativeLaunchTheme.gradient, foreground: .white, height: sizing.ctaHeight) }.buttonStyle(.plain).disabled(!canSubmit || loading).opacity(canSubmit ? 1 : 0.45).accessibilityHint(canSubmit ? "Submits the email authentication form." : "Complete the required fields to continue.")
                }
                Text("By continuing, you agree to our Terms of Service and Privacy Policy").font(.system(size: 11, weight: .semibold)).foregroundColor(NativeLaunchTheme.muted).multilineTextAlignment(.center)
                }
                .padding(.horizontal, sizing.horizontalPadding)
                .padding(.top, sizing.authTopPadding)
                .padding(.bottom, 42)
            }
        }
        .background(NativeLaunchTheme.background.ignoresSafeArea())
        .accessibilityIdentifier("native-launch-auth")
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focusedField = nil } } }
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
    private func submitEmailAuth() { guard canSubmit else { touchedFields.formUnion([.name, .email, .password]); error = NativeAuthInputValidator.submitValidationMessage(mode: currentMode); focusedField = firstInvalidField; nativeAuthImpactLight(); return }; error = ""; loading = true; focusedField = nil; nativeAuthImpactLight(); let selectedMode = currentMode; Task { do { let response = selectedMode == .signup ? try await api.signup(email: email, password: password, name: name, ref: inviteCode.isEmpty ? nil : inviteCode) : try await api.login(email: email, password: password); await MainActor.run { if let token = response.token, !token.isEmpty { sessionStore.updateToken(token); onComplete() } else { error = "Something went wrong. Please try again." }; loading = false } } catch { let message = error.localizedDescription.isEmpty ? "Connection error. Please try again." : error.localizedDescription; await MainActor.run { self.error = message; loading = false } } } }
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
    let title: String; let color: LinearGradient; let foreground: Color; var height: CGFloat = 56; var cornerRadius: CGFloat = 16
    var body: some View { Text(title).font(.system(size: 17, weight: .black)).foregroundColor(foreground).frame(maxWidth: .infinity).frame(height: height).background(color).clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)).shadow(color: NativeLaunchTheme.purple.opacity(0.25), radius: 18, x: 0, y: 12) }
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
