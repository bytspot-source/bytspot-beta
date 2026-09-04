import Foundation

/// A coffee spot as the public listing returns it. Vendor identity, owner, and
/// coordinates are not on the wire — a card renders the name, the area, and how
/// long a hold on that table lasts, and nothing else.
struct NativeCoffeeSpot: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let areaLabel: String?
    let holdMinutes: Int
}

struct NativeCoffeeSpotList: Codable { let spots: [NativeCoffeeSpot] }

/// A caller's ask for a hold. The hold window, the status, and the capability
/// are all server-computed; the client only reads them back.
struct NativeCoffeeReservation: Codable, Identifiable, Equatable {
    let id: String
    let coffeeSpotId: String
    let status: String
    let holdExpiresAt: String
    let requestedFor: String
    let partySize: Int
}

struct NativeCoffeeAPI {
    let client: BytspotAPIClient

    static let listRoute = "/trpc/coffee.list"
    static let reservationCreateRoute = "/trpc/coffee.reservations.create"
    static let reservationCancelRoute = "/trpc/coffee.reservations.cancel"

    /// Listing is public, so this call is made without a bearer token when the
    /// caller is signed out. Coordinates are optional; without them the server
    /// falls back to the most recently added spots.
    func list(latitude: Double? = nil, longitude: Double? = nil) async throws -> [NativeCoffeeSpot] {
        var input: [String: Any] = [:]
        if let latitude, let longitude { input["near"] = ["latitude": latitude, "longitude": longitude] }
        let payload = try await client.trpcQueryPayload(path: Self.listRoute, input: input)
        return try JSONDecoder().decode(NativeCoffeeSpotList.self, from: JSONSerialization.data(withJSONObject: payload)).spots
    }

    func createReservation(spotID: String, idempotencyKey: String, partySize: Int, requestedFor: Date) async throws -> NativeCoffeeReservation {
        let payload = try await client.trpcPayload(
            path: Self.reservationCreateRoute,
            method: "POST",
            input: NativeCoffeeContract.createInput(spotID: spotID, idempotencyKey: idempotencyKey, partySize: partySize, requestedFor: requestedFor)
        )
        return try JSONDecoder().decode(NativeCoffeeReservation.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    func cancelReservation(_ reservationID: String) async throws {
        _ = try await client.trpcPayload(path: Self.reservationCancelRoute, method: "POST", input: ["reservationId": reservationID])
    }
}

/// Request shaping kept out of the client so a test can pin the wire format
/// without a network stub. `requestedFor` is sent as an instant, never as a
/// wall-clock string, so the server reads the same moment the caller picked.
enum NativeCoffeeContract {
    static func createInput(spotID: String, idempotencyKey: String, partySize: Int, requestedFor: Date) -> [String: Any] {
        [
            "coffeeSpotId": spotID,
            "idempotencyKey": idempotencyKey,
            "partySize": partySize,
            "requestedFor": ISO8601DateFormatter.partyControlInstant.string(from: requestedFor),
        ]
    }
}

/// Words on a coffee surface. A hold is the only thing Bytspot is promising
/// here — no money moves in Phase 2 — so nothing in this file may render a
/// settlement verb, and a hold that has run out says so rather than counting
/// down past zero.
enum NativeCoffeeDisplay {
    /// A spot card's second line. The hold length is the whole promise, so it
    /// is stated rather than implied.
    static func spotSubtitle(areaLabel: String?, holdMinutes: Int) -> String {
        let hold = "Holds a table \(holdMinutes) min"
        guard let areaLabel, !areaLabel.isEmpty else { return hold }
        return "\(areaLabel) · \(hold)"
    }

    /// Live countdown on an outstanding hold. An unparseable or absent instant
    /// yields nil so a caller renders nothing rather than a fabricated time.
    static func holdCountdown(holdExpiresAt: String?, now: Date = Date()) -> String? {
        guard let holdExpiresAt, let expiry = ISO8601DateFormatter.partyControlDate(from: holdExpiresAt) else { return nil }
        let remaining = expiry.timeIntervalSince(now)
        if remaining <= 0 { return "Hold expired" }
        if remaining < 60 { return "Hold expires in under a minute" }
        let minutes = Int(remaining / 60)
        if minutes < 60 { return "Hold expires in \(minutes) min" }
        let hours = minutes / 60
        let rest = minutes % 60
        return rest == 0 ? "Hold expires in \(hours)h" : "Hold expires in \(hours)h \(rest)m"
    }

    /// What a reservation's own state reads as. `pending` is deliberately not
    /// "Reserved" — the spot has not answered yet, and saying otherwise would
    /// promise a table Bytspot has not been given.
    static func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": return "Hold requested"
        case "confirmed": return "Table held"
        case "declined": return "Not available"
        case "cancelled": return "Cancelled"
        case "expired": return "Hold expired"
        default: return "Hold requested"
        }
    }

    /// A hold that is no longer live cannot be counted down or acted on.
    static func isTerminal(_ status: String) -> Bool {
        status == "declined" || status == "cancelled" || status == "expired"
    }

    /// The line an attached coffee item shows beside its capability chip:
    /// status first, then the countdown while the hold is still live.
    static func itemFootnote(status: String?, holdExpiresAt: String?, now: Date = Date()) -> String? {
        guard let status else { return nil }
        let label = statusLabel(status)
        guard !isTerminal(status), let countdown = holdCountdown(holdExpiresAt: holdExpiresAt, now: now) else { return label }
        return "\(label) · \(countdown)"
    }
}
