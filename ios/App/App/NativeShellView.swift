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
/// JS→native channel used by legacy React Profile cards when they are shown in
/// the Capacitor bridge. It prevents Profile summary actions from navigating
/// deeper into React under the "Back to native" hybrid overlay.
let nativeProfilePanelBridgeChannel = "bytspotNativeProfilePanel"

private func nativeLaunchArgument(_ name: String) -> String? {
    let prefix = "--\(name)="
    return ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }).map { String($0.dropFirst(prefix.count)) }.flatMap { $0.isEmpty ? nil : $0 }
}

/// DEBUG-only env hook that injects a synthetic JS-bridge post into the
/// Capacitor webView so we can validate the full round-trip
/// (JS → WKScriptMessageHandler → NativeIncomingURLCenter → notifyPatchScanned
/// → .patch destination → markPaired) without an NFC tap. Locked by
/// `NativePatchRouteSelfTests.assertScanSourceContract`.
let nativePatchScanBridgeSmokeURLEnvironmentKey = "BYT_NATIVE_BRIDGE_SMOKE_URL"
/// DEBUG-only simulator hook that opens the React Profile inside the hybrid
/// bridge and clicks its summary card. This exercises the real React DOM handler
/// before Swift dismisses the "Back to native" cover and opens the native panel.
let nativeProfilePanelBridgeSmokeEnvironmentKey = "BYT_NATIVE_PROFILE_PANEL_BRIDGE_SMOKE"
/// DEBUG-only simulator hook that opens a native Profile panel directly on launch.
/// This verifies native menu-row panel destinations without entering the React bridge.
let nativeProfilePanelDirectSmokeEnvironmentKey = "BYT_NATIVE_PROFILE_PANEL_SMOKE"

final class NativeBridgeStore: NSObject, ObservableObject, WKScriptMessageHandler {
    let bridgeViewController = CAPBridgeViewController()
    @Published var requestedTab: BytspotNativeTab?
    @Published var requestedHybridRoute: BytspotHybridRoute?
    @Published var requestedProfilePanel: NativeProfilePanel?
    @Published private(set) var currentRoute: BytspotHybridRoute = .home
    private var lastInjectedRoute: BytspotHybridRoute?
    private var patchScanBridgeInstalled = false
    private weak var installedUserContentController: WKUserContentController?

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
        guard let userContent = bridgeViewController.webView?.configuration.userContentController else { return }
        guard !patchScanBridgeInstalled || installedUserContentController !== userContent else { return }
        userContent.removeScriptMessageHandler(forName: nativePatchScanBridgeChannel)
        userContent.add(self, name: nativePatchScanBridgeChannel)
        userContent.removeScriptMessageHandler(forName: nativeProfilePanelBridgeChannel)
        userContent.add(self, name: nativeProfilePanelBridgeChannel)
        patchScanBridgeInstalled = true
        installedUserContentController = userContent
    }

    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == nativeProfilePanelBridgeChannel {
            handleNativeProfilePanelMessage(message.body)
            return
        }
        guard message.name == nativePatchScanBridgeChannel else { return }
        let payload = message.body as? [String: Any]
        guard let urlString = payload?["url"] as? String, let url = URL(string: urlString) else { return }
        // Publish through the existing incoming-URL pipeline so the SwiftUI root's
        // navigation coordinator runs the same code path as a universal link.
        NativeIncomingURLCenter.publish(url, scanSource: NativePatchScanSource(rawValue: (payload?["source"] as? String) ?? "") ?? .nfc)
    }

    private nonisolated func handleNativeProfilePanelMessage(_ body: Any) {
        let payload = body as? [String: Any]
        let rawPanel = (payload?["panel"] as? String) ?? (body as? String)
        guard let rawPanel, let panel = NativeProfilePanel(rawValue: rawPanel) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.requestedProfilePanel = panel
        }
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

    func injectProfilePanelBridgeSmokeClickIfRequested() {
        #if DEBUG
        guard let rawPanel = ProcessInfo.processInfo.environment[nativeProfilePanelBridgeSmokeEnvironmentKey]?.lowercased(),
              NativeProfilePanel(rawValue: rawPanel) != nil else { return }
        let testID = rawPanel == "reservations" ? "profile-reservations-summary" : rawPanel == "access" ? "profile-access-summary" : "profile-rewards-summary"
        let js = """
        (function () {
          try {
            localStorage.setItem('bytspot_intro_seen', 'true');
            localStorage.setItem('bytspot_auth_token', 'guest_session');
            localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
            localStorage.setItem('bytspot_user_name', 'Guest');
            window.dispatchEvent(new CustomEvent('bytspot:native-tab', { detail: { tab: 'profile', focus: '', url: '' } }));
            var attempts = 0;
            var timer = window.setInterval(function () {
              attempts += 1;
              var element = document.querySelector('[data-testid="\(testID)"]');
              if (element && typeof element.click === 'function') {
                window.clearInterval(timer);
                element.click();
                return;
              }
              if (attempts >= 24) {
                window.clearInterval(timer);
                var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(nativeProfilePanelBridgeChannel);
                if (handler && typeof handler.postMessage === 'function') { handler.postMessage({ panel: '\(rawPanel)' }); }
              }
            }, 500);
          } catch (error) { console.warn('native profile panel smoke failed', error); }
        })();
        """
        for delay in [5.0, 12.0, 18.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.installPatchScanBridge()
                self?.bridgeViewController.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
        #endif
    }

    func open(_ route: BytspotHybridRoute, force: Bool = false, handoffURL: URL? = nil) {
        if currentRoute != route { currentRoute = route }
        bridgeViewController.loadViewIfNeeded()
        installPatchScanBridge()
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
    @State private var pendingProfilePanel: NativeProfilePanel?
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue
    @StateObject private var pairingStore = NativePatchPairingStore()
    /// Live premium-membership entitlement (orthogonal to the service tier), sourced
    /// from `NativeMembershipStore` (trpc.subscription.status.isPremium parity). It
    /// fails safe to `.free` and still honors the BYT_NATIVE_PREVIEW_PREMIUM override
    /// via the store's initial value, then threads into the map view so the Map
    /// Functions sheet can gate premium rows.
    @EnvironmentObject private var membershipStore: NativeMembershipStore
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var appearanceRuntimeStore: NativeAppearanceRuntimeStore

    private static let previewTabDefaultsKey = "bytspot_native_preview_tab"

    private static var previewInitialTab: BytspotNativeTab {
        guard NativeMigrationConfig.isNativeRootEnabled,
              let raw = (ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_TAB"] ?? UserDefaults.standard.string(forKey: previewTabDefaultsKey) ?? nativeLaunchArgument("byt-native-preview-tab"))?.lowercased(),
              let tab = BytspotNativeTab(rawValue: raw) else { return .home }
        return tab
    }

    /// DEBUG/preview hook to auto-present the native Profile/account sheet on launch
    /// (BYT_NATIVE_PREVIEW_PROFILE=1) so the rebuilt surface can be screenshotted in
    /// the simulator, mirroring the `previewInitialTab` opt-in pattern.
    private static var previewProfileRequested: Bool {
        guard NativeMigrationConfig.isNativeRootEnabled else { return false }
        let raw = (ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_PROFILE"] ?? nativeLaunchArgument("byt-native-preview-profile"))?.lowercased()
        return raw == "1" || raw == "true"
    }

    private var effectiveAppearance: NativeAppearanceMode {
        appearanceRuntimeStore.selectedMode ?? NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw)
    }

    private var effectivePreferredColorScheme: ColorScheme? {
        effectiveAppearance == .system ? appearanceRuntimeStore.systemColorScheme : effectiveAppearance.preferredColorScheme
    }

    var body: some View {
        ZStack {
            BytspotNativeBackground(tier: activeTier).ignoresSafeArea()
            VStack(spacing: 0) {
                Group {
                    switch selectedTab {
                    case .home:
                        NativeHomeDashboardView(openHybrid: openHybrid, openNativeTab: selectNativeTab, openNativeProfile: openNativeProfile)
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
        .onAppear {
            #if DEBUG
            authCoordinator.runDebugAutorunIfRequested(sessionStore: sessionStore)
            #endif
            NativeAppearanceMode.applyWindowStyle(effectiveAppearance)
            bridgeStore.open(selectedTab.hybridRoute)
            if Self.previewProfileRequested, contextualDestination == nil {
                contextualDestination = .profile
            }
            runDirectProfilePanelSmokeIfRequested()
            runProfilePanelBridgeSmokeIfRequested()
        }
        .onChange(of: selectedTab) { bridgeStore.open($0.hybridRoute) }
        .onReceive(bridgeStore.$requestedTab.compactMap { $0 }) { selectedTab = $0 }
        .onReceive(bridgeStore.$requestedHybridRoute.compactMap { $0 }) { hybridRoute = $0 }
        .onReceive(bridgeStore.$requestedProfilePanel.compactMap { $0 }) { openNativeProfile(panel: $0) }
        .onReceive(navigation.$requestedTab.compactMap { $0 }) { selectedTab = $0 }
        .onReceive(navigation.$requestedDestination.compactMap { $0 }) { destination in
            if case .patch(let route) = destination {
                activeTier = route.tier
                pairingStore.markPaired(route: route)
            }
            contextualDestination = destination
        }
        .onChange(of: appearanceRaw) { _ in
            NativeAppearanceMode.applyWindowStyle(effectiveAppearance)
        }
        .preferredColorScheme(effectivePreferredColorScheme)
        .fullScreenCover(item: $hybridRoute) { route in
            NativeHybridBridgeScreen(route: route, bridgeStore: bridgeStore)
                .preferredColorScheme(effectivePreferredColorScheme)
        }
        .sheet(item: $contextualDestination) { destination in
            NativeContextualDestinationView(destination: destination, initialProfilePanel: pendingProfilePanel, consumeInitialProfilePanel: { pendingProfilePanel = nil }) { route in
                bridgeStore.open(route, force: true, handoffURL: navigation.lastURL)
                hybridRoute = route
            }
            .preferredColorScheme(effectivePreferredColorScheme)
        }
    }

    private func openHybrid(_ route: BytspotHybridRoute) {
        bridgeStore.open(route)
        hybridRoute = route
    }

    private func openNativeProfile() {
        openNativeProfile(panel: nil)
    }

    private func openNativeProfile(panel: NativeProfilePanel?) {
        nativeImpactLight()
        pendingProfilePanel = panel
        hybridRoute = nil
        if contextualDestination == .profile { contextualDestination = nil }
        DispatchQueue.main.async {
            contextualDestination = .profile
        }
    }

    private func selectNativeTab(_ tab: BytspotNativeTab) {
        nativeImpactLight()
        withAnimation(.interpolatingSpring(mass: 0.8, stiffness: 320, damping: 30, initialVelocity: 0)) {
            selectedTab = tab
        }
    }

    private func runProfilePanelBridgeSmokeIfRequested() {
        #if DEBUG
        guard ProcessInfo.processInfo.environment[nativeProfilePanelBridgeSmokeEnvironmentKey] != nil else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            openHybrid(.profile)
            bridgeStore.injectProfilePanelBridgeSmokeClickIfRequested()
        }
        #endif
    }

    private func runDirectProfilePanelSmokeIfRequested() {
        #if DEBUG
        guard let rawPanel = ProcessInfo.processInfo.environment[nativeProfilePanelDirectSmokeEnvironmentKey],
              let panel = NativeProfilePanel.smokePanel(named: rawPanel) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            openNativeProfile(panel: panel)
        }
        #endif
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
    let initialProfilePanel: NativeProfilePanel?
    let consumeInitialProfilePanel: () -> Void
    let openHybrid: (BytspotHybridRoute) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    @EnvironmentObject private var apiState: NativeAPIState
    @EnvironmentObject private var tabContentStore: NativeTabContentStore
    @EnvironmentObject private var contactSyncStore: BytspotContactSyncStore

    var body: some View {
        NavigationView {
            Group {
                if destination == .profile {
                    if let initialProfilePanel {
                        NativeProfilePanelSheet(panel: initialProfilePanel)
                            .environmentObject(sessionStore)
                            .environmentObject(authCoordinator)
                            .environmentObject(tabContentStore)
                            .environmentObject(contactSyncStore)
                            .onAppear(perform: consumeInitialProfilePanel)
                            .navigationBarHidden(true)
                    } else {
                        ScrollView {
                            NativeProfileAccountView(initialPanel: nil, consumeInitialPanel: consumeInitialProfilePanel)
                                .environmentObject(sessionStore)
                                .environmentObject(authCoordinator)
                                .environmentObject(apiState)
                                .padding(.horizontal, 16)
                                .padding(.top, 16)
                                .padding(.bottom, 112)
                        }
                        .background(NativePolish.screenBackground.ignoresSafeArea())
                        .navigationBarHidden(true)
                    }
                } else {
                    NativeScreenScroll {
                        NativeHeroCard(title: destination.title, eyebrow: destination.eyebrow, subtitle: destination.subtitle)
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

/// Guest-default profile values mirrored from src/components/ProfileSection.tsx
/// (getUserPointsLocal → 100, getUserTier → Bronze, explorer tier profile).
private enum NativeProfileDefaults {
    static let userName = "Bytspot Member"
    static let points = 100
    static let tierIcon = "🥉"
    static let tierName = "Bronze"
    static let discount = 0
    static let badgesUnlocked = 0
    static let badgesTotal = 10
    static let following = 0
    static let bookings = 0
    static let accessLevel = "Parking perks unlock as you book"
    static let progressLabel = "3 more bookings to unlock the next perk"
    static let progressPercent = 0
    static let benefits = ["Local parking discovery", "Clear arrival pricing", "Same-day parking when available"]

    static var pointsLabel: String {
        points >= 1000 ? String(format: "%.1fK", Double(points) / 1000) : "\(points)"
    }
}

private enum NativeProfileStyle {
    static let cardRadius = NativePolish.cardRadius
    static let rowRadius: CGFloat = 16
    static let cardPadding: CGFloat = 20
    static let cardSpacing: CGFloat = 20
    static let title = NativeTheme.textPrimary
    static let body = NativeTheme.textSecondary
    static let muted = NativeTheme.textTertiary
    static let cardBorder = NativePolish.softBorder
    static let strongBorder = NativePolish.strongBorder
    static let hairline = NativePolish.softBorder
    static let insetSurface = NativeTheme.selectedControlSurface
    static let onVibrant = Color(hex: 0x050507)
    static let menuIconSurface = Color.adaptive(lightHex: 0xE8F8FF, darkHex: 0x071F2A, lightAlpha: 1.0, darkAlpha: 0.92)
    static let chipSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.58, darkAlpha: 0.08)
    static let danger = Color.adaptive(lightHex: 0xDC2626, darkHex: 0xDC2626)
    static let dangerBorder = Color.adaptive(lightHex: 0xB91C1C, darkHex: 0xFCA5A5, lightAlpha: 0.34, darkAlpha: 0.78)
    static let referralPillSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0x000000, lightAlpha: 0.56, darkAlpha: 0.34)

    static func cardSurface(accent: Color? = nil) -> LinearGradient {
        LinearGradient(
            colors: [NativePolish.elevatedSurface, (accent ?? NativeTheme.cyan).opacity(0.08), NativePolish.glassSurface],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private extension View {
    /// Adaptive premium card: preserves React's 24pt rounded card language while
    /// using system-synced surfaces for Light/Dark mode.
    func nativeProfileCard(border: Color = NativeProfileStyle.cardBorder, radius: CGFloat = NativeProfileStyle.cardRadius, accent: Color? = nil) -> some View {
        self
            .background(NativeProfileStyle.cardSurface(accent: accent))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(border, lineWidth: 1.25))
            .shadow(color: NativeTheme.softShadow, radius: 18, x: 0, y: 10)
    }
}

private struct NativeProfileMicroChip: View {
    let title: String
    let icon: String?
    let color: Color

    init(_ title: String, icon: String? = nil, color: Color = NativeTheme.cyan) {
        self.title = title
        self.icon = icon
        self.color = color
    }

    var body: some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon).font(.system(size: 10, weight: .black))
            }
            Text(title).font(.system(size: 11, weight: .heavy))
        }
        .foregroundColor(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(NativeProfileStyle.chipSurface)
        .overlay(Capsule().stroke(color.opacity(0.32), lineWidth: 1))
        .clipShape(Capsule())
    }
}

private struct NativeProfileStat: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value).font(.system(size: 24, weight: .bold)).foregroundColor(NativeProfileStyle.title)
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeProfileStyle.body)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct NativeProfileHeaderCard: View {
    let sessionStore: BytspotSessionStore
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue

    private var userName: String {
        sessionStore.isAuthenticated ? "Signed in" : NativeProfileDefaults.userName
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Circle().fill(NativeTheme.cyan.opacity(0.11)).frame(width: 170, height: 170).blur(radius: 34).offset(x: 58, y: -62)
            Circle().fill(NativeTheme.purple.opacity(0.12)).frame(width: 150, height: 150).blur(radius: 34).offset(x: -92, y: 92)
            VStack(spacing: 18) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("BYTSPOT PASSPORT")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(NativeTheme.cyan)
                            .tracking(1.4)
                        Text("Identity, access, rewards")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(NativeProfileStyle.muted)
                    }
                    Spacer()
                    NativeProfileMicroChip(sessionStore.isAuthenticated ? "Signed in" : "Guest", icon: sessionStore.isAuthenticated ? "checkmark.seal.fill" : "person.crop.circle", color: NativeTheme.cyan)
                }
                HStack(spacing: 16) {
                    ZStack(alignment: .bottomTrailing) {
                        ZStack {
                            LinearGradient(colors: [NativeTheme.cyan, NativeTheme.purple, NativeTheme.pink], startPoint: .topLeading, endPoint: .bottomTrailing)
                            Image(systemName: "person.fill").font(.system(size: 34, weight: .black)).foregroundColor(.white)
                        }
                        .frame(width: 78, height: 78)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(NativePolish.elevatedSurface.opacity(0.86), lineWidth: 3))
                        .shadow(color: NativeTheme.purple.opacity(0.20), radius: 16, x: 0, y: 10)
                        Text(NativeProfileDefaults.tierIcon)
                            .font(.system(size: 15))
                            .frame(width: 28, height: 28)
                            .background(LinearGradient(colors: [NativeTheme.orange, NativeTheme.blackAmber], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(NativePolish.elevatedSurface, lineWidth: 2))
                            .offset(x: 4, y: 4)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text(userName).font(.system(size: 24, weight: .heavy)).foregroundColor(NativeProfileStyle.title)
                        HStack(spacing: 7) {
                            NativeProfileMicroChip("\(NativeProfileDefaults.tierIcon) \(NativeProfileDefaults.tierName)", color: NativeTheme.orange)
                            NativeProfileMicroChip(appearanceMode.chipTitle, icon: appearanceMode.icon, color: NativeTheme.purple)
                        }
                    }
                    Spacer()
                }
                VStack(spacing: 0) {
                    Rectangle().fill(NativeProfileStyle.hairline).frame(height: 1)
                    HStack(spacing: 0) {
                        NativeProfileStat(value: "\(NativeProfileDefaults.following)", label: "Following")
                        Rectangle().fill(NativeProfileStyle.hairline).frame(width: 1, height: 24)
                        NativeProfileStat(value: NativeProfileDefaults.pointsLabel, label: "Points")
                        Rectangle().fill(NativeProfileStyle.hairline).frame(width: 1, height: 24)
                        NativeProfileStat(value: "\(NativeProfileDefaults.badgesUnlocked)", label: "Badges")
                    }
                    .padding(.top, 16)
                }
            }
            .padding(22)
        }
        .nativeProfileCard(accent: NativeTheme.purple)
        .accessibilityIdentifier("native-profile-header")
    }

    private var appearanceMode: NativeAppearanceMode { NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw) }
}

private struct NativeProfileAccountView: View {
    let initialPanel: NativeProfilePanel?
    let consumeInitialPanel: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var activePanel: NativeProfilePanel?
    @State private var didConsumeInitialPanel = false
    @State private var didConsumeDirectSmokePanel = false

    var body: some View {
        VStack(spacing: NativeProfileStyle.cardSpacing) {
            NativeProfileHeaderCard(sessionStore: sessionStore)
            #if DEBUG
            if shouldElevateFindFriendsPreview {
                NativeFindFriendsCard(sessionStore: sessionStore)
            }
            #endif
            NativeProfileIAHeader(title: "Today", subtitle: "Active parking, access, and patch context first.")
            NativeProfileSummaryCard(
                eyebrow: "MY RESERVATIONS",
                title: "0 parking passes",
                badge: "ARRIVALS",
                icon: "car.fill",
                gradient: [NativeTheme.cyan, NativeTheme.purple],
                border: NativeTheme.cyan,
                copy: "Parking logistics stay separate from event access, so arrival details remain calm, scannable, and wallet-ready.",
                action: { activePanel = .reservations }
            )
            NativeProfileSummaryCard(
                eyebrow: "MY ACCESS",
                title: "0 in wallet",
                badge: "PATCH VERIFIED",
                icon: "ticket.fill",
                gradient: [NativeTheme.cyan, NativeTheme.pink],
                border: NativeProfileStyle.cardBorder,
                copy: "Verified patches, passes, and premium venue access collect here as your native Bytspot wallet.",
                action: { activePanel = .access }
            )
            NativeProfileIAHeader(title: "Progress", subtitle: "Status, rewards, and unlocks stay separate from wallet tasks.")
            NativeParkerBenefitsCard()
            NativeRewardsCard(action: { activePanel = .rewards })
            NativeProfileIAHeader(title: "Social", subtitle: "Referral growth and privacy-first friend discovery.")
            NativeInviteFriendCard()
            if !shouldElevateFindFriendsPreview {
                NativeFindFriendsCard(sessionStore: sessionStore)
            }
            NativeProfileIAHeader(title: "Places & Activity", subtitle: "Saved places and visit history without account clutter.")
            NativeProfileMenuGroup(section: .placesActivity, openPanel: { activePanel = $0 })
            NativeProfileIAHeader(title: "Account", subtitle: "Identity, payment, and parking readiness.")
            NativeProfileMenuGroup(section: .account, openPanel: { activePanel = $0 })
            NativeProfileIAHeader(title: "Preferences", subtitle: "Tune discovery, parking, alerts, and privacy posture.")
            NativeProfileMenuGroup(section: .preferences, openPanel: { activePanel = $0 })
            NativeProfileIAHeader(title: "App Settings", subtitle: "General app controls, including Appearance.")
            NativeProfileMenuGroup(section: .appSettings, openPanel: { activePanel = $0 })
            NativeProfileIAHeader(title: "Safety & Legal", subtitle: "Dangerous actions and policy surfaces are isolated.")
            NativeProfileMenuGroup(section: .safetyLegal, openPanel: { activePanel = $0 })
            NativeProfileLogoutButton(sessionStore: sessionStore)
            NativeProfileVersionLabel()
        }
        .accessibilityIdentifier("native-profile-account")
        .onAppear {
            openInitialPanelIfNeeded()
            openDirectSmokePanelIfRequested()
        }
        .sheet(item: $activePanel) { panel in
            let sheet = NativeProfilePanelSheet(panel: panel)
            if #available(iOS 16.0, *) {
                sheet
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            } else {
                sheet
            }
        }
    }

    private var shouldElevateFindFriendsPreview: Bool {
        #if DEBUG
        return BytspotContactSyncStore.previewSuggestionsRequested
        #else
        return false
        #endif
    }

    private func openInitialPanelIfNeeded() {
        guard !didConsumeInitialPanel, let initialPanel else { return }
        didConsumeInitialPanel = true
        consumeInitialPanel()
        for delay in [0.35, 1.0, 2.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                if activePanel == nil { activePanel = initialPanel }
            }
        }
    }

    private func openDirectSmokePanelIfRequested() {
        #if DEBUG
        guard !didConsumeDirectSmokePanel else { return }
        guard let rawPanel = ProcessInfo.processInfo.environment[nativeProfilePanelDirectSmokeEnvironmentKey],
              let panel = NativeProfilePanel.smokePanel(named: rawPanel) else { return }
        didConsumeDirectSmokePanel = true
        for delay in [0.8, 1.6, 2.4] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                if activePanel == nil { activePanel = panel }
            }
        }
        #endif
    }
}

