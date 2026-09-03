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
        "view event", "view parking",
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
