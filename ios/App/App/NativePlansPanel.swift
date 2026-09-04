import SwiftUI

/// One Plan as the API returns it. Every field the client needs to render lives
/// on the row; `state` and `readiness` are already derived by the server so a
/// row can never show `Confirmed` alone or contradict what a booking actually
/// did. `capability` on an item is snapshotted from the room at attach time.
struct NativePlan: Codable, Identifiable, Equatable {
    struct Participant: Codable, Equatable { let userId: String; let role: String; let status: String }
    /// A supply summary the server attaches to an item that points at a
    /// coffee reservation. Absent on room-backed and reference items, so a
    /// hold countdown can only render where a hold actually exists.
    struct Reservation: Codable, Equatable {
        let holdExpiresAt: String?
        let status: String?
    }
    struct Item: Codable, Identifiable, Equatable {
        let id: String
        let needKind: String
        let title: String
        let partyId: String?
        let coffeeReservationId: String?
        let capability: String
        let status: String
        let reservation: Reservation?
    }
    struct Readiness: Codable, Equatable {
        let going: Int
        let maybe: Int
        let pending: Int
        let declined: Int
        let total: Int
    }

    let id: String
    let title: String
    let intent: String
    let creatorUserId: String
    let startsAt: String?
    let endsAt: String?
    let areaLabel: String?
    let partySize: Int?
    let needs: [String]
    let lifecycle: String
    let state: String
    let readiness: Readiness
    let openNeeds: [String]
    let participants: [Participant]
    let items: [Item]
}

struct NativePlansList: Codable { let plans: [NativePlan] }

struct NativePlanAPI {
    let client: BytspotAPIClient

    func list() async throws -> [NativePlan] {
        let payload = try await client.trpcQueryPayload(path: "/trpc/plans.list", input: [:])
        return try JSONDecoder().decode(NativePlansList.self, from: JSONSerialization.data(withJSONObject: payload)).plans
    }

