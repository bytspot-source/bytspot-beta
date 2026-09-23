import Foundation
import Combine
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
    /// Set when the ask came from one Discover card rather than a Plan.
    var targetWindowId: String? = nil
    /// Who a Discover ask went to, so it can be named before anyone answers.
    var askedOf: NativeAskedOf? = nil
    var earliest: String? = nil

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
        let data = try JSONSerialization.data(withJSONObject: NativeTRPCList.rows(payload))
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
    /// The clock this sheet reads. Injected so the lapsed-hold state is
    /// testable without waiting an hour; left alone it is the real one, and
    /// `tick` moves it while the sheet is open.
    var now: Date = Date()

    /// A hold runs out while the guest is deciding, so the sheet cannot read
    /// the clock once and keep the answer. Without this the countdown freezes
    /// at whatever it said when the sheet opened and Accept stays lit on a
    /// table the server has already let go.
    @State private var tick: Date?
    private var clock: Date { tick ?? now }

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
            // Every second, not every minute: the label only changes by the
            // minute, but Accept has to go the moment the hold does.
            .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { tick = $0 }
        }
        // NavigationView, not NavigationStack: the app still ships to iOS 15,
        // and the shell navigates the same way. Stack style because a sheet
        // must not become a split view on iPad.
        .navigationViewStyle(.stack)
        .accessibilityIdentifier("native-plan-offers-sheet")
    }

    @ViewBuilder private func offerCard(_ offer: NativePlanDemandOffer) -> some View {
        let live = offer.isLive(now: clock)
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
                Text(offer.hold(now: clock))
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

// MARK: - Asking a vendor window from Discover

/// tRPC sends a list as `{ data: [...] }`, and `unwrapTRPCData` only unwraps
/// objects. A list is read through here so either shape decodes.
enum NativeTRPCList {
    static func rows(_ payload: Any) -> Any {
        if let dictionary = payload as? [String: Any], let rows = dictionary["data"] as? [Any] { return rows }
        return payload
    }
}

struct NativeAskedOf: Codable, Equatable {
    let sellerName: String
    let place: String
}

struct NativeWindowSlot: Codable, Equatable, Identifiable {
    let startsAt: String
    let remaining: Int

    var id: String { startsAt }
    var when: String { NativePlanDemandFormat.when(startsAt) }
}

struct NativeWindowPlace: Codable, Equatable {
    let label: String
    let address: String?
    let phone: String?
    let website: String?
}

/// One published vendor window, as `inventory.list` sends it.
struct NativeWindowListing: Codable, Identifiable, Equatable {
    let windowId: String
    let sellerName: String
    let title: String
    let priceCents: Int
    let maxGuests: Int
    let durationMins: Int?
    let intent: String
    let place: NativeWindowPlace
    let distanceMiles: Double
    let coverUrl: String?
    let galleryUrls: [String]?
    let nextSlot: NativeWindowSlot
    let upcomingSlots: [NativeWindowSlot]?

    var id: String { windowId }
    var takesAsks: Bool { intent == "request" }
    /// An older server sends only the next slot; that one is still askable.
    var slots: [NativeWindowSlot] {
        if let upcomingSlots, !upcomingSlots.isEmpty { return upcomingSlots }
        return [nextSlot]
    }
    var imageURL: URL? { (coverUrl ?? galleryUrls?.first).flatMap { URL(string: $0) } }
    var price: String { NativePlanDemandFormat.price(priceCents) }
    var distance: String { distanceMiles < 0.1 ? "Nearby" : String(format: "%.1f mi", distanceMiles) }
    var callURL: URL? {
        guard let phone = place.phone, !phone.isEmpty else { return nil }
        return URL(string: "tel:\(phone)")
    }
    var websiteURL: URL? {
        guard let website = place.website, let url = URL(string: website),
              ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url
    }
}

/// The API's rules, applied first so a request it would refuse never leaves the phone.
enum NativeWindowAskRules {
    static let liveStates: Set<String> = ["OPEN", "MATCHED", "OFFERED"]

    static func problem(listing: NativeWindowListing, partySize: Int, slot: NativeWindowSlot?, note: String) -> String? {
        if partySize < 1 { return "How many are coming?" }
        if partySize > listing.maxGuests { return "This takes up to \(listing.maxGuests) guests" }
        guard let slot else { return "Pick a time" }
        if slot.remaining < partySize { return "Not enough room at that time" }
        if note.trimmingCharacters(in: .whitespacesAndNewlines).count > 280 { return "Keep the note under 280 characters" }
        return nil
    }

    static func isLive(_ ask: NativePlanDemandAsk) -> Bool { liveStates.contains(ask.state) }

    /// Reopening a card resumes its open ask instead of asking twice.
    static func liveAsk(in mine: [NativePlanDemandAsk], windowID: String) -> NativePlanDemandAsk? {
        mine.first { $0.targetWindowId == windowID && isLive($0) }
    }

    static func name(of ask: NativePlanDemandAsk) -> String {
        ask.askedOf?.sellerName ?? ask.offers.first?.where ?? "Your request"
    }

    static func detail(of ask: NativePlanDemandAsk) -> String {
        var parts: [String] = []
        if ask.partySize > 0 { parts.append("\(ask.partySize) \(ask.partySize == 1 ? "guest" : "guests")") }
        if let earliest = ask.earliest { parts.append(NativePlanDemandFormat.when(earliest)) }
        if let place = ask.askedOf?.place { parts.append(place) }
        return parts.joined(separator: " · ")
    }
}

protocol NativeWindowAsking {
    func listings(near coordinate: NativeLocationCoordinate) async throws -> [NativeWindowListing]
    func ask(windowID: String, partySize: Int, startsAt: String, note: String) async throws -> NativePlanDemandRaised
}

struct NativeWindowAskAPI: NativeWindowAsking {
    let client: BytspotAPIClient

    func listings(near coordinate: NativeLocationCoordinate) async throws -> [NativeWindowListing] {
        let payload = try await client.trpcQueryPayload(
            path: "/trpc/inventory.list",
            input: ["lat": coordinate.latitude, "lng": coordinate.longitude],
        )
        let data = try JSONSerialization.data(withJSONObject: NativeTRPCList.rows(payload))
        return try JSONDecoder().decode([NativeWindowListing].self, from: data)
    }

    func ask(windowID: String, partySize: Int, startsAt: String, note: String) async throws -> NativePlanDemandRaised {
        var input: [String: Any] = ["windowId": windowID, "partySize": partySize, "startsAt": startsAt]
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { input["note"] = trimmed }
        let payload = try await client.trpcPayload(path: "/trpc/demand.ask", method: "POST", input: input)
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(NativePlanDemandRaised.self, from: data)
    }
}

/// Published vendor windows near the guest, each with an Ask.
///
/// Sits above the Discover deck rather than inside it: a window takes asks, not
/// checkout, and the deck's booking policy must not treat it as a service.
struct NativeWindowAskRail: View {
    let coordinate: NativeLocationCoordinate
    let openAuth: () -> Void
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var listings: [NativeWindowListing] = []
    @State private var asking: NativeWindowListing?
    @State private var showRequests = false

    private var client: BytspotAPIClient {
        let store = sessionStore
        return BytspotAPIClient(tokenProvider: { store.canAttachBearerToken ? store.token : nil })
    }

    private var windows: NativeWindowAsking {
        #if DEBUG
        if NativeWindowAskPreview.mode != nil { return NativeWindowAskPreview.Windows() }
        #endif
        return NativeWindowAskAPI(client: client)
    }

    private var demand: NativePlanDemandAsking {
        #if DEBUG
        if let mode = NativeWindowAskPreview.mode { return NativeWindowAskPreview.Demand(mode: mode) }
        #endif
        return NativePlanDemandAPI(client: client)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if listings.isEmpty {
                Color.clear.frame(height: 0)
            } else {
                HStack {
                    Text("Ask a local business")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(NativeTheme.textPrimary)
                    Spacer()
                    if sessionStore.canAttachBearerToken {
                        Button("My requests") { showRequests = true }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(NativeTheme.cyan)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("native-window-ask-my-requests")
                    }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(listings) { listing in card(listing) }
                    }
                }
            }
        }
        .task(id: "\(coordinate.latitude),\(coordinate.longitude)") { await load() }
        .sheet(item: $asking) { listing in
            NativeWindowAskSheet(listing: listing, windows: windows, demand: demand)
        }
        .sheet(isPresented: $showRequests) {
            NativeGuestRequestsView(demand: demand)
        }
        .accessibilityIdentifier("native-window-ask-rail")
    }

    private func load() async {
        // A rail that fails to load is absent, not an error: Discover still works.
        guard let found = try? await windows.listings(near: coordinate) else { return }
        listings = found.filter(\.takesAsks)
        #if DEBUG
        switch NativeWindowAskPreview.mode {
        case "requests": showRequests = true
        case "ask", "offered", "offers", "booked": asking = listings.first
        default: break
        }
        #endif
    }

    @ViewBuilder private func card(_ listing: NativeWindowListing) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: listing.imageURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.white.opacity(0.06)
            }
            .frame(width: 240, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            Text(listing.title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(NativeTheme.textPrimary)
                .lineLimit(1)
            Text("\(listing.sellerName) · \(listing.place.label)")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(NativeTheme.textSecondary)
                .lineLimit(1)
            Text("\(listing.price) · Next \(listing.nextSlot.when) · \(listing.distance)")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(NativeTheme.textTertiary)
                .lineLimit(1)

            HStack(spacing: 8) {
                Button(action: {
                    if sessionStore.canAttachBearerToken { asking = listing } else { openAuth() }
                }) {
                    Text("Ask")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(NativeTheme.cyan))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-window-ask-\(listing.windowId)")
                if let call = listing.callURL {
                    Link(destination: call) { Image(systemName: "phone.fill").frame(width: 36, height: 36) }
                        .foregroundColor(NativeTheme.textPrimary)
                        .accessibilityLabel("Call \(listing.sellerName)")
                }
                if let website = listing.websiteURL {
                    Link(destination: website) { Image(systemName: "globe").frame(width: 36, height: 36) }
                        .foregroundColor(NativeTheme.textPrimary)
                        .accessibilityLabel("\(listing.sellerName) website")
                }
            }
            .padding(.top, 2)
        }
        .frame(width: 240, alignment: .leading)
    }
}

