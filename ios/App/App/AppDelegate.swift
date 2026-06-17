import UIKit
import Capacitor
import SwiftUI

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let appWindow = UIWindow(frame: UIScreen.main.bounds)
        // App Store release invariant: the downloaded app must open directly into
        // the bundled React app through Capacitor. The SwiftUI root remains an
        // explicit simulator/dev opt-in until native parity gates are green.
        if NativeMigrationConfig.isNativeRootEnabled {
            appWindow.rootViewController = UIHostingController(rootView: BytspotNativeAppRoot())
        } else {
            let root = CAPBridgeViewController()
            root.view.backgroundColor = .black
            appWindow.rootViewController = root
        }
        appWindow.makeKeyAndVisible()
        window = appWindow
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if NativeMigrationConfig.isNativeRootEnabled {
            NativeIncomingURLCenter.publish(url, scanSource: .deepLink)
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        if NativeMigrationConfig.isNativeRootEnabled, let url = userActivity.webpageURL {
            NativeIncomingURLCenter.publish(url, scanSource: .universalLink)
            return true
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - BytspotTier (App-target mirror)
// File-scoped duplicate of the Clip-target BytspotTier so the native patch
// experience can route + theme + price-floor independently of the Clip bundle.
// Keep cases/detect/min-cents/eyebrow/defaultSubtitle in sync with
// ios/App/Clip/ClipPatchVerifier.swift.
enum BytspotTier: String, Equatable, CaseIterable {
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

    var minimumCents: Int {
        switch self {
        case .black: return 45_000
        case .platinum: return 5_000
        case .green: return 500
        }
    }

    var defaultSubtitle: String {
        switch self {
        case .black: return "Curated ultra-luxury experiences. Verified by tap."
        case .platinum: return "Trusted local providers. Reserve and verify with one tap."
        case .green: return "Neighborhood services from your community. Tap to support."
        }
    }

    static func detect(url: URL?, patchId: String?) -> BytspotTier {
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
        if let patchId = patchId?.uppercased() {
            if patchId.hasPrefix("BLACK-") || patchId.hasPrefix("BYT-B-") || patchId.hasSuffix("-B") || patchId.hasSuffix(".B") || patchId.hasSuffix("_B") || patchId.hasSuffix("-BLACK") { return .black }
            if patchId.hasPrefix("PLATINUM-") || patchId.hasPrefix("BYT-P-") || patchId.hasSuffix("-P") || patchId.hasSuffix(".P") || patchId.hasSuffix("_P") || patchId.hasSuffix("-PLATINUM") { return .platinum }
            if patchId.hasPrefix("GREEN-") || patchId.hasPrefix("BYT-G-") || patchId.hasSuffix("-G") || patchId.hasSuffix(".G") || patchId.hasSuffix("_G") || patchId.hasSuffix("-GREEN") { return .green }
        }
        return .black
    }
}

private struct NativePatchRoute: Equatable {
    let url: URL
    let patchId: String
    let token: String?
    let venueName: String?
    let tier: BytspotTier

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let parts = components.path.split(separator: "/").map(String.init)
        let query = components.queryItems ?? []
        let routeNames = Set(["patch", "p", "access", "t"])
        let fromPath: String?
        if parts.count >= 2, routeNames.contains(parts[0]) { fromPath = parts[1] }
        else if parts.count == 1, parts[0].uppercased().hasPrefix("BYT") { fromPath = parts[0] }
        else { fromPath = nil }
        let fromQuery = query.first(where: { ["patch", "patchId", "p"].contains($0.name) })?.value
        guard let patchId = fromPath ?? fromQuery, !patchId.isEmpty else { return nil }
        self.url = url
        self.patchId = patchId
        self.token = query.first(where: { ["t", "token"].contains($0.name) })?.value
        self.venueName = query.first(where: { ["venue", "venueName", "v"].contains($0.name) })?.value
        self.tier = BytspotTier.detect(url: url, patchId: patchId)
    }
}

@MainActor
private final class NativePatchViewModel: ObservableObject {
    @Published var title = "Bytspot Patch"
    @Published var subtitle: String
    @Published var tier: BytspotTier
    @Published var services: [NativePatchService]
    @Published var isLoading = true
    @Published var isVerifying = false
    @Published var verifiedLabel: String?
    @Published var errorMessage: String?

    let route: NativePatchRoute
    private let api = NativePatchAPIClient()

    init(route: NativePatchRoute) {
        self.route = route
        self.tier = route.tier
        self.subtitle = route.tier.defaultSubtitle
        self.services = NativePatchService.fallbacks(for: route.tier)
        self.title = route.venueName?.replacingOccurrences(of: "-", with: " ").capitalized ?? "Bytspot Patch"
        Task { await load() }
    }

    func load() async {
        isLoading = true
        let activeTier = tier
        let resolved = try? await api.resolvePatch(patchId: route.patchId, tier: activeTier)
        let liveServices = (try? await api.searchServices(patchId: route.patchId, tier: activeTier)) ?? []
        if let resolved {
            title = resolved.title
            subtitle = resolved.subtitle
            // Backend authority on tier — re-skin if the URL guess was wrong.
            if let serverTier = resolved.tier, serverTier != tier {
                tier = serverTier
                if liveServices.isEmpty {
                    services = NativePatchService.fallbacks(for: serverTier)
                }
            }
        }
        if !liveServices.isEmpty { services = liveServices }
        isLoading = false
        if let token = route.token, !token.isEmpty { await verify(token: token) }
    }

    func verify(token: String? = nil) async {
        guard let token = token ?? route.token, !token.isEmpty else {
            errorMessage = "Tap the signed patch or QR again to verify."
            return
        }
        isVerifying = true
        errorMessage = nil
        do {
            verifiedLabel = try await api.verify(token: token)
        } catch {
            errorMessage = "Verification needs attention. Try the patch again."
        }
        isVerifying = false
    }
}

private struct NativePatchExperienceView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model: NativePatchViewModel
    @State private var paymentHint: String?

    init(route: NativePatchRoute) {
        _model = StateObject(wrappedValue: NativePatchViewModel(route: route))
    }

    /// Primary accent — eyebrow + spinners + verification chip.
    private var accent: Color {
        switch model.tier {
        case .black: return Color(red: 0.96, green: 0.83, blue: 0.45) // gold
        case .platinum: return .cyan
        case .green: return .emerald
        }
    }
    /// Secondary accent — corner wash on the radial gradient.
    private var secondaryAccent: Color {
        switch model.tier {
        case .black: return Color(red: 0.62, green: 0.45, blue: 0.96) // violet
        case .platinum: return Color(red: 0.62, green: 0.45, blue: 0.96)
        case .green: return .cyan
        }
    }
    private var heroTrailing: Color {
        switch model.tier {
        case .black: return Color(red: 0.62, green: 0.45, blue: 0.96).opacity(0.22)
        case .platinum: return Color.purple.opacity(0.20)
        case .green: return Color.emerald.opacity(0.22)
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RadialGradient(colors: [accent.opacity(0.18), .clear], center: .topLeading, startRadius: 10, endRadius: 430).ignoresSafeArea()
            RadialGradient(colors: [secondaryAccent.opacity(0.14), .clear], center: .bottomTrailing, startRadius: 10, endRadius: 400).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    hero
                    services
                    verification
                    applePaySecure
                    Button("Continue to Bytspot") { dismiss() }
                        .font(.system(size: 15, weight: .black))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .padding(20)
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: model.verifiedLabel == nil ? "bolt.fill" : "checkmark.seal.fill")
                    .foregroundColor(.black).font(.system(size: 14, weight: .black))
                    .frame(width: 30, height: 30).background(model.verifiedLabel == nil ? accent : Color.emerald).clipShape(Circle())
                Text(model.verifiedLabel == nil ? model.tier.eyebrow : "VERIFIED ACCESS").font(.system(size: 12, weight: .black)).foregroundColor(accent).tracking(1.2)
                Spacer()
                if model.isLoading { ProgressView().tint(accent) }
            }
            Text(model.title).font(.system(size: 32, weight: .heavy)).foregroundColor(.white).lineLimit(2)
            Text(model.subtitle).font(.system(size: 15, weight: .bold)).foregroundColor(.white.opacity(0.78))
            Text("Patch \(model.route.patchId)").font(.system(size: 11, weight: .bold, design: .monospaced)).foregroundColor(.white.opacity(0.55)).lineLimit(1).truncationMode(.middle)
        }
        .padding(21)
        .background(LinearGradient(colors: [Color(red: 0.02, green: 0.06, blue: 0.10), Color(red: 0.02, green: 0.03, blue: 0.07), heroTrailing], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 30).stroke(accent.opacity(0.22)))
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private var services: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("LOCAL SERVICES").font(.system(size: 12, weight: .black)).foregroundColor(accent).tracking(1.15)
            ForEach(model.services) { service in serviceRow(service) }
        }
    }

    private func serviceRow(_ service: NativePatchService) -> some View {
        HStack(spacing: 14) {
            Image(systemName: service.icon).font(.system(size: 18, weight: .black)).foregroundColor(.black).frame(width: 44, height: 44).background(service.tint).clipShape(RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 4) {
                Text(service.title).font(.system(size: 16, weight: .black)).foregroundColor(.white)
                Text(service.subtitle).font(.system(size: 12.5, weight: .bold)).foregroundColor(.white.opacity(0.75)).lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundColor(.white.opacity(0.65))
        }.padding(15).background(Color(red: 0.02, green: 0.03, blue: 0.07)).clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private var verification: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: model.verifiedLabel == nil ? "shield.checkered" : "checkmark.seal.fill").font(.system(size: 28, weight: .black)).foregroundColor(model.verifiedLabel == nil ? accent : .emerald)
                VStack(alignment: .leading) {
                    Text(model.verifiedLabel ?? "Guest browsing active").font(.system(size: 15, weight: .black)).foregroundColor(.white)
                    Text(model.route.token == nil ? "Tap Patch to Verify with a signed NFC/QR token." : "Secure token detected for native verification.").font(.system(size: 12.5, weight: .bold)).foregroundColor(.white.opacity(0.68))
                }
            }
            if model.isVerifying { ProgressView("Verifying secure patch…").tint(accent).foregroundColor(.white) }
            if let error = model.errorMessage { Text(error).font(.system(size: 12.5, weight: .bold)).foregroundColor(.yellow) }
            Button(action: { Task { await model.verify() } }) {
                HStack { Text(model.route.token == nil ? "Tap Patch to Verify" : "Verify Secure Tap"); Spacer(); Image(systemName: "wave.3.right.circle.fill") }
                    .font(.system(size: 14, weight: .black)).foregroundColor(.white).padding(14).background(Color.white.opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }.padding(16).background(Color(red: 0.02, green: 0.03, blue: 0.07)).clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private var applePaySecure: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "creditcard.and.123").font(.system(size: 18, weight: .black)).foregroundColor(.black).frame(width: 42, height: 42).background(Color.emerald).clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Apple Pay Secure").font(.system(size: 15, weight: .black)).foregroundColor(.white)
                    Text("After sign-in, Bytspot authorizes funds for booking and captures only after service completion.").font(.system(size: 12.5, weight: .bold)).foregroundColor(.white.opacity(0.72))
                }
            }
            HStack(spacing: 10) {
                Button(action: { paymentHint = "Apple Pay is the primary fast path when merchant setup is enabled for this build." }) {
                    HStack { Image(systemName: "apple.logo"); Text("Apple Pay") }
                        .font(.system(size: 13, weight: .black)).foregroundColor(.black).padding(.vertical, 12).frame(maxWidth: .infinity).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 15))
                }
                Button(action: { dismiss() }) {
                    HStack { Image(systemName: "creditcard.and.123"); Text("Card") }
                        .font(.system(size: 13, weight: .black)).foregroundColor(.white).padding(.vertical, 12).frame(maxWidth: .infinity).background(Color.white.opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 15))
                }
            }
            if let paymentHint {
                Text(paymentHint)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(accent.opacity(0.86))
            }
        }.padding(15).background(Color(red: 0.01, green: 0.11, blue: 0.09)).clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