enum NativeProfilePanel: String, Identifiable, CaseIterable {
    case reservations, access, rewards
    case personalInformation, vehicles, paymentMethods, savedSpots, placesVisited, friends
    case vibePreferences, parkingPreferences, notifications
    case locationPrivacy, generalSettings, appearance, deleteAccount
    case privacyPolicy, termsOfService, disclaimer

    var id: String { rawValue }

    static let p2SocialActivityPanels: [NativeProfilePanel] = [.friends, .savedSpots, .placesVisited]

    static func smokePanel(named raw: String) -> NativeProfilePanel? {
        let target = normalizeSmokeName(raw)
        return allCases.first { normalizeSmokeName($0.rawValue) == target || normalizeSmokeName($0.title) == target }
    }

    private static func normalizeSmokeName(_ value: String) -> String {
        value.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
    }

    var title: String {
        switch self {
        case .reservations: return "My Reservations"
        case .access: return "My Access"
        case .rewards: return "Rewards & badges"
        case .personalInformation: return "Personal Information"
        case .vehicles: return "My Vehicles"
        case .paymentMethods: return "Payment Methods"
        case .savedSpots: return "Saved Spots"
        case .placesVisited: return "Places I've Been"
        case .friends: return "Friends"
        case .vibePreferences: return "Vibe Preferences"
        case .parkingPreferences: return "Parking Preferences"
        case .notifications: return "Notifications"
        case .locationPrivacy: return "Location & Privacy"
        case .generalSettings: return "General"
        case .appearance: return "Appearance"
        case .deleteAccount: return "Delete Account"
        case .privacyPolicy: return "Privacy Policy"
        case .termsOfService: return "Terms of Service"
        case .disclaimer: return "Disclaimer"
        }
    }
    var eyebrow: String {
        switch self {
        case .reservations: return "NATIVE ARRIVALS"
        case .access: return "NATIVE WALLET"
        case .rewards: return "NATIVE MEMBERSHIP"
        case .personalInformation, .vehicles, .paymentMethods, .savedSpots, .placesVisited, .friends: return "NATIVE ACCOUNT"
        case .vibePreferences, .parkingPreferences, .notifications: return "NATIVE PREFERENCES"
        case .locationPrivacy, .generalSettings, .appearance: return "NATIVE SETTINGS"
        case .deleteAccount: return "NATIVE SAFETY"
        case .privacyPolicy, .termsOfService, .disclaimer: return "NATIVE LEGAL"
        }
    }
    var icon: String {
        switch self {
        case .reservations: return "car.fill"
        case .access: return "ticket.fill"
        case .rewards: return "sparkles"
        case .personalInformation: return "person.text.rectangle.fill"
        case .vehicles: return "car.fill"
        case .paymentMethods: return "creditcard.fill"
        case .savedSpots: return "heart.fill"
        case .placesVisited: return "clock.fill"
        case .friends: return "person.2.fill"
        case .vibePreferences: return "sparkles"
        case .parkingPreferences: return "parkingsign.circle.fill"
        case .notifications: return "bell.fill"
        case .locationPrivacy: return "mappin.and.ellipse"
        case .generalSettings: return "gearshape.fill"
        case .appearance: return "circle.lefthalf.filled"
        case .deleteAccount: return "trash.fill"
        case .privacyPolicy: return "shield.fill"
        case .termsOfService: return "doc.text.fill"
        case .disclaimer: return "exclamationmark.triangle.fill"
        }
    }
    var accent: Color {
        switch self {
        case .reservations: return NativeTheme.cyan
        case .access, .paymentMethods: return NativeTheme.pink
        case .rewards, .vibePreferences, .friends: return NativeTheme.purple
        case .appearance: return NativeTheme.purple
        case .deleteAccount: return NativeProfileStyle.danger
        case .vehicles, .savedSpots, .placesVisited, .parkingPreferences: return NativeTheme.emerald
        case .privacyPolicy, .termsOfService, .disclaimer, .locationPrivacy, .generalSettings, .personalInformation, .notifications: return NativeTheme.cyan
        }
    }
}

private struct NativeProfilePanelSheet: View {
    let panel: NativeProfilePanel
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @EnvironmentObject private var contactSyncStore: BytspotContactSyncStore
    @EnvironmentObject private var tabContentStore: NativeTabContentStore
    @EnvironmentObject private var appearanceRuntimeStore: NativeAppearanceRuntimeStore
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        NativeIcon(symbol: panel.icon, color: panel.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(panel.eyebrow).font(.system(size: 11, weight: .black)).foregroundColor(panel.accent).tracking(1.2)
                            Text(panel.title).nativeTitle(22)
                        }
                        Spacer()
                        Button(action: { dismiss() }) { Image(systemName: "xmark.circle.fill").font(.system(size: 24, weight: .bold)).foregroundColor(NativeProfileStyle.body) }
                    }
                    Text(summary).nativeBody(size: 13.5)
                    panelContent
                }
                .padding(20)
                .padding(.bottom, 8)
            }
            Button(action: { nativeImpactLight(); dismiss() }) { NativeCTA(title: "Done", color: panel.accent, foreground: doneForeground) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-profile-panel-done-\(panel.rawValue)")
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 16)
                .background(NativePolish.screenBackground)
        }
        .background(NativePolish.screenBackground.ignoresSafeArea())
        .accessibilityIdentifier("native-profile-panel-\(panel.rawValue)")
    }

    @ViewBuilder private var panelContent: some View {
        switch panel {
        case .personalInformation:
            NativePersonalInformationPanel(sessionStore: sessionStore)
        case .vehicles:
            NativeVehicleInteractionPanel(sessionStore: sessionStore)
        case .paymentMethods:
            NativePaymentMethodsPanel(sessionStore: sessionStore)
        case .friends:
            NativeProfileFriendsPanel()
                .environmentObject(contactSyncStore)
                .environmentObject(sessionStore)
        case .savedSpots:
            NativeProfileSavedSpotsPanel(snapshot: tabContentStore.snapshot)
        case .placesVisited:
            NativeProfilePlacesVisitedPanel(snapshot: tabContentStore.snapshot)
        case .appearance:
            NativeAppearancePanel(selection: appearanceSelection)
        case .vibePreferences:
            NativeVibePreferencesPanel(sessionStore: sessionStore)
        case .parkingPreferences:
            NativeParkingPreferencesPanel(sessionStore: sessionStore)
        case .notifications:
            NativeNotificationSettingsPanel(sessionStore: sessionStore)
        case .locationPrivacy:
            NativeLocationPrivacyPanel()
        case .generalSettings:
            NativeGeneralSettingsPanel()
        case .deleteAccount:
            NativeDeleteAccountSafetyPanel(sessionStore: sessionStore)
        case .privacyPolicy:
            NativeLegalPanel(document: .privacyPolicy)
        case .termsOfService:
            NativeLegalPanel(document: .termsOfService)
        case .disclaimer:
            NativeLegalPanel(document: .disclaimer)
        default:
            VStack(spacing: 10) {
                ForEach(rows, id: \.0) { row in
                    NativeWalletLine(title: row.0, subtitle: row.1, icon: row.2)
                }
            }
        }
    }

    private var appearanceSelection: Binding<NativeAppearanceMode> {
        Binding(
            get: { NativeAppearanceMode.resolved(raw: appearanceRaw) },
            set: { mode in
                appearanceRaw = mode.rawValue
                NativeAppearanceMode.postUserSelection(mode)
                Task { @MainActor in appearanceRuntimeStore.applyUserSelection(mode) }
            }
        )
    }

    private var doneForeground: Color {
        switch panel {
        case .access, .paymentMethods, .deleteAccount: return .white
        default: return .black
        }
    }

    private var summary: String {
        switch panel {
        case .reservations: return "Parking reservations stay inside the native Profile flow so arrival details do not jump back to the web app."
        case .access: return "Verified patches, passes, and saved service requests are grouped here as a native wallet preview."
        case .rewards: return "Membership progress and badge status stay native-first while the full rewards engine continues to mature."
        case .personalInformation: return "Load and save real profile fields when signed in; guest mode remains a local native draft."
        case .vehicles: return "List, add, edit, and remove real saved vehicles when signed in, with local guest fallback."
        case .paymentMethods: return "Load saved payment-method summaries and start a secure setup session. Native Profile never captures card numbers."
        case .savedSpots: return "Favorite venues and parking locations remain in the native Profile surface."
        case .placesVisited: return "Recent visits are summarized locally as a native timeline preview."
        case .friends: return "Friend discovery and contact sync stay native-first from the Profile menu."
        case .vibePreferences: return "Mirrors React VibePreferences.tsx defaults: atmosphere scales, experience priorities, AI matching, and selected vibe token."
        case .parkingPreferences: return "Mirrors React ParkingPreferences.tsx defaults for parking type, features, smart services, budget, and walking distance."
        case .notifications: return "Mirrors React NotificationSettings.tsx push, email, and SMS categories while native push-token registration remains explicit."
        case .locationPrivacy: return "Mirrors React LocationSettings.tsx permission status, enhanced accuracy, background-location, offers, and transparency controls."
        case .generalSettings: return "General app preferences are presented as native controls."
        case .appearance: return "Theme belongs in App Settings, not as a random Profile card. Choose Auto, Dark, or Light from the native Appearance panel."
        case .deleteAccount: return "Account deletion is safety-gated here before any destructive request can proceed."
        case .privacyPolicy: return "Policy highlights are available in-app as a native legal panel."
        case .termsOfService: return "Terms highlights are available in-app as a native legal panel."
        case .disclaimer: return "Important service disclaimers stay visible in this native legal panel."
        }
    }

    private var rows: [(String, String, String)] {
        switch panel {
        case .reservations:
            return [("Parking passes", "0 active passes are ready for arrival.", "car.fill"), ("Arrival windows", "Start time, end time, and reservation codes will appear here.", "clock.fill"), ("Wallet-ready", "Parking stays separate from event access.", "rectangle.stack.badge.person.crop.fill")]
        case .access:
            return [("Verified patches", "BYT links, NFC taps, and QR handoffs collect here.", "key.radiowaves.forward.fill"), ("Digital passes", "Venue and event access remain grouped by verified source.", "ticket.fill"), ("Service requests", "Saved virtual patch requests stay visible without web handoff.", "sparkles")]
        case .rewards:
            return [("Bronze rewards", "Membership benefits stay focused on Bytspot access.", "crown.fill"), ("Badges", "0 of 10 badges unlocked.", "rosette"), ("Parker progress", "Booking milestones unlock parking perks.", "chart.line.uptrend.xyaxis")]
        case .personalInformation:
            return [("Profile identity", "Bytspot Member · Guest preview.", "person.crop.circle.fill"), ("Contact fields", "Name, email, phone, and birthday belong in this native form.", "text.badge.checkmark"), ("Native boundary", "No Back to native overlay is used for this row.", "checkmark.shield.fill")]
        case .vehicles:
            return [("Garage", "0 vehicles saved for parking and valet matching.", "car.2.fill"), ("Arrival fit", "Vehicle details will power lot guidance and handoff notes.", "wrench.and.screwdriver.fill"), ("Native boundary", "Vehicle review stays in SwiftUI.", "checkmark.shield.fill")]
        case .paymentMethods:
            return [("Wallet status", "0 payment methods are attached to this preview account.", "creditcard.fill"), ("Checkout boundary", "Secure payment authorization remains gated until a real transaction starts.", "lock.shield.fill"), ("Native boundary", "Payment review no longer opens the React Profile screen.", "checkmark.shield.fill")]
        case .savedSpots:
            return [("Favorites", "Saved venues and parking zones will appear here.", "heart.fill"), ("Smart parking", "Favorites can inform nearby recommendations.", "parkingsign.circle.fill"), ("Native boundary", "Saved spots remain on this native panel.", "checkmark.shield.fill")]
        case .placesVisited:
            return [("Timeline", "Recent check-ins and visits will be grouped by date.", "clock.fill"), ("Crowd memory", "Visited places can tune future recommendations.", "person.wave.2.fill"), ("Native boundary", "History review stays in SwiftUI.", "checkmark.shield.fill")]
        case .friends:
            return [("Contact sync", "Matches are hashed on-device before suggestions are shown.", "person.crop.circle.badge.checkmark"), ("Suggestions", "Ranked friends appear in the native Profile card.", "person.2.fill"), ("Native boundary", "Friends no longer opens the React sub-screen from this row.", "checkmark.shield.fill")]
        case .vibePreferences:
            return [("Atmosphere", "Energy, social, style, noise, and crowd scales use the React 1–10 model.", "slider.horizontal.3"), ("Profile token", "Zen, Balanced, Social, and Energy map to coffee, food, drinks, nightlife.", "sparkles"), ("Native boundary", "Preference review stays in SwiftUI.", "checkmark.shield.fill")]
        case .parkingPreferences:
            return [("Parking type", "Covered, outdoor, garage, and street defaults match React.", "parkingsign.circle.fill"), ("Smart services", "Auto-reserve, auto-extend, expiry, nearby, budget, and distance preferences stay native.", "car.fill"), ("Native boundary", "Parking preferences stay native.", "checkmark.shield.fill")]
        case .notifications:
            return [("Push", "Reservations, promotions, reminders, insider, and nearby categories.", "bell.badge.fill"), ("Email + SMS", "Reservation, promo, newsletter, receipt, reminder, and emergency categories.", "message.fill"), ("Native boundary", "Notification review stays in SwiftUI.", "checkmark.shield.fill")]
        case .locationPrivacy:
            return [("Permission status", "Primary location remains managed in system settings.", "location.fill"), ("Optional location", "Enhanced accuracy, background valet return, offers, and venue recommendations mirror React.", "hand.raised.fill"), ("Native boundary", "Privacy review stays in SwiftUI.", "checkmark.shield.fill")]
        case .generalSettings:
            return [("Theme", "Auto theme keeps the Passport surface aligned with device settings.", "circle.lefthalf.filled"), ("App version", "Bytspot v1.1.6 native migration preview.", "info.circle.fill"), ("Native boundary", "General settings stay in SwiftUI.", "checkmark.shield.fill")]
        case .appearance:
            return [("Auto", "Follows your iPhone appearance and system accessibility choices.", "iphone"), ("Dark", "Keeps Bytspot in its premium night interface.", "moon.stars.fill"), ("Light", "Uses high-contrast daytime surfaces when available.", "sun.max.fill")]
        case .deleteAccount:
            return [("Safety gate", "Deletion requires explicit confirmation before continuing.", "exclamationmark.triangle.fill"), ("Data review", "Export and account status should be reviewed first.", "doc.text.magnifyingglass"), ("Native boundary", "This destructive row does not silently open React.", "checkmark.shield.fill")]
        case .privacyPolicy:
            return [("Privacy summary", "Bytspot keeps sensitive location and account choices explicit.", "shield.fill"), ("Data handling", "Contact matching is designed for hashed, on-device workflows.", "lock.doc.fill"), ("Native boundary", "Legal review stays in this native panel.", "checkmark.shield.fill")]
        case .termsOfService:
            return [("Terms summary", "Use Bytspot responsibly for venue, parking, and access workflows.", "doc.text.fill"), ("Service boundary", "Payments and production account changes remain consent-gated.", "checkmark.seal.fill"), ("Native boundary", "Terms review stays in this native panel.", "checkmark.shield.fill")]
        case .disclaimer:
            return [("Availability", "Crowd, parking, and access previews can change in real time.", "exclamationmark.triangle.fill"), ("Safety", "Always follow posted venue and parking instructions.", "figure.walk"), ("Native boundary", "Disclaimer review stays in this native panel.", "checkmark.shield.fill")]
        }
    }
}

private struct NativeAppearancePanel: View {
    @Binding var selection: NativeAppearanceMode
    @State private var didRunDebugAutorun = false

