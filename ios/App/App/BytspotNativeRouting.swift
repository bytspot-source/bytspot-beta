import Foundation
import SwiftUI

enum NativeContextualDestination: Identifiable, Equatable {
    case profile
    case accessWallet
    case party(NativePartyPassRoute)
    case plan(planId: String, token: String?)
    case patch(BytspotPatchRoute)
    case booking(status: String, url: URL, ride: NativeMobilityRideRecord? = nil)
    case legal(title: String, url: URL)

    var id: String {
        switch self {
        case .profile: return "profile"
        case .accessWallet: return "access-wallet"
        case .party(let route): return "party-\(route.partyID)"
        case .plan(let planId, _): return "plan-\(planId)"
        case .patch(let route): return "patch-\(route.patchId)"
        case .booking(let status, let url, let ride): return "booking-\(status)-\(ride?.id ?? url.absoluteString)"
        case .legal(let title, let url): return "legal-\(title)-\(url.absoluteString)"
        }
    }

    var title: String {
        switch self {
        case .profile: return "Profile"
        case .accessWallet: return "Access Wallet"
        case .party: return "Party Pass"
        case .plan: return "Plan"
        case .patch(let route): return "Patch \(route.patchId)"
        case .booking(let status, _, _): return status == "success" ? "Booking Confirmed" : "Booking Update"
        case .legal(let title, _): return title
        }
    }

    var subtitle: String {
        switch self {
        case .profile: return "Account, payments, preferences, and saved access."
        case .accessWallet: return "Tickets, reservations, patch access, and App Clip handoffs live here."
        case .party: return "Secure Party Pass continuation"
        case .plan: return "Join this plan and say if you’re in."
        case .patch(let route): return "\(route.tier.displayName) access · \(route.url.host ?? "bytspot.app")"
        case .booking(let status, _, _): return status == "success" ? "Your booking flow returned successfully." : "Review or retry this booking."
        case .legal(_, let url): return url.absoluteString
        }
    }

    var fallbackRoute: BytspotHybridRoute {
        switch self {
        case .profile: return .profile
        case .accessWallet, .party, .patch, .booking: return .access
        case .plan, .legal: return .home
        }
    }

    var eyebrow: String {
        switch self {
        case .profile: return "ACCOUNT"
        case .accessWallet: return "WALLET"
        case .party: return "PARTY PASS"
        case .plan: return "PLAN"
        case .patch(let route): return route.tier.eyebrow
        case .booking(let status, _, _): return status == "success" ? "CONFIRMED" : "BOOKING"
        case .legal: return "LEGAL"
        }
    }
}

/// Canonical native Party Pass URL. The App accepts only Bytspot's custom
/// scheme or production universal-link host; legacy `/group` is never a Party.
struct NativePartyPassRoute: Equatable {
    let partyID: String
    /// Set by the App Clip when it hands the guest to the installed app.
    private(set) var isHandoff = false
    /// Only ever present when the Clip already held a public, routable point.
    private(set) var latitude: Double?
    private(set) var longitude: Double?
    private(set) var intent: String?

    /// A handoff coordinate is worth centring the map on only when it is a real,
    /// in-range point. Anything else routes to the Party Pass without a camera move.
    var handoffCoordinate: NativeLocationCoordinate? {
        guard isHandoff, let latitude, let longitude,
              latitude.isFinite, longitude.isFinite,
              (-90...90).contains(latitude), (-180...180).contains(longitude),
              !(latitude == 0 && longitude == 0) else { return nil }
        // `isFallback: true` on purpose. This is a venue point the Clip carried
        // over, not a device fix, so it must never become check-in evidence that
        // the member is standing here. NativeVenueDetailContract.checkinInput
        // drops fallback coordinates, which keeps that guarantee automatic.
        return NativeLocationCoordinate(latitude: latitude, longitude: longitude, isFallback: true)
    }
    let url: URL

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let scheme = url.scheme?.lowercased()
        let isCustomScheme = scheme == "bytspot"
        let host = components.host?.lowercased() ?? ""
        let isUniversalLink = scheme == "https" && host == "bytspot.app"
        // A default App Clip link opens the full app whenever it is installed,
        // so the app has to read the same `partyId` the Clip reads. Without
        // this the party is dropped and the invocation falls to the patch route.
        let isDefaultAppClipLink = scheme == "https" && (host == "appclip.apple.com" || host.hasSuffix(".appclip.apple.com"))
        guard isCustomScheme || isUniversalLink || isDefaultAppClipLink else { return nil }

