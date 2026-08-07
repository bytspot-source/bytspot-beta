import Foundation
import Contacts

/// A contact-graph friend suggestion surfaced by `social.suggestions`.
/// Mirrors the server item shape (WS-Social Phase 1).
struct NativeFriendSuggestion: Identifiable, Equatable {
    let userId: String
    let name: String
    let relationshipStatus: String
    let circleIDs: [String]

    var id: String { userId }

    var reason: String {
        if relationshipStatus == "connected" { return "Connected" }
        if relationshipStatus == "invite_sent" { return "Invite sent" }
        if relationshipStatus == "invite_received" { return "Invited you" }
        return "Suggested from your contacts"
    }
}

/// Reads device contacts (permission-gated), hashes them with the shared
/// `BytspotContactHasher` contract, syncs the salted hashes via
/// `social.syncCloudContact`, and publishes ranked `social.suggestions`.
/// Raw contacts never leave the device — only salted SHA-256 hashes are sent.
@MainActor
final class BytspotContactSyncStore: ObservableObject {
    enum SyncPhase: Equatable { case idle, requesting, syncing, done, denied, failed }

    #if DEBUG
    static let previewSuggestionsEnvironmentKey = "BYT_NATIVE_CONTACT_PREVIEW"
    static let previewSuggestions: [NativeFriendSuggestion] = ranked([
        NativeFriendSuggestion(userId: "preview-incoming", name: "Kofi Mensah", relationshipStatus: "invite_received", circleIDs: []),
        NativeFriendSuggestion(userId: "preview-connected", name: "Nia Parker", relationshipStatus: "connected", circleIDs: ["starter-weekend"]),
        NativeFriendSuggestion(userId: "preview-suggested", name: "Ama at Akwaaba", relationshipStatus: "suggested", circleIDs: [])
    ])
    #endif

    @Published private(set) var suggestions: [NativeFriendSuggestion] = []
    @Published private(set) var phase: SyncPhase = .idle
    @Published private(set) var lastSummary: String?

    /// Load ranked suggestions for the signed-in user. Fails safe to empty.
    func refresh(sessionStore: BytspotSessionStore) async {
        guard NativeMigrationConfig.isNativeRootEnabled else {
            suggestions = []
            return
        }
        #if DEBUG
        if Self.previewSuggestionsRequested {
            suggestions = Self.previewSuggestions
            phase = .done
            lastSummary = "Preview contact graph · 3 suggestions"
            return
        }
        #endif
        guard sessionStore.isAuthenticated else {
            suggestions = []
            return
        }
        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            let payload = try await client.json(path: "/trpc/social.suggestions")
            suggestions = Self.ranked((Self.findArray(named: "items", in: payload) ?? []).compactMap(Self.suggestion(from:)))
        } catch {
            suggestions = []
        }
    }

    /// Request Contacts access, hash the address book, sync, then refresh.
    func syncDeviceContacts(sessionStore: BytspotSessionStore) async {
        guard sessionStore.isAuthenticated else { phase = .failed; return }
        let store = CNContactStore()
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .denied, .restricted:
            phase = .denied
            return
        case .notDetermined:
            phase = .requesting
            let granted = await Self.requestAccess(store)
            guard granted else { phase = .denied; return }
        default:
            break
        }

        phase = .syncing
        let hashes = await Task.detached(priority: .userInitiated) { Self.collectHashes() }.value
        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        let body = try? JSONSerialization.data(withJSONObject: ["source": "apple", "hashes": hashes])
        do {
            let payload = try await client.json(path: "/trpc/social.syncCloudContact", method: "POST", body: body)
            let matched = Self.findInt(named: "matched", in: payload) ?? 0
            let mutual = Self.findInt(named: "mutual", in: payload) ?? 0
            lastSummary = "Scanned \(hashes.count) · matched \(matched) · \(mutual) mutual"
            phase = .done
            await refresh(sessionStore: sessionStore)
        } catch {
            phase = .failed
        }
    }

    // MARK: - Contacts → hashes (runs off the main actor)

    private nonisolated static func collectHashes() -> [String] {
        let store = CNContactStore()
        let keys = [CNContactEmailAddressesKey, CNContactPhoneNumbersKey] as [CNKeyDescriptor]
        let request = CNContactFetchRequest(keysToFetch: keys)
        var hashes = Set<String>()
        do {
            try store.enumerateContacts(with: request) { contact, _ in
                for email in contact.emailAddresses {
                    if let h = BytspotContactHasher.hashEmail(email.value as String) { hashes.insert(h) }
                }
                for phone in contact.phoneNumbers {
                    if let h = BytspotContactHasher.hashPhone(phone.value.stringValue) { hashes.insert(h) }
                }
            }
        } catch {
            // Best-effort: sync whatever was collected before the failure.
        }
        return Array(hashes)
    }

    private nonisolated static func requestAccess(_ store: CNContactStore) async -> Bool {
        await withCheckedContinuation { continuation in
            store.requestAccess(for: .contacts) { granted, _ in continuation.resume(returning: granted) }
        }
    }

    // MARK: - tRPC envelope parsing (tolerates plain + superjson shapes)

    static func suggestion(from value: Any) -> NativeFriendSuggestion? {
        guard let item = value as? [String: Any], let userId = item["userId"] as? String else { return nil }
        return NativeFriendSuggestion(
            userId: userId,
            name: (item["name"] as? String) ?? "Bytspot member",
            relationshipStatus: ["connected", "invite_sent", "invite_received"].contains(item["relationshipStatus"] as? String ?? "") ? item["relationshipStatus"] as! String : "suggested",
            circleIDs: (item["circleIds"] as? [Any] ?? []).map(String.init(describing:))
        )
    }

    nonisolated static func ranked(_ suggestions: [NativeFriendSuggestion]) -> [NativeFriendSuggestion] {
        suggestions.sorted { lhs, rhs in
            let priority = ["invite_received": 0, "connected": 1, "suggested": 2, "invite_sent": 3]
            if priority[lhs.relationshipStatus] != priority[rhs.relationshipStatus] { return priority[lhs.relationshipStatus, default: 2] < priority[rhs.relationshipStatus, default: 2] }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    #if DEBUG
    static var previewSuggestionsRequested: Bool {
        let raw = ProcessInfo.processInfo.environment[previewSuggestionsEnvironmentKey]?.lowercased()
        return raw == "1" || raw == "true" || raw == "suggestions"
    }
    #endif

    static func findArray(named name: String, in value: Any) -> [Any]? {
        guard let dict = value as? [String: Any] else { return value as? [Any] }
        if let array = dict[name] as? [Any] { return array }
        for child in dict.values { if let found = findArray(named: name, in: child) { return found } }
        return nil
    }

    static func findInt(named name: String, in value: Any) -> Int? {
        guard let dict = value as? [String: Any] else { return nil }
        if let number = dict[name] as? NSNumber { return number.intValue }
        for child in dict.values { if let found = findInt(named: name, in: child) { return found } }
        return nil
    }
}