    var body: some View {
        VStack(spacing: 10) {
            ForEach(NativeAppearanceMode.allCases) { mode in
                Button(action: { nativeImpactLight(); selection = mode }) {
                    HStack(spacing: 12) {
                        NativeIcon(symbol: mode.icon, color: selection == mode ? NativeTheme.purple : NativeTheme.cyan)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(mode.title).nativeTitle(16)
                            Text(mode.subtitle).nativeBody(size: 12)
                        }
                        Spacer()
                        Image(systemName: selection == mode ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 20, weight: .black))
                            .foregroundColor(selection == mode ? NativeTheme.purple : NativeProfileStyle.muted)
                    }
                    .padding(12)
                    .background(selection == mode ? NativeTheme.purple.opacity(0.14) : NativeProfileStyle.insetSurface)
                    .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(selection == mode ? NativeTheme.purple.opacity(0.70) : NativeProfileStyle.cardBorder, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-appearance-option-\(mode.rawValue)")
                .accessibilityLabel("\(mode.title) theme")
                .accessibilityValue(selection == mode ? "Selected" : "Not selected")
                .accessibilityHint("Applies \(mode.title) theme immediately. Tap Done to close Appearance.")
            }
            Text("Stored on this iPhone and applied to the full native shell immediately.")
                .nativeBody(size: 11.5, color: NativeProfileStyle.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear(perform: runDebugAutorunIfRequested)
    }

    private func runDebugAutorunIfRequested() {
        #if DEBUG
        guard NativeMigrationConfig.isNativeRootEnabled, !didRunDebugAutorun else { return }
        guard let raw = ProcessInfo.processInfo.environment[NativeAppearanceMode.panelAutorunEnvironmentKey] else { return }
        didRunDebugAutorun = true
        let mode = NativeAppearanceMode.resolved(raw: raw)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { selection = mode }
        #endif
    }
}

private enum NativeProfileInteractionContract {
    static let accountPanels: [NativeProfilePanel] = [.personalInformation, .paymentMethods, .vehicles]
    static let personalInfoKeys = ["bytspot_profile_display_name", "bytspot_profile_email", "bytspot_profile_phone", "bytspot_profile_city", "bytspot_profile_birthday"]
    static let vehicleKeys = ["bytspot_vehicle_make", "bytspot_vehicle_model", "bytspot_vehicle_year", "bytspot_vehicle_color", "bytspot_vehicle_plate_hint"]
    static let paymentKeys = ["bytspot_payment_apple_pay_preferred", "bytspot_payment_setup_staged"]
    static let profileRoutes = ["user.profile.get", "user.profile.update"]
    static let vehicleRoutes = ["user.vehicles.list", "user.vehicles.add", "user.vehicles.update", "user.vehicles.remove"]
    static let paymentRoutes = ["payments.listMethods", "payments.setupSession", "payments.setDefaultMethod", "payments.removeMethod"]
    static let paymentBoundaryCopy = "No card numbers, CVC, or bank details are collected in this native Profile panel."
}

private struct NativePersonalInformationPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_profile_display_name") private var displayName = ""
    @AppStorage("bytspot_profile_email") private var email = ""
    @AppStorage("bytspot_profile_phone") private var phone = ""
    @AppStorage("bytspot_profile_city") private var city = ""
    @AppStorage("bytspot_profile_birthday") private var birthday = ""
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var statusMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: completedCount, label: "Fields", color: NativeTheme.cyan)
                NativeProfilePanelStat(value: sessionStore.sessionLabel, label: "Session", color: NativeTheme.purple)
            }
            NativeProfilePanelNotice(title: sessionStore.isAuthenticated ? "Live profile sync" : "Local profile draft", subtitle: sessionStore.isAuthenticated ? "Fields load from user.profile.get and save through user.profile.update." : "Sign in to sync profile fields. Guest edits stay on this iPhone.", icon: "person.text.rectangle.fill", color: NativeTheme.cyan)
            NativeProfileFormField(title: "Display name", placeholder: "Bytspot Member", text: $displayName, capitalization: .words)
            NativeProfileFormField(title: "Email", placeholder: "name@example.com", text: $email, keyboard: .emailAddress, capitalization: .never, isDisabled: sessionStore.isAuthenticated)
            NativeProfileFormField(title: "Phone", placeholder: "Optional", text: $phone, keyboard: .phonePad, capitalization: .never)
            NativeProfileFormField(title: "Address / city", placeholder: "Atlanta", text: $city, capitalization: .words)
            NativeProfileFormField(title: "Birthday", placeholder: "YYYY-MM-DD", text: $birthday, capitalization: .never)
            Button(action: saveProfile) { NativeCTA(title: isSaving ? "Saving…" : sessionStore.isAuthenticated ? "Save Profile" : "Save Local Draft", color: NativeTheme.cyan, foreground: NativeProfileStyle.onVibrant) }
                .buttonStyle(.plain)
                .disabled(isSaving)
            NativeProfilePanelNotice(title: isLoading ? "Loading profile…" : statusTitle, subtitle: statusSubtitle, icon: "checkmark.shield.fill", color: NativeTheme.emerald)
        }
        .task { await loadProfileIfNeeded() }
    }

    private var completedCount: String { "\([displayName, email, phone, city, birthday].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count)/5" }
    private var statusTitle: String { statusMessage.isEmpty ? "Native boundary" : statusMessage }
    private var statusSubtitle: String { sessionStore.isAuthenticated ? "Email is loaded as account identity; name, phone, address, and birthday save through the API." : "This row no longer opens the React profile form or a Back to native overlay." }
    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }

    private func loadProfileIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let profile = try await api.loadProfile()
            displayName = profile.name ?? displayName
            email = profile.email ?? email
            phone = profile.phone ?? phone
            city = profile.address ?? city
            birthday = profile.birthday ?? birthday
            statusMessage = "Profile loaded"
        } catch {
            statusMessage = "Profile sync unavailable"
        }
    }

    private func saveProfile() {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { statusMessage = "Local draft saved"; return }
        isSaving = true
        Task {
            do {
                let profile = try await api.updateProfile(name: clean(displayName), phone: clean(phone), address: clean(city), birthday: clean(birthday))
                displayName = profile.name ?? displayName
                phone = profile.phone ?? phone
                city = profile.address ?? city
                birthday = profile.birthday ?? birthday
                statusMessage = "Profile saved"
            } catch {
                statusMessage = "Save failed"
            }
            isSaving = false
        }
    }

    private func clean(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct NativeVehicleInteractionPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_vehicle_make") private var localMake = ""
    @AppStorage("bytspot_vehicle_model") private var localModel = ""
    @AppStorage("bytspot_vehicle_year") private var localYear = ""
    @AppStorage("bytspot_vehicle_color") private var color = ""
    @AppStorage("bytspot_vehicle_plate_hint") private var plateHint = ""
    @State private var vehicles: [NativeVehicleRecord] = []
    @State private var editingID: String?
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var statusMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(vehicleCount)", label: "Vehicles", color: NativeTheme.emerald)
                NativeProfilePanelStat(value: sessionStore.isAuthenticated ? "Live" : "Local", label: "Garage", color: NativeTheme.cyan)
            }
            NativeProfilePanelNotice(title: sessionStore.isAuthenticated ? "Live vehicle garage" : "Local garage", subtitle: sessionStore.isAuthenticated ? "Vehicles load from user.vehicles.list and save through add/update/remove." : "Use a plate nickname or last four characters in guest mode. Full plate sync requires sign-in.", icon: "car.2.fill", color: NativeTheme.emerald)
            NativeProfileFormField(title: "Make", placeholder: "Tesla", text: $localMake, capitalization: .words)
            NativeProfileFormField(title: "Model", placeholder: "Model 3", text: $localModel, capitalization: .words)
            NativeProfileFormField(title: "Year", placeholder: "2026", text: $localYear, keyboard: .numberPad, capitalization: .never)
            NativeProfileFormField(title: "Color", placeholder: "Blue", text: $color, capitalization: .words)
            NativeProfileFormField(title: sessionStore.isAuthenticated ? "License plate" : "Plate hint", placeholder: sessionStore.isAuthenticated ? "ABC1234" : "Last 4 or nickname", text: $plateHint, capitalization: .characters)
            HStack(spacing: 9) {
                Button(action: saveVehicle) { NativeCTA(title: isSaving ? "Saving…" : editingID == nil ? "Save Vehicle" : "Update Vehicle", color: canSave ? NativeTheme.emerald : NativeProfileStyle.muted, foreground: NativeProfileStyle.onVibrant) }
                    .buttonStyle(.plain)
                    .disabled(!canSave || isSaving)
                Button(action: { clearDraft() }) { NativeCTA(title: "Clear", color: NativeProfileStyle.insetSurface, foreground: NativeProfileStyle.title) }
                    .buttonStyle(.plain)
            }
            if isLoading {
                NativeProfilePanelNotice(title: "Loading vehicles…", subtitle: "Checking your saved garage.", icon: "arrow.clockwise", color: NativeTheme.cyan)
            } else if displayVehicles.isEmpty {
                NativeProfileEmptyState(title: "No vehicle saved yet", subtitle: "Create a garage entry here; parking and valet readiness can use it later.", icon: "car.fill")
            } else {
                VStack(spacing: 8) { ForEach(displayVehicles) { vehicleRow($0) } }
            }
            NativeProfilePanelNotice(title: statusMessage.isEmpty ? "Native boundary" : statusMessage, subtitle: "Vehicle review stays in SwiftUI. No web Profile fallback is used.", icon: "checkmark.shield.fill", color: NativeTheme.emerald)
        }
        .task { await loadVehiclesIfNeeded() }
    }

    private var vehicleCount: Int { sessionStore.isAuthenticated ? vehicles.count : (canSave ? 1 : 0) }
    private var canSave: Bool { !trimmed(localMake).isEmpty && !trimmed(localModel).isEmpty && !trimmed(plateHint).isEmpty }
    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }
    private var draftVehicle: NativeVehicleRecord { NativeVehicleRecord(id: editingID ?? "local-vehicle", type: "sedan", make: trimmed(localMake), model: trimmed(localModel), year: Int(trimmed(localYear)) ?? Calendar.current.component(.year, from: Date()), color: trimmed(color), licensePlate: trimmed(plateHint), photo: nil, vin: nil, transmissionType: "automatic", trunkCategory: "full") }
    private var displayVehicles: [NativeVehicleRecord] { sessionStore.isAuthenticated ? vehicles : (canSave ? [draftVehicle] : []) }

    private func vehicleRow(_ vehicle: NativeVehicleRecord) -> some View {
        HStack(alignment: .top, spacing: 12) {
            NativeIcon(symbol: vehicle.type == "ev" ? "bolt.car.fill" : "car.fill", color: NativeTheme.emerald)
            VStack(alignment: .leading, spacing: 4) { Text(vehicle.title).nativeTitle(15); Text(vehicle.subtitle).nativeBody(size: 12, color: NativeProfileStyle.body) }
            Spacer(minLength: 0)
            VStack(spacing: 8) {
                Button("Edit") { edit(vehicle) }.font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan)
                Button("Delete") { remove(vehicle) }.font(.system(size: 11, weight: .black)).foregroundColor(NativeProfileStyle.danger)
            }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }

    private func loadVehiclesIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do { vehicles = try await api.listVehicles(); statusMessage = "Garage loaded" } catch { statusMessage = "Vehicle sync unavailable" }
    }

    private func saveVehicle() {
        nativeImpactLight()
        guard canSave else { return }
        guard sessionStore.isAuthenticated else { statusMessage = "Local garage saved"; return }
        isSaving = true
        let vehicle = draftVehicle
        Task {
            do {
                let saved = editingID == nil ? try await api.addVehicle(vehicle) : try await api.updateVehicle(vehicle)
                if let index = vehicles.firstIndex(where: { $0.id == saved.id }) { vehicles[index] = saved } else { vehicles.insert(saved, at: 0) }
                statusMessage = editingID == nil ? "Vehicle added" : "Vehicle updated"
                clearDraft(haptic: false)
            } catch { statusMessage = "Vehicle save failed" }
            isSaving = false
        }
    }

    private func edit(_ vehicle: NativeVehicleRecord) { nativeImpactLight(); editingID = vehicle.id; localMake = vehicle.make; localModel = vehicle.model; localYear = String(vehicle.year); color = vehicle.color; plateHint = vehicle.licensePlate }
    private func remove(_ vehicle: NativeVehicleRecord) {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { clearDraft(haptic: false); statusMessage = "Local vehicle cleared"; return }
        Task { do { try await api.removeVehicle(id: vehicle.id); vehicles.removeAll { $0.id == vehicle.id }; statusMessage = "Vehicle removed" } catch { statusMessage = "Remove failed" } }
    }
    private func clearDraft(haptic: Bool = true) { if haptic { nativeImpactLight() }; editingID = nil; localMake = ""; localModel = ""; localYear = ""; color = ""; plateHint = "" }
    private func trimmed(_ value: String) -> String { value.trimmingCharacters(in: .whitespacesAndNewlines) }
}

private struct NativePaymentMethodsPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_payment_apple_pay_preferred") private var applePayPreferred = true
    @AppStorage("bytspot_payment_setup_staged") private var setupStaged = false
    @State private var methods: [NativePaymentMethodRecord] = []
    @State private var isLoading = false
    @State private var isStartingSetup = false
    @State private var statusMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(methods.count)", label: "Cards", color: NativeTheme.pink)
                NativeProfilePanelStat(value: setupStaged ? "Staged" : sessionStore.isAuthenticated ? "Live" : "Secure", label: "Setup", color: NativeTheme.cyan)
            }
            if isLoading {
                NativeProfilePanelNotice(title: "Loading payment methods…", subtitle: "Checking Stripe customer payment summaries.", icon: "arrow.clockwise", color: NativeTheme.cyan)
            } else if methods.isEmpty {
                NativeProfileEmptyState(title: sessionStore.isAuthenticated ? "No saved cards" : "Sign in required", subtitle: sessionStore.isAuthenticated ? "Start secure setup to attach a card through Stripe Checkout." : "Guest mode can review payment readiness only; real setup requires authentication.", icon: "creditcard.fill")
            } else {
                VStack(spacing: 8) { ForEach(methods) { paymentRow($0) } }
            }
            NativeProfilePanelNotice(title: "Secure payment boundary", subtitle: NativeProfileInteractionContract.paymentBoundaryCopy, icon: "lock.shield.fill", color: NativeTheme.pink)
            NativePreferenceToggleRow(title: "Prefer Apple Pay", subtitle: "Use device-secure checkout when a real parking, access, or booking transaction starts.", icon: "apple.logo", color: NativeTheme.cyan, isOn: $applePayPreferred)
            NativeProfilePanelNotice(title: "Production authorization", subtitle: sessionStore.isAuthenticated ? "Authenticated session detected. Secure setup uses payments.setupSession." : "Sign in before attaching a real payment method. Guest mode can review readiness only.", icon: sessionStore.isAuthenticated ? "checkmark.seal.fill" : "person.crop.circle.badge.exclamationmark", color: sessionStore.isAuthenticated ? NativeTheme.emerald : NativeTheme.orange)
            Button(action: startSecureSetup) { NativeCTA(title: isStartingSetup ? "Preparing Stripe…" : setupStaged ? "Secure Setup Staged" : "Start Secure Setup", color: sessionStore.isAuthenticated ? NativeTheme.pink : NativeProfileStyle.muted, foreground: .white) }
                .buttonStyle(.plain)
                .disabled(isStartingSetup || !sessionStore.isAuthenticated)
            if !statusMessage.isEmpty { Text(statusMessage).nativeBody(size: 11.5, color: NativeTheme.cyan) }
            NativeProfilePanelNotice(title: "No native card capture", subtitle: "Card entry belongs inside Apple Pay, Stripe, or another certified payment sheet — never a custom Profile text field.", icon: "creditcard.trianglebadge.exclamationmark.fill", color: NativeTheme.orange)
        }
        .task { await loadPaymentMethodsIfNeeded() }
    }

    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }

    private func paymentRow(_ method: NativePaymentMethodRecord) -> some View {
        HStack(alignment: .top, spacing: 12) {
            NativeIcon(symbol: "creditcard.fill", color: method.isDefault ? NativeTheme.emerald : NativeTheme.pink)
            VStack(alignment: .leading, spacing: 4) { Text(method.label).nativeTitle(15); Text(method.isDefault ? "Default · expires \(method.detail)" : "Expires \(method.detail)").nativeBody(size: 12, color: NativeProfileStyle.body) }
            Spacer(minLength: 0)
            VStack(spacing: 8) {
                if !method.isDefault { Button("Default") { setDefault(method) }.font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan) }
                Button("Remove") { removeMethod(method) }.font(.system(size: 11, weight: .black)).foregroundColor(NativeProfileStyle.danger)
            }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }

    private func loadPaymentMethodsIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do { methods = try await api.listPaymentMethods(); statusMessage = "Payment methods loaded" } catch { statusMessage = "Payment status unavailable" }
    }

    private func startSecureSetup() {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { statusMessage = "Sign in required"; return }
        isStartingSetup = true
        Task {
            do {
                let session = try await api.createPaymentSetupSession()
                setupStaged = true
                statusMessage = "Stripe setup session ready"
                if let raw = session.url, let url = URL(string: raw) { await MainActor.run { UIApplication.shared.open(url) } }
            } catch { statusMessage = "Unable to start secure setup" }
            isStartingSetup = false
        }
    }

    private func setDefault(_ method: NativePaymentMethodRecord) { Task { do { try await api.setDefaultPaymentMethod(id: method.id); methods = methods.map { NativePaymentMethodRecord(id: $0.id, type: $0.type, brand: $0.brand, last4: $0.last4, expiryMonth: $0.expiryMonth, expiryYear: $0.expiryYear, isDefault: $0.id == method.id) }; statusMessage = "Default payment method updated" } catch { statusMessage = "Default update failed" } } }
    private func removeMethod(_ method: NativePaymentMethodRecord) { Task { do { try await api.removePaymentMethod(id: method.id); methods.removeAll { $0.id == method.id }; statusMessage = "Payment method removed" } catch { statusMessage = "Remove failed" } } }
}

private struct NativeProfileFormField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var isDisabled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title.uppercased()).font(.system(size: 10, weight: .black)).foregroundColor(NativeProfileStyle.muted).tracking(1)
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(capitalization)
                .disableAutocorrection(true)
                .disabled(isDisabled)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(NativeProfileStyle.title)
                .padding(12)
                .background(NativeProfileStyle.insetSurface)
                .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
        }
    }
}

private struct NativeProfilePanelNotice: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NativeIcon(symbol: icon, color: color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).nativeTitle(15)
                Text(subtitle).nativeBody(size: 12, color: NativeProfileStyle.body)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(color.opacity(0.24), lineWidth: 1))
    }
}

private enum NativeProfilePreferenceSourceContract {
    static let reactSources = ["VibePreferences.tsx", "ParkingPreferences.tsx", "NotificationSettings.tsx", "LocationSettings.tsx"]
    static let vibeStorageKeys = ["bytspot_vibe_preferences", "bytspot_preferences"]
    static let vibeAtmosphereLabels = ["Relaxed→Energetic", "Intimate→Social", "Classic→Trendy", "Quiet→Loud", "Spacious→Crowded"]
    static let vibeDefaultAnchors = ["energyLevel=7", "socialSetting=6", "style=7", "noiseLevel=5", "crowdDensity=5", "maxDistance=5", "priceRange=60-250"]
    static let vibeProfileTokens = ["coffee", "food", "drinks", "nightlife"]
    static let parkingDefaultAnchors = ["covered=true", "outdoor=false", "garage=true", "street=false", "evCharging=true", "security=true", "accessible=false", "valetAvailable=true", "autoReserve=false", "extendAutomatically=true", "notifyOnExpiry=true", "nearbyAlerts=false", "maxHourlyRate=20", "maxDailyRate=50", "maxWalkingDistance=0.5", "prioritizeClosest=true"]
    static let notificationChannels = ["push.reservations", "push.promotions", "push.reminders", "push.insider", "push.nearby", "email.reservations", "email.promotions", "email.newsletter", "email.receipts", "sms.reservations", "sms.reminders", "sms.emergencies"]
    static let notificationRoutes = ["user.notifications.getPrefs", "user.notifications.updatePrefs"]
    static let userPreferenceRoutes = ["user.preferences.get", "user.preferences.update"]
    static let userPreferenceSyncScope = ["vibes", "parking.covered", "parking.evCharging", "parking.security"]
    static let locationSourceKeys = ["bytspot_location_settings", "bytspot_venue_recommendations_enabled", "bytspot_active_valet_job"]
    static let locationControls = ["Primary Location Permission", "Enhanced Indoor Accuracy", "Background Location", "Location for Offers & Promotions", "Venue Recommendations", "Active Job Tracking"]
}

private enum NativeProfileP3Contract {
    static let settingsPanels: [NativeProfilePanel] = [.notifications, .locationPrivacy, .generalSettings, .appearance]
    static let safetyLegalPanels: [NativeProfilePanel] = [.deleteAccount, .privacyPolicy, .termsOfService, .disclaimer]
    static let legalTitles = ["Privacy Policy", "Terms of Service", "Disclaimer"]
    static let notificationKeys = ["bytspot_notify_push_reservations", "bytspot_notify_push_promotions", "bytspot_notify_push_reminders", "bytspot_notify_push_insider", "bytspot_notify_push_nearby", "bytspot_notify_email_reservations", "bytspot_notify_email_promotions", "bytspot_notify_email_newsletter", "bytspot_notify_email_receipts", "bytspot_notify_sms_reservations", "bytspot_notify_sms_reminders", "bytspot_notify_sms_emergencies"]
    static let privacyKeys = ["bytspot_location_enhanced_indoor_accuracy", "bytspot_location_background", "bytspot_location_offers", "bytspot_venue_recommendations_enabled"]
}

