import SwiftUI

/// What a member can report. Mirrors the server's `REPORT_KINDS`.
enum NativeSafetyKind: String, CaseIterable {
    case user, party, review, sale

    var noun: String {
        switch self {
        case .user: return "person"
        case .party: return "party"
        case .review: return "review"
        case .sale: return "sale"
        }
    }
}

/// Mirrors the server's `REPORT_REASONS`; the raw value is what is sent.
enum NativeReportReason: String, CaseIterable, Identifiable {
    case spam, harassment, sexual, violence, impersonation, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .spam: return "Spam"
        case .harassment: return "Harassment or bullying"
        case .sexual: return "Nudity or sexual content"
        case .violence: return "Violence or threats"
        case .impersonation: return "Pretending to be someone else"
        case .other: return "Something else"
        }
    }
}

/// Something on screen that can be reported, and whose owner can be blocked.
/// A party, review or sale blocks its owner by the item, so the app never
/// needs a host's or seller's account id.
struct NativeSafetyTarget: Identifiable, Equatable {
    let kind: NativeSafetyKind
    let targetID: String
    let ownerName: String

    var id: String { "\(kind.rawValue):\(targetID)" }
    var blockTitle: String { "Block \(ownerName)" }
}

enum NativeSafetyAction: Identifiable, Equatable {
    case report(NativeSafetyTarget)
    case block(NativeSafetyTarget)

    var id: String {
        switch self {
        case .report(let target): return "report:\(target.id)"
        case .block(let target): return "block:\(target.id)"
        }
    }

    var target: NativeSafetyTarget {
        switch self {
        case .report(let target), .block(let target): return target
        }
    }
}

struct NativeBlockedMember: Decodable, Equatable, Identifiable {
    let userId: String
    let name: String
    let blockedAt: String

    var id: String { userId }
    var blockedDate: Date? { ISO8601DateFormatter.nativeSafety.date(from: blockedAt) ?? ISO8601DateFormatter().date(from: blockedAt) }
}

private extension ISO8601DateFormatter {
    static let nativeSafety: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

/// Items taken off screen the moment a member reports or blocks, and put
/// back if the server refuses.
struct NativeSafetyHiddenSet: Equatable {
    private(set) var ids: Set<String> = []

    mutating func hide(_ id: String) { ids.insert(id) }
    mutating func restore(_ id: String) { ids.remove(id) }
    func contains(_ id: String) -> Bool { ids.contains(id) }
    func visible<Item>(_ items: [Item], id: (Item) -> String) -> [Item] { items.filter { !ids.contains(id($0)) } }
}

enum NativeSafetyCopy {
    static let reportThanks = "Thanks. We review reports within 24 hours."
    static let unavailable = "This isn't available anymore."
    static let offline = "Couldn't reach Bytspot. Try again."
    static let tooMany = "Too many tries. Wait a moment and try again."
    static let signInAgain = "Sign in again to continue."
    static let safetyEmail = "safety@bytspot.com"

    static func blockMessage(_ name: String) -> String {
        "\(name) won't be told. You'll stop seeing each other's parties, sales, reviews and plans."
    }

    static func unblockMessage(_ name: String) -> String {
        "\(name) won't be told. Anything the block removed stays removed."
    }
}

struct NativeSafetyAPI {
    let client: BytspotAPIClient

    static let noteLimit = 500

    static func reportInput(target: NativeSafetyTarget, reason: NativeReportReason, note: String) -> [String: Any] {
        var input: [String: Any] = ["kind": target.kind.rawValue, "targetId": target.targetID, "reason": reason.rawValue]
        let trimmed = String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(noteLimit))
        if !trimmed.isEmpty { input["note"] = trimmed }
        return input
    }

    static func blockInput(target: NativeSafetyTarget) -> [String: Any] {
        target.kind == .user ? ["userId": target.targetID] : ["kind": target.kind.rawValue, "targetId": target.targetID]
    }

    static func unblockInput(userID: String) -> [String: Any] { ["userId": userID] }

    static func decodeBlocks(_ payload: Any) throws -> [NativeBlockedMember] {
        struct List: Decodable { let blocks: [NativeBlockedMember] }
        return try JSONDecoder().decode(List.self, from: JSONSerialization.data(withJSONObject: payload)).blocks
    }

