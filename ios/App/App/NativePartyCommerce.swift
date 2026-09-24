import SwiftUI
import UIKit
import CoreImage.CIFilterBuiltins
import CryptoKit

// These DTOs deliberately mirror the wire contract, not the invitation's
// editorial model. In particular a receipt, a session claim and admission
// are three independent facts.
struct NativePartyAdmission: Decodable, Equatable {
    struct Guest: Decodable, Equatable { let status: String; let accessGranted: Bool }
    let partyId: String
    let action: String
    let guest: Guest

    var confirmed: Bool { action == "view-pass" && guest.accessGranted && guest.status != "host" }
    var canChooseTicket: Bool { action == "ticket" && !guest.accessGranted }
    var canChooseSession: Bool { confirmed || canChooseTicket }
    var canRSVP: Bool { ["rsvp", "request-approval"].contains(action) && !guest.accessGranted }
    var statusLabel: String {
        switch guest.status {
        case "pending": return "Awaiting host approval — not admitted"
        case "declined": return "The host declined this request"
        case "refund-required": return "Refund required — contact the host"
        case "membership-required": return "Your membership does not meet the entry requirement"
        case "checkout-pending": return "Payment pending — admission is not confirmed"
        case "host": return "You host this party"
        default: return confirmed ? "Admission confirmed" : "Admission not confirmed"
        }
    }
}

struct NativePartyCommerceOffer: Decodable {
    struct Ticket: Decodable, Identifiable {
        let name: String
        let priceCents: Int
        let quantity: Int
        let requiredMembershipTier: String?
        var id: String { name }
    }
    struct Session: Decodable, Identifiable {
        let id: String
        let name: String
        let startsAt: String
        let endsAt: String
        let priceCents: Int
        let bottleCount: Int
        let bottleTerms: String
        let remaining: Int
        let state: String
        let requiredMembershipTier: String?
        func available(now: Date = Date()) -> Bool {
            state == "open" && remaining > 0 && priceCents > 0 && bottleCount >= 0
                && ["included", "minimum"].contains(bottleTerms)
                && (NativeAccountDeletionFormat.date(fromISO: startsAt).map { $0 > now } ?? false)
        }
        var terms: String {
            bottleTerms == "minimum" ? "\(bottleCount)-bottle minimum; bottles charged separately" : "\(bottleCount) bottles included"
        }
    }
    let id: String
    let accessMode: String
    let ticketTiers: [Ticket]
    let sessions: [Session]
}

struct NativePartyCommerceParty: Decodable {
    let id: String
    let title: String
    let startsAt: String
    let endsAt: String?
    let isPast: Bool
    let closed: Bool
}
struct NativePartyCommerceSession: Decodable {
    let id: String
    let name: String
    let startsAt: String
    let endsAt: String
    let bottleCount: Int
    let bottleTerms: String
    let withdrawn: Bool
}
struct NativePartyCommercePass: Decodable, Identifiable {
    let id: String
    let status: String
    let accessGranted: Bool
    let ticketTierName: String?
    let checkedInAt: String?
    let party: NativePartyCommerceParty
}
struct NativePartyCommercePurchase: Decodable, Identifiable {
    let id: String
    let status: String
    let retryKey: String
    let ticketTierName: String?
    let amountCents: Int
    let sessionAmountCents: Int
    let currency: String
    let reservationExpiresAt: String
    let reservationElapsed: Bool
    let completedAt: String?
    let party: NativePartyCommerceParty
    let session: NativePartyCommerceSession?
    var selection: NativePartyCommerceSelection {
        .init(ticketTierName: ticketTierName, sessionID: session?.id)
    }
    func canResume(admission: NativePartyAdmission, now: Date = Date()) -> Bool {
        guard party.id == admission.partyId, !party.closed, !party.isPast,
              ["creating", "pending"].contains(status), !reservationElapsed,
              UUID(uuidString: retryKey) != nil,
              let expiry = NativeAccountDeletionFormat.date(fromISO: reservationExpiresAt), expiry > now,
              selection.canRetry(admission: admission) else { return false }
        if let session {
            guard !session.withdrawn,
                  let starts = NativeAccountDeletionFormat.date(fromISO: session.startsAt), starts > now else { return false }
        }
        return true
    }
    var statusLabel: String {
        switch status {
        case "completed": return "Payment confirmed"
        case "creating", "pending": return reservationElapsed ? "Reservation elapsed — payment not confirmed" : "Payment pending"
        case "expired": return "Checkout expired"
        case "refund-required": return "Refund required — contact the host"
        case "refunded": return "Refunded"
        default: return "Payment status unavailable"
        }
    }
}
struct NativePartyCommerceClaim: Decodable, Identifiable {
    let id: String
    let state: String
    let party: NativePartyCommerceParty
    let session: NativePartyCommerceSession
    var statusLabel: String {
        switch state {
        case "held": return "Session held"
        case "released": return "Session released"
        default: return "Session status unavailable"
        }
    }
}
struct NativePartyCommercePage: Decodable {
    let kind: String
    let passes: [NativePartyCommercePass]?
    let purchases: [NativePartyCommercePurchase]?
    let claims: [NativePartyCommerceClaim]?
    let nextCursor: String?
}

