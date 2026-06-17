import Foundation

struct BytspotAPIClient {
    enum APIError: Error {
        case invalidURL
        case invalidResponse
        case server(status: Int, body: String)
    }

    var baseURL: URL = URL(string: "https://bytspot-api.onrender.com")!
    var tokenProvider: () -> String? = { nil }
    var urlSession: URLSession = .shared

    func makeRequest(path: String, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    func data(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        let request = try makeRequest(path: path, method: method, body: body)
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    func json(path: String, method: String = "GET", body: Data? = nil) async throws -> Any {
        try JSONSerialization.jsonObject(with: try await data(path: path, method: method, body: body))
    }
}

struct NativeAPISessionSnapshot: Equatable {
    enum Mode: Equatable { case signedOut, guest, tokenPresent }

    let mode: Mode
    let baseHost: String
    let route: String
    let attachesBearerToken: Bool

    var title: String {
        switch mode {
        case .signedOut: return "API session: signed out"
        case .guest: return "API session: guest preview"
        case .tokenPresent: return "API session: token ready"
        }
    }

    var subtitle: String {
        let auth = attachesBearerToken ? "Bearer token attached" : "No bearer token attached"
        return "\(auth) · \(baseHost)\(route)"
    }
}

@MainActor
final class NativeAPIState: ObservableObject {
    @Published private(set) var snapshot = NativeAPISessionSnapshot(mode: .signedOut, baseHost: "bytspot-api.onrender.com", route: "/health", attachesBearerToken: false)

    func refresh(sessionStore: BytspotSessionStore) {
        let mode: NativeAPISessionSnapshot.Mode = sessionStore.isAuthenticated ? .tokenPresent : sessionStore.isGuest ? .guest : .signedOut
        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            let request = try client.makeRequest(path: "/health")
            snapshot = NativeAPISessionSnapshot(
                mode: mode,
                baseHost: request.url?.host ?? "bytspot-api.onrender.com",
                route: request.url?.path.isEmpty == false ? request.url?.path ?? "/health" : "/health",
                attachesBearerToken: request.value(forHTTPHeaderField: "Authorization") != nil
            )
        } catch {
            snapshot = NativeAPISessionSnapshot(mode: mode, baseHost: "configuration pending", route: "/health", attachesBearerToken: false)
        }
    }
}

/// Live premium-entitlement source of truth. Mirrors the React
/// trpc.subscription.status.isPremium query: for an authenticated session it fetches
/// /trpc/subscription.status and publishes the BytspotMembership the Map Functions
/// sheet gates against. The BYT_NATIVE_PREVIEW_PREMIUM override always wins (with no
/// network), and everything else fails safe to .free — guests, signed-out sessions,
/// and any fetch error — exactly as the web silently defaults to free for guests/errors.
@MainActor
final class NativeMembershipStore: ObservableObject {
    @Published private(set) var membership: BytspotMembership = .preview

    func refresh(sessionStore: BytspotSessionStore) async {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        if BytspotMembership.preview == .premium { membership = .premium; return }
        guard sessionStore.isAuthenticated else { membership = .free; return }

        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            let payload = try await client.json(path: "/trpc/subscription.status")
            membership = Self.findBool(named: "isPremium", in: payload) == true ? .premium : .free
        } catch {
            membership = .free
        }
    }

    /// Recursively extracts a named boolean from a decoded tRPC payload, tolerating
    /// either the plain ({result:{data:{isPremium}}}) or superjson
    /// ({result:{data:{json:{isPremium}}}}) envelope shape.
    nonisolated static func findBool(named name: String, in value: Any) -> Bool? {
        guard let dict = value as? [String: Any] else { return nil }
        if let flag = dict[name] as? Bool { return flag }
        if let number = dict[name] as? NSNumber { return number.boolValue }
        for child in dict.values { if let found = findBool(named: name, in: child) { return found } }
        return nil
    }
}

struct NativeCrowdSummary: Equatable {
    let level: Int
    let label: String
    let waitMins: Int?
}

struct NativeParkingSummary: Equatable {
    let totalAvailable: Int
    let priceLabel: String
}

struct NativeVenueSummary: Identifiable, Equatable {
    let id: String
    let name: String
    let category: String
    let address: String
    let distance: String
    let rating: Double?
    let latitude: Double
    let longitude: Double
    let crowd: NativeCrowdSummary?
    let parking: NativeParkingSummary
    let verifiedPatchId: String?
    let imageUrl: URL?