    func report(_ target: NativeSafetyTarget, reason: NativeReportReason, note: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/safety.report", method: "POST", input: Self.reportInput(target: target, reason: reason, note: note))
    }

    func block(_ target: NativeSafetyTarget) async throws {
        _ = try await client.trpcPayload(path: "/trpc/safety.block", method: "POST", input: Self.blockInput(target: target))
    }

    func unblock(userID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/safety.unblock", method: "POST", input: Self.unblockInput(userID: userID))
    }

    func blocks() async throws -> [NativeBlockedMember] {
        try Self.decodeBlocks(try await client.trpcPayload(path: "/trpc/safety.blocks"))
    }

    /// Hidden and blocked things read as NOT_FOUND on the server. A refusal
    /// that names what to fix (yourself, the block limit, a suspension) is
    /// shown as written.
    static func message(for error: Error, fallback: String) -> String {
        if NativeAuthDataAPI.isAccountSuspended(error) { return NativeAuthDataAPI.suspendedMessage }
        guard case let BytspotAPIClient.APIError.server(status, body) = error else { return NativeSafetyCopy.offline }
        if status == 404 || body.contains("\"code\":\"NOT_FOUND\"") { return NativeSafetyCopy.unavailable }
        if status == 429 { return NativeSafetyCopy.tooMany }
        if status == 401 { return NativeSafetyCopy.signInAgain }
        let said = NativePlanDemandFailure.serverMessage(in: body)
        if status == 400 || status == 403, !said.isEmpty, !said.hasPrefix("[") { return said }
        return fallback
    }
}

extension BytspotSessionStore {
    var safetyAPI: NativeSafetyAPI {
        let token = canAttachBearerToken ? self.token : nil
        return NativeSafetyAPI(client: BytspotAPIClient(tokenProvider: { token }))
    }
}

/// "Report…" and "Block" for one item, for a Menu or a context menu.
struct NativeSafetyMenuItems: View {
    let target: NativeSafetyTarget
    @Binding var action: NativeSafetyAction?

    var body: some View {
        Button { action = .report(target) } label: { Label("Report \(target.kind.noun)…", systemImage: "flag") }
            .accessibilityIdentifier("native-safety-report-\(target.id)")
        Button(role: .destructive) { action = .block(target) } label: { Label(target.blockTitle, systemImage: "hand.raised") }
            .accessibilityIdentifier("native-safety-block-\(target.id)")
    }
}

struct NativeSafetyMenu: View {
    let target: NativeSafetyTarget
    @Binding var action: NativeSafetyAction?

    var body: some View {
        Menu {
            NativeSafetyMenuItems(target: target, action: $action)
        } label: {
            Image(systemName: "ellipsis.circle").font(.system(size: 18, weight: .semibold))
                .foregroundColor(NativeTheme.textSecondary).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .accessibilityLabel("More options")
        .accessibilityIdentifier("native-safety-menu-\(target.id)")
    }
}

extension View {
    /// Presents the report sheet and the block confirmation for `action`,
    /// hiding the item in `hidden` at once and restoring it on failure.
    func nativeSafetyActions(_ action: Binding<NativeSafetyAction?>, hidden: Binding<NativeSafetyHiddenSet>, sessionStore: BytspotSessionStore) -> some View {
        modifier(NativeSafetyActionsModifier(action: action, hidden: hidden, sessionStore: sessionStore))
    }
}

private struct NativeSafetyActionsModifier: ViewModifier {
    @Binding var action: NativeSafetyAction?
    @Binding var hidden: NativeSafetyHiddenSet
    @ObservedObject var sessionStore: BytspotSessionStore
    @State private var failure: String?

    private var reportTarget: Binding<NativeSafetyTarget?> {
        Binding(get: { if case .report(let target) = action { return target }; return nil },
                set: { if $0 == nil, case .report = action { action = nil } })
    }

    private var blockTarget: NativeSafetyTarget? {
        if case .block(let target) = action { return target }
        return nil
    }

    private var confirmingBlock: Binding<Bool> {
        Binding(get: { blockTarget != nil }, set: { if !$0, blockTarget != nil { action = nil } })
    }

