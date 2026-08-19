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
        assertHostStudioPartyMappingContract()
        assertPartyPassPreviewContract()
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
        var genericSocialDTO = dto
        genericSocialDTO["host"] = ["destinations": ["socialUrl": "https://social.example.com/unapproved", "social": ["platform": "Unapproved", "url": "https://social.example.com/unapproved"]]]
        precondition(PartyPassInvite.fromPayload(genericSocialDTO)?.hostDestinations.contains(where: { $0.kind == .social }) == false, "Party Loop: generic social aliases must not reach recipients without a primary host selection.")
        var rootDestinationDTO = dto
        rootDestinationDTO["host"] = [:]
        rootDestinationDTO["musicUrl"] = "https://music.example.com/unapproved"
        rootDestinationDTO["primarySocial"] = ["platform": "Unapproved", "url": "https://social.example.com/unapproved"]
        precondition(PartyPassInvite.fromPayload(rootDestinationDTO)?.hostDestinations.isEmpty == true, "Party Loop: only canonical host.destinations fields may reach recipients.")
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
        guard let regularBlackService = ClipLocalService.fallbacks(for: .black).first(where: { service in
            let category = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
            return !["aviation", "jet", "charter", "marine", "yacht", "vessel"].contains(where: category.contains)
        }), let regularBlackVendor = ClipVendor.fallbacks(for: regularBlackService, tier: .black).first else {
            preconditionFailure("Party Loop: expected a non-aviation/non-marine Black vendor fixture.")
        }
        let blackExpandedBooking = ClipBookingContext.make(service: regularBlackService, vendor: regularBlackVendor, tier: .black, amountCents: 85_000)
        precondition(blackAviation.isHighTicket && blackMarine.isHighTicket && blackHighValue.isHighTicket && blackExpandedBooking.isHighTicket && blackAviation.logisticsMode == .outboundToVenue, "Party Loop: Black aviation, marine, and expanded high-value bookings must use secure-hold arrival context.")
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
        precondition(PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: resolverGeneration, scenePhase: .active), "Party Loop: only the current active resolver may update the Party Pass.")
        precondition(!PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: UUID(), scenePhase: .active), "Party Loop: an older resolver response must not restore Party access.")
        precondition(!PartyPassClipView.canCommitPassResolution(resolverGeneration: resolverGeneration, currentResolverGeneration: resolverGeneration, scenePhase: .background), "Party Loop: a backgrounded resolver response must not restore Party access.")
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
        precondition(PartyPassInvite.partyID(from: ["party", "party-1"]) == "party-1", "Party Loop: Party route must resolve authoritatively.")
        precondition(PartyPassInvite.partyID(from: ["group", "party-1"]) == nil, "Party Loop: legacy group routes must never masquerade as Party routes.")
        var missingSource = dto
        missingSource.removeValue(forKey: "source")
        precondition(PartyPassInvite.fromPayload(missingSource) == nil, "Party Loop: a Party DTO without Host Studio provenance must fail closed.")
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
    }
}
#endif
