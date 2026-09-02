import Foundation

/// Canonical bookable SKU catalog. A bookable service is not a new core noun.
/// It is SKU + domain schema + capabilities. Webpage, Swift, and Kotlin decode
/// `contracts/bookable-templates.json` with default camelCase keys.
enum BookableCapabilityID: String, Codable, CaseIterable {
    case book = "BOOK"
    case reserve = "RESERVE"
    case rsvp = "RSVP"
    case buy = "BUY"
    case sell = "SELL"
    case pay = "PAY"
    case refund = "REFUND"
    case cancel = "CANCEL"
    case checkIn = "CHECK_IN"
    case verify = "VERIFY"
    case publish = "PUBLISH"
    case createHang = "CREATE_HANG"
    case invite = "INVITE"
    case share = "SHARE"
    case schedule = "SCHEDULE"
}

enum BookableSkuState: String, Codable, CaseIterable {
    case draft = "DRAFT"
    case published = "PUBLISHED"
    case reserved = "RESERVED"
    case confirmed = "CONFIRMED"
    case checkedIn = "CHECKED_IN"
    case completed = "COMPLETED"
    case cancelled = "CANCELLED"
    case noShow = "NO_SHOW"
}

/// The stable ontology. PASS is deliberately absent: it is issued by an action, not always true.
enum BookableNoun: String, Codable, CaseIterable {
    case pin = "PIN"
    case hang = "HANG"
    case host = "HOST"
    case room = "ROOM"
    case stay = "STAY"
    case stall = "STALL"
    case seller = "SELLER"
    case sku = "SKU"
    case person = "PERSON"
    case circle = "CIRCLE"
}

enum BookableDerivedObjectID: String, Codable, CaseIterable {
    case pass = "PASS"
}

/// Core nouns plus derived objects, for capability targets.
enum BookableObjectID: String, Codable, CaseIterable {
    case pin = "PIN"
    case hang = "HANG"
    case host = "HOST"
    case room = "ROOM"
    case stay = "STAY"
    case stall = "STALL"
    case seller = "SELLER"
    case sku = "SKU"
    case person = "PERSON"
    case circle = "CIRCLE"
    case pass = "PASS"
}

enum BookableActorRole: String, Codable, CaseIterable {
    case guest, host, buyer, seller, member, organizer, attendee, driver, customer
}

enum BookableDomainID: String, Codable, CaseIterable {
    case dining, nightlife, wellness, automotive, stay, stall, green
    case coffee, shopping, events, fitness
}

enum BookableServiceTier: String, Codable, CaseIterable {
    case black, platinum, green
}

/// What the ETA label actually means. One string used to carry all six.
enum BookableEtaKind: String, Codable, CaseIterable {
    case readiness, dispatch, hold, nextSlot, policy, none
}

struct BookableTiming: Codable, Equatable {
    let etaKind: BookableEtaKind
    let etaLabel: String
    let holdSecs: Int
}

struct BookableCapability: Codable, Equatable {
    let id: BookableCapabilityID
    let verb: String
    let appliesTo: [BookableObjectID]
}

struct BookableDerivedObject: Codable, Equatable, Identifiable {
    let id: BookableDerivedObjectID
    let label: String
    let issuedBy: [BookableCapabilityID]
    let issuedFrom: [BookableNoun]
    let consumedBy: [BookableCapabilityID]
    let states: [String]
}

/// An entity declares what it can do, so a capability check needs an actor.
struct BookableEntityCapabilities: Codable, Equatable {
    let entity: BookableNoun
    let capabilities: [BookableCapabilityID]
}

enum BookableStaffRoleID: String, Codable, CaseIterable {
    case owner
    case manager
    case staff
    case door
    case serviceProvider
}

enum BookableStaffScope: String, Codable, CaseIterable {
    case all
    case assigned
}

/// A seat in a business. Always a capability subset of SELLER, never a superset.
struct BookableStaffRole: Codable, Equatable, Identifiable {
    let id: BookableStaffRoleID
    let label: String
    let summary: String
    let scope: BookableStaffScope
    let capabilities: [BookableCapabilityID]
}

enum BookableSellerState: String, Codable, CaseIterable {
    case draft = "DRAFT"
    case pending = "PENDING"
    case active = "ACTIVE"
    case suspended = "SUSPENDED"
    case closed = "CLOSED"
}

