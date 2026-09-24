import Foundation
import SwiftUI

struct NativeSessionAuthoringAccess: Decodable {
    struct Seller: Decodable, Identifiable {
        let id: String
        let name: String
        let canAuthor: Bool
        let reason: String?
    }
    let sellers: [Seller]
    let reason: String?
}

struct NativeAuthoredPartySession: Decodable, Identifiable {
    let id: String
    let partyId: String
    let name: String
    let kind: String
    let startsAt: String
    let endsAt: String
    let venueName: String?
    let bottleCount: Int
    let bottleTerms: String
    let priceCents: Int
    let quantity: Int
    let committed: Int
    let requiredMembershipTier: String?

    var priceLabel: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: NSDecimalNumber(value: priceCents).dividing(by: NSDecimalNumber(value: 100))) ?? "USD \(priceCents) cents"
    }

    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

/// UI starting choices, not inferred server defaults. Optional values are sent
/// explicitly as null: venue null means the Party's venue, tier null adds no tier.
struct NativeSessionAuthoringDraft {
    var name = ""
    var kind = "table"
    var startsAt = Date().addingTimeInterval(3_600)
    var endsAt = Date().addingTimeInterval(7_200)
    var venueName = ""
    var bottleCount = 0
    var bottleTerms = "included"
    var price = ""
    var quantity = 1
    var membership = ""

    /// Exact base-10 parsing, never floating point rounding or locale guessing.
    /// The field explicitly asks for USD with a dot as the decimal separator.
    static func cents(_ text: String) -> Int? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), !parts[0].isEmpty,
              parts.allSatisfy({ $0.utf8.allSatisfy { (48...57).contains($0) } }),
              parts.count == 1 || (1...2).contains(parts[1].count),
              let dollars = Int(parts[0]), dollars <= 100_000 else { return nil }
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        let cents = Int(fraction.padding(toLength: 2, withPad: "0", startingAt: 0)) ?? 0
        let total = dollars * 100 + cents
        return (1...10_000_000).contains(total) ? total : nil
    }

    var problems: [String] {
        var result: [String] = []
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.utf16.count > 80 { result.append("Enter a session name of 1–80 characters.") }
        if !["table", "after-hours"].contains(kind) { result.append("Choose Table or After-hours.") }
        if !startsAt.timeIntervalSince1970.isFinite || !endsAt.timeIntervalSince1970.isFinite || endsAt <= startsAt {
            result.append("End time must be after start time.")
        }
        if venueName.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > 120 { result.append("Venue name must be 120 characters or fewer.") }
        if !(0...200).contains(bottleCount) { result.append("Bottle count must be 0–200.") }
        if !["included", "minimum"].contains(bottleTerms) { result.append("Choose bottle terms.") }
        if bottleTerms == "minimum" && bottleCount == 0 { result.append("A bottle minimum requires at least one bottle.") }
        if Self.cents(price) == nil { result.append("Enter USD 0.01–100,000.00, using a dot and at most two decimal places. Free sessions are not supported here.") }
        if !(1...500).contains(quantity) { result.append("Quantity must be 1–500 units, not guest seats.") }
        if !["", "green", "black"].contains(membership) { result.append("Choose no additional requirement, Green, or Black.") }
        return result
    }

    func input() throws -> [String: Any] {
        guard problems.isEmpty, let priceCents = Self.cents(price) else {
            throw NativeSessionAuthoringFailure.validation(problems.joined(separator: "\n"))
        }
        let venue = venueName.trimmingCharacters(in: .whitespacesAndNewlines)
        return [
            "name": name.trimmingCharacters(in: .whitespacesAndNewlines), "kind": kind,
            "startsAt": ISO8601DateFormatter().string(from: startsAt),
            "endsAt": ISO8601DateFormatter().string(from: endsAt),
            "venueName": venue.isEmpty ? NSNull() : venue as Any,
            "lat": NSNull(), "lng": NSNull(),
            "bottleCount": bottleCount, "bottleTerms": bottleTerms,
            "priceCents": priceCents, "quantity": quantity,
            "requiredMembershipTier": membership.isEmpty ? NSNull() : membership as Any,
        ]
    }
}

enum NativeSessionAuthoringFailure: Error {
    case validation(String)

