import SwiftUI
import AppClip
import StoreKit
import UIKit
import AuthenticationServices
import AVFoundation
import AVKit
import CoreImage.CIFilterBuiltins
import SafariServices

enum ClipTheme {
    // Canonical Bytspot brand palette from src/BRAND_COLORS.md + LOGO_BEFORE_AFTER.md.
    // Brand identity: Cyan → Purple → Pink/Magenta on an iOS dark glass base.
    static let background = Color(red: 0.043, green: 0.043, blue: 0.063) // #0B0B10
    static let panel = Color(red: 0.059, green: 0.067, blue: 0.095)
    static let panelElevated = Color(red: 0.110, green: 0.110, blue: 0.118) // #1C1C1E
    static let cyan = Color(red: 0.000, green: 0.749, blue: 1.000) // #00BFFF
    static let violet = Color(red: 0.659, green: 0.333, blue: 0.969) // #A855F7
    static let pink = Color(red: 0.851, green: 0.275, blue: 0.937) // #D946EF
    static let magenta = Color(red: 1.000, green: 0.000, blue: 1.000) // #FF00FF
    static let orange = Color(red: 1.000, green: 0.271, blue: 0.000) // #FF4500
    static let emerald = Color(red: 0.133, green: 0.773, blue: 0.369)
    static let gold = Color(red: 0.847, green: 0.729, blue: 0.384) // Black-tier accent only

    // MARK: Tier palette
    /// Primary accent — eyebrow, progress spinners, price labels.
    static func accent(for tier: BytspotTier) -> Color {
        switch tier {
        case .black: return gold
        case .platinum: return cyan
        case .green: return emerald
        }
    }
    /// Secondary accent — used in the corner radial wash + verification chip.
    static func secondaryAccent(for tier: BytspotTier) -> Color {
        switch tier {
        case .black: return magenta
        case .platinum: return violet
        case .green: return cyan
        }
    }
    /// Tierless stops for a band link that codes no tier.
    static let neutralCornerGradientStops: (top: Color, bottom: Color) = (cyan.opacity(0.14), violet.opacity(0.12))
    /// Tier-specific corner gradient stops applied behind the catalog flow.
    static func cornerGradientStops(for tier: BytspotTier) -> (top: Color, bottom: Color) {
        switch tier {
        case .black: return (violet.opacity(0.18), magenta.opacity(0.12))
        case .platinum: return (cyan.opacity(0.18), violet.opacity(0.16))
        case .green: return (emerald.opacity(0.18), cyan.opacity(0.12))
        }
    }
}

struct ClipContentView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    @Environment(\.openURL) private var openURL
    @State private var showOverlay = false

    var body: some View {
        let stops = bandIsUncoded ? ClipTheme.neutralCornerGradientStops : ClipTheme.cornerGradientStops(for: invocation.tier)
        ZStack {
            ClipTheme.background.ignoresSafeArea()
            RadialGradient(colors: [stops.top, .clear], center: .topLeading, startRadius: 20, endRadius: 460)
                .ignoresSafeArea()
            RadialGradient(colors: [stops.bottom, .clear], center: .bottomTrailing, startRadius: 20, endRadius: 420)
                .ignoresSafeArea()

            Group {
                switch invocation.flow {
                case .awaitingInvocation:
                    ClipPartyInviteStateView(title: "Open your invitation", message: "Open a Bytspot link or scan its QR code to continue.", isLoading: false)
                        .transition(.opacity)
                case .partyLoading:
                    ClipPartyInviteStateView(title: "Loading Party Pass…", message: "Getting the moment directly from its Host Studio party.", isLoading: true)
                        .transition(.opacity)
                case .partyFailed(let partyID, let message):
                    ClipPartyInviteStateView(title: "Party Pass unavailable", message: message, isLoading: false,
                                             retry: partyID.isEmpty ? nil : { invocation.retryPartyInvite() })
                        .transition(.opacity)
                case .party(let invite):
                    PartyPassClipView(invite: invite, showOverlay: $showOverlay)
                        .id(invite.id)
                        .transition(.opacity)
                case .saleLoading:
                    ClipPartyInviteStateView(title: "Loading sale…", message: "Getting the listing the seller shared.", isLoading: true)
                        .transition(.opacity)
                case .saleFailed(let saleID, let message):
                    ClipPartyInviteStateView(title: "Sale unavailable", message: message, isLoading: false,
                                             retry: saleID.isEmpty ? nil : { invocation.retrySale() })
                        .transition(.opacity)
                case .sale(let listing):
                    ClipSaleView(listing: listing, showOverlay: $showOverlay)
                        .id(listing.saleID)
                        .transition(.opacity)
                case .band(let screen):
                    ClipBandTapView(screen: screen, showOverlay: $showOverlay)
                        .transition(.opacity)
                case .vendorPatchLoading:
                    ClipPartyInviteStateView(title: "Opening code…", message: "Getting what this business offers.", isLoading: true)
                        .transition(.opacity)
                case .vendorPatchFailed(_, let message):
                    ClipPartyInviteStateView(title: "Code unavailable", message: message, isLoading: false,
                                             retry: message == ClipVendorPatch.failedMessage ? { invocation.retryVendorPatch() } : nil)
                        .transition(.opacity)
                case .vendorPatch(let patch):
                    ClipVendorPatchView(patch: patch, showOverlay: $showOverlay)
                        .id(patch.code)
                        .transition(.opacity)
                case .linkNotInUse:
                    ClipPartyInviteStateView(title: "Link not in use", message: "This link is no longer in use. Get Bytspot to see what's on nearby.", isLoading: false,
                                             getApp: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) })
                        .transition(.opacity)
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.86), value: invocation.flow)
        }
        .appStoreOverlay(isPresented: $showOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
        }
    }

    private var bandIsUncoded: Bool {
        switch invocation.flow {
        case .band(let screen): return screen.tier == nil
        case .saleLoading, .saleFailed, .sale: return true
        case .vendorPatchLoading, .vendorPatchFailed, .vendorPatch, .linkNotInUse: return true
        default: return false
        }
    }
}

private struct ClipSaleView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let listing: ClipSaleListing
    @Binding var showOverlay: Bool

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if let photo = listing.photoURL {
                    // The bitmap is an overlay so its size never widens the Clip.
                    Color.white.opacity(0.06)
                        .frame(maxWidth: .infinity)
                        .frame(height: 240)
                        .overlay(AsyncImage(url: photo) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                        })
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(ClipSaleListing.eyebrow)
                        .font(.system(size: 11, weight: .black))
                        .foregroundColor(ClipTheme.cyan)
                        .tracking(1.4)
                    Text(listing.title)
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundColor(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.8)
                    Text(listing.priceLabel)
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(.white)
                    Text("Sold by \(listing.sellerName)")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.74))
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("clip-sale-header")
                VStack(alignment: .leading, spacing: 12) {
                    if let window = listing.windowLabel {
                        Label(window, systemImage: "clock")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundColor(.white.opacity(0.82))
                    }
                    if let area = listing.areaLabel {
                        Label(area, systemImage: "mappin.and.ellipse")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundColor(.white.opacity(0.82))
                    }
                    Text(ClipSaleListing.requestNote)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.app.fill")
                            Text(ClipSaleListing.getAppTitle)
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(.black)
                        .padding(.vertical, 14).padding(.horizontal, 14)
                        .background(ClipTheme.cyan)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("clip-sale-get-app")
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(ClipTheme.panelElevated))
            }
            .padding(.horizontal, 18)
            .padding(.top, 22)
            .padding(.bottom, 28)
        }
        .accessibilityIdentifier("clip-sale")
    }
}

private struct ClipVendorPatchView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let patch: ClipVendorPatch
    @Binding var showOverlay: Bool

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(ClipVendorPatch.eyebrow)
                        .font(.system(size: 11, weight: .black))
                        .foregroundColor(ClipTheme.cyan)
                        .tracking(1.4)
                    Text(patch.placeLabel)
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundColor(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.8)
                    Text(patch.sellerName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.74))
                    if let address = patch.address {
                        Label(address, systemImage: "mappin.and.ellipse")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundColor(.white.opacity(0.82))
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("clip-vendor-patch-header")
                VStack(alignment: .leading, spacing: 12) {
                    if patch.services.isEmpty {
                        Text(patch.emptyMessage)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white.opacity(0.74))
                    } else {
                        ForEach(patch.services) { service in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(service.title)
                                    .font(.system(size: 15.5, weight: .bold))
                                    .foregroundColor(.white)
                                Text([ClipVendorPatch.priceLabel(service.priceCents), service.nextSlot.map { "Next \($0.formatted(date: .abbreviated, time: .shortened))" }].compactMap { $0 }.joined(separator: " · "))
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white.opacity(0.66))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityElement(children: .combine)
                        }
                        Text(ClipVendorPatch.askNote)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.app.fill")
                            Text(ClipVendorPatch.getAppTitle)
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(.black)
                        .padding(.vertical, 14).padding(.horizontal, 14)
                        .background(ClipTheme.cyan)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("clip-vendor-patch-get-app")
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(ClipTheme.panelElevated))
            }
            .padding(.horizontal, 18)
            .padding(.top, 22)
            .padding(.bottom, 28)
        }
        .accessibilityIdentifier("clip-vendor-patch")
    }
}

private struct ClipBandTapView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let screen: ClipBandTapScreen
    @Binding var showOverlay: Bool

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(ClipBandTapScreen.eyebrow)
                        .font(.system(size: 11, weight: .black))
                        .foregroundColor(screen.tier.map(ClipTheme.accent(for:)) ?? ClipTheme.cyan)
                        .tracking(1.4)
                    Text(screen.title)
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)
                    Text(screen.subtitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.74))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityIdentifier("clip-band-tap-header")
                VStack(alignment: .leading, spacing: 14) {
                    if screen.tierLine != nil {
                        Text(ClipBandTapScreen.bodyText)
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundColor(.white)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.app.fill")
                            Text(ClipBandTapScreen.getAppTitle)
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(.white.opacity(0.9))
                        .padding(.vertical, 13).padding(.horizontal, 14)
                        .background(Color.white.opacity(0.08))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("clip-band-tap-get-app")
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(ClipTheme.panelElevated))
            }
            .padding(.horizontal, 18)
            .padding(.top, 22)
            .padding(.bottom, 28)
        }
    }
}

private struct ClipPartyInviteStateView: View {
    let title: String
    let message: String
    let isLoading: Bool
    var retry: (() -> Void)? = nil
    var getApp: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 14) {
            if isLoading { ProgressView().tint(ClipTheme.cyan).scaleEffect(1.2) }
            Image(systemName: isLoading ? "sparkles" : "exclamationmark.circle.fill")
                .font(.system(size: 34, weight: .black)).foregroundColor(isLoading ? ClipTheme.cyan : ClipTheme.pink)
            Text(title).font(.system(size: 24, weight: .black, design: .rounded)).foregroundColor(.white)
            Text(message).font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.62)).multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
                    .tint(ClipTheme.cyan)
                    .accessibilityIdentifier("party-invite-retry")
            }
            if let getApp {
                Button("Get Bytspot", action: getApp)
                    .buttonStyle(.borderedProminent)
                    .tint(ClipTheme.cyan)
                    .accessibilityIdentifier("clip-link-not-in-use-get-app")
            }
        }
        .padding(26).frame(maxWidth: 360)
        .background(RoundedRectangle(cornerRadius: 28).fill(ClipTheme.panelElevated.opacity(0.92)))
        .padding(22)
    }
}

// MARK: - Party Pass

/// Host Studio publishes a cover in its own shape. The hero box takes that
/// shape, clamped so a panorama cannot shrink the card to a strip and a tall
/// flyer cannot push the invitation off the screen. Host Studio's editor tile
/// mirrors this rule in `NativePartyPendingImage.coverBoxAspectRatio(for:)`.
enum ClipPartyPoster {
    static let tallestAspectRatio: CGFloat = 4.0 / 5.0
    static let widestAspectRatio: CGFloat = 3.0 / 2.0

    /// Width over height. An unknown or degenerate size falls back to 3:2,
    /// the shape every previously published cover already has.
    static func boxAspectRatio(for size: CGSize) -> CGFloat {
        guard size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return widestAspectRatio }
        return min(max(size.width / size.height, tallestAspectRatio), widestAspectRatio)
    }
}

/// Loads a poster once so the hero can size its box from the bitmap and draw
/// it twice (fitted, plus a blurred fill behind it) without a second fetch.
@MainActor
private final class ClipPosterImageLoader: ObservableObject {
    @Published private(set) var image: UIImage?
    @Published private(set) var fill: UIImage?
    private var loadedURL: URL?

    func load(_ url: URL) async {
        guard loadedURL != url else { return }
        loadedURL = url
        image = nil
        fill = nil
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return }
        let (decoded, backdrop) = await Task.detached(priority: .userInitiated) { () -> (UIImage?, UIImage?) in
            guard let decoded = UIImage(data: data)?.preparingForDisplay() ?? UIImage(data: data) else { return (nil, nil) }
            return (decoded, Self.boxFill(for: decoded))
        }.value
        guard loadedURL == url, let decoded else { return }
        image = decoded
        fill = backdrop
    }

    /// The bitmap aspect-filled into the box's own shape, drawn small because
    /// it is only ever shown blurred. Cropped here rather than by `scaledToFill`
    /// so the fill layer is exactly box-sized and never measures wider.
    nonisolated static func boxFill(for image: UIImage) -> UIImage? {
        let source = image.size
        guard source.width > 0, source.height > 0 else { return nil }
        let ratio = ClipPartyPoster.boxAspectRatio(for: source)
        let target = CGSize(width: 240, height: (240 / ratio).rounded())
        let scale = max(target.width / source.width, target.height / source.height)
        let drawn = CGSize(width: source.width * scale, height: source.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(x: (target.width - drawn.width) / 2, y: (target.height - drawn.height) / 2, width: drawn.width, height: drawn.height))
        }
    }
}

