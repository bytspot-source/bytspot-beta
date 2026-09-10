import Foundation

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

/// Browse capability, deliberately separate from the legacy fulfillment policy.
/// A capability is not a booking, a hold, or a confirmation.
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
                case (.party, "book"): resolved = .book
                case (.party, "request"), (.coffeeSpot, "request"): resolved = .request
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
        case .book: return "Bookable"
        case .request: return "Request"
        case .redirect: return "External"
        case .details: return "Reference"
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
        case .details: return "Availability unconfirmed"
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
