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

    func trpcPayload(path: String, method: String = "GET", input: [String: Any]? = nil) async throws -> Any {
        let body = try input.map { try JSONSerialization.data(withJSONObject: ["json": $0]) }
        return Self.unwrapTRPCData(try await json(path: path, method: method, body: body))
    }

    func trpcDecode<T: Decodable>(_ type: T.Type, path: String, method: String = "GET", input: [String: Any]? = nil) async throws -> T {
        let payload = try await trpcPayload(path: path, method: method, input: input)
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func unwrapTRPCData(_ value: Any) -> Any {
        guard let dict = value as? [String: Any] else { return value }
        if let result = dict["result"] { return unwrapTRPCData(result) }
        if let data = dict["data"] as? [String: Any] {
            if let json = data["json"] { return json }
            return unwrapTRPCData(data)
        }
        return value
    }
}

struct NativeUserProfileRecord: Codable, Equatable {
    var id: String?
    var email: String?
    var name: String?
    var phone: String?
    var profileImage: String?
    var address: String?
    var birthday: String?
}

struct NativeVehicleRecord: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var make: String
    var model: String
    var year: Int
    var color: String
    var licensePlate: String
    var photo: String?
    var vin: String?
    var transmissionType: String
    var trunkCategory: String

    var title: String { [String(year), make, model].filter { !$0.isEmpty }.joined(separator: " ") }
    var subtitle: String { "\(color.isEmpty ? "Color pending" : color) · Plate \(licensePlate.isEmpty ? "pending" : licensePlate)" }
}

struct NativePaymentMethodRecord: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var brand: String?
    var last4: String?
    var expiryMonth: String?
    var expiryYear: String?
    var isDefault: Bool

    var label: String { "\((brand ?? type).capitalized) •••• \(last4 ?? "")" }
    var detail: String { [expiryMonth, expiryYear].compactMap { $0 }.joined(separator: "/") }
}

struct NativePaymentSetupSession: Codable, Equatable { var url: String? }

struct NativeNotificationPreferences: Codable, Equatable {
    struct Push: Codable, Equatable { var reservations: Bool; var promotions: Bool; var reminders: Bool; var insider: Bool; var nearby: Bool }
    struct Email: Codable, Equatable { var reservations: Bool; var promotions: Bool; var newsletter: Bool; var receipts: Bool }
    struct SMS: Codable, Equatable { var reservations: Bool; var reminders: Bool; var emergencies: Bool }

    var push: Push
    var email: Email
    var sms: SMS

    static let webDefaults = NativeNotificationPreferences(
        push: Push(reservations: true, promotions: true, reminders: true, insider: true, nearby: false),
        email: Email(reservations: true, promotions: false, newsletter: true, receipts: true),
        sms: SMS(reservations: true, reminders: true, emergencies: true)
    )
}

struct NativeUserPreferencesRecord: Codable, Equatable {
    struct Parking: Codable, Equatable { var covered: Bool?; var evCharging: Bool?; var security: String? }
    var interests: [String]?
    var vibes: [String]?
    var cuisines: [String]?
    var parking: Parking?
}

struct NativeMutationSuccess: Codable, Equatable { var success: Bool?; var ok: Bool? }

struct NativeMobilityQuoteRecord: Codable, Equatable, Identifiable {
    var id: String
    var provider: String?
    var providerQuoteId: String?
    var serviceClass: String?
    var serviceTitle: String?
    var priceLabel: String?
    var etaLabel: String?
    var pickupLabel: String?
    var dropoffLabel: String?
    var cancellationLabel: String?
    var providerBookingMode: String?
    var requiresAccountLink: Bool?
    var currency: String?
    var expiresAt: String?
}

struct NativeMobilityRideRecord: Codable, Equatable, Identifiable {
    var id: String
    var quoteId: String?
    var provider: String?
    var providerReservationId: String?
    var reservationReference: String?
    var status: String?
    var serviceClass: String?
    var serviceTitle: String?
    var priceLabel: String?
    var etaLabel: String?
    var pickupLabel: String?
    var dropoffLabel: String?
    var vehicleLabel: String?
    var driverLabel: String?
    var driverName: String?
    var vehiclePlate: String?
    var vehicleMakeModel: String?
    var vehicleColor: String?
    var trackingUrl: String?
    var createdAt: String?
    var updatedAt: String?

