import CoreLocation
import Foundation
import Combine

/// Device-local saved markers, isolated by signed-in account. This is not a
/// cloud-synced favorites promise or a booking/visit confirmation.
enum NativeVenueSavedState {
    static func contains(venueID: String, userID: String?, defaults: UserDefaults = .standard) -> Bool {
        guard let userID, !userID.isEmpty else { return false }
        return (defaults.stringArray(forKey: key(userID)) ?? []).contains(venueID)
    }

    @discardableResult
    static func toggle(venueID: String, userID: String, defaults: UserDefaults = .standard) -> Bool {
        guard !venueID.isEmpty, !userID.isEmpty else { return false }
        var ids = Set(defaults.stringArray(forKey: key(userID)) ?? [])
        if ids.contains(venueID) { ids.remove(venueID) } else { ids.insert(venueID) }
        defaults.set(Array(ids).sorted(), forKey: key(userID))
        return ids.contains(venueID)
    }

    private static func key(_ userID: String) -> String { "bytspot.native.place-saves.\(userID)" }
}

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

    static func canValidateVisit(_ venue: NativeVenueSummary) -> Bool {
        guard let id = venue.checkInVenueID, !id.isEmpty,
              id == venue.id else { return false }
        return NativeVenueDetailPresentation.supportsManualCheckIn(venue)
    }

    static func distance(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value == "Here" { return value }
        guard value.range(of: #"^\d+(\.\d+)?\s?(mi|km|m)$"#, options: .regularExpression) != nil else { return nil }
        return value
    }

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

/// The mounted venues.checkin response, not the speculative checkins.create DTO.
struct NativeVenueVisitResponse: Decodable, Equatable {
    enum Proof: String, Decodable {
        case nearby, verified
        case selfReported = "self_reported"
    }

    enum PointsReason: String, Decodable {
        case paid, unproven
        case sameVisit = "same_visit"
        case dailyCeiling = "daily_ceiling"

        var detail: String {
            switch self {
            case .paid: return "Points awarded by the server."
            case .unproven: return "Location did not prove this visit. No points earned."
            case .sameVisit: return "0 points · This visit has already earned points."
            case .dailyCeiling: return "0 points · Daily check-in points limit reached."
            }
        }
    }

    let success: Bool
    let proof: Proof
    let pointsEarned: Int
    let pointsReason: PointsReason

    private enum CodingKeys: String, CodingKey {
        case success, proof, pointsEarned, pointsReason
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        success = try values.decode(Bool.self, forKey: .success)
        proof = try values.decode(Proof.self, forKey: .proof)
        pointsEarned = try values.decode(Int.self, forKey: .pointsEarned)
        pointsReason = try values.decode(PointsReason.self, forKey: .pointsReason)
        guard pointsEarned >= 0,
              (pointsReason == .paid ? pointsEarned > 0 : pointsEarned == 0),
              (proof == .selfReported ? pointsReason == .unproven : pointsReason != .unproven) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                debugDescription: "Inconsistent venue check-in proof or award."))
        }
    }

    var isConfirmed: Bool { success && (proof == .nearby || proof == .verified) }
}

struct NativeVenueVisitAPI {
    let client: BytspotAPIClient

    func checkIn(input: [String: Any]) async throws -> NativeVenueVisitResponse {
        try await client.trpcDecode(NativeVenueVisitResponse.self,
            path: "/trpc/\(NativeVenueDetailContract.checkinEndpoint)", method: "POST", input: input)
    }
}

enum NativeVenueVisitLocation {
    static let requiredDetail = "Allow location and get a fresh location fix at the venue before checking in."

    /// Call at tap time with the calling view's current CLLocation, never a map
    /// center or discovery fallback. NativeLocationCoordinate alone has no age.
    static func freshCoordinate(location: CLLocation?, authorized: Bool, now: Date = Date()) -> NativeLocationCoordinate? {
        guard authorized, let location,
              (0...60).contains(now.timeIntervalSince(location.timestamp)),
              (0...250).contains(location.horizontalAccuracy),
              NativeVenueSummary.hasValidMapCoordinate(latitude: location.coordinate.latitude,
                                                       longitude: location.coordinate.longitude) else { return nil }
        return NativeLocationCoordinate(latitude: location.coordinate.latitude,
                                        longitude: location.coordinate.longitude, isFallback: false)
    }

    static func isUsable(_ coordinate: NativeLocationCoordinate?) -> Bool {
        guard let coordinate, !coordinate.isFallback else { return false }
        return NativeVenueSummary.hasValidMapCoordinate(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }
}

enum NativeVenueVisitState: Equatable {
    case idle
    case inProgress
    case confirmed(NativeVenueVisitResponse)
    case rejected(String)
    case failed

