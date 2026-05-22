import SwiftUI
import AppClip
import StoreKit
import UIKit
import PassKit
import Contacts
import StripeApplePay
@_spi(STP) import StripeCore

enum ClipVerifyState: Equatable {
    case idle
    case verifying
    case verified(label: String, bindingType: String?)
    case failed(message: String)
}

struct ClipContentView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    @State private var showOverlay = false
    @State private var selectedService: ClipLocalService?
    @StateObject private var paymentHold = ClipPaymentHoldController()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RadialGradient(colors: [Color.cyan.opacity(0.18), .clear], center: .topLeading, startRadius: 20, endRadius: 420)
                .ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard
                    servicesSection
                    verificationCard
                    secureHoldCard
                    fullAppSecondaryButton
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 30)
            }
        }
        .appStoreOverlay(isPresented: $showOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
        }
        .onChange(of: invocation.invocationURL) { _ in selectedService = nil }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: statusSymbol)
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.black)
                    .frame(width: 30, height: 30)
                    .background(statusTint)
                    .clipShape(Circle())
                Text(heroEyebrow)
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.cyan)
                    .tracking(1.3)
                Spacer()
                if invocation.isLoadingContext { ProgressView().tint(.cyan) }
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(venueDisplayName)
                    .font(.system(size: 31, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Text(heroSubtitle)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(Color.white.opacity(0.84))
                    .lineSpacing(3)
            }

            Button(action: browseAsGuest) {
                HStack {
                    Text(selectedService == nil ? "Browse Luxury Services" : "Continue as Guest")
                    Spacer()
                    Image(systemName: "arrow.down.circle.fill")
                }
                .font(.system(size: 16, weight: .black))
                .foregroundColor(.black)
                .padding(.vertical, 15)
                .padding(.horizontal, 16)
                .background(LinearGradient(colors: [.white, Color.cyan.opacity(0.95)], startPoint: .leading, endPoint: .trailing))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)

            if let patchId = invocation.patchId ?? invocation.patchContext?.patchId {
                Text("Patch \(patchId)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.56))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(21)
        .background(LinearGradient(colors: [Color(red: 0.02, green: 0.06, blue: 0.10), Color(red: 0.02, green: 0.03, blue: 0.07), Color.purple.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Color.cyan.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: Color.cyan.opacity(0.14), radius: 24, x: 0, y: 14)
    }

    private var servicesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(invocation.services.first?.source == "live" ? "LIVE LOCAL SERVICES" : "CURATED LOCAL SERVICES")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.cyan)
                        .tracking(1.15)
                    Text(invocation.isLoadingServices ? "Finding services near this patch…" : "Tap any service to request instantly")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.76))
                }
                Spacer()
            }

            if invocation.isLoadingServices {
                ForEach(0..<4, id: \.self) { _ in skeletonCard }
            } else {
                ForEach(invocation.services) { service in
                    Button(action: { select(service) }) { serviceCard(service) }
                        .buttonStyle(.plain)
                }
            }

            if let message = invocation.contextError {
                Text(message)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.yellow.opacity(0.82))
            }

            if let selectedService { selectedServiceCard(selectedService) }
        }
    }

    private var skeletonCard: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 15).fill(Color.white.opacity(0.12)).frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.14)).frame(width: 150, height: 14)
                RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.09)).frame(height: 12)
            }
        }
        .padding(15)
        .background(panelColor)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func serviceCard(_ service: ClipLocalService) -> some View {
        let color = tint(service.tintName)
        return HStack(spacing: 14) {
            Image(systemName: service.iconName)
                .font(.system(size: 18, weight: .black))
                .foregroundColor(.black)
                .frame(width: 44, height: 44)
                .background(color)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(service.title).font(.system(size: 16, weight: .black)).foregroundColor(.white)
                    if service.source == "live" { Text("LIVE").font(.system(size: 9, weight: .black)).foregroundColor(.black).padding(.horizontal, 6).padding(.vertical, 2).background(Color.emerald).clipShape(Capsule()) }
                }
                Text(service.subtitle).font(.system(size: 12.5, weight: .bold)).foregroundColor(.white.opacity(0.78)).lineLimit(2)
                if let price = service.priceLabel { Text(price).font(.system(size: 11, weight: .black)).foregroundColor(color) }
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .black)).foregroundColor(.white.opacity(0.7))
        }
        .padding(15)
        .background(panelColor)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(selectedService?.id == service.id ? color : Color.white.opacity(0.12), lineWidth: 1.25))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func selectedServiceCard(_ service: ClipLocalService) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("GUEST REQUEST READY").font(.system(size: 12, weight: .black)).foregroundColor(tint(service.tintName)).tracking(1.0)
            Text(service.action).font(.system(size: 18, weight: .heavy)).foregroundColor(.white)
            Text("Use Apple Pay for the fastest secure hold, or continue to the full app for card checkout and sign-in.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(.white.opacity(0.76)).lineSpacing(3)

            VStack(spacing: 10) {
                Button(action: { paymentHold.startApplePay(service: service, patchId: invocation.patchId ?? invocation.patchContext?.patchId) }) {
                    paymentButtonLabel(
                        title: paymentHold.canUseApplePay ? "Book with Apple Pay" : "Apple Pay Setup Needed",
                        icon: "apple.logo",
                        foreground: .black,
                        background: paymentHold.canUseApplePay ? .white : Color.white.opacity(0.55)
                    )
                }
                .buttonStyle(.plain)
                .disabled(paymentHold.isAuthorizing)

                Button(action: { impactLight(); showOverlay = true }) {
                    paymentButtonLabel(title: "Pay with Card in Full App", icon: "creditcard.and.123", foreground: .white, background: Color.white.opacity(0.10))
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 6)

            if paymentHold.isAuthorizing {
                ProgressView("Authorizing secure hold…")
                    .font(.system(size: 12.5, weight: .bold))
                    .tint(.cyan)
                    .foregroundColor(.white.opacity(0.78))
            }
            if let message = paymentHold.statusMessage {
                Text(message)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(paymentHold.statusTone == .success ? .emerald : paymentHold.statusTone == .warning ? .yellow : .white.opacity(0.72))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(red: 0.01, green: 0.13, blue: 0.14))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.cyan.opacity(0.45), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var verificationCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                statusIcon
                VStack(alignment: .leading, spacing: 3) {
                    Text(verificationTitle).font(.system(size: 15, weight: .black)).foregroundColor(.white)
                    statusBody
                }
                Spacer()
            }
            if hasVerificationToken {
                Button(action: invocation.verifyCurrentToken) { verifyButtonLabel("Verify Again", icon: "checkmark.seal.fill") }.buttonStyle(.plain)
            } else {
                verifyButtonLabel("Tap Patch to Verify", icon: "wave.3.right.circle.fill")
                Text("Guest browsing stays available. A signed NFC/QR tap unlocks instant verification.")
                    .font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.66)).lineSpacing(3)
            }
        }
        .padding(16)
        .background(panelColor)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var secureHoldCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 18, weight: .black)).foregroundColor(.black)
                .frame(width: 42, height: 42).background(Color.emerald).clipShape(RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                Text("Apple Pay + Card Hold").font(.system(size: 15, weight: .black)).foregroundColor(.white)
                Text("Apple Pay is the fast path. Card checkout remains available in the full app. Funds are authorized first and captured after completion.")
                    .font(.system(size: 12.5, weight: .bold)).foregroundColor(.white.opacity(0.72)).lineLimit(3)
            }
        }
        .padding(15)
        .background(Color(red: 0.01, green: 0.11, blue: 0.09))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.emerald.opacity(0.36), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func verifyButtonLabel(_ title: String, icon: String) -> some View {
        HStack { Text(title); Spacer(); Image(systemName: icon) }
            .font(.system(size: 14, weight: .black)).foregroundColor(.white)
            .padding(.vertical, 13).padding(.horizontal, 15)
            .background(Color.white.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func paymentButtonLabel(title: String, icon: String, foreground: Color, background: Color) -> some View {
        HStack {
            Image(systemName: icon)
            Text(title)
            Spacer()
            Image(systemName: "lock.shield.fill")
        }
        .font(.system(size: 14, weight: .black))
        .foregroundColor(foreground)
        .padding(.vertical, 13)
        .padding(.horizontal, 15)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var fullAppSecondaryButton: some View {
        Button(action: { impactLight(); showOverlay = true }) {
            HStack { Image(systemName: "square.and.arrow.down"); Text(upsellLabel); Spacer(); Image(systemName: "chevron.up") }
                .font(.system(size: 13, weight: .black)).foregroundColor(.white.opacity(0.9))
                .padding(.vertical, 13).padding(.horizontal, 15)
                .background(Color.white.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }.buttonStyle(.plain)
    }

    @ViewBuilder private var statusIcon: some View {
        switch invocation.verificationState {
        case .verifying: ProgressView().progressViewStyle(.circular).tint(.cyan).scaleEffect(1.2).frame(width: 34, height: 34)
        case .verified: Image(systemName: "checkmark.seal.fill").resizable().scaledToFit().frame(width: 34, height: 34).foregroundStyle(Color.emerald)
        case .failed: Image(systemName: "xmark.octagon.fill").resizable().scaledToFit().frame(width: 34, height: 34).foregroundStyle(.red)
        case .idle: Image(systemName: "shield.checkered").resizable().scaledToFit().frame(width: 34, height: 34).foregroundStyle(.cyan)
        }
    }

    @ViewBuilder private var statusBody: some View {
        switch invocation.verificationState {
        case .idle: Text(hasVerificationToken ? "Ready to verify secure tap." : "Guest mode until a signed tap arrives.").font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.7))
        case .verifying: Text("Verifying secure patch…").font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.75))
        case .verified(let label, let bindingType):
            Text("Verified: \(label)").font(.system(size: 12.5, weight: .bold)).foregroundColor(.white)
            if let bindingType { Text(bindingType.capitalized).font(.system(size: 12, weight: .medium)).foregroundColor(.white.opacity(0.55)) }
        case .failed(let message): Text(message).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.72))
        }
    }

    private var venueDisplayName: String { invocation.patchContext?.title ?? formatted(invocation.venueSlug) ?? "Bytspot Patch" }
    private var heroSubtitle: String { invocation.patchContext?.subtitle ?? (hasVerificationToken ? "Secure tap detected. Verifying your access now." : "Live local services are ready. Verification starts from a signed NFC or QR tap.") }
    private var hasVerificationToken: Bool { !(invocation.token ?? "").isEmpty }
    private var panelColor: Color { Color(red: 0.02, green: 0.03, blue: 0.07) }
    private var heroEyebrow: String { if case .verified = invocation.verificationState { return "VERIFIED ACCESS" }; return "INSTANT ACCESS" }
    private var statusSymbol: String { if case .verified = invocation.verificationState { return "checkmark.seal.fill" }; return hasVerificationToken ? "bolt.fill" : "wave.3.right.circle.fill" }
    private var statusTint: Color { if case .verified = invocation.verificationState { return .emerald }; return .cyan }
    private var verificationTitle: String { if case .verified = invocation.verificationState { return "Verified access" }; return hasVerificationToken ? "Checking secure patch" : "Patch reader" }
    private var upsellLabel: String { if case .verified = invocation.verificationState { return "Open in the Bytspot app" }; return "Open full Bytspot app" }

    private func browseAsGuest() { impactLight(); if selectedService == nil { selectedService = invocation.services.first } }
    private func select(_ service: ClipLocalService) { impactLight(); selectedService = service }
    private func impactLight() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    private func formatted(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return value.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ").split(separator: " ").map { $0.capitalized }.joined(separator: " ")
    }
    private func tint(_ name: String) -> Color {
        switch name { case "gold": return .yellow; case "violet": return .purple; case "cyan": return .cyan; default: return .emerald }
    }
}