/// The cover drawn whole inside a box the caller has already sized. Bars left
/// by the fit are filled with a blurred, dimmed copy of the same bitmap. Both
/// layers are exactly box-sized so neither can report the size it scaled to.
private struct ClipPosterBox: View {
    let image: UIImage?
    let fill: UIImage?
    let size: CGSize

    var body: some View {
        ZStack {
            if let fill {
                Image(uiImage: fill).resizable()
                    .frame(width: size.width, height: size.height)
                    .blur(radius: 22, opaque: true)
                    .overlay(Color.black.opacity(0.38))
                    .accessibilityHidden(true)
            }
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(width: size.width, height: size.height)
                    .accessibilityHidden(true)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipped()
    }
}

/// Fill-scaled image that reports the container's size, not the bitmap's.
/// `scaledToFill` otherwise measures the size it scaled *to*, which is wider
/// than the phone whenever the poster is. Left to size itself it widens any
/// ScrollView / ZStack that contains it.
private struct ClipContainedFillImage: View {
    let url: URL
    /// Filling is wrong full-bleed: covering a tall phone with a 3:2 poster
    /// scales it to the screen height and leaves only the middle third of its
    /// width on screen, so the poster reads as an enlarged fragment of itself.
    var contentMode: ContentMode = .fill

    var body: some View {
        GeometryReader { proxy in
            AsyncImage(url: url) { image in
                image.resizable()
                    .aspectRatio(contentMode: contentMode)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
            } placeholder: { Color.clear }
        }
        .clipped()
    }
}

/// Dedicated paid-party App Clip surface. It is intentionally separate from
/// `ClipInviteView`, which remains the legacy `/group/<id>` implementation.
struct PartyPassClipView: View {
    let invite: PartyPassInvite
    @Binding var showOverlay: Bool
    @EnvironmentObject private var invocation: ClipInvocationModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @Environment(\.sizeCategory) private var sizeCategory
    @State private var passState: ClipPartyPassState?
    @State private var isResolving = true
    @State private var isPerformingAction = false
    @State private var statusMessage = ""
    @State private var showTicketTiers = false
    @State private var showShareSheet = false
    @State private var viewerName = ClipAuthStore.displayName
    @State private var authController = ClipGuestAuthController()
    // Opaque attendee credential: intentionally in-memory only. Never persist,
    // log, share, or route it outside the QR image shown to the door staff.
    @State private var attendeeCredential: ClipPatchVerifier.PartyAttendeeCredential?
    @State private var isLoadingAttendeeCredential = false
    @State private var attendeeCredentialMessage = ""
    /// Changes on every clear/request so an older async response can never
    /// restore a QR after backgrounding, denial, or a newer request.
    @State private var attendeeCredentialGeneration = UUID()
    /// Resolves are also generation-bound. Access remains fail-closed after a
    /// scene transition until the current active scene has a fresh response.
    @State private var passResolverGeneration = UUID()
    @StateObject private var posterLoader = ClipPosterImageLoader()

    /// Confirmed access turns the whole surface emerald: the guest is past the
    /// door decision, so the tier accent — which advertises what they had to
    /// clear — stops being the useful signal. Gated on the same fail-closed
    /// `effectiveAction` the QR uses, never on `passState.accessGranted` alone.
    private var accent: Color {
        effectiveAction == .viewPass ? ClipTheme.emerald : ClipTheme.accent(for: invite.tier)
    }
    private var ctaForeground: Color { ClipTheme.background }
    private var tierPresentation: PartyInvitationTierPresentation { PartyInvitationTierPresentation(for: invite.tier) }
    private var partyBookingContext: ClipBookingContext? {
        invocation.selectedPartyTicketTier.map { .make(partyTicket: $0, partyTier: invite.tier) }
    }
    private var isBusy: Bool { isResolving || isPerformingAction }
    /// A server `view-pass` action is presentationally valid only when the
    /// guest explicitly has access. Keep an explicit denial fail-closed in all
    /// visual, VoiceOver, and CTA states—not merely QR issuance.
    private var effectiveAction: ClipPartyPassAction? {
        PartyPassPresentationRules.effectiveAction(for: passState)
    }
    private var primaryTitle: String {
        guard let action = effectiveAction else { return isResolving ? "Preparing your Party Pass…" : "Party Pass unavailable" }
        switch action {
        case .authenticate: return "Sign in to get tickets"
        case .ticket: return "Choose a ticket"
        case .rsvp: return "RSVP to this Party"
        case .requestApproval: return "Request host approval"
        case .viewPass: return "Party Pass confirmed"
        case .unavailable: return passState?.guestStatus.lowercased() == "pending" ? "Request pending" : "Party Pass unavailable"
        }
    }
    private var primarySymbol: String {
        switch effectiveAction {
        case .authenticate: return "person.badge.key.fill"
        case .ticket: return "ticket.fill"
        case .rsvp: return "checkmark.seal.fill"
        case .requestApproval: return "hand.raised.fill"
        case .viewPass: return "checkmark.seal.fill"
        case .unavailable: return passState?.guestStatus.lowercased() == "pending" ? "clock.fill" : "exclamationmark.triangle.fill"
        case nil: return "hourglass"
        }
    }
    private var primarySubtitle: String {
        switch effectiveAction {
        case .authenticate: return "Sign in with Apple to verify your access."
        case .ticket: return "Choose a tier before secure checkout."
        case .rsvp: return "Free RSVP · your place is requested instantly."
        case .requestApproval: return "The host reviews private access requests."
        case .viewPass: return "Your access is confirmed. Keep this Party Pass handy."
        case .unavailable: return passState?.guestStatus.lowercased() == "pending" ? "The host is reviewing your request." : "A new Party action is not available."
        case nil: return "Verifying the invitation and access rules."
        }
    }
    private var primaryButtonColor: Color {
        guard let action = effectiveAction else { return ClipTheme.panelElevated }
        switch action {
        case .unavailable, .viewPass: return action == .viewPass ? accent : Color.white.opacity(0.14)
        default: return accent
        }
    }
    private var primaryButtonForeground: Color {
        guard let action = effectiveAction else { return .white.opacity(0.66) }
        return action == .unavailable ? .white.opacity(0.66) : ctaForeground
    }
    private var accessStatus: PartyAccessStatus {
        switch effectiveAction {
        case .authenticate:
            return PartyAccessStatus("SIGN IN REQUIRED", "Verify your invitation", "Use Apple sign-in to see your authorized Party action.", "person.badge.key.fill", .access(accent: accent))
        case .ticket:
            return PartyAccessStatus("TICKETS AVAILABLE", "Choose your entry tier", "Price and eligibility are verified again before Checkout.", "ticket.fill", .access(accent: accent))
        case .requestApproval:
            return PartyAccessStatus("HOST REVIEW", "Approval required", "Your request stays private until the host responds.", "hand.raised.fill", .access(accent: accent))
        case .viewPass:
            return PartyAccessStatus("ACCESS CONFIRMED", "Your Party Pass is ready", "Keep this pass ready for arrival.", "checkmark.seal.fill", .access(accent: accent))
        case .unavailable where passState?.guestStatus.lowercased() == "pending":
            return PartyAccessStatus("REQUEST PENDING", "The host is reviewing", "You will be notified when access changes.", "clock.fill", .access(accent: ClipTheme.violet))
        case .unavailable where passState?.guestStatus.lowercased() == "membership-required":
            return PartyAccessStatus("MEMBERSHIP REQUIRED", "A higher tier is needed", "This Party requires \(invite.tier.displayName) membership.", "lock.fill", .access(accent: accent))
        case .unavailable:
            return PartyAccessStatus("ACCESS UNAVAILABLE", "Party action unavailable", "This invitation cannot accept a new action right now.", "exclamationmark.triangle.fill", .standard)
        case .rsvp:
            return PartyAccessStatus("YOUR ACCESS", "RSVP access", "A private invitation from \(invite.hostName).", "checkmark.seal.fill", .access(accent: accent))
        case nil:
            let unresolved = PartyPassPresentationRules.unresolvedAccess(isResolving: isResolving)
            return PartyAccessStatus(unresolved.eyebrow, unresolved.title, unresolved.detail, unresolved.symbol, .standard)
        }
    }

