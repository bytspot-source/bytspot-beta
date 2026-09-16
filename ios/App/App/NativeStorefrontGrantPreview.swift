#if DEBUG
import SwiftUI

/// DESIGN PREVIEW ONLY, never reachable in Release.
///
/// Shows the proposed Discover card and venue detail for every vendor
/// storefront grant, across the thirteen consumer rails, so the display can be
/// approved before any grant is implemented. It draws proposed layout only: no
/// production policy is consulted, so nothing here can move capability. The
/// rail list is the real one, so a pill added or renamed shows up here too.
enum NativeStorefrontGrant: String, CaseIterable, Identifiable {
    case booking, ordering, requesting, listed, external

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    /// What the vendor asserted. `listed` asserts nothing, `external` is a
    /// named provider handoff and stays outside the storefront.
    var assertion: String {
        switch self {
        case .booking: return "Vendor asserts inventory · time and capacity"
        case .ordering: return "Vendor asserts a menu · items and fulfilment"
        case .requesting: return "Vendor accepts requests · no held capacity"
        case .listed: return "No grant · reference only"
        case .external: return "Named provider handoff · not a Bytspot grant"
        }
    }

    var statusLabel: String {
        switch self {
        case .booking: return "Book"
        case .ordering: return "Order"
        case .requesting: return "Request"
        case .listed: return "Listed"
        case .external: return "External"
        }
    }

    var cardCTA: String {
        switch self {
        case .booking: return "Book"
        case .ordering: return "Order"
        case .requesting: return "Request"
        case .listed: return "Add to Plan"
        case .external: return "Open Resy ↗"
        }
    }

    /// Blue marks a Bytspot action only. A reference and a handoff stay neutral.
    var accent: Color? {
        switch self {
        case .booking, .ordering, .requesting: return NativeTheme.cyan
        case .listed, .external: return nil
        }
    }

    var ring: NativeDiscoverBookableRingStyle {
        switch self {
        case .booking, .ordering: return .solid
        case .requesting: return .dashed
        case .listed, .external: return .dot
        }
    }

    var availabilityLine: String {
        switch self {
        case .booking: return "Review availability before booking"
        case .ordering: return "Menu and fulfilment are provided by the vendor"
        case .requesting: return "Subject to vendor acceptance"
        case .listed: return "Place discovery · Bytspot does not control availability"
        case .external: return "Availability and confirmation are handled by the provider, not Bytspot"
        }
    }

    /// The detail's secondary action never carries fulfillment.
    var detailSecondary: String { "Add to Plan" }

    var priceLine: String? {
        switch self {
        case .booking: return "From $48/guest"
        case .ordering: return "Menu from $14"
        case .requesting, .listed, .external: return nil
        }
    }

    var detailRows: [(String, String)] {
        switch self {
        case .booking:
            return [("clock", "Tonight · 7:30 PM, 8:00 PM, 9:15 PM"),
                    ("person.2", "Parties of 2–6"),
                    ("checkmark.seal", "Confirmed instantly · held capacity")]
        case .ordering:
            return [("list.bullet.rectangle", "Menu supplied by the vendor"),
                    ("bag", "Pickup · ready in ~20 min"),
                    ("checkmark.seal", "Order confirmed by the vendor")]
        case .requesting:
            return [("clock", "Preferred time · vendor confirms"),
                    ("person.2", "Party size shared with the vendor"),
                    ("hourglass", "No capacity is held until accepted")]
        case .listed:
            return [("clock", "Hours unknown · not provided by this place"),
                    ("person.2", "Activity unknown · no live update provided")]
        case .external:
            return [("arrow.up.forward.app", "Provider owns availability and payment"),
                    ("exclamationmark.triangle", "Bytspot receives no confirmation")]
        }
    }
}

struct NativeStorefrontGrantPreview: View {
    /// `Color(hex:)` is file-private in the shell, so resolve the shared
    /// surface token locally rather than widening production access.
    private static let surface = Color(
        red: Double((NativeDiscoverBookablePresentation.surfaceHex >> 16) & 0xFF) / 255,
        green: Double((NativeDiscoverBookablePresentation.surfaceHex >> 8) & 0xFF) / 255,
        blue: Double(NativeDiscoverBookablePresentation.surfaceHex & 0xFF) / 255)

    @State private var rail = NativeDiscoverBookablePresentation.railLabels[1]
    @State private var grant: NativeStorefrontGrant = .booking

