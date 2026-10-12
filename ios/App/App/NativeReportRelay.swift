import CoreLocation
import CryptoKit
import Foundation
import MultipeerConnectivity
import Security

/// A Traffic Intel report signed by the reporter's phone, so a nearby phone
/// can carry it to Bytspot without being able to change it. The server checks
/// the signature against the key registered to the reporter.
struct NativeRelayedReport: Codable, Equatable, Identifiable {
    /// The exact JSON that was signed.
    struct Payload: Codable, Equatable {
        let v: Int
        let keyId: String
        let clientReportId: String
        let kind: String
        let lat: Double
        let lng: Double
        let reportedAt: String
    }

    let keyId: String
    /// The reporter's P-256 public key, uncompressed, base64. Lets a phone
    /// check a report before carrying it.
    let publicKey: String
    let payload: String
    /// ECDSA P-256 / SHA-256, r‖s, base64.
    let signature: String

    var id: String { decoded?.clientReportId ?? signature }
    var decoded: Payload? { try? JSONDecoder().decode(Payload.self, from: Data(payload.utf8)) }
    var reportedDate: Date? { decoded.flatMap { NativeMapReport.date($0.reportedAt) } }

    static func make(kind: String, latitude: Double, longitude: Double, clientReportID: String,
                     keyID: String, privateKey: P256.Signing.PrivateKey, at date: Date = Date()) throws -> NativeRelayedReport {
        let payload = Payload(v: 1, keyId: keyID, clientReportId: clientReportID, kind: kind, lat: latitude, lng: longitude,
                              reportedAt: ISO8601DateFormatter().string(from: date))
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        let signature = try privateKey.signature(for: Data(text.utf8))
        return NativeRelayedReport(keyId: keyID, publicKey: privateKey.publicKey.x963Representation.base64EncodedString(),
                                   payload: text, signature: signature.rawRepresentation.base64EncodedString())
    }

    /// Signed by the key it carries, naming that key, and under thirty minutes old.
    func isValid(at now: Date) -> Bool {
        guard let decoded, decoded.keyId == keyId, let reported = reportedDate,
              now.timeIntervalSince(reported) < NativeRelayInbox.lifetime, reported.timeIntervalSince(now) < 120,
              let keyData = Data(base64Encoded: publicKey), let signatureData = Data(base64Encoded: signature),
              let key = try? P256.Signing.PublicKey(x963Representation: keyData),
              let ecdsa = try? P256.Signing.ECDSASignature(rawRepresentation: signatureData) else { return false }
        return key.isValidSignature(ecdsa, for: Data(payload.utf8))
    }

    /// The report as the Map lists it until Bytspot has it.
    func communityReport(from origin: CLLocationCoordinate2D?, isMine: Bool, now: Date = Date()) -> NativeCommunityReport? {
        guard let decoded, let category = NativeCommunityReport.Category(rawValue: decoded.kind) else { return nil }
        let miles = origin.map {
            CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: CLLocation(latitude: decoded.lat, longitude: decoded.lng)) / 1609.344
        }
        return NativeCommunityReport(
            id: "carried-\(decoded.clientReportId)",
            category: category,
            title: category.reportedTitle,
            distance: miles.map { String(format: "%.1f mi", $0) } ?? "Nearby",
            distanceMiles: miles ?? 0,
            minutesAgo: reportedDate.map { max(0, Int(now.timeIntervalSince($0) / 60)) } ?? 0,
            x: 0.5,
            y: 0.5,
            latitude: decoded.lat,
            longitude: decoded.lng,
            isConfirmed: false,
            isMine: isMine,
            carriedLabel: isMine ? NativeCommunityReport.waitingForSignalLabel : NativeCommunityReport.fromNearbyPhoneLabel
        )
    }
}

