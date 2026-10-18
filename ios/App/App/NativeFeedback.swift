import SwiftUI
import UserNotifications

enum NativeFeedbackTargetKind: String, CaseIterable, Codable {
    case party, plan
}

struct NativeFeedbackTarget: Equatable, Hashable, Identifiable {
    let kind: NativeFeedbackTargetKind
    let targetID: String
    var id: String { "\(kind.rawValue)-\(targetID)" }

    init?(kind rawKind: String?, targetID rawID: String?) {
        guard let kind = rawKind.flatMap({ NativeFeedbackTargetKind(rawValue: $0.lowercased()) }),
              let targetID = rawID?.trimmingCharacters(in: .whitespacesAndNewlines),
              !targetID.isEmpty, targetID.count <= 200, !targetID.contains("/") else { return nil }
        self.kind = kind
        self.targetID = targetID
    }
}

/// `https://bytspot.app/feedback?kind=party|plan&id=<id>` or the custom scheme.
struct NativeFeedbackRoute: Equatable {
    let target: NativeFeedbackTarget

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let scheme = url.scheme?.lowercased()
        let host = components.host?.lowercased() ?? ""
        let path = components.path.split(separator: "/").map { $0.lowercased() }
        let isFeedback: Bool
        switch scheme {
        case "https": isFeedback = host == "bytspot.app" && path == ["feedback"]
        case "bytspot": isFeedback = host == "feedback" && path.isEmpty
        default: isFeedback = false
        }
        guard isFeedback else { return nil }
        let items = components.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }?.value }
        guard let target = NativeFeedbackTarget(kind: value("kind"), targetID: value("id")) else { return nil }
        self.target = target
    }
}

struct NativeFeedbackPendingItem: Equatable, Identifiable {
    let target: NativeFeedbackTarget
    let title: String
    let coverURL: URL?
    let endedAt: Date?
    var id: String { target.id }

    /// Keeps the server's newest-first order and drops rows it cannot trust.
    static func list(from payload: Any) -> [NativeFeedbackPendingItem] {
        guard let rows = (payload as? [String: Any])?["pending"] as? [[String: Any]] else { return [] }
        var seen = Set<String>()
        return rows.compactMap { row -> NativeFeedbackPendingItem? in
            guard let target = NativeFeedbackTarget(kind: row["targetKind"] as? String, targetID: row["targetId"] as? String),
                  let title = (row["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
                  seen.insert(target.id).inserted else { return nil }
            let cover = (row["coverURL"] as? String).flatMap(URL.init(string:)).flatMap { $0.scheme?.lowercased() == "https" ? $0 : nil }
            let endedAt = (row["endedAt"] as? String).flatMap(NativeAccountDeletionFormat.date(fromISO:))
            return NativeFeedbackPendingItem(target: target, title: title, coverURL: cover, endedAt: endedAt)
        }
    }
}

struct NativeFeedbackDraft: Equatable {
    static let tags = ["Music", "Crowd", "Venue", "Host", "Value", "Safety"]
    static let noteLimit = 500

    var rating: Int?
    var tags: Set<String> = []
    var note = ""

    var trimmedNote: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }
    var canSubmit: Bool {
        guard let rating, (1...5).contains(rating) else { return false }
        return note.count <= Self.noteLimit && tags.isSubset(of: Self.tags)
    }

    func input(for target: NativeFeedbackTarget) -> [String: Any]? {
        guard canSubmit, let rating else { return nil }
        var input: [String: Any] = ["targetKind": target.kind.rawValue, "targetId": target.targetID, "rating": rating,
                                    "tags": Self.tags.filter(tags.contains)]
        if !trimmedNote.isEmpty { input["note"] = trimmedNote }
        return input
    }
}

struct NativeFeedbackAPI {
    static let pendingPath = "/trpc/feedback.pending"
    static let submitPath = "/trpc/feedback.submit"
    static let dismissPath = "/trpc/feedback.dismiss"
    let client: BytspotAPIClient

    func pending() async throws -> [NativeFeedbackPendingItem] {
        NativeFeedbackPendingItem.list(from: try await client.trpcPayload(path: Self.pendingPath))
    }

    func submit(_ draft: NativeFeedbackDraft, for target: NativeFeedbackTarget) async throws {
        guard let input = draft.input(for: target) else { throw BytspotAPIClient.APIError.invalidResponse }
        _ = try await client.trpcPayload(path: Self.submitPath, method: "POST", input: input)
    }

    func dismiss(_ target: NativeFeedbackTarget) async throws {
        _ = try await client.trpcPayload(path: Self.dismissPath, method: "POST", input: ["targetKind": target.kind.rawValue, "targetId": target.targetID])
    }
}

/// Signed-in only. Any failure, including a server without these procedures,
/// leaves the list empty rather than showing an error.
@MainActor
final class NativeFeedbackStore: ObservableObject {
    static let shared = NativeFeedbackStore()
    @Published private(set) var pending: [NativeFeedbackPendingItem] = []
    private var generation = UUID()

    var newest: NativeFeedbackPendingItem? { pending.first }

