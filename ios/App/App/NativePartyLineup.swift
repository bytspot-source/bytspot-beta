import SwiftUI
import Foundation

// MARK: - Contract and canonical recipient policy

enum NativeLineupTipProvider: String, Codable, CaseIterable, Identifiable, Hashable {
    case cashApp = "cash-app", paypalMe = "paypal-me", venmo
    var id: String { rawValue }
    var label: String {
        switch self {
        case .cashApp: return "Cash App"
        case .paypalMe: return "PayPal.me"
        case .venmo: return "Venmo"
        }
    }
    var hint: String {
        switch self {
        case .cashApp: return "$cashtag · up to 20 letters/numbers, at least one letter"
        case .paypalMe: return "PayPal.me name · up to 20 letters/numbers"
        case .venmo: return "@username · 5–30 letters/numbers, hyphens or underscores"
        }
    }
    func normalizedHandle(_ value: String) -> String? {
        var handle = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if self == .cashApp && handle.hasPrefix("$") { handle.removeFirst() }
        if self == .venmo && handle.hasPrefix("@") { handle.removeFirst() }
        let pattern: String
        switch self {
        case .cashApp: pattern = "[A-Za-z0-9]{1,20}"
        case .paypalMe: pattern = "[A-Za-z0-9]{1,20}"
        case .venmo: pattern = "[A-Za-z0-9_-]{5,30}"
        }
        guard let range = handle.range(of: pattern, options: .regularExpression),
              range == handle.startIndex..<handle.endIndex else { return nil }
        if self == .cashApp && handle.range(of: "[A-Za-z]", options: .regularExpression) == nil { return nil }
        return handle
    }
    func recipientURL(handle: String) -> URL? {
        guard let handle = normalizedHandle(handle) else { return nil }
        switch self {
        case .cashApp: return URL(string: "https://cash.app/$\(handle)")
        case .paypalMe: return URL(string: "https://paypal.me/\(handle)")
        case .venmo: return URL(string: "https://venmo.com/\(handle)")
        }
    }
}

struct NativeLineupTip: Codable, Equatable, Identifiable {
    let provider: NativeLineupTipProvider
    let handle: String
    let url: String
    var id: String { provider.rawValue }
    // Never open a server-supplied arbitrary URL. It must exactly equal the
    // locally constructed provider URL: no credentials, port, query or redirect.
    var safeURL: URL? {
        guard let canonical = provider.recipientURL(handle: handle), canonical.absoluteString == url else { return nil }
        return canonical
    }
}

struct NativePartyLineupEntry: Decodable, Equatable, Identifiable {
    let id: String
    let displayName: String
    let role: String
    let version: Int
    var partyId: String? = nil
    var status: String? = nil
    var invitedUserId: String? = nil
    var partyTitle: String? = nil
    var startsAt: String? = nil
    var hostName: String? = nil
    var tips: [NativeLineupTip]? = nil
    var roleLabel: String { role == "dj" ? "DJ" : role == "mc" ? "MC" : "Performer" }
    var publicTips: [NativeLineupTip] { (tips ?? []).filter { $0.safeURL != nil } }
}

struct NativePartyLineupPage: Decodable {
    let entries: [NativePartyLineupEntry]
    let nextCursor: String?
}

struct NativeLineupTipReview: Decodable, Equatable, Identifiable {
    let id: String
    let version: Int
    let displayName: String
    let provider: NativeLineupTipProvider
    let handle: String
    let url: String
    var tip: NativeLineupTip { NativeLineupTip(provider: provider, handle: handle, url: url) }
}

struct NativePartyLineupAPI {
    let client: BytspotAPIClient
    static let prefix = "/trpc/events.lineup."

    /// Consent revalidation and the private inbox must never reuse cached GETs.
    /// Match NativePartyCommerceScope's account-scoped, ephemeral client.
    static func session(authorization: String?) -> Self {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return Self(client: BytspotAPIClient(tokenProvider: { authorization }, urlSession: URLSession(configuration: configuration)))
    }

