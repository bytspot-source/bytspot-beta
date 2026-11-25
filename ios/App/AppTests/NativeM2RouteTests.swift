import CoreLocation
import MapKit
import Testing
@testable import App

/// Invocation routing regressions live in this already-registered routing test
/// file so they run in AppTests without adding project-file registrations.
@MainActor
struct NativeInvocationRouteTests {
    @Test(arguments: [
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&partyId=",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&partyId=%20%0A&party=",
        "https://appclip.apple.com/id?P=BYT424",
        "https://demo.appclip.apple.com/id?p=BYT424"
    ])
    func missingPartyNeverEntersPatchPairing(raw: String) throws {
        let url = try #require(URL(string: raw))
        #expect(NativePartyPassRoute(url: url) == nil)
        #expect(BytspotPatchRoute(url: url) == nil)
        let coordinator = NativeNavigationCoordinator()
        #expect(!coordinator.notifyPatchScanned(url: url, source: .universalLink))
        #expect(!coordinator.handle(url: url))
        // No patch destination is emitted for the shell's pairing hook.
        #expect(coordinator.requestedDestination == nil)
        #expect(coordinator.requestedTab == nil)
        #expect(coordinator.lastScanSource == nil)
    }

    @Test(arguments: [
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&partyId=&party=Party-42",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&partyId=%20%0A&party=%20Party-42%20",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&party&PaRtYiD=Party-42",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&partyId=&partyId=Party-42&party=other",
        "https://demo.appclip.apple.com/id?p=com.bytspot.app.Clip&party=Party-42",
        "https://bytspot.app/party/Party-42",
        "bytspot://party/Party-42",
        "https://bytspot.app/party/Party-42?partyId=other",
        "https://appclip.apple.com/party/Party-42?partyId=other"
    ])
    func partyAliasesAndCanonicalLinksReachOnlyParty(raw: String) throws {
        let url = try #require(URL(string: raw))
        let route = try #require(NativePartyPassRoute(url: url))
        #expect(route.partyID == "Party-42")
        #expect(BytspotPatchRoute(url: url) == nil)
        let coordinator = NativeNavigationCoordinator()
        #expect(!coordinator.notifyPatchScanned(url: url, source: .universalLink))
        #expect(coordinator.handle(url: url))
        #expect(coordinator.requestedDestination == .party(route))
        #expect(coordinator.requestedTab == .home)
        #expect(coordinator.lastScanSource == nil)
    }

    @Test(arguments: [
        "https://appclip.apple.com/party?partyId=Party-42",
        "https://appclip.apple.com/party/invalid/extra?partyId=Party-42",
        "https://appclip.apple.com/party/%20?partyId=Party-42",
        "https://appclip.apple.com/party/bad%2Fid?partyId=Party-42",
        "https://appclip.apple.com/id?partyId=bad%2Fid&party=Party-42",
        "https://bytspot.app/party?partyId=Party-42",
        "bytspot://party?partyId=Party-42",
        "https://bytspot.app/id?partyId=Party-42",
        "https://bytspot.com/party/Party-42",
        "https://untrusted.example/party/Party-42",
        "https://appclip.apple.com.untrusted.example/id?partyId=Party-42",
        "https://fakeappclip.apple.com/id?partyId=Party-42",
        "http://appclip.apple.com/id?partyId=Party-42"
    ])
    func malformedOrUntrustedPartyLinksRemainRejected(raw: String) throws {
        let url = try #require(URL(string: raw))
        #expect(NativePartyPassRoute(url: url) == nil)
        #expect(BytspotPatchRoute(url: url) == nil)
        let coordinator = NativeNavigationCoordinator()
        #expect(!coordinator.handle(url: url))
        #expect(coordinator.requestedDestination == nil)
    }

    @Test(arguments: [
        "https://bytspot.app/?p=com.bytspot.app.Clip",
        "https://bytspot.app/?patch=COM.BYTSPOT.APP",
        "https://bytspot.app/?patchid=%20Com.Bytspot.App.Clip%20",
        "https://bytspot.app/p/com.bytspot.app.Clip",
        "bytspot://access/COM.BYTSPOT.APP",
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&patch=com.bytspot.app"
    ])
    func bundleIdentifiersAreNeverPatches(raw: String) throws {
        let url = try #require(URL(string: raw))
        #expect(BytspotPatchRoute(url: url) == nil)
        let coordinator = NativeNavigationCoordinator()
        #expect(!coordinator.notifyPatchScanned(url: url, source: .qr))
        #expect(coordinator.requestedDestination == nil)
        #expect(coordinator.lastScanSource == nil)
    }

