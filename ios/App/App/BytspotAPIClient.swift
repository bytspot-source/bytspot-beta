import Foundation
import MapKit

struct BytspotAPIClient {
    enum APIError: Error {
        case invalidURL
        case invalidResponse
        case server(status: Int, body: String)
    }

    var baseURL: URL = configuredBaseURL
    var tokenProvider: () -> String? = { nil }
    var urlSession: URLSession = .shared

    private static var configuredBaseURL: URL {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["BYT_API_BASE_URL"],
           let url = URL(string: raw), url.scheme?.lowercased() == "https" {
            return url
        }
        #endif
        return URL(string: "https://bytspot-api.onrender.com")!
    }

    func makeRequest(path: String, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    func data(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        let request = try makeRequest(path: path, method: method, body: body)
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    func json(path: String, method: String = "GET", body: Data? = nil) async throws -> Any {
        try JSONSerialization.jsonObject(with: try await data(path: path, method: method, body: body))
    }

    func trpcPayload(path: String, method: String = "GET", input: [String: Any]? = nil) async throws -> Any {
        let body = try input.map(Self.trpcMutationBody)
        return Self.unwrapTRPCData(try await json(path: path, method: method, body: body))
    }

    static func trpcMutationBody(_ input: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: input)
    }

    func trpcQueryPayload(path: String, input: [String: Any]) async throws -> Any {
        Self.unwrapTRPCData(try await json(path: Self.trpcQueryPath(path, input: input)))
    }

    func trpcDecode<T: Decodable>(_ type: T.Type, path: String, method: String = "GET", input: [String: Any]? = nil) async throws -> T {
        let payload = try await trpcPayload(path: path, method: method, input: input)
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func unwrapTRPCData(_ value: Any) -> Any {
        guard let dict = value as? [String: Any] else { return value }
        if let result = dict["result"] { return unwrapTRPCData(result) }
        if let data = dict["data"] as? [String: Any] {
            if let json = data["json"] { return json }
            return unwrapTRPCData(data)
        }
        return value
    }

    static func trpcQueryPath(_ path: String, input: [String: Any]) throws -> String {
        let inputData = try JSONSerialization.data(withJSONObject: input)
        var components = URLComponents()
        components.path = path
        components.queryItems = [URLQueryItem(name: "input", value: String(data: inputData, encoding: .utf8) ?? "")]
        return components.string ?? path
    }
}

struct NativePushDeviceRegistration: Codable, Equatable {
    let token: String
    let environment: String
    let bundleId: String

    static let productionBundleID = "com.bytspot.app"

    static func production(token: String) -> NativePushDeviceRegistration? {
        guard let normalizedToken = NativePushService.normalizedToken(token) else { return nil }
        return NativePushDeviceRegistration(token: normalizedToken, environment: "production", bundleId: productionBundleID)
    }

    var input: [String: Any] {
        ["token": token, "environment": environment, "bundleId": bundleId]
    }
}

struct NativePushDeviceAPI {
    static let registerPath = "/trpc/push.registerIosDevice"
    static let unregisterPath = "/trpc/push.unregisterIosDevice"

    let client: BytspotAPIClient

    func register(_ registration: NativePushDeviceRegistration) async throws {
        _ = try await client.trpcPayload(path: Self.registerPath, method: "POST", input: registration.input)
    }

    func unregister(token: String) async throws {
        guard let normalizedToken = NativePushService.normalizedToken(token) else { return }
        _ = try await client.trpcPayload(path: Self.unregisterPath, method: "POST", input: ["token": normalizedToken])
    }
}

struct NativeUserProfileRecord: Codable, Equatable {
    var id: String?
    var email: String?
    var name: String?
    var phone: String?
    var profileImage: String?
    var address: String?
    var birthday: String?
}

struct NativeVehicleRecord: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var make: String
    var model: String
    var year: Int
    var color: String
    var licensePlate: String
    var photo: String?
    var vin: String?
    var transmissionType: String
    var trunkCategory: String

    var title: String { [String(year), make, model].filter { !$0.isEmpty }.joined(separator: " ") }
    var subtitle: String { "\(color.isEmpty ? "Color pending" : color) · Plate \(licensePlate.isEmpty ? "pending" : licensePlate)" }
}

struct NativePaymentMethodRecord: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var brand: String?
    var last4: String?
    var expiryMonth: String?
    var expiryYear: String?
    var isDefault: Bool

    var label: String { "\((brand ?? type).capitalized) •••• \(last4 ?? "")" }
    var detail: String { [expiryMonth, expiryYear].compactMap { $0 }.joined(separator: "/") }
}

struct NativePaymentSetupSession: Codable, Equatable {
    var url: String?

    var safeSetupURLString: String? { url.flatMap(Self.normalizedSetupURL) }

    static func normalizedSetupURL(_ candidate: String) -> String? {
        guard let url = URL(string: candidate.trimmingCharacters(in: .whitespacesAndNewlines)),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              isAllowedSetupHost(host) else { return nil }
        return url.absoluteString
    }

    private static func isAllowedSetupHost(_ host: String) -> Bool {
        host == "stripe.com" || host.hasSuffix(".stripe.com") || host == "bytspot.app" || host.hasSuffix(".bytspot.app") || host == "bytspot.com" || host.hasSuffix(".bytspot.com") || host == "bytspot-api.onrender.com"
    }
}

struct NativeSocialCircle: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var ownerUserId: String?
    var memberCount: Int
    var memberIDs: [String]
    var role: String

    var memberLabel: String { "\(memberCount) member\(memberCount == 1 ? "" : "s")" }

    static func normalizeSocialCircle(_ value: Any) -> NativeSocialCircle? {
        guard let row = value as? [String: Any] else { return nil }
        guard let id = cleanValue(row["id"] ?? row["groupId"]), let name = cleanValue(row["name"] ?? row["title"]) else { return nil }
        let rawMembers = (row["memberIds"] as? [Any]) ?? (row["memberIDs"] as? [Any]) ?? []
        let memberIDs = rawMembers.compactMap { member in
            cleanValue(member) ?? (member as? [String: Any]).flatMap { cleanValue($0["userId"] ?? $0["id"]) }
        }
        return NativeSocialCircle(id: id, name: name, ownerUserId: cleanValue(row["ownerUserId"]), memberCount: intValue(row["memberCount"] ?? row["membersCount"]) ?? memberIDs.count, memberIDs: memberIDs, role: cleanValue(row["role"]) ?? "member")
    }

    /// Create is always performed by the owner. Promote a missing/legacy role
    /// so swipe-to-delete is enabled on the row that just appeared.
    static func ownedByCreator(_ circle: NativeSocialCircle) -> NativeSocialCircle {
        guard circle.role != "owner" else { return circle }
        var owned = circle
        owned.role = "owner"
        return owned
    }

    static func normalizeSocialCircles(_ response: Any) -> [NativeSocialCircle] {
        rows(from: response, keys: ["groups", "circles", "items"]).compactMap(normalizeSocialCircle)
    }

    static func cleanValue(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static func intValue(_ value: Any?) -> Int? {
        if let int = value as? Int { return int }
        if let double = value as? Double { return Int(double) }
        if let string = value as? String { return Int(string) }
        return nil
    }

    static func rows(from response: Any, keys: [String]) -> [Any] {
        if let array = response as? [Any] { return array }
        guard let root = response as? [String: Any] else { return [] }
        for key in keys { if let array = root[key] as? [Any] { return array } }
        return []
    }
}

struct NativeSocialCircleSnapshot: Equatable {
    enum Source: String { case backend, fallback }

    var source: Source
    var groups: [NativeSocialCircle]

    static let empty = NativeSocialCircleSnapshot(source: .fallback, groups: [])

    var totalMembers: Int { groups.reduce(0) { $0 + $1.memberCount } }
    var summaryLine: String {
        if groups.isEmpty { return "Sign in to load private circles and trusted connections." }
        return "\(groups.count) circle\(groups.count == 1 ? "" : "s") · \(totalMembers) connection\(totalMembers == 1 ? "" : "s")"
    }
}

struct NativeSocialInvitation: Equatable, Identifiable {
    var id: String
    var direction: String
    var status: String
    var personID: String
    var personName: String
    var circleID: String?
    var circleName: String?

    static func normalize(_ value: Any) -> NativeSocialInvitation? {
        guard let row = value as? [String: Any] else { return nil }
        guard let id = NativeSocialCircle.cleanValue(row["id"] ?? row["inviteId"]) else { return nil }
        let direction = NativeSocialCircle.cleanValue(row["direction"])?.lowercased() == "incoming" || (row["incoming"] as? Bool) == true ? "incoming" : "outgoing"
        let person = (row["person"] as? [String: Any]) ?? (direction == "incoming" ? row["sender"] as? [String: Any] : row["recipient"] as? [String: Any]) ?? row
        guard let personID = NativeSocialCircle.cleanValue(person["userId"] ?? person["id"]) else { return nil }
        let circle = (row["group"] as? [String: Any]) ?? (row["circle"] as? [String: Any])
        return NativeSocialInvitation(id: id, direction: direction, status: NativeSocialCircle.cleanValue(row["status"])?.lowercased() ?? "pending", personID: personID, personName: NativeSocialCircle.cleanValue(person["name"] ?? person["displayName"]) ?? "Bytspot member", circleID: NativeSocialCircle.cleanValue(row["groupId"] ?? row["circleId"] ?? circle?["id"]), circleName: NativeSocialCircle.cleanValue(row["groupName"] ?? row["circleName"] ?? circle?["name"]))
    }

    static func normalizeList(_ response: Any) -> [NativeSocialInvitation] {
        if let single = normalize(response) { return [single] }
        return NativeSocialCircle.rows(from: response, keys: ["invites", "invitations", "items"]).compactMap(normalize)
    }
}

/// Network swipe is only offered when a real delete/cancel/dismiss path exists.
enum NativeNetworkSwipePolicy {
    static func canDeleteRoom() -> Bool { true }
    static func canDeleteCircle(role: String) -> Bool { role == "owner" }
    static func canCancelInvitation(direction: String, status: String) -> Bool {
        direction == "outgoing" && status == "pending"
    }
    static func canDismissContact() -> Bool { true }
}

/// Horizontal reveal for Network swipe-to-delete. Trash stays off-screen
/// until a real swipe crosses the threshold, so row taps never hit delete.
enum NativeNetworkSwipeReveal {
    static let width: CGFloat = 84
    static let revealThreshold: CGFloat = -40
    static let hideThreshold: CGFloat = 40

    static func isRevealed(translation: CGFloat, currentlyRevealed: Bool) -> Bool {
        if translation <= revealThreshold { return true }
        if translation >= hideThreshold { return false }
        return currentlyRevealed
    }
}

enum NativeNetworkDismissedContacts {
    static func storageKey(userID: String?) -> String {
        "bytspot.network.dismissed-contacts.\(userID?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "signed-out")"
    }

    static func load(userID: String?) -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: storageKey(userID: userID)) ?? [])
    }

    static func save(_ ids: Set<String>, userID: String?) {
        UserDefaults.standard.set(Array(ids).sorted(), forKey: storageKey(userID: userID))
    }
}

/// One mutual opt-in from social.peopleMet.list. Fail-closed: rows without a
/// usable userId are dropped, and opt-in status decodes to false unless the
/// server explicitly says otherwise.
struct NativePeopleMetPerson: Equatable, Identifiable {
    var userId: String
    var name: String
    var inviteStatus: String?

    var id: String { userId }

    var canSendInvite: Bool { inviteStatus == nil }
    var inviteStatusLabel: String {
        switch inviteStatus {
        case "pending": return "Invite sent"
        case "accepted": return "Connected"
        case "declined": return "Invite declined"
        default: return "Met at this party"
        }
    }

    static func normalize(_ value: Any) -> NativePeopleMetPerson? {
        guard let row = value as? [String: Any] else { return nil }
        guard let userId = NativeSocialCircle.cleanValue(row["userId"] ?? row["id"]) else { return nil }
        return NativePeopleMetPerson(userId: userId, name: NativeSocialCircle.cleanValue(row["name"] ?? row["displayName"]) ?? "Bytspot member", inviteStatus: NativeSocialCircle.cleanValue(row["inviteStatus"])?.lowercased())
    }

    static func normalizeList(_ response: Any) -> [NativePeopleMetPerson] {
        NativeSocialCircle.rows(from: response, keys: ["people", "items"]).compactMap(normalize)
    }

    static func normalizeOptInStatus(_ response: Any) -> Bool {
        guard let root = response as? [String: Any] else { return false }
        return (root["optedIn"] as? Bool) ?? false
    }

    /// Accepts either a raw party ID or a pasted Party Pass share link
    /// (https://bytspot.app/party/<id>) and resolves the party ID.
    static func normalizedPartyID(_ rawValue: String) -> String? {
        guard let cleaned = NativeSocialCircle.cleanValue(rawValue) else { return nil }
        if let url = URL(string: cleaned), let host = url.host?.lowercased(),
           host == "bytspot.app" || host == "www.bytspot.app" || host == "bytspot.com" || host == "www.bytspot.com" {
            let parts = url.path.split(separator: "/").map(String.init)
            guard parts.count >= 2, parts[0] == "party" else { return nil }
            return NativeSocialCircle.cleanValue(parts[1])
        }
        guard !cleaned.contains("/"), !cleaned.contains(":") else { return nil }
        return cleaned
    }
}

enum NativePartyTemplateID: String, CaseIterable, Codable, Identifiable {
    case listeningParty = "listening-party"
    case comedyNight = "comedy-night"
    case premiere
    case privateParty = "private-party"
    case fanMeetup = "fan-meetup"
    case releaseParty = "release-party"
    case popUp = "pop-up"
    var id: String { rawValue }
}

struct NativePartyTemplate: Equatable, Identifiable {
    let id: NativePartyTemplateID
    let name: String
    let hook: String
    let emoji: String
    let itinerary: [String]

    static let catalog = [
        NativePartyTemplate(id: .listeningParty, name: "Listening Party", hook: "Drop the sound before everyone else.", emoji: "🎧", itinerary: ["Doors open", "First listen", "Artist Q&A"]),
        NativePartyTemplate(id: .comedyNight, name: "Comedy Night", hook: "Turn a room into an inside joke.", emoji: "🎤", itinerary: ["Doors open", "Warm-up set", "Headliner"]),
        NativePartyTemplate(id: .premiere, name: "Premiere", hook: "Make the first watch feel legendary.", emoji: "🎬", itinerary: ["Arrivals", "Screening", "Cast conversation"]),
        NativePartyTemplate(id: .privateParty, name: "Private Party", hook: "One room. Your people. No noise.", emoji: "🪩", itinerary: ["Guest arrival", "Main moment", "After-hours"]),
        NativePartyTemplate(id: .fanMeetup, name: "Fan Meetup", hook: "Turn followers into a real community.", emoji: "⚡️", itinerary: ["Meet the community", "Creator moment", "Group photo"]),
        NativePartyTemplate(id: .releaseParty, name: "Release Party", hook: "Give the drop its first room.", emoji: "💿", itinerary: ["Doors open", "Release premiere", "Celebration set"]),
        NativePartyTemplate(id: .popUp, name: "Pop-Up", hook: "Make the reveal the moment.", emoji: "📍", itinerary: ["Location reveal", "Drop live", "Last call"])
    ]
}

enum NativeListeningPartyFormat: String, CaseIterable, Codable, Identifiable { case listeningSession = "listening-session", djMixPremiere = "dj-mix-premiere", livePerformance = "live-performance", labelShowcase = "label-showcase"; var id: String { rawValue }; var title: String { self == .listeningSession ? "Listen" : self == .djMixPremiere ? "DJ mix" : self == .livePerformance ? "Live set" : "Label" } }
enum NativeFanMeetupFormat: String, CaseIterable, Codable, Identifiable { case meetAndGreet = "meet-and-greet", creatorConversation = "creator-conversation", communityPhoto = "community-photo"; var id: String { rawValue }; var title: String { self == .meetAndGreet ? "Meet & greet" : self == .creatorConversation ? "Conversation" : "Photo moment" } }
enum NativeReleaseFormat: String, CaseIterable, Codable, Identifiable { case single, ep, album, mix, video; var id: String { rawValue }; var title: String { rawValue.uppercased() == "EP" ? "EP" : rawValue.capitalized } }
enum NativePartyLocationDisclosure: String, CaseIterable, Codable, Identifiable {
    case `public`, afterApproval = "after-approval", withheld
    var id: String { rawValue }
    var title: String { self == .public ? "Public" : self == .afterApproval ? "After approval" : "Withheld" }
    var recipientExplanation: String { self == .public ? "The Party Pass shows the venue." : self == .afterApproval ? "The Party Pass reveals the venue only after host approval." : "The Party Pass never shows the venue." }
}
enum NativePopUpLocationDisclosure: String, CaseIterable, Codable, Identifiable { case `public`, afterApproval = "after-approval", withheld; var id: String { rawValue }; var title: String { NativePartyLocationDisclosure(rawValue: rawValue)?.title ?? rawValue } }
enum NativePrivatePartyGuestPolicy: String, CaseIterable, Codable, Identifiable { case namedGuests = "named-guests", namedGuestsPlusOne = "named-guests-plus-one"; var id: String { rawValue }; var title: String { self == .namedGuests ? "Named guests" : "Named + one" } }
enum NativePartySocialPlatform: String, CaseIterable, Codable, Identifiable {
    case instagram, tiktok, youtube, x, facebook, linkedin
    var id: String { rawValue }
    var title: String {
        switch self {
        case .instagram: return "Instagram"
        case .tiktok: return "TikTok"
        case .youtube: return "YouTube"
        case .x: return "X"
        case .facebook: return "Facebook"
        case .linkedin: return "LinkedIn"
        }
    }

    /// Round-trip decode is case-insensitive on both the rawValue and the
    /// display title, so stored payloads survive brand-capitalization drift.
    static func match(_ name: String?) -> Self? {
        guard let name = name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !name.isEmpty else { return nil }
        return allCases.first { $0.rawValue == name || $0.title.lowercased() == name }
    }
}

/// Official Host destination kinds. Socials store handles — Bytspot owns the
/// routing — while music/merch/website store HTTPS URLs that never render as
/// text in any public-facing UI.
enum NativeHostDestinationKind: String, CaseIterable, Identifiable, Codable {
    case instagram, tiktok, youtube, x, facebook, linkedin, music, merch, website
    var id: String { rawValue }
    var isSocial: Bool { ![Self.music, .merch, .website].contains(self) }
    var title: String {
        switch self {
        case .instagram: return "Instagram"
        case .tiktok: return "TikTok"
        case .youtube: return "YouTube"
        case .x: return "X"
        case .facebook: return "Facebook"
        case .linkedin: return "LinkedIn"
        case .music: return "Music"
        case .merch: return "Merch"
        case .website: return "Website"
        }
    }
    var icon: String {
        switch self {
        case .instagram, .facebook, .linkedin: return "person.crop.circle.badge.checkmark"
        case .tiktok, .youtube: return "play.rectangle.fill"
        case .x: return "at"
        case .music: return "music.note"
        case .merch: return "bag.fill"
        case .website: return "globe"
        }
    }
    var fieldPrompt: String { isSocial ? "@handle" : "https://…" }
}

/// One host-selected destination. `value` is a handle for socials or an
/// HTTPS URL for links. Order is host-controlled; at most one is primary ⭐.
struct NativeHostIdentityDestination: Equatable, Identifiable {
    var kind: NativeHostDestinationKind
    var value: String
    var primary: Bool
    var id: String { kind.rawValue }

    var validationMessage: String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Add your \(kind.title) \(kind.isSocial ? "handle" : "link")." }
        if kind.isSocial {
            let handle = trimmed.hasPrefix("@") ? String(trimmed.dropFirst()) : trimmed
            if handle.isEmpty || handle.count > 80 || handle.rangeOfCharacter(from: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-").inverted) != nil {
                return "\(kind.title) takes a handle, not a link."
            }
        } else if URLComponents(string: trimmed)?.scheme?.lowercased() != "https" || URLComponents(string: trimmed)?.host?.isEmpty != false {
            return "\(kind.title) links must use HTTPS."
        }
        return nil
    }

    var rpcValue: [String: Any] {
        var entry: [String: Any] = ["kind": kind.rawValue, "value": value.trimmingCharacters(in: .whitespacesAndNewlines)]
        if primary { entry["primary"] = true }
        return entry
    }
}

/// The host's public identity: @handle plus the ordered destination list.
struct NativeHostIdentity: Equatable {
    var handle: String
    var destinations: [NativeHostIdentityDestination]

    static let empty = Self(handle: "", destinations: [])

    var validationMessage: String? {
        let trimmedHandle = handle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedHandle.isEmpty {
            let bare = trimmedHandle.hasPrefix("@") ? String(trimmedHandle.dropFirst()) : trimmedHandle
            if bare.count < 2 || bare.count > 30 || bare.rangeOfCharacter(from: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._").inverted) != nil {
                return "Handles are 2–30 letters, numbers, dots, or underscores."
            }
        }
        for destination in destinations {
            if let message = destination.validationMessage { return message }
        }
        return nil
    }

    var rpcInput: [String: Any] {
        var input: [String: Any] = ["destinations": destinations.map(\.rpcValue)]
        let trimmed = handle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { input["handle"] = trimmed }
        return input
    }

    static func fromPayload(_ payload: Any) -> Self {
        guard let row = payload as? [String: Any] else { return .empty }
        let handle = (row["handle"] as? String).map { "@\($0)" } ?? ""
        let destinations: [NativeHostIdentityDestination] = ((row["destinations"] as? [[String: Any]]) ?? []).compactMap { entry in
            guard let kind = (entry["kind"] as? String).flatMap(NativeHostDestinationKind.init(rawValue:)),
                  let value = entry["value"] as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return NativeHostIdentityDestination(kind: kind, value: value, primary: entry["primary"] as? Bool == true)
        }
        return Self(handle: handle, destinations: destinations)
    }
}

struct NativePartyHostDestinations: Equatable {
    let musicURL: String
    let merchURL: String
    let websiteURL: String
    let primarySocialPlatform: NativePartySocialPlatform
    let primarySocialURL: String

    static let empty = Self(musicURL: "", merchURL: "", websiteURL: "", primarySocialPlatform: .instagram, primarySocialURL: "")

    /// Legacy per-party destinations. New drafts leave this empty — the
    /// Official Host identity on the profile is snapshotted at publish — but
    /// any provided link must still be HTTPS with a primary social present.
    var validationMessage: String? {
        let anyLink = [musicURL, merchURL, websiteURL, primarySocialURL].contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if !anyLink { return nil }
        if primarySocialURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Add one primary social link." }
        for (label, rawURL) in [("Music", musicURL), ("Merch", merchURL), ("Website", websiteURL), (primarySocialPlatform.title, primarySocialURL)] {
            if !rawURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && Self.secureURL(rawURL) == nil { return "\(label) links must use HTTPS." }
        }
        return nil
    }

    var isEmpty: Bool { self == .empty || rpcInput.isEmpty }

    var rpcInput: [String: Any] {
        var input: [String: Any] = [:]
        if let url = Self.secureURL(musicURL) { input["musicUrl"] = url }
        if let url = Self.secureURL(merchURL) { input["merchUrl"] = url }
        if let url = Self.secureURL(websiteURL) { input["websiteUrl"] = url }
        if let url = Self.secureURL(primarySocialURL) { input["primarySocial"] = ["platform": primarySocialPlatform.title, "url": url] }
        return input
    }

    private static func secureURL(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, let components = URLComponents(string: value), components.scheme?.lowercased() == "https", components.host?.isEmpty == false else { return nil }
        return components.url?.absoluteString
    }
}

enum NativePartyTemplateConfiguration: Equatable {
    case standard
    case listeningParty(NativeListeningPartyFormat)
    case fanMeetup(NativeFanMeetupFormat)
    case releaseParty(NativeReleaseFormat, String)
    case popUp(NativePopUpLocationDisclosure)
    case privateParty(NativePrivatePartyGuestPolicy)

    var templateID: NativePartyTemplateID? {
        switch self {
        case .standard: return nil
        case .listeningParty: return .listeningParty
        case .fanMeetup: return .fanMeetup
        case .releaseParty: return .releaseParty
        case .popUp: return .popUp
        case .privateParty: return .privateParty
        }
    }

    var allowedAccessModes: [NativePartyAccessMode] {
        if case .privateParty = self { return [.privateApproval] }
        return NativePartyAccessMode.allCases
    }

