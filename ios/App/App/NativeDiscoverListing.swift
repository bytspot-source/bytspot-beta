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
    static let settlementVerbs = ["book", "reserve", "buy", "pay", "checkout", "order"]

    static func isSettlementVerb(_ title: String) -> Bool {
        let lowered = title.lowercased()
        return settlementVerbs.contains { lowered.hasPrefix($0) || lowered.contains(" \($0)") }
    }

    /// Wording is not the whole promise. "Get Ticket" and "Join Guest List"
    /// carry no settlement verb yet commit to a transaction, so any CTA the
    /// catalog sells counts as a promise regardless of how it reads.
    static func promisesSettlement(_ title: String, catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared) -> Bool {
        if isSettlementVerb(title) { return true }
        guard let catalog else { return false }
        return catalog.templates.contains { template in
            template.cta.caseInsensitiveCompare(title) == .orderedSame
                && (template.canExecute(.book, in: .published) || template.canExecute(.reserve, in: .published))
        }
    }

    /// The SKU a rail would sell. Deterministic so two surfaces agree.
    static func skuTemplate(forRail rail: String, catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared) -> BookableTemplate? {
        guard let catalog else { return nil }
        return catalog.templates(forDiscoverCategory: rail).sorted { $0.id < $1.id }.first
    }

    static func fulfillment(
        control: String,
        rail: String,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> NativeDiscoverFulfillment {
        guard control == NativeDiscoverCardControl.vendor else { return .details }
        guard settlementReady, let template = skuTemplate(forRail: rail, catalog: catalog) else { return .request }
        let canSettle = template.canExecute(.book, in: .published) || template.canExecute(.reserve, in: .published)
        return canSettle ? .book : .request
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
        let state = fulfillment(control: control, rail: rail, settlementReady: settlementReady, catalog: catalog)
        guard state != .book, promisesSettlement(proposed, catalog: catalog) else { return proposed }
        return state == .details ? "Details" : "Request"
    }

    static func planHold(
        control: String,
        rail: String,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> NativeDiscoverPlanHold? {
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
        rail: String,
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
        rail: String,
        settlementReady: Bool = NativeDiscoverListing.settlementReady,
        catalog: BookableTemplateCatalog? = BookableTemplateCatalog.shared
    ) -> String {
        guard promisesSettlement(proposed, catalog: catalog) else { return proposed }
        guard planHold(for: plan, rail: rail, settlementReady: settlementReady, catalog: catalog) != nil else { return "Details" }
        return proposed
    }
}