    var normalizedProviderReservationId: String? { Self.clean(providerReservationId) ?? Self.clean(reservationReference) }
    var normalizedStatus: String { Self.clean(status)?.lowercased().replacingOccurrences(of: " ", with: "_") ?? "pending" }
    var normalizedDriverName: String? { Self.cleanAssigned(driverName) ?? Self.cleanAssigned(driverLabel) }
    var normalizedPlateLabel: String? { Self.clean(vehiclePlate) }
    var normalizedTrackingURL: URL? { Self.clean(trackingUrl).flatMap(URL.init(string:)) }
    var normalizedVehicleLine: String? {
        let vehicle = Self.clean(vehicleMakeModel) ?? Self.clean(vehicleLabel) ?? Self.clean(serviceTitle)
        let color = Self.clean(vehicleColor)
        return [color, vehicle].compactMap { $0 }.joined(separator: " ").nilIfEmpty
    }

    init(id: String, quoteId: String? = nil, provider: String? = nil, providerReservationId: String? = nil, reservationReference: String? = nil, status: String? = nil, serviceClass: String? = nil, serviceTitle: String? = nil, priceLabel: String? = nil, etaLabel: String? = nil, pickupLabel: String? = nil, dropoffLabel: String? = nil, vehicleLabel: String? = nil, driverLabel: String? = nil, driverName: String? = nil, vehiclePlate: String? = nil, vehicleMakeModel: String? = nil, vehicleColor: String? = nil, trackingUrl: String? = nil, createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.quoteId = quoteId; self.provider = provider; self.providerReservationId = providerReservationId; self.reservationReference = reservationReference; self.status = status; self.serviceClass = serviceClass; self.serviceTitle = serviceTitle; self.priceLabel = priceLabel; self.etaLabel = etaLabel; self.pickupLabel = pickupLabel; self.dropoffLabel = dropoffLabel; self.vehicleLabel = vehicleLabel; self.driverLabel = driverLabel; self.driverName = driverName; self.vehiclePlate = vehiclePlate; self.vehicleMakeModel = vehicleMakeModel; self.vehicleColor = vehicleColor; self.trackingUrl = trackingUrl; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case id, quoteId, quoteID, provider, providerReservationId, providerBookingId, externalReservationId, reservationReference, reservationCode, reference, bookingReference, status, serviceClass, serviceTitle, priceLabel, etaLabel, pickupLabel, dropoffLabel, vehicleLabel, vehicleName, vehicleMakeModel, vehicleColor, vehiclePlate, licensePlate, plateLabel, plate, driverLabel, driverName, driver, assignedDriver, vendorDriver, vehicle, car, template, trackingUrl, trackingURL, trackingLink, tracking, createdAt, updatedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.string(.id) ?? c.string(.reservationReference) ?? c.string(.reservationCode) ?? "BYT-RIDE-\(Int(Date().timeIntervalSince1970))"
        quoteId = c.string(.quoteId) ?? c.string(.quoteID)
        provider = c.string(.provider)
        providerReservationId = c.string(.providerReservationId) ?? c.string(.providerBookingId) ?? c.string(.externalReservationId) ?? c.nestedString(.template, ["providerReservationId", "providerBookingId", "externalReservationId"])
        reservationReference = c.string(.reservationReference) ?? c.string(.reservationCode) ?? c.string(.bookingReference) ?? c.string(.reference) ?? providerReservationId
        status = c.string(.status)
        serviceClass = c.string(.serviceClass)
        serviceTitle = c.string(.serviceTitle)
        priceLabel = c.string(.priceLabel)
        etaLabel = c.string(.etaLabel)
        pickupLabel = c.string(.pickupLabel)
        dropoffLabel = c.string(.dropoffLabel)
        let decodedDriverName = c.string(.driverName) ?? c.nestedString(.driver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.assignedDriver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.vendorDriver, ["name", "displayName", "fullName", "driverName", "label"]) ?? c.nestedString(.template, ["driverName", "driverLabel"])
        driverName = decodedDriverName ?? c.nestedNestedString(.template, "driver", ["name", "displayName", "fullName", "label"])
        driverLabel = c.string(.driverLabel) ?? driverName
        vehiclePlate = c.string(.vehiclePlate) ?? c.string(.licensePlate) ?? c.string(.plateLabel) ?? c.string(.plate) ?? c.nestedString(.vehicle, ["licensePlate", "plate", "plateLabel", "vehiclePlate"]) ?? c.nestedString(.car, ["licensePlate", "plate", "plateLabel", "vehiclePlate"]) ?? c.nestedString(.template, ["vehiclePlate", "licensePlate", "plateLabel", "plate"]) ?? c.nestedNestedString(.template, "vehicle", ["licensePlate", "plate", "plateLabel"])
        vehicleColor = c.string(.vehicleColor) ?? c.nestedString(.vehicle, ["color", "vehicleColor"]) ?? c.nestedString(.car, ["color", "vehicleColor"]) ?? c.nestedNestedString(.template, "vehicle", ["color", "vehicleColor"])
        vehicleMakeModel = c.string(.vehicleMakeModel) ?? c.string(.vehicleName) ?? c.nestedString(.vehicle, ["makeModel", "label", "name", "model"]) ?? c.nestedString(.car, ["makeModel", "label", "name", "model"]) ?? c.nestedString(.template, ["vehicleMakeModel", "vehicleName"]) ?? c.nestedNestedString(.template, "vehicle", ["makeModel", "label", "name", "model"])
        vehicleLabel = c.string(.vehicleLabel) ?? vehicleMakeModel
        trackingUrl = c.string(.trackingUrl) ?? c.string(.trackingURL) ?? c.string(.trackingLink) ?? c.nestedString(.tracking, ["url", "href", "link"]) ?? c.nestedString(.template, ["trackingUrl", "trackingURL", "trackingLink"])
        createdAt = c.string(.createdAt)
        updatedAt = c.string(.updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(quoteId, forKey: .quoteId)
        try c.encodeIfPresent(provider, forKey: .provider)
        try c.encodeIfPresent(providerReservationId, forKey: .providerReservationId)
        try c.encodeIfPresent(reservationReference, forKey: .reservationReference)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(serviceClass, forKey: .serviceClass)
        try c.encodeIfPresent(serviceTitle, forKey: .serviceTitle)
        try c.encodeIfPresent(priceLabel, forKey: .priceLabel)
        try c.encodeIfPresent(etaLabel, forKey: .etaLabel)
        try c.encodeIfPresent(pickupLabel, forKey: .pickupLabel)
        try c.encodeIfPresent(dropoffLabel, forKey: .dropoffLabel)
        try c.encodeIfPresent(vehicleLabel, forKey: .vehicleLabel)
        try c.encodeIfPresent(driverLabel, forKey: .driverLabel)
        try c.encodeIfPresent(driverName, forKey: .driverName)
        try c.encodeIfPresent(vehiclePlate, forKey: .vehiclePlate)
        try c.encodeIfPresent(vehicleMakeModel, forKey: .vehicleMakeModel)
        try c.encodeIfPresent(vehicleColor, forKey: .vehicleColor)
        try c.encodeIfPresent(trackingUrl, forKey: .trackingUrl)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
        try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
    }

    private static func clean(_ value: String?) -> String? { value?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    private static func cleanAssigned(_ value: String?) -> String? {
        guard let clean = clean(value) else { return nil }
        let lower = clean.lowercased()
        return lower.contains("pending") || lower.contains("dispatch") || lower.contains("matching") || lower.contains("assigned after") ? nil : clean
    }
}

private struct NativeAnyCodingKey: CodingKey { var stringValue: String; var intValue: Int? = nil; init?(stringValue: String) { self.stringValue = stringValue }; init?(intValue: Int) { self.stringValue = "\(intValue)"; self.intValue = intValue } }

private extension KeyedDecodingContainer where Key == NativeMobilityRideRecord.CodingKeys {
    func string(_ key: Key) -> String? { (try? decodeIfPresent(String.self, forKey: key))?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    func nestedString(_ key: Key, _ names: [String]) -> String? {
        guard let nested = try? nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: key) else { return nil }
        return nested.firstString(names)
    }
    func nestedNestedString(_ key: Key, _ child: String, _ names: [String]) -> String? {
        guard let nested = try? nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: key), let childKey = NativeAnyCodingKey(stringValue: child), let child = try? nested.nestedContainer(keyedBy: NativeAnyCodingKey.self, forKey: childKey) else { return nil }
        return child.firstString(names)
    }
}

private extension KeyedDecodingContainer where Key == NativeAnyCodingKey {
    func firstString(_ names: [String]) -> String? {
        for name in names { if let key = NativeAnyCodingKey(stringValue: name), let value = (try? decodeIfPresent(String.self, forKey: key))?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty { return value } }
        return nil
    }
}

private extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

enum NativeMobilityRouteContract {
    static let routes = ["mobility.quotes.create", "mobility.reservations.create", "mobility.reservations.cancel", "mobility.trips.status", "mobility.passenger.update"]
}

struct NativeMobilityDataAPI {
    let client: BytspotAPIClient

