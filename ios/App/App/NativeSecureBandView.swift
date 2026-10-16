import CoreNFC
import SwiftUI

/// Business sign-in for Secure bands. The vendor token lives in memory only,
/// so it is gone when the app quits.
@MainActor
final class NativeVendorSignInStore: ObservableObject {
    static let shared = NativeVendorSignInStore()

    enum Phase: Equatable {
        case email
        case code(challengeID: String)
        case pick(VendorSession)
        case signedIn(VendorBusiness)
    }

    @Published var phase: Phase = .email
    @Published var email = ""
    @Published var code = ""
    @Published var busy = false
    @Published var message = ""
    @Published var secured: [SecuredBand] = []

    var api = NativeVendorAPI()

    var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    var canSendCode: Bool { !busy && trimmedEmail.contains("@") }
    var canVerify: Bool { !busy && code.count == 6 }
    var isSignedIn: Bool {
        if case .signedIn = phase { return true }
        return false
    }

    func sendCode() async {
        guard canSendCode else { return }
        busy = true; message = ""
        defer { busy = false }
        do {
            let id = try await api.requestCode(email: trimmedEmail)
            code = ""
            phase = .code(challengeID: id)
        } catch {
            message = (error as? VendorSignInError ?? .unreachable).message
        }
    }

    func verify() async {
        guard canVerify, case .code(let challengeID) = phase else { return }
        busy = true; message = ""
        defer { busy = false }
        do {
            let session = try await api.startSession(challengeID: challengeID, code: code)
            let open = session.openSellers
            phase = open.count == 1 ? .signedIn(session.business(open[0])) : .pick(session)
        } catch {
            message = (error as? VendorSignInError ?? .unreachable).message
        }
    }

    func choose(_ seller: VendorSeller) {
        guard case .pick(let session) = phase else { return }
        message = ""
        phase = .signedIn(session.business(seller))
    }

    func startOver() {
        phase = .email; code = ""; message = ""
    }

    func signOut() {
        phase = .email; code = ""; message = ""; secured = []
    }

    func record(_ band: SecuredBand) {
        secured.removeAll { $0.serial == band.serial }
        secured.insert(band, at: 0)
    }
}

/// Core NFC adapter: reads the item's link and UID, then relays APDUs for the
/// server. One item per reader session.
final class NativeSecureBandReader: NSObject, NFCTagReaderSessionDelegate {
    static var isAvailable: Bool { NFCTagReaderSession.readingAvailable }

    static let noLink = "This item has no Bytspot link on it, so it can't be secured here."
    static let notBytspot = "This isn't a Bytspot band, card or tag."

    private let api: NativeVendorAPI
    private let onSecured: @MainActor (SecuredBand) -> Void
    private let onFailed: @MainActor (String) -> Void
    private var session: NFCTagReaderSession?

    init(api: NativeVendorAPI, onSecured: @escaping @MainActor (SecuredBand) -> Void, onFailed: @escaping @MainActor (String) -> Void) {
        self.api = api
        self.onSecured = onSecured
        self.onFailed = onFailed
    }

    func begin() {
        guard Self.isAvailable, let session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: nil) else { return }
        session.alertMessage = "Hold the band, card or tag against the top of your iPhone."
        self.session = session
        session.begin()
    }

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        self.session = nil
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard tags.count == 1, let tag = tags.first else {
            session.alertMessage = "Hold only one item near the phone."
            session.restartPolling()
            return
        }
        Task { await secure(tag, in: session) }
    }

    private func secure(_ tag: NFCTag, in session: NFCTagReaderSession) async {
        do {
            try await session.connect(to: tag)
        } catch {
            return fail(SecureBandError.holdStill, in: session)
        }
        let uid: Data
        let ndef: NFCNDEFTag
        let send: (Data) async throws -> Data
        switch tag {
        case .iso7816(let chip):
            uid = chip.identifier
            ndef = chip
            send = { data in
                guard let apdu = NFCISO7816APDU(data: data) else { throw SecureBandError.network }
                let (body, sw1, sw2) = try await chip.sendCommand(apdu: apdu)
                return body + Data([sw1, sw2])
            }
        case .miFare(let chip):
            uid = chip.identifier
            ndef = chip
            send = { data in
                guard let apdu = NFCISO7816APDU(data: data) else { throw SecureBandError.network }
                let (body, sw1, sw2) = try await chip.sendMiFareISO7816Command(apdu)
                return body + Data([sw1, sw2])
            }
        default:
            return fail(Self.notBytspot, in: session)
        }
        session.alertMessage = "Hold the band still…"
        guard let link = await Self.link(on: ndef) else { return fail(Self.noLink, in: session) }
        let relay = SecureBandRelay(send: send, post: api.secure, progress: { round in
            session.alertMessage = round == 1 ? "Hold the band still…" : "Securing… keep holding it still."
        })
        do {
            let band = try await relay.run(band: link, uid: uid.secureBandHex)
            session.alertMessage = "Secured \(band.serial)"
            session.invalidate()
            await onSecured(band)
        } catch {
            fail((error as? SecureBandError ?? .network).staffMessage, in: session)
        }
    }

    private func fail(_ message: String, in session: NFCTagReaderSession) {
        session.invalidate(errorMessage: message)
        Task { await onFailed(message) }
    }

    /// The first URI record's URL, if the item has one.
    static func link(on tag: NFCNDEFTag) async -> String? {
        guard let message = try? await tag.readNDEF() else { return nil }
        return message.records.lazy.compactMap { $0.wellKnownTypeURIPayload()?.absoluteString }.first
    }
}