    func item(for target: NativeFeedbackTarget) -> NativeFeedbackPendingItem? { pending.first { $0.target == target } }

    func refresh(sessionToken: String?) async {
        #if DEBUG
        if debugSeeded { return }
        #endif
        let request = UUID()
        generation = request
        guard let sessionToken, !sessionToken.isEmpty, sessionToken != "guest_session" else { pending = []; return }
        let fresh = try? await NativeFeedbackAPI(client: BytspotAPIClient(tokenProvider: { sessionToken })).pending()
        guard generation == request else { return }
        pending = fresh ?? []
    }

    func remove(_ target: NativeFeedbackTarget) { pending.removeAll { $0.target == target } }

    #if DEBUG
    private var debugSeeded = false
    func debugSeed(_ items: [NativeFeedbackPendingItem]) { debugSeeded = true; pending = items }
    #endif
}

#if DEBUG
/// Screenshot stubs (BYT_NATIVE_PREVIEW_DRF=home|permission|feedback|thanks|control).
enum NativeDiscoverRemindersFeedbackPreview {
    static var surface: String? { ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_DRF"]?.lowercased() }

    static let item = NativeFeedbackPendingItem(
        target: NativeFeedbackTarget(kind: "party", targetID: "fixture-open-6")!, title: "House Party",
        coverURL: URL(string: "https://picsum.photos/seed/bytspot-party/800/600"), endedAt: Date().addingTimeInterval(-86_400))

    static let draft = NativeFeedbackDraft(rating: 4, tags: ["Music", "Crowd", "Host"], note: "Great playlist, easy check-in.")

    @MainActor static func applyOnAppear(pushService: NativePushService) {
        switch surface {
        case "home": NativeFeedbackStore.shared.debugSeed([item])
        case "permission": pushService.debugShowReminderPrompt()
        default: break
        }
    }

    @MainActor static func replacementView() -> AnyView? {
        switch surface {
        case "feedback": return AnyView(NativeFeedbackSheet(target: item.target, item: item, debugSubmitted: false, debugDraft: draft).preferredColorScheme(.dark))
        case "thanks": return AnyView(NativeFeedbackSheet(target: item.target, item: item, debugSubmitted: true, debugDraft: draft).preferredColorScheme(.dark))
        case "control": return AnyView(NativePartyControlView(debugSummary: NativePartyControlView.debugApprovalSummary).environment(\.colorScheme, .dark))
        default: return nil
        }
    }
}
#endif

struct NativeFeedbackSheet: View {
    let target: NativeFeedbackTarget
    let item: NativeFeedbackPendingItem?
    let sessionToken: String?
    let onFinished: () -> Void

    @State private var draft = NativeFeedbackDraft()
    @State private var busy = false
    @State private var submitted = false
    @State private var message = ""

    static func title(for item: NativeFeedbackPendingItem?, kind: NativeFeedbackTargetKind) -> String {
        if let item { return "How was \(item.title)?" }
        return kind == .party ? "How was the party?" : "How was the plan?"
    }

    private var api: NativeFeedbackAPI { NativeFeedbackAPI(client: BytspotAPIClient(tokenProvider: { [sessionToken] in sessionToken })) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if submitted { thankYou } else { form }
            }
            .padding(20)
        }
        .foregroundColor(NativeTheme.textPrimary)
        .background(NativeDeepSpaceGround().environment(\.nativeDeepSpaceGroundDrawn, false))
        .preferredColorScheme(.dark)
    }