private struct NativePatchService: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let tint: Color

    /// Tier-shaped fallback catalog. Black = ultra-luxury entry/VIP, Platinum =
    /// trusted city services, Green = neighborhood/cottage-industry.
    static func fallbacks(for tier: BytspotTier) -> [NativePatchService] {
        switch tier {
        case .black:
            return [
                NativePatchService(id: "entry", title: "Verified Entry", subtitle: "Skip the line with a secure patch check.", icon: "shield.checkered", tint: Color(red: 0.96, green: 0.83, blue: 0.45)),
                NativePatchService(id: "vip", title: "VIP Access", subtitle: "Reserved seating and priority arrival.", icon: "crown.fill", tint: .yellow),
                NativePatchService(id: "valet", title: "Black Valet", subtitle: "White-glove handoff, S-Class fleet on call.", icon: "car.side.lock.fill", tint: Color(red: 0.62, green: 0.45, blue: 0.96)),
                NativePatchService(id: "concierge", title: "Black Concierge", subtitle: "House lifestyle desk, 24/7 fulfillment.", icon: "sparkles", tint: .purple)
            ]
        case .platinum:
            return [
                NativePatchService(id: "entry", title: "Verified Entry", subtitle: "Skip the line with a secure patch check.", icon: "shield.checkered", tint: .emerald),
                NativePatchService(id: "parking", title: "Smart Parking", subtitle: "Reserved spot near this venue.", icon: "car.side.lock.fill", tint: .cyan),
                NativePatchService(id: "table", title: "Table Reservation", subtitle: "Priority booking with trusted local hosts.", icon: "fork.knife", tint: .yellow),
                NativePatchService(id: "concierge", title: "Concierge Help", subtitle: "Local support and guest requests.", icon: "sparkles", tint: .purple)
            ]
        case .green:
            return [
                NativePatchService(id: "farm", title: "Farm Stand", subtitle: "Tap to support neighborhood growers.", icon: "leaf.fill", tint: .emerald),
                NativePatchService(id: "baked", title: "Home Baked", subtitle: "Same-day bakes from your community.", icon: "birthday.cake.fill", tint: .yellow),
                NativePatchService(id: "lessons", title: "Lessons & Tutors", subtitle: "Music, K-12, and hobby classes.", icon: "music.note", tint: .cyan),
                NativePatchService(id: "handy", title: "Handy Neighbors", subtitle: "Trusted small-job help nearby.", icon: "wrench.and.screwdriver.fill", tint: .purple)
            ]
        }
    }
}

