import Foundation

/// Host Studio Spark menu. Ten categories are costumes for the same
/// room printer — they are not products, not a guest Home grid, and not
/// a Live atlas. Every type maps onto one of the seven existing
/// `NativePartyTemplateID` printers.
enum NativeHostCategory: String, CaseIterable, Codable, Identifiable {
    case party
    case nightlife
    case music
    case sports
    case food = "food-drink"
    case social
    case culture
    case cars
    case outdoor
    case community

    var id: String { rawValue }

    var title: String {
        switch self {
        case .party: return "Party"
        case .nightlife: return "Nightlife"
        case .music: return "Music"
        case .sports: return "Sports"
        case .food: return "Food & Drink"
        case .social: return "Social"
        case .culture: return "Culture"
        case .cars: return "Cars"
        case .outdoor: return "Outdoor"
        case .community: return "Community"
        }
    }

    var emoji: String {
        switch self {
        case .party: return "🎉"
        case .nightlife: return "🪩"
        case .music: return "🎵"
        case .sports: return "🏆"
        case .food: return "🍔"
        case .social: return "🤝"
        case .culture: return "🎨"
        case .cars: return "🏎️"
        case .outdoor: return "🌳"
        case .community: return "🏙️"
        }
    }

    var hook: String {
        switch self {
        case .party: return "One room. Your people."
        case .nightlife: return "A night with a door."
        case .music: return "Give the drop a room."
        case .sports: return "Watch it together."
        case .food: return "The table is the hang."
        case .social: return "Turn DMs into a room."
        case .culture: return "First watch. First laugh."
        case .cars: return "The stall is the plan."
        case .outdoor: return "A day-part, named."
        case .community: return "A market you can kit."
        }
    }
}

enum NativeHostFormat: String, CaseIterable, Codable, Identifiable {
    case rooftop, house, pool, lounge, patio, room, garage, cafe, theater

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

extension NativeHostCategory {
    /// Format stays a tag, never a door. It is scoped per category only so the
    /// row stops offering a garage to a Food & Drink host.
    var formats: [NativeHostFormat] {
        switch self {
        case .party: return [.house, .rooftop, .pool, .patio]
        case .nightlife: return [.lounge, .rooftop, .patio, .room]
        case .music: return [.room, .lounge, .rooftop, .theater]
        case .sports: return [.room, .house, .patio, .lounge]
        case .food: return [.patio, .cafe, .rooftop, .house]
        case .social: return [.cafe, .lounge, .room, .patio]
        case .culture: return [.theater, .room, .cafe, .lounge]
        case .cars: return [.garage, .patio]
        case .outdoor: return [.rooftop, .patio, .pool]
        case .community: return [.patio, .cafe, .room]
        }
    }
}

/// What a type does at the door. The printer decides how a Party Pass renders;
/// it must not also decide who gets in, or a Club night inherits a living room.
enum NativeHostDoorPolicy: String, Codable {
    /// A private address. There is one honest door and nothing to sell.
    case approvalOnly = "approval-only"
    /// A public room that fills fastest on a free list.
    case openDoor = "open-door"
    /// A public room with a door charge. Nightlife lives here.
    case ticketedDoor = "ticketed-door"

    /// Order is what the host reads first. A ticketed type leads with Ticket.
    var allowedDoors: [NativePartyAccessMode] {
        switch self {
        case .approvalOnly: return [.privateApproval]
        case .openDoor: return [.freeRSVP, .paidTicket, .privateApproval]
        case .ticketedDoor: return [.paidTicket, .freeRSVP, .privateApproval]
        }
    }

    /// Preselected door. A ticketed type leads with Ticket but does not choose
    /// it: this build collects ticket money into the platform account and pays
    /// hosts by hand, so a money rail is only ever entered deliberately.
    var defaultDoor: NativePartyAccessMode {
        self == .approvalOnly ? .privateApproval : .freeRSVP
    }

    /// Shown when the policy leaves the host no choice, so a one-option list
    /// reads as a rule instead of a broken picker.
    var singleDoorExplanation: String? {
        self == .approvalOnly ? "A private address has one honest door: you approve every guest." : nil
    }
}

enum NativeHostAgeRule: String, CaseIterable, Codable, Identifiable {
    case allAges = "all-ages"
    case eighteenPlus = "18-plus"
    case twentyOnePlus = "21-plus"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .allAges: return "All ages"
        case .eighteenPlus: return "18+"
        case .twentyOnePlus: return "21+"
        }
    }
}

struct NativeHostType: Equatable, Identifiable {
    let id: String
    let name: String
    let category: NativeHostCategory
    /// The existing Host Studio printer this type wears. Never invent a new one.
    let printer: NativePartyTemplateID
    /// Who gets in. Owned by the type, not inferred from the printer.
    let door: NativeHostDoorPolicy

