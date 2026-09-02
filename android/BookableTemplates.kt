package com.bytspot.bookable

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Canonical bookable SKU catalog. A bookable service is not a new core noun.
 * It is SKU + domain schema + capabilities. Webpage, Swift, and Kotlin decode
 * `contracts/bookable-templates.json` with default camelCase keys.
 */
@Serializable
enum class BookableCapabilityID {
    BOOK, RESERVE, RSVP, BUY, SELL, PAY, REFUND, CANCEL, CHECK_IN, VERIFY, PUBLISH, CREATE_HANG, INVITE, SHARE, SCHEDULE
}

@Serializable
enum class BookableSkuState {
    DRAFT, PUBLISHED, RESERVED, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW
}

/** The stable ontology. PASS is deliberately absent: it is issued by an action, not always true. */
@Serializable
enum class BookableNoun {
    PIN, HANG, HOST, ROOM, STAY, STALL, SELLER, SKU, PERSON, CIRCLE
}

@Serializable
enum class BookableDerivedObjectID {
    PASS
}

/** Core nouns plus derived objects, for capability targets. */
@Serializable
enum class BookableObjectID {
    PIN, HANG, HOST, ROOM, STAY, STALL, SELLER, SKU, PERSON, CIRCLE, PASS
}

@Serializable
enum class BookableActorRole {
    guest, host, buyer, seller, member, organizer, attendee, driver, customer
}

@Serializable
enum class BookableDomainID {
    dining, nightlife, wellness, automotive, stay, stall, green,
    coffee, shopping, events, fitness
}

@Serializable
enum class BookableServiceTier {
    black, platinum, green
}

/** What the ETA label actually means. One string used to carry all six. */
@Serializable
enum class BookableEtaKind {
    readiness, dispatch, hold, nextSlot, policy, none
}

@Serializable
data class BookableTiming(
    val etaKind: BookableEtaKind,
    val etaLabel: String,
    val holdSecs: Int,
)

@Serializable
data class BookableCapability(
    val id: BookableCapabilityID,
    val verb: String,
    val appliesTo: List<BookableObjectID>,
)

@Serializable
data class BookableDerivedObject(
    val id: BookableDerivedObjectID,
    val label: String,
    val issuedBy: List<BookableCapabilityID>,
    val issuedFrom: List<BookableNoun>,
    val consumedBy: List<BookableCapabilityID>,
    val states: List<String>,
)

/** An entity declares what it can do, so a capability check needs an actor. */
@Serializable
data class BookableEntityCapabilities(
    val entity: BookableNoun,
    val capabilities: List<BookableCapabilityID>,
)

@Serializable
enum class BookableStaffRoleID {
    owner, manager, staff, door, serviceProvider
}

@Serializable
enum class BookableStaffScope {
    all, assigned
}

/** A seat in a business. Always a capability subset of SELLER, never a superset. */
@Serializable
data class BookableStaffRole(
    val id: BookableStaffRoleID,
    val label: String,
    val summary: String,
    val scope: BookableStaffScope,
    val capabilities: List<BookableCapabilityID>,
)

@Serializable
data class BookableSkuTransition(
    val from: BookableSkuState,
    val to: List<BookableSkuState>,
)

@Serializable
/**
 * The consumer lens over the same inventory the vendor publishes. A category is
 * not the product: the SKU underneath it is. Categories are keyed by the
 * CardType ids the Discover rail already ships with.
 */
@Serializable
data class BookableDiscoverCategory(
    val id: String,
    val label: String,
    val emoji: String,
    val icon: String,
    val domains: List<BookableDomainID>,
    val cta: String,
    val minimumFeedCount: Int,
    val vendorGated: Boolean? = null,
)

@Serializable
enum class BookableSlotState {
    CLOSED, OPEN, FULL, BLOCKED, PASSED
}

/**
 * Separated from slotMinutes for the same reason etaKind was split off the ETA
 * string: a nightly stay, a rolling table and a fixed door time are three
 * different shapes, not one number.
 */
