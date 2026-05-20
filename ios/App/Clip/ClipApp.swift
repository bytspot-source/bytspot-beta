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
        let pathParts = components.path
            .split(separator: "/")
            .map(String.init)

        venueSlug = items.first(where: { ["venue", "venueName", "v"].contains($0.name) })?.value
            ?? venueSlug
        patchId = items.first(where: { ["patch", "patchId", "p"].contains($0.name) })?.value
            ?? Self.patchId(from: pathParts)
            ?? patchId
        token = items.first(where: { $0.name == "t" })?.value
            ?? items.first(where: { $0.name == "token" })?.value
    }

    private static func patchId(from pathParts: [String]) -> String? {
        guard !pathParts.isEmpty else { return nil }
        let routeNames = Set(["access", "p", "patch", "t"])
        if pathParts.count >= 2, routeNames.contains(pathParts[0]) {
            return pathParts[1]
        }
        if pathParts.count == 1, pathParts[0].count >= 8 {
            return pathParts[0]
        }
        return nil
    }
}