/// Party size, a time from the window's open slots and a note; then the answer.
struct NativeWindowAskSheet: View {
    let listing: NativeWindowListing
    let windows: NativeWindowAsking
    let demand: NativePlanDemandAsking

    @Environment(\.dismiss) private var dismiss
    @State private var partySize = 2
    @State private var slotID: String?
    @State private var note = ""
    @State private var problem: String?
    @State private var sending = false
    @State private var ask: NativePlanDemandAsk?
    @State private var showOffers = false
    @State private var booked: NativePlanDemandBooking?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let booked {
                        bookedView(booked)
                    } else if let ask {
                        waitingView(ask)
                    } else {
                        formView
                    }
                    if let problem {
                        Text(problem)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(NativeTheme.orange)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("native-window-ask-problem")
                    }
                }
                .padding(18)
            }
            .background(NativeDeepSpaceGround())
            .navigationTitle(ask == nil ? "Ask \(listing.sellerName)" : listing.sellerName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundColor(NativeTheme.textSecondary)
                }
            }
            .task { await resume() }
            .onReceive(Timer.publish(every: 10, on: .main, in: .common).autoconnect()) { _ in
                Task { await refresh() }
            }
            .sheet(isPresented: $showOffers) {
                if let ask {
                    NativePlanOffersSheet(ask: ask, accept: { offer in await take(offer) })
                }
            }
        }
        .navigationViewStyle(.stack)
        .accessibilityIdentifier("native-window-ask-sheet")
    }

    private var formView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(listing.title)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(NativeTheme.textPrimary)

            Stepper(value: $partySize, in: 1...max(1, listing.maxGuests)) {
                Text("\(partySize) \(partySize == 1 ? "guest" : "guests") · up to \(listing.maxGuests)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(NativeTheme.textPrimary)
            }

            Text("When")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(NativeTheme.textSecondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(listing.slots) { slot in
                    let chosen = slotID == slot.id
                    Button(action: { slotID = slot.id }) {
                        Text(slot.when)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(NativeTheme.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(Capsule().fill(chosen ? NativeTheme.cyan.opacity(0.3) : Color.white.opacity(0.06)))
                            .overlay(Capsule().stroke(chosen ? NativeTheme.cyan : Color.white.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("native-window-ask-slot-\(slot.id)")
                }
            }

            TextField("Note (optional)", text: $note)
                .textFieldStyle(.roundedBorder)

            Button(action: { Task { await send() } }) {
                HStack(spacing: 8) {
                    if sending { ProgressView().controlSize(.mini).tint(.black) }
                    Text(sending ? "Sending…" : "Send request").font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.black)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(NativeTheme.cyan))
            }
            .buttonStyle(.plain)
            .disabled(sending)
            .accessibilityIdentifier("native-window-ask-send")

            Text("Free to ask. Nothing is booked until you accept an offer.")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(NativeTheme.textTertiary)
        }
    }

    private func waitingView(_ ask: NativePlanDemandAsk) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ask.status)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(NativeTheme.textPrimary)
            Text(ask.offers.isEmpty
                 ? "Sent. \(listing.sellerName) will answer here, and you'll get a notification when they do."
                 : "\(listing.sellerName) is holding a time for you.")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(NativeTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if ask.offers.contains(where: { !$0.accepted }) {
                Button("See offers") { showOffers = true }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(NativeTheme.cyan))
                    .accessibilityIdentifier("native-window-ask-see-offers")
            }
            if NativeWindowAskRules.isLive(ask) {
                Button("Withdraw request") { Task { await withdraw(ask) } }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(NativeTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }

    private func bookedView(_ booked: NativePlanDemandBooking) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("You're booked")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(NativeTheme.textPrimary)
            Text(booked.confirmation)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(NativeTheme.textSecondary)
        }
        .accessibilityIdentifier("native-window-ask-booked")
    }

    private func resume() async {
        partySize = min(max(1, partySize), max(1, listing.maxGuests))
        if slotID == nil { slotID = listing.slots.first?.id }
        guard let mine = try? await demand.mine() else { return }
        if ask == nil, let live = NativeWindowAskRules.liveAsk(in: mine, windowID: listing.windowId) { ask = live }
        #if DEBUG
        if NativeWindowAskPreview.mode == "offers" { showOffers = true }
        if NativeWindowAskPreview.mode == "booked", let offer = ask?.offers.first {
            booked = try? await demand.accept(offerID: offer.id)
        }
        #endif
    }

    private func refresh() async {
        guard let current = ask, booked == nil else { return }
        guard let mine = try? await demand.mine() else { return }
        if let latest = mine.first(where: { $0.id == current.id }) { ask = latest }
    }

    private func send() async {
        let slot = listing.slots.first { $0.id == slotID }
        if let issue = NativeWindowAskRules.problem(listing: listing, partySize: partySize, slot: slot, note: note) {
            problem = issue
            return
        }
        guard let slot else { return }
        sending = true
        problem = nil
        do {
            let raised = try await windows.ask(windowID: listing.windowId, partySize: partySize, startsAt: slot.startsAt, note: note)
            ask = NativePlanDemandAsk(
                id: raised.id, state: raised.state, category: raised.category, partySize: partySize,
                planId: nil, expiresAt: raised.expiresAt, offers: [], targetWindowId: listing.windowId,
            )
        } catch {
            problem = NativePlanDemandFailure.message(for: error)
        }
        sending = false
    }

    private func take(_ offer: NativePlanDemandOffer) async -> String? {
        do {
            booked = try await demand.accept(offerID: offer.id)
            showOffers = false
            return nil
        } catch {
            return NativePlanDemandFailure.message(for: error)
        }
    }

    private func withdraw(_ ask: NativePlanDemandAsk) async {
        do {
            try await demand.withdraw(demandID: ask.id)
            dismiss()
        } catch {
            problem = NativePlanDemandFailure.message(for: error)
        }
    }
}