@Serializable
enum class BookableSlotKind {
    rolling, daily, fixed
}

@Serializable
enum class BookableRecurrenceKind {
    weekly, dateRange, oneOff
}

@Serializable
enum class BookableAvailabilityOperationID {
    OPEN_SLOT, CLOSE_SLOT, BLOCK_SLOT, SET_QUANTITY, RELEASE
}

@Serializable
data class BookableAvailabilityOperation(
    val id: BookableAvailabilityOperationID,
    val label: String,
    val requiresCapability: BookableCapabilityID,
    val from: List<BookableSlotState>,
    val to: BookableSlotState? = null,
)

@Serializable
data class BookableSlotTransition(
    val from: BookableSlotState,
    val to: List<BookableSlotState>,
)

@Serializable
data class BookableAvailabilityDefaults(
    val slotKind: BookableSlotKind,
    val slotMinutes: Int,
    val leadTimeMins: Int,
    val horizonDays: Int,
    val maxQuantityPerSlot: Int,
)

@Serializable
data class BookableAvailabilityDomainDefaults(
    val domain: BookableDomainID,
    val slotKind: BookableSlotKind,
    val slotMinutes: Int,
    val leadTimeMins: Int,
    val horizonDays: Int,
)

/**
 * The printer's multiplier. A slot is not a SKU and never holds a booking; it
 * holds the capacity that SKUs are printed from.
 */
@Serializable
data class BookableAvailability(
    val recurrenceKinds: List<BookableRecurrenceKind>,
    val slotKinds: List<BookableSlotKind>,
    val slotStates: List<BookableSlotState>,
    val slotTransitions: List<BookableSlotTransition>,
    val operations: List<BookableAvailabilityOperation>,
    val blockReasons: List<String>,
    val defaults: BookableAvailabilityDefaults,
    val domainDefaults: List<BookableAvailabilityDomainDefaults>,
)

@Serializable
enum class BookableSellerState {
    DRAFT, PENDING, ACTIVE, SUSPENDED, CLOSED
}

@Serializable
enum class BookableSellerOperationID {
    SUBMIT_SELLER, WITHDRAW_SELLER, CLOSE_SELLER, APPROVE_SELLER, SUSPEND_SELLER, REINSTATE_SELLER
}

@Serializable
enum class BookableSellerActor {
    seller, platform
}

@Serializable
enum class BookableSeatState {
    INVITED, ACTIVE, SUSPENDED, REVOKED
}

@Serializable
enum class BookableSeatOperationID {
    INVITE_SEAT, ACCEPT_SEAT, SUSPEND_SEAT, RESTORE_SEAT, REVOKE_SEAT
}

/** Some transitions belong to the business, some only to the platform. */
@Serializable
data class BookableSellerOperation(
    val id: BookableSellerOperationID,
    val label: String,
    val actor: BookableSellerActor,
    val requiresRole: BookableStaffRoleID? = null,
    val from: List<BookableSellerState>,
    val to: BookableSellerState,
)

@Serializable
data class BookableSellerTransition(
    val from: BookableSellerState,
    val to: List<BookableSellerState>,
)

/** The ceiling a seller's own state puts on every seat inside it. */
@Serializable
data class BookableSellerStateCapabilities(
    val state: BookableSellerState,
    val allows: List<BookableCapabilityID>,
)

@Serializable
data class BookableSellerRequirement(
    val id: String,
    val label: String,
    val blocks: BookableSellerState,
)

@Serializable
data class BookableSeatOperation(
    val id: BookableSeatOperationID,
    val label: String,
    val from: List<BookableSeatState>,
    val to: BookableSeatState,
    val actor: String? = null,
)

@Serializable
data class BookableSeatTransition(
    val from: BookableSeatState,
    val to: List<BookableSeatState>,
)

