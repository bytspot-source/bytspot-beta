import Foundation

// MARK: - BytspotTier
// Service-level axis (independent of providerType). Drives URL routing, the
// tRPC `tier` filter, fallback service catalogs, and the visual identity
// applied by ClipContentView and NativePatchExperienceView.
enum BytspotTier: String, Equatable, CaseIterable {
    case black
    case platinum
    case green

    var displayName: String {
        switch self {
        case .black: return "Bytspot Black"
        case .platinum: return "Bytspot Platinum"
        case .green: return "Bytspot Green"
        }
    }

    var eyebrow: String {
        switch self {
        case .black: return "BYTSPOT BLACK"
        case .platinum: return "BYTSPOT PLATINUM"
        case .green: return "BYTSPOT GREEN"
        }
    }

    /// Floor in cents enforced by the booking pipeline before authorization.
    var minimumCents: Int {
        switch self {
        case .black: return 45_000
        case .platinum: return 5_000
        case .green: return 500
        }
    }

    var defaultSubtitle: String {
        switch self {
        case .black: return "Curated ultra-luxury experiences. Verified by tap."
        case .platinum: return "Trusted local providers. Reserve and verify with one tap."
        case .green: return "Neighborhood services from your community. Tap to support."
        }
    }

    /// Resolve a tier from any Bytspot patch URL or patchId. Inspection order:
    /// (1) `?tier=` query, (2) `?invite=BLACK-…` prefix, (3) `/p/<tier>-…`,
    /// (4) `/black|/platinum|/green/<slug>` path, (5) `BLACK-/PLATINUM-/GREEN-`
    /// or `BYT-B-/BYT-P-/BYT-G-` patchId prefix. Defaults to `.black` so the
    /// existing Clip surface preserves its luxury default when no markers
    /// are present.
    static func detect(url: URL?, patchId: String?) -> BytspotTier {
        if let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            let items = components.queryItems ?? []
            if let raw = items.first(where: { $0.name.lowercased() == "tier" })?.value,
               let tier = BytspotTier(rawValue: raw.lowercased()) {
                return tier
            }
            if let invite = items.first(where: { $0.name.lowercased() == "invite" })?.value?.uppercased() {
                if invite.hasPrefix("BLACK-") { return .black }
                if invite.hasPrefix("PLATINUM-") { return .platinum }
                if invite.hasPrefix("GREEN-") { return .green }
            }
            let parts = components.path.split(separator: "/").map { $0.lowercased() }
            if parts.count >= 2 {
                let first = parts[0], second = parts[1]
                if first == "p" || first == "patch" {
                    if second.hasPrefix("black-") { return .black }
                    if second.hasPrefix("platinum-") { return .platinum }
                    if second.hasPrefix("green-") { return .green }
                }
                if first == "black" { return .black }
                if first == "platinum" { return .platinum }
                if first == "green" { return .green }
            }
        }
        if let patchId = patchId?.uppercased() {
            if patchId.hasPrefix("BLACK-") || patchId.hasPrefix("BYT-B-") { return .black }
            if patchId.hasPrefix("PLATINUM-") || patchId.hasPrefix("BYT-P-") { return .platinum }
            if patchId.hasPrefix("GREEN-") || patchId.hasPrefix("BYT-G-") { return .green }
        }
        return .black
    }
}

struct ClipPatchContext: Equatable {
    let patchId: String
    let title: String
    let subtitle: String
    let status: String
    let venueId: String?
    let serviceId: String?
    let tier: BytspotTier
    var latitude: Double?
    var longitude: Double?
}

struct ClipLocalService: Identifiable, Equatable {
    let id: String
    let title: String
    let subtitle: String
    let action: String
    let iconName: String
    let tintName: String
    let priceLabel: String?
    let amountCents: Int?
    let currency: String
    let source: String
    var heroImageURL: URL?
    var category: String?

    static let fallbacks: [ClipLocalService] = ClipLocalService.fallbacks(for: .black)