    var validationMessage: String? {
        switch self {
        case .releaseParty(_, let title) where title.trimmingCharacters(in: .whitespacesAndNewlines).count < 2:
            return "Add the release title."
        default: return nil
        }
    }

    var rpcInput: [String: Any] {
        switch self {
        case .standard: return ["kind": "standard"]
        case .listeningParty(let format): return ["kind": "listening-party", "format": format.rawValue]
        case .fanMeetup(let format): return ["kind": "fan-meetup", "format": format.rawValue]
        case .releaseParty(let format, let title): return ["kind": "release-party", "releaseType": format.rawValue, "releaseTitle": title.trimmingCharacters(in: .whitespacesAndNewlines)]
        case .popUp(let disclosure): return ["kind": "pop-up", "locationDisclosure": disclosure.rawValue]
        case .privateParty(let policy): return ["kind": "private-party", "guestPolicy": policy.rawValue]
        }
    }
}

enum NativePartyAccessMode: String, CaseIterable, Codable, Identifiable {
    case freeRSVP = "free-rsvp"
    case paidTicket = "paid-ticket"
    case privateApproval = "private-approval"
    var id: String { rawValue }
    var title: String { self == .freeRSVP ? "Free RSVP" : self == .paidTicket ? "Paid Ticket" : "Private Approval" }
}

enum NativePartyHostRole: String, CaseIterable, Codable, Identifiable {
    case owner, cohost, door, finance
    var id: String { rawValue }
    var title: String { self == .cohost ? "Co-host" : rawValue.capitalized }
}

enum NativePartyMediaKind: String { case cover, album }

enum NativePartyCapability: String, CaseIterable { case edit, invite, checkIn = "check-in", refund, payouts }

enum NativePartyRoleContract {
    static let capabilities: [NativePartyHostRole: Set<NativePartyCapability>] = [
        .owner: [.edit, .invite, .checkIn, .refund, .payouts],
        .cohost: [.edit, .invite, .checkIn],
        .door: [.checkIn],
        .finance: [.refund, .payouts]
    ]

    static func can(_ role: NativePartyHostRole, _ capability: NativePartyCapability) -> Bool {
        capabilities[role]?.contains(capability) == true
    }
}

struct NativePartyItineraryItem: Equatable { let title: String; let offsetMinutes: Int }

/// Run of Show slice 1 clock math. Beats live on the party clock as offsets;
/// pickers edit wall-clock times and roll to the next day when a beat's time
/// lands before the party start (an all-day model without a second clock).
enum NativeRunOfShowSchedule {
    static func offsetMinutes(pickedTime: Date, startsAt: Date, calendar: Calendar = .current) -> Int {
        let start = calendar.dateComponents([.hour, .minute], from: startsAt)
        let picked = calendar.dateComponents([.hour, .minute], from: pickedTime)
        let minutes = ((picked.hour ?? 0) * 60 + (picked.minute ?? 0)) - ((start.hour ?? 0) * 60 + (start.minute ?? 0))
        return minutes >= 0 ? minutes : minutes + 24 * 60
    }

    static func beatDate(offsetMinutes: Int, startsAt: Date) -> Date {
        startsAt.addingTimeInterval(TimeInterval(offsetMinutes * 60))
    }

    /// "Now" for the Party Pass: latest beat at-or-before now, while the party
    /// runs. Falls back to endsAt or the last beat + 60m when no end is set.
    static func currentBeatIndex(beats: [Date], endsAt: Date?, now: Date) -> Int? {
        guard let first = beats.first, now >= first else { return nil }
        let effectiveEnd = endsAt ?? beats.last.map { $0.addingTimeInterval(60 * 60) }
        if let effectiveEnd, now >= effectiveEnd { return nil }
        return beats.lastIndex(where: { $0 <= now })
    }
}
struct NativePartyTicketTier: Equatable { let name: String; let priceCents: Int; let quantity: Int; let requiredMembershipTier: BytspotTier }
struct NativePartyHostAssignment: Equatable { let email: String; let role: NativePartyHostRole }

struct NativePartyDraftInput: Equatable {
    let templateID: NativePartyTemplateID
    let title: String
    let tagline: String
    let startsAt: Date
    /// Optional host-set end. Nil lets the API derive it from the last
    /// itinerary beat (+60m), or leave it null when there are no beats.
    let endsAt: Date?
    let venueName: String
    let locationDisclosure: NativePartyLocationDisclosure
    let capacity: Int
    let accessMode: NativePartyAccessMode
    let requiredMembershipTier: BytspotTier
    let hostDestinations: NativePartyHostDestinations
    let audienceCircleIDs: [String]
    let itinerary: [NativePartyItineraryItem]
    let ticketTiers: [NativePartyTicketTier]
    let cohosts: [NativePartyHostAssignment]
    let templateConfiguration: NativePartyTemplateConfiguration
    /// Host Spark tags only. Never a new printer or a Live occupancy source.
    let taxonomy: NativeHostTaxonomySelection?

    init(templateID: NativePartyTemplateID, title: String, tagline: String, startsAt: Date, endsAt: Date? = nil, venueName: String, locationDisclosure: NativePartyLocationDisclosure = .public, capacity: Int, accessMode: NativePartyAccessMode, requiredMembershipTier: BytspotTier, hostDestinations: NativePartyHostDestinations = .empty, audienceCircleIDs: [String], itinerary: [NativePartyItineraryItem], ticketTiers: [NativePartyTicketTier], cohosts: [NativePartyHostAssignment], templateConfiguration: NativePartyTemplateConfiguration, taxonomy: NativeHostTaxonomySelection? = nil) {
        self.templateID = templateID
        self.title = title
        self.tagline = tagline
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.venueName = venueName
        self.locationDisclosure = locationDisclosure
        self.capacity = capacity
        self.accessMode = accessMode
        self.requiredMembershipTier = requiredMembershipTier
        self.hostDestinations = hostDestinations
        self.audienceCircleIDs = audienceCircleIDs
        self.itinerary = itinerary
        self.ticketTiers = ticketTiers
        self.cohosts = cohosts
        self.templateConfiguration = templateConfiguration
        self.taxonomy = taxonomy
    }

    var validationMessage: String? {
        if title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 { return "Add a party title." }
        if let endsAt, endsAt <= startsAt { return "Party end must be after the start." }
        if let endsAt, endsAt.timeIntervalSince(startsAt) > 7 * 24 * 60 * 60 { return "Party cannot run longer than 7 days." }
        if venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Add a venue." }
        if capacity < 2 { return "Capacity must be at least 2." }
        if let message = hostDestinations.validationMessage { return message }
        if let configuredTemplate = templateConfiguration.templateID, configuredTemplate != templateID { return "Choose the matching Party format." }
        if templateConfiguration.templateID == nil && ![NativePartyTemplateID.comedyNight, .premiere].contains(templateID) { return "Choose the matching Party format." }
        if let message = templateConfiguration.validationMessage { return message }
        if case .privateParty = templateConfiguration, accessMode != .privateApproval { return "Private Parties require host approval." }
        if case .popUp(.afterApproval) = templateConfiguration, (locationDisclosure != .afterApproval || accessMode != .privateApproval) { return "Hidden Pop-Up locations require host approval." }
        if locationDisclosure == .afterApproval && accessMode != .privateApproval { return "Locations revealed after approval require host approval." }
        if accessMode == .paidTicket && !ticketTiers.contains(where: { $0.priceCents > 0 }) { return "Paid parties need a ticket price." }
        if accessMode != .paidTicket && ticketTiers.contains(where: { $0.priceCents > 0 }) { return "Only paid parties can include paid tickets." }
        if cohosts.contains(where: { $0.role == .owner || !$0.email.contains("@") }) { return "Add a valid teammate email and role." }
        return nil
    }

    var rpcInput: [String: Any] {
        var input: [String: Any] = [
            "templateId": templateID.rawValue, "title": title, "tagline": tagline,
            "startsAt": ISO8601DateFormatter().string(from: startsAt),
            "venueName": venueName,
            "locationDisclosure": locationDisclosure.rawValue,
            "capacity": capacity, "accessMode": accessMode.rawValue,
            "requiredMembershipTier": requiredMembershipTier.rawValue,
            "audienceCircleIds": audienceCircleIDs,
            "itinerary": itinerary.map { ["title": $0.title, "offsetMinutes": $0.offsetMinutes] },
            "ticketTiers": ticketTiers.map { ["name": $0.name, "priceCents": $0.priceCents, "quantity": $0.quantity, "requiredMembershipTier": $0.requiredMembershipTier.rawValue] },
            "cohosts": cohosts.map { ["email": $0.email, "role": $0.role.rawValue] },
            "templateConfig": templateConfigRPC,
            "source": "host-studio"
        ]
        if let endsAt { input["endsAt"] = ISO8601DateFormatter().string(from: endsAt) }
        // Legacy per-party destinations only ride when present; new drafts
        // rely on the publish-time Official Host identity snapshot.
        if !hostDestinations.isEmpty { input["hostDestinations"] = hostDestinations.rpcInput }
        return input
    }

    /// Extra hostCategory / hostType / hostFormat / hostAge keys ride on the
    /// existing passthrough templateConfig. They never change `kind`.
    private var templateConfigRPC: [String: Any] {
        var config = templateConfiguration.rpcInput
        if let taxonomy {
            for (key, value) in taxonomy.rpcTags { config[key] = value }
        }
        return config
    }
}

struct NativePublishedParty: Equatable, Identifiable {
    let id: String
    let shareURL: URL
    let passCode: String
    let draft: NativePartyDraftInput
}

enum NativePartyStudioError: LocalizedError, Equatable {
    case validation(String), missingDraft, missingPartyMedia, missingPartyPass, sessionChanged
    var errorDescription: String? {
        switch self {
        case .validation(let message): return message
        case .missingDraft: return "The party draft was not returned."
        case .missingPartyMedia: return "The party media upload was not returned."
        case .missingPartyPass: return "The Party Pass was not returned."
        case .sessionChanged: return "Your session changed. Reopen Host Studio to continue."
        }
    }

    static func publishUserMessage(for error: Error) -> String {
        if let urlError = error as? URLError,
           [.timedOut, .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost].contains(urlError.code) {
            return "We couldn't reach Bytspot. Check your connection and try again."
        }
        if case let BytspotAPIClient.APIError.server(status, _) = error {
            switch status {
            case 401: return "Your sign-in session expired. Sign in again before publishing."
            case 403: return "This account is not allowed to publish this party."
            case 404: return "Party publishing is unavailable on the current service."
            case 409: return "This party is already being published. Wait a moment and try again."
            case 422: return "Review the party setup and try again."
            case 429: return "Too many publish attempts. Wait a moment and try again."
            default: return "The service could not publish this party. Please try again."
            }
        }
        return (error as? LocalizedError)?.errorDescription ?? "The party could not be published."
    }
}

struct NativePartyStudioAPI {
    let client: BytspotAPIClient

    func createDraft(_ draft: NativePartyDraftInput, idempotencyKey: String) async throws -> String {
        if let message = draft.validationMessage { throw NativePartyStudioError.validation(message) }
        let created = try await client.trpcPayload(path: NativeLiveContentV2Contract.partyDraftCreateRoute, method: "POST", input: Self.draftCreateInput(draft, idempotencyKey: idempotencyKey))
        guard let partyID = Self.partyID(from: created) else { throw NativePartyStudioError.missingDraft }
        return partyID
    }

    func publish(partyID: String, draft: NativePartyDraftInput, idempotencyKey: String) async throws -> NativePublishedParty {
        let published = try await client.trpcPayload(path: NativeLiveContentV2Contract.partyPublishRoute, method: "POST", input: Self.publishInput(partyID: partyID, idempotencyKey: idempotencyKey))
        guard let pass = Self.publishedParty(from: published, fallbackID: partyID, draft: draft) else { throw NativePartyStudioError.missingPartyPass }
        return pass
    }

    func uploadMedia(partyID: String, kind: NativePartyMediaKind, index: Int? = nil, dataURI: String) async throws -> URL {
        let payload = try await client.trpcPayload(path: NativeLiveContentV2Contract.partyMediaUploadRoute, method: "POST", input: Self.mediaUploadInput(partyID: partyID, kind: kind, index: index, dataURI: dataURI))
        let row = Self.objectRow(payload)
        guard let rawURL = Self.clean(row["url"]), let url = URL(string: rawURL), url.scheme?.lowercased() == "https" else { throw NativePartyStudioError.missingPartyMedia }
        return url
    }

    func resetMedia(partyID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.partyMediaResetRoute, method: "POST", input: ["partyId": partyID])
    }

    /// The Official Host identity lives on the host profile. Host Studio
    /// prefills from here and saves back before publish; the server snapshots
    /// it onto the party.
    func loadHostIdentity() async throws -> NativeHostIdentity {
        let payload = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.hostDestinationsGetRoute, input: [:])
        return NativeHostIdentity.fromPayload(Self.objectRow(payload))
    }

    func saveHostIdentity(_ identity: NativeHostIdentity) async throws {
        if let message = identity.validationMessage { throw NativePartyStudioError.validation(message) }
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.hostDestinationsSaveRoute, method: "POST", input: identity.rpcInput)
    }

    static func draftCreateInput(_ draft: NativePartyDraftInput, idempotencyKey: String) -> [String: Any] {
        var input = draft.rpcInput
        input["idempotencyKey"] = idempotencyKey
        return input
    }

    static func publishInput(partyID: String, idempotencyKey: String) -> [String: Any] {
        ["partyId": partyID, "idempotencyKey": idempotencyKey]
    }

    static func mediaUploadInput(partyID: String, kind: NativePartyMediaKind, index: Int?, dataURI: String) -> [String: Any] {
        var input: [String: Any] = ["partyId": partyID, "kind": kind.rawValue, "dataUri": dataURI]
        if kind == .album, let index { input["index"] = index }
        return input
    }

    static func partyID(from value: Any) -> String? {
        clean(objectRow(value)["id"] ?? objectRow(value)["partyId"])
    }

    static func publishedParty(from value: Any, fallbackID: String, draft: NativePartyDraftInput) -> NativePublishedParty? {
        let row = objectRow(value)
        guard let rawURL = clean(row["shareUrl"] ?? row["url"]), let url = safeShareURL(rawURL),
              let passCode = clean(row["passCode"] ?? row["accessCode"]) else { return nil }
        return NativePublishedParty(id: clean(row["id"] ?? row["partyId"]) ?? fallbackID, shareURL: url, passCode: passCode, draft: draft)
    }

    private static func objectRow(_ value: Any) -> [String: Any] {
        guard let row = value as? [String: Any] else { return [:] }
        if let party = row["party"] as? [String: Any] { return objectRow(party) }
        if let data = row["data"] as? [String: Any] { return objectRow(data) }
        return row
    }

    private static func clean(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func safeShareURL(_ value: String) -> URL? {
        guard let url = URL(string: value), url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(), host == "bytspot.app" || host.hasSuffix(".bytspot.app") || host == "bytspot.com" || host.hasSuffix(".bytspot.com") else { return nil }
        return url
    }
}

/// One approved Official Host link projected by `events.invite`.
/// Only canonical `host.destinations` fields ever populate this.
struct NativePartyPassDestination: Equatable, Identifiable {
    let kind: NativeHostDestinationKind
    let label: String
    let url: URL
    let primary: Bool
    var id: String { kind.rawValue }
}

struct NativePartyPassRecord: Equatable {
    let id: String
    let title: String
    let tagline: String?
    let hostName: String
    let scheduledDate: String
    let locationLabel: String
    let locationDisclosure: String
    let accessMode: String
    let capacity: Int
    let requiredTier: String
    let coverURL: URL?
    let hostDestinations: [NativePartyPassDestination]
    let hostHandle: String?
    let endsAt: Date?
    let runOfShow: [NativePartyPassBeat]

    var isLocationWithheld: Bool { locationDisclosure != "public" }
}

struct NativePartyPassBeat: Equatable, Identifiable {
    let title: String
    let scheduledAt: Date
    var id: String { "\(scheduledAt.timeIntervalSince1970)-\(title)" }
}

struct NativePartyPassAPI {
    let client: BytspotAPIClient

    func invite(partyID: String) async throws -> NativePartyPassRecord {
        let payload = try await client.trpcQueryPayload(path: "/trpc/events.invite", input: ["partyId": partyID])
        guard let record = Self.record(from: payload), record.id == partyID else { throw NativePartyStudioError.missingPartyPass }
        return record
    }

    private static func record(from value: Any) -> NativePartyPassRecord? {
        let row = objectRow(value)
        guard clean(row["source"])?.lowercased() == "host-studio-party",
              let id = clean(row["id"]),
              let title = clean(row["title"]),
              let scheduledDate = clean(row["scheduledDate"]),
              let accessMode = clean(row["accessMode"]),
              let requiredTier = clean(row["tier"]) else { return nil }
        let coverURL = clean(row["heroImageURL"] ?? row["thumbnailURL"]).flatMap(URL.init(string:)).flatMap { $0.scheme?.lowercased() == "https" ? $0 : nil }
        let locationDisclosure = ["public", "after-approval", "withheld"].contains(clean(row["locationDisclosure"])?.lowercased() ?? "") ? clean(row["locationDisclosure"])!.lowercased() : "after-approval"
        let safeLocationLabel: String
        if locationDisclosure == "public" {
            guard let locationLabel = clean(row["locationLabel"]) else { return nil }
            safeLocationLabel = locationLabel
        } else {
            safeLocationLabel = locationDisclosure == "withheld" ? "Location withheld by host" : "Location shared after approval"
        }
        return NativePartyPassRecord(id: id, title: title, tagline: clean(row["inviteNote"]), hostName: clean(row["hostName"]) ?? "Bytspot Host", scheduledDate: scheduledDate, locationLabel: safeLocationLabel, locationDisclosure: locationDisclosure, accessMode: accessMode, capacity: int(row["capacity"]) ?? 0, requiredTier: requiredTier, coverURL: coverURL, hostDestinations: destinations(from: row), hostHandle: hostHandle(from: row), endsAt: isoDate(row["endsAt"]), runOfShow: beats(from: row))
    }

    /// Scheduled beats fail closed: a malformed row drops that beat only, and
    /// out-of-order beats are sorted so "Now" derivation stays monotonic.
    static func beats(from row: [String: Any]) -> [NativePartyPassBeat] {
        guard let rows = row["runOfShow"] as? [[String: Any]] else { return [] }
        return rows.compactMap { beat in
            guard let title = clean(beat["title"]), let scheduledAt = isoDate(beat["scheduledAt"]) else { return nil }
            return NativePartyPassBeat(title: title, scheduledAt: scheduledAt)
        }.sorted { $0.scheduledAt < $1.scheduledAt }
    }

    private static func isoDate(_ value: Any?) -> Date? {
        guard let raw = clean(value) else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }

    /// Only canonical host fields reach recipients (root aliases ignored).
    /// Prefers the ordered `host.destinationList` — labels are @handles or
    /// display names, never raw URLs — and falls back to the legacy
    /// `host.destinations` object for parties published before the change.
    static func destinations(from row: [String: Any]) -> [NativePartyPassDestination] {
        guard let host = row["host"] as? [String: Any] else { return [] }
        if let list = host["destinationList"] as? [[String: Any]], !list.isEmpty {
            return list.compactMap { entry in
                guard let kind = (entry["kind"] as? String).flatMap(NativeHostDestinationKind.init(rawValue:)),
                      let label = clean(entry["label"]), !label.lowercased().hasPrefix("http"),
                      let url = secureURL(entry["url"]) else { return nil }
                return NativePartyPassDestination(kind: kind, label: label, url: url, primary: entry["primary"] as? Bool == true)
            }
        }
        guard let source = host["destinations"] as? [String: Any] else { return [] }
        var results: [NativePartyPassDestination] = []
        if let url = secureURL(source["musicUrl"]) { results.append(NativePartyPassDestination(kind: .music, label: "Listen", url: url, primary: false)) }
        if let url = secureURL(source["merchUrl"]) { results.append(NativePartyPassDestination(kind: .merch, label: "Shop", url: url, primary: false)) }
        if let url = secureURL(source["websiteUrl"]) { results.append(NativePartyPassDestination(kind: .website, label: "Visit website", url: url, primary: false)) }
        if let social = source["primarySocial"] as? [String: Any], let url = secureURL(social["url"]), let platform = clean(social["platform"]) {
            // Legacy platform text is server-stored and untrusted: only a
            // recognized platform name may render; anything else says Social.
            let kind = NativeHostDestinationKind(rawValue: platform.lowercased())
            results.append(NativePartyPassDestination(kind: kind ?? .instagram, label: kind?.title ?? "Social", url: url, primary: true))
        }
        return results
    }

    static func hostHandle(from row: [String: Any]) -> String? {
        guard let host = row["host"] as? [String: Any], let handle = clean(host["handle"]) else { return nil }
        return "@\(handle.hasPrefix("@") ? String(handle.dropFirst()) : handle)"
    }

    private static func secureURL(_ value: Any?) -> URL? {
        guard let raw = clean(value), let url = URL(string: raw),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https", components.host?.isEmpty == false else { return nil }
        return url
    }

    private static func objectRow(_ value: Any) -> [String: Any] {
        guard let row = value as? [String: Any] else { return [:] }
        if let data = row["data"] { return objectRow(data) }
        return row
    }

    private static func clean(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return clean(value).flatMap(Int.init)
    }
}

struct NativeCheckoutSession: Equatable {
    var candidates: [String] = []
    var message: String?

    init(candidates: [String] = [], message: String? = nil) {
        self.candidates = candidates
        self.message = message
    }

    init(payload: Any) {
        candidates = Self.readCandidates(payload)
        message = Self.readMessage(payload)
    }

    var checkoutURLString: String? {
        candidates.compactMap(Self.normalizedCheckoutURL).first
    }

    private static let urlKeys: Set<String> = ["url", "checkoutUrl", "stripeCheckoutUrl", "redirectUrl", "sessionUrl", "paymentUrl", "checkout_url"]
    private static let sessionIDKeys: Set<String> = ["sessionId", "checkoutSessionId", "stripeSessionId", "session_id"]
    private static let checkoutNestingKeys = ["checkout", "session", "stripe", "data", "result", "json", "response"]

    private static func readCandidates(_ value: Any, allowIDKey: Bool = false, depth: Int = 0) -> [String] {
        guard depth <= 8 else { return [] }
        if let array = value as? [Any] { return array.flatMap { readCandidates($0, allowIDKey: allowIDKey, depth: depth + 1) } }
        guard let dict = value as? [String: Any] else { return [] }
        var found: [String] = []
        for (key, value) in dict {
            if (urlKeys.contains(key) || sessionIDKeys.contains(key) || (allowIDKey && key == "id")), let string = value as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { found.append(trimmed) }
            }
        }
        for (key, value) in dict {
            guard value is [String: Any] || value is [Any] else { continue }
            let lower = key.lowercased()
            let nestedLooksLikeCheckout = checkoutNestingKeys.contains { lower.contains($0) }
            found.append(contentsOf: readCandidates(value, allowIDKey: allowIDKey || nestedLooksLikeCheckout, depth: depth + 1))
        }
        return found
    }

    private static func readMessage(_ value: Any, depth: Int = 0) -> String? {
        guard depth <= 8 else { return nil }
        if let dict = value as? [String: Any] {
            if let message = dict["message"] as? String, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return message }
            for nestedKey in checkoutNestingKeys {
                if let nested = dict[nestedKey], let message = readMessage(nested, depth: depth + 1) { return message }
            }
        }
        return nil
    }

    static func normalizedCheckoutURL(_ candidate: String) -> String? {
        if isStripeCheckoutSessionID(candidate) { return "https://checkout.stripe.com/c/pay/\(candidate)" }
        guard let url = URL(string: candidate), let components = URLComponents(url: url, resolvingAgainstBaseURL: false), components.scheme?.lowercased() == "https", let host = components.host?.lowercased(), isAllowedStripeHost(host) else { return nil }
        return url.absoluteString
    }

    private static func isStripeCheckoutSessionID(_ candidate: String) -> Bool {
        guard candidate.hasPrefix("cs_test_") || candidate.hasPrefix("cs_live_") else { return false }
        return candidate.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
    }

    private static func isAllowedStripeHost(_ host: String) -> Bool {
        host == "stripe.com" || host.hasSuffix(".stripe.com")
    }
}

struct NativeWalletLedgerAction: Codable, Equatable, Identifiable {
    var id: String
    var title: String?
    var type: String?
    var target: String?
}

