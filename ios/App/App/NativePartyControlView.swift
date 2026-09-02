import AVFoundation
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct NativePartyControlSummary: Codable {
    let partyId: String; let title: String; let admissionPaused: Bool
    let capacity: Int; let confirmed: Int; let spacesRemaining: Int; let pending: Int; let checkedIn: Int
    // Share-link retrieval + expiry (older servers omit these; treat as unknown).
    let shareUrl: String?; let passCode: String?
    let shareLinkExpiresAt: String?; let shareLinkExpired: Bool?; let shareLinkExpiryIsDefault: Bool?
    let closedAt: String?

    /// Canonical Party Pass URL. Prefer the server value; fall back to the
    /// deterministic https://bytspot.app/party/<id> host already owns.
    var retrievedShareURL: URL? { NativePartyShareLink.url(from: shareUrl) ?? NativePartyShareLink.url(for: partyId) }
    var retrievedPassCode: String? {
        guard let passCode else { return nil }
        let trimmed = passCode.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

struct NativePartyControlGuest: Codable, Identifiable {
    struct Person: Codable { let userId: String; let name: String; let profileImage: String? }
    let id: String; let status: String; let source: String; let ticketTierName: String?; let checkedInAt: String?; let person: Person
    // Optional so a build can outlive an API that predates the field: absent
    // is read as no access, which is the safe reading for a door list.
    let accessGranted: Bool?

    /// Paid and still holding the pass. A refund-required guest also paid, but
    /// their access was revoked, so counting them here would tell a host the
    /// room is fuller than it is.
    var isPaidAndAdmitted: Bool { source == "ticket" && accessGranted == true && status != "refund-required" }
}

struct NativePartyControlGuestList: Codable { let guests: [NativePartyControlGuest] }

struct NativePartyCheckInResult: Codable, Equatable {
    let status: String
    let guestName: String
}

enum NativePartyDoorPassInput {
    /// Door Mode receives the opaque QR payload exactly as scanned. It only
    /// trims surrounding whitespace; it must never parse a URL or alter the
    /// bearer credential before the server validates it.
    static func normalized(_ rawValue: String) -> String? {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count == 43,
              value.unicodeScalars.allSatisfy({
                  ($0.value >= 65 && $0.value <= 90) ||
                  ($0.value >= 97 && $0.value <= 122) ||
                  ($0.value >= 48 && $0.value <= 57) ||
                  $0.value == 45 || $0.value == 95
              }) else { return nil }
        return value
    }
}

extension ISO8601DateFormatter {
    /// Serializer for `events.control.setShareLinkExpiry` input.
    static let partyControlInstant = ISO8601DateFormatter()
    /// Server timestamps arrive from `Date.toISOString()` with milliseconds.
    static let partyControlFractionalInstant: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func partyControlDate(from raw: String) -> Date? {
        partyControlFractionalInstant.date(from: raw) ?? partyControlInstant.date(from: raw)
    }
}

struct NativePartyShareQR: View {
    let value: String
    var body: some View {
        Image(uiImage: Self.image(value))
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .padding(8)
            .background(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Party share QR code")
            .accessibilityHint("Nearby guests can scan this code to open the Party.")
    }

    static func image(_ value: String) -> UIImage {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else {
            return UIImage()
        }
        return UIImage(cgImage: cgImage)
    }
}

struct NativeHostedParty: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let venueName: String
    let startsAt: String
    let endsAt: String?
    let admissionPaused: Bool
    let shareUrl: String?
    let passCode: String?
    let shareLinkExpiresAt: String
    let shareLinkExpired: Bool
    /// Set once the host closes the room. Older servers omit it, so a missing
    /// value means the room is still open rather than unknown.
    let closedAt: String?
    let capacity: Int
    /// Staged and published are separate facts. Photos can sit in a closed room
    /// that no guest can see, and that is the state a host most needs told.
    /// Older servers omit both, which reads as no recap rather than as an
    /// unpublished one.
    let recapPhotoCount: Int?
    let recapPublished: Bool?

    enum RecapState: Equatable { case none, staged(Int), published(Int) }

    var recapState: RecapState {
        let count = recapPhotoCount ?? 0
        guard count > 0 else { return .none }
        return (recapPublished ?? false) ? .published(count) : .staged(count)
    }

    var startsAtDate: Date? { ISO8601DateFormatter.partyControlDate(from: startsAt) }
    var retrievedShareURL: URL? { NativePartyShareLink.url(from: shareUrl) ?? NativePartyShareLink.url(for: id) }
    var retrievedPassCode: String? {
        guard let passCode else { return nil }
        let trimmed = passCode.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

enum NativePartyShareLink {
    /// Deterministic Party Pass URL. Never minted client-side as a new code —
    /// this is the same https://bytspot.app/party/<id> issued at publish.
    static func url(for partyID: String) -> URL? {
        let trimmed = partyID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("/"), !trimmed.contains(":") else { return nil }
        return URL(string: "https://bytspot.app/party/\(trimmed)")
    }

    static func url(from raw: String?) -> URL? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              host == "bytspot.app" || host.hasSuffix(".bytspot.app") || host == "bytspot.com" || host.hasSuffix(".bytspot.com") else { return nil }
        return url
    }

    @MainActor
    static func share(_ url: URL) -> Bool {
        NativePartySharePresentation.share([url])
    }

    @MainActor
    static func shareQR(for url: URL) -> Bool {
        NativePartySharePresentation.share([NativePartyShareQR.image(url.absoluteString), url])
    }
}

struct NativeHostedPartyList: Codable { let parties: [NativeHostedParty] }

struct NativePartyControlAPI {
    let client: BytspotAPIClient
    private func query<T: Decodable>(_ type: T.Type, path: String, input: [String: Any] = [:]) async throws -> T { let payload = try await client.trpcQueryPayload(path: path, input: input); return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: payload)) }
    func hosted() async throws -> [NativeHostedParty] { try await query(NativeHostedPartyList.self, path: NativeLiveContentV2Contract.partyControlHostedRoute).parties }
    func closedRooms() async throws -> [NativeHostedParty] { try await query(NativeHostedPartyList.self, path: "/trpc/events.control.closedRooms").parties }
    func close(_ partyID: String) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.close", method: "POST", input: ["partyId": partyID]) }
    func reopen(_ partyID: String) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.reopen", method: "POST", input: ["partyId": partyID]) }
    func delete(_ partyID: String) async throws {
        _ = try await client.trpcPayload(path: NativeLiveContentV2Contract.partyDraftDeleteRoute, method: "POST", input: ["partyId": partyID])
    }
    func summary(_ partyID: String) async throws -> NativePartyControlSummary { try await query(NativePartyControlSummary.self, path: "/trpc/events.control.summary", input: ["partyId": partyID]) }
    func guests(_ partyID: String) async throws -> [NativePartyControlGuest] { try await query(NativePartyControlGuestList.self, path: "/trpc/events.control.guests", input: ["partyId": partyID, "status": "all"]).guests }
    func pause(_ partyID: String, paused: Bool) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.setAdmissionPaused", method: "POST", input: ["partyId": partyID, "paused": paused]) }
    func setShareLinkExpiry(_ partyID: String, expiresAt: String?) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.setShareLinkExpiry", method: "POST", input: ["partyId": partyID, "expiresAt": expiresAt ?? NSNull()]) }
    func decide(_ partyID: String, guestID: String, approved: Bool) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.decide", method: "POST", input: ["partyId": partyID, "guestId": guestID, "decision": approved ? "approved" : "declined"]) }
    func checkIn(_ partyID: String, attendeeCredential: String) async throws -> NativePartyCheckInResult {
        let payload = try await client.trpcPayload(path: "/trpc/events.control.checkIn", method: "POST", input: ["partyId": partyID, "attendeeCredential": attendeeCredential])
        let result = try JSONDecoder().decode(NativePartyCheckInResult.self, from: JSONSerialization.data(withJSONObject: payload))
        guard result.status == "checked-in", !result.guestName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw BytspotAPIClient.APIError.invalidResponse
        }
        return result
    }
}

