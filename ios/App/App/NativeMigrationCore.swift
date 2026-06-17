import Foundation
import Security
import SwiftUI

enum NativeMigrationConfig {
    static let environmentKey = "BYT_NATIVE_ROOT"
    static let authAutorunEnvironmentKey = "BYT_NATIVE_AUTH_AUTORUN"
    static let authMockEnvironmentKey = "BYT_NATIVE_AUTH_MOCK"
    static let previewSessionEnvironmentKey = "BYT_NATIVE_PREVIEW_SESSION"
    static let previewTokenEnvironmentKey = "BYT_NATIVE_PREVIEW_TOKEN"
    static let defaultsKey = "bytspot_native_root_enabled"

    /// Non-shipping migration gate. Release builds continue to use Capacitor unless
    /// a simulator/dev runtime explicitly opts into the native root.
    static var isNativeRootEnabled: Bool {
        ProcessInfo.processInfo.environment[environmentKey] == "1"
            || UserDefaults.standard.bool(forKey: defaultsKey)
    }
}

enum NativePatchRouteKind: String, Equatable {
    case access
    case patch
    case tap
    case directBYT

    var displayName: String {
        switch self {
        case .access: return "Access"
        case .patch: return "Patch"
        case .tap: return "Tap"
        case .directBYT: return "BYT tag"
        }
    }
}

enum NativePatchUseMode: String, Equatable {
    case everyday
    case oneTime

    var queryValue: String {
        switch self {
        case .everyday: return "everyday"
        case .oneTime: return "one_time"
        }
    }

    var displayName: String {
        switch self {
        case .everyday: return "Everyday membership"
        case .oneTime: return "One-time access"
        }
    }
}

enum NativePatchTagIntent: String, Equatable {
    case access
    case friendTap
    case share
    case socialTap

    var queryValue: String {
        switch self {
        case .access: return "access"
        case .friendTap: return "friend_tap"
        case .share: return "share"
        case .socialTap: return "social_tap"
        }
    }

    var displayName: String {
        switch self {
        case .access: return "access"
        case .friendTap: return "friend tap"
        case .share: return "share"
        case .socialTap: return "social tap"
        }
    }
}

struct BytspotPatchRoute: Equatable, Identifiable {
    let url: URL
    let patchId: String
    let token: String?
    let venueName: String?
    let serviceId: String?
    let tier: BytspotTier
    let routeKind: NativePatchRouteKind
    let useMode: NativePatchUseMode
    let tagIntent: NativePatchTagIntent?
    let referralCode: String?
    let groupSize: Int?
    let uid: String?
    let readCounter: Int?
    let customerId: String?

    var id: String { patchId }

    var canonicalAccessPath: String {
        canonicalPath(prefix: "access", includePatchAlias: false)
    }

    var canonicalPatchPath: String {
        canonicalPath(prefix: "p", includePatchAlias: true)
    }

    var canonicalSummary: String {
        "Access \(canonicalAccessPath) · Patch \(canonicalPatchPath)"
    }

    var normalizedSummary: String {
        "\(routeKind.displayName) · \(tier.displayName) · \(useMode.displayName)"
    }

    var requiresSignedToken: Bool { token?.isEmpty != false }

