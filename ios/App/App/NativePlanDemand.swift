import Foundation
import SwiftUI

/// Asking venues to fill a gap in a Plan.
///
/// A Plan already states when, where and how many, so asking takes one tap and
/// no typing. What comes back is an offer from a real business, or nothing.
///
/// Nothing here decides whether a need *can* be asked about. That judgement
/// lives on the server, which owns the vendor vocabulary, and duplicating it
/// here would drift the moment either side changed. The client asks and shows
/// the answer, including the refusal.

struct NativePlanDemandOffer: Codable, Identifiable, Equatable {
    let id: String
    /// The place, not the business: a guest recognises where they are going.
    let `where`: String
    let startsAt: String
    let durationMins: Int
    let priceCents: Int
    let terms: String?
    let holdExpiresAt: String
    /// True once this is the offer the guest took. Sent by the server rather
    /// than inferred, so a held table is never mistaken for a choosable one.
    ///
    /// A default on the property is not a decoding default: the synthesized
    /// initialiser still requires the key and throws when a server that predates
    /// the field omits it. `mine()` is read through `try?`, so that would have
    /// silently emptied the guest's asks rather than failing loudly. Decoded
    /// explicitly, and absent means not accepted — the safe direction, because
    /// it shows a table as choosable rather than claiming one is held.
    var accepted: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, `where`, startsAt, durationMins, priceCents, terms, holdExpiresAt, accepted
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        `where` = try container.decode(String.self, forKey: .where)
        startsAt = try container.decode(String.self, forKey: .startsAt)
        durationMins = try container.decode(Int.self, forKey: .durationMins)
        priceCents = try container.decode(Int.self, forKey: .priceCents)
        terms = try container.decodeIfPresent(String.self, forKey: .terms)
        holdExpiresAt = try container.decode(String.self, forKey: .holdExpiresAt)
        accepted = try container.decodeIfPresent(Bool.self, forKey: .accepted) ?? false
    }

    init(
        id: String, where: String, startsAt: String, durationMins: Int,
        priceCents: Int, terms: String?, holdExpiresAt: String, accepted: Bool = false
    ) {
        self.id = id
        self.where = `where`
        self.startsAt = startsAt
        self.durationMins = durationMins
        self.priceCents = priceCents
        self.terms = terms
        self.holdExpiresAt = holdExpiresAt
        self.accepted = accepted
    }

    /// Where and when, in the order a guest reads it.
    var when: String { NativePlanDemandFormat.when(startsAt) }

    /// The price as agreed. Whole dollars when it is whole dollars, because
    /// "$50.00" reads like a form and "$50" reads like a price.
    var price: String { NativePlanDemandFormat.price(priceCents) }

    /// An offer is a held table, not a standing invitation. The guest is told
    /// how long it is theirs so the deadline is the vendor's, not a surprise.
    func hold(now: Date = Date()) -> String {
        NativePlanDemandFormat.hold(until: holdExpiresAt, now: now)
    }

    /// A lapsed hold must not present an Accept button. The server would refuse
    /// it, and offering a button that cannot work is a small lie.
    func isLive(now: Date = Date()) -> Bool {
        guard let until = NativePlanDemandFormat.date(holdExpiresAt) else { return false }
        return until > now
    }
}

/// What an accepted offer becomes. The seller is now committed.
struct NativePlanDemandBooking: Codable, Equatable {
    let offerId: String
    let demandId: String
    let `where`: String
    let startsAt: String
    let durationMins: Int
    let priceCents: Int
    let terms: String?

    var confirmation: String {
        "\(`where`) · \(NativePlanDemandFormat.when(startsAt))"
    }
}

/// Dates and money, formatted once.
enum NativePlanDemandFormat {
    static func date(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    /// Local time, because the guest is going there. The server sends UTC.
    static func when(_ iso: String) -> String {
        guard let date = date(iso) else { return "Time to confirm" }
        let formatter = DateFormatter()
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "h:mm a" : "EEE h:mm a"
        return formatter.string(from: date)
    }

    static func price(_ cents: Int) -> String {
        cents % 100 == 0 ? "$\(cents / 100)" : String(format: "$%.2f", Double(cents) / 100)
    }

    /// Minutes while it is urgent, hours while it is not, and plain truth once
    /// it has gone. Never a countdown that keeps ticking past zero.
    static func hold(until iso: String, now: Date = Date()) -> String {
        guard let until = date(iso) else { return "Hold time unknown" }
        let seconds = until.timeIntervalSince(now)
        if seconds <= 0 { return "Hold expired" }
        let minutes = Int(seconds / 60)
        if minutes < 1 { return "Held for under a minute" }
        if minutes < 60 { return "Held for \(minutes) min" }
        let hours = minutes / 60
        return "Held for \(hours) hr\(hours == 1 ? "" : "s")"
    }
}

struct NativePlanDemandAsk: Codable, Identifiable, Equatable {
    let id: String
    let state: String
    let category: String
    let partySize: Int
    let planId: String?
    let expiresAt: String
    let offers: [NativePlanDemandOffer]