/// Every request the guest has open or booked. Where an offer push lands.
struct NativeGuestRequestsView: View {
    let demand: NativePlanDemandAsking

    @Environment(\.dismiss) private var dismiss
    @State private var rows: [NativePlanDemandAsk]?
    @State private var problem: String?
    @State private var offersFor: NativePlanDemandAsk?

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let rows {
                        if rows.isEmpty {
                            Text("No requests. Ask a business from Discover and the answer lands here.")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(NativeTheme.textSecondary)
                                .padding(.vertical, 40)
                        }
                        ForEach(rows) { row in requestCard(row) }
                    } else if problem == nil {
                        ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.vertical, 40)
                    }
                    if let problem {
                        Text(problem)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(NativeTheme.orange)
                    }
                }
                .padding(18)
            }
            .background(NativeDeepSpaceGround())
            .navigationTitle("My requests")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundColor(NativeTheme.textSecondary)
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .onReceive(Timer.publish(every: 15, on: .main, in: .common).autoconnect()) { _ in
                Task { await load() }
            }
            .sheet(item: $offersFor) { ask in
                NativePlanOffersSheet(ask: ask, accept: { offer in await take(offer) })
            }
        }
        .navigationViewStyle(.stack)
        .accessibilityIdentifier("native-guest-requests")
    }

    @ViewBuilder private func requestCard(_ row: NativePlanDemandAsk) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(NativeWindowAskRules.name(of: row))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Text(row.status)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(NativeTheme.cyan)
            }
            let detail = NativeWindowAskRules.detail(of: row)
            if !detail.isEmpty {
                Text(detail)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(NativeTheme.textSecondary)
            }
            HStack(spacing: 10) {
                if row.offers.contains(where: { !$0.accepted }) {
                    Button("See offers") { offersFor = row }
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(NativeTheme.cyan))
                        .accessibilityIdentifier("native-guest-request-offers-\(row.id)")
                }
                if NativeWindowAskRules.isLive(row) {
                    Button("Withdraw") { Task { await withdraw(row) } }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(NativeTheme.textSecondary)
                        .frame(minHeight: 36)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.10)))
        .accessibilityIdentifier("native-guest-request-\(row.id)")
    }

    private func load() async {
        do {
            rows = try await demand.mine()
            problem = nil
        } catch {
            problem = NativePlanDemandFailure.message(for: error)
        }
    }

    private func take(_ offer: NativePlanDemandOffer) async -> String? {
        do {
            _ = try await demand.accept(offerID: offer.id)
            offersFor = nil
            await load()
            return nil
        } catch {
            return NativePlanDemandFailure.message(for: error)
        }
    }

    private func withdraw(_ row: NativePlanDemandAsk) async {
        do {
            try await demand.withdraw(demandID: row.id)
            await load()
        } catch {
            problem = NativePlanDemandFailure.message(for: error)
        }
    }
}

