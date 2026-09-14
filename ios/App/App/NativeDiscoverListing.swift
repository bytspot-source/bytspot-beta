import Foundation

enum NativeDiscoverRailID: String, CaseIterable, Codable, Identifiable {
    case explore
    case eatDrink = "eat_drink"
    case shopStyle = "shop_style"
    case experience
    case social
    case events
    case wellness
    case createLearn = "create_learn"
    case nightlife
    case stay
    case move
    case celebrate
    case services
    case host

    var id: String { rawValue }
}

struct NativeDiscoverRail: Identifiable, Equatable {
    let id: NativeDiscoverRailID
    let title: String
}

/// Presentation facets over existing supply. These identifiers never travel to
/// `plans.bookables`; the app still asks that API only for `coffee` and `events`.
enum NativeDiscoverRailRegistry {
    static let rails: [NativeDiscoverRail] = [
        .init(id: .explore, title: "Explore"),
        .init(id: .eatDrink, title: "Eat & Drink"),
        .init(id: .shopStyle, title: "Shop & Style"),
        .init(id: .experience, title: "Experience"),
        .init(id: .social, title: "Social"),
        .init(id: .events, title: "Events"),
        .init(id: .wellness, title: "Wellness"),
        .init(id: .createLearn, title: "Create & Learn"),
        .init(id: .nightlife, title: "Nightlife"),
        .init(id: .stay, title: "Stay"),
        .init(id: .move, title: "Move"),
        .init(id: .celebrate, title: "Celebrate"),
        .init(id: .services, title: "Services"),
        .init(id: .host, title: "HOST")
    ]

    private static let aliases: [String: NativeDiscoverRailID] = [
        "all": .explore, "dining": .eatDrink, "coffee": .eatDrink,
        "shopping": .shopStyle, "entertainment": .events,
        "fitness": .wellness, "parking": .move, "mobility": .move,
        "boutique_apartment": .stay, "service": .services
    ]

    static func resolve(_ raw: String?) -> NativeDiscoverRailID? {
        guard let raw else { return nil }
        let key = normalized(raw)
        if let alias = aliases[key] { return alias }
        return rails.first { normalized($0.id.rawValue) == key || normalized($0.title) == key }?.id
    }

    static func referenceRails(for legacyType: String) -> Set<NativeDiscoverRailID> {
        let direct: Set<NativeDiscoverRailID>
        switch normalized(legacyType) {
        case "dining", "coffee": direct = [.eatDrink]
        case "shopping": direct = [.shopStyle]
        case "entertainment": direct = [.experience, .events]
        case "fitness": direct = [.wellness]
        case "nightlife": direct = [.nightlife]
        case "boutique_apartment": direct = [.stay]
        case "parking", "mobility": direct = [.move]
        case "service": direct = [.services]
        default: direct = []
        }
        return direct.union([.explore])
    }

    static func partyRails(for offering: NativePlanBookableOffering) -> Set<NativeDiscoverRailID> {
        guard offering.sourceKind == .party else { return [] }
        var result: Set<NativeDiscoverRailID> = [.explore, .events, .host]
        guard let taxonomy = offering.hostTaxonomy else { return result }
        switch taxonomy.category {
        case .party: result.insert(.celebrate)
        case .nightlife: result.insert(.nightlife)
        case .music: result.insert(.events)
        case .sports: result.insert(.experience)
        case .food: result.insert(.eatDrink)
        case .social: result.insert(.social)
        case .culture: result.formUnion([.createLearn, .experience])
        case .cars: result.formUnion([.experience, .move])
        case .outdoor: result.formUnion([.experience, .wellness])
        case .community: result.formUnion([.social, .createLearn])
        }
        return result
    }

    static func rails(for offering: NativePlanBookableOffering) -> Set<NativeDiscoverRailID> {
        guard offering.sourceKind != .party else { return partyRails(for: offering) }
        guard let legacy = NativeDiscoverBookablePresentation.rail(category: offering.category) else { return [.explore] }
        return referenceRails(for: legacy)
    }

    /// Discover intentionally drops synthetic minimum-count filler and clone
    /// cards. Registered/API venues and actual place/event integrations remain.
    static func isTrustedReference(_ card: NativeDiscoverSummary) -> Bool {
        let syntheticPrefixes = ["coverage-", "starter-", "companion-"]
        guard !syntheticPrefixes.contains(where: card.id.hasPrefix),
              !card.badgeText.localizedCaseInsensitiveContains("CURATED") else { return false }
        return card.badgeText.localizedCaseInsensitiveContains("LIVE")
            || card.badgeText.localizedCaseInsensitiveContains("GOOGLE")
            || card.badgeText.localizedCaseInsensitiveContains("APPLE MAPS")
            || card.badgeText.localizedCaseInsensitiveContains("BEST VALUE")
            || card.id.hasPrefix("venue-")
    }