    func createQuote(input: [String: Any]) async throws -> NativeMobilityQuoteRecord {
        try await client.trpcDecode(NativeMobilityQuoteRecord.self, path: "/trpc/mobility.quotes.create", method: "POST", input: input)
    }

    func createReservation(input: [String: Any]) async throws -> NativeMobilityRideRecord {
        try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.reservations.create", method: "POST", input: input)
    }

    func rideStatus(id: String) async throws -> NativeMobilityRideRecord {
        try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.trips.status", method: "POST", input: ["id": id])
    }

    func cancelRide(id: String, reason: String? = nil) async throws -> NativeMutationSuccess {
        var input: [String: Any] = ["id": id]
        if let reason, !reason.isEmpty { input["reason"] = reason }
        return try await client.trpcDecode(NativeMutationSuccess.self, path: "/trpc/mobility.reservations.cancel", method: "POST", input: input)
    }

    func updatePassenger(id: String, name: String? = nil, phone: String? = nil, note: String? = nil) async throws -> NativeMobilityRideRecord {
        var input: [String: Any] = ["id": id]
        if let name, !name.isEmpty { input["name"] = name }
        if let phone, !phone.isEmpty { input["phone"] = phone }
        if let note, !note.isEmpty { input["note"] = note }
        return try await client.trpcDecode(NativeMobilityRideRecord.self, path: "/trpc/mobility.passenger.update", method: "POST", input: input)
    }
}

struct NativeGroupEventServerRecord: Codable, Equatable, Identifiable {
    var id: String
    var hostId: String?
    var title: String?
    var groupType: String?
    var tier: String?
    var timing: String?
    var scheduledDate: String?
    var location: String?
    var theme: String?
    var instagramHandle: String?
    var allowNearbyOffers: Bool?
    var approvalMode: String?
    var createdAt: String?
}

struct NativeGroupEventGuestRecord: Codable, Equatable, Identifiable {
    var userId: String
    var name: String?
    var profileImage: String?
    var initials: String?
    var status: String?
    var message: String?
    var joinedAt: String?