struct NativePartyCommerceSelection: Equatable, Codable {
    var ticketTierName: String?
    var sessionID: String?
    var isEmpty: Bool { ticketTierName == nil && sessionID == nil }
    func input(partyID: String, key: UUID) -> [String: Any] {
        var input: [String: Any] = ["partyId": partyID, "idempotencyKey": key.uuidString.lowercased()]
        if let ticketTierName { input["ticketTierName"] = ticketTierName }
        if let sessionID { input["sessionId"] = sessionID }
        return input
    }
    // Retrying an exact UUID/selection is not a new inventory selection. The
    // authenticated checkout endpoint rechecks expiry, withdrawal and payment.
    func canRetry(admission: NativePartyAdmission) -> Bool {
        guard !isEmpty, !["host", "declined", "refund-required", "membership-required"].contains(admission.guest.status) else { return false }
        if ticketTierName != nil { return admission.canChooseTicket }
        return sessionID != nil && admission.confirmed
    }
    func isAllowed(admission: NativePartyAdmission, offer: NativePartyCommerceOffer) -> Bool {
        guard !isEmpty, admission.partyId == offer.id else { return false }
        if let ticketTierName {
            guard admission.canChooseTicket, offer.ticketTiers.contains(where: { $0.name == ticketTierName && $0.priceCents > 0 && $0.quantity > 0 }) else { return false }
        }
        if let sessionID {
            guard admission.canChooseSession, offer.sessions.contains(where: { $0.id == sessionID && $0.available() }) else { return false }
            // Never sell bottles to an unadmitted guest while silently omitting
            // the paid door. Confirmed guests explicitly buy only the session.
            guard admission.confirmed || ticketTierName != nil else { return false }
        }
        return true
    }
}

enum NativePartyCommerceFormat {
    static func money(_ cents: Int, currency: String = "usd") -> String {
        (Double(cents) / 100).formatted(.currency(code: currency.uppercased()))
    }
    static func date(_ raw: String) -> String {
        NativeAccountDeletionFormat.date(fromISO: raw)?.formatted(date: .abbreviated, time: .shortened) ?? "Date unavailable"
    }
    /// Exact Stripe checkout origin only: no suffix matching, user-info,
    /// alternate ports, protocol-relative URLs or backslash normalization.
    static func checkoutURL(_ raw: String) -> URL? {
        guard !raw.contains("\\"), !raw.contains(where: { $0.isWhitespace }),
              let parts = URLComponents(string: raw), parts.scheme?.lowercased() == "https",
              parts.host?.lowercased() == "checkout.stripe.com",
              parts.user == nil, parts.password == nil, parts.port == nil || parts.port == 443,
              parts.path.hasPrefix("/c/pay/") || parts.path.hasPrefix("/pay/") else { return nil }
        return parts.url
    }
}

/// In-memory only. Even a legacy response without expiry has a bounded display
/// lifetime; malformed or elapsed server expiry must never fall back to it.
struct NativePartyCommerceCredential {
    let value: String
    let expiresAt: Date
    static let maximumDisplayLifetime: TimeInterval = 60
    static func displayDeadline(_ raw: Any?, requestedAt: Date, now: Date) -> Date? {
        let bound = requestedAt.addingTimeInterval(maximumDisplayLifetime)
        guard let raw else { return bound > now ? bound : nil }
        guard let text = raw as? String,
              let expiry = NativeAccountDeletionFormat.date(fromISO: text) else { return nil }
        let deadline = min(expiry, bound)
        return deadline > now ? deadline : nil
    }
    func isValid(now: Date = Date()) -> Bool { now < expiresAt }
}

