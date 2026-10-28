import SwiftUI
import UIKit
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

/// People the host is already connected with on Bytspot. The host already holds
/// their account IDs, so picking one reveals no account the host didn't know.
struct NativeLineupConnection: Identifiable, Equatable {
    let userID: String
    let name: String
    var id: String { userID }

    static func from(_ invitations: [NativeSocialInvitation]) -> [NativeLineupConnection] {
        var seen = Set<String>()
        return invitations
            .filter { $0.status == "accepted" && !$0.personID.isEmpty }
            .compactMap { seen.insert($0.personID).inserted ? NativeLineupConnection(userID: $0.personID, name: $0.personName) : nil }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
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
                           api: NativePartyLineupAPI.session(authorization: credential), openAuth: openAuth,
                           loadConnections: {
                               guard mode.isHost, credential != nil else { return [] }
                               let profile = NativeProfileDataAPI(client: BytspotAPIClient(tokenProvider: { credential }))
                               return NativeLineupConnection.from((try? await profile.listSocialInvitationsViaRpc()) ?? [])
                           })
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
    var loadConnections: () async -> [NativeLineupConnection] = { [] }
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
    @State private var connections: [NativeLineupConnection] = []
    @State private var requestsParty: NativePartyRequestsTarget?
    @State private var stageParty: NativePartyRequestsTarget?
    @EnvironmentObject private var sessionStore: BytspotSessionStore