enum BookableSellerOperationID: String, Codable, CaseIterable {
    case submit = "SUBMIT_SELLER"
    case withdraw = "WITHDRAW_SELLER"
    case close = "CLOSE_SELLER"
    case approve = "APPROVE_SELLER"
    case suspend = "SUSPEND_SELLER"
    case reinstate = "REINSTATE_SELLER"
}

enum BookableSellerActor: String, Codable, CaseIterable {
    case seller, platform
}

enum BookableSeatState: String, Codable, CaseIterable {
    case invited = "INVITED"
    case active = "ACTIVE"
    case suspended = "SUSPENDED"
    case revoked = "REVOKED"
}

enum BookableSeatOperationID: String, Codable, CaseIterable {
    case invite = "INVITE_SEAT"
    case accept = "ACCEPT_SEAT"
    case suspend = "SUSPEND_SEAT"
    case restore = "RESTORE_SEAT"
    case revoke = "REVOKE_SEAT"
}

/// Some transitions belong to the business, some only to the platform.
struct BookableSellerOperation: Codable, Equatable, Identifiable {
    let id: BookableSellerOperationID
    let label: String
    let actor: BookableSellerActor
    let requiresRole: BookableStaffRoleID?
    let from: [BookableSellerState]
    let to: BookableSellerState
}

struct BookableSellerTransition: Codable, Equatable {
    let from: BookableSellerState
    let to: [BookableSellerState]
}

/// The ceiling a seller's own state puts on every seat inside it.
struct BookableSellerStateCapabilities: Codable, Equatable {
    let state: BookableSellerState
    let allows: [BookableCapabilityID]
}

struct BookableSellerRequirement: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    let blocks: BookableSellerState
}

struct BookableSeatOperation: Codable, Equatable, Identifiable {
    let id: BookableSeatOperationID
    let label: String
    let from: [BookableSeatState]
    let to: BookableSeatState
    let actor: String?
}

struct BookableSeatTransition: Codable, Equatable {
    let from: BookableSeatState
    let to: [BookableSeatState]
}

struct BookableSellerIdentity: Codable, Equatable {
    let states: [BookableSellerState]
    let transitions: [BookableSellerTransition]
    let terminalStates: [BookableSellerState]
    let publishableStates: [BookableSellerState]
    let consoleStates: [BookableSellerState]
    let stateCapabilities: [BookableSellerStateCapabilities]
    let requirements: [BookableSellerRequirement]
    let operations: [BookableSellerOperation]
}

struct BookableSeats: Codable, Equatable {
    let grantsFrom: String
    let states: [BookableSeatState]
    let transitions: [BookableSeatTransition]
    let terminalStates: [BookableSeatState]
    let grantingStates: [BookableSeatState]
    let soleRole: BookableStaffRoleID
    let unrevocableRole: BookableStaffRoleID
    let scopedFields: [String]
    let operations: [BookableSeatOperation]
    let inviteExpiryHours: Int
}

/// SELLER's lifecycle and its seats. A seat never exceeds the business it works
/// for, so a suspended seller silences every seat inside it without any role
/// being edited.
struct BookableSeller: Codable, Equatable {
    let noun: BookableNoun
    let identity: BookableSellerIdentity
    let seats: BookableSeats
}

struct BookableSkuTransition: Codable, Equatable {
    let from: BookableSkuState
    let to: [BookableSkuState]
}

enum BookableSlotState: String, Codable, CaseIterable {
    case closed = "CLOSED"
    case open = "OPEN"
    case full = "FULL"
    case blocked = "BLOCKED"
    case passed = "PASSED"
}

/// Separated from slotMinutes for the same reason etaKind was split off the ETA
/// string: a nightly stay, a rolling table and a fixed door time are three
/// different shapes, not one number.
enum BookableSlotKind: String, Codable, CaseIterable {
    case rolling, daily, fixed
}

enum BookableRecurrenceKind: String, Codable, CaseIterable {
    case weekly, dateRange, oneOff
}

