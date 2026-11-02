import Foundation

// MARK: - ClipAuthStore
// Shared JWT storage for the Clip. Writes/reads the App Group suite
// (group.com.bytspot.app) so the installed full app can pick up the guest's
// session after handoff, while also mirroring to `UserDefaults.standard` so the
// Clip keeps working before the App Group entitlement is provisioned.
enum ClipAuthStore {
    static let appGroupSuiteName = "group.com.bytspot.app"
    static let tokenKey = "bytspot_auth_token"
    static let displayNameKey = "bytspot_user_display_name"
    static let displayNameUserIDKey = "bytspot_user_display_name_user_id"

    private static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupSuiteName)
    }

    static func store(token: String) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        sharedDefaults?.set(trimmed, forKey: tokenKey)
        UserDefaults.standard.set(trimmed, forKey: tokenKey)
    }

    static func store(displayName: String?, userID: String?) {
        [sharedDefaults, UserDefaults.standard].compactMap { $0 }.forEach {
            store(displayName: displayName, userID: userID, in: $0)
        }
    }

    static var token: String? {
        let candidates = [
            sharedDefaults?.string(forKey: tokenKey),
            UserDefaults.standard.string(forKey: tokenKey),
            UserDefaults.standard.string(forKey: "BytspotAuthToken")
        ]
        return candidates
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && $0 != "guest_session" && $0 != "beta_guest" }
    }

    static var displayName: String? {
        for defaults in [sharedDefaults, UserDefaults.standard].compactMap({ $0 }) {
            guard let userID = normalizedUserID(defaults.string(forKey: displayNameUserIDKey)), !userID.isEmpty,
                  let name = greetingName(from: defaults.string(forKey: displayNameKey)) else { continue }
            return name
        }
        return nil
    }

    static func store(displayName: String?, userID: String?, in defaults: UserDefaults) {
        defaults.removeObject(forKey: displayNameKey)
        defaults.removeObject(forKey: displayNameUserIDKey)
        guard let identity = greetingIdentity(displayName: displayName, userID: userID) else { return }
        defaults.set(identity.name, forKey: displayNameKey)
        defaults.set(identity.userID, forKey: displayNameUserIDKey)
    }

    static func greetingIdentity(displayName: String?, userID: String?) -> (userID: String, name: String)? {
        guard let userID = normalizedUserID(userID), let name = greetingName(from: displayName) else { return nil }
        return (userID, name)
    }

    private static func normalizedUserID(_ rawUserID: String?) -> String? {
        guard let rawUserID else { return nil }
        let userID = rawUserID.trimmingCharacters(in: .whitespacesAndNewlines)
        return (1...200).contains(userID.count) ? userID : nil
    }

    private static func greetingName(from rawName: String?) -> String? {
        guard let rawName else { return nil }
        let parts = rawName.split(whereSeparator: { $0.isWhitespace })
        guard let first = parts.first, (1...64).contains(first.count) else { return nil }
        return String(first)
    }
}

/// Result of a successful Sign in with Apple exchange (`auth.appleSignIn`).
struct ClipGuestSession {
    let token: String
    let userId: String?
    let name: String?
    let email: String?
    let isNewUser: Bool
}

#if false // Legacy Group API types retained for future extraction; not compiled into this Party App Clip.
/// A single joined guest from `groupEvents.guests`. `profileImage` is optional;
/// the view falls back to `initials` (server-provided) when it is absent.
struct ClipGroupEventGuest: Identifiable, Equatable {
    let userId: String
    let name: String
    let profileImage: URL?
    let initials: String

    var id: String { userId }
}

/// Public-facing joined guest list for an invite (`groupEvents.guests`).
struct ClipGroupEventGuestList: Equatable {
    let eventId: String
    let count: Int
    let guests: [ClipGroupEventGuest]
}
#endif

// MARK: - BytspotTier
// Service-level axis (independent of providerType). Drives URL routing, the
// tRPC `tier` filter, fallback service catalogs, and the visual identity
// applied by ClipContentView and NativePatchExperienceView.
enum BytspotTier: String, Equatable, CaseIterable {
    case black
    case platinum
    case green