    var discoverType: String {
        let normalized = category.lowercased()
        if normalized.contains("restaurant") || normalized.contains("food") { return "dining" }
        if normalized.contains("bar") || normalized.contains("club") || normalized.contains("nightlife") { return "nightlife" }
        if normalized.contains("coffee") || normalized.contains("cafe") { return "coffee" }
        if normalized.contains("parking") || normalized.contains("garage") { return "parking" }
        if normalized.contains("fitness") || normalized.contains("gym") { return "fitness" }
        if normalized.contains("shop") || normalized.contains("market") { return "shopping" }
        if normalized.contains("event") || normalized.contains("entertainment") { return "entertainment" }
        return "venue"
    }
}

struct NativeDiscoverSummary: Identifiable, Equatable {
    let id: String
    let type: String
    let title: String
    let subtitle: String
    let distance: String
    let rating: String
    let icon: String
    let verified: Bool
    let entryType: String
    let cta: String
    let imageUrl: URL?
    let categoryLabel: String
    let badgeText: String
    let metadataLine: String
    let features: [String]
    let vibeScore: Int
    let availability: String
    let membershipRequired: Bool
}

struct NativeEventSummary: Identifiable, Equatable {
    let id: String
    let title: String
    let venue: String
    let time: String
    let price: String
    let emoji: String
    let imageUrl: URL?
}

struct NativeTabContentSnapshot: Equatable {
    enum Source: String { case fallback, live, mixed }
    let venues: [NativeVenueSummary]
    let discoverCards: [NativeDiscoverSummary]
    let events: [NativeEventSummary]
    let source: Source
    let lastUpdated: Date?
    let errorMessage: String?

    var statusLabel: String {
        switch source {
        case .live: return "LIVE API"
        case .mixed: return "MIXED"
        case .fallback: return "CURATED"
        }
    }
}

@MainActor
final class NativeTabContentStore: ObservableObject {
    @Published private(set) var snapshot = NativeTabContentSnapshot.fallback
    @Published private(set) var isRefreshing = false

    func refresh(sessionStore: BytspotSessionStore) async {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        let client = BytspotAPIClient(tokenProvider: { sessionStore.canAttachBearerToken ? sessionStore.token : nil })
        do {
            async let venues = fetchVenues(client: client)
            async let events = fetchEvents(client: client)
            async let vendorServices = fetchVendorServices(client: client)
            let liveVenues = try await venues
            let liveServices = (try? await vendorServices) ?? []
            let liveEvents = (try? await events) ?? NativeTabContentSnapshot.fallback.events
            let cards = Self.discoverCards(from: liveVenues, services: liveServices)
            snapshot = NativeTabContentSnapshot(
                venues: liveVenues.isEmpty ? NativeTabContentSnapshot.fallback.venues : liveVenues,
                discoverCards: cards,
                events: liveEvents,
                source: liveVenues.isEmpty && liveServices.isEmpty ? .fallback : .live,
                lastUpdated: Date(),
                errorMessage: nil
            )
        } catch {
            snapshot = NativeTabContentSnapshot(
                venues: NativeTabContentSnapshot.fallback.venues,
                discoverCards: NativeTabContentSnapshot.fallback.discoverCards,
                events: NativeTabContentSnapshot.fallback.events,
                source: .fallback,
                lastUpdated: Date(),
                errorMessage: "Live tab data unavailable; using curated React parity fixtures."
            )
        }
    }

    private func fetchVendorServices(client: BytspotAPIClient) async throws -> [NativeDiscoverSummary] {
        let input = try JSONSerialization.data(withJSONObject: ["limit": 20, "tier": "platinum"])
        var components = URLComponents(string: "/trpc/vendors.search")!
        components.queryItems = [URLQueryItem(name: "input", value: String(data: input, encoding: .utf8))]
        let payload = try await client.json(path: components.string ?? "/trpc/vendors.search")
        guard let rows = Self.findArray(named: "services", in: payload) ?? Self.findArray(named: "vendors", in: payload) else { return [] }
        return rows.enumerated().compactMap { index, value in
            guard let item = value as? [String: Any] else { return nil }
            return Self.serviceCard(from: item, index: index)
        }
    }

