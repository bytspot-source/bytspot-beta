import CoreLocation
import MapKit
import Testing
@testable import App

@MainActor
struct NativeM2RouteTests {
    private let referenceDate = Date(timeIntervalSince1970: 1_800_000_000)

    private func venue(latitude: Double = 33.787812345, longitude: Double = -84.383298765,
                       crowd: NativeCrowdSummary? = nil) -> NativeVenueSummary {
        NativeVenueSummary(id: "route-test", name: "Spot & Café / ?destination=elsewhere#fragment",
                           category: "dining", address: "1 Example Street", distance: "invented catalog distance",
                           rating: nil, latitude: latitude, longitude: longitude, crowd: crowd,
                           parking: NativeParkingSummary(totalAvailable: 99, priceLabel: "Unknown"),
                           verifiedPatchId: nil, imageUrl: nil)
    }

    private func location(age: TimeInterval = 0, accuracy: Double = 20,
                          latitude: Double = 33.76, longitude: Double = -84.39) -> CLLocation {
        CLLocation(coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                   altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1,
                   timestamp: referenceDate.addingTimeInterval(-age))
    }

    private func metrics(seconds: Double = 601, meters: Double = 3218.688) throws -> NativeM2RouteMetrics {
        try #require(NativeM2RouteMetrics(expectedTravelTime: seconds, distance: meters))
    }

    @Test func sheetKeepsTheVenueOnlyInitializer() {
        // Compile-time integration contract: manager supplies the environment object
        // when presenting; no location/network access is needed to construct the view.
        _ = NativeM2RouteSheet(venue: venue())
    }

    @Test func invalidOrMissingCoordinatesFailClosed() {
        let invalid: [(Double?, Double?)] = [
            (nil, -84), (33, nil), (.nan, -84), (33, .nan), (.infinity, 1), (1, -.infinity),
            (90.001, 1), (-90.001, 1), (1, 180.001), (1, -180.001), (0, 0)
        ]
        for (latitude, longitude) in invalid {
            #expect(NativeM2RoutePoint(latitude: latitude, longitude: longitude) == nil)
        }
        #expect(NativeM2RoutePoint(latitude: 0, longitude: 10) != nil)
        #expect(NativeM2RoutePoint(latitude: 10, longitude: 0) != nil)
        #expect(NativeM2RoutePoint(latitude: 90, longitude: -180) != nil)
    }

    @Test func invalidDestinationCannotProduceEitherHandoff() {
        for (latitude, longitude) in [(Double.nan, -84.0), (33, Double.nan), (0, 0), (91, -84), (33, -181)] {
            let destination = NativeM2RouteDestination(venue: venue(latitude: latitude, longitude: longitude))
            #expect(destination.point == nil)
            #expect(destination.directionsURL(for: .apple) == nil)
            #expect(destination.directionsURL(for: .google) == nil)
        }
    }