struct NativeWalletLedgerRecord: Codable, Equatable, Identifiable {
    var id: String
    var productType: String
    var title: String
    var subtitle: String?
    var venueName: String?
    var providerName: String?
    var windowLabel: String?
    var paymentState: String
    var providerState: String
    var reservationReference: String?
    var amountCents: Int?
    var currency: String?
    var source: String?
    var receiptUrl: String?
    var actions: [NativeWalletLedgerAction]?
    var createdAt: String
    var updatedAt: String?

    var displayVenue: String { venueName ?? subtitle ?? providerName ?? "Bytspot" }
    var displayWindow: String { windowLabel ?? "Pending window" }
    var paymentStateLabel: String { Self.label(paymentState) }
    var providerStateLabel: String { Self.label(providerState) }
    var amountLabel: String? { amountCents.map { Self.money(cents: $0, currency: currency ?? "usd") } }
    var displayPayment: String { [paymentStateLabel, amountLabel].compactMap { $0 }.joined(separator: " · ") }
    var displayReservation: String { reservationReference.map { "Ref \($0)" } ?? providerStateLabel }

    private static func label(_ raw: String?) -> String { (raw ?? "pending").replacingOccurrences(of: "_", with: " ").capitalized }
    private static func money(cents: Int, currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency.uppercased()
        return formatter.string(from: NSNumber(value: Double(cents) / 100.0)) ?? "$\(Double(cents) / 100.0)"
    }
}

/// Pending-deletion state for the signed-in member. `purgeAfter` is the moment
/// the account stops being recoverable.
struct NativeAccountDeletionStatus: Codable, Equatable {
    let pendingDeletion: Bool
    let purgeAfter: String?
    let graceDays: Int

    static let inactive = NativeAccountDeletionStatus(pendingDeletion: false, purgeAfter: nil, graceDays: 30)

    var purgeDate: Date? { purgeAfter.flatMap(NativeAccountDeletionFormat.date(fromISO:)) }
}

struct NativeAccountDeletionReceipt: Codable, Equatable {
    let purgeAfter: String
    let graceDays: Int

    var purgeDate: Date? { NativeAccountDeletionFormat.date(fromISO: purgeAfter) }
}

enum NativeAccountDeletionFormat {
    static func date(fromISO value: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    /// Whole days remaining, rounded up: a member with 12 hours left still has
    /// "1 day", never "0 days".
    static func daysRemaining(until purgeAfter: Date, now: Date = Date()) -> Int {
        let seconds = purgeAfter.timeIntervalSince(now)
        guard seconds > 0 else { return 0 }
        return Int((seconds / 86_400).rounded(.up))
    }

    static func countdown(until purgeAfter: Date, now: Date = Date()) -> String {
        let days = daysRemaining(until: purgeAfter, now: now)
        switch days {
        case 0: return "Your account is being deleted now."
        case 1: return "1 day left to restore your account."
        default: return "\(days) days left to restore your account."
        }
    }
}

struct NativeWalletLedgerSnapshot: Codable, Equatable {
    var source: String
    var count: Int
    var items: [NativeWalletLedgerRecord]
    var note: String?

    static let empty = NativeWalletLedgerSnapshot(source: "device_local", count: 0, items: [], note: "Device-local wallet fallback is available.")
}

struct NativeNotificationPreferences: Codable, Equatable {
    struct Push: Codable, Equatable { var reservations: Bool; var promotions: Bool; var reminders: Bool; var insider: Bool; var nearby: Bool }
    struct Email: Codable, Equatable { var reservations: Bool; var promotions: Bool; var newsletter: Bool; var receipts: Bool }
    struct SMS: Codable, Equatable { var reservations: Bool; var reminders: Bool; var emergencies: Bool }

    var push: Push
    var email: Email
    var sms: SMS

    static let webDefaults = NativeNotificationPreferences(
        push: Push(reservations: true, promotions: true, reminders: true, insider: true, nearby: false),
        email: Email(reservations: true, promotions: false, newsletter: true, receipts: true),
        sms: SMS(reservations: true, reminders: true, emergencies: true)
    )
}

struct NativeUserPreferencesRecord: Codable, Equatable {
    struct Parking: Codable, Equatable { var covered: Bool?; var evCharging: Bool?; var security: String? }
    var interests: [String]?
    var vibes: [String]?
    var cuisines: [String]?
    var parking: Parking?
}

struct NativeMutationSuccess: Codable, Equatable { var success: Bool?; var ok: Bool? }

struct NativeMobilityQuoteRecord: Codable, Equatable, Identifiable {
    var id: String
    var provider: String?
    var providerQuoteId: String?
    var serviceClass: String?
    var serviceTitle: String?
    var priceLabel: String?
    var etaLabel: String?
    var pickupLabel: String?
    var dropoffLabel: String?
    var cancellationLabel: String?
    var providerBookingMode: String?
    var requiresAccountLink: Bool?
    var currency: String?
    var expiresAt: String?
}

struct NativeMobilityRideRecord: Codable, Equatable, Identifiable {
    var id: String
    var quoteId: String?
    var provider: String?
    var providerReservationId: String?
    var reservationReference: String?
    var status: String?
    var serviceClass: String?
    var serviceTitle: String?
    var priceLabel: String?
    var etaLabel: String?
    var pickupLabel: String?
    var dropoffLabel: String?
    var vehicleLabel: String?
    var driverLabel: String?
    var driverName: String?
    var vehiclePlate: String?
    var vehicleMakeModel: String?
    var vehicleColor: String?
    var trackingUrl: String?
    var createdAt: String?
    var updatedAt: String?

    var normalizedProviderReservationId: String? { Self.clean(providerReservationId) ?? Self.clean(reservationReference) }
    var normalizedStatus: String { Self.clean(status)?.lowercased().replacingOccurrences(of: " ", with: "_") ?? "pending" }
    var normalizedDriverName: String? { Self.cleanAssigned(driverName) ?? Self.cleanAssigned(driverLabel) }
    var normalizedPlateLabel: String? { Self.clean(vehiclePlate) }
    var normalizedTrackingURL: URL? { Self.clean(trackingUrl).flatMap(URL.init(string:)) }
    var normalizedVehicleLine: String? {
        let vehicle = Self.clean(vehicleMakeModel) ?? Self.clean(vehicleLabel) ?? Self.clean(serviceTitle)
        let color = Self.clean(vehicleColor)
        return [color, vehicle].compactMap { $0 }.joined(separator: " ").nilIfEmpty
    }

    init(id: String, quoteId: String? = nil, provider: String? = nil, providerReservationId: String? = nil, reservationReference: String? = nil, status: String? = nil, serviceClass: String? = nil, serviceTitle: String? = nil, priceLabel: String? = nil, etaLabel: String? = nil, pickupLabel: String? = nil, dropoffLabel: String? = nil, vehicleLabel: String? = nil, driverLabel: String? = nil, driverName: String? = nil, vehiclePlate: String? = nil, vehicleMakeModel: String? = nil, vehicleColor: String? = nil, trackingUrl: String? = nil, createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.quoteId = quoteId; self.provider = provider; self.providerReservationId = providerReservationId; self.reservationReference = reservationReference; self.status = status; self.serviceClass = serviceClass; self.serviceTitle = serviceTitle; self.priceLabel = priceLabel; self.etaLabel = etaLabel; self.pickupLabel = pickupLabel; self.dropoffLabel = dropoffLabel; self.vehicleLabel = vehicleLabel; self.driverLabel = driverLabel; self.driverName = driverName; self.vehiclePlate = vehiclePlate; self.vehicleMakeModel = vehicleMakeModel; self.vehicleColor = vehicleColor; self.trackingUrl = trackingUrl; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case id, quoteId, quoteID, provider, providerReservationId, providerBookingId, externalReservationId, reservationReference, reservationCode, reference, bookingReference, status, serviceClass, serviceTitle, priceLabel, etaLabel, pickupLabel, dropoffLabel, vehicleLabel, vehicleName, vehicleMakeModel, vehicleColor, vehiclePlate, licensePlate, plateLabel, plate, driverLabel, driverName, driver, assignedDriver, vendorDriver, vehicle, car, template, trackingUrl, trackingURL, trackingLink, tracking, createdAt, updatedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.string(.id) ?? c.string(.reservationReference) ?? c.string(.reservationCode) ?? "BYT-RIDE-\(Int(Date().timeIntervalSince1970))"
        quoteId = c.string(.quoteId) ?? c.string(.quoteID)
        provider = c.string(.provider)
        providerReservationId = c.string(.providerReservationId) ?? c.string(.providerBookingId) ?? c.string(.externalReservationId) ?? c.nestedString(.template, ["providerReservationId", "providerBookingId", "externalReservationId"])
        reservationReference = c.string(.reservationReference) ?? c.string(.reservationCode) ?? c.string(.bookingReference) ?? c.string(.reference) ?? providerReservationId
        status = c.string(.status)
        serviceClass = c.string(.serviceClass)
        serviceTitle = c.string(.serviceTitle)
        priceLabel = c.string(.priceLabel)
        etaLabel = c.string(.etaLabel)
        pickupLabel = c.string(.pickupLabel)
        dropoffLabel = c.string(.dropoffLabel)
        let decodedDriverName = c.string(.driverName) ?? c.nestedString(.driver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.assignedDriver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.vendorDriver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.template, ["driverName", "driverLabel"])
        driverName = decodedDriverName ?? c.nestedNestedString(.template, "driver", ["name", "displayName", "fullName", "label"])
        driverLabel = c.string(.driverLabel) ?? driverName
        vehiclePlate = c.string(.vehiclePlate) ?? c.string(.licensePlate) ?? c.string(.plateLabel) ?? c.string(.plate) ?? c.nestedString(.vehicle, ["licensePlate", "plate", "plateLabel", "vehiclePlate"]) ?? c.nestedString(.car, ["licensePlate", "plate", "plateLabel", "vehiclePlate"]) ?? c.nestedString(.template, ["vehiclePlate", "licensePlate", "plateLabel", "plate"]) ?? c.nestedNestedString(.template, "vehicle", ["licensePlate", "plate", "plateLabel"])
        vehicleColor = c.string(.vehicleColor) ?? c.nestedString(.vehicle, ["color", "vehicleColor"]) ?? c.nestedString(.car, ["color", "vehicleColor"]) ?? c.nestedNestedString(.template, "vehicle", ["color", "vehicleColor"])
        vehicleMakeModel = c.string(.vehicleMakeModel) ?? c.string(.vehicleName) ?? c.nestedString(.vehicle, ["makeModel", "label", "name", "model"]) ?? c.nestedString(.car, ["makeModel", "label", "name", "model"]) ?? c.nestedString(.template, ["vehicleMakeModel", "vehicleName"]) ?? c.nestedNestedString(.template, "vehicle", ["makeModel", "label", "name", "model"])
        vehicleLabel = c.string(.vehicleLabel) ?? vehicleMakeModel
        trackingUrl = c.string(.trackingUrl) ?? c.string(.trackingURL) ?? c.string(.trackingLink) ?? c.nestedString(.tracking, ["url", "href", "link"]) ?? c.nestedString(.template, ["trackingUrl", "trackingURL", "trackingLink"])
        createdAt = c.string(.createdAt)
        updatedAt = c.string(.updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(quoteId, forKey: .quoteId)
        try c.encodeIfPresent(provider, forKey: .provider)
        try c.encodeIfPresent(providerReservationId, forKey: .providerReservationId)
        try c.encodeIfPresent(reservationReference, forKey: .reservationReference)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(serviceClass, forKey: .serviceClass)
        try c.encodeIfPresent(serviceTitle, forKey: .serviceTitle)
        try c.encodeIfPresent(priceLabel, forKey: .priceLabel)
        try c.encodeIfPresent(etaLabel, forKey: .etaLabel)
        try c.encodeIfPresent(pickupLabel, forKey: .pickupLabel)
        try c.encodeIfPresent(dropoffLabel, forKey: .dropoffLabel)
        try c.encodeIfPresent(vehicleLabel, forKey: .vehicleLabel)
        try c.encodeIfPresent(driverLabel, forKey: .driverLabel)
        try c.encodeIfPresent(driverName, forKey: .driverName)
        try c.encodeIfPresent(vehiclePlate, forKey: .vehiclePlate)
        try c.encodeIfPresent(vehicleMakeModel, forKey: .vehicleMakeModel)
        try c.encodeIfPresent(vehicleColor, forKey: .vehicleColor)
        try c.encodeIfPresent(trackingUrl, forKey: .trackingUrl)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
        try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
    }

    private static func clean(_ value: String?) -> String? { value?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    private static func cleanAssigned(_ value: String?) -> String? {
        guard let clean = clean(value) else { return nil }
        let lower = clean.lowercased()
        return lower.contains("pending") || lower.contains("dispatch") || lower.contains("matching") || lower.contains("assigned after") ? nil : clean
    }
}

private struct NativeAnyCodingKey: CodingKey { var stringValue: String; var intValue: Int? = nil; init?(stringValue: String) { self.stringValue = stringValue }; init?(intValue: Int) { self.stringValue = "\(intValue)"; self.intValue = intValue } }

private extension KeyedDecodingContainer where Key == NativeMobilityRideRecord.CodingKeys {
    func string(_ key: Key) -> String? { (try? decodeIfPresent(String.self, forKey: key))?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    func nestedString(_ key: Key, _ names: [String]) -> String? {
        guard let nested = try? nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: key) else { return nil }
        return nested.firstString(names)
    }
    func nestedNestedString(_ key: Key, _ child: String, _ names: [String]) -> String? {
        guard let nested = try? nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: key), let childKey = NativeAnyCodingKey(stringValue: child), let child = try? nested.nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: childKey) else { return nil }
        return child.firstString(names)
    }
}

private extension KeyedDecodingContainer where Key == NativeAnyCodingKey {
    func firstString(_ names: [String]) -> String? {
        for name in names { if let key = NativeAnyCodingKey(stringValue: name), let value = (try? decodeIfPresent(String.self, forKey: key))?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty { return value } }
        return nil
    }
}

private extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

enum NativeMobilityRouteContract {
    static let routes = ["mobility.quotes.create", "mobility.reservations.create", "mobility.reservations.cancel", "mobility.trips.status", "mobility.passenger.update"]
}

/// Coordinate-authoritative request builder for rides originating from an
/// event card. The backend receives labels for presentation and complete
/// coordinate pairs for dispatch; neither field is inferred from a venue name.
enum NativeEventRideBookingContract {
    static let source = "native-event-discovery"
    static let bookingType = "event_ride"
    static let maximumQuotedPickupDriftMiles = 100.0 / 1_609.344

    static func quoteInput(event: NativeVenueSummary, pickup: NativeLocationCoordinate) -> [String: Any]? {
        guard event.hasKnownCoordinates, !pickup.isFallback,
              NativeVenueSummary.hasValidMapCoordinate(latitude: pickup.latitude, longitude: pickup.longitude) else { return nil }
        let pickupLabel = "Current location"
        let dropoffLabel = event.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? event.name : event.address
        return [
            "bookingType": bookingType,
            "source": source,
            "eventId": event.id,
            "eventTitle": event.name,
            "pickup": pickupLabel,
            "dropoff": dropoffLabel,
            "pickupLabel": pickupLabel,
            "dropoffLabel": dropoffLabel,
            "pickupLocation": pickup.apiPoint(),
            "dropoffLocation": ["lat": event.latitude, "lng": event.longitude],
            "pickupLat": pickup.latitude,
            "pickupLng": pickup.longitude,
            "dropoffLat": event.latitude,
            "dropoffLng": event.longitude
        ]
    }

    static func reservationInput(quote: NativeMobilityQuoteRecord, event: NativeVenueSummary, pickup: NativeLocationCoordinate) -> [String: Any]? {
        guard var input = quoteInput(event: event, pickup: pickup) else { return nil }
        input["quoteId"] = quote.id
        input["provider"] = quote.provider ?? "bytspot"
        input["serviceClass"] = quote.serviceClass ?? "standard"
        input["serviceTitle"] = quote.serviceTitle ?? "Event ride"
        input["priceLabel"] = quote.priceLabel ?? "Price pending"
        input["etaLabel"] = quote.etaLabel ?? "ETA pending"
        input["requestMode"] = "reserve"
        return input
    }

    static func quotedPickupMatchesCurrent(_ quoted: NativeLocationCoordinate, current: NativeLocationCoordinate) -> Bool {
        guard !quoted.isFallback, !current.isFallback,
              NativeVenueSummary.hasValidMapCoordinate(latitude: quoted.latitude, longitude: quoted.longitude),
              NativeVenueSummary.hasValidMapCoordinate(latitude: current.latitude, longitude: current.longitude),
              let distance = quoted.distanceMiles(toLatitude: current.latitude, longitude: current.longitude) else { return false }
        return distance <= maximumQuotedPickupDriftMiles
    }
}

struct NativeMobilityDataAPI {
    let client: BytspotAPIClient

    func createQuote(input: [String: Any]) async throws -> NativeMobilityQuoteRecord {
        try await client.trpcDecode(NativeMobilityQuoteRecord.self, path: "/trpc/mobility.quotes.create", method: "POST", input: input)
    }

    func createReservation(input: [String: Any]) async throws -> NativeMobilityRideRecord {
        try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.reservations.create", method: "POST", input: input)
    }

    func createBookingRequest(input: [String: Any]) async throws -> NativeMobilityRideRecord {
        try await createReservation(input: input)
    }

    func rideStatus(id: String) async throws -> NativeMobilityRideRecord {
        try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.trips.status", method: "POST", input: ["id": id])
    }

    func cancelRide(id: String, reason: String? = nil) async throws -> NativeMutationSuccess {
        var input: [String: Any] = ["id": id]
        if let reason, !reason.isEmpty { input["reason"] = reason }
        return try await client.trpcDecode(NativeMutationSuccess.self, path: "/trpc/mobility.reservations.cancel", method: "POST", input: input)
    }

    func updatePassenger(id: String, name: String? = nil, phone: String? = nil, note: String? = nil) async throws -> NativeMobilityRideRecord {
        var input: [String: Any] = ["id": id]
        if let name, !name.isEmpty { input["name"] = name }
        if let phone, !phone.isEmpty { input["phone"] = phone }
        if let note, !note.isEmpty { input["note"] = note }
        return try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.passenger.update", method: "POST", input: input)
    }
}

enum NativeCheckInV2Contract {
    static let createRoute = "/trpc/checkins.create"
    static let syncRoute = "/trpc/checkins.sync"
    static let reconcilePointsRoute = "/trpc/checkins.reconcilePoints"
    static let providerCountsRoute = "/trpc/checkins.providerCounts"
    static let venueIntelligenceRoute = "/trpc/venues.intelligence"
    static let verifyRoute = "/trpc/checkins.verify"
    static let manualTrustLevel = "staticDiscovery"
    static let manualSource = "native_ios_manual"

    static func manualCreateInput(venueId: String, idempotencyKey: String, observedAt: String? = nil, patchId: String? = nil) -> [String: Any] {
        var input: [String: Any] = ["venueId": venueId, "idempotencyKey": idempotencyKey, "trustLevel": manualTrustLevel, "source": manualSource]
        if let observedAt, !observedAt.isEmpty { input["observedAt"] = observedAt }
        if let patchId, !patchId.isEmpty { input["patchId"] = patchId }
        return input
    }
}

enum NativeLiveContentV2Contract {
    static let eventsListRoute = "/trpc/events.list"
    static let partyDraftCreateRoute = "/trpc/events.drafts.create"
    static let hostDestinationsGetRoute = "/trpc/events.hostDestinations.get"
    static let hostDestinationsSaveRoute = "/trpc/events.hostDestinations.save"
    static let partyDraftDeleteRoute = "/trpc/events.drafts.delete"
    static let partyPublishRoute = "/trpc/events.publish"
    static let partyMediaUploadRoute = "/trpc/events.media.upload"
    static let partyMediaResetRoute = "/trpc/events.media.reset"
    static let partyRSVPRoute = "/trpc/events.rsvp.create"
    static let partyTicketCheckoutRoute = "/trpc/events.tickets.createCheckout"
    static let partyItineraryRoute = "/trpc/events.itinerary.upsert"
    static let partyRoleAssignRoute = "/trpc/events.roles.assign"
    static let partyAudienceAttachRoute = "/trpc/events.audiences.attach"
    static let partyControlHostedRoute = "/trpc/events.control.hosted"
    static let ticketmasterProvider = "ticketmaster"
    static let placesTextSearchRoute = "/trpc/places.textSearch"
    static let placesNearbySearchRoute = "/trpc/places.nearbySearch"
    static let placesEnrichRoute = "/trpc/places.enrich"
    static let vendorsMatchRoute = "/trpc/vendors.match"
    static let venueIntelligenceRoute = "/trpc/venues.intelligence"
    static let googleRoutesProxyStatus = "pending_backend_route"
    static let parkingSearchRoute = "/trpc/parking.search"
    static let parkingQuoteRoute = "/trpc/parking.quote"
    static let parkingReserveRoute = "/trpc/parking.reserve"
    static let parkingAvailabilityRoute = "/trpc/parking.availability"
    static let parkingCancelRoute = "/trpc/parking.cancel"
    static let menusListRoute = "/trpc/menus.list"
    static let menusGetRoute = "/trpc/menus.get"
    static let ordersQuoteRoute = "/trpc/orders.quote"
    static let ordersCreateRoute = "/trpc/orders.create"
    static let tablesSearchRoute = "/trpc/tables.search"
    static let tablesReserveRoute = "/trpc/tables.reserve"
    static let socialGroupsListRoute = "/trpc/social.groups.list"
    static let socialGroupsCreateRoute = "/trpc/social.groups.create"
    static let socialGroupsDeleteRoute = "/trpc/social.groups.delete"
    static let socialGroupsMembersAddRoute = "/trpc/social.groups.members.add"
    static let socialGroupsMembersRemoveRoute = "/trpc/social.groups.members.remove"
    static let socialInvitesCreateRoute = "/trpc/social.invites.create"
    static let socialInvitesListRoute = "/trpc/social.invites.list"
    static let socialInvitesRespondRoute = "/trpc/social.invites.respond"
    static let socialInvitesCancelRoute = "/trpc/social.invites.cancel"
    static let socialPeopleMetOptInRoute = "/trpc/social.peopleMet.optIn"
    static let socialPeopleMetOptOutRoute = "/trpc/social.peopleMet.optOut"
    static let socialPeopleMetStatusRoute = "/trpc/social.peopleMet.status"
    static let socialPeopleMetListRoute = "/trpc/social.peopleMet.list"
    static let userPresenceSummaryRoute = "/trpc/user.presence.summary"
    static let phase1Providers = ["apple_sign_in", "mapkit_corelocation", "google_places", "google_routes", "open_meteo", "ticketmaster"]
}

/// Home header presence. `scope` decides the copy: circle counts are Evidenced,
/// global counts are withheld below the server's floor, and `none` renders no
/// number at all rather than a small one dressed up.
struct NativePresenceSummary: Codable, Equatable {
    let scope: String
    let count: Int?
    let windowMs: Int?

    static let none = NativePresenceSummary(scope: "none", count: nil, windowMs: nil)

    /// Copy must state scope and window; a bare number implies a density that
    /// has not been measured.
    var chipLabel: String? {
        guard let count, count > 0 else { return nil }
        switch scope {
        case "circle": return count == 1 ? "1 in your circle out" : "\(count) in your circle out"
        case "global": return "\(count) active this hour"
        default: return nil
        }
    }
}

struct NativeCheckInCreateResponse: Codable, Equatable {
    var checkInId: String
    var venueId: String
    var trustLevel: String
    var pointsAwarded: Int
    var pointsBalance: Int?
    var syncedAt: String?
    var providerVisible: Bool?
}

struct NativeCheckInVenueCount: Codable, Equatable, Identifiable {
    var venueId: String
    var venueName: String?
    var manual: Int
    var verified: Int
    var activeNow: Int

    var id: String { venueId }
}

struct NativeCheckInProviderCountsResponse: Codable, Equatable {
    var total: Int
    var manual: Int
    var verified: Int
    var activeNow: Int
    var pendingSync: Int
    var updatedAt: String?
    var venues: [NativeCheckInVenueCount]?
}

struct NativeCheckInPointsReconciliation: Codable, Equatable {
    var pointsBalance: Int
    var pendingPoints: Int
    var reconciledAt: String?
}

struct NativeCheckInDataAPI {
    let client: BytspotAPIClient