    /// Tier-specific service catalog rendered when the tRPC `vendors.search`
    /// endpoint returns no rows. Black mirrors the legacy ultra-luxury list;
    /// Platinum maps to mid-tier ($50+) parking, dining, and event services;
    /// Green showcases neighborhood cottage-industry offerings ($5+).
    static func fallbacks(for tier: BytspotTier) -> [ClipLocalService] {
        switch tier {
        case .black:
            return [
                ClipLocalService(id: "black-aviation", title: "Private Aviation", subtitle: "Charter on demand. Wheels up in 90 minutes.", action: "Charter Jet", iconName: "airplane.circle.fill", tintName: "gold", priceLabel: "From $28,000", amountCents: 2_800_000, currency: "USD", source: "curated", heroImageURL: nil, category: "aviation"),
                ClipLocalService(id: "black-marine", title: "Yacht & Marine", subtitle: "Private yachts and luxury day charters.", action: "Reserve Yacht", iconName: "ferry.fill", tintName: "cyan", priceLabel: "From $12,500", amountCents: 1_250_000, currency: "USD", source: "curated", heroImageURL: nil, category: "marine"),
                ClipLocalService(id: "black-dining", title: "Elite Dining", subtitle: "Michelin-level private chef experiences.", action: "Book Chef", iconName: "fork.knife.circle.fill", tintName: "violet", priceLabel: "From $1,200", amountCents: 120_000, currency: "USD", source: "curated", heroImageURL: nil, category: "dining"),
                ClipLocalService(id: "black-chauffeur", title: "VIP Valet & Chauffeur", subtitle: "Black-car arrivals and door-to-door service.", action: "Book Chauffeur", iconName: "car.side.fill", tintName: "gold", priceLabel: "From $450", amountCents: 45_000, currency: "USD", source: "curated", heroImageURL: nil, category: "chauffeur"),
                ClipLocalService(id: "black-wellness", title: "Private Wellness", subtitle: "In-suite spa, recovery, and longevity care.", action: "Book Wellness", iconName: "leaf.fill", tintName: "emerald", priceLabel: "From $850", amountCents: 85_000, currency: "USD", source: "curated", heroImageURL: nil, category: "wellness"),
                ClipLocalService(id: "black-concierge", title: "Concierge & Lifestyle", subtitle: "24/7 luxury concierge. Anything, anywhere.", action: "Message Concierge", iconName: "crown.fill", tintName: "violet", priceLabel: "From $500", amountCents: 50_000, currency: "USD", source: "curated", heroImageURL: nil, category: "concierge"),
                ClipLocalService(id: "black-events", title: "Exclusive Events", subtitle: "Sold-out access. Private hosts on arrival.", action: "Secure Access", iconName: "ticket.fill", tintName: "cyan", priceLabel: "From $3,500", amountCents: 350_000, currency: "USD", source: "curated", heroImageURL: nil, category: "events")
            ]
        case .platinum:
            return [
                ClipLocalService(id: "platinum-parking", title: "Reserved Parking", subtitle: "Guaranteed spot at this venue. Skip the circling.", action: "Reserve Spot", iconName: "car.side.lock.fill", tintName: "cyan", priceLabel: "From $12", amountCents: 1_200, currency: "USD", source: "curated", heroImageURL: nil, category: "parking"),
                ClipLocalService(id: "platinum-valet", title: "Valet Service", subtitle: "Hand off the keys. Retrieval in under 5 minutes.", action: "Book Valet", iconName: "key.fill", tintName: "cyan", priceLabel: "From $25", amountCents: 2_500, currency: "USD", source: "curated", heroImageURL: nil, category: "valet"),
                ClipLocalService(id: "platinum-dining", title: "Reserve a Table", subtitle: "Priority seating at top neighborhood restaurants.", action: "Reserve Table", iconName: "fork.knife", tintName: "violet", priceLabel: "From $65", amountCents: 6_500, currency: "USD", source: "curated", heroImageURL: nil, category: "dining"),
                ClipLocalService(id: "platinum-entry", title: "Skip-the-Line Entry", subtitle: "Verified entry to events and nightlife venues.", action: "Buy Entry", iconName: "ticket.fill", tintName: "violet", priceLabel: "From $50", amountCents: 5_000, currency: "USD", source: "curated", heroImageURL: nil, category: "entry"),
                ClipLocalService(id: "platinum-rideshare", title: "Premium Rideshare", subtitle: "On-demand SUV and black-car pickup nearby.", action: "Request Ride", iconName: "car.side.fill", tintName: "cyan", priceLabel: "From $35", amountCents: 3_500, currency: "USD", source: "curated", heroImageURL: nil, category: "rideshare"),
                ClipLocalService(id: "platinum-bottle", title: "Bottle Service", subtitle: "Reserved table and bottle package at partner venues.", action: "Reserve Table", iconName: "wineglass.fill", tintName: "violet", priceLabel: "From $250", amountCents: 25_000, currency: "USD", source: "curated", heroImageURL: nil, category: "nightlife"),
                ClipLocalService(id: "platinum-experience", title: "Local Experiences", subtitle: "Curated tours, tastings, and city experiences.", action: "Book Experience", iconName: "sparkles", tintName: "emerald", priceLabel: "From $85", amountCents: 8_500, currency: "USD", source: "curated", heroImageURL: nil, category: "experience")
            ]
        case .green:
            return [
                ClipLocalService(id: "green-farmstand", title: "Farm Stand", subtitle: "Fresh local produce from neighbors who grow it.", action: "Order Local", iconName: "leaf.fill", tintName: "emerald", priceLabel: "From $5", amountCents: 500, currency: "USD", source: "curated", heroImageURL: nil, category: "farm-stand"),
                ClipLocalService(id: "green-baked", title: "Baked Goods", subtitle: "Home-baked bread, pastries, and treats.", action: "Order Treats", iconName: "birthday.cake.fill", tintName: "emerald", priceLabel: "From $6", amountCents: 600, currency: "USD", source: "curated", heroImageURL: nil, category: "baked-goods"),
                ClipLocalService(id: "green-music", title: "Music Lessons", subtitle: "In-person and virtual lessons from local instructors.", action: "Book Lesson", iconName: "music.note", tintName: "violet", priceLabel: "From $25", amountCents: 2_500, currency: "USD", source: "curated", heroImageURL: nil, category: "lessons"),
                ClipLocalService(id: "green-petcare", title: "Pet Care", subtitle: "Trusted neighbors for walks, sits, and overnight care.", action: "Book Pet Care", iconName: "pawprint.fill", tintName: "emerald", priceLabel: "From $15", amountCents: 1_500, currency: "USD", source: "curated", heroImageURL: nil, category: "pet-care"),
                ClipLocalService(id: "green-detailing", title: "Car Detailing", subtitle: "Mobile detailing at your driveway. Eco-friendly products.", action: "Book Detail", iconName: "sparkles", tintName: "cyan", priceLabel: "From $45", amountCents: 4_500, currency: "USD", source: "curated", heroImageURL: nil, category: "car-detailing"),
                ClipLocalService(id: "green-repairs", title: "Home Repairs", subtitle: "Handy neighbors for fixes, mounts, and small jobs.", action: "Request Help", iconName: "hammer.fill", tintName: "gold", priceLabel: "From $25", amountCents: 2_500, currency: "USD", source: "curated", heroImageURL: nil, category: "home-repairs"),
                ClipLocalService(id: "green-tutoring", title: "Tutoring", subtitle: "K-12 and college subject help, hourly rates.", action: "Book Tutor", iconName: "book.fill", tintName: "violet", priceLabel: "From $20", amountCents: 2_000, currency: "USD", source: "curated", heroImageURL: nil, category: "tutoring")
            ]
        }
    }
}

