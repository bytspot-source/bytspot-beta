import MapKit
import SwiftUI

/// A suggested timeline for a Plan, from `plans.itinerary`.
///
/// The server times each stop in the Plan's order. A time is `set` when a
/// party, a won offer or the guest's own booking states it, and `estimated`
/// otherwise; lengths are `stated` or `estimated` the same way. Server travel
/// is a 45 mph floor, so the phone asks Apple Maps for the real time of each
/// leg and says when it is longer than the gap the server left.
struct NativePlanItinerary: Decodable, Equatable {
    struct Travel: Decodable, Equatable {
        let meters: Double
        let atLeastMins: Int
    }

    struct Stop: Decodable, Equatable, Identifiable {
        let itemId: String
        let title: String
        let needKind: String
        let arriveAt: String?
        let leaveAt: String?
        let time: String?
        let timeSource: String?
        let lengthMins: Int
        let length: String
        let travel: Travel?
        let waitMins: Int
        let hours: String
        let issues: [String]
        var id: String { itemId }

        private enum CodingKeys: String, CodingKey {
            case itemId, title, needKind, arriveAt, leaveAt, time, timeSource, lengthMins, length, travel, waitMins, hours, issues
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            itemId = try container.decode(String.self, forKey: .itemId)
            title = try container.decode(String.self, forKey: .title)
            needKind = (try? container.decode(String.self, forKey: .needKind)) ?? ""
            arriveAt = try? container.decodeIfPresent(String.self, forKey: .arriveAt)
            leaveAt = try? container.decodeIfPresent(String.self, forKey: .leaveAt)
            time = try? container.decodeIfPresent(String.self, forKey: .time)
            timeSource = try? container.decodeIfPresent(String.self, forKey: .timeSource)
            lengthMins = (try? container.decode(Int.self, forKey: .lengthMins)) ?? 0
            // Anything unrecognised reads as estimated, never as stated.
            length = (try? container.decode(String.self, forKey: .length)) == "stated" ? "stated" : "estimated"
            travel = try? container.decodeIfPresent(Travel.self, forKey: .travel)
            waitMins = (try? container.decode(Int.self, forKey: .waitMins)) ?? 0
            hours = (try? container.decode(String.self, forKey: .hours)) ?? "unknown"
            issues = (try? container.decode([String].self, forKey: .issues)) ?? []
        }
    }

    struct Skipped: Decodable, Equatable {
        let itemId: String
        let title: String
    }

    struct SuggestedOrder: Decodable, Equatable {
        let itemIds: [String]
        let savesMeters: Double
    }

    let status: String
    let stops: [Stop]
    let skipped: [Skipped]
    let suggestedOrder: SuggestedOrder?

    private enum CodingKeys: String, CodingKey { case status, stops, skipped, suggestedOrder }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = (try? container.decode(String.self, forKey: .status)) ?? "empty"
        stops = (try? container.decode([Stop].self, forKey: .stops)) ?? []
        skipped = (try? container.decode([Skipped].self, forKey: .skipped)) ?? []
        suggestedOrder = try? container.decodeIfPresent(SuggestedOrder.self, forKey: .suggestedOrder)
    }
}

/// Apple Maps' time for one leg, keyed by the stop it arrives at.
struct NativePlanTimelineLeg: Equatable {
    enum Mode: Equatable { case walking, driving }
    let minutes: Int
    let mode: Mode
}

enum NativePlanTimelineDisplay {
    /// Matches the server's gap between stops.
    static let bufferMins = 10
    /// Up to this straight-line distance a leg is timed on foot.
    static let walkingMeters: Double = 1_200

    static func date(_ raw: String?) -> Date? {
        raw.flatMap { ISO8601DateFormatter.partyControlDate(from: $0) }
    }