private struct NativeVibePreferencesPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_vibe_energy_level") private var energyLevel = 7.0
    @AppStorage("bytspot_vibe_social_setting") private var socialSetting = 6.0
    @AppStorage("bytspot_vibe_style") private var style = 7.0
    @AppStorage("bytspot_vibe_noise_level") private var noiseLevel = 5.0
    @AppStorage("bytspot_vibe_crowd_density") private var crowdDensity = 5.0
    @AppStorage("bytspot_vibe_price_min") private var priceMin = 60.0
    @AppStorage("bytspot_vibe_price_max") private var priceMax = 250.0
    @AppStorage("bytspot_vibe_max_distance") private var maxDistance = 5.0
    @AppStorage("bytspot_vibe_time_morning") private var morning = false
    @AppStorage("bytspot_vibe_time_afternoon") private var afternoon = true
    @AppStorage("bytspot_vibe_time_evening") private var evening = true
    @AppStorage("bytspot_vibe_group_solo") private var solo = true
    @AppStorage("bytspot_vibe_group_couple") private var couple = true
    @AppStorage("bytspot_vibe_group_small") private var smallGroup = true
    @AppStorage("bytspot_vibe_group_large") private var largeGroup = false
    @AppStorage("bytspot_vibe_learning_enabled") private var learningEnabled = true
    @AppStorage("bytspot_vibe_seasonal_adjustments") private var seasonalAdjustments = true
    @AppStorage("bytspot_vibe_social_influence") private var socialInfluence = false
    @AppStorage("bytspot_vibe_introvert_extrovert") private var introvertExtrovert = 6.0
    @AppStorage("bytspot_vibe_discovery_style") private var discoveryStyle = "explorer"
    @AppStorage("bytspot_vibe_dietary_vegetarian") private var vegetarian = false
    @AppStorage("bytspot_vibe_dietary_vegan") private var vegan = false
    @AppStorage("bytspot_vibe_access_wheelchair") private var wheelchair = false
    @AppStorage("bytspot_vibe_access_service_animal") private var serviceAnimal = false
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var statusMessage = ""
    @State private var serverVibeToken: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(vibeScore)/10", label: vibeProfile.label, color: vibeProfile.color)
                NativeProfilePanelStat(value: vibeProfile.token, label: "selectedVibes", color: NativeTheme.purple)
            }
            NativeProfilePanelNotice(title: "\(vibeProfile.emoji) \(vibeProfile.label)", subtitle: "React save maps this score to vibePreferences.selectedVibes = [\(vibeProfile.token)].", icon: "sparkles", color: vibeProfile.color)
            NativePreferenceScaleRow(title: "Energy Level", value: $energyLevel, range: 1...10, step: 1, leftLabel: "Relaxed", rightLabel: "Energetic", valueLabel: "\(Int(energyLevel))/10", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Social Setting", value: $socialSetting, range: 1...10, step: 1, leftLabel: "Intimate", rightLabel: "Social", valueLabel: "\(Int(socialSetting))/10", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Style", value: $style, range: 1...10, step: 1, leftLabel: "Classic", rightLabel: "Trendy", valueLabel: "\(Int(style))/10", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Noise Level", value: $noiseLevel, range: 1...10, step: 1, leftLabel: "Quiet", rightLabel: "Loud", valueLabel: "\(Int(noiseLevel))/10", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Crowd Density", value: $crowdDensity, range: 1...10, step: 1, leftLabel: "Spacious", rightLabel: "Crowded", valueLabel: "\(Int(crowdDensity))/10", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Maximum Travel Distance", value: $maxDistance, range: 0.5...25, step: 0.5, leftLabel: "0.5 mi", rightLabel: "25 mi", valueLabel: String(format: "%.1f miles", maxDistance), color: NativeTheme.cyan)
            NativePreferenceScaleRow(title: "Price Comfort", value: $priceMax, range: 60...2999, step: 10, leftLabel: "$60", rightLabel: "$2999", valueLabel: "$\(Int(priceMin))–$\(Int(priceMax))", color: NativeTheme.cyan)
            NativePreferenceChipSection(title: "Preferred Time Slots", options: [("Morning", "sunrise.fill", $morning), ("Afternoon", "sun.max.fill", $afternoon), ("Evening", "moon.stars.fill", $evening)], color: NativeTheme.purple)
            NativePreferenceChipSection(title: "Group Size Preferences", options: [("Solo", "person.fill", $solo), ("Couple", "person.2.fill", $couple), ("Small Group", "person.3.fill", $smallGroup), ("Large Group", "person.3.sequence.fill", $largeGroup)], color: NativeTheme.emerald)
            NativePreferenceChipSection(title: "Dietary + Accessibility", options: [("Vegetarian", "leaf.fill", $vegetarian), ("Vegan", "leaf.circle.fill", $vegan), ("Wheelchair Access", "figure.roll", $wheelchair), ("Service Animals", "pawprint.fill", $serviceAnimal)], color: NativeTheme.orange)
            NativePreferenceScaleRow(title: "Social Interaction Preference", value: $introvertExtrovert, range: 1...10, step: 1, leftLabel: "Introvert", rightLabel: "Extrovert", valueLabel: "\(Int(introvertExtrovert))/10", color: NativeTheme.pink)
            NativePreferenceChoiceRow(title: "Discovery Style", choices: [("explorer", "Explorer", "Spontaneous & adventurous"), ("planner", "Planner", "Organized & prepared")], selection: $discoveryStyle, color: NativeTheme.cyan)
            NativePreferenceToggleRow(title: "AI Learning", subtitle: "Default on in React premium demo features.", icon: "brain.head.profile", color: NativeTheme.purple, isOn: $learningEnabled)
            NativePreferenceToggleRow(title: "Seasonal Adjustments", subtitle: "Default on; tune recommendations by season and context.", icon: "sparkles", color: NativeTheme.emerald, isOn: $seasonalAdjustments)
            NativePreferenceToggleRow(title: "Social Influence", subtitle: "Default off; opt in before friend activity affects suggestions.", icon: "person.2.fill", color: NativeTheme.pink, isOn: $socialInfluence)
            Button(action: saveVibePreferences) { NativeCTA(title: isSaving ? "Saving Vibe…" : sessionStore.isAuthenticated ? "Save Native + API Vibe" : "Save Local Vibe", color: NativeTheme.purple, foreground: .white) }
                .buttonStyle(.plain)
                .disabled(isSaving)
            NativeWalletLine(title: statusTitle, subtitle: statusSubtitle, icon: "checkmark.shield.fill")
        }
        .task { await loadVibePreferenceIfNeeded() }
    }

    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }
    private var statusTitle: String { statusMessage.isEmpty ? "Native preference sync" : statusMessage }
    private var statusSubtitle: String {
        if sessionStore.isAuthenticated { return "Rich controls stay native; existing user.preferences.update syncs the compatible vibe token \(vibeProfile.token)." }
        return "Guest/local mode stores Vibe controls natively on this iPhone and never opens React."
    }

    private func loadVibePreferenceIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let preferences = try await api.loadUserPreferences()
            serverVibeToken = preferences.vibes?.first
            if let token = serverVibeToken { statusMessage = "Server vibe loaded: \(token)" }
        } catch { statusMessage = "Vibe sync unavailable" }
    }

    private func saveVibePreferences() {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { statusMessage = "Local Vibe saved"; return }
        isSaving = true
        Task {
            do {
                let saved = try await api.updateUserPreferenceSummary(vibeToken: vibeProfile.token)
                serverVibeToken = saved.vibes?.first ?? vibeProfile.token
                statusMessage = "Vibe synced: \(serverVibeToken ?? vibeProfile.token)"
            } catch { statusMessage = "Vibe sync failed" }
            isSaving = false
        }
    }

    private var vibeScore: Int {
        let atmosphere = (energyLevel + socialSetting + style + noiseLevel + crowdDensity) / 5
        return Int(round((atmosphere + 5 + introvertExtrovert) / 3))
    }

    private var vibeProfile: (label: String, token: String, emoji: String, color: Color) {
        if vibeScore <= 3 { return ("Zen Minimalist", "coffee", "🧘", NativeTheme.cyan) }
        if vibeScore <= 5 { return ("Balanced Explorer", "food", "🌿", NativeTheme.emerald) }
        if vibeScore <= 7 { return ("Social Butterfly", "drinks", "🦋", NativeTheme.purple) }
        return ("Energy Seeker", "nightlife", "⚡", NativeTheme.orange)
    }
}

private struct NativeParkingPreferencesPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_parking_covered") private var covered = true
    @AppStorage("bytspot_parking_outdoor") private var outdoor = false
    @AppStorage("bytspot_parking_garage") private var garage = true
    @AppStorage("bytspot_parking_street") private var street = false
    @AppStorage("bytspot_parking_ev_charging") private var evCharging = true
    @AppStorage("bytspot_parking_security") private var security = true
    @AppStorage("bytspot_parking_accessible") private var accessible = false
    @AppStorage("bytspot_parking_valet_available") private var valetAvailable = true
    @AppStorage("bytspot_parking_auto_reserve") private var autoReserve = false
    @AppStorage("bytspot_parking_extend_automatically") private var extendAutomatically = true
    @AppStorage("bytspot_parking_notify_on_expiry") private var notifyOnExpiry = true
    @AppStorage("bytspot_parking_nearby_alerts") private var nearbyAlerts = false
    @AppStorage("bytspot_parking_max_hourly_rate") private var maxHourlyRate = 20.0
    @AppStorage("bytspot_parking_max_daily_rate") private var maxDailyRate = 50.0
    @AppStorage("bytspot_parking_prioritize_cheapest") private var prioritizeCheapest = false
    @AppStorage("bytspot_parking_max_walking_distance") private var maxWalkingDistance = 0.5
    @AppStorage("bytspot_parking_prioritize_closest") private var prioritizeClosest = true
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var statusMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\([covered, outdoor, garage, street].filter { $0 }.count)/4", label: "Type", color: NativeTheme.emerald)
                NativeProfilePanelStat(value: "$\(Int(maxHourlyRate))/hr", label: "Budget", color: NativeTheme.cyan)
            }
            NativePreferenceChipSection(title: "Parking Type", options: [("Covered Parking", "cloud.rain.fill", $covered), ("Outdoor Lots", "sun.max.fill", $outdoor), ("Parking Garages", "building.2.fill", $garage), ("Street Parking", "road.lanes", $street)], color: NativeTheme.emerald)
            NativePreferenceChipSection(title: "Required Features", options: [("EV Charging", "bolt.car.fill", $evCharging), ("24/7 Security", "shield.fill", $security), ("Accessible Parking", "figure.roll", $accessible), ("Valet Service", "key.fill", $valetAvailable)], color: NativeTheme.cyan)
            NativePreferenceChipSection(title: "Smart Features", options: [("Auto-Reserve", "sparkles", $autoReserve), ("Auto-Extend", "clock.arrow.circlepath", $extendAutomatically), ("Expiry Notifications", "bell.badge.fill", $notifyOnExpiry), ("Nearby Alerts", "location.fill", $nearbyAlerts)], color: NativeTheme.orange)
            NativePreferenceScaleRow(title: "Max Hourly Rate", value: $maxHourlyRate, range: 5...50, step: 5, leftLabel: "$5/hr", rightLabel: "$50/hr", valueLabel: "$\(Int(maxHourlyRate))/hr", color: NativeTheme.purple)
            NativePreferenceScaleRow(title: "Max Daily Rate", value: $maxDailyRate, range: 10...100, step: 10, leftLabel: "$10/day", rightLabel: "$100/day", valueLabel: "$\(Int(maxDailyRate))/day", color: NativeTheme.purple)
            NativePreferenceToggleRow(title: "Prioritize Cheapest", subtitle: "Show lowest price options first.", icon: "dollarsign.circle.fill", color: NativeTheme.emerald, isOn: $prioritizeCheapest)
            NativePreferenceScaleRow(title: "Max Walking Distance", value: $maxWalkingDistance, range: 0.1...2, step: 0.1, leftLabel: "0.1 mi", rightLabel: "2 mi", valueLabel: String(format: "%.1f mi", maxWalkingDistance), color: NativeTheme.cyan)
            NativePreferenceToggleRow(title: "Prioritize Closest", subtitle: "Default on in React; show nearest options first.", icon: "location.circle.fill", color: NativeTheme.cyan, isOn: $prioritizeClosest)
            Button(action: saveParkingPreferences) { NativeCTA(title: isSaving ? "Saving Parking…" : sessionStore.isAuthenticated ? "Save Native + API Parking" : "Save Local Parking", color: NativeTheme.emerald, foreground: NativeProfileStyle.onVibrant) }
                .buttonStyle(.plain)
                .disabled(isSaving)
            NativeWalletLine(title: statusTitle, subtitle: statusSubtitle, icon: "checkmark.shield.fill")
        }
        .task { await loadParkingPreferenceIfNeeded() }
    }

    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }
    private var parkingSummary: NativeUserPreferencesRecord.Parking { NativeUserPreferencesRecord.Parking(covered: covered, evCharging: evCharging, security: security ? "premium" : "basic") }
    private var statusTitle: String { statusMessage.isEmpty ? "Native preference sync" : statusMessage }
    private var statusSubtitle: String {
        if sessionStore.isAuthenticated { return "Rich controls stay native; existing user.preferences.update syncs covered, EV charging, and security." }
        return "Guest/local mode stores Parking controls natively on this iPhone and never opens React."
    }

    private func loadParkingPreferenceIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let preferences = try await api.loadUserPreferences()
            if let parking = preferences.parking {
                covered = parking.covered ?? covered
                evCharging = parking.evCharging ?? evCharging
                if let securityValue = parking.security { security = securityValue != "basic" }
                statusMessage = "Parking sync loaded"
            }
        } catch { statusMessage = "Parking sync unavailable" }
    }

    private func saveParkingPreferences() {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { statusMessage = "Local Parking saved"; return }
        isSaving = true
        Task {
            do {
                _ = try await api.updateUserPreferenceSummary(parking: parkingSummary)
                statusMessage = "Parking synced"
            } catch { statusMessage = "Parking sync failed" }
            isSaving = false
        }
    }
}

private struct NativeNotificationSettingsPanel: View {
    let sessionStore: BytspotSessionStore
    @AppStorage("bytspot_notify_push_reservations") private var pushReservations = true
    @AppStorage("bytspot_notify_push_promotions") private var pushPromotions = true
    @AppStorage("bytspot_notify_push_reminders") private var pushReminders = true
    @AppStorage("bytspot_notify_push_insider") private var pushInsider = true
    @AppStorage("bytspot_notify_push_nearby") private var pushNearby = false
    @AppStorage("bytspot_notify_email_reservations") private var emailReservations = true
    @AppStorage("bytspot_notify_email_promotions") private var emailPromotions = false
    @AppStorage("bytspot_notify_email_newsletter") private var emailNewsletter = true
    @AppStorage("bytspot_notify_email_receipts") private var emailReceipts = true
    @AppStorage("bytspot_notify_sms_reservations") private var smsReservations = true
    @AppStorage("bytspot_notify_sms_reminders") private var smsReminders = true
    @AppStorage("bytspot_notify_sms_emergencies") private var smsEmergencies = true
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var statusMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeProfilePanelStat(value: enabledCount, label: "Enabled", color: NativeTheme.cyan)
            NativeWalletLine(title: "Push Notifications", subtitle: "Browser push support in React maps to explicit native push-token registration later.", icon: "bell.fill")
            NativePreferenceToggleRow(title: "Reservation Updates", subtitle: "Confirmations, changes, and cancellations.", icon: "calendar.badge.checkmark", color: NativeTheme.purple, isOn: $pushReservations)
            NativePreferenceToggleRow(title: "Promotions & Deals", subtitle: "Special offers and discounts.", icon: "tag.fill", color: NativeTheme.pink, isOn: $pushPromotions)
            NativePreferenceToggleRow(title: "Reminders", subtitle: "Parking session expiration alerts.", icon: "clock.badge.exclamationmark.fill", color: NativeTheme.orange, isOn: $pushReminders)
            NativePreferenceToggleRow(title: "Insider Updates", subtitle: "New posts and venue information.", icon: "newspaper.fill", color: NativeTheme.cyan, isOn: $pushInsider)
            NativePreferenceToggleRow(title: "Nearby Spots", subtitle: "Available parking near your location.", icon: "mappin.and.ellipse", color: NativeTheme.emerald, isOn: $pushNearby)
            NativeWalletLine(title: "Email Notifications", subtitle: "Reservation confirmations, promos, newsletter, and receipts mirror React defaults.", icon: "envelope.fill")
            NativePreferenceToggleRow(title: "Reservation Confirmations", subtitle: "Booking details and receipts.", icon: "mail.stack.fill", color: NativeTheme.cyan, isOn: $emailReservations)
            NativePreferenceToggleRow(title: "Promotional Emails", subtitle: "Marketing and promotional content.", icon: "megaphone.fill", color: NativeTheme.pink, isOn: $emailPromotions)
            NativePreferenceToggleRow(title: "Newsletter", subtitle: "Monthly tips and feature updates.", icon: "doc.text.fill", color: NativeTheme.purple, isOn: $emailNewsletter)
            NativePreferenceToggleRow(title: "Receipts", subtitle: "Payment receipts and invoices.", icon: "receipt.fill", color: NativeTheme.emerald, isOn: $emailReceipts)
            NativeWalletLine(title: "SMS Notifications", subtitle: "Reservation alerts, 30-minute reminders, and emergency alerts.", icon: "message.fill")
            NativePreferenceToggleRow(title: "Reservation Alerts", subtitle: "Booking confirmations via SMS.", icon: "message.badge.fill", color: NativeTheme.cyan, isOn: $smsReservations)
            NativePreferenceToggleRow(title: "Time Reminders", subtitle: "30-min expiration warnings.", icon: "timer", color: NativeTheme.orange, isOn: $smsReminders)
            NativePreferenceToggleRow(title: "Emergency Alerts", subtitle: "Critical notifications only.", icon: "exclamationmark.triangle.fill", color: NativeProfileStyle.danger, isOn: $smsEmergencies)
            Button(action: saveNotificationPreferences) { NativeCTA(title: isSaving ? "Saving Notifications…" : sessionStore.isAuthenticated ? "Save Notification Preferences" : "Save Local Notifications", color: NativeTheme.cyan, foreground: NativeProfileStyle.onVibrant) }
                .buttonStyle(.plain)
                .disabled(isSaving)
            NativeWalletLine(title: statusTitle, subtitle: statusSubtitle, icon: "checkmark.shield.fill")
        }
        .task { await loadNotificationPreferencesIfNeeded() }
    }

    private var enabledCount: String {
        "\([pushReservations, pushPromotions, pushReminders, pushInsider, pushNearby, emailReservations, emailPromotions, emailNewsletter, emailReceipts, smsReservations, smsReminders, smsEmergencies].filter { $0 }.count)/12"
    }

    private var api: NativeProfileDataAPI { NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })) }
    private var statusTitle: String { statusMessage.isEmpty ? "Backend parity" : statusMessage }
    private var statusSubtitle: String {
        if sessionStore.isAuthenticated { return "Native loads and saves through user.notifications.getPrefs/updatePrefs; push-token registration remains explicit." }
        return "Guest/local mode stores notification choices natively until sign-in."
    }
    private var currentPreferences: NativeNotificationPreferences {
        NativeNotificationPreferences(
            push: NativeNotificationPreferences.Push(reservations: pushReservations, promotions: pushPromotions, reminders: pushReminders, insider: pushInsider, nearby: pushNearby),
            email: NativeNotificationPreferences.Email(reservations: emailReservations, promotions: emailPromotions, newsletter: emailNewsletter, receipts: emailReceipts),
            sms: NativeNotificationPreferences.SMS(reservations: smsReservations, reminders: smsReminders, emergencies: smsEmergencies)
        )
    }

    private func loadNotificationPreferencesIfNeeded() async {
        guard sessionStore.isAuthenticated else { return }
        isLoading = true
        defer { isLoading = false }
        do { apply(try await api.loadNotificationPreferences()); statusMessage = "Notification preferences loaded" } catch { statusMessage = "Notification sync unavailable" }
    }

    private func saveNotificationPreferences() {
        nativeImpactLight()
        guard sessionStore.isAuthenticated else { statusMessage = "Local Notifications saved"; return }
        isSaving = true
        Task {
            do { try await api.updateNotificationPreferences(currentPreferences); statusMessage = "Notification preferences synced" } catch { statusMessage = "Notification sync failed" }
            isSaving = false
        }
    }

    private func apply(_ preferences: NativeNotificationPreferences) {
        pushReservations = preferences.push.reservations; pushPromotions = preferences.push.promotions; pushReminders = preferences.push.reminders; pushInsider = preferences.push.insider; pushNearby = preferences.push.nearby
        emailReservations = preferences.email.reservations; emailPromotions = preferences.email.promotions; emailNewsletter = preferences.email.newsletter; emailReceipts = preferences.email.receipts
        smsReservations = preferences.sms.reservations; smsReminders = preferences.sms.reminders; smsEmergencies = preferences.sms.emergencies
    }
}