struct ClipVendorMedia: Equatable {
    enum Kind: String, Equatable { case image, video }
    let kind: Kind
    let posterURL: URL?
    let videoPlaybackURL: URL?
    let durationMs: Int?
    let width: Int?
    let height: Int?

    var hasPlayableVideo: Bool { kind == .video && videoPlaybackURL != nil }
}

struct ClipVendor: Identifiable, Equatable {
    let id: String
    let name: String
    let tagline: String
    let priceFromCents: Int
    let currency: String
    let rating: Double?
    let etaLabel: String?
    let heroImageURL: URL?
    let availability: String
    let includedHighlights: [String]
    let serviceId: String
    let media: ClipVendorMedia?

    var displayPosterURL: URL? { media?.posterURL ?? heroImageURL }

    var priceFromLabel: String {
        let dollars = Double(priceFromCents) / 100.0
        if currency.uppercased() == "USD" {
            if dollars >= 1000 { return String(format: "From $%.0f", dollars) }
            return String(format: "From $%.0f", dollars)
        }
        return "From \(currency.uppercased()) \(String(format: "%.0f", dollars))"
    }

    static func fallbacks(for service: ClipLocalService, tier: BytspotTier = .black) -> [ClipVendor] {
        if tier != .black {
            return tieredFallbacks(for: service, tier: tier)
        }
        // `base` is the per-category price floor multiplied by 1.0 / 1.18 / 1.45
        // for the three vendor slots. Aviation overrides to 2.8M so the polished
        // Black aviation pool prices exactly to $28,000 / $33,040 / $40,600.
        var base = max(service.amountCents ?? 5000, tier.minimumCents)
        let cat = (service.category ?? service.id).lowercased()
        let etaPool = ["ETA 4 min", "ETA 7 min", "ETA 12 min"]
        let names: [(String, String, [String])]
        if cat.contains("aviation") || cat.contains("jet") || cat.contains("charter") {
            base = 2_800_000
            names = [
                ("Stratos Jet Charters", "Ultra-Long-Range Global Fleet", ["Heavy-jet cabin", "Catering & champagne", "Ground transport", "Flexible departure"]),
                ("Solitaire Aviation", "Boutique Private Aviation", ["Heavy-jet cabin", "Catering & champagne included", "Ground transport on both ends", "Flexible departure ±2 hr"]),
                ("Vector Air", "On-Demand Global Charter", ["Mid-size to Heavy jets", "Instant dispatch", "Concierge handling", "Global reach"])
            ]
        } else if cat.contains("marine") || cat.contains("yacht") {
            names = [
                ("Riviera Yachts", "Private day charters & overnights", ["Captain & crew included", "Tender + watersports gear", "Onboard chef option", "Champagne welcome"]),
                ("Azure Marine", "Boutique superyacht fleet", ["Sunset cruise route", "Premium bar package", "Live DJ add-on", "Photographer on board"]),
                ("Helios Sailing", "Designer sailing experiences", ["Skipper + first mate", "Gourmet picnic basket", "Snorkel gear included", "Flexible itinerary"])
            ]
        } else if cat.contains("dining") || cat.contains("chef") {
            names = [
                ("Maison Noir Private Chefs", "Michelin-trained in-suite team", ["Michelin-level private chef", "Bespoke 7-course tasting", "Wine pairing included", "Service staff & cleanup"]),
                ("Atelier Gastronomy", "Curated tasting experiences", ["Seasonal market menu", "Sommelier pairing", "Plated tableside", "Dietary tailoring"]),
                ("Crown Table", "Celebrity-chef pop-ups", ["Guest-chef collaboration", "Champagne reception", "Custom menu cards", "Memorable plating"])
            ]
        } else if cat.contains("chauffeur") || cat.contains("valet") || cat.contains("car") {
            names = [
                ("Onyx Black Car", "Executive chauffeur fleet", ["S-Class & EQS fleet", "Suited chauffeur", "Bottled water & Wi-Fi", "Flight tracking included"]),
                ("Apex Chauffeur Co.", "Concierge-grade arrivals", ["Door-to-door service", "Discreet protection option", "Child-seat ready", "Live ETA updates"]),
                ("Skyline Valet & Drive", "Top-rated near this patch", ["White-glove valet", "EV-priority parking", "Detailing on request", "24/7 retrieval"])
            ]
        } else if cat.contains("wellness") || cat.contains("spa") || cat.contains("recovery") {
            names = [
                ("Lumen Wellness", "In-suite spa & recovery", ["Licensed therapists", "Cryo & contrast therapy", "IV hydration add-on", "Same-day booking"]),
                ("Verdant Longevity", "Performance & longevity care", ["Concierge MD visit", "Lymphatic + deep-tissue", "Sleep recovery protocol", "Sound healing"]),
                ("Serenity House", "Holistic spa experience", ["Couples ritual option", "Aromatherapy tailored", "Hydrotherapy add-on", "Discreet in-suite setup"])
            ]
        } else if cat.contains("concierge") || cat.contains("lifestyle") {
            names = [
                ("Bytspot Black Concierge", "House lifestyle desk", ["Dedicated lifestyle manager", "24/7 chat", "Same-day fulfillment", "Money-back guarantee"]),
                ("Maison Concierge", "European-style hospitality", ["Multilingual team", "Discreet handling", "Reservation specialists", "Travel desk included"]),
                ("Pinnacle Lifestyle", "Global luxury logistics", ["Last-minute capable", "Trusted vendor network", "Live status updates", "Receipts on demand"])
            ]
        } else if cat.contains("event") || cat.contains("vip") || cat.contains("access") || cat.contains("ticket") {
            names = [
                ("Noir Hospitality", "Sold-out access & private hosts", ["No-wait entry", "Reserved table option", "Private host on arrival", "Bottle service add-on"]),
                ("Atelier Access", "Curated VIP experiences", ["Skip-the-line entry", "Dedicated concierge", "Coat check included", "Late-night extension"]),
                ("Crown Circle Events", "Members-only premieres", ["Front-of-house seating", "Photographer add-on", "Welcome amenity", "Priority taxi queue"])
            ]
        } else {
            names = [
                ("Bytspot Signature", "House luxury concierge", ["Dedicated specialist", "24/7 chat", "Same-day fulfillment", "Money-back guarantee"]),
                ("Maison Concierge", "European-style hospitality", ["Multilingual team", "Discreet handling", "Reservation specialists", "Travel desk included"]),
                ("Pinnacle Services", "Local luxury logistics", ["Last-minute capable", "Trusted vendor network", "Live status updates", "Receipts on demand"])
            ]
        }
        return names.enumerated().map { idx, entry in
            let multiplier = [1.0, 1.18, 1.45][idx % 3]
            return ClipVendor(
                id: "\(service.id)-vendor-\(idx)",
                name: entry.0,
                tagline: entry.1,
                priceFromCents: Int(Double(base) * multiplier),
                currency: service.currency,
                rating: [4.9, 4.8, 4.7][idx % 3],
                etaLabel: etaPool[idx % etaPool.count],
                heroImageURL: nil,
                availability: idx == 0 ? "Available now" : (idx == 1 ? "Available tonight" : "Available this week"),
                includedHighlights: entry.2,
                serviceId: service.id,
                media: Self.previewMedia(serviceId: service.id, index: idx)
            )
        }
    }

