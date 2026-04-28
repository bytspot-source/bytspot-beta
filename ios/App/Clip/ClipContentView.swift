import SwiftUI
import AppClip
import StoreKit

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

    private let verifier = ClipPatchVerifier()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                statusIcon
                Text("Bytspot Patch")
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundColor(.white)
                statusBody
                Spacer()
                Button(action: { showOverlay = true }) {
                    Text(upsellLabel)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(
                            LinearGradient(
                                colors: [.cyan, .purple, .pink],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
        .appStoreOverlay(isPresented: $showOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
        }
        .onChange(of: invocation.token) { _ in runVerify() }
        .onAppear { runVerify() }
    }

    @ViewBuilder private var statusIcon: some View {
        switch state {
        case .verifying:
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.cyan)
                .scaleEffect(1.6)
                .frame(width: 96, height: 96)
        case .verified:
            Image(systemName: "checkmark.seal.fill")
                .resizable().scaledToFit().frame(width: 96, height: 96)
                .foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.octagon.fill")
                .resizable().scaledToFit().frame(width: 96, height: 96)
                .foregroundStyle(.red)
        case .idle:
            Image(systemName: "wave.3.right.circle.fill")
                .resizable().scaledToFit().frame(width: 96, height: 96)
                .foregroundStyle(.cyan)
        }
    }

    @ViewBuilder private var statusBody: some View {
        switch state {
        case .idle:
            if let slug = invocation.venueSlug {
                Text(slug)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            } else {
                Text("Tap or scan a Bytspot patch to verify your access.")
                    .multilineTextAlignment(.center)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
                    .padding(.horizontal, 32)
            }
            if let patchId = invocation.patchId {
                Text("Patch \(patchId)")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.45))
            }
        case .verifying:
            Text("Verifying patch…")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white.opacity(0.75))
        case .verified(let label, let bindingType):
            Text("Verified")
                .font(.system(size: 18, weight: .heavy))
                .foregroundColor(.green)
            Text(label)
                .multilineTextAlignment(.center)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 24)
            if let bindingType {
                Text(bindingType.capitalized)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }
        case .failed(let message):
            Text("Verification failed")
                .font(.system(size: 18, weight: .heavy))
                .foregroundColor(.red)
            Text(message)
                .multilineTextAlignment(.center)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.6))
                .padding(.horizontal, 32)
        }
    }

    private var upsellLabel: String {
        if case .verified = state { return "Open in the Bytspot app" }
        return "Get the full Bytspot app"
    }

    private func runVerify() {
        guard invocation.token != nil else { return }
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