    var scannerTrustLabel: String {
        if readCounter != nil { return "NFC counter-ready" }
        if uid != nil { return "NFC UID-ready" }
        if token?.isEmpty == false { return "Signed token" }
        return "Static discovery"
    }

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let query = components.queryItems ?? []
        let pathParts = Self.pathParts(from: components)
        let queryPatch = Self.queryValue(in: query, names: ["patch", "patchid", "p"])
        let pathPatch = Self.patchId(from: pathParts)
        guard let patchId = queryPatch ?? pathPatch, !patchId.isEmpty else { return nil }
        self.url = url
        self.patchId = patchId
        self.token = Self.queryValue(in: query, names: ["t", "token"])
        self.venueName = Self.queryValue(in: query, names: ["venue", "venuename", "v"])
        self.serviceId = Self.queryValue(in: query, names: ["service", "serviceid"])
        self.tier = BytspotTier.detect(url: url, patchId: patchId)
        self.routeKind = Self.routeKind(from: pathParts)
        let explicitUseMode = Self.queryValue(in: query, names: ["tagusemode", "usemode", "use", "usage", "mode"])
        self.useMode = Self.useMode(from: explicitUseMode, hasEventMarker: Self.hasQueryItem(in: query, names: ["event", "eventid", "expires", "expiresat"]), pathParts: pathParts)
        self.tagIntent = Self.tagIntent(from: Self.queryValue(in: query, names: ["tagintent", "intent", "action", "tap"]))
        self.referralCode = Self.queryValue(in: query, names: ["referral", "referralcode", "ref", "r", "owner"])
        self.groupSize = Self.queryValue(in: query, names: ["groupsize", "group", "guests", "party"]).flatMap(Int.init).map { max(0, $0) }
        self.uid = Self.queryValue(in: query, names: ["uid"])
        self.readCounter = Self.queryValue(in: query, names: ["readcounter", "counter"]).flatMap(Int.init)
        self.customerId = Self.queryValue(in: query, names: ["customerid", "customer", "c"])
    }

    private static func routeKind(from pathParts: [String]) -> NativePatchRouteKind {
        guard let first = pathParts.first?.lowercased() else { return .directBYT }
        if first == "access" { return .access }
        if first == "t" { return .tap }
        if first == "p" || first == "patch" { return .patch }
        return .directBYT
    }

    private static func useMode(from raw: String?, hasEventMarker: Bool, pathParts: [String]) -> NativePatchUseMode {
        let normalized = raw?.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_")
        switch normalized {
        case "one_time", "onetime", "single", "single_use", "event", "drop", "temporary": return .oneTime
        case "everyday", "daily", "member", "monthly", "retail", "subscription", "subscriber": return .everyday
        default:
            if hasEventMarker { return .oneTime }
            if pathParts.count == 1, pathParts[0].uppercased().hasPrefix("BYT") { return .everyday }
            return .everyday
        }
    }

    private static func tagIntent(from raw: String?) -> NativePatchTagIntent? {
        let normalized = raw?.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_")
        switch normalized {
        case "access": return .access
        case "friend", "friend_tap", "guest", "guest_pass", "referral": return .friendTap
        case "share", "social_share", "proof": return .share
        case "social", "social_tap", "group", "group_tap": return .socialTap
        default: return nil
        }
    }

    private static func patchId(from pathParts: [String]) -> String? {
        guard !pathParts.isEmpty else { return nil }
        let routeNames = Set(["access", "p", "patch", "t"])
        if pathParts.count >= 2, routeNames.contains(pathParts[0].lowercased()) { return pathParts[1] }
        if pathParts.count == 1, pathParts[0].uppercased().hasPrefix("BYT") { return pathParts[0] }
        return nil
    }

    private static func pathParts(from components: URLComponents) -> [String] {
        var parts = components.path.split(separator: "/").map(String.init)
        let scheme = components.scheme?.lowercased()
        if scheme != "http", scheme != "https", let host = components.host, !host.isEmpty {
            parts.insert(host, at: 0)
        }
        return parts
    }

    private static func queryValue(in items: [URLQueryItem], names: Set<String>) -> String? {
        items.first { names.contains($0.name.lowercased()) }?.value
    }

    private static func hasQueryItem(in items: [URLQueryItem], names: Set<String>) -> Bool {
        items.contains { names.contains($0.name.lowercased()) }
    }

    private func canonicalPath(prefix: String, includePatchAlias: Bool) -> String {
        var components = URLComponents()
        components.path = "/\(prefix)/\(patchId)"
        components.queryItems = canonicalQueryItems(includePatchAlias: includePatchAlias)
        guard let encoded = components.string, !encoded.isEmpty else { return components.path }
        return encoded
    }

    private func canonicalQueryItems(includePatchAlias: Bool) -> [URLQueryItem] {
        var items: [URLQueryItem] = []
        if includePatchAlias { items.append(URLQueryItem(name: "patch", value: patchId)) }
        items.append(URLQueryItem(name: "tier", value: tier.rawValue))
        items.append(URLQueryItem(name: "tagUseMode", value: useMode.queryValue))
        if let tagIntent { items.append(URLQueryItem(name: "tagIntent", value: tagIntent.queryValue)) }
        if let venueName, !venueName.isEmpty { items.append(URLQueryItem(name: "venue", value: venueName)) }
        if let serviceId, !serviceId.isEmpty { items.append(URLQueryItem(name: "service", value: serviceId)) }
        if let referralCode, !referralCode.isEmpty { items.append(URLQueryItem(name: "ref", value: referralCode)) }
        if let groupSize { items.append(URLQueryItem(name: "group", value: String(groupSize))) }
        if let uid, !uid.isEmpty { items.append(URLQueryItem(name: "uid", value: uid)) }
        if let readCounter { items.append(URLQueryItem(name: "counter", value: String(readCounter))) }
        if let customerId, !customerId.isEmpty { items.append(URLQueryItem(name: "customer", value: customerId)) }
        return items
    }
}