    private static func normalized(_ value: String) -> String {
        String(value.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "_" })
            .split(separator: "_").joined(separator: "_")
    }
}

enum NativeDiscoverPartyHydrationOutcome {
    case loaded(NativePartyPassRecord)
    case unavailable
    case failed
}

/// Detail hydration is a bounded enhancement of an already eligible catalog.
/// It cannot introduce a Party, and a server-invalidated Party disappears.
struct NativeDiscoverPartyHydrationState {
    static let limit = 12
    private(set) var userID: String?
    private(set) var generation = UUID()
    private(set) var records: [String: NativePartyPassRecord] = [:]
    private(set) var failedIDs: Set<String> = []
    private(set) var unavailableIDs: Set<String> = []
    private(set) var isLoading = false

    mutating func begin(userID: String?, partyIDs: [String]) -> UUID {
        self.userID = userID
        generation = UUID()
        records = [:]
        failedIDs = []
        unavailableIDs = []
        isLoading = userID?.isEmpty == false && !partyIDs.isEmpty
        return generation
    }

    mutating func finish(partyID: String, outcome: NativeDiscoverPartyHydrationOutcome,
                         generation: UUID, userID: String) {
        guard self.generation == generation, self.userID == userID else { return }
        switch outcome {
        case .loaded(let record) where record.id == partyID: records[partyID] = record
        case .loaded: unavailableIDs.insert(partyID)
        case .unavailable: unavailableIDs.insert(partyID)
        case .failed: failedIDs.insert(partyID)
        }
    }

    mutating func complete(generation: UUID, userID: String) {
        guard self.generation == generation, self.userID == userID else { return }
        isLoading = false
    }

    func record(for offering: NativePlanBookableOffering, userID: String?) -> NativePartyPassRecord? {
        guard offering.sourceKind == .party, self.userID == userID else { return nil }
        return records[offering.sourceId]
    }

    func isVisible(_ offering: NativePlanBookableOffering, userID: String?) -> Bool {
        offering.sourceKind != .party || (self.userID == userID && !unavailableIDs.contains(offering.sourceId))
    }

    func failedToHydrate(_ offering: NativePlanBookableOffering, userID: String?) -> Bool {
        offering.sourceKind == .party && self.userID == userID && failedIDs.contains(offering.sourceId)
    }
}

/// Discover listing plug — what a card is allowed to promise.
///
/// Three states, fail-closed. A card may only say BOOK when Bytspot controls
/// the vendor *and* a published SKU on that rail can actually settle. A
/// controlled vendor with no settlement path asks (REQUEST). Everything local
/// — Google, Apple Maps, Ticketmaster, Typical catalog, coverage clones —
/// stays DETAILS and never wears settlement chrome.
enum NativeDiscoverFulfillment: String, Equatable {
    case book
    case request
    case details
}

extension NativeDiscoverFulfillment {
    /// Shared capability vocabulary with the web projection
    /// (src/utils/bookableProjection.ts `BookableCapability`). Native carries no
    /// `redirect` state yet — no native card holds a third-party deep link — so
    /// web's `{details, redirect}` both fold to `.details` here.
    var capabilityToken: String {
        switch self {
        case .book: return "book"
        case .request: return "request"
        case .details: return "details"
        }
    }

    /// `control` is a pure derivation of capability, identical to the web table
    /// `controlFromCapability` (bytspot-plan-prime-path-contract.md §8): book and
    /// request settle or hold on our rails → vendor; details is a reference →
    /// local. The native engine derives fulfillment from an input control and
    /// this closes the loop so the two surfaces can never disagree.
    var control: String {
        switch self {
        case .book, .request: return NativeDiscoverCardControl.vendor
        case .details: return NativeDiscoverCardControl.local
        }
    }
}

/// A hold is a promise that capacity is being kept. It is real only when the
/// same path could settle, so it is issued from the SKU that would be booked.
struct NativeDiscoverPlanHold: Equatable {
    let seconds: Int
    let label: String
}

enum NativeDiscoverListing {
    /// Settlement is off until host/vendor payouts exist in production. Until
    /// then a controlled vendor asks rather than claims it can charge.
    static let settlementReady = false