    func createManualCheckIn(venueId: String, idempotencyKey: String, observedAt: String? = nil, patchId: String? = nil) async throws -> NativeCheckInCreateResponse {
        try await client.trpcDecode(NativeCheckInCreateResponse.self, path: NativeCheckInV2Contract.createRoute, method: "POST", input: NativeCheckInV2Contract.manualCreateInput(venueId: venueId, idempotencyKey: idempotencyKey, observedAt: observedAt, patchId: patchId))
    }

    func sync(records: [[String: Any]]) async throws -> [NativeCheckInCreateResponse] {
        try await client.trpcDecode([NativeCheckInCreateResponse].self, path: NativeCheckInV2Contract.syncRoute, method: "POST", input: ["records": records])
    }

    func reconcilePoints() async throws -> NativeCheckInPointsReconciliation {
        try await client.trpcDecode(NativeCheckInPointsReconciliation.self, path: NativeCheckInV2Contract.reconcilePointsRoute, method: "POST", input: [:])
    }

    func providerCounts(input: [String: Any] = ["window": "today"]) async throws -> NativeCheckInProviderCountsResponse {
        try await client.trpcDecode(NativeCheckInProviderCountsResponse.self, path: NativeCheckInV2Contract.providerCountsRoute, method: "POST", input: input)
    }
}

struct NativeAuthUserRecord: Codable, Equatable {
    var id: String?
    var email: String?
    var name: String?
}

struct NativeAuthResponse: Codable, Equatable {
    var token: String?
    var user: NativeAuthUserRecord?
    var isNewUser: Bool?
    /// True when this sign-in cancelled a pending account deletion. The member
    /// must be told: they are being restored, not merely signed in.
    var deletionCancelled: Bool?
}

enum NativeAuthRouteContract {
    static let routes = ["auth.signup", "auth.login", "auth.googleSignIn", "auth.appleSignIn"]
    static let storageKeys = ["bytspot_auth_token", "bytspot_user", "bytspot_user_name"]
    // The deployed backend currently recognizes the consumer Google flow as
    // "parker"; this is an API contract rather than the operating system.
    static let googleConsumerSurface = "parker"
    static let passwordRecoveryRoutes = ["/#/forgot-password", "/forgot-password", "/#/reset-password", "/reset-password"]
}

struct NativeAuthDataAPI {
    var client: BytspotAPIClient

    func appleSignIn(identityToken: String, email: String?, name: String?) async throws -> NativeAuthResponse {
        var input: [String: Any] = ["identityToken": identityToken, "ref": "native_ios"]
        if let email, !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["email"] = email.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["name"] = name.trimmingCharacters(in: .whitespacesAndNewlines) }
        return try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.appleSignIn", method: "POST", input: input)
    }

    func googleSignIn(idToken: String) async throws -> NativeAuthResponse {
        try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.googleSignIn", method: "POST", input: ["idToken": idToken, "surface": NativeAuthRouteContract.googleConsumerSurface])
    }

    func signup(email: String, password: String, name: String, ref: String?) async throws -> NativeAuthResponse {
        try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.signup", method: "POST", input: Self.signupInput(email: email, password: password, name: name, ref: ref))
    }

    func login(email: String, password: String) async throws -> NativeAuthResponse {
        try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.login", method: "POST", input: Self.loginInput(email: email, password: password))
    }

    static func signupInput(email: String, password: String, name: String, ref: String?) -> [String: Any] {
        var input: [String: Any] = ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password, "name": name.trimmingCharacters(in: .whitespacesAndNewlines)]
        if let ref = ref?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), !ref.isEmpty { input["ref"] = ref }
        return input
    }

    static func loginInput(email: String, password: String) -> [String: Any] {
        ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
    }

    /// True when the backend refused the provider sign-in because a Bytspot
    /// account already owns this email (HTTP 409 / tRPC CONFLICT). The server
    /// intentionally never auto-links provider identities by email.
    static func isAccountConflict(_ error: Error) -> Bool {
        guard case let BytspotAPIClient.APIError.server(status, body) = error else { return false }
        if status == 409 { return true }
        if body.contains("\"code\":\"CONFLICT\"") { return true }
        return serverMessage(in: body).lowercased().contains("already exists")
    }

    static func userMessage(for error: Error, mode: NativeAuthMode) -> String {
        if let urlError = error as? URLError,
           [.timedOut, .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost].contains(urlError.code) {
            return "We couldn't connect. Check your internet and try again."
        }
        if case let BytspotAPIClient.APIError.server(status, body) = error {
            let message = serverMessage(in: body).lowercased()
            if status == 429 { return "Too many attempts. Wait a moment and try again." }
            if message.contains("already") || message.contains("conflict") {
                return "An account already exists for this email. Log in instead."
            }
            if message.contains("invite") { return "That invite code isn't valid. Check it or leave it blank." }
            if mode == .login && (status == 401 || message.contains("credential") || message.contains("password") || message.contains("not found")) {
                return "The email or password is incorrect."
            }
        }
        return mode == .signup ? "We couldn't create your account. Please try again." : "We couldn't log you in. Please try again."
    }

    private static func serverMessage(in body: String) -> String {
        guard let data = body.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) else { return "" }
        return findMessage(in: root) ?? ""
    }

    private static func findMessage(in value: Any) -> String? {
        if let dictionary = value as? [String: Any] {
            if let message = dictionary["message"] as? String { return message }
            for child in dictionary.values { if let message = findMessage(in: child) { return message } }
        } else if let array = value as? [Any] {
            for child in array { if let message = findMessage(in: child) { return message } }
        }
        return nil
    }
}

struct NativeProfileDataAPI {
    let client: BytspotAPIClient

    #if DEBUG
    static let fixtureEnvironmentKey = "BYT_NATIVE_PROFILE_DATA_FIXTURES"

    private var usesAuthenticatedFixtures: Bool {
        let raw = ProcessInfo.processInfo.environment[Self.fixtureEnvironmentKey]?.lowercased()
        return NativeMigrationConfig.isNativeRootEnabled && (raw == "1" || raw == "true" || raw == "authenticated")
    }

    static let fixtureProfile = NativeUserProfileRecord(id: "native-fixture-user", email: "member@example.com", name: "Preview Member", phone: "+1 555 0100", profileImage: nil, address: "Example City", birthday: "1994-04-03")
    static let fixtureVehicles = [NativeVehicleRecord(id: "veh_fixture_1", type: "sedan", make: "Tesla", model: "Model 3", year: 2026, color: "Midnight Blue", licensePlate: "BYT-424", photo: nil, vin: nil, transmissionType: "automatic", trunkCategory: "full")]
    static let fixturePaymentMethods = [NativePaymentMethodRecord(id: "pm_fixture_1", type: "card", brand: "visa", last4: "4242", expiryMonth: "04", expiryYear: "30", isDefault: true)]
    static let fixtureNotificationPreferences = NativeNotificationPreferences.webDefaults
    static let fixtureUserPreferences = NativeUserPreferencesRecord(interests: nil, vibes: ["drinks"], cuisines: nil, parking: NativeUserPreferencesRecord.Parking(covered: true, evCharging: true, security: "premium"))
    static let fixtureSocialCircles = [NativeSocialCircle(id: "circle-fixture-close", name: "Close Friends", ownerUserId: "native-fixture-user", memberCount: 8, memberIDs: [], role: "owner"), NativeSocialCircle(id: "circle-fixture-crew", name: "Creator Crew", ownerUserId: "native-fixture-user", memberCount: 5, memberIDs: [], role: "admin")]
    #endif

    func loadProfile() async throws -> NativeUserProfileRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureProfile }
        #endif
        return try await client.trpcDecode(NativeUserProfileRecord.self, path: "/trpc/user.profile.get")
    }

    func updateProfile(name: String?, phone: String?, address: String?, birthday: String?) async throws -> NativeUserProfileRecord {
        #if DEBUG
        if usesAuthenticatedFixtures {
            return NativeUserProfileRecord(id: Self.fixtureProfile.id, email: Self.fixtureProfile.email, name: name ?? Self.fixtureProfile.name, phone: phone ?? Self.fixtureProfile.phone, profileImage: nil, address: address ?? Self.fixtureProfile.address, birthday: birthday ?? Self.fixtureProfile.birthday)
        }
        #endif
        var input: [String: Any] = [:]
        if let name, !name.isEmpty { input["name"] = name }
        if let phone, !phone.isEmpty { input["phone"] = phone }
        if let address, !address.isEmpty { input["address"] = address }
        if let birthday, !birthday.isEmpty { input["birthday"] = birthday }
        return try await client.trpcDecode(NativeUserProfileRecord.self, path: "/trpc/user.profile.update", method: "POST", input: input)
    }

    func listVehicles() async throws -> [NativeVehicleRecord] {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureVehicles }
        #endif
        return try await client.trpcDecode([NativeVehicleRecord].self, path: "/trpc/user.vehicles.list")
    }

    func addVehicle(_ vehicle: NativeVehicleRecord) async throws -> NativeVehicleRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativeVehicleRecord(id: "veh_fixture_new", type: vehicle.type, make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color, licensePlate: vehicle.licensePlate, photo: vehicle.photo, vin: vehicle.vin, transmissionType: vehicle.transmissionType, trunkCategory: vehicle.trunkCategory) }
        #endif
        return try await client.trpcDecode(NativeVehicleRecord.self, path: "/trpc/user.vehicles.add", method: "POST", input: vehicleInput(vehicle, includeID: false))
    }

    func updateVehicle(_ vehicle: NativeVehicleRecord) async throws -> NativeVehicleRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return vehicle }
        #endif
        return try await client.trpcDecode(NativeVehicleRecord.self, path: "/trpc/user.vehicles.update", method: "POST", input: vehicleInput(vehicle, includeID: true))
    }

    func removeVehicle(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/user.vehicles.remove", method: "POST", input: ["id": id])
    }

    func listPaymentMethods() async throws -> [NativePaymentMethodRecord] {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixturePaymentMethods }
        #endif
        return try await client.trpcDecode([NativePaymentMethodRecord].self, path: "/trpc/payments.listMethods")
    }

    func createPaymentSetupSession() async throws -> NativePaymentSetupSession {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativePaymentSetupSession(url: nil) }
        #endif
        return try await client.trpcDecode(NativePaymentSetupSession.self, path: "/trpc/payments.setupSession", method: "POST", input: ["successPath": "/profile/payment", "cancelPath": "/profile/payment"])
    }

    func createPaymentCheckout(input: [String: Any]) async throws -> NativeCheckoutSession {
        NativeCheckoutSession(payload: try await client.trpcPayload(path: "/trpc/payments.checkout", method: "POST", input: input))
    }

    func createParkingCheckout(input: [String: Any]) async throws -> NativeCheckoutSession {
        try await createPaymentCheckout(input: input)
    }

    func createBookingCheckout(input: [String: Any]) async throws -> NativeCheckoutSession {
        NativeCheckoutSession(payload: try await client.trpcPayload(path: "/trpc/booking.createCheckout", method: "POST", input: input))
    }

    func loadWalletLedger(limit: Int = 20) async throws -> NativeWalletLedgerSnapshot {
        try await client.trpcDecode(NativeWalletLedgerSnapshot.self, path: "/trpc/native.walletLedger", method: "POST", input: ["limit": limit])
    }

    func listSocialCirclesViaRpc(fallback: [NativeSocialCircle] = []) async -> NativeSocialCircleSnapshot {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativeSocialCircleSnapshot(source: .backend, groups: Self.fixtureSocialCircles) }
        #endif
        do {
            let payload = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.socialGroupsListRoute, input: Self.socialCircleListInput())
            let groups = NativeSocialCircle.normalizeSocialCircles(payload)
            if !groups.isEmpty { return NativeSocialCircleSnapshot(source: .backend, groups: groups) }
        } catch {}
        return NativeSocialCircleSnapshot(source: .fallback, groups: fallback)
    }

    func createSocialCircleViaRpc(name: String) async throws -> NativeSocialCircle? {
        let response = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialGroupsCreateRoute, method: "POST", input: ["name": name, "privacy": "private", "surface": "network"])
        return (NativeSocialCircle.normalizeSocialCircle(response) ?? NativeSocialCircle.normalizeSocialCircles(response).first).map(NativeSocialCircle.ownedByCreator)
    }

    func addPersonToSocialCircleViaRpc(circleID: String, userID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialGroupsMembersAddRoute, method: "POST", input: ["groupId": circleID, "userId": userID, "surface": "network"])
    }

    func deleteSocialCircleViaRpc(circleID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialGroupsDeleteRoute, method: "POST", input: ["groupId": circleID, "surface": "network"])
    }

    func listSocialInvitationsViaRpc() async throws -> [NativeSocialInvitation] {
        let response = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.socialInvitesListRoute, input: ["surface": "network"])
        return NativeSocialInvitation.normalizeList(response)
    }

    func sendSocialInvitationViaRpc(userID: String, circleID: String?) async throws -> NativeSocialInvitation? {
        var input: [String: Any] = ["targetType": "user", "targetValue": userID, "surface": "network"]
        if let circleID { input["groupId"] = circleID }
        let response = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialInvitesCreateRoute, method: "POST", input: input)
        return NativeSocialInvitation.normalize(response) ?? NativeSocialInvitation.normalizeList(response).first
    }

    func respondToSocialInvitationViaRpc(id: String, response: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialInvitesRespondRoute, method: "POST", input: ["inviteId": id, "response": response, "surface": "network"])
    }

    func cancelSocialInvitationViaRpc(id: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialInvitesCancelRoute, method: "POST", input: ["inviteId": id, "surface": "network"])
    }

    func presenceSummaryViaRpc() async throws -> NativePresenceSummary {
        try await client.trpcDecode(NativePresenceSummary.self, path: NativeLiveContentV2Contract.userPresenceSummaryRoute)
    }

    func peopleMetStatusViaRpc(partyID: String) async throws -> Bool {
        let response = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.socialPeopleMetStatusRoute, input: ["partyId": partyID])
        return NativePeopleMetPerson.normalizeOptInStatus(response)
    }

    func peopleMetOptInViaRpc(partyID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialPeopleMetOptInRoute, method: "POST", input: ["partyId": partyID])
    }

    func peopleMetOptOutViaRpc(partyID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.socialPeopleMetOptOutRoute, method: "POST", input: ["partyId": partyID])
    }

    func peopleMetListViaRpc(partyID: String) async throws -> [NativePeopleMetPerson] {
        let response = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.socialPeopleMetListRoute, input: ["partyId": partyID])
        return NativePeopleMetPerson.normalizeList(response)
    }

    func setDefaultPaymentMethod(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/payments.setDefaultMethod", method: "POST", input: ["paymentMethodId": id])
    }

    func removePaymentMethod(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/payments.removeMethod", method: "POST", input: ["paymentMethodId": id])
    }

    func loadNotificationPreferences() async throws -> NativeNotificationPreferences {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureNotificationPreferences }
        #endif
        return try await client.trpcDecode(NativeNotificationPreferences.self, path: "/trpc/user.notifications.getPrefs")
    }

    func updateNotificationPreferences(_ preferences: NativeNotificationPreferences) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcDecode(NativeMutationSuccess.self, path: "/trpc/user.notifications.updatePrefs", method: "POST", input: Self.notificationInput(preferences))
    }

    func loadUserPreferences() async throws -> NativeUserPreferencesRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureUserPreferences }
        #endif
        return try await client.trpcDecode(NativeUserPreferencesRecord.self, path: "/trpc/user.preferences.get")
    }

    func updateUserPreferenceSummary(vibeToken: String? = nil, parking: NativeUserPreferencesRecord.Parking? = nil) async throws -> NativeUserPreferencesRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativeUserPreferencesRecord(interests: nil, vibes: vibeToken.map { [$0] } ?? Self.fixtureUserPreferences.vibes, cuisines: nil, parking: parking ?? Self.fixtureUserPreferences.parking) }
        #endif
        return try await client.trpcDecode(NativeUserPreferencesRecord.self, path: "/trpc/user.preferences.update", method: "POST", input: Self.userPreferencesInput(vibeToken: vibeToken, parking: parking))
    }

    static func notificationInput(_ preferences: NativeNotificationPreferences) -> [String: Any] {
        [
            "push": ["reservations": preferences.push.reservations, "promotions": preferences.push.promotions, "reminders": preferences.push.reminders, "insider": preferences.push.insider, "nearby": preferences.push.nearby],
            "email": ["reservations": preferences.email.reservations, "promotions": preferences.email.promotions, "newsletter": preferences.email.newsletter, "receipts": preferences.email.receipts],
            "sms": ["reservations": preferences.sms.reservations, "reminders": preferences.sms.reminders, "emergencies": preferences.sms.emergencies]
        ]
    }

    static func userPreferencesInput(vibeToken: String? = nil, parking: NativeUserPreferencesRecord.Parking? = nil) -> [String: Any] {
        var input: [String: Any] = [:]
        if let vibeToken, !vibeToken.isEmpty { input["vibes"] = [vibeToken] }
        if let parking {
            var parkingInput: [String: Any] = [:]
            if let covered = parking.covered { parkingInput["covered"] = covered }
            if let evCharging = parking.evCharging { parkingInput["evCharging"] = evCharging }
            if let security = parking.security, !security.isEmpty { parkingInput["security"] = security }
            if !parkingInput.isEmpty { input["parking"] = parkingInput }
        }
        return input
    }

    static func socialCircleListInput() -> [String: Any] { ["surface": "network"] }

    func loadAccountDeletionStatus() async throws -> NativeAccountDeletionStatus {
        try await client.trpcDecode(NativeAccountDeletionStatus.self, path: "/trpc/user.account.deletionStatus")
    }

    func requestAccountDeletion(reason: String?) async throws -> NativeAccountDeletionReceipt {
        try await client.trpcDecode(NativeAccountDeletionReceipt.self, path: "/trpc/user.account.requestDeletion", method: "POST", input: Self.accountDeletionInput(reason: reason))
    }

    func cancelAccountDeletion() async throws {
        _ = try await client.trpcPayload(path: "/trpc/user.account.cancelDeletion", method: "POST", input: [:])
    }

    static func accountDeletionInput(reason: String?) -> [String: Any] {
        let trimmed = reason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? [:] : ["reason": trimmed]
    }

    private func vehicleInput(_ vehicle: NativeVehicleRecord, includeID: Bool) -> [String: Any] {
        var input: [String: Any] = [
            "type": vehicle.type,
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "color": vehicle.color,
            "licensePlate": vehicle.licensePlate,
            "transmissionType": vehicle.transmissionType,
            "trunkCategory": vehicle.trunkCategory
        ]
        if includeID { input["id"] = vehicle.id }
        if let photo = vehicle.photo, !photo.isEmpty { input["photo"] = photo }
        if let vin = vehicle.vin, !vin.isEmpty { input["vin"] = vin }
        return input
    }
}

@MainActor
final class NativeWalletLedgerStore: ObservableObject {
    @Published private(set) var snapshot = NativeWalletLedgerSnapshot.empty
    @Published private(set) var isRefreshing = false

    func refresh(sessionStore: BytspotSessionStore) async {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        guard sessionStore.isAuthenticated else {
            snapshot = NativeWalletLedgerSnapshot.empty
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }
        let api = NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil }))
        do {
            snapshot = try await api.loadWalletLedger(limit: 20)
        } catch {
            snapshot = NativeWalletLedgerSnapshot(source: "unavailable", count: 0, items: [], note: "Server wallet unavailable; showing device-local fallback.")
        }
    }
}

struct NativeAPISessionSnapshot: Equatable {
    enum Mode: Equatable { case signedOut, guest, tokenPresent }

    let mode: Mode
    let baseHost: String
    let route: String
    let attachesBearerToken: Bool

    var title: String {
        switch mode {
        case .signedOut: return "API session: signed out"
        case .guest: return "API session: guest preview"
        case .tokenPresent: return "API session: token ready"
        }
    }

    var subtitle: String {
        let auth = attachesBearerToken ? "Bearer token attached" : "No bearer token attached"
        return "\(auth) · \(baseHost)\(route)"
    }
}

@MainActor
final class NativeAPIState: ObservableObject {
    @Published private(set) var snapshot = NativeAPISessionSnapshot(mode: .signedOut, baseHost: "bytspot-api.onrender.com", route: "/health", attachesBearerToken: false)

    func refresh(sessionStore: BytspotSessionStore) {
        let mode: NativeAPISessionSnapshot.Mode = sessionStore.isAuthenticated ? .tokenPresent : sessionStore.isGuest ? .guest : .signedOut
        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            let request = try client.makeRequest(path: "/health")
            snapshot = NativeAPISessionSnapshot(
                mode: mode,
                baseHost: request.url?.host ?? "bytspot-api.onrender.com",
                route: request.url?.path.isEmpty == false ? request.url?.path ?? "/health" : "/health",
                attachesBearerToken: request.value(forHTTPHeaderField: "Authorization") != nil
            )
        } catch {
            snapshot = NativeAPISessionSnapshot(mode: mode, baseHost: "configuration pending", route: "/health", attachesBearerToken: false)
        }
    }
}

/// Live canonical-membership source for the Map Functions gate. Explicit server
/// tiers take precedence; the legacy isPremium boolean maps to Platinum.
@MainActor
final class NativeMembershipTierStore: ObservableObject {
    @Published private(set) var tier: BytspotTier = .membershipPreview
    private var refreshGeneration = 0

    func refresh(sessionStore: BytspotSessionStore) async {
        refreshGeneration += 1
        let generation = refreshGeneration
        let expectedToken = sessionStore.token
        let expectedUserID = sessionStore.authenticatedUserID
        tier = .green
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        if BytspotTier.membershipPreview == .platinum { tier = .platinum; return }
        guard sessionStore.isAuthenticated else { return }

        let client = BytspotAPIClient(tokenProvider: { expectedToken })
        do {
            let payload = try await client.json(path: "/trpc/subscription.status")
            guard Self.canApplyRefresh(
                generation: generation, currentGeneration: refreshGeneration,
                expectedToken: expectedToken, currentToken: sessionStore.token,
                expectedUserID: expectedUserID, currentUserID: sessionStore.authenticatedUserID
            ) else { return }
            tier = Self.findString(named: "membershipTier", in: payload)
                .flatMap(BytspotTier.init(rawValue:))
                ?? (Self.findBool(named: "isPremium", in: payload) == true ? .platinum : .green)
        } catch {
            guard generation == refreshGeneration else { return }
            tier = .green
        }
    }

    nonisolated static func canApplyRefresh(
        generation: Int, currentGeneration: Int,
        expectedToken: String?, currentToken: String?,
        expectedUserID: String?, currentUserID: String?
    ) -> Bool {
        generation == currentGeneration && expectedToken == currentToken && expectedUserID == currentUserID
    }

    /// Recursively extracts a named boolean from a decoded tRPC payload, tolerating
    /// either the plain ({result:{data:{isPremium}}}) or superjson
    /// ({result:{data:{json:{isPremium}}}}) envelope shape.
    nonisolated static func findBool(named name: String, in value: Any) -> Bool? {
        guard let dict = value as? [String: Any] else { return nil }
        if let flag = dict[name] as? Bool { return flag }
        if let number = dict[name] as? NSNumber { return number.boolValue }
        for child in dict.values { if let found = findBool(named: name, in: child) { return found } }
        return nil
    }

    /// Mirrors findBool for the plain and SuperJSON tRPC envelope shapes.
    nonisolated static func findString(named name: String, in value: Any) -> String? {
        guard let dict = value as? [String: Any] else { return nil }
        if let value = dict[name] as? String { return value }
        for child in dict.values { if let found = findString(named: name, in: child) { return found } }
        return nil
    }
}

struct NativeCrowdSummary: Equatable {
    let level: Int
    let label: String
    let waitMins: Int?
    /// `bytspot` / `user_report` / `sensor` are Live. Everything else — including
    /// `typical`, leftover `simulation`, and a missing source — is a catalog.
    let source: String?

    init(level: Int, label: String, waitMins: Int?, source: String? = nil) {
        self.level = level
        self.label = label
        self.waitMins = waitMins
        self.source = source
    }

    var isLiveOccupancy: Bool {
        switch source?.lowercased() {
        case "bytspot", "user_report", "sensor": return true
        default: return false
        }
    }
}

struct NativeParkingSummary: Equatable {
    let totalAvailable: Int
    let priceLabel: String
}