    @Test(arguments: [
        "https://appclip.apple.com/id?p=com.bytspot.app.Clip&patch=BYT424",
        "https://appclip.apple.com/id?patchid=BYT424&p=com.bytspot.app.Clip",
        "https://demo.appclip.apple.com/id?P=com.bytspot.app.Clip&PATCHID=BYT424",
        "https://appclip.apple.com/p/BYT424?p=com.bytspot.app.Clip",
        "https://bytspot.app/?p=BYT424",
        "https://bytspot.com/BYT424",
        "bytspot://p/BYT424",
        "bytspot://access/BYT424",
        "bytspot://t/BYT424"
    ])
    func explicitAppleAndLegacyPatchLinksStillWork(raw: String) throws {
        let url = try #require(URL(string: raw))
        let route = try #require(BytspotPatchRoute(url: url))
        #expect(route.patchId == "BYT424")
        let coordinator = NativeNavigationCoordinator()
        #expect(coordinator.notifyPatchScanned(url: url, source: .qr))
        #expect(coordinator.requestedDestination == .patch(route))
        #expect(coordinator.requestedTab == .map)
        #expect(coordinator.lastScanSource == .qr)
    }
}

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

    @Test func cardDistanceRequiresFreshAuthorizedOriginNotCatalogText() {
        #expect(NativeM5DetailPolicy.distance(to: venue(), location: nil, authorized: true, now: referenceDate) == nil)
        #expect(NativeM5DetailPolicy.distance(to: venue(), location: location(), authorized: false, now: referenceDate) == nil)
        #expect(NativeM5DetailPolicy.distance(to: venue(), location: location(age: 61), authorized: true, now: referenceDate) == nil)
        #expect(NativeM5DetailPolicy.distance(to: venue(latitude: 0, longitude: 0), location: location(), authorized: true, now: referenceDate) == nil)
        let result = NativeM5DetailPolicy.distance(to: venue(), location: location(), authorized: true, now: referenceDate)
        #expect(result?.contains("straight-line distance") == true)
        #expect(result?.contains("invented catalog distance") == false)
    }

    @Test func rideLinksCarryOnlyExactDestinationAndProviderOwnsPickup() throws {
        let destination = NativeM2RouteDestination(venue: venue())
        for provider in NativeM2RideProvider.allCases {
            let url = try #require(destination.rideURL(for: provider))
            let parts = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
            #expect(parts.scheme == "https")
            #expect(parts.host == (provider == .uber ? "m.uber.com" : "www.lyft.com"))
            #expect(parts.fragment == nil)
            let query = Dictionary(uniqueKeysWithValues: (parts.queryItems ?? []).map { ($0.name, $0.value ?? "") })
            let prefix = provider == .uber ? "dropoff" : "destination"
            #expect(query["\(prefix)[latitude]"] == String(venue().latitude))
            #expect(query["\(prefix)[longitude]"] == String(venue().longitude))
            #expect(query["pickup[latitude]"] == nil)
            #expect(query["price"] == nil)
            #expect(query["bookingId"] == nil)
            if provider == .uber { #expect(query["dropoff[nickname]"] == venue().name) }
        }
    }

    @Test func rideLinksNeverInventMissingOrInvalidCoordinates() {
        for provider in NativeM2RideProvider.allCases {
            #expect(NativeM2RouteDestination(venue: venue(latitude: 0, longitude: 0)).rideURL(for: provider) == nil)
            #expect(NativeM2RouteDestination(venue: venue(latitude: .nan)).rideURL(for: provider) == nil)
            #expect(NativeM2RouteDestination(venue: venue(latitude: 91)).rideURL(for: provider) == nil)
        }
    }

    /// Ride is Uber and Lyft only. No unbacked provider row may reappear.
    @Test func rideOffersOnlyTheTwoConnectedProviders() {
        #expect(NativeM2RideProvider.allCases.map(\.id) == ["uber", "lyft"])
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

    @Test func appleMapsHandoffCarriesExactCoordinatesAndNameAndNeverAWebLink() throws {
        let item = try #require(NativeAppleMapsHandoff.mapItem(name: "  Tribe & Spice ", latitude: 33.787812345, longitude: -84.383298765))
        #expect(item.placemark.coordinate.latitude == 33.787812345)
        #expect(item.placemark.coordinate.longitude == -84.383298765)
        #expect(item.name == "Tribe & Spice")
        #expect(NativeAppleMapsHandoff.launchOptions[MKLaunchOptionsDirectionsModeKey] as? String == MKLaunchOptionsDirectionsModeDefault)
        for (latitude, longitude) in [(Double?.none, -84.0), (33, nil), (0, 0), (91, -84)] as [(Double?, Double?)] {
            #expect(NativeAppleMapsHandoff.mapItem(name: "X", latitude: latitude, longitude: longitude) == nil)
        }
    }

    /// Every Apple Maps hand-off goes through NativeAppleMapsHandoff, so Maps
    /// opens once at the exact spot: no maps.apple.com link that can open a
    /// Safari window too, and no name-only search.
    @Test func noScreenOpensAppleMapsThroughAWebLink() throws {
        let app = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("App")
        for file in ["NativeShellView.swift", "NativePrivateSales.swift", "BytspotAPIClient.swift", "NativePlansPanel.swift", "NativePartyArrival.swift"] {
            let source = try String(contentsOf: app.appendingPathComponent(file), encoding: .utf8)
            #expect(!source.contains("maps.apple.com/?"), "\(file) builds a maps.apple.com link")
            #expect(!source.contains("components.host = \"maps.apple.com\""), "\(file) builds a maps.apple.com link")
        }
    }

    @Test func openStatusSaysWhenItChangesInThePlacesOwnClock() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-11-23T22:00:00Z")) // 5 PM in Atlanta
        let atlanta = -300
        let open = NativeOpenStatus(isOpen: true, closesAt: now.addingTimeInterval(6 * 3600), opensAt: nil, utcOffsetMinutes: atlanta)
        #expect(open.label(now: now) == "Open · closes 11 PM")
        #expect(open.tone(now: now) == .open)
        let late = NativeOpenStatus(isOpen: true, closesAt: now.addingTimeInterval(9 * 3600 + 30 * 60), opensAt: nil, utcOffsetMinutes: atlanta)
        #expect(late.label(now: now) == "Open · closes 2:30 AM")
        let soon = NativeOpenStatus(isOpen: true, closesAt: now.addingTimeInterval(25 * 60), opensAt: nil, utcOffsetMinutes: atlanta)
        #expect(soon.label(now: now) == "Open · closes in 25 min")
        #expect(soon.tone(now: now) == .closingSoon)
        let tomorrow = NativeOpenStatus(isOpen: false, closesAt: nil, opensAt: now.addingTimeInterval(16 * 3600), utcOffsetMinutes: atlanta)
        #expect(tomorrow.label(now: now) == "Closed · opens tomorrow 9 AM")
        #expect(tomorrow.tone(now: now) == .closed)
        let later = NativeOpenStatus(isOpen: false, closesAt: nil, opensAt: now.addingTimeInterval(64 * 3600), utcOffsetMinutes: atlanta)
        #expect(later.label(now: now) == "Closed · opens Thu 9 AM")
        #expect(NativeOpenStatus.unknown.label(now: now) == "Hours unknown")
        #expect(NativeOpenStatus(isOpen: true, closesAt: nil, opensAt: nil, utcOffsetMinutes: nil).label(now: now) == "Open now")
        let stale = NativeOpenStatus(isOpen: true, closesAt: now.addingTimeInterval(-60), opensAt: nil, utcOffsetMinutes: atlanta)
        #expect(stale.label(now: now) == "Hours unknown")
        #expect(stale.tone(now: now) == .unknown)
    }

    /// Search hands a place to the map with its id only ("gp:<id>"); the status must still find it.
    @Test func openStatusFindsThePlaceFromAHandedOffID() {
        #expect(NativeOpenStatusLine.placeID(id: "gp:ChIJyYG0WRcF9YgRxdLdVY_ZAZo", googlePlaceID: nil) == "ChIJyYG0WRcF9YgRxdLdVY_ZAZo")
        #expect(NativeOpenStatusLine.placeID(id: "suggestion-gp:ChIJabc", googlePlaceID: nil) == "ChIJabc")
        #expect(NativeOpenStatusLine.placeID(id: "venue-123", googlePlaceID: "ChIJown") == "ChIJown")
        #expect(NativeOpenStatusLine.placeID(id: "venue-123", googlePlaceID: nil) == nil)
        #expect(NativeOpenStatusLine.placeID(id: "gp:bad id", googlePlaceID: nil) == nil)
    }

    @Test func detailsShowTodaysHoursLine() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/New_York"))
        let tuesday = try #require(ISO8601DateFormatter().date(from: "2026-11-24T22:00:00Z"))
        let week = ["Monday: 5:00 PM – 2:00 AM", "Tuesday: 5:00 PM – 2:00 AM", "Wednesday: Closed"]
        #expect(NativeVenueHours.todayLine(week, date: tuesday, calendar: calendar) == "Tuesday: 5:00 PM – 2:00 AM")
        #expect(NativeVenueHours.todayLine([], date: tuesday, calendar: calendar) == nil)
    }

    /// The line must be a real view before it has an answer, or its .task never runs and it never asks.
    @Test func openStatusLineIsAViewBeforeItHasAnAnswer() throws {
        let app = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("App")
        let source = try String(contentsOf: app.appendingPathComponent("NativeShellView.swift"), encoding: .utf8)
        let start = try #require(source.range(of: "struct NativeOpenStatusLine: View {"))
        let body = String(source[start.upperBound...].prefix(2000))
        let placeholder = try #require(body.range(of: "Color.clear.frame(width: 0, height: 0)"))
        let task = try #require(body.range(of: ".task(id: placeID) { await store.load([placeID]) }"))
        #expect(placeholder.lowerBound < task.lowerBound)
    }

    /// Every map card and the details screen ask by the id that survives a hand-off, not only the field.
    @Test func mapCardsAndDetailsReadThePlaceFromEitherField() throws {
        let app = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("App")
        let source = try String(contentsOf: app.appendingPathComponent("NativeShellView.swift"), encoding: .utf8)
        #expect(!source.contains("NativeOpenStatusLine(placeID: pin.venue?.googlePlaceID"))
        #expect(source.components(separatedBy: "NativeOpenStatusLine.placeID(id: pin.id, googlePlaceID: pin.venue?.googlePlaceID)").count - 1 == 4)
        #expect(source.contains("NativeOpenStatusLine.placeID(id: venue.id, googlePlaceID: venue.googlePlaceID)"))
    }

    @Test func openStatusDecodesTheServerAnswer() {
        let decoded = NativeOpenStatusDecoder.statuses(from: ["statuses": [
            ["placeId": "abc", "isOpen": true, "closesAt": "2026-11-24T04:00:00Z", "opensAt": NSNull(), "utcOffsetMinutes": -300],
            ["placeId": "def", "isOpen": NSNull(), "closesAt": NSNull(), "opensAt": NSNull(), "utcOffsetMinutes": NSNull()],
        ]])
        #expect(decoded["abc"]?.isOpen == true)
        #expect(decoded["abc"]?.closesAt == ISO8601DateFormatter().date(from: "2026-11-24T04:00:00Z"))
        #expect(decoded["abc"]?.utcOffsetMinutes == -300)
        #expect(decoded["def"] == .unknown)
    }

    @MainActor @Test func openStatusStoreAsksOncePerPlaceAndRetriesAfterAFailure() async {
        let store = NativeOpenStatusStore()
        var asked: [[String]] = []
        var fail = true
        store.fetch = { ids in
            asked.append(ids)
            if fail { throw URLError(.notConnectedToInternet) }
            return ["abc": NativeOpenStatus(isOpen: true, closesAt: nil, opensAt: nil, utcOffsetMinutes: nil)]
        }
        let now = Date()
        await store.load(["abc", "abc", nil, "bad id"], now: now)
        #expect(asked == [["abc"]])
        #expect(store.status(for: "abc") == nil)
        await store.load(["abc"], now: now.addingTimeInterval(10))
        #expect(asked.count == 1)
        fail = false
        await store.load(["abc", "xyz"], now: now.addingTimeInterval(NativeOpenStatusStore.retryAfter))
        #expect(asked.last == ["abc", "xyz"])
        #expect(store.status(for: "abc")?.isOpen == true)
        #expect(store.status(for: "xyz") == .unknown)
        await store.load(["abc"], now: now.addingTimeInterval(NativeOpenStatusStore.retryAfter + 60))
        #expect(asked.count == 2)
    }
}