    /// Verbs that promise money moves. A local card may never wear one.
    static let settlementVerbs = ["book", "reserve", "buy", "pay", "checkout", "order", "rsvp"]

    /// Taking-possession verbs. These promise nothing on their own — "Get
    /// Directions" is honest — so they only count against a claimed thing.
    static let acquisitionVerbs = ["get", "join", "claim", "grab", "secure", "register", "hold", "take"]

    /// The things a card can claim to have kept for you.
    static let claimedGoods = ["ticket", "pass", "guest list", "table", "seat", "spot", "room", "booth", "slot", "reservation", "class", "session", "list"]

    /// Hyphens and punctuation hide verbs ("Pre-book"), so flatten first.
    static func normalized(_ title: String) -> String {
        let scalars = title.lowercased().map { $0.isLetter || $0.isNumber ? $0 : " " }
        return String(scalars).split(separator: " ").joined(separator: " ")
    }

    static func isSettlementVerb(_ title: String) -> Bool {
        let lowered = normalized(title)
        return settlementVerbs.contains { lowered.hasPrefix($0) || lowered.contains(" \($0)") }
    }

    /// A verb that takes possession of a claimed good is a promise, so
    /// "Get Tickets", "Claim Pass" and "Grab a Table" are caught while
    /// "Get Directions" and the pinned "View Pass" are not.
    static func claimsHeldGoods(_ title: String) -> Bool {
        let lowered = normalized(title)
        guard let verb = lowered.split(separator: " ").first.map(String.init), acquisitionVerbs.contains(verb) else { return false }
        return claimedGoods.contains { lowered.contains($0) }
    }

    /// Wording is not the whole promise. "Get Ticket" and "Join Guest List"
    /// carry no settlement verb yet commit to a transaction, so a CTA counts
    /// as a promise if it names a settlement verb, claims a held good, or is
    /// simply something the catalog sells.
    /// The only things an uncontrolled card is allowed to say. Guessing which
    /// words promise money is a losing game against vendor-authored and
    /// non-English text — "Tickets", "VIP Table", "Admission" name a
    /// transaction with no verb at all — so a local card may only wear chrome
    /// we recognise, and anything else becomes Details.
    static let browseChrome: Set<String> = [
        "details", "open details", "view details", "more details",
        "view menu", "view stay", "view pass", "view photos", "view hours",
        "view event", "view parking", "tap verified",
        "plan dining", "plan stop", "plan arrival", "plan a stop", "plan night",
        "route", "directions", "get directions", "navigate",
        "check in", "checked in",
        "explore", "explore shops", "browse", "save", "share", "call", "website", "menu"
    ]

    /// Asking is not claiming, so a controlled vendor may say it will take the
    /// request. These are ours, not vendor-authored.
    static let requestChrome: Set<String> = [
        "request", "request service", "request transfer", "request quote",
        "plan group ride", "contact", "inquire", "check availability", "ask"
    ]

    static func isBrowseChrome(_ title: String) -> Bool {
        browseChrome.contains(normalized(title))
    }

    static func isRequestChrome(_ title: String) -> Bool {
        requestChrome.contains(normalized(title))
    }

    /// Asking claims nothing, so it is honest on any card, controlled or not.
    static func isHonestChrome(_ title: String) -> Bool {
        isBrowseChrome(title) || isRequestChrome(title)
    }

    /// "Book Ride" is a label this app writes onto its own event cards to earn
    /// the arrival path. A vendor sending the same two words has not earned it,
    /// so provenance is the whole test.
    static func isAppAuthoredEventCTA(cta: String, id: String, badgeText: String) -> Bool {
        cta == "Book Ride" && badgeText == "LIVE EVENT"
            && (id.hasPrefix("event-") || id.hasPrefix("nightlife-event-"))
    }

    static func promisesSettlement(_ title: String, catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared) -> Bool {
        if isSettlementVerb(title) || claimsHeldGoods(title) { return true }
        guard let catalog else { return false }
        return catalog.templates.contains { template in
            template.cta.caseInsensitiveCompare(title) == .orderedSame && canSettle(template)
        }
    }

    /// Any capability that moves money or holds capacity, not just book.
    static let settlementCapabilities: [BookableCapabilityID] = [.book, .reserve, .rsvp, .buy, .pay]

    static func canSettle(_ template: BookableTemplate) -> Bool {
        settlementCapabilities.contains { template.canExecute($0, in: .published) }
    }