enum NativeDiscoverCategoryNormalizer {
    static func type(for rawType: String) -> String {
        let text = rawType.lowercased().replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        let tokens = Set(text.split { !$0.isLetter && !$0.isNumber }.map(String.init))
        let coffeeTokens: Set<String> = ["coffee", "cafe", "cafes", "café", "cafés", "espresso"]
        if !tokens.isDisjoint(with: coffeeTokens) { return "coffee" }

        let diningPhrases = ["fine dining", "casual dining", "family style", "fast casual", "fast food", "quick service", "food court", "pop up restaurant", "ghost kitchen", "virtual kitchen", "cloud kitchen", "food truck", "street food", "coffee shop", "tea house", "ice cream", "juice bar", "smoothie bar", "wine bar", "gastropub", "brewpub", "taproom", "soul food", "cajun creole", "latin american", "middle eastern", "sri lankan", "farm to table", "gluten free", "plant based", "raw food", "hot dog", "hot dogs", "sandwich shop", "rooftop dining", "waterfront dining", "garden dining", "outdoor patio", "chef table", "chef's table", "private dining", "communal dining", "interactive dining", "dinner theater", "dinner theatre", "live music dining", "dinner cruise", "scenic dining", "themed restaurant", "pop culture restaurant", "historic restaurant", "table service", "counter service", "self service", "buffet service", "banquet service", "drive thru", "curbside pickup", "afternoon tea", "late night dining", "coffee house", "espresso bar", "tea lounge", "bubble tea", "mocktail bar", "brewery restaurant", "distillery restaurant", "dinner show", "live music restaurant", "comedy dinner club", "sports restaurant", "karaoke restaurant", "cooking experience", "tasting menu", "wine pairing", "chef tasting", "chef's tasting", "airport restaurant", "hotel restaurant", "resort restaurant", "casino restaurant", "mall restaurant", "beach restaurant", "mountain restaurant", "floating restaurant", "train dining", "cruise ship dining"]
        if diningPhrases.contains(where: { text.contains($0) }) { return "dining" }

        let eventFirstPhrases = ["art exhibition", "museum event", "gallery opening", "craft fair", "fashion show", "photography exhibition", "antique show", "holiday market", "artisan market", "vendor fair", "boxing event", "mma event", "wrestling event", "golf tournament", "fitness challenge", "adventure race", "hiking trip", "camping event", "fishing tournament", "nature walk", "bird watching", "eco tour", "meditation session", "spa event", "coding bootcamp"]
        if eventFirstPhrases.contains(where: { text.contains($0) }) { return "entertainment" }

        let parkingPhrases = ["public parking", "street parking", "parking lot", "parking garage", "municipal parking", "downtown parking", "event parking", "private parking", "residential parking", "apartment parking", "office parking", "hotel parking", "restaurant parking", "retail parking", "shopping mall parking", "airport parking", "train station parking", "bus station parking", "ferry terminal parking", "park and ride", "transit parking", "self parking", "valet parking", "covered parking", "uncovered parking", "underground parking", "multi level garage", "surface lot", "reserved parking", "assigned parking", "overflow parking", "motorcycle parking", "bicycle parking", "rv parking", "camper parking", "bus parking", "truck parking", "trailer parking", "electric vehicle parking", "ev parking", "accessible parking", "ada parking", "family parking", "senior parking", "pregnancy parking", "vip parking", "staff parking", "visitor parking", "carpool parking", "ev charging", "charging station", "charging stations", "tesla supercharger", "fast charging", "solar powered parking", "green vehicle parking", "gated parking", "secured parking", "guarded parking", "cctv monitored", "well lit parking", "24/7 parking", "free parking", "paid parking", "hourly parking", "daily parking", "monthly parking", "subscription parking", "metered parking", "mobile payment parking", "festival parking", "stadium parking", "concert parking", "convention center parking", "wedding parking", "shuttle parking", "long term parking", "short term parking", "economy parking", "hotel valet", "vehicle storage", "car wash while parked", "parking with shuttle", "automated parking"]
        if parkingPhrases.contains(where: { text.contains($0) }) || tokens.contains("parking") || tokens.contains("garage") || tokens.contains("garages") || text.contains("park and ride") { return "parking" }

        let boutiqueStayPhrases = ["boutique apartment", "boutique stay", "private suite", "yoga retreat", "meditation retreat", "wellness retreat", "spiritual retreat", "detox retreat", "bed & breakfast", "bed breakfast", "b&b", "country inn", "boutique inn", "camping", "glamping", "rv park", "caravan park", "tiny house", "treehouse", "farm stay", "ranch stay", "safari lodge", "yurt", "dome stay", "castle hotel", "palace hotel", "floating hotel", "houseboat", "overwater bungalow", "ice hotel", "cave hotel", "lighthouse stay", "luxury tent", "beach resort", "mountain resort", "ski resort", "golf resort", "spa resort", "eco resort", "wellness resort", "family resort", "all inclusive resort", "island resort", "vacation rental", "holiday home", "apartment rental", "condo rental", "serviced apartment", "townhouse rental"]
        let boutiqueStayTokens: Set<String> = ["villa", "cabin", "cottage", "chalet", "yurt", "treehouse", "houseboat", "glamping"]
        if boutiqueStayPhrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: boutiqueStayTokens) { return "boutique_apartment" }

        if text.contains("mobility training") { return "fitness" }

        let mobilityPhrases = ["atv rental", "utv rental", "snowmobile rental", "jet ski rental", "luxury car rental", "exotic car rental", "off road vehicle tour", "off road vehicle tours", "horseback riding", "marine transportation", "cruise ship", "yacht charter", "boat rental", "water shuttle", "sailboat charter", "kayak rental", "canoe rental", "commercial flight", "commercial flights", "charter flight", "charter flights", "private jet", "helicopter charter", "air taxi", "seaplane", "hot air balloon", "chauffeur service", "limousine service"]
        let mobilityTokens: Set<String> = ["mobility", "transportation", "transfer", "transfers", "shuttle", "chauffeur", "limousine", "seaplane"]
        if mobilityPhrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: mobilityTokens) { return "mobility" }

        let fitnessPhrases = ["commercial gym", "boutique fitness studio", "personal training", "functional training", "strength training", "olympic weightlifting", "circuit training", "group fitness", "walking clubs", "spin class", "spin classes", "indoor cycling", "stair climbing", "elliptical training", "triathlon training", "tai chi", "mobility training", "flexibility class", "flexibility classes", "dance fitness", "dance cardio", "hip hop fitness", "salsa fitness", "ballet fitness", "belly dance fitness", "martial arts", "muay thai", "brazilian jiu jitsu", "krav maga", "mixed martial arts", "basketball training", "soccer training", "tennis training", "golf fitness", "baseball training", "volleyball training", "football training", "track field training", "cricket training", "trail running", "rock climbing", "mountain biking", "outdoor bootcamp", "outdoor bootcamps", "adventure racing", "aqua aerobics", "lap swimming", "water polo", "synchronized swimming", "surfing lesson", "surfing lessons", "recovery center", "recovery centers", "physical therapy", "sports massage", "infrared sauna", "cold plunge", "compression therapy", "stretch therapy", "recovery lounge", "senior fitness", "women's fitness", "kids fitness", "adaptive fitness", "prenatal fitness", "postnatal fitness", "corporate wellness", "medical fitness", "nutrition coaching", "health coaching", "health club", "recreation center", "community fitness center", "university gym", "hotel gym", "apartment gym", "outdoor fitness park", "climbing gym", "trampoline park", "ninja warrior gym"]
        let fitnessTokens: Set<String> = ["gym", "gyms", "fitness", "training", "weightlifting", "powerlifting", "crossfit", "hiit", "bootcamp", "cardio", "running", "jogging", "cycling", "rowing", "swimming", "yoga", "pilates", "barre", "qigong", "meditation", "breathwork", "stretching", "zumba", "jazzercise", "boxing", "kickboxing", "judo", "karate", "taekwondo", "mma", "wrestling", "hiking", "bouldering", "kayaking", "paddleboarding", "diving", "cryotherapy", "sauna", "wellness"]
        if fitnessPhrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: fitnessTokens) { return "fitness" }

        let shoppingPhrases = ["party supplies", "gift wrap", "wedding supplies", "personalized gift", "personalized gifts", "gift basket", "gift baskets", "greeting card", "greeting cards", "seasonal gift", "seasonal gifts", "designer fashion", "luxury watch", "luxury watches", "fine jewelry", "luxury beauty", "premium home decor", "collectible art", "eco friendly", "handmade goods", "fair trade", "vintage item", "vintage items", "antique item", "antique items", "refurbished product", "refurbished products", "local product", "local products", "department store", "department stores", "discount store", "discount stores", "outlet store", "outlet stores", "warehouse club", "warehouse clubs", "convenience store", "convenience stores", "specialty store", "specialty stores", "shopping mall", "shopping malls", "boutique shop", "boutique shops", "online marketplace", "online marketplaces", "pop up shop", "pop up shops"]
        let shoppingTokens: Set<String> = ["shopping", "shop", "shops", "store", "stores", "mall", "malls", "marketplace", "marketplaces", "retail", "supplies", "balloons", "decorations", "costumes", "invitations", "gifts", "flowers", "souvenirs", "fashion", "watches", "jewelry", "beauty", "decor", "luxury", "handmade", "vintage", "antique", "refurbished", "outlet", "boutique", "department", "discount", "warehouse", "convenience", "supermarket", "supermarkets", "hypermarket", "hypermarkets"]
        if shoppingPhrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: shoppingTokens) { return "shopping" }

        let eventPhrases = ["music festival", "comedy show", "theater play", "theatre play", "movie screening", "outdoor cinema", "talent show", "open mic", "karaoke event", "club night", "dj set", "pool party", "beach party", "rooftop party", "yacht party", "house party", "silent disco", "after party", "cocktail event", "happy hour", "bar crawl", "singles mixer", "professional sports", "amateur sports", "golf tournament", "boxing event", "mma event", "yoga class", "fitness bootcamp", "adventure race", "trade show", "networking event", "business summit", "product launch", "investor meeting", "career fair", "job fair", "startup pitch", "industry forum", "award ceremony", "training session", "certification program", "panel discussion", "book talk", "science fair", "educational camp", "language exchange", "coding bootcamp", "art exhibition", "museum event", "gallery opening", "cultural festival", "heritage celebration", "craft fair", "poetry reading", "literary festival", "book signing", "film festival", "fashion show", "photography exhibition", "food festival", "wine tasting", "beer festival", "whiskey tasting", "cocktail tasting", "cooking class", "food truck festival", "farmers market", "brunch event", "bbq competition", "dessert festival", "community festival", "neighborhood gathering", "charity event", "volunteer activity", "family reunion", "community market", "town hall", "children festival", "kids workshop", "story time", "family fun day", "petting zoo", "science activity", "holiday celebration", "character meet", "carnival event", "christmas event", "halloween event", "thanksgiving celebration", "new year", "independence day", "valentine", "st patrick", "lunar new year", "diwali", "hanukkah", "ramadan", "eid", "pride celebration", "health fair", "meditation session", "wellness retreat", "spa event", "mental health workshop", "nutrition seminar", "fitness challenge", "blood drive", "worship service", "prayer meeting", "religious festival", "tech conference", "lan party", "gaming tournament", "esports competition", "vr experience", "robotics competition", "product demo", "car show", "motorcycle rally", "racing event", "auto expo", "classic car meet", "off road event", "hiking trip", "camping event", "fishing tournament", "nature walk", "rock climbing", "bird watching", "eco tour", "flea market", "artisan market", "craft market", "antique show", "holiday market", "vendor fair", "engagement party", "bridal shower", "baby shower", "gender reveal", "birthday party", "anniversary celebration", "graduation party", "retirement party", "campaign event", "public hearing", "civic meeting", "voter registration", "virtual conference", "online workshop", "live stream", "virtual meetup", "online class", "virtual networking", "hybrid conference", "anime convention", "comic convention", "fan meetup", "collector show", "hobby club", "pet show", "home garden show", "boat show", "rv show", "maker faire", "cosplay event"]
        let eventTokens: Set<String> = ["event", "events", "concert", "concerts", "festival", "festivals", "show", "shows", "play", "plays", "musical", "musicals", "opera", "ballet", "circus", "screening", "screenings", "performance", "performances", "tournament", "tournaments", "marathon", "marathons", "triathlon", "triathlons", "conference", "conferences", "seminar", "seminars", "workshop", "workshops", "summit", "summits", "expo", "expos", "webinar", "webinars", "lecture", "lectures", "class", "classes", "training", "panel", "fair", "fairs", "exhibition", "exhibitions", "opening", "openings", "celebration", "celebrations", "fundraiser", "fundraisers", "meetup", "meetups", "retreat", "retreats", "hackathon", "hackathons", "rally", "rallies", "race", "races", "tour", "tours", "wedding", "weddings", "quinceanera", "quinceañera", "mitzvah", "debate", "debates", "convention", "conventions", "cosplay", "ticketed", "recurring", "virtual", "hybrid"]
        if eventPhrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: eventTokens) { return "entertainment" }

        let diningTokens: Set<String> = ["restaurant", "restaurants", "food", "dining", "diner", "bistro", "brasserie", "buffet", "cafeteria", "qsr", "kitchen", "vendor", "bakery", "patisserie", "dessert", "creamery", "juice", "smoothie", "american", "southern", "cajun", "creole", "bbq", "mexican", "tex", "mex", "caribbean", "italian", "french", "spanish", "portuguese", "greek", "mediterranean", "turkish", "lebanese", "israeli", "indian", "pakistani", "bangladeshi", "nepalese", "chinese", "japanese", "korean", "thai", "vietnamese", "filipino", "malaysian", "indonesian", "singaporean", "taiwanese", "mongolian", "african", "ethiopian", "moroccan", "nigerian", "brazilian", "peruvian", "argentine", "hawaiian", "fusion", "international", "seafood", "steakhouse", "sushi", "ramen", "noodle", "pizza", "burger", "sandwich", "deli", "chicken", "wings", "taco", "tacos", "burrito", "burritos", "hotdog", "hotdogs", "breakfast", "brunch", "pancake", "creperie", "salad", "soup", "vegan", "vegetarian", "organic", "halal", "kosher", "takeout", "delivery", "catering", "lunch", "dinner", "snacks"]
        if !tokens.isDisjoint(with: diningTokens) { return "dining" }

        let phrases = ["after hours", "after dark", "open late", "live entertainment", "open mic", "night market", "beach party", "house party", "yacht party", "private club", "thermal bath", "holiday light", "ice rink", "outdoor concert", "street festival", "music festival", "mini golf", "entertainment complex", "entertainment center"]
        let nightlifeTokens: Set<String> = ["nightlife", "night", "nightclub", "nightclubs", "pub", "pubs", "club", "clubs", "lounge", "lounges", "cocktail", "cocktails", "strip", "adult", "gentlemen", "speakeasy", "tavern", "brewery", "wine", "whiskey", "beer", "rooftop", "edm", "hip", "hop", "latin", "lgbtq", "dance", "salsa", "bachata", "swing", "ballroom", "music", "concert", "concerts", "jazz", "blues", "rock", "comedy", "improv", "karaoke", "casino", "casinos", "gaming", "poker", "cabaret", "burlesque", "theater", "theaters", "theatre", "theatres", "musical", "musicals", "museum", "museums", "gallery", "galleries", "festival", "festivals", "arcade", "arcades", "vr", "esports", "bowling", "billiards", "trivia", "escape", "axe", "hookah", "shisha", "cigar"]
        if phrases.contains(where: { text.contains($0) }) || !tokens.isDisjoint(with: nightlifeTokens) { return "nightlife" }
        if tokens.contains("bar") || tokens.contains("bars") { return "nightlife" }
        if tokens.contains("parking") || tokens.contains("garage") { return "parking" }
        if tokens.contains("shopping") || tokens.contains("shop") || tokens.contains("shops") || tokens.contains("store") || tokens.contains("mall") || tokens.contains("market") { return "shopping" }
        if tokens.contains("event") || tokens.contains("events") || tokens.contains("stadium") { return "entertainment" }
        if tokens.contains("gym") || tokens.contains("fitness") || tokens.contains("wellness") { return "fitness" }
        if tokens.contains("park") || tokens.contains("parks") { return "venue" }
        if tokens.contains("mobility") || tokens.contains("transfer") || tokens.contains("ride") || tokens.contains("transport") { return "mobility" }
        if tokens.contains("service") || tokens.contains("services") { return "service" }
        if text.contains("boutique apartment") || text.contains("boutique stay") || text.contains("private suite") { return "boutique_apartment" }
        return rawType.isEmpty ? "venue" : rawType
    }
}

struct NativeVenueSummary: Identifiable, Equatable {
    let id: String
    let name: String
    let category: String
    let address: String
    let distance: String
    let rating: Double?
    let latitude: Double
    let longitude: Double
    let crowd: NativeCrowdSummary?
    let parking: NativeParkingSummary
    let verifiedPatchId: String?
    let imageUrl: URL?

    var discoverType: String {
        NativeDiscoverCategoryNormalizer.type(for: category)
    }

    var hasKnownCoordinates: Bool {
        Self.hasValidMapCoordinate(latitude: latitude, longitude: longitude)
    }

    static func hasValidMapCoordinate(latitude: Double, longitude: Double) -> Bool {
        latitude.isFinite && longitude.isFinite
            && (-90...90).contains(latitude)
            && (-180...180).contains(longitude)
            && (latitude != 0 || longitude != 0)
    }
}

struct NativeDiscoverSummary: Identifiable, Equatable {
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
    let control: String
    let latitude: Double?
    let longitude: Double?

    init(id: String, type: String, title: String, subtitle: String, distance: String, rating: String, icon: String, verified: Bool, entryType: String, cta: String, imageUrl: URL?, categoryLabel: String, badgeText: String, metadataLine: String, features: [String], vibeScore: Int, availability: String, membershipRequired: Bool, control: String = NativeDiscoverCardControl.local, latitude: Double? = nil, longitude: Double? = nil) {
        self.id = id
        self.type = type
        self.title = title
        self.subtitle = subtitle
        self.distance = distance
        self.rating = rating
        self.icon = icon
        self.verified = verified
        self.entryType = entryType
        self.cta = cta
        self.imageUrl = imageUrl
        self.categoryLabel = categoryLabel
        self.badgeText = badgeText
        self.metadataLine = metadataLine
        self.features = features
        self.vibeScore = vibeScore
        self.availability = availability
        self.membershipRequired = membershipRequired
        self.control = control
        self.latitude = latitude
        self.longitude = longitude
    }

    var hasKnownCoordinates: Bool {
        guard let latitude, let longitude else { return false }
        return NativeVenueSummary.hasValidMapCoordinate(latitude: latitude, longitude: longitude)
    }
}

/// Controlled-vendor gate for the Discover card contract. A card or venue is
/// Bytspot-controlled (Mode B: menus, booking, checkout chrome) only when it
/// is a canonical Bytspot vendor or carries a real hardware patch. The
/// "DISCOVER-VERIFIED" pseudo-badge and every Google/Apple/Ticketmaster,
/// coverage-clone, or curated card stays local (Mode A: details + route only).
enum NativeDiscoverCardControl {
    static let local = "local"
    static let vendor = "vendor"

    /// Canonical Bytspot-controlled listings shipped in the binary.
    static let controlledCardIDs: Set<String> = ["broni-home-taste", "gh-akwaaba-pass", "service-valet-ride", "group-transport", "broni"]

    static func isControlled(cardID: String) -> Bool { controlledCardIDs.contains(cardID) }

    static func isControlled(venue: NativeVenueSummary) -> Bool {
        if controlledCardIDs.contains(venue.id) { return true }
        guard let patch = venue.verifiedPatchId?.trimmingCharacters(in: .whitespacesAndNewlines), !patch.isEmpty else { return false }
        return patch.uppercased() != "DISCOVER-VERIFIED"
    }
}

struct NativeLocationCoordinate: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let isFallback: Bool

    static let midtown = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: true)
    static let verifiedMidtown = NativeLocationCoordinate(latitude: 33.7866, longitude: -84.3833, isFallback: false)

    var displayName: String { isFallback ? "your area" : "your location" }
    var shortLabel: String { "Near you" }

    func apiPoint() -> [String: Any] { ["lat": latitude, "lng": longitude] }

    func distanceLabel(toLatitude targetLat: Double?, longitude targetLng: Double?) -> String? {
        guard let miles = distanceMiles(toLatitude: targetLat, longitude: targetLng) else { return nil }
        if miles < 0.12 { return "Here" }
        if miles < 10 { return String(format: "%.1f mi", miles) }
        return String(format: "%.0f mi", miles)
    }

    func distanceMiles(toLatitude targetLat: Double?, longitude targetLng: Double?) -> Double? {
        guard let targetLat, let targetLng else { return nil }
        return Self.haversineMiles(fromLat: latitude, lng: longitude, toLat: targetLat, lng: targetLng)
    }

    private static func haversineMiles(fromLat: Double, lng fromLng: Double, toLat: Double, lng toLng: Double) -> Double {
        let radiusMiles = 3958.7613
        let lat1 = fromLat * .pi / 180
        let lat2 = toLat * .pi / 180
        let dLat = (toLat - fromLat) * .pi / 180
        let dLng = (toLng - fromLng) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2)
        return radiusMiles * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}

struct NativeLiveValueOption: Identifiable, Equatable {
    let id: String
    let productType: String
    let title: String
    let providerName: String
    let source: String
    let estimatedTotalCents: Int?
    let marketReferenceCents: Int?
    let distanceMeters: Double?
    let availability: String
    let priceParityScore: Int
    let valueScore: Int
    let eligible: Bool
    let explanation: [String]
}

struct NativeWeatherSnapshot: Equatable {
    enum Source: String { case live, cached, fallback }
    let temperatureF: Int
    let feelsLikeF: Int
    let humidity: Int
    let windMph: Int
    let precipitationIn: Double
    let weatherCode: Int
    let isDay: Bool
    let updatedAt: Date
    let source: Source

    static let fallback = NativeWeatherSnapshot(temperatureF: 72, feelsLikeF: 72, humidity: 58, windMph: 6, precipitationIn: 0, weatherCode: 1, isDay: true, updatedAt: Date(timeIntervalSince1970: 0), source: .fallback)

    var conditionLabel: String {
        if weatherCode == 0 { return "Clear" }
        if [1, 2].contains(weatherCode) { return "Partly cloudy" }
        if weatherCode == 3 { return "Cloudy" }
        if [45, 48].contains(weatherCode) { return "Foggy" }
        if (51...67).contains(weatherCode) || (80...82).contains(weatherCode) { return "Rain nearby" }
        if (71...77).contains(weatherCode) || (85...86).contains(weatherCode) { return "Snowy" }
        if weatherCode >= 95 { return "Storm watch" }
        return "Updated"
    }

    var emoji: String {
        if weatherCode >= 95 { return "⛈️" }
        if (51...67).contains(weatherCode) || weatherCode >= 80 { return "🌧️" }
        if (45...48).contains(weatherCode) { return "🌫️" }
        if weatherCode >= 3 { return "☁️" }
        return isDay ? "☀️" : "🌙"
    }

    var parkingTip: String {
        let wet = precipitationIn > 0 || weatherCode >= 51
        if weatherCode >= 95 { return "Storms possible — prioritize valet or covered parking." }
        if wet { return "Rain in the mix — look for covered parking and shorter walks." }
        if temperatureF >= 88 { return "Hot out — choose shaded parking and quick indoor stops." }
        if temperatureF <= 42 { return "Cold conditions — keep walks short and routes direct." }
        if windMph >= 18 { return "Windy right now — secure light gear before you park." }
        return "Good conditions for parking, walking, and exploring nearby."
    }
}

struct NativePlaceSearchResult: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let category: String
    let latitude: Double?
    let longitude: Double?
    let rating: Double?
    let photoUrl: URL?
    let provider: String
}

struct NativeNavigationEstimate: Equatable {
    let distanceText: String
    let durationText: String
    let provider: String
}

struct NativeLiveDiscoveryAPI {
    let client: BytspotAPIClient
    let urlSession: URLSession = .shared

    func weather(lat: Double = 33.7866, lng: Double = -84.3833) async throws -> NativeWeatherSnapshot {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        components.queryItems = [
            URLQueryItem(name: "latitude", value: String(lat)),
            URLQueryItem(name: "longitude", value: String(lng)),
            URLQueryItem(name: "current", value: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day"),
            URLQueryItem(name: "temperature_unit", value: "fahrenheit"),
            URLQueryItem(name: "wind_speed_unit", value: "mph"),
            URLQueryItem(name: "precipitation_unit", value: "inch"),
            URLQueryItem(name: "timezone", value: "auto")
        ]
        guard let url = components.url else { throw BytspotAPIClient.APIError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 6
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw BytspotAPIClient.APIError.invalidResponse }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any], let current = root["current"] as? [String: Any] else { throw BytspotAPIClient.APIError.invalidResponse }
        return try Self.weatherSnapshot(from: current)
    }

