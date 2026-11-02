import Foundation

#if DEBUG
/// DEBUG-only regression guard. Runs at Clip launch via `BytspotClipApp` and
/// crashes the debug build with a clear message if a refactor drifts.
enum BytspotAviationFallbackTests {
    static func run() {
        let greetingSuite = "com.bytspot.app.Clip.greeting-tests"
        let greetingDefaults = UserDefaults(suiteName: greetingSuite)!
        greetingDefaults.removePersistentDomain(forName: greetingSuite)
        ClipAuthStore.store(displayName: "Ada Lovelace", userID: "user-1", in: greetingDefaults)
        precondition(greetingDefaults.string(forKey: ClipAuthStore.displayNameKey) == "Ada")
        ClipAuthStore.store(displayName: nil, userID: "user-2", in: greetingDefaults)
        precondition(greetingDefaults.string(forKey: ClipAuthStore.displayNameKey) == nil)
        precondition(greetingDefaults.string(forKey: ClipAuthStore.displayNameUserIDKey) == nil)
        greetingDefaults.removePersistentDomain(forName: greetingSuite)

        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-B"), patchId: "BYT424-0301-B") == .black)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-P"), patchId: "BYT424-0301-P") == .platinum)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-G"), patchId: "BYT424-0301-G") == .green)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301?tier=platinum"), patchId: "BYT424-0301") == .platinum)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/access/BYT-BRONI-P?tier=platinum"), patchId: "BYT-BRONI-P") == .platinum)

        assertHostStudioPartyMappingContract()
        assertPartyPassPreviewContract()
        assertDefaultAppClipLinkRoutesToParty()
        assertBandTapScreenContract()
    }

    /// A band/card serial link shows only what the link carries: the serial,
    /// a tier when the link codes one, and the door-check line.
    private static func assertBandTapScreenContract() {
        let plainURL = URL(string: "https://bytspot.app/BYT424-0017")
        guard let plain = ClipBandTapScreen.resolve(url: plainURL, patchId: "BYT424-0017", token: nil) else {
            preconditionFailure("Band tap: an uncoded band serial must resolve to the band screen.")
        }
        precondition(plain.title == "Bytspot band BYT424-0017" && plain.tier == nil && plain.tierLine == nil, "Band tap: an uncoded band must show no tier.")
        precondition(plain.subtitle == ClipBandTapScreen.bodyText, "Band tap: an uncoded band must lead with the door-check line.")
        precondition(BytspotTier.detectIfCoded(url: plainURL, patchId: "BYT424-0017") == nil, "Band tap: an uncoded serial must not be reported as tier-coded.")
        precondition(BytspotTier.detect(url: plainURL, patchId: "BYT424-0017") == .black, "Band tap: `detect` keeps its Black default for callers that need one.")

        let black = ClipBandTapScreen.resolve(url: URL(string: "https://bytspot.app/BYT424-0017-B"), patchId: "BYT424-0017-B", token: nil)
        precondition(black?.title == "Bytspot band BYT424-0017" && black?.tierLine == "Black tier" && black?.subtitle == "Black tier", "Band tap: -B must show the serial without suffix and \"Black tier\".")
        let platinum = ClipBandTapScreen.resolve(url: URL(string: "https://bytspot.app/BYT424-0017?tier=platinum"), patchId: "BYT424-0017", token: nil)
        precondition(platinum?.tierLine == "Platinum tier", "Band tap: a tier query must code the tier line.")
        precondition(ClipBandTapScreen.resolve(url: URL(string: "https://bytspot.app/BYT424-0017-G"), patchId: "BYT424-0017-G", token: nil)?.tierLine == "Green tier", "Band tap: -G must show \"Green tier\".")

        precondition(ClipBandTapScreen.resolve(url: plainURL, patchId: "BYT424-0017", token: "ict-abc") == nil, "Band tap: a token-carrying link is not a band screen.")
        for patch in ["black-aviation-001", "platinum-parking-001", "BYT-BRONI-P", "BYT424-0017-X", "VENUE-1234"] {
            precondition(ClipBandTapScreen.resolve(url: URL(string: "https://bytspot.app/p/\(patch)"), patchId: patch, token: nil) == nil, "Band tap: '\(patch)' is not a band serial.")
        }

        for screen in [plain, black!, platinum!] {
            let copy = [ClipBandTapScreen.eyebrow, ClipBandTapScreen.bodyText, ClipBandTapScreen.getAppTitle, screen.title, screen.subtitle, screen.tierLine ?? ""].joined(separator: " ")
            for banned in ["$", "Pricing", "curated", "Curated", "Checkout", "Apple Pay", "Hold"] {
                precondition(!copy.contains(banned), "Band tap: band screen copy must not contain '\(banned)'.")
            }
        }
        precondition(ClipBandTapScreen.eyebrow == "BYTSPOT BAND" && ClipBandTapScreen.bodyText == "This band is checked at the door. Show it to staff when you arrive.", "Band tap: wording drifted from the app's NativeBandTapScreen.")
    }

    /// Explicit DEBUG launch test (`--test-party-invocation`). Drives the
    /// invocation model with band links; a band runs no lookup, and any other
    /// link's lookup is cancelled before it runs, so no request leaves the device.
    @MainActor static func runBandInvocationRegressions() {
        let model = ClipInvocationModel(partyInviteLoader: { _ in preconditionFailure("Band tap: a band link must never load a party.") })
        model.handle(url: URL(string: "https://bytspot.app/BYT424-0017")!)
        guard case .band(let plain) = model.flow else { preconditionFailure("Band tap: an uncoded band link must show the band screen.") }
        precondition(plain.tier == nil && !model.isLoadingContext, "Band tap: the band screen must not show a loading message.")
        precondition(model.invocationTaskForTesting == nil, "Band tap: staff check bands at the door; no guest band lookup may run.")
        let plainHandoff = model.mainAppHandoffURL.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        precondition(plainHandoff?.path == "/access/BYT424-0017" && plainHandoff?.queryItems?.contains(where: { $0.name == "tier" }) == false, "Band tap: an uncoded band must not hand off as a Black link.")

        model.handle(url: URL(string: "https://bytspot.app/BYT424-0017-B")!)
        model.invocationTaskForTesting?.cancel()
        guard case .band(let black) = model.flow, black.tierLine == "Black tier" else { preconditionFailure("Band tap: a -B band must show the band screen with \"Black tier\".") }
        precondition(model.mainAppHandoffURL?.absoluteString.contains("tier=black") == true, "Band tap: a coded band keeps its tier in the handoff.")

        model.handle(url: URL(string: "https://bytspot.app/BYT424?patchId=BYT424-0301")!)
        model.invocationTaskForTesting?.cancel()
        guard case .band(let campaign) = model.flow, campaign.title == "Bytspot band BYT424-0301" else { preconditionFailure("Band tap: a campaign-root serial query must show the band screen.") }

        model.handle(url: URL(string: "https://bytspot.app/BYT424-0017?t=ict-abc")!)
        precondition(model.flow == .linkNotInUse && model.invocationTaskForTesting == nil, "Old links: a token-carrying band link runs no lookup.")

        model.handle(url: URL(string: "https://bytspot.app/BYT424-0017?tier=platinum&venue=GH%20Akwaaba%20Pass")!)
        guard case .band = model.flow else { preconditionFailure("Old links: an Akwaaba query no longer opens a sample checkout.") }

        model.handle(url: URL(string: "https://bytspot.app/party/party-17")!)
        model.invocationTaskForTesting?.cancel()
        precondition(model.flow == .partyLoading(partyID: "party-17"), "Band tap: a Party Pass link must keep the party flow.")

        for old in ["https://bytspot.app/access/BYT-BRONI-P?tier=platinum", "https://bytspot.app/p/black-aviation-001?tier=black",
                    "https://bytspot.app/t/black-0301", "https://bytspot.app/?patch=platinum-parking-001", "https://bytspot.app/venue/somewhere"] {
            model.handle(url: URL(string: old)!)
            precondition(model.flow == .linkNotInUse, "Old links: '\(old)' must show Link not in use.")
            precondition(model.invocationTaskForTesting == nil, "Old links: '\(old)' must not call the server.")
            precondition(model.mainAppHandoffURL?.absoluteString == "https://bytspot.app/", "Old links: Get Bytspot opens the app's home.")
        }

        model.handle(url: URL(string: "https://bytspot.app/")!)
        precondition(model.flow == .awaitingInvocation, "The bare home page waits for an invocation.")
        print("BAND_INVOCATION_REGRESSIONS_PASSED")
    }

    /// Explicit DEBUG launch test (`--test-party-invocation`). A business code
    /// shows what `inventory.openPatch` names.
    @MainActor static func runVendorPatchInvocationRegressions() async {
        let payload: [String: Any] = [
            "code": "K7M2QX9P", "sellerName": "Broni's Kitchen",
            "place": ["label": "Broni's Midtown", "address": "", "lat": 33.78, "lng": -84.38],
            "cards": [
                ["windowId": "w1", "title": "Chef's table", "priceCents": 4500, "intent": "request", "nextSlot": ["startsAt": "2026-11-03T23:00:00.000Z", "remaining": 4]],
                ["windowId": "w2", "title": "Walk-in", "priceCents": 0, "intent": "browse", "nextSlot": ["startsAt": "2026-11-03T23:00:00.000Z", "remaining": 4]],
            ],
        ]
        guard let patch = ClipVendorPatch.fromPayload(payload, expectedCode: "K7M2QX9P") else { preconditionFailure("Vendor patch: an opened patch must parse.") }
        precondition(patch.placeLabel == "Broni's Midtown" && patch.address == nil && patch.services.map(\.id) == ["w1"], "Vendor patch: only request services are listed, and an empty address is hidden.")
        precondition(patch.services.first?.nextSlot != nil && ClipVendorPatch.priceLabel(4500) == "$45", "Vendor patch: price and next time drifted.")
        precondition(ClipVendorPatch.fromPayload(payload, expectedCode: "OTHER123") == nil, "Vendor patch: a response for another code must never render.")
        precondition(ClipVendorPatch.code(from: ["at", "k7m2qx9p"]) == "K7M2QX9P" && ClipVendorPatch.code(from: ["at"]) == nil && ClipVendorPatch.code(from: ["at", "a/b"]) == nil && ClipVendorPatch.code(from: ["p", "K7M2QX9P"]) == nil)

        let model = ClipInvocationModel(
            partyInviteLoader: { _ in preconditionFailure("Vendor patch: a business code must never load a party.") },
            vendorPatchLoader: { code in
                if code == "GONE1234" { throw ClipPatchVerifier.VerifyError.server(ClipVendorPatch.notInUseMessage) }
                guard code == "K7M2QX9P" else { throw URLError(.notConnectedToInternet) }
                return patch
            })
        model.handle(url: URL(string: "https://bytspot.app/at/k7m2qx9p")!)
        precondition(model.flow == .vendorPatchLoading(code: "K7M2QX9P"), "Vendor patch: a business code must load what the server names.")
        precondition(model.mainAppHandoffURL?.absoluteString == "https://bytspot.app/at/K7M2QX9P", "Vendor patch: Get Bytspot must open this code in the app.")
        await model.invocationTaskForTesting!.value
        precondition(model.flow == .vendorPatch(patch) && !model.isLoadingContext)

        model.handle(url: URL(string: "https://bytspot.app/at/GONE1234")!)
        await model.invocationTaskForTesting!.value
        precondition(model.flow == .vendorPatchFailed(code: "GONE1234", message: ClipVendorPatch.notInUseMessage), "Vendor patch: a retired code says so.")

        model.handle(url: URL(string: "https://bytspot.app/at/OFFLINE1")!)
        await model.invocationTaskForTesting!.value
        precondition(model.flow == .vendorPatchFailed(code: "OFFLINE1", message: ClipVendorPatch.failedMessage), "Vendor patch: a network failure offers a retry, not 'not in use'.")
        print("VENDOR_PATCH_INVOCATION_REGRESSIONS_PASSED")
    }

    /// Explicit DEBUG launch test (`--test-party-invocation`). A shared sale
    /// link shows its listing, never a Black tier.
    @MainActor static func runSaleInvocationRegressions() async {
        let payload: [String: Any] = [
            "saleId": "sale-17", "title": " Jordan 4 Retro ", "priceCents": 22_000, "sellerName": "Kojo",
            "photoUrl": "http://insecure.example/x.jpg", "windowStart": "2026-10-28T18:00:00.000Z",
            "windowEnd": "2026-10-28T19:00:00.000Z", "areaLabel": NSNull(), "isSeller": false,
        ]
        guard let listing = ClipSaleListing.fromPayload(payload, expectedID: "sale-17") else { preconditionFailure("Sale: a public listing must parse.") }
        precondition(listing.title == "Jordan 4 Retro" && listing.priceLabel == "$220" && listing.windowLabel != nil, "Sale: title, price and window drifted.")
        precondition(listing.photoURL == nil && listing.areaLabel == nil, "Sale: only an https photo and a real area are shown.")
        precondition(ClipSaleListing.fromPayload(payload, expectedID: "sale-other") == nil, "Sale: a response for another sale must never render.")

        precondition(ClipSaleListing.route(from: ["sale", "sale-17"]) == .sale(id: "sale-17"))
        precondition(ClipSaleListing.route(from: ["Sale", "sale-17"]) == .sale(id: "sale-17"))
        precondition(ClipSaleListing.route(from: ["sale"]) == .invalid && ClipSaleListing.route(from: ["sale", "a", "b"]) == .invalid)
        precondition(ClipSaleListing.route(from: ["party", "p1"]) == .none && ClipSaleListing.route(from: ["BYT424-0017"]) == .none)
        precondition(ClipSaleListing.route(from: [], queryItems: [URLQueryItem(name: "saleId", value: " s1 ")], isDefaultAppClipLink: true) == .sale(id: "s1"))
        precondition(ClipSaleListing.route(from: [], queryItems: [URLQueryItem(name: "partyId", value: "p1")], isDefaultAppClipLink: true) == .none)

        let model = ClipInvocationModel(
            partyInviteLoader: { _ in preconditionFailure("Sale: a sale link must never load a party.") },
            saleLoader: { id in
                guard id == "sale-17" else { throw URLError(.badServerResponse) }
                return listing
            })
        model.handle(url: URL(string: "https://bytspot.app/sale/sale-17")!)
        precondition(model.flow == .saleLoading(saleID: "sale-17"), "Sale: a sale link must load its listing.")
        precondition(model.mainAppHandoffURL?.absoluteString == "https://bytspot.app/sale/sale-17", "Sale: Get Bytspot must open this sale in the app.")
        let loaded = model.invocationTaskForTesting!
        await loaded.value
        precondition(model.flow == .sale(listing) && !model.isLoadingContext)

        model.handle(url: URL(string: "https://bytspot.app/sale/gone")!)
        let failed = model.invocationTaskForTesting!
        await failed.value
        guard case .saleFailed(let failedID, _) = model.flow, failedID == "gone" else { preconditionFailure("Sale: an ended sale must say so.") }

        model.handle(url: URL(string: "https://bytspot.app/sale/")!)
        guard case .saleFailed(let emptyID, _) = model.flow, emptyID.isEmpty else { preconditionFailure("Sale: an incomplete sale link must fail explicitly.") }
        precondition(model.invocationTaskForTesting == nil && model.mainAppHandoffURL == nil)
        print("SALE_INVOCATION_REGRESSIONS_PASSED")
    }

    /// Explicit DEBUG launch test (`--test-party-invocation`). Uses suspended
    /// in-memory requests, never URLSession or an authenticated party endpoint.
    @MainActor static func runPartyInvocationRegressions() async {
        func invite(_ id: String) -> PartyPassInvite {
            PartyPassInvite.fromPayload([
                "id": id, "title": "Fixture invitation", "tier": "green",
                "source": "host-studio-party", "locationDisclosure": "withheld"
            ])!
        }
        func url(_ id: String) -> URL { URL(string: "https://bytspot.app/party/\(id)")! }

        let requests = PartyInvocationRequests()
        let model = ClipInvocationModel(partyInviteLoader: { try await requests.load($0) })
        precondition(model.flow == .awaitingInvocation, "A cold Clip must wait for context.")
        model.handle(url: URL(string: "https://appclip.apple.com/id?p=com.bytspot.app.Clip")!)
        guard case .partyFailed(let missingID, _) = model.flow, missingID.isEmpty else {
            preconditionFailure("A missing party ID must fail explicitly, never become a patch.")
        }
        precondition(model.invocationTaskForTesting == nil && !model.isLoadingContext)

        // A fails after B started. A must not clear B's handle; C must still
        // cancel B. The fixture intentionally ignores cancellation until resumed.
        model.handle(url: url("a"))
        let taskA = model.invocationTaskForTesting!
        await requests.waitFor("a")
        let activity = NSUserActivity(activityType: NSUserActivityTypeBrowsingWeb)
        activity.webpageURL = url("b")
        model.handle(activity: activity)
        let taskB = model.invocationTaskForTesting!
        await requests.waitFor("b")
        requests.finish("a", .failure(URLError(.cancelled)))
        await taskA.value
        precondition(model.flow == .partyLoading(partyID: "b") && model.isLoadingContext)
        precondition(model.invocationTaskForTesting != nil, "Old completion cleared the replacement's cancellation handle.")
        model.handle(url: url("c"))
        let taskC = model.invocationTaskForTesting!
        await requests.waitFor("c")
        requests.finish("b", .success(invite("b")))
        await taskB.value
        precondition(requests.cancelled.contains("b"), "C must still cancel B after A finishes.")
        precondition(model.flow == .partyLoading(partyID: "c") && model.isLoadingContext)
        requests.finish("c", .success(invite("c")))
        await taskC.value
        precondition(model.flow == .party(invite("c")) && !model.isLoadingContext)
        precondition(model.partyShareURL == url("c"))

        // Both Swift cancellation and ordinary late network failure are stale.
        for (index, error) in [CancellationError() as Error, URLError(.timedOut) as Error].enumerated() {
            let oldID = "old-\(index)", newID = "new-\(index)"
            model.handle(url: url(oldID))
            let oldTask = model.invocationTaskForTesting!
            await requests.waitFor(oldID)
            model.handle(url: url(newID))
            let newTask = model.invocationTaskForTesting!
            await requests.waitFor(newID)
            requests.finish(oldID, .failure(error))
            await oldTask.value
            precondition(model.flow == .partyLoading(partyID: newID) && model.isLoadingContext)
            requests.finish(newID, .success(invite(newID)))
            await newTask.value
            precondition(model.flow == .party(invite(newID)))
        }

        model.handle(url: url("old-party"))
        let abandonedTask = model.invocationTaskForTesting!
        await requests.waitFor("old-party")
        model.handle(url: URL(string: "https://bytspot.app/")!)
        requests.finish("old-party", .success(invite("old-party")))
        await abandonedTask.value
        precondition(model.flow == .awaitingInvocation && !model.isLoadingContext)
        precondition(model.partyShareURL == nil)

        // A genuine current failure remains recoverable without reopening iOS.
        model.handle(url: url("retry"))
        let failedTask = model.invocationTaskForTesting!
        await requests.waitFor("retry")
        requests.finish("retry", .failure(URLError(.notConnectedToInternet)))
        await failedTask.value
        guard case .partyFailed(let failedID, _) = model.flow, failedID == "retry" else {
            preconditionFailure("Current failure must expose the invitation retry state.")
        }
        model.retryPartyInvite()
        let retryTask = model.invocationTaskForTesting!
        await requests.waitFor("retry")
        requests.finish("retry", .success(invite("retry")))
        await retryTask.value
        precondition(model.flow == .party(invite("retry")) && !model.isLoadingContext)

        model.handle(url: url("expected"))
        let mismatchedTask = model.invocationTaskForTesting!
        await requests.waitFor("expected")
        requests.finish("expected", .success(invite("other")))
        await mismatchedTask.value
        guard case .partyFailed(let expectedID, _) = model.flow, expectedID == "expected" else {
            preconditionFailure("A response for another party must never replace this invitation.")
        }
        precondition(model.partyShareURL == nil && !model.isLoadingContext)
        print("PARTY_INVOCATION_REGRESSIONS_PASSED")
    }

    @MainActor private final class PartyInvocationRequests {
        private var pending: [String: CheckedContinuation<PartyPassInvite, Error>] = [:]
        private var started: [String: CheckedContinuation<Void, Never>] = [:]
        private(set) var cancelled: Set<String> = []

        func load(_ id: String) async throws -> PartyPassInvite {
            defer { if Task.isCancelled { cancelled.insert(id) } }
            return try await withCheckedThrowingContinuation { continuation in
                precondition(pending[id] == nil)
                pending[id] = continuation
                started.removeValue(forKey: id)?.resume()
            }
        }

        func waitFor(_ id: String) async {
            if pending[id] != nil { return }
            await withCheckedContinuation { started[id] = $0 }
        }

        func finish(_ id: String, _ result: Result<PartyPassInvite, Error>) {
            guard let continuation = pending.removeValue(forKey: id) else {
                preconditionFailure("No suspended fixture request for \(id)")
            }
            continuation.resume(with: result)
        }
    }

    /// A shared link opens the Clip through Apple's default App Clip link,
    /// because iOS will not invoke a Clip from a link on the page's own domain.
    /// That URL names the party by query parameter and reserves `p` for the
    /// Clip bundle ID, which the patch parser would otherwise claim.
    private static func assertDefaultAppClipLinkRoutesToParty() {
        let bundleID = "com.bytspot.app.Clip"
        let items = [URLQueryItem(name: "p", value: bundleID), URLQueryItem(name: "partyId", value: "party-1")]
        precondition(
            ClipInvocationModel.partyRoute(from: ["id"], queryItems: items, isDefaultAppClipLink: true) == .party(id: "party-1"),
            "Party Loop: a default App Clip link must route to its party."
        )
        precondition(
            ClipInvocationModel.partyRoute(from: ["party", "party-1"]) == .party(id: "party-1"),
            "Party Loop: a /party/<id> share link must still route to its party."
        )
        precondition(
            ClipInvocationModel.partyRoute(from: ["id"], queryItems: [URLQueryItem(name: "p", value: bundleID)], isDefaultAppClipLink: true) == .none,
            "Party Loop: a default App Clip link without a party must not be treated as one."
        )
        // In-app browsers can normalize the handoff URL (www., case changes).
        // Missing the host used to keep party guests from their Party Pass.
        precondition(
            ClipInvocationModel.isDefaultAppClipLinkHost("APPCLIP.Apple.com")
                && ClipInvocationModel.isDefaultAppClipLinkHost("www.appclip.apple.com")
                && !ClipInvocationModel.isDefaultAppClipLinkHost("evil-appclip.apple.com.attacker.io")
                && !ClipInvocationModel.isDefaultAppClipLinkHost("bytspot.app"),
            "Party Loop: default App Clip link host detection must survive URL normalization."
        )
        // Even if host detection misses, the Clip's bundle id must never be
        // treated as a patch - that is what routed guests to the vendor view.
        precondition(
            ClipInvocationModel.patchCandidate(bundleID) == nil
                && ClipInvocationModel.patchCandidate("COM.BYTSPOT.APP.CLIP") == nil
                && ClipInvocationModel.patchCandidate("patch-abc123") == "patch-abc123",
            "Party Loop: a bundle identifier must never reach the patch lookup."
        )
        // The reported symptom: the Clip bundle id must never be read as a
        // patch, and must not be tier-coded at all - not Black, not anything.
        precondition(
            BytspotTier.codedTier(bundleID) == nil
                && BytspotTier.codedTier("com.bytspot.app") == nil
                && ClipInvocationModel.patchCandidate("com.bytspot.app") == nil,
            "Party Loop: a Bytspot bundle identifier must never code a tier or a patch."
        )
        // An uncoded invocation must be reported as uncoded. `detect` still
        // defaults to Black for the patch surface, so only `detectIfCoded` can
        // tell a genuine Black link apart from an invocation with no markers.
        precondition(
            BytspotTier.detectIfCoded(url: URL(string: "https://appclip.apple.com/id?p=\(bundleID)&partyId=party-1"), patchId: nil) == nil,
            "Party Loop: a party invocation must not be reported as tier-coded."
        )
        // The unified contract must keep honoring every historical patch code.
        precondition(
            BytspotTier.codedTier("BLACK-123") == .black
                && BytspotTier.codedTier("BYT-B-123") == .black
                && BytspotTier.codedTier("BYT424-0301-B") == .black
                && BytspotTier.codedTier("PATCH_P") == .platinum
                && BytspotTier.codedTier("PATCH.G") == .green
                && BytspotTier.codedTier("GREEN-XYZ") == .green
                && BytspotTier.codedTier("VENUE-1234") == nil,
            "Party Loop: the unified tier contract must preserve existing patch codes."
        )
        // An empty party parameter must not shadow the real one.
        precondition(
            ClipInvocationModel.partyRoute(
                from: ["id"],
                queryItems: [URLQueryItem(name: "party", value: ""), URLQueryItem(name: "partyId", value: "party-1")],
                isDefaultAppClipLink: true
            ) == .party(id: "party-1"),
            "Party Loop: an empty party parameter must not shadow the real party id."
        )
    }

