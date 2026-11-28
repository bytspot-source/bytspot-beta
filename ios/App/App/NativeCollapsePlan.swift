import Foundation

/// Collapse instrument — one hang + how you stop + why you stay.
/// Typical ≠ Live. Checkout is false unless that detector can settle.

enum NativeOccupancyKind: String, Equatable {
    case live = "Live"
    case typical = "Typical"
}

enum NativeStallProvenance: String, Equatable {
    case vendor
    case places
    case fallback
}

enum NativeDetectorKind: String, Equatable {
    case place
    case cottage
    case room
    case stall
}

enum NativeWalkBudget: String, Equatable {
    case close
    case medium
    case far
}

struct NativeHangInput: Equatable {
    let id: String
    let name: String
    var vibeTokens: [String] = []
    var occupancySource: String? = nil
    /// When the door, host, or sensor wrote this reading. Missing means not live.
    var recordedAt: Date? = nil
    var waitMins: Int? = nil
    var occupancyLevel: Int? = nil
    var availability: String? = nil
    var lat: Double? = nil
    var lng: Double? = nil
}

struct NativeStallInput: Equatable {
    let name: String
    let source: NativeStallProvenance
    let walkMinutes: Int
    let paid: Bool
    var available: Int? = nil
    var total: Int? = nil
    var lat: Double? = nil
    var lng: Double? = nil
}

struct NativeCollapseBasis: Equatable {
    var vibeTokens: [String] = []
    var walkPreference: NativeWalkBudget? = nil
    var evCharging: Bool = false
    var hour: Date = Date()
}

struct NativeCollapsePlan: Equatable {
    struct Hang: Equatable {
        let id: String
        let name: String
        let vibeTokens: [String]
        let lat: Double?
        let lng: Double?
    }

    struct Stall: Equatable {
        let name: String
        let source: NativeStallProvenance
        let walkMinutes: Int
        let paid: Bool
    }

    struct Occupancy: Equatable {
        let kind: NativeOccupancyKind
        let source: String?
        let label: String
    }

    let hang: Hang
    let stall: Stall
    let occupancy: Occupancy
    let detector: NativeDetectorKind
    let canCheckout: Bool
    let because: String
}

enum NativeCollapseInstrument {
    static let liveOccupancySources: Set<String> = ["bytspot", "user_report", "sensor"]
    static let liveOccupancyMaxAge: TimeInterval = 30 * 60

    static func isLiveOccupancySource(_ source: String?) -> Bool {
        guard let source else { return false }
        return liveOccupancySources.contains(source.lowercased())
    }

    static func isFreshLiveReading(_ recordedAt: Date?, now: Date = Date()) -> Bool {
        guard let recordedAt else { return false }
        let age = now.timeIntervalSince(recordedAt)
        return age >= 0 && age <= liveOccupancyMaxAge
    }

    static func occupancyKind(source: String?, recordedAt: Date? = nil, now: Date = Date()) -> NativeOccupancyKind {
        isLiveOccupancySource(source) && isFreshLiveReading(recordedAt, now: now) ? .live : .typical
    }

    static func venueAvailabilityLabel(source: String?, waitMins: Int?, level: Int?, availability: String?, recordedAt: Date? = nil, now: Date = Date()) -> String {
        let live = isLiveOccupancySource(source) && isFreshLiveReading(recordedAt, now: now)
        if let waitMins, waitMins > 0 { return live ? "~\(waitMins)m wait" : "typically ~\(waitMins)m wait" }
        if let availability, !availability.isEmpty { return availability }
        if (level ?? 1) >= 4 { return live ? "High activity" : "Typically high activity" }
        return live ? "Live availability" : "Typical now"
    }

    static func stallMayClaimAvailability(_ source: NativeStallProvenance) -> Bool {
        source == .vendor
    }

    static func detectorCanSettle(_ detector: NativeDetectorKind, stallSource: NativeStallProvenance = .fallback, settlementReady: Bool = false) -> Bool {
        guard settlementReady else { return false }
        if detector == .place { return false }
        if detector == .stall { return stallMayClaimAvailability(stallSource) }
        return true
    }

    static func explainPlan(occupancyKind: NativeOccupancyKind, occupancyLabel: String, stallName: String, walkMinutes: Int, vibeTokens: [String]) -> String {
        let vibeBit = vibeTokens.first.map { "vibe is \($0)" } ?? "no vibe filter"
        let hourBit = occupancyKind == .live
            ? "a door wrote \(occupancyLabel)"
            : "it is usually \(occupancyLabel.lowercased()) at this hour"
        return "Because \(hourBit), \(stallName) is \(walkMinutes) min walk, and \(vibeBit)."
    }

    static func collapse(hang: NativeHangInput, stall: NativeStallInput, detector: NativeDetectorKind = .place, settlementReady: Bool = false, basis: NativeCollapseBasis? = nil) -> NativeCollapsePlan {
        let kind = occupancyKind(source: hang.occupancySource, recordedAt: hang.recordedAt)
        let label = venueAvailabilityLabel(source: hang.occupancySource, waitMins: hang.waitMins, level: hang.occupancyLevel, availability: hang.availability, recordedAt: hang.recordedAt)
        let vibeTokens = hang.vibeTokens.isEmpty ? (basis?.vibeTokens ?? []) : hang.vibeTokens
        return NativeCollapsePlan(
            hang: .init(id: hang.id, name: hang.name, vibeTokens: vibeTokens, lat: hang.lat, lng: hang.lng),
            stall: .init(name: stall.name, source: stall.source, walkMinutes: stall.walkMinutes, paid: stall.paid),
            occupancy: .init(kind: kind, source: hang.occupancySource, label: label),
            detector: detector,
            canCheckout: detectorCanSettle(detector, stallSource: stall.source, settlementReady: settlementReady),
            because: explainPlan(occupancyKind: kind, occupancyLabel: label, stallName: stall.name, walkMinutes: stall.walkMinutes, vibeTokens: vibeTokens)
        )
    }
}
