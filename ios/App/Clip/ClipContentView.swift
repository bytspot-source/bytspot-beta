import SwiftUI
import AppClip
import StoreKit
import UIKit
import AuthenticationServices
import PassKit
import Contacts
import AVFoundation
import AVKit
import SafariServices
@_spi(STP) import StripeApplePay
@_spi(STP) import StripeCore

enum ClipVerifyState: Equatable {
    case idle
    case verifying
    case success(label: String, bindingType: String?)
    case pending(label: String, status: String)
    case denied(message: String)
    case unavailable(message: String)
}

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
    @StateObject private var paymentSecure = ClipPaymentSecureController()

    var body: some View {
        let stops = ClipTheme.cornerGradientStops(for: invocation.tier)
        ZStack {
            ClipTheme.background.ignoresSafeArea()
            RadialGradient(colors: [stops.top, .clear], center: .topLeading, startRadius: 20, endRadius: 460)
                .ignoresSafeArea()
            RadialGradient(colors: [stops.bottom, .clear], center: .bottomTrailing, startRadius: 20, endRadius: 420)
                .ignoresSafeArea()

            Group {
                switch invocation.flow {
                case .catalog:
                    ClipCatalogView(showOverlay: $showOverlay)
                        .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .leading).combined(with: .opacity)))
                case .partyLoading:
                    ClipPartyInviteStateView(title: "Loading Party Pass…", message: "Getting the moment directly from its Host Studio party.", isLoading: true)
                        .transition(.opacity)
                case .partyFailed(_, let message):
                    ClipPartyInviteStateView(title: "Party Pass unavailable", message: message, isLoading: false)
                        .transition(.opacity)
                case .party(let invite):
                    PartyPassClipView(invite: invite, showOverlay: $showOverlay)
                        .transition(.opacity)
                case .vendors(let service):
                    ClipVendorListView(service: service)
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
                case .checkout(let service, let vendor):
                    ClipCheckoutView(service: service, vendor: vendor, paymentSecure: paymentSecure, showOverlay: $showOverlay)
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
                case .success(let service, let vendor, let bookingRef):
                    ClipSuccessView(service: service, vendor: vendor, bookingRef: bookingRef, showOverlay: $showOverlay)
                        .transition(.opacity)
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.86), value: invocation.flow)
        }
        .appStoreOverlay(isPresented: $showOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
        }
        .onChange(of: invocation.invocationURL) { _ in
            paymentSecure.reset()
        }
        .onReceive(paymentSecure.$completedResult.compactMap { $0 }) { result in
            guard case .checkout(let service, let vendor) = invocation.flow else { return }
            invocation.completeCheckout(service: service, vendor: vendor, bookingRef: result.bookingId ?? "BYT-\(Int.random(in: 100000...999999))")
        }
    }
}

private struct ClipPartyInviteStateView: View {
    let title: String
    let message: String
    let isLoading: Bool

    var body: some View {
        VStack(spacing: 14) {
            if isLoading { ProgressView().tint(ClipTheme.cyan).scaleEffect(1.2) }
            Image(systemName: isLoading ? "sparkles" : "exclamationmark.circle.fill")
                .font(.system(size: 34, weight: .black)).foregroundColor(isLoading ? ClipTheme.cyan : ClipTheme.pink)
            Text(title).font(.system(size: 24, weight: .black, design: .rounded)).foregroundColor(.white)
            Text(message).font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.62)).multilineTextAlignment(.center)
        }
        .padding(26).frame(maxWidth: 360)
        .background(RoundedRectangle(cornerRadius: 28).fill(ClipTheme.panelElevated.opacity(0.92)))
        .padding(22)
    }
}