/// Reports this phone holds until it, or a phone it passes them to, reaches Bytspot.
struct NativeRelayInbox: Codable, Equatable {
    static let lifetime: TimeInterval = 30 * 60
    static let capacity = 50
    /// Where held reports are kept between launches.
    static var fileURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("held-map-reports.json")
    }

    private(set) var reports: [NativeRelayedReport] = []
    /// Reports made on this phone.
    private(set) var mine: Set<String> = []

    /// Adds a valid report it doesn't hold yet; true when added.
    @discardableResult
    mutating func add(_ report: NativeRelayedReport, isMine: Bool = false, now: Date = Date()) -> Bool {
        prune(now: now)
        guard report.isValid(at: now), !reports.contains(where: { $0.id == report.id }) else { return false }
        reports.append(report)
        if isMine { mine.insert(report.id) }
        if reports.count > Self.capacity {
            let dropped = reports.removeFirst()
            mine.remove(dropped.id)
        }
        return true
    }

    mutating func remove(ids: Set<String>) {
        reports.removeAll { ids.contains($0.id) }
        mine.subtract(ids)
    }

    mutating func prune(now: Date = Date()) {
        let expired = Set(reports.filter { report in
            guard let reported = report.reportedDate else { return true }
            return now.timeIntervalSince(reported) >= Self.lifetime
        }.map(\.id))
        if !expired.isEmpty { remove(ids: expired) }
    }
}

/// The phone's signing key for its reports, one per member, kept in the
/// Keychain on this device. `keyID` is set once Bytspot has registered it.
struct NativeRelayKey: Codable {
    static let service = "app.bytspot.map-report-relay"

    let privateKey: Data
    var keyID: String?

    var signingKey: P256.Signing.PrivateKey? { try? P256.Signing.PrivateKey(rawRepresentation: privateKey) }
    var publicKey: String? { signingKey?.publicKey.x963Representation.base64EncodedString() }

    static func load(userID: String) -> NativeRelayKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userID,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(NativeRelayKey.self, from: data)
    }

    static func loadOrCreate(userID: String) -> NativeRelayKey? {
        if let key = load(userID: userID) { return key }
        let key = NativeRelayKey(privateKey: P256.Signing.PrivateKey().rawRepresentation, keyID: nil)
        return key.save(userID: userID) ? key : nil
    }

    @discardableResult
    func save(userID: String) -> Bool {
        guard let data = try? JSONEncoder().encode(self) else { return false }
        let match: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: userID,
        ]
        SecItemDelete(match as CFDictionary)
        var item = match
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        item[kSecValueData as String] = data
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }
}

/// Reports that reached Bytspot in one upload, for the Map to show.
struct NativeRelayDelivery: Equatable {
    struct Item: Equatable {
        let result: NativeMapReportResult
        let isMine: Bool
    }

    let id = UUID()
    let items: [Item]
}

/// Holds reports on the phone, saved across launches, and sends them to
/// Bytspot once it's back online. With "Share reports nearby" on, it also
/// passes them between phones near each other with Bytspot open; iOS ends
/// those connections when the app leaves the foreground.
@MainActor
final class NativeReportRelay: NSObject, ObservableObject {
    static let serviceType = "byt-reports"
    static let enabledKey = "bytspot.map.shareReportsNearby"

    @Published private(set) var inbox: NativeRelayInbox {
        didSet { if inbox != oldValue { save() } }
    }
    @Published private(set) var connectedPeers = 0
    @Published private(set) var lastDelivery: NativeRelayDelivery?

    private let storeURL: URL?
    private var isUploading = false

    private let peer = MCPeerID(displayName: "Bytspot-\(UUID().uuidString.prefix(8))")
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    var isRunning: Bool { session != nil }