    func get(_ planID: String) async throws -> NativePlan {
        let payload = try await client.trpcQueryPayload(path: "/trpc/plans.get", input: ["planId": planID])
        return try JSONDecoder().decode(NativePlan.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    func respond(_ planID: String, response: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/plans.respond", method: "POST", input: ["planId": planID, "response": response])
    }

    func confirm(_ planID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/plans.confirm", method: "POST", input: ["planId": planID])
    }

    func cancel(_ planID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/plans.cancel", method: "POST", input: ["planId": planID])
    }

    /// The caller never states the capability — the server derives it from the
    /// supply — so the input carries only the reservation the item points at.
    func attachCoffeeReservation(planID: String, reservationID: String) async throws {
        _ = try await client.trpcPayload(
            path: "/trpc/plans.attach",
            method: "POST",
            input: ["planId": planID, "needKind": "coffee", "supplyRef": ["coffeeReservationId": reservationID]]
        )
    }
}

/// Words on the row. Kept out of the view so a unit test can pin them without
/// standing up SwiftUI, and so the copy is a single source of truth for the
/// list and the detail — a row that reads "Confirmed" one screen and
/// "Confirmed · 2 going" the next would betray the whole rule Plan is under.
enum NativePlanDisplay {
    /// A state chip never renders alone; it is always paired with readiness,
    /// because the creator's confirmation is not what makes anyone show up.
    /// Do not call `stateLabel` directly from a view — always go through
    /// `rowSubtitle(state:readiness:)`, or the honesty rule this file is
    /// under quietly breaks the first time a caller inlines the chip.
    static func stateLabel(_ state: String) -> String {
        switch state {
        case "proposed": return "Proposed"
        case "confirmed": return "Confirmed"
        case "booked": return "Booked"
        case "active": return "Happening now"
        case "completed": return "Wrapped"
        case "cancelled": return "Cancelled"
        case "expired": return "Expired"
        default: return state.capitalized
        }
    }

    /// Readiness in one line: going wins, maybe follows, pending is the ask
    /// still open. Declined and removed do not surface here — a Plan is
    /// coordination, not a scoreboard.
    static func readinessLabel(_ readiness: NativePlan.Readiness) -> String {
        var parts: [String] = ["\(readiness.going) going"]
        if readiness.maybe > 0 { parts.append("\(readiness.maybe) maybe") }
        if readiness.pending > 0 { parts.append("\(readiness.pending) pending") }
        return parts.joined(separator: " · ")
    }

    /// Status and readiness together, so "Confirmed" is never shown alone.
    static func rowSubtitle(state: String, readiness: NativePlan.Readiness) -> String {
        "\(stateLabel(state)) · \(readinessLabel(readiness))"
    }

    /// What a caller reads on a capability chip. `details` is called out as
    /// "Reference" so it is unambiguously not a booking Bytspot can make.
    /// An unknown server value is coerced to "Reference" rather than printed
    /// verbatim: a future capability like "reserve" or "book_now" must not
    /// render as a settlement chip until this client learns to honour it.
    static func capabilityLabel(_ capability: String) -> String {
        switch capability {
        case "book": return "Book"
        case "request": return "Request"
        case "details": return "Reference"
        default: return "Reference"
        }
    }

    /// A short "when" line. Absent starts are printed as "When TBD" rather
    /// than the current date, because a Plan without a time is a real state.
    static func whenLabel(startsAt: String?, endsAt: String?) -> String {
        guard let starts = startsAt, let startsDate = ISO8601DateFormatter.partyControlDate(from: starts) else { return "When TBD" }
        let dayFormatter = DateFormatter(); dayFormatter.dateFormat = "EEE MMM d"
        let timeFormatter = DateFormatter(); timeFormatter.dateFormat = "h:mm a"
        let dayText = dayFormatter.string(from: startsDate)
        let startsText = timeFormatter.string(from: startsDate)
        if let ends = endsAt, let endsDate = ISO8601DateFormatter.partyControlDate(from: ends) {
            return "\(dayText) · \(startsText) – \(timeFormatter.string(from: endsDate))"
        }
        return "\(dayText) · \(startsText)"
    }
}

private let planRowBackground = Color.white.opacity(0.06)

/// The Plans surface. The caller can see their plans, confirm or cancel the
/// ones they own, and respond to the ones they're invited to. Phase 2 adds one
/// attach path — coffee — because it is the first supply Bytspot can actually
/// hold. Invite and general Discover attach are still left off until Discover
/// has a supported "Add to Plan" hook.
struct NativePlansPanel: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    @State private var plans: [NativePlan] = []
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var selectedPlanID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !sessionStore.canAttachBearerToken {
                Text("Sign in to see your plans.").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            } else if isLoading && plans.isEmpty {
                ProgressView().tint(NativeTheme.textSecondary)
            } else if let message = errorMessage, plans.isEmpty {
                Text(message).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.orange)
            } else if plans.isEmpty {
                NativePlansEmptyState()
            } else {
                ForEach(plans) { plan in
                    Button(action: { selectedPlanID = plan.id }) { NativePlanListRow(plan: plan) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("native-plan-row-\(plan.id)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await reload() }
        .sheet(item: Binding<PlanSheetID?>(
            get: { selectedPlanID.map(PlanSheetID.init) },
            set: { selectedPlanID = $0?.id }
        )) { sheet in
            NativePlanDetailSheet(planID: sheet.id, sessionStore: sessionStore, onChanged: { Task { await reload() } })
        }
    }

    private func reload() async {
        guard sessionStore.canAttachBearerToken else { plans = []; return }
        isLoading = true; defer { isLoading = false }
        do {
            let client = BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token })
            plans = try await NativePlanAPI(client: client).list()
            errorMessage = nil
        } catch {
            errorMessage = "Couldn’t load your plans."
        }
    }
}

private struct PlanSheetID: Identifiable { let id: String }

private struct NativePlansEmptyState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No plans yet.").font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary)
            Text("This is where your Plans will live — who’s coming and what the night still needs, in one place.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
        }
    }
}