    static func message(_ error: Error) -> String {
        if case let NativeSessionAuthoringFailure.validation(message) = error { return message }
        if case let BytspotAPIClient.APIError.server(status, body) = error {
            if status == 401 { return "Sign in again to manage sessions." }
            if status == 404 { return "This party or session is not available to this account." }
            // Never display arbitrary HTML, internal error bodies or credentials.
            if [400, 403, 409, 412, 422].contains(status),
               let data = body.data(using: .utf8),
               let decoded = try? JSONSerialization.jsonObject(with: data),
               let object = decoded as? [String: Any],
               let envelope = object["error"] as? [String: Any] {
                let detail = envelope["json"] as? [String: Any] ?? envelope
                if let message = detail["message"] as? String, !message.isEmpty { return message }
            }
            if status == 429 { return "Too many requests. Wait a moment, then refresh." }
        }
        return "The request could not be confirmed. Refresh the list before trying again; a session may already have been created."
    }
}

struct NativePartySessionAuthoringAPI {
    static let accessPath = "/trpc/events.sessionAuthoring.access"
    static let listPath = "/trpc/events.sessionAuthoring.list"
    static let upsertPath = "/trpc/events.sessionAuthoring.upsert"
    static let withdrawPath = "/trpc/events.sessionAuthoring.withdraw"
    let client: BytspotAPIClient

    private func decode<T: Decodable>(_ type: T.Type, _ payload: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: payload))
    }

    func access(partyID: String) async throws -> NativeSessionAuthoringAccess {
        try decode(NativeSessionAuthoringAccess.self, await client.trpcQueryPayload(path: Self.accessPath, input: ["partyId": partyID]))
    }

    func list(partyID: String, sellerID: String) async throws -> [NativeAuthoredPartySession] {
        struct Reply: Decodable { let sessions: [NativeAuthoredPartySession] }
        return try decode(Reply.self, await client.trpcQueryPayload(path: Self.listPath, input: ["partyId": partyID, "sellerId": sellerID])).sessions
    }

    func create(partyID: String, sellerID: String, draft: NativeSessionAuthoringDraft) async throws -> NativeAuthoredPartySession {
        let input: [String: Any] = ["partyId": partyID, "sellerId": sellerID, "session": try draft.input()]
        return try decode(NativeAuthoredPartySession.self, await client.trpcPayload(path: Self.upsertPath, method: "POST", input: input))
    }

    func withdraw(partyID: String, sellerID: String, sessionID: String) async throws {
        struct Reply: Decodable { let withdrawn: Bool }
        let reply = try decode(Reply.self, await client.trpcPayload(path: Self.withdrawPath, method: "POST", input: ["partyId": partyID, "sellerId": sellerID, "sessionId": sessionID]))
        guard reply.withdrawn else { throw BytspotAPIClient.APIError.invalidResponse }
    }
}

/// Present in a sheet after publishing, or from Party Control. Inherits the
/// existing BytspotSessionStore environment object; no vendor token is minted.
@MainActor public struct NativePartySessionAuthoringView: View {
    private let partyID: String
    @EnvironmentObject private var sessionStore: BytspotSessionStore

    public init(partyID: String) { self.partyID = partyID }

    public var body: some View {
        NativeSessionAuthoringSheet(
            partyID: partyID,
            signedIn: sessionStore.authenticatedUserID != nil,
            api: NativePartySessionAuthoringAPI(client: BytspotAPIClient(tokenProvider: { sessionStore.token }))
        )
        // Destroy private seller data and draft state when account or party changes.
        .id("\(partyID):\(sessionStore.authenticatedUserID ?? "signed-out")")
    }
}

@MainActor private struct NativeSessionAuthoringSheet: View {
    let partyID: String
    let signedIn: Bool
    let api: NativePartySessionAuthoringAPI
    @Environment(\.dismiss) private var dismiss
    @State private var access: NativeSessionAuthoringAccess?
    @State private var sellerID = ""
    @State private var problem: String?
    @State private var loading = false