// MARK: - Party Pass

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

    private var accent: Color { ClipTheme.accent(for: invite.tier) }
    private var ctaForeground: Color { ClipTheme.background }
    private var tierPresentation: PartyRecipientTierPresentation { PartyRecipientTierPresentation(for: invite.tier) }
    private var isBusy: Bool { isResolving || isPerformingAction }
    private var primaryTitle: String {
        guard let action = passState?.action else { return isResolving ? "Preparing your Party Pass…" : "Party Pass unavailable" }
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
        switch passState?.action {
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
        switch passState?.action {
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
        guard let action = passState?.action else { return ClipTheme.panelElevated }
        switch action {
        case .unavailable, .viewPass: return action == .viewPass ? ClipTheme.emerald : Color.white.opacity(0.14)
        default: return accent
        }
    }
    private var primaryButtonForeground: Color {
        guard let action = passState?.action else { return .white.opacity(0.66) }
        return action == .unavailable ? .white.opacity(0.66) : ctaForeground
    }
    private var accessStatus: PartyAccessStatus {
        switch passState?.action {
        case .authenticate:
            return PartyAccessStatus("SIGN IN REQUIRED", "Verify your invitation", "Use Apple sign-in to see your authorized Party action.", "person.badge.key.fill", .access(accent: accent))
        case .ticket:
            return PartyAccessStatus("TICKETS AVAILABLE", "Choose your entry tier", "Price and eligibility are verified again before Checkout.", "ticket.fill", .access(accent: accent))
        case .requestApproval:
            return PartyAccessStatus("HOST REVIEW", "Approval required", "Your request stays private until the host responds.", "hand.raised.fill", .access(accent: accent))
        case .viewPass:
            return PartyAccessStatus("ACCESS CONFIRMED", "Your Party Pass is ready", "Keep this pass ready for arrival.", "checkmark.seal.fill", .access(accent: ClipTheme.emerald))
        case .unavailable where passState?.guestStatus.lowercased() == "pending":
            return PartyAccessStatus("REQUEST PENDING", "The host is reviewing", "You will be notified when access changes.", "clock.fill", .access(accent: ClipTheme.violet))
        case .unavailable:
            return PartyAccessStatus("ACCESS UNAVAILABLE", "Party action unavailable", "This invitation cannot accept a new action right now.", "exclamationmark.triangle.fill", .standard)
        case .rsvp, nil:
            return PartyAccessStatus("YOUR ACCESS", "RSVP access", "A private invitation from \(invite.hostName).", "checkmark.seal.fill", .access(accent: accent))
        }
    }

    var body: some View {
        ZStack {
            partyBackdrop
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    hero
                    passSummary
                    details
                    if !invite.itinerary.isEmpty { program }
                    guestStack
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 120)
            }
        }
        .safeAreaInset(edge: .bottom) { ticketActionBar }
        .sheet(isPresented: $showTicketTiers) {
            ClipPartyTicketTierPicker(tiers: invite.ticketTiers, partyTitle: invite.title, invitationTier: invite.tier) { tier in
                showTicketTiers = false
                createCheckout(for: tier)
            }
        }
        .sheet(isPresented: $showShareSheet) { ClipShareSheet(items: [invite.canonicalURL].compactMap { $0 }) }
        .accessibilityIdentifier("party-pass-clip")
        .task(id: invite.id) { await resolvePass() }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task { await resolvePass() }
        }
    }

    private var partyBackdrop: some View {
        ZStack {
            ClipTheme.background.ignoresSafeArea()
            if let poster = invite.displayPosterURL {
                AsyncImage(url: poster) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
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

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(LinearGradient(colors: [ClipTheme.panelElevated, ClipTheme.panel], startPoint: .topLeading, endPoint: .bottomTrailing))
            if let poster = invite.displayPosterURL {
                AsyncImage(url: poster) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
            }
            LinearGradient(colors: [Color.black.opacity(0.08), Color.black.opacity(0.36), Color.black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
            VStack {
                HStack {
                    Text(invite.tier.displayName.uppercased()).font(.system(size: 9, weight: .black, design: .rounded)).tracking(1.2)
                        .foregroundColor(accent).padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Capsule().fill(Color.black.opacity(0.44))).overlay(Capsule().stroke(accent.opacity(0.42)))
                    Spacer()
                    Text(tierPresentation.heroBadge).font(.system(size: 8, weight: .black, design: .rounded)).tracking(0.9).foregroundColor(.white.opacity(0.82))
                }
                Spacer()
            }.padding(17)
            VStack(alignment: .leading, spacing: 12) {
                Text(invite.title).font(.system(size: 36, weight: .bold, design: .serif)).foregroundColor(.white).lineLimit(3).minimumScaleFactor(0.78).fixedSize(horizontal: false, vertical: true)
                heroMetadata
            }.padding(20)
        }
        .frame(maxWidth: .infinity).frame(minHeight: 292).clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.white.opacity(0.15)))
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
                PartyMetric(value: invite.tier.displayName.replacingOccurrences(of: "Bytspot ", with: ""), label: "TIER")
                PartyMetric(value: accessMetricValue, label: "ACCESS")
            }
        }
    }

    private var details: some View {
        PartyGlassCard {
            Text("The invitation").font(.system(size: 21, weight: .bold, design: .serif)).foregroundColor(.white)
            PartyDetailRow(icon: "calendar.badge.clock", label: "WHEN", value: invite.scheduledDate)
            PartyDetailRow(icon: "mappin.and.ellipse", label: invite.locationIsWithheld ? "LOCATION AFTER APPROVAL" : "WHERE", value: invite.locationLabel)
            if let note = invite.note { PartyDetailRow(icon: "sparkles", label: "FROM THE HOST", value: note) }
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

    private var guestStack: some View {
        PartyGlassCard {
            HStack { VStack(alignment: .leading, spacing: 3) { Text("THE ROOM").font(.system(size: 10, weight: .black, design: .rounded)).tracking(1).foregroundColor(accent); Text(invite.attendeeCount == 1 ? "1 guest is in" : "\(invite.attendeeCount) guests are in").font(.system(size: 17, weight: .bold, design: .serif)).foregroundColor(.white) }; Spacer(minLength: 8); PartyGuestStack(count: invite.attendeeCount, accent: accent, secondary: ClipTheme.secondaryAccent(for: invite.tier)) }
        }
    }

    private var ticketActionBar: some View {
        VStack(spacing: 8) {
            Button(action: primaryAction) { Label(primaryTitle, systemImage: primarySymbol).font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(primaryButtonForeground).frame(maxWidth: .infinity).frame(height: 54).background(primaryButtonColor).clipShape(RoundedRectangle(cornerRadius: 17)) }
                .disabled(isBusy || passState?.action == .unavailable || passState?.action == .viewPass).buttonStyle(.plain)
            Text(primarySubtitle).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(.white.opacity(0.62)).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            Button { openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) } label: {
                Label("Continue in app to plan arrival", systemImage: "arrow.down.app.fill")
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
        switch passState?.action {
        case .ticket: return "TICKETS"
        case .requestApproval: return "REVIEW"
        case .viewPass: return "CONFIRMED"
        case .unavailable where passState?.guestStatus.lowercased() == "pending": return "PENDING"
        default: return "RSVP"
        }
    }
    private func resolvePass() async {
        isResolving = true
        defer { isResolving = false }
        #if DEBUG
        if let previewState = ClipPartyPassPreview.state(for: invocation.invocationURL, partyID: invite.id) {
            passState = previewState
            statusMessage = ""
            return
        }
        #endif
        do {
            passState = try await ClipPatchVerifier().resolvePartyPass(partyID: invite.id)
            statusMessage = ""
        } catch {
            passState = nil
            statusMessage = "We couldn’t verify ticket availability right now. Please try again."
        }
    }
    private func primaryAction() { guard !isBusy, let action = passState?.action else { return }; switch action { case .authenticate: Task { await authenticate() }; case .ticket: showTicketTiers = true; case .rsvp, .requestApproval: Task { await rsvp() }; case .viewPass, .unavailable: break } }
    private func authenticate() async { guard !isBusy else { return }; isPerformingAction = true; statusMessage = "Signing in securely…"; defer { isPerformingAction = false }; do { let credential = try await authController.requestAppleCredential(); _ = try await ClipPatchVerifier().appleSignIn(identityToken: credential.identityToken, email: credential.email, name: credential.fullName); viewerName = ClipAuthStore.displayName; await resolvePass() } catch { statusMessage = "Sign in could not be completed. Please try again." } }
    private func rsvp() async { guard !isBusy else { return }; isPerformingAction = true; statusMessage = "Sending your request…"; defer { isPerformingAction = false }; do { _ = try await ClipPatchVerifier().createPartyRSVP(partyID: invite.id, idempotencyKey: UUID().uuidString); await resolvePass() } catch { statusMessage = "Your request could not be sent. Please try again." } }
    private func createCheckout(for tier: ClipPartyTicketTier) { Task { @MainActor in guard !isBusy, passState?.action == .ticket else { return }; isPerformingAction = true; statusMessage = "Starting secure checkout…"; defer { isPerformingAction = false }; do { let url = try await ClipPatchVerifier().createPartyTicketCheckout(partyID: invite.id, ticketTierName: tier.name, idempotencyKey: UUID().uuidString); statusMessage = "Secure checkout opened."; openURL(url) } catch { statusMessage = "Checkout could not be started. Please try again." } } }
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

/// A presentation-only tier treatment. The server remains the sole authority
/// for RSVP, ticket, approval, and arrival privileges.
struct PartyRecipientTierPresentation: Equatable {
    let headerLabel: String
    let heroBadge: String
    let eyebrow: String
    let detail: String
    let symbol: String

    init(for tier: BytspotTier) {
        switch tier {
        case .green:
            headerLabel = "PRIVATE GREEN INVITATION"
            heroBadge = "PERSONALLY INVITED"
            eyebrow = "PRIVATE INVITATION"
            detail = "A considered invitation from your host—your Party Pass keeps the details and access together."
            symbol = "seal.fill"
        case .platinum:
            headerLabel = "PRIVATE PLATINUM INVITATION"
            heroBadge = "PLATINUM INVITED"
            eyebrow = "PLATINUM INVITATION"
            detail = "A curated Platinum gathering. Your access is confirmed again before any Party action is completed."
            symbol = "sparkles"
        case .black:
            headerLabel = "PRIVATE BLACK INVITATION"
            heroBadge = "SIGNATURE INVITE"
            eyebrow = "SIGNATURE INVITATION"
            detail = "A curated Black gathering. Your Party Pass keeps the invitation, access, and arrival details in one place."
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

extension ClipLocalService {
    var tintColor: Color {
        switch tintName {
        case "gold": return ClipTheme.gold
        case "violet": return ClipTheme.violet
        case "cyan": return ClipTheme.cyan
        default: return ClipTheme.emerald
        }
    }
}

private func impactLight() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
private func impactMedium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
private func impactHeavy() { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }

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

private func formattedSlug(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    return value.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ").split(separator: " ").map { $0.capitalized }.joined(separator: " ")
}

private enum ClipLogisticsMode { case inboundToUser, outboundToVenue }

private struct ClipBookingContext {
    let isHighTicket: Bool
    let logisticsMode: ClipLogisticsMode
    let holdMinutes: Int
    let eyebrow: String
    let title: String
    let cta: String
    let authorizationNote: String
    let requiresSpecialRequests: Bool
    let requiresPhoneNumber: Bool

    static func make(service: ClipLocalService, vendor: ClipVendor, tier: BytspotTier) -> ClipBookingContext {
        let category = [service.category, service.id, service.title].compactMap { $0 }.joined(separator: " ").lowercased()
        let inbound = ["chef", "dining", "wellness", "concierge", "marine"].contains { category.contains($0) }
        let highTicket = tier == .black && (inbound || vendor.priceFromCents >= 85_000)
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
                VStack(alignment: .leading, spacing: 21) {
                    topControls
                    if invite.isHostStudioParty {
                        partyHero
                        partyCredential
                        partyEssentials
                        partyPlan
                        guestList
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
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
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
                GeometryReader { proxy in
                    AsyncImage(url: poster) { image in
                        image.resizable().scaledToFill().frame(width: proxy.size.width, height: proxy.size.height).clipped()
                    } placeholder: { Color.clear }
                }
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
                partyPass = nil
                await refreshPartyPass()
            } catch {
                statusMessage = joinErrorText(from: error)
            }
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
                statusMessage = "Secure checkout opened. We'll refresh your Party Pass when you return."
                openURL(checkoutURL)
            } catch {
                statusMessage = joinErrorText(from: error)
            }
        }
    }

    // Sign in with Apple -> auth.appleSignIn (persists the JWT) -> groupEvents.join.
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
    let invitationTier: BytspotTier
    let select: (ClipPartyTicketTier) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTierID: String?

    private var selectedTier: ClipPartyTicketTier? { tiers.first { $0.id == selectedTierID } }

    var body: some View {
        NavigationView {
            ZStack {
                ClipTheme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("\(invitationTier.displayName.uppercased()) TICKET ACCESS")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundColor(.white.opacity(0.58))
                        Text(partyTitle)
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                        Text("Choose a server-published tier. Your \(invitationTier.displayName) eligibility, price, and availability are verified again before Checkout opens.")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.white.opacity(0.68))
                        ForEach(tiers) { tier in
                            let isSelected = selectedTierID == tier.id
                            Button { selectedTierID = tier.id } label: {
                                HStack(spacing: 14) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(tier.name).font(.system(size: 17, weight: .black, design: .rounded))
                                        Text("\(tier.quantity) available · \(tier.requiredMembershipTier.capitalized) access")
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                            .foregroundColor(.white.opacity(0.62))
                                    }
                                    Spacer()
                                    Text(price(tier.priceCents))
                                        .font(.system(size: 17, weight: .black, design: .rounded))
                                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 21, weight: .black)).foregroundColor(isSelected ? ClipTheme.cyan : .white.opacity(0.42))
                                }
                                .foregroundColor(.white)
                                .padding(16)
                                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(isSelected ? ClipTheme.cyan.opacity(0.10) : ClipTheme.panelElevated))
                                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(isSelected ? ClipTheme.cyan : Color.white.opacity(0.20), lineWidth: isSelected ? 1.5 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(tier.name), \(price(tier.priceCents)), \(tier.quantity) available, \(tier.requiredMembershipTier.capitalized) access")
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
                            .frame(maxWidth: .infinity).frame(height: 54).background(selectedTier == nil ? Color.white.opacity(0.20) : ClipTheme.cyan).clipShape(RoundedRectangle(cornerRadius: 17))
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

// MARK: - Screen 1: Catalog

struct ClipCatalogView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    @Binding var showOverlay: Bool

    private let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    // Partner-card parity vocabulary — must match NativeMapExploreView's static literals.
    // Locked by BytspotAviationFallbackTests.assertPartnerCardParity().
    static let partnerCardVerifiedLabel = "Verified Partner"
    static let partnerCardServiceSectionLabel = "Book at this venue"
    static let partnerCardPatchPairedLabel = "Patch paired"
    static let partnerCardInstallNudgeLabel = "Open full Bytspot app with this patch"

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                partnerCardChromeHeader
                verificationBanner
                catalogHeader
                membershipGateBanner
                serviceSectionEyebrow
                if invocation.isLoadingServices {
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(0..<4, id: \.self) { _ in skeletonTile }
                    }
                } else {
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(invocation.services) { service in
                            Button(action: { impactMedium(); invocation.selectService(service) }) {
                                catalogTile(service)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let message = invocation.contextError {
                    Text(message)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.yellow.opacity(0.82))
                        .padding(.top, 4)
                }
                upsellFooter
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 28)
        }
    }

    @ViewBuilder private var verificationBanner: some View {
        switch invocation.verificationState {
        case .idle:
            EmptyView()
        case .verifying:
            verificationCard(icon: "shield.lefthalf.filled", title: "Verifying secure tap", detail: "Checking this pass with Bytspot…", color: ClipTheme.cyan, showsProgress: true)
        case .success(let label, let bindingType):
            verificationCard(icon: "checkmark.seal.fill", title: "Pass verified", detail: [label, bindingType].compactMap { $0 }.joined(separator: " · "), color: ClipTheme.emerald)
        case .pending(let label, let status):
            verificationCard(icon: "clock.badge.questionmark.fill", title: "Verification pending", detail: "\(label) · \(status). No access has been granted yet.", color: .orange)
        case .denied(let message):
            verificationCard(icon: "xmark.shield.fill", title: "Pass not valid", detail: message, color: .pink)
        case .unavailable(let message):
            verificationCard(icon: "exclamationmark.shield.fill", title: "Verification unavailable", detail: message, color: .gray)
        }
    }

    private func verificationCard(icon: String, title: String, detail: String, color: Color, showsProgress: Bool = false) -> some View {
        HStack(spacing: 13) {
            ZStack {
                Circle().fill(color.opacity(0.16)).frame(width: 46, height: 46)
                if showsProgress { ProgressView().tint(color) } else { Image(systemName: icon).font(.system(size: 19, weight: .black)).foregroundColor(color) }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 15, weight: .black, design: .rounded)).foregroundColor(.white)
                Text(detail).font(.system(size: 11.5, weight: .bold, design: .rounded)).foregroundColor(.white.opacity(0.66)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14).background(RoundedRectangle(cornerRadius: 20).fill(ClipTheme.panelElevated).overlay(RoundedRectangle(cornerRadius: 20).stroke(color.opacity(0.38))))
        .accessibilityElement(children: .combine)
    }

    private var catalogHeader: some View {
        let accent = ClipTheme.accent(for: invocation.tier)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(eyebrow)
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(accent)
                    .tracking(1.4)
                if invocation.isLoadingContext { ProgressView().tint(accent).scaleEffect(0.7) }
            }
            Text(venueTitle)
                .font(.system(size: 30, weight: .heavy))
                .foregroundColor(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.78)
            Text(venueSubtitle)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white.opacity(0.74))
                .lineSpacing(2)
        }
    }

    private func catalogTile(_ service: ClipLocalService) -> AnyView {
        if isBlackAviation(service) {
            return AnyView(blackAviationCatalogTile(service))
        }
        return AnyView(VStack(alignment: .leading, spacing: 0) {
            ZStack {
                LinearGradient(
                    colors: [service.tintColor.opacity(0.78), service.tintColor.opacity(0.18), Color.black.opacity(0.55)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                if service.hasPlayableVideo {
                    ClipAutoLoopingPlayer(videoURL: service.videoURL, posterURL: service.displayPosterURL, tint: service.tintColor)
                } else if let url = service.displayPosterURL {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Color.clear }
                    .clipped()
                }
                LinearGradient(colors: [.clear, Color.black.opacity(0.55)], startPoint: .top, endPoint: .bottom)
                VStack {
                    HStack {
                        Text(serviceBadgeText(service))
                                .font(.system(size: 9, weight: .black))
                                .tracking(0.8)
                                .foregroundColor(invocation.hasPremiumMembershipAccess ? .black : .white)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(invocation.hasPremiumMembershipAccess ? ClipTheme.emerald : ClipTheme.violet.opacity(0.86))
                                .clipShape(Capsule())
                        Spacer()
                        if !invocation.hasPremiumMembershipAccess {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 11, weight: .black))
                                .foregroundColor(.white)
                                .padding(6)
                                .background(Color.black.opacity(0.50))
                                .clipShape(Circle())
                        }
                    }
                    Spacer()
                    HStack {
                        Image(systemName: service.iconName)
                            .font(.system(size: 28, weight: .black))
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 2)
                        Spacer()
                    }
                }
                .padding(12)
            }
            .frame(height: 128)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(service.title)
                    .font(.system(size: 15.5, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1)
                if let price = service.priceLabel {
                    Text(price)
                        .font(.system(size: 12, weight: .black, design: .monospaced))
                        .foregroundColor(service.tintColor)
                }
                if let context = serviceTileContext(service) {
                    Text(context)
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(.white.opacity(0.66))
                        .lineLimit(1)
                }
                Text(service.subtitle)
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.white.opacity(0.62))
                    .lineLimit(2)
                    .padding(.top, 1)
            }
            .padding(12)
        }
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)))
    }

    private func blackAviationCatalogTile(_ service: ClipLocalService) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [Color.black, ClipTheme.violet.opacity(0.34), ClipTheme.magenta.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if service.hasPlayableVideo {
                    ClipAutoLoopingPlayer(videoURL: service.videoURL, posterURL: service.displayPosterURL, tint: ClipTheme.gold)
                        .opacity(0.62)
                } else if let url = service.displayPosterURL {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                        .opacity(0.54)
                }
                RadialGradient(colors: [ClipTheme.gold.opacity(0.16), .clear], center: .topTrailing, startRadius: 12, endRadius: 150)
                LinearGradient(colors: [.clear, Color.black.opacity(0.70)], startPoint: .top, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text("BLACK · ELITE GUARANTEE").tracking(1.1); Spacer(); Image(systemName: "airplane.departure") }
                        .font(.system(size: 9.5, weight: .black))
                        .foregroundColor(ClipTheme.gold)
                    Spacer()
                    HStack(alignment: .bottom) {
                        Image(systemName: service.iconName).font(.system(size: 32, weight: .black)).foregroundColor(.white)
                        Spacer()
                        Text("90 MIN").font(.system(size: 13, weight: .heavy, design: .monospaced)).foregroundColor(.black).padding(.horizontal, 9).padding(.vertical, 5).background(ClipTheme.gold).clipShape(Capsule())
                    }
                }.padding(12)
            }
            .frame(height: 128)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(service.title).font(.system(size: 15.5, weight: .heavy)).foregroundColor(.white).lineLimit(1)
                Text(service.priceLabel ?? "Quote ready").font(.system(size: 12, weight: .black, design: .monospaced)).foregroundColor(ClipTheme.gold)
                Text(serviceTileContext(service) ?? "Aircraft, catering, ground transport, and concierge clearance.").font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.68)).lineLimit(2).padding(.top, 1)
            }.padding(12)
        }
        .background(LinearGradient(colors: [ClipTheme.panelElevated, Color.black.opacity(0.96)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.violet.opacity(0.24), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: ClipTheme.magenta.opacity(0.10), radius: 18, x: 0, y: 10)
    }

    private var skeletonTile: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.10)).frame(height: 128).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.14)).frame(width: 110, height: 13)
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.09)).frame(width: 70, height: 11)
            }.padding(12)
        }
        .background(ClipTheme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var partnerCardChromeHeader: some View {
        let accent = ClipTheme.accent(for: invocation.tier)
        return HStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 14, weight: .black))
                .foregroundColor(ClipTheme.cyan)
            Text(Self.partnerCardVerifiedLabel)
                .font(.system(size: 12, weight: .black))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundColor(.white.opacity(0.92))
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Circle().fill(accent).frame(width: 8, height: 8)
                Text(invocation.tier.rawValue.uppercased())
                    .font(.system(size: 10.5, weight: .black, design: .monospaced))
                    .tracking(1.2)
                    .foregroundColor(.white.opacity(0.92))
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Color.white.opacity(0.06))
            .overlay(Capsule().stroke(accent.opacity(0.34), lineWidth: 1))
            .clipShape(Capsule())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(LinearGradient(colors: [ClipTheme.cyan.opacity(0.06), Color.white.opacity(0.02)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(ClipTheme.cyan.opacity(0.20), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityIdentifier("clip-catalog-partner-card-chrome")
    }

    private var serviceSectionEyebrow: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 11, weight: .black)).foregroundColor(ClipTheme.emerald)
            Text("\(Self.partnerCardPatchPairedLabel.uppercased()) · \(Self.partnerCardServiceSectionLabel.uppercased())")
                .font(.system(size: 10.5, weight: .black))
                .tracking(1.4)
                .foregroundColor(ClipTheme.cyan.opacity(0.86))
            Spacer(minLength: 0)
        }
        .padding(.top, 2)
        .accessibilityIdentifier("clip-catalog-service-section-eyebrow")
    }

    private var upsellFooter: some View {
        Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.down.app.fill")
                Text(Self.partnerCardInstallNudgeLabel)
                Spacer()
                Image(systemName: "chevron.right")
            }
            .font(.system(size: 12.5, weight: .black))
            .foregroundColor(.white.opacity(0.85))
            .padding(.vertical, 12).padding(.horizontal, 14)
            .background(Color.white.opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
        .accessibilityIdentifier("clip-catalog-install-nudge")
    }

    @ViewBuilder private var membershipGateBanner: some View {
        if !invocation.hasPremiumMembershipAccess {
            HStack(spacing: 10) {
                Image(systemName: "lock.shield.fill").foregroundColor(ClipTheme.cyan)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Premium membership required")
                        .font(.system(size: 13, weight: .black)).foregroundColor(.white)
                    Text("App Clip catalog and vendor lists are gated service feeds. Open the full app to upgrade or verify access.")
                        .font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.66))
                }
            }
            .padding(12)
            .background(ClipTheme.violet.opacity(0.12))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(ClipTheme.cyan.opacity(0.20), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private var eyebrow: String {
        if case .success = invocation.verificationState { return "VERIFIED ACCESS" }
        return invocation.services.first?.source == "live" ? "LIVE SERVICES FEED" : invocation.tier.eyebrow
    }
    private var venueTitle: String { invocation.patchContext?.title ?? formattedSlug(invocation.venueSlug) ?? "Bytspot Patch" }
    private var venueSubtitle: String { invocation.patchContext?.subtitle ?? invocation.tier.defaultSubtitle }

    private func isBlackAviation(_ service: ClipLocalService) -> Bool {
        invocation.tier == .black && ((service.category ?? service.id).lowercased().contains("aviation") || service.id.lowercased().contains("jet"))
    }

    private func serviceBadgeText(_ service: ClipLocalService) -> String {
        if service.source == "live" { return "LIVE" }
        switch invocation.tier {
        case .black: return "ELITE GUARANTEE"
        case .platinum: return "PLATINUM HOST"
        case .green: return "LOCAL"
        }
    }

    private func serviceTileContext(_ service: ClipLocalService) -> String? {
        let parts = [service.scheduledDate, service.guestSummary, service.theme]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.prefix(3).joined(separator: " · ")
    }
}

