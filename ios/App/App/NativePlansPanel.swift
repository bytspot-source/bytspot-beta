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

    func create(
        idempotencyKey: String,
        title: String,
        intent: String,
        startsAt: Date?,
        partySize: Int?,
        needs: Set<String>
    ) async throws -> String {
        let payload = try await client.trpcPayload(
            path: "/trpc/plans.create",
            method: "POST",
            input: NativePlanContract.createInput(
                idempotencyKey: idempotencyKey,
                title: title,
                intent: intent,
                startsAt: startsAt,
                partySize: partySize,
                needs: needs
            )
        )
        guard let object = payload as? [String: Any], let id = object["id"] as? String else {
            throw BytspotAPIClient.APIError.invalidResponse
        }
        return id
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

/// The wire shape of a Plan write, kept in its own namespace so a test can pin
/// it without a client, matching `NativeCoffeeContract` next door.
enum NativePlanContract {
    /// Everything optional is omitted rather than sent null. A Plan with no
    /// start is a real state the surface prints as "When TBD", and the router
    /// derives a proposed Plan's expiry from `startsAt`, so a fabricated date
    /// would quietly move when the Plan stops waiting.
    static func createInput(
        idempotencyKey: String,
        title: String,
        intent: String,
        startsAt: Date?,
        partySize: Int?,
        needs: Set<String>
    ) -> [String: Any] {
        var input: [String: Any] = [
            "idempotencyKey": idempotencyKey,
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "intent": intent.trimmingCharacters(in: .whitespacesAndNewlines),
            "needs": NativePlanDisplay.normalizedNeeds(needs),
        ]
        if let startsAt { input["startsAt"] = ISO8601DateFormatter.partyControlInstant.string(from: startsAt) }
        if let partySize { input["partySize"] = partySize }
        return input
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

    /// The needs a caller can declare when starting a Plan. A need is the
    /// caller's own checklist line, not a promise Bytspot will fill it —
    /// `needsFootnote` says that out loud, because coffee is the only one with
    /// an attach path today.
    static let selectableNeeds = ["coffee", "dining", "nightlife", "parking", "mobility", "stay"]

    /// Says plainly which needs Bytspot can act on. Without this the chips
    /// would read as six things the app is about to arrange.
    static let needsFootnote = "Coffee is the only one Bytspot can hold today. The rest stay your own checklist."

    static func needLabel(_ need: String) -> String {
        switch need {
        case "coffee": return "Coffee"
        case "dining": return "Dinner"
        case "nightlife": return "Nightlife"
        case "parking": return "Parking"
        case "mobility": return "Getting there"
        case "stay": return "Somewhere to stay"
        default: return need.capitalized
        }
    }

    /// Where a still-open need can be acted on today. `nil` means Bytspot has
    /// no destination for it yet ("stay"), so it stays a plain checklist line
    /// rather than a button that goes nowhere — the same honesty the
    /// needs footnote carries.
    enum NeedDestination: Equatable { case discover(String); case map }
    static func needDestination(_ need: String) -> NeedDestination? {
        switch need {
        case "coffee", "dining", "nightlife", "mobility": return .discover(need)
        case "parking": return .map
        default: return nil
        }
    }
    /// The short, honest label for where a routable need goes. It names the
    /// surface, so the row reads as a shortcut to find supply, not a promise
    /// Bytspot arranged it.
    static func needDestinationHint(_ need: String) -> String? {
        switch needDestination(need) {
        case .discover?: return "Find in Discover"
        case .map?: return "See on Map"
        case nil: return nil
        }
    }

    /// De-duplicated, vocabulary-checked, and capped at the router's ceiling of
    /// twelve, so a list this client assembled can never be the reason a
    /// filled-in form comes back rejected. Ordered by the chip list rather
    /// than by the caller's selection, because a `Set` iterates arbitrarily
    /// and this order is stored and later printed back as "Still open".
    static func normalizedNeeds(_ needs: Set<String>) -> [String] {
        Array(selectableNeeds.filter(needs.contains).prefix(12))
    }

    /// Truncates to a UTF-16 budget without splitting a grapheme, matching what
    /// zod's `.max()` counts on the router.
    static func clamped(_ value: String, utf16Limit: Int) -> String {
        var result = value
        while result.utf16.count > utf16Limit && !result.isEmpty { result.removeLast() }
        return result
    }

    /// Named so the create sheet and the Plan detail cannot drift: the same
    /// sentence has to travel with the needs wherever they are shown.
    static let openNeedsFootnote = "Coffee is the only one Bytspot can hold. The rest are yours to sort."

    static let timeShortensLifeFootnote = "A Plan with a time stops waiting at that time. Without one it stays open for a week."

    /// A coffee hold tops out at eight seats, so a larger Plan cannot be met
    /// by that path in one ask. Said up front rather than clamped in silence.
    static func partySizeExceedsCoffeeNotice(_ partySize: Int) -> String? {
        guard partySize > 8 else { return nil }
        return "A coffee hold covers up to 8. A table for \(partySize) needs the spot’s own say-so."
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
/// ones they own, and respond to the ones they're invited to. Phase 2 adds the
/// surface that produces a Plan in the first place, plus one attach path —
/// coffee — because it is the first supply Bytspot can actually hold. Invite
/// and general Discover attach are still left off until Discover has a
/// supported "Add to Plan" hook.
struct NativePlansPanel: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    /// When set, a still-open need in a Plan becomes a one-tap route to the
    /// surface that can fill it. Left nil in the Profile sheet, where a tab
    /// switch underneath a sheet has nowhere to land.
    var onOpenNeed: ((String) -> Void)? = nil
    @State private var plans: [NativePlan] = []
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var selectedPlanID: String?
    @State private var showCreate = false
    /// Held until the create sheet has finished dismissing. Assigning
    /// `selectedPlanID` while that sheet is still on screen asks one host to
    /// present a second sheet mid-teardown, which UIKit drops rather than
    /// queues — the detail would never open, and the id would be left set so
    /// the row for that Plan could no longer be tapped.
    @State private var pendingCreatedPlanID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !sessionStore.canAttachBearerToken {
                Text("Sign in to see your plans.").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            } else if isLoading && plans.isEmpty {
                ProgressView().tint(NativeTheme.textSecondary)
            } else {
                // The CTA sits above every other state, so a list that failed
                // to load still leaves the caller able to start a Plan.
                startPlanButton
                if let message = errorMessage, plans.isEmpty {
                    Text(message).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.orange)
                } else if plans.isEmpty {
                    NativePlansEmptyState()
                }
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
            NativePlanDetailSheet(planID: sheet.id, sessionStore: sessionStore, onChanged: { Task { await reload() } }, onOpenNeed: onOpenNeed)
        }
        .sheet(isPresented: $showCreate, onDismiss: {
            // Drained after the create sheet is fully gone, so the detail
            // presents against a free host. A new Plan therefore opens
            // straight into its own detail and the attach paths are one tap
            // from the thing the caller just made.
            if let planID = pendingCreatedPlanID {
                pendingCreatedPlanID = nil
                selectedPlanID = planID
            }
        }) {
            NativePlanCreateSheet(sessionStore: sessionStore, onCreated: { planID in
                pendingCreatedPlanID = planID
                Task { await reload() }
            })
        }
    }

    @ViewBuilder private var startPlanButton: some View {
        // "Start a Plan" is a promise Bytspot keeps entirely on its own side:
        // it writes a Plan row. It is deliberately not a settlement verb.
        // The pending id is cleared on the way in, not only on the way out: a
        // create that lands after its sheet was dismissed has no drain to run,
        // and a stale id left behind would open that earlier Plan unprompted
        // the next time this sheet is closed.
        Button(action: { pendingCreatedPlanID = nil; showCreate = true }) {
            HStack(spacing: 6) {
                Image(systemName: "plus.circle.fill").font(.system(size: 13, weight: .black))
                Text("Start a Plan").font(.system(size: 14, weight: .black))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(NativeTheme.purple)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-plan-start")
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
            Text("A Plan holds who’s coming and what you still need, in one place. Start one and it lands here.")
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
    var onOpenNeed: ((String) -> Void)? = nil
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
                    openNeedRow(need)
                }
                // Without this the list reads as outstanding arrangements
                // Bytspot is working on. Only coffee has an attach path, and
                // this is the durable surface — the create sheet's footnote is
                // long gone by the time anyone reads this.
                Text(NativePlanDisplay.openNeedsFootnote)
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
            }
        }

        if !plan.items.isEmpty {
            sectionHeader("Attached")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(plan.items) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                            // Same words as the create sheet and the "Still
                            // open" list above; `capitalized` would print the
                            // raw token and rename the caller's choice.
                            Text(NativePlanDisplay.needLabel(item.needKind)).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
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

    // The same words the caller ticked on the create sheet; `capitalized`
    // would rename their choice on the next screen. A routable need becomes a
    // one-tap shortcut to the surface that can fill it; the hint names where
    // it goes so the row is not read as an arrangement Bytspot made.
    @ViewBuilder private func openNeedRow(_ need: String) -> some View {
        if let onOpenNeed, let hint = NativePlanDisplay.needDestinationHint(need) {
            Button(action: { dismiss(); onOpenNeed(need) }) {
                HStack(spacing: 8) {
                    Text("• \(NativePlanDisplay.needLabel(need))").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
                    Spacer()
                    Text(hint).font(.system(size: 11, weight: .bold)).foregroundColor(NativeTheme.textSecondary)
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textTertiary)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-plan-need-\(need)")
        } else {
            Text("• \(NativePlanDisplay.needLabel(need))").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
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

/// Starting a Plan. Title and intent are the only things the router demands;
/// a time and a size are offered because the coffee sheet prefills from them,
/// and needs are offered because "what a plan still needs" is the whole
/// point of the object. Everything optional is genuinely optional — a Plan
/// with no time is a real state the surface prints as "When TBD".
private struct NativePlanCreateSheet: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var intent = ""
    @State private var setsTime = false
    @State private var startsAt = Date().addingTimeInterval(60 * 60)
    @State private var setsPartySize = false
    @State private var partySize = 2
    @State private var needs: Set<String> = []
    @State private var busy = false
    @State private var errorMessage: String?
    /// One key for the whole form session, not one per tap. The client times
    /// out at 8s, so a create that commits slowly surfaces as a connection
    /// failure whose copy invites a retry — a fresh key each attempt would
    /// turn that retry into a second Plan instead of the router's idempotent
    /// re-read of the first.
    @State private var idempotencyKey = UUID().uuidString

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !intent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                field("What to call it", text: $title, limit: 80, identifier: "native-plan-create-title")
                field("What the plan is", text: $intent, limit: 280, identifier: "native-plan-create-intent")
                timeRow
                partySizeRow
                needsRow
                submitButton
                if let errorMessage {
                    Text(errorMessage).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.orange)
                }
            }
            .padding(20)
        }
        // A swipe-away mid-flight would leave the create running with nowhere
        // to report back to, so the sheet stays put until the call settles.
        .interactiveDismissDisabled(busy)
        .accessibilityIdentifier("native-plan-create")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Start a Plan").font(.system(size: 22, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Button(action: { dismiss() }) { Image(systemName: "xmark.circle.fill").font(.system(size: 24, weight: .bold)).foregroundColor(NativeTheme.textSecondary) }
                    .disabled(busy)
            }
            Text("A Plan is yours to shape. Nothing is booked and nobody is invited until you say so.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private func field(_ label: String, text: Binding<String>, limit: Int, identifier: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(label)
            TextField("", text: text)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(NativeTheme.textPrimary)
                .padding(12)
                .background(planRowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                // Clamped to the router's own ceiling, so an over-long entry is
                // stopped while typing rather than rejected after submitting.
                // Counted in UTF-16 because that is what zod's `.max()` counts;
                // measuring grapheme clusters would let an emoji title pass the
                // clamp and still come back 400.
                .onChange(of: text.wrappedValue) { value in
                    if value.utf16.count > limit { text.wrappedValue = NativePlanDisplay.clamped(value, utf16Limit: limit) }
                }
                .accessibilityIdentifier(identifier)
        }
    }

    private var timeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $setsTime) {
                Text("Set a time").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
            }
            .accessibilityIdentifier("native-plan-create-sets-time")
            if setsTime {
                DatePicker("", selection: $startsAt, in: Date()...)
                    .datePickerStyle(.compact).labelsHidden()
                    .accessibilityIdentifier("native-plan-create-starts-at")
                // Setting a time also sets when the Plan stops waiting: the
                // router expires a proposed Plan at its start instead of the
                // default week, and the caller should not discover that by
                // finding it marked Expired.
                Text(NativePlanDisplay.timeShortensLifeFootnote)
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
            }
        }
    }

    private var partySizeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $setsPartySize) {
                Text("Set a size").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
            }
            .accessibilityIdentifier("native-plan-create-sets-size")
            if setsPartySize {
                // Twenty, not the router's 200: a Plan is a group going out
                // together, and every supply path Bytspot has today tops out
                // far below that. Raise this when a supply arrives that can
                // actually seat more.
                Stepper(value: $partySize, in: 1...20) {
                    Text("\(partySize) \(partySize == 1 ? "person" : "people")")
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
                }
                .accessibilityIdentifier("native-plan-create-party-size")
                // A coffee hold caps at eight, so a larger Plan would silently
                // ask for a smaller table. Say so here rather than let the
                // attach sheet quietly reduce the number.
                if let notice = NativePlanDisplay.partySizeExceedsCoffeeNotice(partySize) {
                    Text(notice).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                }
            }
        }
    }

    private var needsRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("What it still needs")
            ForEach(NativePlanDisplay.selectableNeeds, id: \.self) { need in
                Button(action: { if needs.contains(need) { needs.remove(need) } else { needs.insert(need) } }) {
                    HStack {
                        Text(NativePlanDisplay.needLabel(need))
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
                        Spacer()
                        if needs.contains(need) {
                            Image(systemName: "checkmark").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.purple)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(needs.contains(need) ? NativeTheme.purple.opacity(0.22) : planRowBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-plan-create-need-\(need)")
            }
            // Six chips would otherwise read as six things the app is about to
            // arrange; only one of them has a supply path today.
            Text(NativePlanDisplay.needsFootnote)
                .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
        }
    }

    private var submitButton: some View {
        Button(action: { Task { await submit() } }) {
            Text(busy ? "Working…" : "Start a Plan")
                .font(.system(size: 14, weight: .black)).foregroundColor(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(canSubmit ? NativeTheme.purple : NativeTheme.purple.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy || !canSubmit)
        .accessibilityIdentifier("native-plan-create-submit")
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased()).font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textTertiary).tracking(1.2)
    }

    private func submit() async {
        guard canSubmit else { return }
        guard sessionStore.canAttachBearerToken else { errorMessage = "Sign in to start a Plan."; return }
        busy = true; defer { busy = false }
        let api = NativePlanAPI(client: BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token }))
        do {
            let planID = try await api.create(
                idempotencyKey: idempotencyKey,
                title: title,
                intent: intent,
                startsAt: setsTime ? startsAt : nil,
                partySize: setsPartySize ? partySize : nil,
                needs: needs
            )
            errorMessage = nil
            onCreated(planID)
            dismiss()
        } catch {
            errorMessage = NativePlanDisplay.createFailureMessage(for: error)
        }
    }
}

extension NativePlanDisplay {
    /// App-authored failure copy, chosen from the status code. Server wording
    /// is never echoed, so an API message cannot rewrite a Bytspot promise.
    static func createFailureMessage(for error: Error) -> String {
        if let urlError = error as? URLError,
           [.timedOut, .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost].contains(urlError.code) {
            return "We couldn’t connect. Check your internet and try again."
        }
        guard case let BytspotAPIClient.APIError.server(status, _) = error else { return "That didn’t go through." }
        switch status {
        case 400: return "Check the title and what the plan is, then try again."
        case 401: return "Sign in to start a Plan."
        case 429: return "Too many plans just now. Wait a moment and try again."
        default: return "That didn’t go through."
        }
    }
}