    var body: some View {
        ZStack {
            NativeDeepSpaceGround()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    banner
                    railPicker
                    grantPicker
                    sectionLabel("DISCOVER CARD")
                    cardPreview
                    sectionLabel("VENUE DETAIL")
                    detailPreview
                    Text(grant.assertion)
                        .font(.footnote)
                        .foregroundColor(NativeTheme.textSecondary)
                }
                .padding(20)
            }
        }
        .foregroundColor(NativeTheme.textPrimary)
        .accessibilityIdentifier("native-storefront-grant-preview")
    }

    private var banner: some View {
        HStack {
            Circle().fill(NativeTheme.cyan).frame(width: 7, height: 7)
            Text("DESIGN PREVIEW · SAMPLE DATA").font(.caption2.weight(.bold)).kerning(0.6)
            Spacer()
            Text("LOCAL ONLY").font(.caption2.weight(.bold)).kerning(0.6)
        }
        .foregroundColor(NativeTheme.textSecondary)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text).font(.caption.weight(.bold)).kerning(1.0)
            .foregroundColor(NativeTheme.cyan)
    }

    private var railPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(NativeDiscoverBookablePresentation.railLabels, id: \.self) { label in
                    Text(label)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(label == rail ? NativeTheme.cyan : Color.white.opacity(0.08))
                        .foregroundColor(label == rail ? .black : NativeTheme.textPrimary)
                        .clipShape(Capsule())
                        .onTapGesture { rail = label }
                }
            }
        }
    }

    private var grantPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(NativeStorefrontGrant.allCases) { option in
                    Text(option.title)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(option == grant ? Color.white.opacity(0.22) : Color.white.opacity(0.06))
                        .clipShape(Capsule())
                        .onTapGesture { grant = option }
                }
            }
        }
    }

    private var statusPill: some View {
        HStack(spacing: 6) {
            ZStack {
                if grant.ring == .dot {
                    Circle().fill(NativeTheme.neutral).frame(width: 7, height: 7)
                } else {
                    Circle().stroke(grant.accent ?? NativeTheme.neutral,
                        style: StrokeStyle(lineWidth: 1.5, dash: grant.ring == .dashed ? [2, 2] : []))
                        .frame(width: 13, height: 13)
                }
            }
            .frame(width: 14, height: 14)
            Text(grant.statusLabel).font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.white.opacity(0.08))
        .clipShape(Capsule())
    }

    private var cardPreview: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                Rectangle().fill(Color.white.opacity(0.06)).frame(height: 150)
                    .overlay(Text("Sample image · not venue photography")
                        .font(.caption2).foregroundColor(NativeTheme.textSecondary))
                statusPill.padding(10)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(rail).font(.caption.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
                Text("Broni Home Taste Restaurant").font(.title3.weight(.bold))
                if let price = grant.priceLine {
                    Text("\(price) · sample").font(.subheadline).foregroundColor(NativeTheme.textSecondary)
                }
                Text(grant.availabilityLine).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                HStack(spacing: 10) {
                    Text(grant.cardCTA)
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 18).padding(.vertical, 11)
                        .background(grant.accent ?? Color.white.opacity(0.14))
                        .foregroundColor(grant.accent == nil ? NativeTheme.textPrimary : .black)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    if grant.accent != nil {
                        Text("Add to Plan").font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .background(Color.white.opacity(0.10))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding(14)
        }
        .background(Self.surface)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
            .stroke(Color.white.opacity(0.14), lineWidth: 1))
    }

    private var detailPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle().fill(Color.white.opacity(0.06)).frame(height: 110)
                .overlay(Text("Sample image · not venue photography")
                    .font(.caption2).foregroundColor(NativeTheme.textSecondary))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text("Broni Home Taste Restaurant").font(.title2.weight(.bold))
            // The detail must name the same rail as the card, never a second one.
            Text(rail).font(.subheadline.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
            Text("1. 2 mi · Midtown sample location").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            statusPill
            Text(grant.availabilityLine).font(.footnote).foregroundColor(NativeTheme.textSecondary)

            VStack(alignment: .leading, spacing: 9) {
                Text("Know before you go").font(.headline)
                ForEach(grant.detailRows, id: \.1) { row in
                    Label(row.1, systemImage: row.0)
                        .font(.subheadline).foregroundColor(NativeTheme.textSecondary)
                }
            }
            .padding(14)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Text("Arrival").font(.headline)
            Text("Choose how to get there. Your visit and your ride are arranged separately.")
                .font(.footnote).foregroundColor(NativeTheme.textSecondary)

            HStack(spacing: 10) {
                Text(grant.cardCTA)
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(grant.accent ?? Color.white.opacity(0.14))
                    .foregroundColor(grant.accent == nil ? NativeTheme.textPrimary : .black)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                Text(grant.detailSecondary)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(Color.white.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            Text("Adding to a Plan does not book or request anything.")
                .font(.caption2).foregroundColor(NativeTheme.textSecondary)
        }
        .padding(16)
        .background(Self.surface)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
            .stroke(Color.white.opacity(0.14), lineWidth: 1))
    }
}
#endif