#if false // Legacy Group self-test retained for future project extraction.
    private static func assertPrivateGroupRichInviteContract() {
        let platinum = ClipGroupEventInvite.from(pathParts: ["group", "platinum-private-dinner"], queryItems: [
            URLQueryItem(name: "title", value: "Platinum Dinner Group"),
            URLQueryItem(name: "type", value: "Dinner"),
            URLQueryItem(name: "participants", value: "12"),
            URLQueryItem(name: "timing", value: "now")
        ], tier: .platinum)
        precondition(platinum?.theme == "Premium dinner", "Phase4F App Clip: Platinum private group theme drifted.")
        precondition(platinum?.hostName == "Platinum Dinner Host", "Phase4F App Clip: Platinum private group host metadata missing.")
        precondition(platinum?.hasPlayableVideo == true, "Phase4F App Clip: Platinum private group must expose DEBUG HLS loop.")
        precondition(platinum?.activityHighlights.contains("12h live window") == true, "Phase4F App Clip: Platinum private group highlights missing live window.")
        precondition(platinum?.handoffURL?.path == "/group/platinum-private-dinner", "Phase4F App Clip: private group handoff must preserve /group route.")
        precondition(platinum?.handoffURL?.absoluteString.contains("handoff=1") == true, "Phase4F App Clip: private group handoff URL must mark handoff intent.")
        precondition(platinum?.handoffURL?.absoluteString.contains("activities=12h%20live%20window") == true || platinum?.handoffURL?.absoluteString.contains("activities=12h+live+window") == true, "Phase4F App Clip: handoff URL must carry private group activity metadata.")

        let green = ClipGroupEventInvite.from(pathParts: ["group", "green-family"], queryItems: [
            URLQueryItem(name: "title", value: "Green Family Group"),
            URLQueryItem(name: "type", value: "Family"),
            URLQueryItem(name: "participants", value: "5")
        ], tier: .green)
        precondition(green?.hasPlayableVideo == false, "Phase4F App Clip: Green private groups should remain photo-first.")
        precondition(green?.theme == "Local family", "Phase4F App Clip: Green private group theme drifted.")
    }