struct NativePartyCommerceAPI {
    let client: BytspotAPIClient
    static func decode<T: Decodable>(_ type: T.Type, _ payload: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: payload))
    }
    func admission(_ partyID: String) async throws -> NativePartyAdmission {
        let value = try await client.trpcQueryPayload(path: "/trpc/events.pass.resolve", input: ["partyId": partyID])
        let result = try Self.decode(NativePartyAdmission.self, value)
        guard result.partyId == partyID else { throw BytspotAPIClient.APIError.invalidResponse }
        return result
    }
    func offer(_ partyID: String) async throws -> NativePartyCommerceOffer {
        let value = try await client.trpcQueryPayload(path: "/trpc/events.invite", input: ["partyId": partyID])
        let result = try Self.decode(NativePartyCommerceOffer.self, value)
        guard result.id == partyID else { throw BytspotAPIClient.APIError.invalidResponse }
        return result
    }
    func rsvp(_ partyID: String, key: UUID) async throws {
        // The returned mutation is not a pass. Resolve again after it settles.
        _ = try await client.trpcPayload(path: "/trpc/events.rsvp.create", method: "POST", input: ["partyId": partyID, "idempotencyKey": key.uuidString.lowercased()])
    }
    func checkout(_ partyID: String, selection: NativePartyCommerceSelection, key: UUID) async throws -> URL {
        guard !selection.isEmpty else { throw BytspotAPIClient.APIError.invalidResponse }
        let payload = try await client.trpcPayload(path: "/trpc/events.tickets.createCheckout", method: "POST", input: selection.input(partyID: partyID, key: key))
        guard let raw = (payload as? [String: Any])?["url"] as? String,
              let url = NativePartyCommerceFormat.checkoutURL(raw) else { throw BytspotAPIClient.APIError.invalidURL }
        return url
    }
    func mine(_ kind: String, cursor: String? = nil, partyID: String? = nil) async throws -> NativePartyCommercePage {
        var input: [String: Any] = ["kind": kind, "limit": 25]
        if let cursor { input["cursor"] = cursor }
        if let partyID { input["partyId"] = partyID }
        let page = try Self.decode(NativePartyCommercePage.self, await client.trpcQueryPayload(path: "/trpc/events.commerce.mine", input: input))
        guard page.kind == kind,
              (kind != "passes" || page.passes != nil),
              (kind != "purchases" || page.purchases != nil),
              (kind != "claims" || page.claims != nil) else { throw BytspotAPIClient.APIError.invalidResponse }
        return page
    }
    func credential(_ partyID: String) async throws -> NativePartyCommerceCredential {
        let requestedAt = Date()
        let payload = try await client.trpcPayload(path: "/trpc/events.pass.attendeeCredential", method: "POST", input: ["partyId": partyID])
        guard let row = payload as? [String: Any], row["partyId"] as? String == partyID,
              let value = row["attendeeCredential"] as? String, value != partyID,
              (43...2048).contains(value.utf8.count),
              let range = value.range(of: "^(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)+)$", options: .regularExpression),
              range == value.startIndex..<value.endIndex,
              let expiry = NativePartyCommerceCredential.displayDeadline(row["expiresAt"], requestedAt: requestedAt, now: Date()) else { throw BytspotAPIClient.APIError.invalidResponse }
        return NativePartyCommerceCredential(value: value, expiresAt: expiry)
    }
}

/// Only UUID retry keys are persisted, never auth, URLs, pass credentials or
/// purchase history. A network error or cancelled browser never rotates a key.
@MainActor
struct NativePartyCommerceRetries {
    var defaults: UserDefaults = .standard
    private func storageKey(userID: String, partyID: String, selection: NativePartyCommerceSelection) -> String {
        let parts = [userID, partyID, selection.ticketTierName ?? "", selection.sessionID ?? ""]
        let data = (try? JSONEncoder().encode(parts)) ?? Data()
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return "native.party.commerce.retry.\(hash)"
    }
    func existingKey(userID: String, partyID: String, selection: NativePartyCommerceSelection) -> UUID? {
        defaults.string(forKey: storageKey(userID: userID, partyID: partyID, selection: selection)).flatMap(UUID.init(uuidString:))
    }
    // Server-authenticated pending rows recover across devices. An existing local
    // UUID also recovers a lost response, even if the ledger is unavailable or
    // paginated. Never mint a UUID in this lookup or silently turn retry into new.
    func recoveryKey(userID: String, partyID: String, selection: NativePartyCommerceSelection,
                     admission: NativePartyAdmission, purchases: [NativePartyCommercePurchase], now: Date = Date()) -> UUID? {
        guard admission.partyId == partyID, selection.canRetry(admission: admission) else { return nil }
        let matching = purchases.filter { $0.party.id == partyID && $0.selection == selection }
        if let pending = matching.first(where: { $0.canResume(admission: admission, now: now) }),
           let key = UUID(uuidString: pending.retryKey) { return key }
        guard let local = existingKey(userID: userID, partyID: partyID, selection: selection) else { return nil }
        // A known terminal/elapsed row is not a lost response.
        guard !matching.contains(where: { UUID(uuidString: $0.retryKey) == local }) else { return nil }
        return local
    }
    func remember(_ key: UUID, userID: String, partyID: String, selection: NativePartyCommerceSelection) {
        defaults.set(key.uuidString, forKey: storageKey(userID: userID, partyID: partyID, selection: selection))
    }
    func key(userID: String, partyID: String, selection: NativePartyCommerceSelection) -> UUID {
        let storage = storageKey(userID: userID, partyID: partyID, selection: selection)
        if let raw = defaults.string(forKey: storage), let existing = UUID(uuidString: raw) { return existing }
        let key = UUID()
        defaults.set(key.uuidString, forKey: storage)
        return key
    }
    func reconcile(userID: String, purchases: [NativePartyCommercePurchase]) {
        for purchase in purchases where ["completed", "expired", "refunded"].contains(purchase.status) {
            let selection = NativePartyCommerceSelection(ticketTierName: purchase.ticketTierName, sessionID: purchase.session?.id)
            let storage = storageKey(userID: userID, partyID: purchase.party.id, selection: selection)
            // A late receipt must never erase a newer purchase's retry key.
            if defaults.string(forKey: storage)?.lowercased() == purchase.retryKey.lowercased() {
                defaults.removeObject(forKey: storage)
            }
        }
    }
}