enum NativeVirtualPatchMembershipMode: String, Equatable {
    case blackEverydayMembership = "black_everyday_membership"
    case oneTime = "one_time"
    case standard

    var displayName: String {
        switch self {
        case .blackEverydayMembership: return "Black everyday membership"
        case .oneTime: return "One-time tag"
        case .standard: return "Standard hold"
        }
    }
}

enum NativeVirtualPatchCheckoutDecision: String, Equatable {
    case create
    case reuseActive = "reuse_active"
    case blockedOneTime = "blocked_one_time"

    var displayName: String {
        switch self {
        case .create: return "Create preview hold"
        case .reuseActive: return "Reuse active hold"
        case .blockedOneTime: return "Blocked by one-time tag"
        }
    }
}

struct NativeVirtualPatchCheckoutIntent: Equatable {
    var kind = "booking"
    var serviceId: String?
    var serviceName: String?
    var vendorId: String?
    var amountCents: Int?
    var guestCount: Int?
    var requestedAt: Date?
    var holdExpiresAt: Date?
}

struct NativeVirtualPatchSavedServiceRequest: Equatable, Identifiable {
    var id: String
    var kind = "booking"
    var serviceId: String?
    var serviceName: String?
    var vendorId: String?
    var amountCents: Int?
    var guestCount: Int?
    var requestedAt: Date
    var holdExpiresAt: Date?
    var idempotencyKey: String?
}

struct NativePatchLineItem: Equatable, Identifiable {
    let id: String
    let label: String
    let amountCents: Int
    let quantity: Int

    var subtotalCents: Int { max(amountCents, 0) * max(quantity, 0) }
}

enum NativePatchSpecialFlowKind: String, Equatable {
    case broniHomeTaste
    case ghAkwaabaFifa

    var eyebrow: String {
        switch self {
        case .broniHomeTaste: return "BRONI HOME TASTE"
        case .ghAkwaabaFifa: return "GH AKWAABA PASS"
        }
    }

    var actionLabel: String {
        switch self {
        case .broniHomeTaste: return "Reserve table"
        case .ghAkwaabaFifa: return "View digital pass"
        }
    }

    var sectionTitle: String {
        switch self {
        case .broniHomeTaste: return "Matchday Favorites"
        case .ghAkwaabaFifa: return "Matchday Essentials"
        }
    }
}

struct NativePatchSpecialFlow: Equatable, Identifiable {
    let kind: NativePatchSpecialFlowKind
    let vendorName: String
    let serviceName: String
    let tagline: String
    let highlights: [String]
    let lineItems: [NativePatchLineItem]

    var id: String { kind.rawValue }
    var totalCents: Int { lineItems.reduce(0) { $0 + $1.subtotalCents } }

    var summary: String {
        "\(vendorName) · \(serviceName) · \(tagline)"
    }

    func checkoutIntent(route: BytspotPatchRoute) -> NativeVirtualPatchCheckoutIntent {
        NativeVirtualPatchCheckoutIntent(
            serviceId: route.serviceId ?? serviceId,
            serviceName: serviceName,
            vendorId: vendorId,
            amountCents: totalCents,
            guestCount: max(route.groupSize ?? lineItems.reduce(0) { $0 + $1.quantity }, 1)
        )
    }

    static func resolve(route: BytspotPatchRoute) -> NativePatchSpecialFlow? {
        guard route.tier == .platinum else { return nil }
        let text = [route.patchId, route.serviceId ?? "", route.venueName ?? "", route.url.absoluteString]
            .joined(separator: " ")
            .lowercased()
        if text.contains("akwaaba") || text.contains("fifa") || text.contains("matchday") || text.contains("ghana") {
            return ghAkwaabaFifa
        }
        if text.contains("broni") || text.contains("obroni") || text.contains("home-taste") || text.contains("home taste") || text.contains("platinum-dining") {
            return broniHomeTaste
        }
        return nil
    }

