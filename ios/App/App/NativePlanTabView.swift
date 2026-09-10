import SwiftUI

/// Start Plan is a creation destination, not a second My Plans list.
/// The wizard opens at Idea immediately; existing plans stay in Profile.
struct NativePlanTabView: View {
    @ObservedObject var sessionStore: BytspotSessionStore
    var openDiscoverFilter: (String) -> Void = { _ in }
    var openMap: () -> Void = {}
    var onCancel: () -> Void = {}
    var onSavingChanged: (Bool) -> Void = { _ in }
    @State private var createdPlan: CreatedPlan?
    @State private var draftID = UUID()

    private struct CreatedPlan: Identifiable { let id: String }

    var body: some View {
        NativePlanCreateSheet(
            sessionStore: sessionStore,
            isEmbedded: true,
            onCancel: onCancel,
            onSavingChanged: onSavingChanged,
            onCreated: { createdPlan = CreatedPlan(id: $0) }
        )
        .id(draftID)
        .background(NativeDeepSpaceGround())
        .accessibilityIdentifier("native-start-plan-tab")
        .sheet(item: $createdPlan, onDismiss: {
            // A completed draft must never be submitted again. Dismissing its
            // detail returns to a fresh Idea, not the saved-plan list.
            draftID = UUID()
        }) { plan in
            NativePlanDetailSheet(
                planID: plan.id,
                sessionStore: sessionStore,
                onChanged: {},
                onOpenNeed: routeToNeed
            )
        }
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