@Serializable
data class BookableSellerIdentity(
    val states: List<BookableSellerState>,
    val transitions: List<BookableSellerTransition>,
    val terminalStates: List<BookableSellerState>,
    val publishableStates: List<BookableSellerState>,
    val consoleStates: List<BookableSellerState>,
    val stateCapabilities: List<BookableSellerStateCapabilities>,
    val requirements: List<BookableSellerRequirement>,
    val operations: List<BookableSellerOperation>,
)

@Serializable
data class BookableSeats(
    val grantsFrom: String,
    val states: List<BookableSeatState>,
    val transitions: List<BookableSeatTransition>,
    val terminalStates: List<BookableSeatState>,
    val grantingStates: List<BookableSeatState>,
    val soleRole: BookableStaffRoleID,
    val unrevocableRole: BookableStaffRoleID,
    val scopedFields: List<String>,
    val operations: List<BookableSeatOperation>,
    val inviteExpiryHours: Int,
)

/**
 * SELLER's lifecycle and its seats. A seat never exceeds the business it works
 * for, so a suspended seller silences every seat inside it without any role
 * being edited.
 */
@Serializable
data class BookableSeller(
    val noun: BookableNoun,
    val identity: BookableSellerIdentity,
    val seats: BookableSeats,
)

@Serializable
enum class BookableLocationKindID {
    fixed, zone, mobile, visiting
}

@Serializable
enum class BookableFulfillment {
    guestTravels, vendorTravels
}

@Serializable
enum class BookableLocationState {
    DRAFT, ACTIVE, PAUSED, CLOSED
}

@Serializable
enum class BookableLocationOperationID {
    ACTIVATE_LOCATION, PAUSE_LOCATION, CLOSE_LOCATION
}

@Serializable
data class BookableLocationKind(
    val id: BookableLocationKindID,
    val label: String,
    val question: String,
    val fulfillment: BookableFulfillment,
    val requiresAddress: Boolean,
    val requiresRadius: Boolean,
)

@Serializable
data class BookableLocationOperation(
    val id: BookableLocationOperationID,
    val label: String,
    val requiresCapability: BookableCapabilityID,
    val from: List<BookableLocationState>,
    val to: BookableLocationState,
)

@Serializable
data class BookableLocationTransition(
    val from: BookableLocationState,
    val to: List<BookableLocationState>,
)

@Serializable
data class BookableEtaKindFulfillment(
    val etaKind: BookableEtaKind,
    /** "any" when the ETA shape says nothing about who travels. */
    val requires: String,
)

@Serializable
data class BookableLocationDefaults(
    val kind: BookableLocationKindID,
    val radiusMiles: Int,
    val maxRadiusMiles: Int,
)

@Serializable
data class BookableDomainLocationKinds(
    val domain: BookableDomainID,
    val kinds: List<BookableLocationKindID>,
)

/**
 * A Location is not a new core noun. It is a PIN a SELLER holds, and its kind
 * decides who travels, which is what etaKind was already describing from the
 * other end.
 */
@Serializable
data class BookableLocations(
    val derivesFrom: BookableNoun,
    val heldBy: BookableNoun,
    val kinds: List<BookableLocationKind>,
    val fulfillments: List<BookableFulfillment>,
    val states: List<BookableLocationState>,
    val transitions: List<BookableLocationTransition>,
    val publishableStates: List<BookableLocationState>,
    val operations: List<BookableLocationOperation>,
    val etaKindFulfillment: List<BookableEtaKindFulfillment>,
    val defaults: BookableLocationDefaults,
    val domainKinds: List<BookableDomainLocationKinds>,
)

@Serializable
enum class BookableDemandState {
    OPEN, MATCHED, OFFERED, BOOKED, EXPIRED, WITHDRAWN
}

@Serializable
enum class BookableDemandOperationID {
    OFFER, WITHDRAW_OFFER, DECLINE
}

@Serializable
enum class BookableMatchRuleID {
    category, location, party, budget, capacity
}

@Serializable
data class BookableDemandOperation(
    val id: BookableDemandOperationID,
    val label: String,
    val requiresCapability: BookableCapabilityID,
    val from: List<BookableDemandState>,
    val to: BookableDemandState,
)

