import SwiftUI
import AppClip
import StoreKit
import UIKit

enum ClipVerifyState: Equatable {
    case idle
    case verifying
    case verified(label: String, bindingType: String?)
    case failed(message: String)
}

struct ClipContentView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    @State private var showOverlay = false
    @State private var state: ClipVerifyState = .idle
    @State private var selectedService: ClipService?

    private let verifier = ClipPatchVerifier()
    private let services: [ClipService] = [
        ClipService(
            title: "Verified Entry",
            subtitle: "Skip the line and walk straight in when your patch is approved.",
            action: "Get Verified Entry",
            icon: "checkmark.seal.fill",
            tint: .green
        ),
        ClipService(
            title: "VIP Access",
            subtitle: "Premium seating, priority valet, and lounge-ready arrival.",
            action: "Request VIP Access",
            icon: "star.fill",
            tint: .yellow
        ),
        ClipService(
            title: "Smart Parking",
            subtitle: "Find nearby parking, valet pickup, and arrival support.",
            action: "Find Parking / Valet",
            icon: "parkingsign.circle.fill",
            tint: .cyan
        ),
        ClipService(
            title: "Concierge Help",
            subtitle: "Private chef, massage, ride, and venue requests as a guest.",
            action: "Message Concierge",
            icon: "sparkles",
            tint: .purple
        )
    ]

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(red: 0.02, green: 0.05, blue: 0.10), Color.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard
                    servicesSection
                    verificationCard
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
        .onChange(of: invocation.invocationURL) { _ in
            state = .idle
            selectedService = nil
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(.black)
                    .frame(width: 28, height: 28)
                    .background(Color.cyan)
                    .clipShape(Circle())
                Text("INSTANT ACCESS")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.cyan)
                    .tracking(1.2)
                Spacer()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(venueDisplayName)
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Text("Browse venue services as a guest. Patch verification stays off until you ask for it.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white.opacity(0.84))
                    .lineSpacing(3)
            }

            Button(action: browseAsGuest) {
                HStack {
                    Text(selectedService == nil ? "Browse Services" : "Continue as Guest")
                    Spacer()
                    Image(systemName: "arrow.down.circle.fill")
                }
                .font(.system(size: 16, weight: .black))
                .foregroundColor(.black)
                .padding(.vertical, 15)
                .padding(.horizontal, 16)
                .background(
                    LinearGradient(
                        colors: [Color.white, Color.cyan.opacity(0.95)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)

            if let patchId = invocation.patchId {
                Text("Patch \(patchId)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.55))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(20)
        .background(
            LinearGradient(
                colors: [Color.white.opacity(0.18), Color.cyan.opacity(0.13), Color.purple.opacity(0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private var servicesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Venue Services")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.cyan)
                        .tracking(1.1)
                    Text("Tap any service to request instantly")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.75))
                }
                Spacer()
            }

            ForEach(services) { service in
                Button(action: { select(service) }) {
                    serviceCard(service)
                }
                .buttonStyle(.plain)
            }

            if let selectedService {
                selectedServiceCard(selectedService)
            }
        }
    }

    private func serviceCard(_ service: ClipService) -> some View {
        HStack(spacing: 14) {
            Image(systemName: service.icon)
                .font(.system(size: 18, weight: .black))
                .foregroundColor(.black)
                .frame(width: 42, height: 42)
                .background(service.tint)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(service.title)
                    .font(.system(size: 16, weight: .black))
                    .foregroundColor(.white)
                Text(service.subtitle)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.white.opacity(0.78))
                    .lineLimit(2)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .black))
                .foregroundColor(.white.opacity(0.7))
        }
        .padding(15)
        .background(Color(red: 0.08, green: 0.10, blue: 0.16))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(selectedService?.id == service.id ? service.tint : Color.white.opacity(0.12), lineWidth: 1.25)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func selectedServiceCard(_ service: ClipService) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Guest request ready")
                .font(.system(size: 12, weight: .black))
                .foregroundColor(service.tint)
                .tracking(1.0)
            Text(service.action)
                .font(.system(size: 18, weight: .heavy))
                .foregroundColor(.white)
            Text("Continue as a guest now. Sign-in can happen later only if this request needs saved wallet access or verified entry.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.76))
                .lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(red: 0.03, green: 0.17, blue: 0.20))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.cyan.opacity(0.45), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var verificationCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                statusIcon
                VStack(alignment: .leading, spacing: 3) {
                    Text(verificationTitle)
                        .font(.system(size: 15, weight: .black))
                        .foregroundColor(.white)
                    statusBody
                }
                Spacer()
            }

            if hasVerificationToken {
                Button(action: runVerify) {
                    HStack {
                        Text("Verify Patch")
                        Spacer()
                        Image(systemName: "wave.3.right.circle.fill")
                    }
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.white)
                    .padding(.vertical, 13)
                    .padding(.horizontal, 15)
                    .background(Color.white.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
            } else {
                Text("Secure verification appears after a signed NFC or QR patch invocation. Browsing stays available now.")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.white.opacity(0.66))
                    .lineSpacing(3)
            }
        }
        .padding(16)
        .background(Color(red: 0.07, green: 0.08, blue: 0.12))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var fullAppSecondaryButton: some View {
        Button(action: openFullAppOverlay) {
            HStack {
                Image(systemName: "square.and.arrow.down")
                Text(upsellLabel)
                Spacer()
                Image(systemName: "chevron.up")
            }
            .font(.system(size: 13, weight: .black))
            .foregroundColor(.white.opacity(0.9))
            .padding(.vertical, 13)
            .padding(.horizontal, 15)
            .background(Color.white.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var statusIcon: some View {
        switch state {
        case .verifying:
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.cyan)
                .scaleEffect(1.2)
                .frame(width: 34, height: 34)
        case .verified:
            Image(systemName: "checkmark.seal.fill")
                .resizable().scaledToFit().frame(width: 34, height: 34)
                .foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.octagon.fill")
                .resizable().scaledToFit().frame(width: 34, height: 34)
                .foregroundStyle(.red)
        case .idle:
            Image(systemName: "wave.3.right.circle.fill")
                .resizable().scaledToFit().frame(width: 34, height: 34)
                .foregroundStyle(.cyan)
        }
    }

    @ViewBuilder private var statusBody: some View {
        switch state {
        case .idle:
            Text("Reader is idle until you choose Verify Patch.")
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))
        case .verifying:
            Text("Verifying patch…")
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.75))
        case .verified(let label, let bindingType):
            Text("Verified: \(label)")
                .font(.system(size: 12.5, weight: .bold))
                .foregroundColor(.white)
            if let bindingType {
                Text(bindingType.capitalized)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }
        case .failed(let message):
            Text(message)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.72))
        }
    }

    private var venueDisplayName: String {
        guard let slug = invocation.venueSlug, !slug.isEmpty else { return "Bytspot Patch" }
        return slug
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    private var hasVerificationToken: Bool {
        guard let token = invocation.token else { return false }
        return !token.isEmpty
    }

    private var verificationTitle: String {
        switch state {
        case .idle: return "Patch reader"
        case .verifying: return "Checking secure patch"
        case .verified: return "Verified access"
        case .failed: return "Verification needs attention"
        }
    }

    private var upsellLabel: String {
        if case .verified = state { return "Open in the Bytspot app" }
        return "Open full Bytspot app"
    }

    private func browseAsGuest() {
        impactLight()
        if selectedService == nil {
            selectedService = services.first
        }
    }

    private func select(_ service: ClipService) {
        impactLight()
        selectedService = service
    }

    private func openFullAppOverlay() {
        impactLight()
        showOverlay = true
    }

    private func impactLight() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func runVerify() {
        impactLight()
        guard hasVerificationToken else { return }
        state = .verifying
        Task {
            do {
                let result = try await verifier.verify(token: invocation.token)
                let label = result.patch.label ?? invocation.venueSlug ?? "Patch \(result.patch.id)"
                await MainActor.run {
                    state = .verified(label: label, bindingType: result.binding?.type)
                }
            } catch {
                let msg: String
                switch error {
                case ClipPatchVerifier.VerifyError.missingToken: msg = "No token in scan URL."
                case ClipPatchVerifier.VerifyError.server(let m): msg = m
                case ClipPatchVerifier.VerifyError.network(let m): msg = m
                default: msg = "Could not reach Bytspot. Try again."
                }
                await MainActor.run { state = .failed(message: msg) }
            }
        }
    }
}

private struct ClipService: Identifiable {
    let title: String
    let subtitle: String
    let action: String
    let icon: String
    let tint: Color

    var id: String { title }
}