private struct NativeLocationPrivacyPanel: View {
    @AppStorage("bytspot_location_enhanced_indoor_accuracy") private var enhancedIndoorAccuracy = false
    @AppStorage("bytspot_location_background") private var backgroundLocation = false
    @AppStorage("bytspot_location_offers") private var locationForOffers = false
    @AppStorage("bytspot_venue_recommendations_enabled") private var venueRecommendations = false
    @AppStorage("bytspot_active_valet_job_present") private var activeJobTracking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeWalletLine(title: "Primary Location Permission", subtitle: "Current status is managed in iOS Settings; Bytspot needs location for nearby parking and verified-zone intelligence.", icon: "location.fill")
            NativePreferenceToggleRow(title: "Enhanced Indoor Accuracy", subtitle: "Uses Wi‑Fi and Bluetooth signals to improve drop-off/retrieval inside garages.", icon: "dot.radiowaves.left.and.right", color: NativeTheme.purple, isOn: $enhancedIndoorAccuracy)
            NativePreferenceToggleRow(title: "Background Location", subtitle: "Allow valet return-trip tracking when needed; React requires Always Allow before enabling.", icon: "location.circle.fill", color: NativeTheme.orange, isOn: $backgroundLocation)
            NativePreferenceToggleRow(title: "Location for Offers & Promotions", subtitle: "Use general location for special offers near partner venues.", icon: "gift.fill", color: NativeTheme.pink, isOn: $locationForOffers)
            NativePreferenceToggleRow(title: "Venue Recommendations", subtitle: "Show restaurants, shops, and attractions based on current location in Insider.", icon: "sparkles", color: NativeTheme.emerald, isOn: $venueRecommendations)
            NativePreferenceToggleRow(title: "Active Job Tracking", subtitle: "Read-only in React from active valet job state; previewed here for parity review.", icon: "car.rear.road.lane", color: NativeTheme.cyan, isOn: $activeJobTracking)
            NativeWalletLine(title: "Transparency & Privacy", subtitle: activeJobTracking ? "Tracking is ON for an active valet flow." : "Tracking is OFF; no active valet job is using location.", icon: activeJobTracking ? "checkmark.circle.fill" : "xmark.circle.fill")
            NativeWalletLine(title: "Your Privacy is Protected", subtitle: "Mirrors React copy: location controls are explicit and can be revoked from Profile or system settings.", icon: "shield.fill")
        }
    }
}

private struct NativeGeneralSettingsPanel: View {
    @AppStorage(NativeAppearanceMode.defaultsKey) private var appearanceRaw = NativeAppearanceMode.system.rawValue

    private var version: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.1.6" }
    private var appearance: NativeAppearanceMode { NativeAppearanceMode.previewOverride ?? NativeAppearanceMode.resolved(raw: appearanceRaw) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeWalletLine(title: "Appearance", subtitle: "Current setting: \(appearance.title). Use App Settings → Appearance to change it.", icon: appearance.icon)
            NativeWalletLine(title: "App version", subtitle: "Bytspot v\(version) native migration preview.", icon: "info.circle.fill")
            NativeWalletLine(title: "Native root", subtitle: "Profile settings render in SwiftUI and do not open the React Profile screen.", icon: "checkmark.shield.fill")
        }
    }
}

private struct NativeDeleteAccountSafetyPanel: View {
    let sessionStore: BytspotSessionStore
    @State private var confirmation = ""
    @State private var didStageDeletionReview = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeWalletLine(title: "Permanently delete your account?", subtitle: "This would remove profile data, saved spots, preferences, check-ins, access passes, reservations, and session state.", icon: "trash.fill")
            NativeProfileTextField(title: "Type DELETE to unlock review", text: $confirmation)
            Button(action: { nativeImpactLight(); didStageDeletionReview = true }) {
                NativeCTA(title: "Request deletion review", color: canStage ? NativeProfileStyle.danger : NativeProfileStyle.muted, foreground: .white)
            }
            .buttonStyle(.plain)
            .disabled(!canStage)
            NativeWalletLine(title: didStageDeletionReview ? "Deletion review staged" : "Safety gate active", subtitle: safetySubtitle, icon: didStageDeletionReview ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
            if !(sessionStore.isAuthenticated || sessionStore.isGuest) {
                NativeProfileEmptyState(title: "No active session", subtitle: "Sign in or continue as guest before account actions are available.", icon: "person.crop.circle.badge.exclamationmark")
            }
        }
    }

    private var canStage: Bool { confirmation.uppercased() == "DELETE" }
    private var safetySubtitle: String {
        didStageDeletionReview ? "No destructive request was sent. Production deletion remains behind explicit server confirmation." : "Native Profile will not silently call a destructive API or fall back to React."
    }
}

private enum NativeLegalDocument: CaseIterable, Identifiable {
    case privacyPolicy, termsOfService, disclaimer
    var id: String { title }
    var title: String { switch self { case .privacyPolicy: return "Privacy Policy"; case .termsOfService: return "Terms of Service"; case .disclaimer: return "Disclaimer" } }
    var updated: String { switch self { case .privacyPolicy: return "April 3, 2026"; case .termsOfService: return "April 12, 2026"; case .disclaimer: return "April 13, 2026" } }
    var contact: String { switch self { case .termsOfService: return "legal@bytspot.com"; default: return "bytspotapp@gmail.com" } }
    var sections: [(String, String, String)] {
        switch self {
        case .privacyPolicy:
            return [("Information we collect", "Account information, when-in-use location, usage data, push tokens, and hashed contact matching.", "lock.doc.fill"), ("How we use it", "Nearby venues, parking intelligence, opt-in alerts, authentication, and aggregated improvement.", "sparkles"), ("Your rights", "Delete your account, revoke permissions, and clear local preferences from Profile settings.", "hand.raised.fill")]
        case .termsOfService:
            return [("License", "Personal, non-commercial use of Bytspot with no copying, reverse engineering, or competing reuse.", "doc.text.fill"), ("Service boundary", "Crowd, parking, AI, venue, payment, and provider information can change and needs user judgment.", "checkmark.seal.fill"), ("User conduct", "Use Bytspot lawfully, keep account credentials safe, and do not interfere with app security.", "person.crop.circle.badge.checkmark")]
        case .disclaimer:
            return [("Accuracy of data", "Crowd levels, wait times, venue details, and availability are estimates and may differ in real time.", "chart.bar.fill"), ("Parking information", "Always verify posted signs, pricing, availability, and physical lot rules before parking.", "parkingsign.circle.fill"), ("AI recommendations", "Concierge and recommendation outputs are informational and should not be the sole basis for safety decisions.", "sparkles")]
        }
    }
}

private struct NativeLegalPanel: View {
    let document: NativeLegalDocument

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeWalletLine(title: "Last updated", subtitle: document.updated, icon: "calendar.badge.clock")
            VStack(spacing: 10) { ForEach(document.sections, id: \.0) { NativeWalletLine(title: $0.0, subtitle: $0.1, icon: $0.2) } }
            NativeWalletLine(title: "Contact", subtitle: document.contact, icon: "envelope.fill")
            NativeWalletLine(title: "Native legal boundary", subtitle: "Policy highlights stay readable in SwiftUI; no Back to native overlay is used.", icon: "checkmark.shield.fill")
        }
    }
}

private struct NativePreferenceToggleRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                NativeIcon(symbol: icon, color: color)
                VStack(alignment: .leading, spacing: 3) { Text(title).nativeTitle(16); Text(subtitle).nativeBody(size: 12) }
            }
        }
        .toggleStyle(SwitchToggleStyle(tint: color))
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }
}

private struct NativePreferenceScaleRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let leftLabel: String
    let rightLabel: String
    let valueLabel: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack { Text(title).nativeTitle(16); Spacer(); Text(valueLabel).font(.system(size: 13, weight: .black)).foregroundColor(color) }
            Slider(value: $value, in: range, step: step).tint(color)
            HStack { Text(leftLabel).nativeBody(size: 11.5, color: NativeProfileStyle.body); Spacer(); Text(rightLabel).nativeBody(size: 11.5, color: NativeProfileStyle.body) }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(color.opacity(0.24), lineWidth: 1))
    }
}

private struct NativePreferenceChipSection: View {
    let title: String
    let options: [(title: String, icon: String, selection: Binding<Bool>)]
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title).font(.system(size: 10.5, weight: .black)).foregroundColor(NativeProfileStyle.muted).tracking(1.1)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(options.indices, id: \.self) { index in
                    let option = options[index]
                    NativePreferenceChipButton(title: option.title, icon: option.icon, color: color, isSelected: option.selection.wrappedValue) {
                        option.selection.wrappedValue.toggle()
                    }
                }
            }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }
}

private struct NativePreferenceChipButton: View {
    let title: String
    let icon: String
    let color: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 12, weight: .black)).frame(width: 17)
                Text(title).font(.system(size: 12.5, weight: .black)).lineLimit(2)
                Spacer(minLength: 0)
            }
            .foregroundColor(isSelected ? NativeProfileStyle.onVibrant : NativeProfileStyle.title)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? color : NativeProfileStyle.insetSurface)
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(isSelected ? color.opacity(0.5) : NativeProfileStyle.cardBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct NativePreferenceChoiceRow: View {
    let title: String
    let choices: [(value: String, label: String, subtitle: String)]
    @Binding var selection: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title).nativeTitle(16)
            HStack(spacing: 8) {
                ForEach(choices, id: \.value) { choice in
                    Button(action: { nativeImpactLight(); selection = choice.value }) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(choice.label).font(.system(size: 14, weight: .black))
                            Text(choice.subtitle).font(.system(size: 11.5, weight: .bold)).opacity(0.72)
                        }
                        .foregroundColor(selection == choice.value ? NativeProfileStyle.onVibrant : NativeProfileStyle.title)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(selection == choice.value ? color : NativeProfileStyle.insetSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }
}

private struct NativeProfileTextField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title.uppercased()).font(.system(size: 10, weight: .black)).foregroundColor(NativeProfileStyle.muted).tracking(1)
            TextField("DELETE", text: $text)
                .textInputAutocapitalization(.characters)
                .disableAutocorrection(true)
                .font(.system(size: 16, weight: .black, design: .monospaced))
                .foregroundColor(NativeProfileStyle.title)
                .padding(12)
                .background(NativeProfileStyle.insetSurface)
                .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.dangerBorder, lineWidth: 1.25))
        }
    }
}

private struct NativeProfileFriendsPanel: View {
    @EnvironmentObject private var contactSyncStore: BytspotContactSyncStore
    @EnvironmentObject private var sessionStore: BytspotSessionStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(contactSyncStore.suggestions.count)", label: "Suggestions", color: NativeTheme.purple)
                NativeProfilePanelStat(value: "\(sharedVenueCount)", label: "Shared spots", color: NativeTheme.cyan)
            }
            NativeWalletLine(title: "Privacy-first graph", subtitle: "Contacts are matched with salted hashes before ranked friend suggestions appear.", icon: "lock.shield.fill")
            if sessionStore.isAuthenticated {
                Button(action: { Task { await contactSyncStore.syncDeviceContacts(sessionStore: sessionStore) } }) { NativeCTA(title: ctaTitle, color: NativeTheme.purple, foreground: .white) }
                    .buttonStyle(.plain)
                    .disabled(contactSyncStore.phase == .syncing || contactSyncStore.phase == .requesting)
                if let summary = contactSyncStore.lastSummary { Text(summary).nativeBody(size: 11.5, color: NativeTheme.cyan) }
                suggestionList
            } else {
                NativeProfileEmptyState(title: "Sign in to find friends", subtitle: "Friend suggestions stay native, but contact matching needs an authenticated account.", icon: "person.crop.circle.badge.exclamationmark")
            }
        }
    }

    private var sharedVenueCount: Int { contactSyncStore.suggestions.reduce(0) { $0 + $1.sharedVerifiedVenues } }
    private var ctaTitle: String { contactSyncStore.phase == .syncing ? "Syncing contacts…" : contactSyncStore.lastSummary == nil ? "Sync contacts" : "Re-sync contacts" }

    @ViewBuilder private var suggestionList: some View {
        if contactSyncStore.suggestions.isEmpty {
            NativeProfileEmptyState(title: "No matches yet", subtitle: "Sync contacts to see mutual friends and people who share verified Bytspot spots.", icon: "person.2.slash.fill")
        } else {
            VStack(spacing: 8) {
                ForEach(contactSyncStore.suggestions.prefix(6)) { suggestion in NativeFriendSuggestionRow(suggestion: suggestion) }
            }
        }
    }
}

private struct NativeProfileSavedSpotsPanel: View {
    let snapshot: NativeTabContentSnapshot
    private var spots: [NativeProfileSavedSpot] { NativeProfileSavedSpot.saved(from: snapshot) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(spots.count)", label: "Saved", color: NativeTheme.emerald)
                NativeProfilePanelStat(value: snapshot.statusLabel, label: "Source", color: NativeTheme.cyan)
            }
            VStack(spacing: 10) { ForEach(spots) { NativeProfileSavedSpotRow(spot: $0) } }
            NativeWalletLine(title: "Native boundary", subtitle: "Saved spots are now readable from the native Profile panel without opening React.", icon: "checkmark.shield.fill")
        }
    }
}

private struct NativeProfilePlacesVisitedPanel: View {
    let snapshot: NativeTabContentSnapshot
    private var activities: [NativeProfileVisitActivity] { NativeProfileVisitActivity.timeline(from: snapshot) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                NativeProfilePanelStat(value: "\(activities.count)", label: "Recent", color: NativeTheme.emerald)
                NativeProfilePanelStat(value: "L0", label: "Read-only", color: NativeTheme.cyan)
            }
            VStack(spacing: 10) { ForEach(activities) { NativeProfileVisitRow(activity: $0) } }
            NativeWalletLine(title: "Check-in safe", subtitle: "Timeline preview is read-only here; write actions remain explicit and idempotent in venue details.", icon: "checkmark.seal.fill")
        }
    }
}

private struct NativeProfileSavedSpot: Identifiable, Equatable {
    let id: String; let title: String; let subtitle: String; let meta: String; let icon: String; let verified: Bool
    static let fallbackFixtureTitles = ["Colony Square", "Midtown Smart Parking", "Broni Home Taste", "GH Akwaaba Pass"]

    static func saved(from snapshot: NativeTabContentSnapshot) -> [NativeProfileSavedSpot] {
        let venues = snapshot.venues.prefix(2).map { venue in
            NativeProfileSavedSpot(id: "venue-\(venue.id)", title: venue.name, subtitle: venue.address, meta: "\(venue.distance) · \(venue.parking.priceLabel)", icon: NativeTabContentStore.icon(for: venue.discoverType), verified: venue.verifiedPatchId != nil)
        }
        let services = snapshot.discoverCards.filter { ["broni-home-taste", "gh-akwaaba-pass"].contains($0.id) }.prefix(2).map { card in
            NativeProfileSavedSpot(id: "service-\(card.id)", title: card.title, subtitle: card.subtitle, meta: card.metadataLine, icon: card.icon, verified: card.verified)
        }
        return Array((venues + services).prefix(4))
    }
}

private struct NativeProfileVisitActivity: Identifiable {
    let id: String; let title: String; let subtitle: String; let meta: String; let icon: String; let color: Color

    static func timeline(from snapshot: NativeTabContentSnapshot) -> [NativeProfileVisitActivity] {
        let eventItems = snapshot.events.prefix(1).map { event in
            NativeProfileVisitActivity(id: "event-\(event.id)", title: "Pass viewed · \(event.title)", subtitle: event.venue, meta: "\(event.time) · \(event.price)", icon: "ticket.fill", color: NativeTheme.purple)
        }
        let venueItems = snapshot.venues.prefix(2).map { venue in
            NativeProfileVisitActivity(id: "venue-\(venue.id)", title: "Checked in preview · \(venue.name)", subtitle: venue.address, meta: venue.crowd?.label ?? "Recent visit", icon: NativeTabContentStore.icon(for: venue.discoverType), color: venue.discoverType == "parking" ? NativeTheme.emerald : NativeTheme.cyan)
        }
        return Array((eventItems + venueItems).prefix(3))
    }
}

private struct NativeProfilePanelStat: View {
    let value: String; let label: String; let color: Color
    var body: some View { VStack(alignment: .leading, spacing: 4) { Text(value).font(.system(size: 18, weight: .black)).foregroundColor(color); Text(label.uppercased()).font(.system(size: 10, weight: .black)).foregroundColor(NativeProfileStyle.muted).tracking(1) }.frame(maxWidth: .infinity, alignment: .leading).padding(12).background(NativeProfileStyle.insetSurface).clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(color.opacity(0.24), lineWidth: 1)) }
}

private struct NativeProfileSavedSpotRow: View {
    let spot: NativeProfileSavedSpot
    var body: some View { HStack(spacing: 12) { NativeIcon(symbol: spot.icon, color: spot.verified ? NativeTheme.emerald : NativeTheme.cyan); VStack(alignment: .leading, spacing: 3) { Text(spot.title).nativeTitle(16); Text(spot.subtitle).nativeBody(size: 12); Text(spot.meta).font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.emerald) }; Spacer(); if spot.verified { Image(systemName: "checkmark.seal.fill").foregroundColor(NativeTheme.emerald) } }.padding(12).background(NativeProfileStyle.insetSurface).clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1)) }
}

private struct NativeProfileVisitRow: View {
    let activity: NativeProfileVisitActivity
    var body: some View { HStack(spacing: 12) { NativeIcon(symbol: activity.icon, color: activity.color); VStack(alignment: .leading, spacing: 3) { Text(activity.title).nativeTitle(16); Text(activity.subtitle).nativeBody(size: 12); Text(activity.meta).font(.system(size: 11, weight: .black)).foregroundColor(activity.color) }; Spacer() }.padding(12).background(NativeProfileStyle.insetSurface).clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1)) }
}

private struct NativeProfileEmptyState: View {
    let title: String; let subtitle: String; let icon: String
    var body: some View { HStack(alignment: .top, spacing: 12) { NativeIcon(symbol: icon, color: NativeProfileStyle.muted); VStack(alignment: .leading, spacing: 4) { Text(title).nativeTitle(15); Text(subtitle).nativeBody(size: 12) }; Spacer() }.padding(12).background(NativeProfileStyle.insetSurface).clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous)).overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1)) }
}

/// Privacy-first contact-graph entry point (WS-Social Phase 1). Hashes the
/// device address book on-device and surfaces ranked `social.suggestions`.
private struct NativeFindFriendsCard: View {
    @EnvironmentObject private var contactSyncStore: BytspotContactSyncStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator
    let sessionStore: BytspotSessionStore

    static let title = "Find friends"
    static let privacyCopy = "Bytspot matches your contacts on-device using salted hashes. Your address book is never uploaded or stored."
    static let guestCopy = "Sign in to match contacts privately."