    /// The offer the guest took, if they have taken one.
    var booked: NativePlanDemandOffer? { offers.first(where: { $0.accepted }) }

    /// What the guest is owed while they wait, stated without overclaiming.
    var status: String {
        if let booked { return "Booked · \(booked.when)" }
        if !offers.isEmpty { return offers.count == 1 ? "1 offer" : "\(offers.count) offers" }
        switch state {
        // MATCHED means a venue that could answer has seen it. It does not mean
        // anyone intends to, so it must not read as progress toward a booking.
        case "MATCHED": return "Venues can see this"
        default: return "Waiting"
        }
    }
}

/// Injectable seam, so the plan sheet's asking states are testable without a network.
protocol NativePlanDemandAsking {
    func ask(planID: String, needKind: String) async throws -> NativePlanDemandAsk
    func mine() async throws -> [NativePlanDemandAsk]
    func withdraw(demandID: String) async throws
    func accept(offerID: String) async throws -> NativePlanDemandBooking
}

struct NativePlanDemandAPI: NativePlanDemandAsking {
    let client: BytspotAPIClient

    func ask(planID: String, needKind: String) async throws -> NativePlanDemandAsk {
        let payload = try await client.trpcPayload(
            path: "/trpc/demand.fromPlan",
            method: "POST",
            input: ["planId": planID, "needKind": needKind],
        )
        // The publish reply is the demand without its offers; there cannot be
        // any yet, and inventing the field keeps one decoder for both shapes.
        let data = try JSONSerialization.data(withJSONObject: payload)
        let raised = try JSONDecoder().decode(NativePlanDemandRaised.self, from: data)
        return NativePlanDemandAsk(
            id: raised.id,
            state: raised.state,
            category: raised.category,
            partySize: 0,
            planId: planID,
            expiresAt: raised.expiresAt,
            offers: [],
        )
    }

    func mine() async throws -> [NativePlanDemandAsk] {
        let payload = try await client.trpcQueryPayload(path: "/trpc/demand.mine", input: [:])
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode([NativePlanDemandAsk].self, from: data)
    }

    func withdraw(demandID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/demand.withdraw", method: "POST", input: ["demandId": demandID])
    }

    func accept(offerID: String) async throws -> NativePlanDemandBooking {
        let payload = try await client.trpcPayload(
            path: "/trpc/demand.acceptOffer",
            method: "POST",
            input: ["offerId": offerID],
        )
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(NativePlanDemandBooking.self, from: data)
    }
}

/// The narrower shape `demand.fromPlan` returns.
struct NativePlanDemandRaised: Codable, Equatable {
    let id: String
    let state: String
    let category: String
    let expiresAt: String
}

/// What the plan sheet knows about asking, kept out of the view.
struct NativePlanDemandState: Equatable {
    /// Live asks for this plan, by the need they were raised for.
    var asks: [String: NativePlanDemandAsk] = [:]
    /// The need currently being asked about, so only its row shows a spinner.
    var asking: String?
    /// Why the last ask was refused, against the need it was refused for.
    var refusal: [String: String] = [:]

    mutating func record(_ ask: NativePlanDemandAsk, for need: String) {
        asks[need] = ask
        refusal[need] = nil
        asking = nil
    }

    mutating func refuse(_ message: String, for need: String) {
        refusal[need] = message
        asking = nil
    }

    /// Demand carries its category, not the plan's word for the need, so the
    /// mapping back has to come from the needs the plan actually has.
    mutating func adopt(_ mine: [NativePlanDemandAsk], planID: String, needs: [String]) {
        var matched: [String: NativePlanDemandAsk] = [:]
        for ask in mine where ask.planId == planID {
            if let need = needs.first(where: { NativePlanDemandCategory.matches(need: $0, category: ask.category) }) {
                matched[need] = ask
            }
        }
        asks = matched
    }
}

/// The plan-need to demand-category pairs, mirrored only to read asks back.
///
/// The server decides what may be asked; this exists solely to recognise a
/// returning ask as belonging to a need. A pair missing here costs a status
/// line, never a wrong or duplicate request.
enum NativePlanDemandCategory {
    static let pairs: [String: String] = [
        "coffee": "coffee",
        "dining": "dining",
        "nightlife": "nightlife",
        "shopping": "shopping",
        "fitness": "fitness",
        "events": "entertainment",
        "stay": "boutique_apartment",
    ]