    func page(_ route: String, input: [String: Any] = [:]) async throws -> NativePartyLineupPage {
        let payload = try await client.trpcQueryPayload(path: Self.prefix + route, input: input)
        return try JSONDecoder().decode(NativePartyLineupPage.self, from: JSONSerialization.data(withJSONObject: payload))
    }
    func tip(partyID: String, entryID: String, version: Int, provider: NativeLineupTipProvider) async throws -> NativeLineupTipReview {
        let payload = try await client.trpcQueryPayload(path: Self.prefix + "tip", input: [
            "partyId": partyID, "id": entryID, "version": version, "provider": provider.rawValue,
        ])
        let review = try JSONDecoder().decode(NativeLineupTipReview.self, from: JSONSerialization.data(withJSONObject: payload))
        guard review.id == entryID, review.version == version, review.provider == provider, review.tip.safeURL != nil else {
            throw BytspotAPIClient.APIError.invalidResponse
        }
        return review
    }
    func mutate(_ route: String, input: [String: Any]) async throws {
        struct Reply: Decodable { let status: String }
        let payload = try await client.trpcPayload(path: Self.prefix + route, method: "POST", input: input)
        let reply = try JSONDecoder().decode(Reply.self, from: JSONSerialization.data(withJSONObject: payload))
        let expected: [String: Set<String>] = [
            "invite": ["recorded"], "confirm": ["accepted"], "withdraw": ["declined", "withdrawn"], "remove": ["removed"],
        ]
        guard expected[route]?.contains(reply.status) == true else { throw BytspotAPIClient.APIError.invalidResponse }
    }
}

/// Pure state seam: a dismissed screen, account swap or refresh invalidates all
/// outstanding reads and handoffs. Nothing is cached to disk or UserDefaults.
struct NativeLineupLoadState {
    private(set) var generation = UUID()
    private(set) var entries: [NativePartyLineupEntry] = []
    private(set) var nextCursor: String?
    private(set) var loading = true
    private(set) var failed = false

    mutating func invalidate() {
        generation = UUID(); entries = []; nextCursor = nil; loading = true; failed = false
    }
    mutating func finish(_ page: NativePartyLineupPage?, generation: UUID, append: Bool = false) {
        guard generation == self.generation else { return }
        loading = false
        guard let page else { failed = true; return }
        failed = false
        entries = append ? entries + page.entries.filter { item in !entries.contains(where: { $0.id == item.id }) } : page.entries
        nextCursor = page.nextCursor
    }
}

// MARK: - Manager insertion points

/// Insert in both invitation AND personal pass content; does not grant admission.
struct NativePartyLineup: View {
    let partyID: String
    var body: some View { NativeLineupSessionView(mode: .publicLineup(partyID), openAuth: {}) }
}

/// Present using .sheet { NativePartyLineupHostSheet(partyID: partyID) }.
/// The environment's real session store must be inherited, never fabricated.
struct NativePartyLineupHostSheet: View {
    let partyID: String
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationView {
            NativeLineupSessionView(mode: .host(partyID), openAuth: {})
                .navigationTitle("Manage lineup")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }.navigationViewStyle(.stack)
    }
}

/// Add to Profile navigation for signed-in performers, or route openAuth to the
/// manager's existing sign-in sheet. This never claims an email was delivered.
struct NativePerformerInboxEntry: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var presented = false
    var body: some View {
        Button { presented = true } label: {
            Label("DJ / MC invitations & tip links", systemImage: "music.mic")
                .font(.headline).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-performer-inbox-entry")
        .disabled(!sessionStore.canAttachBearerToken)
        .onChange(of: sessionStore.token) { _ in presented = false }
        .sheet(isPresented: $presented) {
            NavigationView {
                NativePerformerInvitationsView(openAuth: { presented = false })
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { presented = false } } }
            }.navigationViewStyle(.stack)
        }
    }
}

struct NativePerformerInvitationsView: View {
    let openAuth: () -> Void
    var body: some View {
        NativeLineupSessionView(mode: .inbox, openAuth: openAuth)
            .navigationTitle("Performer invitations")
            .navigationBarTitleDisplayMode(.inline)
    }
}

