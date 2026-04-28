import SwiftUI

@main
struct BytspotClipApp: App {
    @StateObject private var invocation = ClipInvocationModel()

    var body: some Scene {
        WindowGroup {
            ClipContentView()
                .environmentObject(invocation)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    invocation.handle(activity: activity)
                }
        }
    }
}

final class ClipInvocationModel: ObservableObject {
    @Published var venueSlug: String?
    @Published var patchId: String?
    @Published var token: String?
    @Published var invocationURL: URL?

    func handle(activity: NSUserActivity) {
        guard let url = activity.webpageURL else { return }
        invocationURL = url
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let items = components.queryItems ?? []
        venueSlug = items.first(where: { $0.name == "venue" })?.value
        patchId = items.first(where: { $0.name == "patch" })?.value
        token = items.first(where: { $0.name == "t" })?.value
            ?? items.first(where: { $0.name == "token" })?.value
    }
}