    private func fetchVenues(client: BytspotAPIClient) async throws -> [NativeVenueSummary] {
        let payload = try await client.json(path: "/trpc/venues.list")
        guard let rows = Self.findArray(named: "venues", in: payload) else { return [] }
        return rows.compactMap(Self.venue(from:))
    }

    private func fetchEvents(client: BytspotAPIClient) async throws -> [NativeEventSummary] {
        let payload = try await client.json(path: "/trpc/events.list")
        guard let rows = Self.findArray(named: "events", in: payload) else { return [] }
        return rows.enumerated().compactMap { index, value in
            guard let item = value as? [String: Any] else { return nil }
            return NativeEventSummary(
                id: Self.string(item, ["id"]) ?? "event-\(index)",
                title: Self.string(item, ["title", "name"]) ?? "Tonight's Event",
                venue: Self.string(item, ["venue", "venueName", "location"]) ?? "Midtown",
                time: Self.string(item, ["time", "startsAt"]) ?? "Tonight",
                price: Self.string(item, ["price", "priceLabel"]) ?? "Free",
                emoji: Self.string(item, ["emoji"]) ?? "🎭",
                imageUrl: Self.url(item, ["imageUrl", "image_url", "photoUrl", "image", "heroImage"])
            )
        }
    }

    static func discoverCards(from venues: [NativeVenueSummary], services: [NativeDiscoverSummary] = []) -> [NativeDiscoverSummary] {
        let venueCards = venues.prefix(8).map { venue in
            let type = venue.discoverType
            let spots = venue.parking.totalAvailable
            let meta = spots > 0 ? "\(venue.parking.priceLabel) • \(spots) spots" : venue.parking.priceLabel
            let vibe = min(max((venue.crowd?.level ?? 2) * 2, 1), 10)
            return NativeDiscoverSummary(
                id: "venue-\(venue.id)",
                type: type,
                title: venue.name,
                subtitle: venue.address.isEmpty ? "Live venue from bytspot-api" : venue.address,
                distance: venue.distance,
                rating: venue.rating.map { String(format: "%.1f", $0) } ?? "4.5",
                icon: icon(for: type),
                verified: venue.verifiedPatchId != nil,
                entryType: "free",
                cta: venue.verifiedPatchId == nil ? "Open details" : "Tap verified",
                imageUrl: venue.imageUrl,
                categoryLabel: label(for: type),
                badgeText: "FREE ENTRY",
                metadataLine: meta,
                features: venueFeatureChips(venue),
                vibeScore: vibe,
                availability: venue.crowd?.label ?? "Open",
                membershipRequired: false
            )
        }
        let serviceCards = mergeCanonicalServices(into: services)
        let combined = Array(serviceCards + venueCards)
        return combined.isEmpty ? NativeTabContentSnapshot.fallback.discoverCards : combined
    }

