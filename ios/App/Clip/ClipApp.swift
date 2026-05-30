import SwiftUI

@main
struct BytspotClipApp: App {
    @StateObject private var invocation = ClipInvocationModel()

    init() {
        #if DEBUG
        BytspotAviationFallbackTests.run()
        #endif
    }

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

enum ClipFlowStep: Equatable {
    case catalog
    case vendors(service: ClipLocalService)
    case checkout(service: ClipLocalService, vendor: ClipVendor)
    case success(service: ClipLocalService, vendor: ClipVendor, bookingRef: String)
}

enum ClipVendorFilter: String, CaseIterable, Identifiable {
    case now = "Now"
    case tonight = "Tonight"
    case thisWeek = "This Week"
    var id: String { rawValue }
}

@MainActor
final class ClipInvocationModel: ObservableObject {
    @Published var venueSlug: String?
    @Published var patchId: String?
    @Published var token: String?
    @Published var invocationURL: URL?
    @Published var patchContext: ClipPatchContext?
    @Published var tier: BytspotTier = .black
    @Published var services: [ClipLocalService] = ClipLocalService.fallbacks(for: .black)
    @Published var isLoadingContext = false
    @Published var isLoadingServices = false
    @Published var verificationState: ClipVerifyState = .idle
    @Published var contextError: String?

    @Published var flow: ClipFlowStep = .catalog
    @Published var vendorsByService: [String: [ClipVendor]] = [:]
    @Published var loadingVendorsService: String?
    @Published var vendorFilter: ClipVendorFilter = .now
    @Published var guestCount: Int = 1

    private let api = ClipPatchVerifier()
    private var loadTask: Task<Void, Never>?
    private var vendorTasks: [String: Task<Void, Never>] = [:]

    func handle(activity: NSUserActivity) {
        guard let url = activity.webpageURL else { return }
        handle(url: url)
    }

    func handle(url: URL) {
        invocationURL = url
        flow = .catalog
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

        let detectedTier = BytspotTier.detect(url: url, patchId: patchId)
        tier = detectedTier
        // Reset catalog/vendor caches when the tier changes so stale luxury
        // entries never leak into a Green/Platinum invocation.
        services = ClipLocalService.fallbacks(for: detectedTier)
        vendorsByService.removeAll()

        loadTask?.cancel()
        guard let patchId else { return }
        let token = token
        loadTask = Task { [weak self] in
            await self?.loadContextAndVerify(patchId: patchId, token: token)
        }
    }

    func selectService(_ service: ClipLocalService) {
        flow = .vendors(service: service)
        prefetchVendors(for: service)
    }

    func selectVendor(_ vendor: ClipVendor, service: ClipLocalService) {
        guestCount = max(guestCount, 1)
        flow = .checkout(service: service, vendor: vendor)
    }

    func completeCheckout(service: ClipLocalService, vendor: ClipVendor, bookingRef: String) {
        flow = .success(service: service, vendor: vendor, bookingRef: bookingRef)
    }

    func backToCatalog() {
        flow = .catalog
    }

    func backToVendors(service: ClipLocalService) {
        flow = .vendors(service: service)
    }

    func incrementGuests() { guestCount = min(guestCount + 1, 12) }
    func decrementGuests() { guestCount = max(guestCount - 1, 1) }

    func prefetchVendors(for service: ClipLocalService) {
        if vendorsByService[service.id] != nil { return }
        if vendorTasks[service.id] != nil { return }
        vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
        loadingVendorsService = service.id
        let patchId = self.patchId
        let tier = self.tier
        vendorTasks[service.id] = Task { [weak self] in
            let live = (try? await self?.api.searchVendors(service: service, patchId: patchId, tier: tier)) ?? []
            guard let self else { return }
            if !live.isEmpty {
                self.vendorsByService[service.id] = live
            }
            if self.loadingVendorsService == service.id { self.loadingVendorsService = nil }
            self.vendorTasks[service.id] = nil
        }
    }

    func vendors(for service: ClipLocalService) -> [ClipVendor] {
        vendorsByService[service.id] ?? ClipVendor.fallbacks(for: service, tier: tier)
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
        let activeTier = tier
        services = ClipLocalService.fallbacks(for: activeTier)

        let resolvedContext = try? await api.resolvePatch(patchId: patchId, tier: activeTier)
        let resolvedServices = (try? await api.searchServices(patchId: patchId, tier: activeTier)) ?? []
        if Task.isCancelled { return }

        patchContext = resolvedContext
        if let resolvedContext {
            // Backend authority over the visual tier — re-skin if it differs
            // from the URL-derived guess.
            if resolvedContext.tier != tier {
                tier = resolvedContext.tier
            }
            if venueSlug == nil {
                venueSlug = resolvedContext.title
            }
        }
        if !resolvedServices.isEmpty {
            services = resolvedServices
        } else if tier != activeTier {
            // Tier changed during resolve; refresh the curated fallback set.
            services = ClipLocalService.fallbacks(for: tier)
        }
        isLoadingContext = false
        isLoadingServices = false

        if resolvedContext == nil {
            contextError = "Live venue context is unavailable. Showing curated local services."
        }
        if let first = services.first {
            prefetchVendors(for: first)
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
