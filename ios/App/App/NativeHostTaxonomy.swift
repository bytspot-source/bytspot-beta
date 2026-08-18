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

    static let catalog: [NativeHostType] = [
        NativeHostType(id: "house", name: "House party", category: .party, printer: .privateParty),
        NativeHostType(id: "rooftop-party", name: "Rooftop", category: .party, printer: .privateParty),
        NativeHostType(id: "pool", name: "Pool", category: .party, printer: .privateParty),
        NativeHostType(id: "birthday", name: "Birthday", category: .party, printer: .privateParty),

        NativeHostType(id: "afrobeats", name: "Afrobeats", category: .nightlife, printer: .popUp),
        NativeHostType(id: "club", name: "Club night", category: .nightlife, printer: .privateParty),
        NativeHostType(id: "lounge", name: "Lounge", category: .nightlife, printer: .privateParty),
        NativeHostType(id: "after-hours", name: "After-hours", category: .nightlife, printer: .privateParty),

        NativeHostType(id: "listening", name: "Listening party", category: .music, printer: .listeningParty),
        NativeHostType(id: "release", name: "Release party", category: .music, printer: .releaseParty),
        NativeHostType(id: "showcase", name: "Showcase", category: .music, printer: .listeningParty),
        NativeHostType(id: "live-set", name: "Live set", category: .music, printer: .listeningParty),

        NativeHostType(id: "watch-party", name: "Watch party", category: .sports, printer: .premiere),
        NativeHostType(id: "tailgate", name: "Tailgate", category: .sports, printer: .premiere),
        NativeHostType(id: "game-night", name: "Game night", category: .sports, printer: .premiere),

        NativeHostType(id: "dinner", name: "Dinner", category: .food, printer: .popUp),
        NativeHostType(id: "brunch", name: "Brunch", category: .food, printer: .popUp),
        NativeHostType(id: "pop-up-table", name: "Pop-up table", category: .food, printer: .popUp),

        NativeHostType(id: "meetup", name: "Meetup", category: .social, printer: .fanMeetup),
        NativeHostType(id: "networking", name: "Networking", category: .social, printer: .fanMeetup),
        NativeHostType(id: "fan-meetup", name: "Fan meetup", category: .social, printer: .fanMeetup),

        NativeHostType(id: "premiere", name: "Premiere", category: .culture, printer: .premiere),
        NativeHostType(id: "comedy", name: "Comedy", category: .culture, printer: .comedyNight),
        NativeHostType(id: "art-night", name: "Art night", category: .culture, printer: .popUp),
        NativeHostType(id: "workshop", name: "Workshop", category: .culture, printer: .popUp),

        NativeHostType(id: "cruise", name: "Cruise meet", category: .cars, printer: .privateParty),
        NativeHostType(id: "garage-meet", name: "Garage meet", category: .cars, printer: .privateParty),

        NativeHostType(id: "yoga", name: "Yoga", category: .outdoor, printer: .popUp),
        NativeHostType(id: "fitness", name: "Fitness", category: .outdoor, printer: .popUp),
        NativeHostType(id: "hike", name: "Hike meetup", category: .outdoor, printer: .fanMeetup),

        NativeHostType(id: "market", name: "Market", category: .community, printer: .popUp),
        NativeHostType(id: "neighborhood", name: "Neighborhood", category: .community, printer: .popUp)
    ]

    static func types(in category: NativeHostCategory) -> [NativeHostType] {
        catalog.filter { $0.category == category }
    }

    static func type(id: String) -> NativeHostType? {
        catalog.first { $0.id == id }
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
        category = type.category
    }
}