        let queryPartyID = (components.queryItems ?? []).first {
            ["partyid", "party"].contains($0.name.lowercased())
        }?.value?.trimmingCharacters(in: .whitespacesAndNewlines)

        let pathComponents: [Substring]
        if isCustomScheme, let host = components.host, !host.isEmpty {
            pathComponents = ([Substring(host)] + components.path.split(separator: "/"))
        } else {
            pathComponents = components.path.split(separator: "/")
        }
        let pathPartyID: String? = (pathComponents.count == 2 && pathComponents[0].lowercased() == "party")
            ? String(pathComponents[1]).trimmingCharacters(in: .whitespacesAndNewlines)
            : nil
        guard let partyID = pathPartyID ?? (isDefaultAppClipLink ? queryPartyID : nil) else { return nil }
        guard !partyID.isEmpty, partyID.count <= 200, !partyID.contains("/") else { return nil }
        self.partyID = partyID
        self.url = url
        let queryItems = components.queryItems ?? []
        func value(_ name: String) -> String? {
            queryItems.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }?.value
        }
        self.isHandoff = value("handoff") == "1"
        self.intent = ["save_to_wallet"].first { $0 == value("intent") }
        self.latitude = value("lat").flatMap(Double.init)
        self.longitude = value("lng").flatMap(Double.init)
    }
}

/// Canonical native Plan invite URL: `/plan/<id>` on the production host or the
/// custom scheme, with the bearer join token carried in `t`. The id previews a
/// Plan; the token is what seats the holder, so it is optional here and only
/// consumed when present — a token-less link still opens the Plan for someone
/// who already has a seat.
struct NativePlanRoute: Equatable {
    let planID: String
    let token: String?
    let url: URL

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let scheme = url.scheme?.lowercased()
        let isCustomScheme = scheme == "bytspot"
        let host = components.host?.lowercased() ?? ""
        let isUniversalLink = scheme == "https" && host == "bytspot.app"
        guard isCustomScheme || isUniversalLink else { return nil }

        let pathComponents: [Substring]
        if isCustomScheme, let host = components.host, !host.isEmpty {
            pathComponents = ([Substring(host)] + components.path.split(separator: "/"))
        } else {
            pathComponents = components.path.split(separator: "/")
        }
        guard pathComponents.count == 2, pathComponents[0].lowercased() == "plan" else { return nil }
        let planID = String(pathComponents[1]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !planID.isEmpty, planID.count <= 200, !planID.contains("/") else { return nil }
        self.planID = planID
        let rawToken = (components.queryItems ?? []).first {
            $0.name.caseInsensitiveCompare("t") == .orderedSame
        }?.value?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.token = (rawToken?.isEmpty == false && (rawToken?.count ?? 0) <= 200) ? rawToken : nil
        self.url = url
    }
}

/// Identifies which surface produced a patch URL so the native coordinator can
/// route through one funnel regardless of the entry path. Locked by
/// `NativePatchRouteSelfTests.assertScanSourceContract`.
enum NativePatchScanSource: String, CaseIterable, Equatable {
    case nfc
    case qr
    case virtual
    case universalLink
    case deepLink
}

@MainActor
final class NativeNavigationCoordinator: ObservableObject {
    @Published var requestedTab: BytspotNativeTab?
    @Published var requestedDestination: NativeContextualDestination?
    /// Consumed once by the Map surface to centre its camera after a Clip handoff.
    @Published var requestedMapCenter: NativeLocationCoordinate?
    @Published private(set) var lastURL: URL?
    @Published private(set) var lastScanSource: NativePatchScanSource?