#if DEBUG
/// Simulator preview of asking from Discover (`BYT_NATIVE_ASK_PREVIEW` =
/// rail | ask | offered | offers | booked | requests). Sample data, no network.
enum NativeWindowAskPreview {
    static var mode: String? {
        let key = "BYT_NATIVE_ASK_PREVIEW"
        let prefix = "--byt-native-ask-preview="
        let raw = ProcessInfo.processInfo.environment[key]
            ?? ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }).map { String($0.dropFirst(prefix.count)) }
        guard let raw = raw?.lowercased(), !raw.isEmpty else { return nil }
        return raw
    }

    private static func iso(hoursFromNow hours: Double) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let base = Calendar.current.date(bySetting: .minute, value: 0, of: Date()) ?? Date()
        return formatter.string(from: base.addingTimeInterval(hours * 3600))
    }

    static var listings: [NativeWindowListing] {
        let slots = [3.0, 3.5, 4.0, 4.5, 5.0].map { NativeWindowSlot(startsAt: iso(hoursFromNow: $0), remaining: 3) }
        return [
            NativeWindowListing(
                windowId: "preview-win-1", sellerName: "Peach Table Co", title: "Chef counter",
                priceCents: 4500, maxGuests: 4, durationMins: 90, intent: "request",
                place: NativeWindowPlace(label: "Midtown", address: "1000 Peachtree St NE", phone: "+14045550123", website: "https://example.com"),
                distanceMiles: 0.6, coverUrl: nil, galleryUrls: [], nextSlot: slots[0], upcomingSlots: slots,
            ),
            NativeWindowListing(
                windowId: "preview-win-2", sellerName: "Ponce Studio", title: "Private tasting",
                priceCents: 6000, maxGuests: 8, durationMins: 60, intent: "request",
                place: NativeWindowPlace(label: "Ponce City Market", address: nil, phone: nil, website: nil),
                distanceMiles: 1.8, coverUrl: nil, galleryUrls: [], nextSlot: slots[2], upcomingSlots: Array(slots.dropFirst(2)),
            ),
        ]
    }

    static var offer: NativePlanDemandOffer {
        NativePlanDemandOffer(
            id: "preview-offer-1", where: "Midtown", startsAt: iso(hoursFromNow: 3.5), durationMins: 90,
            priceCents: 4500, terms: "Counter seats; we hold them 15 minutes.", holdExpiresAt: iso(hoursFromNow: 0.25),
        )
    }

    struct Windows: NativeWindowAsking {
        func listings(near coordinate: NativeLocationCoordinate) async throws -> [NativeWindowListing] { NativeWindowAskPreview.listings }
        func ask(windowID: String, partySize: Int, startsAt: String, note: String) async throws -> NativePlanDemandRaised {
            NativePlanDemandRaised(id: "preview-demand-new", state: "OPEN", category: "dining", expiresAt: startsAt)
        }
    }

    struct Demand: NativePlanDemandAsking {
        let mode: String

        func ask(planID: String, needKind: String) async throws -> NativePlanDemandAsk { throw CancellationError() }
        func withdraw(demandID: String) async throws {}

        func accept(offerID: String) async throws -> NativePlanDemandBooking {
            let offer = NativeWindowAskPreview.offer
            return NativePlanDemandBooking(
                offerId: offer.id, demandId: "preview-demand-1", where: offer.where,
                startsAt: offer.startsAt, durationMins: offer.durationMins, priceCents: offer.priceCents, terms: offer.terms,
            )
        }

        func mine() async throws -> [NativePlanDemandAsk] {
            let first = NativeWindowAskPreview.listings[0]
            let offered = NativePlanDemandAsk(
                id: "preview-demand-1", state: "OFFERED", category: "dining", partySize: 2, planId: nil,
                expiresAt: NativeWindowAskPreview.iso(hoursFromNow: 3), offers: [NativeWindowAskPreview.offer],
                targetWindowId: first.windowId, askedOf: NativeAskedOf(sellerName: first.sellerName, place: first.place.label),
                earliest: NativeWindowAskPreview.iso(hoursFromNow: 3.5),
            )
            switch mode {
            case "ask": return []
            case "requests":
                var booked = NativeWindowAskPreview.offer
                booked.accepted = true
                return [
                    offered,
                    NativePlanDemandAsk(
                        id: "preview-demand-2", state: "OPEN", category: "dining", partySize: 6, planId: nil,
                        expiresAt: NativeWindowAskPreview.iso(hoursFromNow: 4), offers: [],
                        targetWindowId: "preview-win-2", askedOf: NativeAskedOf(sellerName: "Ponce Studio", place: "Ponce City Market"),
                        earliest: NativeWindowAskPreview.iso(hoursFromNow: 4),
                    ),
                    NativePlanDemandAsk(
                        id: "preview-demand-3", state: "BOOKED", category: "dining", partySize: 2, planId: nil,
                        expiresAt: NativeWindowAskPreview.iso(hoursFromNow: -20), offers: [booked],
                        targetWindowId: "preview-win-3", askedOf: NativeAskedOf(sellerName: "Westside Grill", place: "West Midtown"),
                        earliest: NativeWindowAskPreview.iso(hoursFromNow: -24),
                    ),
                ]
            default: return [offered]
            }
        }
    }
}
#endif