/// Captured per request, never read lazily by a client after an account switch.
struct NativePartyCommerceScope: Equatable {
    let userID: String?
    let authorization: String?
    @MainActor init(_ store: BytspotSessionStore) {
        userID = store.authenticatedUserID
        authorization = store.canAttachBearerToken ? store.token : nil
    }
    init(userID: String?, authorization: String?) { self.userID = userID; self.authorization = authorization }
    var signedIn: Bool { userID != nil && authorization?.isEmpty == false }
    var client: BytspotAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return BytspotAPIClient(tokenProvider: { authorization }, urlSession: URLSession(configuration: configuration))
    }
}
struct NativePartyCommerceLoadKey: Equatable {
    let scope: NativePartyCommerceScope
    let revision: UUID
    var partyID: String? = nil
}
struct NativePartyCommerceGeneration {
    private(set) var id = UUID()
    mutating func invalidate() { id = UUID() }
    func accepts(_ candidate: UUID, captured: NativePartyCommerceScope, current: NativePartyCommerceScope) -> Bool {
        id == candidate && captured == current
    }
}

/// Admission and checkout controls embedded in the invitation. No QR here.
@MainActor
struct NativePartyCommerceControls: View {
    let partyID: String
    var openAuth: (() -> Void)? = nil
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var admission: NativePartyAdmission?
    @State private var offer: NativePartyCommerceOffer?
    @State private var selection = NativePartyCommerceSelection()
    @State private var purchases: [NativePartyCommercePurchase] = []
    @State private var loadedScope: NativePartyCommerceScope?
    @State private var generation = NativePartyCommerceGeneration()
    @State private var revision = UUID()
    @State private var busy = false
    @State private var message = ""
    @State private var operation: Task<Void, Never>?
    private var scope: NativePartyCommerceScope { NativePartyCommerceScope(sessionStore) }
    private var current: Bool { loadedScope == scope }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Admission & purchases").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            if !scope.signedIn {
                Text("Sign in to RSVP or buy admission and tables. Your personal pass will be in Profile → Bookings / Wallet.").font(.subheadline)
                if let openAuth { Button("Sign in", action: openAuth).frame(minHeight: 44) }
            } else if current, let admission, let offer {
                Text(admission.statusLabel).font(.headline)
                if admission.canRSVP {
                    Button(admission.action == "request-approval" ? "Request host approval" : "Confirm free RSVP") { startRSVP() }
                        .buttonStyle(.borderedProminent).frame(minHeight: 44).disabled(busy)
                    Text("Confirm admission first. Tables are an optional, separate purchase.").font(.footnote)
                }
                if admission.canChooseTicket {
                    Text("1. Choose admission").font(.headline)
                    ForEach(offer.ticketTiers.filter { $0.priceCents > 0 && $0.quantity > 0 }) { tier in
                        choice("\(tier.name) · \(NativePartyCommerceFormat.money(tier.priceCents))", selected: selection.ticketTierName == tier.name) {
                            selection.ticketTierName = selection.ticketTierName == tier.name ? nil : tier.name
                        }
                        if let required = tier.requiredMembershipTier { Text("\(required.capitalized) membership required").font(.caption) }
                    }
                }
                if admission.canChooseSession && !offer.sessions.isEmpty {
                    Text(admission.confirmed ? "Choose a table or session" : "2. Optional table or session").font(.headline)
                    Text("A table is not admission. No table is selected automatically.").font(.footnote)
                    choice("No table or session", selected: selection.sessionID == nil) { selection.sessionID = nil }
                    ForEach(offer.sessions) { session in
                        VStack(alignment: .leading, spacing: 4) {
                            choice("\(session.name) · \(NativePartyCommerceFormat.money(session.priceCents))", selected: selection.sessionID == session.id) {
                                selection.sessionID = session.id
                            }.disabled(!session.available() && recoveryKey(for: .init(ticketTierName: selection.ticketTierName, sessionID: session.id)) == nil)
                            Text(session.terms).font(.subheadline)
                            Text("\(NativePartyCommerceFormat.date(session.startsAt)) – \(NativePartyCommerceFormat.date(session.endsAt))").font(.footnote)
                            Text(session.available() ? "\(session.remaining) available" : "Unavailable for a new purchase; existing checkout retries are checked by the server.").font(.footnote)
                            if let required = session.requiredMembershipTier { Text("\(required.capitalized) membership required").font(.caption) }
                        }
                    }
                }
                ForEach(purchases.filter { $0.canResume(admission: admission) }) { purchase in
                    VStack(alignment: .leading, spacing: 4) {
                        Text([purchase.ticketTierName, purchase.session?.name].compactMap { $0 }.joined(separator: " + "))
                        Text("Pending · \(NativePartyCommerceFormat.money(purchase.amountCents, currency: purchase.currency))").font(.footnote)
                        Button("Resume pending checkout") { startCheckout(resuming: purchase) }
                            .frame(minHeight: 48).disabled(busy)
                    }
                }
                if !selection.isEmpty {
                    Text(summary(offer)).font(.headline)
                    Button(hasPreviousAttempt ? "Retry previous checkout" : "Continue to secure checkout") { startCheckout() }
                        .buttonStyle(.borderedProminent).frame(minHeight: 48)
                        .disabled(busy || (recoveryKey(for: selection) == nil && (hasPreviousAttempt || !selection.isAllowed(admission: admission, offer: offer))))
                    Text("Stripe will show the final charge. Returning here does not confirm payment; we check the server.").font(.footnote)
                }
                Text("Personal door passes and purchase records are in Profile → Bookings / Wallet.").font(.footnote)
                Button("Refresh admission & availability") { refresh() }.frame(minHeight: 44).disabled(busy)
            } else if message.isEmpty {
                ProgressView("Checking admission…")
            }
            if busy { ProgressView("Please wait…") }
            if !message.isEmpty {
                Text(message).font(.subheadline).accessibilityIdentifier("native-party-commerce-message")
                if !busy { Button("Refresh", action: refresh).frame(minHeight: 44) }
            }
        }
        .disabled(busy)
        .task(id: NativePartyCommerceLoadKey(scope: scope, revision: revision, partyID: partyID)) { await load() }
        .onChange(of: scenePhase) { phase in if phase == .active { refresh() } }
        .onDisappear { operation?.cancel(); generation.invalidate(); admission = nil; offer = nil; loadedScope = nil; busy = false }
        .accessibilityIdentifier("native-party-commerce-controls")
    }

    private func choice(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .top) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                Text(title).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }.frame(minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }
    private func summary(_ offer: NativePartyCommerceOffer) -> String {
        let ticket = offer.ticketTiers.first { $0.name == selection.ticketTierName }
        let session = offer.sessions.first { $0.id == selection.sessionID }
        let amount = (ticket?.priceCents ?? 0) + (session?.priceCents ?? 0)
        let contents = ticket == nil ? "Session only — no admission charge" : (session == nil ? "Admission only" : "Admission + session")
        return "\(contents) · \(NativePartyCommerceFormat.money(amount))\(session?.bottleTerms == "minimum" ? " + bottles" : "")"
    }
    private var hasPreviousAttempt: Bool {
        guard let userID = scope.userID else { return false }
        return recoveryKey(for: selection) != nil || NativePartyCommerceRetries().existingKey(userID: userID, partyID: partyID, selection: selection) != nil
    }
    private func recoveryKey(for chosen: NativePartyCommerceSelection) -> UUID? {
        guard current, let admission, let userID = scope.userID else { return nil }
        return NativePartyCommerceRetries().recoveryKey(userID: userID, partyID: partyID, selection: chosen, admission: admission, purchases: purchases)
    }
    private func refresh() {
        operation?.cancel(); generation.invalidate(); admission = nil; offer = nil; busy = false
        revision = UUID()
    }
    @MainActor private func load() async {
        let captured = scope
        generation.invalidate()
        let request = generation.id
        if loadedScope != captured { selection = NativePartyCommerceSelection() }
        loadedScope = captured; admission = nil; offer = nil; purchases = []; message = ""; busy = false
        guard captured.signedIn else { return }
        do {
            let api = NativePartyCommerceAPI(client: captured.client)
            async let state = api.admission(partyID)
            async let inventory = api.offer(partyID)
            async let receipts = try? api.mine("purchases", partyID: partyID)
            let (stateValue, offerValue, page) = try await (state, inventory, receipts)
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            admission = stateValue; offer = offerValue
            // Never turn a combined retry into a new session-only purchase when
            // admission changes. The original tuple is indivisible.
            if !selection.canRetry(admission: stateValue) { selection = NativePartyCommerceSelection() }
            // Receipt reconciliation is best-effort; it never creates admission.
            purchases = (page?.purchases ?? []).filter { $0.party.id == partyID }
            if let userID = captured.userID {
                NativePartyCommerceRetries().reconcile(userID: userID, purchases: purchases)
            }
        } catch {
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            message = "Admission and availability could not be checked. Refresh before purchasing."
        }
    }
    private func startRSVP() {
        guard !busy, current, admission?.canRSVP == true, let userID = scope.userID else { return }
        let captured = scope, request = generation.id
        let key = NativePartyCommerceRetries().key(userID: userID, partyID: partyID, selection: NativePartyCommerceSelection())
        busy = true; message = ""
        operation = Task { @MainActor in
            do {
                try await NativePartyCommerceAPI(client: captured.client).rsvp(partyID, key: key)
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                await load()
            } catch {
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                busy = false; message = "Your RSVP could not be verified. Refresh or retry; a request is not admission."
            }
        }
    }
    private func startCheckout(resuming purchase: NativePartyCommercePurchase? = nil) {
        guard !busy, current, let admission, let offer, let userID = scope.userID else { return }
        let captured = scope, request = generation.id, chosen = purchase?.selection ?? selection
        let retries = NativePartyCommerceRetries()
        let recovered: UUID?
        if let purchase {
            guard purchase.party.id == partyID, purchase.canResume(admission: admission) else { return }
            recovered = UUID(uuidString: purchase.retryKey)
        } else { recovered = recoveryKey(for: chosen) }
        guard recovered != nil || (retries.existingKey(userID: userID, partyID: partyID, selection: chosen) == nil && chosen.isAllowed(admission: admission, offer: offer)) else { return }
        let key = recovered ?? retries.key(userID: userID, partyID: partyID, selection: chosen)
        retries.remember(key, userID: userID, partyID: partyID, selection: chosen)
        busy = true; message = ""
        operation = Task { @MainActor in
            do {
                let api = NativePartyCommerceAPI(client: captured.client)
                // Resolve again at intent time, not from an old card or redirect.
                let state = try await api.admission(partyID)
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                let allowed = recovered != nil
                    ? (chosen.canRetry(admission: state) && (purchase?.canResume(admission: state) ?? true))
                    : chosen.isAllowed(admission: state, offer: offer)
                guard allowed else {
                    busy = false; message = "Admission changed. Refresh before continuing."; return
                }
                let url = try await api.checkout(partyID, selection: chosen, key: key)
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                message = "Checkout opened. Payment is not confirmed yet. Check Profile for the server's purchase status."
                let opened = await UIApplication.shared.open(url)
                guard generation.accepts(request, captured: captured, current: scope) else { return }
                busy = false
                if !opened { message = "Checkout could not open. Retry safely with the same purchase selection." }
            } catch {
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                busy = false
                message = "Checkout could not be verified. No admission or table is confirmed here. Check Profile purchases before retrying the same selection."
            }
        }
    }
}

