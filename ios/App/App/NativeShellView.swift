import SwiftUI
import UIKit
import MapKit
import Capacitor
import WebKit

enum BytspotNativeTab: String, CaseIterable, Identifiable {
    case home, discover, map, concierge

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: return "Home"
        case .discover: return "Discover"
        case .map: return "Map"
        case .concierge: return "Concierge"
        }
    }
    var icon: String {
        switch self {
        case .home: return "house.fill"
        case .discover: return "safari.fill"
        case .map: return "map.fill"
        case .concierge: return "sparkles"
        }
    }
    var hybridRoute: BytspotHybridRoute {
        switch self {
        case .home: return .home
        case .discover: return .discover
        case .map: return .map
        case .concierge: return .concierge
        }
    }
}

enum BytspotHybridRoute: String, Identifiable {
    case home, discover, map, access, profile, concierge

    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: return "Full Home"
        case .discover: return "Discover Web Features"
        case .map: return "Map Web Tools"
        case .access: return "My Access Wallet"
        case .profile: return "Full Profile"
        case .concierge: return "Concierge Chat"
        }
    }
    var reactTab: String {
        switch self {
        case .access: return "profile"
        default: return rawValue
        }
    }
    var focus: String? { self == .access ? "reservations" : nil }
}

/// JS→native message channel used by the React-side scanner (NFC / QR / virtual)
/// to notify the SwiftUI shell of a verified patch URL. Mirror this literal on
/// the React side when posting via `window.webkit.messageHandlers`.
/// Locked by `NativeMapParitySelfTests`.
let nativePatchScanBridgeChannel = "bytspotNativePatchScanned"

/// DEBUG-only env hook that injects a synthetic JS-bridge post into the
/// Capacitor webView so we can validate the full round-trip
/// (JS → WKScriptMessageHandler → NativeIncomingURLCenter → notifyPatchScanned
/// → .patch destination → markPaired) without an NFC tap. Locked by
/// `NativePatchRouteSelfTests.assertScanSourceContract`.
let nativePatchScanBridgeSmokeURLEnvironmentKey = "BYT_NATIVE_BRIDGE_SMOKE_URL"

final class NativeBridgeStore: NSObject, ObservableObject, WKScriptMessageHandler {
    let bridgeViewController = CAPBridgeViewController()
    @Published var requestedTab: BytspotNativeTab?
    @Published var requestedHybridRoute: BytspotHybridRoute?
    @Published private(set) var currentRoute: BytspotHybridRoute = .home
    private var lastInjectedRoute: BytspotHybridRoute?
    private var patchScanBridgeInstalled = false

    override init() {
        super.init()
        bridgeViewController.loadViewIfNeeded()
        installPatchScanBridge()
    }

    func preloadBridge() {
        bridgeViewController.loadViewIfNeeded()
        installPatchScanBridge()
    }

