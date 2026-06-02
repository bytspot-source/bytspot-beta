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
                .onOpenURL { url in
                    invocation.handle(url: url)
                }
                .task {
                    #if DEBUG
                    // Simulator recovery path: on iOS 26 the _XCAppClipURL
                    // argv is not consistently surfaced through
                    // onContinueUserActivity. Pull it directly from argv
                    // (or the explicit BYT_DEBUG_URL env override used by
                    // the screencap sweep) so the deep-link walkthrough is
                    // reachable.
                    guard invocation.invocationURL == nil else { return }
                    if let env = ProcessInfo.processInfo.environment["BYT_DEBUG_URL"],
                       let url = URL(string: env) {
                        invocation.handle(url: url)
                        return
                    }
                    let argv = ProcessInfo.processInfo.arguments
                    if let idx = argv.firstIndex(of: "_XCAppClipURL"),
                       idx + 1 < argv.count,
                       let url = URL(string: argv[idx + 1]) {
                        invocation.handle(url: url)
                    }
                    #endif
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
        vendorFilter = .now
        guestCount = 1
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let items = components.queryItems ?? []
        let pathParts = Self.pathParts(from: components)

        venueSlug = Self.queryValue(in: items, names: ["venue", "venuename", "v"])
            ?? venueSlug
        patchId = Self.queryValue(in: items, names: ["patch", "patchid", "p"])
            ?? Self.patchId(from: pathParts)
            ?? patchId
        token = Self.queryValue(in: items, names: ["t", "token"])

        let detectedTier = BytspotTier.detect(url: url, patchId: patchId)
        tier = detectedTier
        // Reset catalog/vendor caches when the tier changes so stale luxury
        // entries never leak into a Green/Platinum invocation.
        services = ClipLocalService.fallbacks(for: detectedTier)
        vendorsByService.removeAll()

        loadTask?.cancel()

        #if DEBUG
        // Deep-link walkthrough hook used by scripts/clip-screencap-sweep.sh
        // to fast-forward the flow state machine for the TestFlight pre-flight
        // screenshot gallery. Stripped from Release builds entirely.
        if let step = items.first(where: { $0.name == "step" })?.value,
           applyDebugWalkthrough(step: step) {
            return
        }
        #endif

        guard let patchId else { return }
        let token = token
        loadTask = Task { [weak self] in
            await self?.loadContextAndVerify(patchId: patchId, token: token)
        }
    }

    /// Universal Link used when the Clip hands off to the installed full app.
    /// If the full app is not installed, the view layer falls back to SKOverlay.
    var mainAppHandoffURL: URL? {
        let resolvedPatchId = patchId ?? patchContext?.patchId
        var components = URLComponents()
        components.scheme = "https"
        components.host = "bytspot.app"
        if let resolvedPatchId, !resolvedPatchId.isEmpty {
            components.path = "/access/\(resolvedPatchId)"
        } else {
            components.path = "/"
        }
        var queryItems = [
            URLQueryItem(name: "tier", value: tier.rawValue),
            URLQueryItem(name: "source", value: "app_clip"),
            URLQueryItem(name: "handoff", value: "1")
        ]
        if let token, !token.isEmpty {
            queryItems.append(URLQueryItem(name: "t", value: token))
        }
        if let venue = venueSlug ?? patchContext?.title, !venue.isEmpty {
            queryItems.append(URLQueryItem(name: "venue", value: venue))
        }
        components.queryItems = queryItems
        return components.url
    }

    #if DEBUG
    /// Synchronously advances `flow` to the requested step using the locally
    /// resolved tier fallback catalog + vendor pool. Returns `true` when the
    /// hook handled the URL (so the live backend resolve is skipped, keeping
    /// the screenshot deterministic). Returns `false` for `catalog` / unknown
    /// values so the regular `loadContextAndVerify` path still runs.
    private func applyDebugWalkthrough(step: String) -> Bool {
        switch step.lowercased() {
        case "catalog":
            flow = .catalog
            return true
        case "vendors":
            guard let service = services.first else { return false }
            selectService(service)
            return true
        case "checkout":
            guard let service = services.first else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .checkout(service: service, vendor: vendor)
            return true
        case "success":
            guard let service = services.first else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "BYT-PREVIEW-0001")
            return true
        case "success_marine", "marine_success":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("black-marine") || text.contains("marine") || text.contains("yacht") || text.contains("vessel")
            }) else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "BYT-MARINE-0001")
            return true
        case "success_gh_akwaaba", "success_fifa_matchday", "success_platinum_fifa":
            let service = ClipLocalService(id: "platinum-fifa-matchday", title: "GH Akwaaba Pass", subtitle: "Premium FIFA entry, digital credentials, and concierge arrival.", action: "Buy Pass", iconName: "ticket.fill", tintName: "violet", priceLabel: "From $50", amountCents: 5_000, currency: "USD", source: "curated", heroImageURL: nil, category: "events")
            let fallbacks = ClipVendor.fallbacks(for: service, tier: tier)
            guard let vendor = fallbacks.first else { return false }
            vendorsByService[service.id] = fallbacks
            flow = .success(service: service, vendor: vendor, bookingRef: "GH-AKWAABA-0001")
            return true
        case "success_platinum_event", "platinum_event_success":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("platinum-entry") || text.contains("event") || text.contains("entry") || text.contains("ticket") || text.contains("pass") || text.contains("fifa") || text.contains("matchday") || text.contains("nightlife") || text.contains("bottle") || text.contains("akwaaba")
            }) else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "PLATINUM-EVENT-0001")
            return true
        case "success_platinum_nightlife", "platinum_nightlife_success", "success_platinum_bottle":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("nightlife") || text.contains("bottle")
            }) else { return false }
            let fallbacks = ClipVendor.fallbacks(for: service, tier: tier)
            let vendor = fallbacks.first ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = fallbacks
            flow = .success(service: service, vendor: vendor, bookingRef: "PLATINUM-EVENT-0001")
            return true
        case "black_ride", "ride", "valet":
            openValetBoutiqueServices()
            return true
        default:
            return false
        }
    }
    #endif

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

    func openValetBoutiqueServices() {
        let catalog = services + ClipLocalService.fallbacks(for: tier)
        guard let service = catalog.first(where: Self.isRideLogisticsService) else {
            flow = .catalog
            return
        }
        flow = .vendors(service: service)
        prefetchVendors(for: service)
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

    private static func isRideLogisticsService(_ service: ClipLocalService) -> Bool {
        let text = [service.id, service.title, service.action, service.category ?? ""]
            .joined(separator: " ")
            .lowercased()
        return text.contains("valet")
            || text.contains("chauffeur")
            || text.contains("rideshare")
            || text.contains("ride")
            || text.contains("transport")
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

    private static func pathParts(from components: URLComponents) -> [String] {
        var parts = components.path.split(separator: "/").map(String.init)
        let scheme = components.scheme?.lowercased()
        if scheme != "http", scheme != "https", let host = components.host, !host.isEmpty {
            parts.insert(host, at: 0)
        }
        return parts
    }

    private static func queryValue(in items: [URLQueryItem], names: Set<String>) -> String? {
        items.first { names.contains($0.name.lowercased()) }?.value
    }
}
