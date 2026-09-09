import SwiftUI
import UIKit

/// The ground both appearances share: a navy field with two soft nebula glows,
/// teal low-left and cyan high-right. A flat fill is what made the canvas read
/// as dead space -- the card had nothing to sit in. The glows are wide and very
/// low contrast on purpose: they should be felt as depth, never seen as shapes,
/// and they must never compete with content for the eye.
struct NativeDeepSpaceGround: View {
    var body: some View {
        ZStack {
            NativePolish.screenBackground
            GeometryReader { geo in
                let span = max(geo.size.width, geo.size.height)
                RadialGradient(colors: [NativeTheme.cyan.opacity(0.16), .clear],
                               center: UnitPoint(x: 0.86, y: 0.08), startRadius: 0, endRadius: span * 0.78)
                RadialGradient(colors: [Color(hue: 0.49, saturation: 0.85, brightness: 0.62).opacity(0.14), .clear],
                               center: UnitPoint(x: 0.10, y: 0.82), startRadius: 0, endRadius: span * 0.72)
                RadialGradient(colors: [NativeTheme.purple.opacity(0.10), .clear],
                               center: UnitPoint(x: 0.50, y: 0.46), startRadius: 0, endRadius: span * 0.62)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

struct BytspotNativeBackground: View {
    let tier: BytspotTier
    var intent: String = ""
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let journey = NativeJourneyTheme.current(intent: intent)
        ZStack {
            journey.background
            RadialGradient(colors: [journey.primary.opacity(0.20), .clear], center: .top, startRadius: 20, endRadius: 360)
                .opacity(colorScheme == .dark ? 0.30 : 0.12)
            RadialGradient(colors: [journey.secondary.opacity(0.18), .clear], center: .bottomTrailing, startRadius: 20, endRadius: 340)
                .opacity(colorScheme == .dark ? 0.30 : 0.14)
            RadialGradient(colors: [journey.tertiary.opacity(0.15), .clear], center: .leading, startRadius: 20, endRadius: 320)
                .opacity(colorScheme == .dark ? 0.30 : 0.10)
            BytspotTheme.tierHeroWash(for: tier).opacity(colorScheme == .dark ? 0.72 : 0.16)
        }
    }
}

enum BytspotTheme {
    // Both appearances are deep space; Light is the shallower of the two, not a
    // white theme. That inverts every token below: ink is light in both modes
    // and surfaces are translucent white over the ground rather than opaque
    // white panels. Light exists to lift the floor for daylight legibility, so
    // its surfaces and strokes are carried a little stronger than Dark's.
    static let background = Color.adaptive(lightHex: 0x161B3A, darkHex: 0x000000)
    static let card = Color.adaptive(lightHex: 0x252C52, darkHex: 0x1C1C1E, lightAlpha: 0.92, darkAlpha: 0.95)
    static let panel = Color.adaptive(lightHex: 0x1E2447, darkHex: 0x1C1C1E, lightAlpha: 0.90, darkAlpha: 0.90)
    static let tabBarBackground = Color.adaptive(lightHex: 0x1E2447, darkHex: 0x1C1C1E, lightAlpha: 0.92, darkAlpha: 0.90)
    static let textPrimary = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.96, darkAlpha: 1.0)
    static let textSecondary = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.74, darkAlpha: 0.70)
    // 0.52 measured exactly 4.50:1 on the lightest category card -- on the AA
    // line with no margin, so any further lift of a card fill would put it
    // under. Carried to 0.58 to keep headroom.
    static let textTertiary = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.60, darkAlpha: 0.58)
    static let inverseText = Color.adaptive(lightHex: 0x081026, darkHex: 0x000000)
    static let surfaceStroke = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.15, darkAlpha: 0.12)
    static let strongSurfaceStroke = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.28, darkAlpha: 0.24)
    static let selectedControlSurface = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.18, darkAlpha: 0.25)
    static let surfaceHighlight = Color.adaptive(lightHex: 0xFFFFFF, darkHex: 0xFFFFFF, lightAlpha: 0.065, darkAlpha: 0.045)
    static let panelShadow = Color.adaptive(lightHex: 0x000000, darkHex: 0x000000, lightAlpha: 0.34, darkAlpha: 0.40)
    static let softShadow = Color.adaptive(lightHex: 0x000000, darkHex: 0x000000, lightAlpha: 0.20, darkAlpha: 0.22)
    static let textShadow = Color.adaptive(lightHex: 0x000000, darkHex: 0x000000, lightAlpha: 0.48, darkAlpha: 0.62)

    static let cyanHex = 0x00BFFF
    static let purpleHex = 0xA855F7
    static let pinkHex = 0xD946EF
    static let magentaHex = 0xFF00FF
    static let orangeHex = 0xFF4500
    static let blackAmberHex = 0xD97706
    static let emeraldHex = 0x10B981
    static let amberHex = 0xF59E0B
    static let neutralHex = 0x9CA3AF

    static let cyan = bytspotDesignColor(hex: cyanHex)
    static let purple = bytspotDesignColor(hex: purpleHex)
    static let pink = bytspotDesignColor(hex: pinkHex)
    static let magenta = bytspotDesignColor(hex: magentaHex)
    static let orange = bytspotDesignColor(hex: orangeHex)
    static let blackAmber = bytspotDesignColor(hex: blackAmberHex)
    static let emerald = bytspotDesignColor(hex: emeraldHex)
    static let amber = bytspotDesignColor(hex: amberHex)
    static let neutral = bytspotDesignColor(hex: neutralHex)
    static let slate950 = bytspotDesignColor(hex: 0x020617)
    static let slate900 = bytspotDesignColor(hex: 0x0F172A)
    static let green900 = bytspotDesignColor(hex: 0x064E3B)
    static let purple900 = bytspotDesignColor(hex: 0x581C87)

    static let spacing1: CGFloat = 8
    static let spacing2: CGFloat = 16
    static let spacing3: CGFloat = 24
    static let spacing4: CGFloat = 32
    static let tapTargetMin: CGFloat = 44
    static let caption2Size: CGFloat = 11
    static let bodySize: CGFloat = 17
    static let headlineSize: CGFloat = 17
    static let title1Size: CGFloat = 28
    static let largeTitleSize: CGFloat = 34

    static var defaultTier: BytspotTier {
        let raw = ProcessInfo.processInfo.environment["BYT_NATIVE_PREVIEW_TIER"]?.lowercased()
        return defaultTier(from: raw)
    }

    static func defaultTier(from rawValue: String?) -> BytspotTier {
        guard let normalized = rawValue?.lowercased() else { return .green }
        return BytspotTier(rawValue: normalized) ?? .green
    }

    static func accent(for tier: BytspotTier) -> Color { bytspotDesignColor(hex: accentHex(for: tier)) }

    static func accentHex(for tier: BytspotTier) -> Int {
        switch tier {
        case .black: return blackAmberHex
        case .platinum: return cyanHex
        case .green: return emeraldHex
        }
    }

    static func secondaryAccent(for tier: BytspotTier) -> Color { bytspotDesignColor(hex: secondaryAccentHex(for: tier)) }

    static func secondaryAccentHex(for tier: BytspotTier) -> Int {
        switch tier {
        case .black: return magentaHex
        case .platinum: return purpleHex
        case .green: return cyanHex
        }
    }

    static func tierHeroWash(for tier: BytspotTier) -> LinearGradient {
        switch tier {
        case .black:
            return LinearGradient(colors: [bytspotDesignColor(hex: 0x0B0B10).opacity(0.99), purple900.opacity(0.62), slate950.opacity(0.99)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .platinum:
            return LinearGradient(colors: [slate900.opacity(0.98), purple900.opacity(0.72), slate950.opacity(0.98)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .green:
            return LinearGradient(colors: [green900.opacity(0.90), slate900.opacity(0.98), slate950.opacity(0.99)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    static func brandGradient() -> LinearGradient {
        LinearGradient(colors: [cyan, magenta, orange], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

typealias NativeTheme = BytspotTheme

extension Color {
    static func adaptive(lightHex: Int, darkHex: Int, lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
        Color(UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? darkHex : lightHex
            let alpha = traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: CGFloat(alpha))
        })
    }

}

private func bytspotDesignColor(hex: Int, alpha: Double = 1) -> Color {
    Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
}

func nativeImpactLight() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
}