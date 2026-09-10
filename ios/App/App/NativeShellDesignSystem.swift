import SwiftUI
import UIKit

/// The ground both appearances share: a navy field with two soft nebula glows,
/// teal low-left and cyan high-right. A flat fill is what made the canvas read
/// as dead space -- the card had nothing to sit in. The glows are wide and very
/// low contrast on purpose: they should be felt as depth, never seen as shapes,
/// and they must never compete with content for the eye.
private struct NativeDeepSpaceGroundDrawnKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    /// Set by the shell once it draws the ground behind the whole window,
    /// including under the floating tab bar. Screens keep their own ground for
    /// when they are presented in a sheet, but must not double it inside the
    /// shell: two grounds means 140 stars and twice the nebula.
    var nativeDeepSpaceGroundDrawn: Bool {
        get { self[NativeDeepSpaceGroundDrawnKey.self] }
        set { self[NativeDeepSpaceGroundDrawnKey.self] = newValue }
    }
}

struct NativeDeepSpaceGround: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeDeepSpaceGroundDrawn) private var alreadyDrawn
    /// The suppression flag propagates into sheet content along with the rest of
    /// the environment, which would leave every sheet presented from inside the
    /// shell with no ground at all. A presented view is its own window-level
    /// surface and always draws one.
    @Environment(\.isPresented) private var isPresented

    /// Fixed field, generated once from a constant seed. Stars must not
    /// reshuffle on every redraw or the sky crawls while you scroll.
    private static let stars: [(x: Double, y: Double, radius: Double, phase: Double, peak: Double)] = {
        var seed: UInt64 = 0x9E3779B97F4A7C15
        func unit() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double((seed >> 11) & 0xFFFFF) / Double(0xFFFFF)
        }
        return (0..<70).map { _ in
            (x: unit(), y: unit(), radius: 0.5 + unit() * 1.3, phase: unit() * 2 * .pi, peak: 0.35 + unit() * 0.5)
        }
    }()

    var body: some View {
        if alreadyDrawn && !isPresented { Color.clear } else { ground }
    }

    private var ground: some View {
        ZStack {
            NativePolish.screenBackground
            GeometryReader { geo in
                let span = max(geo.size.width, geo.size.height)
                RadialGradient(colors: [NativeTheme.cyan.opacity(0.30), NativeTheme.cyan.opacity(0.07), .clear],
                               center: UnitPoint(x: 0.88, y: 0.06), startRadius: 0, endRadius: span * 0.82)
                RadialGradient(colors: [Color(hue: 0.47, saturation: 0.90, brightness: 0.70).opacity(0.26), .clear],
                               center: UnitPoint(x: 0.06, y: 0.84), startRadius: 0, endRadius: span * 0.76)
                RadialGradient(colors: [NativeTheme.purple.opacity(0.20), .clear],
                               center: UnitPoint(x: 0.52, y: 0.44), startRadius: 0, endRadius: span * 0.66)
                starfield(span: geo.size)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    /// Twinkle is a slow opacity breath, never a position change, and it stops
    /// dead under Reduce Motion -- this sits behind every screen in the app, so
    /// it redraws for the whole session and has to stay cheap and ignorable.
    @ViewBuilder private func starfield(span: CGSize) -> some View {
        if reduceMotion {
            Canvas { context, _ in Self.draw(in: context, size: span, time: 0, twinkling: false) }
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 12.0)) { timeline in
                let time = timeline.date.timeIntervalSinceReferenceDate
                Canvas { context, _ in Self.draw(in: context, size: span, time: time, twinkling: true) }
            }
        }
    }

    private static func draw(in context: GraphicsContext, size: CGSize, time: TimeInterval, twinkling: Bool) {
        for star in stars {
            let breath = twinkling ? (sin(time * 0.7 + star.phase) + 1) / 2 : 0.6
            let alpha = star.peak * (0.45 + 0.55 * breath)
            let point = CGPoint(x: star.x * size.width, y: star.y * size.height)
            let rect = CGRect(x: point.x - star.radius, y: point.y - star.radius,
                              width: star.radius * 2, height: star.radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(alpha)))
        }
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