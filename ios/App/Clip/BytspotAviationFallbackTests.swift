import Foundation

#if DEBUG
/// DEBUG-only regression guard for the Bytspot Black aviation "Polished Version"
/// fallback catalog. Runs at Clip launch via `BytspotClipApp` and crashes the
/// debug build with a clear message if any future refactor drifts off the spec
/// declared in `ClipPatchVerifier.fallbacks(for:tier:)`.
///
/// Locked spec (do not edit casually — both this file and the fallback table
/// must move together; see the matching changelog entry):
///   - Stratos Jet Charters · Ultra-Long-Range Global Fleet · $28,000
///   - Solitaire Aviation   · Boutique Private Aviation    · $33,040
///   - Vector Air           · On-Demand Global Charter     · $40,600
/// ETA labels: "ETA 4 min", "ETA 7 min", "ETA 12 min" (data layer only —
/// the view layer reframes aviation as "Departing in X min").
enum BytspotAviationFallbackTests {
    private struct Expected {
        let name: String
        let tagline: String
        let priceFromCents: Int
        let etaLabel: String
        let highlights: [String]
    }

    private static let spec: [Expected] = [
        Expected(
            name: "Stratos Jet Charters",
            tagline: "Ultra-Long-Range Global Fleet",
            priceFromCents: 2_800_000,
            etaLabel: "ETA 4 min",
            highlights: ["Heavy-jet cabin", "Catering & champagne", "Ground transport", "Flexible departure"]
        ),
        Expected(
            name: "Solitaire Aviation",
            tagline: "Boutique Private Aviation",
            priceFromCents: 3_304_000,
            etaLabel: "ETA 7 min",
            highlights: ["Heavy-jet cabin", "Catering & champagne included", "Ground transport on both ends", "Flexible departure ±2 hr"]
        ),
        Expected(
            name: "Vector Air",
            tagline: "On-Demand Global Charter",
            priceFromCents: 4_060_000,
            etaLabel: "ETA 12 min",
            highlights: ["Mid-size to Heavy jets", "Instant dispatch", "Concierge handling", "Global reach"]
        )
    ]