    static func weatherSnapshot(from current: [String: Any], updatedAt: Date = Date()) throws -> NativeWeatherSnapshot {
        guard let temperature = Self.double(current["temperature_2m"]), temperature.isFinite,
              let apparentTemperature = Self.double(current["apparent_temperature"]), apparentTemperature.isFinite,
              let humidity = Self.double(current["relative_humidity_2m"]), humidity.isFinite,
              let precipitation = Self.double(current["precipitation"]), precipitation.isFinite,
              let weatherCode = Self.double(current["weather_code"]), weatherCode.isFinite,
              let windSpeed = Self.double(current["wind_speed_10m"]), windSpeed.isFinite,
              let isDay = Self.double(current["is_day"]), isDay.isFinite else {
            throw BytspotAPIClient.APIError.invalidResponse
        }
        return NativeWeatherSnapshot(
            temperatureF: Int(temperature.rounded()),
            feelsLikeF: Int(apparentTemperature.rounded()),
            humidity: Int(humidity.rounded()),
            windMph: Int(windSpeed.rounded()),
            precipitationIn: precipitation,
            weatherCode: Int(weatherCode.rounded()),
            isDay: isDay != 0,
            updatedAt: updatedAt,
            source: .live
        )
    }

    func placesTextSearch(query: String, lat: Double = 33.7866, lng: Double = -84.3833, maxResults: Int = 10) async throws -> [NativePlaceSearchResult] {
        let payload = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.placesTextSearchRoute, input: ["query": query, "lat": lat, "lng": lng, "maxResults": maxResults])
        let places = Self.placeRows(from: payload).enumerated().compactMap(Self.placeResult)
        return Self.validatedLocalPlaces(places, origin: NativeLocationCoordinate(latitude: lat, longitude: lng, isFallback: false))
    }

    func placesNearbySearch(type: String?, lat: Double = 33.7866, lng: Double = -84.3833, maxResults: Int = 10) async throws -> [NativePlaceSearchResult] {
        var input: [String: Any] = ["lat": lat, "lng": lng, "maxResults": maxResults]
        if let type, !type.isEmpty { input["type"] = type }
        let payload = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.placesNearbySearchRoute, input: input)
        let places = Self.placeRows(from: payload).enumerated().compactMap(Self.placeResult)
        return Self.validatedLocalPlaces(places, origin: NativeLocationCoordinate(latitude: lat, longitude: lng, isFallback: false))
    }

    func localNightlifeSearch(location: NativeLocationCoordinate, maxResults: Int = 12) async throws -> [NativePlaceSearchResult] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = "bars nightclubs live music"
        request.resultTypes = .pointOfInterest
        request.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: location.latitude, longitude: location.longitude),
            span: MKCoordinateSpan(latitudeDelta: 0.65, longitudeDelta: 0.65)
        )
        let response = try await MKLocalSearch(request: request).start()
        return response.mapItems.compactMap { item in
            let coordinate = item.placemark.coordinate
            guard location.distanceMiles(toLatitude: coordinate.latitude, longitude: coordinate.longitude).map({ $0 <= NativeTabContentStore.nightlifeRadiusMiles }) == true else { return nil }
            let name = item.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !name.isEmpty else { return nil }
            return NativePlaceSearchResult(
                id: "apple-\(name.lowercased())-\(coordinate.latitude)-\(coordinate.longitude)",
                name: name,
                address: item.placemark.title ?? "Nearby",
                category: "nightlife",
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                rating: nil,
                photoUrl: nil,
                provider: "apple_maps"
            )
        }.prefix(maxResults).map { $0 }
    }

    func localTravelEstimate(origin: NativeLocationCoordinate, destinationLat: Double?, destinationLng: Double?) -> NativeNavigationEstimate? {
        guard let distance = origin.distanceMiles(toLatitude: destinationLat, longitude: destinationLng) else { return nil }
        let minutes = max(2, Int((distance / 18.0 * 60.0).rounded()))
        let distanceText = distance < 10 ? String(format: "%.1f mi", distance) : String(format: "%.0f mi", distance)
        return NativeNavigationEstimate(distanceText: distanceText, durationText: "~\(minutes) min", provider: "local_distance")
    }

    static func validatedLocalPlaces(_ places: [NativePlaceSearchResult], origin: NativeLocationCoordinate) -> [NativePlaceSearchResult] {
        places.filter { place in
            guard let latitude = place.latitude, let longitude = place.longitude,
                  latitude.isFinite, longitude.isFinite,
                  (-90...90).contains(latitude), (-180...180).contains(longitude),
                  !(latitude == 0 && longitude == 0),
                  let miles = origin.distanceMiles(toLatitude: latitude, longitude: longitude),
                  miles.isFinite, miles <= NativeTabContentStore.localVenueRadiusMiles else { return false }
            return true
        }
    }

    private static func placeRows(from value: Any) -> [Any] {
        if let array = value as? [Any] { return array }
        guard let dict = value as? [String: Any] else { return [] }
        if let places = dict["places"] as? [Any] { return places }
        if let results = dict["results"] as? [Any] { return results }
        return []
    }

    static func placeResult(_ pair: EnumeratedSequence<[Any]>.Element) -> NativePlaceSearchResult? {
        let (index, value) = pair
        guard let item = value as? [String: Any] else { return nil }
        let location = item["location"] as? [String: Any]
        let geometry = item["geometry"] as? [String: Any]
        let geoLocation = geometry?["location"] as? [String: Any]
        return NativePlaceSearchResult(
            id: string(item["id"]) ?? string(item["placeId"]) ?? string(item["place_id"]) ?? "place-\(index)",
            name: string(item["name"]) ?? string(item["title"]) ?? "Nearby place",
            address: string(item["address"]) ?? string(item["formattedAddress"]) ?? string(item["formatted_address"]) ?? "Address unavailable",
            category: string(item["category"]) ?? string(item["type"]) ?? "venue",
            latitude: double(item["lat"]) ?? double(item["latitude"]) ?? double(location?["lat"]) ?? double(geoLocation?["lat"]),
            longitude: double(item["lng"]) ?? double(item["longitude"]) ?? double(location?["lng"]) ?? double(geoLocation?["lng"]),
            rating: double(item["rating"]),
            photoUrl: string(item["photoUrl"]).flatMap(URL.init(string:)) ?? string(item["imageUrl"]).flatMap(URL.init(string:)),
            provider: string(item["provider"]) ?? "google_places"
        )
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func double(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? String { return Double(value) }
        return nil
    }
}

struct NativeEventSummary: Identifiable, Equatable {
    let id: String
    let title: String
    let venue: String
    let time: String
    let price: String
    let emoji: String
    let imageUrl: URL?
    let category: String
    /// Optional verified destination data. Event labels alone are never used to
    /// infer a Map route because a venue name can be ambiguous.
    let address: String?
    let latitude: Double?
    let longitude: Double?

    init(id: String, title: String, venue: String, time: String, price: String, emoji: String, imageUrl: URL?, category: String = "event", address: String? = nil, latitude: Double? = nil, longitude: Double? = nil) {
        self.id = id
        self.title = title
        self.venue = venue
        self.time = time
        self.price = price
        self.emoji = emoji
        self.imageUrl = imageUrl
        self.category = category
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
    }

    var hasKnownCoordinates: Bool {
        guard let latitude, let longitude else { return false }
        return NativeVenueSummary.hasValidMapCoordinate(latitude: latitude, longitude: longitude)
    }
}

struct NativeTabContentSnapshot: Equatable {
    enum Source: String { case fallback, live, mixed }
    let venues: [NativeVenueSummary]
    let discoverCards: [NativeDiscoverSummary]
    let events: [NativeEventSummary]
    let source: Source
    let lastUpdated: Date?
    let errorMessage: String?
    var bestValueOptions: [NativeLiveValueOption] = []
    var hasLiveVenueInventory = false
    var hasLiveEventInventory = false

    var trustworthyLiveVenues: [NativeVenueSummary] {
        guard hasLiveVenueInventory, source != .fallback, errorMessage == nil else { return [] }
        return venues.filter { !Self.isFallbackVenueFixture($0) }
    }

    var hasTrustworthyLiveVenueInventory: Bool {
        !trustworthyLiveVenues.isEmpty
    }

    var trustworthyLiveEvents: [NativeEventSummary] {
        guard hasLiveEventInventory, source != .fallback, errorMessage == nil else { return [] }
        return events.filter { !Self.isFallbackEventFixture($0) }
    }

    var hasTrustworthyLiveEventInventory: Bool {
        !trustworthyLiveEvents.isEmpty
    }

    static func isFallbackVenueFixture(_ venue: NativeVenueSummary) -> Bool {
        fallbackVenues.contains { fixture in
            venue.id.caseInsensitiveCompare(fixture.id) == .orderedSame
                || (venue.name.caseInsensitiveCompare(fixture.name) == .orderedSame
                    && abs(venue.latitude - fixture.latitude) < 0.000_001
                    && abs(venue.longitude - fixture.longitude) < 0.000_001)
        }
    }

    static func isFallbackEventFixture(_ event: NativeEventSummary) -> Bool {
        fallbackEvents.contains { fixture in
            event.id.caseInsensitiveCompare(fixture.id) == .orderedSame
                || (event.title.caseInsensitiveCompare(fixture.title) == .orderedSame
                    && event.venue.caseInsensitiveCompare(fixture.venue) == .orderedSame)
        }
    }

    var statusLabel: String {
        switch source {
        case .live: return "LIVE API"
        case .mixed: return "MIXED"
        case .fallback: return "CURATED"
        }
    }
}

@MainActor
final class NativeTabContentStore: ObservableObject {
    @Published private(set) var snapshot = NativeTabContentSnapshot.unresolved
    @Published private(set) var isRefreshing = false
    private var refreshGeneration = 0
    private var snapshotOrigin: NativeLocationCoordinate?
    private var bestValueOrigin: NativeLocationCoordinate?

    func snapshot(for location: NativeLocationCoordinate) -> NativeTabContentSnapshot {
        Self.locationSafeSnapshot(snapshot, origin: snapshotOrigin, bestValueOrigin: bestValueOrigin, current: location)
    }

    func bestValueOptions(for location: NativeLocationCoordinate) -> [NativeLiveValueOption] {
        snapshot(for: location).bestValueOptions
    }

    func invalidateLocationScopedContent(for location: NativeLocationCoordinate) {
        refreshGeneration += 1
        isRefreshing = false
        guard Self.canPresentLocationScopedContent(origin: snapshotOrigin, current: location) else {
            snapshotOrigin = nil
            bestValueOrigin = nil
            snapshot = .unresolved
            return
        }
        guard Self.canPresentLocationScopedContent(origin: bestValueOrigin, current: location) else {
            bestValueOrigin = nil
            snapshot = Self.removingLocationScopedContent(from: snapshot)
            return
        }
    }