@Serializable
data class BookableDemandTransition(
    val from: BookableDemandState,
    val to: List<BookableDemandState>,
)

@Serializable
data class BookableMatchRule(
    val id: BookableMatchRuleID,
    val label: String,
    val missReason: String,
)

@Serializable
data class BookableDemandDefaults(
    val expiryMins: Int,
    val flexibilityMins: Int,
    val radiusMiles: Int,
    val maxRadiusMiles: Int,
    val maxPartySize: Int,
)

/**
 * The other half of the printer. A need stays unresolved until real capacity can
 * absorb it, so a match must name the slot that would fill it.
 */
@Serializable
data class BookableDemand(
    val raisedBy: BookableNoun,
    val answeredBy: BookableNoun,
    val resolvesTo: BookableNoun,
    val states: List<BookableDemandState>,
    val transitions: List<BookableDemandTransition>,
    val terminalStates: List<BookableDemandState>,
    val actionableStates: List<BookableDemandState>,
    val operations: List<BookableDemandOperation>,
    val matchRules: List<BookableMatchRule>,
    val defaults: BookableDemandDefaults,
)

/** One slot's worth of capacity. Committed counts RESERVED plus CONFIRMED SKUs. */
data class BookableSlotCapacity(
    val quantity: Int,
    val committed: Int,
    val blocked: Boolean = false,
    val closed: Boolean = false,
    val startsAtEpochMs: Long? = null,
) {
    /**
     * An expiring hold lowers committed, which is what returns capacity instead
     * of stranding it.
     */
    val remaining: Int get() = maxOf(0, quantity - committed)

    /** Quantity can be raised freely but never below what is already sold. */
    val minimumQuantity: Int get() = committed
}

@Serializable
data class BookableDomain(
    val id: BookableDomainID,
    val label: String,
    val noun: BookableNoun,
    val variants: List<String>,
)

@Serializable
data class BookableTemplate(
    val id: String,
    val name: String,
    val hook: String,
    val domain: BookableDomainID,
    val schema: String,
    val noun: BookableNoun,
    val tier: BookableServiceTier,
    val category: String,
    val clipCategory: String,
    val discoverType: String,
    val title: String,
    val description: String,
    val tagline: String,
    val timing: BookableTiming,
    val includedHighlights: List<String>,
    val priceCents: Int,
    val durationMins: Int,
    val maxGuests: Int,
    val patchRequired: Boolean,
    val cta: String,
    val icon: String,
    val capabilities: List<BookableCapabilityID>,
    val actionables: List<String>,
) {
    val formEtaLabel: String get() = if (tier == BookableServiceTier.green) "" else timing.etaLabel

    /** null when the template holds no inventory, so there is nothing to expire. */
    fun holdExpiresAtMs(reservedAtMs: Long): Long? =
        if (timing.holdSecs <= 0) null else reservedAtMs + timing.holdSecs * 1000L

    /** An expired hold returns the SKU to PUBLISHED, not CANCELLED. */
    fun holdStateAt(reservedAtMs: Long, nowMs: Long): BookableSkuState {
        val expiresAt = holdExpiresAtMs(reservedAtMs) ?: return BookableSkuState.RESERVED
        return if (nowMs >= expiresAt) BookableSkuState.PUBLISHED else BookableSkuState.RESERVED
    }

    fun clipLocalService(): BookableClipLocalService {
        val tint = when (tier) {
            BookableServiceTier.black -> "gold"
            BookableServiceTier.green -> "emerald"
            BookableServiceTier.platinum -> "cyan"
        }
        return BookableClipLocalService(
            id = id,
            title = title,
            subtitle = tagline,
            action = cta,
            iconName = icon,
            tintName = tint,
            priceLabel = "From $${priceCents / 100}",
            amountCents = priceCents,
            currency = "USD",
            source = "curated",
            category = clipCategory,
            activityHighlights = includedHighlights,
        )
    }

    fun canExecute(capability: BookableCapabilityID, state: BookableSkuState): Boolean {
        if (capability !in capabilities) return false
        if (state == BookableSkuState.CANCELLED || state == BookableSkuState.COMPLETED || state == BookableSkuState.NO_SHOW) return false
        return when (capability) {
            BookableCapabilityID.PUBLISH -> state == BookableSkuState.DRAFT
            BookableCapabilityID.RESERVE, BookableCapabilityID.RSVP -> state == BookableSkuState.PUBLISHED
            BookableCapabilityID.BOOK, BookableCapabilityID.PAY, BookableCapabilityID.BUY ->
                state == BookableSkuState.PUBLISHED || state == BookableSkuState.RESERVED
            BookableCapabilityID.CHECK_IN, BookableCapabilityID.VERIFY -> state == BookableSkuState.CONFIRMED
            BookableCapabilityID.CANCEL, BookableCapabilityID.REFUND ->
                state == BookableSkuState.PUBLISHED || state == BookableSkuState.RESERVED ||
                    state == BookableSkuState.CONFIRMED || state == BookableSkuState.CHECKED_IN
            BookableCapabilityID.INVITE, BookableCapabilityID.SHARE, BookableCapabilityID.SCHEDULE ->
                state == BookableSkuState.PUBLISHED || state == BookableSkuState.RESERVED ||
                    state == BookableSkuState.CONFIRMED
            else -> false
        }
    }
}

