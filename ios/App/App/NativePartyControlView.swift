import AVFoundation
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct NativePartyControlSummary: Codable {
    let partyId: String; let title: String; let admissionPaused: Bool
    let capacity: Int; let confirmed: Int; let spacesRemaining: Int; let pending: Int; let checkedIn: Int
}

struct NativePartyControlGuest: Codable, Identifiable {
    struct Person: Codable { let userId: String; let name: String; let profileImage: String? }
    let id: String; let status: String; let source: String; let ticketTierName: String?; let checkedInAt: String?; let person: Person
}

struct NativePartyControlGuestList: Codable { let guests: [NativePartyControlGuest] }

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

struct NativePartyControlAPI {
    let client: BytspotAPIClient
    private func query<T: Decodable>(_ type: T.Type, path: String, input: [String: Any]) async throws -> T { let payload = try await client.trpcQueryPayload(path: path, input: input); return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: payload)) }
    func summary(_ partyID: String) async throws -> NativePartyControlSummary { try await query(NativePartyControlSummary.self, path: "/trpc/events.control.summary", input: ["partyId": partyID]) }
    func guests(_ partyID: String) async throws -> [NativePartyControlGuest] { try await query(NativePartyControlGuestList.self, path: "/trpc/events.control.guests", input: ["partyId": partyID, "status": "all"]).guests }
    func pause(_ partyID: String, paused: Bool) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.setAdmissionPaused", method: "POST", input: ["partyId": partyID, "paused": paused]) }
    func decide(_ partyID: String, guestID: String, approved: Bool) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.decide", method: "POST", input: ["partyId": partyID, "guestId": guestID, "decision": approved ? "approved" : "declined"]) }
    func checkIn(_ partyID: String, secret: String) async throws { _ = try await client.trpcPayload(path: "/trpc/events.control.checkIn", method: "POST", input: ["partyId": partyID, "attendeePassSecret": secret]) }
}

struct NativePartyControlView: View {
    let partyID: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @State private var summary: NativePartyControlSummary?
    @State private var guests: [NativePartyControlGuest] = []
    @State private var message = ""; @State private var showingDoor = false; @State private var scanning = false; @State private var passText = ""