    var body: some View {
        GeometryReader { viewport in
            ZStack {
                partyBackdrop
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 12) {
                        header
                        // The hero is pinned to the viewport width so a poster
                        // can never drive its own size: the padded content width
                        // is the only bound that keeps the cover box on-screen.
                        hero(containerWidth: viewport.size.width - 40)
                        passSummary
                        attendeePassCard
                        details
                        hostDestinations
                        if !invite.itinerary.isEmpty { program }
                        // Host Studio no longer ships a pre-party album. Recap
                        // photos, if any, arrive after the room — never as Clip
                        // payload on first RSVP.
                        if !invite.photoURLs.isEmpty { partyAlbum }
                        guestStack
                    }
                    .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 120)
                    .frame(width: viewport.size.width, alignment: .leading)
                }
            }
        }
        .safeAreaInset(edge: .bottom) { ticketActionBar }
        .sheet(isPresented: $showTicketTiers) {
            ClipPartyTicketTierPicker(tiers: invite.ticketTiers, partyTitle: invite.title, partyRequiredTier: invite.tier) { tier in
                showTicketTiers = false
                createCheckout(for: tier)
            }
        }
        .sheet(isPresented: $showShareSheet) { ClipShareSheet(items: [invite.canonicalURL].compactMap { $0 }) }
        .accessibilityIdentifier("party-pass-clip")
        // Keyed on activation so the resolver runs against the view value that
        // carries the new phase; an `onChange` closure still holds the old one
        // and would always see the scene as inactive.
        .task(id: Self.passResolutionKey(inviteID: invite.id, scenePhase: scenePhase)) { await resolvePass() }
        .task(id: invite.displayPosterURL) {
            if let poster = invite.displayPosterURL { await posterLoader.load(poster) }
        }
        .onChange(of: scenePhase) { phase in
            if phase != .active { invalidatePassResolution() }
        }
    }

    private var partyBackdrop: some View {
        ZStack {
            ClipTheme.background.ignoresSafeArea()
            if let poster = invite.displayPosterURL {
                ClipContainedFillImage(url: poster, contentMode: .fit)
                    .blur(radius: 18)
                    .opacity(0.18).ignoresSafeArea()
            }
            LinearGradient(colors: [Color.black.opacity(0.10), ClipTheme.background.opacity(0.94), ClipTheme.background], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            RadialGradient(colors: [accent.opacity(0.14), .clear], center: .topLeading, startRadius: 8, endRadius: 360).ignoresSafeArea()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("BYTSPOT").font(.system(size: 11, weight: .black, design: .rounded)).tracking(2.0)
                    .foregroundColor(.white)
                HStack(spacing: 5) {
                    Circle().fill(accent).frame(width: 5, height: 5)
                    Text(viewerName.map { "WELCOME, \($0.uppercased())" } ?? tierPresentation.headerLabel).font(.system(size: 8, weight: .black, design: .rounded)).tracking(1.1).foregroundColor(.white.opacity(0.54))
                }
            }
            Spacer()
            Button { showShareSheet = true } label: { Image(systemName: "square.and.arrow.up.fill") }
                .buttonStyle(PartyGlassIconButton()).accessibilityLabel("Share Party Pass")
        }
    }

    private var heroSurface: some View {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
            .fill(LinearGradient(colors: [ClipTheme.panelElevated, ClipTheme.panel], startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    // The tier requirement is stated once, here. Repeating it beside this
    // badge and again as a pass metric read as three separate rules rather
    // than one.
    private var heroBadge: some View {
        HStack {
            Text(tierPresentation.heroBadge).font(.system(size: 9, weight: .black, design: .rounded)).tracking(1.2)
                .foregroundColor(accent).padding(.horizontal, 10).padding(.vertical, 7)
                .background(Capsule().fill(Color.black.opacity(0.44))).overlay(Capsule().stroke(accent.opacity(0.42)))
                .accessibilityIdentifier("party-pass-hero-badge")
            Spacer()
        }
    }

    private var heroTitle: some View {
        Text(invite.title).font(.system(size: 36, weight: .bold, design: .serif)).foregroundColor(.white).lineLimit(3).minimumScaleFactor(0.78).fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("party-pass-hero-title")
    }

    @ViewBuilder private func hero(containerWidth: CGFloat) -> some View {
        if invite.displayPosterURL != nil {
            coverHero(containerWidth: containerWidth)
        } else {
            plainHero
        }
    }

    /// The cover sits whole at the top of the card and the words sit under it,
    /// so a flyer that carries its own type is never printed over.
    private func coverHero(containerWidth: CGFloat) -> some View {
        // The box is measured off the container width, never off the bitmap
        // or the text: deriving height from an unbounded ScrollView let a
        // portrait poster enlarge the whole template. Until the bitmap lands
        // the box holds the 3:2 shape every earlier cover was published in.
        let ratio = ClipPartyPoster.boxAspectRatio(for: posterLoader.image?.size ?? .zero)
        let coverSize = CGSize(width: max(0, containerWidth), height: max(0, containerWidth) / ratio)
        return VStack(alignment: .leading, spacing: 0) {
            // VoiceOver gets one element the size of the box, not the bitmaps.
            ClipPosterBox(image: posterLoader.image, fill: posterLoader.fill, size: coverSize)
                .accessibilityHidden(true)
                .overlay(
                    Rectangle().fill(Color.clear).contentShape(Rectangle())
                        .accessibilityElement()
                        .accessibilityLabel("Party cover")
                        .accessibilityAddTraits(.isImage)
                        .accessibilityIdentifier("party-pass-hero-cover")
                )
                .overlay(alignment: .top) {
                    LinearGradient(colors: [Color.black.opacity(0.42), .clear], startPoint: .top, endPoint: .bottom)
                        .frame(height: 64)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                .overlay(alignment: .topLeading) { heroBadge.padding(17).padding(.horizontal, 3) }
            VStack(alignment: .leading, spacing: 12) {
                heroTitle
                heroMetadata
            }
            .padding(17)
            .padding([.horizontal, .bottom], 3)
        }
        .frame(width: max(0, containerWidth), alignment: .leading)
        .background(heroSurface)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.white.opacity(0.15)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("party-pass-hero")
    }

    private var plainHero: some View {
        ZStack(alignment: .bottomLeading) {
            heroSurface
            LinearGradient(colors: [Color.black.opacity(0.08), Color.black.opacity(0.36), Color.black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
            // Badge and title share one stack so the card's height accounts
            // for both. As separate overlays a title that wrapped to three
            // lines grew upward and printed through the badge.
            VStack(alignment: .leading, spacing: 12) {
                heroBadge
                Spacer(minLength: 12)
                heroTitle
                heroMetadata
            }
            .padding(17)
            .padding([.horizontal, .bottom], 3)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 292)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.white.opacity(0.15)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("party-pass-hero")
    }

    @ViewBuilder private var heroMetadata: some View {
        if sizeCategory.isAccessibilityCategory {
            VStack(alignment: .leading, spacing: 7) {
                heroMetadataChip(icon: "person.crop.circle.fill", value: "Hosted by \(invite.hostName)")
                heroMetadataChip(icon: "calendar", value: invite.scheduledDate)
                heroMetadataChip(icon: "mappin.and.ellipse", value: invite.locationLabel)
            }
        } else {
            HStack(spacing: 7) {
                heroMetadataChip(icon: "person.crop.circle.fill", value: invite.hostName)
                heroMetadataChip(icon: "calendar", value: compactHeroSchedule)
                heroMetadataChip(icon: "mappin.and.ellipse", value: invite.locationLabel)
            }
        }
    }

    private var compactHeroSchedule: String {
        let parts = invite.scheduledDate.components(separatedBy: " at ")
        guard parts.count == 2 else { return invite.scheduledDate }
        let day = parts[0].split(separator: ",").first.map(String.init) ?? parts[0]
        return "\(day)\n\(parts[1])"
    }

    private func heroMetadataChip(icon: String, value: String) -> some View {
        Label(value, systemImage: icon)
            .font(.system(size: 10.5, weight: .bold, design: .rounded))
            .foregroundColor(.white.opacity(0.86)).lineLimit(sizeCategory.isAccessibilityCategory ? nil : 2)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 9).padding(.vertical, 7)
            .background(Capsule().fill(Color.black.opacity(0.36)))
    }

    private var passSummary: some View {
        PartyGlassCard(variant: accessStatus.variant) {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: accessStatus.symbol).font(.system(size: 18, weight: .black)).foregroundColor(ctaForeground).frame(width: 46, height: 46).background(accessStatus.accent).clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(accessStatus.eyebrow).font(.system(size: 10, weight: .black, design: .rounded)).tracking(1.05).foregroundColor(accessStatus.accent)
                    Text(accessStatus.title).font(.system(size: 18, weight: .bold, design: .serif)).foregroundColor(.white)
                    Text(accessStatus.detail).font(.system(size: 12, weight: .medium, design: .rounded)).foregroundColor(.white.opacity(0.64)).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: tierPresentation.symbol).font(.system(size: 12, weight: .bold)).foregroundColor(accent).frame(width: 18)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tierPresentation.eyebrow).font(.system(size: 9, weight: .black, design: .rounded)).tracking(0.95).foregroundColor(accent)
                    Text(tierPresentation.detail).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.74)).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 8) {
                PartyMetric(value: invite.capacity.map { "\($0) max" } ?? "Limited", label: "CAPACITY")
                PartyMetric(value: "\(invite.attendeeCount) in", label: "GOING")
                PartyMetric(value: accessMetricValue, label: "ACCESS")
            }
        }
    }

    @ViewBuilder private var attendeePassCard: some View {
        if let attendeeCredential {
            PartyGlassCard(variant: .access(accent: accent)) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "qrcode").font(.system(size: 18, weight: .black)).foregroundColor(ctaForeground)
                        .frame(width: 44, height: 44).background(accent).clipShape(RoundedRectangle(cornerRadius: 13))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("PERSONAL DOOR PASS").font(.system(size: 10, weight: .black, design: .rounded)).tracking(1).foregroundColor(accent)
                        Text("Show this QR at the door").font(.system(size: 18, weight: .bold, design: .serif)).foregroundColor(.white)
                        Text("This pass is personal and refreshes when requested. Do not share it.")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.64))
                    }
                }
                ClipPersonalAttendeeQR(value: attendeeCredential.value)
                    .frame(maxWidth: .infinity).padding(.top, 4)
                arrivalDetails
            }
        } else if isLoadingAttendeeCredential {
            PartyGlassCard(variant: .access(accent: accent)) {
                HStack(spacing: 12) {
                    ProgressView().tint(accent)
                    Text("Preparing your personal door pass…").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(.white)
                }
            }
        } else if !attendeeCredentialMessage.isEmpty {
            PartyGlassCard(variant: .standard) {
                Text(attendeeCredentialMessage).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.74))
            }
        }
    }

    /// Arrival lives on the pass itself: at the door the guest has this card
    /// open, and scrolling back to the invitation to check the time or the
    /// host's instructions is the one thing they cannot do while queueing.
    @ViewBuilder private var arrivalDetails: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(Color.white.opacity(0.12))
            PartyDetailRow(icon: "calendar.badge.clock", label: "ARRIVE", value: invite.scheduledDate)
            if !invite.locationIsWithheld {
                PartyDetailRow(icon: "mappin.and.ellipse", label: "WHERE", value: invite.locationLabel)
            }
            if let note = invite.note?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                PartyDetailRow(icon: "text.bubble.fill", label: "FROM THE HOST", value: note)
            }
        }
        .padding(.top, 2)
    }

    private var details: some View {
        PartyGlassCard {
            Text("The invitation").font(.system(size: 21, weight: .bold, design: .serif)).foregroundColor(.white)
            PartyDetailRow(icon: "person.crop.circle.fill", label: "HOST", value: invite.hostName)
            PartyDetailRow(icon: "calendar.badge.clock", label: "WHEN", value: invite.scheduledDate)
            PartyDetailRow(icon: "mappin.and.ellipse", label: invite.locationDisclosure == "after-approval" ? "LOCATION AFTER APPROVAL" : invite.locationIsWithheld ? "LOCATION WITHHELD" : "WHERE", value: invite.locationLabel)
            if let venue = invite.routableVenueName { openInMapsButton(venue: venue) }
            if let note = invite.note { PartyDetailRow(icon: "sparkles", label: "FROM THE HOST", value: note) }
        }
    }

    /// Routes to the venue's actual point when the server published one, and
    /// falls back to a name search when it did not. `q` is always sent so Maps
    /// labels the pin with the place rather than a bare coordinate, and the
    /// guest can confirm where they are going before driving.
    private func openInMapsButton(venue: String) -> some View {
        let coordinate = invite.routableCoordinate
        return Button {
            impactLight()
            var components = URLComponents(string: "http://maps.apple.com/")!
            var items: [URLQueryItem] = []
            if let coordinate {
                items.append(URLQueryItem(name: "ll", value: "\(coordinate.latitude),\(coordinate.longitude)"))
            }
            items.append(URLQueryItem(name: "q", value: venue))
            items.append(URLQueryItem(name: "dirflg", value: "d"))
            components.queryItems = items
            if let url = components.url { openURL(url) }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: coordinate == nil ? "map.fill" : "location.fill").font(.system(size: 12, weight: .black))
                Text(coordinate == nil ? "Open in Maps" : "Directions").font(.system(size: 13, weight: .black, design: .rounded))
            }
            .foregroundColor(.white)
            .padding(.vertical, 10).padding(.horizontal, 14)
            .background(Color.white.opacity(0.12), in: Capsule())
        }
        .accessibilityLabel(coordinate == nil ? "Open \(venue) in Maps" : "Driving directions to \(venue)")
    }

    @ViewBuilder private var hostDestinations: some View {
        if !invite.hostDestinations.isEmpty {
            PartyGlassCard {
                VStack(alignment: .leading, spacing: 3) {
                    // The recipient sees the verified host name — the identity
                    // the host signed in with — never a separate handle field.
                    HStack(spacing: 5) {
                        Text(invite.hostName).font(.system(size: 21, weight: .bold, design: .serif)).foregroundColor(.white)
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 14, weight: .bold)).foregroundColor(accent)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Verified host \(invite.hostName)")
                    Text("Official Host Destinations").font(.system(size: 11, weight: .black, design: .rounded)).tracking(0.8).foregroundColor(accent)
                        .accessibilityLabel("Official Host destinations")
                }
                ForEach(invite.hostDestinations) { destination in
                    Button { openURL(destination.url) } label: {
                        HStack(spacing: 11) {
                            Image(systemName: destination.kind.symbol).font(.system(size: 14, weight: .bold)).foregroundColor(accent).frame(width: 24)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(destination.kind.title.uppercased()).font(.system(size: 9, weight: .black, design: .rounded)).tracking(0.9).foregroundColor(.white.opacity(0.52))
                                Text(destination.label).font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(.white)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .black)).foregroundColor(.white.opacity(0.66))
                        }
                        .padding(.vertical, 5).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open \(destination.kind.title): \(destination.label)")
                }
            }
        }
    }

    private var program: some View {
        PartyGlassCard {
            Text("Tonight's plan").font(.system(size: 21, weight: .bold, design: .serif)).foregroundColor(.white)
            ForEach(Array(invite.itinerary.prefix(4).enumerated()), id: \.offset) { index, item in
                HStack(spacing: 11) { Text("\(index + 1)").font(.system(size: 11, weight: .black)).foregroundColor(accent).frame(width: 24, height: 24).background(accent.opacity(0.15)).clipShape(Circle()); Text(item).font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.88)).fixedSize(horizontal: false, vertical: true); Spacer(minLength: 0) }
            }
        }
    }

    private var partyAlbum: some View {
        PartyGlassCard {
            Text("From the host").font(.system(size: 21, weight: .bold, design: .serif)).foregroundColor(.white)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(invite.photoURLs.enumerated()), id: \.offset) { _, url in
                        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.white.opacity(0.08) }
                            .frame(width: 132, height: 164).clipped().clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    }
                }
            }
        }
    }

    private var guestStack: some View {
        PartyGlassCard {
            HStack { VStack(alignment: .leading, spacing: 3) { Text("THE ROOM").font(.system(size: 10, weight: .black, design: .rounded)).tracking(1).foregroundColor(accent); Text(invite.attendeeCount == 1 ? "1 guest is in" : "\(invite.attendeeCount) guests are in").font(.system(size: 17, weight: .bold, design: .serif)).foregroundColor(.white) }; Spacer(minLength: 8); PartyGuestStack(count: invite.attendeeCount, accent: accent, secondary: ClipTheme.secondaryAccent(for: invite.tier)) }
        }
    }

    private var ticketActionBar: some View {
        VStack(spacing: 8) {
            if effectiveAction == .viewPass {
                Button { Task { await loadAttendeeCredential() } } label: {
                    Label(attendeeCredential == nil ? "Show door QR" : "Refresh pass", systemImage: "qrcode")
                        .font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(ctaForeground)
                        .frame(maxWidth: .infinity).frame(height: 54).background(accent).clipShape(RoundedRectangle(cornerRadius: 17))
                }
                .disabled(isBusy || isLoadingAttendeeCredential)
                .buttonStyle(.plain)
                Text("Show this personal QR only to Door Mode at arrival.")
                    .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.62)).multilineTextAlignment(.center)
            } else {
                Button(action: primaryAction) { Label(primaryTitle, systemImage: primarySymbol).font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(primaryButtonForeground).frame(maxWidth: .infinity).frame(height: 54).background(primaryButtonColor).clipShape(RoundedRectangle(cornerRadius: 17)) }
                    .disabled(isBusy || effectiveAction == nil || effectiveAction == .unavailable).buttonStyle(.plain)
                Text(primarySubtitle).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.62)).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
            if effectiveAction == .viewPass && passState?.premiumMobilityEligible == true {
                HStack(spacing: 10) {
                    partyHandoffButton(provider: .uber, title: "Open Uber")
                    partyHandoffButton(provider: .lyft, title: "Open Lyft")
                }
                Text("Premium arrival handoff opens in your selected provider. Bytspot does not book or track this ride.")
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.54)).multilineTextAlignment(.center)
            }
            Button { openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) } label: {
                Label(arrivalPlanningTitle, systemImage: arrivalPlanningSymbol)
                    .font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.80))
                    .frame(maxWidth: .infinity).frame(height: 36)
            }.buttonStyle(.plain).accessibilityIdentifier("party-full-app-handoff")
            if !statusMessage.isEmpty {
                Text(statusMessage).font(.system(size: 11.5, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.76)).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 12).background(ClipTheme.background.opacity(0.96))
    }

    private var accessMetricValue: String {
        PartyPassPresentationRules.accessMetric(for: passState, isResolving: isResolving)
    }
    private var arrivalPlanningTitle: String {
        guard let partyBookingContext else { return "Continue in app to plan arrival" }
        switch partyBookingContext.logisticsMode {
        case .inboundToUser: return "\(partyBookingContext.eyebrow) · plan host arrival"
        case .outboundToVenue: return "\(partyBookingContext.eyebrow) · plan venue arrival"
        }
    }
    private var arrivalPlanningSymbol: String {
        guard let partyBookingContext else { return "arrow.down.app.fill" }
        switch partyBookingContext.logisticsMode {
        case .inboundToUser: return "house.fill"
        case .outboundToVenue: return "location.north.line.fill"
        }
    }
    @MainActor
    private func resolvePass() async {
        guard scenePhase == .active else { return }
        let generation = UUID()
        passResolverGeneration = generation
        isResolving = true
        defer {
            if passResolverGeneration == generation { isResolving = false }
        }
        #if DEBUG
        if let previewState = ClipPartyPassPreview.state(for: invocation.invocationURL, partyID: invite.id) {
            guard Self.canCommitPassResolution(
                resolverGeneration: generation,
                currentResolverGeneration: passResolverGeneration,
                scenePhase: scenePhase
            ) else { return }
            passState = previewState
            if previewState.action != .viewPass || !previewState.accessGranted {
                clearAttendeeCredential()
            }
            statusMessage = ""
            await loadAttendeeCredentialIfPassIsViewable()
            return
        }
        #endif
        do {
            let resolved = try await ClipPatchVerifier().resolvePartyPass(partyID: invite.id)
            guard Self.canCommitPassResolution(
                resolverGeneration: generation,
                currentResolverGeneration: passResolverGeneration,
                scenePhase: scenePhase
            ) else { return }
            passState = resolved
            if resolved.action != .viewPass || !resolved.accessGranted {
                clearAttendeeCredential()
            }
            statusMessage = ""
            await loadAttendeeCredentialIfPassIsViewable()
        } catch {
            guard Self.canCommitPassResolution(
                resolverGeneration: generation,
                currentResolverGeneration: passResolverGeneration,
                scenePhase: scenePhase
            ) else { return }
            passState = nil
            clearAttendeeCredential()
            statusMessage = "We couldn’t verify ticket availability right now. Please try again."
        }
    }
    @MainActor
    private func invalidatePassResolution() {
        passResolverGeneration = UUID()
        passState = nil
        isResolving = false
        statusMessage = ""
        clearAttendeeCredential()
    }
    @MainActor
    private func clearAttendeeCredential() {
        attendeeCredentialGeneration = UUID()
        attendeeCredential = nil
        attendeeCredentialMessage = ""
        isLoadingAttendeeCredential = false
    }
    /// The door QR is the whole point of a paid pass, so it is fetched as soon
    /// as the pass turns viewable rather than waiting for a tap. Resolution runs
    /// on every foreground and after checkout, so this stays idempotent: it is a
    /// no-op once a credential is in memory, and the button remains for refresh.
    @MainActor private func loadAttendeeCredentialIfPassIsViewable() async {
        guard Self.shouldAutoLoadAttendeeCredential(
            scenePhase: scenePhase,
            passState: passState,
            hasCredential: attendeeCredential != nil
        ) else { return }
        await loadAttendeeCredential()
    }

    static func shouldAutoLoadAttendeeCredential(
        scenePhase: ScenePhase,
        passState: ClipPartyPassState?,
        hasCredential: Bool
    ) -> Bool {
        !hasCredential && canRequestAttendeeCredential(scenePhase: scenePhase, passState: passState)
    }

    // Gated on `isPerformingAction` rather than `isBusy` on purpose. `isBusy`
    // includes `isResolving`, and the automatic fetch runs from inside pass
    // resolution, so an `isBusy` guard would reject every automatic attempt
    // while it is the resolver's own work in flight. A user-initiated action
    // still blocks it, and the button keeps the wider `isBusy` guard.
    @MainActor private func loadAttendeeCredential() async {
        guard !isPerformingAction, !isLoadingAttendeeCredential,
              Self.canRequestAttendeeCredential(scenePhase: scenePhase, passState: passState) else { return }
        let requestGeneration = UUID()
        attendeeCredentialGeneration = requestGeneration
        isLoadingAttendeeCredential = true
        attendeeCredentialMessage = ""
        defer {
            if attendeeCredentialGeneration == requestGeneration {
                isLoadingAttendeeCredential = false
            }
        }
        do {
            let credential = try await ClipPatchVerifier().partyAttendeeCredential(partyID: invite.id)
            guard Self.canCommitAttendeeCredential(
                requestGeneration: requestGeneration,
                currentGeneration: attendeeCredentialGeneration,
                scenePhase: scenePhase,
                passState: passState,
                credential: credential,
                expectedPartyID: invite.id
            ) else { return }
            attendeeCredential = credential
        } catch {
            guard attendeeCredentialGeneration == requestGeneration else { return }
            attendeeCredential = nil
            attendeeCredentialMessage = "Your door pass could not be refreshed. Please try again."
        }
    }
    static func canRequestAttendeeCredential(scenePhase: ScenePhase, passState: ClipPartyPassState?) -> Bool {
        scenePhase == .active && passState?.action == .viewPass && passState?.accessGranted == true
    }

    static func passResolutionKey(inviteID: String, scenePhase: ScenePhase) -> [String] {
        [inviteID, String(scenePhase == .active)]
    }

    static func canCommitPassResolution(
        resolverGeneration: UUID,
        currentResolverGeneration: UUID,
        scenePhase: ScenePhase
    ) -> Bool {
        resolverGeneration == currentResolverGeneration && scenePhase == .active
    }

    static func canCommitAttendeeCredential(
        requestGeneration: UUID,
        currentGeneration: UUID,
        scenePhase: ScenePhase,
        passState: ClipPartyPassState?,
        credential: ClipPatchVerifier.PartyAttendeeCredential,
        expectedPartyID: String
    ) -> Bool {
        requestGeneration == currentGeneration &&
            canRequestAttendeeCredential(scenePhase: scenePhase, passState: passState) &&
            credential.partyID == expectedPartyID
    }

    @MainActor
    private func primaryAction() { guard !isBusy, let action = effectiveAction else { return }; switch action { case .authenticate: Task { await authenticate() }; case .ticket: guard PartyPassPresentationRules.canStartTicketSelection(for: passState, tiers: invite.ticketTiers) else { statusMessage = "Ticket tiers are unavailable right now. Continue in the app to check availability."; return }; showTicketTiers = true; case .rsvp, .requestApproval: Task { await rsvp() }; case .viewPass, .unavailable: break } }
    @MainActor
    private func authenticate() async {
        guard !isBusy else { return }
        isPerformingAction = true
        statusMessage = "Signing in securely…"
        defer { isPerformingAction = false }
        do {
            let credential = try await authController.requestAppleCredential()
            _ = try await ClipPatchVerifier().appleSignIn(identityToken: credential.identityToken, email: credential.email, name: credential.fullName)
            viewerName = ClipAuthStore.displayName
        } catch {
            statusMessage = PartyPassPresentationRules.signInFailureMessage(from: error)
            return
        }
        // Pass lookup is a separate server call. A ticket/pass miss must not
        // look like Apple Sign-In failed.
        await resolvePass()
    }
    @MainActor
    private func rsvp() async {
        guard !isBusy else { return }
        isPerformingAction = true
        statusMessage = "Sending your request…"
        defer { isPerformingAction = false }
        #if DEBUG
        if let confirmedPreview = ClipPartyPassPreview.confirmedRSVP(for: invocation.invocationURL, partyID: invite.id) {
            passState = confirmedPreview
            statusMessage = "RSVP confirmed in preview."
            return
        }
        #endif
        do {
            _ = try await ClipPatchVerifier().createPartyRSVP(partyID: invite.id, idempotencyKey: UUID().uuidString)
            await resolvePass()
        } catch {
            statusMessage = "Your request could not be sent. Please try again."
        }
    }
    private func partyHandoffButton(provider: ClipPartyHandoffProvider, title: String) -> some View {
        Button { Task { await openPartyArrivalHandoff(provider) } } label: {
            Label(title, systemImage: "arrow.up.forward.app.fill").font(.system(size: 12, weight: .black, design: .rounded))
                .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 40)
                .background(Color.white.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 13))
        }.buttonStyle(.plain).disabled(isBusy || passState?.premiumMobilityEligible != true)
    }
    @MainActor private func openPartyArrivalHandoff(_ provider: ClipPartyHandoffProvider) async {
        guard !isBusy, effectiveAction == .viewPass, passState?.premiumMobilityEligible == true else { return }
        isPerformingAction = true
        statusMessage = "Preparing secure provider handoff…"
        defer { isPerformingAction = false }
        do {
            let handoffURL = try await ClipPatchVerifier().createPartyArrivalHandoff(partyID: invite.id, provider: provider)
            statusMessage = "Opening \(provider.rawValue.capitalized)…"
            openURL(handoffURL)
        } catch {
            statusMessage = "Premium arrival handoff is unavailable for this Party."
        }
    }
    private func createCheckout(for tier: ClipPartyTicketTier) {
        let idempotencyKey = UUID().uuidString
        invocation.selectPartyTicketTier(tier, partyID: invite.id)
        Task { await startPartyTicketCheckout(tier: tier, idempotencyKey: idempotencyKey) }
    }
    @MainActor private func startPartyTicketCheckout(tier: ClipPartyTicketTier, idempotencyKey: String) async {
        guard !isBusy, passState?.action == .ticket else { return }
        isPerformingAction = true
        statusMessage = "Starting secure checkout…"
        defer { isPerformingAction = false }
        do {
            let checkoutURL = try await ClipPatchVerifier().createPartyTicketCheckout(partyID: invite.id, ticketTierName: tier.name, idempotencyKey: idempotencyKey)
            guard let validatedCheckoutURL = ClipPatchVerifier.normalizedStripeCheckoutURL(checkoutURL.absoluteString) else {
                statusMessage = "Checkout could not be verified. Please try again."
                return
            }
            statusMessage = "Opening secure checkout…"
            let presented = ClipCheckoutBrowser.present(validatedCheckoutURL) {
                Task { await confirmTicketPurchase() }
            }
            if !presented { openURL(validatedCheckoutURL) }
        } catch {
            statusMessage = "Checkout could not be started. Please try again."
        }
    }

    /// Stripe confirms by webhook, so the pass is not granted the instant the
    /// sheet closes. Poll the server rather than trusting the client's return:
    /// the pass must only appear once `accessGranted` is true server-side.
    @MainActor private func confirmTicketPurchase() async {
        statusMessage = "Confirming payment…"
        for attempt in 0..<8 {
            if attempt > 0 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
            await resolvePass()
            if effectiveAction == .viewPass { return }
        }
        if effectiveAction != .viewPass {
            statusMessage = "Payment is still confirming. Reopen this pass in a moment."
        }
    }
}