    /// Registers the `bytspotNativePatchScanned` WKScriptMessageHandler on the
    /// Capacitor webView so the React-side scanner can hand verified patch URLs
    /// back to `NativeNavigationCoordinator` via `NativeIncomingURLCenter`.
    /// Idempotent — safe to call repeatedly.
    private func installPatchScanBridge() {
        guard !patchScanBridgeInstalled else { return }
        guard let userContent = bridgeViewController.webView?.configuration.userContentController else { return }
        userContent.removeScriptMessageHandler(forName: nativePatchScanBridgeChannel)
        userContent.add(self, name: nativePatchScanBridgeChannel)
        patchScanBridgeInstalled = true
    }

    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == nativePatchScanBridgeChannel else { return }
        let payload = message.body as? [String: Any]
        guard let urlString = payload?["url"] as? String, let url = URL(string: urlString) else { return }
        // Publish through the existing incoming-URL pipeline so the SwiftUI root's
        // navigation coordinator runs the same code path as a universal link.
        NativeIncomingURLCenter.publish(url, scanSource: NativePatchScanSource(rawValue: (payload?["source"] as? String) ?? "") ?? .nfc)
    }

    /// DEBUG-only smoke hook. Reads `BYT_NATIVE_BRIDGE_SMOKE_URL` and, if set,
    /// injects a synthetic `window.webkit.messageHandlers.bytspotNativePatchScanned.postMessage(...)`
    /// into the Capacitor webView after a short delay. Exercises the actual
    /// WKScriptMessageHandler path the React-side scanner uses, end-to-end.
    func injectPatchScanBridgeSmokeTestIfRequested() {
        #if DEBUG
        guard let urlString = ProcessInfo.processInfo.environment[nativePatchScanBridgeSmokeURLEnvironmentKey],
              !urlString.isEmpty else { return }
        let escaped = urlString.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
        let js = "window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(nativePatchScanBridgeChannel) && window.webkit.messageHandlers.\(nativePatchScanBridgeChannel).postMessage({url:'\(escaped)',source:'nfc'});"
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { [weak self] in
            self?.bridgeViewController.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
        #endif
    }

    func open(_ route: BytspotHybridRoute, force: Bool = false, handoffURL: URL? = nil) {
        if currentRoute != route { currentRoute = route }
        bridgeViewController.loadViewIfNeeded()
        guard let webView = bridgeViewController.webView else { return }
        guard force || lastInjectedRoute != route else { return }
        lastInjectedRoute = route
        let detail: [String: String] = ["tab": route.reactTab, "focus": route.focus ?? "", "url": handoffURL?.absoluteString ?? ""]
        let detailJSON = jsonObject(detail)
        let tabJSON = jsonString(route.reactTab)
        let focusJSON = jsonString(route.focus ?? "")
        let handoffJSON = jsonString(handoffURL?.absoluteString ?? "")
        let script = """
        (function () {
          try {
            window.history.replaceState({}, '', '/');
            localStorage.setItem('bytspot_native_tab', \(tabJSON));
            localStorage.setItem('bytspot_native_focus', \(focusJSON));
            if (\(handoffJSON)) {
              localStorage.setItem('bytspot_native_handoff_url', \(handoffJSON));
              window.dispatchEvent(new CustomEvent('bytspot:native-handoff', { detail: \(detailJSON) }));
            }
            window.dispatchEvent(new CustomEvent('bytspot:native-tab', { detail: \(detailJSON) }));
          } catch (error) { console.warn('native tab route failed', error); }
        })();
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    @discardableResult
    func handleExternalURL(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let rawPath = url.scheme == "bytspot" && !(components.host ?? "").isEmpty
            ? "\(components.host ?? "")\(components.path)"
            : components.path
        let path = rawPath.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        let target: BytspotNativeTab?
        let route: BytspotHybridRoute?
        if path == "map" || path.hasPrefix("map/") { target = .map; route = .map }
        else if path == "discover" || path.hasPrefix("venue/") { target = .discover; route = .discover }
        else if path == "concierge" || path.hasPrefix("concierge/") { target = .concierge; route = .concierge }
        else if path == "profile" || path.hasPrefix("profile/") { target = .home; route = .profile }
        else if path == "access" || path.hasPrefix("booking") { target = .home; route = .access }
        else { target = nil; route = nil }
        guard let target, let route else { return false }
        requestedTab = target
        open(route, force: true, handoffURL: url)
        if route == .profile || route == .access { requestedHybridRoute = route }
        return true
    }

    private func jsonString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let result = String(data: data, encoding: .utf8) else { return "\"\"" }
        return result
    }

    private func jsonObject(_ value: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let result = String(data: data, encoding: .utf8) else { return "{}" }
        return result
    }
}

/// Single source-of-truth for the "Patch paired" handshake event. Driven by the
/// scanner/NFC path via `BytspotNativeShellView`'s navigation pipeline and read
/// by `NativeMapExploreView` to flip the partner peek card into its paired state.
/// Freshness window mirrors the Traffic Intel proximity contract (30 minutes).
final class NativePatchPairingStore: ObservableObject {
    struct PairedSnapshot: Equatable {
        let patchId: String
        let venueName: String?
        let tier: BytspotTier
        let pairedAt: Date
    }

    static let freshnessMinutes: Int = NativeMapExploreView.trafficIntelProximityFreshnessMinutes
    static let patchIdToPinIDAliases: [String: String] = [
        "BYT-BRONI-P": "partner-colony",
        "BYT424-0301-B": "access-arts",
        "BYT424-0301-P": "partner-colony"
    ]

    @Published private(set) var paired: PairedSnapshot?

    func markPaired(route: BytspotPatchRoute, now: Date = Date()) {
        paired = PairedSnapshot(patchId: route.patchId, venueName: route.venueName, tier: route.tier, pairedAt: now)
    }

    func clear() { paired = nil }

    func isFresh(now: Date = Date()) -> Bool {
        guard let paired else { return false }
        let elapsed = now.timeIntervalSince(paired.pairedAt) / 60.0
        return elapsed <= Double(Self.freshnessMinutes)
    }

    func matches(pinID: String, pinTitle: String, now: Date = Date()) -> Bool {
        guard let paired, isFresh(now: now) else { return false }
        if let aliasPinID = Self.patchIdToPinIDAliases[paired.patchId], aliasPinID == pinID { return true }
        if let venueName = paired.venueName, !venueName.isEmpty,
           pinTitle.lowercased().contains(venueName.lowercased()) || venueName.lowercased().contains(pinTitle.lowercased()) { return true }
        return false
    }
}

struct BytspotNativeShellView: View {
    @ObservedObject var bridgeStore: NativeBridgeStore
    @ObservedObject var navigation: NativeNavigationCoordinator
    @State private var selectedTab: BytspotNativeTab = Self.previewInitialTab
    @State private var activeTier: BytspotTier = BytspotTheme.defaultTier
    @State private var hybridRoute: BytspotHybridRoute?
    @State private var contextualDestination: NativeContextualDestination?
    @StateObject private var pairingStore = NativePatchPairingStore()
    /// Live premium-membership entitlement (orthogonal to the service tier), sourced
    /// from `NativeMembershipStore` (trpc.subscription.status.isPremium parity). It
    /// fails safe to `.free` and still honors the BYT_NATIVE_PREVIEW_PREMIUM override
    /// via the store's initial value, then threads into the map view so the Map
    /// Functions sheet can gate premium rows.
    @EnvironmentObject private var membershipStore: NativeMembershipStore

    private static var previewInitialTab: BytspotNativeTab {
        guard NativeMigrationConfig.isNativeRootEnabled,
              let raw = ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_TAB"]?.lowercased(),
              let tab = BytspotNativeTab(rawValue: raw) else { return .home }
        return tab
    }

    var body: some View {
        ZStack {
            BytspotNativeBackground(tier: activeTier).ignoresSafeArea()
            VStack(spacing: 0) {
                Group {
                    switch selectedTab {
                    case .home:
                        NativeHomeDashboardView(openHybrid: openHybrid, openNativeTab: selectNativeTab)
                    case .discover:
                        NativeDiscoverView(openHybrid: openHybrid, openNativeTab: selectNativeTab)
                    case .map:
                        NativeMapExploreView(openHybrid: openHybrid, prewarmBridge: { bridgeStore.preloadBridge() }, activeTier: activeTier, membership: membershipStore.membership)
                            .environmentObject(pairingStore)
                    case .concierge:
                        NativeConciergeView(openHybrid: openHybrid)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                BytspotNativeBottomTabBar(selectedTab: $selectedTab, tier: activeTier)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { bridgeStore.open(selectedTab.hybridRoute) }
        .onChange(of: selectedTab) { bridgeStore.open($0.hybridRoute) }
        .onReceive(bridgeStore.$requestedTab.compactMap { $0 }) { selectedTab = $0 }
        .onReceive(bridgeStore.$requestedHybridRoute.compactMap { $0 }) { hybridRoute = $0 }
        .onReceive(navigation.$requestedTab.compactMap { $0 }) { selectedTab = $0 }
        .onReceive(navigation.$requestedDestination.compactMap { $0 }) { destination in
            if case .patch(let route) = destination {
                activeTier = route.tier
                pairingStore.markPaired(route: route)
            }
            contextualDestination = destination
        }
        .fullScreenCover(item: $hybridRoute) { route in
            NativeHybridBridgeScreen(route: route, bridgeStore: bridgeStore)
        }
        .sheet(item: $contextualDestination) { destination in
            NativeContextualDestinationView(destination: destination) { route in
                bridgeStore.open(route, force: true, handoffURL: navigation.lastURL)
                hybridRoute = route
            }
        }
    }

    private func openHybrid(_ route: BytspotHybridRoute) {
        bridgeStore.open(route)
        hybridRoute = route
    }

    private func selectNativeTab(_ tab: BytspotNativeTab) {
        nativeImpactLight()
        withAnimation(.interpolatingSpring(mass: 0.8, stiffness: 320, damping: 30, initialVelocity: 0)) {
            selectedTab = tab
        }
    }
}

private struct BytspotNativeBottomTabBar: View {
    @Binding var selectedTab: BytspotNativeTab
    let tier: BytspotTier

    var body: some View {
        HStack(spacing: 0) {
            ForEach(BytspotNativeTab.allCases) { tab in
                Button(action: { select(tab) }) {
                    tabItem(tab, isActive: selectedTab == tab)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(tab.title) tab")
                .accessibilityAddTraits(selectedTab == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, NativePolish.bottomBarInnerHorizontalPadding)
        .padding(.vertical, NativePolish.bottomBarInnerVerticalPadding)
        .frame(maxWidth: .infinity)
        .frame(height: NativePolish.bottomBarHeight)
        .background(NativePolish.bottomBarSurface)
        .overlay(RoundedRectangle(cornerRadius: NativePolish.bottomBarRadius, style: .continuous).stroke(NativePolish.strongBorder, lineWidth: 1.25))
        .clipShape(RoundedRectangle(cornerRadius: NativePolish.bottomBarRadius, style: .continuous))
        .shadow(color: NativeTheme.panelShadow, radius: NativePolish.bottomBarShadowRadius, x: 0, y: NativePolish.bottomBarShadowY)
        .padding(.horizontal, NativePolish.bottomBarHorizontalPadding)
        .padding(.bottom, NativePolish.bottomBarBottomPadding)
    }

    private func tabItem(_ tab: BytspotNativeTab, isActive: Bool) -> some View {
        VStack(spacing: 3) {
            Image(systemName: tab.icon)
                .font(.system(size: 20, weight: isActive ? .semibold : .regular))
            Text(tab.title)
                .font(.system(size: BytspotTheme.caption2Size, weight: isActive ? .semibold : .regular))
                .lineLimit(1)
        }
        .foregroundColor(isActive ? NativeTheme.textPrimary : NativeTheme.textSecondary)
        .frame(maxWidth: .infinity, minHeight: NativePolish.bottomTabItemHeight)
        .background(RoundedRectangle(cornerRadius: NativePolish.bottomTabActiveRadius, style: .continuous).fill(isActive ? NativeTheme.selectedControlSurface : Color.clear))
    }

    private func select(_ tab: BytspotNativeTab) {
        nativeImpactLight()
        guard selectedTab != tab else { return }
        withAnimation(.easeInOut(duration: 0.18)) {
            selectedTab = tab
        }
    }
}

private struct NativeContextualDestinationView: View {
    let destination: NativeContextualDestination
    let openHybrid: (BytspotHybridRoute) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var apiState: NativeAPIState
    @EnvironmentObject private var tabContentStore: NativeTabContentStore

    var body: some View {
        NavigationView {
            NativeScreenScroll {
                NativeHeroCard(title: destination.title, eyebrow: destination.eyebrow, subtitle: destination.subtitle)
                if destination == .profile {
                    NativeProfileAccountView(openLegacyProfile: { openHybrid(.profile) }, openLegacyAccess: { openHybrid(.access) })
                        .environmentObject(sessionStore)
                        .environmentObject(authCoordinator)
                        .environmentObject(apiState)
                }
                if destination == .accessWallet {
                    NativeAccessWalletPreview(openLegacyAccess: { openHybrid(.access) })
                        .environmentObject(sessionStore)
                }
                if case .patch(let route) = destination {
                    NativePatchAccessPreview(route: route, openLegacyAccess: { openHybrid(destination.fallbackRoute) })
                }
                NativeRow(title: "Open legacy web fallback", subtitle: "Use React/Capacitor for any feature not native yet.", icon: "safari.fill") {
                    openHybrid(destination.fallbackRoute)
                }
                NativeRow(title: "Back to four-tab shell", subtitle: "Home · Discover · Map · Concierge", icon: "rectangle.grid.2x2.fill") {
                    dismiss()
                }
            }
            .navigationTitle(destination.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct NativeHybridBridgeScreen: View {
    let route: BytspotHybridRoute
    @ObservedObject var bridgeStore: NativeBridgeStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            HybridBridgeView(bridgeStore: bridgeStore, route: route).ignoresSafeArea()
            Button(action: { dismiss() }) {
                Label("Back to native", systemImage: "xmark")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.82))
                    .clipShape(Capsule())
            }
            .padding(.top, 12)
            .padding(.trailing, 12)
        }
        .onAppear { bridgeStore.open(route) }
    }
}

private struct HybridBridgeView: UIViewControllerRepresentable {
    @ObservedObject var bridgeStore: NativeBridgeStore
    let route: BytspotHybridRoute

    func makeUIViewController(context: Context) -> CAPBridgeViewController {
        bridgeStore.bridgeViewController
    }

    func updateUIViewController(_ uiViewController: CAPBridgeViewController, context: Context) {
        bridgeStore.preloadBridge()
    }
}

private struct NativeAuthStatusCard: View {
    let openLegacyAuth: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var apiState: NativeAPIState

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                NativeIcon(symbol: sessionStore.isAuthenticated ? "checkmark.seal.fill" : "person.crop.circle", color: sessionStore.isAuthenticated ? NativeTheme.emerald : NativeTheme.cyan)
                VStack(alignment: .leading, spacing: 3) {
                    Text(sessionStore.sessionLabel).nativeTitle(18)
                    Text(authCoordinator.status.message).nativeBody(size: 12.5)
                }
                Spacer()
            }
            NativeAPISessionRow(snapshot: apiState.snapshot)
            HStack(spacing: 10) {
                ForEach(NativeAuthProvider.allCases) { provider in
                    Button(action: { authCoordinator.handle(.signIn(provider), sessionStore: sessionStore) }) {
                        Label(provider.title.replacingOccurrences(of: "Continue with ", with: ""), systemImage: provider.systemImage)
                            .font(.system(size: 12, weight: .black))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(Color.white.opacity(0.10))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
            HStack(spacing: 10) {
                Button(action: { authCoordinator.handle(.continueAsGuest, sessionStore: sessionStore) }) {
                    NativeCTA(title: "Continue as Guest", color: NativeTheme.cyan, foreground: .black)
                }
                Button(action: {
                    if sessionStore.isAuthenticated || sessionStore.isGuest {
                        authCoordinator.handle(.signOut, sessionStore: sessionStore)
                    } else {
                        openLegacyAuth()
                    }
                }) {
                    NativeCTA(title: sessionStore.isAuthenticated || sessionStore.isGuest ? "Sign Out" : "Legacy Auth", color: Color.white.opacity(0.12), foreground: .white)
                }
            }
        }
        .padding(16)
        .nativePanel()
        .onAppear {
            #if DEBUG
            authCoordinator.runDebugAutorunIfRequested(sessionStore: sessionStore)
            #endif
            apiState.refresh(sessionStore: sessionStore)
        }
        .onChange(of: sessionStore.token) { _ in apiState.refresh(sessionStore: sessionStore) }
    }
}

private struct NativeAPISessionRow: View {
    let snapshot: NativeAPISessionSnapshot

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: snapshot.attachesBearerToken ? "lock.shield.fill" : "network")
                .font(.system(size: 13, weight: .black))
                .foregroundColor(snapshot.attachesBearerToken ? NativeTheme.emerald : NativeTheme.cyan)
            VStack(alignment: .leading, spacing: 2) {
                Text(snapshot.title).font(.system(size: 12, weight: .black)).foregroundColor(.white)
                Text(snapshot.subtitle).nativeBody(size: 11.5, color: .white.opacity(0.62))
            }
            Spacer()
        }
        .padding(12)
        .background(Color.black.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct NativeProfileAccountView: View {
    let openLegacyProfile: () -> Void
    let openLegacyAccess: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var apiState: NativeAPIState

    static let profileMetricTitles = ["Account", "Wallet", "API"]
    static let accountMenuTitles = ["Personal Information", "My Vehicles", "Payment Methods", "My Access", "My Reservations", "Saved Spots", "Places I've Been", "Friends"]
    static let preferenceMenuTitles = ["Notifications", "Parking Preferences", "Vibe Preferences", "Location Settings"]
    static let commerceCardTitles = ["Insider", "My Reservations", "My Access"]

    var body: some View {
        VStack(spacing: 14) {
            NativeAuthStatusCard(openLegacyAuth: openLegacyProfile)
                .environmentObject(sessionStore)
                .environmentObject(authCoordinator)
                .environmentObject(apiState)
            NativeConsumerExperienceCard(sessionStore: sessionStore)
            NativeInsiderPreviewCard(isAuthenticated: sessionStore.isAuthenticated, openLegacyProfile: openLegacyProfile, openLegacyAccess: openLegacyAccess)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                NativeProfileMetric(title: "Account", value: sessionStore.sessionLabel, icon: "person.fill")
                NativeProfileMetric(title: "Wallet", value: sessionStore.isAuthenticated ? "Ready" : "Preview", icon: "wallet.pass.fill")
                NativeProfileMetric(title: "API", value: apiState.snapshot.attachesBearerToken ? "Token" : "Fallback", icon: "lock.shield.fill")
            }
            NativeProfileMenuSection(title: "Account", items: Self.accountMenuTitles, openLegacyProfile: openLegacyProfile, openLegacyAccess: openLegacyAccess)
            NativeProfileMenuSection(title: "Preferences", items: Self.preferenceMenuTitles, openLegacyProfile: openLegacyProfile, openLegacyAccess: openLegacyAccess)
            NativeAccessWalletPreview(openLegacyAccess: openLegacyAccess)
                .environmentObject(sessionStore)
            NativeRow(title: "Open full React profile", subtitle: "Use existing production account, payment, and preference settings.", icon: "person.crop.circle.fill", action: openLegacyProfile)
        }
        .accessibilityIdentifier("native-profile-account")
    }
}

private struct NativeConsumerExperienceCard: View {
    let sessionStore: BytspotSessionStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                NativeIcon(symbol: "sparkles", color: NativeTheme.cyan)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Parker benefits").nativeTitle(18)
                    Text("Native preview mirrors Profile rewards, following, bookings, and access progress without replacing backend account screens.").nativeBody(size: 12.5)
                }
                Spacer()
                Text(sessionStore.isAuthenticated ? "ACTIVE" : "PREVIEW")
                    .font(.system(size: 10, weight: .black))
                    .foregroundColor(.black)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(sessionStore.isAuthenticated ? NativeTheme.emerald : NativeTheme.cyan)
                    .clipShape(Capsule())
            }
            VStack(alignment: .leading, spacing: 7) {
                HStack { Text("Native parity progress").font(.system(size: 12, weight: .black)).foregroundColor(.white); Spacer(); Text("72%").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan) }
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.10))
                        Capsule().fill(NativeTheme.brandGradient()).frame(width: proxy.size.width * 0.72)
                    }
                }
                .frame(height: 8)
            }
            HStack(spacing: 8) {
                ForEach(["Following", "Points", "Bookings"], id: \.self) { label in
                    NativeAccountPill(title: label, value: previewValue(for: label))
                }
            }
        }
        .padding(16)
        .nativePanel()
        .accessibilityIdentifier("native-profile-benefits")
    }

    private func previewValue(for label: String) -> String {
        switch label {
        case "Following": return "0"
        case "Points": return sessionStore.isAuthenticated ? "Live" : "Guest"
        default: return "0"
        }
    }
}

private struct NativeInsiderPreviewCard: View {
    let isAuthenticated: Bool
    let openLegacyProfile: () -> Void
    let openLegacyAccess: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                NativeIcon(symbol: "crown.fill", color: NativeTheme.pink)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Insider").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan).tracking(1.4)
                    Text(isAuthenticated ? "Open My Access" : "Sign in for Insider").nativeTitle(19)
                    Text("Subscription checkout, payment methods, and premium status stay in the production React profile until native billing parity is complete.").nativeBody(size: 12)
                }
                Spacer()
            }
            HStack(spacing: 8) {
                Button(action: isAuthenticated ? openLegacyAccess : openLegacyProfile) { NativeCTA(title: isAuthenticated ? "Open My Access" : "Sign in for Insider", color: NativeTheme.cyan, foreground: .black) }
                Button(action: openLegacyProfile) { NativeCTA(title: "React Billing", color: Color.white.opacity(0.10), foreground: .white) }
            }
        }
        .padding(16)
        .background(LinearGradient(colors: [NativeTheme.cyan.opacity(0.12), NativeTheme.pink.opacity(0.08), Color.black.opacity(0.24)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityIdentifier("native-profile-insider")
    }
}

private struct NativeProfileMenuSection: View {
    let title: String
    let items: [String]
    let openLegacyProfile: () -> Void
    let openLegacyAccess: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).nativeTitle(18)
            ForEach(items, id: \.self) { item in
                NativeRow(title: item, subtitle: subtitle(for: item), icon: icon(for: item)) {
                    if item == "My Access" || item == "My Reservations" { openLegacyAccess() } else { openLegacyProfile() }
                }
            }
        }
        .accessibilityIdentifier("native-profile-menu-\(title.lowercased())")
    }

    private func subtitle(for item: String) -> String {
        switch item {
        case "My Vehicles": return "Vehicle count and plate details continue in React."
        case "Payment Methods": return "Cards and Apple Pay settings remain production-backed."
        case "My Access": return "Tickets, passes, and verified patch access."
        case "My Reservations": return "Parking passes and booking history."
        case "Friends": return "Following, referrals, and social graph."
        default: return "Open the production profile screen for full editing."
        }
    }

    private func icon(for item: String) -> String {
        switch item {
        case "Personal Information": return "person.text.rectangle.fill"
        case "My Vehicles": return "car.fill"
        case "Payment Methods": return "creditcard.fill"
        case "My Access": return "ticket.fill"
        case "My Reservations": return "receipt.fill"
        case "Saved Spots": return "heart.fill"
        case "Places I've Been": return "clock.fill"
        case "Friends": return "person.2.fill"
        case "Notifications": return "bell.fill"
        case "Parking Preferences": return "parkingsign.circle.fill"
        case "Vibe Preferences": return "slider.horizontal.3"
        case "Location Settings": return "location.fill"
        default: return "chevron.right.circle.fill"
        }
    }
}

private struct NativeAccountPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 3) {
            Text(value).font(.system(size: 14, weight: .black)).foregroundColor(.white)
            Text(title).font(.system(size: 10, weight: .heavy)).foregroundColor(.white.opacity(0.58))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct NativeProfileMetric: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.cyan)
            Text(title).font(.system(size: 10, weight: .black)).foregroundColor(.white.opacity(0.55)).textCase(.uppercase)
            Text(value).font(.system(size: 13, weight: .black)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(13)
        .nativePanel()
    }
}

private struct NativeAccessWalletPreview: View {
    let openLegacyAccess: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore

    static let walletCardTitles = ["Verified patches", "Service requests", "Digital passes"]

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 12) {
                NativeIcon(symbol: "key.fill", color: NativeTheme.emerald)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Access Wallet").nativeTitle(18)
                    Text(walletSubtitle).nativeBody(size: 12.5)
                }
                Spacer()
            }
            NativeAccessScannerPreview(openLegacyAccess: openLegacyAccess)
            NativeWalletLine(title: "Patch keys", subtitle: "BYT links, App Clip handoffs, and scanned access live here.", icon: "key.radiowaves.forward.fill")
            NativeWalletLine(title: "Tickets & reservations", subtitle: "Booking confirmations stay on the production React fallback until parity.", icon: "ticket.fill")
            NativeWalletLine(title: "Saved venues", subtitle: "Native preview only; full saved access opens through the web bridge.", icon: "mappin.and.ellipse")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Self.walletCardTitles, id: \.self) { title in
                    NativeAccessWalletMetric(title: title, value: walletValue(for: title))
                }
            }
            Button(action: openLegacyAccess) {
                NativeCTA(title: "Open full Access Wallet", color: NativeTheme.emerald, foreground: .black)
            }
        }
        .padding(16)
        .nativePanel()
    }

    private var walletSubtitle: String {
        if sessionStore.isAuthenticated { return "Token-ready native preview with React fallback." }
        if sessionStore.isGuest { return "Guest preview keeps wallet actions local." }
        return "Sign in or continue as guest to preview saved access."
    }

    private func walletValue(for title: String) -> String {
        switch title {
        case "Verified patches": return sessionStore.isAuthenticated ? "Ready" : "Preview"
        case "Service requests": return "Hold-safe"
        default: return "Wallet-ready"
        }
    }
}

private struct NativeAccessScannerPreview: View {
    let openLegacyAccess: () -> Void
    @State private var selectedMethod = scannerMethods[0]
    @State private var state = scannerStates[0]

    static let scannerMethods = ["Auto", "NFC", "QR"]
    static let scannerStates = ["Idle", "Scanning", "Verified", "Fallback"]
    static let scannerCapabilities = ["NFC NDEF", "QR camera", "App Clip handoff", "Audit event"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                ZStack {
                    NativeTheme.brandGradient()
                    Image(systemName: "wave.3.right.circle.fill").font(.system(size: 24, weight: .black)).foregroundColor(.white)
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Virtual Patch Scanner").nativeTitle(17)
                    Text(scannerStatusCopy).nativeBody(size: 12)
                }
                Spacer()
                Text(state.uppercased())
                    .font(.system(size: 9.5, weight: .black))
                    .foregroundColor(.black)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(stateColor)
                    .clipShape(Capsule())
            }
            HStack(spacing: 7) {
                ForEach(Self.scannerMethods, id: \.self) { method in
                    Button(action: { selectedMethod = method; state = "Idle"; nativeImpactLight() }) {
                        Text(method)
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(selectedMethod == method ? .black : .white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(selectedMethod == method ? NativeTheme.cyan : Color.white.opacity(0.09))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 7) {
                ForEach(Self.scannerCapabilities, id: \.self) { label in
                    Text(label).font(.system(size: 9.5, weight: .black)).foregroundColor(.white.opacity(0.82)).padding(.horizontal, 7).padding(.vertical, 5).background(Color.black.opacity(0.22)).clipShape(Capsule())
                }
            }
            HStack(spacing: 9) {
                Button(action: advanceState) { NativeCTA(title: primaryActionTitle, color: NativeTheme.cyan, foreground: .black) }
                Button(action: openLegacyAccess) { NativeCTA(title: "Use Web Access", color: Color.white.opacity(0.10), foreground: .white) }
            }
        }
        .padding(13)
        .background(LinearGradient(colors: [NativeTheme.emerald.opacity(0.12), NativeTheme.cyan.opacity(0.07), Color.black.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(NativeTheme.emerald.opacity(0.18), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityIdentifier("native-access-scanner-preview")
    }

    private var scannerStatusCopy: String {
        switch state {
        case "Scanning": return "Hold near a Bytspot patch or scan a QR code. Native preview only."
        case "Verified": return "Verification preview complete; production audit and checkout stay on web fallback."
        case "Fallback": return "Device APIs unavailable here; continue in My Access or the React scanner."
        default: return "Select Auto, NFC, or QR. Secure camera/NFC verification remains production-backed."
        }
    }

    private var stateColor: Color {
        switch state {
        case "Scanning": return NativeTheme.cyan
        case "Verified": return NativeTheme.emerald
        case "Fallback": return NativeTheme.orange
        default: return Color.white.opacity(0.82)
        }
    }

    private var primaryActionTitle: String {
        switch state {
        case "Idle": return "Start Preview"
        case "Scanning": return "Simulate Verify"
        case "Verified": return "Scan Again"
        default: return "Retry"
        }
    }

    private func advanceState() {
        nativeImpactLight()
        withAnimation(.easeInOut(duration: 0.18)) {
            switch state {
            case "Idle": state = "Scanning"
            case "Scanning": state = "Verified"
            case "Verified": state = "Idle"
            default: state = "Idle"
            }
        }
    }
}

private struct NativeAccessWalletMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan)
            Text(title).font(.system(size: 10.5, weight: .heavy)).foregroundColor(.white.opacity(0.70)).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct NativePatchAccessPreview: View {
    let route: BytspotPatchRoute
    let openLegacyAccess: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                NativeIcon(symbol: "key.radiowaves.forward.fill", color: tierColor)
                VStack(alignment: .leading, spacing: 3) {
                    Text(route.tier.eyebrow).font(.system(size: 11, weight: .black)).foregroundColor(tierColor).tracking(1.3)
                    Text(route.patchId).nativeTitle(19)
                    Text(route.normalizedSummary).nativeBody(size: 12.5)
                }
                Spacer()
            }
            NativeWalletLine(title: "Tier policy", subtitle: "Minimum floor \(currency(route.tier.minimumCents)) · \(route.tier.defaultSubtitle)", icon: "seal.fill")
            if let specialFlow {
                NativeSpecialFlowPreview(flow: specialFlow, accent: tierColor)
            }
            NativePatchCheckoutPreview(route: route, specialFlow: specialFlow, policy: holdPolicy, accent: tierColor, openLegacyAccess: openLegacyAccess)
            Button(action: openLegacyAccess) {
                NativeCTA(title: "Continue in production Access flow", color: tierColor, foreground: .black)
            }
        }
        .padding(16)
        .nativePanel()
    }

    private var holdPolicy: NativeVirtualPatchCheckoutPolicyResult {
        NativeVirtualPatchCheckoutPolicy.resolve(route: route, intent: holdIntent)
    }

    private var specialFlow: NativePatchSpecialFlow? {
        NativePatchSpecialFlow.resolve(route: route)
    }

    private var holdIntent: NativeVirtualPatchCheckoutIntent {
        if let specialFlow { return specialFlow.checkoutIntent(route: route) }
        return NativeVirtualPatchCheckoutIntent(
            serviceId: route.serviceId ?? "\(route.tier.rawValue)-access",
            serviceName: route.tier.displayName + " Access",
            vendorId: route.venueName?.lowercased().replacingOccurrences(of: " ", with: "-") ?? "native-preview",
            amountCents: route.tier.minimumCents,
            guestCount: route.groupSize ?? 1
        )
    }

    private var tierColor: Color {
        switch route.tier {
        case .black: return .yellow
        case .platinum: return NativeTheme.cyan
        case .green: return NativeTheme.emerald
        }
    }

    private func currency(_ cents: Int) -> String {
        let dollars = Double(cents) / 100
        return dollars.formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }
}

private struct NativeSpecialFlowPreview: View {
    let flow: NativePatchSpecialFlow
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 10) {
                Image(systemName: flow.kind == .ghAkwaabaFifa ? "ticket.fill" : "fork.knife")
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(accent)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: 2) {
                    Text(flow.kind.eyebrow).font(.system(size: 10, weight: .black)).foregroundColor(accent).tracking(1.2)
                    Text(flow.summary).nativeBody(size: 11.5, color: .white.opacity(0.72))
                }
                Spacer()
            }
            Text(flow.kind.sectionTitle).font(.system(size: 11, weight: .black)).foregroundColor(.white.opacity(0.58)).tracking(1.1)
            ForEach(flow.lineItems) { item in
                HStack(spacing: 8) {
                    Text(item.label).font(.system(size: 12.5, weight: .bold)).foregroundColor(.white)
                    Spacer()
                    Text("×\(item.quantity)").font(.system(size: 11, weight: .heavy, design: .monospaced)).foregroundColor(.white.opacity(0.55))
                    Text(currency(item.amountCents)).font(.system(size: 11, weight: .heavy, design: .monospaced)).foregroundColor(.white.opacity(0.72))
                }
            }
            NativeWalletLine(title: flow.kind.actionLabel, subtitle: "Preview total \(currency(flow.totalCents)) · \(flow.highlights.prefix(2).joined(separator: " · "))", icon: "checkmark.seal.fill")
        }
        .padding(13)
        .background(accent.opacity(0.10))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(accent.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func currency(_ cents: Int) -> String {
        let dollars = Double(cents) / 100
        return dollars.formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }
}

private struct NativePatchCheckoutPreview: View {
    let route: BytspotPatchRoute
    let specialFlow: NativePatchSpecialFlow?
    let policy: NativeVirtualPatchCheckoutPolicyResult
    let accent: Color
    let openLegacyAccess: () -> Void
    @State private var quantities: [String: Int] = [:]
    @State private var savedPreview = false

    static let checkoutBoundaryLabels = ["Apple Pay Secure", "Hold safe", "Idempotent", "React authorization"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: specialFlow == nil ? "creditcard.and.123" : specialFlow?.kind == .ghAkwaabaFifa ? "ticket.fill" : "fork.knife")
                    .font(.system(size: 16, weight: .black))
                    .foregroundColor(accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Native checkout preview").nativeTitle(16)
                    Text(checkoutSubtitle).nativeBody(size: 11.5)
                }
                Spacer()
                Text(amount(totalCents)).font(.system(size: 16, weight: .black)).foregroundColor(accent)
            }
            ForEach(lineItems) { item in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label).font(.system(size: 12.5, weight: .bold)).foregroundColor(.white)
                        Text(amount(item.amountCents)).font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.58))
                    }
                    Spacer()
                    HStack(spacing: 7) {
                        Button(action: { adjust(item, delta: -1) }) { stepIcon("minus") }
                        Text("\(quantity(for: item))").font(.system(size: 12, weight: .black, design: .monospaced)).foregroundColor(.white).frame(width: 22)
                        Button(action: { adjust(item, delta: 1) }) { stepIcon("plus") }
                    }
                }
                .padding(10)
                .background(Color.black.opacity(0.23))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            HStack(spacing: 7) {
                ForEach(Self.checkoutBoundaryLabels, id: \.self) { label in
                    Text(label).font(.system(size: 9.3, weight: .black)).foregroundColor(.white.opacity(0.84)).padding(.horizontal, 7).padding(.vertical, 5).background(Color.white.opacity(0.09)).clipShape(Capsule())
                }
            }
            NativeWalletLine(title: "Authorization boundary", subtitle: "\(policy.decision.displayName) · \(policy.membershipMode.displayName) · server payment stays on production fallback.", icon: "lock.shield.fill")
            HStack(spacing: 9) {
                Button(action: openLegacyAccess) { NativeCTA(title: primaryActionTitle, color: accent, foreground: .black) }
                Button(action: { savedPreview.toggle(); nativeImpactLight() }) { NativeCTA(title: savedPreview ? "Preview Saved" : "Save Preview", color: Color.white.opacity(0.10), foreground: .white) }
            }
        }
        .padding(13)
        .background(LinearGradient(colors: [accent.opacity(0.11), Color.black.opacity(0.24)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityIdentifier("native-patch-checkout-preview")
    }

    static func checkoutLineItems(for route: BytspotPatchRoute, specialFlow: NativePatchSpecialFlow?) -> [NativePatchLineItem] {
        if let specialFlow { return specialFlow.lineItems }
        return [NativePatchLineItem(id: "access-hold", label: route.tier.displayName + " Access Hold", amountCents: route.tier.minimumCents, quantity: max(route.groupSize ?? 1, 1))]
    }

    private var lineItems: [NativePatchLineItem] {
        Self.checkoutLineItems(for: route, specialFlow: specialFlow)
    }

    private var totalCents: Int {
        lineItems.reduce(0) { $0 + (quantity(for: $1) * max($1.amountCents, 0)) }
    }

    private var checkoutSubtitle: String {
        if let specialFlow { return specialFlow.tagline }
        return "Preview-only access hold with deterministic idempotency."
    }

    private var primaryActionTitle: String {
        specialFlow?.kind.actionLabel ?? "Authorize in Access"
    }

    private func quantity(for item: NativePatchLineItem) -> Int {
        quantities[item.id] ?? max(item.quantity, item.quantity == 0 ? 0 : 1)
    }

    private func adjust(_ item: NativePatchLineItem, delta: Int) {
        nativeImpactLight()
        let upper = specialFlow == nil ? 12 : 20
        quantities[item.id] = min(max(quantity(for: item) + delta, 0), upper)
    }

    private func stepIcon(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 10, weight: .black))
            .foregroundColor(.black)
            .frame(width: 24, height: 24)
            .background(accent)
            .clipShape(Circle())
    }

    private func amount(_ cents: Int) -> String {
        (Double(cents) / 100).formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }
}

private struct NativeWalletLine: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .black)).foregroundColor(.white)
                Text(subtitle).nativeBody(size: 11.5, color: .white.opacity(0.62))
            }
            Spacer()
        }
        .padding(12)
        .background(Color.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}

private struct NativeHomeDashboardView: View {
    enum ActionTarget: Equatable {
        case nativeTab(BytspotNativeTab)
        case hybrid(BytspotHybridRoute)
    }

    struct QuickActionSpec: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let icon: String
        let color: Color
        let target: ActionTarget
    }

    let openHybrid: (BytspotHybridRoute) -> Void
    let openNativeTab: (BytspotNativeTab) -> Void
    @State private var searchText = ""
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var apiState: NativeAPIState
    @EnvironmentObject private var tabContentStore: NativeTabContentStore

    static let quickActionSpecs: [QuickActionSpec] = [
        QuickActionSpec(id: "find-parking", title: "Find Parking", subtitle: "Live spots near you", icon: "mappin.and.ellipse", color: NativeTheme.cyan, target: .nativeTab(.map)),
        QuickActionSpec(id: "nearby", title: "Nearby", subtitle: "What's around", icon: "location.north.line.fill", color: NativeTheme.pink, target: .nativeTab(.map)),
        QuickActionSpec(id: "book-ride", title: "Book a Ride", subtitle: "Uber & Lyft", icon: "star.fill", color: NativeTheme.orange, target: .hybrid(.map)),
        QuickActionSpec(id: "explore-venues", title: "Explore Venues", subtitle: "Discover", icon: "sparkles", color: NativeTheme.magenta, target: .nativeTab(.discover))
    ]

    static let recommendationTitles = ["Reserved parking near you", "Broni Home Taste", "GH Akwaaba Pass"]

    var body: some View {
        NativeScreenScroll {
            nativeHomeHeader
            nativeSearchBar
            tonightPickCard
            weatherSmartCard
            quickActionsSection
            recommendationsSection
            tonightEventsSection
            rightNowSection
            trendingNowSection
            categoryQuickSearchSection
            nearbySection
        }
        .accessibilityIdentifier("native-home-dashboard")
    }

    private var nativeHomeHeader: some View {
        let snapshot = tabContentStore.snapshot
        let spotsNearby = snapshot.venues.reduce(0) { $0 + $1.parking.totalAvailable }
        let forYou = snapshot.discoverCards.count
        let users = max(44, snapshot.venues.compactMap { $0.crowd?.level }.reduce(0, +) * 18)
        let city = "ATL"
        return VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    HStack(spacing: 8) {
                        HStack(spacing: 5) {
                            Image(systemName: "cloud.fill").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan)
                            Text("72°").font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                        }
                        Rectangle().fill(NativePolish.softBorder).frame(width: 1, height: 12)
                        HStack(spacing: 5) {
                            Image(systemName: "clock.fill").font(.system(size: 11, weight: .bold)).foregroundColor(NativeTheme.textSecondary)
                            Text(currentTimeLabel).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textPrimary.opacity(0.92))
                        }
                    }
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(NativeTheme.selectedControlSurface)
                    .overlay(Capsule().stroke(NativePolish.softBorder, lineWidth: 1))
                    .clipShape(Capsule())

                    Spacer(minLength: 6)

                    HStack(spacing: 5) {
                        Circle().fill(NativeTheme.emerald).frame(width: 6, height: 6)
                        Image(systemName: "person.2.fill").font(.system(size: 10, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                        Text("\(users)").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(NativeTheme.emerald.opacity(0.18))
                    .overlay(Capsule().stroke(NativeTheme.emerald.opacity(0.42), lineWidth: 1))
                    .clipShape(Capsule())

                    HStack(spacing: 5) {
                        Image(systemName: "mappin.circle.fill").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan)
                        Text(city).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(NativeTheme.cyan.opacity(0.16))
                    .overlay(Capsule().stroke(NativeTheme.cyan.opacity(0.42), lineWidth: 1))
                    .clipShape(Capsule())

                    Button(action: { openHybrid(.profile) }) {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(NativeTheme.purple)
                            .overlay(Circle().stroke(Color.white.opacity(0.20), lineWidth: 1))
                            .clipShape(Circle())
                            .shadow(color: NativeTheme.purple.opacity(0.45), radius: 6, x: 0, y: 3)
                    }
                    .accessibilityLabel("Open menu")
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
                Rectangle().fill(NativePolish.softBorder).frame(height: 1)
                HStack(spacing: 0) {
                    statStripItem(icon: "circle.fill", iconColor: NativeTheme.emerald, value: "\(spotsNearby)", label: "spots nearby")
                    Rectangle().fill(NativePolish.softBorder).frame(width: 1, height: 18)
                    statStripItem(icon: "chart.line.uptrend.xyaxis", iconColor: NativeTheme.orange, value: nil, label: "Peak hours", valueColor: NativeTheme.orange)
                    Rectangle().fill(NativePolish.softBorder).frame(width: 1, height: 18)
                    statStripItem(icon: "bolt.fill", iconColor: NativeTheme.purple, value: "\(forYou)", label: "for you", valueColor: NativeTheme.purple)
                }
                .padding(.horizontal, 10).padding(.vertical, 11)
            }
            .background(LinearGradient(colors: [NativePolish.elevatedSurface, NativePolish.glassSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous))
            .shadow(color: NativeTheme.softShadow, radius: 18, x: 0, y: 10)

            VStack(alignment: .leading, spacing: 3) {
                Text(contextualEyebrow.0)
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(NativeTheme.cyan)
                Text(contextualEyebrow.1)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(NativeTheme.textTertiary)
            }
            .padding(.horizontal, 4)
        }
        .accessibilityIdentifier("native-home-header")
    }

    private func statStripItem(icon: String, iconColor: Color, value: String?, label: String, valueColor: Color = NativeTheme.textPrimary) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 10, weight: .black)).foregroundColor(iconColor)
            if let v = value {
                Text(v).font(.system(size: 13, weight: .black)).foregroundColor(valueColor)
            }
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundColor(value == nil ? valueColor : NativeTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var currentTimeLabel: String {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: Date())
    }

    private var contextualEyebrow: (String, String) {
        let hour = Calendar.current.component(.hour, from: Date())
        let city = "Midtown"
        switch hour {
        case 5..<11:
            return ("Morning, \(city) Provider Collective", "Fresh starts in \(city) ☀️")
        case 11..<17:
            return ("Afternoon, \(city) Provider Collective", "Afternoon in \(city) ☕️")
        case 17..<22:
            return ("Evening, \(city) Provider Collective", "Evening in \(city) 🌆")
        default:
            return ("Late night, \(city) Provider Collective", "Late night in \(city) 🌙")
        }
    }

    private var nativeSearchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .bold)).foregroundColor(NativeTheme.textTertiary)
            ZStack(alignment: .leading) {
                if searchText.isEmpty {
                    HStack(spacing: 6) {
                        Text("Search for").font(.system(size: 15, weight: .semibold)).foregroundColor(NativeTheme.textPrimary.opacity(0.85))
                        Text(searchPlaceholderRotation).font(.system(size: 15, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                        Text("…").font(.system(size: 15, weight: .semibold)).foregroundColor(NativeTheme.textTertiary.opacity(0.70))
                    }
                }
                TextField("", text: $searchText, onCommit: submitSearch)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(NativeTheme.textPrimary)
                    .accentColor(NativeTheme.cyan)
            }
            Button(action: submitSearch) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.white)
                    .frame(width: 34, height: 34)
                    .background(NativeTheme.purple)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Voice search")
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .background(NativePolish.glassSurface)
        .overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous))
        .shadow(color: NativeTheme.softShadow, radius: 16, x: 0, y: 8)
        .accessibilityIdentifier("native-home-search")
    }

    private var searchPlaceholderRotation: String {
        let pool = ["restaurants", "coffee", "nightlife", "parking", "events", "shopping malls"]
        let bucket = Int(Date().timeIntervalSince1970 / 3) % pool.count
        return pool[bucket]
    }

    private var tonightPickCard: some View {
        let v = tonightsPick
        return NativeHomeHeroCard(
            venue: v,
            eyebrow: "AI Pick",
            eyebrowIcon: "sparkles",
            eyebrowColor: NativeTheme.purple,
            crowdEmoji: crowdEmoji(v.crowd),
            crowdLabel: v.crowd?.label ?? "Chill",
            categoryEmoji: categoryEmoji(v.discoverType),
            ctaTitle: "Open in Discover",
            action: { openNativeTab(.discover) }
        )
        .accessibilityIdentifier("native-home-tonight-pick")
    }

    private var tonightsPick: NativeVenueSummary {
        tabContentStore.snapshot.venues.first(where: { $0.verifiedPatchId != nil }) ?? tabContentStore.snapshot.venues.first ?? NativeTabContentSnapshot.fallback.venues[0]
    }

    private var tonightEventsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("What's Happening Tonight").font(.system(size: 20, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Text("Midtown").font(.system(size: 11, weight: .bold)).foregroundColor(NativeTheme.textTertiary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(tabContentStore.snapshot.events) { event in
                        Button(action: { openNativeTab(.discover) }) {
                            VStack(alignment: .leading, spacing: 8) {
                                ZStack(alignment: .bottomTrailing) {
                                    NativeRemoteImage(
                                        url: event.imageUrl,
                                        fallbackColors: [NativeTheme.orange.opacity(0.55), NativeTheme.purple.opacity(0.45), NativeTheme.cyan.opacity(0.25)],
                                        fallbackEmoji: event.emoji,
                                        emojiSize: 90,
                                        emojiOpacity: 0.40,
                                        emojiOffset: CGSize(width: 16, height: 8)
                                    )
                                    LinearGradient(
                                        colors: [Color.black.opacity(0.0), Color.black.opacity(0.65)],
                                        startPoint: .top, endPoint: .bottom
                                    )
                                    Text(event.price)
                                        .font(.system(size: 11, weight: .black)).foregroundColor(.white)
                                        .padding(.horizontal, 9).padding(.vertical, 5)
                                        .background(NativeTheme.purple.opacity(0.92))
                                        .overlay(Capsule().stroke(Color.white.opacity(0.30), lineWidth: 1))
                                        .clipShape(Capsule())
                                        .padding(10)
                                }
                                .frame(width: 172, height: 128)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                                Text(event.title)
                                    .font(.system(size: 14, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                                    .lineLimit(1)
                                Text("\(event.venue) · \(event.time)")
                                    .font(.system(size: 11, weight: .bold)).foregroundColor(NativeTheme.textSecondary)
                                    .lineLimit(1)
                            }
                            .frame(width: 172, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .accessibilityIdentifier("native-home-tonight-events")
    }

    private var rightNowSection: some View {
        NativeHorizontalSection(title: "Right Now in Midtown", subtitle: "Live") {
            ForEach(Array(tabContentStore.snapshot.venues.filter { $0.crowd != nil }.prefix(6))) { venue in
                NativeMiniCard(eyebrow: crowdBadge(venue.crowd), title: venue.name, subtitle: venue.crowd?.waitMins.map { "~\($0)m wait" } ?? venue.address, iconText: categoryEmoji(venue.discoverType), accent: crowdColor(venue.crowd)) { openNativeTab(.map) }
            }
        }
        .accessibilityIdentifier("native-home-right-now")
    }

    private var trendingNowSection: some View {
        NativeHorizontalSection(title: "🔥 Trending Now", subtitle: "Live crowd") {
            ForEach(Array(tabContentStore.snapshot.venues.sorted { ($0.crowd?.level ?? 0) > ($1.crowd?.level ?? 0) }.prefix(6))) { venue in
                NativeMiniCard(eyebrow: venue.crowd?.label ?? "Trending", title: venue.name, subtitle: venue.parking.totalAvailable > 0 ? "\(venue.parking.totalAvailable) spots · \(venue.parking.priceLabel)" : venue.address, iconText: categoryEmoji(venue.discoverType), accent: NativeTheme.orange) { openNativeTab(.map) }
            }
        }
        .accessibilityIdentifier("native-home-trending-now")
    }

    private var categoryQuickSearchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("What are you feeling?").nativeTitle(21)
                Spacer()
                NativeStatusPill(title: "For You", color: NativeTheme.purple)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 9) {
                    ForEach(["Coffee", "Dining", "Shopping", "Nightlife", "Fitness", "Events"], id: \.self) { label in
                        Button(action: { openNativeTab(.discover) }) {
                            Text(label).font(.system(size: 14, weight: .black)).foregroundColor(NativeTheme.textPrimary).padding(.horizontal, 14).padding(.vertical, 10).background(NativePolish.glassSurface).overlay(Capsule().stroke(NativeTheme.purple.opacity(0.28), lineWidth: 1)).clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .accessibilityIdentifier("native-home-category-search")
    }

    private var nearbySection: some View {
        NativeHorizontalSection(title: "Nearby", subtitle: "Live") {
            ForEach(Array(tabContentStore.snapshot.venues.prefix(6))) { venue in
                NativeMiniCard(eyebrow: venue.distance, title: venue.name, subtitle: "\(venue.parking.totalAvailable) spots · \(venue.crowd?.label ?? "Open")", iconText: "📍", accent: NativeTheme.cyan) { openNativeTab(.map) }
            }
        }
        .accessibilityIdentifier("native-home-nearby")
    }

    private var weatherSmartCard: some View {
        HStack(spacing: 13) {
            Text("☀️").font(.system(size: 28))
                .frame(width: 52, height: 52)
                .background(LinearGradient(colors: [NativeTheme.cyan.opacity(0.24), NativeTheme.purple.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("72°").font(.system(size: 24, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    Text("Clear").font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.textSecondary)
                }
                Text("Weather-smart parking · live native preview").nativeBody(size: 12, color: NativeTheme.cyan.opacity(0.88))
                Text("Good night for walking a block; prioritize covered parking if rain changes.").nativeBody(size: 12, color: NativeTheme.textTertiary)
            }
            Spacer()
            Text("UPDATING").font(.system(size: 10, weight: .black)).foregroundColor(NativeTheme.textSecondary).padding(.horizontal, 8).padding(.vertical, 5).background(NativeTheme.selectedControlSurface).clipShape(Capsule())
        }
        .padding(14)
        .nativePanel()
        .accessibilityIdentifier("native-home-weather-smart")
    }

    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions").nativeTitle(24)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(Self.quickActionSpecs) { spec in
                    NativeQuickAction(title: spec.title, subtitle: spec.subtitle, icon: spec.icon, color: spec.color) { perform(spec.target) }
                        .accessibilityIdentifier("native-home-action-\(spec.id)")
                }
            }
        }
    }

    private var recommendationsSection: some View {
        let picks = Array(tabContentStore.snapshot.discoverCards.filter { $0.type == "service" }.prefix(6))
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Recommended for you").font(.system(size: 20, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    Text("Premium service cards from the unified Services feed")
                        .font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.textSecondary).lineLimit(2)
                }
                Spacer(minLength: 8)
                Text("\(picks.count) picks")
                    .font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    .padding(.horizontal, 9).padding(.vertical, 6).background(NativeTheme.cyan.opacity(0.16)).clipShape(Capsule())
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(picks) { card in
                        NativeHomeServiceRecommendationCard(card: card) { openNativeTab(.discover) }
                        .frame(width: 280)
                    }
                }
            }
        }
        .accessibilityIdentifier("native-home-recommendations")
    }

    private func perform(_ target: ActionTarget) {
        switch target {
        case .nativeTab(let tab): openNativeTab(tab)
        case .hybrid(let route): openHybrid(route)
        }
    }

    private func submitSearch() {
        nativeImpactLight()
        openHybrid(.discover)
    }

    private func crowdBadge(_ crowd: NativeCrowdSummary?) -> String { "\(crowdEmoji(crowd)) \(crowd?.label ?? "Chill")" }
    private func crowdEmoji(_ crowd: NativeCrowdSummary?) -> String { (crowd?.level ?? 1) >= 4 ? "🔴" : (crowd?.level ?? 1) == 3 ? "🟠" : (crowd?.level ?? 1) == 2 ? "🟡" : "🟢" }
    private func crowdColor(_ crowd: NativeCrowdSummary?) -> Color { (crowd?.level ?? 1) >= 4 ? .red : (crowd?.level ?? 1) == 3 ? NativeTheme.orange : (crowd?.level ?? 1) == 2 ? .yellow : NativeTheme.emerald }
    private func categoryEmoji(_ type: String) -> String { ["dining": "🍽️", "nightlife": "🎶", "coffee": "☕", "shopping": "🛍️", "fitness": "💪", "entertainment": "🎭", "parking": "🅿️"][type] ?? "📍" }
}

private struct NativeRemoteImage: View {
    let url: URL?
    let fallbackColors: [Color]
    let fallbackEmoji: String?
    var emojiSize: CGFloat = 130
    var emojiOpacity: Double = 0.18
    var emojiOffset: CGSize = CGSize(width: 70, height: 10)

    var body: some View {
        ZStack {
            placeholder
            if let optimizedURL {
                AsyncImage(url: optimizedURL, transaction: Transaction(animation: .easeInOut(duration: 0.25))) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .interpolation(.high)
                            .antialiased(true)
                            .scaledToFill()
                            .transition(.opacity)
                    case .failure:
                        placeholder
                    case .empty:
                        Color.clear
                    @unknown default:
                        Color.clear
                    }
                }
            }
        }
    }

    private var optimizedURL: URL? {
        guard let url,
              let host = url.host?.lowercased(),
              host.contains("images.unsplash.com"),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        var items = components.queryItems ?? []
        func set(_ name: String, _ value: String) {
            if let index = items.firstIndex(where: { $0.name == name }) { items[index].value = value }
            else { items.append(URLQueryItem(name: name, value: value)) }
        }
        set("auto", "format")
        set("fit", "crop")
        set("w", "1400")
        set("q", "90")
        set("dpr", "2")
        components.queryItems = items
        return components.url ?? url
    }

    private var placeholder: some View {
        ZStack {
            LinearGradient(colors: fallbackColors, startPoint: .topLeading, endPoint: .bottomTrailing)
            if let fallbackEmoji {
                Text(fallbackEmoji)
                    .font(.system(size: emojiSize))
                    .opacity(emojiOpacity)
                    .offset(x: emojiOffset.width, y: emojiOffset.height)
            }
        }
    }
}

private struct NativeHomeHeroCard: View {
    let venue: NativeVenueSummary
    let eyebrow: String
    let eyebrowIcon: String
    let eyebrowColor: Color
    let crowdEmoji: String
    let crowdLabel: String
    let categoryEmoji: String
    let ctaTitle: String
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .bottomLeading) {
                NativeRemoteImage(
                    url: venue.imageUrl,
                    fallbackColors: [NativeTheme.purple.opacity(0.55), NativeTheme.magenta.opacity(0.32), NativeTheme.cyan.opacity(0.22)],
                    fallbackEmoji: categoryEmoji,
                    emojiSize: 150,
                    emojiOpacity: 0.16,
                    emojiOffset: CGSize(width: 70, height: 10)
                )
                LinearGradient(
                    colors: colorScheme == .dark
                        ? [Color.black.opacity(0.02), Color.black.opacity(0.42), Color.black.opacity(0.92)]
                        : [Color.white.opacity(0.02), Color.white.opacity(0.62), Color.white.opacity(0.94)],
                    startPoint: .top, endPoint: .bottom
                )
                VStack {
                    HStack {
                        Spacer()
                        HStack(spacing: 4) {
                            Image(systemName: eyebrowIcon).font(.system(size: 10, weight: .black))
                            Text(eyebrow).font(.system(size: 11, weight: .black))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(eyebrowColor.opacity(0.92))
                        .overlay(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                        .clipShape(Capsule())
                        .shadow(color: eyebrowColor.opacity(0.45), radius: 8, x: 0, y: 4)
                    }
                    Spacer()
                }
                .padding(12)
                VStack(alignment: .leading, spacing: 6) {
                    Text(categoryEmoji).font(.system(size: 17))
                    Text(venue.name)
                        .font(.system(size: 24, weight: .black))
                        .foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary)
                        .lineLimit(2)
                        .shadow(color: colorScheme == .dark ? .black.opacity(0.45) : .white.opacity(0.0), radius: 4, x: 0, y: 1)
                    Text(venue.address)
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(colorScheme == .dark ? .white.opacity(0.85) : NativeTheme.textSecondary)
                        .lineLimit(1)
                        .shadow(color: colorScheme == .dark ? .black.opacity(0.35) : .white.opacity(0.0), radius: 3, x: 0, y: 1)
                    HStack(spacing: 8) {
                        if !crowdLabel.isEmpty {
                            Text("\(crowdEmoji) \(crowdLabel)")
                                .font(.system(size: 10, weight: .black))
                                .foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(colorScheme == .dark ? Color.black.opacity(0.55) : NativeTheme.selectedControlSurface)
                                .overlay(Capsule().stroke(NativePolish.softBorder, lineWidth: 1))
                                .clipShape(Capsule())
                        }
                        if let r = venue.rating {
                            HStack(spacing: 3) {
                                Image(systemName: "star.fill").font(.system(size: 9, weight: .black))
                                Text(String(format: "%.1f", r)).font(.system(size: 10, weight: .black))
                            }
                            .foregroundColor(colorScheme == .dark ? .white : .black)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(NativeTheme.orange.opacity(0.92))
                            .clipShape(Capsule())
                        }
                    }
                    HStack(spacing: 6) {
                        Text(ctaTitle).font(.system(size: 13, weight: .black))
                        Image(systemName: "arrow.right").font(.system(size: 11, weight: .black))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background(NativeTheme.cyan)
                    .clipShape(Capsule())
                    .padding(.top, 4)
                }
                .padding(18)
            }
            .frame(height: 252)
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.heroRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.heroRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
            .shadow(color: NativeTheme.softShadow, radius: 22, x: 0, y: 14)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeHomeServiceRecommendationCard: View {
    let card: NativeDiscoverSummary
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .bottomLeading) {
                NativeRemoteImage(
                    url: card.imageUrl,
                    fallbackColors: [NativeTheme.cyan.opacity(0.42), NativeTheme.purple.opacity(0.30), NativeTheme.pink.opacity(0.20)],
                    fallbackEmoji: card.title.contains("GH Akwaaba") ? "🇬🇭" : "🛎️",
                    emojiSize: 120,
                    emojiOpacity: 0.22,
                    emojiOffset: CGSize(width: 62, height: 6)
                )
                LinearGradient(
                    colors: colorScheme == .dark
                        ? [Color.black.opacity(0.02), Color.black.opacity(0.48), Color.black.opacity(0.92)]
                        : [Color.white.opacity(0.02), Color.white.opacity(0.58), Color.white.opacity(0.94)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 7) {
                        Text("SERVICES").serviceChip(color: NativeTheme.cyan, foreground: .black)
                        if card.membershipRequired { Text("MEMBER").serviceChip(color: NativeTheme.purple, foreground: .white) }
                    }
                    Spacer()
                    Text(card.title).font(.system(size: 19, weight: .black)).foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary).lineLimit(2)
                    Text(card.metadataLine).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan).lineLimit(1)
                    HStack(spacing: 6) {
                        Text("Vibe \(card.vibeScore)/10").serviceChip(color: colorScheme == .dark ? Color.black.opacity(0.58) : NativeTheme.selectedControlSurface, foreground: colorScheme == .dark ? .white : NativeTheme.textPrimary)
                        Text(card.cta).serviceChip(color: NativeTheme.cyan, foreground: .black)
                    }
                }
                .padding(14)
            }
            .frame(height: 228)
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(NativeTheme.cyan.opacity(0.20), lineWidth: 1))
            .shadow(color: NativeTheme.softShadow, radius: 18, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }
}



private struct NativeStatusPill: View {
    let title: String
    let color: Color

    var body: some View {
        Text(title)
            .font(.system(size: 11, weight: .black))
            .foregroundColor(NativeTheme.textPrimary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(color.opacity(0.18))
            .overlay(Capsule().stroke(color.opacity(0.30), lineWidth: 1))
            .clipShape(Capsule())
    }
}

private struct NativeDiscoverView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    let openNativeTab: (BytspotNativeTab) -> Void
    @State private var selectedFilter: String? = nil
    @State private var entryFilter = "all"
    @State private var sortBy = "crowd"
    @State private var savedOnly = false
    @State private var showIntroCard = true
    @State private var savedCardIDs: Set<String> = []
    @State private var skippedCardIDs: Set<String> = []
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var tabContentStore: NativeTabContentStore

    struct DiscoverCardSpec: Identifiable, Equatable {
        let id: String
        let type: String
        let title: String
        let subtitle: String
        let distance: String
        let rating: String
        let icon: String
        let verified: Bool
        let entryType: String
        let cta: String
        let imageUrl: URL?
        let categoryLabel: String
        let badgeText: String
        let metadataLine: String
        let features: [String]
        let vibeScore: Int
        let availability: String
        let membershipRequired: Bool
    }

    static let categoryLabels = ["All", "🍸 Nightlife", "🍽️ Dining", "☕ Coffee", "🛍️ Shopping", "🎭 Events", "🛎 Services", "💪 Fitness", "🅿️ Parking"]
    static let visibleSectionOrder = ["filters", "feed"]
    static let filterRowCount = 3
    static let introCardDeckIndex = 0

    static let curatedCards: [DiscoverCardSpec] = NativeTabContentSnapshot.fallback.discoverCards.map(Self.spec(from:))

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                filterSystem
                discoverDeck
            }
            .padding(20)
            .padding(.bottom, 12)
        }
        .refreshable { await tabContentStore.refresh(sessionStore: sessionStore) }
        .background(NativeTheme.background.ignoresSafeArea())
        .accessibilityIdentifier("native-discover-depth")
    }

    private var filterSystem: some View {
        VStack(alignment: .leading, spacing: 8) {
            categoryRail
            accessTierRail
            sortSavedRail
        }
        .padding(.top, 4)
        .accessibilityIdentifier("native-discover-filter-system")
    }

    private var categoryRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Self.categoryLabels, id: \.self) { label in
                    NativeDiscoverFilterChip(
                        title: label,
                        active: active(label),
                        activeColor: NativeTheme.cyan,
                        activeForeground: .black
                    ) {
                        selectedFilter = filterValue(for: label)
                    }
                }
            }
        }
        .accessibilityIdentifier("native-discover-category-rail")
    }

    private var accessTierRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([("all", "🎟️ All access"), ("free", "✅ Free"), ("paid", "💳 Paid entry")], id: \.0) { value, title in
                    NativeDiscoverFilterChip(
                        title: title,
                        active: entryFilter == value,
                        activeColor: NativeTheme.cyan,
                        activeForeground: NativeTheme.cyan,
                        outlinedActive: true
                    ) { entryFilter = value }
                }
            }
        }
        .accessibilityIdentifier("native-discover-access-rail")
    }

    private var sortSavedRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([("crowd", "🔥 Buzzing"), ("rating", "⭐ Rating"), ("distance", "📍 Distance")], id: \.0) { value, title in
                    NativeDiscoverFilterChip(
                        title: title,
                        active: sortBy == value,
                        activeColor: NativeTheme.purple,
                        activeForeground: sortBy == value ? NativeTheme.purple : NativeTheme.textPrimary,
                        outlinedActive: true
                    ) { sortBy = value }
                }
                NativeDiscoverFilterChip(
                    title: savedOnly ? "♥ Saved" : "♡ Saved",
                    active: savedOnly,
                    activeColor: NativeTheme.pink,
                    activeForeground: savedOnly ? NativeTheme.pink : NativeTheme.textPrimary,
                    outlinedActive: true
                ) { savedOnly.toggle() }
            }
        }
        .accessibilityIdentifier("native-discover-sort-rail")
    }

    private var discoverDeck: some View {
        VStack(spacing: 24) {
            if showIntroCard {
                NativeDiscoverIntroCard(
                    onDismiss: { withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) { showIntroCard = false } },
                    openDiscover: { openHybrid(.discover) }
                )
                .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .top)), removal: .opacity.combined(with: .scale(scale: 0.96))))
            }
            if rankedCards.isEmpty {
                NativeRow(title: "No spots match this filter", subtitle: "Try All or Services to see Broni Home Taste and GH Akwaaba Pass.", icon: "arrow.clockwise") { selectedFilter = nil; entryFilter = "all"; savedOnly = false }
            } else {
                ForEach(rankedCards) { card in
                    NativeDiscoverFeatureCard(
                        card: card,
                        isSaved: savedCardIDs.contains(card.id),
                        openDetails: { openHybrid(.discover) },
                        toggleFavorite: { toggleSaved(card.id) },
                        skipCard: { skip(card.id) }
                    )
                }
            }
        }
        .accessibilityIdentifier("native-discover-card-deck")
    }

    private var filteredCards: [DiscoverCardSpec] {
        let sourceCards = tabContentStore.snapshot.discoverCards.map(Self.spec(from:))
        let candidates = (sourceCards.isEmpty ? Self.curatedCards : sourceCards).filter { card in
            (selectedFilter == nil || card.type == selectedFilter)
                && (entryFilter == "all" || card.entryType == entryFilter)
                && (!savedOnly || savedCardIDs.contains(card.id))
                && !skippedCardIDs.contains(card.id)
        }
        return candidates
    }

    private var rankedCards: [DiscoverCardSpec] {
        filteredCards.sorted { first, second in
            if sortBy == "rating" { return first.rating > second.rating }
            if sortBy == "distance" { return first.distance < second.distance }
            return first.vibeScore == second.vibeScore ? first.verified && !second.verified : first.vibeScore > second.vibeScore
        }
    }

    private static func spec(from card: NativeDiscoverSummary) -> DiscoverCardSpec {
        DiscoverCardSpec(id: card.id, type: card.type, title: card.title, subtitle: card.subtitle, distance: card.distance, rating: card.rating, icon: card.icon, verified: card.verified, entryType: card.entryType, cta: card.cta, imageUrl: card.imageUrl, categoryLabel: card.categoryLabel, badgeText: card.badgeText, metadataLine: card.metadataLine, features: card.features, vibeScore: card.vibeScore, availability: card.availability, membershipRequired: card.membershipRequired)
    }

    private func filterValue(for label: String) -> String? {
        if label == "All" { return nil }
        if label.contains("Nightlife") { return "nightlife" }
        if label.contains("Dining") { return "dining" }
        if label.contains("Coffee") { return "coffee" }
        if label.contains("Shopping") { return "shopping" }
        if label.contains("Events") { return "entertainment" }
        if label.contains("Services") { return "service" }
        if label.contains("Fitness") { return "fitness" }
        if label.contains("Parking") { return "parking" }
        return nil
    }

    private func active(_ label: String) -> Bool {
        filterValue(for: label) == selectedFilter
    }

    private func toggleSaved(_ id: String) {
        withAnimation(.spring(response: 0.24, dampingFraction: 0.78)) {
            if savedCardIDs.contains(id) { savedCardIDs.remove(id) } else { savedCardIDs.insert(id) }
        }
        nativeImpactLight()
    }

    private func skip(_ id: String) {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { skippedCardIDs.insert(id) }
        nativeImpactLight()
    }
}

private struct NativeDiscoverFilterChip: View {
    let title: String
    let active: Bool
    let activeColor: Color
    let activeForeground: Color
    var outlinedActive = false
    let action: () -> Void

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            Text(title)
                .font(.system(size: 14, weight: .black))
                .foregroundColor(foreground)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(background)
                .overlay(Capsule().stroke(borderColor, lineWidth: active ? 1.5 : 1))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var foreground: Color {
        if active { return outlinedActive ? activeForeground : .black }
        return NativeTheme.textSecondary
    }

    private var background: some View {
        Group {
            if active && !outlinedActive {
                activeColor
            } else if active {
                NativeTheme.selectedControlSurface
            } else {
                NativePolish.glassSurface
            }
        }
    }

    private var borderColor: Color {
        active ? activeColor.opacity(0.95) : NativePolish.softBorder
    }
}

private struct NativeDiscoverIntroCard: View {
    let onDismiss: () -> Void
    let openDiscover: () -> Void
    @State private var dragOffset: CGFloat = 0
    static let compactHeight: CGFloat = 152

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [NativeTheme.purple.opacity(0.92), NativeTheme.magenta.opacity(0.72), NativeTheme.cyan.opacity(0.42)], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Color.white.opacity(0.24), .clear], center: .topTrailing, startRadius: 10, endRadius: 180)
            HStack(alignment: .center, spacing: 16) {
                ZStack {
                    Circle().fill(Color.black.opacity(0.28)).frame(width: 68, height: 68)
                    Image(systemName: "hand.draw.fill").font(.system(size: 30, weight: .black)).foregroundColor(.white)
                    Image(systemName: "arrow.right").font(.system(size: 16, weight: .black)).foregroundColor(.white.opacity(0.82)).offset(x: 40)
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        NativeDiscoverIntroPill(title: "SWIPE GUIDE", color: .black.opacity(0.42), foreground: .white)
                        NativeDiscoverIntroPill(title: "PULL TO REFRESH", color: .white.opacity(0.90), foreground: .black)
                    }
                    Text("Swipe right for details")
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(.white)
                    Text("Tap opens details · heart saves · left skip is optional.")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.white.opacity(0.82))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Button(action: { nativeImpactLight(); onDismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.black.opacity(0.26))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.compactHeight)
        .background(NativeTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.white.opacity(0.24), lineWidth: 2))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .offset(x: dragOffset)
        .rotationEffect(.degrees(Double(dragOffset / 52)))
        .gesture(DragGesture(minimumDistance: 12).onChanged { value in dragOffset = max(min(value.translation.width, 96), -96) }.onEnded { value in
            if value.translation.width > 80 { nativeImpactLight(); openDiscover() }
            if value.translation.width < -80 { nativeImpactLight(); onDismiss() }
            withAnimation(.spring(response: 0.30, dampingFraction: 0.82)) { dragOffset = 0 }
        })
        .accessibilityIdentifier("native-discover-intro-card")
    }
}

private struct NativeDiscoverIntroPill: View {
    let title: String
    let color: Color
    let foreground: Color

    var body: some View {
        Text(title).font(.system(size: 11, weight: .black)).foregroundColor(foreground).tracking(1.1).padding(.horizontal, 12).frame(minHeight: 32).background(color).clipShape(Capsule())
    }
}

private struct NativeDiscoverIntroStep: View {
    let icon: String
    let title: String

    var body: some View {
        Label(title, systemImage: icon)
            .font(.system(size: 12, weight: .black))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
            .background(Color.white.opacity(0.10))
            .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            .clipShape(Capsule())
    }
}

private struct NativeDiscoverFeatureCard: View {
    let card: NativeDiscoverView.DiscoverCardSpec
    let isSaved: Bool
    let openDetails: () -> Void
    let toggleFavorite: () -> Void
    let skipCard: () -> Void
    @State private var dragOffset: CGFloat = 0
    @State private var isPressing = false
    @Environment(\.colorScheme) private var colorScheme
    static let cardHeight: CGFloat = 460
    static let heroHeight: CGFloat = 248
    static let bodyHeight: CGFloat = 212

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                NativeRemoteImage(
                    url: card.imageUrl,
                    fallbackColors: colorScheme == .dark
                        ? [cardAccent.opacity(0.46), NativeTheme.purple.opacity(0.28), Color.black.opacity(0.78)]
                        : [cardAccent.opacity(0.28), Color(hex: 0xF4F8FB), NativeTheme.cyan.opacity(0.16)],
                    fallbackEmoji: fallbackEmoji,
                    emojiSize: 120,
                    emojiOpacity: 0.16,
                    emojiOffset: CGSize(width: 68, height: 6)
                )
                .frame(maxWidth: .infinity)
                .frame(height: Self.heroHeight)
                .clipped()
                heroContrastWash
                VStack(spacing: 0) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Image(systemName: "location.fill")
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundColor(NativeTheme.cyan)
                                Text(card.distance.isEmpty ? "—" : card.distance)
                                    .font(.system(size: 13, weight: .black))
                                    .foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary)
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                            .background(colorScheme == .dark ? Color.black.opacity(0.66) : Color(hex: 0xF8FAFC).opacity(0.92))
                            .overlay(Capsule().stroke(colorScheme == .dark ? Color.white.opacity(0.12) : Color(hex: 0xDDE3EA), lineWidth: 1))
                            .clipShape(Capsule())
                            if card.verified { patchVerifiedBadge }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 8) {
                            Button(action: toggleFavorite) {
                                Image(systemName: isSaved ? "heart.fill" : "heart")
                                    .font(.system(size: 18, weight: .black))
                                    .foregroundColor(isSaved ? NativeTheme.pink : NativeTheme.textPrimary.opacity(0.86))
                                    .frame(width: 44, height: 44)
                                    .background(NativePolish.elevatedSurface)
                                    .overlay(Circle().stroke(NativePolish.softBorder, lineWidth: 1))
                                    .clipShape(Circle())
                                    .shadow(color: isSaved ? NativeTheme.pink.opacity(0.24) : NativeTheme.softShadow, radius: 10, x: 0, y: 6)
                                    .scaleEffect(isSaved ? 1.08 : 1.0)
                            }
                            .buttonStyle(.plain)
                            Text(card.categoryLabel)
                                .font(.system(size: 13, weight: .black))
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 38)
                                .background(categoryGradient)
                                .clipShape(Capsule())
                                .shadow(color: cardAccent.opacity(0.30), radius: 8, x: 0, y: 4)
                        }
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 6) {
                        Text(card.title)
                            .font(.system(size: 24, weight: .black))
                            .foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary)
                            .lineLimit(2)
                        HStack(spacing: 9) {
                            Label(card.rating, systemImage: "star.fill")
                                .font(.system(size: 14, weight: .black))
                                .foregroundColor(NativeTheme.orange)
                            Text(card.metadataLine)
                                .font(.system(size: 14, weight: .black))
                                .foregroundColor(colorScheme == .dark ? .white.opacity(0.90) : NativeTheme.textSecondary)
                                .lineLimit(1)
                        }
                        Text(card.badgeText)
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(card.entryType == "free" ? .black : .white)
                            .tracking(0.6)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(badgeColor.opacity(0.95))
                            .clipShape(Capsule())
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(20)
            }
            .frame(maxWidth: .infinity)
            .frame(height: Self.heroHeight)
            .clipped()

            VStack(alignment: .leading, spacing: 14) {
                Text(card.subtitle)
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(NativeTheme.textPrimary.opacity(0.86))
                    .lineLimit(2)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 118), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(Array(card.features.prefix(4)), id: \.self) { feature in
                        Text(feature)
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary.opacity(0.86))
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 34)
                            .background(NativeTheme.selectedControlSurface)
                            .overlay(Capsule().stroke(NativePolish.softBorder, lineWidth: 1))
                            .clipShape(Capsule())
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Vibe Score")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(NativeTheme.textSecondary)
                        Spacer()
                        Text("\(card.vibeScore)/10")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary)
                    }
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(NativeTheme.selectedControlSurface)
                            Capsule().fill(LinearGradient(colors: [NativeTheme.cyan, NativeTheme.purple, NativeTheme.pink], startPoint: .leading, endPoint: .trailing))
                                .frame(width: proxy.size.width * CGFloat(max(min(card.vibeScore, 10), 0)) / 10)
                        }
                    }
                    .frame(height: 8)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .frame(height: Self.bodyHeight, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.cardHeight)
        .background(LinearGradient(colors: [NativePolish.elevatedSurface, NativePolish.glassSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: NativePolish.heroRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: NativePolish.heroRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: NativePolish.heroRadius, style: .continuous))
        .shadow(color: NativeTheme.softShadow, radius: 24, x: 0, y: 14)
        .offset(x: dragOffset)
        .rotationEffect(.degrees(Double(dragOffset / 58)))
        .scaleEffect(isPressing ? 0.985 : 1.0)
        .animation(.spring(response: 0.24, dampingFraction: 0.82), value: isSaved)
        .animation(.spring(response: 0.26, dampingFraction: 0.86), value: isPressing)
        .onTapGesture { nativeImpactLight(); openDetails() }
        .gesture(DragGesture(minimumDistance: 14).onChanged { value in
            dragOffset = max(min(value.translation.width, 112), -72)
            isPressing = true
        }.onEnded { value in
            isPressing = false
            if value.translation.width > 88 {
                nativeImpactLight()
                openDetails()
            } else if value.translation.width < -64 {
                skipCard()
            }
            withAnimation(.spring(response: 0.30, dampingFraction: 0.84)) { dragOffset = 0 }
        })
        .accessibilityIdentifier("native-discover-feature-card-\(card.id)")
    }

    private var heroContrastWash: some View {
        ZStack {
            Color.black.opacity(colorScheme == .dark ? 0.08 : 0.025)
                .blendMode(.multiply)
            LinearGradient(
                gradient: Gradient(stops: colorScheme == .dark ? [
                    .init(color: Color.black.opacity(0.00), location: 0.00),
                    .init(color: Color.black.opacity(0.08), location: 0.42),
                    .init(color: Color.black.opacity(0.80), location: 1.00)
                ] : [
                    .init(color: Color.white.opacity(0.00), location: 0.00),
                    .init(color: Color.white.opacity(0.10), location: 0.46),
                    .init(color: Color.white.opacity(0.84), location: 1.00)
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .allowsHitTesting(false)
    }

    private var patchVerifiedBadge: some View {
        HStack(spacing: 5) {
            Image(systemName: "checkmark.shield.fill").font(.system(size: 10, weight: .black))
            Text("Patch verified").font(.system(size: 10, weight: .black))
        }
        .foregroundColor(NativeTheme.cyan)
        .padding(.horizontal, 9)
        .frame(minHeight: 28)
        .background(NativeTheme.selectedControlSurface)
        .overlay(Capsule().stroke(NativeTheme.cyan.opacity(0.22), lineWidth: 1))
        .clipShape(Capsule())
    }

    private var cardAccent: Color {
        switch card.type {
        case "service": return NativeTheme.cyan
        case "parking": return NativeTheme.emerald
        case "shopping", "entertainment", "nightlife": return NativeTheme.pink
        default: return NativeTheme.cyan
        }
    }

    private var badgeColor: Color { card.entryType == "free" ? NativeTheme.cyan : NativeTheme.purple }

    private var categoryGradient: LinearGradient {
        LinearGradient(colors: [cardAccent, NativeTheme.purple], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var fallbackEmoji: String {
        if card.title.contains("GH Akwaaba") { return "🇬🇭" }
        if card.title.contains("Broni") { return "🍽️" }
        switch card.type {
        case "dining": return "🍽️"
        case "nightlife": return "🍸"
        case "coffee": return "☕"
        case "shopping": return "🛍️"
        case "entertainment": return "🎭"
        case "fitness": return "💪"
        case "parking": return "🅿️"
        case "service": return "🛎️"
        default: return "📍"
        }
    }
}

private struct NativeSpecialDiscoverCard: View {
    let title: String
    let subtitle: String
    let icon: String
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                NativeIcon(symbol: icon, color: accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).nativeTitle(17)
                    Text(subtitle).nativeBody(size: 12)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(NativeTheme.textTertiary)
            }
            .padding(14)
            .background(accent.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// Stays `private`: promoting this 1000-line view to internal would force every
// private subtype it exposes (markers, pins, sheets) internal too. The AppTests
// XCTest target instead reaches the pure, load-bearing L2 gate through the
// internal `NativeProximityGate` façade below, which forwards to this view's
// static gate surface via same-file access.
private struct NativeMapExploreView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    /// Advisory-only hybrid bridge pre-warm, fired when the parker crosses into
    /// the pre-stage ring. Defaults to a no-op so previews/tests need not wire it.
    var prewarmBridge: () -> Void = {}
    let activeTier: BytspotTier
    /// Premium-membership entitlement (orthogonal to tier). Drives whether the
    /// Map Functions sheet's premium rows unlock or show the upgrade nudge.
    var membership: BytspotMembership = .free
    @State private var region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 33.7866, longitude: -84.3833), span: MKCoordinateSpan(latitudeDelta: 0.045, longitudeDelta: 0.045))
    @State private var selectedMode = modeTitles[0]
    @State private var selectedPin: NativeMapPin?
    @State private var showFunctionSheet = Self.previewShowsFunctionSheet
    @State private var showParking = true
    @State private var showVenues = true
    @State private var showTapZones = true
    @State private var showVerifiedOnly = false
    @State private var showTrafficIntel = false
    @State private var trafficIntelVenue: NativeVenueSummary?
    @State private var premiumUpsellFunction: BytspotPremiumMapFunction?
    @State private var showHeatmap = false
    @State private var entryFilter: String? = nil
    @State private var vibeFilter: Int? = nil
    @State private var communityReports: [NativeCommunityReport] = NativeCommunityReport.samples
    @State private var recenterMode: NativeMapRecenterMode = .off
    @State private var pairedPatchVenueID: String? = Self.previewPairedPatchVenueID
    @State private var gateLatched = false
    @State private var bridgePrewarmed = false
    @StateObject private var headingProvider = NativeMapHeadingProvider()
    @EnvironmentObject private var tabContentStore: NativeTabContentStore
    @EnvironmentObject private var pairingStore: NativePatchPairingStore
    private var venues: [NativeVenueSummary] {
        tabContentStore.snapshot.venues.isEmpty ? NativeTabContentSnapshot.fallback.venues : tabContentStore.snapshot.venues
    }

    private var pins: [NativeMapPin] {
        let livePins = venues.map(NativeMapPin.init(venue:))
        return livePins.isEmpty ? NativeMapPin.samples : livePins
    }

    private var verifiedPins: [NativeMapPin] {
        pins.filter { $0.kind == .partner || $0.kind == .access }
    }

    /// Meters to the nearest verified tap zone, or nil while location is unknown.
    /// Honors the simulator proximity override for screenshot/regression runs.
    private var nearestVerifiedDistanceMeters: CLLocationDistance? {
        if let override = Self.previewProximityMetersOverride { return override }
        guard let here = headingProvider.userLocation else { return nil }
        return verifiedPins
            .map { here.distance(from: CLLocation(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude)) }
            .min()
    }

    /// Horizontal accuracy of the current fix, in meters. CLLocation reports a
    /// negative value when the fix is invalid, which the gate treats as untrusted.
    private var currentHorizontalAccuracy: CLLocationAccuracy {
        headingProvider.userLocation?.horizontalAccuracy ?? -1
    }

    /// Pure Trust Ladder L2 decision shared by the gate, the CTA, and self-tests.
    /// Keeping it static + pure lets NativeMapParitySelfTests lock the boundary
    /// semantics so the proximity gate can never silently regress to cosmetic.
    ///
    /// Sensor fusion + hysteresis:
    /// - `accuracy` < 0 (invalid) or worse than `verifiedZoneAccuracyFloorMeters`
    ///   is fail-safe denied — a fix too noisy to trust the distance can't arm L2.
    ///   The default of 0 keeps the pure-distance call sites (and self-tests) at
    ///   "perfect accuracy" so the boundary semantics are unchanged for them.
    /// - `wasInZone` selects the Schmitt boundary: arm at `verifiedZoneRadiusMeters`,
    ///   release only at the wider `verifiedZoneExitMeters`, so a fix dithering at
    ///   the edge can't oscillate the gate.
    static func directScanPermitted(
        nearestVerifiedMeters distance: CLLocationDistance?,
        horizontalAccuracy accuracy: CLLocationAccuracy = 0,
        wasInZone: Bool = false
    ) -> Bool {
        guard let distance else { return false }
        guard accuracy >= 0, accuracy <= verifiedZoneAccuracyFloorMeters else { return false }
        let boundary = wasInZone ? verifiedZoneExitMeters : verifiedZoneRadiusMeters
        return distance <= boundary
    }

    /// Pure, ADVISORY descent classification — maps a distance to the innermost
    /// ring it has crossed so the UI can pre-warm ahead of arming. This is NOT a
    /// trust decision: it never feeds BytspotTrustEngine and `.preStage`/`.discovery`
    /// grant nothing. The only load-bearing L2 decision remains directScanPermitted.
    /// Static + pure so NativeMapParitySelfTests can lock the ring boundaries and
    /// prove the rings leak no trust.
    static func descentStage(nearestVerifiedMeters distance: CLLocationDistance?) -> BytspotDescentStage {
        guard let distance else { return .faraway }
        if distance <= verifiedZoneRadiusMeters { return .armed }
        if distance <= verifiedZonePreStageMeters { return .preStage }
        if distance <= verifiedZoneDiscoveryMeters { return .discovery }
        return .faraway
    }

    /// Immutable snapshot of every signal the Trust Ladder consults, assembled
    /// from this view's sensors/state. The view never derives a trust *level*
    /// itself — it only gathers evidence and hands it to BytspotTrustEngine.reduce,
    /// which is the single place trust is computed (structurally killing the
    /// cosmetic drift the proximity gate was prone to). The map experience floors
    /// at static-discovery (the parker is in-app browsing the verified map);
    /// signed-token/NFC evidence is not wired into the native preview yet. The
    /// simulator override is deterministic: perfect accuracy, no hysteresis carry.
    private var trustEvidence: BytspotTrustEvidence {
        let overriding = Self.previewProximityMetersOverride != nil
        return BytspotTrustEvidence(
            staticDiscoveryReached: true,
            nearestVerifiedMeters: nearestVerifiedDistanceMeters,
            horizontalAccuracy: overriding ? 0 : currentHorizontalAccuracy,
            wasInZone: overriding ? false : gateLatched,
            signedTokenVerified: false,
            nfcCounterVerified: false
        )
    }

    /// The single computed trust level — the only trust computation in the view.
    private var currentTrustLevel: BytspotTrustLevel {
        BytspotTrustEngine.reduce(trustEvidence)
    }

    /// Trust Ladder L2 — true within the 120 m VERIFIED_ZONE gate. Derived from
    /// the reduced level so the UI can never disagree with the engine.
    private var isWithinVerifiedZone: Bool {
        currentTrustLevel >= .proximate
    }

    /// Recomputes the Schmitt-latched L2 gate from the latest fix. Driven by
    /// location updates so the latch (`gateLatched`) carries the prior in/out
    /// state into the hysteresis decision. No-op under the simulator override.
    private func refreshProximityLatch() {
        guard Self.previewProximityMetersOverride == nil else { return }
        gateLatched = Self.directScanPermitted(
            nearestVerifiedMeters: nearestVerifiedDistanceMeters,
            horizontalAccuracy: currentHorizontalAccuracy,
            wasInZone: gateLatched
        )
    }

    /// Advisory descent pre-warm: when the parker first crosses INTO the pre-stage
    /// ring (still outside the L2 arm radius), warm the hybrid bridge so the
    /// eventual L2→L3 handoff is instant. Strictly advisory — pre-warming grants
    /// no trust, and the handoff still passes through the load-bearing
    /// directScanPermitted gate. Latched so it fires once per approach and re-arms
    /// only after the parker leaves the descent profile. No-op under the override.
    private func refreshDescentPrewarm() {
        guard Self.previewProximityMetersOverride == nil else { return }
        let stage = Self.descentStage(nearestVerifiedMeters: nearestVerifiedDistanceMeters)
        if stage >= .preStage {
            if !bridgePrewarmed { bridgePrewarmed = true; prewarmBridge() }
        } else if stage == .faraway {
            bridgePrewarmed = false
        }
    }

    private func can(_ capability: BytspotTrustCapability) -> Bool {
        currentTrustLevel >= capability.requiredLevel
    }

    /// Load-bearing L2 enforcement: the direct-scan handoff is withheld unless the
    /// parker is inside the 120 m VERIFIED_ZONE. The guard lives here (not just on
    /// the CTA's disabled styling) so the capability gate is impossible to bypass.
    private func performDirectScan() {
        guard can(.initiateDirectScan) else { nativeImpactLight(); return }
        openHybrid(.access)
    }

    private static var previewProximityMetersOverride: CLLocationDistance? {
        ProcessInfo.processInfo.environment[proximityOverrideEnvironmentKey].flatMap { Double($0) }
    }

    private var tapScanSubtitleForProximity: String {
        guard let distance = nearestVerifiedDistanceMeters else { return "Verify nearby access" }
        if distance <= Self.verifiedZoneRadiusMeters { return "Verified zone · scan ready" }
        let closer = Int((distance - Self.verifiedZoneRadiusMeters).rounded())
        return "Move \(closer) m closer to scan"
    }

    private var proximityGateStatusLine: String {
        guard let distance = nearestVerifiedDistanceMeters else {
            return "Locating… direct scan unlocks within \(Int(Self.verifiedZoneRadiusMeters)) m"
        }
        let meters = Int(distance.rounded())
        return isWithinVerifiedZone
            ? "In verified zone (\(meters) m) · direct scan unlocked"
            : "\(meters) m away · within \(Int(Self.verifiedZoneRadiusMeters)) m to unlock direct scan"
    }

    static let modeTitles = ["Smart Parking", "Nearby", "Tap Zones", "Route"]
    static let layerTitles = ["Parking", "Venues", "Tap Zones"]
    static let scannerCapabilityLabels = ["QR", "NFC", "App Clip"]
    static let tabModeBaseHex = NativePolish.mapBaseHex
    static let tabModePanelHex = NativePolish.mapPanelHex
    static let tabModeActiveCyanPanelHex = NativePolish.mapActiveCyanHex
    static let crowdLevelColorHex = [0x10B981, 0x00BFFF, 0xFF4500, 0xD946EF]
    static let accessPinColorHex = BytspotTheme.pinkHex
    static let searchOverlayCornerRadius: CGFloat = NativePolish.mapSearchRadius
    static let rightActionControlSize: CGFloat = NativePolish.mapActionPrimarySize
    static let rightSecondaryActionControlSize: CGFloat = NativePolish.mapActionSecondarySize
    static let sheetHorizontalInset: CGFloat = NativePolish.mapSheetHorizontalInset
    static let showsFloatingTapScanCTA = false
    static let tapScanTitle = "Tap / Scan"
    static let tapScanSubtitle = "Open Virtual Patch"
    static let functionSheetTitle = "Map Functions"
    static let emptyTapZoneCopy = "No Partnered Tap Zones nearby yet."
    // Trust Ladder L2 VERIFIED_ZONE_RADIUS — ported from React MapSection. Locked by NativeMapParitySelfTests.
    static let verifiedZoneRadiusMeters: CLLocationDistance = 120
    // L2 robustness margins — net-new native gate hardening mirrored from
    // native-trust-contract.json trustLadder[2].gate. The Schmitt trigger arms at
    // verifiedZoneRadiusMeters and only releases at the wider verifiedZoneExitMeters
    // so a fix hovering at the boundary can't oscillate the gate; a fix noisier
    // than verifiedZoneAccuracyFloorMeters is fail-safe denied. Locked by NativeMapParitySelfTests.
    static let verifiedZoneExitMeters: CLLocationDistance = 135
    static let verifiedZoneAccuracyFloorMeters: CLLocationAccuracy = 65
    // Advisory descent rings — net-new native pre-warm profile mirrored from
    // native-trust-contract.json trustLadder[2].gate. Nest strictly OUTSIDE the
    // arm radius (discovery ⊃ preStage ⊃ arm) and are ADVISORY ONLY: crossing a
    // ring never grants trust (directScanPermitted/BytspotTrustEngine ignore
    // them) — it only pre-warms the hybrid bridge so the L2→L3 handoff is instant.
    // Locked by NativeMapParitySelfTests.
    static let verifiedZonePreStageMeters: CLLocationDistance = 250
    static let verifiedZoneDiscoveryMeters: CLLocationDistance = 600
    static let proximityOverrideEnvironmentKey = "BYT_NATIVE_MAP_PROXIMITY_METERS"

    // Partner peek card — services-launcher copy. Locked by NativeMapParitySelfTests.
    static let partnerCardVerifiedLabel = "Verified Partner"
    static let partnerCardServiceSectionLabel = "Book at this venue"
    static let partnerCardServiceTiles = ["Reserve", "Valet", "Concierge", "See all"]
    static let partnerCardServiceTileCap = 4
    static let partnerCardPatchPairedLabel = "Patch paired"
    static let partnerCardPairPromptLabel = "Tap a patch to unlock"
    static let partnerLensEnvironmentKey = "BYT_NATIVE_MAP_PARTNER_LENS"
    static let pairedPatchEnvironmentKey = "BYT_NATIVE_MAP_PATCH_PAIRED"
    static let selectedPinEnvironmentKey = "BYT_NATIVE_MAP_SELECT_PIN"

    // Non-partner peek card — simplex verdict-pill layout. Locked by NativeMapParitySelfTests.
    static let nonPartnerCardPrimaryLabel = "Navigate"
    static let nonPartnerCardSecondaryLabels = ["Save", "Concierge", "Details"]
    static let nonPartnerCardVerdictLabels = ["Plenty of Space", "Filling Up", "Likely Busy", "Likely Full"]

    private static var previewShowsFunctionSheet: Bool {
        ProcessInfo.processInfo.environment["BYT_NATIVE_MAP_SHOW_FUNCTIONS"] == "1"
    }

    private static var previewPairedPatchVenueID: String? {
        ProcessInfo.processInfo.environment[pairedPatchEnvironmentKey].flatMap { $0.isEmpty ? nil : $0 }
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                NativeDarkMapBackdrop()
                    .ignoresSafeArea(edges: .top)
                    .contentShape(Rectangle())
                    .simultaneousGesture(DragGesture(minimumDistance: 12).onChanged { _ in dropRecenterModeForUserPan() })
                mapChromeWash.allowsHitTesting(false)
                mapMarkers(in: proxy.size)
                topSearchOverlay
                    .padding(.leading, NativePolish.mapSearchLeadingInset)
                    .padding(.trailing, NativePolish.mapSearchTrailingInset)
                    .padding(.top, NativePolish.mapSearchTopInset)
                    .frame(maxHeight: .infinity, alignment: .top)
                mapControls
                    .padding(.trailing, NativePolish.mapActionTrailingInset)
                    .padding(.top, NativePolish.mapActionTopInset)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                if selectedPin != nil || showFunctionSheet {
                    spatialSheet
                        .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.985, anchor: .bottom)), removal: .move(edge: .bottom).combined(with: .opacity)))
                }
            }
            .background(NativePolish.mapBaseSurface.ignoresSafeArea())
        }
        .sheet(item: $trafficIntelVenue) { venue in
            let sheet = NativeTrafficIntelSheet(venue: venue, reports: communityReports, onAddReport: submitCommunityReport)
            if #available(iOS 16.0, *) {
                sheet
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            } else {
                sheet
            }
        }
        .sheet(item: $premiumUpsellFunction) { function in
            let sheet = NativePremiumUpsellSheet(function: function, entitlementPlan: BytspotMapFunctionCatalog.premiumEntitlementPlan) {
                premiumUpsellFunction = nil
                openHybrid(.profile)
            }
            if #available(iOS 16.0, *) {
                sheet
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            } else {
                sheet
            }
        }
        .animation(.interpolatingSpring(mass: 0.82, stiffness: 420, damping: 38, initialVelocity: 0), value: showFunctionSheet)
        .animation(.interpolatingSpring(mass: 0.82, stiffness: 420, damping: 38, initialVelocity: 0), value: selectedPin?.id)
        .accessibilityIdentifier("native-map-explore")
        .onAppear { headingProvider.startLocating(); refreshProximityLatch(); refreshDescentPrewarm(); autoOpenTrafficIntelIfRequested(); applySelectedPinPreviewIfRequested() }
        .onChange(of: headingProvider.userLocation?.timestamp) { _ in refreshProximityLatch(); refreshDescentPrewarm() }
        .onDisappear { headingProvider.stopLocating() }
    }

    private func applySelectedPinPreviewIfRequested() {
        guard let token = Self.previewSelectedPinToken, selectedPin == nil else { return }
        let lookup = pins
        let lower = token.lowercased()
        let resolved: NativeMapPin? = {
            if let exact = lookup.first(where: { $0.id.lowercased() == lower }) { return exact }
            switch lower {
            case "parking": return lookup.first(where: { $0.kind == .parking })
            case "partner": return lookup.first(where: { $0.kind == .partner })
            case "access": return lookup.first(where: { $0.kind == .access })
            default: return lookup.first(where: { $0.title.lowercased().contains(lower) })
            }
        }()
        guard let pin = resolved else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            selectedPin = pin
            showFunctionSheet = false
        }
    }

    private static var previewSelectedPinToken: String? {
        ProcessInfo.processInfo.environment[selectedPinEnvironmentKey].flatMap { $0.isEmpty ? nil : $0 }
    }

    private func autoOpenTrafficIntelIfRequested() {
        guard Self.previewAutoOpensTrafficIntel, trafficIntelVenue == nil else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            trafficIntelVenue = trafficIntelCandidate
            showTrafficIntel = true
        }
    }

    private var topSearchOverlay: some View {
        Button(action: { showFunctionSheet = true; nativeImpactLight() }) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 19, weight: .black))
                    .foregroundColor(NativeTheme.cyan.opacity(0.88))
                Text("Search destination or service type")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(NativeTheme.textTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .frame(height: NativePolish.mapSearchHeight)
            .background(NativePolish.mapControlSurface)
            .overlay(RoundedRectangle(cornerRadius: Self.searchOverlayCornerRadius, style: .continuous).stroke(NativePolish.strongBorder, lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: Self.searchOverlayCornerRadius, style: .continuous).fill(LinearGradient(colors: [NativeTheme.surfaceHighlight, Color.clear], startPoint: .topLeading, endPoint: .bottomTrailing)).allowsHitTesting(false))
            .clipShape(RoundedRectangle(cornerRadius: Self.searchOverlayCornerRadius, style: .continuous))
            .shadow(color: NativeTheme.panelShadow, radius: 20, x: 0, y: 12)
        }
        .buttonStyle(.plain)
    }

    private var showFullRightActionStack: Bool {
        selectedPin == nil && !showFunctionSheet
    }

    static let trafficIntelProximityMiles: Double = 1.0
    static let trafficIntelProximityFreshnessMinutes: Int = 30

    private var hasProximityAlert: Bool {
        communityReports.contains { report in
            report.distanceMiles <= Self.trafficIntelProximityMiles &&
                report.minutesAgo <= Self.trafficIntelProximityFreshnessMinutes
        }
    }

    private var trafficIntelFABState: NativeTrafficIntelFABState {
        if showTrafficIntel || trafficIntelVenue != nil { return .active }
        if selectedMode == "Route" || hasProximityAlert { return .aware }
        return .calm
    }

    private func openTrafficIntel() {
        showTrafficIntel = true
        showFunctionSheet = false
        trafficIntelVenue = trafficIntelCandidate
        nativeImpactLight()
    }

    private func submitCommunityReport(_ category: NativeCommunityReport.Category) {
        let id = "cr-\(Int(Date().timeIntervalSince1970))"
        let report = NativeCommunityReport(id: id, category: category, title: "You reported", distance: "Here", distanceMiles: 0.0, minutesAgo: 0, x: 0.50, y: 0.50)
        communityReports.insert(report, at: 0)
        nativeImpactLight()
    }

    static let trafficIntelAutoEnvironmentKey = "BYT_NATIVE_TRAFFIC_AUTO"

    private static var previewAutoOpensTrafficIntel: Bool {
        ProcessInfo.processInfo.environment[trafficIntelAutoEnvironmentKey] == "1"
    }

    private var mapControls: some View {
        VStack(alignment: .trailing, spacing: NativePolish.mapActionStackSpacing) {
            Button(action: { showFunctionSheet.toggle(); nativeImpactLight() }) { NativeRoundButton(symbol: "square.3.layers.3d.top.filled", tint: NativeTheme.textPrimary, size: Self.rightActionControlSize, isActive: showFunctionSheet) }
            Button(action: { cycleRecenterMode() }) { NativeMapRecenterButton(mode: recenterMode, size: Self.rightActionControlSize, heading: headingProvider.heading) }
            if showFullRightActionStack {
                Button(action: { nativeImpactLight() }) { NativeRoundButton(symbol: "plus", tint: NativeTheme.textPrimary, size: Self.rightSecondaryActionControlSize) }
                Button(action: { nativeImpactLight() }) { NativeRoundButton(symbol: "minus", tint: NativeTheme.textPrimary, size: Self.rightSecondaryActionControlSize) }
                Button(action: { openTrafficIntel() }) { NativeTrafficIntelFAB(state: trafficIntelFABState, size: Self.rightSecondaryActionControlSize) }
                Button(action: { handlePartnerFocus() }) { NativeHexActionButton(active: showVerifiedOnly) }
            }
        }
    }

    private func mapMarkers(in size: CGSize) -> some View {
        ZStack {
            ForEach(visualMarkers) { marker in
                Button(action: { selectMarker(marker) }) {
                    NativeMapVisualMarkerView(marker: marker, selected: selectedPin?.id == marker.pinID)
                }
                .buttonStyle(.plain)
                .position(x: size.width * marker.x, y: size.height * marker.y)
            }
            ForEach(communityReports) { report in
                Button(action: { openTrafficIntel() }) {
                    NativeCommunityReportMarker(report: report)
                }
                .buttonStyle(.plain)
                .position(x: size.width * report.x, y: size.height * report.y)
                .accessibilityIdentifier("native-map-community-report-marker-\(report.category.rawValue)")
            }
        }
    }

    private var spatialSheet: some View {
        VStack(alignment: .leading, spacing: NativePolish.mapSheetContentSpacing) {
            sheetHeader
            if isFunctionSheetDefault {
                functionQuickGrid
                functionFeatureRows
            } else if let pin = selectedPin, isPartnerPin(pin) {
                partnerPeekCard(for: pin)
            } else if let pin = selectedPin {
                nonPartnerPeekCard(for: pin)
            } else if showVerifiedOnly || selectedMode == "Tap Zones" {
                if filteredPins.isEmpty {
                    emptyTapZoneState
                } else {
                    ForEach(Array(filteredPins.prefix(3))) { pin in
                        Button(action: { selectedPin = pin; nativeImpactLight() }) { mapResultRow(pin) }.buttonStyle(.plain)
                    }
                }
            }
            if !isFunctionSheetDefault && !isSimplexPinSelected && (selectedMode == "Smart Parking" || showFunctionSheet) { smartParkingRail }
            if !isFunctionSheetDefault && !isSimplexPinSelected && (showFunctionSheet || selectedPin != nil) {
                scannerAccessRow
                verifiedZonePanel
                intelligenceFilters
                layerSummary
            }
            if !isSimplexPinSelected && (showFunctionSheet || selectedPin != nil || showVerifiedOnly) {
                HStack(spacing: NativePolish.mapSheetActionGap) {
                    NativeMapSheetActionButton(
                        title: Self.tapScanTitle,
                        subtitle: tapScanSubtitleForProximity,
                        icon: can(.initiateDirectScan) ? "qrcode.viewfinder" : "location.circle",
                        accent: NativeTheme.cyan,
                        isPrimary: true,
                        isEnabled: can(.initiateDirectScan),
                        action: { performDirectScan() }
                    )
                    NativeMapSheetActionButton(
                        title: "Ask Concierge",
                        subtitle: "Human + AI routing",
                        icon: "sparkles",
                        accent: NativeTheme.purple,
                        isPrimary: false,
                        action: { openHybrid(.concierge) }
                    )
                }
            }
        }
        .padding(.horizontal, NativePolish.mapSheetInnerHorizontalPadding)
        .padding(.top, NativePolish.mapSheetInnerTopPadding)
        .padding(.bottom, NativePolish.mapSheetInnerBottomPadding)
        .background(LinearGradient(colors: [NativePolish.mapPanelSurface, NativePolish.mapBaseSurface], startPoint: .top, endPoint: .bottom))
        .overlay(RoundedRectangle(cornerRadius: NativePolish.mapSheetRadius).fill(LinearGradient(colors: [NativeTheme.surfaceHighlight, Color.clear, NativeTheme.cyan.opacity(0.018)], startPoint: .topLeading, endPoint: .bottomTrailing)).allowsHitTesting(false))
        .overlay(RoundedRectangle(cornerRadius: NativePolish.mapSheetRadius).stroke(NativePolish.strongBorder, lineWidth: 1.25))
        .clipShape(RoundedRectangle(cornerRadius: NativePolish.mapSheetRadius, style: .continuous))
        .shadow(color: NativeTheme.panelShadow, radius: 24, x: 0, y: -6)
        .padding(.horizontal, NativePolish.mapSheetHorizontalInset)
        .padding(.bottom, NativePolish.mapSheetBottomInset)
        .accessibilityIdentifier("native-map-functions-sheet")
    }

    private var isFunctionSheetDefault: Bool { showFunctionSheet && selectedPin == nil }

    private var sheetHeader: some View {
        Group {
            if isFunctionSheetDefault {
                ZStack {
                    Text(Self.functionSheetTitle)
                        .font(.system(size: 27, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                        .shadow(color: NativeTheme.textShadow, radius: 1, x: 0, y: 2)
                        .frame(maxWidth: .infinity, alignment: .center)
                    closeSheetButton.frame(maxWidth: .infinity, alignment: .trailing)
                }
                .frame(height: NativePolish.mapFunctionHeaderHeight)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Capsule().fill(NativeTheme.textTertiary.opacity(0.58)).frame(width: 48, height: 6).frame(maxWidth: .infinity)
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(sheetTitle).nativeTitle(21)
                            Text(selectedPin?.title ?? (showVerifiedOnly ? "Partnered Tap Zone providers" : "Pick the map signal that matters right now.")).nativeBody(color: NativeTheme.textSecondary)
                        }
                        Spacer()
                        closeSheetButton
                    }
                }
            }
        }
    }

    private var closeSheetButton: some View {
        Button(action: { selectedPin = nil; showFunctionSheet = false; nativeImpactLight() }) {
            Image(systemName: "xmark")
                .font(.system(size: 23, weight: .black))
                .foregroundColor(NativeTheme.textPrimary.opacity(0.92))
                .frame(width: NativePolish.mapSheetCloseSize, height: NativePolish.mapSheetCloseSize)
                .background(NativePolish.mapControlSurface)
                .overlay(Circle().stroke(NativePolish.strongBorder, lineWidth: 1.5))
                .clipShape(Circle())
                .shadow(color: NativeTheme.softShadow, radius: 10, x: 0, y: 5)
        }
        .buttonStyle(.plain)
    }

    private func isPartnerPin(_ pin: NativeMapPin) -> Bool {
        pin.kind == .partner || pin.kind == .access
    }

    private var isPartnerPinSelected: Bool {
        guard let pin = selectedPin else { return false }
        return isPartnerPin(pin)
    }

    private var isSimplexPinSelected: Bool { selectedPin != nil }

    private func verdictLabel(for crowdLevel: Int?) -> String {
        let idx = max(0, min(Self.nonPartnerCardVerdictLabels.count - 1, crowdLevel ?? 0))
        return Self.nonPartnerCardVerdictLabels[idx]
    }

    private func verdictColor(for crowdLevel: Int?) -> Color {
        switch crowdLevel ?? 0 {
        case 0: return NativeTheme.emerald
        case 1: return NativeTheme.cyan
        case 2: return NativeTheme.pink
        default: return NativeTheme.purple
        }
    }

    private func nonPartnerPeekCard(for pin: NativeMapPin) -> some View {
        let verdict = verdictLabel(for: pin.crowdLevel)
        let verdictTint = verdictColor(for: pin.crowdLevel)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Circle().fill(verdictTint).frame(width: 8, height: 8)
                    Text(verdict.uppercased())
                        .font(.system(size: 10.5, weight: .black, design: .monospaced))
                        .tracking(1.2)
                        .foregroundColor(NativeTheme.textPrimary.opacity(0.92))
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(verdictTint.opacity(0.14))
                .overlay(Capsule().stroke(verdictTint.opacity(0.34), lineWidth: 1))
                .clipShape(Capsule())
                Spacer(minLength: 0)
                Text(pin.distance)
                    .font(.system(size: 11, weight: .black, design: .monospaced))
                    .tracking(0.6)
                    .foregroundColor(NativeTheme.textSecondary)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(pin.title).font(.system(size: 17, weight: .heavy)).foregroundColor(NativeTheme.textPrimary).lineLimit(1)
                Text(pin.subtitle).font(.system(size: 12.5, weight: .semibold)).foregroundColor(NativeTheme.textSecondary).lineLimit(2)
            }
            Button(action: { nativeImpactLight(); openHybrid(.map) }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.turn.up.right.circle.fill").font(.system(size: 15, weight: .black))
                    Text(Self.nonPartnerCardPrimaryLabel).font(.system(size: 14, weight: .black))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .black)).opacity(0.7)
                }
                .foregroundColor(.black)
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(NativeTheme.cyan)
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-map-nonpartner-navigate")
            HStack(spacing: 8) {
                ForEach(Self.nonPartnerCardSecondaryLabels, id: \.self) { label in
                    Button(action: { handleNonPartnerSecondary(label) }) {
                        HStack(spacing: 6) {
                            Image(systemName: secondaryIcon(for: label)).font(.system(size: 11, weight: .black))
                            Text(label).font(.system(size: 12, weight: .black))
                        }
                        .foregroundColor(NativeTheme.textPrimary.opacity(0.92))
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(NativePolish.mapPanelSurface.opacity(0.82))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("native-map-nonpartner-secondary-\(label.lowercased())")
                }
            }
        }
        .padding(14)
        .background(LinearGradient(colors: [verdictTint.opacity(0.05), NativePolish.mapPanelSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(verdictTint.opacity(0.20), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityIdentifier("native-map-nonpartner-peek-card")
    }

    private func secondaryIcon(for label: String) -> String {
        switch label {
        case "Save": return "bookmark.fill"
        case "Concierge": return "sparkles"
        case "Details": return "info.circle.fill"
        default: return "circle.fill"
        }
    }

    private func handleNonPartnerSecondary(_ label: String) {
        nativeImpactLight()
        switch label {
        case "Concierge": openHybrid(.concierge)
        case "Save": openHybrid(.access)
        default: openHybrid(.discover)
        }
    }

    private func partnerPeekCard(for pin: NativeMapPin) -> some View {
        let isPaired = pairedPatchVenueID == pin.id || pairingStore.matches(pinID: pin.id, pinTitle: pin.title)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(NativeTheme.cyan)
                Text(Self.partnerCardVerifiedLabel)
                    .font(.system(size: 12, weight: .black))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundColor(NativeTheme.textPrimary.opacity(0.92))
                Spacer(minLength: 0)
                tierBadge
            }
            VStack(alignment: .leading, spacing: 10) {
                Text(Self.partnerCardServiceSectionLabel)
                    .font(.system(size: 10.5, weight: .black))
                    .tracking(1.6)
                    .textCase(.uppercase)
                    .foregroundColor(NativeTheme.cyan.opacity(0.86))
                serviceLauncherGrid(for: pin)
            }
            patchPairedFooter(isPaired: isPaired)
        }
        .padding(14)
        .background(LinearGradient(colors: [NativeTheme.cyan.opacity(0.06), NativePolish.mapPanelSurface], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(NativeTheme.cyan.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityIdentifier("native-map-partner-peek-card")
    }

    private var tierBadge: some View {
        HStack(spacing: 6) {
            Circle().fill(BytspotTheme.accent(for: activeTier)).frame(width: 8, height: 8)
            Text(activeTier.rawValue.uppercased())
                .font(.system(size: 10.5, weight: .black, design: .monospaced))
                .tracking(1.2)
                .foregroundColor(NativeTheme.textPrimary.opacity(0.92))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(NativeTheme.selectedControlSurface.opacity(0.7))
        .overlay(Capsule().stroke(BytspotTheme.accent(for: activeTier).opacity(0.34), lineWidth: 1))
        .clipShape(Capsule())
        .accessibilityIdentifier("native-map-partner-tier-badge")
    }

    private func serviceLauncherGrid(for pin: NativeMapPin) -> some View {
        let tiles = Array(Self.partnerCardServiceTiles.prefix(Self.partnerCardServiceTileCap))
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(tiles, id: \.self) { tile in
                Button(action: { handleServiceTileTap(tile, pin: pin) }) {
                    HStack(spacing: 8) {
                        Image(systemName: icon(for: tile))
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(NativeTheme.cyan)
                        Text(tile)
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                        Spacer(minLength: 0)
                        if tile == "See all" {
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textTertiary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(NativePolish.mapPanelSurface.opacity(0.86))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-map-partner-service-tile-\(tile.lowercased().replacingOccurrences(of: " ", with: "-"))")
            }
        }
    }

    private func icon(for tile: String) -> String {
        switch tile {
        case "Reserve": return "calendar.badge.plus"
        case "Valet": return "car.fill"
        case "Concierge": return "sparkles"
        case "See all": return "square.grid.2x2.fill"
        default: return "circle.fill"
        }
    }

    private func handleServiceTileTap(_ tile: String, pin: NativeMapPin) {
        nativeImpactLight()
        switch tile {
        case "Concierge": openHybrid(.concierge)
        case "See all": openHybrid(.discover)
        default: openHybrid(.access)
        }
    }

    private func patchPairedFooter(isPaired: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: isPaired ? "checkmark.circle.fill" : "info.circle")
                .font(.system(size: 13, weight: .black))
                .foregroundColor(isPaired ? NativeTheme.emerald : NativeTheme.textTertiary)
            Text(isPaired
                 ? "\(Self.partnerCardPatchPairedLabel) · \(activeTier.rawValue.capitalized) perks active"
                 : "\(Self.partnerCardPairPromptLabel) \(activeTier.rawValue.capitalized) perks here")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(isPaired ? NativeTheme.textPrimary : NativeTheme.textSecondary)
                .lineLimit(2)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background((isPaired ? NativeTheme.emerald : NativeTheme.cyan).opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke((isPaired ? NativeTheme.emerald : NativeTheme.cyan).opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier(isPaired ? "native-map-partner-patch-paired" : "native-map-partner-patch-prompt")
    }

    private var functionQuickGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: NativePolish.mapFunctionGridGap) {
            mapFunctionButton(icon: "mappin.circle", title: "Service\nHere") { selectedMode = "Nearby"; showFunctionSheet = false }
            mapFunctionButton(icon: "magnifyingglass", title: "Search") { nativeImpactLight() }
            mapFunctionButton(icon: "square.3.layers.3d.top.filled", title: "Layers") { showFunctionSheet = true }
            mapFunctionButton(icon: "bookmark", title: "Routes") { selectMode("Route") }
        }
        .padding(NativePolish.mapFunctionGridPadding)
        .background(NativePolish.mapPanelSurface.opacity(0.74))
        .overlay(Rectangle().stroke(NativePolish.softBorder, lineWidth: 1))
    }

    private func mapFunctionButton(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: { nativeImpactLight(); action() }) {
            VStack(spacing: 9) {
                Image(systemName: icon).font(.system(size: 20, weight: .black)).foregroundColor(NativeTheme.textPrimary.opacity(0.94))
                Text(title)
                    .font(.system(size: 20, weight: .black))
                    .foregroundColor(NativeTheme.textPrimary.opacity(0.94))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .minimumScaleFactor(0.76)
            }
            .frame(maxWidth: .infinity)
            .frame(height: NativePolish.mapFunctionButtonHeight)
            .background(LinearGradient(colors: [NativeTheme.surfaceHighlight, NativePolish.mapPanelSurface.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.mapFunctionButtonRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1.1))
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.mapFunctionButtonRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var functionFeatureRows: some View {
        VStack(spacing: NativePolish.mapFunctionRowGap) {
            functionFeatureRow(icon: "car.fill", title: "Smart Parking", subtitle: "Available spots with live pricing", colors: [NativeTheme.pink.opacity(0.10), NativeTheme.purple.opacity(0.06), NativePolish.mapPanelSurface], accent: NativeTheme.pink) {
                selectedMode = "Smart Parking"
                showFunctionSheet = false
                selectedPin = pins.first(where: { $0.kind == .parking })
            }
            functionFeatureRow(icon: "waveform.path.ecg", title: "Live Venue Data", subtitle: "Crowd levels & wait times", colors: [NativeTheme.cyan.opacity(0.10), NativePolish.mapPanelSurface], accent: NativeTheme.cyan) {
                selectedMode = "Nearby"
                showFunctionSheet = false
            }
            functionFeatureRow(icon: "arrow.up.right", title: "Trending Hotspots", subtitle: "Real-time crowd momentum & arrivals", colors: [NativeTheme.orange.opacity(0.10), NativePolish.mapPanelSurface], accent: NativeTheme.orange) {
                showTrafficIntel = true
                showFunctionSheet = false
            }
            premiumFunctionsHeader
            ForEach(BytspotMapFunctionCatalog.premiumFunctions) { function in
                premiumFunctionRow(function)
            }
        }
    }

    /// Section divider that frames the premium block — present whether or not the
    /// parker holds the entitlement, so the upgrade surface is always discoverable.
    private var premiumFunctionsHeader: some View {
        HStack(spacing: 8) {
            Image(systemName: membership.isPremium ? "crown.fill" : "lock.fill")
                .font(.system(size: 12, weight: .black))
                .foregroundColor(membership.isPremium ? NativeTheme.orange : NativeTheme.textSecondary)
            Text(membership.isPremium ? "PREMIUM · UNLOCKED" : "PREMIUM MEMBERSHIP")
                .font(.system(size: 11.5, weight: .black, design: .monospaced))
                .tracking(1.1)
                .foregroundColor(NativeTheme.textSecondary)
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .accessibilityIdentifier("native-map-premium-functions-header")
    }

    /// One premium Map Function row. When the parker holds the entitlement it routes
    /// to the live action; otherwise it renders a lock chip and opens the upgrade
    /// nudge instead. Unlock authority is the single `BytspotMapFunctionCatalog`
    /// source so UI and parity self-tests can never disagree.
    private func premiumFunctionRow(_ function: BytspotPremiumMapFunction) -> some View {
        let unlocked = BytspotMapFunctionCatalog.isUnlocked(function, for: membership)
        return Button(action: {
            nativeImpactLight()
            if unlocked {
                runPremiumFunction(function)
            } else {
                premiumUpsellFunction = function
            }
        }) {
            HStack(spacing: 14) {
                ZStack {
                    Rectangle()
                        .fill(LinearGradient(colors: [function.accent, NativeTheme.purple.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 64, height: 78)
                        .opacity(unlocked ? 1 : 0.5)
                    Image(systemName: function.systemImage)
                        .font(.system(size: 23, weight: .black))
                        .foregroundColor(.white)
                        .frame(width: 64, height: 78)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(function.title)
                        .font(.system(size: 23, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                        .shadow(color: NativeTheme.textShadow, radius: 1, x: 0, y: 2)
                    Text(function.subtitle)
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                Spacer(minLength: 0)
                if unlocked {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 26, weight: .black))
                        .foregroundColor(function.accent.opacity(0.68))
                } else {
                    premiumLockChip
                }
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: NativePolish.mapFunctionRowHeight)
            .background(LinearGradient(colors: [function.accent.opacity(unlocked ? 0.12 : 0.06), NativePolish.mapPanelSurface], startPoint: .leading, endPoint: .trailing))
            .overlay(Rectangle().stroke(NativePolish.softBorder, lineWidth: 1.1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-map-premium-function-\(function.rawValue)\(unlocked ? "-unlocked" : "-locked")")
    }

    private var premiumLockChip: some View {
        HStack(spacing: 5) {
            Image(systemName: "lock.fill").font(.system(size: 12, weight: .black))
            Text("UPGRADE").font(.system(size: 11, weight: .black, design: .monospaced)).tracking(0.8)
        }
        .foregroundColor(.black)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(NativeTheme.orange)
        .clipShape(Capsule())
    }

    /// Live action for an unlocked premium function — routes into the existing native
    /// surfaces rather than re-implementing them.
    private func runPremiumFunction(_ function: BytspotPremiumMapFunction) {
        showFunctionSheet = false
        switch function {
        case .aiNavigation:
            openHybrid(.concierge)
        case .spotRadar:
            selectedMode = "Nearby"
            showHeatmap = true
        case .trafficIntelligence:
            openTrafficIntel()
        }
    }

    private func functionFeatureRow(icon: String, title: String, subtitle: String, colors: [Color], accent: Color, action: @escaping () -> Void) -> some View {
        Button(action: { nativeImpactLight(); action() }) {
            HStack(spacing: 14) {
                ZStack(alignment: .topTrailing) {
                    Rectangle()
                        .fill(LinearGradient(colors: [accent, NativeTheme.purple.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 64, height: 78)
                    Image(systemName: icon)
                        .font(.system(size: 23, weight: .black))
                        .foregroundColor(.white)
                        .frame(width: 64, height: 78)
                    Text("LIVE")
                        .font(.system(size: 11, weight: .black))
                        .foregroundColor(.black)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(NativeTheme.pink)
                        .clipShape(Capsule())
                        .offset(x: 8, y: -6)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.system(size: 23, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                        .shadow(color: NativeTheme.textShadow, radius: 1, x: 0, y: 2)
                    Text(subtitle)
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 26, weight: .black))
                    .foregroundColor(accent.opacity(0.68))
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: NativePolish.mapFunctionRowHeight)
            .background(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
            .overlay(Rectangle().stroke(NativePolish.softBorder, lineWidth: 1.1))
        }
        .buttonStyle(.plain)
    }

    private func mapResultRow(_ pin: NativeMapPin) -> some View {
        HStack(spacing: 13) {
            NativeIcon(symbol: pin.kind.icon, color: pin.color)
            VStack(alignment: .leading, spacing: 4) {
                Text(pin.title).nativeTitle(16)
                Text(pin.subtitle).nativeBody(size: 12.5, color: NativeTheme.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 18, weight: .black)).foregroundColor(NativeTheme.textTertiary)
        }
        .padding(14)
        .background(LinearGradient(colors: [NativeTheme.purple.opacity(0.12), NativePolish.mapPanelSurface], startPoint: .leading, endPoint: .trailing))
        .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(NativePolish.strongBorder, lineWidth: 1.5))
    }

    private var emptyTapZoneState: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(Self.emptyTapZoneCopy).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary)
            Text("Ask Concierge to locate verified access, parking, or services.").nativeBody(size: 12, color: NativeTheme.textSecondary)
        }
        .padding(14)
        .background(NativePolish.mapPanelSurface.opacity(0.82))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var smartParkingRail: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Smart Parking", systemImage: "car.fill")
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Text("LIVE").font(.system(size: 10, weight: .black)).foregroundColor(.black).padding(.horizontal, 8).padding(.vertical, 4).background(NativeTheme.pink).clipShape(Capsule())
            }
            ForEach(pins.filter { $0.kind == .parking }) { pin in
                HStack(spacing: 10) {
                    Image(systemName: "parkingsign.circle.fill").font(.system(size: 14, weight: .black)).foregroundColor(NativeTheme.cyan)
                    Text(pin.title).font(.system(size: 12.5, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                    Spacer()
                    Text(pin.distance).font(.system(size: 11, weight: .heavy, design: .monospaced)).foregroundColor(NativeTheme.textSecondary)
                }
                .padding(11)
                .background(NativeTheme.selectedControlSurface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(12)
        .background(NativeTheme.cyan.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityIdentifier("native-map-smart-parking-rail")
    }

    private var scannerAccessRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                NativeIcon(symbol: "qrcode.viewfinder", color: NativeTheme.emerald)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Tap / Scan ready").nativeTitle(16)
                    Text("QR, NFC, and App Clip handoffs mirror the React VirtualPatchScannerSheet boundary.").nativeBody(size: 12)
                }
                Spacer()
            }
            HStack(spacing: 7) {
                ForEach(Self.scannerCapabilityLabels, id: \.self) { label in
                    Text(label).font(.system(size: 10.5, weight: .black)).foregroundColor(NativeTheme.textPrimary).padding(.horizontal, 8).padding(.vertical, 5).background(NativeTheme.selectedControlSurface).clipShape(Capsule())
                }
            }
        }
        .padding(12)
        .background(NativePolish.mapPanelSurface.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityIdentifier("native-map-scanner-access")
    }

    private var verifiedZonePanel: some View {
        let verified = pins.filter { $0.kind == .partner || $0.kind == .access }
        return VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Verified Tap Zones", systemImage: "checkmark.seal.fill").font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Text("\(verified.count)").font(.system(size: 11, weight: .black)).foregroundColor(.black).padding(.horizontal, 8).padding(.vertical, 5).background(NativeTheme.emerald).clipShape(Capsule())
            }
            Text(verified.first.map { "Nearest: \($0.title) · \($0.subtitle)" } ?? "Open scanner to continue App Clip / wallet handoff.").nativeBody(size: 12)
            Text(proximityGateStatusLine)
                .font(.system(size: 11, weight: .black))
                .foregroundColor(isWithinVerifiedZone ? NativeTheme.emerald : NativeTheme.textSecondary)
                .accessibilityIdentifier("native-map-proximity-status")
        }
        .padding(12)
        .background(NativeTheme.emerald.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityIdentifier("native-map-verified-zone-panel")
    }

    private var intelligenceFilters: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Intelligence Filters")
                .font(.system(size: 10, weight: .black))
                .foregroundColor(NativeTheme.cyan.opacity(0.86))
                .tracking(1.6)
                .textCase(.uppercase)
            HStack(spacing: 8) {
                NativeSmallToggle(title: "Verified", active: showVerifiedOnly, color: NativeTheme.emerald) { showVerifiedOnly.toggle() }
                NativeSmallToggle(title: "Heatmap", active: showHeatmap, color: NativeTheme.orange) { showHeatmap.toggle() }
                NativeSmallToggle(title: "Paid", active: entryFilter == "paid", color: NativeTheme.purple) { entryFilter = entryFilter == "paid" ? nil : "paid" }
            }
            HStack(spacing: 8) {
                ForEach([1, 2, 3, 4], id: \.self) { level in
                    NativeSmallToggle(title: ["Chill", "Active", "Busy", "Packed"][level - 1], active: vibeFilter == level, color: crowdLevelColor(level)) { vibeFilter = vibeFilter == level ? nil : level }
                }
            }
        }
        .padding(12)
        .background(NativePolish.mapPanelSurface.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityIdentifier("native-map-intelligence-filters")
    }

    private var layerSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Map Layers")
                    .font(.system(size: 10, weight: .black))
                    .foregroundColor(NativeTheme.cyan.opacity(0.86))
                    .tracking(1.6)
                    .textCase(.uppercase)
                Spacer()
                Text("Signals")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(NativeTheme.textSecondary)
            }
            HStack(spacing: 8) {
                NativeLayerToggle(title: "Parking", isOn: $showParking, color: NativeTheme.cyan)
                NativeLayerToggle(title: "Venues", isOn: $showVenues, color: NativeTheme.purple)
                NativeLayerToggle(title: "Tap Zones", isOn: $showTapZones, color: NativeTheme.cyan)
            }
        }
        .padding(10)
        .background(NativePolish.mapPanelSurface.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityIdentifier("native-map-layer-summary")
    }

    private var mapChromeWash: some View {
        ZStack {
            LinearGradient(colors: [NativePolish.mapPanelSurface.opacity(0.72), .clear, NativePolish.mapBaseSurface.opacity(0.86)], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [NativeTheme.cyan.opacity(0.10), .clear], center: .topTrailing, startRadius: 16, endRadius: 280)
            RadialGradient(colors: [NativeTheme.pink.opacity(0.06), .clear], center: .bottomLeading, startRadius: 44, endRadius: 320)
        }
    }

    private func crowdLevelColor(_ level: Int) -> Color {
        switch level {
        case 1: return NativeTheme.emerald
        case 2: return NativeTheme.cyan
        case 3: return NativeTheme.orange
        default: return NativeTheme.pink
        }
    }

    private var filteredPins: [NativeMapPin] {
        switch selectedMode {
        case "Smart Parking": return filteredByToggles(pins).filter { $0.kind == .parking }
        case "Tap Zones": return filteredByToggles(pins).filter { $0.kind == .partner || $0.kind == .access }
        default: return filteredByToggles(pins)
        }
    }

    private func filteredByToggles(_ input: [NativeMapPin]) -> [NativeMapPin] {
        input.filter { pin in
            (!showVerifiedOnly || pin.kind == .partner || pin.kind == .access) && (vibeFilter == nil || pin.crowdLevel == vibeFilter)
        }
    }

    private var visualMarkers: [NativeMapVisualMarker] {
        let live = pins.enumerated().compactMap { index, pin -> NativeMapVisualMarker? in
            guard shouldShow(pin) else { return nil }
            let point = Self.pinPoints[index % Self.pinPoints.count]
            let trafficPriority = pin.kind == .parking || (pin.crowdLevel ?? 0) >= 3
            return NativeMapVisualMarker(
                id: "pin-\(pin.id)",
                pinID: pin.id,
                trafficVenueID: trafficPriority ? pin.id : nil,
                title: pin.title,
                glyph: pin.kind == .parking ? "P" : pin.kind.emoji,
                color: pin.color,
                x: point.x,
                y: point.y,
                shape: pin.kind == .parking ? .circle : .roundedSquare,
                opensTrafficIntel: trafficPriority
            )
        }
        let decorative = Self.decorativeMarkers.filter { marker in
            if selectedMode == "Smart Parking" { return marker.shape == .circle }
            if selectedMode == "Tap Zones" || showVerifiedOnly { return marker.shape == .hex || marker.glyph == "P" }
            if !showVenues && marker.shape == .roundedSquare { return false }
            if !showParking && marker.glyph == "P" { return false }
            return true
        }
        return decorative + live
    }

    private func shouldShow(_ pin: NativeMapPin) -> Bool {
        if pin.kind == .parking && !showParking { return false }
        if pin.kind == .partner && !showTapZones { return false }
        if pin.kind == .access && !showTapZones { return false }
        if showVerifiedOnly && !(pin.kind == .partner || pin.kind == .access) { return false }
        return vibeFilter == nil || pin.crowdLevel == vibeFilter
    }

    private func selectMarker(_ marker: NativeMapVisualMarker) {
        if marker.opensTrafficIntel, let venue = trafficIntelVenue(for: marker) {
            selectedPin = marker.pinID.flatMap { pinID in pins.first(where: { $0.id == pinID }) }
            showTrafficIntel = true
            showFunctionSheet = false
            trafficIntelVenue = venue
            nativeImpactLight()
            return
        }
        if let pinID = marker.pinID, let pin = pins.first(where: { $0.id == pinID }) {
            selectedPin = pin
            showFunctionSheet = false
        } else if marker.shape == .hex {
            handlePartnerFocus()
        } else {
            selectedMode = marker.glyph == "P" ? "Smart Parking" : "Nearby"
            showFunctionSheet = true
        }
        nativeImpactLight()
    }

    private func trafficIntelVenue(for marker: NativeMapVisualMarker) -> NativeVenueSummary? {
        if let venueID = marker.trafficVenueID, let venue = venues.first(where: { $0.id == venueID }) { return venue }
        return trafficIntelCandidate
    }

    private var trafficIntelCandidate: NativeVenueSummary? {
        venues.sorted { lhs, rhs in
            let leftScore = (lhs.crowd?.level ?? 1) * 100 + lhs.parking.totalAvailable
            let rightScore = (rhs.crowd?.level ?? 1) * 100 + rhs.parking.totalAvailable
            return leftScore > rightScore
        }.first
    }

    private var sheetTitle: String {
        switch selectedMode {
        case "Smart Parking": return "Smart Parking"
        case "Tap Zones": return "Partnered Tap Zones"
        case "Route": return "Route Preview"
        default: return "Nearby Intelligence"
        }
    }

    private var sheetModeChip: String {
        switch selectedMode {
        case "Tap Zones": return "Verified"
        case "Route": return "Navigation"
        case "Smart Parking": return "Live"
        default: return "General"
        }
    }

    private func selectMode(_ mode: String) {
        selectedMode = mode
        if mode == "Smart Parking" { selectedPin = pins.first(where: { $0.kind == .parking }) }
        if mode == "Tap Zones" { selectedPin = pins.first(where: { $0.kind == .partner }) }
        if mode == "Route" { selectedPin = pins.first }
        nativeImpactLight()
    }

    private func cycleRecenterMode() {
        switch recenterMode {
        case .off:
            recenterMode = .follow
            region.center = CLLocationCoordinate2D(latitude: 33.7866, longitude: -84.3833)
            selectedPin = nil
            showFunctionSheet = false
        case .follow:
            recenterMode = .followWithHeading
            headingProvider.start()
        case .followWithHeading:
            recenterMode = .off
            headingProvider.stop()
        }
        nativeImpactLight()
    }

    private func dropRecenterModeForUserPan() {
        guard recenterMode != .off else { return }
        recenterMode = .off
        headingProvider.stop()
    }

    private func handlePartnerFocus() {
        let activating = !showVerifiedOnly
        showVerifiedOnly = activating
        showTapZones = true
        if activating {
            selectedMode = "Tap Zones"
            showFunctionSheet = true
            selectedPin = pins.first(where: { $0.kind == .partner || $0.kind == .access })
        } else {
            selectedMode = "Nearby"
            showFunctionSheet = false
            selectedPin = nil
        }
        nativeImpactLight()
    }

    static let pinPoints: [CGPoint] = [
        CGPoint(x: 0.50, y: 0.50), CGPoint(x: 0.48, y: 0.53), CGPoint(x: 0.53, y: 0.48), CGPoint(x: 0.43, y: 0.56), CGPoint(x: 0.58, y: 0.51), CGPoint(x: 0.49, y: 0.62)
    ]

    static let decorativeMarkers: [NativeMapVisualMarker] = [
        NativeMapVisualMarker(id: "decor-soccer", title: "Matchday", glyph: "⚽", color: NativeTheme.emerald, x: 0.44, y: 0.39, shape: .hex),
        NativeMapVisualMarker(id: "decor-music", title: "Live Music", glyph: "♫", color: NativeTheme.pink, x: 0.40, y: 0.45, shape: .roundedSquare),
        NativeMapVisualMarker(id: "decor-party", title: "Event", glyph: "🎉", color: NativeTheme.purple, x: 0.32, y: 0.51, shape: .roundedSquare),
        NativeMapVisualMarker(id: "decor-shop", title: "Shopping", glyph: "🛍", color: NativeTheme.cyan, x: 0.49, y: 0.73, shape: .roundedSquare),
        NativeMapVisualMarker(id: "decor-p1", title: "Parking", glyph: "P", color: NativeTheme.emerald, x: 0.51, y: 0.52, shape: .circle),
        NativeMapVisualMarker(id: "decor-p2", title: "Parking", glyph: "P", color: NativeTheme.emerald, x: 0.80, y: 0.47, shape: .circle),
        NativeMapVisualMarker(id: "decor-p3", title: "Parking", glyph: "P", color: NativeTheme.emerald, x: 0.88, y: 0.90, shape: .circle),
        NativeMapVisualMarker(id: "decor-p4", title: "Parking", glyph: "P", color: NativeTheme.emerald, x: 0.96, y: 0.78, shape: .circle)
    ]
}

private struct NativeMapVisualMarker: Identifiable {
    enum Shape { case circle, roundedSquare, hex }
    let id: String
    var pinID: String? = nil
    var trafficVenueID: String? = nil
    let title: String
    let glyph: String
    let color: Color
    let x: CGFloat
    let y: CGFloat
    let shape: Shape
    var opensTrafficIntel: Bool = false
}

private struct NativeTrafficIntelSheet: View {
    let venue: NativeVenueSummary
    let reports: [NativeCommunityReport]
    let onAddReport: (NativeCommunityReport.Category) -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var showReportPicker = false

    init(venue: NativeVenueSummary,
         reports: [NativeCommunityReport] = NativeCommunityReport.samples,
         onAddReport: @escaping (NativeCommunityReport.Category) -> Void = { _ in }) {
        self.venue = venue
        self.reports = reports
        self.onAddReport = onAddReport
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                NativeTrafficIntelMetricCard(
                    icon: "waveform.path.ecg",
                    title: "Local Congestion",
                    value: congestionLabel,
                    subtitle: congestionSubtitle,
                    accent: congestionColor,
                    progress: congestionProgress
                )
                NativeTrafficIntelMetricCard(
                    icon: "car.fill",
                    title: "Travel Estimates",
                    value: travelEstimate,
                    subtitle: "Based on \(venue.distance) from current Midtown context",
                    accent: NativeTheme.cyan,
                    progress: min(max(Double(travelMinutes) / 24.0, 0.10), 1.0)
                )
                NativeTrafficIntelMetricCard(
                    icon: "parkingsign.circle.fill",
                    title: "Parking Density",
                    value: parkingDensityLabel,
                    subtitle: "\(venue.parking.totalAvailable) spots · \(venue.parking.priceLabel)",
                    accent: parkingColor,
                    progress: parkingProgress
                )
                NativeCommunityReportsCard(reports: reports) { showReportPicker = true }
                footer
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 30)
        }
        .background(NativePolish.elevatedSurface.ignoresSafeArea())
        .overlay(Rectangle().fill(NativePolish.softBorder).frame(height: 1), alignment: .top)
        .accessibilityIdentifier("native-map-traffic-intel-sheet")
        .sheet(isPresented: $showReportPicker) {
            if #available(iOS 16.0, *) {
                NativeCommunityReportPickerSheet(onSubmit: onAddReport)
                    .presentationDetents([.height(280), .medium])
                    .presentationDragIndicator(.visible)
            } else {
                NativeCommunityReportPickerSheet(onSubmit: onAddReport)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 13) {
            ZStack {
                Circle().fill(NativeTheme.orange.opacity(colorScheme == .dark ? 0.22 : 0.16))
                Image(systemName: "bolt.fill")
                    .font(.system(size: 20, weight: .black))
                    .foregroundColor(NativeTheme.orange)
            }
            .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text("Traffic Intel")
                    .font(.system(size: 25, weight: .black))
                    .foregroundColor(NativeTheme.textPrimary)
                Text(venue.name)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(NativeTheme.textSecondary)
                    .lineLimit(1)
            }
            Spacer()
            Text("LIVE")
                .font(.system(size: 11, weight: .black))
                .foregroundColor(.black)
                .padding(.horizontal, 10)
                .frame(height: 28)
                .background(NativeTheme.orange)
                .clipShape(Capsule())
        }
        .padding(16)
        .background(NativeTheme.selectedControlSurface)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Image(systemName: "location.viewfinder")
                .font(.system(size: 13, weight: .black))
                .foregroundColor(NativeTheme.cyan)
            Text("Powered by live venue, crowd, and parking signals")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(NativeTheme.textSecondary)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(NativeTheme.selectedControlSurface)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var crowd: NativeCrowdSummary { venue.crowd ?? NativeCrowdSummary(level: 1, label: "Chill", waitMins: nil) }
    private var congestionProgress: Double { min(max(Double(crowd.level) / 4.0, 0.12), 1.0) }
    private var congestionLabel: String { crowd.label }
    private var congestionSubtitle: String { crowd.waitMins.map { "~\($0)m wait · Level \(crowd.level)/4" } ?? "Level \(crowd.level)/4 · monitored nearby" }

    private var congestionColor: Color {
        switch crowd.level {
        case 1: return NativeTheme.emerald
        case 2: return NativeTheme.cyan
        case 3: return NativeTheme.orange
        default: return NativeTheme.pink
        }
    }

    private var travelMinutes: Int {
        let miles = Double(venue.distance.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).joined()) ?? 0.6
        return max(3, Int((miles * 9.0).rounded()) + max(crowd.level - 1, 0) * 2)
    }

    private var travelEstimate: String { "\(travelMinutes) min" }

    private var parkingProgress: Double { min(max(Double(venue.parking.totalAvailable) / 50.0, 0.06), 1.0) }
    private var parkingDensityLabel: String {
        switch venue.parking.totalAvailable {
        case 0...6: return "Tight"
        case 7...20: return "Moderate"
        default: return "Open"
        }
    }

    private var parkingColor: Color {
        switch venue.parking.totalAvailable {
        case 0...6: return NativeTheme.pink
        case 7...20: return NativeTheme.orange
        default: return NativeTheme.emerald
        }
    }
}

/// Upgrade nudge shown when a parker without the premium entitlement taps a locked
/// Map Function. Names the function they reached for, lists the premium privilege
/// set, and routes to the (legacy) upgrade flow — the native billing surface is not
/// built yet, so the CTA hands off to the web profile/subscription screen.
private struct NativePremiumUpsellSheet: View {
    let function: BytspotPremiumMapFunction
    let entitlementPlan: String
    let onUpgrade: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 13) {
                ZStack {
                    Circle().fill(function.accent.opacity(colorScheme == .dark ? 0.22 : 0.16))
                    Image(systemName: function.systemImage)
                        .font(.system(size: 21, weight: .black))
                        .foregroundColor(function.accent)
                }
                .frame(width: 50, height: 50)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Unlock \(function.title)")
                        .font(.system(size: 21, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                    Text(function.subtitle)
                        .font(.system(size: 13.5, weight: .bold))
                        .foregroundColor(NativeTheme.textSecondary)
                }
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach(BytspotPremiumMapFunction.allCases) { privilege in
                    HStack(spacing: 10) {
                        Image(systemName: privilege == function ? "checkmark.seal.fill" : "checkmark.circle.fill")
                            .font(.system(size: 15, weight: .black))
                            .foregroundColor(privilege.accent)
                        Text(privilege.title)
                            .font(.system(size: 15, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .background(NativePolish.elevatedSurface)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Spacer(minLength: 0)
            Button(action: onUpgrade) {
                HStack(spacing: 8) {
                    Image(systemName: "crown.fill").font(.system(size: 15, weight: .black))
                    Text("Upgrade to Premium").font(.system(size: 16, weight: .black))
                }
                .foregroundColor(.black)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(LinearGradient(colors: [NativeTheme.orange, NativeTheme.pink], startPoint: .leading, endPoint: .trailing))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            Button(action: { dismiss() }) {
                Text("Not now")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(NativeTheme.textSecondary)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(NativePolish.screenBackground.ignoresSafeArea())
        .accessibilityIdentifier("native-map-premium-upsell-\(function.rawValue)")
    }
}

private struct NativeTrafficIntelMetricCard: View {
    let icon: String
    let title: String
    let value: String
    let subtitle: String
    let accent: Color
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .black))
                    .foregroundColor(accent)
                    .frame(width: 38, height: 38)
                    .background(accent.opacity(0.13))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary)
                    Text(value)
                        .font(.system(size: 27, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                }
                Spacer()
            }
            Text(subtitle)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(NativeTheme.textSecondary)
                .lineLimit(2)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(NativeTheme.selectedControlSurface)
                    Capsule().fill(LinearGradient(colors: [accent, accent.opacity(0.62)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: proxy.size.width * CGFloat(min(max(progress, 0), 1)))
                }
            }
            .frame(height: 9)
        }
        .padding(16)
        .background(NativePolish.elevatedSurface)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: NativeTheme.softShadow, radius: 12, x: 0, y: 7)
    }
}

private struct NativeDarkMapBackdrop: View {
    private let roads: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (0.05, 0.20, 0.95, 0.15), (0.02, 0.36, 0.88, 0.32), (0.08, 0.57, 0.92, 0.52), (0.00, 0.76, 0.98, 0.72),
        (0.22, 0.00, 0.28, 1.00), (0.38, 0.05, 0.42, 0.92), (0.70, 0.14, 0.64, 0.96), (0.88, 0.22, 0.76, 0.86)
    ]

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                NativePolish.mapBaseSurface
                LinearGradient(colors: [NativePolish.mapPanelSurface.opacity(0.82), NativePolish.mapBaseSurface, Color.adaptive(lightHex: 0xD7E2EA, darkHex: 0x000000, lightAlpha: 0.50, darkAlpha: 0.96)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Canvas { context, size in
                    for i in stride(from: 0, through: Int(size.width), by: 38) {
                        var path = Path(); path.move(to: CGPoint(x: CGFloat(i), y: 0)); path.addLine(to: CGPoint(x: CGFloat(i) + 80, y: size.height))
                        context.stroke(path, with: .color(NativePolish.mapGridLine), lineWidth: 1)
                    }
                    for i in stride(from: 0, through: Int(size.height), by: 54) {
                        var path = Path(); path.move(to: CGPoint(x: 0, y: CGFloat(i))); path.addLine(to: CGPoint(x: size.width, y: CGFloat(i) - 34))
                        context.stroke(path, with: .color(NativePolish.mapGridLine), lineWidth: 1)
                    }
                    for road in roads {
                        var path = Path()
                        path.move(to: CGPoint(x: size.width * road.0, y: size.height * road.1))
                        path.addLine(to: CGPoint(x: size.width * road.2, y: size.height * road.3))
                        context.stroke(path, with: .color(NativePolish.mapRoadSurface), lineWidth: 5)
                        context.stroke(path, with: .color(NativePolish.mapRoadLine), lineWidth: 1.4)
                    }
                }
                mapLabel("Northeast Express", x: 0.47, y: 0.22, angle: -38, in: proxy.size)
                mapLabel("Downtown", x: 0.30, y: 0.52, angle: -90, in: proxy.size)
                mapLabel("Lake Clara Meer", x: 0.78, y: 0.48, angle: 0, in: proxy.size)
                mapLabel("Ponce de Leon Ave", x: 0.72, y: 0.72, angle: -21, in: proxy.size)
                LinearGradient(colors: [NativePolish.mapBaseSurface.opacity(0.36), .clear, Color.adaptive(lightHex: 0xCBD7E1, darkHex: 0x000000, lightAlpha: 0.36, darkAlpha: 0.72)], startPoint: .top, endPoint: .bottom)
            }
        }
    }

    private func mapLabel(_ text: String, x: CGFloat, y: CGFloat, angle: Double, in size: CGSize) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .black))
            .foregroundColor(NativePolish.mapLabelText)
            .rotationEffect(.degrees(angle))
            .position(x: size.width * x, y: size.height * y)
    }
}

private struct NativeMapVisualMarkerView: View {
    let marker: NativeMapVisualMarker
    let selected: Bool

    var body: some View {
        ZStack {
            if marker.shape == .circle { parkingHalo }
            markerShell
        }
        .scaleEffect(selected ? 1.12 : 1.0)
        .animation(.spring(response: 0.24, dampingFraction: 0.78), value: selected)
    }

    private var markerShell: some View {
        ZStack {
            markerShape.fill(marker.color)
            markerShape.stroke(Color.white.opacity(0.90), lineWidth: marker.shape == .circle ? 3 : 2.5)
            Text(marker.glyph)
                .font(.system(size: marker.glyph == "P" ? 15 : 18, weight: .black))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.25), radius: 2, x: 0, y: 1)
        }
        .frame(width: markerSize, height: markerSize)
        .shadow(color: marker.color.opacity(0.50), radius: 12, x: 0, y: 6)
    }

    private var markerSize: CGFloat {
        switch marker.shape {
        case .circle: return NativePolish.mapParkingPinSize
        case .hex: return NativePolish.mapTapZonePinSize
        case .roundedSquare: return NativePolish.mapVenuePinSize
        }
    }

    private var markerShape: AnyShape {
        switch marker.shape {
        case .circle: return AnyShape(Circle())
        case .roundedSquare: return AnyShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        case .hex: return AnyShape(NativeHexagon())
        }
    }

    private var parkingHalo: some View {
        ZStack {
            Circle().stroke(marker.color.opacity(0.34), lineWidth: 2).frame(width: 64, height: 64)
            Circle().fill(marker.color.opacity(0.13)).frame(width: 82, height: 82)
        }
    }
}

private struct NativeHexActionButton: View {
    let active: Bool
    var body: some View {
        ZStack {
            NativeHexagon()
                .fill(LinearGradient(colors: [NativePolish.mapControlSurface, NativePolish.mapBaseSurface.opacity(0.96)], startPoint: .topLeading, endPoint: .bottomTrailing))
            if active {
                NativeHexagon().fill(NativeTheme.cyan.opacity(0.12))
            }
            NativeHexagon().stroke(active ? NativeTheme.cyan.opacity(0.46) : NativePolish.strongBorder, lineWidth: 1.4)
            NativeBytspotPartnerIcon(active: active)
        }
        .frame(width: NativeMapExploreView.rightSecondaryActionControlSize, height: NativeMapExploreView.rightSecondaryActionControlSize)
        .shadow(color: NativeTheme.softShadow, radius: 9, x: 0, y: 5)
    }
}

private struct NativeBytspotPartnerIcon: View {
    let active: Bool

    var body: some View {
        ZStack {
            Image(systemName: "viewfinder")
                .font(.system(size: 23, weight: .black))
                .foregroundColor(NativeTheme.cyan.opacity(active ? 0.30 : 0.22))
            VStack(spacing: 1) {
                Text("BYT")
                    .font(.system(size: 10, weight: .black, design: .rounded))
                    .tracking(0.6)
                    .foregroundColor(active ? NativeTheme.cyan.opacity(0.96) : NativeTheme.cyan.opacity(0.82))
                HStack(spacing: 2) {
                    Circle().fill(NativeTheme.cyan.opacity(active ? 0.95 : 0.72)).frame(width: 3.5, height: 3.5)
                    Capsule().fill(NativeTheme.cyan.opacity(active ? 0.72 : 0.48)).frame(width: 8, height: 2)
                }
            }
        }
        .accessibilityLabel("Bytspot partner tap scan point")
    }
}

private struct NativeMapSheetActionButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let accent: Color
    let isPrimary: Bool
    var isEnabled: Bool = true
    let action: () -> Void
    @State private var pulse = false

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            HStack(spacing: 11) {
                ZStack {
                    Circle().fill(accent.opacity(isPrimary ? 0.18 : 0.11))
                    Image(systemName: icon)
                        .font(.system(size: isPrimary ? 18 : 16, weight: .black))
                        .foregroundColor(isPrimary ? accent : NativeTheme.textPrimary.opacity(0.86))
                }
                .frame(width: 38, height: 38)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: isPrimary ? 16 : 15, weight: .black))
                        .foregroundColor(isPrimary ? NativeTheme.textPrimary : NativeTheme.textPrimary.opacity(0.88))
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary.opacity(isPrimary ? 0.82 : 0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity)
            .frame(height: NativePolish.mapSheetActionHeight)
            .background(actionBackground)
            .overlay(actionBorder)
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.mapSheetActionRadius, style: .continuous))
            .scaleEffect(isPrimary && pulse ? 1.012 : 1.0)
            .shadow(color: accent.opacity(isPrimary ? (pulse ? 0.20 : 0.10) : 0.07), radius: isPrimary ? 16 : 10, x: 0, y: 7)
            .opacity(isEnabled ? 1 : 0.55)
            .saturation(isEnabled ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .layoutPriority(isPrimary ? 1 : 0)
        .onAppear {
            guard isPrimary && isEnabled else { return }
            withAnimation(.easeInOut(duration: 1.85).repeatForever(autoreverses: true)) { pulse = true }
        }
    }

    private var actionBackground: some View {
        LinearGradient(
            colors: isPrimary
                ? [NativePolish.mapPanelSurface, accent.opacity(0.16)]
                : [NativeTheme.surfaceHighlight, NativePolish.mapPanelSurface.opacity(0.86)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var actionBorder: some View {
        RoundedRectangle(cornerRadius: NativePolish.mapSheetActionRadius, style: .continuous)
            .stroke(
                LinearGradient(
                    colors: isPrimary
                        ? [accent.opacity(pulse ? 0.72 : 0.38), NativePolish.strongBorder, accent.opacity(0.16)]
                        : [NativePolish.strongBorder, NativePolish.softBorder],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: isPrimary ? 1.3 : 1
            )
    }
}

private struct NativeHexagon: Shape {
    func path(in rect: CGRect) -> Path {
        let points = [
            CGPoint(x: rect.midX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY + rect.height * 0.25), CGPoint(x: rect.maxX, y: rect.minY + rect.height * 0.75),
            CGPoint(x: rect.midX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.minY + rect.height * 0.75), CGPoint(x: rect.minX, y: rect.minY + rect.height * 0.25)
        ]
        var path = Path(); path.move(to: points[0]); points.dropFirst().forEach { path.addLine(to: $0) }; path.closeSubpath(); return path
    }
}

private struct AnyShape: Shape {
    private let makePath: (CGRect) -> Path
    init<S: Shape>(_ shape: S) { makePath = { shape.path(in: $0) } }
    func path(in rect: CGRect) -> Path { makePath(rect) }
}

private struct NativeLayerToggle: View {
    let title: String
    @Binding var isOn: Bool
    let color: Color

    var body: some View {
        Button(action: { isOn.toggle(); nativeImpactLight() }) {
            HStack(spacing: 5) {
                Circle().fill(isOn ? .black.opacity(0.62) : color).frame(width: 6, height: 6)
                Text(title)
            }
                .font(.system(size: 11, weight: .black))
                .foregroundColor(isOn ? .black : NativeTheme.textPrimary.opacity(0.90))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(isOn ? color : NativePolish.mapPanelSurface.opacity(0.92))
                .overlay(Capsule().stroke(isOn ? NativePolish.strongBorder : NativePolish.softBorder, lineWidth: 1))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct NativeConciergeView: View {
    enum HandoffAction: String, CaseIterable, Equatable { case discover, map, booking }
    struct ConciergeMessage: Identifiable, Equatable { let id: Int; let text: String; let isUser: Bool; var handoffs: [HandoffAction] = []; var escalated = false; var sourceQuery: String? = nil }
    let openHybrid: (BytspotHybridRoute) -> Void
    @State private var draft = ""
    @State private var isListening = false
    @State private var showHistory = false
    @State private var isTyping = false
    @State private var didRunPreviewPrompt = false
    @State private var nextMessageID = 2
    @State private var messages: [ConciergeMessage] = [ConciergeMessage(id: 1, text: "Welcome to Bytspot Concierge. I can help with parking, bookings, access, and what is open around Midtown.", isUser: false)]
    @State private var historyTitles: [String] = []
    @State private var connectionState = "ready"
    @EnvironmentObject private var tabContentStore: NativeTabContentStore
    @Environment(\.colorScheme) private var colorScheme

    static let transcriptBaseHex = 0x050507
    static let messageBubbleMaxWidthRatio: CGFloat = 0.84
    static let messageBubbleCornerRadius: CGFloat = 22
    static let messageBubbleFontSize: CGFloat = 14
    static let statusLabels = ["Live", "Thinking", "Offline mode", "Local fallback"]
    static let headerTitle = "Bytspot Concierge"
    static let statusLabel = "Human + AI"
    static let suggestionPrompts = ["Find parking nearby", "Book a private chef", "Access my booking", "What’s open now?"]
    static let handoffActionTitles = ["Open in Discover", "Show on Map", "Start Booking"]
    static let composerPlaceholder = "Message Concierge…"

    var body: some View {
        VStack(spacing: 0) {
            conciergeHeader
            if showHistory { historyPanel.transition(.opacity.combined(with: .move(edge: .top))) }
            chatTranscript
            suggestionRail
            composer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(conciergeRadialBackground.ignoresSafeArea())
        .onAppear(perform: runPreviewPromptIfNeeded)
        .accessibilityIdentifier("native-concierge-preview")
    }

    private var conciergeHeader: some View {
        ZStack(alignment: .top) {
            NativePolish.glassSurface
            LinearGradient(colors: [NativeTheme.surfaceHighlight, .clear], startPoint: .top, endPoint: .bottom).frame(height: 1)
            Circle().fill(NativeTheme.purple.opacity(0.25)).blur(radius: 28).frame(width: 144, height: 144).offset(x: 170, y: -70)
            HStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(LinearGradient(colors: [NativeTheme.purple, NativeTheme.magenta, NativeTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 44, height: 44)
                        .shadow(color: NativeTheme.purple.opacity(0.25), radius: 14, x: 0, y: 8)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.25), lineWidth: 1))
                    Image(systemName: "sparkles").font(.system(size: 16, weight: .black)).foregroundColor(.white)
                    Circle().fill(NativeTheme.emerald).frame(width: 20, height: 20).overlay(Image(systemName: "headphones").font(.system(size: 9, weight: .black)).foregroundColor(.black)).overlay(Circle().stroke(Color(hex: 0x0B0B0F), lineWidth: 2)).offset(x: 5, y: 5)
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text(Self.headerTitle)
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundColor(NativeTheme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                    HStack(spacing: 8) {
                        Text(Self.statusLabel)
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(NativeTheme.cyan)
                            .tracking(1.2)
                            .padding(.horizontal, 8)
                            .frame(height: 20)
                            .background(colorScheme == .dark ? NativeTheme.cyan.opacity(0.10) : Color(hex: 0xE8F8FF))
                            .overlay(Capsule().stroke(NativeTheme.cyan.opacity(colorScheme == .dark ? 0.25 : 0.32), lineWidth: 1))
                            .clipShape(Capsule())
                        Text("● \(statusText) · \(cityName)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(statusColor)
                            .lineLimit(1)
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    headerIconButton(symbol: "line.3.horizontal") { withAnimation(.spring(response: 0.24, dampingFraction: 0.86)) { showHistory.toggle() } }
                    headerIconButton(symbol: "arrow.clockwise") { resetConversation() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 12)
        }
        .frame(height: 92)
        .overlay(Rectangle().fill(NativePolish.softBorder).frame(height: 1), alignment: .bottom)
    }

    private var suggestionRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Self.suggestionPrompts, id: \.self) { chip in
                    Button(action: { send(chip) }) {
                        Text(chip)
                            .font(.system(size: 12, weight: .black))
                            .foregroundColor(NativeTheme.purple)
                            .padding(.horizontal, 14)
                            .frame(minHeight: NativePolish.chipHeight)
                            .background(NativePolish.elevatedSurface)
                            .overlay(Capsule().stroke(NativeTheme.purple.opacity(colorScheme == .dark ? 0.34 : 0.24), lineWidth: 1))
                            .clipShape(Capsule())
                            .shadow(color: NativeTheme.purple.opacity(0.10), radius: 4, x: 0, y: 2)
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(NativePolish.glassSurface)
    }

    private var historyPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Concierge Request History", systemImage: "clock.arrow.circlepath")
                .font(.system(size: 12, weight: .heavy))
                .foregroundColor(NativeTheme.textSecondary)
            if historyTitles.isEmpty {
                Text("No past conversations yet.")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(NativeTheme.textTertiary)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NativeTheme.selectedControlSurface)
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                ForEach(Array(historyTitles.prefix(3)), id: \.self) { title in
                    Text(title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(NativeTheme.textPrimary)
                        .lineLimit(1)
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(height: 38)
                        .background(NativeTheme.selectedControlSurface)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(NativePolish.glassSurface)
        .overlay(Rectangle().fill(NativePolish.softBorder).frame(height: 1), alignment: .bottom)
        .accessibilityIdentifier("native-concierge-history")
    }

    private var chatTranscript: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(messages) { message in
                        NativeConciergeMessageBubble(message: message, handleHandoff: handleHandoff)
                            .id(message.id)
                            .transition(.opacity.combined(with: .move(edge: .bottom)).combined(with: .scale(scale: 0.98)))
                    }
                    if isTyping { NativeConciergeTypingBubble().transition(.opacity.combined(with: .move(edge: .bottom))) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .onChange(of: messages.count) { _ in withAnimation(.easeOut(duration: 0.22)) { proxy.scrollTo(messages.last?.id, anchor: .bottom) } }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            conciergeRadialBackground
        )
        .accessibilityIdentifier("native-concierge-transcript")
    }

    private var composer: some View {
        HStack(spacing: 8) {
            Button(action: toggleVoice) {
                Image(systemName: isListening ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 18, weight: .black))
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(voiceButtonBackground)
                    .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 1))
                    .clipShape(Circle())
                    .shadow(color: NativeTheme.cyan.opacity(0.20), radius: 14, x: 0, y: 8)
            }
            .buttonStyle(.plain)
            TextField(Self.composerPlaceholder, text: $draft)
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(NativeTheme.textPrimary)
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(NativePolish.elevatedSurface)
                .overlay(Capsule().stroke(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NativePolish.softBorder : NativeTheme.purple.opacity(0.85), lineWidth: 1))
                .clipShape(Capsule())
            Button(action: { send(draft) }) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 15, weight: .black))
                    .foregroundColor(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .white.opacity(0.30) : .white)
                    .frame(width: 44, height: 44)
                    .background(sendButtonBackground)
                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    .clipShape(Circle())
                    .shadow(color: draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .clear : NativeTheme.purple.opacity(0.25), radius: 10, x: 0, y: 6)
            }
            .buttonStyle(.plain)
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(NativePolish.glassSurface)
        .overlay(Rectangle().fill(NativePolish.softBorder).frame(height: 1), alignment: .top)
    }

    private func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isTyping else { return }
        let complex = isComplex(text)
        let handoffs = inferHandoffs(text)
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            messages.append(ConciergeMessage(id: createMessageID(), text: text, isUser: true))
            messages.append(ConciergeMessage(id: createMessageID(), text: response(for: text, complex: complex), isUser: false, handoffs: handoffs, escalated: complex, sourceQuery: text))
        }
        historyTitles = Array(([text] + historyTitles).prefix(12))
        draft = ""
        if complex {
            isTyping = false
            connectionState = "ready"
        } else {
            isTyping = true
            connectionState = "thinking"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) {
                guard isTyping else { return }
                withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                    messages.append(ConciergeMessage(id: createMessageID(), text: localFallbackResponse(for: text), isUser: false, handoffs: handoffs, sourceQuery: text))
                    isTyping = false
                    connectionState = "fallback"
                }
            }
        }
        nativeImpactLight()
    }

    private func createMessageID() -> Int { defer { nextMessageID += 1 }; return nextMessageID }

    private func runPreviewPromptIfNeeded() {
        guard NativeMigrationConfig.isNativeRootEnabled,
              !didRunPreviewPrompt,
              let prompt = ProcessInfo.processInfo.environment["BYT_NATIVE_CONCIERGE_PROMPT"],
              !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        didRunPreviewPrompt = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { send(prompt) }
    }

    private func resetConversation() {
        nativeImpactLight()
        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
            nextMessageID = 2
            messages = [ConciergeMessage(id: 1, text: "Welcome to Bytspot Concierge. I can help with parking, bookings, access, and what is open around Midtown.", isUser: false)]
            connectionState = "ready"
            showHistory = false
            isTyping = false
            draft = ""
        }
    }

    private func toggleVoice() {
        nativeImpactLight()
        isListening.toggle()
        if isListening {
            isListening = false
            connectionState = "fallback"
            messages.append(ConciergeMessage(id: createMessageID(), text: "Voice input is not available on this device yet. Please type your question below — I can still help with parking, venues, and plans nearby.", isUser: false))
        }
    }

    private func isComplex(_ query: String) -> Bool {
        ["private chef", "book", "booking", "reservation", "access my booking", "refund", "vip", "event", "catering", "specialist", "human"].contains { query.localizedCaseInsensitiveContains($0) }
    }

    private func inferHandoffs(_ query: String) -> [HandoffAction] {
        let q = query.lowercased()
        var actions: [HandoffAction] = []
        if q.contains("parking") || q.contains("nearby") || q.contains("map") { actions.append(.map) }
        if q.contains("open") || q.contains("discover") || q.contains("chef") || q.contains("food") || q.contains("service") { actions.append(.discover) }
        if q.contains("book") || q.contains("reservation") || q.contains("chef") || q.contains("access") { actions.append(.booking) }
        return actions.isEmpty ? [.discover, .map] : actions
    }

    private func response(for query: String, complex: Bool) -> String {
        let q = query.lowercased()
        var text = "I’m on it — I’ll use Midtown context and narrow this down for you."
        if q.contains("parking") { text = "I can help find nearby parking and route you to the best option." }
        if q.contains("open") { text = "I’ll look for what’s open now around Midtown." }
        if q.contains("access") { text = "I can help pull up booking and access options." }
        if q.contains("chef") { text = "A private chef request needs white-glove handling. I’ll start the request and route you to booking options." }
        if complex { text += "\n\nConnecting you to a Concierge specialist for the details." }
        return text
    }

    private func localFallbackResponse(for query: String) -> String {
        let q = query.lowercased()
        if q.contains("parking") { return "Here are some spots in \(cityName):\n\n• Midtown Smart Parking — Open now\n• Colony Square — Moderate crowd\n• Arts Center Access — Verified patch\n\nSign in to chat with the full AI concierge — live events, Google Places, and personalized picks! 🚀" }
        if q.contains("open") { return "Here's what's open around \(cityName):\n\n• Colony Square — Open now\n• Dinner Spots That Match Your Vibe — Available tonight\n• GH Akwaaba Pass — Digital pass ready\n\nSign in for full AI-powered recommendations with live events & Google Places data! 🔓" }
        return "Here are some spots in \(cityName):\n\n• Colony Square — Open\n• Midtown Smart Parking — Open\n• Broni Home Taste — Available now\n\nSign in to chat with the full AI concierge — live events, Google Places, and personalized picks! 🚀"
    }

    private func handleHandoff(_ action: HandoffAction, _ query: String?) {
        nativeImpactLight()
        switch action {
        case .discover: openHybrid(.discover)
        case .map: openHybrid(.map)
        case .booking: openHybrid(.access)
        }
    }

    private var statusText: String {
        if connectionState == "thinking" { return "Thinking" }
        if connectionState == "offline" { return "Offline mode" }
        if connectionState == "fallback" { return "Local fallback" }
        return "Live"
    }

    private var statusColor: Color { connectionState == "fallback" ? NativeTheme.cyan : connectionState == "offline" ? NativeTheme.orange : connectionState == "thinking" ? NativeTheme.cyan : NativeTheme.emerald }
    private var cityName: String { "Midtown" }

    private var conciergeRadialBackground: some View {
        ZStack {
            NativePolish.screenBackground
            RadialGradient(colors: [NativeTheme.purple.opacity(colorScheme == .dark ? 0.12 : 0.075), .clear], center: .topTrailing, startRadius: 8, endRadius: 280)
            RadialGradient(colors: [NativeTheme.cyan.opacity(colorScheme == .dark ? 0.09 : 0.055), .clear], center: .bottomLeading, startRadius: 8, endRadius: 260)
        }
    }

    private var sendButtonBackground: some View {
        Group {
            if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { NativeTheme.selectedControlSurface }
            else { LinearGradient(colors: [NativeTheme.purple, NativeTheme.magenta], startPoint: .topLeading, endPoint: .bottomTrailing) }
        }
    }

    private var voiceButtonBackground: some View {
        Group {
            if isListening { NativeTheme.pink }
            else { LinearGradient(colors: [NativeTheme.cyan, Color.blue, NativeTheme.purple], startPoint: .topLeading, endPoint: .bottomTrailing) }
        }
    }

    private func headerIconButton(symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: { nativeImpactLight(); action() }) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .black))
                .foregroundColor(NativeTheme.textPrimary.opacity(colorScheme == .dark ? 0.70 : 0.58))
                .frame(width: 32, height: 32)
                .background(NativeTheme.selectedControlSurface)
                .overlay(Circle().stroke(NativePolish.softBorder, lineWidth: 1))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct NativeConciergeMessageBubble: View {
    let message: NativeConciergeView.ConciergeMessage
    let handleHandoff: (NativeConciergeView.HandoffAction, String?) -> Void
    private let chipColumns = [GridItem(.adaptive(minimum: 112), spacing: 8)]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 56) }
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .top) {
                    bubbleBackground
                    if !message.isUser { NativeTheme.surfaceHighlight.frame(height: 1).padding(.horizontal, 12) }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(message.text)
                            .font(.system(size: NativeConciergeView.messageBubbleFontSize, weight: message.isUser ? .medium : .regular))
                            .foregroundColor(message.isUser ? .white : NativeTheme.textPrimary)
                            .lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                        if message.escalated { escalationBadge }
                        if !message.handoffs.isEmpty { handoffChips }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .clipShape(RoundedRectangle(cornerRadius: NativeConciergeView.messageBubbleCornerRadius, style: .continuous))
                .shadow(color: NativeTheme.softShadow, radius: 14, x: 0, y: 10)
            }
            .frame(maxWidth: UIScreen.main.bounds.width * NativeConciergeView.messageBubbleMaxWidthRatio, alignment: message.isUser ? .trailing : .leading)
            if !message.isUser { Spacer(minLength: 56) }
        }
        .frame(maxWidth: .infinity)
    }

    private var bubbleBackground: some View {
        Group {
            if message.isUser {
                LinearGradient(colors: [NativeTheme.cyan, Color.blue, NativeTheme.purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .overlay(RoundedRectangle(cornerRadius: NativeConciergeView.messageBubbleCornerRadius, style: .continuous).stroke(Color(red: 0.80, green: 0.97, blue: 1.0).opacity(0.25), lineWidth: 1))
            } else {
                NativePolish.elevatedSurface
                    .overlay(RoundedRectangle(cornerRadius: NativeConciergeView.messageBubbleCornerRadius, style: .continuous).stroke(colorScheme == .dark ? NativePolish.softBorder : Color(hex: 0xDDE3EA), lineWidth: 1))
            }
        }
    }

    private var escalationBadge: some View {
        Text("Connecting you to a Concierge specialist")
            .font(.system(size: 12, weight: .black))
            .foregroundColor(Color.adaptive(lightHex: 0x075985, darkHex: 0xCFFAFE))
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.adaptive(lightHex: 0xE8F8FF, darkHex: 0x072633, lightAlpha: 1.0, darkAlpha: 0.86))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(NativeTheme.cyan.opacity(colorScheme == .dark ? 0.24 : 0.34), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var handoffChips: some View {
        LazyVGrid(columns: chipColumns, alignment: .leading, spacing: 8) {
            ForEach(message.handoffs, id: \.self) { action in
                Button(action: { handleHandoff(action, message.sourceQuery ?? message.text) }) {
                    HStack(spacing: 6) {
                        Text(label(for: action))
                        Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .black))
                    }
                    .frame(maxWidth: .infinity)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(NativeTheme.textPrimary.opacity(colorScheme == .dark ? 0.85 : 0.94))
                    .padding(.horizontal, 12)
                    .frame(minHeight: 32)
                    .background(colorScheme == .dark ? NativeTheme.selectedControlSurface : Color(hex: 0xEEF0F3))
                    .overlay(Capsule().stroke(colorScheme == .dark ? NativePolish.softBorder : Color(hex: 0xD2D6DC), lineWidth: 1))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func label(for action: NativeConciergeView.HandoffAction) -> String {
        switch action {
        case .discover: return "Open in Discover"
        case .map: return "Show on Map"
        case .booking: return "Start Booking"
        }
    }
}

private struct NativeConciergeTypingBubble: View {
    var body: some View {
        HStack {
            HStack(spacing: 6) {
                Circle().fill(NativeTheme.textTertiary).frame(width: 8, height: 8)
                Circle().fill(NativeTheme.textTertiary).frame(width: 8, height: 8)
                Circle().fill(NativeTheme.textTertiary).frame(width: 8, height: 8)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(NativePolish.elevatedSurface)
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: NativeTheme.softShadow, radius: 16, x: 0, y: 12)
            Spacer(minLength: 56)
        }
    }
}

private struct NativeHorizontalSection<Content: View>: View {
    let title: String
    let subtitle: String
    let content: Content
    init(title: String, subtitle: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.subtitle = subtitle; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text(title).nativeTitle(21); Spacer(); Text(subtitle).font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan) }
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 12) { content } }
        }
    }
}

private struct NativeMiniCard: View {
    let eyebrow: String; let title: String; let subtitle: String; let iconText: String; let accent: Color; let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text(iconText).font(.system(size: 21)); Spacer(); Text(eyebrow).font(.system(size: 10, weight: .black)).foregroundColor(accent).lineLimit(1) }
                Spacer(minLength: 0)
                Text(title).font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(2)
                Text(subtitle).font(.system(size: 11, weight: .bold)).foregroundColor(NativeTheme.textSecondary).lineLimit(2)
            }
            .frame(width: 150, height: 132, alignment: .leading)
            .padding(13)
            .background(LinearGradient(colors: [NativeTheme.panel, accent.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(accent.opacity(0.20), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct NativeSmallToggle: View {
    let title: String; let active: Bool; let color: Color; let action: () -> Void
    var body: some View {
        Button(action: { action(); nativeImpactLight() }) {
            Text(title)
                .font(.system(size: 11, weight: .black))
                .foregroundColor(active ? .black : NativeTheme.textPrimary.opacity(0.86))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(active ? color : NativePolish.mapPanelSurface.opacity(0.84))
                .overlay(Capsule().stroke(active ? NativePolish.strongBorder : NativePolish.softBorder, lineWidth: 1))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct NativeScreenScroll<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    // The floating tab bar is attached via safeAreaInset, so the scroll content is inset automatically.
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: NativePolish.sectionSpacing) { content }.padding(.horizontal, NativePolish.screenPadding).padding(.top, 20).padding(.bottom, 20) }.background(NativePolish.screenBackground.ignoresSafeArea()) }
}

private enum NativePolish {
    static let baseHex = 0x050507
    static let panelHex = 0x080A10
    static let elevatedHex = 0x101116
    static let screenPadding: CGFloat = 20
    static let sectionSpacing: CGFloat = 24
    static let cardRadius: CGFloat = 24
    static let heroRadius: CGFloat = 30
    static let controlSize: CGFloat = 48
    static let chipHeight: CGFloat = 36
    static let bottomBarHeight: CGFloat = 72
    static let bottomBarRadius: CGFloat = 24
    static let bottomBarHorizontalPadding: CGFloat = 16
    static let bottomBarBottomPadding: CGFloat = 8
    static let bottomBarInnerHorizontalPadding: CGFloat = 4
    static let bottomBarInnerVerticalPadding: CGFloat = 8
    static let bottomTabItemHeight: CGFloat = 56
    static let bottomTabActiveRadius: CGFloat = 14
    static let bottomBarShadowOpacity: Double = 0.40
    static let bottomBarShadowRadius: CGFloat = 24
    static let bottomBarShadowY: CGFloat = 12
    static let mapBaseHex = 0x050505
    static let mapPanelHex = 0x080A10
    static let mapActiveCyanHex = 0x06242B
    static let mapSearchLeadingInset: CGFloat = 12
    static let mapSearchTrailingInset: CGFloat = 80
    static let mapSearchTopInset: CGFloat = 16
    static let mapSearchHeight: CGFloat = 48
    static let mapSearchRadius: CGFloat = 24
    static let mapActionTopInset: CGFloat = 112
    static let mapActionTrailingInset: CGFloat = 16
    static let mapActionStackSpacing: CGFloat = 8
    static let mapActionPrimarySize: CGFloat = 48
    static let mapActionSecondarySize: CGFloat = 44
    static let mapSheetHorizontalInset: CGFloat = 12
    static let mapSheetBottomInset: CGFloat = 8
    static let mapSheetRadius: CGFloat = 28
    static let mapSheetInnerHorizontalPadding: CGFloat = 4
    static let mapSheetInnerTopPadding: CGFloat = 12
    static let mapSheetInnerBottomPadding: CGFloat = 16
    static let mapSheetContentSpacing: CGFloat = 10
    static let mapSheetCloseSize: CGFloat = 64
    static let mapFunctionHeaderHeight: CGFloat = 70
    static let mapFunctionGridGap: CGFloat = 8
    static let mapFunctionGridPadding: CGFloat = 8
    static let mapFunctionButtonHeight: CGFloat = 108
    static let mapFunctionButtonRadius: CGFloat = 20
    static let mapFunctionRowGap: CGFloat = 8
    static let mapFunctionRowHeight: CGFloat = 96
    static let mapSheetActionHeight: CGFloat = 64
    static let mapSheetActionRadius: CGFloat = 22
    static let mapSheetActionGap: CGFloat = 10
    static let mapParkingPinSize: CGFloat = 32
    static let mapVenuePinSize: CGFloat = 34
    static let mapTapZonePinSize: CGFloat = 40
    static let screenBackground = Color.adaptive(lightHex: 0xF5F7FA, darkHex: baseHex)
    static let glassSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: panelHex, lightAlpha: 0.78, darkAlpha: 0.88)
    static let elevatedSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: elevatedHex, lightAlpha: 0.92, darkAlpha: 0.90)
    static let bottomBarSurface = NativeTheme.tabBarBackground
    static let mapBaseSurface = Color.adaptive(lightHex: 0xEFF4F8, darkHex: mapBaseHex)
    static let mapPanelSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: mapPanelHex, lightAlpha: 0.88, darkAlpha: 0.94)
    static let mapControlSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: mapPanelHex, lightAlpha: 0.92, darkAlpha: 0.94)
    static let mapRoadSurface = Color.adaptive(lightHex: 0xDCE6EE, darkHex: mapPanelHex, lightAlpha: 0.86, darkAlpha: 0.96)
    static let mapGridLine = Color.adaptive(lightHex: 0x475569, darkHex: 0xFFFFFF, lightAlpha: 0.085, darkAlpha: 0.030)
    static let mapRoadLine = Color.adaptive(lightHex: 0x334155, darkHex: 0xFFFFFF, lightAlpha: 0.22, darkAlpha: 0.13)
    static let mapLabelText = Color.adaptive(lightHex: 0x1F2937, darkHex: 0xFFFFFF, lightAlpha: 0.32, darkAlpha: 0.18)
    static let softBorder = NativeTheme.surfaceStroke
    static let strongBorder = NativeTheme.strongSurfaceStroke
    static func brandGradient() -> LinearGradient { LinearGradient(colors: [NativeTheme.cyan, NativeTheme.purple, NativeTheme.pink], startPoint: .topLeading, endPoint: .bottomTrailing) }
}

private struct NativeHeroCard: View {
    let title: String; let eyebrow: String; let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan).tracking(1.5)
            Text(title).font(.system(size: 32, weight: .heavy)).foregroundColor(NativeTheme.textPrimary)
            Text(subtitle).nativeBody(color: NativeTheme.textSecondary)
        }
        .padding(22)
        .background(LinearGradient(colors: [NativeTheme.panel, NativeTheme.purple.opacity(0.28)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 30).stroke(NativeTheme.cyan.opacity(0.24)))
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }
}

private struct NativeSectionHeader: View {
    let title: String; let subtitle: String
    var body: some View { VStack(alignment: .leading, spacing: 6) { Text(title).nativeTitle(30); Text(subtitle).nativeBody() } }
}

private struct NativeQuickAction: View {
    let title: String; let subtitle: String; let icon: String; let color: Color; let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                NativeIcon(symbol: icon, color: color)
                Text(title).font(.system(size: 17, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Text(subtitle).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 124, alignment: .topLeading)
            .padding(18)
            .background(LinearGradient(colors: [NativePolish.elevatedSurface, color.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(color.opacity(0.26), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous))
            .shadow(color: NativeTheme.softShadow, radius: 18, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeRow: View {
    let title: String; let subtitle: String; let icon: String; let action: () -> Void
    var body: some View { Button(action: action) { HStack(spacing: 13) { NativeIcon(symbol: icon, color: NativeTheme.cyan); VStack(alignment: .leading, spacing: 4) { Text(title).nativeTitle(16); Text(subtitle).nativeBody(size: 12.5) }; Spacer(); Image(systemName: "chevron.right").foregroundColor(NativeTheme.textTertiary) }.padding(15).nativePanel() }.buttonStyle(.plain) }
}

private struct NativeIcon: View { let symbol: String; let color: Color; var body: some View { Image(systemName: symbol).font(.system(size: 18, weight: .black)).foregroundColor(.black).frame(width: 44, height: 44).background(LinearGradient(colors: [color, color.opacity(0.76)], startPoint: .topLeading, endPoint: .bottomTrailing)).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.20), lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)).shadow(color: color.opacity(0.18), radius: 10, x: 0, y: 6) } }

private struct NativeRoundButton: View {
    let symbol: String
    let tint: Color
    let size: CGFloat
    let isActive: Bool
    let activeColor: Color

    init(symbol: String, tint: Color, size: CGFloat = NativeMapExploreView.rightActionControlSize, isActive: Bool = false, activeColor: Color = NativeTheme.cyan) {
        self.symbol = symbol
        self.tint = tint
        self.size = size
        self.isActive = isActive
        self.activeColor = activeColor
    }

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 20, weight: .black))
            .foregroundColor(tint.opacity(isActive ? 0.92 : 0.76))
            .frame(width: size, height: size)
            .background(
                Circle().fill(
                    LinearGradient(
                        colors: [NativePolish.mapControlSurface, NativePolish.mapBaseSurface.opacity(0.96)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            )
            .overlay(Circle().fill(isActive ? activeColor.opacity(0.14) : NativeTheme.surfaceHighlight.opacity(0.42)))
            .overlay(Circle().stroke(isActive ? activeColor.opacity(0.42) : NativePolish.strongBorder, lineWidth: 1.25))
            .clipShape(Circle())
            .shadow(color: NativeTheme.softShadow, radius: 9, x: 0, y: 5)
    }
}

enum NativeMapRecenterMode { case off, follow, followWithHeading }

/// Native mirror of the physidigital Trust Ladder (contracts/native-trust-contract.json).
/// Monotonic rungs that gate capabilities; L2 (proximate) is the 120 m VERIFIED_ZONE
/// gate ported from React MapSection that the earlier Capacitor port had dropped.
enum BytspotTrustLevel: Int, Comparable, CaseIterable {
    case anonymous = 0
    case staticDiscovery = 1
    case proximate = 2
    case signedToken = 3
    case nfcCounterVerified = 4
    static func < (lhs: BytspotTrustLevel, rhs: BytspotTrustLevel) -> Bool { lhs.rawValue < rhs.rawValue }
}

enum BytspotTrustCapability: CaseIterable {
    case viewVenue, saveToWallet, initiateDirectScan, createCheckoutHold, burnOneTimeAccess
    var requiredLevel: BytspotTrustLevel {
        switch self {
        case .viewVenue: return .anonymous
        case .saveToWallet: return .staticDiscovery
        case .initiateDirectScan: return .proximate
        case .createCheckoutHold: return .signedToken
        case .burnOneTimeAccess: return .nfcCounterVerified
        }
    }

    /// Whether the capability's effect cannot be taken back once performed (funds
    /// authorized into a hold, a one-time access token consumed). Mirrors
    /// native-trust-contract.json invariants.irreversibleCapabilities. The
    /// WS-A #4 invariant (locked in NativeMapParitySelfTests) forbids any of these
    /// from being reachable at or below L2 — physical proximity alone must never
    /// trigger an irreversible action.
    var isIrreversible: Bool {
        switch self {
        case .createCheckoutHold, .burnOneTimeAccess: return true
        case .viewVenue, .saveToWallet, .initiateDirectScan: return false
        }
    }
}

/// Advisory "descent profile" ring the parker currently occupies on approach to
/// a verified zone (contracts/native-trust-contract.json trustLadder[2].gate).
/// ORDERED but TRUST-FREE: only `.armed` coincides with L2 eligibility, and even
/// then trust is decided solely by directScanPermitted — the outer rings exist
/// purely to drive advisory pre-warm and never grant a capability themselves.
enum BytspotDescentStage: Int, Comparable {
    case faraway = 0    // beyond the discovery ring
    case discovery = 1  // inside discovery ring — lifestyle surfacing only
    case preStage = 2   // inside pre-stage ring — warm the hybrid bridge
    case armed = 3       // inside the arm radius — L2 *eligible* (gate still decides)
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Native premium-membership entitlement. Mirrors the React "Insider Premium"
/// subscription (trpc.subscription.status.isPremium) and is ORTHOGONAL to the
/// black/platinum/green service tier — a parker on any tier may or may not hold
/// premium. Native billing parity is not complete, so this defaults to `.free`
/// (exactly as the web silently defaults to free for guests/errors) and is
/// overridable for previews via BYT_NATIVE_PREVIEW_PREMIUM, the same way the tier
/// is via BYT_NATIVE_PREVIEW_TIER. The Map Functions sheet reads it to decide
/// whether premium functions unlock or show their upgrade nudge.
enum BytspotMembership: String, Equatable, CaseIterable {
    case free
    case premium

    var isPremium: Bool { self == .premium }

    static let previewEnvironmentKey = "BYT_NATIVE_PREVIEW_PREMIUM"

    static var preview: BytspotMembership {
        switch ProcessInfo.processInfo.environment[previewEnvironmentKey]?.lowercased() {
        case "1", "true", "yes", "premium": return .premium
        default: return .free
        }
    }
}

/// Premium-gated Map Functions, ported from the React MapFunction union and locked
/// to contracts/native-trust-contract.json mapFunctions.premium. Each requires an
/// active BytspotMembership.premium; without it the sheet row renders a lock and
/// routes to the upgrade nudge instead of the action.
enum BytspotPremiumMapFunction: String, CaseIterable, Identifiable {
    case aiNavigation = "ai-navigation"
    case spotRadar = "spot-radar"
    case trafficIntelligence = "traffic-intelligence"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .aiNavigation: return "AI Navigation"
        case .spotRadar: return "Spot Radar"
        case .trafficIntelligence: return "Traffic Intelligence"
        }
    }

    var subtitle: String {
        switch self {
        case .aiNavigation: return "Smart routing around live conditions"
        case .spotRadar: return "Surface hidden spots & gems nearby"
        case .trafficIntelligence: return "Live congestion & travel estimates"
        }
    }

    var systemImage: String {
        switch self {
        case .aiNavigation: return "brain.head.profile"
        case .spotRadar: return "dot.radiowaves.left.and.right"
        case .trafficIntelligence: return "waveform.path.ecg"
        }
    }

    var accent: Color {
        switch self {
        case .aiNavigation: return NativeTheme.purple
        case .spotRadar: return NativeTheme.cyan
        case .trafficIntelligence: return NativeTheme.orange
        }
    }
}

/// Single native authority for the Map Functions catalog, mirroring the contract's
/// mapFunctions block. `free` functions surface without an entitlement; `premium`
/// requires BytspotMembership.premium. The sheet UI and the parity self-tests both
/// read from here so the lock affordance can never disagree with the contract.
enum BytspotMapFunctionCatalog {
    static let freeFunctions = ["smart-parking", "live-venue-data", "trending-hotspots"]
    static let premiumFunctions = BytspotPremiumMapFunction.allCases
    static let premiumEntitlementPlan = "insider-premium"

    static var premiumFunctionTokens: [String] { premiumFunctions.map(\.rawValue) }

    static func isUnlocked(_ function: BytspotPremiumMapFunction, for membership: BytspotMembership) -> Bool {
        membership.isPremium
    }
}

/// Internal, test-reachable façade over the pure, load-bearing L2 trust gate that
/// otherwise lives on the `private` NativeMapExploreView. Same-file access lets it
/// forward to the view's static gate surface (constants + the two pure predicates)
/// without promoting the whole view — and its many private subtypes — to internal.
/// The AppTests XCTest suite exercises the gate through this façade via
/// `@testable import App`; it adds no logic of its own so there is one authority.
enum NativeProximityGate {
    static var radiusMeters: CLLocationDistance { NativeMapExploreView.verifiedZoneRadiusMeters }
    static var exitMeters: CLLocationDistance { NativeMapExploreView.verifiedZoneExitMeters }
    static var accuracyFloorMeters: CLLocationAccuracy { NativeMapExploreView.verifiedZoneAccuracyFloorMeters }
    static var preStageMeters: CLLocationDistance { NativeMapExploreView.verifiedZonePreStageMeters }
    static var discoveryMeters: CLLocationDistance { NativeMapExploreView.verifiedZoneDiscoveryMeters }

    static func directScanPermitted(
        nearestVerifiedMeters distance: CLLocationDistance?,
        horizontalAccuracy accuracy: CLLocationAccuracy = 0,
        wasInZone: Bool = false
    ) -> Bool {
        NativeMapExploreView.directScanPermitted(
            nearestVerifiedMeters: distance,
            horizontalAccuracy: accuracy,
            wasInZone: wasInZone
        )
    }

    static func descentStage(nearestVerifiedMeters distance: CLLocationDistance?) -> BytspotDescentStage {
        NativeMapExploreView.descentStage(nearestVerifiedMeters: distance)
    }
}

/// Immutable snapshot of every signal the Trust Ladder consults — one signal per
/// rung gate (contracts/native-trust-contract.json). Views assemble this from
/// their sensors/state; they must never compute a trust level themselves.
struct BytspotTrustEvidence {
    var staticDiscoveryReached: Bool        // L1 gate · qr-or-url-seen (or app-level discovery)
    var nearestVerifiedMeters: CLLocationDistance?  // L2 gate · distance to nearest verified zone
    var horizontalAccuracy: CLLocationAccuracy      // L2 gate · fix confidence (CLLocation; < 0 == invalid)
    var wasInZone: Bool                              // L2 gate · Schmitt hysteresis carry-in
    var signedTokenVerified: Bool                    // L3 gate · server-rotating-token-verified
    var nfcCounterVerified: Bool                     // L4 gate · hardware-read-counter

    /// The zero-evidence baseline — reduces to L0 anonymous.
    static let none = BytspotTrustEvidence(
        staticDiscoveryReached: false,
        nearestVerifiedMeters: nil,
        horizontalAccuracy: -1,
        wasInZone: false,
        signedTokenVerified: false,
        nfcCounterVerified: false
    )
}

/// The single authority that turns evidence into a Trust Ladder rung. Every
/// surface (Swift now, Kotlin later) reduces through this one pure function so a
/// trust level can never be invented at a call site. The L2 proximity gate is
/// delegated to the locked `NativeMapExploreView.directScanPermitted` predicate.
enum BytspotTrustEngine {
    /// Pure, total reduction from evidence to the highest satisfied rung.
    /// Cumulative + fail-safe: rung N is reachable only when rung N's gate *and*
    /// every lower rung's gate hold, so trust is monotonic in evidence — adding a
    /// signal can only raise the level, and a missing/invalid signal can only
    /// lower it. Rungs can never be skipped.
    static func reduce(_ e: BytspotTrustEvidence) -> BytspotTrustLevel {
        guard e.staticDiscoveryReached else { return .anonymous }
        guard NativeMapExploreView.directScanPermitted(
            nearestVerifiedMeters: e.nearestVerifiedMeters,
            horizontalAccuracy: e.horizontalAccuracy,
            wasInZone: e.wasInZone
        ) else { return .staticDiscovery }
        guard e.signedTokenVerified else { return .proximate }
        guard e.nfcCounterVerified else { return .signedToken }
        return .nfcCounterVerified
    }
}

final class NativeMapHeadingProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var heading: Double = 0
    @Published private(set) var userLocation: CLLocation?
    private let manager = CLLocationManager()
    private var isStreaming = false
    private var isLocating = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.headingFilter = 2
    }

    func start() {
        guard CLLocationManager.headingAvailable() else { return }
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        guard !isStreaming else { return }
        isStreaming = true
        manager.startUpdatingHeading()
    }

    func stop() {
        guard isStreaming else { return }
        isStreaming = false
        manager.stopUpdatingHeading()
    }

    /// Streams location for the 120 m VERIFIED_ZONE proximity gate
    /// (Trust Ladder L2 · `initiateDirectScan`). Independent of heading follow.
    func startLocating() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        guard !isLocating else { return }
        isLocating = true
        manager.startUpdatingLocation()
    }

    func stopLocating() {
        guard isLocating else { return }
        isLocating = false
        manager.stopUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let value = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        DispatchQueue.main.async { self.heading = value }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        DispatchQueue.main.async { self.userLocation = latest }
    }
}

private struct NativeMapRecenterButton: View {
    let mode: NativeMapRecenterMode
    let size: CGFloat
    var heading: Double = 0

    private var symbolName: String {
        switch mode {
        case .off: return "location"
        case .follow: return "location.fill"
        case .followWithHeading: return "location.north.line.fill"
        }
    }

    private var tint: Color {
        mode == .off ? NativeTheme.textPrimary.opacity(0.78) : NativeTheme.cyan
    }

    private var ringColor: Color {
        switch mode {
        case .off: return NativePolish.strongBorder
        case .follow: return NativeTheme.cyan.opacity(0.45)
        case .followWithHeading: return NativeTheme.cyan.opacity(0.65)
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [NativePolish.mapControlSurface, NativePolish.mapBaseSurface.opacity(0.96)], startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle()
                .fill(mode == .off ? NativeTheme.surfaceHighlight.opacity(0.42) : NativeTheme.cyan.opacity(0.12))
            if mode == .followWithHeading {
                headingWedge
                    .rotationEffect(.degrees(heading))
                    .animation(.easeOut(duration: 0.20), value: heading)
            }
            Image(systemName: symbolName)
                .font(.system(size: 20, weight: .black))
                .foregroundColor(tint)
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(ringColor, lineWidth: mode == .off ? 1.25 : 1.5))
        .clipShape(Circle())
        .shadow(color: mode == .off ? NativeTheme.softShadow : NativeTheme.cyan.opacity(0.20), radius: mode == .off ? 9 : 12, x: 0, y: mode == .off ? 5 : 6)
        .accessibilityLabel(accessibilityText)
        .accessibilityIdentifier("native-map-recenter-button")
    }

    private var headingWedge: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            let radius = min(proxy.size.width, proxy.size.height) / 2
            Path { path in
                path.move(to: center)
                path.addArc(center: center, radius: radius, startAngle: .degrees(-120), endAngle: .degrees(-60), clockwise: false)
                path.closeSubpath()
            }
            .fill(RadialGradient(colors: [NativeTheme.cyan.opacity(0.42), NativeTheme.cyan.opacity(0.0)], center: .center, startRadius: 0, endRadius: radius))
        }
        .allowsHitTesting(false)
    }

    private var accessibilityText: String {
        switch mode {
        case .off: return "Recenter map"
        case .follow: return "Recenter map, following your location"
        case .followWithHeading: return "Recenter map, following your location and heading"
        }
    }
}

enum NativeTrafficIntelFABState { case calm, aware, active }

private struct NativeTrafficIntelFAB: View {
    let state: NativeTrafficIntelFABState
    let size: CGFloat
    @State private var pulse: Bool = false

    var body: some View {
        Image(systemName: "waveform.path.ecg")
            .font(.system(size: 19, weight: .black))
            .foregroundColor(state == .active ? .white : NativeTheme.cyan.opacity(0.92))
            .frame(width: size, height: size)
            .background(background)
            .overlay(Circle().stroke(strokeColor, lineWidth: state == .aware ? 1.5 : 1.25))
            .overlay(awarePulseRing)
            .clipShape(Circle())
            .shadow(color: shadowColor, radius: shadowRadius, x: 0, y: shadowY)
            .onAppear { startPulseIfAware() }
            .onChange(of: state) { _ in startPulseIfAware() }
            .accessibilityLabel(accessibilityText)
            .accessibilityIdentifier("native-map-traffic-intel-fab")
    }

    @ViewBuilder private var background: some View {
        if state == .active {
            Circle().fill(NativeTheme.cyan)
        } else {
            Circle().fill(LinearGradient(colors: [NativePolish.mapControlSurface, NativePolish.mapBaseSurface.opacity(0.96)], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }

    @ViewBuilder private var awarePulseRing: some View {
        if state == .aware {
            Circle()
                .stroke(NativeTheme.cyan.opacity(pulse ? 0.55 : 0.18), lineWidth: pulse ? 2.5 : 1.0)
                .scaleEffect(pulse ? 1.18 : 1.0)
                .opacity(pulse ? 0.0 : 0.8)
                .allowsHitTesting(false)
        }
    }

    private var strokeColor: Color {
        switch state {
        case .active: return Color.white.opacity(0.22)
        case .aware: return NativeTheme.cyan.opacity(0.55)
        case .calm: return NativePolish.strongBorder
        }
    }

    private var shadowColor: Color {
        switch state {
        case .active: return NativeTheme.cyan.opacity(0.30)
        case .aware: return NativeTheme.cyan.opacity(0.18)
        case .calm: return NativeTheme.softShadow
        }
    }

    private var shadowRadius: CGFloat { state == .calm ? 9 : 12 }
    private var shadowY: CGFloat { state == .calm ? 5 : 6 }

    private var accessibilityText: String {
        switch state {
        case .active: return "Traffic intelligence on"
        case .aware: return "Traffic intelligence available — alert nearby"
        case .calm: return "Traffic intelligence off"
        }
    }

    private func startPulseIfAware() {
        guard state == .aware else { pulse = false; return }
        withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { pulse = true }
    }
}

struct NativeCommunityReport: Identifiable, Equatable {
    enum Category: String, CaseIterable, Identifiable {
        case police, construction, incident
        var id: String { rawValue }
        var icon: String {
            switch self {
            case .police: return "shield.lefthalf.filled"
            case .construction: return "wrench.and.screwdriver.fill"
            case .incident: return "exclamationmark.triangle.fill"
            }
        }
        var label: String {
            switch self {
            case .police: return "Police / Speed Trap"
            case .construction: return "Construction"
            case .incident: return "Incident"
            }
        }
        var accent: Color {
            switch self {
            case .police: return NativeTheme.cyan
            case .construction: return NativeTheme.blackAmber
            case .incident: return NativeTheme.pink
            }
        }
    }

    let id: String
    let category: Category
    let title: String
    let distance: String
    let distanceMiles: Double
    let minutesAgo: Int
    let x: CGFloat
    let y: CGFloat

    var ageLabel: String {
        if minutesAgo <= 0 { return "just now" }
        if minutesAgo < 60 { return "\(minutesAgo)m ago" }
        return "\(minutesAgo / 60)h ago"
    }

    static let samples: [NativeCommunityReport] = [
        NativeCommunityReport(id: "cr-1", category: .police, title: "Speed trap reported", distance: "0.4 mi · 10th St", distanceMiles: 0.4, minutesAgo: 4, x: 0.62, y: 0.42),
        NativeCommunityReport(id: "cr-2", category: .construction, title: "Lane closure", distance: "0.8 mi · Peachtree", distanceMiles: 0.8, minutesAgo: 22, x: 0.34, y: 0.62),
        NativeCommunityReport(id: "cr-3", category: .incident, title: "Fender bender · shoulder", distance: "1.1 mi · I-75 N", distanceMiles: 1.1, minutesAgo: 7, x: 0.71, y: 0.74)
    ]
}

private struct NativeCommunityReportMarker: View {
    let report: NativeCommunityReport

    var body: some View {
        Image(systemName: report.category.icon)
            .font(.system(size: 12, weight: .black))
            .foregroundColor(report.category.accent)
            .frame(width: 28, height: 28)
            .background(Circle().fill(NativePolish.mapControlSurface))
            .overlay(Circle().stroke(report.category.accent.opacity(0.55), lineWidth: 1.25))
            .clipShape(Circle())
            .shadow(color: Color.black.opacity(0.32), radius: 4, x: 0, y: 2)
            .accessibilityLabel("\(report.category.label) reported \(report.ageLabel)")
    }
}

private struct NativeCommunityReportsCard: View {
    let reports: [NativeCommunityReport]
    let onReport: () -> Void

    private var grouped: [(NativeCommunityReport.Category, Int, NativeCommunityReport?)] {
        NativeCommunityReport.Category.allCases.map { category in
            let matches = reports.filter { $0.category == category }
            return (category, matches.count, matches.first)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 17, weight: .black))
                    .foregroundColor(NativeTheme.cyan)
                    .frame(width: 38, height: 38)
                    .background(NativeTheme.cyan.opacity(0.13))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Community Reports")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary)
                    Text("\(reports.count) active · within 1 mi")
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                }
                Spacer()
            }
            VStack(spacing: 8) {
                ForEach(grouped, id: \.0) { entry in
                    NativeCommunityReportsCardRow(category: entry.0, count: entry.1, mostRecent: entry.2)
                }
            }
            Button(action: onReport) {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 15, weight: .black))
                    Text("Report what you see")
                        .font(.system(size: 14, weight: .black))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(NativeTheme.textSecondary)
                }
                .foregroundColor(NativeTheme.textPrimary)
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(NativeTheme.selectedControlSurface)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-map-community-report-trigger")
        }
        .padding(16)
        .background(NativePolish.elevatedSurface)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: NativeTheme.softShadow, radius: 12, x: 0, y: 7)
        .accessibilityIdentifier("native-map-community-reports-card")
    }
}

private struct NativeCommunityReportsCardRow: View {
    let category: NativeCommunityReport.Category
    let count: Int
    let mostRecent: NativeCommunityReport?

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: category.icon)
                .font(.system(size: 14, weight: .black))
                .foregroundColor(count > 0 ? category.accent : NativeTheme.textTertiary)
                .frame(width: 32, height: 32)
                .background((count > 0 ? category.accent : NativeTheme.textTertiary).opacity(0.12))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(category.label)
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(NativeTheme.textPrimary)
                Text(mostRecent.map { "\($0.distance) · \($0.ageLabel)" } ?? "No reports nearby")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(NativeTheme.textSecondary)
                    .lineLimit(1)
            }
            Spacer()
            Text(count > 0 ? "\(count)" : "—")
                .font(.system(size: 12, weight: .black))
                .foregroundColor(count > 0 ? .black : NativeTheme.textTertiary)
                .frame(minWidth: 24, minHeight: 22)
                .padding(.horizontal, 7)
                .background(count > 0 ? category.accent : NativeTheme.selectedControlSurface)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(NativeTheme.selectedControlSurface.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeCommunityReportPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSubmit: (NativeCommunityReport.Category) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Report what you see")
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                    Text("Two taps to alert nearby drivers.")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(NativeTheme.textSecondary)
                }
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(NativeTheme.textPrimary)
                        .frame(width: 36, height: 36)
                        .background(NativeTheme.selectedControlSurface)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 10) {
                ForEach(NativeCommunityReport.Category.allCases) { category in
                    Button(action: { onSubmit(category); dismiss() }) {
                        VStack(spacing: 9) {
                            Image(systemName: category.icon)
                                .font(.system(size: 22, weight: .black))
                                .foregroundColor(category.accent)
                                .frame(width: 44, height: 44)
                                .background(category.accent.opacity(0.16))
                                .clipShape(Circle())
                            Text(category.label)
                                .font(.system(size: 12, weight: .black))
                                .foregroundColor(NativeTheme.textPrimary)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .minimumScaleFactor(0.82)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(NativePolish.elevatedSurface)
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(category.accent.opacity(0.30), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("native-map-community-report-option-\(category.rawValue)")
                }
            }
            Text("Location auto-set from current map view. Reports stay anonymous.")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(NativeTheme.textTertiary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativePolish.mapBaseSurface.ignoresSafeArea())
        .accessibilityIdentifier("native-map-community-report-picker")
    }
}

private struct NativeCTA: View {
    let title: String; let color: Color; let foreground: Color
    var body: some View { Text(title).font(.system(size: 15, weight: .black)).foregroundColor(foreground).frame(maxWidth: .infinity).frame(minHeight: NativePolish.controlSize).background(color).overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)).shadow(color: color.opacity(0.16), radius: 10, x: 0, y: 6) }
}

private struct NativeChatBubble: View {
    let text: String; let isUser: Bool
    var body: some View { Text(text).font(.system(size: 14, weight: .bold)).foregroundColor(isUser ? .black : .white).padding(13).frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading).background(isUser ? NativeTheme.cyan : NativeTheme.panel).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)) }
}

private enum NativeMapPinKind { case partner, parking, access
    var icon: String { self == .partner ? "checkmark.seal.fill" : self == .parking ? "parkingsign.circle.fill" : "key.fill" }
    var emoji: String { self == .partner ? "⚡" : self == .parking ? "P" : "🛍" }
}

private struct NativeMapPin: Identifiable {
    let id: String; let title: String; let subtitle: String; let distance: String; let coordinate: CLLocationCoordinate2D; let color: Color; let kind: NativeMapPinKind; let crowdLevel: Int?
    static let samples = [
        NativeMapPin(id: "partner-colony", title: "Colony Square", subtitle: "Verified Tap Zone · Dining + access", distance: "0.4 mi", coordinate: CLLocationCoordinate2D(latitude: 33.7878, longitude: -84.3832), color: NativeTheme.cyan, kind: .partner, crowdLevel: 2),
        NativeMapPin(id: "parking-midtown", title: "Midtown Smart Parking", subtitle: "18 spots · covered · $8/hr", distance: "0.6 mi", coordinate: CLLocationCoordinate2D(latitude: 33.790, longitude: -84.389), color: NativeTheme.emerald, kind: .parking, crowdLevel: 1),
        NativeMapPin(id: "access-arts", title: "Arts Center Access", subtitle: "Patch-ready entry and concierge help", distance: "0.8 mi", coordinate: CLLocationCoordinate2D(latitude: 33.779, longitude: -84.376), color: NativeTheme.pink, kind: .access, crowdLevel: 3)
    ]

    init(id: String, title: String, subtitle: String, distance: String, coordinate: CLLocationCoordinate2D, color: Color, kind: NativeMapPinKind, crowdLevel: Int?) {
        self.id = id; self.title = title; self.subtitle = subtitle; self.distance = distance; self.coordinate = coordinate; self.color = color; self.kind = kind; self.crowdLevel = crowdLevel
    }

    init(venue: NativeVenueSummary) {
        let isParking = venue.discoverType == "parking" || venue.parking.totalAvailable > 0 && venue.verifiedPatchId == nil
        let kind: NativeMapPinKind = venue.verifiedPatchId != nil ? .partner : isParking ? .parking : .access
        let subtitle = venue.verifiedPatchId != nil ? "Verified Tap Zone · \(venue.crowd?.label ?? "Open")" : "\(venue.parking.totalAvailable) spots · \(venue.parking.priceLabel)"
        self.init(id: venue.id, title: venue.name, subtitle: subtitle, distance: venue.distance, coordinate: CLLocationCoordinate2D(latitude: venue.latitude, longitude: venue.longitude), color: kind == .parking ? NativeTheme.emerald : kind == .partner ? NativeTheme.cyan : NativeTheme.pink, kind: kind, crowdLevel: venue.crowd?.level)
    }
}

private struct NativeMapMarker: View {
    let pin: NativeMapPin; let isSelected: Bool
    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle().stroke(pin.color.opacity(isSelected ? 0.54 : 0.28), lineWidth: 2).frame(width: isSelected ? 42 : 34, height: isSelected ? 42 : 34).blur(radius: isSelected ? 1.5 : 0)
                Image(systemName: pin.kind.icon)
                    .font(.system(size: isSelected ? 32 : 26, weight: .black))
                    .foregroundColor(pin.color)
                    .shadow(color: pin.color.opacity(0.52), radius: 12)
            }
            Text(pin.title)
                .font(.system(size: 10, weight: .black))
                .foregroundColor(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(Color(hex: NativeMapExploreView.tabModeBaseHex).opacity(0.86))
                .overlay(Capsule().stroke(Color.white.opacity(0.28), lineWidth: 1))
                .clipShape(Capsule())
        }
    }
}

private struct BytspotNativeBackground: View {
    let tier: BytspotTier
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            BytspotTheme.background
            RadialGradient(colors: [BytspotTheme.purple.opacity(0.20), .clear], center: .top, startRadius: 20, endRadius: 360)
                .opacity(colorScheme == .dark ? 0.30 : 0.12)
            RadialGradient(colors: [BytspotTheme.cyan.opacity(0.18), .clear], center: .bottomTrailing, startRadius: 20, endRadius: 340)
                .opacity(colorScheme == .dark ? 0.30 : 0.14)
            RadialGradient(colors: [BytspotTheme.magenta.opacity(0.15), .clear], center: .leading, startRadius: 20, endRadius: 320)
                .opacity(colorScheme == .dark ? 0.30 : 0.10)
            BytspotTheme.tierHeroWash(for: tier).opacity(colorScheme == .dark ? 0.72 : 0.16)
        }
    }
}

private enum BytspotTheme {
    // Source: src/styles/globals.css + src/App.tsx ambient background.
    static let background = Color.adaptive(lightHex: 0xF5F7FA, darkHex: 0x000000)
    static let card = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x1C1C1E, lightAlpha: 0.78, darkAlpha: 0.95)
    static let panel = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x1C1C1E, lightAlpha: 0.86, darkAlpha: 0.90)
    static let tabBarBackground = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x1C1C1E, lightAlpha: 0.94, darkAlpha: 0.90)
    static let textPrimary = Color.adaptive(lightHex: 0x050507, darkHex: 0xFFFFFF, lightAlpha: 0.94, darkAlpha: 1.0)
    static let textSecondary = Color.adaptive(lightHex: 0x0F172A, darkHex: 0xFFFFFF, lightAlpha: 0.70, darkAlpha: 0.70)
    static let textTertiary = Color.adaptive(lightHex: 0x334155, darkHex: 0xFFFFFF, lightAlpha: 0.52, darkAlpha: 0.52)
    static let inverseText = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x000000)
    static let surfaceStroke = Color.adaptive(lightHex: 0x000000, darkHex: 0xFFFFFF, lightAlpha: 0.13, darkAlpha: 0.12)
    static let strongSurfaceStroke = Color.adaptive(lightHex: 0x000000, darkHex: 0xFFFFFF, lightAlpha: 0.18, darkAlpha: 0.24)
    static let selectedControlSurface = Color.adaptive(lightHex: 0x111827, darkHex: 0xFFFFFF, lightAlpha: 0.08, darkAlpha: 0.25)
    static let surfaceHighlight = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.50, darkAlpha: 0.045)
    static let panelShadow = Color.adaptive(lightHex: 0x0F172A, darkHex: 0x000000, lightAlpha: 0.12, darkAlpha: 0.40)
    static let softShadow = Color.adaptive(lightHex: 0x0F172A, darkHex: 0x000000, lightAlpha: 0.09, darkAlpha: 0.22)
    static let textShadow = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x000000, lightAlpha: 0.0, darkAlpha: 0.62)

    // Brand colors. Source: src/styles/globals.css and src/BRAND_COLORS.md.
    static let cyanHex = 0x00BFFF
    static let purpleHex = 0xA855F7
    static let pinkHex = 0xD946EF
    static let magentaHex = 0xFF00FF
    static let orangeHex = 0xFF4500
    static let blackAmberHex = 0xD97706
    static let emeraldHex = 0x10B981

    static let cyan = Color(hex: cyanHex)
    static let purple = Color(hex: purpleHex)
    static let pink = Color(hex: pinkHex)
    static let magenta = Color(hex: magentaHex)
    static let orange = Color(hex: orangeHex)

    // Explicit tier colors from VirtualPatchScannerSheet hero/tier profiles.
    static let blackAmber = Color(hex: blackAmberHex)
    static let emerald = Color(hex: emeraldHex)
    static let slate950 = Color(hex: 0x020617)
    static let slate900 = Color(hex: 0x0F172A)
    static let green900 = Color(hex: 0x064E3B)
    static let purple900 = Color(hex: 0x581C87)

    // Source: src/styles/globals.css spacing/radius/tap-target/SF Pro scale.
    static let spacing1: CGFloat = 8
    static let spacing2: CGFloat = 16
    static let spacing3: CGFloat = 24
    static let spacing4: CGFloat = 32
    static let tapTargetMin: CGFloat = 44
    static let caption2Size: CGFloat = 11
    static let bodySize: CGFloat = 17
    static let headlineSize: CGFloat = 17
    static let title1Size: CGFloat = 28
    static let largeTitleSize: CGFloat = 34

    // Source: src/utils/patchTiers.ts fallback = platinum.
    static var defaultTier: BytspotTier {
        let raw = ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_TIER"]?.lowercased()
        return defaultTier(from: raw)
    }

    static func defaultTier(from rawValue: String?) -> BytspotTier {
        guard let normalized = rawValue?.lowercased() else { return .platinum }
        return BytspotTier(rawValue: normalized) ?? .platinum
    }

    static func accent(for tier: BytspotTier) -> Color {
        Color(hex: accentHex(for: tier))
    }

    static func accentHex(for tier: BytspotTier) -> Int {
        switch tier {
        case .black: return blackAmberHex
        case .platinum: return cyanHex
        case .green: return emeraldHex
        }
    }

    static func secondaryAccent(for tier: BytspotTier) -> Color {
        Color(hex: secondaryAccentHex(for: tier))
    }

    static func secondaryAccentHex(for tier: BytspotTier) -> Int {
        switch tier {
        case .black: return magentaHex
        case .platinum: return purpleHex
        case .green: return cyanHex
        }
    }

    static func tierHeroWash(for tier: BytspotTier) -> LinearGradient {
        // Stops mirror VirtualPatchScannerSheet.appClipTierProfile heroBg values.
        switch tier {
        case .black:
            return LinearGradient(colors: [Color(hex: 0x0B0B10).opacity(0.99), purple900.opacity(0.62), slate950.opacity(0.99)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .platinum:
            return LinearGradient(colors: [slate900.opacity(0.98), purple900.opacity(0.72), slate950.opacity(0.98)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .green:
            return LinearGradient(colors: [green900.opacity(0.90), slate900.opacity(0.98), slate950.opacity(0.99)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    static func brandGradient() -> LinearGradient {
        LinearGradient(colors: [cyan, magenta, orange], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

private typealias NativeTheme = BytspotTheme

private extension Color {
    static func adaptive(lightHex: Int, darkHex: Int, lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
        Color(UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? darkHex : lightHex
            let alpha = traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: CGFloat(alpha)
            )
        })
    }

    init(hex: Int, alpha: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

private func nativeImpactLight() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
}

#if DEBUG
/// DEBUG-only guard for the native shell design-system contract.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeShellThemeSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        assertTabContract()
        assertDefaultTierFallback()
        assertTierAccentTokens()
        assertLayoutTokens()
    }

    private static func assertTabContract() {
        let tabs = BytspotNativeTab.allCases
        precondition(tabs.map(\.title) == ["Home", "Discover", "Map", "Concierge"], "NativeShellThemeSelfTests: tab titles drifted from React entry navigation.")
        precondition(tabs.map(\.icon) == ["house.fill", "safari.fill", "map.fill", "sparkles"], "NativeShellThemeSelfTests: tab SF Symbols drifted from migration mapping.")
    }

    private static func assertDefaultTierFallback() {
        precondition(BytspotTheme.defaultTier(from: nil) == .platinum, "NativeShellThemeSelfTests: nil default tier should be platinum.")
        precondition(BytspotTheme.defaultTier(from: "unknown") == .platinum, "NativeShellThemeSelfTests: invalid default tier should be platinum.")
        precondition(BytspotTheme.defaultTier(from: "BLACK") == .black, "NativeShellThemeSelfTests: uppercase tier normalization drifted.")
    }

    private static func assertTierAccentTokens() {
        precondition(BytspotTheme.accentHex(for: .black) == 0xD97706, "NativeShellThemeSelfTests: Black accent token drifted.")
        precondition(BytspotTheme.accentHex(for: .platinum) == 0x00BFFF, "NativeShellThemeSelfTests: Platinum accent token drifted.")
        precondition(BytspotTheme.accentHex(for: .green) == 0x10B981, "NativeShellThemeSelfTests: Green accent token drifted.")
        precondition(BytspotTheme.secondaryAccentHex(for: .black) == 0xFF00FF, "NativeShellThemeSelfTests: Black secondary accent drifted.")
        precondition(BytspotTheme.secondaryAccentHex(for: .platinum) == 0xA855F7, "NativeShellThemeSelfTests: Platinum secondary accent drifted.")
    }

    private static func assertLayoutTokens() {
        precondition(BytspotTheme.spacing1 == 8 && BytspotTheme.spacing4 == 32, "NativeShellThemeSelfTests: 8pt spacing contract drifted.")
        precondition(BytspotTheme.tapTargetMin == 44, "NativeShellThemeSelfTests: minimum tap target drifted.")
        precondition(BytspotTheme.caption2Size == 11 && BytspotTheme.largeTitleSize == 34, "NativeShellThemeSelfTests: SF typography scale drifted.")
        precondition(NativePolish.screenPadding == 20 && NativePolish.sectionSpacing == 24 && NativePolish.controlSize == 48, "NativeShellThemeSelfTests: final native polish layout tokens drifted.")
        precondition(NativePolish.cardRadius == 24 && NativePolish.heroRadius == 30 && NativePolish.bottomBarHeight == 72, "NativeShellThemeSelfTests: final native polish radius/bar metrics drifted.")
        precondition(NativePolish.bottomBarRadius == 24 && NativePolish.bottomTabActiveRadius == 14, "NativeShellThemeSelfTests: React bottom nav radius contract drifted.")
        precondition(NativePolish.bottomBarHorizontalPadding == 16 && NativePolish.bottomBarInnerHorizontalPadding == 4 && NativePolish.bottomBarInnerVerticalPadding == 8, "NativeShellThemeSelfTests: React bottom nav spacing contract drifted.")
        precondition(NativePolish.bottomTabItemHeight == 56 && NativePolish.bottomBarBottomPadding == 8, "NativeShellThemeSelfTests: native bottom nav safe-area fit drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for the native Home parity contract against React Home.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeHomeParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        let actions = NativeHomeDashboardView.quickActionSpecs
        precondition(actions.map(\.title) == ["Find Parking", "Nearby", "Book a Ride", "Explore Venues"], "NativeHomeParitySelfTests: quick-action titles drifted from React Home.")
        precondition(actions.map(\.subtitle) == ["Live spots near you", "What's around", "Uber & Lyft", "Discover"], "NativeHomeParitySelfTests: quick-action subtitles drifted from React Home.")
        precondition(actions.map(\.icon) == ["mappin.and.ellipse", "location.north.line.fill", "star.fill", "sparkles"], "NativeHomeParitySelfTests: quick-action SF Symbols drifted.")
        precondition(actions[0].target == .nativeTab(.map) && actions[1].target == .nativeTab(.map), "NativeHomeParitySelfTests: parking/nearby must route to native Map tab.")
        precondition(actions[2].target == .hybrid(.map), "NativeHomeParitySelfTests: Book a Ride must keep production React ride fallback until native ride modal parity.")
        precondition(actions[3].target == .nativeTab(.discover), "NativeHomeParitySelfTests: Explore Venues must route to native Discover tab.")
        precondition(NativeHomeDashboardView.recommendationTitles == ["Reserved parking near you", "Broni Home Taste", "GH Akwaaba Pass"], "NativeHomeParitySelfTests: native Home recommendation rail drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native Map parity anchors against React MapSection.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeMapParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativeMapExploreView.modeTitles == ["Smart Parking", "Nearby", "Tap Zones", "Route"], "NativeMapParitySelfTests: native Map mode chips drifted from React MapSection entry points.")
        precondition(NativeMapExploreView.layerTitles == ["Parking", "Venues", "Tap Zones"], "NativeMapParitySelfTests: native Map layer labels drifted.")
        precondition(NativeMapExploreView.scannerCapabilityLabels == ["QR", "NFC", "App Clip"], "NativeMapParitySelfTests: scanner capability labels drifted.")
        precondition(NativeMapExploreView.tabModeBaseHex == 0x050505 && NativeMapExploreView.tabModePanelHex == 0x080A10 && NativeMapExploreView.tabModeActiveCyanPanelHex == 0x06242B, "NativeMapParitySelfTests: Map tabMode overlay tokens drifted from React MapSection.")
        precondition(NativeMapExploreView.crowdLevelColorHex == [BytspotTheme.emeraldHex, BytspotTheme.cyanHex, BytspotTheme.orangeHex, BytspotTheme.pinkHex], "NativeMapParitySelfTests: Map crowd level color contract drifted.")
        precondition(NativeMapExploreView.accessPinColorHex == BytspotTheme.pinkHex, "NativeMapParitySelfTests: Access pins must use NativeTheme.pink #D946EF.")
        precondition(NativeMapExploreView.searchOverlayCornerRadius == 24 && NativeMapExploreView.rightActionControlSize == 48 && NativeMapExploreView.rightSecondaryActionControlSize == 44, "NativeMapParitySelfTests: Map screenshot-level layout metrics drifted.")
        precondition(NativePolish.mapSearchLeadingInset == 12 && NativePolish.mapSearchTrailingInset == 80 && NativePolish.mapSearchTopInset == 16, "NativeMapParitySelfTests: React MapSearchBar inset contract drifted.")
        precondition(NativePolish.mapActionTopInset == 112 && NativePolish.mapActionTrailingInset == 16 && NativePolish.mapActionStackSpacing == 8, "NativeMapParitySelfTests: React MapActionStack inset contract drifted.")
        precondition(NativePolish.mapSheetHorizontalInset == 12 && NativePolish.mapSheetRadius == 28 && NativePolish.mapSheetCloseSize == 64, "NativeMapParitySelfTests: Map Functions sheet metrics drifted.")
        precondition(NativePolish.mapFunctionButtonHeight == 108 && NativePolish.mapFunctionRowHeight == 96 && NativePolish.mapFunctionRowGap == 8, "NativeMapParitySelfTests: Tesla-Lens Map Functions density metrics drifted.")
        precondition(NativePolish.mapSheetActionHeight == 64 && NativePolish.mapSheetActionRadius == 22 && NativePolish.mapSheetActionGap == 10, "NativeMapParitySelfTests: iconic Map sheet action metrics drifted.")
        precondition(NativePolish.mapParkingPinSize == 32 && NativePolish.mapTapZonePinSize == 40 && NativePolish.mapVenuePinSize == 34, "NativeMapParitySelfTests: React map pin sizing contract drifted.")
        precondition(NativeMapExploreView.showsFloatingTapScanCTA == false, "NativeMapParitySelfTests: floating Tap / Scan viewport CTA must remain hidden.")
        precondition(NativeMapExploreView.tapScanTitle == "Tap / Scan" && NativeMapExploreView.tapScanSubtitle == "Open Virtual Patch", "NativeMapParitySelfTests: contextual Tap / Scan copy drifted from React MapSection.")
        precondition(NativeMapExploreView.functionSheetTitle == "Map Functions" && NativeMapExploreView.emptyTapZoneCopy == "No Partnered Tap Zones nearby yet.", "NativeMapParitySelfTests: Map sheet/no-result copy drifted.")
        // Premium-gated Map Functions matrix (WS-B). Mirrors native-trust-contract.json mapFunctions.
        precondition(BytspotMapFunctionCatalog.premiumFunctionTokens == ["ai-navigation", "spot-radar", "traffic-intelligence"], "NativeMapParitySelfTests: premium Map Function tokens drifted from contract mapFunctions.premium.")
        precondition(BytspotMapFunctionCatalog.freeFunctions == ["smart-parking", "live-venue-data", "trending-hotspots"], "NativeMapParitySelfTests: free Map Function tokens drifted from contract mapFunctions.free.")
        precondition(Set(BytspotMapFunctionCatalog.freeFunctions).isDisjoint(with: Set(BytspotMapFunctionCatalog.premiumFunctionTokens)), "NativeMapParitySelfTests: a Map Function must not be both free and premium.")
        precondition(BytspotMapFunctionCatalog.premiumEntitlementPlan == "insider-premium", "NativeMapParitySelfTests: premium entitlement plan drifted from contract mapFunctions.premiumEntitlement.")
        precondition(BytspotPremiumMapFunction.allCases.allSatisfy { !BytspotMapFunctionCatalog.isUnlocked($0, for: .free) && BytspotMapFunctionCatalog.isUnlocked($0, for: .premium) }, "NativeMapParitySelfTests: premium functions must lock for .free and unlock only for .premium.")
        let pins = NativeMapPin.samples
        precondition(pins.contains { $0.kind == .parking }, "NativeMapParitySelfTests: Smart Parking sample pin missing.")
        precondition(pins.contains { $0.kind == .partner }, "NativeMapParitySelfTests: partnered tap-zone sample pin missing.")
        precondition(pins.contains { $0.kind == .access }, "NativeMapParitySelfTests: access sample pin missing.")
        precondition(NativeMapExploreView.trafficIntelProximityMiles == 1.0, "NativeMapParitySelfTests: Traffic Intel Aware proximity radius drifted from 1.0 mi.")
        precondition(NativeMapExploreView.trafficIntelProximityFreshnessMinutes == 30, "NativeMapParitySelfTests: Traffic Intel Aware freshness window drifted from 30 minutes.")
        precondition(NativeMapExploreView.trafficIntelAutoEnvironmentKey == "BYT_NATIVE_TRAFFIC_AUTO", "NativeMapParitySelfTests: Traffic Intel auto-open env key drifted from BYT_NATIVE_TRAFFIC_AUTO.")
        let reports = NativeCommunityReport.samples
        precondition(reports.contains { $0.category == .police }, "NativeMapParitySelfTests: Community Reports must include a Police/Speed Trap sample.")
        precondition(reports.contains { $0.category == .construction }, "NativeMapParitySelfTests: Community Reports must include a Construction sample.")
        precondition(reports.contains { $0.category == .incident }, "NativeMapParitySelfTests: Community Reports must include an Incident sample.")
        precondition(reports.contains { $0.distanceMiles <= NativeMapExploreView.trafficIntelProximityMiles && $0.minutesAgo <= NativeMapExploreView.trafficIntelProximityFreshnessMinutes }, "NativeMapParitySelfTests: at least one Community Report sample must satisfy Aware proximity/freshness so the FAB pulse is exercisable.")
        precondition(NativeCommunityReport.Category.allCases.count == 3, "NativeMapParitySelfTests: Community Report categories must remain the 3 driver-safety buckets (police, construction, incident).")
        let recenterModes: [NativeMapRecenterMode] = [.off, .follow, .followWithHeading]
        precondition(recenterModes.count == 3, "NativeMapParitySelfTests: NativeMapRecenterMode must remain the Apple-Maps-parity tri-state (off, follow, followWithHeading).")
        precondition({ if case .off = NativeMapRecenterMode.off { return true } else { return false } }(), "NativeMapParitySelfTests: NativeMapRecenterMode.off must remain the resting state.")
        precondition({ if case .followWithHeading = NativeMapRecenterMode.followWithHeading { return true } else { return false } }(), "NativeMapParitySelfTests: NativeMapRecenterMode.followWithHeading must remain the compass-heading state.")
        precondition(BytspotTier.allCases == [.black, .platinum, .green], "NativeMapParitySelfTests: BytspotTier order must remain Black > Platinum > Green for partner peek card tier badge.")
        precondition(BytspotTheme.accentHex(for: .black) == BytspotTheme.blackAmberHex && BytspotTheme.accentHex(for: .platinum) == BytspotTheme.cyanHex && BytspotTheme.accentHex(for: .green) == BytspotTheme.emeraldHex, "NativeMapParitySelfTests: tier accent hex contract drifted (Black=blackAmber, Platinum=cyan, Green=emerald).")
        precondition(NativeMapExploreView.partnerCardVerifiedLabel == "Verified Partner", "NativeMapParitySelfTests: partner peek card verified label drifted.")
        precondition(NativeMapExploreView.partnerCardServiceSectionLabel == "Book at this venue", "NativeMapParitySelfTests: partner peek card service section label drifted.")
        precondition(NativeMapExploreView.partnerCardServiceTiles == ["Reserve", "Valet", "Concierge", "See all"], "NativeMapParitySelfTests: partner peek card service tiles drifted.")
        precondition(NativeMapExploreView.partnerCardServiceTileCap == 4 && NativeMapExploreView.partnerCardServiceTiles.count == NativeMapExploreView.partnerCardServiceTileCap, "NativeMapParitySelfTests: partner peek card must enforce a 4-tile services cap.")
        precondition(NativeMapExploreView.partnerCardPatchPairedLabel == "Patch paired", "NativeMapParitySelfTests: 'Patch paired' literal drifted from the physidigital vocabulary contract.")
        precondition(NativeMapExploreView.partnerCardPairPromptLabel == "Tap a patch to unlock", "NativeMapParitySelfTests: unpaired prompt literal drifted from the physidigital vocabulary contract.")
        precondition(NativeMapExploreView.partnerLensEnvironmentKey == "BYT_NATIVE_MAP_PARTNER_LENS", "NativeMapParitySelfTests: BYT hex partner-lens env key drifted.")
        precondition(NativeMapExploreView.pairedPatchEnvironmentKey == "BYT_NATIVE_MAP_PATCH_PAIRED", "NativeMapParitySelfTests: paired-patch preview env key drifted.")
        precondition(NativeMapExploreView.selectedPinEnvironmentKey == "BYT_NATIVE_MAP_SELECT_PIN", "NativeMapParitySelfTests: selected-pin preview env key drifted.")
        precondition(NativePatchPairingStore.freshnessMinutes == NativeMapExploreView.trafficIntelProximityFreshnessMinutes, "NativeMapParitySelfTests: patch-pairing freshness window must match Traffic Intel (30-minute parity).")
        precondition(NativePatchPairingStore.freshnessMinutes == 30, "NativeMapParitySelfTests: patch-pairing freshness window must remain 30 minutes.")
        precondition(NativeMapExploreView.nonPartnerCardVerdictLabels == ["Plenty of Space", "Filling Up", "Likely Busy", "Likely Full"], "NativeMapParitySelfTests: non-partner verdict labels drifted from the simplex verdict-pill contract.")
        precondition(NativeMapExploreView.nonPartnerCardPrimaryLabel == "Navigate", "NativeMapParitySelfTests: non-partner card primary CTA must remain 'Navigate'.")
        precondition(NativeMapExploreView.nonPartnerCardSecondaryLabels == ["Save", "Concierge", "Details"], "NativeMapParitySelfTests: non-partner card secondary actions drifted from the lean 3-button row.")
        precondition(NativeMapExploreView.verifiedZoneRadiusMeters == 120, "NativeMapParitySelfTests: VERIFIED_ZONE_RADIUS proximity gate drifted from React MapSection 120 m.")
        precondition(NativeMapExploreView.proximityOverrideEnvironmentKey == "BYT_NATIVE_MAP_PROXIMITY_METERS", "NativeMapParitySelfTests: proximity simulator override env key drifted.")
        precondition(BytspotTrustLevel.allCases.map(\.rawValue) == [0, 1, 2, 3, 4], "NativeMapParitySelfTests: Trust Ladder rung order drifted from native-trust-contract.json.")
        precondition(BytspotTrustCapability.initiateDirectScan.requiredLevel == .proximate, "NativeMapParitySelfTests: initiateDirectScan must require Trust Ladder L2 (proximate / within 120 m).")
        precondition(BytspotTrustCapability.saveToWallet.requiredLevel == .staticDiscovery && BytspotTrustCapability.createCheckoutHold.requiredLevel == .signedToken && BytspotTrustCapability.burnOneTimeAccess.requiredLevel == .nfcCounterVerified, "NativeMapParitySelfTests: trust capability matrix drifted from native-trust-contract.json.")
        // WS-A #4 — no-irreversible-capability-≤-L2. Every capability whose effect
        // can't be undone must require trust strictly ABOVE L2 (proximate), so
        // physical proximity (or a spoofed fix that satisfies the L2 gate) can
        // never trigger an irreversible action. Mirrors contract invariants.
        precondition(Set(BytspotTrustCapability.allCases.filter(\.isIrreversible)) == [.createCheckoutHold, .burnOneTimeAccess], "NativeMapParitySelfTests: irreversible capability set drifted from native-trust-contract.json invariants.irreversibleCapabilities.")
        precondition(BytspotTrustCapability.allCases.filter(\.isIrreversible).allSatisfy { $0.requiredLevel > .proximate }, "NativeMapParitySelfTests: an irreversible capability is reachable at or below L2 (proximate) — irreversible actions must require trust above physical proximity.")
        // Load-bearing gate→action binding: the direct-scan handoff must be denied
        // outside the 120 m zone (and when distance is unknown) and permitted only
        // inside it. Locks the L2 gate so it cannot silently regress to cosmetic.
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: nil) == false, "NativeMapParitySelfTests: direct scan must be denied when proximity is unknown.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: NativeMapExploreView.verifiedZoneRadiusMeters + 1) == false, "NativeMapParitySelfTests: direct scan must be denied beyond the 120 m VERIFIED_ZONE.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: NativeMapExploreView.verifiedZoneRadiusMeters) == true, "NativeMapParitySelfTests: direct scan must be permitted at the 120 m VERIFIED_ZONE boundary.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: 0) == true, "NativeMapParitySelfTests: direct scan must be permitted inside the 120 m VERIFIED_ZONE.")
        // L2 robustness margins must match native-trust-contract.json trustLadder[2].gate.
        precondition(NativeMapExploreView.verifiedZoneExitMeters == 135, "NativeMapParitySelfTests: L2 hysteresis release radius drifted from contract exitMeters (120 + 15).")
        precondition(NativeMapExploreView.verifiedZoneAccuracyFloorMeters == 65, "NativeMapParitySelfTests: L2 accuracy floor drifted from contract accuracyFloorMeters.")
        precondition(NativeMapExploreView.verifiedZoneExitMeters > NativeMapExploreView.verifiedZoneRadiusMeters, "NativeMapParitySelfTests: Schmitt release radius must be wider than the arm radius.")
        // Accuracy fusion: a fix noisier than the floor (or invalid, < 0) is
        // fail-safe denied even at zero distance.
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: NativeMapExploreView.verifiedZoneAccuracyFloorMeters) == true, "NativeMapParitySelfTests: direct scan must be permitted at the accuracy floor.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: NativeMapExploreView.verifiedZoneAccuracyFloorMeters + 1) == false, "NativeMapParitySelfTests: direct scan must be denied for a fix noisier than the accuracy floor.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: 0, horizontalAccuracy: -1) == false, "NativeMapParitySelfTests: direct scan must be denied for an invalid (negative-accuracy) fix.")
        // Schmitt hysteresis: between the arm and release radii the decision must
        // depend on the prior in/out state so the gate can't oscillate.
        let between = NativeMapExploreView.verifiedZoneRadiusMeters + 5
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: between, wasInZone: false) == false, "NativeMapParitySelfTests: a fix past the arm radius must not arm L2 when previously out of zone.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: between, wasInZone: true) == true, "NativeMapParitySelfTests: a fix inside the release radius must hold L2 when previously in zone.")
        precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: NativeMapExploreView.verifiedZoneExitMeters + 1, wasInZone: true) == false, "NativeMapParitySelfTests: a fix past the release radius must drop L2 even when previously in zone.")
        assertTrustReducer()
        assertDescentRings()
    }

    /// Property tests for BytspotTrustEngine.reduce — the single trust authority.
    /// Locks fail-safe (missing/invalid signals can only lower trust), no-rung-skip
    /// (cumulative ladder), and monotonicity (each added gate raises exactly one rung).
    private static func assertTrustReducer() {
        let inZone = NativeMapExploreView.verifiedZoneRadiusMeters - 10
        let outOfZone: CLLocationDistance = 9_999
        func evidence(
            discovery: Bool = true,
            meters: CLLocationDistance? = nil,
            accuracy: CLLocationAccuracy = 0,
            wasInZone: Bool = false,
            token: Bool = false,
            nfc: Bool = false
        ) -> BytspotTrustEvidence {
            BytspotTrustEvidence(staticDiscoveryReached: discovery, nearestVerifiedMeters: meters, horizontalAccuracy: accuracy, wasInZone: wasInZone, signedTokenVerified: token, nfcCounterVerified: nfc)
        }

        // Fail-safe: zero evidence pins L0; rungs can't be skipped from below.
        precondition(BytspotTrustEngine.reduce(.none) == .anonymous, "NativeMapParitySelfTests: empty evidence must reduce to L0 anonymous.")
        precondition(BytspotTrustEngine.reduce(evidence(discovery: false, meters: 0, token: true, nfc: true)) == .anonymous, "NativeMapParitySelfTests: without static discovery the reducer must pin L0 even with token + NFC.")

        // L2 is fail-safe on missing/invalid location even once discovery holds.
        precondition(BytspotTrustEngine.reduce(evidence(meters: nil)) == .staticDiscovery, "NativeMapParitySelfTests: unknown distance must cap trust at L1.")
        precondition(BytspotTrustEngine.reduce(evidence(meters: 0, accuracy: -1)) == .staticDiscovery, "NativeMapParitySelfTests: an invalid (noisy) fix must cap trust at L1 even at 0 m.")

        // No-skip above L2: a token can't bypass proximity; NFC can't bypass token.
        precondition(BytspotTrustEngine.reduce(evidence(meters: outOfZone, token: true, nfc: true)) == .staticDiscovery, "NativeMapParitySelfTests: a signed token cannot skip the proximity rung.")
        precondition(BytspotTrustEngine.reduce(evidence(meters: inZone, nfc: true)) == .proximate, "NativeMapParitySelfTests: an NFC counter cannot skip the signed-token rung.")

        // Monotonicity: enabling each gate in ladder order yields strictly rising rungs.
        let ladder: [BytspotTrustLevel] = [
            BytspotTrustEngine.reduce(evidence(meters: outOfZone)),
            BytspotTrustEngine.reduce(evidence(meters: inZone)),
            BytspotTrustEngine.reduce(evidence(meters: inZone, token: true)),
            BytspotTrustEngine.reduce(evidence(meters: inZone, token: true, nfc: true)),
        ]
        precondition(ladder == [.staticDiscovery, .proximate, .signedToken, .nfcCounterVerified], "NativeMapParitySelfTests: the trust reducer must ascend one rung per added gate.")
        precondition(zip(ladder, ladder.dropFirst()).allSatisfy { $0 < $1 }, "NativeMapParitySelfTests: the trust reducer must be strictly monotonic as evidence accrues.")

        // The reducer's L2 rung must agree exactly with the locked directScanPermitted gate.
        precondition((BytspotTrustEngine.reduce(evidence(meters: inZone)) >= .proximate) == NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: inZone), "NativeMapParitySelfTests: the reducer's L2 rung must match the directScanPermitted gate.")
    }

    /// Property tests for the advisory descent rings. Locks the ring constants +
    /// strict nesting (discovery ⊃ preStage ⊃ arm), the classification boundaries,
    /// and the load-bearing invariant for WS-A #3: crossing a ring grants NO trust
    /// — only `.armed` coincides with L2, and even there directScanPermitted is the
    /// sole authority. Mirrors native-trust-contract.json trustLadder[2].gate.
    private static func assertDescentRings() {
        let arm = NativeMapExploreView.verifiedZoneRadiusMeters
        let preStage = NativeMapExploreView.verifiedZonePreStageMeters
        let discovery = NativeMapExploreView.verifiedZoneDiscoveryMeters

        // Constants + strict nesting, mirrored from the contract.
        precondition(preStage == 250, "NativeMapParitySelfTests: descent pre-stage ring drifted from contract preStageMeters.")
        precondition(discovery == 600, "NativeMapParitySelfTests: descent discovery ring drifted from contract discoveryMeters.")
        precondition(discovery > preStage && preStage > arm, "NativeMapParitySelfTests: descent rings must nest strictly outside the arm radius.")

        // Classification boundaries (inclusive inner edge of each ring).
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: nil) == .faraway, "NativeMapParitySelfTests: unknown distance must classify as faraway.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: 0) == .armed, "NativeMapParitySelfTests: a fix at the centre must classify as armed.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: arm) == .armed, "NativeMapParitySelfTests: a fix at the arm radius must classify as armed.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: arm + 1) == .preStage, "NativeMapParitySelfTests: a fix just past the arm radius must classify as pre-stage.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: preStage) == .preStage, "NativeMapParitySelfTests: a fix at the pre-stage radius must classify as pre-stage.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: preStage + 1) == .discovery, "NativeMapParitySelfTests: a fix just past the pre-stage radius must classify as discovery.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: discovery) == .discovery, "NativeMapParitySelfTests: a fix at the discovery radius must classify as discovery.")
        precondition(NativeMapExploreView.descentStage(nearestVerifiedMeters: discovery + 1) == .faraway, "NativeMapParitySelfTests: a fix past the discovery radius must classify as faraway.")

        // Rings grant NO trust: every non-armed ring denies the L2 gate and caps the reducer at L1.
        func reduced(at meters: CLLocationDistance) -> BytspotTrustLevel {
            BytspotTrustEngine.reduce(BytspotTrustEvidence(staticDiscoveryReached: true, nearestVerifiedMeters: meters, horizontalAccuracy: 0, wasInZone: false, signedTokenVerified: false, nfcCounterVerified: false))
        }
        for meters in [discovery, preStage, arm + 1] {
            precondition(NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: meters) == false, "NativeMapParitySelfTests: an advisory descent ring must never permit direct scan.")
            precondition(reduced(at: meters) == .staticDiscovery, "NativeMapParitySelfTests: an advisory descent ring must never raise trust above L1.")
        }
        // Ring⇒gate agreement across the profile: armed ⇔ gate-permitted.
        for meters in [discovery, preStage, arm + 1, arm, 0] {
            let armed = NativeMapExploreView.descentStage(nearestVerifiedMeters: meters) == .armed
            precondition(armed == NativeMapExploreView.directScanPermitted(nearestVerifiedMeters: meters), "NativeMapParitySelfTests: descent .armed must coincide exactly with the directScanPermitted gate.")
        }
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native Access Wallet/scanner parity anchors against
/// VirtualPatchScannerSheet and ProfileSection My Access.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeAccessParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativeAccessScannerPreview.scannerMethods == ["Auto", "NFC", "QR"], "NativeAccessParitySelfTests: scanner method selector drifted.")
        precondition(NativeAccessScannerPreview.scannerStates == ["Idle", "Scanning", "Verified", "Fallback"], "NativeAccessParitySelfTests: scanner states drifted.")
        precondition(NativeAccessScannerPreview.scannerCapabilities == ["NFC NDEF", "QR camera", "App Clip handoff", "Audit event"], "NativeAccessParitySelfTests: scanner capabilities drifted.")
        precondition(NativeAccessWalletPreview.walletCardTitles == ["Verified patches", "Service requests", "Digital passes"], "NativeAccessParitySelfTests: wallet card labels drifted.")
        guard let url = URL(string: "https://bytspot.app/access/BYT-BRONI-P?tier=platinum&service=platinum-dining&venue=Broni%20Home%20Taste&use=event&intent=guest&party=2"),
              let route = BytspotPatchRoute(url: url) else {
            preconditionFailure("NativeAccessParitySelfTests: Broni access route fixture failed to parse.")
        }
        precondition(route.routeKind == .access && route.useMode == .oneTime && route.tagIntent == .friendTap, "NativeAccessParitySelfTests: access scanner route metadata drifted.")
        precondition(route.canonicalAccessPath == "/access/BYT-BRONI-P?tier=platinum&tagUseMode=one_time&tagIntent=friend_tap&venue=Broni%20Home%20Taste&service=platinum-dining&group=2", "NativeAccessParitySelfTests: canonical access path drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native booking/checkout preview parity. Real payment
/// authorization intentionally remains in the production React/Apple Pay flow.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeBookingParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativePatchCheckoutPreview.checkoutBoundaryLabels == ["Apple Pay Secure", "Hold safe", "Idempotent", "React authorization"], "NativeBookingParitySelfTests: checkout boundary labels drifted.")

        let broni = BytspotPatchRoute(url: URL(string: "https://bytspot.app/access/BYT-BRONI-P?tier=platinum&service=platinum-dining&venue=Broni%20Home%20Taste&use=event&intent=guest&party=2")!)!
        let broniFlow = NativePatchSpecialFlow.resolve(route: broni)
        let broniItems = NativePatchCheckoutPreview.checkoutLineItems(for: broni, specialFlow: broniFlow)
        precondition(broniItems.first?.label == "Jollof Rice with Chicken", "NativeBookingParitySelfTests: Broni first checkout item drifted.")
        precondition(broniItems.contains { $0.label == "Banku and Fried Fish/Tilapia" }, "NativeBookingParitySelfTests: Broni fish/tilapia checkout item missing.")

        let gh = BytspotPatchRoute(url: URL(string: "https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass")!)!
        let ghFlow = NativePatchSpecialFlow.resolve(route: gh)
        let ghItems = NativePatchCheckoutPreview.checkoutLineItems(for: gh, specialFlow: ghFlow)
        precondition(ghItems.map(\.label) == ["Ticket Sales", "Souvenirs", "Ghana Home Jersey"], "NativeBookingParitySelfTests: GH Akwaaba checkout items drifted.")

        let black = BytspotPatchRoute(url: URL(string: "https://bytspot.app/BYT424-0301-B?party=2")!)!
        let fallback = NativePatchCheckoutPreview.checkoutLineItems(for: black, specialFlow: nil)
        precondition(fallback.count == 1 && fallback[0].amountCents == BytspotTier.black.minimumCents && fallback[0].quantity == 2, "NativeBookingParitySelfTests: fallback access hold preview drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native Profile/account parity anchors against the React
/// ProfileSection menu, Insider, My Access, and reservations surfaces.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeAccountParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativeProfileAccountView.profileMetricTitles == ["Account", "Wallet", "API"], "NativeAccountParitySelfTests: profile metrics drifted.")
        precondition(NativeProfileAccountView.accountMenuTitles == ["Personal Information", "My Vehicles", "Payment Methods", "My Access", "My Reservations", "Saved Spots", "Places I've Been", "Friends"], "NativeAccountParitySelfTests: account menu labels drifted from React ProfileSection.")
        precondition(NativeProfileAccountView.preferenceMenuTitles == ["Notifications", "Parking Preferences", "Vibe Preferences", "Location Settings"], "NativeAccountParitySelfTests: preference menu labels drifted from React ProfileSection.")
        precondition(NativeProfileAccountView.commerceCardTitles == ["Insider", "My Reservations", "My Access"], "NativeAccountParitySelfTests: commerce card labels drifted.")

        precondition(NativeMigrationConfig.previewSessionEnvironmentKey == "BYT_NATIVE_PREVIEW_SESSION", "NativeAccountParitySelfTests: preview session env key drifted.")
        precondition(NativeMigrationConfig.previewTokenEnvironmentKey == "BYT_NATIVE_PREVIEW_TOKEN", "NativeAccountParitySelfTests: preview token env key drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native Discover parity anchors against React
/// DiscoverSection category filters and curated fallback discovery cards.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeDiscoverParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativeDiscoverView.visibleSectionOrder == ["filters", "feed"], "NativeDiscoverParitySelfTests: Discover header/search/scaffold sections must stay removed.")
        precondition(NativeDiscoverView.filterRowCount == 3, "NativeDiscoverParitySelfTests: Discover filter system must remain three rows.")
        precondition(NativeDiscoverView.introCardDeckIndex == 0, "NativeDiscoverParitySelfTests: swipe onboarding card must stay first in the deck.")
        precondition(NativeDiscoverIntroCard.compactHeight == 152, "NativeDiscoverParitySelfTests: Discover swipe guide should stay compact.")
        precondition(NativeDiscoverFeatureCard.cardHeight == 460 && NativeDiscoverFeatureCard.heroHeight == 248 && NativeDiscoverFeatureCard.bodyHeight == 212, "NativeDiscoverParitySelfTests: Discover card fixed dimensions drifted.")
        precondition(NativeDiscoverView.categoryLabels == ["All", "🍸 Nightlife", "🍽️ Dining", "☕ Coffee", "🛍️ Shopping", "🎭 Events", "🛎 Services", "💪 Fitness", "🅿️ Parking"], "NativeDiscoverParitySelfTests: category labels drifted from React DiscoverSection.")
        precondition(NativeDiscoverView.curatedCards.map(\.title) == ["Morning Coffee Walk", "Dinner Spots That Match Your Vibe", "Nightlife Momentum", "Smart Parking Before You Arrive", "Events Worth Leaving For", "Wellness Reset Nearby", "Broni Home Taste", "GH Akwaaba Pass"], "NativeDiscoverParitySelfTests: curated fallback cards drifted from React App.tsx.")
        precondition(NativeDiscoverView.curatedCards.map(\.type) == ["coffee", "dining", "nightlife", "parking", "entertainment", "fitness", "service", "service"], "NativeDiscoverParitySelfTests: curated fallback card types drifted.")
        precondition(NativeTabContentSnapshot.canonicalServiceCards.map(\.title) == ["Broni Home Taste", "GH Akwaaba Pass"], "NativeDiscoverParitySelfTests: canonical service labels drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for native Concierge parity anchors against the current
/// Human + AI concierge preview shell.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeConciergeParitySelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        precondition(NativeConciergeView.headerTitle == "Bytspot Concierge", "NativeConciergeParitySelfTests: Concierge header title drifted.")
        precondition(NativeConciergeView.statusLabel == "Human + AI", "NativeConciergeParitySelfTests: Concierge status label drifted.")
        precondition(NativeConciergeView.statusLabels == ["Live", "Thinking", "Offline mode", "Local fallback"], "NativeConciergeParitySelfTests: Concierge status transitions drifted.")
        precondition(NativeConciergeView.transcriptBaseHex == 0x050507, "NativeConciergeParitySelfTests: Concierge transcript base color drifted.")
        precondition(NativeConciergeView.messageBubbleMaxWidthRatio == 0.84 && NativeConciergeView.messageBubbleCornerRadius == 22 && NativeConciergeView.messageBubbleFontSize == 14, "NativeConciergeParitySelfTests: Concierge bubble metrics drifted.")
        precondition(NativeConciergeView.suggestionPrompts == ["Find parking nearby", "Book a private chef", "Access my booking", "What’s open now?"], "NativeConciergeParitySelfTests: Concierge suggestion prompts drifted.")
        precondition(NativeConciergeView.handoffActionTitles == ["Open in Discover", "Show on Map", "Start Booking"], "NativeConciergeParitySelfTests: Concierge handoff actions drifted.")
        precondition(NativeConciergeView.composerPlaceholder == "Message Concierge…", "NativeConciergeParitySelfTests: Concierge composer placeholder drifted.")
    }
}
#endif

#if DEBUG
/// DEBUG-only guard for Phase 4 native tab content/data parity.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativePhase4TabContentSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        let fallback = NativeTabContentSnapshot.fallback
        precondition(fallback.venues.map(\.name).prefix(3) == ["Colony Square", "Midtown Smart Parking", "Arts Center Access"], "NativePhase4TabContentSelfTests: fallback venue fixtures drifted.")
        precondition(fallback.discoverCards.contains { $0.title == "Broni Home Taste" } && fallback.discoverCards.contains { $0.title == "GH Akwaaba Pass" }, "NativePhase4TabContentSelfTests: special Discover cards missing.")
        precondition(fallback.events.map(\.title).contains("GH Akwaaba FIFA Matchday"), "NativePhase4TabContentSelfTests: event fallback missing GH Akwaaba.")
        precondition(NativeTabContentStore.icon(for: "parking") == "parkingsign.circle.fill", "NativePhase4TabContentSelfTests: Discover icon mapping drifted.")
        precondition(NativeConciergeView.suggestionPrompts == ["Find parking nearby", "Book a private chef", "Access my booking", "What’s open now?"], "NativePhase4TabContentSelfTests: Concierge suggestions drifted.")
    }
}
#endif

private extension View { func nativePanel() -> some View { self.background(LinearGradient(colors: [NativePolish.elevatedSurface, NativePolish.glassSurface], startPoint: .topLeading, endPoint: .bottomTrailing)).overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous)).shadow(color: NativeTheme.softShadow, radius: 16, x: 0, y: 8) } }
private extension Text {
    func nativeTitle(_ size: CGFloat) -> some View { self.font(.system(size: size, weight: .black)).foregroundColor(NativeTheme.textPrimary) }
    func nativeBody(size: CGFloat = 13.5, color: Color = NativeTheme.textSecondary) -> some View { self.font(.system(size: size, weight: .semibold)).foregroundColor(color).lineSpacing(2) }
    func serviceChip(color: Color, foreground: Color) -> some View { self.font(.system(size: 10, weight: .black)).foregroundColor(foreground).padding(.horizontal, 8).padding(.vertical, 5).background(color).clipShape(Capsule()) }
}