    @ViewBuilder private var form: some View {
        if let cover = item?.coverURL {
            AsyncImage(url: cover) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else { Color.white.opacity(0.06) }
            }
            .frame(maxWidth: .infinity).frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityHidden(true)
        }
        Text(Self.title(for: item, kind: target.kind)).font(.title2.weight(.bold))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
        HStack(spacing: 8) {
            ForEach(1...5, id: \.self) { value in
                Button { draft.rating = value } label: {
                    Image(systemName: (draft.rating ?? 0) >= value ? "star.fill" : "star")
                        .font(.title2).foregroundColor(NativeTheme.cyan).frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(value) \(value == 1 ? "star" : "stars")")
                .accessibilityAddTraits(draft.rating == value ? .isSelected : [])
                .accessibilityIdentifier("native-feedback-star-\(value)")
            }
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(NativeFeedbackDraft.tags, id: \.self) { tag in
                let selected = draft.tags.contains(tag)
                Button { if selected { draft.tags.remove(tag) } else { draft.tags.insert(tag) } } label: {
                    Text(tag).font(.subheadline.weight(.semibold)).foregroundColor(selected ? .black : .white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(selected ? NativeTheme.cyan : Color.white.opacity(0.08))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("native-feedback-tag-\(tag.lowercased())")
            }
        }
        VStack(alignment: .leading, spacing: 6) {
            Text("Anything else? (optional)").font(.subheadline).foregroundColor(NativeTheme.textSecondary)
            TextEditor(text: Binding(get: { draft.note }, set: { draft.note = String($0.prefix(NativeFeedbackDraft.noteLimit)) }))
                .frame(minHeight: 100).padding(8)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityLabel("Note")
                .accessibilityIdentifier("native-feedback-note")
            Text("\(draft.note.count)/\(NativeFeedbackDraft.noteLimit)").font(.caption).foregroundColor(NativeTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        if !message.isEmpty { Text(message).font(.footnote).foregroundColor(NativeTheme.textSecondary) }
        Button(action: submit) {
            Text("Submit").font(.headline).foregroundColor(.black).frame(maxWidth: .infinity, minHeight: 50)
                .background(draft.canSubmit ? NativeTheme.cyan : Color.white.opacity(0.24))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!draft.canSubmit || busy)
        .accessibilityIdentifier("native-feedback-submit")
        Button(action: notNow) {
            Text("Not now").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityIdentifier("native-feedback-not-now")
    }

    private var thankYou: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "checkmark.seal.fill").font(.largeTitle).foregroundColor(NativeTheme.emerald).accessibilityHidden(true)
            Text("Thanks for the feedback").font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
            Text("It helps hosts make the next one better.").font(.body).foregroundColor(NativeTheme.textSecondary)
            Button(action: onFinished) {
                Text("Done").font(.headline).foregroundColor(.black).frame(maxWidth: .infinity, minHeight: 50)
                    .background(NativeTheme.cyan).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-feedback-done")
        }
        .accessibilityIdentifier("native-feedback-thank-you")
    }

    private func submit() {
        guard draft.canSubmit, !busy else { return }
        busy = true; message = ""
        Task { @MainActor in
            do {
                try await api.submit(draft, for: target)
                NativeFeedbackStore.shared.remove(target)
                submitted = true
            } catch {
                message = "Feedback couldn't be sent. Try again later."
            }
            busy = false
        }
    }

    private func notNow() {
        NativeFeedbackStore.shared.remove(target)
        let api = api, target = target
        Task { try? await api.dismiss(target) }
        onFinished()
    }

    init(target: NativeFeedbackTarget, item: NativeFeedbackPendingItem?, sessionToken: String?, onFinished: @escaping () -> Void) {
        self.target = target; self.item = item; self.sessionToken = sessionToken; self.onFinished = onFinished
    }

    #if DEBUG
    init(target: NativeFeedbackTarget, item: NativeFeedbackPendingItem?, debugSubmitted: Bool, debugDraft: NativeFeedbackDraft) {
        self.init(target: target, item: item, sessionToken: nil, onFinished: {})
        _submitted = State(initialValue: debugSubmitted)
        _draft = State(initialValue: debugDraft)
    }
    #endif
}

/// Home card for the newest pending item. Works with notifications off.
struct NativeFeedbackHomeCard: View {
    let item: NativeFeedbackPendingItem
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 14) {
                ZStack {
                    Color.white.opacity(0.06)
                    Image(systemName: "star.bubble.fill").font(.title3).foregroundColor(NativeTheme.cyan)
                    if let cover = item.coverURL {
                        AsyncImage(url: cover) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                        }
                    }
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(NativeFeedbackSheet.title(for: item, kind: item.target.kind)).font(.headline).foregroundColor(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Rate it in a few seconds").font(.subheadline).foregroundColor(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundColor(.white.opacity(0.5)).accessibilityHidden(true)
            }
            .padding(14)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("native-home-feedback-card")
    }
}

/// Offered after a signed-in member commits to something, never at launch.
enum NativeReminderPermissionPolicy {
    static let cooldown: TimeInterval = 7 * 24 * 60 * 60
    static let declinedAtKey = "bytspot_reminder_prompt_declined_at"
    static let title = "Get a reminder before it starts?"
    static let allowTitle = "Allow"
    static let notNowTitle = "Not now"

    static func shouldOffer(status: NativePushSystemAlertStatus, signedIn: Bool, declinedAt: Date?, now: Date = Date()) -> Bool {
        guard signedIn, status == .notDetermined else { return false }
        guard let declinedAt else { return true }
        return now.timeIntervalSince(declinedAt) >= cooldown
    }

    static func declinedAt(in defaults: UserDefaults = .standard) -> Date? {
        defaults.object(forKey: declinedAtKey) as? Date
    }

    static func recordDecline(at date: Date = Date(), in defaults: UserDefaults = .standard) {
        defaults.set(date, forKey: declinedAtKey)
    }
}

struct NativeReminderPermissionCard: View {
    @ObservedObject var pushService: NativePushService

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "bell.badge.fill").foregroundColor(NativeTheme.cyan).accessibilityHidden(true)
                Text(NativeReminderPermissionPolicy.title).font(.headline).foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                Button { pushService.declineReminderPrompt() } label: {
                    Text(NativeReminderPermissionPolicy.notNowTitle).font(.headline).foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Color.white.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-reminder-prompt-not-now")
                Button { Task { await pushService.acceptReminderPrompt() } } label: {
                    Text(NativeReminderPermissionPolicy.allowTitle).font(.headline).foregroundColor(.black)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(NativeTheme.cyan).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-reminder-prompt-allow")
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.85))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("native-reminder-prompt")
    }
}