private extension Color {
    static let emerald = Color(red: 0.29, green: 0.90, blue: 0.55)
}

private enum ClipPaymentStatusTone {
    case neutral
    case success
    case warning
}

@MainActor
private final class ClipPaymentHoldController: NSObject, ObservableObject, PKPaymentAuthorizationControllerDelegate {
    @Published var isAuthorizing = false
    @Published var statusMessage: String?
    @Published var statusTone: ClipPaymentStatusTone = .neutral

    private let api = ClipPatchVerifier()
    private var pendingService: ClipLocalService?
    private var pendingPatchId: String?
    private var pendingAmountCents: Int = 0

    var canUseApplePay: Bool {
        PKPaymentAuthorizationController.canMakePayments(usingNetworks: supportedNetworks)
    }

    func startApplePay(service: ClipLocalService, patchId: String?) {
        guard service.source == "live" else {
            statusTone = .warning
            statusMessage = "Live service pricing is required for Apple Pay. Use card checkout in the full app."
            return
        }
        guard configureStripeApplePay() else { return }
        guard let merchantIdentifier else {
            statusTone = .warning
            statusMessage = "Apple Pay merchant setup is not enabled for this build yet. Use card checkout in the full app."
            return
        }
        guard canUseApplePay else {
            statusTone = .warning
            statusMessage = "Apple Pay is not available on this device. Use card checkout in the full app."
            return
        }

        let amountCents = max(service.amountCents ?? 2500, 50)
        pendingService = service
        pendingPatchId = patchId
        pendingAmountCents = amountCents
        statusMessage = nil
        statusTone = .neutral

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantIdentifier
        request.countryCode = "US"
        request.currencyCode = service.currency.uppercased()
        request.supportedNetworks = supportedNetworks
        request.merchantCapabilities = [.capability3DS]
        request.requiredBillingContactFields = [.name, .emailAddress, .phoneNumber, .postalAddress]
        let amount = NSDecimalNumber(value: Double(amountCents) / 100.0)
        request.paymentSummaryItems = [
            PKPaymentSummaryItem(label: service.title, amount: amount),
            PKPaymentSummaryItem(label: "Bytspot Secure Hold", amount: amount)
        ]

        isAuthorizing = true
        let controller = PKPaymentAuthorizationController(paymentRequest: request)
        controller.delegate = self
        controller.present { [weak self] presented in
            Task { @MainActor in
                if !presented {
                    self?.isAuthorizing = false
                    self?.statusTone = .warning
                    self?.statusMessage = "Apple Pay could not open. Use card checkout in the full app."
                }
            }
        }
    }