    static let catalog: [NativeHostType] = [
        NativeHostType(id: "house", name: "House party", category: .party, printer: .privateParty, door: .approvalOnly),
        NativeHostType(id: "rooftop-party", name: "Rooftop", category: .party, printer: .privateParty, door: .approvalOnly),
        NativeHostType(id: "pool", name: "Pool", category: .party, printer: .privateParty, door: .approvalOnly),
        NativeHostType(id: "birthday", name: "Birthday", category: .party, printer: .privateParty, door: .approvalOnly),

        // Nightlife runs on a venue door, not a living room.
        NativeHostType(id: "afrobeats", name: "Afrobeats", category: .nightlife, printer: .popUp, door: .ticketedDoor),
        NativeHostType(id: "club", name: "Club night", category: .nightlife, printer: .popUp, door: .ticketedDoor),
        NativeHostType(id: "lounge", name: "Lounge", category: .nightlife, printer: .popUp, door: .ticketedDoor),
        NativeHostType(id: "after-hours", name: "After-hours", category: .nightlife, printer: .popUp, door: .ticketedDoor),

        NativeHostType(id: "listening", name: "Listening party", category: .music, printer: .listeningParty, door: .openDoor),
        NativeHostType(id: "release", name: "Release party", category: .music, printer: .releaseParty, door: .ticketedDoor),
        NativeHostType(id: "showcase", name: "Showcase", category: .music, printer: .listeningParty, door: .ticketedDoor),
        NativeHostType(id: "live-set", name: "Live set", category: .music, printer: .listeningParty, door: .ticketedDoor),

        NativeHostType(id: "watch-party", name: "Watch party", category: .sports, printer: .premiere, door: .openDoor),
        NativeHostType(id: "tailgate", name: "Tailgate", category: .sports, printer: .premiere, door: .openDoor),
        NativeHostType(id: "game-night", name: "Game night", category: .sports, printer: .premiere, door: .openDoor),

        NativeHostType(id: "dinner", name: "Dinner", category: .food, printer: .popUp, door: .openDoor),
        NativeHostType(id: "brunch", name: "Brunch", category: .food, printer: .popUp, door: .openDoor),
        NativeHostType(id: "pop-up-table", name: "Pop-up table", category: .food, printer: .popUp, door: .ticketedDoor),

        NativeHostType(id: "meetup", name: "Meetup", category: .social, printer: .fanMeetup, door: .openDoor),
        NativeHostType(id: "networking", name: "Networking", category: .social, printer: .fanMeetup, door: .openDoor),
        NativeHostType(id: "fan-meetup", name: "Fan meetup", category: .social, printer: .fanMeetup, door: .openDoor),

        NativeHostType(id: "premiere", name: "Premiere", category: .culture, printer: .premiere, door: .ticketedDoor),
        NativeHostType(id: "comedy", name: "Comedy", category: .culture, printer: .comedyNight, door: .ticketedDoor),
        NativeHostType(id: "art-night", name: "Art night", category: .culture, printer: .popUp, door: .openDoor),
        NativeHostType(id: "workshop", name: "Workshop", category: .culture, printer: .popUp, door: .ticketedDoor),

        // A cruise meet is a public lot. A garage meet is someone's garage.
        NativeHostType(id: "cruise", name: "Cruise meet", category: .cars, printer: .popUp, door: .openDoor),
        NativeHostType(id: "garage-meet", name: "Garage meet", category: .cars, printer: .privateParty, door: .approvalOnly),

        NativeHostType(id: "yoga", name: "Yoga", category: .outdoor, printer: .popUp, door: .openDoor),
        NativeHostType(id: "fitness", name: "Fitness", category: .outdoor, printer: .popUp, door: .openDoor),
        NativeHostType(id: "hike", name: "Hike meetup", category: .outdoor, printer: .fanMeetup, door: .openDoor),

        NativeHostType(id: "market", name: "Market", category: .community, printer: .popUp, door: .openDoor),
        NativeHostType(id: "neighborhood", name: "Neighborhood", category: .community, printer: .popUp, door: .openDoor)
    ]

    static func types(in category: NativeHostCategory) -> [NativeHostType] {
        catalog.filter { $0.category == category }
    }

    static func type(id: String) -> NativeHostType? {
        catalog.first { $0.id == id }
    }

    /// The printer still gates what a published configuration can express, so
    /// the doors a host sees are the type's policy narrowed by the printer.
    /// The catalog keeps this non-empty: only approval-only types wear the
    /// private-party printer.
    func availableDoors(for configuration: NativePartyTemplateConfiguration) -> [NativePartyAccessMode] {
        let printerDoors = configuration.allowedAccessModes
        let doors = door.allowedDoors.filter(printerDoors.contains)
        return doors.isEmpty ? printerDoors : doors
    }

    /// The door this type opens on, clamped to what the printer can express.
    func openingDoor(for configuration: NativePartyTemplateConfiguration) -> NativePartyAccessMode {
        let doors = availableDoors(for: configuration)
        return doors.contains(door.defaultDoor) ? door.defaultDoor : (doors.first ?? door.defaultDoor)
    }
}

struct NativeHostTaxonomySelection: Equatable {
    var category: NativeHostCategory
    var type: NativeHostType
    var format: NativeHostFormat?
    var age: NativeHostAgeRule?

    static let `default` = NativeHostTaxonomySelection(
        category: .party,
        type: NativeHostType.type(id: "house") ?? NativeHostType.catalog[0],
        format: .house,
        age: nil
    )

    /// First-night capacity. Raise it after a room actually fills.
    static let recommendedCapacity = 20

    var rpcTags: [String: String] {
        var tags = [
            "hostCategory": category.rawValue,
            "hostType": type.id
        ]
        if let format { tags["hostFormat"] = format.rawValue }
        if let age { tags["hostAge"] = age.rawValue }
        return tags
    }

    mutating func select(category: NativeHostCategory) {
        self.category = category
        if type.category != category {
            type = NativeHostType.types(in: category).first ?? type
        }
        format = nil
    }

    mutating func select(type: NativeHostType) {
        self.type = type
        if category != type.category {
            category = type.category
            format = nil
        }
        if let format, !type.category.formats.contains(format) { self.format = nil }
    }
}
