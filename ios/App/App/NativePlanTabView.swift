import SwiftUI

/// The Plan tab: a first-class home for the caller's plans, sitting beside
/// Home in the bottom bar. It reuses `NativePlansPanel` for the list, create,
/// and detail surfaces, and adds the tab chrome the panel does not carry when
/// it is presented as a Profile sheet.
struct NativePlanTabView: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    var openDiscoverFilter: (String) -> Void = { _ in }
    var openMap: () -> Void = {}

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                NativePlansPanel(sessionStore: sessionStore, onOpenNeed: routeToNeed, showsSuggestions: true)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        // The shell's brand gradient is always dark; sit on the adaptive page
        // surface instead so the tab reads correctly in Light and Dark, and so
        // NativePlansPanel renders in the same adaptive context it uses inside
        // the Profile panel.
        .background(NativePolish.screenBackground.ignoresSafeArea())
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PLAN").font(.system(size: 11, weight: .black)).tracking(1.6).foregroundColor(NativeTheme.textTertiary)
            Text("Everything in one place").font(.system(size: 24, weight: .black, design: .rounded)).foregroundColor(NativeTheme.textPrimary)
        }
        // Leave room for the global profile avatar in the top-right overlay.
        .padding(.trailing, 56)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // A still-open need routes to the surface that can actually fill it:
    // browsable supply goes to Discover, parking is map-native. "stay" has no
    // destination today, so needDestination returns nil and the row is not a
    // button.
    private func routeToNeed(_ need: String) {
        switch NativePlanDisplay.needDestination(need) {
        case .discover(let filter)?: openDiscoverFilter(filter)
        case .map?: openMap()
        case nil: break
        }
    }
}