/// Public insertion point for both Profile Bookings and Wallet. It supplies
/// its own modal navigation, so it also works outside a navigation container.
@MainActor
public struct NativePartyWalletSection: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var presented = false
    public init() {}
    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Party passes & purchases").font(.headline)
            Text("Admission, tables and payment status — kept separately.").font(.subheadline)
            Button("View my parties") { presented = true }.frame(minHeight: 44)
                .disabled(!sessionStore.canAttachBearerToken)
        }
        .sheet(isPresented: $presented) {
            NavigationView {
                NativePartyWalletView()
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { presented = false } } }
            }.navigationViewStyle(.stack).environmentObject(sessionStore)
        }
        .accessibilityIdentifier("native-party-wallet-section")
    }
}

@MainActor
struct NativePartyWalletView: View {
    var partyID: String? = nil
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var passes: [NativePartyCommercePass] = []
    @State private var purchases: [NativePartyCommercePurchase] = []
    @State private var claims: [NativePartyCommerceClaim] = []
    @State private var cursors: [String: String] = [:]
    @State private var loadedScope: NativePartyCommerceScope?
    @State private var generation = NativePartyCommerceGeneration()
    @State private var revision = UUID()
    @State private var loading = false
    @State private var message = ""
    @State private var pageTask: Task<Void, Never>?
    private var scope: NativePartyCommerceScope { NativePartyCommerceScope(sessionStore) }