    var body: some View {
        NavigationView {
            Group {
                if !signedIn {
                    Text("Sign in to manage sessions for a party you host.").padding()
                } else if let access {
                    VStack(spacing: 0) {
                        if access.sellers.count > 1 {
                            Picker("Seller business", selection: $sellerID) {
                                Text("Choose a seller").tag("")
                                ForEach(access.sellers) { seller in Text(seller.name).tag(seller.id) }
                            }
                            .padding()
                        }
                        if let seller = access.sellers.first(where: { $0.id == sellerID }) {
                            if seller.canAuthor {
                                NativeSessionSellerPanel(partyID: partyID, seller: seller, api: api).id(seller.id)
                            } else {
                                restriction(seller.reason ?? "This seller seat cannot author sessions.")
                            }
                        } else if let reason = access.reason {
                            restriction(reason)
                        } else {
                            Text("Choose the business that will sell these sessions.").padding()
                            Spacer()
                        }
                    }
                } else if loading {
                    ProgressView("Checking seller access…")
                } else {
                    VStack(spacing: 16) {
                        Text(problem ?? "Seller access could not be checked.")
                        Button("Try again") { Task { await loadAccess() } }
                    }.padding()
                }
            }
            .navigationTitle("Tables & sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .task { if signedIn { await loadAccess() } }
        }
        .navigationViewStyle(.stack)
        .accessibilityIdentifier("native-party-session-authoring")
    }

    private func restriction(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Seller access required", systemImage: "lock.shield")
                .font(.headline)
            Text(message)
            Text("Hosting a party does not automatically create a seller account or enable payouts.")
                .font(.footnote).foregroundColor(.secondary)
            Button("Check access again") { Task { await loadAccess() } }.disabled(loading)
            if let problem { Text(problem).foregroundColor(.red) }
            Spacer()
        }.padding()
    }

    private func loadAccess() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        problem = nil
        do {
            let result = try await api.access(partyID: partyID)
            guard !Task.isCancelled else { return }
            access = result
            if result.sellers.count == 1 { sellerID = result.sellers[0].id }
            else if !result.sellers.contains(where: { $0.id == sellerID }) { sellerID = "" }
        } catch {
            guard !Task.isCancelled else { return }
            access = nil
            problem = NativeSessionAuthoringFailure.message(error)
        }
    }
}

@MainActor private struct NativeSessionSellerPanel: View {
    let partyID: String
    let seller: NativeSessionAuthoringAccess.Seller
    let api: NativePartySessionAuthoringAPI
    @State private var sessions: [NativeAuthoredPartySession] = []
    @State private var draft = NativeSessionAuthoringDraft()
    @State private var problem: String?
    @State private var notice: String?
    @State private var busy = false
    @State private var loaded = false
    @State private var showDraft = false
    @State private var pendingWithdrawal: NativeAuthoredPartySession?
    @State private var confirmWithdrawal = false

    var body: some View {
        Form {
            Section {
                Text(seller.name).font(.headline)
                Text("Proceeds use the existing Party checkout and settlement process. This screen does not create a payout account, initiate a transfer, or promise a payout date.")
                    .font(.footnote).foregroundColor(.secondary)
            }
            Section {
                if busy { ProgressView("Updating sessions…") }
                if let problem { Text(problem).foregroundColor(.red).accessibilityIdentifier("session-authoring-error") }
                if let notice { Text(notice).foregroundColor(.secondary) }
                Button("Refresh sessions") { Task { await refresh() } }.disabled(busy)
                if !loaded && !busy { Text("Refresh successfully before creating or withdrawing a session.").font(.footnote) }
            }
            Section(header: Text("On sale"), footer: Text("Existing sessions cannot be edited. If eligible, withdraw a session and create a replacement. Historical purchases are retained.")) {
                if loaded && sessions.isEmpty { Text("No sessions on sale from this seller.").foregroundColor(.secondary) }
                ForEach(sessions) { session in sessionRow(session) }
            }
            if loaded {
                Section {
                    DisclosureGroup("Create a session", isExpanded: $showDraft) { draftFields }
                }.disabled(busy)
            }
        }
        .task { await refresh() }
        .confirmationDialog("Withdraw this session?", isPresented: $confirmWithdrawal, titleVisibility: .visible) {
            Button("Withdraw session", role: .destructive) {
                guard let session = pendingWithdrawal else { return }
                Task { await withdraw(session) }
            }
            Button("Keep session", role: .cancel) { pendingWithdrawal = nil }
        } message: {
            Text("Remove \(pendingWithdrawal?.name ?? "this session") from sale? Historical purchases are retained. Withdrawal is refused while units are committed, held, or in a live checkout.")
        }
        .interactiveDismissDisabled(busy)
    }