// MARK: - Screen 2: Vendor list

struct ClipVendorListView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let service: ClipLocalService

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                filterChips
                vendorList
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 28)
        }
        .onAppear { invocation.prefetchVendors(for: service) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Button(action: { impactLight(); invocation.backToCatalog() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.white.opacity(0.10))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 2) {
                    Text("SERVICES FEED · CHOOSE")
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(ClipTheme.cyan)
                        .tracking(1.4)
                    Text(service.title)
                        .font(.system(size: 22, weight: .heavy))
                        .foregroundColor(.white)
                }
                Spacer()
            }
            Text(service.subtitle)
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.72))
                .lineSpacing(2)
        }
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ClipVendorFilter.allCases) { filter in
                    let active = invocation.vendorFilter == filter
                    Button(action: { impactLight(); invocation.vendorFilter = filter }) {
                        Text(filter.rawValue)
                            .font(.system(size: 12.5, weight: .black))
                            .foregroundColor(active ? .black : .white.opacity(0.85))
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(active ? ClipTheme.cyan : Color.white.opacity(0.08))
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(active ? .clear : Color.white.opacity(0.14), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var vendorList: some View {
        let vendors = invocation.vendors(for: service)
        let isLoading = invocation.loadingVendorsService == service.id && vendors.isEmpty
        if !invocation.hasPremiumMembershipAccess {
            premiumVendorGate
        } else if isLoading {
            VStack(spacing: 10) { ForEach(0..<3, id: \.self) { _ in vendorSkeleton } }
        } else {
            VStack(spacing: 10) {
                ForEach(vendors) { vendor in
                    Button(action: { impactMedium(); invocation.selectVendor(vendor, service: service) }) {
                        vendorRow(vendor)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func vendorRow(_ vendor: ClipVendor) -> AnyView {
        if isBlackAviationService {
            return AnyView(blackAviationVendorRow(vendor))
        }
        return AnyView(VStack(alignment: .leading, spacing: 11) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [service.tintColor.opacity(0.75), service.tintColor.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if vendor.hasPlayableVideo {
                    ClipAutoLoopingPlayer(videoURL: vendor.videoPlaybackURL, posterURL: posterURL(for: vendor), tint: service.tintColor)
                } else if let url = posterURL(for: vendor) {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                        .clipped()
                }
                LinearGradient(colors: [.clear, Color.black.opacity(0.78)], startPoint: .top, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text(vendor.theme ?? "SERVICES").clipChip(color: Color.black.opacity(0.60), foreground: .white)
                        Spacer()
                        Text(vendorTierBadge).clipChip(color: service.tintColor, foreground: .black)
                    }
                    Spacer()
                    HStack(spacing: 8) {
                        Image(systemName: vendor.hasPlayableVideo ? "play.circle.fill" : service.iconName)
                            .font(.system(size: 19, weight: .black))
                            .foregroundColor(.white)
                        Text(vendor.name).font(.system(size: 20, weight: .heavy)).foregroundColor(.white).lineLimit(2)
                    }
                    Text("\(vendor.priceFromLabel) • \(vendor.availability)")
                        .font(.system(size: 12.5, weight: .black, design: .monospaced))
                        .foregroundColor(service.tintColor)
                }
                .padding(12)
            }
            .frame(height: 184)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(vendor.tagline).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.70)).lineLimit(2)
                if let context = vendorContextLine(vendor) {
                    Text(context).font(.system(size: 11, weight: .black)).foregroundColor(.white.opacity(0.58)).lineLimit(1)
                }
                HStack(spacing: 8) {
                    if let rating = vendor.rating {
                        Label(String(format: "%.1f", rating), systemImage: "star.fill")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(ClipTheme.gold)
                    }
                    if let eta = vendor.etaLabel {
                        Text(formatEtaLabel(eta, for: service))
                            .font(.system(size: 10.5, weight: .black))
                            .foregroundColor(.white.opacity(0.7))
                    }
                }.padding(.top, 2)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 118), spacing: 7)], alignment: .leading, spacing: 7) {
                ForEach(vendorDisplayHighlights(vendor).prefix(4), id: \.self) { highlight in
                    Text(highlight).clipChip(color: Color.white.opacity(0.08), foreground: .white.opacity(0.86))
                }
            }
        }
        .padding(12)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)))
    }

    private var premiumVendorGate: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 18, weight: .black))
                    .foregroundColor(ClipTheme.cyan)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Premium membership required")
                        .font(.system(size: 16, weight: .heavy)).foregroundColor(.white)
                    Text(invocation.membershipGateMessage)
                        .font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.68))
                }
            }
            Text("Broni Home Taste, GH Akwaaba Pass, and all App Clip vendor listings live under the gated Services feed.")
                .font(.system(size: 12, weight: .bold)).foregroundColor(.white.opacity(0.72))
        }
        .padding(14)
        .background(ClipTheme.violet.opacity(0.12))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.cyan.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func posterURL(for vendor: ClipVendor) -> URL? {
        vendor.displayPosterURL ?? service.heroImageURL
    }

    private var vendorTierBadge: String {
        switch invocation.tier {
        case .black: return "ELITE GUARANTEE"
        case .platinum: return "PLATINUM"
        case .green: return "LOCAL"
        }
    }

    private func vendorContextLine(_ vendor: ClipVendor) -> String? {
        let parts = [vendor.scheduledDate, vendor.hostName, vendor.locationLabel, vendor.guestSummary]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.prefix(3).joined(separator: " · ")
    }

    private func vendorDisplayHighlights(_ vendor: ClipVendor) -> [String] {
        let combined = vendor.activityHighlights + vendor.includedHighlights
        var seen = Set<String>()
        return combined.filter { seen.insert($0).inserted }
    }

    private func blackAviationVendorRow(_ vendor: ClipVendor) -> some View {
        HStack(spacing: 14) {
            ZStack {
                LinearGradient(colors: [ClipTheme.violet.opacity(0.70), ClipTheme.magenta.opacity(0.24), Color.black.opacity(0.72)], startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "airplane.departure")
                    .font(.system(size: 24, weight: .black))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.5), radius: 4, x: 0, y: 2)
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("DEPARTURE")
                        .font(.system(size: 8.5, weight: .black))
                        .foregroundColor(ClipTheme.gold)
                        .tracking(1.1)
                    Spacer()
                }
                Text(vendor.name).font(.system(size: 15.5, weight: .heavy)).foregroundColor(.white).lineLimit(1)
                Text(vendor.tagline).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.70)).lineLimit(1)
                HStack(spacing: 8) {
                    if let eta = vendor.etaLabel {
                        Text(formatEtaLabel(eta, for: service)).font(.system(size: 10.5, weight: .black)).foregroundColor(.white.opacity(0.78))
                    }
                    Spacer()
                    Text(vendor.priceFromLabel).font(.system(size: 12.5, weight: .black, design: .monospaced)).foregroundColor(ClipTheme.gold)
                }
            }
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .black)).foregroundColor(ClipTheme.gold.opacity(0.72))
        }
        .padding(12)
        .background(LinearGradient(colors: [ClipTheme.panelElevated, ClipTheme.panel], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.violet.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var vendorSkeleton: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.10)).frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.14)).frame(width: 160, height: 13)
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.09)).frame(height: 11)
            }
            Spacer()
        }
        .padding(12)
        .background(ClipTheme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// View-layer ETA reframe. Aviation/jet/charter services swap the
    /// car-friendly "ETA X min" for the flight-board "Departing in X min".
    /// Platinum event and valet/parking services explicitly name the destination.
    private func formatEtaLabel(_ raw: String, for service: ClipLocalService) -> String {
        let cat = (service.category ?? service.id).lowercased()
        let compactEta = raw.uppercased().hasPrefix("ETA ") ? String(raw.dropFirst(4)) : raw
        let isAviation = cat.contains("aviation") || cat.contains("jet") || cat.contains("charter")
        if isAviation, raw.uppercased().hasPrefix("ETA ") { return "Departing in " + compactEta }
        if invocation.tier == .platinum {
            if cat.contains("event") || cat.contains("entry") || cat.contains("ticket") || cat.contains("pass") || cat.contains("nightlife") || cat.contains("bottle") {
                return "ETA to Stadium: \(compactEta)"
            }
            if cat.contains("park") || cat.contains("valet") || cat.contains("garage") {
                return "ETA to Parking: \(compactEta)"
            }
        }
        return raw
    }

    private var isBlackAviationService: Bool {
        invocation.tier == .black && ((service.category ?? service.id).lowercased().contains("aviation") || service.id.lowercased().contains("jet"))
    }
}