    var id: String { userId }
    var displayName: String { name?.isEmpty == false ? name! : "Guest" }
    var avatarInitials: String { initials?.isEmpty == false ? initials! : String(displayName.prefix(1)).uppercased() }
}

struct NativeGroupEventHostView: Codable, Equatable {
    var event: NativeGroupEventServerRecord
    var guests: [NativeGroupEventGuestRecord]
    var pending: [NativeGroupEventGuestRecord]
}

struct NativeGroupEventDecision: Codable, Equatable {
    var userId: String?
    var status: String?
}

/// Host-side group-event API. The backend runs tRPC without a data transformer,
/// so inputs travel raw (query `?input=<json>`, mutation body `<json>`) rather
/// than through BytspotAPIClient.trpcPayload's `{"json":…}` wrapper.
struct NativeGroupEventDataAPI {
    let client: BytspotAPIClient

    func create(input: [String: Any]) async throws -> NativeGroupEventServerRecord {
        try await mutation(NativeGroupEventServerRecord.self, path: "/trpc/groupEvents.create", input: input)
    }

    func host(eventId: String) async throws -> NativeGroupEventHostView {
        try await query(NativeGroupEventHostView.self, path: "/trpc/groupEvents.host", input: ["eventId": eventId])
    }

    func decide(eventId: String, userId: String, decision: String) async throws -> NativeGroupEventDecision {
        try await mutation(NativeGroupEventDecision.self, path: "/trpc/groupEvents.decide", input: ["eventId": eventId, "userId": userId, "decision": decision])
    }