    var body: some View {
        VStack(alignment: .leading, spacing: sessionStore.isAuthenticated ? 14 : 9) {
            HStack(alignment: .center, spacing: sessionStore.isAuthenticated ? 12 : 10) {
                ZStack {
                    LinearGradient(colors: [NativeTheme.purple, NativeTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "person.badge.plus").font(.system(size: sessionStore.isAuthenticated ? 19 : 15, weight: .bold)).foregroundColor(.white)
                }
                .frame(width: sessionStore.isAuthenticated ? 44 : 34, height: sessionStore.isAuthenticated ? 44 : 34)
                .clipShape(Circle())
                VStack(alignment: .leading, spacing: sessionStore.isAuthenticated ? 4 : 2) {
                    Text(sessionStore.isAuthenticated ? "CONTACTS" : "PRIVATE MATCHING").font(.system(size: sessionStore.isAuthenticated ? 11 : 10, weight: .heavy)).foregroundColor(NativeTheme.purple).tracking(1.2)
                    Text(Self.title).font(.system(size: 16, weight: .bold)).foregroundColor(NativeProfileStyle.title)
                    Text(sessionStore.isAuthenticated ? Self.privacyCopy : Self.guestCopy).font(.system(size: sessionStore.isAuthenticated ? 12 : 11.5, weight: .medium)).foregroundColor(NativeProfileStyle.body).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer()
            }
            if sessionStore.isAuthenticated {
                NativeProfileMicroChip("On-device matching", icon: "lock.shield.fill", color: NativeTheme.cyan)
            }
            if sessionStore.isAuthenticated {
                syncControls
                suggestionList
            } else {
                Button(action: { authCoordinator.handle(.signIn(.apple), sessionStore: sessionStore) }) {
                    HStack(spacing: 8) {
                        Image(systemName: "apple.logo").font(.system(size: 13, weight: .black))
                        Text("Sign in to find friends").font(.system(size: 13.5, weight: .black))
                    }
                    .foregroundColor(NativeProfileStyle.onVibrant)
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(NativeTheme.cyan)
                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
                    .buttonStyle(.plain)
                Text("Contacts stay off until sync.").nativeBody(size: 11, color: NativeProfileStyle.muted)
            }
        }
        .padding(sessionStore.isAuthenticated ? NativeProfileStyle.cardPadding : 14)
        .nativeProfileCard(border: NativeTheme.purple.opacity(0.58), accent: NativeTheme.purple)
        .accessibilityIdentifier("native-find-friends")
    }

    @ViewBuilder private var syncControls: some View {
        Button(action: { Task { await contactSyncStore.syncDeviceContacts(sessionStore: sessionStore) } }) {
            HStack(spacing: 8) {
                Image(systemName: "person.2.fill").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                Text(ctaTitle).font(.system(size: 15, weight: .bold)).foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(LinearGradient(colors: [NativeTheme.cyan, NativeTheme.purple], startPoint: .leading, endPoint: .trailing))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: NativeTheme.purple.opacity(0.24), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
        .disabled(contactSyncStore.phase == .syncing || contactSyncStore.phase == .requesting)
        if let summary = contactSyncStore.lastSummary {
            Text(summary).nativeBody(size: 11.5, color: NativeTheme.cyan)
        }
        if contactSyncStore.phase == .denied {
            Text("Contacts access is off. Enable it in Settings to find friends.").nativeBody(size: 11.5, color: NativeTheme.orange)
        }
        if contactSyncStore.phase == .failed {
            Text("Couldn't sync contacts. Try again in a moment.").nativeBody(size: 11.5, color: NativeTheme.orange)
        }
    }

    private var ctaTitle: String {
        switch contactSyncStore.phase {
        case .requesting: return "Requesting access…"
        case .syncing: return "Syncing contacts…"
        default: return contactSyncStore.lastSummary == nil ? "Sync contacts to find friends" : "Re-sync contacts"
        }
    }

    @ViewBuilder private var suggestionList: some View {
        if contactSyncStore.suggestions.isEmpty {
            if contactSyncStore.lastSummary != nil || contactSyncStore.phase == .failed || contactSyncStore.phase == .denied {
                Text("No matches yet. Sync your contacts to see friends already on Bytspot.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(NativeProfileStyle.muted)
            }
        } else {
            VStack(spacing: 8) {
                ForEach(contactSyncStore.suggestions.prefix(8)) { suggestion in
                    NativeFriendSuggestionRow(suggestion: suggestion)
                }
            }
        }
    }
}

private struct NativeFriendSuggestionRow: View {
    let suggestion: NativeFriendSuggestion

    var body: some View {
        HStack(spacing: 12) {
            NativeIcon(symbol: suggestion.mutual ? "person.2.circle.fill" : "person.crop.circle", color: suggestion.mutual ? NativeTheme.purple : NativeTheme.cyan)
            VStack(alignment: .leading, spacing: 3) {
                Text(suggestion.name).nativeTitle(16)
                Text(suggestion.reason).nativeBody(size: 12)
            }
            Spacer()
            if suggestion.mutual {
                Text("MUTUAL").font(.system(size: 10, weight: .black)).foregroundColor(.white).padding(.horizontal, 8).padding(.vertical, 5).background(NativeTheme.purple).clipShape(Capsule())
            }
        }
        .padding(12)
        .background(NativeProfileStyle.insetSurface)
        .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
    }
}

private struct NativeParkerBenefitsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Parker progress").font(.system(size: 18, weight: .heavy)).foregroundColor(NativeProfileStyle.title)
                    Text(NativeProfileDefaults.accessLevel).font(.system(size: 13, weight: .bold)).foregroundColor(NativeProfileStyle.body)
                }
                Spacer()
                VStack(spacing: 2) {
                    Text("BOOKINGS").font(.system(size: 10, weight: .heavy)).foregroundColor(NativeProfileStyle.muted).tracking(1.4)
                    Text("\(NativeProfileDefaults.bookings)").font(.system(size: 20, weight: .heavy)).foregroundColor(NativeProfileStyle.title)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(NativeProfileStyle.insetSurface)
                .clipShape(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: NativeProfileStyle.rowRadius, style: .continuous).stroke(NativeProfileStyle.strongBorder, lineWidth: 1))
            }
            VStack(spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    NativeProfileMicroChip("PROGRESS", icon: "chart.line.uptrend.xyaxis", color: NativeTheme.cyan)
                    Spacer()
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(NativeProfileDefaults.progressLabel).font(.system(size: 12, weight: .heavy)).foregroundColor(NativeProfileStyle.body)
                    Spacer()
                    Text("\(NativeProfileDefaults.progressPercent)%").font(.system(size: 11, weight: .bold)).foregroundColor(NativeProfileStyle.muted)
                }
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(NativeProfileStyle.insetSurface)
                        Capsule()
                            .fill(LinearGradient(colors: [NativeTheme.cyan, NativeTheme.pink, NativeTheme.orange], startPoint: .leading, endPoint: .trailing))
                            .frame(width: proxy.size.width * CGFloat(NativeProfileDefaults.progressPercent) / 100)
                    }
                }
                .frame(height: 8)
            }
            .padding(12)
            .background(NativeProfileStyle.insetSurface.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativeProfileStyle.strongBorder, lineWidth: 1))
            VStack(alignment: .leading, spacing: 8) {
                ForEach(NativeProfileDefaults.benefits, id: \.self) { benefit in
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 14, weight: .bold)).foregroundColor(NativeTheme.cyan)
                        Text(benefit).font(.system(size: 12, weight: .bold)).foregroundColor(NativeProfileStyle.title)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(NativeProfileStyle.cardPadding)
        .nativeProfileCard(accent: NativeTheme.cyan)
        .accessibilityIdentifier("native-profile-benefits")
    }
}

private struct NativeProfileSummaryCard: View {
    let eyebrow: String
    let title: String
    let badge: String
    let icon: String
    let gradient: [Color]
    let border: Color
    let copy: String
    let action: () -> Void

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    ZStack {
                        LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                        Image(systemName: icon).font(.system(size: 22, weight: .bold)).foregroundColor(.white)
                    }
                    .frame(width: 48, height: 48)
                    .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(eyebrow).font(.system(size: 13, weight: .heavy)).foregroundColor(NativeProfileStyle.muted)
                        Text(title).font(.system(size: 22, weight: .bold)).foregroundColor(NativeProfileStyle.title)
                    }
                    Spacer()
                    NativeProfileMicroChip(badge, color: gradient.last ?? NativeTheme.cyan)
                    Image(systemName: "chevron.right").font(.system(size: 16, weight: .bold)).foregroundColor(NativeProfileStyle.body)
                }
                Text(copy).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeProfileStyle.body).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(NativeProfileStyle.cardPadding)
            .nativeProfileCard(border: border, accent: gradient.first)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeRewardsCard: View {
    let action: () -> Void

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    HStack(spacing: 12) {
                        ZStack {
                            LinearGradient(colors: [NativeTheme.purple, NativeTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
                            Image(systemName: "sparkles").font(.system(size: 22, weight: .bold)).foregroundColor(.white)
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("MEMBERSHIP").font(.system(size: 13, weight: .heavy)).foregroundColor(NativeTheme.purple)
                            Text("Rewards & badges").font(.system(size: 22, weight: .bold)).foregroundColor(NativeProfileStyle.title)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 18, weight: .bold)).foregroundColor(NativeProfileStyle.body)
                }
                HStack(spacing: 8) {
                    NativeProfileMicroChip("\(NativeProfileDefaults.tierName) rewards", icon: "crown.fill", color: NativeTheme.purple)
                    NativeProfileMicroChip("\(NativeProfileDefaults.badgesUnlocked)/\(NativeProfileDefaults.badgesTotal) badges", icon: "rosette", color: NativeTheme.cyan)
                    Spacer()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .nativeProfileCard(border: NativeTheme.purple.opacity(0.72), accent: NativeTheme.purple)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeInviteFriendCard: View {
    private let referralUrl = "https://bytspot.app?ref=guest"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                ZStack {
                    LinearGradient(colors: [NativeTheme.pink, NativeTheme.cyan], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "square.and.arrow.up").font(.system(size: 20, weight: .bold)).foregroundColor(.white)
                }
                .frame(width: 44, height: 44)
                .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Invite a Friend").font(.system(size: 15, weight: .bold)).foregroundColor(NativeProfileStyle.title)
                    Text("Share your personal Bytspot link").font(.system(size: 12, weight: .semibold)).foregroundColor(NativeProfileStyle.body)
                }
                Spacer()
                NativeProfileMicroChip("Social", color: NativeTheme.pink)
            }
            HStack(spacing: 8) {
                Text(referralUrl).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundColor(NativeProfileStyle.body).lineLimit(1)
                Spacer()
                Text("Copy")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: 0xF0ABFC))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .overlay(Capsule().stroke(NativeTheme.pink.opacity(0.4), lineWidth: 1))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(NativeProfileStyle.referralPillSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1))
            HStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                Text("Share Invite Link").font(.system(size: 15, weight: .bold)).foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(LinearGradient(colors: [NativeTheme.pink, NativeTheme.cyan], startPoint: .leading, endPoint: .trailing))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(NativeProfileStyle.cardPadding)
        .nativeProfileCard(border: NativeTheme.pink.opacity(0.72), accent: NativeTheme.pink)
    }
}

private struct NativeProfileMenuItem {
    let label: String
    let icon: String
    let panel: NativeProfilePanel
    var badge: String? = "NATIVE"
    var danger: Bool = false
}

private struct NativeProfileIAHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .black))
                .foregroundColor(NativeTheme.cyan)
                .tracking(1.1)
            Text(subtitle)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(NativeProfileStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8)
        .accessibilityIdentifier("native-profile-ia-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }
}

private enum NativeProfileMenuSectionKind {
    case placesActivity, account, preferences, appSettings, safetyLegal

    var title: String {
        switch self {
        case .placesActivity: return "Places & Activity"
        case .account: return "Account"
        case .preferences: return "Preferences"
        case .appSettings: return "App Settings"
        case .safetyLegal: return "Safety & Legal"
        }
    }

    var items: [NativeProfileMenuItem] {
        switch self {
        case .placesActivity:
            return [
                NativeProfileMenuItem(label: "Saved Spots", icon: "heart.fill", panel: .savedSpots),
                NativeProfileMenuItem(label: "Places I've Been", icon: "clock.fill", panel: .placesVisited)
            ]
        case .account:
            return [
                NativeProfileMenuItem(label: "Personal Information", icon: "person.text.rectangle.fill", panel: .personalInformation),
                NativeProfileMenuItem(label: "Payment Methods", icon: "creditcard.fill", panel: .paymentMethods),
                NativeProfileMenuItem(label: "My Vehicles", icon: "car.fill", panel: .vehicles)
            ]
        case .preferences:
            return [
                NativeProfileMenuItem(label: "Vibe Preferences", icon: "sparkles", panel: .vibePreferences),
                NativeProfileMenuItem(label: "Parking Preferences", icon: "parkingsign.circle.fill", panel: .parkingPreferences),
                NativeProfileMenuItem(label: "Notifications", icon: "bell.fill", panel: .notifications),
                NativeProfileMenuItem(label: "Location & Privacy", icon: "mappin.and.ellipse", panel: .locationPrivacy)
            ]
        case .appSettings:
            return [
                NativeProfileMenuItem(label: "General", icon: "gearshape.fill", panel: .generalSettings),
                NativeProfileMenuItem(label: "Appearance", icon: "circle.lefthalf.filled", panel: .appearance)
            ]
        case .safetyLegal:
            return [
                NativeProfileMenuItem(label: "Delete Account", icon: "trash.fill", panel: .deleteAccount, badge: "SAFE", danger: true),
                NativeProfileMenuItem(label: "Privacy Policy", icon: "shield.fill", panel: .privacyPolicy),
                NativeProfileMenuItem(label: "Terms of Service", icon: "doc.text.fill", panel: .termsOfService),
                NativeProfileMenuItem(label: "Disclaimer", icon: "exclamationmark.triangle.fill", panel: .disclaimer)
            ]
        }
    }
}

private struct NativeProfileMenuRow: View {
    let item: NativeProfileMenuItem
    let action: () -> Void

    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(item.danger ? NativeProfileStyle.danger : NativeProfileStyle.menuIconSurface)
                    Image(systemName: item.icon).font(.system(size: 16, weight: .bold)).foregroundColor(item.danger ? .white : NativeTheme.cyan)
                }
                .frame(width: 40, height: 40)
                Text(item.label).font(.system(size: 15, weight: item.danger ? .heavy : .semibold)).foregroundColor(item.danger ? .white : NativeProfileStyle.title)
                Spacer()
                if let badge = item.badge {
                    Text(badge)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: 0xE9D5FF))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(NativeTheme.purple.opacity(0.4))
                        .clipShape(Capsule())
                }
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundColor(item.danger ? .white : NativeProfileStyle.body)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(item.danger ? NativeProfileStyle.danger : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-profile-menu-row-\(item.label.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }
}

private struct NativeProfileMenuGroup: View {
    let section: NativeProfileMenuSectionKind
    let openPanel: (NativeProfilePanel) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(section.title.uppercased())
                .font(.system(size: 13, weight: .heavy))
                .foregroundColor(NativeProfileStyle.body)
                .tracking(0.5)
                .padding(.leading, 8)
            VStack(spacing: 0) {
                let items = section.items
                ForEach(Array(items.enumerated()), id: \.element.label) { index, item in
                    NativeProfileMenuRow(item: item) {
                        openPanel(item.panel)
                    }
                    if index != items.count - 1 {
                        Rectangle().fill(NativeProfileStyle.hairline).frame(height: 1)
                    }
                }
            }
            .background(NativeProfileStyle.cardSurface())
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(NativeProfileStyle.cardBorder, lineWidth: 1.25))
            .shadow(color: NativeTheme.softShadow, radius: 16, x: 0, y: 8)
        }
        .accessibilityIdentifier("native-profile-menu-\(section.title.lowercased())")
    }
}

private struct NativeProfileLogoutButton: View {
    let sessionStore: BytspotSessionStore
    @EnvironmentObject private var authCoordinator: NativeAuthCoordinator

    private var isSignedIn: Bool { sessionStore.isAuthenticated || sessionStore.isGuest }

    var body: some View {
        Button(action: {
            nativeImpactLight()
            authCoordinator.handle(isSignedIn ? .signOut : .continueAsGuest, sessionStore: sessionStore)
        }) {
            HStack(spacing: 8) {
                Image(systemName: isSignedIn ? "rectangle.portrait.and.arrow.right" : "person.crop.circle.badge.plus").font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                Text(isSignedIn ? "Log Out" : "Continue as Guest").font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(NativeProfileStyle.danger)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(NativeProfileStyle.dangerBorder, lineWidth: 1.25))
            .shadow(color: Color(hex: 0xDC2626).opacity(0.35), radius: 20, x: 0, y: 16)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-profile-logout")
    }
}

private struct NativeProfileVersionLabel: View {
    private var version: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.1.6"
    }

