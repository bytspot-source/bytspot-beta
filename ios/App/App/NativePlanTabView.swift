import SwiftUI

/// The Plan tab: a first-class home for the caller's plans, sitting beside
/// Home in the bottom bar. It reuses `NativePlansPanel` for the list, create,
/// and detail surfaces, and adds the tab chrome the panel does not carry when
/// it is presented as a Profile sheet.
struct NativePlanTabView: View {
    @ObservedObject var sessionStore: BytspotSessionStore

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                NativePlansPanel(sessionStore: sessionStore)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PLAN").font(.system(size: 11, weight: .black)).tracking(1.6).foregroundColor(NativeTheme.textTertiary)
            Text("Your night, in one place").font(.system(size: 24, weight: .black, design: .rounded)).foregroundColor(NativeTheme.textPrimary)
        }
        // Leave room for the global profile avatar in the top-right overlay.
        .padding(.trailing, 56)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