/// Presents Stripe Checkout inside the Clip.
///
/// `openURL` hands the session to Safari, which backgrounds the Clip; App Clips
/// are terminated aggressively, and Stripe's `success_url` lands on the web
/// page, from which no link can return to the Clip. Keeping checkout in an
/// `SFSafariViewController` means the Clip is still alive to re-resolve the
/// pass when the sheet closes.
@MainActor
enum ClipCheckoutBrowser {
    private final class Delegate: NSObject, SFSafariViewControllerDelegate {
        private let onFinish: () -> Void
        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onFinish() }
    }

    private static var retainedDelegate: Delegate?

    static func topPresenter() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first,
              let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return nil }
        var top = root
        while let presented = top.presentedViewController, !presented.isBeingDismissed { top = presented }
        return top
    }

    @discardableResult
    static func present(_ url: URL, onFinish: @escaping () -> Void) -> Bool {
        guard let presenter = topPresenter() else { return false }
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .done
        let delegate = Delegate(onFinish: onFinish)
        retainedDelegate = delegate
        controller.delegate = delegate
        presenter.present(controller, animated: true)
        return true
    }
}

/// Clip-local renderer for an opaque attendee bearer credential. The raw value
/// is encoded into pixels only; it is intentionally never rendered as text.
struct ClipPersonalAttendeeQR: View {
    let value: String