    var displayName: String {
        switch self {
        case .black: return "Bytspot Black"
        case .platinum: return "Bytspot Platinum"
        case .green: return "Bytspot Green"
        }
    }

    var eyebrow: String {
        switch self {
        case .black: return "BYTSPOT BLACK"
        case .platinum: return "BYTSPOT PLATINUM"
        case .green: return "BYTSPOT GREEN"
        }
    }

    /// Tokens that code this tier inside a patch identifier. One list per tier,
    /// replacing the prefix/suffix pairs that previously had to be kept in sync
    /// across six separate string literals each.
    var codeTokens: [String] {
        switch self {
        case .black: return ["BLACK", "B"]
        case .platinum: return ["PLATINUM", "P"]
        case .green: return ["GREEN", "G"]
        }
    }

    /// Single tier-coding contract for patch identifiers.
    ///
    /// A patch id is a separator-delimited identifier (`-`, `_`, `.`), and it is
    /// tier-coded when its first or last segment is a tier token, or when it is
    /// a `BYT-<token>-…` batch id. This replaces matching bare prefixes and
    /// suffixes against the raw string, which could not distinguish a tier
    /// marker from any identifier that merely happened to end in those letters.
    nonisolated static func codedTier(_ value: String) -> BytspotTier? {
        let segments = value.uppercased()
            .split(whereSeparator: { $0 == "-" || $0 == "_" || $0 == "." })
            .map(String.init)
        guard let first = segments.first, let last = segments.last else { return nil }
        for tier in [BytspotTier.black, .platinum, .green] {
            let tokens = tier.codeTokens
            if tokens.contains(first) || tokens.contains(last) { return tier }
            if segments.count >= 2, first == "BYT", tokens.contains(segments[1]) { return tier }
        }
        return nil
    }

    /// Resolve a tier from any Bytspot patch URL or patchId. Inspection order:
    /// (1) `?tier=` query, (2) `?invite=BLACK-…` prefix, (3) `/p/<tier>-…`,
    /// (4) `/black|/platinum|/green/<slug>` path, (5) the patchId tier-coding
    /// contract above. Returns nil when nothing in the invocation codes a tier,
    /// so callers can tell "no markers" apart from a deliberate Black link.
    static func detectIfCoded(url: URL?, patchId: String?) -> BytspotTier? {
        if let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            let items = components.queryItems ?? []
            if let raw = items.first(where: { $0.name.lowercased() == "tier" })?.value,
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
        if let patchId, let tier = Self.codedTier(patchId) { return tier }
        return nil
    }

    /// Tier for surfaces that must render something. An uncoded invocation still
    /// defaults to `.black` so the existing patch surface keeps its luxury
    /// default, but callers that can fail honestly should use `detectIfCoded`.
    static func detect(url: URL?, patchId: String?) -> BytspotTier {
        detectIfCoded(url: url, patchId: patchId) ?? .black
    }
}

/// Thin REST client for the Clip target. Mirrors the App's tRPC shape but
/// speaks plain JSON over the HTTP adapter so the Clip stays lightweight.
struct ClipPatchVerifier {
    enum VerifyError: Error {
        case missingToken
        case network(String)
        case server(String)
        case decode
    }

    #if DEBUG
    static let debugPreviewAPIKey = "BytspotClipDebugPreviewAPI"
    #endif

