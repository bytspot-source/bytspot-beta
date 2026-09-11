import SwiftUI
import MapKit
import CoreLocation

/// Validated coordinates only; no geocoding, venue-name matching, or area fallback.
struct NativeM2RoutePoint: Equatable, Sendable {
    let latitude: Double
    let longitude: Double

    init?(latitude: Double?, longitude: Double?) {
        guard let latitude, let longitude,
              NativeVenueSummary.hasValidMapCoordinate(latitude: latitude, longitude: longitude) else { return nil }
        self.latitude = latitude
        self.longitude = longitude
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    // Double's description is locale-independent and retains coordinate precision.
    var queryValue: String { "\(latitude),\(longitude)" }
}

struct NativeM2RouteDestination: Equatable {
    let name: String
    let address: String
    let point: NativeM2RoutePoint?

    init(venue: NativeVenueSummary) {
        name = venue.name
        address = venue.address
        point = NativeM2RoutePoint(latitude: venue.latitude, longitude: venue.longitude)
    }

    /// Omitting the source lets the selected Maps app resolve its own origin.
    func directionsURL(for provider: NativeM2RouteProvider) -> URL? {
        guard let point else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        switch provider {
        case .apple:
            components.host = "maps.apple.com"
            components.path = "/"
            components.queryItems = [
                URLQueryItem(name: "daddr", value: point.queryValue),
                URLQueryItem(name: "dirflg", value: "d")
            ]
        case .google:
            components.host = "www.google.com"
            components.path = "/maps/dir/"
            components.queryItems = [
                URLQueryItem(name: "api", value: "1"),
                URLQueryItem(name: "destination", value: point.queryValue),
                URLQueryItem(name: "travelmode", value: "driving")
            ]
        }
        return components.url
    }
}

enum NativeM2RouteProvider: String, CaseIterable {
    case apple, google
    var title: String { self == .apple ? "Apple Maps" : "Google Maps" }
}

struct NativeM2RouteMetrics: Equatable, Sendable {
    let expectedTravelTime: TimeInterval
    let distance: CLLocationDistance

    init?(expectedTravelTime: TimeInterval, distance: CLLocationDistance) {
        guard expectedTravelTime.isFinite, expectedTravelTime >= 0,
              distance.isFinite, distance >= 0 else { return nil }
        self.expectedTravelTime = expectedTravelTime
        self.distance = distance
    }

    var minutesLabel: String {
        if expectedTravelTime < 60 { return "Less than 1 min" }
        return "\((expectedTravelTime / 60).rounded(.up).formatted(.number.precision(.fractionLength(0)))) min"
    }

    var distanceLabel: String {
        let formatter = MKDistanceFormatter()
        formatter.unitStyle = .full
        return formatter.string(fromDistance: distance)
    }
}

enum NativeM2RouteCopy {
    static let estimateTitle = "Estimated drive time"
    static let incidents = "Road incidents unavailable"
    static let congestion = "Congestion details unavailable"
    static let source = "Apple Maps driving estimate. Traffic is considered where available; conditions may change."
    static let missingDestination = "Route unavailable: this location has no valid exact coordinates."
    static let missingOrigin = "Drive estimate unavailable: Bytspot needs an authorized, recent device location. You can still choose a Maps app to use its own origin."
    static let failed = "Drive estimate unavailable. Apple Maps could not return a driving estimate. Try again or choose a Maps app."
}

enum NativeM2RouteFailure: Error, Sendable { case unavailable }

/// A callback seam keeps cancellation explicit (MKDirections.cancel), and lets
/// tests deliver responses out of order without real network or location access.
@MainActor
final class NativeM2RouteModel: ObservableObject {
    enum State: Equatable {
        case idle
        case unavailable(String)
        case loading
        case ready(NativeM2RouteMetrics, updatedAt: Date)
        case failed
    }

    typealias Completion = @MainActor (Result<NativeM2RouteMetrics, NativeM2RouteFailure>) -> Void
    typealias Cancel = @MainActor () -> Void
    typealias Estimator = @MainActor (NativeM2RoutePoint, NativeM2RoutePoint, @escaping Completion) -> Cancel

    @Published private(set) var state: State = .idle
    private let estimator: Estimator
    private let now: () -> Date
    private var cancelEstimate: Cancel?
    private var generation = UUID()

    init(estimator: @escaping Estimator = NativeM2RouteModel.estimate, now: @escaping () -> Date = Date.init) {
        self.estimator = estimator
        self.now = now
    }

