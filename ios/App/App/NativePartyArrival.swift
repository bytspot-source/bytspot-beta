import Foundation
import MapKit

struct NativePartyArrivalVenue: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
}

struct NativePartyArrivalContext: Codable, Equatable {
    struct Destination: Codable, Equatable {
        let venueId: String
        let name: String
        let address: String
        let latitude: Double
        let longitude: Double
    }

    struct Map: Codable, Equatable {
        let provider: String
        let directionsUrl: String
    }

    let partyId: String
    let destination: Destination
    let map: Map

    var appleMapsItem: MKMapItem? {
        guard map.provider == "apple-maps",
              (-90...90).contains(destination.latitude),
              (-180...180).contains(destination.longitude) else { return nil }
        let placemark = MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: destination.latitude, longitude: destination.longitude))
        let item = MKMapItem(placemark: placemark)
        item.name = destination.name
        return item
    }
}

struct NativePartyArrivalAPI {
    let client: BytspotAPIClient

    func bindDestination(partyID: String, venueID: String) async throws {
        _ = try await client.trpcPayload(
            path: "/trpc/events.arrival.bindDestination",
            method: "POST",
            input: ["partyId": partyID, "venueId": venueID]
        )
    }

    func context(partyID: String) async throws -> NativePartyArrivalContext {
        let payload = try await client.trpcQueryPayload(path: "/trpc/events.arrival.context", input: ["partyId": partyID])
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(NativePartyArrivalContext.self, from: data)
    }

    func matchingRegisteredVenues(named partyVenueName: String) async throws -> [NativePartyArrivalVenue] {
        let payload = try await client.trpcQueryPayload(path: "/trpc/venues.list", input: [:])
        return Self.registeredVenueCandidates(from: payload, named: partyVenueName)
    }

    /// Every registered venue, for host-side suggestion only. Binding still runs
    /// through `registeredVenueCandidates`, which stays an exact-name match.
    func registeredVenues() async throws -> [NativePartyArrivalVenue] {
        Self.allRegisteredVenues(from: try await client.trpcQueryPayload(path: "/trpc/venues.list", input: [:]))
    }

    static func allRegisteredVenues(from payload: Any) -> [NativePartyArrivalVenue] {
        guard let root = payload as? [String: Any], let rows = root["venues"] as? [[String: Any]] else { return [] }
        return rows.compactMap { row -> NativePartyArrivalVenue? in
            guard let id = clean(row["id"]), let name = clean(row["name"]) else { return nil }
            return NativePartyArrivalVenue(id: id, name: name, address: clean(row["address"]) ?? "Registered Bytspot Venue")
        }
    }

    /// Suggestion matching is deliberately looser than binding: it only has to
    /// surface a name the host may have meant. It never binds anything, so a
    /// wrong guess costs a tap, whereas a loose *binding* predicate would point
    /// guests at the wrong physical address.
    ///
    /// A host who has already typed a venue's exact registered name is offered
    /// nothing — there is no correction left to make.
    static func suggestedRegisteredVenues(_ venues: [NativePartyArrivalVenue], matching typed: String, limit: Int = 3) -> [NativePartyArrivalVenue] {
        let target = normalizedVenueName(typed)
        guard target.count >= 2, !venues.contains(where: { normalizedVenueName($0.name) == target }) else { return [] }
        let ranked = venues.compactMap { venue -> (NativePartyArrivalVenue, Int)? in
            let name = normalizedVenueName(venue.name)
            if name.hasPrefix(target) { return (venue, 0) }
            if name.contains(target) { return (venue, 1) }
            // Last resort: the host typed a word the venue name contains, which
            // catches "ponce market" and "piedmont" without matching everything.
            let words = Set(name.split(separator: " "))
            if target.split(separator: " ").contains(where: { words.contains($0) }) { return (venue, 2) }
            return nil
        }
        return ranked
            .sorted { ($0.1, $0.0.name.count, $0.0.name) < ($1.1, $1.0.name.count, $1.0.name) }
            .prefix(limit)
            .map(\.0)
    }

    static func registeredVenueCandidates(from payload: Any, named partyVenueName: String) -> [NativePartyArrivalVenue] {
        guard let root = payload as? [String: Any], let rows = root["venues"] as? [[String: Any]] else { return [] }
        let target = normalizedVenueName(partyVenueName)
        return rows.compactMap { row -> NativePartyArrivalVenue? in
            guard let id = clean(row["id"]), let name = clean(row["name"]),
                  normalizedVenueName(name) == target else { return nil }
            return NativePartyArrivalVenue(id: id, name: name, address: clean(row["address"]) ?? "Registered Bytspot Venue")
        }
    }

    private static func clean(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func normalizedVenueName(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}