    private func mutation<T: Decodable>(_ type: T.Type, path: String, input: [String: Any]) async throws -> T {
        try Self.decode(type, from: try await client.json(path: path, method: "POST", body: Self.rawMutationBody(input)))
    }

    private func query<T: Decodable>(_ type: T.Type, path: String, input: [String: Any]) async throws -> T {
        try Self.decode(type, from: try await client.json(path: Self.rawQueryPath(path, input: input)))
    }

    /// Raw (untransformed) mutation body: the input dictionary serialized directly,
    /// NOT wrapped in the `{"json":…}` envelope, matching the transformer-less backend.
    static func rawMutationBody(_ input: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: input)
    }

    /// Raw query path: `path?input=<url-encoded raw json>`, again without the
    /// `{"json":…}` envelope.
    static func rawQueryPath(_ path: String, input: [String: Any]) throws -> String {
        let inputData = try JSONSerialization.data(withJSONObject: input)
        let encoded = String(data: inputData, encoding: .utf8)?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return "\(path)?input=\(encoded)"
    }

    private static func decode<T: Decodable>(_ type: T.Type, from raw: Any) throws -> T {
        let data = try JSONSerialization.data(withJSONObject: BytspotAPIClient.unwrapTRPCData(raw))
        return try JSONDecoder().decode(T.self, from: data)
    }
}

struct NativeAuthUserRecord: Codable, Equatable {
    var id: String?
    var email: String?
    var name: String?
}

struct NativeAuthResponse: Codable, Equatable {
    var token: String?
    var user: NativeAuthUserRecord?
    var isNewUser: Bool?
}

enum NativeAuthRouteContract {
    static let routes = ["auth.signup", "auth.login", "auth.googleSignIn", "auth.appleSignIn"]
    static let storageKeys = ["bytspot_auth_token", "bytspot_user", "bytspot_user_name"]
    static let passwordRecoveryRoutes = ["/#/forgot-password", "/forgot-password", "/#/reset-password", "/reset-password"]
}

struct NativeAuthDataAPI {
    var client: BytspotAPIClient

    func signup(email: String, password: String, name: String, ref: String?) async throws -> NativeAuthResponse {
        try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.signup", method: "POST", input: Self.signupInput(email: email, password: password, name: name, ref: ref))
    }

    func login(email: String, password: String) async throws -> NativeAuthResponse {
        try await client.trpcDecode(NativeAuthResponse.self, path: "/trpc/auth.login", method: "POST", input: Self.loginInput(email: email, password: password))
    }

    static func signupInput(email: String, password: String, name: String, ref: String?) -> [String: Any] {
        var input: [String: Any] = ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password, "name": name.trimmingCharacters(in: .whitespacesAndNewlines)]
        if let ref = ref?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), !ref.isEmpty { input["ref"] = ref }
        return input
    }

    static func loginInput(email: String, password: String) -> [String: Any] {
        ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
    }
}

struct NativeProfileDataAPI {
    let client: BytspotAPIClient

    #if DEBUG
    static let fixtureEnvironmentKey = "BYT_NATIVE_PROFILE_DATA_FIXTURES"

    private var usesAuthenticatedFixtures: Bool {
        let raw = ProcessInfo.processInfo.environment[Self.fixtureEnvironmentKey]?.lowercased()
        return NativeMigrationConfig.isNativeRootEnabled && (raw == "1" || raw == "true" || raw == "authenticated")
    }

    static let fixtureProfile = NativeUserProfileRecord(id: "native-fixture-user", email: "member@example.com", name: "Avery Parker", phone: "+1 404 555 0198", profileImage: nil, address: "Atlanta, GA", birthday: "1994-04-03")
    static let fixtureVehicles = [NativeVehicleRecord(id: "veh_fixture_1", type: "sedan", make: "Tesla", model: "Model 3", year: 2026, color: "Midnight Blue", licensePlate: "BYT-424", photo: nil, vin: nil, transmissionType: "automatic", trunkCategory: "full")]
    static let fixturePaymentMethods = [NativePaymentMethodRecord(id: "pm_fixture_1", type: "card", brand: "visa", last4: "4242", expiryMonth: "04", expiryYear: "30", isDefault: true)]
    static let fixtureNotificationPreferences = NativeNotificationPreferences.webDefaults
    static let fixtureUserPreferences = NativeUserPreferencesRecord(interests: nil, vibes: ["drinks"], cuisines: nil, parking: NativeUserPreferencesRecord.Parking(covered: true, evCharging: true, security: "premium"))
    #endif