private enum NativeLineupMode: Hashable {
    case publicLineup(String), host(String), inbox
    var partyID: String? {
        switch self { case .publicLineup(let id), .host(let id): return id; case .inbox: return nil }
    }
    var isPublic: Bool { if case .publicLineup = self { return true }; return false }
    var isHost: Bool { if case .host = self { return true }; return false }
}

private struct NativeLineupSessionIdentity: Hashable {
    let userID: String?
    let credential: String?
    let mode: NativeLineupMode
}

private struct NativeLineupSessionView: View {
    let mode: NativeLineupMode
    let openAuth: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    var body: some View {
        let credential = sessionStore.canAttachBearerToken ? sessionStore.token : nil
        let userID = sessionStore.canAttachBearerToken ? sessionStore.authenticatedUserID : nil
        NativeLineupScreen(mode: mode, userID: userID,
                           api: NativePartyLineupAPI.session(authorization: credential), openAuth: openAuth)
            // Recreate the whole subtree, including forms/sheets, on account or
            // credential changes. An old response cannot become the new account's UI.
            .id(NativeLineupSessionIdentity(userID: userID, credential: credential, mode: mode))
    }
}

private struct NativeLineupScreen: View {
    let mode: NativeLineupMode
    let userID: String?
    let api: NativePartyLineupAPI
    let openAuth: () -> Void
    @Environment(\.scenePhase) private var scenePhase
    @State private var state = NativeLineupLoadState()
    @State private var revision = UUID()
    @State private var busy = false
    @State private var message: String?
    @State private var editEntry: NativePartyLineupEntry?
    @State private var removal: NativePartyLineupEntry?
    @State private var review: NativeLineupTipReview?
    @State private var targetID = ""
    @State private var creditName = ""
    @State private var role = "dj"

    var body: some View {
        Group {
            if mode.isPublic {
                VStack(alignment: .leading, spacing: 16) {
                    Text("The lineup").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    publicContent
                }
            } else if userID == nil {
                VStack(spacing: 16) {
                    Text("Sign in to manage your performer invitations.").multilineTextAlignment(.center)
                    if !mode.isHost { Button("Sign in", action: openAuth).buttonStyle(.borderedProminent) }
                }.padding()
            } else {
                List {
                    if mode.isHost { hostProposal } else { identitySection }
                    Section(mode.isHost ? "Pending and confirmed" : "Your invitations and credits") { privateContent }
                    if let message { Section { Text(message).font(.callout).accessibilityLabel(message) } }
                }.refreshable { refresh() }
            }
        }
        .task(id: revision) { await load() }
        .onChange(of: scenePhase) { phase in
            // Clear reviews while backgrounded, then refetch on return. No
            // "payment complete" status is inferred from app activation.
            if phase == .active { refresh() }
            else { invalidate() }
        }
        .onDisappear { invalidate() }
        .sheet(item: $editEntry) { entry in
            NativeLineupConfirmation(entry: entry, api: api) { refresh() }
        }
        .sheet(item: $review) { recipient in
            if let partyID = mode.partyID {
                NativeLineupTipSheet(partyID: partyID, recipient: recipient, api: api)
            }
        }
        .confirmationDialog(mode.isHost ? "Remove this performer?" : "Remove your public credit?",
                            isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible) {
            if let entry = removal {
                Button(entry.status == "pending" && !mode.isHost ? "Decline invitation" : "Remove credit and tip links", role: .destructive) {
                    removal = nil
                    Task { await remove(entry) }
                }
            }
            Button("Cancel", role: .cancel) { removal = nil }
        } message: {
            Text("This removes the credit and payment links from Bytspot. It cannot undo a payment made outside Bytspot.")
        }
        .accessibilityIdentifier(mode.isPublic ? "native-party-lineup" : mode.isHost ? "native-party-lineup-host" : "native-performer-inbox")
    }