    static func clock(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    /// "7:00 PM – 8:30 PM", or "About 7:00 PM – 8:30 PM" when Bytspot placed it.
    static func timeLabel(_ stop: NativePlanItinerary.Stop, timeZone: TimeZone = .current) -> String? {
        guard let arrive = date(stop.arriveAt) else { return nil }
        var range = clock(arrive, timeZone: timeZone)
        if let leave = date(stop.leaveAt) { range += " – " + clock(leave, timeZone: timeZone) }
        return stop.time == "set" ? range : "About " + range
    }

    static func timeSourceLabel(_ stop: NativePlanItinerary.Stop) -> String? {
        guard stop.time == "set" else { return nil }
        switch stop.timeSource {
        case "offer": return "Time set by the booking"
        case "party": return "Party start time"
        case "guestBooking": return "The time you booked"
        default: return nil
        }
    }

    static func duration(_ minutes: Int) -> String {
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(minutes) min" }
        return rest == 0 ? "\(hours) hr" : "\(hours) hr \(rest) min"
    }

    static func lengthLabel(_ stop: NativePlanItinerary.Stop) -> String {
        stop.length == "stated" ? duration(stop.lengthMins) : "About \(duration(stop.lengthMins)) (estimated)"
    }

    static func waitLabel(_ stop: NativePlanItinerary.Stop) -> String? {
        stop.waitMins >= 5 ? "\(duration(stop.waitMins)) wait before this" : nil
    }

    static func milesLabel(_ meters: Double) -> String {
        String(format: "%.1f mi", meters / 1_609.344)
    }

    static func mode(forMeters meters: Double) -> NativePlanTimelineLeg.Mode {
        meters <= walkingMeters ? .walking : .driving
    }

    /// Apple Maps' time when it answered; otherwise the distance and the floor.
    static func travelLabel(_ travel: NativePlanItinerary.Travel?, apple: NativePlanTimelineLeg?) -> String? {
        if let apple {
            let verb = apple.mode == .walking ? "walk" : "drive"
            return "\(duration(max(1, apple.minutes))) \(verb) · Apple Maps"
        }
        guard let travel else { return nil }
        return "\(milesLabel(travel.meters)) · at least \(duration(max(1, travel.atLeastMins)))"
    }

    /// Said only when Apple Maps needs more than the gap the timeline left.
    static func travelWarning(_ travel: NativePlanItinerary.Travel?, apple: NativePlanTimelineLeg?) -> String? {
        guard let travel, let apple else { return nil }
        let planned = travel.atLeastMins + bufferMins
        let extra = apple.minutes - planned
        guard extra > 0 else { return nil }
        return "Apple Maps expects \(duration(apple.minutes)), about \(duration(extra)) more than this timeline allows."
    }

    static func suggestedOrderLabel(_ itinerary: NativePlanItinerary) -> String? {
        guard let suggestion = itinerary.suggestedOrder else { return nil }
        let titles = Dictionary(itinerary.stops.map { ($0.itemId, $0.title) }, uniquingKeysWith: { first, _ in first })
        let names = suggestion.itemIds.compactMap { titles[$0] }
        guard names.count == suggestion.itemIds.count, names.count >= 2 else { return nil }
        return "\(names.joined(separator: " → ")) saves about \(milesLabel(suggestion.savesMeters))."
    }

    static func skippedLabel(_ itinerary: NativePlanItinerary) -> String? {
        guard !itinerary.skipped.isEmpty else { return nil }
        return "Not on the timeline: " + itinerary.skipped.map(\.title).joined(separator: ", ") + "."
    }
}

enum NativePlanTimelineETA {
    typealias Estimator = @MainActor (CLLocationCoordinate2D, CLLocationCoordinate2D, NativePlanTimelineLeg.Mode, Date?) async -> TimeInterval?

    /// Legs Apple Maps is asked about per timeline.
    static let maxLegs = 8

    /// Apple Maps' time for each leg whose two ends have a place. A leg Apple
    /// Maps can't answer is left out, and the server's floor shows instead.
    @MainActor
    static func legs(
        for itinerary: NativePlanItinerary,
        points: [String: CLLocationCoordinate2D],
        now: Date = Date(),
        estimator: Estimator = NativePlanTimelineETA.appleMaps
    ) async -> [String: NativePlanTimelineLeg] {
        var legs: [String: NativePlanTimelineLeg] = [:]
        var asked = 0
        for (previous, stop) in zip(itinerary.stops, itinerary.stops.dropFirst()) {
            guard asked < maxLegs, let from = points[previous.itemId], let to = points[stop.itemId] else { continue }
            if Task.isCancelled { break }
            asked += 1
            let meters = stop.travel?.meters
                ?? CLLocation(latitude: from.latitude, longitude: from.longitude)
                    .distance(from: CLLocation(latitude: to.latitude, longitude: to.longitude))
            let mode = NativePlanTimelineDisplay.mode(forMeters: meters)
            let departure = NativePlanTimelineDisplay.date(previous.leaveAt).flatMap { $0 > now ? $0 : nil }
            guard let seconds = await estimator(from, to, mode, departure), seconds.isFinite, seconds >= 0 else { continue }
            legs[stop.itemId] = NativePlanTimelineLeg(minutes: Int((seconds / 60).rounded(.up)), mode: mode)
        }
        return legs
    }

