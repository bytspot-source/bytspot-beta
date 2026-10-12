import Foundation

/// Securing a band, card or tag: the server authenticates with the chip and
/// sets its keys, and the phone only carries APDUs between the two. Nothing
/// here touches Core NFC, so the relay runs against a fake chip in tests.

extension Data {
    /// Uppercase hex, two characters per byte.
    var secureBandHex: String { map { String(format: "%02X", $0) }.joined() }

    /// Parses hex of either case. Nil for odd length or a non-hex character.
    init?(secureBandHex hex: String) {
        let chars = Array(hex.utf8)
        guard chars.count % 2 == 0 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(chars.count / 2)
        var index = 0
        while index < chars.count {
            guard let high = Self.nibble(chars[index]), let low = Self.nibble(chars[index + 1]) else { return nil }
            bytes.append(high << 4 | low)
            index += 2
        }
        self.init(bytes)
    }

    private static func nibble(_ char: UInt8) -> UInt8? {
        switch char {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): return char - UInt8(ascii: "0")
        case UInt8(ascii: "a")...UInt8(ascii: "f"): return char - UInt8(ascii: "a") + 10
        case UInt8(ascii: "A")...UInt8(ascii: "F"): return char - UInt8(ascii: "A") + 10
        default: return nil
        }
    }
}

/// Body of POST /vendor/bands/secure. The first call carries no state and no
/// responses; later calls carry the server's sealed state and the chip's replies.
struct SecureBandRequest: Equatable {
    let band: String
    let uid: String
    var state: String? = nil
    var responses: [String]? = nil

    func jsonObject() -> [String: Any] {
        var object: [String: Any] = ["band": band, "uid": uid]
        if let state { object["state"] = state }
        if let responses { object["responses"] = responses }
        return object
    }

    func jsonBody() throws -> Data {
        try JSONSerialization.data(withJSONObject: jsonObject(), options: [.sortedKeys])
    }
}

struct SecuredBand: Equatable, Identifiable {
    let serial: String
    let form: String?
    let secured: Bool

    var id: String { serial }

    var formLabel: String {
        switch form {
        case "band": return "Band"
        case "card": return "Card"
        case "event_fob": return "Event fob"
        case "key_fob": return "Key fob"
        case "epoxy": return "Tag"
        default: return "Item"
        }
    }
}

enum SecureBandReply: Equatable {
    /// Reply A: send each APDU to the chip, then post again with this state.
    case apdus([String], state: String)
    /// Reply B: the item is done.
    case secured(SecuredBand)
}

enum SecureBandError: Error, Equatable {
    /// The server refused; the text is written for staff.
    case refused(String)
    /// The business session is no longer valid.
    case signedOut
    /// The chip stopped answering or moved away.
    case tagLost
    /// The request did not reach the server or came back unreadable.
    case network
    /// The server kept asking for more rounds than securing ever needs.
    case tooManyRounds

    static let holdStill = "Hold it still against the top of the phone and try again."

    var staffMessage: String {
        switch self {
        case .refused(let text): return text
        case .signedOut: return "Your business sign-in ended. Sign in again to keep going."
        case .tagLost, .network, .tooManyRounds: return Self.holdStill
        }
    }
}

enum SecureBandReplyParser {
    static let fallbackRefusal = "Bytspot couldn't secure this item."
    static let noPublishRefusal = "This account can't secure items. Ask an owner of the business for access."

    static func parse(status: Int, data: Data) throws -> SecureBandReply {
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if status == 401 { throw SecureBandError.signedOut }
        if (400..<500).contains(status) {
            if let blocker = (object?["blockers"] as? [String])?.first(where: { !$0.isEmpty }) {
                throw SecureBandError.refused(blocker)
            }
            if status == 403 { throw SecureBandError.refused(noPublishRefusal) }
            if let error = object?["error"] as? String, !error.isEmpty { throw SecureBandError.refused(error) }
            throw SecureBandError.refused(fallbackRefusal)
        }
        guard (200..<300).contains(status), let object else { throw SecureBandError.network }
        if let band = object["band"] as? [String: Any] {
            guard let serial = band["serial"] as? String, !serial.isEmpty else { throw SecureBandError.network }
            guard band["secured"] as? Bool == true else { throw SecureBandError.refused(fallbackRefusal) }
            return .secured(SecuredBand(serial: serial, form: band["form"] as? String, secured: true))
        }
        if let apdus = object["apdus"] as? [String], let state = object["state"] as? String {
            return .apdus(apdus, state: state)
        }
        throw SecureBandError.network
    }
}