    var body: some View {
        List {
            if !scope.signedIn { Text("Sign in to retrieve your personal passes and purchases.") }
            else if loadedScope == scope {
                passSection("Upcoming passes", past: false)
                passSection("Past passes", past: true)
                Section("Purchases — not door passes") {
                    if purchases.isEmpty && !loading { Text("No purchases on this page.") }
                    ForEach(purchases) { purchase in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(purchase.party.title).font(.headline)
                            Text("\(purchase.party.isPast ? "Past party" : "Upcoming / current party") · \(NativePartyCommerceFormat.date(purchase.party.startsAt))").font(.footnote)
                            Text(purchase.session?.name ?? purchase.ticketTierName ?? "Purchase")
                            Text(purchase.statusLabel).font(.subheadline.weight(.semibold))
                            Text(NativePartyCommerceFormat.money(purchase.amountCents, currency: purchase.currency))
                            if purchase.ticketTierName != nil && purchase.session != nil {
                                Text("Admission: \(NativePartyCommerceFormat.money(purchase.amountCents - purchase.sessionAmountCents, currency: purchase.currency)) · Session: \(NativePartyCommerceFormat.money(purchase.sessionAmountCents, currency: purchase.currency))").font(.footnote)
                            }
                            if let session = purchase.session { sessionDetails(session) }
                            NavigationLink("Check personal admission") { NativePartyPersonalPassView(partyID: purchase.party.id) }
                        }.padding(.vertical, 4)
                    }
                    more("purchases")
                }
                Section("Session claims — separate from admission") {
                    if claims.isEmpty && !loading { Text("No session claims on this page.") }
                    ForEach(claims) { claim in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(claim.party.title).font(.headline)
                            Text(claim.party.isPast ? "Past party" : "Upcoming / current party").font(.footnote)
                            Text(claim.session.name)
                            Text(claim.statusLabel).font(.subheadline.weight(.semibold))
                            sessionDetails(claim.session)
                        }.padding(.vertical, 4)
                    }
                    more("claims")
                }
                if passes.isEmpty && !loading { Text("No confirmed passes on this page. Pending purchases do not grant admission.") }
                more("passes")
            }
            if loading { ProgressView("Retrieving your records…") }
            if !message.isEmpty { Text(message) }
            Button("Refresh records") { revision = UUID() }.disabled(loading)
        }
        .navigationTitle("My parties")
        .task(id: NativePartyCommerceLoadKey(scope: scope, revision: revision, partyID: partyID)) { await load() }
        .refreshable { await load() }
        .onChange(of: scenePhase) { if $0 == .active { revision = UUID() } }
        // Keep navigation-link rows while a personal pass is pushed. Removing
        // their source rows on disappear can pop NavigationView's destination.
        // Account changes still hide them immediately through loadedScope.
        .onDisappear { pageTask?.cancel(); generation.invalidate(); loading = false }
    }
    private func passSection(_ title: String, past: Bool) -> some View {
        Section(title) {
            ForEach(passes.filter { $0.party.isPast == past }) { pass in
                NavigationLink {
                    NativePartyPersonalPassView(partyID: pass.party.id)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(pass.party.title).font(.headline)
                        Text(NativePartyCommerceFormat.date(pass.party.startsAt)).font(.subheadline)
                        Text(pass.checkedInAt == nil ? "Admission record — open to verify pass" : "Checked in").font(.footnote)
                        if pass.party.closed { Text("Room closed").font(.footnote) }
                    }
                }
            }
        }
    }
    private func sessionDetails(_ session: NativePartyCommerceSession) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(NativePartyCommerceFormat.date(session.startsAt)) – \(NativePartyCommerceFormat.date(session.endsAt))")
            Text(session.bottleTerms == "minimum" ? "\(session.bottleCount)-bottle minimum; bottles charged separately" : (session.bottleTerms == "included" ? "\(session.bottleCount) bottles included" : "Bottle terms unavailable"))
            if session.withdrawn { Text("Session withdrawn — check purchase status or contact the host") }
        }.font(.footnote)
    }
    @ViewBuilder private func more(_ kind: String) -> some View {
        if let cursor = cursors[kind] {
            Button("Load more \(kind)") { pageTask = Task { await nextPage(kind, cursor: cursor) } }.disabled(loading)
        }
    }
    @MainActor private func load() async {
        pageTask?.cancel(); generation.invalidate()
        let request = generation.id, captured = scope
        loadedScope = captured; passes = []; purchases = []; claims = []; cursors = [:]; message = ""
        guard captured.signedIn else { loading = false; return }
        loading = true
        do {
            let api = NativePartyCommerceAPI(client: captured.client)
            async let passPage = api.mine("passes", partyID: partyID)
            async let purchasePage = api.mine("purchases", partyID: partyID)
            async let claimPage = api.mine("claims", partyID: partyID)
            let pages = try await [passPage, purchasePage, claimPage]
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            for page in pages { append(page, userID: captured.userID) }
            loading = false
        } catch {
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            loading = false; message = "Your records could not be retrieved. Refresh to try again; nothing is confirmed from a checkout return."
        }
    }
    @MainActor private func nextPage(_ kind: String, cursor: String) async {
        guard !loading, loadedScope == scope else { return }
        let captured = scope, request = generation.id
        loading = true; message = ""
        do {
            let page = try await NativePartyCommerceAPI(client: captured.client).mine(kind, cursor: cursor, partyID: partyID)
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            append(page, userID: captured.userID); loading = false
        } catch {
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            loading = false; message = "More records could not be loaded. Please retry."
        }
    }
    private func append(_ page: NativePartyCommercePage, userID: String?) {
        passes += (page.passes ?? []).filter { row in !passes.contains { $0.id == row.id } }
        purchases += (page.purchases ?? []).filter { row in !purchases.contains { $0.id == row.id } }
        claims += (page.claims ?? []).filter { row in !claims.contains { $0.id == row.id } }
        cursors[page.kind] = page.nextCursor
        if let userID { NativePartyCommerceRetries().reconcile(userID: userID, purchases: page.purchases ?? []) }
    }
}

