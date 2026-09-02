import SwiftUI
import UIKit

/// A recap photo. `id` is the photo; `position` is only the slot it happens to
/// occupy, and slots are reused the moment one is removed. Takedowns name the
/// id, so a stale screen cannot take down whatever replaced what it is showing.
struct NativePartyRecapPhoto: Codable, Identifiable, Equatable {
    let id: String
    let position: Int
    let url: String
}

struct NativePartyRecap: Codable, Equatable {
    let publishedAt: String?
    let photoURLs: [String]
    /// Absent on a server that predates positions. Falling back to the URL list
    /// gives a viewer the photos while leaving the host surface unable to edit,
    /// which is the safe half to keep.
    let photos: [NativePartyRecapPhoto]?

    static let maxPhotos = 12

    var isPublished: Bool { publishedAt != nil }
    var addressablePhotos: [NativePartyRecapPhoto] { photos ?? [] }
    var isEditable: Bool { photos != nil }
    var occupiedPositions: Set<Int> { Set(addressablePhotos.map(\.position)) }
    var isFull: Bool { addressablePhotos.count >= Self.maxPhotos }
}

/// A room this guest was admitted to and that is now over. The way back to a
/// Party Pass after the room closes, so a recap is not reachable only by
/// whoever still holds the original invitation link.
struct NativeAttendedRoom: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    /// Present only where the host made the venue public. Everything else is
    /// the disclosure, not the place.
    let locationLabel: String?
    let locationDisclosure: String?
    let startsAt: String
    let endsAt: String?
    let status: String
    /// Whether the door actually admitted them on the night. Reported, but
    /// never what makes the room reachable: a confirmed guest who never came
    /// still holds the pass.
    let attended: Bool
    /// Already the count `events.recap.get` would serve. Staged photos are
    /// zero here, so a room can never advertise an album the read would refuse.
    let recapAvailable: Bool
    let recapPhotoCount: Int

    var startsAtDate: Date? { ISO8601DateFormatter.partyControlDate(from: startsAt) }

    /// The same words the Party Pass uses, so a room reads the same in the list
    /// that leads back to it as it does once opened. A missing label is never
    /// filled in from anywhere else.
    var safeLocationLabel: String {
        if locationDisclosure == "public", let locationLabel, !locationLabel.isEmpty { return locationLabel }
        return locationDisclosure == "withheld" ? "Location withheld by host" : "Location shared after approval"
    }
}

struct NativeAttendedRoomList: Codable { let rooms: [NativeAttendedRoom] }

struct NativePartyRecapAPI {
    let client: BytspotAPIClient

    func history() async throws -> [NativeAttendedRoom] {
        let payload = try await client.trpcQueryPayload(path: "/trpc/events.pass.history", input: [:])
        return try JSONDecoder().decode(NativeAttendedRoomList.self, from: JSONSerialization.data(withJSONObject: payload)).rooms
    }

    func get(_ partyID: String) async throws -> NativePartyRecap {
        let payload = try await client.trpcQueryPayload(path: "/trpc/events.recap.get", input: ["partyId": partyID])
        return try JSONDecoder().decode(NativePartyRecap.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    /// No slot is named. Two devices holding the same album both compute the
    /// same free slot; only the server, behind the unique index, can allocate
    /// one without overwriting a photo that is already there.
    func upload(_ partyID: String, dataURI: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.upload", method: "POST", input: ["partyId": partyID, "dataUri": dataURI])
    }

    func publish(_ partyID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.publish", method: "POST", input: ["partyId": partyID])
    }

    func unpublish(_ partyID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.unpublish", method: "POST", input: ["partyId": partyID])
    }

    func remove(_ partyID: String, mediaID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.remove", method: "POST", input: ["partyId": partyID, "mediaId": mediaID])
    }
}

/// Recap bytes are the one image surface that re-checks the guest list on every
/// read, so they cannot be fetched by URL alone the way a cover can. The server
/// answers `private, no-store`; this loader honours that by keeping decoded
/// images in memory for the lifetime of the screen and never touching the disk
/// cache or `URLCache`.
@MainActor
final class NativeAuthenticatedImageStore: ObservableObject {
    @Published private(set) var images: [String: UIImage] = [:]
    /// Keyed by the epoch each read belongs to. A clear must not only stop the
    /// old read writing back, it must stop the old read's bookkeeping from
    /// suppressing the authorized read that replaces it.
    private var inFlight: [String: Int] = [:]
    private let client: BytspotAPIClient
    /// Bumped by every clear. A read that was already in the air when the
    /// screen or the session went away must not be able to put a photograph
    /// back on it: clearing has to invalidate work in flight, not just the
    /// bytes that happen to have arrived already.
    private var epoch = 0

    /// Its own session, never `URLSession.shared`. The server sends no-store and
    /// a conforming loader honours it, but a surface that must not persist
    /// photographs of identifiable people should not be relying on a response
    /// header to stay out of a disk cache it shares with every other request.
    static func ephemeralSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return URLSession(configuration: configuration)
    }

    /// The token is read per request, not captured once: a store built during
    /// one session must not keep fetching with that session's token after a
    /// sign-out or an account switch.
    convenience init(tokenProvider: @escaping () -> String?) {
        self.init(client: BytspotAPIClient(tokenProvider: tokenProvider, urlSession: Self.ephemeralSession()))
    }

    init(client: BytspotAPIClient) { self.client = client }

    func load(_ url: String) async {
        let requested = epoch
        // Only a read from the current epoch de-duplicates. One still draining
        // from a cleared epoch has to be overtaken, or the cell it belongs to
        // waits on bytes this store has already promised never to accept.
        guard images[url] == nil, inFlight[url] != requested else { return }
        inFlight[url] = requested
        defer { if inFlight[url] == requested { inFlight.removeValue(forKey: url) } }
        guard let data = try? await client.data(path: url), !Task.isCancelled, epoch == requested,
              let image = UIImage(data: data) else { return }
        images[url] = image
    }

    /// A removed photo must leave the screen with its bytes, not linger in a
    /// cache keyed on a URL the server now refuses.
    func forget(_ url: String) { images.removeValue(forKey: url) }

    func forgetAll() {
        epoch &+= 1
        images.removeAll()
    }

    /// A decoded photograph is not re-authorized by looking at it again: the
    /// store answers from memory once the bytes have arrived. A surface whose
    /// permission can be taken away has to drop what it is holding and ask
    /// again, which is what this is for.
    func invalidate() { forgetAll() }
}

struct NativeAuthenticatedImage: View {
    let url: String
    @ObservedObject var store: NativeAuthenticatedImageStore

    var body: some View {
        ZStack {
            if let image = store.images[url] {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(Color.white.opacity(0.06)).overlay(ProgressView().tint(.white.opacity(0.5)))
            }
        }
        .task(id: url) { await store.load(url) }
    }
}