enum BookableAvailabilityOperationID: String, Codable, CaseIterable {
    case openSlot = "OPEN_SLOT"
    case closeSlot = "CLOSE_SLOT"
    case blockSlot = "BLOCK_SLOT"
    case setQuantity = "SET_QUANTITY"
    case release = "RELEASE"
}

struct BookableAvailabilityOperation: Codable, Equatable, Identifiable {
    let id: BookableAvailabilityOperationID
    let label: String
    let requiresCapability: BookableCapabilityID
    let from: [BookableSlotState]
    let to: BookableSlotState?
}

struct BookableSlotTransition: Codable, Equatable {
    let from: BookableSlotState
    let to: [BookableSlotState]
}

struct BookableAvailabilityDefaults: Codable, Equatable {
    let slotKind: BookableSlotKind
    let slotMinutes: Int
    let leadTimeMins: Int
    let horizonDays: Int
    let maxQuantityPerSlot: Int
}

struct BookableAvailabilityDomainDefaults: Codable, Equatable {
    let domain: BookableDomainID
    let slotKind: BookableSlotKind
    let slotMinutes: Int
    let leadTimeMins: Int
    let horizonDays: Int
}

/// The printer's multiplier. A slot is not a SKU and never holds a booking; it
/// holds the capacity that SKUs are printed from.
struct BookableAvailability: Codable, Equatable {
    let recurrenceKinds: [BookableRecurrenceKind]
    let slotKinds: [BookableSlotKind]
    let slotStates: [BookableSlotState]
    let slotTransitions: [BookableSlotTransition]
    let operations: [BookableAvailabilityOperation]
    let blockReasons: [String]
    let defaults: BookableAvailabilityDefaults
    let domainDefaults: [BookableAvailabilityDomainDefaults]
}

enum BookableLocationKindID: String, Codable, CaseIterable {
    case fixed, zone, mobile, visiting
}

enum BookableFulfillment: String, Codable, CaseIterable {
    case guestTravels, vendorTravels
}

enum BookableLocationState: String, Codable, CaseIterable {
    case draft = "DRAFT"
    case active = "ACTIVE"
    case paused = "PAUSED"
    case closed = "CLOSED"
}

enum BookableLocationOperationID: String, Codable, CaseIterable {
    case activate = "ACTIVATE_LOCATION"
    case pause = "PAUSE_LOCATION"
    case close = "CLOSE_LOCATION"
}

struct BookableLocationKind: Codable, Equatable, Identifiable {
    let id: BookableLocationKindID
    let label: String
    let question: String
    let fulfillment: BookableFulfillment
    let requiresAddress: Bool
    let requiresRadius: Bool
}

struct BookableLocationOperation: Codable, Equatable, Identifiable {
    let id: BookableLocationOperationID
    let label: String
    let requiresCapability: BookableCapabilityID
    let from: [BookableLocationState]
    let to: BookableLocationState
}

struct BookableLocationTransition: Codable, Equatable {
    let from: BookableLocationState
    let to: [BookableLocationState]
}

struct BookableEtaKindFulfillment: Codable, Equatable {
    let etaKind: BookableEtaKind
    /// "any" when the ETA shape says nothing about who travels.
    let requires: String
}

struct BookableLocationDefaults: Codable, Equatable {
    let kind: BookableLocationKindID
    let radiusMiles: Int
    let maxRadiusMiles: Int
}

struct BookableDomainLocationKinds: Codable, Equatable {
    let domain: BookableDomainID
    let kinds: [BookableLocationKindID]
}

/// A Location is not a new core noun. It is a PIN a SELLER holds, and its kind
/// decides who travels, which is what etaKind was already describing from the
/// other end.
struct BookableLocations: Codable, Equatable {
    let derivesFrom: BookableNoun
    let heldBy: BookableNoun
    let kinds: [BookableLocationKind]
    let fulfillments: [BookableFulfillment]
    let states: [BookableLocationState]
    let transitions: [BookableLocationTransition]
    let publishableStates: [BookableLocationState]
    let operations: [BookableLocationOperation]
    let etaKindFulfillment: [BookableEtaKindFulfillment]
    let defaults: BookableLocationDefaults
    let domainKinds: [BookableDomainLocationKinds]
}