    static func origin(location: CLLocation?, authorized: Bool, now: Date = Date()) -> NativeM2RoutePoint? {
        guard authorized,
              let coordinate = NativeLocationStore.coordinateForRideBooking(location: location, now: now),
              !coordinate.isFallback else { return nil }
        return NativeM2RoutePoint(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }

    func load(destination: NativeM2RouteDestination, location: CLLocation?, authorized: Bool) {
        cancel()
        guard let target = destination.point else {
            state = .unavailable(NativeM2RouteCopy.missingDestination)
            return
        }
        guard let origin = Self.origin(location: location, authorized: authorized, now: now()) else {
            state = .unavailable(NativeM2RouteCopy.missingOrigin)
            return
        }
        state = .loading
        let requestGeneration = generation
        cancelEstimate = estimator(origin, target) { [weak self] result in
            guard let self, self.generation == requestGeneration else { return }
            let receivedAt = self.now()
            // An old fix cannot become a fresh estimate just because the server was slow.
            guard Self.origin(location: location, authorized: authorized, now: receivedAt) != nil else {
                self.state = .unavailable(NativeM2RouteCopy.missingOrigin)
                return
            }
            switch result {
            case .success(let metrics): self.state = .ready(metrics, updatedAt: receivedAt)
            case .failure: self.state = .failed
            }
        }
    }

    func cancel() {
        generation = UUID() // Invalidate before cancellation can call back.
        cancelEstimate?()
        cancelEstimate = nil
        state = .idle
    }

    static func request(origin: NativeM2RoutePoint, destination: NativeM2RoutePoint, departureDate: Date) -> MKDirections.Request {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin.coordinate))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination.coordinate))
        request.transportType = .automobile
        request.departureDate = departureDate
        request.requestsAlternateRoutes = false
        return request
    }

    private static func estimate(origin: NativeM2RoutePoint, destination: NativeM2RoutePoint, completion: @escaping Completion) -> Cancel {
        let directions = MKDirections(request: request(origin: origin, destination: destination, departureDate: Date()))
        // ETAResponse.expectedTravelTime accounts for expected traffic. This is
        // not a congestion classification or an incident feed. No Google API call.
        directions.calculateETA { response, error in
            let metrics = error == nil ? response.flatMap {
                NativeM2RouteMetrics(expectedTravelTime: $0.expectedTravelTime, distance: $0.distance)
            } : nil
            let result: Result<NativeM2RouteMetrics, NativeM2RouteFailure> = metrics.map { .success($0) } ?? .failure(.unavailable)
            Task { @MainActor in completion(result) }
        }
        return { directions.cancel() }
    }
}

/// Present this sheet first; navigation leaves Bytspot only after a Maps button tap.
@MainActor
struct NativeM2RouteSheet: View {
    let venue: NativeVenueSummary
    @EnvironmentObject private var locationStore: NativeLocationStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = NativeM2RouteModel()
    @State private var handoffError: String?
    @State private var handoffGeneration = UUID()
    @State private var isVisible = false

    private var destination: NativeM2RouteDestination { NativeM2RouteDestination(venue: venue) }

    var body: some View {
        ZStack {
            NativeDeepSpaceGround()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    VStack(alignment: .leading, spacing: 14) {
                        Text(NativeM2RouteCopy.estimateTitle).font(.headline)
                        estimateContent
                        Divider().overlay(NativeTheme.textSecondary.opacity(0.3))
                        Label(NativeM2RouteCopy.congestion, systemImage: "car.fill")
                        Label(NativeM2RouteCopy.incidents, systemImage: "exclamationmark.triangle")
                    }
                    .font(.body)
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NativeTheme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Continue in Maps").font(.headline)
                        Text("Choose where to navigate. Your Maps app determines the starting point and may show a different estimate.")
                            .font(.subheadline).foregroundColor(NativeTheme.textSecondary)
                        ForEach(NativeM2RouteProvider.allCases, id: \.self) { provider in
                            routeButton(provider.title, icon: "arrow.triangle.turn.up.right") { handoff(to: provider) }
                                .disabled(destination.point == nil)
                                .opacity(destination.point == nil ? 0.55 : 1)
                                .accessibilityIdentifier("native-m2-route-\(provider.rawValue)")
                        }
                        if let handoffError {
                            Text(handoffError).font(.body)
                                .accessibilityIdentifier("native-m2-route-handoff-error")
                        }
                    }
                }
                .padding(20)
            }
        }
        .foregroundColor(NativeTheme.textPrimary)
        .accessibilityIdentifier("native-m2-route-sheet")
        .onAppear { isVisible = true; refresh() }
        .onChange(of: destination) { _ in
            handoffGeneration = UUID()
            handoffError = nil
            refresh()
        }
        .onChange(of: locationStore.lastLocation) { _ in refresh() }
        .onChange(of: locationStore.authorizationState) { _ in refresh() }
        .onChange(of: scenePhase) { phase in if phase == .active { refresh() } }
        .onDisappear {
            isVisible = false
            handoffGeneration = UUID()
            model.cancel()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text("Bytspot Route").font(.title2.weight(.bold))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.headline)
                        .frame(width: 44, height: 44)
                        .background(NativeTheme.panel).clipShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close route")
            }
            Text(destination.name).font(.title.weight(.bold)).fixedSize(horizontal: false, vertical: true)
            if !destination.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(destination.address).font(.body).foregroundColor(NativeTheme.textSecondary)
            }
        }
    }

    @ViewBuilder private var estimateContent: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView("Getting driving estimate…")
                .tint(NativeTheme.textPrimary)
        case .unavailable(let message):
            Text(message)
            retryButton
        case .failed:
            Text(NativeM2RouteCopy.failed)
            retryButton
        case .ready(let metrics, let updatedAt):
            Text(metrics.minutesLabel).font(.largeTitle.weight(.bold))
                .accessibilityLabel("Estimated drive time, \(metrics.minutesLabel)")
            Text("Driving distance: \(metrics.distanceLabel)")
            Text(NativeM2RouteCopy.source).font(.subheadline).foregroundColor(NativeTheme.textSecondary)
            Text("From your device location at request time.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            Text("Updated \(updatedAt.formatted(date: .abbreviated, time: .standard))")
                .font(.footnote).foregroundColor(NativeTheme.textSecondary)
            routeButton("Refresh estimate", icon: "arrow.clockwise", action: refresh)
        }
    }

    private var retryButton: some View {
        routeButton("Retry estimate", icon: "arrow.clockwise", action: refresh)
            .disabled(destination.point == nil)
    }

    private func routeButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.headline)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(NativeTheme.selectedControlSurface)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func refresh() {
        guard isVisible else { return }
        // Read only: never prompt for permission, request a fix, or use .coordinate's fallback.
        model.load(destination: destination, location: locationStore.lastLocation,
                   authorized: locationStore.authorizationState == .allowed)
    }

    private func handoff(to provider: NativeM2RouteProvider) {
        guard let url = destination.directionsURL(for: provider) else {
            handoffError = NativeM2RouteCopy.missingDestination
            return
        }
        handoffError = nil
        let generation = UUID()
        handoffGeneration = generation
        openURL(url) { accepted in
            guard isVisible, handoffGeneration == generation else { return }
            if !accepted {
                handoffError = "Could not open \(provider.title). Try again or choose another Maps app."
            }
        }
    }
}