struct NativePartyControlView: View {
    let partyID: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var summary: NativePartyControlSummary?
    @State private var guests: [NativePartyControlGuest] = []
    @State private var message = ""; @State private var showingDoor = false; @State private var scanning = false; @State private var passText = ""; @State private var closeConfirmation = false
    @State private var isCheckingIn = false
    @State private var recap: NativePartyRecap?
    @State private var recapStore: NativeAuthenticatedImageStore?
    @State private var pickingRecap = false
    @State private var recapBusy = false

    var body: some View {
        ZStack { BytspotNativeBackground(tier: .green).ignoresSafeArea(); ScrollView { VStack(alignment: .leading, spacing: 15) {
            HStack { Button(action: { dismiss() }) { Image(systemName: "chevron.left") }; Spacer(); Text("PARTY CONTROL").font(.system(size: 11, weight: .black)).tracking(1.5); Spacer(); Button(action: { Task { await reload() } }) { Image(systemName: "arrow.clockwise") } }.foregroundColor(.white)
            if let summary { overview(summary) } else { ProgressView().tint(.white).frame(maxWidth: .infinity, minHeight: 140) }
            HStack(spacing: 10) { Button(showingDoor ? "Close Door Mode" : "Door Mode") { showingDoor.toggle() }.controlButton(color: NativeTheme.purple); Button((summary?.admissionPaused ?? false) ? "Resume RSVPs" : "Pause RSVPs") { Task { await setPaused() } }.controlButton(color: NativeTheme.orange) }
            closeRoomControl
            if showingDoor { doorMode }
            if !message.isEmpty { Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.emerald) }
            pendingGuests
            paidGuests
            guestList
            recapCard
        }.padding(18) } }
        .preferredColorScheme(.dark).task { await reload() }
        // Recap bytes are photographs of identifiable people held under a
        // no-store contract. They leave with the screen, and they leave the
        // moment the session that was allowed to see them does.
        .onDisappear { forgetRecap() }
        .onChange(of: sessionStore.token) { _ in forgetRecap(); Task { await loadRecap() } }
        .sheet(isPresented: $pickingRecap) {
            NativePartyPhotoPicker(selectionLimit: recapFreeSlots) { images in
                pickingRecap = false
                Task { await addRecapPhotos(images) }
            }
        }
        .sheet(isPresented: $scanning) {
            NativePartyQRScanner(
                onCode: { value in passText = value; scanning = false },
                onUnavailable: { reason in message = reason; scanning = false },
                onCancel: { scanning = false }
            )
        }
    }

    private func overview(_ value: NativePartyControlSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(value.title).font(.system(size: 27, weight: .black, design: .rounded))
            HStack { metric("Going", "\(value.confirmed) / \(value.capacity)"); metric("Pending", "\(value.pending)"); metric("Checked in", "\(value.checkedIn)") }
            Text("\(value.spacesRemaining) spaces left").font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.cyan)
            roomShareCard(url: value.retrievedShareURL, passCode: value.retrievedPassCode, expired: value.shareLinkExpired == true)
            shareLinkStatus(value)
        }.padding(18).background(Color.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 22))
    }

    @ViewBuilder private func roomShareCard(url: URL?, passCode: String?, expired: Bool) -> some View {
        if let url {
            VStack(alignment: .leading, spacing: 12) {
                Text(expired ? "ROOM LINK · NEW ARRIVALS CLOSED" : "ROOM LINK · STILL LIVE").font(.system(size: 9, weight: .black)).tracking(1.2).foregroundColor(expired ? NativeTheme.orange : NativeTheme.cyan)
                HStack(alignment: .center, spacing: 12) {
                    Button(action: { shareRetrievedQR(url) }) {
                        NativePartyShareQR(value: url.absoluteString).frame(width: 72, height: 72)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share Party QR")
                    VStack(alignment: .leading, spacing: 4) {
                        Text(expired ? "New guests cannot join from this link. You can still retrieve it." : "Forgot to send it? Share the same Party Pass from this room.").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.62))
                        Text(url.absoluteString).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundColor(.white.opacity(0.42)).lineLimit(1)
                    }
                }
                if let passCode {
                    VStack(spacing: 4) {
                        Text("PARTY CODE").font(.system(size: 9, weight: .black)).tracking(1.6).foregroundColor(.white.opacity(0.45))
                        Text(passCode).font(.system(size: 22, weight: .black, design: .monospaced)).tracking(3)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(14)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundColor(.white.opacity(0.22)))
                    .accessibilityIdentifier("native-party-control-pass-code")
                }
                Button(action: { shareRetrievedLink(url) }) {
                    Label("Share Party Link", systemImage: "square.and.arrow.up.fill")
                        .font(.system(size: 14, weight: .black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .foregroundColor(.white)
                        .background(NativeTheme.purple)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-party-control-share")
            }
        }
    }

    @ViewBuilder private func shareLinkStatus(_ value: NativePartyControlSummary) -> some View {
        if let expiresAt = value.shareLinkExpiresAt {
            HStack(spacing: 8) {
                Image(systemName: value.shareLinkExpired == true ? "link.badge.plus" : "link").font(.system(size: 11, weight: .bold)).foregroundColor(value.shareLinkExpired == true ? NativeTheme.orange : .white.opacity(0.55))
                Text(shareLinkCaption(expiresAt: expiresAt, expired: value.shareLinkExpired == true, isDefault: value.shareLinkExpiryIsDefault ?? true)).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.55))
                Spacer()
                Menu {
                    Button("When the Party ends (default)") { Task { await setShareExpiry(nil) } }
                    Button("1 day after now") { Task { await setShareExpiry(Date().addingTimeInterval(86_400)) } }
                    Button("3 days after now") { Task { await setShareExpiry(Date().addingTimeInterval(3 * 86_400)) } }
                    Button("7 days after now") { Task { await setShareExpiry(Date().addingTimeInterval(7 * 86_400)) } }
                } label: { Text("LINK EXPIRY").font(.system(size: 9, weight: .black)).tracking(1.1).foregroundColor(NativeTheme.cyan) }
            }
        }
    }

    /// Closing is not deleting: the guest list and payment records stay, the
    /// room simply leaves the host console and stops taking new arrivals.
    @ViewBuilder private var closeRoomControl: some View {
        if let summary {
            if summary.closedAt == nil {
                Button("Close Room") { closeConfirmation = true }
                    .controlButton(color: NativeTheme.orange)
                    .accessibilityIdentifier("native-party-control-close-room")
                    .confirmationDialog("Close this room?", isPresented: $closeConfirmation, titleVisibility: .visible) {
                        Button("Close Room", role: .destructive) { Task { await setClosed(true) } }
                        Button("Keep it open", role: .cancel) {}
                    } message: {
                        Text("The room leaves YOUR ROOMS and the share link stops admitting new guests. Nothing is deleted — your guest list, passes, and payments stay, and you can reopen it.")
                    }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("ROOM CLOSED").font(.system(size: 9, weight: .black)).tracking(1.2).foregroundColor(NativeTheme.orange)
                    Button("Reopen Room") { Task { await setClosed(false) } }
                        .controlButton(color: NativeTheme.cyan)
                        .accessibilityIdentifier("native-party-control-reopen-room")
                    Text("Reopening puts the room back on your console. The share link returns to its default — extend it from LINK EXPIRY if you want new arrivals again.")
                        .font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.55))
                }
            }
        }
    }

    private func shareRetrievedLink(_ url: URL) {
        if NativePartyShareLink.share(url) { message = "" } else { message = "Party link is ready to share." }
    }

    private func shareRetrievedQR(_ url: URL) {
        if NativePartyShareLink.shareQR(for: url) { message = "" } else { message = "Party link is ready to share." }
    }

    private func shareLinkCaption(expiresAt: String, expired: Bool, isDefault: Bool) -> String {
        let when = ISO8601DateFormatter.partyControlDate(from: expiresAt).map { $0.formatted(date: .abbreviated, time: .shortened) } ?? expiresAt
        if expired { return "Share link expired \(when). New guests can no longer join from the link." }
        return isDefault ? "Share link dies when the Party ends (\(when))." : "Share link expires \(when)."
    }
    private func metric(_ label: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 3) { Text(value).font(.system(size: 20, weight: .black)); Text(label.uppercased()).font(.system(size: 8.5, weight: .black)).foregroundColor(.white.opacity(0.52)) }.frame(maxWidth: .infinity, alignment: .leading) }
    private var doorMode: some View { VStack(alignment: .leading, spacing: 10) { Text("DOOR MODE").partyControlLabel(); Text("Scan a personal attendee QR. A checked-in pass cannot be used again.").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.55)); HStack { TextField("Paste attendee QR pass", text: $passText).textInputAutocapitalization(.never).autocorrectionDisabled(); Button(action: { scanning = true }) { Image(systemName: "qrcode.viewfinder") }.accessibilityLabel("Scan attendee QR pass") }.padding(12).partyControlSurface(); Button(isCheckingIn ? "Checking in…" : "Check in attendee") { Task { await checkIn(passText) } }.disabled(isCheckingIn).controlButton(color: NativeTheme.emerald) }.padding(14).partyControlSurface() }
    private var pendingGuests: some View { let pending = guests.filter { $0.status == "pending" }; return Group { if !pending.isEmpty { VStack(alignment: .leading, spacing: 10) { Text("PENDING APPROVAL · \(pending.count)").partyControlLabel(); ForEach(pending) { guest in HStack { Text(guest.person.name).font(.system(size: 13, weight: .bold)); Spacer(); Button("Decline") { Task { await decide(guest, false) } }.foregroundColor(NativeTheme.orange); Button("Approve") { Task { await decide(guest, true) } }.foregroundColor(NativeTheme.emerald) } } }.padding(14).partyControlSurface() } } }
    /// Separated from the main list because it answers a different question:
    /// not who is coming, but who has paid. Silent when nobody has, so a free
    /// party never shows an empty money section.
    @ViewBuilder private var paidGuests: some View {
        let paid = guests.filter(\.isPaidAndAdmitted)
        if !paid.isEmpty {
            VStack(alignment: .leading, spacing: 9) {
                Text("PAID GUESTS · \(paid.count)").partyControlLabel()
                ForEach(paid) { guest in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(guest.person.name).font(.system(size: 13, weight: .bold))
                            Text(guest.ticketTierName ?? "Ticket").font(.system(size: 9, weight: .black)).foregroundColor(.white.opacity(0.48))
                        }
                        Spacer(minLength: 0)
                        if guest.status == "checked-in" {
                            Image(systemName: "checkmark.seal.fill").foregroundColor(NativeTheme.emerald)
                        }
                    }
                }
            }
            .padding(14).partyControlSurface()
            .accessibilityIdentifier("native-party-control-paid-guests")
        }
    }

    private var guestList: some View { VStack(alignment: .leading, spacing: 9) { Text("GUEST LIST · \(guests.count)").partyControlLabel(); ForEach(guests.filter { $0.status != "pending" }) { guest in HStack { VStack(alignment: .leading) { Text(guest.person.name).font(.system(size: 13, weight: .bold)); Text("\(guest.status.replacingOccurrences(of: "-", with: " ").uppercased()) · \(guest.source.uppercased())").font(.system(size: 9, weight: .black)).foregroundColor(.white.opacity(0.48)) }; Spacer(); if guest.status == "checked-in" { Image(systemName: "checkmark.seal.fill").foregroundColor(NativeTheme.emerald) } } } }.padding(14).partyControlSurface() }
    @MainActor private func reload() async { guard let token = sessionStore.token else { return }; do { let api = NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })); async let freshSummary = api.summary(partyID); async let freshGuests = api.guests(partyID); summary = try await freshSummary; guests = try await freshGuests; message = "" } catch { message = "Party Control could not refresh." }; await loadRecap() }

    /// Failure leaves the card hidden rather than showing an empty album: a
    /// server that predates the recap procedures answers the same way as a room
    /// that cannot have one yet, and neither is worth an error the host cannot act on.
    @MainActor private func loadRecap() async {
        guard let token = sessionStore.token else { forgetRecap(); return }
        // The token is read per request rather than captured, so a store built
        // in one session stops fetching the moment that session ends.
        if recapStore == nil { recapStore = NativeAuthenticatedImageStore(tokenProvider: { [weak sessionStore] in sessionStore?.token }) }
        let api = NativePartyRecapAPI(client: BytspotAPIClient(tokenProvider: { token }))
        guard let fresh = try? await api.get(partyID) else { forgetRecap(); return }
        // Bytes for photos that are no longer in the album must not survive in
        // memory under a URL the server now refuses.
        let live = Set(fresh.photoURLs)
        for url in (recap?.photoURLs ?? []) where !live.contains(url) { recapStore?.forget(url) }
        recap = fresh
    }

    /// Anything that makes the recap unknowable takes the card and its bytes
    /// away rather than leaving a host acting on a stale album.
    @MainActor private func forgetRecap() {
        recap = nil
        recapStore?.forgetAll()
    }

    private var recapFreeSlots: Int { max(0, NativePartyRecap.maxPhotos - (recap?.addressablePhotos.count ?? 0)) }

    private func recapHeadline(_ value: NativePartyRecap) -> String {
        let count = value.addressablePhotos.count
        guard count > 0 else { return "RECAP" }
        return value.isPublished ? "RECAP · \(count) PHOTOS · GUESTS CAN SEE THIS" : "RECAP · \(count) PHOTOS · STAGED"
    }

    @ViewBuilder private var recapCard: some View {
        if let recap {
            VStack(alignment: .leading, spacing: 10) {
                Text(recapHeadline(recap)).partyControlLabel()
                if recap.addressablePhotos.isEmpty {
                    Text("No recap yet. Once the room is over, add the photos of it. Guests the door admitted see them when you publish — nobody else, ever.")
                        .font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.55))
                } else if let recapStore {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ForEach(recap.addressablePhotos) { photo in
                            NativeAuthenticatedImage(url: photo.url, store: recapStore)
                                .frame(maxWidth: .infinity).frame(height: 104).clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(alignment: .topTrailing) {
                                    Button(action: { Task { await removeRecapPhoto(photo) } }) {
                                        Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(.white, .black.opacity(0.55))
                                    }.buttonStyle(.plain).padding(5).disabled(recapBusy)
                                }
                                .accessibilityIdentifier("native-party-recap-photo-\(photo.position)")
                        }
                    }
                }
                HStack(spacing: 10) {
                    Button(recap.addressablePhotos.isEmpty ? "Add Photos" : "Add More") { pickingRecap = true }
                        .controlButton(color: NativeTheme.purple)
                        .disabled(recapBusy || recap.isFull || !recap.isEditable)
                    if recap.isPublished {
                        Button("Unpublish") { Task { await setRecapPublished(false) } }.controlButton(color: NativeTheme.orange).disabled(recapBusy)
                    } else if !recap.addressablePhotos.isEmpty {
                        Button("Publish Recap") { Task { await setRecapPublished(true) } }.controlButton(color: NativeTheme.emerald).disabled(recapBusy)
                    }
                }
            }
            .padding(14).partyControlSurface()
            .accessibilityIdentifier("native-party-control-recap")
        }
    }

    /// Photos go into the lowest free slots, which is what keeps an edited album
    /// from overwriting a photo that is still there.
    /// The server allocates each slot. Two devices holding the same album both
    /// compute the same free slot, so a client that chose one would overwrite a
    /// photo that is already there.
    @MainActor private func addRecapPhotos(_ images: [UIImage]) async {
        guard let token = sessionStore.token else { return }
        recapBusy = true; defer { recapBusy = false }
        let api = NativePartyRecapAPI(client: BytspotAPIClient(tokenProvider: { token }))
        for image in images {
            guard let prepared = NativePartyPendingImage(image: image) else { message = "Some photos could not be prepared."; continue }
            do { try await api.upload(partyID, dataURI: prepared.dataURI) }
            catch { message = "A recap photo could not be added."; break }
        }
        // Always reload, including after a failure: some of the batch may have
        // landed, and the album on screen has to be the album on the server.
        await loadRecap()
    }

    @MainActor private func removeRecapPhoto(_ photo: NativePartyRecapPhoto) async {
        guard let token = sessionStore.token else { return }
        recapBusy = true; defer { recapBusy = false }
        do { try await NativePartyRecapAPI(client: BytspotAPIClient(tokenProvider: { token })).remove(partyID, mediaID: photo.id) }
        catch { message = "That photo could not be removed." }
        recapStore?.forget(photo.url)
        await loadRecap()
    }

    /// A lost response is not a known outcome, so the state on screen comes from
    /// a reload either way rather than from what was asked for.
    @MainActor private func setRecapPublished(_ published: Bool) async {
        guard let token = sessionStore.token else { return }
        recapBusy = true; defer { recapBusy = false }
        let api = NativePartyRecapAPI(client: BytspotAPIClient(tokenProvider: { token }))
        do {
            if published { try await api.publish(partyID) } else { try await api.unpublish(partyID) }
        } catch { message = published ? "The recap could not be published." : "The recap could not be unpublished." }
        await loadRecap()
    }
    @MainActor private func setPaused() async { guard let token = sessionStore.token else { return }; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).pause(partyID, paused: !(summary?.admissionPaused ?? false)); await reload() } catch { message = "Admission status could not change." } }
    @MainActor private func setClosed(_ closed: Bool) async {
        guard let token = sessionStore.token else { return }
        do {
            let api = NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token }))
            if closed { try await api.close(partyID) } else { try await api.reopen(partyID) }
            await reload()
            message = closed ? "Room closed. Nothing was deleted." : "Room reopened."
        } catch {
            message = closed ? "This room couldn't be closed." : "This room couldn't be reopened."
        }
    }

    @MainActor private func setShareExpiry(_ date: Date?) async { guard let token = sessionStore.token else { return }; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).setShareLinkExpiry(partyID, expiresAt: date.map { ISO8601DateFormatter.partyControlInstant.string(from: $0) }); await reload() } catch { message = "Share link expiry could not change." } }
    @MainActor private func decide(_ guest: NativePartyControlGuest, _ approved: Bool) async { guard let token = sessionStore.token else { return }; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).decide(partyID, guestID: guest.id, approved: approved); await reload() } catch { message = "Guest status could not change." } }
    @MainActor private func checkIn(_ value: String) async {
        guard !isCheckingIn, let token = sessionStore.token else { return }
        guard let attendeeCredential = NativePartyDoorPassInput.normalized(value) else {
            message = "Scan or paste a valid attendee QR pass."
            return
        }
        isCheckingIn = true
        defer { isCheckingIn = false }
        do {
            let result = try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).checkIn(partyID, attendeeCredential: attendeeCredential)
            passText = ""
            message = "Checked in \(result.guestName)."
            await reload()
        } catch BytspotAPIClient.APIError.server(let status, _) where status == 409 {
            message = "This attendee has already been checked in."
        } catch {
            message = "That door pass is not recognized. Ask the guest to refresh their pass."
        }
    }
}