// MARK: - Screen 3: One-screen checkout

struct ClipCheckoutView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let service: ClipLocalService
    let vendor: ClipVendor
    @ObservedObject var paymentSecure: ClipPaymentSecureController
    @Binding var showOverlay: Bool
    @State private var specialRequests = ""
    @State private var phoneNumber = ""

    private var bookingContext: ClipBookingContext { .make(service: service, vendor: vendor, tier: invocation.tier) }
    private var totalCents: Int {
        if hasLineItems { return lineItemsTotalCents }
        return vendor.priceFromCents * max(invocation.guestCount, 1)
    }
    private var totalLabel: String {
        let dollars = Double(totalCents) / 100.0
        if service.currency.uppercased() == "USD" { return String(format: "$%.0f", dollars) }
        return "\(service.currency.uppercased()) \(String(format: "%.0f", dollars))"
    }
    private var checkoutGuestCount: Int {
        hasLineItems ? max(invocation.totalLineItemQuantity(checkoutLineItems), 1) : invocation.guestCount
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                vendorHero
                includedCard
                if hasLineItems { lineItemsPicker } else { guestPicker }
                bookingDetailsCard
                totalRow
                applePayBlock
                cardFallback
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 28)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button(action: { impactLight(); invocation.backToVendors(service: service) }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.10))
                    .clipShape(Circle())
            }.buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text("STEP 3 · CHECKOUT")
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(ClipTheme.accent(for: invocation.tier))
                    .tracking(1.4)
                Text(bookingContext.title)
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundColor(.white)
            }
            Spacer()
        }
    }

    @ViewBuilder
    private var vendorHero: some View {
        if isGhAkwaabaProduct {
            ghAkwaabaProductBanner
        } else if vendor.hasPlayableVideo {
            vendorHeroVideo
        } else {
            vendorHeroCompact
        }
    }

    private var isGhAkwaabaProduct: Bool {
        vendor.name.lowercased().contains("akwaaba")
    }

    private var checkoutLineItems: [ClipLineItem] {
        vendor.items?.filter { !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? []
    }

    private var hasLineItems: Bool { !checkoutLineItems.isEmpty }

    private var lineItemsSectionTitle: String {
        if isGhAkwaabaProduct { return "MATCHDAY ESSENTIALS" }
        if vendor.name.lowercased().contains("broni") { return "MATCHDAY FAVORITES" }
        return "SELECT ITEMS"
    }

    private var lineItemsTotalCents: Int {
        checkoutLineItems.reduce(0) { total, item in
            total + (invocation.quantity(for: item) * item.amountCents)
        }
    }

    private func lineItemPriceLabel(_ cents: Int) -> String {
        let dollars = Double(cents) / 100.0
        return service.currency.uppercased() == "USD" ? String(format: "$%.0f each", dollars) : "\(service.currency.uppercased()) \(String(format: "%.0f", dollars)) each"
    }

    private var ghAkwaabaProductBanner: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [ClipTheme.violet.opacity(0.72), ClipTheme.cyan.opacity(0.32), Color.black.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing)
            if vendor.hasPlayableVideo {
                ClipAutoLoopingPlayer(videoURL: vendor.videoPlaybackURL, posterURL: posterURL(for: vendor), tint: service.tintColor)
            } else if let url = posterURL(for: vendor) {
                AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                    .clipped()
            }
            LinearGradient(colors: [Color.black.opacity(0.22), Color.black.opacity(0.82)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 5) {
                Text("FIFA TICKET SALE")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(ClipTheme.cyan)
                    .tracking(1.6)
                Text("GH Akwaaba Pass")
                    .font(.system(size: 25, weight: .heavy))
                    .foregroundColor(.white)
                Text("For Ghanaians · Digital event access")
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundColor(.white.opacity(0.82))
            }
            .padding(14)
        }
        .frame(height: 132)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.cyan.opacity(0.30), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var vendorHeroCompact: some View {
        HStack(spacing: 14) {
            ZStack {
                LinearGradient(colors: [service.tintColor.opacity(0.78), service.tintColor.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let url = posterURL(for: vendor) {
                    AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }.clipped()
                }
                Image(systemName: service.iconName)
                    .font(.system(size: 26, weight: .black))
                    .foregroundColor(.white)
            }
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(vendor.name).font(.system(size: 17, weight: .heavy)).foregroundColor(.white).lineLimit(1)
                Text(service.title).font(.system(size: 12.5, weight: .black)).foregroundColor(service.tintColor)
                Text(vendor.availability).font(.system(size: 11.5, weight: .bold)).foregroundColor(.white.opacity(0.65))
                if let context = checkoutVendorContextLine {
                    Text(context).font(.system(size: 10.5, weight: .black)).foregroundColor(.white.opacity(0.58)).lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(14)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var vendorHeroVideo: some View {
        ZStack(alignment: .bottomLeading) {
            ClipAutoLoopingPlayer(
                videoURL: vendor.videoPlaybackURL,
                posterURL: posterURL(for: vendor),
                tint: service.tintColor
            )
            .aspectRatio(16.0/9.0, contentMode: .fit)

            LinearGradient(
                colors: [.clear, Color.black.opacity(0.55), Color.black.opacity(0.78)],
                startPoint: .center, endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(service.title.uppercased())
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(service.tintColor)
                    .tracking(1.4)
                Text(vendor.name)
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text(vendor.availability)
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(.white.opacity(0.78))
                if let context = checkoutVendorContextLine {
                    Text(context)
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(.white.opacity(0.70))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 12)
        }
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func posterURL(for vendor: ClipVendor) -> URL? {
        vendor.displayPosterURL ?? service.heroImageURL
    }

    private var checkoutVendorContextLine: String? {
        let parts = [vendor.scheduledDate, vendor.hostName, vendor.locationLabel, vendor.guestSummary]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.prefix(3).joined(separator: " · ")
    }

    private var includedCard: some View {
        let highlights = vendor.includedHighlights.isEmpty
            ? ["Apple Pay Secure", "Free cancellation up to 1 hr", "Receipts on demand", "Priority support"]
            : Array(vendor.includedHighlights.prefix(4))
        return VStack(alignment: .leading, spacing: 10) {
            Text("WHAT'S INCLUDED").font(.system(size: 11, weight: .black)).foregroundColor(ClipTheme.cyan).tracking(1.3)
            ForEach(highlights, id: \.self) { item in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14, weight: .black))
                        .foregroundColor(ClipTheme.emerald)
                    Text(item).font(.system(size: 13, weight: .semibold)).foregroundColor(.white.opacity(0.88))
                    Spacer()
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var guestPicker: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Guests").font(.system(size: 14, weight: .heavy)).foregroundColor(.white)
                Text("Tap to adjust").font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.6))
            }
            Spacer()
            HStack(spacing: 14) {
                Button(action: { impactLight(); invocation.decrementGuests() }) {
                    Image(systemName: "minus").font(.system(size: 13, weight: .black)).foregroundColor(.white)
                        .frame(width: 34, height: 34).background(Color.white.opacity(0.10)).clipShape(Circle())
                }.buttonStyle(.plain)
                Text("\(invocation.guestCount)")
                    .font(.system(size: 18, weight: .heavy, design: .monospaced))
                    .foregroundColor(.white)
                    .frame(minWidth: 26)
                Button(action: { impactLight(); invocation.incrementGuests() }) {
                    Image(systemName: "plus").font(.system(size: 13, weight: .black)).foregroundColor(.black)
                        .frame(width: 34, height: 34).background(ClipTheme.cyan).clipShape(Circle())
                }.buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var lineItemsPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(lineItemsSectionTitle)
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(ClipTheme.cyan)
                    .tracking(1.3)
                Spacer()
                Text("Qty")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white.opacity(0.55))
            }
            ForEach(checkoutLineItems) { item in
                lineItemRow(item)
            }
        }
        .padding(14)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.cyan.opacity(0.18), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func lineItemRow(_ item: ClipLineItem) -> some View {
        let quantity = invocation.quantity(for: item)
        let canSubtract = quantity > item.minQuantity
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label)
                    .font(.system(size: 14.5, weight: .heavy))
                    .foregroundColor(.white)
                Text(lineItemPriceLabel(item.amountCents))
                    .font(.system(size: 11.5, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.62))
            }
            Spacer()
            HStack(spacing: 10) {
                Button(action: { impactLight(); invocation.adjustLineItem(item, delta: -1) }) {
                    Image(systemName: "minus")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.white.opacity(canSubtract ? 1 : 0.35))
                        .frame(width: 30, height: 30)
                        .background(Color.white.opacity(canSubtract ? 0.12 : 0.06))
                        .clipShape(Circle())
                }.buttonStyle(.plain).disabled(!canSubtract)
                Text("\(quantity)")
                    .font(.system(size: 16, weight: .heavy, design: .monospaced))
                    .foregroundColor(.white)
                    .frame(minWidth: 22)
                Button(action: { impactLight(); invocation.adjustLineItem(item, delta: 1) }) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.black)
                        .frame(width: 30, height: 30)
                        .background(ClipTheme.cyan)
                        .clipShape(Circle())
                }.buttonStyle(.plain)
            }
        }
    }

    private var bookingDetailsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(bookingContext.eyebrow)
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(ClipTheme.accent(for: invocation.tier))
                    .tracking(1.3)
                Spacer()
                if bookingContext.holdMinutes > 0 {
                    Text("Vendor confirms in \(bookingContext.holdMinutes)m")
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(.black)
                        .padding(.horizontal, 9).padding(.vertical, 5)
                        .background(ClipTheme.gold)
                        .clipShape(Capsule())
                }
            }
            if bookingContext.requiresSpecialRequests {
                TextField("Special requests, allergies, access notes…", text: $specialRequests)
                    .font(.system(size: 13, weight: .semibold))
                    .textInputAutocapitalization(.sentences)
                    .padding(12)
                    .foregroundColor(.white)
                    .accentColor(.white)
                    .colorScheme(.dark)
                    .background(Color(red: 0.14, green: 0.15, blue: 0.18))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.24), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            if bookingContext.requiresPhoneNumber {
                TextField("Phone number for SMS coordination", text: $phoneNumber)
                    .font(.system(size: 13, weight: .semibold))
                    .keyboardType(.phonePad)
                    .padding(12)
                    .foregroundColor(.white)
                    .accentColor(.white)
                    .colorScheme(.dark)
                    .background(Color(red: 0.14, green: 0.15, blue: 0.18))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.24), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            Text(bookingContext.authorizationNote)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white.opacity(0.68))
                .lineSpacing(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var totalRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(bookingContext.isHighTicket ? "Hold amount" : "Total").font(.system(size: 12.5, weight: .black)).foregroundColor(.white.opacity(0.7)).tracking(1)
                Text(totalLabel).font(.system(size: 28, weight: .heavy, design: .monospaced)).foregroundColor(.white)
            }
            Spacer()
            Text("Apple Pay Secure")
                .font(.system(size: 11, weight: .black))
                .foregroundColor(ClipTheme.emerald)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(ClipTheme.emerald.opacity(0.12))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(ClipTheme.emerald.opacity(0.4), lineWidth: 1))
        }
    }

    private var applePayBlock: some View {
        VStack(spacing: 10) {
            Button(action: {
                impactMedium()
                paymentSecure.startApplePay(
                    service: service,
                    patchId: invocation.patchId ?? invocation.patchContext?.patchId,
                    vendorId: vendor.id,
                    guestCount: checkoutGuestCount,
                    amountCentsOverride: totalCents,
                    lineLabel: "\(vendor.name) · \(service.title)"
                )
            }) {
                HStack(spacing: 10) {
                    Image(systemName: "apple.logo").font(.system(size: 17, weight: .black))
                    Text(bookingContext.cta).font(.system(size: 18, weight: .heavy))
                    Text(totalLabel).font(.system(size: 18, weight: .heavy, design: .monospaced)).opacity(0.85)
                }
                .foregroundColor(.white)
                .padding(.vertical, 17)
                .frame(maxWidth: .infinity)
                .background(Color.black)
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.18), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(paymentSecure.isAuthorizing)

            if paymentSecure.isAuthorizing {
                ProgressView("Authorizing Apple Pay Secure…")
                    .font(.system(size: 12, weight: .bold))
                    .tint(ClipTheme.cyan)
                    .foregroundColor(.white.opacity(0.8))
            }
            if let message = paymentSecure.statusMessage {
                Text(message)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(paymentSecure.statusTone == .success ? ClipTheme.emerald : paymentSecure.statusTone == .warning ? .yellow : .white.opacity(0.72))
                    .multilineTextAlignment(.leading)
            }
            #if DEBUG
            Button(action: { impactMedium(); paymentSecure.simulateSuccess(service: service, amountCents: totalCents) }) {
                Text("Simulate booking (preview)")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white.opacity(0.55))
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
            #endif
        }
    }

    private var cardFallback: some View {
        Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
            HStack(spacing: 8) {
                Image(systemName: "creditcard.and.123")
                Text("Pay with card in the full Bytspot app")
                Spacer()
                Image(systemName: "chevron.right")
            }
            .font(.system(size: 12.5, weight: .black))
            .foregroundColor(.white.opacity(0.78))
            .padding(.vertical, 13).padding(.horizontal, 14)
            .background(Color.white.opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }.buttonStyle(.plain)
    }
}