    func refresh(sessionStore: BytspotSessionStore, location: NativeLocationCoordinate = .midtown) async {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        invalidateLocationScopedContent(for: location)
        let generation = refreshGeneration
        isRefreshing = true
        defer { if generation == refreshGeneration { isRefreshing = false } }
        guard !location.isFallback else {
            snapshotOrigin = nil
            bestValueOrigin = nil
            snapshot = .unresolved
            return
        }

        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            if let bootstrapSnapshot = try? await fetchBootstrap(client: client) {
                async let liveEvents = fetchEvents(client: client, location: location)
                async let vendorServices = fetchVendorServices(client: client)
                async let placeDiscoveryCards = fetchPlaceDiscoveryCards(client: client, location: location)
                let valueOptions = Self.localValueOptions((try? await fetchBestValue(client: client, location: location)) ?? [])
                let localized = Self.locationAwareSnapshot(bootstrapSnapshot, location: location)
                let nearbyEvents = (try? await liveEvents) ?? []
                let events = nearbyEvents.isEmpty ? localized.trustworthyLiveEvents : nearbyEvents
                let services = (try? await vendorServices) ?? []
                let places = (try? await placeDiscoveryCards) ?? []
                let trustedVenues = localized.trustworthyLiveVenues
                let cards = Self.liveDiscoverCards(apiCards: localized.discoverCards, venues: trustedVenues, events: events, services: services, placeCards: places, valueOptions: valueOptions, location: location)
                let hasLiveInputs = localized.source != .fallback || !events.isEmpty || !services.isEmpty || !places.isEmpty || !valueOptions.isEmpty
                guard generation == refreshGeneration else { return }
                snapshotOrigin = location
                bestValueOrigin = valueOptions.isEmpty ? nil : location
                snapshot = NativeTabContentSnapshot(venues: trustedVenues, discoverCards: cards, events: Self.visibleEvents(events, location: location), source: Self.source(forVisibleDeck: cards, hasLiveInputs: hasLiveInputs), lastUpdated: localized.lastUpdated, errorMessage: localized.errorMessage, bestValueOptions: valueOptions, hasLiveVenueInventory: !trustedVenues.isEmpty, hasLiveEventInventory: !events.isEmpty)
                return
            }

            async let venues = fetchVenues(client: client)
            async let events = fetchEvents(client: client, location: location)
            async let vendorServices = fetchVendorServices(client: client)
            async let placeDiscoveryCards = fetchPlaceDiscoveryCards(client: client, location: location)
            async let bestValue = fetchBestValue(client: client, location: location)
            let liveVenues = Self.locationAwareVenues(try await venues, location: location).filter { !NativeTabContentSnapshot.isFallbackVenueFixture($0) }
            let liveServices = (try? await vendorServices) ?? []
            let livePlaceCards = (try? await placeDiscoveryCards) ?? []
            let liveEvents = (try? await events) ?? []
            let valueOptions = Self.localValueOptions((try? await bestValue) ?? [])
            let cards = Self.liveDiscoverCards(apiCards: [], venues: liveVenues, events: liveEvents, services: liveServices, placeCards: livePlaceCards, valueOptions: valueOptions, location: location)
            guard generation == refreshGeneration else { return }
            snapshotOrigin = location
            bestValueOrigin = valueOptions.isEmpty ? nil : location
            snapshot = NativeTabContentSnapshot(
                venues: liveVenues,
                discoverCards: cards,
                events: Self.visibleEvents(liveEvents, location: location),
                source: Self.source(forVisibleDeck: cards, hasLiveInputs: !liveVenues.isEmpty || !liveServices.isEmpty || !livePlaceCards.isEmpty || !liveEvents.isEmpty || !valueOptions.isEmpty),
                lastUpdated: Date(),
                errorMessage: nil,
                bestValueOptions: valueOptions,
                hasLiveVenueInventory: !liveVenues.isEmpty,
                hasLiveEventInventory: !liveEvents.isEmpty
            )
        } catch {
            guard generation == refreshGeneration else { return }
            snapshotOrigin = location
            bestValueOrigin = nil
            let fallback = Self.locationAwareSnapshot(.fallback, location: location)
            snapshot = NativeTabContentSnapshot(venues: [], discoverCards: fallback.discoverCards, events: Self.visibleEvents([], location: location), source: .fallback, lastUpdated: Date(), errorMessage: "Fresh picks aren't available right now. Showing saved suggestions.")
        }
    }

    private func fetchBootstrap(client: BytspotAPIClient) async throws -> NativeTabContentSnapshot? {
        let payload = BytspotAPIClient.unwrapTRPCData(try await client.json(path: "/trpc/native.bootstrap"))
        let root = payload as? [String: Any]
        let content = root?["content"] as? [String: Any] ?? root ?? [:]
        let venueRows: [Any] = Self.findArray(named: "venues", in: content) ?? []
        let cardRows: [Any] = Self.findArray(named: "discoverCards", in: content) ?? []
        let eventRows: [Any] = Self.findArray(named: "events", in: content) ?? []
        let venues = venueRows.compactMap(Self.venue(from:))
        let cards: [NativeDiscoverSummary] = cardRows.enumerated().compactMap { index, value in
            guard let item = value as? [String: Any] else { return nil }
            return Self.discoverCard(from: item, index: index)
        }
        let events: [NativeEventSummary] = eventRows.enumerated().compactMap(Self.event(from:))
        guard !venues.isEmpty || !cards.isEmpty || !events.isEmpty else { return nil }

        let freshness = root?["freshness"] as? [String: Any]
        let sourceRaw = Self.string(content, ["source"]) ?? Self.string(freshness, ["publicContentSource"])
        let source = NativeTabContentSnapshot.Source(rawValue: sourceRaw ?? "") ?? (venues.isEmpty && cards.isEmpty && events.isEmpty ? .fallback : .live)
        let hasExplicitLiveVenueInventory = Self.bool(content, ["hasLiveVenueInventory"])
            ?? Self.bool(freshness, ["hasLiveVenueInventory"])
            ?? false
        let hasExplicitLiveEventInventory = Self.bool(content, ["hasLiveEventInventory"])
            ?? Self.bool(freshness, ["hasLiveEventInventory"])
            ?? false
        return NativeTabContentSnapshot(
            venues: venues,
            discoverCards: cards,
            events: events,
            source: source,
            lastUpdated: Self.date(root, ["generatedAt"]) ?? Date(),
            errorMessage: nil,
            hasLiveVenueInventory: hasExplicitLiveVenueInventory && source != .fallback && !venues.isEmpty,
            hasLiveEventInventory: hasExplicitLiveEventInventory && source != .fallback && !events.isEmpty
        )
    }

    private func fetchVendorServices(client: BytspotAPIClient) async throws -> [NativeDiscoverSummary] {
        let input = try JSONSerialization.data(withJSONObject: ["limit": 20, "tier": "platinum"])
        var components = URLComponents(string: "/trpc/vendors.search")!
        components.queryItems = [URLQueryItem(name: "input", value: String(data: input, encoding: .utf8))]
        let payload = try await client.json(path: components.string ?? "/trpc/vendors.search")
        guard let rows = Self.findArray(named: "services", in: payload) ?? Self.findArray(named: "vendors", in: payload) else { return [] }
        return rows.enumerated().compactMap { index, value in
            guard let item = value as? [String: Any] else { return nil }
            return Self.serviceCard(from: item, index: index)
        }
    }

    private func fetchVenues(client: BytspotAPIClient) async throws -> [NativeVenueSummary] {
        let payload = try await client.json(path: "/trpc/venues.list")
        guard let rows = Self.findArray(named: "venues", in: payload) else { return [] }
        return rows.compactMap(Self.venue(from:))
    }

    private func fetchEvents(client: BytspotAPIClient, location: NativeLocationCoordinate) async throws -> [NativeEventSummary] {
        guard Self.canUseCurrentEventFeed(at: location) else { return [] }
        let payload = try await client.trpcQueryPayload(path: NativeLiveContentV2Contract.eventsListRoute, input: Self.eventQueryInput(location: location))
        guard let rows = Self.findArray(named: "events", in: payload) else { return [] }
        return rows.enumerated().compactMap(Self.event(from:))
    }

    nonisolated static let nightlifeRadiusMiles = 30.0
    nonisolated static let localVenueRadiusMiles = 30.0
    nonisolated static let locationScopedContentOriginToleranceMiles = 1.0

    nonisolated static func canPresentLocationScopedContent(origin: NativeLocationCoordinate?, current: NativeLocationCoordinate) -> Bool {
        guard let origin, !origin.isFallback, !current.isFallback else { return false }
        return current.distanceMiles(toLatitude: origin.latitude, longitude: origin.longitude)
            .map { $0 <= locationScopedContentOriginToleranceMiles } ?? false
    }

    static func locationSafeSnapshot(_ snapshot: NativeTabContentSnapshot, origin: NativeLocationCoordinate?, bestValueOrigin: NativeLocationCoordinate?, current: NativeLocationCoordinate) -> NativeTabContentSnapshot {
        guard canPresentLocationScopedContent(origin: origin, current: current) else { return .unresolved }
        return canPresentLocationScopedContent(origin: bestValueOrigin, current: current)
            ? snapshot
            : removingLocationScopedContent(from: snapshot)
    }

    static func removingLocationScopedContent(from snapshot: NativeTabContentSnapshot) -> NativeTabContentSnapshot {
        let cards = snapshot.discoverCards.filter {
            !$0.id.hasPrefix("best-value-") && !$0.badgeText.localizedCaseInsensitiveContains("BEST VALUE")
        }
        guard cards.count != snapshot.discoverCards.count || !snapshot.bestValueOptions.isEmpty else { return snapshot }
        return NativeTabContentSnapshot(venues: snapshot.venues, discoverCards: cards, events: snapshot.events, source: source(forVisibleDeck: cards, hasLiveInputs: false), lastUpdated: snapshot.lastUpdated, errorMessage: snapshot.errorMessage, hasLiveVenueInventory: snapshot.hasLiveVenueInventory, hasLiveEventInventory: snapshot.hasLiveEventInventory)
    }

    nonisolated static func localValueOptions(_ options: [NativeLiveValueOption]) -> [NativeLiveValueOption] {
        let radiusMeters = localVenueRadiusMiles * 1_609.344
        return options.filter { option in
            guard let distance = option.distanceMeters else { return false }
            return distance.isFinite && distance >= 0 && distance <= radiusMeters
        }
    }

    nonisolated static func eventQueryInput(location: NativeLocationCoordinate) -> [String: Any] {
        [
            "location": ["lat": location.latitude, "lng": location.longitude, "radiusMiles": nightlifeRadiusMiles],
            "providers": [NativeLiveContentV2Contract.ticketmasterProvider, "bytspot_curated"],
            "limit": 30
        ]
    }

    nonisolated static func canUseCurrentEventFeed(at location: NativeLocationCoordinate) -> Bool {
        guard !location.isFallback else { return false }
        return location.distanceMiles(toLatitude: NativeLocationCoordinate.midtown.latitude, longitude: NativeLocationCoordinate.midtown.longitude).map { $0 <= nightlifeRadiusMiles } ?? false
    }

    private func fetchPlaceDiscoveryCards(client: BytspotAPIClient, location: NativeLocationCoordinate) async throws -> [NativeDiscoverSummary] {
        let api = NativeLiveDiscoveryAPI(client: client)
        async let generalRequest = try? api.placesNearbySearch(type: nil, lat: location.latitude, lng: location.longitude, maxResults: 8)
        async let clubsRequest = try? api.placesNearbySearch(type: "night_club", lat: location.latitude, lng: location.longitude, maxResults: 8)
        async let barsRequest = try? api.placesNearbySearch(type: "bar", lat: location.latitude, lng: location.longitude, maxResults: 8)
        async let localNightlifeRequest = try? api.localNightlifeSearch(location: location)
        let (general, clubs, bars, localNightlife) = await (generalRequest, clubsRequest, barsRequest, localNightlifeRequest)
        let generalPlaces: [NativePlaceSearchResult] = general ?? []
        let clubPlaces: [NativePlaceSearchResult] = clubs ?? []
        let barPlaces: [NativePlaceSearchResult] = bars ?? []
        let nightlifePlaces: [NativePlaceSearchResult] = localNightlife ?? []
        let placeSources: [[NativePlaceSearchResult]] = [generalPlaces, clubPlaces, barPlaces, nightlifePlaces]
        var places: [NativePlaceSearchResult] = []
        for source in placeSources {
            for place in source where !places.contains(where: { $0.id == place.id }) {
                places.append(place)
            }
        }
        let localPlaces = NativeLiveDiscoveryAPI.validatedLocalPlaces(places, origin: location)
        var cards: [NativeDiscoverSummary] = []
        for pair in localPlaces.enumerated() {
            let place = pair.element
            let eta = pair.offset < 3 ? api.localTravelEstimate(origin: location, destinationLat: place.latitude, destinationLng: place.longitude) : nil
            if let card = Self.discoverCard(fromPlace: pair, location: location, eta: eta) { cards.append(card) }
        }
        return cards
    }

    private func fetchBestValue(client: BytspotAPIClient, location: NativeLocationCoordinate = .midtown) async throws -> [NativeLiveValueOption] {
        let payload = BytspotAPIClient.unwrapTRPCData(try await client.json(path: Self.bestValueQueryPath(input: Self.bestValueQueryInput(location: location))))
        let root = payload as? [String: Any]
        let rows = (root?["options"] as? [Any]) ?? Self.findArray(named: "options", in: payload) ?? []
        return rows.compactMap(Self.liveValueOption(from:))
    }

    nonisolated static func bestValueQueryInput(location: NativeLocationCoordinate = .midtown) -> [String: Any] {
        ["productType": "any", "lat": location.latitude, "lng": location.longitude, "durationHours": 2, "limit": 4, "strict": false]
    }

    nonisolated static func bestValueQueryPath(input: [String: Any] = bestValueQueryInput()) throws -> String {
        let inputData = try JSONSerialization.data(withJSONObject: input)
        var components = URLComponents()
        components.path = "/trpc/live.bestValue"
        components.queryItems = [URLQueryItem(name: "input", value: String(data: inputData, encoding: .utf8) ?? "")]
        return components.string ?? "/trpc/live.bestValue"
    }

    static func discoverCards(from venues: [NativeVenueSummary], services: [NativeDiscoverSummary] = []) -> [NativeDiscoverSummary] {
        let venueCards = venueDiscoverCards(from: venues)
        let serviceCards = mergeCanonicalDiscoverCards(into: services)
        let combined = Array(serviceCards + venueCards)
        return combined.isEmpty ? NativeTabContentSnapshot.fallback.discoverCards : combined
    }

    static func homeDiscoverCards(venues: [NativeVenueSummary], events: [NativeEventSummary]) -> [NativeDiscoverSummary] {
        var cards: [NativeDiscoverSummary] = []
        appendUnique(venueDiscoverCards(from: venues), to: &cards)
        appendUnique(categoryCompanionCards(from: venues), to: &cards)
        appendUnique(eventDiscoverCards(from: events), to: &cards)
        appendUnique(nightlifeEventDiscoverCards(from: events), to: &cards)
        return cards
    }

    static func liveDiscoverCards(apiCards: [NativeDiscoverSummary], venues: [NativeVenueSummary], events: [NativeEventSummary] = [], services: [NativeDiscoverSummary] = [], placeCards: [NativeDiscoverSummary] = [], valueOptions: [NativeLiveValueOption] = [], location: NativeLocationCoordinate = .midtown) -> [NativeDiscoverSummary] {
        guard !location.isFallback else {
            return locationAwareCards(NativeTabContentSnapshot.unresolved.discoverCards, sourceVenues: [], location: location)
        }
        var merged: [NativeDiscoverSummary] = []
        appendUnique(placeCards, to: &merged)
        appendUnique(apiCards, to: &merged)
        appendUnique(venueDiscoverCards(from: venues), to: &merged)
        appendUnique(categoryCompanionCards(from: venues), to: &merged)
        appendUnique(eventDiscoverCards(from: events), to: &merged)
        appendUnique(nightlifeEventDiscoverCards(from: events), to: &merged)
        appendUnique(services, to: &merged)
        if canUseCurrentEventFeed(at: location) { appendUnique(NativeTabContentSnapshot.specialDiscoverCards, to: &merged) }
        let base = merged.isEmpty ? NativeTabContentSnapshot.fallback.discoverCards : merged
        let complete = mergeBestValueCards(location.isFallback ? [] : valueOptions, into: ensureCategoryCoverage(base))
        return locationAwareCards(complete, sourceVenues: venues, location: location)
    }

    static func source(forVisibleDeck cards: [NativeDiscoverSummary], hasLiveInputs: Bool) -> NativeTabContentSnapshot.Source {
        let curatedIDs = Set((NativeTabContentSnapshot.fallback.discoverCards + NativeTabContentSnapshot.specialDiscoverCards).map(\.id))
        let hasLiveCards = hasLiveInputs || cards.contains { card in
            card.badgeText.localizedCaseInsensitiveContains("LIVE")
                || card.badgeText.localizedCaseInsensitiveContains("APPLE MAPS")
                || card.badgeText.localizedCaseInsensitiveContains("GOOGLE")
                || card.badgeText.localizedCaseInsensitiveContains("BEST VALUE")
        }
        let hasCuratedCards = cards.contains { card in
            card.badgeText.localizedCaseInsensitiveContains("CURATED")
                || card.id.hasPrefix("starter-")
                || curatedIDs.contains(card.id)
        }
        if hasLiveCards && hasCuratedCards { return .mixed }
        if hasLiveCards { return .live }
        return hasCuratedCards || !cards.isEmpty ? .fallback : .fallback
    }

    private static let minimumCategoryFeedCounts = ["dining": 4, "nightlife": 4, "entertainment": 6, "shopping": 3, "parking": 3, "coffee": 3, "fitness": 3, "boutique_apartment": 3, "mobility": 3]

    private static func ensureCategoryCoverage(_ cards: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var covered = cards
        for type in ["dining", "nightlife", "entertainment", "shopping", "parking", "coffee", "fitness", "boutique_apartment", "mobility"] {
            let target = minimumCategoryFeedCounts[type] ?? 2
            var categoryCards = covered.filter { $0.type == type }
            if categoryCards.isEmpty, let starter = categoryStarterCard(type: type, index: 1) {
                appendUnique([starter], to: &covered)
                categoryCards = [starter]
            }
            while categoryCards.count < target, let template = categoryCards.first {
                let next = categoryCoverageCard(from: template, type: type, index: categoryCards.count + 1)
                appendUnique([next], to: &covered)
                categoryCards.append(next)
            }
        }
        return covered
    }

    private static func categoryCoverageCard(from template: NativeDiscoverSummary, type: String, index: Int) -> NativeDiscoverSummary {
        let label = label(for: type)
        let prefixes = ["Best", "Nearby", "For you", "Tonight", "Popular", "Local", "Worth it", "Quick pick"]
        let prefix = prefixes[(index - 1) % prefixes.count]
        let live = template.badgeText.localizedCaseInsensitiveContains("LIVE") || template.metadataLine.localizedCaseInsensitiveContains("API")
        // Coverage clones are synthetic rail filler: never controlled, even when
        // cloned from a vendor card, so they can't inherit menu/booking chrome.
        return NativeDiscoverSummary(id: "coverage-\(type)-\(index)-\(template.id)", type: type, title: "\(prefix) \(label): \(template.title)", subtitle: template.subtitle, distance: template.distance, rating: template.rating, icon: icon(for: type), verified: template.verified, entryType: template.entryType, cta: template.cta, imageUrl: template.imageUrl, categoryLabel: label, badgeText: live ? "LIVE API" : "CURATED", metadataLine: template.metadataLine, features: Array(([label, live ? "API powered" : "Starter pick"] + template.features).prefix(4)), vibeScore: min(10, template.vibeScore + 1), availability: template.availability, membershipRequired: template.membershipRequired, control: NativeDiscoverCardControl.local, latitude: template.latitude, longitude: template.longitude)
    }

    private static func categoryStarterCard(type: String, index: Int) -> NativeDiscoverSummary? {
        if let existing = (NativeTabContentSnapshot.fallback.discoverCards + NativeTabContentSnapshot.specialDiscoverCards).first(where: { $0.type == type }) {
            return existing
        }
        let label = label(for: type)
        let copy: (title: String, subtitle: String, cta: String) = {
            switch type {
            case "shopping": return ("Shopping Around You", "Markets, gifts, fashion, boutiques, and local retail picks.", "Explore Shops")
            case "mobility": return ("Mobility Options Nearby", "Transfers, rides, charters, rentals, and group movement options.", "Request")
            case "boutique_apartment": return ("Boutique Stay Nearby", "Short stays, retreats, resorts, and unique lodging options.", "View Stay")
            default: return ("\(label) Nearby", "Starter picks while live inventory grows around you.", "Explore")
            }
        }()
        return NativeDiscoverSummary(id: "starter-\(type)-\(index)", type: type, title: copy.title, subtitle: copy.subtitle, distance: "Nearby", rating: "Starter", icon: icon(for: type), verified: false, entryType: "free", cta: copy.cta, imageUrl: nil, categoryLabel: label, badgeText: "CURATED", metadataLine: "Starter feed", features: [label, "Starter pick", "More coming"], vibeScore: 6, availability: "Available", membershipRequired: false)
    }

    private static func appendUnique(_ cards: [NativeDiscoverSummary], to merged: inout [NativeDiscoverSummary]) {
        for card in cards where !merged.contains(where: { $0.id == card.id || $0.title.caseInsensitiveCompare(card.title) == .orderedSame }) {
            merged.append(card)
        }
    }

    private static func mergeEvents(_ primary: [NativeEventSummary], with fallback: [NativeEventSummary]) -> [NativeEventSummary] {
        var merged = primary
        for event in fallback where !merged.contains(where: { $0.id == event.id || $0.title.caseInsensitiveCompare(event.title) == .orderedSame }) {
            merged.append(event)
        }
        return merged
    }

    private static func venueDiscoverCards(from venues: [NativeVenueSummary]) -> [NativeDiscoverSummary] {
        venues.prefix(24).map { venue in
            let type = venue.discoverType
            let spots = venue.parking.totalAvailable
            let meta = spots > 0 ? "\(venue.parking.priceLabel) • \(spots) spots" : venue.parking.priceLabel
            let vibe = min(max((venue.crowd?.level ?? 2) * 2, 1), 10)
            return NativeDiscoverSummary(
                id: "venue-\(venue.id)",
                type: type,
                title: venue.name,
                subtitle: venue.address.isEmpty ? "Live venue from bytspot-api" : venue.address,
                distance: venue.distance,
                rating: venue.rating.map { String(format: "%.1f", $0) } ?? "4.5",
                icon: icon(for: type),
                verified: venue.verifiedPatchId != nil,
                entryType: "free",
                cta: venue.verifiedPatchId == nil ? "Open details" : "Tap verified",
                imageUrl: venue.imageUrl,
                categoryLabel: label(for: type),
                badgeText: "LIVE API",
                metadataLine: meta,
                features: venueFeatureChips(venue),
                vibeScore: vibe,
                availability: venue.crowd?.label ?? "Open",
                membershipRequired: false,
                control: NativeDiscoverCardControl.isControlled(venue: venue) ? NativeDiscoverCardControl.vendor : NativeDiscoverCardControl.local,
                latitude: venue.latitude,
                longitude: venue.longitude
            )
        }
    }

    private static func categoryCompanionCards(from venues: [NativeVenueSummary]) -> [NativeDiscoverSummary] {
        venues.prefix(24).compactMap { venue in
            let type = venue.discoverType
            let prefix: String
            let cta: String
            switch type {
            case "dining": prefix = "Dinner plan"; cta = "Plan Dining"
            case "nightlife": prefix = "Night out"; cta = "Plan Night"
            case "shopping": prefix = "Shop stop"; cta = "Explore Shops"
            case "parking": prefix = "Parking option"; cta = "Route"
            case "coffee": prefix = "Coffee stop"; cta = "Open details"
            case "fitness": prefix = "Fitness stop"; cta = "Open details"
            case "boutique_apartment": prefix = "Stay option"; cta = "View Stay"
            case "mobility": prefix = "Mobility option"; cta = "Request"
            case "entertainment": prefix = "Event-side pick"; cta = "View Event"
            default:
                guard venue.parking.totalAvailable > 0 else { return nil }
                prefix = "Parking nearby"; cta = "Route"
            }
            let cardType = type == "venue" ? "parking" : type
            let meta = venue.parking.totalAvailable > 0 ? "\(venue.parking.totalAvailable) parking spots nearby" : (venue.crowd?.label ?? "Live API venue")
            return NativeDiscoverSummary(id: "companion-\(cardType)-\(venue.id)", type: cardType, title: "\(prefix): \(venue.name)", subtitle: venue.address.isEmpty ? "Live API venue" : venue.address, distance: venue.distance, rating: venue.rating.map { String(format: "%.1f", $0) } ?? "Live", icon: icon(for: cardType), verified: venue.verifiedPatchId != nil, entryType: cardType == "parking" ? "paid" : "free", cta: cta, imageUrl: venue.imageUrl, categoryLabel: label(for: cardType), badgeText: "LIVE API", metadataLine: meta, features: [label(for: cardType), meta, "API powered"], vibeScore: max(5, min(10, (venue.crowd?.level ?? 2) * 2 + 2)), availability: venue.crowd?.label ?? "Open", membershipRequired: false, latitude: venue.latitude, longitude: venue.longitude)
        }
    }

    private static func eventDiscoverCards(from events: [NativeEventSummary]) -> [NativeDiscoverSummary] {
        events.prefix(20).map { event in
            NativeDiscoverSummary(id: "event-\(event.id)", type: "entertainment", title: event.title, subtitle: event.address ?? event.venue, distance: event.time, rating: "Live", icon: "ticket.fill", verified: true, entryType: event.price.localizedCaseInsensitiveContains("free") ? "free" : "paid", cta: event.hasKnownCoordinates ? "Book Ride" : "View Event", imageUrl: event.imageUrl, categoryLabel: "Events", badgeText: "LIVE EVENT", metadataLine: "\(event.time) • \(event.price)", features: ["Events", event.category.capitalized, event.venue, event.emoji], vibeScore: 8, availability: event.time, membershipRequired: false, latitude: event.latitude, longitude: event.longitude)
        }
    }

    private static func nightlifeEventDiscoverCards(from events: [NativeEventSummary]) -> [NativeDiscoverSummary] {
        events.prefix(20).filter(isNightlifeAdjacentEvent).map { event in
            NativeDiscoverSummary(id: "nightlife-event-\(event.id)", type: "nightlife", title: "Night out: \(event.title)", subtitle: event.address ?? event.venue, distance: event.time, rating: "Live", icon: "music.note", verified: true, entryType: event.price.localizedCaseInsensitiveContains("free") ? "free" : "paid", cta: event.hasKnownCoordinates ? "Book Ride" : "View Event", imageUrl: event.imageUrl, categoryLabel: "Nightlife", badgeText: "LIVE EVENT", metadataLine: "\(event.time) • \(event.price)", features: ["Live music", event.category.capitalized, event.venue], vibeScore: 9, availability: event.time, membershipRequired: false, latitude: event.latitude, longitude: event.longitude)
        }
    }

    private static func isNightlifeAdjacentEvent(_ event: NativeEventSummary) -> Bool {
        let text = [event.title, event.venue, event.category].joined(separator: " ").lowercased()
        return ["concert", "music", "live", "club", "lounge", "bar", "night", "dj", "comedy", "karaoke", "masquerade", "vinyl", "theatre", "theater", "purgatory", "hell", "buckhead theatre"].contains { text.contains($0) }
    }

    private static func enrichedSnapshot(_ snapshot: NativeTabContentSnapshot, valueOptions: [NativeLiveValueOption]) -> NativeTabContentSnapshot {
        NativeTabContentSnapshot(venues: snapshot.venues, discoverCards: mergeBestValueCards(valueOptions, into: snapshot.discoverCards), events: snapshot.events, source: valueOptions.isEmpty ? snapshot.source : .mixed, lastUpdated: snapshot.lastUpdated, errorMessage: snapshot.errorMessage, bestValueOptions: valueOptions, hasLiveVenueInventory: snapshot.hasLiveVenueInventory, hasLiveEventInventory: snapshot.hasLiveEventInventory)
    }

    private static func mergeBestValueCards(_ options: [NativeLiveValueOption], into cards: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var merged = cards
        for card in options.prefix(3).map(bestValueCard(from:)).reversed() where !merged.contains(where: { $0.id == card.id || $0.title.caseInsensitiveCompare(card.title) == .orderedSame }) {
            merged.insert(card, at: 0)
        }
        return merged
    }

    private static func mergePlaceCards(_ places: [NativeDiscoverSummary], into cards: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var merged = cards
        for card in places where !merged.contains(where: { $0.id == card.id || $0.title.caseInsensitiveCompare(card.title) == .orderedSame }) {
            merged.append(card)
        }
        return merged
    }

    private static func locationAwareSnapshot(_ snapshot: NativeTabContentSnapshot, location: NativeLocationCoordinate) -> NativeTabContentSnapshot {
        let venues = snapshot.source == .fallback ? fallbackVenues(for: location) : locationAwareVenues(snapshot.venues, location: location)
        let cards = locationAwareCards(snapshot.discoverCards, sourceVenues: snapshot.venues, location: location)
        return NativeTabContentSnapshot(venues: venues, discoverCards: cards, events: visibleEvents(snapshot.events, location: location), source: snapshot.source, lastUpdated: snapshot.lastUpdated, errorMessage: snapshot.errorMessage, bestValueOptions: location.isFallback ? [] : snapshot.bestValueOptions, hasLiveVenueInventory: snapshot.hasLiveVenueInventory, hasLiveEventInventory: snapshot.hasLiveEventInventory)
    }

    static func fallbackVenues(for location: NativeLocationCoordinate) -> [NativeVenueSummary] {
        guard canUseCurrentEventFeed(at: location) else { return [] }
        return locationAwareVenues(NativeTabContentSnapshot.fallbackVenues, location: location)
    }

    static func locationAwareVenues(_ venues: [NativeVenueSummary], location: NativeLocationCoordinate) -> [NativeVenueSummary] {
        venues.compactMap { venue in
            guard let miles = location.distanceMiles(toLatitude: venue.latitude, longitude: venue.longitude),
                  miles <= localVenueRadiusMiles else { return nil }
            let distance = location.distanceLabel(toLatitude: venue.latitude, longitude: venue.longitude) ?? venue.distance
            return NativeVenueSummary(id: venue.id, name: venue.name, category: venue.category, address: venue.address, distance: distance, rating: venue.rating, latitude: venue.latitude, longitude: venue.longitude, crowd: venue.crowd, parking: venue.parking, verifiedPatchId: venue.verifiedPatchId, imageUrl: venue.imageUrl)
        }
    }

    static func locationAwareCards(_ cards: [NativeDiscoverSummary], sourceVenues: [NativeVenueSummary], location: NativeLocationCoordinate) -> [NativeDiscoverSummary] {
        let fallbackCards = NativeTabContentSnapshot.fallbackDiscoverCards
        let specialCards = NativeTabContentSnapshot.specialDiscoverCards
        let curatedIDs = Set((fallbackCards + specialCards).map(\.id))
        let isAtlantaRegion = canUseCurrentEventFeed(at: location)
        let venueCandidates = sourceVenues + (isAtlantaRegion ? NativeTabContentSnapshot.fallbackVenues : [])
        return cards.compactMap { card in
            let canonicalID = curatedIDs.first { card.id == $0 || card.id.contains($0) }
            let hasPlaceProviderBadge = card.badgeText.localizedCaseInsensitiveContains("APPLE MAPS") || card.badgeText.localizedCaseInsensitiveContains("GOOGLE PLACES")
            let isLocalPlaceCard = hasPlaceProviderBadge && hasMeasuredLocalDistance(card.distance)
            let isLocationQueriedValueCard = card.badgeText.localizedCaseInsensitiveContains("BEST VALUE")
            if location.isFallback {
                guard canonicalID != nil,
                      !specialCards.contains(where: { card.id == $0.id || card.id.contains($0.id) }),
                      !card.id.contains("midtown-boutique-suite") else { return nil }
                return genericCuratedCard(card)
            }
            if !isAtlantaRegion,
               (specialCards.contains { card.id == $0.id || card.id.contains($0.id) } || card.id.contains("midtown-boutique-suite")) { return nil }
            let venue = venueCandidates.first { $0.name.caseInsensitiveCompare(card.title) == .orderedSame || card.id.contains($0.id) }
            if let venue {
                guard let miles = location.distanceMiles(toLatitude: venue.latitude, longitude: venue.longitude),
                      miles <= localVenueRadiusMiles else { return nil }
            }
            let isTrustedAtlantaNightlifeSuggestion = isAtlantaRegion
                && (card.id.hasPrefix("nightlife-event-") || card.id.hasPrefix("starter-") || card.badgeText.localizedCaseInsensitiveContains("CURATED"))
            if card.type == "nightlife", !curatedIDs.contains(card.id), !isLocalPlaceCard, !isTrustedAtlantaNightlifeSuggestion {
                guard let venue,
                      let miles = location.distanceMiles(toLatitude: venue.latitude, longitude: venue.longitude),
                      miles <= nightlifeRadiusMiles else { return nil }
            }
            if !isAtlantaRegion,
               canonicalID != nil || card.id.hasPrefix("starter-") || card.badgeText.localizedCaseInsensitiveContains("CURATED") {
                return genericCuratedCard(card)
            }
            if !isAtlantaRegion, venue == nil, !isLocalPlaceCard, !isLocationQueriedValueCard { return nil }
            guard let venue, let distance = location.distanceLabel(toLatitude: venue.latitude, longitude: venue.longitude) else { return card }
            return NativeDiscoverSummary(id: card.id, type: card.type, title: card.title, subtitle: card.subtitle, distance: distance, rating: card.rating, icon: card.icon, verified: card.verified, entryType: card.entryType, cta: card.cta, imageUrl: card.imageUrl, categoryLabel: card.categoryLabel, badgeText: card.badgeText, metadataLine: card.metadataLine, features: card.features, vibeScore: card.vibeScore, availability: card.availability, membershipRequired: card.membershipRequired, control: card.control, latitude: card.latitude, longitude: card.longitude)
        }
    }

    private static func genericCuratedCard(_ card: NativeDiscoverSummary) -> NativeDiscoverSummary {
        NativeDiscoverSummary(id: card.id, type: card.type, title: card.title, subtitle: card.subtitle, distance: "Nearby", rating: "Explore", icon: card.icon, verified: false, entryType: "free", cta: "Explore", imageUrl: card.imageUrl, categoryLabel: card.categoryLabel, badgeText: "CURATED", metadataLine: "Suggestions for your area", features: [card.categoryLabel, "Local ideas", "Check nearby"], vibeScore: card.vibeScore, availability: "Check nearby", membershipRequired: false)
    }

    private static func hasMeasuredLocalDistance(_ value: String) -> Bool {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.caseInsensitiveCompare("Here") == .orderedSame { return true }
        guard normalized.lowercased().hasSuffix(" mi"),
              let miles = Double(normalized.dropLast(3).trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return miles.isFinite && miles >= 0 && miles <= localVenueRadiusMiles
    }

    private static func visibleEvents(_ events: [NativeEventSummary], location: NativeLocationCoordinate) -> [NativeEventSummary] {
        guard !location.isFallback else { return [] }
        return events
    }

    private static func discoverCard(fromPlace pair: EnumeratedSequence<[NativePlaceSearchResult]>.Element, location: NativeLocationCoordinate, eta: NativeNavigationEstimate?) -> NativeDiscoverSummary? {
        let (index, place) = pair
        let type = discoverType(forPlaceCategory: place.category)
        guard let miles = location.distanceMiles(toLatitude: place.latitude, longitude: place.longitude),
              miles.isFinite, miles <= localVenueRadiusMiles,
              let distance = location.distanceLabel(toLatitude: place.latitude, longitude: place.longitude) else { return nil }
        let etaLine = eta.map { " · \($0.durationText) approx" } ?? ""
        return NativeDiscoverSummary(
            id: "place-\(place.id)",
            type: type,
            title: place.name,
            subtitle: place.address,
            distance: distance,
            rating: place.rating.map { String(format: "%.1f", $0) } ?? "Nearby",
            icon: icon(for: type),
            verified: false,
            entryType: "free",
            cta: type == "parking" ? "Route" : "Open details",
            imageUrl: place.photoUrl,
            categoryLabel: label(for: type),
            badgeText: place.provider == "apple_maps" ? "APPLE MAPS" : "GOOGLE PLACES",
            metadataLine: "Live place · \(place.provider.replacingOccurrences(of: "_", with: " ").capitalized)\(etaLine)",
            features: Array([label(for: type), distance, index < 3 ? "Nearby" : "Explore"].prefix(3)),
            vibeScore: max(4, min(8, Int((place.rating ?? 4.3).rounded() + 2))),
            availability: "Live place",
            membershipRequired: false,
            latitude: place.latitude,
            longitude: place.longitude
        )
    }

    private static func bestValueCard(from option: NativeLiveValueOption) -> NativeDiscoverSummary {
        let type = discoverType(forProductType: option.productType)
        let price = option.estimatedTotalCents.map(formatCurrency(cents:)) ?? "Price pending"
        let market = option.marketReferenceCents.map(formatCurrency(cents:)) ?? "market pending"
        let distance = option.distanceMeters.map(distanceLabel(meters:)) ?? "Nearby"
        return NativeDiscoverSummary(id: "best-value-\(option.id)", type: type, title: option.title, subtitle: "\(option.providerName) · ranked by price parity", distance: distance, rating: "Value \(option.valueScore)", icon: icon(for: type), verified: option.eligible, entryType: option.estimatedTotalCents == 0 ? "free" : "paid", cta: cta(forProductType: option.productType), imageUrl: nil, categoryLabel: label(for: type), badgeText: "BEST VALUE", metadataLine: "\(price) · vs \(market) · score \(option.valueScore)", features: bestValueFeatures(option), vibeScore: max(1, min(10, Int(ceil(Double(option.valueScore) / 10.0)))), availability: option.availability, membershipRequired: option.estimatedTotalCents != 0)
    }

    private static func serviceCard(from item: [String: Any], index: Int) -> NativeDiscoverSummary {
        let vendor = item["vendor"] as? [String: Any]
        let title = string(item, ["title", "name"]) ?? string(vendor, ["displayName", "name"]) ?? "Local Service"
        let subtitle = string(item, ["serviceSubtitle", "subtitle", "description"]) ?? string(vendor, ["tagline"]) ?? "Trusted local service"
        let priceCents = int(item, ["priceCents", "amountCents", "priceFromCents"]) ?? int(vendor, ["priceCents", "amountCents", "priceFromCents"])
        let price = string(item, ["entryPrice", "price", "priceLabel"]) ?? priceCents.map { formatCurrency(cents: $0) } ?? "Member pricing"
        let rawCategory = string(item, ["category", "serviceCategory"]) ?? string(vendor, ["category"]) ?? "service"
        let rating = double(item, ["rating"]) ?? double(vendor, ["rating"])
        let features = ((item["includedHighlights"] as? [String]) ?? (item["features"] as? [String]) ?? (vendor?["includedHighlights"] as? [String]) ?? [])
        return NativeDiscoverSummary(
            id: string(item, ["id", "vendorServiceId"]) ?? string(vendor, ["id"]) ?? "service-\(index)",
            type: "service",
            title: title,
            subtitle: subtitle,
            distance: string(item, ["distance"]) ?? "Service",
            rating: rating.map { String(format: "%.1f", $0) } ?? "4.9",
            icon: icon(for: "service"),
            verified: true,
            entryType: "paid",
            cta: string(item, ["ctaText", "action"]) ?? "Request Service",
            imageUrl: url(item, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]) ?? url(vendor, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]),
            categoryLabel: "Services",
            badgeText: "LIVE API",
            metadataLine: "\(price) • \(string(item, ["availability", "availabilityWindow"]) ?? "Available now")",
            features: Array((features.isEmpty ? [rawCategory.capitalized, "Trusted provider", "Member pricing"] : features).prefix(4)),
            vibeScore: min(max(int(item, ["vibeScore", "vibe"]) ?? 8, 1), 10),
            availability: string(item, ["availability"]) ?? "Available now",
            membershipRequired: true,
            control: NativeDiscoverCardControl.vendor,
            latitude: double(item, ["lat", "latitude"]) ?? double(vendor, ["lat", "latitude"]),
            longitude: double(item, ["lng", "longitude"]) ?? double(vendor, ["lng", "longitude"])
        )
    }

    private static func discoverCard(from item: [String: Any], index: Int) -> NativeDiscoverSummary {
        let type = NativeDiscoverCategoryNormalizer.type(for: string(item, ["type", "category", "serviceCategory"]) ?? "service")
        return NativeDiscoverSummary(
            id: string(item, ["id", "vendorServiceId"]) ?? "bootstrap-card-\(index)",
            type: type,
            title: string(item, ["title", "name"]) ?? "Bytspot Pick",
            subtitle: string(item, ["subtitle", "description"]) ?? "Recommended around you",
            distance: string(item, ["distance"]) ?? "Nearby",
            rating: string(item, ["rating"]) ?? double(item, ["rating"]).map { String(format: "%.1f", $0) } ?? "4.8",
            icon: string(item, ["icon", "iconName"]) ?? icon(for: type),
            verified: bool(item, ["verified", "isVerified"]) ?? false,
            entryType: string(item, ["entryType"]) ?? "free",
            cta: string(item, ["cta", "ctaText", "action"]) ?? "Open details",
            imageUrl: url(item, ["imageUrl", "image_url", "heroImage", "thumbnailUrl"]),
            categoryLabel: string(item, ["categoryLabel", "label"]) ?? label(for: type),
            badgeText: "LIVE API",
            metadataLine: string(item, ["metadataLine", "meta", "priceLabel"]) ?? "Available now",
            features: arrayOfStrings(item["features"]) ?? arrayOfStrings(item["includedHighlights"]) ?? [label(for: type), "Bytspot verified"],
            vibeScore: min(max(int(item, ["vibeScore", "vibe"]) ?? 8, 1), 10),
            availability: string(item, ["availability"]) ?? "Available now",
            membershipRequired: bool(item, ["membershipRequired", "requiresMembership"]) ?? false,
            latitude: double(item, ["lat", "latitude"]),
            longitude: double(item, ["lng", "longitude"])
        )
    }

    private static func event(from pair: EnumeratedSequence<[Any]>.Element) -> NativeEventSummary? {
        let (index, value) = pair
        guard let item = value as? [String: Any] else { return nil }
        return event(from: item, index: index)
    }

    static func event(from item: [String: Any], index: Int = 0) -> NativeEventSummary? {
        let embedded = item["_embedded"] as? [String: Any]
        let venueRecord = (embedded?["venues"] as? [Any])?.first as? [String: Any]
        let venueLocation = venueRecord?["location"] as? [String: Any]
        let venueAddress = venueRecord?["address"] as? [String: Any]
        let venueCity = venueRecord?["city"] as? [String: Any]
        let venueState = venueRecord?["state"] as? [String: Any]
        let coordinates = coordinatePair(
            latitude: double(item, ["lat", "latitude"]),
            longitude: double(item, ["lng", "longitude"])
        ) ?? coordinatePair(
            latitude: double(venueLocation, ["lat", "latitude"]),
            longitude: double(venueLocation, ["lng", "longitude"])
        ) ?? coordinatePair(
            latitude: double(venueRecord, ["lat", "latitude"]),
            longitude: double(venueRecord, ["lng", "longitude"])
        )
        let venue = string(item, ["venue", "venueName", "location"])
            ?? string(venueRecord, ["name"])
            ?? "Midtown"
        let address = string(item, ["address", "venueAddress", "locationAddress", "formattedAddress", "venue_address"])
            ?? joinedAddress([
                string(venueRecord, ["address", "formattedAddress"]),
                string(venueAddress, ["line1", "line2"]),
                string(venueCity, ["name"]),
                string(venueState, ["stateCode", "name"]),
                string(venueRecord, ["postalCode", "zip"])
            ])
        return NativeEventSummary(
            id: string(item, ["id"]) ?? "event-\(index)",
            title: string(item, ["title", "name"]) ?? "Tonight's Event",
            venue: venue,
            time: string(item, ["time", "startsAt"]) ?? "Tonight",
            price: string(item, ["price", "priceLabel"]) ?? "Free",
            emoji: string(item, ["emoji"]) ?? "🎭",
            imageUrl: url(item, ["imageUrl", "image_url", "photoUrl", "image", "heroImage"]),
            category: string(item, ["category", "type", "classification", "genre"]) ?? "event",
            address: address,
            latitude: coordinates?.latitude,
            longitude: coordinates?.longitude
        )
    }

    private static func coordinatePair(latitude: Double?, longitude: Double?) -> (latitude: Double, longitude: Double)? {
        guard let latitude, let longitude,
              NativeVenueSummary.hasValidMapCoordinate(latitude: latitude, longitude: longitude) else { return nil }
        return (latitude, longitude)
    }

    private static func joinedAddress(_ parts: [String?]) -> String? {
        let resolved = parts.compactMap { value -> String? in
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
            return value
        }
        return resolved.isEmpty ? nil : resolved.joined(separator: ", ")
    }

    private static func mergeCanonicalDiscoverCards(into liveServices: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var cards = liveServices
        for canonical in NativeTabContentSnapshot.specialDiscoverCards.reversed() where !cards.contains(where: { $0.id == canonical.id || $0.title.caseInsensitiveCompare(canonical.title) == .orderedSame }) {
            cards.insert(canonical, at: 0)
        }
        return cards
    }

    private static func venueFeatureChips(_ venue: NativeVenueSummary) -> [String] {
        var chips = [label(for: venue.discoverType), venue.crowd?.label ?? "Open"]
        if venue.parking.totalAvailable > 0 { chips.append("\(venue.parking.totalAvailable) spots") }
        if venue.verifiedPatchId != nil { chips.append("Bytspot verified") }
        return Array(chips.prefix(4))
    }

    private static func formatCurrency(cents: Int) -> String {
        let dollars = Double(cents) / 100.0
        return dollars.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "$%.0f", dollars) : String(format: "$%.2f", dollars)
    }

    private static func liveValueOption(from value: Any) -> NativeLiveValueOption? {
        guard let item = value as? [String: Any], let id = string(item, ["id"]), let title = string(item, ["title", "name"]) else { return nil }
        return NativeLiveValueOption(
            id: id,
            productType: string(item, ["productType"]) ?? "parking",
            title: title,
            providerName: string(item, ["providerName", "provider"]) ?? "Bytspot",
            source: string(item, ["source"]) ?? "curated",
            estimatedTotalCents: int(item, ["estimatedTotalCents"]),
            marketReferenceCents: int(item, ["marketReferenceCents"]),
            distanceMeters: double(item, ["distanceMeters"]),
            availability: string(item, ["availability"]) ?? "Availability pending",
            priceParityScore: int(item, ["priceParityScore"]) ?? 0,
            valueScore: int(item, ["valueScore"]) ?? 0,
            eligible: bool(item, ["eligible"]) ?? true,
            explanation: arrayOfStrings(item["explanation"]) ?? []
        )
    }

    private static func discoverType(forProductType productType: String) -> String {
        switch productType {
        case "parking": return "parking"
        case "airport_transfer": return "mobility"
        case "menu_order": return "service"
        case "event_pass": return "entertainment"
        default: return "service"
        }
    }

    private static func discoverType(forPlaceCategory category: String) -> String {
        NativeDiscoverCategoryNormalizer.type(for: category)
    }

    private static func cta(forProductType productType: String) -> String {
        switch productType {
        case "parking": return "View Parking"
        case "airport_transfer": return "Request Transfer"
        case "menu_order": return "View Menu"
        case "event_pass": return "View Pass"
        default: return "Open details"
        }
    }

    private static func distanceLabel(meters: Double) -> String {
        let miles = meters / 1609.344
        return miles < 0.1 ? "\(Int(meters.rounded())) m" : String(format: "%.1f mi", miles)
    }

    private static func bestValueFeatures(_ option: NativeLiveValueOption) -> [String] {
        let price = option.estimatedTotalCents.map(formatCurrency(cents:)) ?? "Price pending"
        let parity = "Parity \(option.priceParityScore)/100"
        let source = option.source.replacingOccurrences(of: "_", with: " ").capitalized
        return Array(([price, parity, source] + Array(option.explanation.prefix(1))).prefix(4))
    }

    private static func label(for type: String) -> String {
        switch NativeDiscoverCategoryNormalizer.type(for: type) {
        case "dining": return "Dining"
        case "nightlife": return "Nightlife"
        case "coffee": return "Coffee"
        case "parking": return "Parking"
        case "entertainment": return "Events"
        case "fitness": return "Fitness"
        case "shopping": return "Shopping"
        case "boutique_apartment": return "Boutique Stay"
        case "mobility": return "Mobility"
        case "service": return "Services"
        default: return "Nearby"
        }
    }

    static func venue(from value: Any) -> NativeVenueSummary? {
        guard let item = value as? [String: Any] else { return nil }
        let location = item["location"] as? [String: Any]
        guard let latitude = double(item, ["lat", "latitude"]) ?? double(location, ["lat", "latitude"]),
              let longitude = double(item, ["lng", "longitude"]) ?? double(location, ["lng", "longitude"]),
              NativeVenueSummary.hasValidMapCoordinate(latitude: latitude, longitude: longitude) else { return nil }
        let id = string(item, ["id", "slug", "name"]) ?? UUID().uuidString
        let parkingDict = item["parking"] as? [String: Any]
        let spots = int(parkingDict, ["totalAvailable"]) ?? int(item, ["spots"]) ?? 0
        let firstSpot = (parkingDict?["spots"] as? [[String: Any]])?.first
        let price = int(firstSpot, ["pricePerHr"]).map { "$\($0)/hr" } ?? string(item, ["price", "entryPrice"]) ?? "—"
        let crowdDict = item["crowd"] as? [String: Any]
        let crowd = crowdDict.flatMap { value -> NativeCrowdSummary? in
            guard let rawLabel = string(value, ["label"]) else { return nil }
            let label = rawLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !label.isEmpty else { return nil }
            return NativeCrowdSummary(level: int(value, ["level"]) ?? 1, label: label, waitMins: int(value, ["waitMins"]), source: string(value, ["source"]))
        }
        let patch = (item["hardwarePatch"] as? [String: Any]).flatMap { string($0, ["id", "patchId"]) }
        return NativeVenueSummary(
            id: id,
            name: string(item, ["name"]) ?? "Bytspot Venue",
            category: string(item, ["category"]) ?? "venue",
            address: string(item, ["address", "location"]) ?? "Address unavailable",
            distance: "—",
            rating: double(item, ["rating"]),
            latitude: latitude,
            longitude: longitude,
            crowd: crowd,
            parking: NativeParkingSummary(totalAvailable: spots, priceLabel: price),
            verifiedPatchId: patch,
            imageUrl: url(item, ["imageUrl", "image_url", "photoUrl", "image", "heroImage"])
        )
    }

    private static func url(_ dict: [String: Any]?, _ keys: [String]) -> URL? {
        guard let raw = string(dict, keys) else { return nil }
        return URL(string: raw)
    }

    private static func findArray(named name: String, in value: Any) -> [Any]? {
        if let array = value as? [Any] { return array }
        guard let dict = value as? [String: Any] else { return nil }
        if let array = dict[name] as? [Any] { return array }
        for child in dict.values { if let found = findArray(named: name, in: child) { return found } }
        return nil
    }

    private static func string(_ dict: [String: Any]?, _ keys: [String]) -> String? {
        guard let dict else { return nil }
        for key in keys { if let value = dict[key] as? String, !value.isEmpty { return value } }
        return nil
    }

    private static func int(_ dict: [String: Any]?, _ keys: [String]) -> Int? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Int { return value }
            if let value = dict[key] as? Double { return Int(value) }
            if let value = dict[key] as? String, let parsed = Int(value) { return parsed }
        }
        return nil
    }

    private static func double(_ dict: [String: Any]?, _ keys: [String]) -> Double? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Double { return value }
            if let value = dict[key] as? Int { return Double(value) }
            if let value = dict[key] as? String, let parsed = Double(value) { return parsed }
        }
        return nil
    }

    private static func bool(_ dict: [String: Any]?, _ keys: [String]) -> Bool? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Bool { return value }
            if let value = dict[key] as? Int { return value != 0 }
            if let value = dict[key] as? String {
                let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if ["true", "1", "yes"].contains(normalized) { return true }
                if ["false", "0", "no"].contains(normalized) { return false }
            }
        }
        return nil
    }

    private static func date(_ dict: [String: Any]?, _ keys: [String]) -> Date? {
        guard let raw = string(dict, keys) else { return nil }
        return ISO8601DateFormatter().date(from: raw)
    }

    private static func arrayOfStrings(_ value: Any?) -> [String]? {
        if let strings = value as? [String] { return strings.filter { !$0.isEmpty } }
        if let values = value as? [Any] {
            let strings = values.compactMap { $0 as? String }.filter { !$0.isEmpty }
            return strings.isEmpty ? nil : strings
        }
        return nil
    }

    nonisolated static func icon(for type: String) -> String {
        switch NativeDiscoverCategoryNormalizer.type(for: type) {
        case "dining": return "fork.knife"
        case "nightlife": return "music.note"
        case "coffee": return "cup.and.saucer.fill"
        case "parking": return "parkingsign.circle.fill"
        case "boutique_apartment": return "house.fill"
        case "entertainment": return "ticket.fill"
        case "fitness": return "figure.mind.and.body"
        case "shopping": return "bag.fill"
        case "mobility": return "car.side.fill"
        case "service": return "checkmark.seal.fill"
        default: return "mappin.and.ellipse"
        }
    }
}