    nonisolated func paymentAuthorizationController(_ controller: PKPaymentAuthorizationController, didAuthorizePayment payment: PKPayment, handler completion: @escaping (PKPaymentAuthorizationResult) -> Void) {
        Task { @MainActor in
            guard let service = pendingService else {
                completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
                return
            }
            do {
                let paymentMethodId = try await createStripePaymentMethod(from: payment)
                let result = try await api.authorizeApplePayHold(
                    service: service,
                    patchId: pendingPatchId,
                    stripePaymentMethodId: paymentMethodId,
                    amountCents: pendingAmountCents,
                    guestContact: applePayGuestContact(from: payment)
                )
                statusTone = .success
                statusMessage = result.message
                completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
            } catch {
                statusTone = .warning
                statusMessage = "Apple Pay was ready, but the secure-hold backend is not enabled yet. Use card checkout in the full app."
                completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
            }
            isAuthorizing = false
        }
    }

    nonisolated func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
        Task { @MainActor in
            isAuthorizing = false
            controller.dismiss()
        }
    }

    private var merchantIdentifier: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "BytspotApplePayMerchantID") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private var stripePublishableKey: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "BytspotStripePublishableKey") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.contains("$(") { return nil }
        return trimmed
    }

    private func configureStripeApplePay() -> Bool {
        guard let stripePublishableKey else {
            statusTone = .warning
            statusMessage = "Stripe Apple Pay setup is missing for this build. Use card checkout in the full app."
            return false
        }
        STPAPIClient.shared.publishableKey = stripePublishableKey
        return true
    }

    private func createStripePaymentMethod(from payment: PKPayment) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            StripeAPI.PaymentMethod.create(
                apiClient: STPAPIClient.shared,
                payment: payment,
                clientAttributionMetadata: nil
            ) { result in
                switch result {
                case .success(let paymentMethod):
                    continuation.resume(returning: paymentMethod.id)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func applePayGuestContact(from payment: PKPayment) -> [String: String]? {
        let contact = payment.billingContact ?? payment.shippingContact
        var result: [String: String] = [:]
        if let email = contact?.emailAddress?.trimmingCharacters(in: .whitespacesAndNewlines), !email.isEmpty {
            result["email"] = email
        }
        if let name = contact?.name {
            let rendered = PersonNameComponentsFormatter().string(from: name).trimmingCharacters(in: .whitespacesAndNewlines)
            if !rendered.isEmpty { result["name"] = rendered }
        }
        if let phone = contact?.phoneNumber?.stringValue.trimmingCharacters(in: .whitespacesAndNewlines), !phone.isEmpty {
            result["phone"] = phone
        }
        if let postal = contact?.postalAddress {
            if !postal.postalCode.isEmpty { result["postalCode"] = postal.postalCode }
            if !postal.isoCountryCode.isEmpty { result["country"] = postal.isoCountryCode }
        }
        return result.isEmpty ? nil : result
    }

    private var supportedNetworks: [PKPaymentNetwork] {
        [.amex, .discover, .masterCard, .visa]
    }
}