enum BookableDemandState: String, Codable, CaseIterable {
    case open = "OPEN"
    case matched = "MATCHED"
    case offered = "OFFERED"
    case booked = "BOOKED"
    case expired = "EXPIRED"
    case withdrawn = "WITHDRAWN"
}

enum BookableDemandOperationID: String, Codable, CaseIterable {
    case offer = "OFFER"
    case withdrawOffer = "WITHDRAW_OFFER"
    case decline = "DECLINE"
}

enum BookableMatchRuleID: String, Codable, CaseIterable {
    case category, location, party, budget, capacity
}

struct BookableDemandOperation: Codable, Equatable, Identifiable {
    let id: BookableDemandOperationID
    let label: String
    let requiresCapability: BookableCapabilityID
    let from: [BookableDemandState]
    let to: BookableDemandState
}

struct BookableDemandTransition: Codable, Equatable {
    let from: BookableDemandState
    let to: [BookableDemandState]
}

struct BookableMatchRule: Codable, Equatable, Identifiable {
    let id: BookableMatchRuleID
    let label: String
    let missReason: String
}

struct BookableDemandDefaults: Codable, Equatable {
    let expiryMins: Int
    let flexibilityMins: Int
    let radiusMiles: Int
    let maxRadiusMiles: Int
    let maxPartySize: Int
}

/// The other half of the printer. A need stays unresolved until real capacity
/// can absorb it, so a match must name the slot that would fill it.
struct BookableDemand: Codable, Equatable {
    let raisedBy: BookableNoun
    let answeredBy: BookableNoun
    let resolvesTo: BookableNoun
    let states: [BookableDemandState]
    let transitions: [BookableDemandTransition]
    let terminalStates: [BookableDemandState]
    let actionableStates: [BookableDemandState]
    let operations: [BookableDemandOperation]
    let matchRules: [BookableMatchRule]
    let defaults: BookableDemandDefaults
}

/// One slot's worth of capacity. Committed counts RESERVED plus CONFIRMED SKUs.
struct BookableSlotCapacity: Equatable {
    var quantity: Int
    var committed: Int
    var blocked: Bool = false
    var closed: Bool = false
    var startsAt: Date?

    /// An expiring hold lowers committed, which is what returns capacity
    /// instead of stranding it.
    var remaining: Int { max(0, quantity - committed) }

    /// Quantity can be raised freely but never below what is already sold.
    var minimumQuantity: Int { committed }
}

struct BookableDomain: Codable, Equatable, Identifiable {
    let id: BookableDomainID
    let label: String
    let noun: BookableNoun
    let variants: [String]
}

/// The consumer lens over the same inventory the vendor publishes. A category
/// is not the product: the SKU underneath it is. Categories are keyed by the
/// CardType ids the Discover rail already ships with.
struct BookableDiscoverCategory: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    let emoji: String
    let icon: String
    let domains: [BookableDomainID]
    let cta: String
    let minimumFeedCount: Int
    let vendorGated: Bool?
}

struct BookableTemplate: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let hook: String
    let domain: BookableDomainID
    let schema: String
    let noun: BookableNoun
    let tier: BookableServiceTier
    let category: String
    let clipCategory: String
    let discoverType: String
    let title: String
    let description: String
    let tagline: String
    let timing: BookableTiming
    let includedHighlights: [String]
    let priceCents: Int
    let durationMins: Int
    let maxGuests: Int
    let patchRequired: Bool
    let cta: String
    let icon: String
    let capabilities: [BookableCapabilityID]
    let actionables: [String]
}

struct BookableNativeHints: Codable, Equatable {
    let swiftType: String
    let kotlinType: String
    let decodeKeyStrategy: String
    let bundlePath: String
}

struct BookableTemplateCatalog: Codable, Equatable {
    let id: String
    let version: Int
    let native: BookableNativeHints
    let principle: String
    let coreNouns: [BookableNoun]
    let derivedObjects: [BookableDerivedObject]
    let capabilities: [BookableCapability]
    let actorRoles: [BookableActorRole]
    let entityCapabilities: [BookableEntityCapabilities]
    let staffRoles: [BookableStaffRole]
    let seller: BookableSeller
    let skuStates: [BookableSkuState]
    let skuTransitions: [BookableSkuTransition]
    let hangStates: [String]
    let tierCategories: [String: [String]]
    let tierFloors: [String: Int]
    let etaKinds: [BookableEtaKind]
    let domains: [BookableDomain]
    let discoverCategories: [BookableDiscoverCategory]
    let availability: BookableAvailability
    let locations: BookableLocations
    let demand: BookableDemand
    let templates: [BookableTemplate]
}