    init(storeURL: URL? = NativeRelayInbox.fileURL) {
        self.storeURL = storeURL
        var saved = storeURL.flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(NativeRelayInbox.self, from: $0) } ?? NativeRelayInbox()
        saved.prune()
        inbox = saved
        super.init()
    }

    private func save() {
        guard var storeURL else { return }
        do {
            try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(inbox).write(to: storeURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try storeURL.setResourceValues(values)
        } catch {}
    }

    /// Registers this phone's signing key once per member, so its reports can
    /// be saved and carried by another phone when it has no signal.
    func registerKeyIfNeeded(userID: String, api: NativeMapReportsAPI) async {
        guard var key = NativeRelayKey.loadOrCreate(userID: userID), key.keyID == nil, let publicKey = key.publicKey,
              let keyID = try? await api.registerRelayKey(publicKey: publicKey) else { return }
        key.keyID = keyID
        key.save(userID: userID)
    }

    /// Sends held reports to Bytspot, 25 at a time. Every answered report is
    /// let go; accepted ones are published as `lastDelivery`.
    func upload(using api: NativeMapReportsAPI) async {
        inbox.prune()
        guard !isUploading, !inbox.reports.isEmpty else { return }
        isUploading = true
        defer { isUploading = false }
        let held = inbox.reports
        let mine = inbox.mine
        var delivered: [NativeRelayDelivery.Item] = []
        for start in stride(from: 0, to: held.count, by: NativeMapReportsAPI.relayBatchSize) {
            let batch = Array(held[start..<min(start + NativeMapReportsAPI.relayBatchSize, held.count)])
            guard let results = try? await api.relay(batch) else { break }
            for result in results {
                guard result.isAccepted, let report = result.report else { continue }
                delivered.append(.init(result: NativeMapReportResult(report: report, removed: result.removed ?? false, merged: nil),
                                       isMine: result.clientReportId.map { mine.contains($0) } == true))
            }
            inbox.remove(ids: Set(batch.map(\.id)))
        }
        if !delivered.isEmpty { lastDelivery = NativeRelayDelivery(items: delivered) }
    }

    func start() {
        guard session == nil else { return }
        let session = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        let advertiser = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: nil, serviceType: Self.serviceType)
        advertiser.delegate = self
        let browser = MCNearbyServiceBrowser(peer: peer, serviceType: Self.serviceType)
        browser.delegate = self
        self.session = session
        self.advertiser = advertiser
        self.browser = browser
        advertiser.startAdvertisingPeer()
        browser.startBrowsingForPeers()
    }

    func stop() {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        session?.disconnect()
        advertiser = nil
        browser = nil
        session = nil
        connectedPeers = 0
    }

    /// Holds a report and passes it to the phones connected now.
    func hold(_ report: NativeRelayedReport, isMine: Bool = false) {
        guard inbox.add(report, isMine: isMine) else { return }
        send([report], to: session?.connectedPeers ?? [])
    }

    func remove(ids: Set<String>) {
        inbox.remove(ids: ids)
    }

    func prune() {
        inbox.prune()
    }

    private func send(_ reports: [NativeRelayedReport], to peers: [MCPeerID]) {
        guard let session, !peers.isEmpty, !reports.isEmpty, let data = try? JSONEncoder().encode(reports) else { return }
        try? session.send(data, toPeers: peers, with: .reliable)
    }

    private func received(_ data: Data) {
        guard data.count <= 256 * 1024, let reports = try? JSONDecoder().decode([NativeRelayedReport].self, from: data) else { return }
        for report in reports.prefix(NativeRelayInbox.capacity) { hold(report) }
    }

    private func peerChanged(_ peerID: MCPeerID, connected: Bool) {
        connectedPeers = session?.connectedPeers.count ?? 0
        if connected {
            inbox.prune()
            send(inbox.reports, to: [peerID])
        }
    }
}

extension NativeReportRelay: MCSessionDelegate {
    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        guard state != .connecting else { return }
        Task { @MainActor in self.peerChanged(peerID, connected: state == .connected) }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        Task { @MainActor in self.received(data) }
    }

    nonisolated func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    nonisolated func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    nonisolated func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

extension NativeReportRelay: MCNearbyServiceAdvertiserDelegate {
    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        Task { @MainActor in invitationHandler(self.session != nil, self.session) }
    }
}

extension NativeReportRelay: MCNearbyServiceBrowserDelegate {
    /// Only one of two phones invites, so they don't connect twice.
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        Task { @MainActor in
            guard let session = self.session, self.peer.displayName < peerID.displayName,
                  !session.connectedPeers.contains(peerID) else { return }
            browser.invitePeer(peerID, to: session, withContext: nil, timeout: 15)
        }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}
}
