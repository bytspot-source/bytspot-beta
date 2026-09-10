import CoreLocation
import Foundation

struct NativeVenueDetailAction: Identifiable, Equatable {
    let id: String
    let title: String
    let systemImage: String
    let kind: NativeVenueActionKind
}

enum NativeVenueActionKind: Equatable {
    case device
    case local
    case capability(BytspotTrustCapability)
    case authedWrite(endpoint: String, idempotent: Bool)
    case handoff
}

enum NativeVenueDetailContract {
    static let surfaceCapability: BytspotTrustCapability = .viewVenue
    static let checkinEndpoint = "venues.checkin"
    static let checkinIdempotent = true

    /// The coordinate is what turns a tap into evidence: the server fences it
    /// against the venue and pays points only inside. A fallback coordinate is
    /// never passed here — it would claim a member is somewhere they are not.
    static func checkinInput(venueID: String, idempotencyKey: String, coordinate: NativeLocationCoordinate?) -> [String: Any] {
        var input: [String: Any] = ["venueId": venueID, "idempotencyKey": idempotencyKey]
        if let coordinate, !coordinate.isFallback {
            input["lat"] = coordinate.latitude
            input["lng"] = coordinate.longitude
        }
        return input
    }
    static let actions: [NativeVenueDetailAction] = [
        NativeVenueDetailAction(id: "navigate", title: "Navigate", systemImage: "arrow.triangle.turn.up.right.circle.fill", kind: .device),
        NativeVenueDetailAction(id: "call", title: "Call", systemImage: "phone.fill", kind: .device),
        NativeVenueDetailAction(id: "share", title: "Share", systemImage: "square.and.arrow.up.fill", kind: .device),
        NativeVenueDetailAction(id: "save", title: "Save", systemImage: "heart.fill", kind: .local),
        NativeVenueDetailAction(id: "getTickets", title: "Get Tickets", systemImage: "ticket.fill", kind: .capability(.saveToWallet)),
        NativeVenueDetailAction(id: "checkIn", title: "Check In", systemImage: "checkmark.seal.fill", kind: .authedWrite(endpoint: checkinEndpoint, idempotent: checkinIdempotent)),
        NativeVenueDetailAction(id: "concierge", title: "Concierge", systemImage: "sparkles", kind: .handoff),
        NativeVenueDetailAction(id: "bookRide", title: "Plan Arrival", systemImage: "car.fill", kind: .device)
    ]
    static var actionIDs: [String] { actions.map(\.id) }
}

enum NativeVenueDetailPresentation {
    /// Mirrors the server fence so the copy can be honest before the round
    /// trip. The server decides — this only governs what we promise.
    static let fenceMetres: Double = 250

    static func isAtVenue(_ coordinate: NativeLocationCoordinate?, venue: NativeVenueSummary) -> Bool {
        guard let coordinate, !coordinate.isFallback else { return false }
        let device = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return device.distance(from: CLLocation(latitude: venue.latitude, longitude: venue.longitude)) <= fenceMetres
    }

    static func supportsManualCheckIn(_ venue: NativeVenueSummary) -> Bool {
        if venue.id.hasPrefix("suggestion-") { return false }
        if isBoutiqueApartmentVenue(venue) || isMobilityVenue(venue) || isServiceVenue(venue) { return false }
        if isEventOrPassVenue(venue) || venue.discoverType == "parking" { return false }
        return true
    }

    static func actionTitle(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        // Place metadata never grants fulfillment, even for a legacy controlled badge.
        switch action.id {
        case "getTickets": return "Details"
        case "navigate", "bookRide": return "Route"
        case "call": return "Contact"
        default: return action.title
        }
    }

    static func actionSystemImage(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        guard action.id == "getTickets" else { return action.systemImage }
        if isCoffeeVenue(venue) { return "figure.walk.circle.fill" }
        if isBoutiqueApartmentVenue(venue) { return "house.fill" }
        if isDiningVenue(venue) { return NativeDiscoverCardControl.isControlled(venue: venue) ? "menucard.fill" : "fork.knife" }
        if isServiceVenue(venue) { return "checkmark.seal.fill" }
        if venue.discoverType == "parking" { return "parkingsign.circle.fill" }
        return action.systemImage
    }

    static func headerBadgeTitle(for venue: NativeVenueSummary) -> String? {
        guard let patchId = venue.verifiedPatchId?.trimmingCharacters(in: .whitespacesAndNewlines), !patchId.isEmpty else { return nil }
        if patchId == "DISCOVER-VERIFIED" {
            if isEventOrPassVenue(venue) { return "EVENT PASS" }
            if isBoutiqueApartmentVenue(venue) { return "BOUTIQUE STAY" }
            if isCoffeeVenue(venue) { return "COFFEE" }
            if isDiningVenue(venue) { return "DINING" }
            if isMobilityVenue(venue) { return "MOBILITY" }
            if isServiceVenue(venue) { return "SERVICE" }
            return "VERIFIED"
        }
        return "VERIFIED PATCH"
    }