/// Provider links carry an exact destination, but never quote or book a ride.
/// Pickup, price and final confirmation remain with the chosen provider.
enum NativeM2RideProvider: String, CaseIterable, Identifiable {
    case uber, lyft
    var id: String { rawValue }
    var title: String { self == .uber ? "Uber" : "Lyft" }
}

extension NativeM2RouteDestination {
    func rideURL(for provider: NativeM2RideProvider) -> URL? {
        guard let point else { return nil }
        var url = URLComponents()
        url.scheme = "https"
        switch provider {
        case .uber:
            url.host = "m.uber.com"; url.path = "/ul/"
            url.queryItems = [URLQueryItem(name: "action", value: "setPickup"),
                URLQueryItem(name: "pickup", value: "my_location"),
                URLQueryItem(name: "dropoff[latitude]", value: String(point.latitude)),
                URLQueryItem(name: "dropoff[longitude]", value: String(point.longitude)),
                URLQueryItem(name: "dropoff[nickname]", value: name)]
        case .lyft:
            url.host = "www.lyft.com"; url.path = "/ride"
            url.queryItems = [URLQueryItem(name: "destination[latitude]", value: String(point.latitude)),
                URLQueryItem(name: "destination[longitude]", value: String(point.longitude))]
        }
        return url.url
    }
}

/// One container, independent venue/parking/ride state. No hold path exists in
/// the mounted parking API, so this module cannot show HOLD or live counts.
struct NativeM2ArrivalModule: View {
    let venue: NativeVenueSummary
    let openRoute: () -> Void
    @Environment(\.openURL) private var openURL
    @State private var handoffError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Arrival").font(.title3.bold()).accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 10) {
                Label("DRIVE", systemImage: "circle").font(.headline)
                Text("Route to the venue").font(.subheadline.weight(.semibold))
                Text("Review a driving estimate, then choose a Maps app. Parking inventory is not connected; no space is held.")
                    .font(.subheadline).foregroundColor(.white.opacity(0.75))
                Button(action: openRoute) {
                    Label("Route", systemImage: "arrow.triangle.turn.up.right")
                        .font(.headline).frame(minHeight: 44)
                }.buttonStyle(.plain).accessibilityIdentifier("native-m2-arrival-route")
            }
            Divider().overlay(Color.white.opacity(0.15))
            VStack(alignment: .leading, spacing: 10) {
                Label("RIDE", systemImage: "circle").font(.headline)
                Text("Confirm pickup, fare and availability with the provider. Opening a provider does not book a ride.")
                    .font(.subheadline).foregroundColor(.white.opacity(0.75))
                ForEach(NativeM2RideProvider.allCases) { provider in
                    if let url = NativeM2RouteDestination(venue: venue).rideURL(for: provider) {
                        Button {
                            handoffError = nil
                            openURL(url) { accepted in
                                if !accepted { handoffError = "Could not open \(provider.title). Please try again." }
                            }
                        } label: {
                            Label("Open \(provider.title) ↗", systemImage: "arrow.up.right")
                                .font(.headline).frame(minHeight: 44)
                        }.buttonStyle(.plain)
                        .accessibilityIdentifier("native-m2-ride-\(provider.id)")
                    }
                }
                if !venue.hasKnownCoordinates {
                    Text("Ride destination unavailable: exact coordinates were not supplied.").font(.footnote)
                }
                if let handoffError { Text(handoffError).font(.footnote) }
            }
        }
        .foregroundColor(.white).padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 18))
        .accessibilityIdentifier("native-m2-arrival")
    }
}