    /// DEBUG-only sample HLS poster + playback URL so the player surface can
    /// be visually verified in the simulator before the real Mux pipeline is wired up.
    /// Returns nil in Release builds so no third-party media leaks into production.
    private static func previewMedia(serviceId: String, index: Int) -> ClipVendorMedia? {
        #if DEBUG
        guard index == 0 else { return nil }
        return ClipVendorMedia(
            kind: .video,
            posterURL: URL(string: "https://image.mux.com/maGUgL01ahB3014Aatfpkmlmni02DTaWvb/thumbnail.jpg?width=720&time=2"),
            videoPlaybackURL: URL(string: "https://stream.mux.com/maGUgL01ahB3014Aatfpkmlmni02DTaWvb.m3u8"),
            durationMs: 12000,
            width: 1920,
            height: 1080
        )
        #else
        _ = serviceId; _ = index
        return nil
        #endif
    }

    /// Platinum and Green vendor pools. Names lean local/neighborhood (Platinum)
    /// and cottage-industry (Green). Price floors track tier.minimumCents.
    private static func tieredFallbacks(for service: ClipLocalService, tier: BytspotTier) -> [ClipVendor] {
        let base = max(service.amountCents ?? tier.minimumCents, tier.minimumCents)
        let cat = (service.category ?? service.id).lowercased()
        let etaPool: [String] = tier == .green
            ? ["Same day", "Tomorrow", "This week"]
            : ["ETA 6 min", "ETA 12 min", "ETA 20 min"]
        let pools: [(String, String, [String])]
        switch tier {
        case .platinum:
            if cat.contains("park") {
                pools = [
                    ("Atlanta Park Co.", "Reserved garage spots downtown", ["Guaranteed spot", "Covered parking", "EV chargers on level 3", "In/out privileges"]),
                    ("SafePark Valet", "Attended lot near venue", ["Attendant on duty", "Camera-monitored", "Walk to entry < 3 min", "Validated by venue"]),
                    ("CityHub Garage", "Mid-tier downtown garage", ["Hourly or flat rate", "Mobile-pay entry", "Indoor levels", "24/7 access"])
                ]
            } else if cat.contains("dining") || cat.contains("food") || cat.contains("table") {
                pools = [
                    ("Cellar 47", "Neighborhood wine bar", ["Priority booking", "Sommelier on staff", "Patio seating option", "Late-night menu"]),
                    ("The Brass Owl", "American bistro", ["Reserved table", "Locally-sourced menu", "Cocktail program", "Group of 6 capable"]),
                    ("Maru Izakaya", "Modern izakaya", ["Counter or table", "Tasting menu option", "Sake pairing", "Reservation hold"])
                ]
            } else if cat.contains("valet") || cat.contains("ride") || cat.contains("car") {
                pools = [
                    ("CityValet", "Trusted city valet team", ["White-glove handoff", "5-min retrieval", "Detailing add-on", "Insurance covered"]),
                    ("Apex Rideshare", "Premium SUV rideshare", ["Black-car fleet", "Bottled water", "Live tracking", "Driver bio shown"]),
                    ("MetroDrive", "On-demand chauffeur", ["Door-to-door", "Flight tracking", "Child seat ready", "Receipt by email"])
                ]
            } else if cat.contains("event") || cat.contains("entry") || cat.contains("ticket") || cat.contains("nightlife") || cat.contains("bottle") {
                pools = [
                    ("Front Row Access", "Verified entry partner", ["Skip-the-line", "Wristband at gate", "Re-entry allowed", "Coat check"]),
                    ("Velvet Rope", "Nightlife hospitality", ["Reserved table", "Bottle package", "Host on arrival", "Late-night extension"]),
                    ("CityList Events", "Curated mid-tier ticketing", ["Verified seating", "Mobile entry", "Refund window", "Group pricing"])
                ]
            } else {
                pools = [
                    ("Local Concierge", "Neighborhood lifestyle desk", ["Same-day fulfillment", "Trusted vendor network", "Live status updates", "Receipts on demand"]),
                    ("CityHelp Co.", "On-call services in your area", ["Verified providers", "Hourly or flat rate", "Background-checked", "Money-back guarantee"]),
                    ("Pinpoint Services", "Mid-tier local logistics", ["Last-minute capable", "App-based dispatch", "Service guarantee", "Loyalty points"])
                ]
            }
        case .green:
            if cat.contains("farm") || cat.contains("produce") {
                pools = [
                    ("Peachtree Farm", "Family farm, weekend pickup", ["Picked this morning", "Seasonal varieties", "Cash or app pay", "Refill any container"]),
                    ("Neighbor Greens", "Backyard market garden", ["Hyper-local produce", "Microgreens & herbs", "Subscription box option", "Compost return"]),
                    ("Sunset Orchard", "Family fruit orchard", ["Tree-ripe fruit", "Pick-your-own days", "Honey & preserves", "Donate-a-bushel option"])
                ]
            } else if cat.contains("baked") || cat.contains("bread") || cat.contains("treat") {
                pools = [
                    ("Hattie's Kitchen", "Home-baked sourdough", ["Same-day baked", "Custom orders welcome", "Pickup or porch drop", "Sourdough starter included"]),
                    ("Sweet Corner", "Neighborhood bakery", ["Cookies, cake, pastries", "Gluten-free option", "Made-to-order", "Party trays"]),
                    ("Rise & Crumb", "Specialty bread + scones", ["Wood-fired oven", "Weekly subscription", "Allergen-aware", "Repeat-customer perks"])
                ]
            } else if cat.contains("lesson") || cat.contains("tutor") || cat.contains("music") {
                pools = [
                    ("Studio 7", "In-home music lessons", ["30 or 60 min", "All ages welcome", "Beginner-friendly", "Recital opportunities"]),
                    ("Maple Tutoring", "K-12 subject tutors", ["Background-checked", "Math, reading, science", "Virtual or in-person", "Progress reports"]),
                    ("Hands-On Academy", "Hobby & skill classes", ["Pottery, art, coding", "Small groups", "Drop-in or series", "Materials included"])
                ]
            } else if cat.contains("pet") {
                pools = [
                    ("Paw Patrol Neighbors", "Trusted local pet walkers", ["Insured walkers", "Mid-day visits", "Live photos", "Last-minute capable"]),
                    ("Whiskers & Co.", "Cat-sitting specialist", ["Twice-daily visits", "Litter service", "Photo updates", "Medication management"]),
                    ("Backyard Boarding", "Home boarding, not kennel", ["Sleeps in the house", "Daily walks", "Live cam option", "Senior dog friendly"])
                ]
            } else if cat.contains("detail") || cat.contains("car") {
                pools = [
                    ("Mobile Shine", "Driveway detailing", ["Eco-friendly products", "Hand wash + wax", "Interior shampoo", "Pet hair specialist"]),
                    ("DriveBright", "Wash + ceramic prep", ["Foam cannon wash", "Tire dressing", "Engine bay clean", "Inside windows"]),
                    ("EcoSuds", "Waterless detail crew", ["No-water service", "Bio-degradable", "Apartment-friendly", "Monthly plan"])
                ]
            } else if cat.contains("repair") || cat.contains("handy") || cat.contains("home") {
                pools = [
                    ("Handy Neighbors", "Trusted small-job crew", ["TV mounting", "Furniture assembly", "Picture hanging", "Hourly pricing"]),
                    ("FixIt Co.", "General home repairs", ["Drywall patch", "Door & lock fixes", "Faucet replacement", "Same-week scheduling"]),
                    ("Toolbox Rangers", "Neighborhood repair team", ["Light electrical", "Light plumbing", "Caulking & grout", "Photo proof of work"])
                ]
            } else {
                pools = [
                    ("Neighborly Co.", "Friendly local help desk", ["Hourly rates", "Background-checked", "Cash or app pay", "Local references"]),
                    ("CommunityFix", "Neighborhood services", ["Same-week scheduling", "Honest pricing", "Photo proof of work", "Repeat-customer perks"]),
                    ("Around the Block", "Cottage-industry directory", ["Verified neighbors", "Hyper-local", "Flexible scheduling", "Community-supported"])
                ]
            }
        case .black:
            // Unreachable: handled by the legacy black-flavored branch in fallbacks(for:tier:).
            pools = []
        }
        return pools.enumerated().map { idx, entry in
            let multiplier = [1.0, 1.18, 1.45][idx % 3]
            return ClipVendor(
                id: "\(service.id)-vendor-\(idx)",
                name: entry.0,
                tagline: entry.1,
                priceFromCents: max(Int(Double(base) * multiplier), tier.minimumCents),
                currency: service.currency,
                rating: [4.9, 4.8, 4.7][idx % 3],
                etaLabel: etaPool[idx % etaPool.count],
                heroImageURL: nil,
                availability: idx == 0 ? "Available now" : (idx == 1 ? "Available tonight" : "Available this week"),
                includedHighlights: entry.2,
                serviceId: service.id,
                media: Self.previewMedia(serviceId: service.id, index: idx)
            )
        }
    }
}