    static func detailSection(for venue: NativeVenueSummary) -> NativeVenueDetailSection? {
        // An address/category is a discovery reference, not inventory or amenities.
        NativeVenueDetailSection(title: "Place details",
            subtitle: NativeDiscoverBookablePresentation().availabilityLine,
            systemImage: "mappin", highlights: ["Route", "Add to Plan"])
    }

    static func isDiningVenue(_ venue: NativeVenueSummary) -> Bool {
        let text = searchableText(for: venue)
        if text.contains("pass") || text.contains("ticket") || text.contains("event") || text.contains("matchday") || text.contains("fifa") { return false }
        if isCoffeeVenue(venue) { return false }
        return venue.discoverType == "dining" || text.contains("food") || text.contains("dining") || text.contains("cooking") || text.contains("pickup") || text.contains("delivery") || text.contains("taste")
    }

    static func isCoffeeVenue(_ venue: NativeVenueSummary) -> Bool {
        let text = searchableText(for: venue)
        return venue.discoverType == "coffee" || text.contains("coffee") || text.contains("café") || text.contains("cafe") || text.contains("brunch")
    }

    static func isBoutiqueApartmentVenue(_ venue: NativeVenueSummary) -> Bool {
        let text = searchableText(for: venue)
        return venue.discoverType == "boutique_apartment" || text.contains("boutique apartment") || text.contains("short-stay") || text.contains("short stay") || text.contains("furnished stay")
    }

    static func isEventOrPassVenue(_ venue: NativeVenueSummary) -> Bool {
        if isMobilityVenue(venue) { return false }
        let text = searchableText(for: venue)
        return venue.discoverType == "entertainment" || text.contains("pass") || text.contains("ticket") || text.contains("event") || text.contains("matchday") || text.contains("fifa")
    }

    static func isMobilityVenue(_ venue: NativeVenueSummary) -> Bool {
        venue.discoverType == "mobility" || searchableText(for: venue).contains("ride") || searchableText(for: venue).contains("shuttle")
    }

    static func isServiceVenue(_ venue: NativeVenueSummary) -> Bool {
        venue.discoverType == "service" && !isDiningVenue(venue) && !isEventOrPassVenue(venue)
    }

    private static func searchableText(for venue: NativeVenueSummary) -> String {
        "\(venue.name) \(venue.category) \(venue.address) \(venue.crowd?.label ?? "")".lowercased()
    }
}

struct NativeVenueDetailSection: Equatable {
    let title: String
    let subtitle: String
    let systemImage: String
    let highlights: [String]
}

/// Shared card/detail routing contract. There is deliberately no checkout route:
/// no controlled-inventory booking backend is registered. Do not substitute payments.
enum NativeM5PrimaryAction: Equatable {
    case route
    case requestCoffee
    case external(URL)
    case unavailable
}

enum NativeM5DetailPolicy {
    static let hoursUnknown = "Hours unknown · not provided by this place"
    static let activityUnknown = "Activity unknown · no live update provided"
    static let addToPlanTitle = "Add to Plan"
    static let planDisclaimer = "Adding to a Plan does not book or request anything."

    static func primaryAction(for presentation: NativeDiscoverBookablePresentation) -> NativeM5PrimaryAction {
        switch presentation.capability {
        case .details: return .route
        case .request: return .requestCoffee
        case .redirect: return presentation.externalURL.map(NativeM5PrimaryAction.external) ?? .route
        case .book: return .unavailable
        }
    }

    static func primaryTitle(for presentation: NativeDiscoverBookablePresentation) -> String {
        switch primaryAction(for: presentation) {
        case .route: return "Route"
        case .requestCoffee: return "Request"
        case .external: return presentation.primaryActionTitle ?? "Route"
        case .unavailable: return "Booking unavailable"
        }
    }

    static func compactActions(for venue: NativeVenueSummary, offering: NativePlanBookableOffering? = nil,
                               isCatalogSource: Bool = false) -> [NativeVenueDetailAction] {
        // A catalog source key is not a venues.checkin venue ID, even after
        // an account change invalidates the exact offering's action authority.
        let canCheckIn = !isCatalogSource && offering == nil && NativeVenueDetailPresentation.supportsManualCheckIn(venue)
        let ids = canCheckIn ? ["save", "share", "checkIn"] : ["save", "share"]
        return ids.compactMap { id in NativeVenueDetailContract.actions.first { $0.id == id } }
    }

    static func address(for venue: NativeVenueSummary) -> String {
        let value = venue.address.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty || value == "—" ? "Address not provided" : value
    }

    static func activity(for venue: NativeVenueSummary) -> String {
        guard let crowd = venue.crowd, crowd.isLiveOccupancy else { return activityUnknown }
        let wait = crowd.waitMins.map { " · \($0)m wait" } ?? ""
        return "\(crowd.label)\(wait)"
    }
}

struct NativeVenueOpenStatus: Equatable {
    let label: String
    let isOpen: Bool
    let detail: String
}