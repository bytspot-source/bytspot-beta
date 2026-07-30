import Foundation
import SwiftUI

enum NativeContextualDestination: Identifiable, Equatable {
    case profile
    case accessWallet
    case patch(BytspotPatchRoute)
    case booking(status: String, url: URL)
    case legal(title: String, url: URL)

    var id: String {
        switch self {
        case .profile: return "profile"
        case .accessWallet: return "access-wallet"
        case .patch(let route): return "patch-\(route.patchId)"
        case .booking(let status, let url): return "booking-\(status)-\(url.absoluteString)"
        case .legal(let title, let url): return "legal-\(title)-\(url.absoluteString)"
        }
    }

    var title: String {
        switch self {
        case .profile: return "Profile"
        case .accessWallet: return "Access Wallet"
        case .patch(let route): return "Patch \(route.patchId)"
        case .booking(let status, _): return status == "success" ? "Booking Confirmed" : "Booking Update"
        case .legal(let title, _): return title
        }
    }

    var subtitle: String {
        switch self {
        case .profile: return "Account, payments, preferences, and saved access."
        case .accessWallet: return "Tickets, reservations, patch access, and App Clip handoffs live here."
        case .patch(let route): return "\(route.tier.displayName) access · \(route.url.host ?? "bytspot.app")"
        case .booking(let status, _): return status == "success" ? "Your booking flow returned successfully." : "Review or retry this booking."
        case .legal(_, let url): return url.absoluteString
        }
    }

    var fallbackRoute: BytspotHybridRoute {
        switch self {
        case .profile: return .profile
        case .accessWallet, .patch, .booking: return .access
        case .legal: return .home
        }
    }

    var eyebrow: String {
        switch self {
        case .profile: return "ACCOUNT"
        case .accessWallet: return "WALLET"
        case .patch(let route): return route.tier.eyebrow
        case .booking(let status, _): return status == "success" ? "CONFIRMED" : "BOOKING"
        case .legal: return "LEGAL"
        }
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