/// Runs the rounds between server and chip. `send` returns the chip's response
/// data followed by SW1 SW2; `post` sends one request and returns the parsed
/// reply. Anything `send` throws counts as the tag being lost, and anything
/// `post` throws other than a `SecureBandError` counts as a network failure.
struct SecureBandRelay {
    static let continueStatuses: Set<UInt16> = [0x9000, 0x9100, 0x91AF]
    static let maxRounds = 12

    let send: (Data) async throws -> Data
    let post: (SecureBandRequest) async throws -> SecureBandReply
    var progress: (Int) -> Void = { _ in }

    func run(band: String, uid: String) async throws -> SecuredBand {
        var request = SecureBandRequest(band: band, uid: uid)
        for round in 1...Self.maxRounds {
            progress(round)
            let reply: SecureBandReply
            do {
                reply = try await post(request)
            } catch let error as SecureBandError {
                throw error
            } catch {
                throw SecureBandError.network
            }
            switch reply {
            case .secured(let band):
                return band
            case .apdus(let apdus, let state):
                let responses = try await exchange(apdus)
                request = SecureBandRequest(band: band, uid: uid, state: state, responses: responses.map(\.secureBandHex))
            }
        }
        throw SecureBandError.tooManyRounds
    }

    /// Sends the APDUs in order and stops after the first response whose
    /// status word is not a continue status, keeping that response.
    func exchange(_ apdus: [String]) async throws -> [Data] {
        var responses: [Data] = []
        for hex in apdus {
            guard let apdu = Data(secureBandHex: hex), !apdu.isEmpty else { throw SecureBandError.network }
            let response: Data
            do {
                response = try await send(apdu)
            } catch {
                throw SecureBandError.tagLost
            }
            guard let status = Self.statusWord(response) else { throw SecureBandError.tagLost }
            responses.append(response)
            if !Self.continueStatuses.contains(status) { break }
        }
        return responses
    }

    static func statusWord(_ response: Data) -> UInt16? {
        guard response.count >= 2 else { return nil }
        let bytes = Array(response.suffix(2))
        return UInt16(bytes[0]) << 8 | UInt16(bytes[1])
    }
}

/// The Bytspot business (vendor) API. Its token is audience-scoped and kept in
/// memory only, so it never goes through the guest session renewer.
struct NativeVendorAPI {
    var client = BytspotAPIClient()
    var accessToken: String? = nil
    var sellerID: String? = nil

    static let codePath = "/vendor/auth/code"
    static let sessionPath = "/vendor/auth/session"
    static let securePath = "/vendor/bands/secure"

    func request(path: String, body: Data) throws -> URLRequest {
        var request = try client.makeRequest(path: path, method: "POST", body: body)
        request.timeoutInterval = 20
        if let accessToken, !accessToken.isEmpty {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let sellerID, !sellerID.isEmpty {
            request.setValue(sellerID, forHTTPHeaderField: "x-bytspot-seller")
        }
        return request
    }

    func post(path: String, json: [String: Any]) async throws -> (Data, HTTPURLResponse) {
        let body = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
        let (data, response) = try await client.urlSession.data(for: try request(path: path, body: body))
        guard let http = response as? HTTPURLResponse else { throw BytspotAPIClient.APIError.invalidResponse }
        return (data, http)
    }

    func secure(_ body: SecureBandRequest) async throws -> SecureBandReply {
        let (data, http) = try await post(path: Self.securePath, json: body.jsonObject())
        return try SecureBandReplyParser.parse(status: http.statusCode, data: data)
    }
}

struct VendorSeller: Decodable, Equatable, Identifiable {
    let id: String
    let legalName: String
    let state: String
}

struct VendorMembership: Decodable, Equatable {
    let seller: VendorSeller
}

struct VendorSession: Decodable, Equatable {
    let accessToken: String
    let memberships: [VendorMembership]