    @Test func googleURLUsesOnlyExactDestinationAndFixedUniversalHost() throws {
        let destination = NativeM2RouteDestination(venue: venue())
        let url = try #require(destination.directionsURL(for: .google))
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.scheme == "https")
        #expect(components.host == "www.google.com")
        #expect(components.path == "/maps/dir/")
        #expect(components.user == nil && components.password == nil && components.fragment == nil)
        #expect(components.queryItems == [URLQueryItem(name: "api", value: "1"),
                                        URLQueryItem(name: "destination", value: "33.787812345,-84.383298765"),
                                        URLQueryItem(name: "travelmode", value: "driving")])
        #expect(!url.absoluteString.contains("elsewhere"))
    }

    @Test func appleURLUsesExactDestinationAndNoGuessedOrigin() throws {
        let url = try #require(NativeM2RouteDestination(venue: venue()).directionsURL(for: .apple))
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.scheme == "https")
        #expect(components.host == "maps.apple.com")
        #expect(components.queryItems == [URLQueryItem(name: "daddr", value: "33.787812345,-84.383298765"),
                                        URLQueryItem(name: "dirflg", value: "d")])
        #expect(components.fragment == nil)
    }

    @Test func unknownUnauthorizedStaleOrInaccurateOriginIsUnavailable() {
        #expect(NativeM2RouteModel.origin(location: nil, authorized: true, now: referenceDate) == nil)
        #expect(NativeM2RouteModel.origin(location: location(), authorized: false, now: referenceDate) == nil)
        for fix in [location(age: 61), location(age: -1), location(accuracy: -1),
                    location(accuracy: 251), location(accuracy: .nan), location(latitude: .nan),
                    location(latitude: 0, longitude: 0)] {
            #expect(NativeM2RouteModel.origin(location: fix, authorized: true, now: referenceDate) == nil)
        }
        let real = NativeM2RouteModel.origin(location: location(age: 60, accuracy: 250), authorized: true, now: referenceDate)
        #expect(real == NativeM2RoutePoint(latitude: 33.76, longitude: -84.39))
    }

    @Test func requestIsDrivingFromActualCoordinatesWithExplicitDeparture() throws {
        let origin = try #require(NativeM2RoutePoint(latitude: 51.5074, longitude: -0.1278))
        let target = try #require(NativeM2RouteDestination(venue: venue()).point)
        let request = NativeM2RouteModel.request(origin: origin, destination: target, departureDate: referenceDate)
        #expect(request.source?.placemark.coordinate.latitude == 51.5074)
        #expect(request.source?.placemark.coordinate.longitude == -0.1278)
        #expect(request.destination?.placemark.coordinate.latitude == target.latitude)
        #expect(request.destination?.placemark.coordinate.longitude == target.longitude)
        #expect(request.transportType == .automobile)
        #expect(request.departureDate == referenceDate)
        #expect(!request.requestsAlternateRoutes)
    }

    @Test func missingOriginSkipsEstimatorButPreservesHandoffs() throws {
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        let destination = NativeM2RouteDestination(venue: venue())
        model.load(destination: destination, location: nil, authorized: true)
        #expect(model.state == .unavailable(NativeM2RouteCopy.missingOrigin))
        #expect(stub.requests.isEmpty)
        #expect(destination.directionsURL(for: .apple) != nil)
        #expect(destination.directionsURL(for: .google) != nil)
        model.load(destination: destination, location: location(), authorized: false)
        #expect(stub.requests.isEmpty)
    }

    @Test func missingDestinationSkipsEstimatorEvenWithKnownOrigin() {
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        model.load(destination: NativeM2RouteDestination(venue: venue(latitude: 0, longitude: 0)),
                   location: location(), authorized: true)
        #expect(model.state == .unavailable(NativeM2RouteCopy.missingDestination))
        #expect(stub.requests.isEmpty)
    }

    @Test func responseControlsMetricsAndFreshnessNotRequestStart() throws {
        let stub = EstimatorStub()
        var now = referenceDate
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { now })
        model.load(destination: NativeM2RouteDestination(venue: venue()), location: location(), authorized: true)
        #expect(model.state == .loading)
        #expect(stub.requests.count == 1)
        #expect(stub.requests[0].origin == NativeM2RoutePoint(latitude: 33.76, longitude: -84.39))
        now = now.addingTimeInterval(8)
        let response = try metrics()
        stub.requests[0].completion(.success(response))
        #expect(model.state == .ready(response, updatedAt: now))
    }

    @Test func failuresHaveNoFreshnessAndCanRetry() throws {
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        let destination = NativeM2RouteDestination(venue: venue())
        model.load(destination: destination, location: location(), authorized: true)
        stub.requests[0].completion(.failure(.unavailable))
        #expect(model.state == .failed)
        model.load(destination: destination, location: location(), authorized: true)
        #expect(model.state == .loading)
        let response = try metrics()
        stub.requests[1].completion(.success(response))
        #expect(model.state == .ready(response, updatedAt: referenceDate))
    }

    @Test func newerRequestAndDismissalRejectLateResponses() throws {
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        model.load(destination: NativeM2RouteDestination(venue: venue()), location: location(), authorized: true)
        model.load(destination: NativeM2RouteDestination(venue: venue(latitude: 40)), location: location(), authorized: true)
        #expect(stub.cancellations == [0])
        let response = try metrics()
        stub.requests[1].completion(.success(response))
        stub.requests[0].completion(.failure(.unavailable))
        #expect(model.state == .ready(response, updatedAt: referenceDate))
        model.cancel()
        #expect(stub.cancellations == [0, 1])
        stub.requests[1].completion(.success(response))
        #expect(model.state == .idle)
    }

    @Test func revokingLocationInvalidatesPendingResponse() throws {
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        let destination = NativeM2RouteDestination(venue: venue())
        model.load(destination: destination, location: location(), authorized: true)
        model.load(destination: destination, location: location(), authorized: false)
        stub.requests[0].completion(.success(try metrics()))
        #expect(model.state == .unavailable(NativeM2RouteCopy.missingOrigin))
        #expect(stub.cancellations == [0])
    }

    @Test func fixThatExpiresWhileWaitingCannotProduceFreshEstimate() throws {
        let stub = EstimatorStub()
        var now = referenceDate
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { now })
        model.load(destination: NativeM2RouteDestination(venue: venue()), location: location(), authorized: true)
        now = now.addingTimeInterval(61)
        stub.requests[0].completion(.success(try metrics()))
        #expect(model.state == .unavailable(NativeM2RouteCopy.missingOrigin))
    }

    @Test func timeAndDistanceAreValidatedWithoutTruncatingMinutes() throws {
        #expect(try metrics(seconds: 59).minutesLabel == "Less than 1 min")
        #expect(try metrics(seconds: 60).minutesLabel == "1 min")
        #expect(try metrics(seconds: 61).minutesLabel == "2 min")
        let response = try metrics()
        #expect(response.minutesLabel == "11 min")
        #expect(response.distance == 3218.688)
        let formatter = MKDistanceFormatter()
        formatter.unitStyle = .full
        #expect(response.distanceLabel == formatter.string(fromDistance: 3218.688))
        for value in [Double.nan, .infinity, -.infinity, -1] {
            #expect(NativeM2RouteMetrics(expectedTravelTime: value, distance: 100) == nil)
            #expect(NativeM2RouteMetrics(expectedTravelTime: 60, distance: value) == nil)
        }
    }

    @Test func crowdAndCatalogDistanceCannotChangeRouteIntelligence() throws {
        let quiet = NativeM2RouteDestination(venue: venue(crowd: .init(level: 0, label: "Quiet", waitMins: 0)))
        let busy = NativeM2RouteDestination(venue: venue(crowd: .init(level: 4, label: "Packed", waitMins: 99, source: "sensor")))
        #expect(quiet == busy)
        #expect(NativeM2RouteCopy.estimateTitle == "Estimated drive time")
        #expect(NativeM2RouteCopy.incidents == "Road incidents unavailable")
        #expect(NativeM2RouteCopy.congestion == "Congestion details unavailable")
        #expect(!NativeM2RouteCopy.source.lowercased().contains("live"))
        let stub = EstimatorStub()
        let model = NativeM2RouteModel(estimator: stub.estimate, now: { referenceDate })
        let response = try metrics(seconds: 300, meters: 1000)
        for destination in [quiet, busy] {
            model.load(destination: destination, location: location(), authorized: true)
            try #require(stub.requests.last).completion(.success(response))
            #expect(model.state == .ready(response, updatedAt: referenceDate))
        }
    }

    @MainActor
    private final class EstimatorStub {
        struct Request {
            let origin: NativeM2RoutePoint
            let destination: NativeM2RoutePoint
            let completion: NativeM2RouteModel.Completion
        }
        var requests: [Request] = []
        var cancellations: [Int] = []

        func estimate(origin: NativeM2RoutePoint, destination: NativeM2RoutePoint,
                      completion: @escaping NativeM2RouteModel.Completion) -> NativeM2RouteModel.Cancel {
            let index = requests.count
            requests.append(Request(origin: origin, destination: destination, completion: completion))
            return { [weak self] in self?.cancellations.append(index) }
        }
    }
}