    private var serviceId: String {
        switch kind {
        case .broniHomeTaste: return "platinum-dining"
        case .ghAkwaabaFifa: return "gh-akwaaba-fifa"
        }
    }

    private var vendorId: String {
        switch kind {
        case .broniHomeTaste: return "broni-home-taste"
        case .ghAkwaabaFifa: return "gh-akwaaba-pass"
        }
    }

    private static let broniHomeTaste = NativePatchSpecialFlow(
        kind: .broniHomeTaste,
        vendorName: "Broni Home Taste",
        serviceName: "Reserve a Table",
        tagline: "Authentic Ghanaian Home Cooking",
        highlights: ["Matchday favorites", "Fresh Ghanaian dishes", "Pickup or delivery", "Family-style portions"],
        lineItems: [
            NativePatchLineItem(id: "broni-jollof-chicken", label: "Jollof Rice with Chicken", amountCents: 1_500, quantity: 1),
            NativePatchLineItem(id: "broni-white-rice-stew", label: "White Rice with Stew", amountCents: 1_700, quantity: 0),
            NativePatchLineItem(id: "broni-waakye", label: "Waakye", amountCents: 1_600, quantity: 0),
            NativePatchLineItem(id: "broni-plantain-beans", label: "Fried Plantain and Beans", amountCents: 1_200, quantity: 0),
            NativePatchLineItem(id: "broni-banku-tilapia", label: "Banku and Fried Fish/Tilapia", amountCents: 2_200, quantity: 0),
            NativePatchLineItem(id: "broni-fufu", label: "Fufu", amountCents: 2_000, quantity: 0)
        ]
    )

    private static let ghAkwaabaFifa = NativePatchSpecialFlow(
        kind: .ghAkwaabaFifa,
        vendorName: "GH Akwaaba Pass",
        serviceName: "FIFA Matchday Pass",
        tagline: "Premium Event Access & Concierge",
        highlights: ["Fast-track entry", "VIP Lounge access", "Digital pass delivery", "On-site host support"],
        lineItems: [
            NativePatchLineItem(id: "tickets", label: "Ticket Sales", amountCents: 5_000, quantity: 1),
            NativePatchLineItem(id: "souvenirs", label: "Souvenirs", amountCents: 1_500, quantity: 0),
            NativePatchLineItem(id: "jerseys", label: "Ghana Home Jersey", amountCents: 7_500, quantity: 0)
        ]
    )
}

struct NativeVirtualPatchCheckoutPolicyResult: Equatable {
    let decision: NativeVirtualPatchCheckoutDecision
    let membershipMode: NativeVirtualPatchMembershipMode
    let idempotencyKey: String
    let holdExpiresAt: Date
    let reason: String
    let existingRequest: NativeVirtualPatchSavedServiceRequest?
}

enum NativeVirtualPatchCheckoutPolicy {
    static let holdWindow: TimeInterval = 45 * 60

    static func membershipMode(for route: BytspotPatchRoute) -> NativeVirtualPatchMembershipMode {
        if route.tier == .black, route.useMode == .everyday { return .blackEverydayMembership }
        if route.useMode == .oneTime { return .oneTime }
        return .standard
    }

    static func buildIdempotencyKey(route: BytspotPatchRoute, intent: NativeVirtualPatchCheckoutIntent) -> String {
        let service = keyPart(intent.serviceId ?? intent.serviceName, fallback: "unknown-service")
        let vendor = keyPart(intent.vendorId, fallback: "venue")
        let kind = keyPart(intent.kind, fallback: "booking")
        let amount = numberPart(intent.amountCents, fallback: "quote")
        let guests = numberPart(intent.guestCount, fallback: "1")
        return ["vpatch", "checkout", "v1", keyPart(route.patchId, fallback: "unknown-patch"), kind, vendor, service, amount, guests].joined(separator: ":")
    }