// MARK: - Screen 4: Success / retention

struct ClipSuccessView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    let service: ClipLocalService
    let vendor: ClipVendor
    let bookingRef: String
    @Binding var showOverlay: Bool
    @State private var timeRemaining = 0
    @State private var isHoldExpired = false
    @State private var showFeedbackSheet = false
    @State private var showFeedbackPrompt = false
    @State private var rating = 5
    @State private var comment = ""
    @State private var feedbackSubmitted = false
    @State private var showValetArrivalConfirmation = false
    @State private var showDocksideValetConfirmation = false
    @State private var showPlatinumDigitalPass = false
    @State private var hasViewedPlatinumDigitalPass = false
    @State private var didAutoOpenPlatinumPassForPreview = false
    @State private var showShareSheet = false

    private var bookingContext: ClipBookingContext { .make(service: service, vendor: vendor, tier: invocation.tier) }
    private var hasGroundLogistics: Bool {
        vendor.includedHighlights.contains { $0.lowercased().contains("ground transport") || $0.lowercased().contains("chauffeur") }
    }
    private var isBlackAviationService: Bool {
        guard invocation.tier == .black else { return false }
        let text = [service.id, service.title, service.category ?? ""]
            .joined(separator: " ")
            .lowercased()
        return text.contains("black-aviation") || text.contains("aviation") || text.contains("jet") || text.contains("charter")
    }
    private var isBlackMarineService: Bool {
        guard invocation.tier == .black else { return false }
        let text = [service.id, service.title, service.category ?? ""]
            .joined(separator: " ")
            .lowercased()
        return text.contains("black-marine") || text.contains("yacht") || text.contains("marine") || text.contains("vessel")
    }
    private var isBlackLuxuryHoldService: Bool { isBlackAviationService || isBlackMarineService }
    private var isPlatinumEventService: Bool {
        guard invocation.tier == .platinum else { return false }
        let text = [service.id, service.title, service.category ?? "", vendor.name]
            .joined(separator: " ")
            .lowercased()
        return text.contains("platinum-entry")
            || text.contains("event")
            || text.contains("entry")
            || text.contains("ticket")
            || text.contains("pass")
            || text.contains("fifa")
            || text.contains("matchday")
            || text.contains("nightlife")
            || text.contains("bottle")
            || text.contains("vip")
            || text.contains("akwaaba")
    }
    private var isPlatinumParkingOrValetService: Bool {
        guard invocation.tier == .platinum else { return false }
        let text = [service.id, service.title, service.category ?? "", vendor.name]
            .joined(separator: " ")
            .lowercased()
        return text.contains("parking") || text.contains("park") || text.contains("valet") || text.contains("garage")
    }
    private var isPlatinumDiningService: Bool {
        guard invocation.tier == .platinum else { return false }
        let text = [service.id, service.title, service.category ?? "", vendor.name, vendor.tagline]
            .joined(separator: " ")
            .lowercased()
        return text.contains("dining") || text.contains("food") || text.contains("table") || text.contains("restaurant") || text.contains("broni")
    }
    private var hidesPropertyAccessAction: Bool {
        isPlatinumDiningService || (service.category ?? "").lowercased().contains("dining")
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            if isHoldExpired {
                expiredState
                    .padding(.horizontal, 18)
                    .padding(.top, 80)
                    .padding(.bottom, 28)
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    successHero
                    bookingCard
                    authorizationCard
                    securityGuaranteeCard
                    countdownCard
                    if !isBlackLuxuryHoldService && !isPlatinumEventService { whatsIncluded }
                    primaryActions
                    shareAccessAction
                    if !isBlackLuxuryHoldService { secondaryActions }
                }
                .padding(.horizontal, 18)
                .padding(.top, 22)
                .padding(.bottom, 28)
            }
        }
        .overlay(alignment: .bottom) {
            feedbackPromptToast
                .padding(.horizontal, 18)
                .padding(.bottom, 14)
        }
        .onAppear {
            configureTimerState()
            presentFeedbackPrompt()
            autoOpenPlatinumPassForPreviewIfNeeded()
        }
        .onChange(of: invocation.invocationURL) { _ in
            didAutoOpenPlatinumPassForPreview = false
            configureTimerState()
            presentFeedbackPrompt()
            autoOpenPlatinumPassForPreviewIfNeeded()
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            guard bookingContext.holdMinutes > 0, !isHoldExpired else { return }
            if timeRemaining > 0 {
                timeRemaining -= 1
            } else {
                isHoldExpired = true
            }
        }
        .sheet(isPresented: $showFeedbackSheet) {
            ClipFeedbackSheet(rating: $rating, comment: $comment, submitted: $feedbackSubmitted) {
                feedbackSubmitted = true
                showFeedbackPrompt = false
                showFeedbackSheet = false
            }
        }
        .sheet(isPresented: $showPlatinumDigitalPass) {
            PlatinumDigitalPassSheet(ticketURL: platinumEventDigitalPassURL, eyebrow: platinumEventPassEyebrow, passTitle: platinumEventPassDisplayName, bookingRef: bookingRef, vendorName: vendor.name) {
                impactMedium()
                openFullApp(url: platinumEventPassHandoffURL(intent: "save_to_wallet"), showOverlay: $showOverlay)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ClipShareSheet(items: shareAccessItems)
        }
        .confirmationDialog("Coordinate Valet Arrival?", isPresented: $showValetArrivalConfirmation, titleVisibility: .visible) {
            Button("Continue to Valet Arrival") {
                impactHeavy()
                openValetBoutiqueServices()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Valet coordination does not trigger additional charges. Logistics coordination is complimentary; your primary hold is only captured upon aircraft confirmation.")
        }
        .confirmationDialog("Coordinate Dockside Valet?", isPresented: $showDocksideValetConfirmation, titleVisibility: .visible) {
            Button("Continue to Dockside Valet") {
                impactHeavy()
                openValetBoutiqueServices()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Dockside valet coordination does not trigger additional charges. Dockside coordination is complimentary; your primary hold is only captured upon vessel confirmation.")
        }
    }

    private var forcedExpiredForPreview: Bool {
        guard let url = invocation.invocationURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return (components.queryItems ?? []).contains { item in
            ["expired", "holdExpired"].contains(item.name) && item.value != "0"
        }
    }

    private var holdRemainingOverrideForPreview: Int? {
        #if DEBUG
        guard let url = invocation.invocationURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let rawValue = (components.queryItems ?? []).first(where: { item in
                  ["holdRemaining", "holdRemainingSeconds", "remainingSeconds"].contains(item.name)
              })?.value,
              let seconds = Int(rawValue) else { return nil }
        let maxSeconds = max(bookingContext.holdMinutes * 60, 0)
        return min(max(seconds, 0), maxSeconds)
        #else
        return nil
        #endif
    }

    private func configureTimerState() {
        guard bookingContext.holdMinutes > 0 else {
            timeRemaining = 0
            isHoldExpired = false
            return
        }
        if forcedExpiredForPreview {
            timeRemaining = 0
            isHoldExpired = true
        } else if let override = holdRemainingOverrideForPreview {
            timeRemaining = override
            isHoldExpired = override <= 0
        } else if timeRemaining <= 0 {
            timeRemaining = bookingContext.holdMinutes * 60
            isHoldExpired = false
        }
    }

    private func presentFeedbackPrompt() {
        guard !isBlackLuxuryHoldService, !isPlatinumEventService, !feedbackSubmitted, !isHoldExpired else { return }
        showFeedbackPrompt = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) {
            guard !showFeedbackSheet, !feedbackSubmitted else { return }
            withAnimation(.easeOut(duration: 0.25)) { showFeedbackPrompt = false }
        }
    }

    private func autoOpenPlatinumPassForPreviewIfNeeded() {
        #if DEBUG
        guard isPlatinumEventService, !didAutoOpenPlatinumPassForPreview,
              let url = invocation.invocationURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              (components.queryItems ?? []).contains(where: { ["autoOpenPass", "openPass"].contains($0.name) && $0.value != "0" }) else { return }
        didAutoOpenPlatinumPassForPreview = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            hasViewedPlatinumDigitalPass = true
            showPlatinumDigitalPass = true
        }
        #endif
    }

    @ViewBuilder
    private var feedbackPromptToast: some View {
        if showFeedbackPrompt && !feedbackSubmitted && !isHoldExpired {
            Button(action: {
                impactLight()
                showFeedbackPrompt = false
                showFeedbackSheet = true
            }) {
                HStack(spacing: 9) {
                    Image(systemName: "star.fill")
                    Text("Rate this experience")
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .font(.system(size: 12.5, weight: .black))
                .foregroundColor(.white.opacity(0.86))
                .padding(.vertical, 11).padding(.horizontal, 13)
                .background(Color.black.opacity(0.72))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.35), radius: 16, x: 0, y: 10)
            }
            .buttonStyle(.plain)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private var expiredState: some View {
        VStack(spacing: 20) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 48, weight: .semibold))
                .foregroundColor(.white.opacity(0.62))
            Text("Request Window Expired")
                .font(.system(size: 26, weight: .heavy))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
            Text("We've released your hold. Here are immediate alternatives from the Bytspot Black desk.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white.opacity(0.72))
                .multilineTextAlignment(.center)
                .lineSpacing(2)
            Button(action: { impactMedium(); invocation.backToCatalog() }) {
                Text("Explore Alternatives")
                    .font(.system(size: 16, weight: .black))
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(LinearGradient(colors: [.white, ClipTheme.gold.opacity(0.92)], startPoint: .leading, endPoint: .trailing))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            Text("🛡️ Bytspot Elite Guarantee: $1M logistics insurance + 24/7 concierge.")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white.opacity(0.62))
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    @ViewBuilder
    private var countdownCard: some View {
        if bookingContext.holdMinutes > 0 {
            if isBlackLuxuryHoldService {
                protectedHoldStatusCard
            } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Request sent")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.white.opacity(0.62))
                    .tracking(1.2)
                Text("45-minute confirmation window • \(timeString(from: timeRemaining)) remaining")
                    .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.68))
                Text("\(vendor.name) has \(bookingContext.holdMinutes) minutes to respond before the authorization is released automatically.")
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.white.opacity(0.52))
                    .lineSpacing(2)
            }
            .padding(.horizontal, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            Text(instantSuccessLogisticsCopy)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.62))
                .lineSpacing(2)
                .padding(.horizontal, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var holdProgress: Double {
        let total = max(Double(bookingContext.holdMinutes * 60), 1)
        return min(max(Double(timeRemaining) / total, 0), 1)
    }

    private var isHoldNearingExpiration: Bool {
        isBlackLuxuryHoldService && timeRemaining > 0 && timeRemaining <= 10 * 60
    }

    private var platinumEtaDestination: String {
        isPlatinumParkingOrValetService ? "Parking" : "Stadium"
    }

    private var platinumEtaSummary: String {
        let raw = vendor.etaLabel ?? "coordinating now"
        let compactEta = raw.uppercased().hasPrefix("ETA ") ? String(raw.dropFirst(4)) : raw.lowercased()
        return "ETA to \(platinumEtaDestination): \(compactEta)"
    }

    private var platinumEventPassDisplayName: String {
        let vendorName = vendor.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if vendorName.lowercased().contains("akwaaba") { return "GH Akwaaba Pass" }
        if !vendorName.isEmpty && vendorName.lowercased().contains("pass") { return vendorName }
        if !vendorName.isEmpty && isPlatinumEventService { return "\(vendorName) Pass" }
        let serviceName = service.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if serviceName.lowercased().contains("akwaaba") { return "GH Akwaaba Pass" }
        if serviceName.lowercased().contains("event access") { return "Platinum Event Pass" }
        if !serviceName.isEmpty { return "\(serviceName) Pass" }
        return "Platinum Event Pass"
    }

    private var platinumEventPassEyebrow: String {
        vendor.name.lowercased().contains("akwaaba") ? "GH AKWAABA PASS" : "EVENT PASS"
    }

    private var shareAccessURL: URL {
        if let url = invocation.invocationURL { return url }
        if let url = invocation.mainAppHandoffURL { return url }
        if let url = URL(string: "https://bytspot.app/p/\(bookingRef)?tier=\(invocation.tier.rawValue)") { return url }
        return URL(string: "https://bytspot.app")!
    }

    private var shareAccessItems: [Any] {
        let productName = isPlatinumEventService ? platinumEventPassDisplayName : service.title
        return ["Bytspot access for \(productName) · booking \(bookingRef)", shareAccessURL]
    }

    private var successAccent: Color {
        if isBlackLuxuryHoldService { return ClipTheme.gold }
        if invocation.tier == .platinum { return ClipTheme.accent(for: .platinum) }
        return ClipTheme.emerald
    }

    private var instantSuccessLogisticsCopy: String {
        if isPlatinumEventService {
            return "Your \(platinumEventPassDisplayName) is ready. \(platinumEtaSummary). Use the digital pass and ride actions below for event arrival."
        }
        if isPlatinumParkingOrValetService {
            return "Your valet parking is confirmed. \(platinumEtaSummary). Use route and valet actions below for arrival logistics."
        }
        if isPlatinumDiningService {
            return "Your order is confirmed instantly. Track live status or open Bytspot for pickup and delivery details."
        }
        return "Your booking is confirmed instantly. Use the route and valet actions below for arrival logistics."
    }

    private var confirmationSubject: String {
        isBlackMarineService ? "vessel" : "aircraft"
    }

    private var protectedHoldWindowLabel: String {
        isBlackMarineService ? "Vessel confirmation window" : "45-minute confirmation window"
    }

    private var conciergeStatusHelpText: String {
        if isBlackMarineService {
            return "Opens manual vessel status and Black Desk updates in the main app."
        }
        return "Opens manual flight status and Black Desk updates in the main app."
    }

    private func blackAviationConciergeHandoffURL(reason: String = "flight_monitoring") -> URL? {
        blackConciergeHandoffURL(context: "black_aviation_hold", intent: reason)
    }

    private func blackMarineConciergeHandoffURL(reason: String = "vessel_monitoring") -> URL? {
        blackConciergeHandoffURL(context: "black_marine_hold", intent: reason)
    }

    private func activeBlackConciergeHandoffURL() -> URL? {
        if isBlackMarineService { return blackMarineConciergeHandoffURL() }
        return blackAviationConciergeHandoffURL(reason: isHoldNearingExpiration ? "hold_expiring" : "concierge_status")
    }

    private func blackConciergeHandoffURL(context: String, intent: String) -> URL? {
        guard let baseURL = invocation.mainAppHandoffURL,
              var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return invocation.mainAppHandoffURL
        }
        var items = components.queryItems ?? []
        let extras = [
            URLQueryItem(name: "context", value: context),
            URLQueryItem(name: "support", value: isHoldNearingExpiration ? "urgent" : "active"),
            URLQueryItem(name: "destination", value: "black_concierge"),
            URLQueryItem(name: "view", value: "manual_status"),
            URLQueryItem(name: "intent", value: intent),
            URLQueryItem(name: "bookingRef", value: bookingRef),
            URLQueryItem(name: "serviceId", value: service.id),
            URLQueryItem(name: "vendorId", value: vendor.id)
        ]
        for item in extras {
            items.removeAll { $0.name == item.name }
            items.append(item)
        }
        components.queryItems = items
        return components.url
    }

    private var platinumEventDigitalPassURL: URL {
        if let directURL = platinumEventDirectTicketURL { return directURL }

        var components = URLComponents(url: ClipPatchVerifier.baseURL.appendingPathComponent("events/platinum/digital-pass"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "patchId", value: invocation.patchId ?? invocation.patchContext?.patchId),
            URLQueryItem(name: "bookingRef", value: bookingRef),
            URLQueryItem(name: "serviceId", value: service.id),
            URLQueryItem(name: "vendorId", value: vendor.id),
            URLQueryItem(name: "vendor", value: vendor.name),
            URLQueryItem(name: "tier", value: "platinum"),
            URLQueryItem(name: "source", value: "app_clip"),
            URLQueryItem(name: "intent", value: "web-view-first")
        ].filter { !($0.value ?? "").isEmpty }
        return components?.url ?? URL(string: "https://bytspot.app/pass")!
    }

    private var platinumEventDirectTicketURL: URL? {
        guard let url = invocation.invocationURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let names = Set(["ticketUrl", "ticketURL", "digitalPassUrl", "digitalPassURL", "passUrl", "passURL"])
        guard let raw = (components.queryItems ?? []).first(where: { names.contains($0.name) })?.value,
              let directURL = URL(string: raw),
              directURL.scheme?.lowercased() == "https" else { return nil }
        return directURL
    }

    private func platinumEventPassHandoffURL(intent: String = "web-view-first") -> URL? {
        guard let baseURL = invocation.mainAppHandoffURL,
              var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return invocation.mainAppHandoffURL
        }
        var items = components.queryItems ?? []
        let isWebViewFirst = intent == "web-view-first"
        let isWalletSave = intent == "save_to_wallet"
        let extras = [
            URLQueryItem(name: "context", value: "platinum_event_pass"),
            URLQueryItem(name: "destination", value: isWalletSave ? "wallet" : "digital_pass"),
            URLQueryItem(name: "view", value: "event_pass"),
            URLQueryItem(name: "intent", value: intent),
            URLQueryItem(name: "handoff", value: isWebViewFirst ? "0" : "1"),
            URLQueryItem(name: "handoffMode", value: isWebViewFirst ? "web_view_first" : "explicit_wallet_save"),
            URLQueryItem(name: "appStoreOverlay", value: isWebViewFirst ? "deferred" : "allowed"),
            URLQueryItem(name: "persist", value: isWalletSave ? "wallet" : "deferred"),
            URLQueryItem(name: "ticketUrl", value: platinumEventDigitalPassURL.absoluteString),
            URLQueryItem(name: "bookingRef", value: bookingRef),
            URLQueryItem(name: "serviceId", value: service.id),
            URLQueryItem(name: "vendorId", value: vendor.id),
            URLQueryItem(name: "vendor", value: vendor.name)
        ]
        for item in extras {
            items.removeAll { $0.name == item.name }
            items.append(item)
        }
        components.queryItems = items
        return components.url
    }

    private var protectedHoldStatusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                ZStack {
                    Circle().fill(ClipTheme.gold.opacity(0.16)).frame(width: 30, height: 30)
                    Image(systemName: "shield.checkered")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(ClipTheme.gold)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("PROTECTED HOLD ACTIVE")
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(ClipTheme.gold)
                        .tracking(1.25)
                    Text("\(protectedHoldWindowLabel) • \(timeString(from: timeRemaining)) remaining")
                        .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.82))
                }
                Spacer()
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    Capsule()
                        .fill(LinearGradient(colors: [ClipTheme.gold, ClipTheme.violet, ClipTheme.magenta.opacity(0.8)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(proxy.size.width * holdProgress, 8))
                }
            }
            .frame(height: 4)

            Text("\(vendor.name) has \(bookingContext.holdMinutes) minutes to confirm the \(confirmationSubject) window before the authorization is released automatically.")
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.56))
                .lineSpacing(2)
        }
        .padding(14)
        .background(Color.black.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(ClipTheme.gold.opacity(0.18), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    @ViewBuilder
    private var authorizationCard: some View {
        if bookingContext.isHighTicket {
            VStack(spacing: 10) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundColor(isBlackLuxuryHoldService ? ClipTheme.gold : .white.opacity(0.72))
                Text(isBlackLuxuryHoldService ? "Hold Authorization Active" : "Funds Securely Authorized")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundColor(.white)
                Text(isBlackLuxuryHoldService ? "Funds are authorized only and captured upon \(confirmationSubject) confirmation." : "You will only be charged once the vendor confirms.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
                if isBlackLuxuryHoldService {
                    Divider().background(Color.white.opacity(0.10))
                    Text(isBlackMarineService ? "Dockside coordination is complimentary; your primary hold is only captured upon vessel confirmation." : "Logistics coordination is complimentary; your primary hold is only captured upon aircraft confirmation.")
                        .font(.system(size: 11.5, weight: .bold))
                        .foregroundColor(.white.opacity(0.58))
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(isBlackLuxuryHoldService ? ClipTheme.background.opacity(0.96) : ClipTheme.panel)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(isBlackLuxuryHoldService ? ClipTheme.gold.opacity(0.24) : Color.white.opacity(0.08), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    @ViewBuilder
    private var securityGuaranteeCard: some View {
        if isBlackLuxuryHoldService {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "shield.checkered")
                    .font(.system(size: 20, weight: .black))
                    .foregroundColor(ClipTheme.gold)
                    .frame(width: 34, height: 34)
                    .background(ClipTheme.gold.opacity(0.12))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text("BYTSPOT BLACK ELITE GUARANTEE")
                        .font(.system(size: 10.5, weight: .black))
                        .foregroundColor(ClipTheme.gold)
                        .tracking(1.2)
                    Button(action: { impactHeavy(); openFullApp(url: activeBlackConciergeHandoffURL(), showOverlay: $showOverlay) }) {
                        HStack(spacing: 8) {
                            Image(systemName: isHoldNearingExpiration ? "exclamationmark.message.fill" : "message.fill")
                            Text(isHoldNearingExpiration ? "Contact Concierge" : "Live Black Concierge")
                            Spacer()
                            Text(isHoldNearingExpiration ? "Priority" : "Active")
                                .font(.system(size: 10, weight: .black))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(ClipTheme.gold.opacity(0.16))
                                .clipShape(Capsule())
                        }
                        .font(.system(size: 12.5, weight: .black))
                        .foregroundColor(.white)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 12)
                        .background(ClipTheme.gold.opacity(0.10))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(ClipTheme.gold.opacity(0.22), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    Text("$1M Logistics Insurance + 24/7 Concierge")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(.white)
                    Text("Protection is active while your \(confirmationSubject) hold is pending. Concierge support remains available through confirmation or automatic release.")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.62))
                        .lineSpacing(2)
                    if !isHoldNearingExpiration {
                        Text(conciergeStatusHelpText)
                            .font(.system(size: 10.8, weight: .bold))
                            .foregroundColor(.white.opacity(0.48))
                    }
                    if isHoldNearingExpiration {
                        Text("Hold window is nearing release. Concierge opens with priority support.")
                            .font(.system(size: 10.8, weight: .bold))
                            .foregroundColor(ClipTheme.gold.opacity(0.78))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.86))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ClipTheme.gold.opacity(0.24), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: ClipTheme.gold.opacity(0.08), radius: 14, x: 0, y: 8)
        }
    }

    @ViewBuilder
    private var whatsIncluded: some View {
        let highlights = Array(vendor.includedHighlights.prefix(4))
        if !highlights.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("WHAT'S INCLUDED")
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(ClipTheme.accent(for: invocation.tier))
                    .tracking(1.3)
                ForEach(highlights, id: \.self) { item in
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14, weight: .black))
                            .foregroundColor(isBlackAviationService ? ClipTheme.gold : ClipTheme.emerald)
                        Text(item)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.88))
                        Spacer()
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ClipTheme.panel)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    private var successHero: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack {
                Circle().fill((isBlackLuxuryHoldService ? ClipTheme.violet : successAccent).opacity(0.20)).frame(width: 110, height: 110)
                Circle().fill((isBlackLuxuryHoldService ? ClipTheme.magenta : successAccent).opacity(0.35)).frame(width: 80, height: 80)
                Image(systemName: "checkmark")
                    .font(.system(size: 36, weight: .black))
                    .foregroundColor(.black)
                    .frame(width: 64, height: 64)
                    .background(successAccent)
                    .clipShape(Circle())
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 4)

            VStack(alignment: .leading, spacing: 6) {
                Text(bookingContext.isHighTicket ? "STEP 4 · HOLD PLACED" : "STEP 4 · CONFIRMED")
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(successAccent)
                    .tracking(1.4)
                Text(isBlackAviationService ? "Private Aviation Hold Secured" : isBlackMarineService ? "Yacht & Marine Hold Secured" : isPlatinumEventService ? "\(platinumEventPassDisplayName) Confirmed" : bookingContext.isHighTicket ? "Hold Placed Successfully" : "You're set.")
                    .font(.system(size: 32, weight: .heavy))
                    .foregroundColor(.white)
                Text(isBlackAviationService ? "The Bytspot Black aviation desk is aligning arrival access, ground movement, and outbound charter details with \(vendor.name)." : isBlackMarineService ? "The Bytspot Black marine desk is aligning dockside access, vessel timing, and arrival support with \(vendor.name)." : isPlatinumEventService ? "\(vendor.name) is preparing your digital pass, fast-track entry, and concierge arrival support." : bookingContext.isHighTicket ? "\(vendor.name) is reviewing your \(service.title.lowercased()) request." : "\(vendor.name) is preparing your \(service.title.lowercased()).")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white.opacity(0.78))
                    .lineSpacing(2)
            }
        }
    }

    private var bookingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("BOOKING REF")
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(.white.opacity(0.6))
                    .tracking(1.2)
                Spacer()
                Button(action: {
                    impactLight()
                    UIPasteboard.general.string = bookingRef
                }) {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(.white.opacity(0.7))
                }.buttonStyle(.plain)
            }
            Text(bookingRef)
                .font(.system(size: 18, weight: .heavy, design: .monospaced))
                .foregroundColor(.white)
                .lineLimit(1)
                .truncationMode(.middle)
            Divider().background(Color.white.opacity(0.10))
            HStack(spacing: 14) {
                infoColumn(title: "Vendor", value: vendor.name)
                infoColumn(title: "Guests", value: "\(invocation.guestCount)")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isBlackLuxuryHoldService ? ClipTheme.background.opacity(0.94) : ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(isBlackLuxuryHoldService ? ClipTheme.magenta.opacity(0.24) : Color.white.opacity(0.10), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func infoColumn(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased()).font(.system(size: 9.5, weight: .black)).foregroundColor(.white.opacity(0.55)).tracking(1)
            Text(value).font(.system(size: 13, weight: .heavy)).foregroundColor(.white).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var primaryActions: some View {
        VStack(spacing: 10) {
            if isBlackAviationService {
                blackAviationLogisticsActions
            } else if isBlackMarineService {
                blackMarineLogisticsActions
            } else if isPlatinumEventService {
                platinumEventLogisticsActions
            } else {
                defaultLogisticsActions
                fullAppAction
            }
        }
    }

    private var shareAccessAction: some View {
        Button(action: { impactLight(); showShareSheet = true }) {
            HStack(spacing: 10) {
                Image(systemName: "square.and.arrow.up")
                Text("Share Access")
                Spacer()
                Text("iMessage, AirDrop")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white.opacity(0.52))
            }
            .font(.system(size: 13.5, weight: .black))
            .foregroundColor(.white.opacity(0.88))
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(Color.white.opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var fullAppAction: some View {
        Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
            HStack(spacing: 10) {
                Image(systemName: "arrow.down.app.fill")
                Text("Get the full Bytspot app")
                Spacer()
                Image(systemName: "chevron.right")
            }
            .font(.system(size: 14, weight: .black))
            .foregroundColor(.white)
            .padding(.vertical, 14).padding(.horizontal, 15)
            .background(Color.white.opacity(0.10))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.16), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }.buttonStyle(.plain)
    }

    @ViewBuilder
    private var defaultLogisticsActions: some View {
        switch bookingContext.logisticsMode {
        case .inboundToUser:
            if !hidesPropertyAccessAction {
                Button(action: { impactMedium(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                    actionRow(icon: "house.fill", title: "Provide Property Access", foreground: .black, background: LinearGradient(colors: [.white, ClipTheme.gold.opacity(0.92)], startPoint: .leading, endPoint: .trailing))
                }.buttonStyle(.plain)
            }

            Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                actionRow(icon: "map.fill", title: "Track Live ETA", foreground: .white, background: LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
            }.buttonStyle(.plain)

        case .outboundToVenue:
            Button(action: { impactMedium(); openInMaps() }) {
                actionRow(icon: "location.north.line.fill", title: isPlatinumParkingOrValetService ? "ETA to Parking" : "View Live Route & Valet", foreground: .black, background: LinearGradient(colors: [.white, ClipTheme.cyan.opacity(0.92)], startPoint: .leading, endPoint: .trailing))
            }.buttonStyle(.plain)

            Button(action: { impactLight(); openBlackRide() }) {
                actionRow(icon: hasGroundLogistics ? "car.fill" : "arrow.up.forward.app.fill", title: "Request Black Ride", foreground: .white, background: LinearGradient(colors: [ClipTheme.cyan.opacity(0.34), ClipTheme.violet.opacity(0.30)], startPoint: .topLeading, endPoint: .bottomTrailing))
            }.buttonStyle(.plain)
        }
    }

    private var blackAviationLogisticsActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "airplane.departure")
                    .foregroundColor(ClipTheme.gold)
                Text("BLACK AVIATION LOGISTICS")
                    .font(.system(size: 10.5, weight: .black))
                    .tracking(1.4)
                    .foregroundColor(ClipTheme.gold)
                Spacer()
            }

            logisticsSection(title: "Inbound Logistics", subtitle: "Valet staging, luggage handoff, and arrival support.", accent: ClipTheme.gold) {
                Button(action: { impactHeavy(); openFullApp(url: blackAviationConciergeHandoffURL(), showOverlay: $showOverlay) }) {
                    blackActionRow(icon: "airplane.arrival", title: "Track Live Flight Route", detail: "Concierge-managed flight monitoring and arrival updates", gradient: LinearGradient(colors: [Color.white.opacity(0.12), ClipTheme.gold.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)

                Button(action: { impactHeavy(); showValetArrivalConfirmation = true }) {
                    blackActionRow(icon: "car.side.and.exclamationmark.fill", title: "Valet Arrival", detail: "Stage chauffeur, luggage, and receiving valet", gradient: LinearGradient(colors: [Color.white.opacity(0.12), ClipTheme.gold.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)
            }

            logisticsSection(title: "Outbound Logistics", subtitle: "Departure ride and tarmac timing.", accent: ClipTheme.magenta) {
                Button(action: { impactHeavy(); openBlackRide() }) {
                    blackActionRow(icon: "car.fill", title: "Request Black Ride", detail: "Uber or Lyft if installed", gradient: LinearGradient(colors: [ClipTheme.violet.opacity(0.42), ClipTheme.magenta.opacity(0.34)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(LinearGradient(colors: [Color.black.opacity(0.96), ClipTheme.panel.opacity(0.92)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(ClipTheme.gold.opacity(0.26), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: ClipTheme.magenta.opacity(0.12), radius: 18, x: 0, y: 10)
    }

    private var blackMarineLogisticsActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "ferry.fill")
                    .foregroundColor(ClipTheme.gold)
                Text("BLACK MARINE LOGISTICS")
                    .font(.system(size: 10.5, weight: .black))
                    .tracking(1.4)
                    .foregroundColor(ClipTheme.gold)
                Spacer()
            }

            logisticsSection(title: "Dockside Logistics", subtitle: "Staging dockside support, luggage handoff, and marina arrival updates.", accent: ClipTheme.gold) {
                Button(action: { impactHeavy(); openFullApp(url: blackMarineConciergeHandoffURL(), showOverlay: $showOverlay) }) {
                    blackActionRow(icon: "ferry.fill", title: "Track Vessel Arrival", detail: "Concierge-managed vessel monitoring and arrival updates", gradient: LinearGradient(colors: [Color.white.opacity(0.12), ClipTheme.gold.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)

                Button(action: { impactHeavy(); showDocksideValetConfirmation = true }) {
                    blackActionRow(icon: "car.side.and.exclamationmark.fill", title: "Dockside Valet", detail: "Staging dockside support, luggage, and marina arrival", gradient: LinearGradient(colors: [Color.white.opacity(0.12), ClipTheme.gold.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)
            }

            logisticsSection(title: "Outbound Logistics", subtitle: "Departure ride and marina transfer timing.", accent: ClipTheme.magenta) {
                Button(action: { impactHeavy(); openBlackRide() }) {
                    blackActionRow(icon: "car.fill", title: "Request Black Ride", detail: "Uber or Lyft if installed", gradient: LinearGradient(colors: [ClipTheme.violet.opacity(0.42), ClipTheme.magenta.opacity(0.34)], startPoint: .topLeading, endPoint: .bottomTrailing), foreground: .white)
                }.buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(LinearGradient(colors: [Color.black.opacity(0.96), ClipTheme.panel.opacity(0.92)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(ClipTheme.gold.opacity(0.26), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: ClipTheme.magenta.opacity(0.12), radius: 18, x: 0, y: 10)
    }

    private var platinumEventLogisticsActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "ticket.fill")
                    .foregroundColor(ClipTheme.cyan)
                Text("PLATINUM EVENT ACCESS")
                    .font(.system(size: 10.5, weight: .black))
                    .tracking(1.4)
                    .foregroundColor(ClipTheme.cyan)
                Spacer()
            }

            logisticsSection(title: "Digital Pass", subtitle: "Fast-track entry, VIP lounge access, and concierge arrival support.", accent: ClipTheme.cyan) {
                Button(action: {
                    impactMedium()
                    hasViewedPlatinumDigitalPass = true
                    showPlatinumDigitalPass = true
                }) {
                    platinumActionRow(icon: "qrcode.viewfinder", title: "View Digital Pass", detail: "\(platinumEventPassDisplayName), entry QR, and host notes", gradient: LinearGradient(colors: [ClipTheme.cyan.opacity(0.32), Color.white.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing))
                }.buttonStyle(.plain)
                Button(action: { impactLight(); showShareSheet = true }) {
                    platinumActionRow(icon: "square.and.arrow.up", title: "Share Access", detail: "Send this patch link via iMessage or AirDrop", gradient: LinearGradient(colors: [ClipTheme.cyan.opacity(0.20), ClipTheme.violet.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing))
                }.buttonStyle(.plain)
                if hasViewedPlatinumDigitalPass {
                    Button(action: { impactMedium(); openFullApp(url: platinumEventPassHandoffURL(intent: "save_to_wallet"), showOverlay: $showOverlay) }) {
                        platinumActionRow(icon: "wallet.pass.fill", title: "Save to Wallet", detail: "Persist this pass in the full Bytspot app", gradient: LinearGradient(colors: [ClipTheme.violet.opacity(0.28), ClipTheme.cyan.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    }.buttonStyle(.plain)
                }
            }

            logisticsSection(title: "Arrival Logistics", subtitle: "\(platinumEtaSummary). Premium ride coordination for venue arrival and departure.", accent: ClipTheme.violet) {
                Button(action: { impactMedium(); openBlackRide() }) {
                    platinumActionRow(icon: "car.fill", title: "Request Platinum Ride", detail: "\(platinumEtaSummary) · Uber or Lyft if installed", gradient: LinearGradient(colors: [ClipTheme.violet.opacity(0.34), ClipTheme.cyan.opacity(0.24)], startPoint: .topLeading, endPoint: .bottomTrailing))
                }.buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(LinearGradient(colors: [ClipTheme.panel.opacity(0.96), ClipTheme.background.opacity(0.90)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(ClipTheme.cyan.opacity(0.26), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: ClipTheme.cyan.opacity(0.10), radius: 16, x: 0, y: 9)
    }

    private func logisticsSection<Content: View>(title: String, subtitle: String, accent: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(accent)
                    .tracking(1.15)
                Text(subtitle)
                    .font(.system(size: 12.2, weight: .semibold))
                    .foregroundColor(.white.opacity(0.68))
                    .lineSpacing(2)
            }
            VStack(spacing: 8) { content() }
        }
        .padding(12)
        .background(Color.white.opacity(0.045))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(accent.opacity(0.20), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var secondaryActions: some View {
        VStack(spacing: 10) {
            Button(action: { impactLight(); invocation.backToCatalog() }) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                    Text("Book another service here")
                    Spacer()
                    Image(systemName: "arrow.uturn.left")
                }
                .font(.system(size: 12.5, weight: .black))
                .foregroundColor(.white.opacity(0.78))
                .padding(.vertical, 12).padding(.horizontal, 14)
                .background(Color.white.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private func actionRow(icon: String, title: String, foreground: Color, background: LinearGradient) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
            Text(title)
            Spacer()
            Image(systemName: "arrow.up.right")
        }
        .font(.system(size: 15, weight: .black))
        .foregroundColor(foreground)
        .padding(.vertical, 15).padding(.horizontal, 16)
        .background(background)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func blackActionRow(icon: String, title: String, detail: String, gradient: LinearGradient, foreground: Color) -> some View {
        HStack(spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .black))
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14.5, weight: .black))
                Text(detail)
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(foreground.opacity(0.68))
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 11, weight: .black))
        }
        .foregroundColor(foreground)
        .padding(.vertical, 13)
        .padding(.horizontal, 13)
        .background(gradient)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func platinumActionRow(icon: String, title: String, detail: String, gradient: LinearGradient) -> some View {
        HStack(spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .black))
                .foregroundColor(ClipTheme.cyan)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14.5, weight: .black))
                    .foregroundColor(.white)
                Text(detail)
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(.white.opacity(0.66))
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Image(systemName: "arrow.up.right")
                .font(.system(size: 11, weight: .black))
                .foregroundColor(.white.opacity(0.9))
        }
        .padding(.vertical, 13)
        .padding(.horizontal, 13)
        .background(gradient)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(ClipTheme.cyan.opacity(0.16), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func timeString(from seconds: Int) -> String {
        String(format: "%02d:%02d", max(seconds, 0) / 60, max(seconds, 0) % 60)
    }

    private func openInMaps() {
        var components = URLComponents(string: "http://maps.apple.com/")!
        var items: [URLQueryItem] = []
        let queryName = invocation.patchContext.map { "\(vendor.name) \($0.title)" } ?? vendor.name
        if let lat = invocation.patchContext?.latitude, let lon = invocation.patchContext?.longitude {
            items.append(URLQueryItem(name: "ll", value: "\(lat),\(lon)"))
        }
        items.append(URLQueryItem(name: "q", value: queryName))
        items.append(URLQueryItem(name: "dirflg", value: "d"))
        components.queryItems = items
        if let url = components.url {
            UIApplication.shared.open(url)
        }
    }

    private func openBlackRide() {
        guard let uberCheckURL = URL(string: "uber://"),
              let lyftCheckURL = URL(string: "lyft://"),
              let uberBlackURL = URL(string: "uber://?action=setPickup&pickup=my_location&dropoff%5Blatitude%5D=33.7490&dropoff%5Blongitude%5D=-84.3880&product_id=9a0f7356-61b9-4b71-8854-93c683b519e4"),
              let lyftBlackURL = URL(string: "lyft://ridetype?id=lyft_lux") else {
            openValetBoutiqueServices()
            return
        }

        if UIApplication.shared.canOpenURL(uberCheckURL) {
            openUberBlack()
        } else if UIApplication.shared.canOpenURL(lyftCheckURL) {
            openLyftBlack()
        } else {
            // App Clips ignore LSApplicationQueriesSchemes, so canOpenURL may be
            // conservative. Try the native URLs in priority order, then fall back
            // to Bytspot's valet logistics flow if neither app accepts the link.
            UIApplication.shared.open(uberBlackURL) { openedUber in
                guard !openedUber else { return }
                UIApplication.shared.open(lyftBlackURL) { openedLyft in
                    if !openedLyft { openValetBoutiqueServices() }
                }
            }
        }
    }

    private func openUberBlack() {
        guard let appURL = URL(string: "uber://?action=setPickup&pickup=my_location&dropoff%5Blatitude%5D=33.7490&dropoff%5Blongitude%5D=-84.3880&product_id=9a0f7356-61b9-4b71-8854-93c683b519e4"),
              let webURL = URL(string: "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff%5Blatitude%5D=33.7490&dropoff%5Blongitude%5D=-84.3880") else { return }
        UIApplication.shared.open(appURL) { opened in
            if !opened { UIApplication.shared.open(webURL) }
        }
    }

    private func openLyftBlack() {
        guard let appURL = URL(string: "lyft://ridetype?id=lyft_lux"),
              let webURL = URL(string: "https://www.lyft.com/rider?ride_type=lyft_lux") else { return }
        UIApplication.shared.open(appURL) { opened in
            if !opened { UIApplication.shared.open(webURL) }
        }
    }

    private func openValetBoutiqueServices() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            invocation.openValetBoutiqueServices()
        }
    }
}

private struct ClipFeedbackSheet: View {
    @Binding var rating: Int
    @Binding var comment: String
    @Binding var submitted: Bool
    let onSubmit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Capsule().fill(Color.secondary.opacity(0.28)).frame(width: 44, height: 5).frame(maxWidth: .infinity)
            Text("How was your experience?")
                .font(.system(size: 24, weight: .heavy))
            StarRatingView(rating: $rating)
            TextField("Optional comment", text: $comment)
                .textInputAutocapitalization(.sentences)
                .padding(12)
                .background(Color.secondary.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            Button(action: onSubmit) {
                Text(submitted ? "Submitted" : "Submit")
                    .font(.system(size: 16, weight: .black))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .foregroundColor(.white)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            Spacer(minLength: 0)
        }
        .padding(22)
    }
}

private struct StarRatingView: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(1...5, id: \.self) { value in
                Button(action: { rating = value }) {
                    Image(systemName: value <= rating ? "star.fill" : "star")
                        .font(.system(size: 30, weight: .black))
                        .foregroundColor(value <= rating ? .yellow : .secondary.opacity(0.45))
                }
                .buttonStyle(.plain)
            }
        }
    }
}





enum ClipPaymentStatusTone {
    case neutral
    case success
    case warning
}

@MainActor
final class ClipPaymentSecureController: NSObject, ObservableObject, PKPaymentAuthorizationControllerDelegate {
    @Published var isAuthorizing = false
    @Published var statusMessage: String?
    @Published var statusTone: ClipPaymentStatusTone = .neutral
    @Published var completedResult: ClipPaymentSecureResult?

    private let api = ClipPatchVerifier()
    private var pendingService: ClipLocalService?
    private var pendingPatchId: String?
    private var pendingAmountCents: Int = 0
    private var pendingIdempotencyKey: String?

    var canUseApplePay: Bool {
        PKPaymentAuthorizationController.canMakePayments(usingNetworks: supportedNetworks)
    }

    func reset() {
        isAuthorizing = false
        statusMessage = nil
        statusTone = .neutral
        completedResult = nil
        pendingService = nil
        pendingPatchId = nil
        pendingAmountCents = 0
        pendingIdempotencyKey = nil
    }

    func startApplePay(service: ClipLocalService, patchId: String?, vendorId: String? = nil, guestCount: Int = 1, amountCentsOverride: Int? = nil, lineLabel: String? = nil) {
        guard configureStripeApplePay() else {
            if !canUseApplePay {
                statusTone = .warning
                statusMessage = "Apple Pay is not available on this device. Use card checkout in the full app."
            }
            return
        }
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

        let amountCents = max(amountCentsOverride ?? service.amountCents ?? 2500, 50)
        let idempotencyKey = Self.checkoutIdempotencyKey(patchId: patchId, serviceId: service.id, vendorId: vendorId, amountCents: amountCents, guestCount: guestCount)
        if isAuthorizing && pendingIdempotencyKey == idempotencyKey {
            statusTone = .neutral
            statusMessage = "Secure hold already in progress for this service."
            return
        }
        pendingService = service
        pendingPatchId = patchId
        pendingAmountCents = amountCents
        pendingIdempotencyKey = idempotencyKey
        statusMessage = nil
        statusTone = .neutral
        completedResult = nil

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantIdentifier
        request.countryCode = "US"
        request.currencyCode = service.currency.uppercased()
        request.supportedNetworks = supportedNetworks
        request.merchantCapabilities = [.capability3DS]
        request.requiredBillingContactFields = [.name, .emailAddress, .phoneNumber, .postalAddress]
        let amount = NSDecimalNumber(value: Double(amountCents) / 100.0)
        request.paymentSummaryItems = [
            PKPaymentSummaryItem(label: lineLabel ?? service.title, amount: amount),
            PKPaymentSummaryItem(label: "Bytspot Apple Pay Secure", amount: amount)
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
                let result = try await api.authorizeApplePaySecure(
                    service: service,
                    patchId: pendingPatchId,
                    stripePaymentMethodId: paymentMethodId,
                    amountCents: pendingAmountCents,
                    idempotencyKey: pendingIdempotencyKey,
                    guestContact: applePayGuestContact(from: payment)
                )
                statusTone = .success
                statusMessage = result.message
                completedResult = result
                completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
            } catch {
                statusTone = .warning
                statusMessage = "Apple Pay was ready, but the secure payment backend is not enabled yet. Use card checkout in the full app."
                completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
            }
            isAuthorizing = false
        }
    }

    #if DEBUG
    /// Dev-only: simulate a successful booking without hitting Apple Pay/Stripe so the
    /// success screen and retention loop can be validated on the simulator.
    func simulateSuccess(service: ClipLocalService, amountCents: Int) {
        let ref = "BYT-PREVIEW-\(Int.random(in: 1000...9999))"
        statusTone = .success
        statusMessage = "Booking confirmed (preview)."
        completedResult = ClipPaymentSecureResult(bookingId: ref, status: "authorized_preview", message: "Booking confirmed (preview).")
    }
    #endif

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

    private static func checkoutIdempotencyKey(patchId: String?, serviceId: String, vendorId: String?, amountCents: Int, guestCount: Int) -> String {
        [
            "vpatch", "checkout", "v1",
            keyPart(patchId, fallback: "unknown-patch"),
            "booking",
            keyPart(vendorId, fallback: "venue"),
            keyPart(serviceId, fallback: "unknown-service"),
            String(max(amountCents, 0)),
            String(max(guestCount, 1))
        ].joined(separator: ":")
    }

    private static func keyPart(_ value: String?, fallback: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
        let lowered = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalized = lowered.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }.reduce(into: "") { $0.append($1) }
        let trimmed = normalized.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return trimmed.isEmpty ? fallback : trimmed
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

private struct PlatinumDigitalPassSheet: View {
    @Environment(\.dismiss) private var dismiss
    let ticketURL: URL
    let eyebrow: String
    let passTitle: String
    let bookingRef: String
    let vendorName: String
    let onSaveToWallet: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("PLATINUM")
                        .font(.system(size: 13, weight: .black))
                        .tracking(1.4)
                        .foregroundColor(ClipTheme.cyan)
                        .lineLimit(1)
                        .minimumScaleFactor(0.90)
                    Text(eyebrow)
                        .font(.system(size: 10.2, weight: .black))
                        .tracking(1.2)
                        .foregroundColor(ClipTheme.violet.opacity(0.92))
                    Text(passTitle)
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                    Text("\(vendorName) · \(bookingRef)")
                        .font(.system(size: 11.5, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.58))
                        .lineLimit(1)
                }
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.white.opacity(0.74))
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(ClipTheme.background)

            ClipSafariView(url: ticketURL)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button(action: onSaveToWallet) {
                HStack(spacing: 9) {
                    Image(systemName: "wallet.pass.fill")
                    Text("Save to Wallet in Bytspot")
                    Spacer()
                    Image(systemName: "arrow.down.app.fill")
                }
                .font(.system(size: 14, weight: .black))
                .foregroundColor(.white)
                .padding(.vertical, 14)
                .padding(.horizontal, 15)
                .background(LinearGradient(colors: [ClipTheme.cyan.opacity(0.34), ClipTheme.violet.opacity(0.32)], startPoint: .leading, endPoint: .trailing))
                .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(Color.white.opacity(0.16), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(14)
            .background(ClipTheme.background)
        }
        .background(ClipTheme.background.ignoresSafeArea())
    }
}

private struct ClipSafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .close
        controller.preferredControlTintColor = UIColor(red: 0.0, green: 0.749, blue: 1.0, alpha: 1.0)
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
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