    /// Closed businesses are never offered.
    var openSellers: [VendorSeller] {
        memberships.map(\.seller).filter { $0.state.uppercased() != "CLOSED" }
    }

    /// The server needs to be told which business when there is a choice.
    var sendsSellerHeader: Bool { memberships.count > 1 }

    func business(_ seller: VendorSeller) -> VendorBusiness {
        VendorBusiness(accessToken: accessToken, seller: seller, sendsSellerHeader: sendsSellerHeader)
    }
}

struct VendorBusiness: Equatable {
    let accessToken: String
    let seller: VendorSeller
    let sendsSellerHeader: Bool

    var api: NativeVendorAPI {
        NativeVendorAPI(accessToken: accessToken, sellerID: sendsSellerHeader ? seller.id : nil)
    }
}

struct VendorSignInError: Error, Equatable {
    let message: String

    static let unreachable = VendorSignInError(message: "Couldn't reach Bytspot. Check your connection and try again.")
    static let noOpenBusiness = VendorSignInError(message: "None of this account's businesses are open.")
}

enum VendorSignInParser {
    static func challengeID(status: Int, data: Data, retryAfter: String?) throws -> String {
        switch status {
        case 200..<300:
            guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let id = object["challengeId"] as? String, !id.isEmpty else { throw VendorSignInError.unreachable }
            return id
        case 429: throw tooMany(retryAfter)
        case 503: throw VendorSignInError(message: "Bytspot can't send email right now. Try again soon.")
        default: throw VendorSignInError(message: "The code couldn't be sent. Try again.")
        }
    }

    static func session(status: Int, data: Data, retryAfter: String? = nil) throws -> VendorSession {
        switch status {
        case 200..<300:
            guard let session = try? JSONDecoder().decode(VendorSession.self, from: data) else { throw VendorSignInError.unreachable }
            guard !session.openSellers.isEmpty else { throw VendorSignInError.noOpenBusiness }
            return session
        case 401: throw VendorSignInError(message: "That code didn't work. Check it, or ask for a new one.")
        case 423: throw VendorSignInError(message: "That code was already used. Ask for a new one.")
        case 403: throw VendorSignInError(message: "This email isn't on any Bytspot business.")
        case 429: throw tooMany(retryAfter)
        default: throw VendorSignInError(message: "Sign-in didn't go through. Try again.")
        }
    }

    static func tooMany(_ retryAfter: String?) -> VendorSignInError {
        guard let seconds = retryAfter.flatMap({ Int($0.trimmingCharacters(in: .whitespaces)) }), seconds > 0 else {
            return VendorSignInError(message: "Too many tries. Wait a few minutes and try again.")
        }
        let minutes = (seconds + 59) / 60
        return VendorSignInError(message: "Too many tries. Try again in \(minutes) minute\(minutes == 1 ? "" : "s").")
    }
}

extension NativeVendorAPI {
    func requestCode(email: String) async throws -> String {
        let (data, http) = try await signInPost(path: Self.codePath, json: ["email": email])
        return try VendorSignInParser.challengeID(status: http.statusCode, data: data, retryAfter: http.value(forHTTPHeaderField: "Retry-After"))
    }

    func startSession(challengeID: String, code: String) async throws -> VendorSession {
        let (data, http) = try await signInPost(path: Self.sessionPath, json: ["challengeId": challengeID, "code": code])
        return try VendorSignInParser.session(status: http.statusCode, data: data, retryAfter: http.value(forHTTPHeaderField: "Retry-After"))
    }

    private func signInPost(path: String, json: [String: Any]) async throws -> (Data, HTTPURLResponse) {
        do {
            return try await post(path: path, json: json)
        } catch {
            throw VendorSignInError.unreachable
        }
    }
}