/// Only this Profile destination renders a QR, and only from the authorized
/// attendeeCredential endpoint. The party id and invitation URL are never QR data.
@MainActor
struct NativePartyPersonalPassView: View {
    let partyID: String
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var admission: NativePartyAdmission?
    @State private var qr: UIImage?
    @State private var qrExpiresAt: Date?
    @State private var expiryTask: Task<Void, Never>?
    @State private var purchasePage: NativePartyCommercePage?
    @State private var claimPage: NativePartyCommercePage?
    @State private var ledgerReady = false
    @State private var loadedScope: NativePartyCommerceScope?
    @State private var generation = NativePartyCommerceGeneration()
    @State private var revision = UUID()
    @State private var message = ""
    private var scope: NativePartyCommerceScope { NativePartyCommerceScope(sessionStore) }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("Personal door pass").font(.title.bold())
                NativePartyLineup(partyID: partyID)
                if !scope.signedIn { Text("Sign in to retrieve your pass.") }
                else if loadedScope == scope, let admission {
                    Text(admission.statusLabel).font(.headline)
                    if admission.confirmed, scenePhase == .active, let deadline = qrExpiresAt, deadline > Date(), let qr {
                        Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                            .frame(maxWidth: 280).padding(20).background(Color.white)
                            .accessibilityLabel("Your personal admission QR. Show this to the host at the door.")
                        Text("For your admission only. Keep this pass private. Table purchases and claims are listed separately in My parties.").font(.subheadline)
                    }
                } else if message.isEmpty { ProgressView("Verifying your pass…") }
                if !message.isEmpty { Text(message) }
                if loadedScope == scope, scope.signedIn, ledgerReady {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Purchases & sessions").font(.title2.bold())
                        if let purchasePage {
                            ForEach(purchasePage.purchases ?? []) { purchase in
                                Text("\(purchase.session?.name ?? purchase.ticketTierName ?? "Purchase"): \(purchase.statusLabel)")
                            }
                            if purchasePage.purchases?.isEmpty == true { Text("No purchases on this page.") }
                        } else { Text("Purchase status could not be retrieved.") }
                        if let claimPage {
                            ForEach(claimPage.claims ?? []) { claim in
                                Text("\(claim.session.name): \(claim.statusLabel)")
                            }
                        } else { Text("Session claims could not be retrieved.") }
                        Text("Session claims do not grant admission. Open records below for dates, bottle terms and more pages.").font(.footnote)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                NavigationLink("View this party’s purchase & session status") {
                    NativePartyWalletView(partyID: partyID)
                }.frame(minHeight: 44)
                Button("Refresh personal pass") { revision = UUID() }.frame(minHeight: 44)
            }.padding(24)
        }
        .navigationTitle("Your pass").navigationBarTitleDisplayMode(.inline)
        .task(id: NativePartyCommerceLoadKey(scope: scope, revision: revision, partyID: partyID)) { await load() }
        .onChange(of: scenePhase) { phase in
            clearQR(); admission = nil; generation.invalidate()
            if phase == .active { revision = UUID() }
        }
        .onDisappear { clearQR(); admission = nil; purchasePage = nil; claimPage = nil; loadedScope = nil; generation.invalidate() }
        .privacySensitive()
    }
    private func clearQR() {
        expiryTask?.cancel(); expiryTask = nil; qr = nil; qrExpiresAt = nil
    }
    @MainActor private func load() async {
        generation.invalidate()
        let request = generation.id, captured = scope
        clearQR(); admission = nil; message = ""; loadedScope = captured
        purchasePage = nil; claimPage = nil; ledgerReady = false
        guard captured.signedIn else { return }
        let api = NativePartyCommerceAPI(client: captured.client)
        // Ledger remains useful after a share link expires, even when a guest
        // never earned admission. Do not let resolve failure hide their money.
        async let purchases = try? api.mine("purchases", partyID: partyID)
        async let claims = try? api.mine("claims", partyID: partyID)
        async let resolved = try? api.admission(partyID)
        let (purchasesValue, claimsValue, stateValue) = await (purchases, claims, resolved)
        guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
        purchasePage = purchasesValue; claimPage = claimsValue; ledgerReady = true
        if let userID = captured.userID {
            NativePartyCommerceRetries().reconcile(userID: userID, purchases: purchasesValue?.purchases ?? [])
        }
        guard let state = stateValue else { message = "Admission could not be verified. Your purchase records are separate."; return }
        admission = state
        guard state.confirmed else { return }
        do {
            let credential = try await api.credential(partyID)
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            let filter = CIFilter.qrCodeGenerator()
            filter.message = Data(credential.value.utf8)
            filter.correctionLevel = "M"
            guard let output = filter.outputImage,
                  let image = CIContext().createCGImage(output.transformed(by: CGAffineTransform(scaleX: 8, y: 8)), from: output.extent.applying(CGAffineTransform(scaleX: 8, y: 8))) else { throw BytspotAPIClient.APIError.invalidResponse }
            guard credential.isValid(), scenePhase == .active else { return }
            let deadline = credential.expiresAt
            qrExpiresAt = deadline
            qr = UIImage(cgImage: image)
            // Capture only the deadline, never the credential or image. The
            // relative sleep is capped too, so clock rollback cannot extend TTL.
            let delay = min(deadline.timeIntervalSinceNow, NativePartyCommerceCredential.maximumDisplayLifetime)
            expiryTask = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: UInt64(max(0, delay) * 1_000_000_000)) }
                catch { return }
                guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
                qr = nil; qrExpiresAt = nil
                message = "Your personal QR has expired. Refresh your pass before showing it at the door."
            }
        } catch {
            guard !Task.isCancelled, generation.accepts(request, captured: captured, current: scope) else { return }
            clearQR(); message = "Your personal pass could not be verified. Try again before showing a QR at the door."
        }
    }
}