    /// The SKU a rail would actually sell: the first that can settle, not
    /// merely the first by name. Deterministic so two surfaces agree.
    static func skuTemplate(forRail rail: String, catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared) -> BookableTemplate? {
        guard let catalog else { return nil }
        return catalog.templates(forDiscoverCategory: rail).sorted { $0.id < $1.id }.first(where: canSettle)
    }

    static func fulfillment(
        control: String,
        rail: String,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> NativeDiscoverFulfillment {
        guard control == NativeDiscoverCardControl.vendor else { return .details }
        guard settlementReady, skuTemplate(forRail: rail, catalog: catalog) != nil else { return .request }
        return .book
    }

    /// The card keeps its own noun; the plug only refuses a promise the path
    /// cannot keep. A local brochure loses settlement chrome and reads Details.
    static func primaryCTATitle(
        proposed: String,
        control: String,
        rail: String,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> String {
        switch fulfillment(control: control, rail: rail, settlementReady: settlementReady, catalog: catalog) {
        case .book:
            return proposed
        case .details:
            // Allowlist, not blocklist: unrecognised wording is refused.
            return isHonestChrome(proposed) ? proposed : "Details"
        case .request:
            // A vendor is contracted, not trusted to author copy: unrecognised
            // text is an unknown promise, so it asks instead.
            return isHonestChrome(proposed) ? proposed : "Request"
        }
    }

    static func planHold(
        control: String,
        rail: String?,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> NativeDiscoverPlanHold? {
        // An unknown rail cannot be priced, so it is never held.
        guard let rail else { return nil }
        guard fulfillment(control: control, rail: rail, settlementReady: settlementReady, catalog: catalog) == .book,
              let template = skuTemplate(forRail: rail, catalog: catalog),
              template.timing.holdSecs > 0 else { return nil }
        return NativeDiscoverPlanHold(seconds: template.timing.holdSecs, label: "Held \(template.timing.holdSecs / 60) min")
    }

    /// Home's Typical Plan is the same atom as a Discover card. It may only
    /// carry a hold when its own detector can settle, so a Typical catalog
    /// plan never advertises kept capacity.
    static func planHold(
        for plan: NativeCollapsePlan,
        rail: String?,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> NativeDiscoverPlanHold? {
        guard plan.canCheckout else { return nil }
        return planHold(control: NativeDiscoverCardControl.vendor, rail: rail, settlementReady: settlementReady, catalog: catalog)
    }

    /// Home hero CTA passes through the same refusal as a Discover card.
    static func homePlanCTATitle(
        for plan: NativeCollapsePlan,
        proposed: String,
        rail: String?,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> String {
        guard promisesSettlement(proposed, catalog: catalog) else { return proposed }
        guard planHold(for: plan, rail: rail, settlementReady: settlementReady, catalog: catalog) != nil else { return "Details" }
        return proposed
    }
}

// MARK: - Discover M6 canonical offering policy

/// Four presentation states: Book, Request, External (redirect), Listed (details).
/// A generic catalog capability is not a controlled booking or confirmation.
/// Book stays dormant: booking.createCheckout is not registered and generic
/// payments.checkout cannot establish controlled inventory. Party is a preview,
/// never a Book action. Only the exact Coffee request route is executable today.
enum NativeDiscoverBookableCapability: String, Equatable {
    case book, request, redirect, details
}

enum NativeDiscoverBookableRingStyle: String, Equatable {
    case solid, dashed, dot
}

/// Pass an offering only from plans.bookables, never one synthesized from a
/// category, catalog template, verification badge, or premium label. External
/// handoff data is a separate explicit input; today's feed supplies none.
struct NativeDiscoverBookablePresentation: Equatable {
    /// M6 raised achromatic surface; photography supplies real-world color.
    static let surfaceHex = 0x101010
    let capability: NativeDiscoverBookableCapability
    let externalURL: URL?
    let externalProvider: String?

    init(
        offering: NativePlanBookableOffering? = nil,
        externalURL: URL? = nil,
        externalProvider: String? = nil
    ) {
        let resolved: NativeDiscoverBookableCapability
        if let offering = offering {
            if !Self.isValidIdentity(offering.id) || !Self.isValidIdentity(offering.sourceId) {
                resolved = .details
            } else {
                switch (offering.sourceKind, offering.capability) {
                case (.coffeeSpot, "request"): resolved = .request
                case (.party, _): resolved = .details
                case (_, "redirect"): resolved = .redirect
                default: resolved = .details
                }
            }
        } else {
            // Only independently supplied handoff data can promote a reference.
            resolved = .redirect
        }

        if resolved == .redirect,
           let url = externalURL, Self.isValidExternalURL(url),
           let provider = externalProvider?.trimmingCharacters(in: .whitespacesAndNewlines),
           !provider.isEmpty,
           provider.rangeOfCharacter(from: .controlCharacters) == nil {
            capability = .redirect
            self.externalURL = url
            self.externalProvider = provider
        } else {
            capability = resolved == .redirect ? .details : resolved
            self.externalURL = nil
            self.externalProvider = nil
        }
    }

    var primaryActionTitle: String? {
        switch capability {
        case .book: return "Book"
        case .request: return "Request"
        case .redirect: return externalProvider.map { "Book on \($0) ↗" }
        case .details: return nil
        }
    }

    var statusLabel: String {
        switch capability {
        case .book: return "Book"
        case .request: return "Request"
        case .redirect: return "External"
        case .details: return "Listed"
        }
    }

    /// Blue belongs only to a supported Bytspot action, never an external link.
    var actionHex: UInt? {
        switch capability {
        case .book, .request: return 0x00BFFF
        case .redirect, .details: return nil
        }
    }

    var ringStyle: NativeDiscoverBookableRingStyle {
        switch capability {
        case .book: return .solid
        case .request: return .dashed
        case .redirect, .details: return .dot
        }
    }

    var availabilityLine: String {
        switch capability {
        case .book: return "Review availability before booking"
        case .request: return "Subject to host acceptance"
        case .redirect: return "Availability and confirmation are handled by the provider, not Bytspot"
        case .details: return "Place discovery · Bytspot does not control availability"
        }
    }

    /// Opaque source IDs may be UUIDs or server keys. Do not repair malformed
    /// identity strings, or mistake a display title/URL for a canonical key.
    private static func isValidIdentity(_ value: String) -> Bool {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:")
        return !value.isEmpty && value.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    /// This validates a supplied handoff, not provider availability or trust.
    /// No host/provider is guessed from a card title or an ordinary website.
    private static func isValidExternalURL(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "https",
              parts.user == nil, parts.password == nil,
              let host = parts.host, !host.isEmpty,
              parts.port == nil || parts.port == 443 else { return false }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")
        return host.count <= 253 && labels.count >= 2 && labels.allSatisfy { label in
            !label.isEmpty && label.count <= 63 && label.first != "-" && label.last != "-"
                && label.unicodeScalars.allSatisfy { allowed.contains($0) }
        }
    }

    /// M5's All + ten rails, in the same order, with emoji-free labels.
    static let railLabels = [
        "All", "Boutique Stay", "Mobility", "Nightlife", "Dining", "Coffee",
        "Shopping", "Events", "Services", "Fitness", "Parking"
    ]
    static let railTokens = [
        "all", "boutique_apartment", "mobility", "nightlife", "dining", "coffee",
        "shopping", "entertainment", "service", "fitness", "parking"
    ]

    /// Domain-to-rail metadata only; this never participates in capability.
    /// automotive/stall/wellness/green are the actual bookable catalog domains.
    /// transport is the explicit transport category; unknown aliases stay nil.
    static func rail(category: String) -> String? {
        let normalized = category.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch normalized {
        case "events": return "entertainment"
        case "stay": return "boutique_apartment"
        case "automotive", "transport": return "mobility"
        case "stall": return "parking"
        case "wellness", "green": return "service"
        default: return railTokens.contains(normalized) ? normalized : nil
        }
    }
}

// MARK: - Shared M5/M2 coffee transaction projection

import Combine

/// Read-only continuation to existing Plan detail, never proof of payment or a
/// generic booking. Source identity and live reservation facts come from Plans.
struct NativeDiscoverTransaction: Equatable {
    let planID: String
    let planTitle: String
    let reservationID: String
    let statusLabel: String
    let detail: String
    let primaryTitle: String

    static func transaction(
        for offering: NativePlanBookableOffering,
        plans: [NativePlan],
        userID: String?,
        now: Date = Date()
    ) -> NativeDiscoverTransaction? {
        guard let userID, !userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              NativeDiscoverBookablePresentation(offering: offering).capability == .request else { return nil }
        var fallback: NativeDiscoverTransaction?
        for plan in plans where plan.creatorUserId == userID && !plan.id.isEmpty {
            for item in plan.items {
                // No title, selectionKey, category, or reservation-ID guessing.
                // A bare coffee selection and a legacy reservation lacking its
                // exact coffeeSpotId are deliberately not transactions here.
                guard item.coffeeSpotId == offering.sourceId, item.partyId == nil,
                      let reservationID = item.coffeeReservationId,
                      !reservationID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      let reservation = item.reservation else { continue }
                let label: String
                let detail: String
                switch reservation.status {
                case "cancelled":
                    label = "Cancelled"; detail = "This coffee request was cancelled."
                case "declined":
                    label = "Declined"; detail = "The host declined this coffee request."
                case "expired":
                    label = "Expired"; detail = "This coffee request has expired."
                default:
                    if item.status == "cancelled" {
                        label = "Cancelled"; detail = "This coffee request was cancelled."
                    } else if item.status == "expired" {
                        label = "Expired"; detail = "This coffee request has expired."
                    } else if item.status == "declined" {
                        label = "Declined"; detail = "The host declined this coffee request."
                    } else if reservation.status == "pending",
                              let expiry = reservation.holdExpiresAt.flatMap(parseDate), expiry <= now {
                        label = "Expired"; detail = "The coffee request's hold window has expired."
                    } else if reservation.status == "pending" {
                        label = "Requested"; detail = "Coffee request sent · subject to host acceptance. No payment confirmation."
                    } else if reservation.status == "confirmed" || reservation.status == "accepted" {
                        // The backend may roll a confirmed hold up to booked;
                        // neither that flag nor Plan confirmation means paid.
                        label = "Requested"; detail = "The host accepted the coffee hold. This is not a paid booking confirmation."
                    } else {
                        label = "Status unavailable"; detail = "Open the Plan for coffee request details."
                    }
                }
                let result = NativeDiscoverTransaction(planID: plan.id, planTitle: plan.title,
                    reservationID: reservationID, statusLabel: label, detail: detail,
                    primaryTitle: label == "Requested" ? "View request" : "View details")
                // A historical expired/cancelled request must not hide a live
                // request against the same spot on another owned Plan.
                if label == "Requested" { return result }
                if fallback == nil { fallback = result }
            }
        }
        return fallback
    }

    private static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

/// Both surfaces observe this instance and refresh on appearance/Plan changes.
/// Nil transaction is NOT permission to acquire while loading, failed, or not
/// loaded. Parent UI must check those flags and the current account first.
@MainActor
final class NativeDiscoverTransactionStore: ObservableObject {
    static let shared = NativeDiscoverTransactionStore()

    @Published private(set) var userID: String?
    @Published private(set) var isLoading = false
    @Published private(set) var failed = false
    @Published private(set) var hasLoaded = false
    /// Credential-free task identity. Changes only after account invalidation,
    /// not during a request, so mounted surfaces reload without a refresh loop.
    @Published private(set) var accountRevision = UUID()
    @Published private var plans: [NativePlan] = []
    private var generation = UUID()

    func synchronize(userID: String?, forceReset: Bool = false) {
        guard forceReset || self.userID != userID else { return }
        generation = UUID()
        self.userID = userID
        plans = []
        isLoading = false
        failed = false
        hasLoaded = false
        accountRevision = UUID()
    }

    func refresh(userID: String?, api: NativePlanAPI) async {
        await refresh(userID: userID, load: { try await api.list() })
    }

    /// Injectable read-only seam; each refresh supersedes older requests,
    /// including A → B → A account changes and same-account invalidation.
    func refresh(userID: String?, load: () async throws -> [NativePlan]) async {
        // Only the auth owner may change the account. A queued refresh from a
        // dismissed surface must not switch this shared store back to an old user.
        guard !Task.isCancelled, self.userID == userID,
              let userID, !userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let requestGeneration = UUID()
        generation = requestGeneration
        isLoading = true
        failed = false
        hasLoaded = false
        do {
            let rows = try await load()
            guard generation == requestGeneration, self.userID == userID else { return }
            plans = rows.filter { $0.creatorUserId == userID }
            isLoading = false
            hasLoaded = true
        } catch {
            guard generation == requestGeneration, self.userID == userID else { return }
            plans = []
            isLoading = false
            failed = true
        }
    }

    func transaction(for offering: NativePlanBookableOffering, userID: String?) -> NativeDiscoverTransaction? {
        guard self.userID == userID else { return nil }
        return NativeDiscoverTransaction.transaction(for: offering, plans: plans, userID: userID)
    }
}