@Serializable
data class BookableClipLocalService(
    val id: String,
    val title: String,
    val subtitle: String,
    val action: String,
    val iconName: String,
    val tintName: String,
    val priceLabel: String,
    val amountCents: Int,
    val currency: String,
    val source: String,
    val category: String,
    val activityHighlights: List<String>,
)

@Serializable
data class BookableNativeHints(
    val swiftType: String,
    val kotlinType: String,
    val decodeKeyStrategy: String,
    val bundlePath: String,
)

@Serializable
data class BookableTemplateCatalog(
    val id: String,
    val version: Int,
    val native: BookableNativeHints,
    val principle: String,
    val coreNouns: List<BookableNoun>,
    val derivedObjects: List<BookableDerivedObject>,
    val capabilities: List<BookableCapability>,
    val actorRoles: List<BookableActorRole>,
    val entityCapabilities: List<BookableEntityCapabilities>,
    val staffRoles: List<BookableStaffRole>,
    val skuStates: List<BookableSkuState>,
    val skuTransitions: List<BookableSkuTransition>,
    val hangStates: List<String>,
    val tierCategories: Map<String, List<String>>,
    val tierFloors: Map<String, Int>,
    val etaKinds: List<BookableEtaKind>,
    val domains: List<BookableDomain>,
    val seller: BookableSeller,
    val discoverCategories: List<BookableDiscoverCategory>,
    val availability: BookableAvailability,
    val locations: BookableLocations,
    val demand: BookableDemand,
    val templates: List<BookableTemplate>,
) {
    fun template(id: String): BookableTemplate? = templates.firstOrNull { it.id == id }

    fun derivedObject(id: BookableDerivedObjectID): BookableDerivedObject? =
        derivedObjects.firstOrNull { it.id == id }

    fun capabilitiesFor(entity: BookableNoun): List<BookableCapabilityID> =
        entityCapabilities.firstOrNull { it.entity == entity }?.capabilities.orEmpty()

    /** Whether the ontology entity is permitted this capability at all. */
    fun entityCanExecute(entity: BookableNoun, capability: BookableCapabilityID): Boolean =
        capability in capabilitiesFor(entity)

    /**
     * ACTOR -> ACTION -> TARGET -> CAPABILITY. The actor must be permitted the
     * capability and the SKU must be in a state that allows it, so a PERSON can
     * never PUBLISH and a SELLER can never RSVP.
     */
    fun canActorExecute(
        actor: BookableNoun,
        capability: BookableCapabilityID,
        state: BookableSkuState,
        template: BookableTemplate,
    ): Boolean = entityCanExecute(actor, capability) && template.canExecute(capability, state)

    /** Vendor-gated rails are hidden from a consumer-only build. */
    fun visibleDiscoverCategories(includeVendorGated: Boolean = false): List<BookableDiscoverCategory> =
        if (includeVendorGated) discoverCategories else discoverCategories.filter { it.vendorGated != true }

    fun discoverCategory(id: String): BookableDiscoverCategory? =
        discoverCategories.firstOrNull { it.id == id }

    /** What a consumer can actually book after tapping a rail. */
    fun templatesForDiscoverCategory(id: String): List<BookableTemplate> =
        templates.filter { it.discoverType == id }

    /** The rail a published SKU surfaces in, so supply and demand stay reversible. */
    fun discoverCategoryForTemplate(templateId: String): BookableDiscoverCategory? =
        template(templateId)?.let { discoverCategory(it.discoverType) }

    fun discoverCategoriesForDomain(domain: BookableDomainID): List<BookableDiscoverCategory> =
        discoverCategories.filter { domain in it.domains }

    /** A Bookable inherits its shape from its domain unless the vendor overrides it. */
    fun availabilityDefaultsFor(domain: BookableDomainID): BookableAvailabilityDefaults {
        val override = availability.domainDefaults.firstOrNull { it.domain == domain }
            ?: return availability.defaults
        return BookableAvailabilityDefaults(
            slotKind = override.slotKind,
            slotMinutes = override.slotMinutes,
            leadTimeMins = override.leadTimeMins,
            horizonDays = override.horizonDays,
            maxQuantityPerSlot = availability.defaults.maxQuantityPerSlot,
        )
    }

    /**
     * Slot state is derived, never stored, so capacity and state can never
     * disagree. Blocked outranks full because a vendor closing a slot has to win
     * over demand.
     */
    fun resolveSlotState(slot: BookableSlotCapacity, nowEpochMs: Long = System.currentTimeMillis()): BookableSlotState {
        slot.startsAtEpochMs?.let { if (it <= nowEpochMs) return BookableSlotState.PASSED }
        if (slot.blocked) return BookableSlotState.BLOCKED
        if (slot.closed) return BookableSlotState.CLOSED
        return if (slot.remaining > 0) BookableSlotState.OPEN else BookableSlotState.FULL
    }

    /** The oversell guard. Capacity is all that stands between a vendor and a double booking. */
    fun canCommitToSlot(slot: BookableSlotCapacity, nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        resolveSlotState(slot, nowEpochMs) == BookableSlotState.OPEN

    fun canSetSlotQuantity(slot: BookableSlotCapacity, next: Int): Boolean =
        next in slot.minimumQuantity..availability.defaults.maxQuantityPerSlot

    fun availabilityOperation(id: BookableAvailabilityOperationID): BookableAvailabilityOperation? =
        availability.operations.firstOrNull { it.id == id }

    /**
     * A vendor operation needs the seat to hold the capability and the slot to be
     * in a state the operation accepts, the same two-part check the SKU machine uses.
     */
    fun canRunAvailabilityOperation(
        role: BookableStaffRoleID,
        id: BookableAvailabilityOperationID,
        state: BookableSlotState,
    ): Boolean {
        val operation = availabilityOperation(id) ?: return false
        return staffRoleCan(role, operation.requiresCapability) && state in operation.from
    }

    /**
     * The ceiling the business puts on every seat inside it. A suspended seller
     * still honours what it sold, so CHECK_IN and REFUND survive while SELL does not.
     */
    fun sellerStateAllows(state: BookableSellerState, capability: BookableCapabilityID): Boolean =
        seller.identity.stateCapabilities.firstOrNull { it.state == state }?.allows?.contains(capability) ?: false

    fun sellerCanPublish(state: BookableSellerState): Boolean =
        state in seller.identity.publishableStates

    /** A closed business has no console to sign into. */
    fun sellerCanUseConsole(state: BookableSellerState): Boolean =
        state in seller.identity.consoleStates

    /** Only an ACTIVE seat grants anything; an unaccepted invite carries nothing. */
    fun seatGrants(state: BookableSeatState): Boolean =
        state in seller.seats.grantingStates

    /**
     * A seat's real capability set: the role, narrowed by whatever the business's
     * own state still permits, and empty unless the seat itself is granting.
     */
    fun effectiveSeatCapabilities(
        role: BookableStaffRoleID,
        seat: BookableSeatState,
        sellerState: BookableSellerState,
    ): List<BookableCapabilityID> {
        if (!seatGrants(seat)) return emptyList()
        return (staffRole(role)?.capabilities ?: emptyList())
            .filter { sellerStateAllows(sellerState, it) }
    }

    /**
     * Two conditions, and both are load-bearing. Granting is an act of the
     * business, which is what SELL already means for locations and demand, so a
     * shift lead cannot hire. And nobody can hand out a seat equal to or greater
     * than their own, so a manager can never mint an owner.
     */
    fun canGrantStaffRole(granter: BookableStaffRoleID, target: BookableStaffRoleID): Boolean {
        val mine = staffRole(granter)?.capabilities ?: return false
        val theirs = staffRole(target)?.capabilities ?: return false
        if (BookableCapabilityID.SELL !in mine) return false
        if (theirs.size >= mine.size) return false
        return theirs.all { it in mine }
    }

    fun grantableStaffRoles(granter: BookableStaffRoleID): List<BookableStaffRoleID> =
        staffRoles.map { it.id }.filter { canGrantStaffRole(granter, it) }

    /**
     * Seat management is a two-part check like every other operation: the granter
     * must outrank the target, then the seat's own state must allow the move.
     */
    fun canRunSeatOperation(
        granter: BookableStaffRoleID,
        target: BookableStaffRoleID,
        operation: BookableSeatOperationID,
        state: BookableSeatState?,
    ): Boolean {
        val move = seller.seats.operations.firstOrNull { it.id == operation } ?: return false
        if (!canGrantStaffRole(granter, target)) return false
        // The owner seat cannot be removed, because that orphans every SKU it printed.
        if (operation == BookableSeatOperationID.REVOKE_SEAT && target == seller.seats.unrevocableRole) return false
        if (operation == BookableSeatOperationID.INVITE_SEAT) return state == null
        return state != null && state in move.from
    }

    fun canRunSellerOperation(
        role: BookableStaffRoleID,
        id: BookableSellerOperationID,
        state: BookableSellerState,
    ): Boolean {
        val operation = seller.identity.operations.firstOrNull { it.id == id } ?: return false
        // A platform transition is never reachable from a vendor seat.
        if (operation.actor != BookableSellerActor.seller) return false
        if (operation.requiresRole != null && operation.requiresRole != role) return false
        return state in operation.from
    }

    /** What is still missing before the business can reach a given state. */
    fun unmetSellerRequirements(
        target: BookableSellerState,
        satisfied: Set<String>,
    ): List<BookableSellerRequirement> =
        seller.identity.requirements.filter { it.blocks == target && it.id !in satisfied }

    fun locationKind(id: BookableLocationKindID): BookableLocationKind? =
        locations.kinds.firstOrNull { it.id == id }

    /** The first kind is the default the wizard offers. */
    fun locationKindsFor(domain: BookableDomainID): List<BookableLocationKind> {
        val ids = locations.domainKinds.firstOrNull { it.domain == domain }?.kinds
            ?: listOf(locations.defaults.kind)
        return ids.mapNotNull { locationKind(it) }
    }

    /** Who travels is a property of the location, not of the domain. */
    fun fulfillmentFor(kind: BookableLocationKindID): BookableFulfillment? =
        locationKind(kind)?.fulfillment

    /**
     * The cross-check that keeps timing and geography honest: a dispatch ETA is
     * only meaningful when the vendor is the one moving.
     */
    fun etaKindAllows(etaKind: BookableEtaKind, fulfillment: BookableFulfillment): Boolean {
        val row = locations.etaKindFulfillment.firstOrNull { it.etaKind == etaKind } ?: return false
        return row.requires == "any" || row.requires == fulfillment.name
    }

    /** Inventory cannot be published from a location that is not live. */
    fun locationCanPublish(state: BookableLocationState): Boolean =
        state in locations.publishableStates

    fun canRunLocationOperation(
        role: BookableStaffRoleID,
        id: BookableLocationOperationID,
        state: BookableLocationState,
    ): Boolean {
        val operation = locations.operations.firstOrNull { it.id == id } ?: return false
        return staffRoleCan(role, operation.requiresCapability) && state in operation.from
    }

    fun isDemandActionable(state: BookableDemandState): Boolean =
        state in demand.actionableStates

    fun canRunDemandOperation(
        role: BookableStaffRoleID,
        id: BookableDemandOperationID,
        state: BookableDemandState,
    ): Boolean {
        val operation = demand.operations.firstOrNull { it.id == id } ?: return false
        return staffRoleCan(role, operation.requiresCapability) && state in operation.from
    }

    fun matchRule(id: BookableMatchRuleID): BookableMatchRule? =
        demand.matchRules.firstOrNull { it.id == id }

    fun staffRole(id: BookableStaffRoleID): BookableStaffRole? =
        staffRoles.firstOrNull { it.id == id }

    /** Whether the seat is permitted this capability at all. */
    fun staffRoleCan(role: BookableStaffRoleID, capability: BookableCapabilityID): Boolean =
        staffRole(role)?.capabilities?.contains(capability) == true

    /**
     * A seat acts on behalf of the business, so both must be permitted and the
     * SKU state must still allow it. The door can verify a pass but can never
     * refund, and no seat can outrank the SELLER it works for.
     */
    fun canStaffExecute(
        role: BookableStaffRoleID,
        capability: BookableCapabilityID,
        state: BookableSkuState,
        template: BookableTemplate,
    ): Boolean = staffRoleCan(role, capability) &&
        canActorExecute(BookableNoun.SELLER, capability, state, template)

    fun floorCents(tier: BookableServiceTier): Int = tierFloors[tier.name] ?: 0

    /** Highest floor first, so the price ladder reads black -> platinum -> green. */
    val tiersByFloorDescending: List<BookableServiceTier>
        get() = BookableServiceTier.entries.sortedByDescending { floorCents(it) }

    /**
     * Tiers that own this category. Price alone is not a classifier: a $12 Parking
     * stall is Platinum because Platinum owns Parking, not because it is cheap.
     */
    fun tierCandidates(category: String?): List<BookableServiceTier> {
        val needle = category.orEmpty().trim().lowercase()
        val ladder = tiersByFloorDescending
        if (needle.isEmpty()) return ladder
        val owners = ladder.filter { tier ->
            tierCategories[tier.name].orEmpty().any { it.lowercase() == needle }
        }
        return owners.ifEmpty { ladder }
    }

    /**
     * Resolve a tier from an explicit value, else category ownership, else the price
     * ladder restricted to the categories' owning tiers.
     */
    fun resolveTier(declared: String?, priceCents: Int, category: String?): BookableServiceTier {
        declared?.let { raw ->
            BookableServiceTier.entries.firstOrNull { it.name == raw }?.let { return it }
        }
        val candidates = tierCandidates(category)
        return candidates.firstOrNull { priceCents >= floorCents(it) }
            ?: candidates.lastOrNull()
            ?: BookableServiceTier.green
    }

    companion object {
        val json = Json { ignoreUnknownKeys = true }

        fun decode(raw: String): BookableTemplateCatalog {
            val catalog = json.decodeFromString(serializer(), raw)
            require(catalog.id == "bytspot.bookable-templates")
            require(catalog.native.swiftType == "BookableTemplateCatalog")
            require(catalog.native.kotlinType == "BookableTemplateCatalog")
            require(catalog.native.decodeKeyStrategy == "useDefaultKeys")
            return catalog
        }
    }
}
