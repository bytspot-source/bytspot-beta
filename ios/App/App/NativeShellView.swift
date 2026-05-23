import SwiftUI
import UIKit
import MapKit
import Capacitor

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
        case .discover: return "sparkles"
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

final class NativeBridgeStore: ObservableObject {
    let bridgeViewController = CAPBridgeViewController()
    @Published var requestedTab: BytspotNativeTab?
    @Published var requestedHybridRoute: BytspotHybridRoute?
    @Published private(set) var currentRoute: BytspotHybridRoute = .home

    init() { bridgeViewController.loadViewIfNeeded() }

    func open(_ route: BytspotHybridRoute) {
        currentRoute = route
        bridgeViewController.loadViewIfNeeded()
        guard let webView = bridgeViewController.webView else { return }
        let detail: [String: String] = ["tab": route.reactTab, "focus": route.focus ?? ""]
        let detailJSON = jsonObject(detail)
        let tabJSON = jsonString(route.reactTab)
        let focusJSON = jsonString(route.focus ?? "")
        let script = """
        (function () {
          try {
            window.history.replaceState({}, '', '/');
            localStorage.setItem('bytspot_native_tab', \(tabJSON));
            localStorage.setItem('bytspot_native_focus', \(focusJSON));
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
        else if path == "profile" || path.hasPrefix("profile/") { target = .home; route = .profile }
        else if path == "access" || path.hasPrefix("booking") { target = .home; route = .access }
        else { target = nil; route = nil }
        guard let target, let route else { return false }
        requestedTab = target
        open(route)
        if route == .profile || route == .access { requestedHybridRoute = route }
        return true
    }

    private func jsonString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value), let result = String(data: data, encoding: .utf8) else { return "\"\"" }
        return result
    }

    private func jsonObject(_ value: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value), let result = String(data: data, encoding: .utf8) else { return "{}" }
        return result
    }
}

struct BytspotNativeShellView: View {
    @ObservedObject var bridgeStore: NativeBridgeStore
    @State private var selectedTab: BytspotNativeTab = .home
    @State private var hybridRoute: BytspotHybridRoute?

    var body: some View {
        TabView(selection: $selectedTab) {
            NativeHomeDashboardView(openHybrid: openHybrid)
                .tabItem { Label(BytspotNativeTab.home.title, systemImage: BytspotNativeTab.home.icon) }
                .tag(BytspotNativeTab.home)
            NativeDiscoverView(openHybrid: openHybrid)
                .tabItem { Label(BytspotNativeTab.discover.title, systemImage: BytspotNativeTab.discover.icon) }
                .tag(BytspotNativeTab.discover)
            NativeMapExploreView(openHybrid: openHybrid)
                .tabItem { Label(BytspotNativeTab.map.title, systemImage: BytspotNativeTab.map.icon) }
                .tag(BytspotNativeTab.map)
            NativeConciergeView(openHybrid: openHybrid)
                .tabItem { Label(BytspotNativeTab.concierge.title, systemImage: BytspotNativeTab.concierge.icon) }
                .tag(BytspotNativeTab.concierge)
        }
        .accentColor(NativeTheme.cyan)
        .background(NativeTheme.background.ignoresSafeArea())
        .onAppear { bridgeStore.open(selectedTab.hybridRoute) }
        .onChange(of: selectedTab) { bridgeStore.open($0.hybridRoute) }
        .onReceive(bridgeStore.$requestedTab.compactMap { $0 }) { selectedTab = $0 }
        .onReceive(bridgeStore.$requestedHybridRoute.compactMap { $0 }) { hybridRoute = $0 }
        .fullScreenCover(item: $hybridRoute) { route in
            NativeHybridBridgeScreen(route: route, bridgeStore: bridgeStore)
        }
    }

    private func openHybrid(_ route: BytspotHybridRoute) {
        bridgeStore.open(route)
        hybridRoute = route
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
        bridgeStore.open(route)
    }
}

private struct NativeHomeDashboardView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    @State private var conciergeExpanded = false

    var body: some View {
        NativeScreenScroll {
            NativeHeroCard(title: "Good evening, Parker", eyebrow: "BYTSPOT", subtitle: "A faster native dashboard for parking, access, and local support.")
            conciergeCard
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                NativeQuickAction(title: "Valet", subtitle: "Arrival help", icon: "car.fill", color: .purple) { openHybrid(.map) }
                NativeQuickAction(title: "Parking", subtitle: "Find a spot", icon: "parkingsign.circle.fill", color: NativeTheme.cyan) { openHybrid(.map) }
                NativeQuickAction(title: "Discover", subtitle: "Local services", icon: "sparkles", color: .yellow) { openHybrid(.discover) }
                NativeQuickAction(title: "My Access", subtitle: "Keys & bookings", icon: "key.fill", color: NativeTheme.emerald) { openHybrid(.access) }
            }
        }
    }

    private var conciergeCard: some View {
        Button(action: { conciergeExpanded.toggle() }) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    NativeIcon(symbol: "message.fill", color: NativeTheme.cyan)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Concierge Chat Card").nativeTitle(18)
                        Text("Ask for parking, reservations, access help, or local support.").nativeBody()
                    }
                    Spacer()
                    Image(systemName: conciergeExpanded ? "chevron.up" : "chevron.down").foregroundColor(.white.opacity(0.74))
                }
                if conciergeExpanded {
                    HStack {
                        Text("Try: “Find parking near the venue and hold my access pass.”")
                            .nativeBody(color: .white.opacity(0.86))
                        Spacer()
                    }
                    Button(action: { openHybrid(.concierge) }) {
                        Text("Open full concierge")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(NativeTheme.cyan)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            }
            .padding(18)
            .nativePanel()
        }
        .buttonStyle(.plain)
    }
}

private struct NativeDiscoverView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    @State private var search = ""
    private let rows = ["Private dining", "Nightlife", "Wellness", "Parking", "Coffee", "Live music"]

    var body: some View {
        NativeScreenScroll {
            NativeSectionHeader(title: "Discover", subtitle: "Search venues, services, and experiences around you.")
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundColor(NativeTheme.cyan)
                TextField("Search Bytspot", text: $search).foregroundColor(.white)
            }
            .padding(15).background(NativeTheme.panel).clipShape(RoundedRectangle(cornerRadius: 18))
            ForEach(rows.filter { search.isEmpty || $0.localizedCaseInsensitiveContains(search) }, id: \.self) { row in
                NativeRow(title: row, subtitle: "Browse live cards and booking options", icon: "sparkles") { openHybrid(.discover) }
            }
        }
    }
}

private struct NativeMapExploreView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    @State private var region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 33.7866, longitude: -84.3833), span: MKCoordinateSpan(latitudeDelta: 0.045, longitudeDelta: 0.045))
    private let pins = NativeMapPin.samples

    var body: some View {
        VStack(spacing: 0) {
            Map(coordinateRegion: $region, annotationItems: pins) { pin in
                MapAnnotation(coordinate: pin.coordinate) {
                    NativeMapMarker(pin: pin)
                }
            }
            .overlay(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Map Exploration").nativeTitle(22)
                    Text("Native MapKit view with Bytspot access and parking markers.").nativeBody()
                }
                .padding(16).nativePanel().padding(14)
            }
            NativeRow(title: "Open full map tools", subtitle: "Route planning, NFC patch scan, checkout", icon: "arrow.up.right.square.fill") { openHybrid(.map) }
                .padding(14).background(NativeTheme.background)
        }
    }
}

private struct NativeConciergeView: View {
    let openHybrid: (BytspotHybridRoute) -> Void
    private let rows = [
        ("Ask for a plan", "Parking, arrival, venue timing, or service booking", "message.fill"),
        ("Find access help", "Patch, ticket, and secure-hold support", "key.fill"),
        ("Talk to support", "Open the full Concierge chat experience", "sparkles")
    ]
    var body: some View {
        NativeScreenScroll {
            NativeSectionHeader(title: "Concierge", subtitle: "The same fourth tab as the current app, rebuilt as a native support entry point.")
            NativeHeroCard(title: "How can Bytspot help?", eyebrow: "CONCIERGE", subtitle: "Get quick help with parking, reservations, access, and local services.")
            ForEach(rows, id: \.0) { row in NativeRow(title: row.0, subtitle: row.1, icon: row.2) { openHybrid(.concierge) } }
        }
    }
}

private struct NativeScreenScroll<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 16) { content }.padding(20).padding(.bottom, 18) }.background(NativeTheme.background.ignoresSafeArea()) }
}

private struct NativeHeroCard: View {
    let title: String; let eyebrow: String; let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow).font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan).tracking(1.5)
            Text(title).font(.system(size: 32, weight: .heavy)).foregroundColor(.white)
            Text(subtitle).nativeBody(color: .white.opacity(0.80))
        }
        .padding(22)
        .background(LinearGradient(colors: [NativeTheme.panel, Color.purple.opacity(0.28)], startPoint: .topLeading, endPoint: .bottomTrailing))
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
    var body: some View { Button(action: action) { VStack(alignment: .leading, spacing: 10) { NativeIcon(symbol: icon, color: color); Text(title).nativeTitle(17); Text(subtitle).nativeBody(size: 12) }.frame(maxWidth: .infinity, alignment: .leading).padding(16).nativePanel() }.buttonStyle(.plain) }
}

private struct NativeRow: View {
    let title: String; let subtitle: String; let icon: String; let action: () -> Void
    var body: some View { Button(action: action) { HStack(spacing: 13) { NativeIcon(symbol: icon, color: NativeTheme.cyan); VStack(alignment: .leading, spacing: 4) { Text(title).nativeTitle(16); Text(subtitle).nativeBody(size: 12.5) }; Spacer(); Image(systemName: "chevron.right").foregroundColor(.white.opacity(0.55)) }.padding(15).nativePanel() }.buttonStyle(.plain) }
}

private struct NativeIcon: View { let symbol: String; let color: Color; var body: some View { Image(systemName: symbol).font(.system(size: 18, weight: .black)).foregroundColor(.black).frame(width: 42, height: 42).background(color).clipShape(RoundedRectangle(cornerRadius: 14)) } }

private struct NativeMapPin: Identifiable { let id: String; let title: String; let coordinate: CLLocationCoordinate2D; let color: Color
    static let samples = [NativeMapPin(id: "midtown", title: "Midtown", coordinate: CLLocationCoordinate2D(latitude: 33.783, longitude: -84.383), color: NativeTheme.cyan), NativeMapPin(id: "parking", title: "Parking", coordinate: CLLocationCoordinate2D(latitude: 33.790, longitude: -84.389), color: NativeTheme.emerald), NativeMapPin(id: "access", title: "Access", coordinate: CLLocationCoordinate2D(latitude: 33.779, longitude: -84.376), color: .yellow)] }

private struct NativeMapMarker: View { let pin: NativeMapPin; var body: some View { VStack(spacing: 3) { Image(systemName: "mappin.circle.fill").font(.system(size: 28, weight: .black)).foregroundColor(pin.color); Text(pin.title).font(.system(size: 10, weight: .black)).foregroundColor(.white).padding(.horizontal, 7).padding(.vertical, 4).background(Color.black.opacity(0.75)).clipShape(Capsule()) } } }

private enum NativeTheme { static let background = Color(red: 0.015, green: 0.018, blue: 0.035); static let panel = Color(red: 0.035, green: 0.052, blue: 0.085); static let cyan = Color(red: 0.29, green: 0.88, blue: 0.96); static let emerald = Color(red: 0.29, green: 0.90, blue: 0.55) }

private extension View { func nativePanel() -> some View { self.background(NativeTheme.panel).overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)) } }
private extension Text { func nativeTitle(_ size: CGFloat) -> some View { self.font(.system(size: size, weight: .black)).foregroundColor(.white) }; func nativeBody(size: CGFloat = 13.5, color: Color = .white.opacity(0.70)) -> some View { self.font(.system(size: size, weight: .semibold)).foregroundColor(color).lineSpacing(2) } }