    var body: some View {
        Image(uiImage: Self.image(value))
            .interpolation(.none)
            .resizable()
            .scaledToFit()
            .padding(10)
            .background(.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Personal attendee QR code")
            .accessibilityHint("Show this code to the host's Door Mode scanner. Do not share it.")
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

private enum PartyGlassCardVariant {
    case standard
    case access(accent: Color)
    case selected(accent: Color)

    var accent: Color? { switch self { case .standard: return nil; case .access(let accent), .selected(let accent): return accent } }
    var opacity: Double { switch self { case .standard: return 0.72; case .access: return 0.64; case .selected: return 0.58 } }
    var lineWidth: CGFloat { if case .selected = self { return 1.5 }; return 1 }
}

private struct PartyAccessStatus {
    let eyebrow: String
    let title: String
    let detail: String
    let symbol: String
    let variant: PartyGlassCardVariant
    var accent: Color { variant.accent ?? .white.opacity(0.72) }
    init(_ eyebrow: String, _ title: String, _ detail: String, _ symbol: String, _ variant: PartyGlassCardVariant) { self.eyebrow = eyebrow; self.title = title; self.detail = detail; self.symbol = symbol; self.variant = variant }
}

struct PartyPassUnresolvedAccess: Equatable {
    let eyebrow: String
    let title: String
    let detail: String
    let symbol: String
}

enum PartyPassPresentationRules {
    /// `view-pass` never means access on its own: only an explicit true server
    /// authorization is allowed to reach confirmed-pass presentation or CTAs.
    static func effectiveAction(for passState: ClipPartyPassState?) -> ClipPartyPassAction? {
        guard let passState else { return nil }
        return passState.action == .viewPass && !passState.accessGranted ? .unavailable : passState.action
    }

    static func unresolvedAccess(isResolving: Bool) -> PartyPassUnresolvedAccess {
        isResolving
            ? PartyPassUnresolvedAccess(eyebrow: "VERIFYING INVITATION", title: "Checking your Party access", detail: "We are confirming the host's access rules before showing an available action.", symbol: "hourglass")
            : PartyPassUnresolvedAccess(eyebrow: "ACCESS UNVERIFIED", title: "Party Pass unavailable", detail: "We could not verify an authorized Party action. Please try again or continue in the app.", symbol: "exclamationmark.triangle.fill")
    }

    static func accessMetric(for passState: ClipPartyPassState?, isResolving: Bool) -> String {
        guard let passState, let action = effectiveAction(for: passState) else { return isResolving ? "VERIFYING" : "UNVERIFIED" }
        switch action {
        case .authenticate: return "SIGN IN"
        case .ticket: return "TICKETS"
        case .rsvp: return "RSVP"
        case .requestApproval: return "REVIEW"
        case .viewPass: return "CONFIRMED"
        case .unavailable: return passState.guestStatus.lowercased() == "pending" ? "PENDING" : "UNAVAILABLE"
        }
    }

    static func canStartTicketSelection(for passState: ClipPartyPassState?, tiers: [ClipPartyTicketTier]) -> Bool {
        passState?.action == .ticket && !tiers.isEmpty
    }

    /// Apple / auth.appleSignIn failures only. Pass resolve has its own copy.
    static func signInFailureMessage(from error: Error) -> String {
        if let authError = error as? ClipGuestAuthController.AuthError {
            return authError.errorDescription ?? "Sign in could not be completed. Please try again."
        }
        switch error {
        case ClipPatchVerifier.VerifyError.server(let message):
            return message.isEmpty ? "Sign in could not be completed. Please try again." : message
        case ClipPatchVerifier.VerifyError.network:
            return "Sign in could not be completed. Please try again."
        default:
            return "Sign in could not be completed. Please try again."
        }
    }
}

/// A presentation-only tier treatment. The server remains the sole authority
/// for RSVP, ticket, approval, and arrival privileges.
struct PartyInvitationTierPresentation: Equatable {
    let headerLabel: String
    let heroBadge: String
    let eyebrow: String
    let detail: String
    let symbol: String

    init(for tier: BytspotTier) {
        switch tier {
        case .green:
            headerLabel = "GREEN PARTY INVITATION"
            heroBadge = "GREEN REQUIRED"
            eyebrow = "REQUIRED TIER"
            detail = "Green membership or higher is required. Bytspot checks eligibility before each Party action."
            symbol = "seal.fill"
        case .platinum:
            headerLabel = "PLATINUM PARTY INVITATION"
            heroBadge = "PLATINUM REQUIRED"
            eyebrow = "REQUIRED TIER"
            detail = "Platinum or Black membership is required. Bytspot checks eligibility before each Party action."
            symbol = "sparkles"
        case .black:
            headerLabel = "BLACK PARTY INVITATION"
            heroBadge = "BLACK REQUIRED"
            eyebrow = "REQUIRED TIER"
            detail = "Black membership is required. Bytspot checks eligibility before each Party action."
            symbol = "crown.fill"
        }
    }
}

private struct PartyGlassCard<Content: View>: View {
    let variant: PartyGlassCardVariant
    let content: Content
    init(variant: PartyGlassCardVariant = .standard, @ViewBuilder content: () -> Content) { self.variant = variant; self.content = content() }
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        let border = variant.accent?.opacity(0.42) ?? Color.white.opacity(0.14)
        VStack(alignment: .leading, spacing: 14) { content }.frame(maxWidth: .infinity, alignment: .leading).padding(18)
            .background(shape.fill(ClipTheme.panel.opacity(variant.opacity))).background(.ultraThinMaterial, in: shape)
            .overlay(shape.stroke(border, lineWidth: variant.lineWidth))
            .shadow(color: (variant.accent ?? .black).opacity(0.16), radius: 16, y: 8)
    }
}
private struct PartyMetric: View { let value: String; let label: String; var body: some View { VStack(alignment: .leading, spacing: 4) { Text(label).font(.system(size: 8, weight: .black)).tracking(0.8).foregroundColor(.white.opacity(0.48)); Text(value).font(.system(size: 11, weight: .bold, design: .rounded)).foregroundColor(.white).lineLimit(2).minimumScaleFactor(0.76) }.frame(maxWidth: .infinity, alignment: .leading) } }
private struct PartyDetailRow: View { let icon: String; let label: String; let value: String; var body: some View { HStack(alignment: .top, spacing: 12) { Image(systemName: icon).foregroundColor(ClipTheme.cyan).frame(width: 22); VStack(alignment: .leading, spacing: 3) { Text(label).font(.system(size: 9, weight: .black)).tracking(0.8).foregroundColor(.white.opacity(0.48)); Text(value).font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.88)).fixedSize(horizontal: false, vertical: true) }.frame(maxWidth: .infinity, alignment: .leading) } } }
private struct PartyGuestStack: View { let count: Int; let accent: Color; let secondary: Color; var body: some View { HStack(spacing: -11) { ForEach(0..<min(max(count, 1), 4), id: \.self) { index in Circle().fill(index.isMultiple(of: 2) ? accent : secondary).frame(width: 38, height: 38).overlay(Circle().stroke(ClipTheme.panel, lineWidth: 2)).overlay(Text("•").font(.system(size: 22, weight: .black)).foregroundColor(.white.opacity(0.75))) }; if count > 4 { Text("+\(count - 4)").font(.system(size: 10, weight: .black)).foregroundColor(.white).frame(width: 38, height: 38).background(ClipTheme.panelElevated).clipShape(Circle()) } } } }
private struct PartyGlassIconButton: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.foregroundColor(.white).frame(width: 44, height: 44).background(Color.white.opacity(configuration.isPressed ? 0.20 : 0.12)).clipShape(Circle()) } }

// MARK: - Shared helpers

private func impactLight() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
private func impactMedium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }

private func openFullApp(url: URL?, showOverlay: Binding<Bool>) {
    guard let url else {
        showOverlay.wrappedValue = true
        return
    }
    UIApplication.shared.open(url, options: [.universalLinksOnly: true]) { opened in
        if !opened {
            DispatchQueue.main.async { showOverlay.wrappedValue = true }
        }
    }
}

enum ClipLogisticsMode: Equatable { case inboundToUser, outboundToVenue }

struct ClipBookingContext: Equatable {
    let isHighTicket: Bool
    let logisticsMode: ClipLogisticsMode
    let holdMinutes: Int
    let eyebrow: String
    let title: String
    let cta: String
    let authorizationNote: String
    let requiresSpecialRequests: Bool
    let requiresPhoneNumber: Bool

    static func make(partyTicket: ClipPartyTicketTier, partyTier: BytspotTier) -> ClipBookingContext {
        let selectedTier = BytspotTier(rawValue: partyTicket.requiredMembershipTier) ?? partyTier
        return make(categoryText: "party ticket", amountCents: partyTicket.priceCents, tier: selectedTier)
    }

    static func make(categoryText: String, amountCents: Int, tier: BytspotTier) -> ClipBookingContext {
        let category = categoryText.lowercased()
        let inbound = ["chef", "dining", "wellness", "concierge"].contains { category.contains($0) }
        let aviationOrMarine = ["aviation", "jet", "charter", "marine", "yacht", "vessel"].contains { category.contains($0) }
        let highTicket = tier == .black && (aviationOrMarine || amountCents >= 85_000)
        return ClipBookingContext(
            isHighTicket: highTicket,
            logisticsMode: inbound ? .inboundToUser : .outboundToVenue,
            holdMinutes: highTicket ? 45 : 0,
            eyebrow: highTicket ? "SECURE HOLD" : "INSTANT BOOKING",
            title: highTicket ? "Place a secure hold" : "Book now",
            cta: highTicket ? "Place Secure Hold" : "Book & Charge Now",
            authorizationNote: highTicket ? "Funds are securely authorized. You will only be charged once the vendor confirms." : "Instant Apple Pay booking. Your confirmation is saved in Bytspot.",
            requiresSpecialRequests: highTicket,
            requiresPhoneNumber: highTicket
        )
    }
}

#if false // Legacy Group surface retained for extraction into its future project; not compiled into this Party App Clip.
struct ClipInviteView: View {
    enum JoinState: Equatable { case idle, joining, joined, pending, declined, failed(String) }

    let invite: ClipGroupEventInvite
    @Binding var showOverlay: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var membership: JoinState = .idle
    @State private var statusMessage = ""
    @State private var showShareSheet = false
    @State private var authController = ClipGuestAuthController()
    @State private var liveGuests: [ClipGroupEventGuest] = []
    @State private var liveGuestCount = 0
    @State private var partyHasArrived = false
    @State private var partyPass: ClipPartyPassState?
    @State private var isResolvingPartyPass = false
    @State private var showTicketTiers = false
    @State private var resolverGeneration = 0
    @ScaledMetric(relativeTo: .largeTitle) private var titleFontSize: CGFloat = 31
    @ScaledMetric(relativeTo: .title2) private var sectionTitleFontSize: CGFloat = 28
    @ScaledMetric(relativeTo: .headline) private var bodyFontSize: CGFloat = 16
    @ScaledMetric(relativeTo: .caption) private var chipFontSize: CGFloat = 11
    @ScaledMetric(relativeTo: .body) private var topControlSize: CGFloat = 50
    @ScaledMetric(relativeTo: .body) private var guestAvatarSize: CGFloat = 56
    @ScaledMetric(relativeTo: .body) private var hostAvatarSize: CGFloat = 62
    @ScaledMetric(relativeTo: .body) private var ctaHeight: CGFloat = 54

    private var accent: Color { ClipTheme.accent(for: invite.tier) }
    private var secondary: Color { ClipTheme.secondaryAccent(for: invite.tier) }
    private var inviteURL: URL? { invite.isHostStudioParty ? invite.partyPassURL : invite.handoffURL }
    private var ink: Color { Color.white }
    private var mutedInk: Color { Color.white.opacity(0.60) }
    private var avatarCount: Int { min(max(invite.participantCount, 0), 5) }
    private var overflowCount: Int { max(invite.participantCount - avatarCount, 0) }
    private var hasLiveGuests: Bool { !liveGuests.isEmpty }
    private var shownGuests: [ClipGroupEventGuest] { Array(liveGuests.prefix(5)) }
    private var liveOverflowCount: Int { max(liveGuestCount - shownGuests.count, 0) }
    private var guestListSubtitle: String {
        hasLiveGuests
            ? (liveGuestCount == 1 ? "1 guest" : "\(liveGuestCount) guests")
            : invite.guestSummary
    }
    private var privacyLabel: String { invite.privacyStatus == "publicDiscovery" ? "Public" : "Private Invite" }
    private var locationLabel: String { invite.locationDisclosure == "after-approval" ? "LOCATION AFTER APPROVAL" : "WHERE" }

    var body: some View {
        ZStack {
            eventBackdrop
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    topControls
                    if invite.isHostStudioParty {
                        partyHero
                        partyCredential
                        partyEssentials
                        partyPlan
                        guestList
                        // Pre-party Host Studio albums are gone. This only
                        // renders if invite.photoURLs still has legacy media.
                        if !invite.photoURLs.isEmpty { photoAlbum }
                    } else {
                        eventHeader
                        eventDetails
                        rsvpPanel
                        guestList
                        photoAlbum
                        activityFeed
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
        }
        .safeAreaInset(edge: .bottom) { primaryActions }
        .sheet(isPresented: $showShareSheet) { ClipShareSheet(items: shareInviteItems) }
        .sheet(isPresented: $showTicketTiers) {
            ClipPartyTicketTierPicker(tiers: invite.ticketTiers, partyTitle: invite.title) { tier in
                showTicketTiers = false
                startPartyTicketCheckout(tier)
            }
        }
        .accessibilityIdentifier(invite.isHostStudioParty ? "clip-party-pass" : "clip-group-event-join")
        .task(id: invite.id) {
            partyHasArrived = false
            await loadGuests()
            guard invite.isHostStudioParty else { return }
            await refreshPartyPass()
            withAnimation(.spring(response: 0.62, dampingFraction: 0.82).delay(0.08)) { partyHasArrived = true }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, invite.isHostStudioParty else { return }
            Task { await refreshPartyPass() }
        }
    }

    private var eventBackdrop: some View {
        GeometryReader { proxy in
            ZStack {
                ClipTheme.background
                if invite.hasPlayableVideo {
                    ClipAutoLoopingPlayer(videoURL: invite.videoURL, posterURL: invite.displayPosterURL, tint: accent)
                        .opacity(0.26)
                } else if let url = invite.displayPosterURL {
                    // Filling a tall phone with a 3:2 poster scales it to the
                    // screen's height and shows roughly the middle third of its
                    // width — the poster reads as an enlarged fragment rather
                    // than as the poster. Fit it instead: the whole poster is
                    // legible, and the gradients above already carry the frame.
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                            .frame(width: proxy.size.width, height: proxy.size.height)
                    } placeholder: { Color.clear }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .blur(radius: 18)
                    .opacity(0.22)
                }
                RadialGradient(colors: [accent.opacity(0.32), .clear], center: .topLeading, startRadius: 12, endRadius: 420)
                RadialGradient(colors: [secondary.opacity(0.26), .clear], center: .bottomTrailing, startRadius: 20, endRadius: 460)
                LinearGradient(colors: [Color.black.opacity(0.55), Color.black.opacity(0.18), Color.black.opacity(0.72)], startPoint: .top, endPoint: .bottom)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .ignoresSafeArea()
    }

    private var topControls: some View {
        HStack(spacing: 12) {
            if !invite.isHostStudioParty {
                glassIconButton(systemName: "chevron.left", label: "Open full event") { openFullApp(url: invite.handoffURL, showOverlay: $showOverlay) }
                Spacer()
            }
            if invite.isHostStudioParty {
                HStack(spacing: 7) {
                    Circle()
                        .fill(LinearGradient(colors: [ClipTheme.cyan, ClipTheme.magenta, ClipTheme.orange], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 9, height: 9)
                    Text("BYTSPOT / PARTY")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                }
                .foregroundColor(ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .background(glassCapsule(tint: ClipTheme.magenta.opacity(0.10)))
            } else {
                Text("Bytspot")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .foregroundStyle(LinearGradient(colors: [ClipTheme.cyan, ClipTheme.violet, ClipTheme.pink], startPoint: .leading, endPoint: .trailing))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(glassCapsule())
            }
            Spacer()
            glassIconButton(systemName: "arrowshape.turn.up.right.fill", label: invite.isHostStudioParty ? "Share App Clip Party Pass" : "Share invite", action: shareInvite)
            glassIconButton(systemName: "ellipsis", label: "More") { openFullApp(url: invite.handoffURL, showOverlay: $showOverlay) }
        }
    }

    private var partyHero: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 32, style: .continuous).fill(ClipTheme.panelElevated)
            if let poster = invite.displayPosterURL {
                // Same contained-fill as PartyPassClipView: a raw fill image
                // reports the bitmap it scaled to and widens the invite column.
                ClipContainedFillImage(url: poster, contentMode: .fill)
            } else {
                LinearGradient(colors: [ClipTheme.cyan.opacity(0.82), ClipTheme.magenta.opacity(0.58), ClipTheme.orange.opacity(0.38), ClipTheme.panelElevated], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
            LinearGradient(colors: [.clear, Color.black.opacity(0.12), Color.black.opacity(0.94)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    Label(partyTemplateEyebrow, systemImage: "sparkles")
                        .font(.system(size: chipFontSize, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.black.opacity(0.28)))
                    Spacer()
                    Image(systemName: invite.privacyStatus == "publicDiscovery" ? "globe" : "lock.fill")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.white)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(.ultraThinMaterial))
                        .accessibilityLabel(privacyLabel)
                }
                Spacer(minLength: 14)
                Text(invite.title)
                    .font(.system(size: titleFontSize + 3, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                Text(invite.inviteNote ?? invite.theme)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.white.opacity(0.76))
                    .lineLimit(2)
                HStack(spacing: 7) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundColor(ClipTheme.emerald)
                        .accessibilityHidden(true)
                    Text("CURATED BY \(invite.hostName.uppercased())")
                }
                .font(.system(size: 10, weight: .black, design: .rounded))
                .foregroundColor(.white.opacity(0.78))
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity).frame(height: 316).clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(LinearGradient(colors: [.white.opacity(0.45), .white.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing)))
        .shadow(color: ClipTheme.magenta.opacity(0.20), radius: 28, x: 0, y: 16)
        .scaleEffect(partyHasArrived ? 1 : 0.965)
        .opacity(partyHasArrived ? 1 : 0)
    }

    private var partyCredential: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    sectionMiniTitle("Access status")
                    Text("Your Party access").font(.system(size: 22, weight: .black, design: .rounded)).foregroundColor(ink)
                }
                Spacer()
                Image(systemName: "ticket.fill")
                    .font(.system(size: 21, weight: .black))
                    .foregroundColor(.white)
                    .frame(width: 46, height: 46)
                    .background(LinearGradient(colors: [ClipTheme.cyan, ClipTheme.magenta, ClipTheme.orange], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .accessibilityHidden(true)
            }
            Text("Bytspot verifies access before it creates or updates your Party Pass.")
                .font(.system(size: 12.5, weight: .bold, design: .rounded))
                .foregroundColor(mutedInk)
            Rectangle().fill(Color.white.opacity(0.13)).frame(height: 1)
            HStack(spacing: 10) {
                partyCredentialMetric(accessModeLabel(invite.accessMode ?? "free-rsvp"), "ACCESS")
                partyCredentialMetric(invite.capacity.map { "\($0) max" } ?? "Open", "CAPACITY")
                partyCredentialMetric(invite.tier.displayName, "MEMBERSHIP")
            }
        }.padding(18).background(glassPanel(cornerRadius: 26, tint: ClipTheme.magenta.opacity(0.09)))
    }