extension NativeTabContentSnapshot {
    static let fallbackVenues = [
        NativeVenueSummary(id: "colony-square", name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", distance: "0.4 mi", rating: 4.8, latitude: 33.7878, longitude: -84.3832, crowd: NativeCrowdSummary(level: 2, label: "Active", waitMins: 5), parking: NativeParkingSummary(totalAvailable: 14, priceLabel: "$8/hr"), verifiedPatchId: "BYT424-0301-P", imageUrl: URL(string: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80")),
        NativeVenueSummary(id: "midtown-smart-parking", name: "Midtown Smart Parking", category: "parking", address: "1380 W Peachtree St NW", distance: "0.6 mi", rating: 4.5, latitude: 33.7900, longitude: -84.3890, crowd: NativeCrowdSummary(level: 1, label: "Chill", waitMins: 0), parking: NativeParkingSummary(totalAvailable: 22, priceLabel: "$8/hr"), verifiedPatchId: nil, imageUrl: URL(string: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=900&q=80")),
        NativeVenueSummary(id: "arts-center-access", name: "Arts Center Access", category: "entertainment", address: "15th St NE", distance: "0.8 mi", rating: 4.7, latitude: 33.7790, longitude: -84.3760, crowd: NativeCrowdSummary(level: 3, label: "Busy", waitMins: 8), parking: NativeParkingSummary(totalAvailable: 38, priceLabel: "$12/hr"), verifiedPatchId: "BYT424-ARTS-P", imageUrl: URL(string: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=80"))
    ]

    static let canonicalMobilityCards = [
        NativeDiscoverSummary(id: "service-valet-ride", type: "mobility", title: "Private Airport Transfer", subtitle: "Request an airport transfer with clear pricing, vehicle fit, and My Access review.", distance: "Mobility", rating: "4.9", icon: "airplane.departure", verified: true, entryType: "paid", cta: "Request Transfer", imageUrl: URL(string: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Mobility", badgeText: "Airport Ride", metadataLine: "Bytspot + Elife · Airport", features: ["Review estimate", "Authorization request", "My Access status"], vibeScore: 8, availability: "Estimate + review", membershipRequired: true, control: NativeDiscoverCardControl.vendor),
        NativeDiscoverSummary(id: "group-transport", type: "mobility", title: "Group Transport", subtitle: "Plan vans, event shuttles, and private buses for a crew or airport transfer.", distance: "Group", rating: "4.8", icon: "bus.fill", verified: true, entryType: "paid", cta: "Plan Group Ride", imageUrl: URL(string: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Mobility", badgeText: "Group Ride", metadataLine: "Vans · Shuttles · Private buses", features: ["Event shuttle", "Group ride", "Private bus"], vibeScore: 7, availability: "Request quote", membershipRequired: true, control: NativeDiscoverCardControl.vendor)
    ]

    static let canonicalServiceCards = [
        NativeDiscoverSummary(id: "broni-home-taste", type: "service", title: "Broni Home Taste", subtitle: "Ghanaian comfort food, ready for pickup or delivery.", distance: "Service", rating: "4.9", icon: "fork.knife", verified: true, entryType: "paid", cta: "View Menu", imageUrl: URL(string: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Dining", badgeText: "Dining", metadataLine: "From $21 • Available now", features: ["Jollof + chicken", "Banku + tilapia", "Family-style portions"], vibeScore: 9, availability: "Available now", membershipRequired: true, control: NativeDiscoverCardControl.vendor),
        NativeDiscoverSummary(id: "gh-akwaaba-pass", type: "service", title: "GH Akwaaba Pass", subtitle: "Ghana matchday access, ready on your phone.", distance: "Pass", rating: "4.9", icon: "ticket.fill", verified: true, entryType: "paid", cta: "View Pass", imageUrl: URL(string: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Event Pass", badgeText: "Event Pass", metadataLine: "$50 • Digital pass ready", features: ["Fast-track entry", "VIP lounge access", "Digital pass delivery"], vibeScore: 9, availability: "Digital pass ready", membershipRequired: true, control: NativeDiscoverCardControl.vendor)
    ]

    static let specialDiscoverCards = canonicalMobilityCards + canonicalServiceCards

    static let fallbackDiscoverCards = [
        NativeDiscoverSummary(id: "coffee-walk", type: "coffee", title: "Morning Coffee Walk", subtitle: "Low-key cafés and brunch spots to explore around your area.", distance: "Nearby", rating: "Explore", icon: "cup.and.saucer.fill", verified: false, entryType: "free", cta: "Open details", imageUrl: URL(string: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Coffee", badgeText: "CURATED", metadataLine: "Suggestions for your area", features: ["Coffee", "Brunch", "Local ideas"], vibeScore: 6, availability: "Check nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "midtown-boutique-suite", type: "boutique_apartment", title: "Midtown Boutique Suite", subtitle: "Furnished short-stay ideas with secure entry and host support.", distance: "Midtown", rating: "Explore", icon: "house.fill", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=84"), categoryLabel: "Boutique Stay", badgeText: "CURATED", metadataLine: "Explore Midtown stays", features: ["Short stays", "Secure entry", "Host support"], vibeScore: 8, availability: "Check availability", membershipRequired: false),
        NativeDiscoverSummary(id: "dinner-vibe", type: "dining", title: "Dinner Spots That Match Your Vibe", subtitle: "Restaurant ideas for food, dates, and group plans.", distance: "Nearby", rating: "Explore", icon: "fork.knife", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Dining", badgeText: "CURATED", metadataLine: "Suggestions for your area", features: ["Dining", "Date night", "Local ideas"], vibeScore: 7, availability: "Check nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "nightlife-momentum", type: "nightlife", title: "Nightlife Near You", subtitle: "Bars, lounges, and live music to explore around your area.", distance: "Nearby", rating: "Explore", icon: "music.note", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Nightlife", badgeText: "CURATED", metadataLine: "Around your area", features: ["Bars", "Live music", "Nightlife"], vibeScore: 8, availability: "Explore nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "smart-parking", type: "parking", title: "Smart Parking Before You Arrive", subtitle: "Parking ideas around your next destination.", distance: "Nearby", rating: "Explore", icon: "parkingsign.circle.fill", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Parking", badgeText: "CURATED", metadataLine: "Suggestions for your area", features: ["Parking", "Plan ahead", "Local ideas"], vibeScore: 3, availability: "Check nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "events-worth", type: "entertainment", title: "Events Worth Leaving For", subtitle: "Shows, music, and experiences aligned with your interests.", distance: "Nearby", rating: "Explore", icon: "ticket.fill", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Events", badgeText: "CURATED", metadataLine: "Suggestions for your area", features: ["Events", "Music", "Local ideas"], vibeScore: 7, availability: "Check nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "wellness-reset", type: "fitness", title: "Wellness Reset Nearby", subtitle: "Gyms, recovery, and movement ideas for a wellness day.", distance: "Nearby", rating: "Explore", icon: "figure.mind.and.body", verified: false, entryType: "free", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Fitness", badgeText: "CURATED", metadataLine: "Suggestions for your area", features: ["Fitness", "Wellness", "Local ideas"], vibeScore: 5, availability: "Check nearby", membershipRequired: false)
    ]

    static let fallbackEvents = [
        NativeEventSummary(id: "fifa-gh", title: "GH Akwaaba FIFA Matchday", venue: "Mercedes-Benz Stadium", time: "Tonight", price: "Platinum", emoji: "🇬🇭", imageUrl: URL(string: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80"), address: "1 AMB Dr NW, Atlanta, GA 30313", latitude: 33.7553, longitude: -84.4006),
        NativeEventSummary(id: "midtown-live", title: "Midtown Live Lounge", venue: "Colony Square", time: "8:00 PM", price: "Free", emoji: "🎶", imageUrl: URL(string: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80"), address: "1197 Peachtree St NE, Atlanta, GA 30361", latitude: 33.7851, longitude: -84.3834)
    ]

    static let fallback = NativeTabContentSnapshot(venues: fallbackVenues, discoverCards: fallbackDiscoverCards + specialDiscoverCards, events: fallbackEvents, source: .fallback, lastUpdated: nil, errorMessage: nil)
    static let unresolved = NativeTabContentSnapshot(venues: [], discoverCards: fallbackDiscoverCards.filter { $0.id != "midtown-boutique-suite" }, events: [], source: .fallback, lastUpdated: nil, errorMessage: nil)
}