    /// Pulls the actual Black aviation service out of the production fallback
    /// catalog and asserts the vendor pool matches the locked spec verbatim.
    static func run() {
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-B"), patchId: "BYT424-0301-B") == .black)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-P"), patchId: "BYT424-0301-P") == .platinum)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301-G"), patchId: "BYT424-0301-G") == .green)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/BYT424-0301?tier=platinum"), patchId: "BYT424-0301") == .platinum)
        precondition(BytspotTier.detect(url: URL(string: "https://bytspot.app/access/BYT-BRONI-P?tier=platinum"), patchId: "BYT-BRONI-P") == .platinum)

        guard let service = ClipLocalService.fallbacks(for: .black).first(where: { $0.id == "black-aviation" }) else {
            preconditionFailure(
                "BytspotAviationFallbackTests: 'black-aviation' missing from ClipLocalService.fallbacks(for: .black). " +
                "Restore the Black aviation entry in ClipPatchVerifier.swift."
            )
        }
        let vendors = ClipVendor.fallbacks(for: service, tier: .black)

        precondition(
            vendors.count == spec.count,
            "BytspotAviationFallbackTests: expected \(spec.count) vendors, got \(vendors.count). " +
            "The Black aviation fallback table in ClipPatchVerifier.swift has drifted."
        )

        for (idx, expected) in spec.enumerated() {
            let actual = vendors[idx]
            precondition(
                actual.name == expected.name,
                "BytspotAviationFallbackTests[\(idx)]: expected name '\(expected.name)', got '\(actual.name)'."
            )
            precondition(
                actual.tagline == expected.tagline,
                "BytspotAviationFallbackTests[\(idx)] '\(expected.name)': expected tagline " +
                "'\(expected.tagline)', got '\(actual.tagline)'."
            )
            precondition(
                actual.priceFromCents == expected.priceFromCents,
                "BytspotAviationFallbackTests[\(idx)] '\(expected.name)': expected priceFromCents " +
                "\(expected.priceFromCents), got \(actual.priceFromCents). " +
                "Verify the aviation `base` override (2,800,000) and multipliers (1.0/1.18/1.45) in fallbacks(for:tier:)."
            )
            precondition(
                actual.etaLabel == expected.etaLabel,
                "BytspotAviationFallbackTests[\(idx)] '\(expected.name)': expected etaLabel " +
                "'\(expected.etaLabel)', got '\(actual.etaLabel ?? "nil")'. " +
                "Check etaPool literal in fallbacks(for:tier:)."
            )
            precondition(
                actual.includedHighlights == expected.highlights,
                "BytspotAviationFallbackTests[\(idx)] '\(expected.name)': includedHighlights drifted. " +
                "Expected \(expected.highlights), got \(actual.includedHighlights)."
            )
        }

        runPhase3LuxuryFlowContract()
        assertRichMediaContextContract()
        assertPrivateGroupRichInviteContract()
        assertHostStudioPartyMappingContract()
        assertPartnerCardParity()
    }

    private static func runPhase3LuxuryFlowContract() {
        assertTierCatalogIsolation()
        assertGhAkwaabaContract()
        assertBroniHomeTasteContract()
    }

    /// Locks the cross-target partner-card vocabulary so the Clip catalog mirrors
    /// the App's partner peek card chrome. The literals here MUST match the
    /// `NativeMapExploreView.partnerCard*` static constants under the App target
    /// (locked by `NativeMapParitySelfTests`).
    private static func assertPartnerCardParity() {
        precondition(ClipCatalogView.partnerCardVerifiedLabel == "Verified Partner", "BytspotAviationFallbackTests: Clip partner-card verified label drifted from App parity contract.")
        precondition(ClipCatalogView.partnerCardServiceSectionLabel == "Book at this venue", "BytspotAviationFallbackTests: Clip partner-card service section label drifted from App parity contract.")
        precondition(ClipCatalogView.partnerCardPatchPairedLabel == "Patch paired", "BytspotAviationFallbackTests: Clip 'Patch paired' literal drifted from physidigital vocabulary contract.")
        precondition(ClipCatalogView.partnerCardInstallNudgeLabel == "Open full Bytspot app with this patch", "BytspotAviationFallbackTests: Clip install-nudge copy drifted from upsell parity contract.")
    }

    private static func assertTierCatalogIsolation() {
        let black = ClipLocalService.fallbacks(for: .black).map { $0.id }
        let platinum = ClipLocalService.fallbacks(for: .platinum).map { $0.id }
        let green = ClipLocalService.fallbacks(for: .green).map { $0.id }

        precondition(black.contains("black-aviation") && black.contains("black-marine"), "Phase3 App Clip: Black aviation/marine catalog drifted.")
        precondition(platinum.contains("platinum-entry") && platinum.contains("platinum-dining"), "Phase3 App Clip: Platinum event/dining catalog drifted.")
        precondition(platinum.allSatisfy { !$0.hasPrefix("black-") }, "Phase3 App Clip: Black service leaked into Platinum catalog.")
        precondition(green.allSatisfy { $0.hasPrefix("green-") }, "Phase3 App Clip: Green catalog contains non-Green service ids.")
    }

    private static func assertGhAkwaabaContract() {
        guard let url = URL(string: "https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass") else {
            preconditionFailure("Phase3 App Clip: GH Akwaaba URL fixture is invalid.")
        }
        precondition(ClipLocalService.isGhAkwaabaFifaURL(url, tier: .platinum), "Phase3 App Clip: GH Akwaaba short-link detection drifted.")
        guard let service = ClipLocalService.explicitService(for: url, tier: .platinum) else {
            preconditionFailure("Phase3 App Clip: GH Akwaaba must resolve to explicit Platinum Event Access service.")
        }
        precondition(service.id == "platinum-entry", "Phase3 App Clip: GH Akwaaba must stay under platinum-entry, got \(service.id).")
        guard let vendor = ClipVendor.explicitVendor(for: url, service: service, tier: .platinum) else {
            preconditionFailure("Phase3 App Clip: GH Akwaaba explicit vendor missing from Platinum Event Access fallbacks.")
        }
        precondition(vendor.name == "GH Akwaaba Pass", "Phase3 App Clip: expected GH Akwaaba Pass vendor, got \(vendor.name).")
        precondition(vendor.heroImageURL == ClipLocalService.ghAkwaabaFifaThumbnailURL, "Phase3 App Clip: GH Akwaaba product hero thumbnail drifted.")
        let itemIds = vendor.items?.map { $0.id } ?? []
        precondition(itemIds == ["tickets", "souvenirs", "jerseys"], "Phase3 App Clip: GH Akwaaba line items drifted: \(itemIds).")
    }

    private static func assertBroniHomeTasteContract() {
        guard let service = ClipLocalService.fallbacks(for: .platinum).first(where: { $0.id == "platinum-dining" }) else {
            preconditionFailure("Phase3 App Clip: Platinum dining service missing.")
        }
        let vendors = ClipVendor.fallbacks(for: service, tier: .platinum)
        guard let broni = vendors.first(where: { $0.name == "Broni Home Taste" }) else {
            preconditionFailure("Phase3 App Clip: Broni Home Taste vendor missing from Platinum dining fallbacks.")
        }
        guard let items = broni.items else {
            preconditionFailure("Phase3 App Clip: Broni Home Taste must expose curated dining line items.")
        }
        precondition(items == ClipLineItem.broniHomeTasteFavorites, "Phase3 App Clip: Broni Home Taste line item table drifted.")
        precondition(items.first?.label == "Jollof Rice with Chicken", "Phase3 App Clip: Broni first favorite must stay Jollof Rice with Chicken.")
        precondition(items.contains { $0.label == "Banku and Fried Fish/Tilapia" }, "Phase3 App Clip: Broni fish/tilapia favorite missing.")
    }

    private static func assertRichMediaContextContract() {
        guard let black = ClipLocalService.fallbacks(for: .black).first,
              let platinum = ClipLocalService.fallbacks(for: .platinum).first(where: { $0.id == "platinum-entry" }),
              let green = ClipLocalService.fallbacks(for: .green).first else {
            preconditionFailure("Phase4E App Clip: tier fallback catalogs missing rich-media fixtures.")
        }
        precondition(black.theme == "Elite Guarantee", "Phase4E App Clip: Black service must expose Elite Guarantee theme.")
        precondition(black.videoURL != nil, "Phase4E App Clip: Black service must expose DEBUG HLS preview loop.")
        precondition(platinum.hostName == "Platinum Host Team", "Phase4E App Clip: Platinum service must expose host metadata.")
        precondition(platinum.guestSummary == "Up to 12 guests", "Phase4E App Clip: Platinum guest summary drifted.")
        precondition(green.theme == "Local community", "Phase4E App Clip: Green service must keep Local theme.")
        precondition(green.videoURL == nil, "Phase4E App Clip: Green catalog should use photo-first local thumbnails, not autoplay video.")

        let vendors = ClipVendor.fallbacks(for: platinum, tier: .platinum)
        precondition(vendors.first?.hasPlayableVideo == true, "Phase4E App Clip: Platinum first vendor must expose playable HLS metadata.")
        precondition(vendors.first?.locationLabel == "Premium entry gate", "Phase4E App Clip: Platinum event vendor location context drifted.")
    }

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

    private static func assertHostStudioPartyMappingContract() {
        let dto: [String: Any] = ["id": "party-1", "source": "host-studio-party", "title": "First Listen", "tier": "green", "timing": "thisWeek", "participantCount": 3, "capacity": 80, "accessMode": "free-rsvp", "templateId": "listening-party", "templateConfig": ["kind": "listening-party", "format": "listening-session"], "groupType": "Listening Party", "scheduledDate": "2026-08-10T20:00:00Z", "hostName": "Avery Parker", "locationLabel": "The Loft", "guestSummary": "3 joined · 80 spots", "activityHighlights": ["Doors open"], "audienceCircle": "Selected Circles", "privacyStatus": "privateInvite", "requiresApproval": false, "heroImageURL": "https://res.cloudinary.com/bytspot/image/upload/cover.jpg", "photoURLs": ["https://res.cloudinary.com/bytspot/image/upload/album-0.jpg"]]
        let envelope: [String: Any] = ["result": ["data": ["json": dto]]]
        let invite = ClipGroupEventInvite.fromPartyPayload(ClipPatchVerifier.unwrapTRPCValue(envelope))
        precondition(invite?.isHostStudioParty == true, "Party Loop: App Clip must identify Host Studio Party DTOs.")
        if let invite { precondition(!ClipPartyPassActionPolicy.usesLegacyGroupEventRoute(for: invite), "Party Loop: Host Studio Party actions must never call legacy Group Event APIs.") }
        precondition(invite?.title == "First Listen" && invite?.capacity == 80, "Party Loop: title/capacity mapping drifted.")
        precondition(invite?.accessMode == "free-rsvp" && invite?.locationLabel == "The Loft", "Party Loop: access/location mapping drifted.")
        precondition(invite?.partyTemplate == .listeningParty, "Party Loop: Host Studio template identity must be decoded from the authoritative DTO.")
        precondition(invite?.partyTemplateConfig == .listeningParty(format: "listening-session"), "Party Loop: matching Party template configuration must be decoded.")
        let templateCases: [(String, String, [String: Any])] = [
            ("comedy-night", "standard", ["kind": "standard"]),
            ("premiere", "standard", ["kind": "standard"]),
            ("private-party", "private-party", ["kind": "private-party", "guestPolicy": "named-guests"]),
            ("fan-meetup", "fan-meetup", ["kind": "fan-meetup", "format": "meet-and-greet"]),
            ("release-party", "release-party", ["kind": "release-party", "releaseType": "album", "releaseTitle": "After Hours"]),
            ("pop-up", "pop-up", ["kind": "pop-up", "locationDisclosure": "after-approval"])
        ]
        for (templateID, expectedKind, config) in templateCases {
            var candidate = dto
            candidate["templateId"] = templateID
            candidate["templateConfig"] = config
            let decoded = ClipGroupEventInvite.fromPartyPayload(candidate)
            precondition(decoded?.partyTemplate?.configurationKind == expectedKind && decoded?.partyTemplateConfig != nil, "Party Loop: every supported Host Studio Party template must decode only with its matching configuration.")
        }
        var malformedTemplate = dto
        malformedTemplate["templateConfig"] = ["kind": "pop-up", "locationDisclosure": "public"]
        precondition(ClipGroupEventInvite.fromPartyPayload(malformedTemplate)?.partyTemplate == nil, "Party Loop: mismatched template metadata must not select an App Clip layout.")
        var protectedPopUp = dto
        protectedPopUp["templateId"] = "pop-up"
        protectedPopUp["templateConfig"] = ["kind": "pop-up", "locationDisclosure": "after-approval"]
        protectedPopUp["locationLabel"] = "Secret rooftop"
        protectedPopUp.removeValue(forKey: "locationDisclosure")
        let protectedInvite = ClipGroupEventInvite.fromPartyPayload(protectedPopUp)
        precondition(protectedInvite?.locationDisclosure == "after-approval" && protectedInvite?.locationLabel == "Location shared after approval", "Party Loop: missing or malformed Pop-Up disclosure must redact the venue fail-closed.")
        var whitespaceDisclosure = dto
        whitespaceDisclosure["locationDisclosure"] = " public "
        whitespaceDisclosure["locationLabel"] = "Secret rooftop"
        let whitespaceInvite = ClipGroupEventInvite.fromPartyPayload(whitespaceDisclosure)
        precondition(whitespaceInvite?.locationDisclosure == "after-approval" && whitespaceInvite?.locationLabel == "Location shared after approval", "Party Loop: only the exact raw public disclosure may reveal a venue.")
        var shortRelease = dto
        shortRelease["templateId"] = "release-party"
        shortRelease["templateConfig"] = ["kind": "release-party", "releaseType": "album", "releaseTitle": "X"]
        precondition(ClipGroupEventInvite.fromPartyPayload(shortRelease)?.partyTemplate == nil, "Party Loop: invalid Release Party titles must not select a template layout.")
        precondition(invite?.displayPosterURL?.host == "res.cloudinary.com" && invite?.photoURLs.count == 1, "Party Loop: Host Studio media must map authoritatively.")
        precondition(invite?.partyPassURL?.absoluteString == "https://bytspot.app/party/party-1", "Party Loop: shared App Clip link must stay clean and canonical.")
        precondition(invite?.handoffURL?.host == "bytspot.app" && invite?.handoffURL?.path == "/party/party-1", "Party Loop: handoff must stay on the authoritative Party route.")
        precondition(URLComponents(url: invite?.handoffURL ?? URL(string: "https://bytspot.app")!, resolvingAgainstBaseURL: false)?.queryItems?.contains(URLQueryItem(name: "handoff", value: "1")) == true, "Party Loop: secure Party handoff marker drifted.")
        var hiddenLocation = dto
        hiddenLocation["locationLabel"] = "Location shared after approval"
        hiddenLocation["locationDisclosure"] = "after-approval"
        precondition(ClipGroupEventInvite.fromPartyPayload(hiddenLocation)?.locationDisclosure == "after-approval", "Party Loop: public Pop-Up location redaction must survive authoritative Party decoding.")
        precondition(ClipGroupEventInvite.partyID(from: ["party", "party-1"]) == "party-1", "Party Loop: Party route must resolve authoritatively.")
        precondition(ClipGroupEventInvite.partyID(from: ["group", "party-1"]) == nil, "Party Loop: legacy group routes must never masquerade as Party routes.")
        let injected = ClipGroupEventInvite.from(pathParts: ["party", "party-1"], queryItems: [URLQueryItem(name: "title", value: "Injected")], tier: .green)
        precondition(injected == nil, "Party Loop: query data must never bypass the authoritative Party fetch.")
        var missingSource = dto
        missingSource.removeValue(forKey: "source")
        precondition(ClipGroupEventInvite.fromPartyPayload(missingSource) == nil, "Party Loop: a Party DTO without Host Studio provenance must fail closed.")
        let join = ClipPatchVerifier.unwrapTRPCValue(["result": ["data": ["json": ["status": "joined"]]]]) as? [String: Any]
        precondition(join?["status"] as? String == "joined", "Party Loop: standard tRPC join envelopes must unwrap to status.")
        let verifyEnvelope: [String: Any] = ["result": ["data": ["json": ["verified": true, "patch": ["id": "patch-1", "status": "active"]]]]]
        let verify = try? ClipPatchVerifier.decodeVerifyResult(ClipPatchVerifier.unwrapTRPCValue(verifyEnvelope))
        precondition(verify?.verified == true && verify?.patch.id == "patch-1", "Party Loop: patch verification must decode standard result.data.json envelopes.")
        if let verify {
            precondition(ClipInvocationModel.verificationState(for: verify, label: "Patch") == .success(label: "Patch", bindingType: nil), "Party Loop: active verified taps must succeed.")
            let denied = ClipPatchVerifier.VerifyResult(verified: false, patch: verify.patch, binding: nil)
            guard case .denied = ClipInvocationModel.verificationState(for: denied, label: "Patch") else { preconditionFailure("Party Loop: unverified taps must fail closed.") }
        }
    }
}
#endif