    static func matches(need: String, category: String) -> Bool {
        pairs[need] == category
    }
}

/// Turning a failed ask into something worth reading.
enum NativePlanDemandFailure {
    /// The server's refusals are written for the guest and name what to fix,
    /// so they are passed through rather than replaced by a generic failure.
    /// Anything without a message is a transport problem, and saying so is
    /// more honest than blaming the plan.
    static func message(for error: Error) -> String {
        guard case let BytspotAPIClient.APIError.server(_, body) = error else {
            return "Couldn't reach Bytspot. Try again."
        }
        let said = serverMessage(in: body)
        return said.isEmpty ? "Couldn't ask right now. Try again." : said
    }

    static func serverMessage(in body: String) -> String {
        guard let data = body.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) else { return "" }
        return firstMessage(in: root)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private static func firstMessage(in value: Any) -> String? {
        if let dictionary = value as? [String: Any] {
            if let message = dictionary["message"] as? String, !message.isEmpty { return message }
            for child in dictionary.values { if let message = firstMessage(in: child) { return message } }
        } else if let array = value as? [Any] {
            for child in array { if let message = firstMessage(in: child) { return message } }
        }
        return nil
    }
}

// MARK: - Offers

/// What came back when the guest asked.
///
/// An offer is a business saying yes to a specific table at a specific time for
/// a specific price, and holding it. That is worth more than a search result,
/// so it is shown as a commitment with a deadline rather than a listing.
///
/// Accepting is the only irreversible thing a guest can do on this screen, so
/// nothing else here is styled to compete with it, and a lapsed hold loses its
/// button rather than keeping one the server would refuse.
struct NativePlanOffersSheet: View {
    let ask: NativePlanDemandAsk
    /// Returns nothing when the booking stuck, or the reason it did not. A
    /// refusal is shown here rather than behind the sheet, because a slot taken
    /// a second earlier is answerable: the other offers are still on screen.
    let accept: (NativePlanDemandOffer) async -> String?
    /// Injected so the lapsed-hold state is testable without waiting an hour.
    var now: Date = Date()

    @Environment(\.dismiss) private var dismiss
    @State private var accepting: String?
    @State private var refusal: String?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(ask.offers.count == 1 ? "One venue answered" : "\(ask.offers.count) venues answered")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(NativeTheme.textSecondary)

                    ForEach(ask.offers) { offer in
                        offerCard(offer)
                    }

                    if let refusal {
                        Text(refusal)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(NativeTheme.orange)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("native-plan-offer-refusal")
                    }

                    // Said once, at the bottom, because it applies to every card
                    // above and repeating it per card would read as a warning.
                    Text("Accepting confirms with the venue and cancels the others.")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(NativeTheme.textTertiary)
                        .padding(.top, 2)
                }
                .padding(18)
            }
            .background(NativeDeepSpaceGround())
            .navigationTitle("Offers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundColor(NativeTheme.textSecondary)
                }
            }
        }
        // NavigationView, not NavigationStack: the app still ships to iOS 15,
        // and the shell navigates the same way. Stack style because a sheet
        // must not become a split view on iPad.
        .navigationViewStyle(.stack)
        .accessibilityIdentifier("native-plan-offers-sheet")
    }

    @ViewBuilder private func offerCard(_ offer: NativePlanDemandOffer) -> some View {
        let live = offer.isLive(now: now)
        VStack(alignment: .leading, spacing: 8) {
            Text(offer.where)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(NativeTheme.textPrimary)

            HStack(spacing: 8) {
                Text(offer.when).font(.system(size: 13, weight: .semibold))
                Text("·").foregroundColor(NativeTheme.textTertiary)
                Text("\(offer.durationMins) min").font(.system(size: 13, weight: .medium))
                Spacer()
                Text(offer.price).font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(NativeTheme.textSecondary)

            if let terms = offer.terms, !terms.isEmpty {
                // The vendor's own words. Conditions a guest is agreeing to must
                // not be summarised away.
                Text(terms)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(NativeTheme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Text(offer.hold(now: now))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(live ? NativeTheme.textTertiary : NativeTheme.orange)
                Spacer()
                if live {
                    Button(action: { Task { await take(offer) } }) {
                        HStack(spacing: 6) {
                            if accepting == offer.id { ProgressView().controlSize(.mini).tint(.black) }
                            Text("Accept").font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(.black)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(NativeTheme.cyan))
                    }
                    .buttonStyle(.plain)
                    .disabled(accepting != nil)
                    .accessibilityIdentifier("native-plan-offer-accept-\(offer.id)")
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.10)))
        .opacity(live ? 1 : 0.55)
        .accessibilityIdentifier("native-plan-offer-\(offer.id)")
    }

    private func take(_ offer: NativePlanDemandOffer) async {
        accepting = offer.id
        refusal = nil
        refusal = await accept(offer)
        accepting = nil
    }
}