/// Profile → Bytspot for business: sign in, then secure items one tap at a time.
struct NativeSecureBandsPanel: View {
    @ObservedObject private var store = NativeVendorSignInStore.shared
    @State private var reader: NativeSecureBandReader?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch store.phase {
            case .email: emailStep
            case .code: codeStep
            case .pick(let session): pickStep(session)
            case .signedIn(let business): secureStep(business)
            }
            if !store.message.isEmpty {
                Text(store.message).font(.system(size: 12.5, weight: .bold)).foregroundColor(NativeTheme.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("native-business-message")
            }
        }
        .accessibilityIdentifier("native-business")
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            note("Use the email your business added to Bytspot. We'll send a 6-digit code.")
            field {
                TextField("Business email", text: $store.email)
                    .keyboardType(.emailAddress).textContentType(.emailAddress)
                    .textInputAutocapitalization(.never).disableAutocorrection(true)
                    .submitLabel(.send).onSubmit { Task { await store.sendCode() } }
            }
            .accessibilityIdentifier("native-business-email")
            action("Send code", enabled: store.canSendCode, id: "native-business-send-code") { await store.sendCode() }
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            note("Enter the 6-digit code sent to \(store.trimmedEmail).")
            field {
                TextField("Code", text: Binding(get: { store.code }, set: { store.code = String($0.filter(\.isNumber).prefix(6)) }))
                    .keyboardType(.numberPad).textContentType(.oneTimeCode)
            }
            .accessibilityIdentifier("native-business-code")
            action("Sign in", enabled: store.canVerify, id: "native-business-verify") { await store.verify() }
            Button("Use a different email") { store.startOver() }
                .font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan).frame(minHeight: 44)
        }
    }

    private func pickStep(_ session: VendorSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            note("Choose the business you're securing items for.")
            ForEach(session.openSellers) { seller in
                Button { store.choose(seller) } label: {
                    HStack {
                        Text(seller.legalName).font(.system(size: 15, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                        Spacer()
                        Image(systemName: "chevron.right").foregroundColor(NativeTheme.textSecondary)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 48)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-business-seller-\(seller.id)")
            }
        }
    }

    private func secureStep(_ business: VendorBusiness) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(business.seller.legalName).font(.system(size: 16, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                    Text(store.trimmedEmail).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                }
                Spacer()
                Button("Sign out") { store.signOut() }
                    .font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan).frame(minHeight: 44)
                    .accessibilityIdentifier("native-business-sign-out")
            }
            if NativeSecureBandReader.isAvailable {
                note("Tap Secure an item, then hold one band, card or tag against the top of your iPhone until it says Secured.")
                action("Secure an item", enabled: true, id: "native-business-secure") { startReader(business) }
            } else {
                note("This iPhone can't read NFC, so it can't secure items.")
                    .accessibilityIdentifier("native-business-nfc-unavailable")
            }
            if !store.secured.isEmpty {
                Text("SECURED THIS SESSION").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textSecondary).padding(.top, 4)
                ForEach(store.secured) { band in
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.seal.fill").foregroundColor(NativeTheme.emerald)
                        Text(band.serial).font(.system(size: 15, weight: .bold).monospacedDigit()).foregroundColor(NativeTheme.textPrimary)
                        Spacer()
                        Text(band.formLabel).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityIdentifier("native-business-secured-\(band.serial)")
                }
            }
        }
    }

    private func startReader(_ business: VendorBusiness) {
        store.message = ""
        let reader = NativeSecureBandReader(api: business.api, onSecured: { band in
            store.record(band)
        }, onFailed: { message in
            if message == SecureBandError.signedOut.staffMessage { store.signOut() }
            store.message = message
        })
        self.reader = reader
        reader.begin()
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(.system(size: 16, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
            .padding(.horizontal, 14).frame(minHeight: 48)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func action(_ title: String, enabled: Bool, id: String, perform: @escaping () async -> Void) -> some View {
        Button { Task { await perform() } } label: {
            ZStack {
                Text(title).opacity(store.busy ? 0 : 1)
                if store.busy { ProgressView().tint(.black) }
            }
            .font(.system(size: 15, weight: .black)).foregroundColor(.black)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(NativeTheme.cyan.opacity(enabled ? 1 : 0.45))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(id)
    }
}

