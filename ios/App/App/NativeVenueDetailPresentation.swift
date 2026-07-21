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
    static let actions: [NativeVenueDetailAction] = [
        NativeVenueDetailAction(id: "navigate", title: "Navigate", systemImage: "arrow.triangle.turn.up.right.circle.fill", kind: .device),
        NativeVenueDetailAction(id: "call", title: "Call", systemImage: "phone.fill", kind: .device),
        NativeVenueDetailAction(id: "share", title: "Share", systemImage: "square.and.arrow.up.fill", kind: .device),
        NativeVenueDetailAction(id: "save", title: "Save", systemImage: "heart.fill", kind: .local),
        NativeVenueDetailAction(id: "getTickets", title: "Get Tickets", systemImage: "ticket.fill", kind: .capability(.saveToWallet)),
        NativeVenueDetailAction(id: "checkIn", title: "Check In", systemImage: "checkmark.seal.fill", kind: .authedWrite(endpoint: checkinEndpoint, idempotent: checkinIdempotent)),
        NativeVenueDetailAction(id: "concierge", title: "Concierge", systemImage: "sparkles", kind: .handoff),
        NativeVenueDetailAction(id: "bookRide", title: "Book Ride", systemImage: "car.fill", kind: .capability(.createCheckoutHold))
    ]
    static var actionIDs: [String] { actions.map(\.id) }
}

enum NativeVenueDetailPresentation {
    static func supportsManualCheckIn(_ venue: NativeVenueSummary) -> Bool {
        if isBoutiqueApartmentVenue(venue) || isMobilityVenue(venue) || isServiceVenue(venue) { return false }
        if isEventOrPassVenue(venue) || venue.discoverType == "parking" { return false }
        return true
    }

    static func actionTitle(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        if action.id == "call", hasSafeWebsiteURL(venue) { return "Website" }
        if isCoffeeVenue(venue) || isDiningVenue(venue) || isBoutiqueApartmentVenue(venue) {
            if action.id == "call" { return "Contact" }
            if action.id == "navigate" { return "Directions" }
        }
        if action.id == "bookRide", isMobilityVenue(venue) {
            return venue.name.localizedCaseInsensitiveContains("group") ? "Plan Group Ride" : "Open Ride App"
        }
        guard action.id == "getTickets" else { return action.title }
        if isCoffeeVenue(venue) { return "Plan Stop" }
        if isBoutiqueApartmentVenue(venue) { return "Check Dates" }
        if isDiningVenue(venue) { return "View Menu" }
        if isEventOrPassVenue(venue) { return venue.name.localizedCaseInsensitiveContains("pass") ? "View Pass" : "Get Tickets" }
        if isServiceVenue(venue) { return "Request Service" }
        if venue.discoverType == "parking" { return "Reserve" }
        return action.title
    }

    static func actionSystemImage(for action: NativeVenueDetailAction, venue: NativeVenueSummary) -> String {
        if action.id == "bookRide", isMobilityVenue(venue) {
            return venue.name.localizedCaseInsensitiveContains("group") ? "bus.fill" : "car.side.fill"
        }
        if action.id == "call", hasSafeWebsiteURL(venue) { return "safari.fill" }
        guard action.id == "getTickets" else { return action.systemImage }
        if isCoffeeVenue(venue) { return "figure.walk.circle.fill" }
        if isBoutiqueApartmentVenue(venue) { return "house.fill" }
        if isDiningVenue(venue) { return "menucard.fill" }
        if isServiceVenue(venue) { return "checkmark.seal.fill" }
        if venue.discoverType == "parking" { return "parkingsign.circle.fill" }
        return action.systemImage
    }

    static func headerBadgeTitle(for venue: NativeVenueSummary) -> String? {
        guard let patchId = venue.verifiedPatchId?.trimmingCharacters(in: .whitespacesAndNewlines), !patchId.isEmpty else {
            return venue.sourceLabel?.uppercased()
        }
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

    private static func hasSafeWebsiteURL(_ venue: NativeVenueSummary) -> Bool {
        guard let scheme = venue.websiteUrl?.scheme?.lowercased() else { return false }
        return ["http", "https"].contains(scheme)
    }

    static func detailSection(for venue: NativeVenueSummary) -> NativeVenueDetailSection? {
        if isBoutiqueApartmentVenue(venue) {
            return NativeVenueDetailSection(title: "Stay details", subtitle: "Check dates, price, rules, and entry before any booking.", systemImage: "house.fill", highlights: ["Dates required", "Sleeps 2", "Price review", "Entry details"])
        }
        if isCoffeeVenue(venue) {
            return NativeVenueDetailSection(title: "Good for", subtitle: "A low-key coffee stop matched for a quick walk, brunch, or a calm reset nearby.", systemImage: "cup.and.saucer.fill", highlights: ["Coffee", "Brunch", "Quick walk", "Low-key morning"])
        }
        if isDiningVenue(venue) {
            return NativeVenueDetailSection(title: "Included", subtitle: venue.name.localizedCaseInsensitiveContains("broni") ? "Ghanaian comfort food, ready for pickup or delivery." : "Menu, pickup, and table options for this dining spot.", systemImage: "fork.knife", highlights: venue.name.localizedCaseInsensitiveContains("broni") ? ["Jollof + chicken", "Banku + tilapia", "Family-style portions", "Pickup or delivery"] : ["Menu preview", "Pickup options", "Group plans", "Ask Concierge"])
        }
        if isEventOrPassVenue(venue) {
            return NativeVenueDetailSection(title: "Included", subtitle: venue.name.localizedCaseInsensitiveContains("akwaaba") ? "Ghana matchday access, ready on your phone." : "Ticketing, arrival, and access details for this event.", systemImage: "ticket.fill", highlights: venue.name.localizedCaseInsensitiveContains("akwaaba") ? ["Fast-track entry", "VIP lounge access", "Digital pass delivery", "On-site host support"] : ["Tickets", "Entry details", "Arrival help", "Share pass"])
        }
        if isMobilityVenue(venue) {
            return NativeVenueDetailSection(title: venue.name.localizedCaseInsensitiveContains("group") ? "Group ride details" : "Ride details", subtitle: venue.name.localizedCaseInsensitiveContains("group") ? "Coordinate vans, shuttles, or private buses for airport runs, events, and crew movement." : "Compare ride apps and private transfers before you leave. Uber or Lyft must be installed to complete the ride.", systemImage: venue.name.localizedCaseInsensitiveContains("group") ? "bus.fill" : "car.side.fill", highlights: venue.name.localizedCaseInsensitiveContains("group") ? ["Event shuttle", "Airport transfer", "Private bus", "Crew planning"] : ["Uber & Lyft", "Airport transfer", "Private ride", "Install required"])
        }
        if isServiceVenue(venue) {
            return NativeVenueDetailSection(title: "Service details", subtitle: "Review what is included, save it for later, or ask Concierge for help with next steps.", systemImage: "checkmark.seal.fill", highlights: ["Trusted provider", "Member pricing", "Saved request", "Concierge help"])
        }
        if venue.discoverType == "parking" {
            return NativeVenueDetailSection(title: "Parking details", subtitle: "Availability, pricing, and arrival support before you route.", systemImage: "parkingsign.circle.fill", highlights: ["Reserve ahead", "Price shown", "Walk time", "Covered options"])
        }
        return nil
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

struct NativeVenueOpenStatus: Equatable {
    let label: String
    let isOpen: Bool
    let detail: String
}