    static var baseURL: URL {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: debugPreviewAPIKey) {
            return URL(string: "https://bytspot-api-pr-1.onrender.com")!
        }
        if let raw = ProcessInfo.processInfo.environment["BYT_API_BASE_URL"],
           let url = URL(string: raw), url.scheme?.lowercased() == "https" {
            return url
        }
        #endif
        if let raw = Bundle.main.object(forInfoDictionaryKey: "BytspotAPIBaseURL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://bytspot-api.onrender.com")!
    }

    /// Exchange an Apple identity token for a Bytspot session (`auth.appleSignIn`).
    /// On success the JWT is persisted via `ClipAuthStore` so subsequent
    /// authenticated Party calls attach the stored credential automatically.
    static let appleSignInSource = "native_ios"

    func appleSignIn(identityToken: String, email: String?, name: String?) async throws -> ClipGuestSession {
        // Use the established native iOS source contract so the backend applies
        // the same Apple identity-token validation policy to the App Clip.
        var input: [String: Any] = ["identityToken": identityToken, "ref": Self.appleSignInSource]
        if let email, !email.isEmpty { input["email"] = email }
        if let name, !name.isEmpty { input["name"] = name }
        let payload = try await postTRPC("auth.appleSignIn", input: input)
        guard let root = payload as? [String: Any],
              let token = Self.string(root["token"]) else { throw VerifyError.decode }
        let user = root["user"] as? [String: Any]
        let session = ClipGuestSession(
            token: token,
            userId: Self.string(user?["id"]),
            name: Self.string(user?["name"]),
            email: Self.string(user?["email"]),
            isNewUser: (root["isNewUser"] as? Bool) ?? false
        )
        ClipAuthStore.store(displayName: session.name ?? name, userID: session.userId)
        ClipAuthStore.store(token: token)
        return session
    }

    /// Resolves the exact published Host Studio Party behind a clean Party Pass URL.
    func partyInvite(partyID: String) async throws -> PartyPassInvite {
        let payload = try await getTRPC("events.invite", input: ["partyId": partyID])
        guard let invite = PartyPassInvite.fromPayload(payload) else { throw VerifyError.decode }
        return invite
    }

    /// The public listing behind a shared Private Sale link. An ended, sold,
    /// cancelled or deleted sale fails like one that never existed.
    func saleListing(saleID: String) async throws -> ClipSaleListing {
        let payload = try await getTRPC("sales.view", input: ["saleId": saleID])
        guard let listing = ClipSaleListing.fromPayload(payload, expectedID: saleID) else { throw VerifyError.decode }
        return listing
    }

    /// What a scanned business code names. A mutation: the server counts every open.
    func openPatch(code: String) async throws -> ClipVendorPatch {
        let payload = try await postTRPC("inventory.openPatch", input: ["code": code])
        guard let patch = ClipVendorPatch.fromPayload(payload, expectedCode: code) else { throw VerifyError.decode }
        return patch
    }

    /// The Party resolver is the only client-action authority. The Clip may
    /// render its result but must never infer an RSVP, approval, or ticket CTA
    /// from the invite template or access mode.
    func resolvePartyPass(partyID: String) async throws -> ClipPartyPassState {
        let payload = try await getTRPC("events.pass.resolve", input: ["partyId": partyID])
        guard let state = Self.partyPassState(from: payload, expectedPartyID: partyID) else { throw VerifyError.decode }
        return state
    }

    /// The resolver contract must explicitly authorize access in `guest`.
    /// Never infer access from `action`: a partial or drifted response cannot
    /// unlock a personal attendee credential.
    static func partyPassState(from payload: Any, expectedPartyID: String) -> ClipPartyPassState? {
        guard let root = payload as? [String: Any],
              let resolvedPartyID = string(root["partyId"]), resolvedPartyID == expectedPartyID,
              let rawAction = string(root["action"]), let action = ClipPartyPassAction(rawValue: rawAction),
              let guest = root["guest"] as? [String: Any],
              let accessGranted = guest["accessGranted"] as? Bool else { return nil }
        return ClipPartyPassState(
            partyID: resolvedPartyID,
            action: action,
            guestStatus: string(guest["status"]) ?? "unknown",
            accessGranted: accessGranted,
            premiumMobilityEligible: (root["premiumMobilityEligible"] as? Bool) ?? false
        )
    }

    /// A bearer credential returned only to its authorized guest. The value is
    /// deliberately held in memory by the Party Pass view and must never be
    /// persisted, logged, included in a handoff URL, or placed on a share sheet.
    struct PartyAttendeeCredential: Equatable {
        let partyID: String
        let value: String
    }

    func partyAttendeeCredential(partyID: String) async throws -> PartyAttendeeCredential {
        let payload = try await postTRPC("events.pass.attendeeCredential", input: ["partyId": partyID])
        guard let credential = Self.partyAttendeeCredential(from: payload, expectedPartyID: partyID) else {
            throw VerifyError.decode
        }
        return credential
    }

    /// Accepts only the documented response, bound to the requested Party, and
    /// only a 32-byte Base64URL credential (43 characters without padding).
    /// Keeping this decoder strict prevents arbitrary server payload fields from
    /// becoming QR contents.
    static func partyAttendeeCredential(from payload: Any, expectedPartyID: String) -> PartyAttendeeCredential? {
        guard let root = payload as? [String: Any],
              let partyID = string(root["partyId"]), partyID == expectedPartyID,
              let value = string(root["attendeeCredential"]),
              isValidPartyAttendeeCredential(value) else { return nil }
        return PartyAttendeeCredential(partyID: partyID, value: value)
    }

    static func isValidPartyAttendeeCredential(_ value: String) -> Bool {
        value.count == 43 && value.unicodeScalars.allSatisfy {
            ($0.value >= 65 && $0.value <= 90) ||
            ($0.value >= 97 && $0.value <= 122) ||
            ($0.value >= 48 && $0.value <= 57) ||
            $0.value == 45 || $0.value == 95
        }
    }

    func createPartyRSVP(partyID: String, idempotencyKey: String) async throws -> String {
        let payload = try await postTRPC("events.rsvp.create", input: ["partyId": partyID, "idempotencyKey": idempotencyKey])
        guard let root = payload as? [String: Any], let status = Self.string(root["status"]) else { throw VerifyError.decode }
        return status
    }

    func createPartyTicketCheckout(partyID: String, ticketTierName: String, idempotencyKey: String) async throws -> URL {
        let payload = try await postTRPC("events.tickets.createCheckout", input: ["partyId": partyID, "ticketTierName": ticketTierName, "idempotencyKey": idempotencyKey])
        guard let url = Self.partyStripeCheckoutURL(from: payload) else { throw VerifyError.decode }
        return url
    }

    /// The server verifies both Party access and membership entitlement, then
    /// returns a provider URL based only on the host-bound registered venue.
    func createPartyArrivalHandoff(partyID: String, provider: ClipPartyHandoffProvider) async throws -> URL {
        let payload = try await postTRPC("events.arrival.handoff", input: ["partyId": partyID, "provider": provider.rawValue])
        guard let url = Self.partyArrivalHandoffURL(from: payload, provider: provider) else { throw VerifyError.decode }
        return url
    }

    static func partyArrivalHandoffURL(from payload: Any, provider: ClipPartyHandoffProvider) -> URL? {
        guard let root = payload as? [String: Any],
              Self.string(root["provider"]) == provider.rawValue,
              Self.string(root["trackingMode"]) == "handoff-only",
              let rawURL = Self.string(root["handoffUrl"]) else { return nil }
        return normalizedPartyHandoffURL(rawURL)
    }

    static func normalizedPartyHandoffURL(_ candidate: String) -> URL? {
        let value = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https" else { return nil }
        let host = components.host?.lowercased()
        if host == "m.uber.com", components.path == "/ul/" { return url }
        if host == "ride.lyft.com", components.path == "/u" { return url }
        return nil
    }

    /// Decodes only the documented Checkout response aliases, then routes every
    /// candidate through the Stripe-host validation below. A server response can
    /// use a session identifier or a hosted Checkout URL, but never an arbitrary
    /// redirect destination.
    static func partyStripeCheckoutURL(from payload: Any) -> URL? {
        guard let root = payload as? [String: Any] else { return nil }
        let checkout = root["checkout"] as? [String: Any]
        let candidates: [Any?] = [
            root["url"], root["checkoutUrl"], root["checkoutURL"], root["sessionId"], root["checkoutSessionId"],
            checkout?["url"], checkout?["checkoutUrl"], checkout?["sessionId"]
        ]
        for candidate in candidates {
            if let rawURL = Self.string(candidate), let url = normalizedStripeCheckoutURL(rawURL) { return url }
        }
        return nil
    }

    /// Party ticketing must only hand off to Stripe-hosted Checkout. Session IDs
    /// are normalized to Stripe's Checkout URL; arbitrary HTTPS redirects fail
    /// closed rather than being opened from the App Clip.
    static func normalizedStripeCheckoutURL(_ candidate: String) -> URL? {
        let value = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        if isStripeCheckoutSessionID(value) {
            return URL(string: "https://checkout.stripe.com/c/pay/\(value)")
        }
        guard let url = URL(string: value),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https",
              components.host?.lowercased() == "checkout.stripe.com",
              components.path.hasPrefix("/c/pay/") else { return nil }
        return url
    }

    private static func isStripeCheckoutSessionID(_ value: String) -> Bool {
        guard value.hasPrefix("cs_test_") || value.hasPrefix("cs_live_") else { return false }
        return value.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
    }

