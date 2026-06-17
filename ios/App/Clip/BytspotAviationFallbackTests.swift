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
}
#endif