    private func partyCredentialMetric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 8, weight: .black, design: .rounded)).tracking(0.8).foregroundColor(mutedInk)
            Text(value).font(.system(size: 11.5, weight: .black, design: .rounded)).foregroundColor(ink).lineLimit(1).minimumScaleFactor(0.75)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var partyEssentials: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("At a glance").font(.system(size: 22, weight: .black, design: .rounded)).foregroundColor(ink)
                Spacer()
                Text("PRIVATE DETAILS")
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .foregroundColor(mutedInk)
            }
            partyEssentialRow("calendar.badge.clock", "WHEN", invite.scheduledDate)
            partyEssentialRow("mappin.and.ellipse", locationLabel, invite.locationLabel)
            partyEssentialRow("person.2.fill", "INVITED THROUGH", invite.audienceCircle)
        }
    }

    private func partyEssentialRow(_ icon: String, _ eyebrow: String, _ value: String) -> some View {
        HStack(spacing: 13) {
            Image(systemName: icon).font(.system(size: 15, weight: .black)).foregroundColor(accent).frame(width: 36, height: 36).background(glassCircle(tint: accent.opacity(0.12)))
            detailRow(eyebrow: eyebrow, title: value)
        }.padding(13).background(glassPanel(cornerRadius: 18, tint: .white.opacity(0.03)))
    }

    @ViewBuilder private var partyPlan: some View {
        let moment = partyTemplateMoment
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: moment.symbol)
                    .font(.system(size: 17, weight: .black))
                    .foregroundColor(.white)
                    .frame(width: 42, height: 42)
                    .background(LinearGradient(colors: [ClipTheme.cyan, ClipTheme.magenta, ClipTheme.orange], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    sectionMiniTitle(moment.eyebrow)
                    Text(moment.title).font(.system(size: 19, weight: .black, design: .rounded)).foregroundColor(ink)
                    Text(moment.detail).font(.system(size: 12.5, weight: .bold, design: .rounded)).foregroundColor(mutedInk).fixedSize(horizontal: false, vertical: true)
                }
            }

            if !invite.activityHighlights.isEmpty {
                Rectangle().fill(Color.white.opacity(0.13)).frame(height: 1)
                VStack(alignment: .leading, spacing: 11) {
                    Text(partyProgramTitle).font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(ink)
                    ForEach(Array(invite.activityHighlights.prefix(5).enumerated()), id: \.offset) { index, item in
                        HStack(spacing: 12) {
                            Text("\(index + 1)").font(.system(size: 10, weight: .black)).foregroundColor(.black).frame(width: 25, height: 25).background(accent).clipShape(Circle())
                            Text(item).font(.system(size: 14, weight: .black, design: .rounded)).foregroundColor(ink.opacity(0.84))
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(glassPanel(cornerRadius: 22, tint: secondary.opacity(0.07)))
    }

    private var partyTemplateEyebrow: String {
        switch invite.partyTemplate {
        case .listeningParty: return "LISTENING SESSION"
        case .comedyNight: return "COMEDY NIGHT"
        case .premiere: return "PREMIERE"
        case .privateParty: return "PRIVATE PARTY"
        case .fanMeetup: return "FAN MEETUP"
        case .releaseParty: return "RELEASE PARTY"
        case .popUp: return "POP-UP"
        case nil: return "PARTY PASS"
        }
    }

    private var partyProgramTitle: String {
        switch invite.partyTemplate {
        case .listeningParty, .releaseParty: return "The set"
        case .comedyNight: return "Show order"
        case .premiere: return "Screening sequence"
        case .fanMeetup: return "Meetup flow"
        case .privateParty: return "The evening"
        case .popUp: return "The drop"
        case nil: return "The plan"
        }
    }

    private var partyTemplateMoment: (eyebrow: String, title: String, detail: String, symbol: String) {
        guard let config = invite.partyTemplateConfig else {
            return ("PARTY FORMAT", invite.groupType, "The host will reveal the full format through this Party Pass.", "sparkles")
        }
        switch config {
        case .listeningParty(let format):
            return ("LISTENING FORMAT", displayTemplateValue(format), "A curated first listen with \(invite.hostName).", "headphones")
        case .fanMeetup(let format):
            return ("MEETUP FORMAT", displayTemplateValue(format), "A real-world moment for the community around \(invite.hostName).", "person.3.fill")
        case .releaseParty(let type, let title):
            return ("RELEASE MOMENT", "\(displayTemplateValue(type)) · \(title)", "The first room for this release, curated by \(invite.hostName).", "music.note.list")
        case .popUp(let disclosure):
            let detail = disclosure == "after-approval" ? "The location remains protected until approval." : "Location and timing are live in this Party Pass."
            return ("LOCATION DROP", disclosure == "after-approval" ? "Protected reveal" : "Live reveal", detail, "mappin.and.ellipse")
        case .privateParty(let policy):
            return ("GUEST POLICY", displayTemplateValue(policy), "A deliberately private room hosted by \(invite.hostName).", "lock.fill")
        case .standard:
            switch invite.partyTemplate {
            case .comedyNight: return ("LIVE FORMAT", "Comedy night", "A room built for the set, the headliner, and the afterglow.", "theatermasks.fill")
            case .premiere: return ("FIRST SCREENING", "Premiere moment", "Arrive for the first watch and stay for the conversation.", "film.fill")
            default: return ("PARTY FORMAT", invite.groupType, "The host will reveal the full format through this Party Pass.", "sparkles")
            }
        }
    }

    private func displayTemplateValue(_ value: String) -> String {
        value.replacingOccurrences(of: "-", with: " ").capitalized
    }

    private var eventHeader: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(LinearGradient(colors: [accent.opacity(0.76), secondary.opacity(0.46), ClipTheme.panelElevated.opacity(0.92)], startPoint: .topLeading, endPoint: .bottomTrailing))
            Image(systemName: "person.3.sequence.fill").font(.system(size: 94, weight: .black)).foregroundColor(Color.black.opacity(0.18)).offset(x: 178, y: -20)
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 7) {
                    glassChip(invite.isHostStudioParty ? "PARTY PASS" : "APP CLIP", icon: "bolt.fill")
                    glassChip(privacyLabel, icon: invite.privacyStatus == "publicDiscovery" ? "globe" : "lock.fill")
                }
                Text(invite.title).font(.system(size: titleFontSize, weight: .black, design: .rounded)).foregroundColor(ink).lineLimit(2)
                Text("\(invite.groupType) · \(invite.audienceCircle)").font(.system(size: bodyFontSize, weight: .heavy, design: .rounded)).foregroundColor(ink.opacity(0.80))
                Text(invite.inviteNote ?? eventBlurb).font(.system(size: 14, weight: .bold, design: .rounded)).foregroundColor(ink.opacity(0.72)).lineLimit(2)
            }.padding(18)
        }
        .frame(height: 258)
        .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(Color.white.opacity(0.24), lineWidth: 1))
        .padding(.top, 8)
    }

    private var eventDetails: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Essentials")
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(ink)

            VStack(alignment: .leading, spacing: 12) {
                detailCard(eyebrow: "Date & time", title: invite.scheduledDate, icon: "calendar.badge.clock")
                detailCard(eyebrow: "Hosted by", title: invite.hostName, icon: "person.crop.circle.badge.checkmark")
                detailCard(eyebrow: invite.locationDisclosure == "after-approval" ? "Location after approval" : invite.isHostStudioParty || invite.privacyStatus == "publicDiscovery" ? "Location" : "Location after join", title: invite.locationLabel, icon: "mappin.and.ellipse")
                detailCard(eyebrow: "Circle", title: invite.audienceCircle, icon: "person.2.fill")
                if let accessMode = invite.accessMode {
                    detailCard(eyebrow: "Access", title: accessModeLabel(accessMode), icon: "person.badge.key.fill")
                }
                if let capacity = invite.capacity {
                    detailCard(eyebrow: "Capacity", title: "\(capacity) guests", icon: "person.3.fill")
                }
            }

            if !invite.activityHighlights.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(invite.activityHighlights.prefix(4), id: \.self) { item in
                        Text(item)
                            .font(.system(size: max(bodyFontSize - 1, 13), weight: .bold, design: .rounded))
                            .foregroundColor(ink.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 2)
            }

            if let handle = invite.instagramHandle {
                followHostButton(handle: handle)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var rsvpPanel: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                sectionMiniTitle("RSVP Options")
                Spacer()
                Text(invite.rsvpCutoff ?? "Open now").font(.system(size: 12, weight: .black, design: .rounded)).foregroundColor(mutedInk)
            }
            HStack(spacing: 10) { rsvpChoice("👍", "Going"); rsvpChoice("🤔", "Maybe"); rsvpChoice("😢", "Can't Go") }
            Text("Contacts stay private unless you choose to match.").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundColor(mutedInk)
        }
        .padding(14)
        .background(glassPanel(cornerRadius: 24, tint: accent.opacity(0.08)))
    }

    private func rsvpChoice(_ emoji: String, _ title: String) -> some View {
        VStack(spacing: 6) { Text(emoji).font(.system(size: 28)); Text(title).font(.system(size: 11.5, weight: .black, design: .rounded)).foregroundColor(ink.opacity(0.74)) }
            .frame(maxWidth: .infinity).frame(height: 78).background(glassPanel(cornerRadius: 18, tint: .white.opacity(0.05)))
    }

    private func detailCard(eyebrow: String, title: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 14, weight: .black)).foregroundColor(accent).frame(width: 34, height: 34).background(glassCircle(tint: accent.opacity(0.10)))
            detailRow(eyebrow: eyebrow, title: title)
        }
        .padding(13)
        .background(glassPanel(cornerRadius: 18, tint: .white.opacity(0.04)))
    }

    private func accessModeLabel(_ value: String) -> String {
        switch value {
        case "free-rsvp": return "Free RSVP"
        case "paid-ticket": return "Paid Ticket"
        case "private-approval": return "Private Approval"
        default: return value.replacingOccurrences(of: "-", with: " ").capitalized
        }
    }

    private func sectionMiniTitle(_ title: String) -> some View {
        Text(title.uppercased()).font(.system(size: 11, weight: .black, design: .rounded)).foregroundColor(mutedInk).tracking(1.0)
    }

    private func followHostButton(handle: String) -> some View {
        Button(action: openInstagram) {
            HStack(spacing: 8) {
                instagramGlyph
                Text("@\(handle)")
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundColor(ink)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(glassPanel(cornerRadius: 16, tint: accent.opacity(0.20)))
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
        .accessibilityLabel("Follow @\(handle) on Instagram")
        .accessibilityHint("Opens the host's Instagram profile")
    }

    private var instagramGlyph: some View {
        let gradient = LinearGradient(
            colors: [Color(red: 0.98, green: 0.36, blue: 0.34), Color(red: 0.79, green: 0.19, blue: 0.63), Color(red: 0.40, green: 0.28, blue: 0.86)],
            startPoint: .bottomLeading,
            endPoint: .topTrailing
        )
        return ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(gradient, lineWidth: 2)
            Circle().strokeBorder(gradient, lineWidth: 2).frame(width: 9, height: 9)
            Circle().fill(gradient).frame(width: 3, height: 3).offset(x: 5, y: -5)
        }
        .frame(width: 20, height: 20)
    }

    private func detailRow(eyebrow: String, title: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(eyebrow.uppercased())
                .font(.system(size: 9.5, weight: .black, design: .rounded))
                .tracking(1.0)
                .foregroundColor(mutedInk)
            Text(title)
                .font(.system(size: 14.5, weight: .black, design: .rounded))
                .foregroundColor(ink.opacity(0.88))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var guestList: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Guest List", subtitle: guestListSubtitle) {
                Button(action: { openFullApp(url: invite.handoffURL, showOverlay: $showOverlay) }) {
                    Text("View all")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundColor(ink.opacity(0.82))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 13)
                        .background(glassCapsule(tint: accent.opacity(0.06)))
                }
                .buttonStyle(.plain)
            }

            if hasLiveGuests {
                HStack(spacing: -10) {
                    ForEach(Array(shownGuests.enumerated()), id: \.element.id) { index, guest in
                        realGuestBubble(guest, index: index, size: guestAvatarSize)
                    }
                    if liveOverflowCount > 0 {
                        overflowBubble(count: liveOverflowCount)
                    }
                }
            } else if !invite.isHostStudioParty && avatarCount > 0 {
                HStack(spacing: -10) {
                    ForEach(0..<avatarCount, id: \.self) { index in
                        avatarBubble(index: index, size: guestAvatarSize)
                    }
                    if overflowCount > 0 {
                        overflowBubble(count: overflowCount)
                    }
                }
            } else {
                Text(invite.isHostStudioParty ? "Guest identities stay private until the live list is available." : "Host is setting up the guest list")
                    .font(.system(size: bodyFontSize, weight: .black, design: .rounded))
                    .foregroundColor(ink.opacity(0.72))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(glassCapsule(tint: .white.opacity(0.14)))
            }
        }
    }

    // Real guest bubble: async profile photo when available, initials otherwise.
    private func realGuestBubble(_ guest: ClipGroupEventGuest, index: Int, size: CGFloat) -> some View {
        ZStack {
            if let photo = guest.profileImage {
                AsyncImage(url: photo) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Circle().fill(LinearGradient(colors: avatarColors(index), startPoint: .topLeading, endPoint: .bottomTrailing))
                }
            } else {
                Circle().fill(LinearGradient(colors: avatarColors(index), startPoint: .topLeading, endPoint: .bottomTrailing))
                Text(guest.initials)
                    .font(.system(size: size * 0.32, weight: .heavy, design: .rounded))
                    .foregroundColor(ink.opacity(0.84))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.62), lineWidth: 1.4))
        .shadow(color: Color.black.opacity(0.10), radius: 10, x: 0, y: 6)
        .accessibilityLabel(guest.name)
    }

    private func overflowBubble(count: Int) -> some View {
        Text("+\(count)")
            .font(.system(size: min(guestAvatarSize * 0.38, 24), weight: .black, design: .rounded))
            .foregroundColor(ink)
            .frame(width: guestAvatarSize, height: guestAvatarSize)
            .background(glassCircle(tint: .white.opacity(0.18)))
            .overlay(Circle().stroke(Color.white.opacity(0.48), lineWidth: 1.2))
    }

    // Party albums render only Host Studio media. Legacy group links retain their
    // fillable placeholders until that compatibility surface is retired.
    private var photoAlbum: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Photo Album", subtitle: albumSubtitle) {
                Button(action: shareInvite) {
                    Text("Share")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundColor(ink.opacity(0.86))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 13)
                        .background(glassCapsule(tint: secondary.opacity(0.06)))
                }
                .buttonStyle(.plain)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(invite.photoURLs.enumerated()), id: \.offset) { _, url in
                        albumTile(url: url)
                    }
                    ForEach(0..<placeholderTileCount, id: \.self) { index in
                        albumPlaceholderTile(index: index)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var albumSubtitle: String {
        let count = invite.photoURLs.count
        if count == 0 { return "Ready for memories" }
        return count == 1 ? "1 photo" : "\(count) photos"
    }

    private var placeholderTileCount: Int { invite.isHostStudioParty ? 0 : (invite.photoURLs.isEmpty ? 4 : 1) }

    private func albumTile(url: URL) -> some View {
        AsyncImage(url: url) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(ClipTheme.panelElevated.opacity(0.72))
        }
        .frame(width: albumTileWidth, height: albumTileHeight)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.30), lineWidth: 1))
    }

    private func albumPlaceholderTile(index: Int) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(ClipTheme.panelElevated.opacity(0.72))
            LinearGradient(colors: [accent.opacity(0.20), secondary.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: 8) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 24, weight: .black))
                    .foregroundColor(.white.opacity(0.70))
                Text(index == 0 && invite.photoURLs.isEmpty ? "First memory" : "Add photo")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundColor(mutedInk)
            }
        }
        .frame(width: albumTileWidth, height: albumTileHeight)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.30), lineWidth: 1))
    }

    private var albumTileWidth: CGFloat { 128 }
    private var albumTileHeight: CGFloat { 168 }

    private var activityFeed: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader(title: "Activity", subtitle: "1 update") {
                Button(action: { impactLight(); openFullApp(url: invite.handoffURL, showOverlay: $showOverlay) }) {
                    Label("Comment", systemImage: "lock.fill")
                        .font(.system(size: bodyFontSize, weight: .black, design: .rounded))
                        .foregroundColor(mutedInk)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 13)
                        .background(glassCapsule(tint: .white.opacity(0.08)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Comments locked in App Clip")
                .accessibilityHint("Open full Bytspot to comment")
            }

            HStack(alignment: .top, spacing: 14) {
                avatarBubble(index: 0, size: hostAvatarSize)
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(.white)
                            .frame(width: 25, height: 25)
                            .background(Circle().fill(Color.black))
                    }
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(invite.hostName) sent a Text Blast 📣")
                        .font(.system(size: 21, weight: .regular, design: .rounded))
                        .foregroundColor(ink.opacity(0.88))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(invite.title)
                        .font(.system(size: 21, weight: .bold, design: .rounded))
                        .foregroundColor(ink)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(alignment: .leading, spacing: 8) {
                        Label(invite.locationLabel, systemImage: "mappin.and.ellipse")
                        Label(invite.scheduledDate, systemImage: "clock")
                        ForEach(invite.activityHighlights.prefix(3), id: \.self) { item in
                            Label(item, systemImage: "checkmark.seal.fill")
                        }
                    }
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .foregroundColor(ink.opacity(0.72))
                }
            }
        }
    }

    private var primaryActions: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button(action: primaryPartyAction) {
                    Label(primaryButtonTitle, systemImage: primaryButtonIcon)
                        .font(.system(size: bodyFontSize, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ctaHeight)
                        .background(LinearGradient(colors: [accent, secondary], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .clipShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
                        .shadow(color: accent.opacity(0.30), radius: 18, x: 0, y: 10)
                        .opacity(membership == .joining && ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite) ? 0.7 : 1)
                }
                .buttonStyle(.plain)
                .disabled(isPrimaryActionDisabled)

                Button(action: shareInvite) {
                    VStack(spacing: 2) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 18, weight: .black))
                    }
                        .foregroundColor(ink)
                        .frame(width: ctaHeight + 6, height: ctaHeight)
                        .background(glassPanel(cornerRadius: 20, tint: .white.opacity(0.16)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(invite.isHostStudioParty ? "Share Party Pass" : "Share invite")
                .accessibilityHint("Opens the iOS share sheet")
            }
            Button(action: { impactLight(); openFullApp(url: invite.handoffURL, showOverlay: $showOverlay) }) {
                Text(invite.isHostStudioParty ? "Share the App Clip above · continue in the full app here" : "Open Bytspot to unlock nearby offers & perks for this event")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundColor(ink.opacity(0.68))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityHint(invite.isHostStudioParty ? "Opens this Party in the full Bytspot app" : "Opens this group in the full Bytspot app")
            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(ink.opacity(0.72))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 13)
        .padding(.bottom, 12)
        .background(
            Rectangle().fill(.ultraThinMaterial)
                .overlay(ClipTheme.background.opacity(0.55))
                .overlay(Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1), alignment: .top)
        )
    }

    private var eventBlurb: String {
        let highlights = invite.activityHighlights.prefix(2).joined(separator: " · ")
        let groupDescriptor = invite.groupType.lowercased() == "private" ? "invite-only" : "private \(invite.groupType.lowercased())"
        if highlights.isEmpty {
            return "A \(groupDescriptor) moment hosted by \(invite.hostName) · \(guestCountLabel). RSVP from the App Clip and keep contacts private."
        }
        return "A \(groupDescriptor) moment hosted by \(invite.hostName) · \(guestCountLabel). \(highlights)."
    }

    private var guestCountLabel: String {
        invite.participantCount == 1 ? "1 guest" : "\(invite.participantCount) guests"
    }

    private var shareInviteItems: [Any] {
        var items: [Any] = ["Join \(invite.title) on Bytspot"]
        if let inviteURL { items.append(inviteURL) }
        return items
    }

    private func avatarBubble(index: Int, size: CGFloat) -> some View {
        let initials = ["B", "Y", "T", "S", "P"][index % 5]
        return ZStack {
            Circle().fill(LinearGradient(colors: avatarColors(index), startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle().fill(.ultraThinMaterial).opacity(0.12)
            Text(initials)
                .font(.system(size: size * 0.34, weight: .heavy, design: .rounded))
                .foregroundColor(ink.opacity(0.84))
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(Color.white.opacity(0.62), lineWidth: 1.4))
        .shadow(color: Color.black.opacity(0.10), radius: 10, x: 0, y: 6)
    }

    private func avatarColors(_ index: Int) -> [Color] {
        let palettes: [[Color]] = [[accent, .white], [secondary, ClipTheme.cyan], [ClipTheme.pink, accent], [Color.white, ClipTheme.emerald], [ClipTheme.violet, Color.white]]
        return palettes[index % palettes.count]
    }

    private func glassIconButton(systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .black))
                .foregroundColor(ink)
                .frame(width: topControlSize, height: topControlSize)
                .background(glassCircle(tint: .white.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func glassChip(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.system(size: chipFontSize, weight: .black, design: .rounded))
            .foregroundColor(ink.opacity(0.78))
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(glassCapsule(tint: accent.opacity(0.06)))
    }

    private func sectionHeader<Trailing: View>(title: String, subtitle: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: sectionTitleFontSize, weight: .black, design: .rounded))
                    .foregroundColor(ink)
                Text(subtitle)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(mutedInk)
            }
            Spacer()
            trailing()
        }
    }

    // Shared dark-glass tokens — brand spec (src/BRAND_COLORS.md):
    // surface rgba(28,28,30,0.95) over #1C1C1E, subtle white borders at 0.30.
    private func glassPanel(cornerRadius: CGFloat, tint: Color) -> some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(ClipTheme.panelElevated.opacity(0.72)))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(tint))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(Color.white.opacity(0.30), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.38), radius: 20, x: 0, y: 12)
    }

    private func glassCapsule(tint: Color = .white.opacity(0.06)) -> some View {
        Capsule()
            .fill(.ultraThinMaterial)
            .overlay(Capsule().fill(ClipTheme.panelElevated.opacity(0.60)))
            .overlay(Capsule().fill(tint))
            .overlay(Capsule().stroke(Color.white.opacity(0.30), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.28), radius: 12, x: 0, y: 6)
    }

    private func glassCircle(tint: Color) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .overlay(Circle().fill(ClipTheme.panelElevated.opacity(0.60)))
            .overlay(Circle().fill(tint))
            .overlay(Circle().stroke(Color.white.opacity(0.30), lineWidth: 1))
    }

    private var joinButtonTitle: String {
        switch membership {
        case .joining: return "Joining…"
        case .joined: return "You're in"
        case .pending: return "Request sent"
        case .declined: return "Not approved"
        default: return invite.requiresApproval ? "Request Access" : "Join guest list"
        }
    }

    private var joinButtonIcon: String {
        switch membership {
        case .joining: return "hourglass"
        case .joined: return "checkmark.circle.fill"
        case .pending: return "clock.badge.checkmark"
        case .declined: return "xmark.circle.fill"
        default: return "sparkles"
        }
    }

    private var primaryButtonTitle: String {
        guard invite.isHostStudioParty else { return joinButtonTitle }
        guard let action = partyPass?.action else { return isResolvingPartyPass ? "Checking access…" : "Party Pass unavailable" }
        switch action {
        case .authenticate: return "Sign in to continue"
        case .rsvp: return "RSVP to this Party"
        case .requestApproval: return "Request host approval"
        case .ticket: return "Choose a ticket"
        case .viewPass: return "Party Pass confirmed"
        case .unavailable: return "Party Pass unavailable"
        }
    }

    private var primaryButtonIcon: String {
        guard invite.isHostStudioParty else { return joinButtonIcon }
        guard let action = partyPass?.action else { return isResolvingPartyPass ? "hourglass" : "xmark.shield" }
        switch action {
        case .authenticate: return "person.crop.circle.badge.checkmark"
        case .rsvp: return "checkmark.circle.fill"
        case .requestApproval: return "lock.badge.plus"
        case .ticket: return "ticket.fill"
        case .viewPass: return "checkmark.seal.fill"
        case .unavailable: return "xmark.shield"
        }
    }

    private func primaryPartyAction() {
        if ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite) { joinGroup() }
        else {
            Task { await performPartyAction() }
        }
    }

    private var isPrimaryActionDisabled: Bool {
        if invite.isHostStudioParty {
            guard let action = partyPass?.action else { return true }
            return isResolvingPartyPass || action == .unavailable || action == .viewPass
        }
        return membership == .joining || membership == .joined || membership == .declined
    }

    @MainActor
    private func refreshPartyPass() async {
        guard invite.isHostStudioParty else { return }
        resolverGeneration &+= 1
        let generation = resolverGeneration
        isResolvingPartyPass = true
        defer {
            if resolverGeneration == generation { isResolvingPartyPass = false }
        }
        do {
            let resolved = try await ClipPatchVerifier().resolvePartyPass(partyID: invite.id)
            guard resolverGeneration == generation else { return }
            partyPass = resolved
            statusMessage = partyStatusMessage
        } catch {
            guard resolverGeneration == generation else { return }
            partyPass = nil
            statusMessage = "We couldn't verify this Party Pass. Try again shortly."
        }
    }

    private var partyStatusMessage: String {
        guard let state = partyPass else { return "" }
        switch state.action {
        case .authenticate: return "Sign in with Apple to see your authorized Party action."
        case .rsvp: return "RSVP is available for this Party."
        case .requestApproval: return "The host reviews access requests before sharing the full Party Pass."
        case .ticket: return "Choose a server-published ticket tier to continue securely."
        case .viewPass: return "Your access is confirmed. Keep this Party Pass handy."
        case .unavailable:
            return state.guestStatus == "pending" ? "Your access request is with the host." : "This Party Pass is not available for a new action."
        }
    }

    @MainActor
    private func performPartyAction() async {
        guard let action = partyPass?.action, !isResolvingPartyPass else { return }
        impactMedium()
        switch action {
        case .authenticate:
            isResolvingPartyPass = true
            defer { isResolvingPartyPass = false }
            do {
                let credential = try await authController.requestAppleCredential()
                _ = try await ClipPatchVerifier().appleSignIn(identityToken: credential.identityToken, email: credential.email, name: credential.fullName)
            } catch {
                statusMessage = PartyPassPresentationRules.signInFailureMessage(from: error)
                return
            }
            partyPass = nil
            await refreshPartyPass()
        case .rsvp, .requestApproval:
            isResolvingPartyPass = true
            defer { isResolvingPartyPass = false }
            do {
                _ = try await ClipPatchVerifier().createPartyRSVP(partyID: invite.id, idempotencyKey: UUID().uuidString)
                partyPass = nil
                await refreshPartyPass()
            } catch {
                statusMessage = joinErrorText(from: error)
            }
        case .ticket:
            guard !invite.ticketTiers.isEmpty else {
                statusMessage = "Ticket options are unavailable right now. Try again shortly."
                return
            }
            showTicketTiers = true
        case .viewPass:
            statusMessage = "Your Party Pass is confirmed."
        case .unavailable:
            statusMessage = partyStatusMessage
        }
    }

    private func startPartyTicketCheckout(_ tier: ClipPartyTicketTier) {
        Task { @MainActor in
            guard partyPass?.action == .ticket, !isResolvingPartyPass else { return }
            isResolvingPartyPass = true
            defer { isResolvingPartyPass = false }
            do {
                let checkoutURL = try await ClipPatchVerifier().createPartyTicketCheckout(partyID: invite.id, ticketTierName: tier.name, idempotencyKey: UUID().uuidString)
                guard let validatedCheckoutURL = ClipPatchVerifier.normalizedStripeCheckoutURL(checkoutURL.absoluteString) else {
                    statusMessage = "Checkout could not be verified. Please try again."
                    return
                }
                statusMessage = "Secure checkout opened. We'll refresh your Party Pass when you return."
                let presented = ClipCheckoutBrowser.present(validatedCheckoutURL) {
                    Task { await confirmPartyTicketPurchase() }
                }
                if !presented { openURL(validatedCheckoutURL) }
            } catch {
                statusMessage = joinErrorText(from: error)
            }
        }
    }

    // Sign in with Apple -> auth.appleSignIn (persists the JWT) -> groupEvents.join.
    /// Stripe settles by webhook, so a closed sheet does not mean a granted
    /// pass. Poll `events.pass.resolve` instead of inferring success locally.
    @MainActor private func confirmPartyTicketPurchase() async {
        statusMessage = "Confirming payment…"
        for attempt in 0..<8 {
            if attempt > 0 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
            await refreshPartyPass()
            if partyPass?.action == .viewPass { return }
        }
        if partyPass?.action != .viewPass {
            statusMessage = "Payment is still confirming. Reopen this pass in a moment."
        }
    }

    // Open events return "joined"; approval-gated events return "pending". A guest
    // the host previously declined stays "declined" on re-join (no fall-through).
    private func joinGroup() {
        guard ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite) else {
            primaryPartyAction()
            return
        }
        guard membership != .joining, membership != .joined, membership != .declined else { return }
        impactMedium()
        membership = .joining
        statusMessage = "Signing you in with Apple…"
        Task { await performJoin() }
    }

    @MainActor
    private func performJoin() async {
        guard ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite) else { return }
        do {
            let credential = try await authController.requestAppleCredential()
            statusMessage = "Joining \(invite.title)…"
            let verifier = ClipPatchVerifier()
            _ = try await verifier.appleSignIn(
                identityToken: credential.identityToken,
                email: credential.email,
                name: credential.fullName
            )
            let status = try await verifier.joinGroupEvent(eventId: invite.id)
            switch status {
            case "joined":
                membership = .joined
                statusMessage = "You're in. Guest updates, photos, and matched offers will appear here."
                await loadGuests()
            case "pending":
                membership = .pending
                statusMessage = "Request sent. \(invite.hostName) will approve you shortly."
            case "declined":
                membership = .declined
                statusMessage = "\(invite.hostName) isn't accepting this request. Reach out to the host directly."
            default:
                membership = .failed("Unexpected response. Try again.")
                statusMessage = "Unexpected response. Try again."
            }
        } catch {
            let message = joinErrorText(from: error)
            membership = .failed(message)
            statusMessage = message
        }
    }

    // Pull-on-open: fetch the real joined guest list. On any failure the view
    // keeps its existing placeholder bubbles, so the section never reads empty.
    @MainActor
    private func loadGuests() async {
        guard ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite) else {
            liveGuests = []
            liveGuestCount = 0
            return
        }
        guard let list = try? await ClipPatchVerifier().groupEventGuests(eventId: invite.id) else { return }
        liveGuests = list.guests
        liveGuestCount = list.count
    }

    private func joinErrorText(from error: Error) -> String {
        if let authError = error as? ClipGuestAuthController.AuthError {
            return authError.errorDescription ?? "Sign in failed. Try again."
        }
        switch error {
        case ClipPatchVerifier.VerifyError.server(let message): return message
        case ClipPatchVerifier.VerifyError.network(let message): return message
        default: return "Couldn't join right now. Try again."
        }
    }

    private func shareInvite() { impactLight(); showShareSheet = true }
    private func openInstagram() {
        guard let handle = invite.instagramHandle else { return }
        impactLight()
        let appURL = URL(string: "instagram://user?username=\(handle)")
        let webURL = URL(string: "https://instagram.com/\(handle)")
        if let appURL {
            UIApplication.shared.open(appURL) { opened in
                if !opened, let webURL { UIApplication.shared.open(webURL) }
            }
        } else if let webURL {
            UIApplication.shared.open(webURL)
        }
    }
    private func copyInvite() { impactLight(); UIPasteboard.general.string = inviteURL?.absoluteString; statusMessage = "Invite copied — perfect for sharing the private App Clip." }
}