private struct NativePatchContext { let title: String; let subtitle: String; let tier: BytspotTier? }

private struct NativePatchAPIClient {
    private let baseURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "BytspotAPIBaseURL") as? String ?? "https://bytspot-api.onrender.com")!

    func resolvePatch(patchId: String, tier: BytspotTier = .black) async throws -> NativePatchContext {
        let payload = try await getTRPC("patch.resolve", input: ["patchId": patchId, "tier": tier.rawValue]) as? [String: Any]
        let patch = payload?["patch"] as? [String: Any]
        let vendor = payload?["vendor"] as? [String: Any]
        let service = payload?["service"] as? [String: Any]
        let title = string(vendor?["displayName"]) ?? string(patch?["label"]) ?? "Bytspot Patch"
        let subtitle = string(service?["title"]) ?? string(service?["name"]) ?? tier.defaultSubtitle
        let serverTierRaw = string(payload?["tier"]) ?? string(patch?["tier"]) ?? string(vendor?["tier"])
        let serverTier = serverTierRaw.flatMap { BytspotTier(rawValue: $0.lowercased()) }
        return NativePatchContext(title: title, subtitle: subtitle, tier: serverTier)
    }

    func searchServices(patchId: String, tier: BytspotTier = .black) async throws -> [NativePatchService] {
        let payload = try await getTRPC("vendors.search", input: ["patchId": patchId, "tier": tier.rawValue, "limit": 12]) as? [String: Any]
        let rows = payload?["services"] as? [[String: Any]] ?? []
        return rows.prefix(6).enumerated().map { idx, row in
            let title = string(row["title"]) ?? string(row["name"]) ?? "Local Service"
            let subtitle = string(row["description"]) ?? string(row["serviceSubtitle"]) ?? "Available near this patch."
            let lower = "\(title) \(subtitle)".lowercased()
            let icon = lower.contains("park") ? "car.side.lock.fill" : lower.contains("vip") ? "crown.fill" : lower.contains("pay") ? "creditcard.and.123" : lower.contains("help") ? "sparkles" : "checkmark.seal.fill"
            let tint: Color = lower.contains("park") ? .cyan : lower.contains("vip") ? .yellow : lower.contains("help") ? .purple : .emerald
            return NativePatchService(id: string(row["id"]) ?? "service-\(idx)", title: title, subtitle: subtitle, icon: icon, tint: tint)
        }
    }

    func verify(token: String) async throws -> String {
        var req = URLRequest(url: baseURL.appendingPathComponent("trpc/patch.verifyTap"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["token": token])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw NSError(domain: "Bytspot", code: 1) }
        let payload = try unwrap(data) as? [String: Any]
        let patch = payload?["patch"] as? [String: Any]
        return string(patch?["label"]) ?? string(patch?["id"]) ?? "Verified Access"
    }

    private func getTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var components = URLComponents(url: baseURL.appendingPathComponent("trpc/\(procedure)"), resolvingAgainstBaseURL: false)!
        let data = try JSONSerialization.data(withJSONObject: input)
        components.queryItems = [URLQueryItem(name: "input", value: String(data: data, encoding: .utf8))]
        let (responseData, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw NSError(domain: "Bytspot", code: 2) }
        return try unwrap(responseData)
    }

    private func unwrap(_ data: Data) throws -> Any {
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        if let result = root?["result"] as? [String: Any], let payload = result["data"] { return payload }
        return root ?? [:]
    }

    private func string(_ value: Any?) -> String? {
        if let value = value as? String, !value.isEmpty { return value }
        if let value = value as? NSNumber { return value.stringValue }
        return nil
    }
}

private extension UIViewController {
    var topMostPresentedViewController: UIViewController {
        if let presentedViewController { return presentedViewController.topMostPresentedViewController }
        if let navigation = self as? UINavigationController { return navigation.visibleViewController?.topMostPresentedViewController ?? navigation }
        if let tab = self as? UITabBarController { return tab.selectedViewController?.topMostPresentedViewController ?? tab }
        return self
    }
}

private extension Color {
    static let emerald = Color(red: 0.29, green: 0.90, blue: 0.55)
}