    var label: String {
        switch self {
        case .idle: return "Check In"
        case .inProgress: return "Checking In…"
        case .confirmed: return "Checked In"
        case .rejected: return "Check In"
        case .failed: return "Retry Check In"
        }
    }

    var detail: String? {
        switch self {
        case .idle: return nil
        case .inProgress: return "Waiting for server confirmation."
        case .confirmed(let response):
            return response.pointsEarned > 0 ? "+\(response.pointsEarned) points · Visit confirmed by the server." : response.pointsReason.detail
        case .rejected(let reason): return reason
        case .failed: return "Check-in could not be confirmed. No points confirmed. Retry to resolve this attempt."
        }
    }

    var isLoading: Bool { self == .inProgress }
    var isConfirmed: Bool {
        if case .confirmed = self { return true }
        return false
    }
    var canRetry: Bool {
        switch self {
        case .rejected, .failed: return true
        default: return false
        }
    }
    var pointsEarned: Int {
        if case .confirmed(let response) = self { return response.pointsEarned }
        return 0
    }
}

/// In-memory, shared M5/M2 visit state. Does not write local history or balances.
@MainActor
final class NativeVenueVisitStore: ObservableObject {
    static let shared = NativeVenueVisitStore()
    typealias Mutation = @MainActor ([String: Any]) async throws -> NativeVenueVisitResponse

    struct Context: Equatable {
        let userID: String
        fileprivate let generation: UUID
    }

    struct Identity: Hashable {
        let userID: String
        let venueID: String
    }

    @Published private(set) var states: [Identity: NativeVenueVisitState] = [:]
    private var activeContext: Context?
    private var idempotencyKeys: [Identity: String] = [:]

    /// Call synchronously from the auth owner on sign-in/out, not from a view's
    /// cancelled task/defer. A->B->A creates a new generation even for the same ID.
    /// forceReset also invalidates an explicitly replaced session for the same user.
    @discardableResult
    func synchronize(userID: String?, forceReset: Bool = false) -> Context? {
        let userID = userID.flatMap { Self.isExactID($0) ? $0 : nil }
        guard forceReset || activeContext?.userID != userID else { return activeContext }
        activeContext = userID.map { Context(userID: $0, generation: UUID()) }
        idempotencyKeys.removeAll()
        states = [:]
        return activeContext
    }

    func context(for userID: String?) -> Context? {
        guard let userID, activeContext?.userID == userID else { return nil }
        return activeContext
    }

    /// Lookup never changes authentication context or clears another view's work.
    func state(userID: String?, venueID: String?) -> NativeVenueVisitState {
        guard let userID, let venueID, context(for: userID) != nil else { return .idle }
        return states[Identity(userID: userID, venueID: venueID)] ?? .idle
    }

    func submit(context: Context, venueID: String, coordinate: NativeLocationCoordinate?, api: NativeVenueVisitAPI) async {
        await submit(context: context, venueID: venueID, coordinate: coordinate) { input in
            try await api.checkIn(input: input)
        }
    }

    /// venueID must be venue.checkInVenueID, never a title, Places ID, or catalog
    /// key. Pass a fresh coordinate from the calling view on EVERY attempt.
    /// The closure is injectable so tests do not need networking or credentials.
    func submit(context: Context, venueID: String, coordinate: NativeLocationCoordinate?, mutation: Mutation) async {
        guard !Task.isCancelled, activeContext == context, Self.isExactID(venueID) else { return }
        let identity = Identity(userID: context.userID, venueID: venueID)
        let current = states[identity] ?? .idle
        guard !current.isLoading, !current.isConfirmed else { return }
        guard NativeVenueVisitLocation.isUsable(coordinate) else {
            states[identity] = .rejected(NativeVenueVisitLocation.requiredDetail)
            return
        }
        let key = idempotencyKeys[identity] ?? UUID().uuidString
        idempotencyKeys[identity] = key
        states[identity] = .inProgress
        let input = NativeVenueDetailContract.checkinInput(venueID: venueID, idempotencyKey: key, coordinate: coordinate)
        do {
            let response = try await mutation(input)
            guard activeContext == context else { return }
            if response.isConfirmed {
                states[identity] = .confirmed(response)
            } else {
                // A definitive rejection permits a new attempt with new evidence.
                idempotencyKeys.removeValue(forKey: identity)
                states[identity] = .rejected(response.success ? response.pointsReason.detail : "The server did not confirm this visit. No points confirmed.")
            }
        } catch {
            guard activeContext == context else { return }
            // Timeout, cancellation, malformed response and transport errors can
            // all follow a committed write. Keep the key; never infer an award.
            states[identity] = .failed
        }
    }

    private static func isExactID(_ value: String) -> Bool {
        !value.isEmpty && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}