#endif

private struct ClipPartyTicketTierPicker: View {
    let tiers: [ClipPartyTicketTier]
    let partyTitle: String
    let partyRequiredTier: BytspotTier
    let select: (ClipPartyTicketTier) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTierID: String?

    private var selectedTier: ClipPartyTicketTier? { tiers.first { $0.id == selectedTierID } }
    private var accent: Color { ClipTheme.accent(for: partyRequiredTier) }

    var body: some View {
        NavigationView {
            ZStack {
                ClipTheme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("REQUIRED PARTY TIER · \(partyRequiredTier.displayName.uppercased())")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundColor(.white.opacity(0.58))
                        Text(partyTitle)
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                        Text("Choose a server-published tier. Ticket price, availability, and the selected ticket requirement are verified by Bytspot before Checkout opens.")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.white.opacity(0.68))
                        ForEach(tiers) { tier in
                            let isSelected = selectedTierID == tier.id
                            Button { selectedTierID = tier.id } label: {
                                HStack(spacing: 14) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(tier.name).font(.system(size: 17, weight: .black, design: .rounded))
                                        Text("\(tier.quantity) available · \(tier.requiredMembershipTier.capitalized) required")
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                            .foregroundColor(.white.opacity(0.62))
                                    }
                                    Spacer()
                                    Text(price(tier.priceCents))
                                        .font(.system(size: 17, weight: .black, design: .rounded))
                                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 21, weight: .black)).foregroundColor(isSelected ? accent : .white.opacity(0.42))
                                }
                                .foregroundColor(.white)
                                .padding(16)
                                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(isSelected ? accent.opacity(0.10) : ClipTheme.panelElevated))
                                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(isSelected ? accent : Color.white.opacity(0.20), lineWidth: isSelected ? 1.5 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(tier.name), \(price(tier.priceCents)), \(tier.quantity) available, \(tier.requiredMembershipTier.capitalized) required")
                            .accessibilityValue(isSelected ? "Selected" : "Not selected")
                            .accessibilityHint("Selects this tier before secure checkout")
                        }
                    }
                    .padding(20)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 5) {
                    Button {
                        if let selectedTier { select(selectedTier) }
                    } label: {
                        Text(selectedTier.map { "Continue to secure checkout · \(price($0.priceCents))" } ?? "Select a ticket tier")
                            .font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(ClipTheme.background)
                            .frame(maxWidth: .infinity).frame(height: 54).background(selectedTier == nil ? Color.white.opacity(0.20) : accent).clipShape(RoundedRectangle(cornerRadius: 17))
                    }.disabled(selectedTier == nil).buttonStyle(.plain)
                    Text("Price and eligibility are verified before Checkout opens.").font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.60))
                }.padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 12).background(ClipTheme.background.opacity(0.96))
            }
            .navigationTitle("Ticket tiers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { dismiss() }.foregroundColor(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func price(_ cents: Int) -> String {
        String(format: "$%.2f", Double(cents) / 100)
    }
}