enum BookableTemplateCatalogError: Error, Equatable {
    case missingResource
    case invalidNativeHints
}

extension BookableTemplateCatalog {
    static let resourceName = "bookable-templates"

    static func load(from bundle: Bundle = .main) throws -> BookableTemplateCatalog {
        guard let url = bundle.url(forResource: resourceName, withExtension: "json") else {
            throw BookableTemplateCatalogError.missingResource
        }
        return try decode(from: Data(contentsOf: url))
    }

    /// Loaded once from the app bundle. The catalog ships as a bundled
    /// resource, so a nil here is a build problem rather than a runtime state;
    /// callers degrade instead of crashing.
    static let shared: BookableTemplateCatalog? = try? load()

    static func decode(from data: Data) throws -> BookableTemplateCatalog {
        let catalog = try JSONDecoder().decode(BookableTemplateCatalog.self, from: data)
        guard catalog.id == "bytspot.bookable-templates",
              catalog.native.swiftType == "BookableTemplateCatalog",
              catalog.native.kotlinType == "BookableTemplateCatalog",
              catalog.native.decodeKeyStrategy == "useDefaultKeys" else {
            throw BookableTemplateCatalogError.invalidNativeHints
        }
        return catalog
    }

    func template(id: String) -> BookableTemplate? {
        templates.first { $0.id == id }
    }

    func templates(in domain: BookableDomainID) -> [BookableTemplate] {
        templates.filter { $0.domain == domain }
    }

    func derivedObject(id: BookableDerivedObjectID) -> BookableDerivedObject? {
        derivedObjects.first { $0.id == id }
    }

    func capabilities(for entity: BookableNoun) -> [BookableCapabilityID] {
        entityCapabilities.first { $0.entity == entity }?.capabilities ?? []
    }

    /// Whether the ontology entity is permitted this capability at all.
    func entityCanExecute(_ entity: BookableNoun, _ capability: BookableCapabilityID) -> Bool {
        capabilities(for: entity).contains(capability)
    }

    /// ACTOR -> ACTION -> TARGET -> CAPABILITY. The actor must be permitted the
    /// capability and the SKU must be in a state that allows it, so a PERSON can
    /// never PUBLISH and a SELLER can never RSVP.
    func canActorExecute(
        _ actor: BookableNoun,
        _ capability: BookableCapabilityID,
        in state: BookableSkuState,
        declared: [BookableCapabilityID]
    ) -> Bool {
        guard entityCanExecute(actor, capability) else { return false }
        return BookableTemplate.canExecute(capability, in: state, declared: declared)
    }

    func visibleDiscoverCategories(includeVendorGated: Bool = false) -> [BookableDiscoverCategory] {
        // Vendor-gated rails are hidden from a consumer-only build.
        includeVendorGated ? discoverCategories : discoverCategories.filter { $0.vendorGated != true }
    }

    func discoverCategory(id: String) -> BookableDiscoverCategory? {
        discoverCategories.first { $0.id == id }
    }

    /// What a consumer can actually book after tapping a rail.
    func templates(forDiscoverCategory id: String) -> [BookableTemplate] {
        templates.filter { $0.discoverType == id }
    }

    /// The rail a published SKU surfaces in, so supply and demand stay reversible.
    func discoverCategory(forTemplate templateID: String) -> BookableDiscoverCategory? {
        guard let template = template(id: templateID) else { return nil }
        return discoverCategory(id: template.discoverType)
    }

    func discoverCategories(forDomain domain: BookableDomainID) -> [BookableDiscoverCategory] {
        discoverCategories.filter { $0.domains.contains(domain) }
    }

    /// A Bookable inherits its shape from its domain unless the vendor overrides it.
    func availabilityDefaults(for domain: BookableDomainID) -> BookableAvailabilityDefaults {
        guard let override = availability.domainDefaults.first(where: { $0.domain == domain }) else {
            return availability.defaults
        }
        return BookableAvailabilityDefaults(
            slotKind: override.slotKind,
            slotMinutes: override.slotMinutes,
            leadTimeMins: override.leadTimeMins,
            horizonDays: override.horizonDays,
            maxQuantityPerSlot: availability.defaults.maxQuantityPerSlot
        )
    }