    private static func serviceCard(from item: [String: Any], index: Int) -> NativeDiscoverSummary {
        let vendor = item["vendor"] as? [String: Any]
        let title = string(item, ["title", "name"]) ?? string(vendor, ["displayName", "name"]) ?? "Local Service"
        let subtitle = string(item, ["serviceSubtitle", "subtitle", "description"]) ?? string(vendor, ["tagline"]) ?? "Premium member service"
        let priceCents = int(item, ["priceCents", "amountCents", "priceFromCents"]) ?? int(vendor, ["priceCents", "amountCents", "priceFromCents"])
        let price = string(item, ["entryPrice", "price", "priceLabel"]) ?? priceCents.map { formatCurrency(cents: $0) } ?? "Member pricing"
        let rawCategory = string(item, ["category", "serviceCategory"]) ?? string(vendor, ["category"]) ?? "service"
        let rating = double(item, ["rating"]) ?? double(vendor, ["rating"])
        let features = ((item["includedHighlights"] as? [String]) ?? (item["features"] as? [String]) ?? (vendor?["includedHighlights"] as? [String]) ?? [])
        return NativeDiscoverSummary(
            id: string(item, ["id", "vendorServiceId"]) ?? string(vendor, ["id"]) ?? "service-\(index)",
            type: "service",
            title: title,
            subtitle: subtitle,
            distance: string(item, ["distance"]) ?? "Service",
            rating: rating.map { String(format: "%.1f", $0) } ?? "4.9",
            icon: icon(for: "service"),
            verified: true,
            entryType: "paid",
            cta: string(item, ["ctaText", "action"]) ?? "Book now",
            imageUrl: url(item, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]) ?? url(vendor, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]),
            categoryLabel: "Services",
            badgeText: "PAID CHECKOUT",
            metadataLine: "\(price) • \(string(item, ["availability", "availabilityWindow"]) ?? "Available now")",
            features: Array((features.isEmpty ? [rawCategory.capitalized, "Member service", "Verified provider"] : features).prefix(4)),
            vibeScore: min(max(int(item, ["vibeScore", "vibe"]) ?? 8, 1), 10),
            availability: string(item, ["availability"]) ?? "Available now",
            membershipRequired: true
        )
    }

    private static func mergeCanonicalServices(into liveServices: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var cards = liveServices
        for canonical in NativeTabContentSnapshot.canonicalServiceCards where !cards.contains(where: { $0.id == canonical.id || $0.title.caseInsensitiveCompare(canonical.title) == .orderedSame }) {
            cards.insert(canonical, at: min(cards.count, cards.isEmpty ? 0 : 1))
        }
        return cards
    }

    private static func venueFeatureChips(_ venue: NativeVenueSummary) -> [String] {
        var chips = [label(for: venue.discoverType), venue.crowd?.label ?? "Open"]
        if venue.parking.totalAvailable > 0 { chips.append("\(venue.parking.totalAvailable) spots") }
        if venue.verifiedPatchId != nil { chips.append("Bytspot verified") }
        return Array(chips.prefix(4))
    }

    private static func formatCurrency(cents: Int) -> String {
        let dollars = Double(cents) / 100.0
        return dollars.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "$%.0f", dollars) : String(format: "$%.2f", dollars)
    }

    private static func label(for type: String) -> String {
        switch type {
        case "dining": return "Dining"
        case "nightlife": return "Nightlife"
        case "coffee": return "Coffee"
        case "parking": return "Parking"
        case "entertainment": return "Events"
        case "fitness": return "Fitness"
        case "shopping": return "Shopping"
        case "service": return "Services"
        default: return "Nearby"
        }
    }

    private static func venue(from value: Any) -> NativeVenueSummary? {
        guard let item = value as? [String: Any] else { return nil }
        let id = string(item, ["id", "slug", "name"]) ?? UUID().uuidString
        let parkingDict = item["parking"] as? [String: Any]
        let spots = int(parkingDict, ["totalAvailable"]) ?? int(item, ["spots"]) ?? 0
        let firstSpot = (parkingDict?["spots"] as? [[String: Any]])?.first
        let price = int(firstSpot, ["pricePerHr"]).map { "$\($0)/hr" } ?? string(item, ["price", "entryPrice"]) ?? "—"
        let crowdDict = item["crowd"] as? [String: Any]
        let crowd = crowdDict.map { NativeCrowdSummary(level: int($0, ["level"]) ?? 1, label: string($0, ["label"]) ?? "Chill", waitMins: int($0, ["waitMins"])) }
        let patch = (item["hardwarePatch"] as? [String: Any]).flatMap { string($0, ["id", "patchId"]) }
        return NativeVenueSummary(
            id: id,
            name: string(item, ["name"]) ?? "Bytspot Venue",
            category: string(item, ["category"]) ?? "venue",
            address: string(item, ["address", "location"]) ?? "Atlanta, GA",
            distance: "—",
            rating: double(item, ["rating"]),
            latitude: double(item, ["lat", "latitude"]) ?? 33.7866,
            longitude: double(item, ["lng", "longitude"]) ?? -84.3833,
            crowd: crowd,
            parking: NativeParkingSummary(totalAvailable: spots, priceLabel: price),
            verifiedPatchId: patch,
            imageUrl: url(item, ["imageUrl", "image_url", "photoUrl", "image", "heroImage"])
        )
    }

    private static func url(_ dict: [String: Any]?, _ keys: [String]) -> URL? {
        guard let raw = string(dict, keys) else { return nil }
        return URL(string: raw)
    }

    private static func findArray(named name: String, in value: Any) -> [Any]? {
        if let array = value as? [Any] { return array }
        guard let dict = value as? [String: Any] else { return nil }
        if let array = dict[name] as? [Any] { return array }
        for child in dict.values { if let found = findArray(named: name, in: child) { return found } }
        return nil
    }

    private static func string(_ dict: [String: Any]?, _ keys: [String]) -> String? {
        guard let dict else { return nil }
        for key in keys { if let value = dict[key] as? String, !value.isEmpty { return value } }
        return nil
    }

    private static func int(_ dict: [String: Any]?, _ keys: [String]) -> Int? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Int { return value }
            if let value = dict[key] as? Double { return Int(value) }
            if let value = dict[key] as? String, let parsed = Int(value) { return parsed }
        }
        return nil
    }

    private static func double(_ dict: [String: Any]?, _ keys: [String]) -> Double? {
        guard let dict else { return nil }
        for key in keys {
            if let value = dict[key] as? Double { return value }
            if let value = dict[key] as? Int { return Double(value) }
            if let value = dict[key] as? String, let parsed = Double(value) { return parsed }
        }
        return nil
    }

    nonisolated static func icon(for type: String) -> String {
        switch type {
        case "dining": return "fork.knife"
        case "nightlife": return "music.note"
        case "coffee": return "cup.and.saucer.fill"
        case "parking": return "parkingsign.circle.fill"
        case "entertainment": return "ticket.fill"
        case "fitness": return "figure.mind.and.body"
        case "shopping": return "bag.fill"
        case "service": return "checkmark.seal.fill"
        default: return "mappin.and.ellipse"
        }
    }
}