// MARK: - Sign in with Apple controller

/// Bridges the callback-based `ASAuthorizationController` to async/await so the
/// Clip's join flow can request an Apple identity token in one line. The token
/// is exchanged server-side by `ClipPatchVerifier.appleSignIn`.
@MainActor
final class ClipGuestAuthController: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    struct Credential {
        let identityToken: String
        let email: String?
        let fullName: String?
    }

    enum AuthError: LocalizedError {
        case cancelled
        case missingToken
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Sign in was cancelled."
            case .missingToken: return "Apple didn't return a secure token. Try again."
            case .failed(let message): return message
            }
        }
    }

    private var continuation: CheckedContinuation<Credential, Error>?

    func requestAppleCredential() async throws -> Credential {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { continuation = nil }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            continuation?.resume(throwing: AuthError.missingToken)
            return
        }
        let name = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
        continuation?.resume(returning: Credential(
            identityToken: identityToken,
            email: credential.email,
            fullName: name.isEmpty ? nil : name
        ))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { continuation = nil }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            continuation?.resume(throwing: AuthError.cancelled)
        } else {
            continuation?.resume(throwing: AuthError.failed(error.localizedDescription))
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = (scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene)
            ?? scenes.first as? UIWindowScene
        return windowScene?.keyWindow ?? windowScene?.windows.first ?? ASPresentationAnchor()
    }
}

private struct ClipShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}


/// Autoplay-muted-loop HLS player for the App Clip vendor hero.
/// Falls back to a poster image (AsyncImage) when the video URL is nil or while loading.
struct ClipAutoLoopingPlayer: View {
    let videoURL: URL?
    let posterURL: URL?
    let tint: Color

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [tint.opacity(0.55), tint.opacity(0.15), Color.black.opacity(0.65)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            if let posterURL {
                AsyncImage(url: posterURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Color.clear }
            }
            if let videoURL {
                ClipLoopingPlayerView(url: videoURL)
            }
        }
        .clipped()
    }
}

private struct ClipLoopingPlayerView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> ClipLoopingPlayerContainerView {
        let view = ClipLoopingPlayerContainerView()
        view.attach(url: url)
        return view
    }

    func updateUIView(_ uiView: ClipLoopingPlayerContainerView, context: Context) {
        uiView.attach(url: url)
    }

    static func dismantleUIView(_ uiView: ClipLoopingPlayerContainerView, coordinator: ()) {
        uiView.teardown()
    }
}

final class ClipLoopingPlayerContainerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }

    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var attachedURL: URL?

    func attach(url: URL) {
        if attachedURL == url, queuePlayer != nil { return }
        teardown()

        let item = AVPlayerItem(url: url)
        let player = AVQueuePlayer()
        player.isMuted = true
        player.actionAtItemEnd = .advance
        let looper = AVPlayerLooper(player: player, templateItem: item)

        let playerLayer = layer as? AVPlayerLayer
        playerLayer?.player = player
        playerLayer?.videoGravity = .resizeAspectFill

        self.queuePlayer = player
        self.looper = looper
        self.attachedURL = url
        player.play()
    }

    func teardown() {
        looper?.disableLooping()
        queuePlayer?.pause()
        (layer as? AVPlayerLayer)?.player = nil
        queuePlayer = nil
        looper = nil
        attachedURL = nil
    }

    deinit {
        teardown()
    }
}

private extension Text {
    func clipChip(color: Color, foreground: Color) -> some View {
        self.font(.system(size: 10, weight: .black))
            .foregroundColor(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(color)
            .clipShape(Capsule())
    }
}
