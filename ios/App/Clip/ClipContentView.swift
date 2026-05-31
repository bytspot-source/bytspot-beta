import SwiftUI
import AppClip
import StoreKit
import UIKit
import PassKit
import Contacts
import AVFoundation
import AVKit
@_spi(STP) import StripeApplePay
@_spi(STP) import StripeCore

enum ClipVerifyState: Equatable {
    case idle
    case verifying
    case verified(label: String, bindingType: String?)
    case failed(message: String)
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

// MARK: - Screen 1: Catalog

struct ClipCatalogView: View {
    @EnvironmentObject var invocation: ClipInvocationModel
    @Binding var showOverlay: Bool

    private let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                catalogHeader
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
                if let url = service.heroImageURL {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Color.clear }
                    .clipped()
                }
                LinearGradient(colors: [.clear, Color.black.opacity(0.55)], startPoint: .top, endPoint: .bottom)
                VStack {
                    HStack {
                        if service.source == "live" {
                            Text("LIVE")
                                .font(.system(size: 9, weight: .black))
                                .tracking(0.8)
                                .foregroundColor(.black)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(ClipTheme.emerald)
                                .clipShape(Capsule())
                        }
                        Spacer()
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
                RadialGradient(colors: [ClipTheme.gold.opacity(0.16), .clear], center: .topTrailing, startRadius: 12, endRadius: 150)
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text("BLACK · FLIGHT DESK").tracking(1.1); Spacer(); Image(systemName: "airplane.departure") }
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
                Text("Aircraft, catering, ground transport, and concierge clearance.").font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.68)).lineLimit(2).padding(.top, 1)
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

    private var upsellFooter: some View {
        Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.down.app.fill")
                Text("Open full Bytspot app with this patch")
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
    }

    private var eyebrow: String {
        if case .verified = invocation.verificationState { return "VERIFIED ACCESS" }
        return invocation.services.first?.source == "live" ? "LIVE NEAR YOU" : invocation.tier.eyebrow
    }
    private var venueTitle: String { invocation.patchContext?.title ?? formattedSlug(invocation.venueSlug) ?? "Bytspot Patch" }
    private var venueSubtitle: String { invocation.patchContext?.subtitle ?? invocation.tier.defaultSubtitle }

    private func isBlackAviation(_ service: ClipLocalService) -> Bool {
        invocation.tier == .black && ((service.category ?? service.id).lowercased().contains("aviation") || service.id.lowercased().contains("jet"))
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
                    Text("STEP 2 · CHOOSE")
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
        if isLoading {
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
        return AnyView(HStack(spacing: 14) {
            ZStack {
                LinearGradient(colors: [service.tintColor.opacity(0.75), service.tintColor.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let url = vendor.displayPosterURL {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                        .clipped()
                }
                if vendor.media?.hasPlayableVideo == true {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.45), radius: 4, x: 0, y: 1)
                } else {
                    Image(systemName: service.iconName)
                        .font(.system(size: 22, weight: .black))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.35), radius: 3, x: 0, y: 1)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(vendor.name).font(.system(size: 15.5, weight: .heavy)).foregroundColor(.white).lineLimit(1)
                Text(vendor.tagline).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.70)).lineLimit(2)
                HStack(spacing: 8) {
                    if let rating = vendor.rating {
                        Label(String(format: "%.1f", rating), systemImage: "star.fill")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(ClipTheme.gold)
                    }
                    if let eta = vendor.etaLabel {
                        // Aviation reframes "ETA X min" as "Departing in X min" so
                        // the row reads like a flight board rather than a ride ETA.
                        Text(formatEtaLabel(eta, for: service))
                            .font(.system(size: 10.5, weight: .black))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    Spacer()
                    Text(vendor.priceFromLabel)
                        .font(.system(size: 12.5, weight: .black, design: .monospaced))
                        .foregroundColor(service.tintColor)
                }.padding(.top, 2)
            }
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .black)).foregroundColor(.white.opacity(0.55))
        }
        .padding(12)
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)))
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
    /// All other categories keep the raw label.
    private func formatEtaLabel(_ raw: String, for service: ClipLocalService) -> String {
        let cat = (service.category ?? service.id).lowercased()
        let isAviation = cat.contains("aviation") || cat.contains("jet") || cat.contains("charter")
        guard isAviation, raw.uppercased().hasPrefix("ETA ") else { return raw }
        return "Departing in " + raw.dropFirst(4)
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
    private var totalCents: Int { vendor.priceFromCents * max(invocation.guestCount, 1) }
    private var totalLabel: String {
        let dollars = Double(totalCents) / 100.0
        if service.currency.uppercased() == "USD" { return String(format: "$%.0f", dollars) }
        return "\(service.currency.uppercased()) \(String(format: "%.0f", dollars))"
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                vendorHero
                includedCard
                guestPicker
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
        if vendor.media?.hasPlayableVideo == true {
            vendorHeroVideo
        } else {
            vendorHeroCompact
        }
    }

    private var vendorHeroCompact: some View {
        HStack(spacing: 14) {
            ZStack {
                LinearGradient(colors: [service.tintColor.opacity(0.78), service.tintColor.opacity(0.20)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let url = vendor.displayPosterURL {
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
                videoURL: vendor.media?.videoPlaybackURL,
                posterURL: vendor.displayPosterURL,
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
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 12)
        }
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
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

    private var bookingContext: ClipBookingContext { .make(service: service, vendor: vendor, tier: invocation.tier) }
    private var hasGroundLogistics: Bool {
        vendor.includedHighlights.contains { $0.lowercased().contains("ground transport") || $0.lowercased().contains("chauffeur") }
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
                    countdownCard
                    whatsIncluded
                    primaryActions
                    secondaryActions
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
        }
        .onChange(of: invocation.invocationURL) { _ in
            configureTimerState()
            presentFeedbackPrompt()
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
    }

    private var forcedExpiredForPreview: Bool {
        guard let url = invocation.invocationURL,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return (components.queryItems ?? []).contains { item in
            ["expired", "holdExpired"].contains(item.name) && item.value != "0"
        }
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
        } else if timeRemaining <= 0 {
            timeRemaining = bookingContext.holdMinutes * 60
            isHoldExpired = false
        }
    }

    private func presentFeedbackPrompt() {
        guard !feedbackSubmitted, !isHoldExpired else { return }
        showFeedbackPrompt = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) {
            guard !showFeedbackSheet, !feedbackSubmitted else { return }
            withAnimation(.easeOut(duration: 0.25)) { showFeedbackPrompt = false }
        }
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
        } else {
            Text("Your booking is confirmed instantly. Use the route and valet actions below for arrival logistics.")
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.62))
                .lineSpacing(2)
                .padding(.horizontal, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var authorizationCard: some View {
        if bookingContext.isHighTicket {
            VStack(spacing: 10) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundColor(.white.opacity(0.72))
                Text("Funds Securely Authorized")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundColor(.white)
                Text("You will only be charged once the vendor confirms.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(ClipTheme.panel)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
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
                            .foregroundColor(ClipTheme.emerald)
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
                Circle().fill(ClipTheme.emerald.opacity(0.20)).frame(width: 110, height: 110)
                Circle().fill(ClipTheme.emerald.opacity(0.35)).frame(width: 80, height: 80)
                Image(systemName: "checkmark")
                    .font(.system(size: 36, weight: .black))
                    .foregroundColor(.black)
                    .frame(width: 64, height: 64)
                    .background(ClipTheme.emerald)
                    .clipShape(Circle())
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 4)

            VStack(alignment: .leading, spacing: 6) {
                Text(bookingContext.isHighTicket ? "STEP 4 · HOLD PLACED" : "STEP 4 · CONFIRMED")
                    .font(.system(size: 10.5, weight: .black))
                    .foregroundColor(ClipTheme.emerald)
                    .tracking(1.4)
                Text(bookingContext.isHighTicket ? "Hold Placed Successfully" : "You're set.")
                    .font(.system(size: 32, weight: .heavy))
                    .foregroundColor(.white)
                Text(bookingContext.isHighTicket ? "\(vendor.name) is reviewing your \(service.title.lowercased()) request." : "\(vendor.name) is preparing your \(service.title.lowercased()).")
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
        .background(ClipTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
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
            switch bookingContext.logisticsMode {
            case .inboundToUser:
                Button(action: { impactMedium(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                    actionRow(icon: "house.fill", title: "Provide Property Access", foreground: .black, background: LinearGradient(colors: [.white, ClipTheme.gold.opacity(0.92)], startPoint: .leading, endPoint: .trailing))
                }.buttonStyle(.plain)

                Button(action: { impactLight(); openFullApp(url: invocation.mainAppHandoffURL, showOverlay: $showOverlay) }) {
                    actionRow(icon: "map.fill", title: "Track Live ETA", foreground: .white, background: LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                }.buttonStyle(.plain)

            case .outboundToVenue:
                Button(action: { impactMedium(); openInMaps() }) {
                    actionRow(icon: "location.north.line.fill", title: "View Live Route & Valet", foreground: .black, background: LinearGradient(colors: [.white, ClipTheme.cyan.opacity(0.92)], startPoint: .leading, endPoint: .trailing))
                }.buttonStyle(.plain)

                if hasGroundLogistics {
                    Button(action: { impactLight(); openUberBlack() }) {
                        actionRow(icon: "car.fill", title: "Request Uber Black", foreground: .white, background: LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                    }.buttonStyle(.plain)

                    Button(action: { impactLight(); openLyftBlack() }) {
                        actionRow(icon: "arrow.up.forward.app.fill", title: "Request Lyft Black", foreground: .white, background: LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                    }.buttonStyle(.plain)
                } else {
                    Button(action: { impactLight(); openUberBlack() }) {
                        actionRow(icon: "arrow.up.forward.app.fill", title: "Request Uber Black", foreground: .white, background: LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                    }.buttonStyle(.plain)
                }
            }

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
    }

    func startApplePay(service: ClipLocalService, patchId: String?, amountCentsOverride: Int? = nil, lineLabel: String? = nil) {
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
        pendingService = service
        pendingPatchId = patchId
        pendingAmountCents = amountCents
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