private struct NativePartyQRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onUnavailable: (String) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        controller.view.backgroundColor = .black
        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancel", for: .normal)
        cancel.tintColor = .white
        cancel.addAction(UIAction { _ in onCancel() }, for: .touchUpInside)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(cancel)
        NSLayoutConstraint.activate([cancel.topAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.topAnchor, constant: 14), cancel.trailingAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.trailingAnchor, constant: -18)])

        guard AVCaptureDevice.authorizationStatus(for: .video) != .denied,
              let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            DispatchQueue.main.async { onUnavailable("Camera scanning is unavailable. Paste the attendee QR pass instead.") }
            return controller
        }
        let session = AVCaptureSession()
        guard session.canAddInput(input) else {
            DispatchQueue.main.async { onUnavailable("Camera scanning is unavailable. Paste the attendee QR pass instead.") }
            return controller
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            DispatchQueue.main.async { onUnavailable("Camera scanning is unavailable. Paste the attendee QR pass instead.") }
            return controller
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
        output.metadataObjectTypes = [.qr]
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = UIScreen.main.bounds
        controller.view.layer.insertSublayer(preview, at: 0)
        context.coordinator.session = session
        context.coordinator.captureQueue.async { session.startRunning() }
        return controller
    }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
    static func dismantleUIViewController(_ uiViewController: UIViewController, coordinator: Coordinator) {
        let session = coordinator.session
        coordinator.session = nil
        coordinator.captureQueue.async { session?.stopRunning() }
    }
    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var session: AVCaptureSession?
        let captureQueue = DispatchQueue(label: "com.bytspot.party-door-scanner")
        let onCode: (String) -> Void
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }
        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard let code = metadataObjects.first as? AVMetadataMachineReadableCodeObject, let value = code.stringValue else { return }
            let session = self.session
            captureQueue.async { session?.stopRunning() }
            onCode(value)
        }
    }
}

private extension View { func controlButton(color: Color) -> some View { font(.system(size: 12, weight: .black)).frame(maxWidth: .infinity).frame(height: 46).foregroundColor(.white).background(color).clipShape(RoundedRectangle(cornerRadius: 15)) }; func partyControlSurface() -> some View { background(Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 17)) }; func partyControlLabel() -> some View { font(.system(size: 9.5, weight: .black)).foregroundColor(.white.opacity(0.45)) } }