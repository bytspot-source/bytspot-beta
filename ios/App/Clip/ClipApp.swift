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

@MainActor
final class ClipInvocationModel: ObservableObject {
    @Published var venueSlug: String?
    @Published var patchId: String?
    @Published var token: String?
    @Published var invocationURL: URL?
    @Published var patchContext: ClipPatchContext?
    @Published var services: [ClipLocalService] = ClipLocalService.fallbacks
    @Published var isLoadingContext = false
    @Published var isLoadingServices = false
    @Published var verificationState: ClipVerifyState = .idle
    @Published var contextError: String?

    private let api = ClipPatchVerifier()
    private var loadTask: Task<Void, Never>?

    func handle(activity: NSUserActivity) {
        guard let url = activity.webpageURL else { return }
        handle(url: url)
    }

    func handle(url: URL) {
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

        loadTask?.cancel()
        guard let patchId else { return }
        let token = token
        loadTask = Task { [weak self] in
            await self?.loadContextAndVerify(patchId: patchId, token: token)
        }
    }

    func verifyCurrentToken() {
        guard let token, !token.isEmpty else { return }
        Task { await verify(token: token) }
    }

    private func loadContextAndVerify(patchId: String, token: String?) async {
        verificationState = .idle
        contextError = nil
        isLoadingContext = true
        isLoadingServices = true
        services = ClipLocalService.fallbacks

        let resolvedContext = try? await api.resolvePatch(patchId: patchId)
        let resolvedServices = (try? await api.searchServices(patchId: patchId)) ?? []
        if Task.isCancelled { return }

        patchContext = resolvedContext
        if let resolvedContext, venueSlug == nil {
            venueSlug = resolvedContext.title
        }
        if !resolvedServices.isEmpty {
            services = resolvedServices
        }
        isLoadingContext = false
        isLoadingServices = false

        if resolvedContext == nil {
            contextError = "Live venue context is unavailable. Showing curated local services."
        }
        if let token, !token.isEmpty {
            await verify(token: token)
        }
    }

    private func verify(token: String) async {
        verificationState = .verifying
        do {
            let result = try await api.verify(token: token)
            let label = result.patch.label ?? patchContext?.title ?? venueSlug ?? "Patch \(result.patch.id)"
            verificationState = .verified(label: label, bindingType: result.binding?.type)
        } catch {
            let msg: String
            switch error {
            case ClipPatchVerifier.VerifyError.missingToken: msg = "No secure token was included in this tap."
            case ClipPatchVerifier.VerifyError.server(let m): msg = m
            case ClipPatchVerifier.VerifyError.network(let m): msg = m
            default: msg = "Could not verify this patch. Try again."
            }
            verificationState = .failed(message: msg)
        }
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