    private func sessionRow(_ session: NativeAuthoredPartySession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(session.name).font(.headline)
            Text("\(session.kind == "after-hours" ? "After-hours" : "Table") · \(session.priceLabel) · \(session.quantity) units")
            if let start = NativeAuthoredPartySession.date(session.startsAt), let end = NativeAuthoredPartySession.date(session.endsAt) {
                Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))")
            }
            Text(session.venueName ?? "At the Party venue")
            Text(session.bottleTerms == "minimum"
                 ? "\(session.bottleCount)-bottle minimum; bottles purchased on top of the price."
                 : "\(session.bottleCount) bottles included in the price.")
            Text("\(session.committed) committed · \(session.requiredMembershipTier?.capitalized ?? "No additional") membership requirement")
                .font(.footnote).foregroundColor(.secondary)
            Button("Withdraw…", role: .destructive) {
                pendingWithdrawal = session
                confirmWithdrawal = true
            }.disabled(busy || !loaded)
        }.padding(.vertical, 6)
    }

    @ViewBuilder private var draftFields: some View {
        TextField("Session name", text: $draft.name)
        Picker("Kind", selection: $draft.kind) {
            Text("Table").tag("table")
            Text("After-hours").tag("after-hours")
        }
        DatePicker("Starts", selection: $draft.startsAt)
        DatePicker("Ends", selection: $draft.endsAt)
        Text("Times use your device time zone. Sessions may run outside the Party's hours.").font(.footnote).foregroundColor(.secondary)
        TextField("Venue name (blank = Party venue)", text: $draft.venueName)
        Stepper("Bottles: \(draft.bottleCount)", value: $draft.bottleCount, in: 0...200)
        Picker("Bottle terms", selection: $draft.bottleTerms) {
            Text("Included in price").tag("included")
            Text("Minimum, purchased separately").tag("minimum")
        }
        if draft.bottleTerms == "minimum" {
            Text("The price is the session fee. Guests must purchase the bottle minimum on top.").font(.footnote)
        }
        TextField("Price per unit, USD (e.g. 125.50)", text: $draft.price)
            .keyboardType(.decimalPad)
        Stepper("Quantity: \(draft.quantity) units", value: $draft.quantity, in: 1...500)
        Text("Quantity counts sessions for sale, not seats or guests.").font(.footnote).foregroundColor(.secondary)
        Picker("Additional membership requirement", selection: $draft.membership) {
            Text("None — Party requirements still apply").tag("")
            Text("Green").tag("green")
            Text("Black").tag("black")
        }
        ForEach(draft.problems, id: \.self) { Text($0).font(.footnote).foregroundColor(.secondary) }
        Button("Create session") { Task { await create() } }
            .disabled(!draft.problems.isEmpty || busy || !loaded)
            .accessibilityIdentifier("session-authoring-create")
    }

    private func refresh() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        problem = nil
        do {
            let rows = try await api.list(partyID: partyID, sellerID: seller.id)
            guard !Task.isCancelled else { return }
            sessions = rows
            loaded = true
        } catch {
            guard !Task.isCancelled else { return }
            loaded = false
            sessions = []
            problem = NativeSessionAuthoringFailure.message(error)
        }
    }

    private func create() async {
        guard loaded, !busy, draft.problems.isEmpty else { return }
        busy = true
        problem = nil
        notice = nil
        do {
            let created = try await api.create(partyID: partyID, sellerID: seller.id, draft: draft)
            sessions.append(created)
            draft = NativeSessionAuthoringDraft()
            showDraft = false
            notice = "Session created."
        } catch {
            // Creation has no idempotency contract. Never automatically retry an
            // ambiguous failure and risk creating duplicate saleable inventory.
            loaded = false
            sessions = []
            problem = NativeSessionAuthoringFailure.message(error)
        }
        busy = false
    }

    private func withdraw(_ session: NativeAuthoredPartySession) async {
        guard loaded, !busy else { return }
        busy = true
        problem = nil
        notice = nil
        do {
            try await api.withdraw(partyID: partyID, sellerID: seller.id, sessionID: session.id)
            sessions.removeAll { $0.id == session.id }
            notice = "Session withdrawn. Historical purchases are retained."
        } catch {
            loaded = false
            sessions = []
            problem = NativeSessionAuthoringFailure.message(error)
        }
        pendingWithdrawal = nil
        busy = false
    }
}