#if false // Legacy Group API retained for future extraction; not compiled into this Party App Clip.
    /// Join a private group event (`groupEvents.join`). Returns the resulting
    /// membership status: `"joined"` for open events or `"pending"` for
    /// approval-gated ones.
    func joinGroupEvent(eventId: String, message: String? = nil) async throws -> String {
        var input: [String: Any] = ["eventId": eventId]
        if let message, !message.isEmpty { input["message"] = message }
        let payload = try await postTRPC("groupEvents.join", input: input)
        guard let root = payload as? [String: Any],
              let status = Self.string(root["status"]) else { throw VerifyError.decode }
        return status
    }

    /// Fetch the joined guest list for an invite (`groupEvents.guests`).
    /// Used for pull-on-open rendering of real name + photo bubbles.
    func groupEventGuests(eventId: String) async throws -> ClipGroupEventGuestList {
        let payload = try await getTRPC("groupEvents.guests", input: ["eventId": eventId])
        guard let root = payload as? [String: Any] else { throw VerifyError.decode }
        let rows = (root["guests"] as? [[String: Any]]) ?? []
        let guests = rows.compactMap { row -> ClipGroupEventGuest? in
            guard let userId = Self.string(row["userId"]) else { return nil }
            let name = Self.string(row["name"]) ?? "Guest"
            return ClipGroupEventGuest(
                userId: userId,
                name: name,
                profileImage: Self.url(row["profileImage"]),
                initials: Self.string(row["initials"]) ?? String(name.prefix(1)).uppercased()
            )
        }
        return ClipGroupEventGuestList(
            eventId: Self.string(root["eventId"]) ?? eventId,
            count: Self.int(root["count"]) ?? guests.count,
            guests: guests
        )
    }