    var body: some View {
        Text("Bytspot v\(version)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(NativeProfileStyle.muted)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 8)
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
    let openNativeProfile: () -> Void
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
    static let prohibitedContextSnapshotLabels = ["context snapshot", "aggregate " + "crowd", "time" + "/day"]
    static let visibleHomeSurfaceLabels = ["AI Pick", "What's Happening Tonight", "Right Now in Midtown", "Trending Now", "What are you feeling?", "Nearby"]

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

                    Button(action: openNativeProfile) {
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
                                    LinearGradient(colors: [NativeTheme.orange.opacity(0.34), NativeTheme.purple.opacity(0.22), NativePolish.elevatedSurface], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    Text(event.emoji).font(.system(size: 46)).frame(maxWidth: .infinity, maxHeight: .infinity)
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
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    Text(categoryEmoji).font(.system(size: 26)).frame(width: 50, height: 50).background(eyebrowColor.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 4) {
                            Image(systemName: eyebrowIcon).font(.system(size: 10, weight: .black))
                            Text(eyebrow).font(.system(size: 11, weight: .black))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(eyebrowColor.opacity(0.92))
                        .clipShape(Capsule())
                        Text(venue.name).font(.system(size: 23, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }
                Text(venue.address)
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(NativeTheme.textSecondary)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    if !crowdLabel.isEmpty {
                        Text("\(crowdEmoji) \(crowdLabel)")
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(NativeTheme.selectedControlSurface)
                            .overlay(Capsule().stroke(NativePolish.softBorder, lineWidth: 1))
                            .clipShape(Capsule())
                    }
                    if let r = venue.rating {
                        HStack(spacing: 3) {
                            Image(systemName: "star.fill").font(.system(size: 9, weight: .black))
                            Text(String(format: "%.1f", r)).font(.system(size: 10, weight: .black))
                        }
                        .foregroundColor(.black)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(NativeTheme.orange.opacity(0.92))
                        .clipShape(Capsule())
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        Text(ctaTitle).font(.system(size: 13, weight: .black))
                        Image(systemName: "arrow.right").font(.system(size: 11, weight: .black))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background(NativeTheme.cyan)
                    .clipShape(Capsule())
                }
            }
            .padding(16)
            .background(LinearGradient(colors: [NativePolish.elevatedSurface, eyebrowColor.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous).stroke(eyebrowColor.opacity(0.24), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: NativePolish.cardRadius, style: .continuous))
            .shadow(color: NativeTheme.softShadow, radius: 18, x: 0, y: 10)
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
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Text(card.title.contains("GH Akwaaba") ? "🇬🇭" : "🛎️")
                        .font(.system(size: 30))
                        .frame(width: 54, height: 54)
                        .background(NativeTheme.cyan.opacity(0.14))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Spacer(minLength: 0)
                    Text("SERVICES").serviceChip(color: NativeTheme.cyan, foreground: .black)
                }
                VStack(alignment: .leading, spacing: 7) {
                    if card.membershipRequired { Text("MEMBER").serviceChip(color: NativeTheme.purple, foreground: .white) }
                    Text(card.title).font(.system(size: 19, weight: .black)).foregroundColor(colorScheme == .dark ? .white : NativeTheme.textPrimary).lineLimit(2)
                    Text(card.metadataLine).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan).lineLimit(1)
                    HStack(spacing: 6) {
                        Text("Vibe \(card.vibeScore)/10").serviceChip(color: colorScheme == .dark ? Color.black.opacity(0.58) : NativeTheme.selectedControlSurface, foreground: colorScheme == .dark ? .white : NativeTheme.textPrimary)
                        Text(card.cta).serviceChip(color: NativeTheme.cyan, foreground: .black)
                    }
                }
            }
            .padding(14)
            .frame(height: 188)
            .background(LinearGradient(colors: [NativePolish.elevatedSurface, NativeTheme.cyan.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing))
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
    @State private var detailVenue: NativeVenueSummary?
    @State private var didApplyDetailPreview = false
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
    static let detailEnvironmentKey = "BYT_NATIVE_DISCOVER_DETAIL"
    static let detailDefaultsKey = "bytspot_native_discover_detail"

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
        .onAppear { applyDetailPreviewIfRequested() }
        .task { applyDetailPreviewIfRequested() }
        .onChange(of: tabContentStore.snapshot.discoverCards.count) { _ in applyDetailPreviewIfRequested() }
        .sheet(item: $detailVenue) { venue in
            let detail = NativeVenueDetailView(venue: venue, openHybrid: openHybrid)
            if #available(iOS 16.0, *) {
                detail
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            } else {
                detail
            }
        }
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
                        openDetails: { detailVenue = venueForDetail(card) },
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

    private func applyDetailPreviewIfRequested() {
        guard !didApplyDetailPreview, detailVenue == nil, let token = Self.previewDetailToken else { return }
        let lower = token.lowercased()
        let lookup = rankedCards + Self.curatedCards
        let card = lookup.first { card in
            card.id.lowercased() == lower || card.title.lowercased().contains(lower) || lower.contains(card.title.lowercased())
        } ?? (lower == "service" ? lookup.first(where: { $0.type == "service" }) : nil)
        guard let card else { return }
        didApplyDetailPreview = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { detailVenue = venueForDetail(card) }
    }

    private static var previewDetailToken: String? {
        (ProcessInfo.processInfo.environment[detailEnvironmentKey] ?? UserDefaults.standard.string(forKey: detailDefaultsKey) ?? nativeLaunchArgument("byt-native-discover-detail")).flatMap { $0.isEmpty ? nil : $0 }
    }

    private static func spec(from card: NativeDiscoverSummary) -> DiscoverCardSpec {
        DiscoverCardSpec(id: card.id, type: card.type, title: card.title, subtitle: card.subtitle, distance: card.distance, rating: card.rating, icon: card.icon, verified: card.verified, entryType: card.entryType, cta: card.cta, imageUrl: card.imageUrl, categoryLabel: card.categoryLabel, badgeText: card.badgeText, metadataLine: card.metadataLine, features: card.features, vibeScore: card.vibeScore, availability: card.availability, membershipRequired: card.membershipRequired)
    }

    private func venueForDetail(_ card: DiscoverCardSpec) -> NativeVenueSummary {
        let candidates = tabContentStore.snapshot.venues.isEmpty ? NativeTabContentSnapshot.fallback.venues : tabContentStore.snapshot.venues
        return Self.venueForDetail(card, venues: candidates)
    }

    private static func venueForDetail(_ card: DiscoverCardSpec, venues candidates: [NativeVenueSummary]) -> NativeVenueSummary {
        if let direct = candidates.first(where: { $0.id == card.id || "venue-\($0.id)" == card.id || $0.name.caseInsensitiveCompare(card.title) == .orderedSame }) { return direct }
        let parsedRating = Double(card.rating)
        let crowdLevel = max(1, min(4, Int(round(Double(card.vibeScore) / 2.5))))
        let parking = card.type == "parking" ? NativeParkingSummary(totalAvailable: 158, priceLabel: card.metadataLine.components(separatedBy: " • ").first ?? "—") : NativeParkingSummary(totalAvailable: 0, priceLabel: card.entryType == "paid" ? card.metadataLine.components(separatedBy: " • ").first ?? "Paid entry" : "Free")
        return NativeVenueSummary(id: card.id, name: card.title, category: card.type, address: card.subtitle, distance: card.distance, rating: parsedRating, latitude: 33.7866, longitude: -84.3833, crowd: NativeCrowdSummary(level: crowdLevel, label: card.availability.isEmpty ? "Open" : card.availability, waitMins: nil), parking: parking, verifiedPatchId: card.verified && card.membershipRequired ? "DISCOVER-VERIFIED" : nil, imageUrl: card.imageUrl)
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

struct NativeVenueDetailAction: Identifiable, Equatable {
    let id: String
    let title: String
    let systemImage: String
    let kind: NativeVenueActionKind
}

enum NativeVenueActionKind: Equatable {
    case device
    case local
    case capability(BytspotTrustCapability)
    case authedWrite(endpoint: String, idempotent: Bool)
    case handoff
}

enum NativeVenueDetailContract {
    static let surfaceCapability: BytspotTrustCapability = .viewVenue
    static let checkinEndpoint = "venues.checkin"
    static let checkinIdempotent = true
    static let actions: [NativeVenueDetailAction] = [
        NativeVenueDetailAction(id: "navigate", title: "Navigate", systemImage: "arrow.triangle.turn.up.right.circle.fill", kind: .device),
        NativeVenueDetailAction(id: "call", title: "Call", systemImage: "phone.fill", kind: .device),
        NativeVenueDetailAction(id: "share", title: "Share", systemImage: "square.and.arrow.up.fill", kind: .device),
        NativeVenueDetailAction(id: "save", title: "Save", systemImage: "heart.fill", kind: .local),
        NativeVenueDetailAction(id: "getTickets", title: "Get Tickets", systemImage: "ticket.fill", kind: .capability(.saveToWallet)),
        NativeVenueDetailAction(id: "checkIn", title: "Check In", systemImage: "checkmark.seal.fill", kind: .authedWrite(endpoint: checkinEndpoint, idempotent: checkinIdempotent)),
        NativeVenueDetailAction(id: "concierge", title: "Concierge", systemImage: "sparkles", kind: .handoff),
        NativeVenueDetailAction(id: "bookRide", title: "Book Ride", systemImage: "car.fill", kind: .capability(.createCheckoutHold))
    ]
    static var actionIDs: [String] { actions.map(\.id) }
}

enum NativeVenueDetailPresentation {
    static func actionTitle(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        guard action.id == "getTickets" else { return action.title }
        if isDiningVenue(venue) { return "View Menu" }
        if isEventOrPassVenue(venue) { return venue.name.localizedCaseInsensitiveContains("pass") ? "View Pass" : "Get Tickets" }
        if venue.discoverType == "parking" { return "Reserve" }
        return action.title
    }

    static func actionSystemImage(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        guard action.id == "getTickets" else { return action.systemImage }
        if isDiningVenue(venue) { return "menucard.fill" }
        if venue.discoverType == "parking" { return "parkingsign.circle.fill" }
        return action.systemImage
    }

    static func headerBadgeTitle(for venue: NativeVenueSummary) -> String? {
        guard let patchId = venue.verifiedPatchId?.trimmingCharacters(in: .whitespacesAndNewlines), !patchId.isEmpty else { return nil }
        if patchId == "DISCOVER-VERIFIED" { return venue.category.lowercased().contains("service") ? "MEMBER SERVICE" : nil }
        return "VERIFIED PATCH"
    }

    static func detailSection(for venue: NativeVenueSummary) -> NativeVenueDetailSection? {
        if isDiningVenue(venue) {
            return NativeVenueDetailSection(
                title: "Dining highlights",
                subtitle: venue.name.localizedCaseInsensitiveContains("broni") ? "Ghanaian comfort food built for pickup, delivery, and matchday groups." : "Menu, pickup, and table options for this dining spot.",
                systemImage: "fork.knife",
                highlights: venue.name.localizedCaseInsensitiveContains("broni") ? ["Jollof + chicken", "Banku + tilapia", "Family-style portions", "Pickup or delivery"] : ["Menu preview", "Pickup options", "Group plans", "Ask Concierge"]
            )
        }
        if isEventOrPassVenue(venue) {
            return NativeVenueDetailSection(
                title: "Pass access",
                subtitle: venue.name.localizedCaseInsensitiveContains("akwaaba") ? "Premium matchday access with digital pass delivery and host support." : "Ticketing, arrival, and access details for this event.",
                systemImage: "ticket.fill",
                highlights: venue.name.localizedCaseInsensitiveContains("akwaaba") ? ["Digital pass", "Fast-track entry", "VIP lounge", "On-site host"] : ["Tickets", "Entry details", "Arrival help", "Share pass"]
            )
        }
        if venue.discoverType == "parking" {
            return NativeVenueDetailSection(title: "Parking details", subtitle: "Availability, pricing, and arrival support before you route.", systemImage: "parkingsign.circle.fill", highlights: ["Reserve ahead", "Price shown", "Walk time", "Covered options"])
        }
        return nil
    }

    static func isDiningVenue(_ venue: NativeVenueSummary) -> Bool {
        let text = searchableText(for: venue)
        return venue.discoverType == "dining" || venue.discoverType == "coffee" || text.contains("food") || text.contains("dining") || text.contains("cooking") || text.contains("pickup") || text.contains("delivery") || text.contains("taste")
    }

    static func isEventOrPassVenue(_ venue: NativeVenueSummary) -> Bool {
        let text = searchableText(for: venue)
        return venue.discoverType == "entertainment" || text.contains("pass") || text.contains("ticket") || text.contains("event") || text.contains("matchday") || text.contains("fifa")
    }

    private static func searchableText(for venue: NativeVenueSummary) -> String {
        "\(venue.name) \(venue.category) \(venue.address) \(venue.crowd?.label ?? "")".lowercased()
    }
}

struct NativeVenueDetailSection: Equatable {
    let title: String
    let subtitle: String
    let systemImage: String
    let highlights: [String]
}

struct NativeVenueOpenStatus: Equatable {
    let label: String
    let isOpen: Bool
    let detail: String
}

enum NativeVenueHours {
    struct Hours { let open: Int; let close: Int; let days: Set<Int> }
    private static let allDays = Set(0...6)
    private static let categoryHours: [String: Hours] = [
        "bar": Hours(open: 17, close: 26, days: allDays),
        "nightlife": Hours(open: 20, close: 26, days: [3, 4, 5, 6]),
        "restaurant": Hours(open: 11, close: 22, days: allDays),
        "dining": Hours(open: 11, close: 22, days: allDays),
        "coffee": Hours(open: 7, close: 19, days: allDays),
        "shopping": Hours(open: 10, close: 21, days: allDays),
        "entertainment": Hours(open: 12, close: 24, days: allDays),
        "fitness": Hours(open: 6, close: 22, days: allDays),
        "service": Hours(open: 9, close: 21, days: allDays),
        "parking": Hours(open: 0, close: 24, days: allDays),
        "default": Hours(open: 10, close: 22, days: allDays)
    ]

    static func openStatus(category: String, date: Date = Date()) -> NativeVenueOpenStatus {
        let components = Calendar.current.dateComponents([.hour, .minute, .weekday], from: date)
        return openStatus(category: category, hour: components.hour ?? 0, minute: components.minute ?? 0, weekday: max((components.weekday ?? 1) - 1, 0))
    }

    static func openStatus(category: String, hour: Int, minute: Int, weekday: Int) -> NativeVenueOpenStatus {
        let hours = hours(for: category)
        guard hours.days.contains(weekday) else { return NativeVenueOpenStatus(label: "Opens \(timeLabel(hours.open))", isOpen: false, detail: hoursDetail(hours)) }
        let now = hour * 60 + minute
        let open = hours.open * 60
        let close = hours.close * 60
        let normalizedClose = (hours.close > 24 ? hours.close - 24 : hours.close) * 60
        let isOpen = hours.close > 24 ? now >= open || now < normalizedClose : now >= open && now < close
        if !isOpen { return NativeVenueOpenStatus(label: "Opens \(timeLabel(hours.open))", isOpen: false, detail: hoursDetail(hours)) }
        let minutesUntilClose = hours.close > 24 && now < normalizedClose ? normalizedClose - now : close - now
        if minutesUntilClose > 0 && minutesUntilClose <= 60 { return NativeVenueOpenStatus(label: "Closes in \(minutesUntilClose)m", isOpen: true, detail: hoursDetail(hours)) }
        return NativeVenueOpenStatus(label: "Open Now", isOpen: true, detail: hoursDetail(hours))
    }

    static func hours(for category: String) -> Hours {
        let normalized = category.lowercased()
        return categoryHours.first(where: { normalized.contains($0.key) })?.value ?? categoryHours[normalized] ?? categoryHours["default"]!
    }

    static func hoursDetail(_ hours: Hours) -> String { "Daily · \(timeLabel(hours.open))–\(timeLabel(hours.close))" }

    private static func timeLabel(_ value: Int) -> String {
        let hour = value >= 24 ? value - 24 : value
        if hour == 0 { return "12am" }
        if hour == 12 { return "12pm" }
        return hour > 12 ? "\(hour - 12)pm" : "\(hour)am"
    }
}

private struct NativeVenueDetailView: View {
    let venue: NativeVenueSummary
    let openHybrid: (BytspotHybridRoute) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var isSaved = false
    @State private var didCheckIn = false
    @State private var statusMessage: String?

    private var openStatus: NativeVenueOpenStatus { NativeVenueHours.openStatus(category: venue.discoverType) }
    private var currentTrustLevel: BytspotTrustLevel { .staticDiscovery }
    private var ratingText: String { venue.rating.map { String(format: "%.1f", $0) } ?? "4.9" }
    private var crowdText: String { venue.crowd.map { "\($0.label)" + ($0.waitMins.map { " · \($0)m wait" } ?? "") } ?? "Live crowd pending" }
    private var entryText: String { venue.parking.priceLabel == "—" ? "Free entry" : venue.parking.priceLabel }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                hero
                metricsRow
                actionGrid
                if let statusMessage { statusBanner(statusMessage) }
                infoSection
                if let section = NativeVenueDetailPresentation.detailSection(for: venue) { detailSpotlight(section) }
            }
            .padding(18)
            .padding(.bottom, 28)
        }
        .background(NativeTheme.background.ignoresSafeArea())
        .accessibilityIdentifier("native-venue-detail")
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            NativeRemoteImage(url: venue.imageUrl, fallbackColors: [NativeTheme.cyan.opacity(0.45), NativeTheme.purple.opacity(0.34), NativeTheme.pink.opacity(0.24)], fallbackEmoji: categoryEmoji, emojiSize: 112, emojiOpacity: 0.22)
                .frame(height: 255)
            LinearGradient(colors: [.clear, Color.black.opacity(0.74)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if let badge = NativeVenueDetailPresentation.headerBadgeTitle(for: venue) {
                        pill(badge, color: NativeTheme.emerald, foreground: .black)
                    }
                    pill(openStatus.label.uppercased(), color: openStatus.isOpen ? NativeTheme.emerald : NativeTheme.textTertiary, foreground: openStatus.isOpen ? .black : .white)
                    Spacer()
                    Button(action: { dismiss() }) { Image(systemName: "xmark").font(.system(size: 14, weight: .black)).foregroundColor(.white).frame(width: 36, height: 36).background(Color.black.opacity(0.42)).clipShape(Circle()) }
                        .buttonStyle(.plain)
                }
                Text(venue.name).font(.system(size: 34, weight: .black)).foregroundColor(.white).lineLimit(2).minimumScaleFactor(0.78)
                Text(venue.address).font(.system(size: 15, weight: .bold)).foregroundColor(.white.opacity(0.86)).lineLimit(2)
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(NativePolish.strongBorder, lineWidth: 1.1))
        .shadow(color: NativeTheme.panelShadow, radius: 20, x: 0, y: 10)
    }

    private var metricsRow: some View {
        HStack(spacing: 9) {
            metric("star.fill", ratingText, "1.2k reviews", NativeTheme.blackAmber)
            metric("location.fill", venue.distance, "away", NativeTheme.cyan)
            metric("person.3.fill", crowdText, "crowd", NativeTheme.pink)
        }
    }

    private var actionGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(NativeVenueDetailContract.actions) { action in
                Button(action: { handle(action) }) { actionTile(action) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("native-venue-action-\(action.id)")
            }
        }
    }

    private var infoSection: some View {
        VStack(spacing: 10) {
            infoRow("clock.fill", "Hours", openStatus.detail, openStatus.label, NativeTheme.cyan)
            infoRow("mappin.and.ellipse", "Location", venue.address, venue.distance == "—" ? "Atlanta Midtown" : "\(venue.distance) away", NativeTheme.orange)
            infoRow(categoryDetailIcon, categoryDetailTitle, categoryPrimaryDetail, categorySecondaryDetail, NativeTheme.emerald)
        }
    }

    private func actionTile(_ action: NativeVenueDetailAction) -> some View {
        let locked = isLocked(action)
        return HStack(spacing: 11) {
            Image(systemName: locked ? "lock.fill" : NativeVenueDetailPresentation.actionSystemImage(for: action, venue: venue)).font(.system(size: 18, weight: .black)).foregroundColor(locked ? NativeTheme.textTertiary : actionAccent(action))
                .frame(width: 36, height: 36).background((locked ? NativeTheme.textTertiary : actionAccent(action)).opacity(0.13)).clipShape(Circle())
            Text(NativeVenueDetailPresentation.actionTitle(for: action, venue: venue)).font(.system(size: 14, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(1).minimumScaleFactor(0.78)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(minHeight: 58)
        .background(NativePolish.elevatedSurface)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(locked ? NativePolish.softBorder : actionAccent(action).opacity(0.26), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func metric(_ icon: String, _ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).font(.system(size: 14, weight: .black)).foregroundColor(color)
            Text(value).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(1).minimumScaleFactor(0.72)
            Text(label).font(.system(size: 10.5, weight: .bold)).foregroundColor(NativeTheme.textTertiary).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).background(NativePolish.elevatedSurface).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func infoRow(_ icon: String, _ title: String, _ primary: String, _ secondary: String, _ color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 17, weight: .black)).foregroundColor(color).frame(width: 34, height: 34).background(color.opacity(0.13)).clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary); Text(primary).nativeBody(size: 13.5); Text(secondary).font(.system(size: 12, weight: .bold)).foregroundColor(color) }
            Spacer()
        }.padding(14).background(NativePolish.elevatedSurface).overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NativePolish.softBorder, lineWidth: 1)).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func detailSpotlight(_ section: NativeVenueDetailSection) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: section.systemImage).font(.system(size: 17, weight: .black)).foregroundColor(NativeTheme.cyan).frame(width: 36, height: 36).background(NativeTheme.cyan.opacity(0.13)).clipShape(Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(section.title).font(.system(size: 16, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    Text(section.subtitle).nativeBody(size: 13.5).fixedSize(horizontal: false, vertical: true)
                }
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(section.highlights, id: \.self) { highlight in
                    Text(highlight).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(1).minimumScaleFactor(0.78).padding(.horizontal, 10).frame(maxWidth: .infinity, minHeight: 34, alignment: .leading).background(NativeTheme.selectedControlSurface).clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
            }
        }
        .padding(14)
        .background(NativePolish.elevatedSurface)
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(NativeTheme.cyan.opacity(0.18), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func statusBanner(_ text: String) -> some View { Text(text).font(.system(size: 13, weight: .black)).foregroundColor(.black).padding(12).frame(maxWidth: .infinity, alignment: .leading).background(NativeTheme.cyan).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)) }
    private func pill(_ title: String, color: Color, foreground: Color) -> some View { Text(title).font(.system(size: 10.5, weight: .black, design: .monospaced)).foregroundColor(foreground).tracking(1).padding(.horizontal, 9).padding(.vertical, 6).background(color).clipShape(Capsule()) }

    private func handle(_ action: NativeVenueDetailAction) {
        nativeImpactLight()
        switch action.kind {
        case .device:
            handleDevice(action.id)
        case .local:
            isSaved.toggle(); statusMessage = isSaved ? "Saved \(venue.name)." : "Removed \(venue.name) from saved spots."
        case .capability(let capability):
            if capability == .saveToWallet { statusMessage = "Opening \(NativeVenueDetailPresentation.actionTitle(for: action, venue: venue).lowercased()) options for \(venue.name)."; openHybrid(.access) }
            else { statusMessage = "Taking you to secure booking for \(venue.name)."; openHybrid(.map) }
        case .authedWrite:
            Task { await submitCheckIn() }
        case .handoff:
            openHybrid(.concierge)
        }
    }

    private func handleDevice(_ id: String) {
        switch id {
        case "navigate": openURL(URL(string: "http://maps.apple.com/?daddr=\(venue.latitude),\(venue.longitude)&dirflg=d"))
        case "call": openURL(URL(string: "https://www.google.com/search?q=\(urlEncoded("\(venue.name) Atlanta phone number"))"))
        case "share": presentShare(text: "\(venue.name) — \(venue.address) · \(venue.distance) on Bytspot")
        default: break
        }
    }

    private func submitCheckIn() async {
        guard !didCheckIn else { statusMessage = "Already checked in recently at \(venue.name)."; return }
        didCheckIn = true
        let idempotencyKey = UUID().uuidString
        statusMessage = "Checked in at \(venue.name)!"
        guard sessionStore.canAttachBearerToken else { return }
        let body = try? JSONSerialization.data(withJSONObject: ["json": ["venueId": venue.id, "idempotencyKey": idempotencyKey]])
        let client = BytspotAPIClient(tokenProvider: { sessionStore.token })
        _ = try? await client.data(path: "/trpc/\(NativeVenueDetailContract.checkinEndpoint)", method: "POST", body: body)
    }

    private func isLocked(_ action: NativeVenueDetailAction) -> Bool { if case .capability(let capability) = action.kind { return currentTrustLevel < capability.requiredLevel }; return false }
    private func actionAccent(_ action: NativeVenueDetailAction) -> Color { ["navigate": NativeTheme.cyan, "call": NativeTheme.emerald, "share": NativeTheme.textPrimary, "save": NativeTheme.pink, "getTickets": NativeTheme.blackAmber, "checkIn": NativeTheme.emerald, "concierge": NativeTheme.purple, "bookRide": NativeTheme.orange][action.id] ?? NativeTheme.cyan }
    private var categoryDetailIcon: String { NativeVenueDetailPresentation.isDiningVenue(venue) ? "fork.knife" : NativeVenueDetailPresentation.isEventOrPassVenue(venue) ? "ticket.fill" : venue.discoverType == "parking" ? "parkingsign.circle.fill" : "sparkles" }
    private var categoryDetailTitle: String { NativeVenueDetailPresentation.isDiningVenue(venue) ? "Dining" : NativeVenueDetailPresentation.isEventOrPassVenue(venue) ? "Pass details" : venue.discoverType == "parking" ? "Parking" : "Details" }
    private var categoryPrimaryDetail: String { NativeVenueDetailPresentation.isDiningVenue(venue) ? "Menu and pickup options" : NativeVenueDetailPresentation.isEventOrPassVenue(venue) ? "Digital pass and event access" : entryText }
    private var categorySecondaryDetail: String { NativeVenueDetailPresentation.isDiningVenue(venue) ? "Order ahead or ask Concierge" : NativeVenueDetailPresentation.isEventOrPassVenue(venue) ? "View pass, share, or book a ride" : venue.parking.totalAvailable > 0 ? "\(venue.parking.totalAvailable) spaces nearby" : "Save, share, or ask Concierge" }
    private var categoryEmoji: String { ["dining": "🍽️", "nightlife": "🎶", "coffee": "☕", "shopping": "🛍️", "fitness": "💪", "entertainment": "🎭", "parking": "🅿️", "service": "🛎️"][venue.discoverType] ?? "📍" }
    private func openURL(_ url: URL?) { guard let url else { return }; UIApplication.shared.open(url) }
    private func urlEncoded(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value }
    private func presentShare(text: String) { guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first, let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }; root.present(UIActivityViewController(activityItems: [text], applicationActivities: nil), animated: true) }
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
    /// Native Venue Details (WS-C). Presented from the non-partner peek card's
    /// "Details" action — an L0 read-only surface (viewVenue) that replaces the
    /// former coarse openHybrid(.discover) handoff. nil ⇒ no detail presented.
    @State private var detailVenue: NativeVenueSummary?
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
        .sheet(item: $detailVenue) { venue in
            let detail = NativeVenueDetailView(venue: venue, openHybrid: openHybrid)
            if #available(iOS 16.0, *) {
                detail
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            } else {
                detail
            }
        }
        .animation(.interpolatingSpring(mass: 0.82, stiffness: 420, damping: 38, initialVelocity: 0), value: showFunctionSheet)
        .animation(.interpolatingSpring(mass: 0.82, stiffness: 420, damping: 38, initialVelocity: 0), value: selectedPin?.id)
        .accessibilityIdentifier("native-map-explore")
        .onAppear { startLocationGateIfNeeded(); refreshProximityLatch(); refreshDescentPrewarm(); autoOpenTrafficIntelIfRequested(); applySelectedPinPreviewIfRequested() }
        .onChange(of: headingProvider.userLocation?.timestamp) { _ in refreshProximityLatch(); refreshDescentPrewarm() }
        .onDisappear { headingProvider.stopLocating() }
    }

    private func startLocationGateIfNeeded() {
        guard Self.previewProximityMetersOverride == nil else { return }
        headingProvider.startLocating()
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
                    Button(action: { handleNonPartnerSecondary(label, for: pin) }) {
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

    private func handleNonPartnerSecondary(_ label: String, for pin: NativeMapPin) {
        nativeImpactLight()
        switch label {
        case "Concierge": openHybrid(.concierge)
        case "Save": openHybrid(.access)
        case "Details": detailVenue = venueForDetail(pin)
        default: openHybrid(.discover)
        }
    }

    /// Resolves the full venue backing a peek-card pin for the native detail
    /// surface, falling back to a pin-derived summary for sample pins that have
    /// no live venue (so the L0 detail still renders without a web handoff).
    private func venueForDetail(_ pin: NativeMapPin) -> NativeVenueSummary {
        if let match = venues.first(where: { $0.id == pin.id }) { return match }
        let labels = ["Chill", "Active", "Busy", "Packed"]
        let crowd = pin.crowdLevel.map { level in
            NativeCrowdSummary(level: level, label: labels[max(0, min(labels.count - 1, level - 1))], waitMins: nil)
        }
        return NativeVenueSummary(
            id: pin.id,
            name: pin.title,
            category: pin.kind == .parking ? "parking" : "venue",
            address: pin.subtitle,
            distance: pin.distance,
            rating: nil,
            latitude: pin.coordinate.latitude,
            longitude: pin.coordinate.longitude,
            crowd: crowd,
            parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—"),
            verifiedPatchId: nil,
            imageUrl: nil
        )
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
        assertAppearanceModeContract()
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

    private static func assertAppearanceModeContract() {
        precondition(NativeAppearanceMode.defaultsKey == "bytspot_native_appearance_mode", "NativeShellThemeSelfTests: native Appearance storage key drifted.")
        precondition(NativeAppearanceMode.environmentKey == "BYT_NATIVE_APPEARANCE", "NativeShellThemeSelfTests: native Appearance preview env key drifted.")
        precondition(NativeAppearanceMode.panelAutorunEnvironmentKey == "BYT_NATIVE_APPEARANCE_PANEL_AUTORUN", "NativeShellThemeSelfTests: native Appearance panel autorun env key drifted.")
        precondition(NativeAppearanceMode.allCases.map(\.rawValue) == ["system", "dark", "light"], "NativeShellThemeSelfTests: Appearance mode order must remain Auto, Dark, Light.")
        precondition(NativeAppearanceMode.resolved(raw: "DARK") == .dark && NativeAppearanceMode.resolved(raw: "invalid") == .system, "NativeShellThemeSelfTests: Appearance normalization/fallback drifted.")
        precondition(NativeAppearanceMode.system.uiUserInterfaceStyle == .unspecified && NativeAppearanceMode.dark.uiUserInterfaceStyle == .dark && NativeAppearanceMode.light.uiUserInterfaceStyle == .light, "NativeShellThemeSelfTests: Appearance must bridge into UIKit window style for adaptive UIColor tokens.")
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
        let visibleHomeCopy = NativeHomeDashboardView.visibleHomeSurfaceLabels.joined(separator: " | ")
        precondition(!NativeHomeDashboardView.prohibitedContextSnapshotLabels.contains { visibleHomeCopy.localizedCaseInsensitiveContains($0) }, "NativeHomeParitySelfTests: native Home must not expose context snapshot placeholder copy.")
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
        // WS-C — native Venue Details L0 surface. Mirrors native-trust-contract.json venueDetail.
        precondition(NativeVenueDetailContract.surfaceCapability == .viewVenue, "NativeMapParitySelfTests: Venue Details must remain an L0 read-only surface (viewVenue).")
        precondition(NativeVenueDetailContract.checkinEndpoint == "venues.checkin" && NativeVenueDetailContract.checkinIdempotent, "NativeMapParitySelfTests: venues.checkin endpoint/idempotency drifted from contract venueDetail.")
        precondition(NativeVenueDetailContract.actionIDs == ["navigate", "call", "share", "save", "getTickets", "checkIn", "concierge", "bookRide"], "NativeMapParitySelfTests: Venue Details action set drifted from React VenueDetails.tsx / contract venueDetail.actions.")
        precondition(NativeVenueDetailContract.actions.first(where: { $0.id == "getTickets" })?.kind == NativeVenueActionKind.capability(.saveToWallet), "NativeMapParitySelfTests: Get Tickets must gate on saveToWallet (L1).")
        precondition(NativeVenueDetailContract.actions.first(where: { $0.id == "bookRide" })?.kind == NativeVenueActionKind.capability(.createCheckoutHold), "NativeMapParitySelfTests: Book Ride must gate on createCheckoutHold (L3).")
        precondition(NativeVenueDetailPresentation.actionTitle(for: NativeVenueDetailContract.actions.first(where: { $0.id == "getTickets" })!, venue: NativeVenueSummary(id: "broni", name: "Broni Home Taste", category: "service", address: "Authentic Ghanaian Home Cooking", distance: "Service", rating: 4.9, latitude: 0, longitude: 0, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Paid"), verifiedPatchId: "DISCOVER-VERIFIED", imageUrl: nil)) == "View Menu", "NativeMapParitySelfTests: Broni dining detail primary action must remain View Menu.")
        precondition(NativeVenueDetailPresentation.headerBadgeTitle(for: NativeVenueSummary(id: "patch", name: "Approved Patch Venue", category: "dining", address: "Atlanta", distance: "0.4 mi", rating: 4.9, latitude: 0, longitude: 0, crowd: nil, parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "Free"), verifiedPatchId: "BYT424-0301-P", imageUrl: nil)) == "VERIFIED PATCH", "NativeMapParitySelfTests: real patch/vendor-approved details must claim VERIFIED PATCH authentication.")
        precondition(NativeVenueHours.openStatus(category: "coffee", hour: 8, minute: 0, weekday: 3).label == "Open Now", "NativeMapParitySelfTests: coffee venue must read Open Now at 8am (parity with venueHours.ts).")
        precondition(NativeVenueHours.openStatus(category: "coffee", hour: 5, minute: 0, weekday: 3).isOpen == false, "NativeMapParitySelfTests: coffee venue must read closed at 5am (parity with venueHours.ts).")
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
        precondition(NativeProfileMenuSectionKind.placesActivity.items.map(\.label) == ["Saved Spots", "Places I've Been"], "NativeAccountParitySelfTests: places/activity section drifted.")
        precondition(NativeProfileMenuSectionKind.account.items.map(\.label) == ["Personal Information", "Payment Methods", "My Vehicles"], "NativeAccountParitySelfTests: account controls drifted.")
        precondition(NativeProfileMenuSectionKind.preferences.items.map(\.label) == ["Vibe Preferences", "Parking Preferences", "Notifications", "Location & Privacy"], "NativeAccountParitySelfTests: preference controls drifted.")
        precondition(NativeProfileMenuSectionKind.appSettings.items.map(\.label) == ["General", "Appearance"], "NativeAccountParitySelfTests: theme must live under App Settings/Appearance.")
        precondition(NativeProfileMenuSectionKind.safetyLegal.items.map(\.label) == ["Delete Account", "Privacy Policy", "Terms of Service", "Disclaimer"], "NativeAccountParitySelfTests: safety/legal section drifted.")
        precondition(NativeProfileMenuSectionKind.placesActivity.items.map(\.panel) == [.savedSpots, .placesVisited], "NativeAccountParitySelfTests: places/activity rows must open native panels, not hybrid Profile.")
        precondition(NativeProfileMenuSectionKind.account.items.map(\.panel) == [.personalInformation, .paymentMethods, .vehicles], "NativeAccountParitySelfTests: account rows must open native panels, not hybrid Profile.")
        precondition(NativeProfileInteractionContract.accountPanels == [.personalInformation, .paymentMethods, .vehicles], "NativeAccountParitySelfTests: account interaction panels must stay native.")
        precondition(NativeProfileInteractionContract.personalInfoKeys == ["bytspot_profile_display_name", "bytspot_profile_email", "bytspot_profile_phone", "bytspot_profile_city", "bytspot_profile_birthday"], "NativeAccountParitySelfTests: personal-info local draft keys drifted.")
        precondition(NativeProfileInteractionContract.vehicleKeys == ["bytspot_vehicle_make", "bytspot_vehicle_model", "bytspot_vehicle_year", "bytspot_vehicle_color", "bytspot_vehicle_plate_hint"], "NativeAccountParitySelfTests: vehicle local draft keys drifted.")
        precondition(NativeProfileInteractionContract.paymentKeys == ["bytspot_payment_apple_pay_preferred", "bytspot_payment_setup_staged"], "NativeAccountParitySelfTests: payment readiness keys drifted.")
        precondition(NativeProfileInteractionContract.paymentBoundaryCopy.contains("No card numbers"), "NativeAccountParitySelfTests: payment panel must not collect card data.")
        precondition(NativeProfileInteractionContract.profileRoutes == ["user.profile.get", "user.profile.update"], "NativeAccountParitySelfTests: profile real-data routes drifted.")
        precondition(NativeProfileInteractionContract.vehicleRoutes == ["user.vehicles.list", "user.vehicles.add", "user.vehicles.update", "user.vehicles.remove"], "NativeAccountParitySelfTests: vehicle real-data routes drifted.")
        precondition(NativeProfileInteractionContract.paymentRoutes == ["payments.listMethods", "payments.setupSession", "payments.setDefaultMethod", "payments.removeMethod"], "NativeAccountParitySelfTests: payment real-data routes drifted.")
        precondition(NativeProfileDataAPI.fixtureEnvironmentKey == "BYT_NATIVE_PROFILE_DATA_FIXTURES", "NativeAccountParitySelfTests: authenticated Profile fixture env key drifted.")
        precondition(NativeProfileDataAPI.fixtureProfile.email == "member@example.com" && NativeProfileDataAPI.fixtureVehicles.first?.licensePlate == "BYT-424" && NativeProfileDataAPI.fixturePaymentMethods.first?.last4 == "4242", "NativeAccountParitySelfTests: authenticated Profile fixture contract drifted.")
        precondition(NativeProfileMenuSectionKind.preferences.items.map(\.panel) == [.vibePreferences, .parkingPreferences, .notifications, .locationPrivacy], "NativeAccountParitySelfTests: preference rows must open native panels, not hybrid Profile.")
        precondition(NativeProfileMenuSectionKind.appSettings.items.map(\.panel) == [.generalSettings, .appearance], "NativeAccountParitySelfTests: settings rows must open native panels, not hybrid Profile.")
        precondition(NativeProfileMenuSectionKind.safetyLegal.items.map(\.panel) == [.deleteAccount, .privacyPolicy, .termsOfService, .disclaimer], "NativeAccountParitySelfTests: safety/legal rows must open native panels, not hybrid Profile.")
        precondition(NativeProfilePanel.p2SocialActivityPanels == [.friends, .savedSpots, .placesVisited], "NativeAccountParitySelfTests: P2 social/activity panels must stay native for Social and Places & Activity.")
        precondition(NativeProfileSavedSpot.fallbackFixtureTitles == ["Colony Square", "Midtown Smart Parking", "Broni Home Taste", "GH Akwaaba Pass"], "NativeAccountParitySelfTests: Saved Spots native fixture contract drifted.")
        precondition(NativeProfileSavedSpot.saved(from: .fallback).map(\.title) == NativeProfileSavedSpot.fallbackFixtureTitles, "NativeAccountParitySelfTests: Saved Spots panel must render curated native fallback rows.")
        precondition(NativeProfileP3Contract.settingsPanels == [.notifications, .locationPrivacy, .generalSettings, .appearance], "NativeAccountParitySelfTests: P3 settings panels must stay native.")
        precondition(NativeProfileP3Contract.safetyLegalPanels == [.deleteAccount, .privacyPolicy, .termsOfService, .disclaimer], "NativeAccountParitySelfTests: P3 safety/legal panels must stay native.")
        precondition(NativeProfileP3Contract.legalTitles == NativeLegalDocument.allCases.map(\.title), "NativeAccountParitySelfTests: Native legal document titles drifted.")
        precondition(NativeProfilePreferenceSourceContract.reactSources == ["VibePreferences.tsx", "ParkingPreferences.tsx", "NotificationSettings.tsx", "LocationSettings.tsx"], "NativeAccountParitySelfTests: React preference source files drifted.")
        precondition(NativeProfilePreferenceSourceContract.vibeAtmosphereLabels == ["Relaxed→Energetic", "Intimate→Social", "Classic→Trendy", "Quiet→Loud", "Spacious→Crowded"], "NativeAccountParitySelfTests: Vibe atmosphere labels drifted from React.")
        precondition(NativeProfilePreferenceSourceContract.vibeProfileTokens == ["coffee", "food", "drinks", "nightlife"], "NativeAccountParitySelfTests: Vibe profile tokens drifted from React saveUserPreferences contract.")
        precondition(NativeProfilePreferenceSourceContract.parkingDefaultAnchors.contains("covered=true") && NativeProfilePreferenceSourceContract.parkingDefaultAnchors.contains("maxWalkingDistance=0.5"), "NativeAccountParitySelfTests: Parking preference defaults drifted from React.")
        precondition(NativeProfilePreferenceSourceContract.notificationChannels == ["push.reservations", "push.promotions", "push.reminders", "push.insider", "push.nearby", "email.reservations", "email.promotions", "email.newsletter", "email.receipts", "sms.reservations", "sms.reminders", "sms.emergencies"], "NativeAccountParitySelfTests: notification channels drifted from React.")
        precondition(NativeProfilePreferenceSourceContract.notificationRoutes == ["user.notifications.getPrefs", "user.notifications.updatePrefs"], "NativeAccountParitySelfTests: notification preference routes drifted.")
        precondition(NativeProfilePreferenceSourceContract.userPreferenceRoutes == ["user.preferences.get", "user.preferences.update"], "NativeAccountParitySelfTests: user preference routes drifted.")
        precondition(NativeProfilePreferenceSourceContract.userPreferenceSyncScope == ["vibes", "parking.covered", "parking.evCharging", "parking.security"], "NativeAccountParitySelfTests: Vibe/Parking API sync scope drifted.")
        precondition(NativeProfilePreferenceSourceContract.locationControls == ["Primary Location Permission", "Enhanced Indoor Accuracy", "Background Location", "Location for Offers & Promotions", "Venue Recommendations", "Active Job Tracking"], "NativeAccountParitySelfTests: Location Settings controls drifted from React.")
        precondition(NativeProfileP3Contract.notificationKeys == ["bytspot_notify_push_reservations", "bytspot_notify_push_promotions", "bytspot_notify_push_reminders", "bytspot_notify_push_insider", "bytspot_notify_push_nearby", "bytspot_notify_email_reservations", "bytspot_notify_email_promotions", "bytspot_notify_email_newsletter", "bytspot_notify_email_receipts", "bytspot_notify_sms_reservations", "bytspot_notify_sms_reminders", "bytspot_notify_sms_emergencies"], "NativeAccountParitySelfTests: notification storage keys drifted.")
        precondition(NativeProfileP3Contract.privacyKeys == ["bytspot_location_enhanced_indoor_accuracy", "bytspot_location_background", "bytspot_location_offers", "bytspot_venue_recommendations_enabled"], "NativeAccountParitySelfTests: privacy storage keys drifted.")
        precondition(NativeFindFriendsCard.guestCopy == "Sign in to match contacts privately.", "NativeAccountParitySelfTests: guest Find Friends copy must stay compact.")

        precondition(NativeMigrationConfig.previewSessionEnvironmentKey == "BYT_NATIVE_PREVIEW_SESSION", "NativeAccountParitySelfTests: preview session env key drifted.")
        precondition(NativeMigrationConfig.previewTokenEnvironmentKey == "BYT_NATIVE_PREVIEW_TOKEN", "NativeAccountParitySelfTests: preview token env key drifted.")
        precondition(NativeProfileStyle.cardRadius == NativePolish.cardRadius && NativeProfileStyle.cardRadius == 24, "NativeAccountParitySelfTests: Profile card radius must stay at 24pt.")
        precondition(NativeProfileStyle.cardPadding == 20 && NativeProfileStyle.cardSpacing == 20, "NativeAccountParitySelfTests: Profile card padding/spacing must stay at 20pt.")
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
        precondition(NativeDiscoverView.detailEnvironmentKey == "BYT_NATIVE_DISCOVER_DETAIL", "NativeDiscoverParitySelfTests: Discover detail screenshot env key drifted.")
        precondition(NativeDiscoverView.detailDefaultsKey == "bytspot_native_discover_detail", "NativeDiscoverParitySelfTests: Discover detail defaults key drifted.")
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