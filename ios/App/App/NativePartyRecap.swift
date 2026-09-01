import SwiftUI
import UIKit

/// A recap photo. `position` is the server's slot, not the array index: removing
/// a photo leaves a hole, and upload and remove are both keyed on the slot.
struct NativePartyRecapPhoto: Codable, Identifiable, Equatable {
    let position: Int
    let url: String
    var id: Int { position }
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

    /// The lowest free slot. Reusing a hole keeps an album that has been edited
    /// from running out of positions before it runs out of photos.
    var nextFreePosition: Int? {
        let taken = occupiedPositions
        return (0..<Self.maxPhotos).first { !taken.contains($0) }
    }
}

struct NativePartyRecapAPI {
    let client: BytspotAPIClient

    func get(_ partyID: String) async throws -> NativePartyRecap {
        let payload = try await client.trpcQueryPayload(path: "/trpc/events.recap.get", input: ["partyId": partyID])
        return try JSONDecoder().decode(NativePartyRecap.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    func upload(_ partyID: String, position: Int, dataURI: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.upload", method: "POST", input: ["partyId": partyID, "index": position, "dataUri": dataURI])
    }

    func publish(_ partyID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.publish", method: "POST", input: ["partyId": partyID])
    }

    func unpublish(_ partyID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.unpublish", method: "POST", input: ["partyId": partyID])
    }

    func remove(_ partyID: String, position: Int) async throws {
        _ = try await client.trpcPayload(path: "/trpc/events.recap.remove", method: "POST", input: ["partyId": partyID, "index": position])
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
    private var inFlight: Set<String> = []
    private let client: BytspotAPIClient

    init(client: BytspotAPIClient) { self.client = client }

    func load(_ url: String) async {
        guard images[url] == nil, !inFlight.contains(url) else { return }
        inFlight.insert(url)
        defer { inFlight.remove(url) }
        guard let data = try? await client.data(path: url), let image = UIImage(data: data) else { return }
        images[url] = image
    }

    /// A removed photo must leave the screen with its bytes, not linger in a
    /// cache keyed on a URL the server now refuses.
    func forget(_ url: String) { images.removeValue(forKey: url) }
    func forgetAll() { images.removeAll() }
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