    static func resolve(route: BytspotPatchRoute, intent: NativeVirtualPatchCheckoutIntent, existingRequests: [NativeVirtualPatchSavedServiceRequest] = [], now: Date = Date(), holdWindow: TimeInterval = Self.holdWindow) -> NativeVirtualPatchCheckoutPolicyResult {
        let requestedAt = intent.requestedAt ?? now
        let holdExpiresAt = intent.holdExpiresAt ?? requestedAt.addingTimeInterval(holdWindow)
        let key = buildIdempotencyKey(route: route, intent: intent)
        let mode = membershipMode(for: route)
        let active = existingRequests.filter { expiresAt(for: $0, holdWindow: holdWindow) > now }
        let duplicate = active.first { request in
            let requestKey = request.idempotencyKey ?? buildIdempotencyKey(route: route, intent: request.intent)
            return requestKey == key
        }

        if let duplicate {
            return NativeVirtualPatchCheckoutPolicyResult(decision: .reuseActive, membershipMode: mode, idempotencyKey: key, holdExpiresAt: holdExpiresAt, reason: "identical_active_hold", existingRequest: duplicate)
        }
        if mode == .oneTime, let first = active.first {
            return NativeVirtualPatchCheckoutPolicyResult(decision: .blockedOneTime, membershipMode: mode, idempotencyKey: key, holdExpiresAt: holdExpiresAt, reason: "one_time_tag_active_request_exists", existingRequest: first)
        }
        let reason = mode == .blackEverydayMembership ? "membership_allows_distinct_service" : "no_active_duplicate"
        return NativeVirtualPatchCheckoutPolicyResult(decision: .create, membershipMode: mode, idempotencyKey: key, holdExpiresAt: holdExpiresAt, reason: reason, existingRequest: nil)
    }

    static func formatted(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    private static func expiresAt(for request: NativeVirtualPatchSavedServiceRequest, holdWindow: TimeInterval) -> Date {
        request.holdExpiresAt ?? request.requestedAt.addingTimeInterval(holdWindow)
    }

    private static func keyPart(_ value: String?, fallback: String) -> String {
        let scalars = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased().unicodeScalars
        var output = ""
        var previousWasDash = false
        for scalar in scalars {
            let allowed = CharacterSet.alphanumerics.contains(scalar) || scalar == "." || scalar == "_" || scalar == "-"
            if allowed {
                output.unicodeScalars.append(scalar)
                previousWasDash = false
            } else if !previousWasDash {
                output.append("-")
                previousWasDash = true
            }
        }
        let normalized = output.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return normalized.isEmpty ? fallback : normalized
    }

    private static func numberPart(_ value: Int?, fallback: String) -> String {
        guard let value else { return fallback }
        return String(max(0, value))
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private extension NativeVirtualPatchSavedServiceRequest {
    var intent: NativeVirtualPatchCheckoutIntent {
        NativeVirtualPatchCheckoutIntent(kind: kind, serviceId: serviceId, serviceName: serviceName, vendorId: vendorId, amountCents: amountCents, guestCount: guestCount)
    }
}

@MainActor
final class BytspotSessionStore: ObservableObject {
    @Published private(set) var token: String?
    private let account: String
    private let service: String

    init(account: String = "bytspot_auth_token", service: String = Bundle.main.bundleIdentifier ?? "com.bytspot.app") {
        self.account = account
        self.service = service
        token = readToken()
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        switch ProcessInfo.processInfo.environment[NativeMigrationConfig.previewSessionEnvironmentKey]?.lowercased() {
        case "signed_out": token = nil
        case "guest": token = "guest_session"
        default:
            if let previewToken = ProcessInfo.processInfo.environment[NativeMigrationConfig.previewTokenEnvironmentKey], !previewToken.isEmpty {
                token = previewToken
            }
        }
    }

    var isAuthenticated: Bool {
        guard let token, !token.isEmpty else { return false }
        return token != "guest_session"
    }

    var isGuest: Bool { token == "guest_session" }

    var hasSecureToken: Bool { token?.isEmpty == false }

    var canAttachBearerToken: Bool { isAuthenticated }

    var sessionLabel: String {
        if isAuthenticated { return "Signed in" }
        if isGuest { return "Guest preview" }
        return "Signed out"
    }

    func continueAsGuest() {
        updateToken("guest_session")
    }

    func signOut() {
        updateToken(nil)
    }

    func reloadFromKeychain() {
        token = readToken()
    }

    func updateToken(_ newToken: String?) {
        if let newToken, !newToken.isEmpty {
            saveToken(newToken)
            token = newToken
        } else {
            clearToken()
            token = nil
        }
    }

    private func readToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func saveToken(_ token: String) {
        clearToken()
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(token.utf8)
        ]
        SecItemAdd(item as CFDictionary, nil)
    }

    private func clearToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
