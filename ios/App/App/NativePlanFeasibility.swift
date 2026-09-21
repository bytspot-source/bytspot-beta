import SwiftUI

/// Does this Plan work? The server answers in three values, and the whole
/// point of this file is that the third one survives the trip to the screen.
///
/// `unknown` is not a weaker `fits`. It means the facts to judge something
/// were never supplied — nobody said when the table is, nobody said what it
/// costs. Painting it as a pale green tick tells the guest their evening is
/// fine when nothing of the sort has been established, and painting it amber
/// invents a problem they cannot act on. So it is drawn achromatic and
/// outlined, in the same way the rest of this app makes colour something
/// supply has to earn: a check that could not be run has earned no hue.
enum NativePlanFeasibilityVerdict: String, Codable, Equatable {
    case fits
    case breaks
    case unknown

    /// Unrecognised verdicts read as unknown rather than as a pass. A client
    /// that has not been taught a new value has not checked anything.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = NativePlanFeasibilityVerdict(rawValue: raw) ?? .unknown
    }
}

struct NativePlanFeasibilityCheck: Codable, Equatable, Identifiable {
    let check: String
    let verdict: NativePlanFeasibilityVerdict
    let detail: String
    let itemIds: [String]

    var id: String { check }
}

struct NativePlanFeasibility: Codable, Equatable {
    let verdict: NativePlanFeasibilityVerdict
    let checks: [NativePlanFeasibilityCheck]
}

/// Presentation rules, kept free of SwiftUI state so they can be pinned by a
/// test. Every decision here is about not overstating what the server said.
enum NativePlanFeasibilityDisplay {
    /// The one line at the top of the section.
    static func headline(for verdict: NativePlanFeasibilityVerdict) -> String {
        switch verdict {
        case .fits: return "This works"
        // Not "this is broken": the Plan is fixable, and the checks below say
        // what to change.
        case .breaks: return "This doesn't work yet"
        // Not "looks fine so far", which is a pass wearing a hedge.
        case .unknown: return "Not enough to tell yet"
        }
    }

    /// Colour is earned. A check that could not be run gets none.
    static func tint(for verdict: NativePlanFeasibilityVerdict) -> Color {
        switch verdict {
        case .fits: return NativeTheme.emerald
        case .breaks: return NativeTheme.amber
        case .unknown: return NativeTheme.neutral
        }
    }

    /// Filled symbols are settled facts. The outlined question mark is the
    /// only one that is not, and it must never be swapped for a filled tick.
    static func symbol(for verdict: NativePlanFeasibilityVerdict) -> String {
        switch verdict {
        case .fits: return "checkmark.circle.fill"
        case .breaks: return "exclamationmark.triangle.fill"
        case .unknown: return "questionmark.circle"
        }
    }

    /// Unknown rows are outlined rather than filled, so the difference is
    /// legible without relying on colour alone.
    static func isOutlined(_ verdict: NativePlanFeasibilityVerdict) -> Bool {
        verdict == .unknown
    }

    static func title(for check: String) -> String {
        switch check {
        case "window": return "Timing"
        case "overlap": return "Clashes"
        case "travel": return "Getting between"
        case "budget": return "Budget"
        case "capacity": return "Room for everyone"
        default: return check.capitalized
        }
    }

    /// Problems first, then the unanswered, then what is settled. A guest
    /// scanning from the top should meet what needs them soonest.
    static func ordered(_ checks: [NativePlanFeasibilityCheck]) -> [NativePlanFeasibilityCheck] {
        let rank: (NativePlanFeasibilityVerdict) -> Int = { verdict in
            switch verdict {
            case .breaks: return 0
            case .unknown: return 1
            case .fits: return 2
            }
        }
        // Stable within a rank: the server's order is the contract's order,
        // so rows do not shuffle between refreshes.
        return checks.enumerated()
            .sorted { lhs, rhs in
                let left = rank(lhs.element.verdict), right = rank(rhs.element.verdict)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    /// Spoken as one sentence, because a screen reader hitting an icon and a
    /// bare sentence separately loses which verdict the sentence belongs to.
    static func accessibilityLabel(for check: NativePlanFeasibilityCheck) -> String {
        let state: String
        switch check.verdict {
        case .fits: state = "checked and fine"
        case .breaks: state = "a problem"
        case .unknown: state = "not checked"
        }
        return "\(title(for: check.check)), \(state). \(check.detail)"
    }
}

/// The section as it appears in the Plan detail sheet.
struct NativePlanFeasibilityView: View {
    let feasibility: NativePlanFeasibility

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: NativePlanFeasibilityDisplay.symbol(for: feasibility.verdict))
                    .font(.system(size: 15, weight: .bold))
                Text(NativePlanFeasibilityDisplay.headline(for: feasibility.verdict))
                    .font(.system(size: 15, weight: .black))
            }
            .foregroundColor(NativePlanFeasibilityDisplay.tint(for: feasibility.verdict))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("native-plan-feasibility-headline")

            ForEach(NativePlanFeasibilityDisplay.ordered(feasibility.checks)) { check in
                row(check)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.10)))
        .accessibilityIdentifier("native-plan-feasibility")
    }

    @ViewBuilder private func row(_ check: NativePlanFeasibilityCheck) -> some View {
        let tint = NativePlanFeasibilityDisplay.tint(for: check.verdict)
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: NativePlanFeasibilityDisplay.symbol(for: check.verdict))
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(NativePlanFeasibilityDisplay.title(for: check.check))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(NativeTheme.textPrimary)
                Text(check.detail)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(NativeTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                // An unanswered check is not a filled tile. The dashed outline
                // reads as "nothing established here" at a glance, and reads
                // that way without colour for anyone who cannot use it.
                .fill(NativePlanFeasibilityDisplay.isOutlined(check.verdict) ? Color.clear : tint.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(
                    tint.opacity(NativePlanFeasibilityDisplay.isOutlined(check.verdict) ? 0.45 : 0.22),
                    style: StrokeStyle(
                        lineWidth: 1,
                        dash: NativePlanFeasibilityDisplay.isOutlined(check.verdict) ? [3, 3] : []
                    )
                )
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(NativePlanFeasibilityDisplay.accessibilityLabel(for: check))
        .accessibilityIdentifier("native-plan-feasibility-\(check.check)")
    }
}