    func body(content: Content) -> some View {
        content
            .sheet(item: reportTarget) { target in
                NativeReportSheet(target: target, api: sessionStore.safetyAPI,
                                  hide: { hidden.hide($0.targetID) }, restore: { hidden.restore($0.targetID) })
            }
            .confirmationDialog(blockTarget.map { "\($0.blockTitle)?" } ?? "", isPresented: confirmingBlock, titleVisibility: .visible, presenting: blockTarget) { target in
                Button("Block", role: .destructive) { Task { await block(target) } }
                Button("Cancel", role: .cancel) {}
            } message: { target in
                Text(NativeSafetyCopy.blockMessage(target.ownerName))
            }
            .alert(failure ?? "", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
                Button("OK", role: .cancel) {}
            }
    }

    @MainActor private func block(_ target: NativeSafetyTarget) async {
        hidden.hide(target.targetID)
        do {
            try await sessionStore.safetyAPI.block(target)
        } catch {
            hidden.restore(target.targetID)
            failure = NativeSafetyAPI.message(for: error, fallback: "\(target.ownerName) couldn't be blocked. Try again.")
        }
    }
}

/// One sheet for every report: a reason, an optional note, then thanks and
/// an offer to also block the owner.
struct NativeReportSheet: View {
    let target: NativeSafetyTarget
    let api: NativeSafetyAPI
    let hide: (NativeSafetyTarget) -> Void
    let restore: (NativeSafetyTarget) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var reason: NativeReportReason?
    @State private var note = ""
    @State private var reported = false
    @State private var blocked = false
    @State private var confirmBlock = false
    @State private var busy = false
    @State private var message = ""

    var body: some View {
        NavigationView {
            Form {
                if reported { thanks } else { form }
                if !message.isEmpty {
                    Section { Text(message).foregroundColor(NativeTheme.orange).accessibilityIdentifier("native-report-message") }
                }
            }
            .navigationTitle("Report \(target.kind.noun)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !reported { Button("Cancel") { dismiss() }.disabled(busy) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if reported { Button("Done") { dismiss() } }
                    else { Button("Submit") { Task { await submit() } }.disabled(reason == nil || busy).accessibilityIdentifier("native-report-submit") }
                }
            }
            .confirmationDialog("\(target.blockTitle)?", isPresented: $confirmBlock, titleVisibility: .visible) {
                Button("Block", role: .destructive) { Task { await block() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(NativeSafetyCopy.blockMessage(target.ownerName))
            }
        }
        .interactiveDismissDisabled(busy)
        .accessibilityIdentifier("native-report-sheet")
    }

    @ViewBuilder private var form: some View {
        Section(header: Text("Why are you reporting this?"), footer: Text("\(target.ownerName) won't know who reported.")) {
            ForEach(NativeReportReason.allCases) { option in
                Button { reason = option } label: {
                    HStack {
                        Text(option.label).foregroundColor(NativeTheme.textPrimary)
                        Spacer()
                        if reason == option { Image(systemName: "checkmark").foregroundColor(NativeTheme.cyan) }
                    }
                }
                .accessibilityAddTraits(reason == option ? .isSelected : [])
                .accessibilityIdentifier("native-report-reason-\(option.rawValue)")
            }
        }
        Section(header: Text("Anything else? (optional)"), footer: Text("\(note.count)/\(NativeSafetyAPI.noteLimit)")) {
            TextEditor(text: $note)
                .frame(minHeight: 90)
                .onChange(of: note) { value in
                    if value.count > NativeSafetyAPI.noteLimit { note = String(value.prefix(NativeSafetyAPI.noteLimit)) }
                }
                .accessibilityLabel("Note")
                .accessibilityIdentifier("native-report-note")
        }
    }

    @ViewBuilder private var thanks: some View {
        Section {
            Label(NativeSafetyCopy.reportThanks, systemImage: "checkmark.seal.fill")
                .foregroundColor(NativeTheme.textPrimary)
                .accessibilityIdentifier("native-report-thanks")
        }
        Section {
            if blocked {
                Text("You blocked \(target.ownerName).").foregroundColor(NativeTheme.textSecondary)
            } else {
                Button(role: .destructive) { confirmBlock = true } label: { Text("Also block \(target.ownerName)") }
                    .disabled(busy)
                    .accessibilityIdentifier("native-report-also-block")
            }
        }
    }

    @MainActor private func submit() async {
        guard let reason, !busy else { return }
        busy = true; message = ""
        hide(target)
        do {
            try await api.report(target, reason: reason, note: note)
            reported = true
        } catch {
            restore(target)
            message = NativeSafetyAPI.message(for: error, fallback: "Your report couldn't be sent. Try again.")
        }
        busy = false
    }

    @MainActor private func block() async {
        guard !busy else { return }
        busy = true; message = ""
        do {
            try await api.block(target)
            blocked = true
        } catch {
            message = NativeSafetyAPI.message(for: error, fallback: "\(target.ownerName) couldn't be blocked. Try again.")
        }
        busy = false
    }
}

/// Profile → Blocked people. Unblocking takes the row away at once and puts
/// it back if the server refuses.
struct NativeBlockedPeoplePanel: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var blocks: [NativeBlockedMember] = []
    @State private var hidden = NativeSafetyHiddenSet()
    @State private var loaded = false
    @State private var unblocking: NativeBlockedMember?
    @State private var message = ""