extension NativeTabContentSnapshot {
    static let fallbackVenues = [
        NativeVenueSummary(id: "colony-square", name: "Colony Square", category: "dining", address: "1197 Peachtree St NE", distance: "0.4 mi", rating: 4.8, latitude: 33.7878, longitude: -84.3832, crowd: NativeCrowdSummary(level: 2, label: "Active", waitMins: 5), parking: NativeParkingSummary(totalAvailable: 14, priceLabel: "$8/hr"), verifiedPatchId: "BYT424-0301-P", imageUrl: URL(string: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80")),
        NativeVenueSummary(id: "midtown-smart-parking", name: "Midtown Smart Parking", category: "parking", address: "1380 W Peachtree St NW", distance: "0.6 mi", rating: 4.5, latitude: 33.7900, longitude: -84.3890, crowd: NativeCrowdSummary(level: 1, label: "Chill", waitMins: 0), parking: NativeParkingSummary(totalAvailable: 22, priceLabel: "$8/hr"), verifiedPatchId: nil, imageUrl: URL(string: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=900&q=80")),
        NativeVenueSummary(id: "arts-center-access", name: "Arts Center Access", category: "entertainment", address: "15th St NE", distance: "0.8 mi", rating: 4.7, latitude: 33.7790, longitude: -84.3760, crowd: NativeCrowdSummary(level: 3, label: "Busy", waitMins: 8), parking: NativeParkingSummary(totalAvailable: 38, priceLabel: "$12/hr"), verifiedPatchId: "BYT424-ARTS-P", imageUrl: URL(string: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=80"))
    ]

    static let canonicalServiceCards = [
        NativeDiscoverSummary(id: "broni-home-taste", type: "service", title: "Broni Home Taste", subtitle: "Authentic Ghanaian Home Cooking · Matchday Favorites · Pickup or delivery", distance: "Service", rating: "4.9", icon: "fork.knife", verified: true, entryType: "paid", cta: "Reserve table", imageUrl: URL(string: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Services", badgeText: "PAID CHECKOUT", metadataLine: "$15 • Available now", features: ["Matchday favorites", "Fresh Ghanaian dishes", "Pickup or delivery", "Family-style portions"], vibeScore: 9, availability: "Available now", membershipRequired: true),
        NativeDiscoverSummary(id: "gh-akwaaba-pass", type: "service", title: "GH Akwaaba Pass", subtitle: "FIFA Matchday Pass · Premium Event Access & Concierge", distance: "Pass", rating: "4.9", icon: "ticket.fill", verified: true, entryType: "paid", cta: "View pass", imageUrl: URL(string: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Services", badgeText: "PAID CHECKOUT", metadataLine: "$50 • Digital pass ready", features: ["Fast-track entry", "VIP Lounge access", "Digital pass delivery", "On-site host support"], vibeScore: 9, availability: "Digital pass ready", membershipRequired: true)
    ]

    static let specialDiscoverCards = canonicalServiceCards

    static let fallbackDiscoverCards = [
        NativeDiscoverSummary(id: "coffee-walk", type: "coffee", title: "Morning Coffee Walk", subtitle: "Low-key cafés and brunch spots within a quick walk.", distance: "0.4 mi", rating: "4.8", icon: "cup.and.saucer.fill", verified: true, entryType: "free", cta: "Open details", imageUrl: URL(string: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Coffee", badgeText: "FREE ENTRY", metadataLine: "Free • Open now", features: ["Coffee", "Brunch", "Quick walk"], vibeScore: 6, availability: "Open now", membershipRequired: false),
        NativeDiscoverSummary(id: "dinner-vibe", type: "dining", title: "Dinner Spots That Match Your Vibe", subtitle: "Personalized restaurants for food, dates, and group plans.", distance: "0.9 mi", rating: "4.7", icon: "fork.knife", verified: true, entryType: "paid", cta: "Book", imageUrl: URL(string: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Dining", badgeText: "PAID ENTRY", metadataLine: "Varies • Tables nearby", features: ["Dining", "Date night", "Personalized"], vibeScore: 7, availability: "Tables nearby", membershipRequired: false),
        NativeDiscoverSummary(id: "nightlife-momentum", type: "nightlife", title: "Nightlife Momentum", subtitle: "Bars, lounges, and cocktail rooms with the right crowd energy.", distance: "1.1 mi", rating: "4.6", icon: "music.note", verified: true, entryType: "paid", cta: "Explore", imageUrl: URL(string: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Nightlife", badgeText: "PAID ENTRY", metadataLine: "Varies • Busy tonight", features: ["Cocktails", "Group energy", "Nightlife"], vibeScore: 8, availability: "Busy tonight", membershipRequired: false),
        NativeDiscoverSummary(id: "smart-parking", type: "parking", title: "Smart Parking Before You Arrive", subtitle: "Reserve-ready parking options around your next destination.", distance: "0.3 mi", rating: "4.5", icon: "parkingsign.circle.fill", verified: true, entryType: "paid", cta: "Route", imageUrl: URL(string: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Parking", badgeText: "PAID ENTRY", metadataLine: "$4.71/hr • 158 spots", features: ["Parking", "Reserve ahead", "Quick walk"], vibeScore: 3, availability: "158 spots", membershipRequired: false),
        NativeDiscoverSummary(id: "events-worth", type: "entertainment", title: "Events Worth Leaving For", subtitle: "Shows, music, and experiences aligned with your saved interests.", distance: "1.5 mi", rating: "4.7", icon: "ticket.fill", verified: true, entryType: "paid", cta: "Tickets", imageUrl: URL(string: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Events", badgeText: "PAID ENTRY", metadataLine: "Tickets • Tonight", features: ["Events", "Music", "Entertainment"], vibeScore: 7, availability: "Tonight", membershipRequired: false),
        NativeDiscoverSummary(id: "wellness-reset", type: "fitness", title: "Wellness Reset Nearby", subtitle: "Gyms, recovery, and movement options when your vibe is wellness.", distance: "0.7 mi", rating: "4.9", icon: "figure.mind.and.body", verified: true, entryType: "free", cta: "Open", imageUrl: URL(string: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Fitness", badgeText: "FREE ENTRY", metadataLine: "Free • Recovery nearby", features: ["Fitness", "Wellness", "Recovery"], vibeScore: 5, availability: "Recovery nearby", membershipRequired: false)
    ]

    static let fallbackEvents = [
        NativeEventSummary(id: "fifa-gh", title: "GH Akwaaba FIFA Matchday", venue: "Mercedes-Benz Stadium", time: "Tonight", price: "Platinum", emoji: "🇬🇭", imageUrl: URL(string: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80")),
        NativeEventSummary(id: "midtown-live", title: "Midtown Live Lounge", venue: "Colony Square", time: "8:00 PM", price: "Free", emoji: "🎶", imageUrl: URL(string: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80"))
    ]

    static let fallback = NativeTabContentSnapshot(venues: fallbackVenues, discoverCards: fallbackDiscoverCards + specialDiscoverCards, events: fallbackEvents, source: .fallback, lastUpdated: nil, errorMessage: nil)
}
