import Foundation
import MapKit
import SwiftUI

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

    /// How to book the arrival venue outside Bytspot. Sent to the host, and to
    /// guests once the host turns it on. A Bytspot-controlled venue has no link.
    struct VenueBooking: Codable, Equatable {
        struct Booking: Codable, Equatable {
            let provider: String
            let url: String
        }
        let placeId: String?
        let controlled: Bool
        let booking: Booking?
    }

    let partyId: String
    let destination: Destination
    let map: Map
    var isHost: Bool? = nil
    var bookingForGuests: Bool? = nil
    var venueBooking: VenueBooking? = nil

    /// The OpenTable or Resy link, re-checked so a foreign link never becomes a button.
    var tableBooking: (url: URL, label: String)? {
        guard let booking = venueBooking?.booking, venueBooking?.controlled == false else { return nil }
        return NativeVenueDetailsDTO.tableBooking(["provider": booking.provider, "url": booking.url])
    }

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

enum NativePartyArrivalError: Error {
    case malformedBindResponse
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

    /// Bind the arrival destination from a place the host searched, for venues
    /// Bytspot does not have in its registered catalog. Returns the venue the
    /// server bound so the host can be shown exactly what guests will route to.
    func bindPlace(partyID: String, placeID: String) async throws -> NativePartyArrivalVenue {
        let payload = try await client.trpcPayload(
            path: "/trpc/events.arrival.bindPlace",
            method: "POST",
            input: ["partyId": partyID, "placeId": placeID]
        )
        guard let venue = Self.venue(fromBindPayload: payload) else { throw NativePartyArrivalError.malformedBindResponse }
        return venue
    }

    static func venue(fromBindPayload payload: Any) -> NativePartyArrivalVenue? {
        guard let root = payload as? [String: Any], let v = root["venue"] as? [String: Any],
              let id = clean(v["id"]), let name = clean(v["name"]) else { return nil }
        return NativePartyArrivalVenue(id: id, name: name, address: clean(v["address"]) ?? "Arrival destination")
    }

    /// Only Google-backed search rows carry a place id the server can resolve.
    /// Apple/local rows and index fallbacks ("place-3") cannot be bound, so
    /// they are dropped rather than offered as a destination that would 404.
    static func bindablePlaceResults(_ results: [NativePlaceSearchResult]) -> [NativePlaceSearchResult] {
        results.filter { result in
            let id = result.id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty, result.provider == "google_places",
                  !id.hasPrefix("place-"), !id.hasPrefix("apple-") else { return false }
            return true
        }
    }

    func setBookingForGuests(partyID: String, enabled: Bool) async throws {
        _ = try await client.trpcPayload(
            path: "/trpc/events.arrival.setBookingForGuests",
            method: "POST",
            input: ["partyId": partyID, "enabled": enabled]
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
enum NativePartyVenueBookingCopy {
    static let disclaimer = "Book with the restaurant directly. Bytspot doesn't hold this table."
    static let guestToggle = "Show guests how to book"
    static let guestToggleNote = "Guests with Party access see the booking link or the venue's contact details."
}

/// How to book a listed arrival venue outside Bytspot: its OpenTable or Resy
/// link, or its phone and website when it has no link. Nothing is held.
struct NativePartyVenueBookingSection: View {
    let context: NativePartyArrivalContext
    var onToggleGuests: ((Bool) -> Void)? = nil
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var contact: NativeVenueRichDetails?

    var body: some View {
        if let venueBooking = context.venueBooking, !venueBooking.controlled {
            VStack(alignment: .leading, spacing: 10) {
                Text("Book at \(context.destination.name)").font(.subheadline.weight(.bold)).foregroundColor(NativeTheme.textPrimary)
                if let booking = context.tableBooking {
                    Button("Book on \(booking.label) ↗") {
                        if let placeID = venueBooking.placeId {
                            let client = BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token })
                            Task { await NativeTableBookingTapAPI(client: client).record(placeID: placeID, surface: .party) }
                        }
                        openURL(booking.url)
                    }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("native-party-venue-booking")
                } else {
                    HStack(spacing: 16) {
                        if let phone = contact?.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                            Button("Call") { openURL(url) }.frame(minHeight: 44)
                        }
                        if let website = contact?.websiteURL {
                            Button("Website ↗") { openURL(website) }.frame(minHeight: 44)
                        }
                    }
                    .accessibilityIdentifier("native-party-venue-contact")
                }
                Text(NativePartyVenueBookingCopy.disclaimer).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                if context.isHost == true, let onToggleGuests {
                    Toggle(NativePartyVenueBookingCopy.guestToggle, isOn: Binding(get: { context.bookingForGuests == true }, set: onToggleGuests))
                        .font(.subheadline)
                        .accessibilityIdentifier("native-party-venue-booking-guests")
                    Text(NativePartyVenueBookingCopy.guestToggleNote).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                }
            }
            .task(id: venueBooking.placeId) {
                guard context.tableBooking == nil, let placeID = venueBooking.placeId else { return }
                contact = try? await NativeVenueDetailsAPI(client: BytspotAPIClient()).details(googlePlaceID: placeID)
            }
        }
    }
}