    private var visible: [NativeBlockedMember] { hidden.visible(blocks, id: \.userId) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !sessionStore.isAuthenticated {
                note("Sign in to see the people you've blocked.")
            } else if !loaded {
                ProgressView().tint(NativeTheme.cyan).frame(maxWidth: .infinity).padding(.vertical, 24)
            } else if visible.isEmpty {
                note("You haven't blocked anyone. Block someone from the menu on their party, sale, review or name.")
                    .accessibilityIdentifier("native-blocked-people-empty")
            } else {
                ForEach(visible) { member in row(member) }
            }
            if !message.isEmpty {
                Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.orange)
            }
        }
        .task(id: sessionStore.authenticatedUserID) { await load() }
        .confirmationDialog(unblocking.map { "Unblock \($0.name)?" } ?? "", isPresented: Binding(get: { unblocking != nil }, set: { if !$0 { unblocking = nil } }), titleVisibility: .visible, presenting: unblocking) { member in
            Button("Unblock") { Task { await unblock(member) } }
            Button("Cancel", role: .cancel) {}
        } message: { member in
            Text(NativeSafetyCopy.unblockMessage(member.name))
        }
        .accessibilityIdentifier("native-blocked-people")
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func row(_ member: NativeBlockedMember) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(member.name).font(.system(size: 15, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                if let date = member.blockedDate {
                    Text("Blocked \(date.formatted(date: .abbreviated, time: .omitted))").font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                }
            }
            Spacer(minLength: 8)
            Button("Unblock") { unblocking = member }
                .font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan)
                .frame(minHeight: 44)
                .accessibilityIdentifier("native-blocked-unblock-\(member.userId)")
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @MainActor private func load() async {
        guard sessionStore.isAuthenticated else { blocks = []; loaded = false; return }
        do {
            blocks = try await sessionStore.safetyAPI.blocks()
            hidden = NativeSafetyHiddenSet()
            message = ""
        } catch {
            message = NativeSafetyAPI.message(for: error, fallback: "Blocked people couldn't load. Try again.")
        }
        loaded = true
    }

    @MainActor private func unblock(_ member: NativeBlockedMember) async {
        hidden.hide(member.userId)
        do {
            try await sessionStore.safetyAPI.unblock(userID: member.userId)
            blocks.removeAll { $0.userId == member.userId }
            hidden.restore(member.userId)
            message = ""
        } catch {
            hidden.restore(member.userId)
            message = NativeSafetyAPI.message(for: error, fallback: "\(member.name) couldn't be unblocked. Try again.")
        }
    }
}

/// Profile → Contact Bytspot. Opens Mail to the safety inbox.
struct NativeContactBytspotPanel: View {
    @Environment(\.openURL) private var openURL

    static let mailURL = URL(string: "mailto:\(NativeSafetyCopy.safetyEmail)")!

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Report a safety problem, or ask about a report or a block.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button { openURL(Self.mailURL) } label: {
                Label("Email \(NativeSafetyCopy.safetyEmail)", systemImage: "envelope.fill")
                    .font(.system(size: 15, weight: .black)).foregroundColor(.black)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(NativeTheme.cyan)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-contact-bytspot-email")
        }
    }
}