#endif

    private func getTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var components = URLComponents(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"), resolvingAgainstBaseURL: false)
        let inputData = try JSONSerialization.data(withJSONObject: input)
        components?.queryItems = [URLQueryItem(name: "input", value: String(data: inputData, encoding: .utf8))]
        guard let url = components?.url else { throw VerifyError.network("Bad URL") }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        if let token = Self.authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.timeoutInterval = 8
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else { throw VerifyError.server("HTTP \(http.statusCode)") }
        return try unwrapTRPCPayload(data)
    }

    private func postTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var req = URLRequest(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = Self.authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.timeoutInterval = 10
        req.httpBody = try JSONSerialization.data(withJSONObject: input)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                ?? "HTTP \(http.statusCode)"
            throw VerifyError.server(msg)
        }
        return try unwrapTRPCPayload(data)
    }

    private func unwrapTRPCPayload(_ data: Data) throws -> Any {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw VerifyError.decode }
        if let error = root["error"] as? [String: Any] {
            throw VerifyError.server(Self.string(error["message"]) ?? "Server error")
        }
        return Self.unwrapTRPCValue(root)
    }

    static func unwrapTRPCValue(_ value: Any) -> Any {
        guard let row = value as? [String: Any] else { return value }
        if let result = row["result"] { return unwrapTRPCValue(result) }
        if let data = row["data"] { return unwrapTRPCValue(data) }
        if let json = row["json"] { return unwrapTRPCValue(json) }
        return value
    }

    private static func string(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let value = value as? String, !value.isEmpty { return value }
        if let value = value as? NSNumber { return value.stringValue }
        return nil
    }

    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private static func url(_ value: Any?) -> URL? {
        guard let raw = string(value) else { return nil }
        return URL(string: raw)
    }

    private func string(_ value: Any?) -> String? { Self.string(value) }

    private static var authToken: String? { ClipAuthStore.token }
}