private struct NativePlanListRow: View {
    let plan: NativePlan

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(plan.title).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textTertiary)
            }
            Text(NativePlanDisplay.whenLabel(startsAt: plan.startsAt, endsAt: plan.endsAt))
                .font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            // Status and readiness are printed together; a bare "Confirmed"
            // never appears, because a confirmed Plan is only the creator's
            // decision, not the crew's.
            Text(NativePlanDisplay.rowSubtitle(state: plan.state, readiness: plan.readiness))
                .font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
        }
        .padding(12)
        .background(planRowBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativePlanDetailSheet: View {
    let planID: String
    @ObservedObject var sessionStore: BytspotSessionStore
    let onChanged: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var plan: NativePlan?
    @State private var errorMessage: String?
    @State private var busy = false
    @State private var showCoffeeAttach = false

    private var isCreator: Bool { plan?.creatorUserId == sessionStore.authenticatedUserID }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let plan { content(for: plan) } else if let errorMessage {
                    Text(errorMessage).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.orange)
                } else {
                    ProgressView().tint(NativeTheme.textSecondary)
                }
            }
            .padding(20)
        }
        .accessibilityIdentifier("native-plan-detail-\(planID)")
        .task { await reload() }
        .sheet(isPresented: $showCoffeeAttach) {
            NativeCoffeeAttachSheet(
                planID: planID,
                suggestedPartySize: plan?.partySize,
                suggestedTime: plan?.startsAt.flatMap { ISO8601DateFormatter.partyControlDate(from: $0) },
                sessionStore: sessionStore,
                onAttached: { onChanged(); Task { await reload() } }
            )
        }
    }

    private var header: some View {
        HStack {
            Text(plan?.title ?? "Plan").font(.system(size: 22, weight: .black)).foregroundColor(NativeTheme.textPrimary)
            Spacer()
            Button(action: { dismiss() }) { Image(systemName: "xmark.circle.fill").font(.system(size: 24, weight: .bold)).foregroundColor(NativeTheme.textSecondary) }
        }
    }

    @ViewBuilder private func content(for plan: NativePlan) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(NativePlanDisplay.whenLabel(startsAt: plan.startsAt, endsAt: plan.endsAt)).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            Text(NativePlanDisplay.rowSubtitle(state: plan.state, readiness: plan.readiness))
                .font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            if let area = plan.areaLabel { Text(area).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary) }
        }

        if !plan.openNeeds.isEmpty {
            sectionHeader("Still open")
            VStack(alignment: .leading, spacing: 6) {
                ForEach(plan.openNeeds, id: \.self) { need in
                    Text("• \(need.capitalized)").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                }
            }
        }

        if !plan.items.isEmpty {
            sectionHeader("Attached")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(plan.items) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                            Text(item.needKind.capitalized).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                            // Only an item with a hold behind it carries this
                            // line; a room or reference item has no countdown
                            // to state and renders nothing.
                            if let footnote = NativeCoffeeDisplay.itemFootnote(status: item.reservation?.status, holdExpiresAt: item.reservation?.holdExpiresAt) {
                                Text(footnote).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                            }
                        }
                        Spacer()
                        Text(NativePlanDisplay.capabilityLabel(item.capability))
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(NativeTheme.textPrimary)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(NativeTheme.purple.opacity(0.25))
                            .clipShape(Capsule())
                    }
                    .padding(10)
                    .background(planRowBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }

        sectionHeader("People")
        VStack(alignment: .leading, spacing: 4) {
            ForEach(plan.participants, id: \.userId) { seat in
                HStack {
                    Text(seat.userId == sessionStore.authenticatedUserID ? "You" : seat.userId).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
                    if seat.role == "creator" { Text("HOST").font(.system(size: 10, weight: .black)).foregroundColor(NativeTheme.purple) }
                    Spacer()
                    Text(seat.status.capitalized).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                }
            }
        }

        if plan.lifecycle != "cancelled" && plan.state != "expired" && plan.state != "completed" {
            actions(for: plan)
        }
    }

    @ViewBuilder private func actions(for plan: NativePlan) -> some View {
        if isCreator {
            // Coffee is the one supply Bytspot can hold today, so it is the
            // one attach the Plan offers. The verb is Add, not Book: what
            // follows is a hold ask the spot still has to answer.
            Button(action: { showCoffeeAttach = true }) {
                ctaLabel("Add coffee", background: planRowBackground, foreground: NativeTheme.textPrimary)
            }
            .buttonStyle(.plain).disabled(busy).accessibilityIdentifier("native-plan-add-coffee")
            if plan.lifecycle == "proposed" {
                Button(action: { Task { await run { try await api().confirm(planID) } } }) {
                    ctaLabel(busy ? "Working…" : "Confirm this Plan", background: NativeTheme.purple, foreground: .white)
                }
                .buttonStyle(.plain).disabled(busy).accessibilityIdentifier("native-plan-confirm")
            }
            Button(action: { Task { await run { try await api().cancel(planID) } } }) {
                ctaLabel("Cancel Plan", background: planRowBackground, foreground: NativeTheme.textPrimary)
            }
            .buttonStyle(.plain).disabled(busy).accessibilityIdentifier("native-plan-cancel")
        } else {
            HStack(spacing: 8) {
                responseButton("Going", value: "accepted")
                responseButton("Maybe", value: "maybe")
                responseButton("Decline", value: "declined")
            }
        }
    }

    private func responseButton(_ title: String, value: String) -> some View {
        Button(action: { Task { await run { try await api().respond(planID, response: value) } } }) {
            Text(title).font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(planRowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain).disabled(busy)
        .accessibilityIdentifier("native-plan-respond-\(value)")
    }

    private func ctaLabel(_ title: String, background: Color, foreground: Color) -> some View {
        Text(title).font(.system(size: 14, weight: .black)).foregroundColor(foreground)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased()).font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textTertiary).tracking(1.2)
    }

    private func api() -> NativePlanAPI {
        NativePlanAPI(client: BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token }))
    }

    private func run(_ operation: @escaping () async throws -> Void) async {
        // Same auth guard as the outer panel: a session dropped mid-sheet
        // must never issue an authenticated tRPC call with a nil token.
        guard sessionStore.canAttachBearerToken else { errorMessage = "Sign in to update this Plan."; return }
        busy = true; defer { busy = false }
        do { try await operation(); onChanged(); await reload() } catch { errorMessage = "That didn’t go through." }
    }

    private func reload() async {
        guard sessionStore.canAttachBearerToken else { errorMessage = "Sign in to see this Plan."; return }
        do { plan = try await api().get(planID); errorMessage = nil } catch { errorMessage = "Couldn’t load this Plan." }
    }
}
