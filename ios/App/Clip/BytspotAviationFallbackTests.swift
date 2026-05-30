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
    }
}
#endif