    @MainActor
    static func appleMaps(
        from: CLLocationCoordinate2D,
        to: CLLocationCoordinate2D,
        mode: NativePlanTimelineLeg.Mode,
        departure: Date?
    ) async -> TimeInterval? {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: from))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: to))
        request.transportType = mode == .walking ? .walking : .automobile
        if let departure { request.departureDate = departure }
        request.requestsAlternateRoutes = false
        return try? await MKDirections(request: request).calculateETA().expectedTravelTime
    }
}

/// The Timeline section in the Plan detail sheet.
struct NativePlanTimelineView: View {
    let itinerary: NativePlanItinerary
    let points: [String: CLLocationCoordinate2D]
    var estimator: NativePlanTimelineETA.Estimator = NativePlanTimelineETA.appleMaps
    @State private var legs: [String: NativePlanTimelineLeg] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if itinerary.status == "needsStart" {
                Text("Add a start time to see when each stop happens.")
                    .font(.footnote.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
                    .accessibilityIdentifier("native-plan-timeline-needs-start")
            }
            ForEach(Array(itinerary.stops.enumerated()), id: \.element.id) { index, stop in
                if index > 0 { travelRow(stop) }
                stopRow(stop, number: index + 1)
            }
            if let order = NativePlanTimelineDisplay.suggestedOrderLabel(itinerary) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Shorter order").font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                    Text(order).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(NativeTheme.cyan.opacity(0.10)))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("native-plan-timeline-suggested-order")
            }
            if let skipped = NativePlanTimelineDisplay.skippedLabel(itinerary) {
                Text(skipped).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
            }
            Text("Times starting with About are estimates. Nothing is booked from this timeline.")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.10)))
        .accessibilityIdentifier("native-plan-timeline")
        .task(id: itinerary) {
            legs = [:]
            let fetched = await NativePlanTimelineETA.legs(for: itinerary, points: points, estimator: estimator)
            if !Task.isCancelled { legs = fetched }
        }
    }

    @ViewBuilder private func stopRow(_ stop: NativePlanItinerary.Stop, number: Int) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)")
                .font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                .frame(width: 22, height: 22)
                .background(Circle().fill(NativeTheme.purple.opacity(0.35)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.title).font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                if let time = NativePlanTimelineDisplay.timeLabel(stop) {
                    Text(time).font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
                }
                Text(NativePlanTimelineDisplay.lengthLabel(stop)).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                if let source = NativePlanTimelineDisplay.timeSourceLabel(stop) {
                    Text(source).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                }
                if let wait = NativePlanTimelineDisplay.waitLabel(stop) {
                    Text(wait).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                }
                ForEach(stop.issues, id: \.self) { issue in
                    Label(issue, systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(NativeTheme.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("native-plan-timeline-stop-\(stop.itemId)")
    }

    @ViewBuilder private func travelRow(_ stop: NativePlanItinerary.Stop) -> some View {
        let apple = legs[stop.itemId]
        if let label = NativePlanTimelineDisplay.travelLabel(stop.travel, apple: apple) {
            VStack(alignment: .leading, spacing: 2) {
                Label(label, systemImage: (apple?.mode ?? NativePlanTimelineDisplay.mode(forMeters: stop.travel?.meters ?? 0)) == .walking ? "figure.walk" : "car.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(NativeTheme.textSecondary)
                if let warning = NativePlanTimelineDisplay.travelWarning(stop.travel, apple: apple) {
                    Text(warning).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.leading, 32)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("native-plan-timeline-travel-\(stop.itemId)")
        }
    }
}