#endif

    private static func assertHostStudioPartyMappingContract() {
        var dto: [String: Any] = ["id": "party-1", "source": "host-studio-party", "title": "First Listen", "tier": "green", "timing": "thisWeek", "participantCount": 3, "capacity": 80, "accessMode": "free-rsvp", "templateId": "listening-party", "templateConfig": ["kind": "listening-party", "format": "listening-session"], "groupType": "Listening Party", "scheduledDate": "2026-08-10T20:00:00Z", "hostName": "Demo Host", "locationLabel": "Sample Venue", "locationDisclosure": "public", "guestSummary": "3 joined · 80 spots", "activityHighlights": ["Doors open"], "audienceCircle": "Selected Circles", "privacyStatus": "privateInvite", "requiresApproval": false, "heroImageURL": "https://res.cloudinary.com/bytspot/image/upload/cover.jpg", "photoURLs": ["https://res.cloudinary.com/bytspot/image/upload/album-0.jpg"]]
        dto["host"] = ["destinations": ["musicUrl": "https://music.example.com/demo", "merchUrl": "https://shop.example.com/demo", "websiteUrl": "https://demo.example.com", "primarySocial": ["platform": "Instagram", "url": "https://instagram.com/demo"]]]
        dto["ticketTiers"] = [["name": "First Drop", "priceCents": 2500, "quantity": 40, "requiredMembershipTier": "green"]]
        let envelope: [String: Any] = ["result": ["data": ["json": dto]]]
        let invite = PartyPassInvite.fromPayload(ClipPatchVerifier.unwrapTRPCValue(envelope))
        precondition(invite != nil, "Party Loop: App Clip must decode the Host Studio Party DTO into its dedicated Party model.")
        precondition(invite?.title == "First Listen" && invite?.capacity == 80, "Party Loop: title/capacity mapping drifted.")
        precondition(invite?.accessMode == "free-rsvp" && invite?.locationLabel == "Sample Venue", "Party Loop: access/location mapping drifted.")
        precondition(invite?.itinerary == ["Doors open"] && invite?.ticketTiers.count == 1, "Party Loop: server activity highlights and ticket tiers must reach the Party Pass.")
        precondition(invite?.hostDestinations.map(\.kind) == [.music, .merch, .website, .social] && invite?.hostDestinations.last?.label == "Instagram", "Party Loop: only the host-selected official destinations may reach recipients.")
        precondition(invite?.photoURLs.count == 1, "Party Loop: host-selected album media must reach the Party Pass.")

        // Arrival coordinates: routable only for a published venue, and never a
        // stronger claim than the label the host chose.
        var coordinateDTO = dto
        coordinateDTO["latitude"] = 33.7841
        coordinateDTO["longitude"] = -84.3830
        let routable = PartyPassInvite.fromPayload(coordinateDTO)
        precondition(routable?.latitude == 33.7841 && routable?.longitude == -84.3830, "Party Loop: a published venue's coordinates must reach the Party Pass.")
        precondition(routable?.routableCoordinate != nil, "Party Loop: a published, named venue with coordinates must be routable.")
        precondition(PartyPassInvite.fromPayload(dto)?.routableCoordinate == nil, "Party Loop: a Party without server coordinates must fall back to a name search.")
        for disclosure in ["after-approval", "withheld"] {
            var hiddenDTO = coordinateDTO
            hiddenDTO["locationDisclosure"] = disclosure
            let hidden = PartyPassInvite.fromPayload(hiddenDTO)
            precondition(hidden?.latitude == nil && hidden?.longitude == nil, "Party Loop: \(disclosure) must not carry coordinates.")
            precondition(hidden?.routableCoordinate == nil && hidden?.routableVenueName == nil, "Party Loop: \(disclosure) must be unroutable by point and by name.")
        }
        var unnamedDTO = coordinateDTO
        unnamedDTO["locationLabel"] = nil
        precondition(PartyPassInvite.fromPayload(unnamedDTO)?.routableCoordinate == nil, "Party Loop: a pending venue name must not route by coordinate.")
        var genericSocialDTO = dto
        genericSocialDTO["host"] = ["destinations": ["socialUrl": "https://social.example.com/unapproved", "social": ["platform": "Unapproved", "url": "https://social.example.com/unapproved"]]]
        precondition(PartyPassInvite.fromPayload(genericSocialDTO)?.hostDestinations.contains(where: { $0.kind == .social }) == false, "Party Loop: generic social aliases must not reach recipients without a primary host selection.")
        var rootDestinationDTO = dto
        rootDestinationDTO["host"] = [:]
        rootDestinationDTO["musicUrl"] = "https://music.example.com/unapproved"
        rootDestinationDTO["primarySocial"] = ["platform": "Unapproved", "url": "https://social.example.com/unapproved"]
        precondition(PartyPassInvite.fromPayload(rootDestinationDTO)?.hostDestinations.isEmpty == true, "Party Loop: only canonical host.destinations fields may reach recipients.")
        var identityDTO = dto
        identityDTO["host"] = ["handle": "midtownjohn", "destinationList": [
            ["kind": "instagram", "label": "@MidtownJohn", "url": "https://instagram.com/MidtownJohn", "primary": true],
            ["kind": "music", "label": "Music", "url": "https://music.example.com/host"],
            ["kind": "merch", "label": "https://leaky.example.com", "url": "https://leaky.example.com"],
        ]] as [String: Any]
        let identityInvite = PartyPassInvite.fromPayload(identityDTO)
        precondition(identityInvite?.hostHandle == "@midtownjohn", "Party Loop: the verified handle must reach recipients.")
        precondition(identityInvite?.hostDestinations.map(\.label) == ["@MidtownJohn", "Music"], "Party Loop: ordered identity destinations must keep host order and never render a raw URL as a label.")
        precondition(identityInvite?.hostDestinations.first?.kind == .social, "Party Loop: social identity destinations map to the social kind.")
        var leakyLegacy = dto
        leakyLegacy["host"] = ["destinations": ["primarySocial": ["platform": "https://evil.example.com", "url": "https://instagram.com/host"]]] as [String: Any]
        precondition(PartyPassInvite.fromPayload(leakyLegacy)?.hostDestinations.map(\.label) == ["Social"], "Party Loop: a crafted URL as the legacy platform must never render as public text.")
        let ticketTier = ClipPartyTicketTier.from(["name": "First Drop", "priceCents": 2500, "quantity": 40, "requiredMembershipTier": "green"])
        precondition(ticketTier?.name == "First Drop" && ticketTier?.priceCents == 2500, "Party Loop: server-published paid tiers must decode before Checkout can be offered.")
        precondition(ClipPartyTicketTier.from(["name": "Bad", "priceCents": 0, "quantity": 1, "requiredMembershipTier": "green"]) == nil, "Party Loop: invalid ticket tiers must not reach the secure Checkout picker.")
        precondition(ClipPatchVerifier.normalizedStripeCheckoutURL("cs_test_123_ABC")?.host == "checkout.stripe.com", "Party Loop: Stripe Checkout session IDs must normalize to Stripe Checkout.")
        precondition(ClipPatchVerifier.normalizedStripeCheckoutURL("https://checkout.stripe.com/c/pay/cs_test_123") != nil, "Party Loop: Stripe-hosted Checkout URLs must be accepted.")
        precondition(ClipPatchVerifier.normalizedStripeCheckoutURL("https://payments.example.com/checkout") == nil, "Party Loop: non-Stripe HTTPS checkout redirects must be rejected.")
        precondition(ClipPatchVerifier.normalizedStripeCheckoutURL("https://dashboard.stripe.com/payments") == nil && ClipPatchVerifier.normalizedStripeCheckoutURL("https://stripe.com/") == nil, "Party Loop: non-Checkout Stripe URLs must not be opened.")
        precondition(ClipPatchVerifier.partyStripeCheckoutURL(from: ["checkoutUrl": "cs_test_456_ABC"])?.host == "checkout.stripe.com", "Party Loop: documented Checkout response aliases must normalize before handoff.")
        precondition(ClipPatchVerifier.partyStripeCheckoutURL(from: ["checkout": ["url": "https://payments.example.com/checkout"]]) == nil, "Party Loop: nested non-Stripe Checkout responses must fail closed.")
        let blackAviation = ClipBookingContext.make(categoryText: "private aviation charter", amountCents: 2_500, tier: .black)
        let blackMarine = ClipBookingContext.make(categoryText: "marine yacht", amountCents: 2_500, tier: .black)
        let blackHighValue = ClipBookingContext.make(categoryText: "private event", amountCents: 85_000, tier: .black)
        precondition(blackAviation.isHighTicket && blackMarine.isHighTicket && blackHighValue.isHighTicket && blackAviation.logisticsMode == .outboundToVenue, "Party Loop: Black aviation, marine, and expanded high-value bookings must use secure-hold arrival context.")
        precondition(ClipPatchVerifier.appleSignInSource == "native_ios", "Party Loop: App Clip Apple sign-in must use the established native iOS source contract.")
        let doorPassFixture = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"
        precondition(doorPassFixture.count == 43, "Party Loop: attendee-pass fixture must model a 32-byte Base64URL value.")
        precondition(ClipPatchVerifier.partyAttendeeCredential(from: ["partyId": "party-1", "attendeeCredential": doorPassFixture], expectedPartyID: "party-1") != nil, "Party Loop: only matching Party-bound attendee credentials may render as a QR.")
        precondition(ClipPatchVerifier.partyAttendeeCredential(from: ["partyId": "other-party", "attendeeCredential": doorPassFixture], expectedPartyID: "party-1") == nil, "Party Loop: attendee credential Party mismatches must fail closed.")
        precondition(ClipPatchVerifier.partyAttendeeCredential(from: ["partyId": "party-1", "attendeeCredential": "not-a-valid-door-pass"], expectedPartyID: "party-1") == nil, "Party Loop: malformed attendee credentials must fail closed.")
        let authorizedPassPayload: [String: Any] = ["partyId": "party-1", "action": "view-pass", "guest": ["status": "joined", "accessGranted": true]]
        precondition(ClipPatchVerifier.partyPassState(from: authorizedPassPayload, expectedPartyID: "party-1")?.accessGranted == true, "Party Loop: only an explicit guest authorization may unlock a Party pass.")
        precondition(ClipPatchVerifier.partyPassState(from: ["partyId": "party-1", "action": "view-pass", "guest": ["status": "joined"]], expectedPartyID: "party-1") == nil, "Party Loop: a missing guest authorization must fail closed.")
        let deniedPass = ClipPatchVerifier.partyPassState(from: ["partyId": "party-1", "action": "view-pass", "guest": ["status": "joined", "accessGranted": false]], expectedPartyID: "party-1")
        precondition(deniedPass?.accessGranted == false, "Party Loop: an explicit guest denial must remain denied.")
        precondition(PartyPassPresentationRules.effectiveAction(for: deniedPass) == .unavailable && PartyPassPresentationRules.accessMetric(for: deniedPass, isResolving: false) == "UNAVAILABLE", "Party Loop: an explicitly denied view-pass must never be presented as confirmed access.")
        let requestGeneration = UUID()
        let authorizedPass = ClipPartyPassState(partyID: "party-1", action: .viewPass, guestStatus: "joined", accessGranted: true)
        let attendeePass = ClipPatchVerifier.PartyAttendeeCredential(partyID: "party-1", value: doorPassFixture)
        precondition(PartyPassClipView.canCommitAttendeeCredential(requestGeneration: requestGeneration, currentGeneration: requestGeneration, scenePhase: .active, passState: authorizedPass, credential: attendeePass, expectedPartyID: "party-1"), "Party Loop: a current active authorized request may render its QR.")
        precondition(!PartyPassClipView.canCommitAttendeeCredential(requestGeneration: requestGeneration, currentGeneration: UUID(), scenePhase: .active, passState: authorizedPass, credential: attendeePass, expectedPartyID: "party-1"), "Party Loop: invalidated requests must not restore a QR.")
        precondition(!PartyPassClipView.canCommitAttendeeCredential(requestGeneration: requestGeneration, currentGeneration: requestGeneration, scenePhase: .background, passState: authorizedPass, credential: attendeePass, expectedPartyID: "party-1"), "Party Loop: backgrounded requests must not restore a QR.")
        precondition(!PartyPassClipView.canCommitAttendeeCredential(requestGeneration: requestGeneration, currentGeneration: requestGeneration, scenePhase: .active, passState: ClipPartyPassState(partyID: "party-1", action: .viewPass, guestStatus: "joined", accessGranted: false), credential: attendeePass, expectedPartyID: "party-1"), "Party Loop: explicitly denied access must not render a QR.")
        let resolverGeneration = UUID()
        // A paid pass must present its QR without a second tap: the guest has
        // already paid, so resolution fetches the credential the moment access
        // turns true, and stops once one is held.
        precondition(PartyPassClipView.shouldAutoLoadAttendeeCredential(scenePhase: .active, passState: authorizedPass, hasCredential: false), "Party Loop: an authorized pass must fetch its door QR without a tap.")
        precondition(!PartyPassClipView.shouldAutoLoadAttendeeCredential(scenePhase: .active, passState: authorizedPass, hasCredential: true), "Party Loop: a held credential must not be refetched on every resolution.")
        precondition(!PartyPassClipView.shouldAutoLoadAttendeeCredential(scenePhase: .active, passState: ClipPartyPassState(partyID: "party-1", action: .ticket, guestStatus: "invited", accessGranted: false), hasCredential: false), "Party Loop: an unpaid pass must never fetch a door QR.")
        precondition(!PartyPassClipView.shouldAutoLoadAttendeeCredential(scenePhase: .background, passState: authorizedPass, hasCredential: false), "Party Loop: a backgrounded Clip must not fetch a door QR.")

        precondition(PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: resolverGeneration, scenePhase: .active), "Party Loop: only the current active resolver may update the Party Pass.")
        precondition(!PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: UUID(), scenePhase: .active), "Party Loop: an older resolver response must not restore Party access.")
        precondition(!PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: resolverGeneration, scenePhase: .background), "Party Loop: a backgrounded resolver response must not restore Party access.")
        precondition(
            PartyPassClipView.passResolutionKey(inviteID: "party-1", scenePhase: .inactive) != PartyPassClipView.passResolutionKey(inviteID: "party-1", scenePhase: .active) &&
            PartyPassClipView.passResolutionKey(inviteID: "party-1", scenePhase: .inactive) == PartyPassClipView.passResolutionKey(inviteID: "party-1", scenePhase: .background),
            "Party Loop: activation must restart the resolver so a pass opened while inactive does not stay on Preparing."
        )
        precondition(ClipPersonalAttendeeQR.image(doorPassFixture).cgImage != nil, "Party Loop: personal attendee pass must render a scannable QR image.")
        precondition(ClipPartyPassAction(rawValue: "request-approval") == .requestApproval && ClipPartyPassAction(rawValue: "unknown") == nil, "Party Loop: only server-recognized Party actions may render a primary CTA.")
        precondition(ClipPatchVerifier.normalizedPartyHandoffURL("https://m.uber.com/ul/?action=setPickup")?.host == "m.uber.com", "Party Loop: only HTTPS Uber handoff URLs may open from the Party Pass.")
        precondition(ClipPatchVerifier.normalizedPartyHandoffURL("https://ride.lyft.com/u?id=lyft")?.host == "ride.lyft.com", "Party Loop: only HTTPS Lyft handoff URLs may open from the Party Pass.")
        precondition(ClipPatchVerifier.normalizedPartyHandoffURL("https://untrusted.example/handoff") == nil, "Party Loop: arbitrary Party handoff URLs must fail closed.")
        precondition(ClipPatchVerifier.partyArrivalHandoffURL(from: ["provider": "uber", "trackingMode": "handoff-only", "handoffUrl": "https://m.uber.com/ul/?action=setPickup"], provider: .uber) != nil, "Party Loop: matching server handoff metadata must be accepted.")
        precondition(ClipPatchVerifier.partyArrivalHandoffURL(from: ["provider": "lyft", "trackingMode": "handoff-only", "handoffUrl": "https://m.uber.com/ul/?action=setPickup"], provider: .uber) == nil, "Party Loop: a mismatched provider must fail closed.")
        precondition(ClipPatchVerifier.partyArrivalHandoffURL(from: ["provider": "uber", "trackingMode": "live-tracking", "handoffUrl": "https://m.uber.com/ul/?action=setPickup"], provider: .uber) == nil, "Party Loop: a non-handoff tracking mode must fail closed.")
        var protectedPopUp = dto
        protectedPopUp["templateId"] = "pop-up"
        protectedPopUp["templateConfig"] = ["kind": "pop-up", "locationDisclosure": "after-approval"]
        protectedPopUp["locationLabel"] = "Secret rooftop"
        protectedPopUp.removeValue(forKey: "locationDisclosure")
        let protectedInvite = PartyPassInvite.fromPayload(protectedPopUp)
        precondition(protectedInvite?.locationIsWithheld == true && protectedInvite?.locationLabel == "Location shared after approval", "Party Loop: missing or malformed Party disclosure must redact the venue fail-closed.")
        var whitespaceDisclosure = dto
        whitespaceDisclosure["locationDisclosure"] = " public "
        whitespaceDisclosure["locationLabel"] = "Secret rooftop"
        let whitespaceInvite = PartyPassInvite.fromPayload(whitespaceDisclosure)
        precondition(whitespaceInvite?.locationIsWithheld == true && whitespaceInvite?.locationLabel == "Location shared after approval", "Party Loop: only the exact raw public disclosure may reveal a venue.")
        precondition(invite?.displayPosterURL?.host == "res.cloudinary.com", "Party Loop: Host Studio poster media must map authoritatively.")
        precondition(invite?.canonicalURL?.absoluteString == "https://bytspot.app/party/party-1", "Party Loop: shared App Clip link must stay clean and canonical.")
        precondition(invite?.handoffURL?.host == "bytspot.app" && invite?.handoffURL?.path == "/party/party-1", "Party Loop: handoff must stay on the authoritative Party route.")
        precondition(URLComponents(url: invite?.handoffURL ?? URL(string: "https://bytspot.app")!, resolvingAgainstBaseURL: false)?.queryItems?.contains(URLQueryItem(name: "handoff", value: "1")) == true, "Party Loop: secure Party handoff marker drifted.")
        var hiddenLocation = dto
        hiddenLocation["locationLabel"] = "Location shared after approval"
        hiddenLocation["locationDisclosure"] = "after-approval"
        precondition(PartyPassInvite.fromPayload(hiddenLocation)?.locationIsWithheld == true, "Party Loop: protected Party locations must remain redacted.")
        var withheldLocation = dto
        withheldLocation["locationDisclosure"] = "withheld"
        withheldLocation["locationLabel"] = "Do not expose"
        let withheldInvite = PartyPassInvite.fromPayload(withheldLocation)
        precondition(withheldInvite?.locationIsWithheld == true && withheldInvite?.locationLabel == "Location withheld by host", "Party Loop: host-withheld locations must remain redacted.")
        // Only a published, named venue may reach Maps. Every redacted state
        // must refuse to route, or the query leaks what the label withholds.
        precondition(withheldInvite?.routableVenueName == nil, "Party Loop: a withheld venue must never be routable in Maps.")
        precondition(protectedInvite?.routableVenueName == nil, "Party Loop: an after-approval venue must never be routable in Maps.")
        precondition(whitespaceInvite?.routableVenueName == nil, "Party Loop: only the exact public disclosure may make a venue routable.")
        var unnamedPublic = dto
        unnamedPublic["locationDisclosure"] = "public"
        unnamedPublic.removeValue(forKey: "locationLabel")
        precondition(PartyPassInvite.fromPayload(unnamedPublic)?.routableVenueName == nil, "Party Loop: the unnamed-venue placeholder names no place and must not be routable.")
        var namedPublic = dto
        namedPublic["locationDisclosure"] = "public"
        namedPublic["locationLabel"] = "Republic Lounge"
        precondition(PartyPassInvite.fromPayload(namedPublic)?.routableVenueName == "Republic Lounge", "Party Loop: a published venue must stay routable for arrival.")
        precondition(PartyPassInvite.partyID(from: ["party", "party-1"]) == "party-1", "Party Loop: Party route must resolve authoritatively.")
        precondition(PartyPassInvite.partyID(from: ["group", "party-1"]) == nil, "Party Loop: legacy group routes must never masquerade as Party routes.")
        precondition(ClipInvocationModel.partyRoute(from: ["party", "party-1"]) == .party(id: "party-1"), "Party Loop: /party/<id> must route to the Party Pass.")
        precondition(ClipInvocationModel.partyRoute(from: ["party"]) == .invalid, "Party Loop: a bare /party link must fail as a party, never fall through to the catalog.")
        precondition(ClipInvocationModel.partyRoute(from: ["party", "a", "b"]) == .invalid, "Party Loop: malformed party paths must fail as a party, never fall through to the catalog.")
        precondition(ClipInvocationModel.partyRoute(from: ["p", "black-0301"]) == PartyPassInvite.Route.none, "Party Loop: patch routes are not party routes.")
        var missingSource = dto
        missingSource.removeValue(forKey: "source")
        precondition(PartyPassInvite.fromPayload(missingSource) == nil, "Party Loop: a Party DTO without Host Studio provenance must fail closed.")
        let join = ClipPatchVerifier.unwrapTRPCValue(["result": ["data": ["json": ["status": "joined"]]]]) as? [String: Any]
        precondition(join?["status"] as? String == "joined", "Party Loop: standard tRPC join envelopes must unwrap to status.")
    }

    private static func assertPartyPassPreviewContract() {
        let previewURL = URL(string: "https://bytspot.app/?step=host_party")
        let previewState = ClipPartyPassPreview.state(for: previewURL, partyID: "party-preview-1")
        precondition(
            previewState == ClipPartyPassState(partyID: "party-preview-1", action: .rsvp, guestStatus: "not_joined", accessGranted: false),
            "Party Loop: the explicit Host Studio preview must render the local RSVP state."
        )
        precondition(
            ClipPartyPassPreview.confirmedRSVP(for: previewURL, partyID: "party-preview-1") == ClipPartyPassState(partyID: "party-preview-1", action: .viewPass, guestStatus: "joined", accessGranted: true),
            "Party Loop: a preview RSVP must confirm locally instead of calling the production RSVP endpoint."
        )
        precondition(
            PartyInvitationTierPresentation(for: .platinum).heroBadge == "PLATINUM REQUIRED",
            "Party Loop: the Party tier must be presented as a requirement, not as the recipient membership tier."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/party/party-1"), partyID: "party-1") == nil,
            "Party Loop: real Party URLs must use the server resolver rather than a local preview state."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/party/party-1?step=host_party&previewAction=view-pass"), partyID: "party-1") == nil,
            "Party Loop: real Party URLs must not allow preview query parameters to override server access."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/?step=host_party"), partyID: "party-1") == nil,
            "Party Loop: only the synthetic preview Party identifier can use local access state."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/?step=host_party&previewAction=view-pass"), partyID: "party-preview-1")?.accessGranted == true,
            "Party Loop: the explicit preview must exercise the confirmed Party Pass presentation."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/?step=host_party&previewAction=ticket"), partyID: "party-preview-1")?.action == .ticket,
            "Party Loop: the explicit preview must exercise the ticket-tier presentation."
        )
        precondition(
            ClipPartyPassPreview.state(for: URL(string: "https://bytspot.app/?step=host_party&previewAction=unavailable"), partyID: "party-preview-1")?.guestStatus == "pending",
            "Party Loop: the explicit unavailable preview must represent a pending host review."
        )
        precondition(
            PartyInvitationTierPresentation(for: .black).heroBadge == "BLACK REQUIRED" && PartyInvitationTierPresentation(for: .platinum).heroBadge == "PLATINUM REQUIRED" && PartyInvitationTierPresentation(for: .green).heroBadge == "GREEN REQUIRED",
            "Party Loop: Party membership requirements must remain differentiated by tier."
        )
        precondition(
            PartyPassPresentationRules.unresolvedAccess(isResolving: false).title == "Party Pass unavailable" && PartyPassPresentationRules.accessMetric(for: nil, isResolving: false) == "UNVERIFIED",
            "Party Loop: an unresolved server response must never imply RSVP access."
        )
        precondition(
            !PartyPassPresentationRules.canStartTicketSelection(for: ClipPartyPassState(partyID: "party-preview-1", action: .ticket, guestStatus: "not_joined", accessGranted: false), tiers: []),
            "Party Loop: ticket selection must fail closed when the server provides no ticket tiers."
        )
        precondition(
            PartyPassPresentationRules.signInFailureMessage(from: ClipGuestAuthController.AuthError.cancelled) == "Sign in was cancelled." &&
            PartyPassPresentationRules.signInFailureMessage(from: ClipPatchVerifier.VerifyError.server("Apple sign-in could not be verified")) == "Apple sign-in could not be verified" &&
            PartyPassPresentationRules.signInFailureMessage(from: ClipPatchVerifier.VerifyError.network("offline")) == "Sign in could not be completed. Please try again.",
            "Party Loop: Apple Sign-In failures must stay distinct from a later Party Pass lookup miss."
        )
        let previewPayload: [String: Any] = ["id": "party-preview-1", "source": "host-studio-party", "title": "First Listen", "tier": "green", "accessMode": "free-rsvp", "scheduledDate": "2026-08-10T20:00:00Z", "hostName": "Demo Host", "locationLabel": "Sample Venue", "locationDisclosure": "public"]
        precondition(PartyPassInvite.fromPayload(previewPayload)?.displayPosterURL == nil, "Party Loop: the deterministic App Clip preview must not depend on stock remote media.")
        precondition(
            ClipPartyPassPreview.coverURL(for: URL(string: "https://bytspot.app/?step=party_loop")) == nil &&
            ClipPartyPassPreview.coverURL(for: URL(string: "https://bytspot.app/?step=party_loop&previewCover=tall")) != nil &&
            ClipPartyPassPreview.coverURL(for: URL(string: "https://bytspot.app/?step=party_loop&previewCover=wide")) != nil &&
            ClipPartyPassPreview.coverURL(for: URL(string: "https://bytspot.app/party/party-1?previewCover=tall")) == nil,
            "Party Loop: a preview cover is opt-in and never applies to a real Party URL."
        )
        assertPartyPosterBoxContract()
    }

    private static func assertPartyPosterBoxContract() {
        func box(_ width: CGFloat, _ height: CGFloat) -> CGFloat { ClipPartyPoster.boxAspectRatio(for: CGSize(width: width, height: height)) }
        func near(_ a: CGFloat, _ b: CGFloat) -> Bool { abs(a - b) < 0.0001 }
        precondition(near(box(1600, 1067), 1600.0 / 1067.0), "Party poster: a published 3:2 cover keeps its own box.")
        precondition(near(box(2900, 1000), 3.0 / 2.0), "Party poster: a 2.9:1 panorama is clamped to a 3:2 box.")
        precondition(near(box(1080, 1350), 4.0 / 5.0), "Party poster: a 4:5 flyer keeps its own box.")
        precondition(near(box(1080, 1920), 4.0 / 5.0), "Party poster: a 9:16 flyer is clamped to a 4:5 box.")
        precondition(near(box(1000, 1000), 1), "Party poster: a square cover keeps a square box.")
        precondition(near(box(0, 0), 3.0 / 2.0) && near(box(1200, 0), 3.0 / 2.0), "Party poster: an unknown size falls back to the published 3:2 box.")
    }
}
#endif