    var body: some View {
        Group {
            if mode.isPublic {
                VStack(alignment: .leading, spacing: 16) {
                    Text("The lineup").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    if let partyID = mode.partyID { NativePartyRequestsGuestCard(partyID: partyID) }
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
        .task { if mode.isHost && userID != nil { connections = await loadConnections() } }
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
        .sheet(item: $requestsParty) { target in
            NativePartyRequestsInbox(partyID: target.id).environmentObject(sessionStore)
        }
        .fullScreenCover(item: $stageParty) { target in
            NativePartyStageScreen(source: .live(partyID: target.id)).environmentObject(sessionStore)
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
                .accessibilityIdentifier("native-performer-account-id")
            HStack(spacing: 20) {
                Button {
                    guard let userID else { return }
                    UIPasteboard.general.string = userID
                    message = "Account ID copied. Send it to your host."
                } label: { Label("Copy ID", systemImage: "doc.on.doc").frame(minHeight: 44) }
                    .buttonStyle(.borderless)
                    .accessibilityIdentifier("native-performer-copy-id")
                Button {
                    guard let userID else { return }
                    if !NativePartySharePresentation.share([Self.shareText(userID: userID)]) { message = "Your ID is \(userID)" }
                } label: { Label("Share ID", systemImage: "square.and.arrow.up").frame(minHeight: 44) }
                    .buttonStyle(.borderless)
                    .accessibilityIdentifier("native-performer-share-id")
            }
            Text("Send this ID to your host. If you're connected on Bytspot, they can also pick you from their connections. Invitations appear here after the party is published; no email delivery is promised.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    static func shareText(userID: String) -> String {
        "My Bytspot ID for your DJ / MC lineup: \(userID)"
    }

    @ViewBuilder private var hostProposal: some View {
        Section {
            if connections.isEmpty {
                Text("No Bytspot connections yet. Add the DJ or MC as a friend in Network, or ask for their ID: Profile → DJ / MC invitations → Copy ID.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(connections.prefix(30)) { person in
                Button {
                    targetID = person.userID
                    if creditName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { creditName = person.name }
                } label: {
                    HStack {
                        Text(person.name).foregroundStyle(.primary)
                        Spacer()
                        if targetID == person.userID { Image(systemName: "checkmark").foregroundStyle(.tint) }
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityIdentifier("native-lineup-connection-\(person.userID)")
            }
        } header: { Text("Pick from your connections") }
        Section {
            HStack {
                TextField("Bytspot account ID", text: $targetID)
                    .textInputAutocapitalization(.never).disableAutocorrection(true)
                Button("Paste") { targetID = (UIPasteboard.general.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
                    .buttonStyle(.borderless)
            }
            TextField("Public display credit", text: $creditName)
            Picker("Role", selection: $role) { Text("DJ").tag("dj"); Text("MC").tag("mc") }
                .pickerStyle(.segmented)
            Button { Task { await invite() } } label: {
                Label("Record invitation", systemImage: "person.badge.plus").frame(minHeight: 44)
            }.disabled(busy || targetID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || creditName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Text("Pick a connection above or paste the ID they sent you. They must sign in, accept this exact credit and set their own payment handles. Nothing is public before acceptance. To change a name, role or account, remove the entry and invite again.")
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
                        if entry.status == "accepted", let partyID = entry.partyId {
                            HStack(spacing: 16) {
                                Button { requestsParty = NativePartyRequestsTarget(id: partyID) } label: { Label("Requests", systemImage: "tray.full.fill") }
                                    .accessibilityIdentifier("native-performer-requests-\(entry.id)")
                                Button { stageParty = NativePartyRequestsTarget(id: partyID) } label: { Label("Stage screen", systemImage: "play.rectangle.fill") }
                                    .accessibilityIdentifier("native-performer-stage-\(entry.id)")
                            }
                            .buttonStyle(.borderless)
                            .frame(minHeight: 44)
                        }
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

// MARK: - Request notes

struct NativePartyRequestsTarget: Identifiable, Equatable { let id: String }

enum NativePartyRequestsContract {
    static let prefix = "/trpc/events.requests."
    static let maxPerTicket = 5
    static let maxLength = 140
    /// How often an open stage screen and inbox re-read the server.
    static let screenRefreshSeconds: UInt64 = 5
    static let inboxRefreshSeconds: UInt64 = 10
    /// How long each note stays up before the carousel rolls to the next.
    static let rollSeconds: UInt64 = 7

    static func perTicketLabel(_ count: Int) -> String {
        switch count {
        case 0: return "No lineup requests"
        case 1: return "1 request to the lineup"
        default: return "\(count) requests to the lineup"
        }
    }

    /// One line of plain text, the same rule the API enforces.
    static func normalizedBody(_ text: String) -> String? {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, body.count <= maxLength else { return nil }
        let banned = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}"))
        guard body.unicodeScalars.allSatisfy({ !banned.contains($0) }) else { return nil }
        return body
    }

    static func guestStatusLabel(_ status: String) -> String {
        switch status {
        case "accepted": return "Accepted"
        case "played": return "Played"
        case "dismissed": return "Not picked"
        default: return "Waiting for the performer"
        }
    }

    static func eligibilityHeadline(_ value: NativePartyRequestEligibility) -> String? {
        switch value.state {
        case "open": return value.remaining > 0 ? "\(value.remaining) of \(value.allowance) requests left" : "You've used all \(value.allowance) requests"
        case "not-started": return "Your ticket includes \(perTicketLabel(value.allowance).lowercased()). They open when the party starts."
        case "ended", "closed": return "Requests are closed for this party."
        case "no-lineup": return "Requests open once a performer confirms the lineup."
        case "no-request-ticket":
            guard let tier = value.tiersWithRequests.first else { return nil }
            return "\(tier.name) tickets include \(perTicketLabel(tier.requestNotes).lowercased())."
        default: return nil
        }
    }
}

struct NativePartyRequestNote: Decodable, Equatable, Identifiable {
    let id: String
    let performerId: String
    let performerName: String
    let performerRole: String
    let body: String
    let senderName: String?
    let status: String
    let version: Int
    let createdAt: String
    let acceptedAt: String?
    let playedAt: String?
    var roleLabel: String { performerRole == "dj" ? "DJ" : performerRole == "mc" ? "MC" : "Performer" }
}

struct NativePartyRequestEligibility: Decodable, Equatable {
    struct Performer: Decodable, Equatable, Identifiable { let id: String; let displayName: String; let role: String }
    struct Tier: Decodable, Equatable { let name: String; let priceCents: Int; let requestNotes: Int }
    let state: String
    let allowance: Int
    let used: Int
    let remaining: Int
    let opensAt: String
    let closesAt: String
    let performers: [Performer]
    let tiersWithRequests: [Tier]
    var canSend: Bool { state == "open" && remaining > 0 && !performers.isEmpty }
}

struct NativePartyRequestsAPI {
    let client: BytspotAPIClient
    private struct Notes: Decodable { let notes: [NativePartyRequestNote] }
    struct Inbox: Decodable { let role: String; let notes: [NativePartyRequestNote] }
    struct Screen: Decodable { let partyTitle: String; let notes: [NativePartyRequestNote] }

    private func query<T: Decodable>(_ type: T.Type, _ route: String, partyID: String) async throws -> T {
        let payload = try await client.trpcQueryPayload(path: NativePartyRequestsContract.prefix + route, input: ["partyId": partyID])
        return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: payload))
    }
    private func mutate(_ route: String, input: [String: Any]) async throws -> NativePartyRequestNote {
        try await client.trpcDecode(NativePartyRequestNote.self, path: NativePartyRequestsContract.prefix + route, method: "POST", input: input)
    }

    func eligibility(_ partyID: String) async throws -> NativePartyRequestEligibility { try await query(NativePartyRequestEligibility.self, "eligibility", partyID: partyID) }
    func mine(_ partyID: String) async throws -> [NativePartyRequestNote] { try await query(Notes.self, "mine", partyID: partyID).notes }
    func inbox(_ partyID: String) async throws -> Inbox { try await query(Inbox.self, "inbox", partyID: partyID) }
    func screen(_ partyID: String) async throws -> Screen { try await query(Screen.self, "screen", partyID: partyID) }
    func send(_ partyID: String, performerID: String, body: String, showName: Bool, key: UUID) async throws -> NativePartyRequestNote {
        try await mutate("send", input: ["partyId": partyID, "performerId": performerID, "body": body, "showName": showName, "idempotencyKey": key.uuidString.lowercased()])
    }
    func decide(_ partyID: String, note: NativePartyRequestNote, decision: String) async throws -> NativePartyRequestNote {
        try await mutate("decide", input: ["partyId": partyID, "id": note.id, "version": note.version, "decision": decision])
    }

    @MainActor static func current(_ sessionStore: BytspotSessionStore) -> NativePartyRequestsAPI? {
        guard sessionStore.canAttachBearerToken, let token = sessionStore.token else { return nil }
        return NativePartyRequestsAPI(client: BytspotAPIClient(tokenProvider: { token }))
    }
}

/// The guest's side, shown above the lineup. Hidden unless the party has a
/// tier that includes requests or the guest already sent some.
struct NativePartyRequestsGuestCard: View {
    let partyID: String
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var eligibility: NativePartyRequestEligibility?
    @State private var notes: [NativePartyRequestNote] = []
    @State private var composing = false
    @State private var fullScreenNote: NativePartyRequestNote?

    var body: some View {
        Group {
            if let eligibility, let headline = NativePartyRequestsContract.eligibilityHeadline(eligibility) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Requests", systemImage: "music.quarternote.3").font(.headline)
                    Text(headline).font(.subheadline.weight(.semibold))
                        .accessibilityIdentifier("native-party-requests-headline")
                    if eligibility.canSend {
                        Button { composing = true } label: {
                            Label("Send a request", systemImage: "paperplane.fill").font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 48)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("native-party-requests-send")
                    }
                    ForEach(notes) { note in
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(note.body).font(.subheadline)
                                Text("To \(note.performerName) · \(NativePartyRequestsContract.guestStatusLabel(note.status))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            if note.status == "accepted" || note.status == "played" {
                                Button { fullScreenNote = note } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
                                    .frame(minWidth: 44, minHeight: 44)
                                    .accessibilityLabel("Show full screen")
                            }
                        }
                    }
                    if eligibility.allowance > 0 {
                        Text("The performer decides what to play. Accepted notes can appear on a screen at the party.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("native-party-requests-guest")
            }
        }
        .task(id: sessionStore.token ?? "") { await load() }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load() } } }
        .sheet(isPresented: $composing) {
            if let eligibility {
                NativePartyRequestComposer(partyID: partyID, eligibility: eligibility) { await load() }
                    .environmentObject(sessionStore)
            }
        }
        .fullScreenCover(item: $fullScreenNote) { note in
            NativePartyStageScreen(source: .single(note)).environmentObject(sessionStore)
        }
    }

    @MainActor private func load() async {
        guard let api = NativePartyRequestsAPI.current(sessionStore) else { eligibility = nil; notes = []; return }
        guard let fresh = try? await api.eligibility(partyID) else { return }
        eligibility = fresh
        notes = fresh.allowance > 0 ? ((try? await api.mine(partyID)) ?? notes) : []
    }
}

struct NativePartyRequestComposer: View {
    let partyID: String
    let eligibility: NativePartyRequestEligibility
    let onSent: () async -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var performerID: String
    @State private var text = ""
    @State private var showName = true
    @State private var sending = false
    @State private var message = ""
    // Kept for the life of the sheet so a retry after a lost response cannot use a second request.
    @State private var key = UUID()

    init(partyID: String, eligibility: NativePartyRequestEligibility, onSent: @escaping () async -> Void) {
        self.partyID = partyID; self.eligibility = eligibility; self.onSent = onSent
        _performerID = State(initialValue: eligibility.performers.first?.id ?? "")
    }

    var body: some View {
        NavigationView {
            Form {
                if eligibility.performers.count > 1 {
                    Picker("To", selection: $performerID) {
                        ForEach(eligibility.performers) { performer in Text(performer.displayName).tag(performer.id) }
                    }
                } else if let performer = eligibility.performers.first {
                    LabeledRow(label: "To", value: performer.displayName)
                }
                Section {
                    TextField("Song, shout-out or dedication", text: Binding(get: { text }, set: { text = String($0.prefix(NativePartyRequestsContract.maxLength)) }))
                        .accessibilityIdentifier("native-party-request-text")
                    Text("\(text.count)/\(NativePartyRequestsContract.maxLength)").font(.caption).foregroundStyle(.secondary)
                    Toggle("Show my first name", isOn: $showName)
                } footer: {
                    Text("\(eligibility.remaining) of \(eligibility.allowance) requests left. The performer decides what to play, and a sent request counts even if it isn't picked.")
                }
                if !message.isEmpty { Section { Text(message).foregroundColor(NativeTheme.orange) } }
            }
            .navigationTitle("Send a request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Sending…" : "Send") { Task { await send() } }
                        .disabled(sending || NativePartyRequestsContract.normalizedBody(text) == nil || performerID.isEmpty)
                        .accessibilityIdentifier("native-party-request-submit")
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    @MainActor private func send() async {
        guard let api = NativePartyRequestsAPI.current(sessionStore), let body = NativePartyRequestsContract.normalizedBody(text) else { return }
        sending = true
        defer { sending = false }
        do {
            _ = try await api.send(partyID, performerID: performerID, body: body, showName: showName, key: key)
            await onSent()
            dismiss()
        } catch BytspotAPIClient.APIError.server(_, let responseBody) {
            let server = NativeAuthDataAPI.serverMessage(in: responseBody)
            message = server.isEmpty ? "Your request didn't send. Try again." : server
        } catch {
            message = "Your request didn't send. Try again."
        }
    }
}

private struct LabeledRow: View {
    let label: String; let value: String
    var body: some View { HStack { Text(label); Spacer(); Text(value).foregroundStyle(.secondary) } }
}

/// Where the host and confirmed performers accept, mark played or dismiss notes.
struct NativePartyRequestsInbox: View {
    let partyID: String
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var inbox: NativePartyRequestsAPI.Inbox?
    @State private var failed = false
    @State private var busyID: String?
    @State private var message = ""
    @State private var showingStage = false

    var body: some View {
        NavigationView {
            List {
                if let inbox {
                    section("New", notes: inbox.notes.filter { $0.status == "sent" }, empty: "No new requests.")
                    section("On screen", notes: inbox.notes.filter { $0.status == "accepted" }, empty: "Accepted requests roll on the stage screen.")
                    let played = inbox.notes.filter { $0.status == "played" }
                    if !played.isEmpty { section("Played", notes: played, empty: "") }
                } else if failed {
                    Text("Requests didn't load. Pull to try again.").foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
                if !message.isEmpty { Text(message).foregroundColor(NativeTheme.orange) }
            }
            .refreshable { await load() }
            .navigationTitle("Requests")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingStage = true } label: { Label("Stage screen", systemImage: "play.rectangle.fill") }
                        .accessibilityIdentifier("native-party-requests-open-stage")
                }
            }
        }
        .navigationViewStyle(.stack)
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(nanoseconds: NativePartyRequestsContract.inboxRefreshSeconds * 1_000_000_000)
            }
        }
        .fullScreenCover(isPresented: $showingStage) {
            NativePartyStageScreen(source: .live(partyID: partyID)).environmentObject(sessionStore)
        }
        .accessibilityIdentifier("native-party-requests-inbox")
    }

    @ViewBuilder private func section(_ title: String, notes: [NativePartyRequestNote], empty: String) -> some View {
        Section(title) {
            if notes.isEmpty { Text(empty).foregroundStyle(.secondary) }
            ForEach(notes) { note in
                VStack(alignment: .leading, spacing: 8) {
                    Text(note.body).font(.body.weight(.semibold))
                    Text("\(note.senderName ?? "Anonymous") → \(note.roleLabel) \(note.performerName)").font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        switch note.status {
                        case "sent":
                            decisionButton("Accept", note: note, decision: "accept", color: NativeTheme.emerald)
                            decisionButton("Dismiss", note: note, decision: "dismiss", color: NativeTheme.orange)
                        case "accepted":
                            decisionButton("Played", note: note, decision: "played", color: NativeTheme.cyan)
                            decisionButton("Remove", note: note, decision: "dismiss", color: NativeTheme.orange)
                        default:
                            decisionButton("Remove", note: note, decision: "dismiss", color: NativeTheme.orange)
                        }
                    }
                }
                .padding(.vertical, 4)
                .disabled(busyID != nil)
            }
        }
    }

    private func decisionButton(_ title: String, note: NativePartyRequestNote, decision: String, color: Color) -> some View {
        Button(title) { Task { await decide(note, decision) } }
            .buttonStyle(.borderless)
            .font(.subheadline.weight(.bold)).foregroundColor(color)
            .frame(minHeight: 44)
            .accessibilityIdentifier("native-party-request-\(decision)-\(note.id)")
    }

    @MainActor private func load() async {
        guard let api = NativePartyRequestsAPI.current(sessionStore) else { return }
        do { inbox = try await api.inbox(partyID); failed = false }
        catch { if inbox == nil { failed = true } }
    }

    @MainActor private func decide(_ note: NativePartyRequestNote, _ decision: String) async {
        guard let api = NativePartyRequestsAPI.current(sessionStore) else { return }
        busyID = note.id
        defer { busyID = nil }
        do { _ = try await api.decide(partyID, note: note, decision: decision); message = "" }
        catch { message = "That request changed. The list is refreshed." }
        await load()
    }
}

/// The full-screen carousel. Live mode rolls the party's accepted notes and is
/// meant for a TV over AirPlay; single mode shows a guest their own note.
struct NativePartyStageScreen: View {
    enum Source { case live(partyID: String), single(NativePartyRequestNote) }
    let source: Source
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var notes: [NativePartyRequestNote] = []
    @State private var partyTitle = ""
    @State private var index = 0
    @State private var chromeVisible = true
    @State private var chromeReveal = UUID()

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.black, NativeTheme.purple.opacity(0.55), Color.black], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            if let note = NativePartyStageCarousel.current(notes, index: index) {
                card(note)
                    .id(note.id)
                    .transition(reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "music.quarternote.3").font(.system(size: 48, weight: .bold)).foregroundColor(NativeTheme.cyan)
                    Text("Accepted requests appear here").font(.system(size: 28, weight: .black, design: .rounded)).foregroundColor(.white)
                    if !partyTitle.isEmpty { Text(partyTitle).font(.title3.weight(.semibold)).foregroundColor(.white.opacity(0.6)) }
                }
                .multilineTextAlignment(.center).padding(32)
            }
            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 30, weight: .bold)).foregroundColor(.white.opacity(0.7))
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Close stage screen")
                    .accessibilityIdentifier("native-party-stage-close")
                }
                Spacer()
                if notes.count > 1 {
                    HStack(spacing: 8) {
                        ForEach(Array(notes.enumerated()), id: \.element.id) { offset, _ in
                            Circle().fill(Color.white.opacity(offset == index % notes.count ? 0.9 : 0.25)).frame(width: 8, height: 8)
                        }
                    }
                    .padding(.bottom, 8)
                    .accessibilityHidden(true)
                }
            }
            .padding(20)
            .opacity(chromeVisible ? 1 : 0)
        }
        .contentShape(Rectangle())
        .onTapGesture { revealChrome() }
        .gesture(DragGesture(minimumDistance: 30).onEnded { value in
            guard notes.count > 1 else { return }
            withAnimation(.easeInOut(duration: 0.45)) {
                index = value.translation.width < 0 ? (index + 1) % notes.count : (index - 1 + notes.count) % notes.count
            }
        })
        .statusBarHidden(true)
        .preferredColorScheme(.dark)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; revealChrome() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .task { await refreshLoop() }
        .task(id: notes.map(\.id)) { await rollLoop() }
        .accessibilityIdentifier("native-party-stage-screen")
    }

    private func card(_ note: NativePartyRequestNote) -> some View {
        VStack(spacing: 22) {
            Text("FOR \(note.roleLabel) \(note.performerName)".uppercased())
                .font(.system(size: 18, weight: .black)).tracking(3).foregroundColor(NativeTheme.cyan)
            Text(note.body)
                .font(.system(size: 64, weight: .black, design: .rounded)).foregroundColor(.white)
                .multilineTextAlignment(.center).lineLimit(5).minimumScaleFactor(0.3)
            if let name = note.senderName { Text("— \(name)").font(.system(size: 26, weight: .bold)).foregroundColor(.white.opacity(0.75)) }
            if note.status == "played" {
                Text("PLAYED").font(.system(size: 14, weight: .black)).tracking(2).foregroundColor(.black)
                    .padding(.horizontal, 12).padding(.vertical, 6).background(NativeTheme.emerald).clipShape(Capsule())
            }
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }

    private func revealChrome() {
        let reveal = UUID()
        chromeReveal = reveal
        chromeVisible = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard chromeReveal == reveal else { return }
            withAnimation(.easeOut(duration: 0.4)) { chromeVisible = false }
        }
    }

    @MainActor private func refreshLoop() async {
        if case .single(let note) = source { notes = [note]; return }
        guard case .live(let partyID) = source else { return }
        while !Task.isCancelled {
            if let api = NativePartyRequestsAPI.current(sessionStore), let screen = try? await api.screen(partyID) {
                partyTitle = screen.partyTitle
                let next = NativePartyStageCarousel.nextIndex(previous: notes, fresh: screen.notes, index: index)
                withAnimation(.easeInOut(duration: 0.45)) { notes = screen.notes; index = next }
            }
            try? await Task.sleep(nanoseconds: NativePartyRequestsContract.screenRefreshSeconds * 1_000_000_000)
        }
    }

    @MainActor private func rollLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: NativePartyRequestsContract.rollSeconds * 1_000_000_000)
            guard !Task.isCancelled, notes.count > 1 else { continue }
            withAnimation(.easeInOut(duration: 0.6)) { index = (index + 1) % notes.count }
        }
    }
}

enum NativePartyStageCarousel {
    static func current(_ notes: [NativePartyRequestNote], index: Int) -> NativePartyRequestNote? {
        notes.isEmpty ? nil : notes[index % notes.count]
    }

    /// A newly accepted note jumps to the front; otherwise the note on screen stays on screen.
    static func nextIndex(previous: [NativePartyRequestNote], fresh: [NativePartyRequestNote], index: Int) -> Int {
        guard !fresh.isEmpty else { return 0 }
        let known = Set(previous.map(\.id))
        if let first = fresh.first, !known.contains(first.id) { return 0 }
        if let showing = current(previous, index: index), let kept = fresh.firstIndex(where: { $0.id == showing.id }) { return kept }
        return min(index, fresh.count - 1)
    }
}