    /// Slot state is derived, never stored, so capacity and state can never
    /// disagree. Blocked outranks full because a vendor closing a slot has to
    /// win over demand.
    func resolveSlotState(_ slot: BookableSlotCapacity, now: Date = Date()) -> BookableSlotState {
        if let startsAt = slot.startsAt, startsAt <= now { return .passed }
        if slot.blocked { return .blocked }
        if slot.closed { return .closed }
        return slot.remaining > 0 ? .open : .full
    }

    /// The oversell guard. Capacity is all that stands between a vendor and a
    /// double booking.
    func canCommit(to slot: BookableSlotCapacity, now: Date = Date()) -> Bool {
        resolveSlotState(slot, now: now) == .open
    }

    func canSetQuantity(_ slot: BookableSlotCapacity, to next: Int) -> Bool {
        guard next >= 0, next <= availability.defaults.maxQuantityPerSlot else { return false }
        return next >= slot.minimumQuantity
    }

    func availabilityOperation(id: BookableAvailabilityOperationID) -> BookableAvailabilityOperation? {
        availability.operations.first { $0.id == id }
    }

    /// A vendor operation needs the seat to hold the capability and the slot to
    /// be in a state the operation accepts, the same two-part check the SKU
    /// machine uses.
    func canRunAvailabilityOperation(
        _ role: BookableStaffRoleID,
        _ id: BookableAvailabilityOperationID,
        in state: BookableSlotState
    ) -> Bool {
        guard let operation = availabilityOperation(id: id) else { return false }
        guard staffRoleCan(role, operation.requiresCapability) else { return false }
        return operation.from.contains(state)
    }

    func locationKind(id: BookableLocationKindID) -> BookableLocationKind? {
        locations.kinds.first { $0.id == id }
    }

    /// The first kind is the default the wizard offers.
    func locationKinds(for domain: BookableDomainID) -> [BookableLocationKind] {
        let ids = locations.domainKinds.first { $0.domain == domain }?.kinds ?? [locations.defaults.kind]
        return ids.compactMap { locationKind(id: $0) }
    }

    /// Who travels is a property of the location, not of the domain.
    func fulfillment(for kind: BookableLocationKindID) -> BookableFulfillment? {
        locationKind(id: kind)?.fulfillment
    }

    /// The cross-check that keeps timing and geography honest: a dispatch ETA is
    /// only meaningful when the vendor is the one moving.
    func etaKindAllows(_ etaKind: BookableEtaKind, _ fulfillment: BookableFulfillment) -> Bool {
        guard let row = locations.etaKindFulfillment.first(where: { $0.etaKind == etaKind }) else { return false }
        return row.requires == "any" || row.requires == fulfillment.rawValue
    }

    /// Inventory cannot be published from a location that is not live.
    func locationCanPublish(_ state: BookableLocationState) -> Bool {
        locations.publishableStates.contains(state)
    }

    func canRunLocationOperation(
        _ role: BookableStaffRoleID,
        _ id: BookableLocationOperationID,
        in state: BookableLocationState
    ) -> Bool {
        guard let operation = locations.operations.first(where: { $0.id == id }) else { return false }
        guard staffRoleCan(role, operation.requiresCapability) else { return false }
        return operation.from.contains(state)
    }

    func isDemandActionable(_ state: BookableDemandState) -> Bool {
        demand.actionableStates.contains(state)
    }

    func canRunDemandOperation(
        _ role: BookableStaffRoleID,
        _ id: BookableDemandOperationID,
        in state: BookableDemandState
    ) -> Bool {
        guard let operation = demand.operations.first(where: { $0.id == id }) else { return false }
        guard staffRoleCan(role, operation.requiresCapability) else { return false }
        return operation.from.contains(state)
    }

    func matchRule(id: BookableMatchRuleID) -> BookableMatchRule? {
        demand.matchRules.first { $0.id == id }
    }

    func staffRole(id: BookableStaffRoleID) -> BookableStaffRole? {
        staffRoles.first { $0.id == id }
    }