struct ClipPaymentSecureResult: Equatable {
    let bookingId: String?
    let status: String
    let message: String
}

/// Thin REST client for the Clip target. Mirrors the App's tRPC shape but
/// speaks plain JSON over the HTTP adapter so the Clip stays lightweight.
struct ClipPatchVerifier {
    enum VerifyError: Error {
        case missingToken
        case network(String)
        case server(String)
        case decode
    }

    struct VerifiedPatch: Decodable {
        let id: String
        let label: String?
        let status: String
        let bindingType: String?
        let bindingId: String?
    }

    struct VerifiedBinding: Decodable {
        let type: String
        let id: String
    }

    struct VerifyResult: Decodable {
        let verified: Bool
        let patch: VerifiedPatch
        let binding: VerifiedBinding?
    }

    static let baseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "BytspotAPIBaseURL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://bytspot-api.onrender.com")!
    }()

    func resolvePatch(patchId: String, tier: BytspotTier = .black) async throws -> ClipPatchContext {
        let payload = try await getTRPC("patch.resolve", input: ["patchId": patchId, "tier": tier.rawValue])
        guard let root = payload as? [String: Any] else { throw VerifyError.decode }
        let patch = root["patch"] as? [String: Any]
        let vendor = root["vendor"] as? [String: Any]
        let service = root["service"] as? [String: Any]

        let resolvedId = string(patch?["id"]) ?? string(patch?["uid"]) ?? patchId
        let vendorName = string(vendor?["displayName"]) ?? string(vendor?["name"])
        let serviceName = string(service?["title"]) ?? string(service?["name"])
        let label = string(patch?["label"]) ?? string(patch?["name"])
        let title = vendorName ?? label ?? "Bytspot Patch"
        let subtitle = serviceName ?? string(root["type"])?.replacingOccurrences(of: "_", with: " ").capitalized ?? tier.defaultSubtitle
        let coords = (vendor?["coordinates"] as? [String: Any]) ?? (patch?["coordinates"] as? [String: Any]) ?? (root["coordinates"] as? [String: Any])
        let lat = Self.double(coords?["lat"]) ?? Self.double(coords?["latitude"]) ?? Self.double(vendor?["lat"]) ?? Self.double(vendor?["latitude"])
        let lon = Self.double(coords?["lng"]) ?? Self.double(coords?["lon"]) ?? Self.double(coords?["longitude"]) ?? Self.double(vendor?["lng"]) ?? Self.double(vendor?["longitude"])
        // Server tier (if surfaced) wins over the URL-derived tier so a
        // re-tiered patch reflects backend authority on the next resolve.
        let serverTierRaw = string(root["tier"]) ?? string(patch?["tier"]) ?? string(vendor?["tier"])
        let serverTier = serverTierRaw.flatMap { BytspotTier(rawValue: $0.lowercased()) }
        return ClipPatchContext(
            patchId: resolvedId,
            title: title,
            subtitle: subtitle,
            status: string(patch?["status"]) ?? "active",
            venueId: string(vendor?["id"]) ?? string(root["venueId"]),
            serviceId: string(service?["id"]),
            tier: serverTier ?? tier,
            latitude: lat,
            longitude: lon
        )
    }

    func searchServices(patchId: String, tier: BytspotTier = .black, limit: Int = 24) async throws -> [ClipLocalService] {
        let payload = try await getTRPC("vendors.search", input: ["patchId": patchId, "tier": tier.rawValue, "limit": limit])
        guard let root = payload as? [String: Any] else { return [] }
        let rows = (root["services"] as? [[String: Any]]) ?? (root["vendors"] as? [[String: Any]]) ?? []
        let mapped = rows.prefix(8).enumerated().map { index, row in
            normalizeService(row, index: index)
        }
        return mapped.filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    func searchVendors(service: ClipLocalService, patchId: String?, tier: BytspotTier = .black, limit: Int = 6) async throws -> [ClipVendor] {
        var input: [String: Any] = ["serviceId": service.id, "tier": tier.rawValue, "limit": limit]
        if let patchId { input["patchId"] = patchId }
        let payload = try await getTRPC("vendors.search", input: input)
        guard let root = payload as? [String: Any] else { return [] }
        let rows = (root["vendors"] as? [[String: Any]]) ?? (root["services"] as? [[String: Any]]) ?? []
        let mapped = rows.prefix(limit).enumerated().compactMap { index, row in
            normalizeVendor(row, service: service, index: index)
        }
        return mapped.filter { !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    func verify(token: String?) async throws -> VerifyResult {
        guard let token, !token.isEmpty else { throw VerifyError.missingToken }

        var req = URLRequest(url: Self.baseURL.appendingPathComponent("trpc/patch.verifyTap"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 8
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "token": token
        ])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw VerifyError.network("No response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                ?? "HTTP \(http.statusCode)"
            throw VerifyError.server(msg)
        }

        // tRPC HTTP adapter wraps mutation results as { result: { data: ... } }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = root["result"] as? [String: Any],
              let payload = result["data"] else {
            throw VerifyError.decode
        }
        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        do {
            return try JSONDecoder().decode(VerifyResult.self, from: payloadData)
        } catch {
            throw VerifyError.decode
        }
    }

    func authorizeApplePaySecure(
        service: ClipLocalService,
        patchId: String?,
        stripePaymentMethodId: String,
        amountCents: Int,
        guestContact: [String: String]? = nil
    ) async throws -> ClipPaymentSecureResult {
        var input: [String: Any] = [
            "serviceId": service.id,
            "patchId": patchId ?? NSNull(),
            "amountCents": amountCents,
            "currency": service.currency.lowercased(),
            "stripePaymentMethodId": stripePaymentMethodId,
            "captureMode": "manual",
            "source": "app_clip.apple_pay_secure"
        ]
        if let guestContact, !guestContact.isEmpty {
            input["guestContact"] = guestContact
        }
        let payload = try await postTRPC("booking.authorizeApplePayHold", input: input)
        let root = payload as? [String: Any]
        return ClipPaymentSecureResult(
            bookingId: Self.string(root?["bookingId"]),
            status: Self.string(root?["status"]) ?? "authorized",
            message: Self.string(root?["message"]) ?? "Apple Pay Secure authorized."
        )
    }

    private func getTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var components = URLComponents(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"), resolvingAgainstBaseURL: false)
        let inputData = try JSONSerialization.data(withJSONObject: input)
        components?.queryItems = [URLQueryItem(name: "input", value: String(data: inputData, encoding: .utf8))]
        guard let url = components?.url else { throw VerifyError.network("Bad URL") }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 8
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else { throw VerifyError.server("HTTP \(http.statusCode)") }
        return try unwrapTRPCPayload(data)
    }

    private func postTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var req = URLRequest(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = Self.authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.timeoutInterval = 10
        req.httpBody = try JSONSerialization.data(withJSONObject: input)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                ?? "HTTP \(http.statusCode)"
            throw VerifyError.server(msg)
        }
        return try unwrapTRPCPayload(data)
    }

    private func unwrapTRPCPayload(_ data: Data) throws -> Any {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw VerifyError.decode }
        if let error = root["error"] as? [String: Any] {
            throw VerifyError.server(Self.string(error["message"]) ?? "Server error")
        }
        if let result = root["result"] as? [String: Any], let payload = result["data"] {
            return payload
        }
        return root
    }

    private func normalizeService(_ row: [String: Any], index: Int) -> ClipLocalService {
        let vendor = row["vendor"] as? [String: Any]
        let rawCategory = Self.string(row["category"]) ?? Self.string(row["serviceCategory"]) ?? Self.string(vendor?["category"])
        let title = Self.string(row["title"]) ?? Self.string(row["name"]) ?? Self.string(vendor?["displayName"]) ?? "Local Service"
        let desc = Self.string(row["description"]) ?? Self.string(row["serviceSubtitle"]) ?? rawCategory ?? "Available near this verified patch."
        let action = Self.string(row["ctaText"]) ?? Self.string(row["action"]) ?? "Book Apple Pay Secure"
        let rawAmount = Self.int(row["priceCents"]) ?? Self.int(row["amountCents"])
        let currency = Self.string(row["currency"])?.uppercased() ?? "USD"
        let price = Self.string(row["entryPrice"]) ?? Self.string(row["price"]) ?? rawAmount.map { Self.formatCurrency(cents: $0, currency: currency) }
        let category = (rawCategory ?? title).lowercased()
        let icon: String
        let tint: String
        if category.contains("park") || category.contains("car") {
            icon = "car.side.lock.fill"; tint = "cyan"
        } else if category.contains("vip") || category.contains("access") || category.contains("entry") {
            icon = "crown.fill"; tint = "gold"
        } else if category.contains("pay") || category.contains("book") {
            icon = "creditcard.and.123"; tint = "emerald"
        } else if category.contains("concierge") || category.contains("help") {
            icon = "sparkles"; tint = "violet"
        } else {
            icon = "checkmark.seal.fill"; tint = "emerald"
        }
        let heroURL = Self.url(row["heroImageUrl"]) ?? Self.url(row["imageUrl"]) ?? Self.url(vendor?["heroImageUrl"]) ?? Self.url(vendor?["imageUrl"])
        return ClipLocalService(
            id: Self.string(row["id"]) ?? Self.string(row["vendorServiceId"]) ?? "service-\(index)",
            title: title,
            subtitle: desc,
            action: action,
            iconName: icon,
            tintName: tint,
            priceLabel: price,
            amountCents: rawAmount,
            currency: currency,
            source: "live",
            heroImageURL: heroURL,
            category: rawCategory
        )
    }

    private func normalizeVendor(_ row: [String: Any], service: ClipLocalService, index: Int) -> ClipVendor? {
        let vendor = (row["vendor"] as? [String: Any]) ?? row
        let name = Self.string(vendor["displayName"]) ?? Self.string(vendor["name"]) ?? Self.string(row["title"])
        guard let resolvedName = name, !resolvedName.isEmpty else { return nil }
        let tagline = Self.string(vendor["tagline"]) ?? Self.string(row["description"]) ?? Self.string(row["serviceSubtitle"]) ?? service.subtitle
        let priceCents = Self.int(row["priceCents"]) ?? Self.int(row["amountCents"]) ?? Self.int(vendor["priceFromCents"]) ?? service.amountCents ?? 5000
        let currency = Self.string(row["currency"])?.uppercased() ?? service.currency
        let rating = Self.double(vendor["rating"]) ?? Self.double(row["rating"])
        let eta = Self.string(row["etaLabel"]) ?? Self.string(vendor["etaLabel"])
        let hero = Self.url(vendor["heroImageUrl"]) ?? Self.url(row["heroImageUrl"]) ?? Self.url(vendor["imageUrl"])
        let availability = Self.string(row["availability"]) ?? Self.string(vendor["availability"]) ?? "Available now"
        let highlights = (row["highlights"] as? [String]) ?? (vendor["highlights"] as? [String]) ?? []
        let media = Self.parseMedia(primary: row["media"], fallback: vendor["media"], posterFallback: hero)
        return ClipVendor(
            id: Self.string(vendor["id"]) ?? Self.string(row["id"]) ?? "\(service.id)-vendor-\(index)",
            name: resolvedName,
            tagline: tagline,
            priceFromCents: priceCents,
            currency: currency,
            rating: rating,
            etaLabel: eta,
            heroImageURL: hero,
            availability: availability,
            includedHighlights: highlights,
            serviceId: service.id,
            media: media
        )
    }

    /// Parse a `media` block off a tRPC `vendors.search` row. Shape mirrors the
    /// planned `vendor_media` table: { kind, posterUrl, videoPlaybackUrl|playbackUrl, durationMs, width, height }.
    /// Returns nil when neither a video playback URL nor a usable poster is available.
    private static func parseMedia(primary: Any?, fallback: Any?, posterFallback: URL?) -> ClipVendorMedia? {
        let block = (primary as? [String: Any]) ?? (fallback as? [String: Any])
        guard let block else { return nil }
        let rawKind = string(block["kind"])?.lowercased() ?? "image"
        let kind: ClipVendorMedia.Kind = rawKind == "video" ? .video : .image
        let video = url(block["videoPlaybackUrl"]) ?? url(block["playbackUrl"]) ?? url(block["hlsUrl"])
        let poster = url(block["posterUrl"]) ?? url(block["thumbnailUrl"]) ?? url(block["imageUrl"]) ?? posterFallback
        guard video != nil || poster != nil else { return nil }
        return ClipVendorMedia(
            kind: video != nil ? .video : kind,
            posterURL: poster,
            videoPlaybackURL: video,
            durationMs: int(block["durationMs"]),
            width: int(block["width"]),
            height: int(block["height"])
        )
    }

    private static func string(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let value = value as? String, !value.isEmpty { return value }
        if let value = value as? NSNumber { return value.stringValue }
        return nil
    }

    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private static func double(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? NSNumber { return value.doubleValue }
        if let value = value as? String { return Double(value) }
        return nil
    }

    private static func url(_ value: Any?) -> URL? {
        guard let raw = string(value) else { return nil }
        return URL(string: raw)
    }

    private static func formatCurrency(cents: Int, currency: String) -> String {
        let dollars = Double(cents) / 100.0
        if currency.uppercased() == "USD" {
            return String(format: "$%.0f secure", dollars)
        }
        return "\(currency.uppercased()) \(String(format: "%.2f", dollars)) secure"
    }

    private func string(_ value: Any?) -> String? { Self.string(value) }

    private static var authToken: String? {
        let defaults = UserDefaults.standard
        let candidates = [
            defaults.string(forKey: "bytspot_auth_token"),
            defaults.string(forKey: "BytspotAuthToken")
        ]
        return candidates
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && $0 != "guest_session" && $0 != "beta_guest" }
    }
}