    func loadProfile() async throws -> NativeUserProfileRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureProfile }
        #endif
        return try await client.trpcDecode(NativeUserProfileRecord.self, path: "/trpc/user.profile.get")
    }

    func updateProfile(name: String?, phone: String?, address: String?, birthday: String?) async throws -> NativeUserProfileRecord {
        #if DEBUG
        if usesAuthenticatedFixtures {
            return NativeUserProfileRecord(id: Self.fixtureProfile.id, email: Self.fixtureProfile.email, name: name ?? Self.fixtureProfile.name, phone: phone ?? Self.fixtureProfile.phone, profileImage: nil, address: address ?? Self.fixtureProfile.address, birthday: birthday ?? Self.fixtureProfile.birthday)
        }
        #endif
        var input: [String: Any] = [:]
        if let name, !name.isEmpty { input["name"] = name }
        if let phone, !phone.isEmpty { input["phone"] = phone }
        if let address, !address.isEmpty { input["address"] = address }
        if let birthday, !birthday.isEmpty { input["birthday"] = birthday }
        return try await client.trpcDecode(NativeUserProfileRecord.self, path: "/trpc/user.profile.update", method: "POST", input: input)
    }

    func listVehicles() async throws -> [NativeVehicleRecord] {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureVehicles }
        #endif
        return try await client.trpcDecode([NativeVehicleRecord].self, path: "/trpc/user.vehicles.list")
    }

    func addVehicle(_ vehicle: NativeVehicleRecord) async throws -> NativeVehicleRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativeVehicleRecord(id: "veh_fixture_new", type: vehicle.type, make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color, licensePlate: vehicle.licensePlate, photo: vehicle.photo, vin: vehicle.vin, transmissionType: vehicle.transmissionType, trunkCategory: vehicle.trunkCategory) }
        #endif
        return try await client.trpcDecode(NativeVehicleRecord.self, path: "/trpc/user.vehicles.add", method: "POST", input: vehicleInput(vehicle, includeID: false))
    }

    func updateVehicle(_ vehicle: NativeVehicleRecord) async throws -> NativeVehicleRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return vehicle }
        #endif
        return try await client.trpcDecode(NativeVehicleRecord.self, path: "/trpc/user.vehicles.update", method: "POST", input: vehicleInput(vehicle, includeID: true))
    }

    func removeVehicle(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/user.vehicles.remove", method: "POST", input: ["id": id])
    }

    func listPaymentMethods() async throws -> [NativePaymentMethodRecord] {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixturePaymentMethods }
        #endif
        return try await client.trpcDecode([NativePaymentMethodRecord].self, path: "/trpc/payments.listMethods")
    }

    func createPaymentSetupSession() async throws -> NativePaymentSetupSession {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativePaymentSetupSession(url: nil) }
        #endif
        return try await client.trpcDecode(NativePaymentSetupSession.self, path: "/trpc/payments.setupSession", method: "POST", input: ["successPath": "/profile/payment", "cancelPath": "/profile/payment"])
    }

    func setDefaultPaymentMethod(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/payments.setDefaultMethod", method: "POST", input: ["paymentMethodId": id])
    }

    func removePaymentMethod(id: String) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcPayload(path: "/trpc/payments.removeMethod", method: "POST", input: ["paymentMethodId": id])
    }

    func loadNotificationPreferences() async throws -> NativeNotificationPreferences {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureNotificationPreferences }
        #endif
        return try await client.trpcDecode(NativeNotificationPreferences.self, path: "/trpc/user.notifications.getPrefs")
    }

    func updateNotificationPreferences(_ preferences: NativeNotificationPreferences) async throws {
        #if DEBUG
        if usesAuthenticatedFixtures { return }
        #endif
        _ = try await client.trpcDecode(NativeMutationSuccess.self, path: "/trpc/user.notifications.updatePrefs", method: "POST", input: Self.notificationInput(preferences))
    }

    func loadUserPreferences() async throws -> NativeUserPreferencesRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return Self.fixtureUserPreferences }
        #endif
        return try await client.trpcDecode(NativeUserPreferencesRecord.self, path: "/trpc/user.preferences.get")
    }

    func updateUserPreferenceSummary(vibeToken: String? = nil, parking: NativeUserPreferencesRecord.Parking? = nil) async throws -> NativeUserPreferencesRecord {
        #if DEBUG
        if usesAuthenticatedFixtures { return NativeUserPreferencesRecord(interests: nil, vibes: vibeToken.map { [$0] } ?? Self.fixtureUserPreferences.vibes, cuisines: nil, parking: parking ?? Self.fixtureUserPreferences.parking) }
        #endif
        return try await client.trpcDecode(NativeUserPreferencesRecord.self, path: "/trpc/user.preferences.update", method: "POST", input: Self.userPreferencesInput(vibeToken: vibeToken, parking: parking))
    }

    static func notificationInput(_ preferences: NativeNotificationPreferences) -> [String: Any] {
        [
            "push": ["reservations": preferences.push.reservations, "promotions": preferences.push.promotions, "reminders": preferences.push.reminders, "insider": preferences.push.insider, "nearby": preferences.push.nearby],
            "email": ["reservations": preferences.email.reservations, "promotions": preferences.email.promotions, "newsletter": preferences.email.newsletter, "receipts": preferences.email.receipts],
            "sms": ["reservations": preferences.sms.reservations, "reminders": preferences.sms.reminders, "emergencies": preferences.sms.emergencies]
        ]
    }

    static func userPreferencesInput(vibeToken: String? = nil, parking: NativeUserPreferencesRecord.Parking? = nil) -> [String: Any] {
        var input: [String: Any] = [:]
        if let vibeToken, !vibeToken.isEmpty { input["vibes"] = [vibeToken] }
        if let parking {
            var parkingInput: [String: Any] = [:]
            if let covered = parking.covered { parkingInput["covered"] = covered }
            if let evCharging = parking.evCharging { parkingInput["evCharging"] = evCharging }
            if let security = parking.security, !security.isEmpty { parkingInput["security"] = security }
            if !parkingInput.isEmpty { input["parking"] = parkingInput }
        }
        return input
    }

    private func vehicleInput(_ vehicle: NativeVehicleRecord, includeID: Bool) -> [String: Any] {
        var input: [String: Any] = [
            "type": vehicle.type,
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "color": vehicle.color,
            "licensePlate": vehicle.licensePlate,
            "transmissionType": vehicle.transmissionType,
            "trunkCategory": vehicle.trunkCategory
        ]
        if includeID { input["id"] = vehicle.id }
        if let photo = vehicle.photo, !photo.isEmpty { input["photo"] = photo }
        if let vin = vehicle.vin, !vin.isEmpty { input["vin"] = vin }
        return input
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
                errorMessage: "Live tab data unavailable; using curated picks."
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
        let serviceCards = mergeCanonicalDiscoverCards(into: services)
        let combined = Array(serviceCards + venueCards)
        return combined.isEmpty ? NativeTabContentSnapshot.fallback.discoverCards : combined
    }

    private static func serviceCard(from item: [String: Any], index: Int) -> NativeDiscoverSummary {
        let vendor = item["vendor"] as? [String: Any]
        let title = string(item, ["title", "name"]) ?? string(vendor, ["displayName", "name"]) ?? "Local Service"
        let subtitle = string(item, ["serviceSubtitle", "subtitle", "description"]) ?? string(vendor, ["tagline"]) ?? "Trusted local service"
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
            cta: string(item, ["ctaText", "action"]) ?? "Request Service",
            imageUrl: url(item, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]) ?? url(vendor, ["heroImageUrl", "heroImageURL", "imageUrl", "thumbnailUrl"]),
            categoryLabel: "Services",
            badgeText: "Service",
            metadataLine: "\(price) • \(string(item, ["availability", "availabilityWindow"]) ?? "Available now")",
            features: Array((features.isEmpty ? [rawCategory.capitalized, "Trusted provider", "Member pricing"] : features).prefix(4)),
            vibeScore: min(max(int(item, ["vibeScore", "vibe"]) ?? 8, 1), 10),
            availability: string(item, ["availability"]) ?? "Available now",
            membershipRequired: true
        )
    }

    private static func mergeCanonicalDiscoverCards(into liveServices: [NativeDiscoverSummary]) -> [NativeDiscoverSummary] {
        var cards = liveServices
        for canonical in NativeTabContentSnapshot.specialDiscoverCards.reversed() where !cards.contains(where: { $0.id == canonical.id || $0.title.caseInsensitiveCompare(canonical.title) == .orderedSame }) {
            cards.insert(canonical, at: 0)
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
        case "boutique_apartment": return "house.fill"
        case "entertainment": return "ticket.fill"
        case "fitness": return "figure.mind.and.body"
        case "shopping": return "bag.fill"
        case "mobility": return "car.side.fill"
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

    static let canonicalMobilityCards = [
        NativeDiscoverSummary(id: "service-valet-ride", type: "mobility", title: "Private Airport Transfer", subtitle: "Schedule an airport ride with upfront price, driver matching, and My Access confirmation.", distance: "Mobility", rating: "4.9", icon: "airplane.departure", verified: true, entryType: "paid", cta: "Book Transfer", imageUrl: URL(string: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Mobility", badgeText: "Airport Ride", metadataLine: "Bytspot + Elife · Airport", features: ["Check price & drivers", "Bytspot vendor matching", "My Access confirmation"], vibeScore: 8, availability: "Price + drivers", membershipRequired: true),
        NativeDiscoverSummary(id: "group-transport", type: "mobility", title: "Group Transport", subtitle: "Plan vans, event shuttles, and private buses for a crew or airport transfer.", distance: "Group", rating: "4.8", icon: "bus.fill", verified: true, entryType: "paid", cta: "Plan Group Ride", imageUrl: URL(string: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Mobility", badgeText: "Group Ride", metadataLine: "Vans · Shuttles · Private buses", features: ["Event shuttle", "Group ride", "Private bus"], vibeScore: 7, availability: "Request quote", membershipRequired: true)
    ]

    static let canonicalServiceCards = [
        NativeDiscoverSummary(id: "broni-home-taste", type: "service", title: "Broni Home Taste", subtitle: "Ghanaian comfort food, ready for pickup or delivery.", distance: "Service", rating: "4.9", icon: "fork.knife", verified: true, entryType: "paid", cta: "View Menu", imageUrl: URL(string: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Dining", badgeText: "Dining", metadataLine: "From $21 • Available now", features: ["Jollof + chicken", "Banku + tilapia", "Family-style portions"], vibeScore: 9, availability: "Available now", membershipRequired: true),
        NativeDiscoverSummary(id: "gh-akwaaba-pass", type: "service", title: "GH Akwaaba Pass", subtitle: "Ghana matchday access, ready on your phone.", distance: "Pass", rating: "4.9", icon: "ticket.fill", verified: true, entryType: "paid", cta: "View Pass", imageUrl: URL(string: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=88"), categoryLabel: "Event Pass", badgeText: "Event Pass", metadataLine: "$50 • Digital pass ready", features: ["Fast-track entry", "VIP lounge access", "Digital pass delivery"], vibeScore: 9, availability: "Digital pass ready", membershipRequired: true)
    ]

    static let specialDiscoverCards = canonicalMobilityCards + canonicalServiceCards

    static let fallbackDiscoverCards = [
        NativeDiscoverSummary(id: "coffee-walk", type: "coffee", title: "Morning Coffee Walk", subtitle: "Low-key cafés and brunch spots within a quick walk.", distance: "0.4 mi", rating: "4.8", icon: "cup.and.saucer.fill", verified: true, entryType: "free", cta: "Open details", imageUrl: URL(string: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80"), categoryLabel: "Coffee", badgeText: "FREE ENTRY", metadataLine: "Free", features: ["Coffee", "Brunch", "Quick walk"], vibeScore: 6, availability: "Open now", membershipRequired: false),
        NativeDiscoverSummary(id: "midtown-boutique-suite", type: "boutique_apartment", title: "Midtown Boutique Suite", subtitle: "Furnished short-stay suite with secure entry, host support, and easy arrival.", distance: "Midtown", rating: "4.9", icon: "house.fill", verified: true, entryType: "paid", cta: "View Stay", imageUrl: URL(string: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=84"), categoryLabel: "Boutique Stay", badgeText: "BOUTIQUE STAY", metadataLine: "From $189/night · Available tonight", features: ["Sleeps 2", "Kitchen", "Secure entry", "Host support"], vibeScore: 8, availability: "Available tonight", membershipRequired: true),
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