    /// Whether the seat is permitted this capability at all.
    func staffRoleCan(_ role: BookableStaffRoleID, _ capability: BookableCapabilityID) -> Bool {
        staffRole(id: role)?.capabilities.contains(capability) ?? false
    }

    /// The ceiling the business puts on every seat inside it. A suspended seller
    /// still honours what it sold, so CHECK_IN and REFUND survive while SELL does not.
    func sellerStateAllows(_ state: BookableSellerState, _ capability: BookableCapabilityID) -> Bool {
        seller.identity.stateCapabilities.first { $0.state == state }?.allows.contains(capability) ?? false
    }

    func sellerCanPublish(_ state: BookableSellerState) -> Bool {
        seller.identity.publishableStates.contains(state)
    }

    /// A closed business has no console to sign into.
    func sellerCanUseConsole(_ state: BookableSellerState) -> Bool {
        seller.identity.consoleStates.contains(state)
    }

    /// Only an ACTIVE seat grants anything; an unaccepted invite carries nothing.
    func seatGrants(_ state: BookableSeatState) -> Bool {
        seller.seats.grantingStates.contains(state)
    }

    /// A seat's real capability set: the role, narrowed by whatever the business's
    /// own state still permits, and empty unless the seat itself is granting.
    func effectiveSeatCapabilities(
        role: BookableStaffRoleID,
        seat: BookableSeatState,
        seller sellerState: BookableSellerState
    ) -> [BookableCapabilityID] {
        guard seatGrants(seat) else { return [] }
        return (staffRole(id: role)?.capabilities ?? []).filter { sellerStateAllows(sellerState, $0) }
    }

    /// Two conditions, and both are load-bearing. Granting is an act of the
    /// business, which is what SELL already means for locations and demand, so a
    /// shift lead cannot hire. And nobody can hand out a seat equal to or greater
    /// than their own, so a manager can never mint an owner.
    func canGrantStaffRole(_ granter: BookableStaffRoleID, _ target: BookableStaffRoleID) -> Bool {
        guard let mine = staffRole(id: granter)?.capabilities,
              let theirs = staffRole(id: target)?.capabilities else { return false }
        guard mine.contains(.sell) else { return false }
        guard theirs.count < mine.count else { return false }
        return theirs.allSatisfy { mine.contains($0) }
    }

    func grantableStaffRoles(_ granter: BookableStaffRoleID) -> [BookableStaffRoleID] {
        staffRoles.map(\.id).filter { canGrantStaffRole(granter, $0) }
    }

    /// Seat management is a two-part check like every other operation: the granter
    /// must outrank the target, then the seat's own state must allow the move.
    func canRunSeatOperation(
        granter: BookableStaffRoleID,
        target: BookableStaffRoleID,
        operation id: BookableSeatOperationID,
        state: BookableSeatState?
    ) -> Bool {
        guard let operation = seller.seats.operations.first(where: { $0.id == id }) else { return false }
        guard canGrantStaffRole(granter, target) else { return false }
        // The owner seat cannot be removed, because that orphans every SKU it printed.
        if id == .revoke, target == seller.seats.unrevocableRole { return false }
        if id == .invite { return state == nil }
        guard let state else { return false }
        return operation.from.contains(state)
    }

    func canRunSellerOperation(
        _ role: BookableStaffRoleID,
        _ id: BookableSellerOperationID,
        in state: BookableSellerState
    ) -> Bool {
        guard let operation = seller.identity.operations.first(where: { $0.id == id }) else { return false }
        // A platform transition is never reachable from a vendor seat.
        guard operation.actor == .seller else { return false }
        if let required = operation.requiresRole, required != role { return false }
        return operation.from.contains(state)
    }

    /// What is still missing before the business can reach a given state.
    func unmetSellerRequirements(
        _ target: BookableSellerState,
        satisfied: Set<String>
    ) -> [BookableSellerRequirement] {
        seller.identity.requirements.filter { $0.blocks == target && !satisfied.contains($0.id) }
    }