    @ViewBuilder private var publicContent: some View {
        if state.loading { ProgressView("Loading lineup…") }
        else if state.failed { retryBlock }
        else if state.entries.isEmpty { Text("No confirmed performers yet.").foregroundStyle(.secondary) }
        else {
            ForEach(state.entries) { entry in
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(entry.roleLabel) · \(entry.displayName)").font(.headline)
                    ForEach(entry.publicTips) { tip in
                        Button { Task { await prepareTip(entry, provider: tip.provider) } } label: {
                            Label("Tip with \(tip.provider.label)", systemImage: "arrow.up.right.square")
                                .frame(minHeight: 44)
                        }.disabled(busy)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("Tips are optional and do not unlock admission or digital content. Payment is handled outside Bytspot.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        if let message { Text(message).font(.callout) }
    }

    private var identitySection: some View {
        Section {
            Text("Your Bytspot account ID").font(.caption).foregroundStyle(.secondary)
            Text(userID ?? "").font(.body.monospaced()).textSelection(.enabled)
            Text("Share this ID directly with your host. Invitations appear here after the party is published; no email delivery is promised.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var hostProposal: some View {
        Section {
            TextField("Exact Bytspot account ID", text: $targetID)
                .textInputAutocapitalization(.never).disableAutocorrection(true)
            TextField("Public display credit", text: $creditName)
            Picker("Role", selection: $role) { Text("DJ").tag("dj"); Text("MC").tag("mc") }
                .pickerStyle(.segmented)
            Button { Task { await invite() } } label: {
                Label("Record invitation", systemImage: "person.badge.plus").frame(minHeight: 44)
            }.disabled(busy || targetID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || creditName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Text("Ask the performer for their account ID. They must sign in, accept this exact credit and set their own payment handles. Nothing is public before acceptance. To change a name, role or account, remove the entry and invite again.")
                .font(.footnote).foregroundStyle(.secondary)
        } header: { Text("Invite a DJ or MC") }
    }

    @ViewBuilder private var privateContent: some View {
        if state.loading { ProgressView("Loading invitations…") }
        else if state.failed { retryBlock }
        else if state.entries.isEmpty { Text("No active invitations.").foregroundStyle(.secondary) }
        else {
            ForEach(state.entries) { entry in
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(entry.roleLabel) · \(entry.displayName)").font(.headline)
                    if let title = entry.partyTitle { Text(title) }
                    if let host = entry.hostName { Text("Hosted by \(host)").font(.subheadline) }
                    if let startsAt = entry.startsAt {
                        Text(NativeAccountDeletionFormat.date(fromISO: startsAt)?.formatted(date: .abbreviated, time: .shortened) ?? startsAt)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Text(entry.status == "accepted" ? "Account confirmed credit" : "Awaiting account acceptance")
                        .font(.caption).foregroundStyle(.secondary)
                    if mode.isHost, let account = entry.invitedUserId {
                        Text("Invited ID: \(account)").font(.caption.monospaced()).textSelection(.enabled)
                    }
                    if !mode.isHost {
                        Button(entry.status == "accepted" ? "Review credit and tip handles" : "Review and accept") { editEntry = entry }
                            .buttonStyle(.borderless)
                            .frame(minHeight: 44)
                    }
                    Button(entry.status == "pending" && !mode.isHost ? "Decline invitation" : "Remove credit", role: .destructive) { removal = entry }
                        .buttonStyle(.borderless)
                        .frame(minHeight: 44)
                }.padding(.vertical, 4).disabled(busy)
            }
        }
        if state.nextCursor != nil {
            Button("Load more") { Task { await load(append: true) } }.disabled(busy)
        }
    }

    private var retryBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Lineup unavailable. The invitation may have expired or your access may have changed.")
            Button("Try again") { refresh() }.frame(minHeight: 44)
        }
    }

    private func invalidate() {
        state.invalidate(); review = nil; editEntry = nil; removal = nil; busy = false; message = nil
    }
    private func refresh() { invalidate(); revision = UUID() }

    @MainActor private func load(append: Bool = false) async {
        guard mode.isPublic || userID != nil else { return }
        let generation = state.generation
        if append { busy = true }
        var input: [String: Any] = [:]
        let route: String
        switch mode {
        case .publicLineup(let id): route = "list"; input["partyId"] = id
        case .host(let id): route = "hostList"; input["partyId"] = id
        case .inbox:
            route = "myInvitations"
            if append, let cursor = state.nextCursor { input["cursor"] = cursor }
        }
        let page = try? await api.page(route, input: input)
        guard !Task.isCancelled, generation == state.generation else { return }
        state.finish(page, generation: generation, append: append); busy = false
    }

    @MainActor private func invite() async {
        guard let partyID = mode.partyID, !busy else { return }
        busy = true; message = nil
        let generation = state.generation
        do {
            try await api.mutate("invite", input: ["partyId": partyID, "invitedUserId": targetID.trimmingCharacters(in: .whitespacesAndNewlines),
                                                   "displayName": creditName.trimmingCharacters(in: .whitespacesAndNewlines), "role": role])
            guard generation == state.generation, !Task.isCancelled else { return }
            targetID = ""; creditName = ""; refresh()
            message = "Invitation recorded. If the ID matches an account, its owner can review it in Performer invitations once the party is published. No email was sent."
        } catch {
            guard generation == state.generation else { return }
            busy = false; message = "Could not record the invitation. Check the ID format and credit, then refresh and try again."
        }
    }

    @MainActor private func remove(_ entry: NativePartyLineupEntry) async {
        guard !busy else { return }
        busy = true; message = nil
        let generation = state.generation
        var input: [String: Any] = ["id": entry.id, "version": entry.version]
        if mode.isHost, let partyID = mode.partyID { input["partyId"] = partyID }
        do {
            try await api.mutate(mode.isHost ? "remove" : "withdraw", input: input)
            guard generation == state.generation, !Task.isCancelled else { return }
            refresh()
        } catch {
            guard generation == state.generation else { return }
            busy = false; message = "Could not remove this entry. Refresh to check whether it has changed."
        }
    }

    @MainActor private func prepareTip(_ entry: NativePartyLineupEntry, provider: NativeLineupTipProvider) async {
        guard let partyID = mode.partyID, !busy else { return }
        busy = true; message = nil
        let generation = state.generation
        do {
            let recipient = try await api.tip(partyID: partyID, entryID: entry.id, version: entry.version, provider: provider)
            guard generation == state.generation, !Task.isCancelled else { return }
            busy = false; review = recipient
        } catch {
            guard generation == state.generation else { return }
            busy = false; message = "This tip link is no longer available. Refresh the lineup before trying again."
        }
    }
}

// MARK: - Performer consent

private struct NativeLineupConfirmation: View {
    let entry: NativePartyLineupEntry
    let api: NativePartyLineupAPI
    let saved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var handles: [NativeLineupTipProvider: String] = [:]
    @State private var consent = false
    @State private var busy = false
    @State private var message: String?
    @State private var generation = UUID()

    private var valid: Bool {
        NativeLineupTipProvider.allCases.allSatisfy { provider in
            let value = (handles[provider] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty || provider.normalizedHandle(value) != nil
        }
    }
    var body: some View {
        NavigationView {
            Form {
                Section("Public credit") {
                    Text("\(entry.roleLabel) · \(entry.displayName)").font(.title2.bold())
                    Text(entry.partyTitle ?? "Party")
                    Text("Hosted by \(entry.hostName ?? "Bytspot Host")")
                    Text("This exact name and role will appear on the public invitation and Party Pass. Acceptance does not grant party admission.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Your optional tip handles") {
                    ForEach(NativeLineupTipProvider.allCases) { provider in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(provider.label).font(.headline)
                            TextField(provider.hint, text: Binding(get: { handles[provider] ?? "" }, set: { handles[provider] = $0 }))
                                .textInputAutocapitalization(.never).disableAutocorrection(true)
                                .accessibilityLabel("\(provider.label) handle")
                            if let raw = handles[provider], !raw.isEmpty {
                                if let url = provider.recipientURL(handle: raw) {
                                    Text(url.absoluteString).font(.caption).textSelection(.enabled)
                                } else { Text(provider.hint).font(.caption).foregroundStyle(.red) }
                            }
                        }
                    }
                    Text("Enter handles, not links. Leave a field blank to remove that provider. Your host cannot set these destinations. Bytspot does not verify ownership of Cash App, PayPal or Venmo accounts.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Toggle("I agree to publish this credit and the handles I supplied for my own payment accounts.", isOn: $consent)
                    Text("This confirms your signed-in Bytspot account's choice, not ownership of an external financial account. You can remove your credit or tip handles at any time.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button { Task { await confirm() } } label: {
                        if busy { ProgressView("Saving…") }
                        else { Text(entry.status == "accepted" ? "Confirm updated credit and handles" : "Accept and publish credit") }
                    }.disabled(!consent || !valid || busy).frame(minHeight: 44)
                    if let message { Text(message).foregroundStyle(.red) }
                }
            }
            .disabled(busy)
            .navigationTitle("Confirm your credit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
        }
        .navigationViewStyle(.stack)
        .interactiveDismissDisabled(busy)
        .onAppear { for tip in entry.publicTips { handles[tip.provider] = tip.handle } }
        .onDisappear { generation = UUID() }
    }

    @MainActor private func confirm() async {
        guard !busy, valid, consent else { return }
        busy = true; message = nil
        let current = generation
        let tips: [[String: String]] = NativeLineupTipProvider.allCases.compactMap { provider in
            guard let raw = handles[provider], !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let normalized = provider.normalizedHandle(raw) else { return nil }
            return ["provider": provider.rawValue, "handle": normalized]
        }
        do {
            try await api.mutate("confirm", input: ["id": entry.id, "version": entry.version, "consent": true, "tips": tips])
            guard current == generation, !Task.isCancelled else { return }
            busy = false; dismiss(); saved()
        } catch {
            guard current == generation else { return }
            busy = false; message = "Could not save. The host may have removed this invitation or it may have changed. Close this screen and refresh before trying again."
        }
    }
}

// MARK: - Deliberate external handoff, never a payment receipt

private struct NativeLineupTipSheet: View {
    let partyID: String
    let recipient: NativeLineupTipReview
    let api: NativePartyLineupAPI
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var busy = false
    @State private var message: String?
    @State private var generation = UUID()

    var body: some View {
        NavigationView {
            Form {
                Section("Review recipient") {
                    Text(recipient.displayName).font(.title2.bold())
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Provider").font(.caption).foregroundStyle(.secondary)
                        Text(recipient.provider.label)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Handle").font(.caption).foregroundStyle(.secondary)
                        Text(recipient.handle).textSelection(.enabled)
                    }
                    if let url = recipient.tip.safeURL { Text(url.absoluteString).font(.footnote).textSelection(.enabled) }
                }
                Section {
                    Text("You are leaving Bytspot. Payment is handled outside Bytspot by \(recipient.provider.label). Check the recipient's name and handle again there before sending money.")
                    Text("The performer supplied this handle. Bytspot has not verified ownership of the external account, does not collect a tip fee, and cannot confirm, reverse or refund this payment. Provider fees and terms may apply.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button { Task { await handoff() } } label: {
                        Label(busy ? "Checking recipient…" : "Continue to \(recipient.provider.label)", systemImage: "arrow.up.right.square")
                            .frame(minHeight: 44)
                    }.disabled(busy || recipient.tip.safeURL == nil)
                    if let message { Text(message).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Optional tip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }.navigationViewStyle(.stack)
        .onDisappear { generation = UUID() }
    }

    @MainActor private func handoff() async {
        guard !busy else { return }
        busy = true; message = nil
        let current = generation
        do {
            let fresh = try await api.tip(partyID: partyID, entryID: recipient.id, version: recipient.version, provider: recipient.provider)
            guard current == generation, !Task.isCancelled else { return }
            guard fresh == recipient, let url = fresh.tip.safeURL else { throw BytspotAPIClient.APIError.invalidResponse }
            openURL(url) { accepted in
                guard current == generation else { return }
                busy = false
                if accepted { dismiss() }
                else { message = "The payment provider could not open. No payment has been confirmed by Bytspot." }
            }
        } catch {
            guard current == generation else { return }
            busy = false; message = "This recipient is no longer available. Close this screen and refresh the lineup."
        }
    }
}