    var body: some View {
        ZStack { BytspotNativeBackground(tier: .green).ignoresSafeArea(); ScrollView { VStack(alignment: .leading, spacing: 15) {
            HStack { Button(action: { dismiss() }) { Image(systemName: "chevron.left") }; Spacer(); Text("PARTY CONTROL").font(.system(size: 11, weight: .black)).tracking(1.5); Spacer(); Button(action: { Task { await reload() } }) { Image(systemName: "arrow.clockwise") } }.foregroundColor(.white)
            if let summary { overview(summary) } else { ProgressView().tint(.white).frame(maxWidth: .infinity, minHeight: 140) }
            HStack(spacing: 10) { Button(showingDoor ? "Close Door Mode" : "Door Mode") { showingDoor.toggle() }.controlButton(color: NativeTheme.purple); Button((summary?.admissionPaused ?? false) ? "Resume RSVPs" : "Pause RSVPs") { Task { await setPaused() } }.controlButton(color: NativeTheme.orange) }
            if showingDoor { doorMode }
            if !message.isEmpty { Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.emerald) }
            pendingGuests
            guestList
        }.padding(18) } }
        .preferredColorScheme(.dark).task { await reload() }.sheet(isPresented: $scanning) { NativePartyQRScanner { value in passText = value; scanning = false } }
    }

    private func overview(_ value: NativePartyControlSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) { Text(value.title).font(.system(size: 27, weight: .black, design: .rounded)); HStack { metric("Going", "\(value.confirmed) / \(value.capacity)"); metric("Pending", "\(value.pending)"); metric("Checked in", "\(value.checkedIn)") }; Text("\(value.spacesRemaining) spaces left").font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.cyan) }.padding(18).background(Color.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 22))
    }
    private func metric(_ label: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 3) { Text(value).font(.system(size: 20, weight: .black)); Text(label.uppercased()).font(.system(size: 8.5, weight: .black)).foregroundColor(.white.opacity(0.52)) }.frame(maxWidth: .infinity, alignment: .leading) }
    private var doorMode: some View { VStack(alignment: .leading, spacing: 10) { Text("DOOR MODE").partyControlLabel(); Text("Scan a personal attendee QR. A checked-in pass cannot be used again.").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.55)); HStack { TextField("Paste attendee QR pass", text: $passText).textInputAutocapitalization(.never).autocorrectionDisabled(); Button(action: { scanning = true }) { Image(systemName: "qrcode.viewfinder") } }.padding(12).partyControlSurface(); Button("Check in attendee") { Task { await checkIn(passText) } }.controlButton(color: NativeTheme.emerald) }.padding(14).partyControlSurface() }
    private var pendingGuests: some View { let pending = guests.filter { $0.status == "pending" }; return Group { if !pending.isEmpty { VStack(alignment: .leading, spacing: 10) { Text("PENDING APPROVAL · \(pending.count)").partyControlLabel(); ForEach(pending) { guest in HStack { Text(guest.person.name).font(.system(size: 13, weight: .bold)); Spacer(); Button("Decline") { Task { await decide(guest, false) } }.foregroundColor(NativeTheme.orange); Button("Approve") { Task { await decide(guest, true) } }.foregroundColor(NativeTheme.emerald) } } }.padding(14).partyControlSurface() } } }
    private var guestList: some View { VStack(alignment: .leading, spacing: 9) { Text("GUEST LIST · \(guests.count)").partyControlLabel(); ForEach(guests.filter { $0.status != "pending" }) { guest in HStack { VStack(alignment: .leading) { Text(guest.person.name).font(.system(size: 13, weight: .bold)); Text("\(guest.status.replacingOccurrences(of: "-", with: " ").uppercased()) · \(guest.source.uppercased())").font(.system(size: 9, weight: .black)).foregroundColor(.white.opacity(0.48)) }; Spacer(); if guest.status == "checked-in" { Image(systemName: "checkmark.seal.fill").foregroundColor(NativeTheme.emerald) } } } }.padding(14).partyControlSurface() }
    @MainActor private func reload() async { guard let token = sessionStore.token else { return }; do { let api = NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })); async let freshSummary = api.summary(partyID); async let freshGuests = api.guests(partyID); summary = try await freshSummary; guests = try await freshGuests; message = "" } catch { message = "Party Control could not refresh." } }
    @MainActor private func setPaused() async { guard let token = sessionStore.token else { return }; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).pause(partyID, paused: !(summary?.admissionPaused ?? false)); await reload() } catch { message = "Admission status could not change." } }
    @MainActor private func decide(_ guest: NativePartyControlGuest, _ approved: Bool) async { guard let token = sessionStore.token else { return }; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).decide(partyID, guestID: guest.id, approved: approved); await reload() } catch { message = "Guest status could not change." } }
    @MainActor private func checkIn(_ value: String) async { guard let token = sessionStore.token else { return }; let secret = value.split(separator: "/").last.map(String.init) ?? value; do { try await NativePartyControlAPI(client: BytspotAPIClient(tokenProvider: { token })).checkIn(partyID, secret: secret); passText = ""; message = "Checked in."; await reload() } catch { message = "That pass is invalid or was already used." } }
}

private struct NativePartyQRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeUIViewController(context: Context) -> UIViewController { let controller = UIViewController(); let session = AVCaptureSession(); guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return controller }; session.addInput(input); let output = AVCaptureMetadataOutput(); guard session.canAddOutput(output) else { return controller }; session.addOutput(output); output.setMetadataObjectsDelegate(context.coordinator, queue: .main); output.metadataObjectTypes = [.qr]; let preview = AVCaptureVideoPreviewLayer(session: session); preview.videoGravity = .resizeAspectFill; preview.frame = UIScreen.main.bounds; controller.view.layer.addSublayer(preview); context.coordinator.session = session; session.startRunning(); return controller }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate { var session: AVCaptureSession?; let onCode: (String) -> Void; init(onCode: @escaping (String) -> Void) { self.onCode = onCode }; func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) { guard let code = metadataObjects.first as? AVMetadataMachineReadableCodeObject, let value = code.stringValue else { return }; session?.stopRunning(); onCode(value) } }
}

private extension View { func controlButton(color: Color) -> some View { font(.system(size: 12, weight: .black)).frame(maxWidth: .infinity).frame(height: 46).foregroundColor(.white).background(color).clipShape(RoundedRectangle(cornerRadius: 15)) }; func partyControlSurface() -> some View { background(Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 17)) }; func partyControlLabel() -> some View { font(.system(size: 9.5, weight: .black)).foregroundColor(.white.opacity(0.45)) } }