    /// A seat acts on behalf of the business, so both must be permitted and the
    /// SKU state must still allow it. The door can verify a pass but can never
    /// refund, and no seat can outrank the SELLER it works for.
    func canStaffExecute(
        _ role: BookableStaffRoleID,
        _ capability: BookableCapabilityID,
        in state: BookableSkuState,
        declared: [BookableCapabilityID]
    ) -> Bool {
        guard staffRoleCan(role, capability) else { return false }
        return canActorExecute(.seller, capability, in: state, declared: declared)
    }

    func floorCents(for tier: BookableServiceTier) -> Int {
        tierFloors[tier.rawValue] ?? 0
    }

    /// Highest floor first, so the price ladder reads black -> platinum -> green.
    var tiersByFloorDescending: [BookableServiceTier] {
        BookableServiceTier.allCases.sorted { floorCents(for: $0) > floorCents(for: $1) }
    }

    /// Tiers that own this category. Price alone is not a classifier: a $12 Parking
    /// stall is Platinum because Platinum owns Parking, not because it is cheap.
    func tierCandidates(category: String?) -> [BookableServiceTier] {
        let needle = (category ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let ladder = tiersByFloorDescending
        guard !needle.isEmpty else { return ladder }
        let owners = ladder.filter { tier in
            (tierCategories[tier.rawValue] ?? []).contains { $0.lowercased() == needle }
        }
        return owners.isEmpty ? ladder : owners
    }

    /// Resolve a tier from an explicit value, else category ownership, else the price
    /// ladder restricted to the categories' owning tiers.
    func resolveTier(declared: String?, priceCents: Int, category: String?) -> BookableServiceTier {
        if let declared, let tier = BookableServiceTier(rawValue: declared) { return tier }
        let candidates = tierCandidates(category: category)
        if let matched = candidates.first(where: { priceCents >= floorCents(for: $0) }) { return matched }
        return candidates.last ?? .green
    }
}

extension BookableTemplate {
    var formEtaLabel: String { tier == .green ? "" : timing.etaLabel }

    /// nil when the template holds no inventory, so there is nothing to expire.
    func holdExpiresAt(reservedAt: Date) -> Date? {
        guard timing.holdSecs > 0 else { return nil }
        return reservedAt.addingTimeInterval(TimeInterval(timing.holdSecs))
    }

    /// An expired hold returns the SKU to PUBLISHED, not CANCELLED.
    func holdState(reservedAt: Date, now: Date) -> BookableSkuState {
        guard let expiresAt = holdExpiresAt(reservedAt: reservedAt) else { return .reserved }
        return now >= expiresAt ? .published : .reserved
    }

    var priceDollars: String {
        String(format: "%.2f", Double(priceCents) / 100.0)
    }

    /// ClipLocalService-shaped projection. Same field names the App Clip already renders.
    func clipLocalService() -> (id: String, title: String, subtitle: String, action: String, iconName: String, tintName: String, priceLabel: String, amountCents: Int, currency: String, source: String, category: String, activityHighlights: [String]) {
        let tint = tier == .black ? "gold" : tier == .green ? "emerald" : "cyan"
        let dollars = Double(priceCents) / 100.0
        return (
            id: id,
            title: title,
            subtitle: tagline,
            action: cta,
            iconName: icon,
            tintName: tint,
            priceLabel: String(format: "From $%.0f", dollars),
            amountCents: priceCents,
            currency: "USD",
            source: "curated",
            category: clipCategory,
            activityHighlights: includedHighlights
        )
    }

    func canExecute(_ capability: BookableCapabilityID, in state: BookableSkuState) -> Bool {
        BookableTemplate.canExecute(capability, in: state, declared: capabilities)
    }

    static func canExecute(_ capability: BookableCapabilityID, in state: BookableSkuState, declared: [BookableCapabilityID]) -> Bool {
        guard declared.contains(capability) else { return false }
        if state == .cancelled || state == .completed || state == .noShow { return false }
        switch capability {
        case .publish: return state == .draft
        case .reserve, .rsvp: return state == .published
        case .book, .pay, .buy: return state == .published || state == .reserved
        case .checkIn, .verify: return state == .confirmed
        case .cancel, .refund: return state == .published || state == .reserved || state == .confirmed || state == .checkedIn
        case .invite, .share, .schedule: return state == .published || state == .reserved || state == .confirmed
        case .sell, .createHang: return false
        }
    }
}