    /// Single public entry point for scanner-driven patch ingestion (NFC, QR,
    /// virtual sheet). Parses the URL, tags the source, and routes through the
    /// same `.patch(route)` destination as universal links so the downstream
    /// `NativePatchPairingStore.markPaired(route:)` wiring fires uniformly.
    @discardableResult
    func notifyPatchScanned(url: URL, source: NativePatchScanSource) -> Bool {
        guard BytspotPatchRoute(url: url) != nil else { return false }
        lastScanSource = source
        return handle(url: url)
    }

    @discardableResult
    func handle(url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        lastURL = url
        let path = normalizedPath(url: url, components: components)

        if path == "map" || path.hasPrefix("map/") { requestedTab = .map; return true }
        if path == "discover" || path.hasPrefix("venue/") || path.hasPrefix("v/") || path.hasPrefix("discover/") { requestedTab = .discover; return true }
        if path == "concierge" || path.hasPrefix("concierge/") { requestedTab = .concierge; return true }
        if path == "profile" || path.hasPrefix("profile/") { requestedTab = .home; requestedDestination = .profile; return true }
        if path == "access" { requestedTab = .home; requestedDestination = .accessWallet; return true }
        if let partyRoute = NativePartyPassRoute(url: url) {
            // A Clip handoff that carried a public point opens the map on it, so the
            // guest lands on where they are going rather than on a card about it.
            if let coordinate = partyRoute.handoffCoordinate {
                requestedMapCenter = coordinate
                requestedTab = .map
            } else {
                requestedTab = .home
            }
            requestedDestination = .party(partyRoute)
            return true
        }
        if let planRoute = NativePlanRoute(url: url) {
            // The Plan tab sits behind the join sheet, so dismissing it reveals
            // the Plan the holder just took a seat on.
            requestedTab = .plan
            requestedDestination = .plan(planId: planRoute.planID, token: planRoute.token)
            return true
        }
        if path.hasPrefix("booking/") {
            requestedTab = .home
            let status = path.split(separator: "/").dropFirst().first.map(String.init) ?? "update"
            requestedDestination = .booking(status: status, url: url)
            return true
        }
        if ["privacy", "terms", "disclaimer"].contains(path) {
            requestedTab = .home
            requestedDestination = .legal(title: path.capitalized, url: url)
            return true
        }
        if let patchRoute = BytspotPatchRoute(url: url) {
            requestedTab = .map
            requestedDestination = .patch(patchRoute)
            return true
        }
        if path == "patch" || path == "clip" { requestedTab = .home; requestedDestination = .accessWallet; return true }
        return false
    }

    func drainPendingURLs() {
        for (url, source) in NativeIncomingURLCenter.drain() {
            _ = notifyPatchScanned(url: url, source: source)
            if BytspotPatchRoute(url: url) == nil { _ = handle(url: url) }
        }
    }

    /// Routes a native-created reservation through the same booking destination
    /// used by verified booking links while preserving the decoded ride record.
    func presentBooking(ride: NativeMobilityRideRecord) {
        let rideID = ride.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rideID.isEmpty else { return }
        let status = ride.normalizedStatus
        var components = URLComponents()
        components.scheme = "bytspot"
        components.host = "booking"
        components.path = "/\(status)"
        components.queryItems = [URLQueryItem(name: "rideId", value: rideID)]
        guard let url = components.url else { return }
        requestedTab = .home
        requestedDestination = .booking(status: status, url: url, ride: ride)
    }

    private func normalizedPath(url: URL, components: URLComponents) -> String {
        let rawPath: String
        if url.scheme?.lowercased() == "bytspot", let host = components.host, !host.isEmpty {
            rawPath = "\(host)\(components.path)"
        } else {
            rawPath = components.path
        }
        return rawPath.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
    }
}

enum NativeIncomingURLCenter {
    static let notification = Notification.Name("BytspotNativeIncomingURL")
    static let scanSourceUserInfoKey = "scanSource"
    private static var pending: [(URL, NativePatchScanSource)] = []

    static func publish(_ url: URL, scanSource: NativePatchScanSource = .universalLink) {
        pending.append((url, scanSource))
        NotificationCenter.default.post(
            name: notification,
            object: url,
            userInfo: [scanSourceUserInfoKey: scanSource.rawValue]
        )
    }

    static func drain() -> [(URL, NativePatchScanSource)] {
        let buffered = pending
        pending.removeAll()
        return buffered
    }
}
