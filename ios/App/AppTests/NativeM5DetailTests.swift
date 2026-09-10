import XCTest
@testable import App

@MainActor
final class NativeM5DetailTests: XCTestCase {
    private func offering(_ capability: String, kind: NativePlanBookableSelection.SourceKind = .party,
                          category: String = "events") -> NativePlanBookableOffering {
        .init(id: "catalog-1", sourceKind: kind, sourceId: "source-1", category: category,
              title: "Premium Live Confirmed", subtitle: nil, capability: capability)
    }

    private func venue(category: String = "coffee", address: String = "") -> NativeVenueSummary {
        NativeLocationAwareUIContent.unresolvedVenue(id: "place-1", name: "Place",
            category: category, address: address, distance: "—", imageURL: nil)
    }

    func testGlobalHeaderKeepsMapAndBackOnLeftProfileOnRight() throws {
        let shell = try shellSource()
        let header = try region(in: shell, from: "    @ViewBuilder private var shellNavigationRow: some View {",
                                to: "    static func showsGlobalHeaderControls")
        let map = try XCTUnwrap(header.range(of: "native-global-map-button"))
        let back = try XCTUnwrap(header.range(of: "native-map-back-button"))
        let profile = try XCTUnwrap(header.range(of: "native-global-profile-avatar"))
        XCTAssertLessThan(map.lowerBound, profile.lowerBound)
        XCTAssertLessThan(back.lowerBound, profile.lowerBound)
        XCTAssertTrue(header.contains("commitSelectedTab(mapReturnTab)"))
        XCTAssertTrue(header.contains("openNativeProfile(panel: nil)"))
    }

    func testListedDefaultsToRouteAndAddToPlanWithoutControl() {
        let listed = NativeDiscoverBookablePresentation()
        XCTAssertEqual(listed.statusLabel, "Listed")
        XCTAssertEqual(listed.capability, .details)
        XCTAssertNil(listed.actionHex)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: listed), .route)
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: listed), "Route")
        XCTAssertEqual(NativeM5DetailPolicy.addToPlanTitle, "Add to Plan")
        XCTAssertTrue(listed.availabilityLine.contains("does not control"))
        XCTAssertTrue(NativeM5DetailPolicy.planDisclaimer.contains("does not book or request"))
    }

    func testPartyNeverBecomesBookOrRequestForAnyRail() {
        for rail in NativeDiscoverBookablePresentation.railTokens {
            for capability in ["book", "request", "redirect", "details"] {
                let party = offering(capability, category: rail)
                let presentation = NativeDiscoverBookablePresentation(offering: party,
                    externalURL: URL(string: "https://tickets.example.com/event/1"), externalProvider: "Tickets")
                XCTAssertEqual(presentation.capability, .details)
                XCTAssertEqual(presentation.statusLabel, "Listed")
                XCTAssertNil(presentation.primaryActionTitle)
                XCTAssertNil(NativeDiscoverBrowsePolicy.executableActionTitle(offering: party))
                XCTAssertNotNil(NativeDiscoverBrowsePolicy.partyRoute(offering: party))
            }
        }
    }

    func testNoCurrentCatalogKindUnlocksControlledBooking() {
        let kinds: [NativePlanBookableSelection.SourceKind] = [.coffeeSpot, .party]
        for kind in kinds {
            let presentation = NativeDiscoverBookablePresentation(offering: offering("book", kind: kind))
            XCTAssertEqual(presentation.capability, .details)
            XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: presentation), .route)
        }
    }

    func testOnlyExactCoffeeRequestGetsSupportedRequestAction() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let presentation = NativeDiscoverBookablePresentation(offering: coffee)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: presentation), .requestCoffee)
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: presentation), "Request")
        XCTAssertEqual(presentation.availabilityLine, "Subject to host acceptance")
        XCTAssertEqual(presentation.actionHex, 0x00BFFF)
        XCTAssertEqual(NativeDiscoverBrowsePolicy.executableActionTitle(offering: coffee), "Request")
    }

    func testExternalRequiresExplicitNamedValidatedHandoff() throws {
        let url = try XCTUnwrap(URL(string: "https://provider.example.com/booking/1"))
        let external = NativeDiscoverBookablePresentation(externalURL: url, externalProvider: "Example Provider")
        XCTAssertEqual(external.statusLabel, "External")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: external), .external(url))
        XCTAssertEqual(NativeM5DetailPolicy.primaryTitle(for: external), "Book on Example Provider ↗")
        XCTAssertNil(external.actionHex)
        XCTAssertTrue(external.availabilityLine.contains("not Bytspot"))
        let unnamed = NativeDiscoverBookablePresentation(externalURL: url)
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: unnamed), .route)
        let insecure = NativeDiscoverBookablePresentation(externalURL: URL(string: "http://provider.example.com"), externalProvider: "Example Provider")
        XCTAssertEqual(NativeM5DetailPolicy.primaryAction(for: insecure), .route)
    }

    func testCategoryNeverInventsFulfillmentOrVerifiedHours() throws {
        let legacyTicketAction = try XCTUnwrap(NativeVenueDetailContract.actions.first { $0.id == "getTickets" })
        for rail in NativeDiscoverBookablePresentation.railTokens {
            let place = venue(category: rail)
            let section = try XCTUnwrap(NativeVenueDetailPresentation.detailSection(for: place))
            XCTAssertEqual(section.highlights, ["Route", "Add to Plan"])
            XCTAssertEqual(NativeVenueDetailPresentation.actionTitle(for: legacyTicketAction, venue: place), "Details")
            let actionIDs = NativeM5DetailPolicy.compactActions(for: place).map(\.id)
            XCTAssertTrue(Set(actionIDs).isSubset(of: ["save", "share", "checkIn"]))
            XCTAssertFalse(NativeVenueHours.hasVerifiedHours(for: rail))
            let hours = NativeVenueHours.openStatus(category: rail, hour: 12, minute: 0, weekday: 3)
            XCTAssertEqual(hours.label, "Hours unknown")
            XCTAssertFalse(hours.isOpen)
        }
    }

    func testMissingPlaceFactsAreUnknownAndNoCoordinateIsInvented() {
        let place = venue()
        XCTAssertEqual(NativeM5DetailPolicy.address(for: place), "Address not provided")
        XCTAssertEqual(NativeM5DetailPolicy.activity(for: place), NativeM5DetailPolicy.activityUnknown)
        let route = NativeM2RouteDestination(venue: place)
        XCTAssertNil(route.point)
        XCTAssertNil(route.directionsURL(for: .apple))
        XCTAssertNil(route.directionsURL(for: .google))
    }

    func testCatalogOfferingCannotCheckInUsingSourceID() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: venue(), offering: coffee).map(\.id), ["save", "share"])
    }

    func testInvalidatedCatalogOfferingDoesNotBecomeACheckInVenue() {
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: venue(), offering: nil,
            isCatalogSource: true).map(\.id), ["save", "share"])
        XCTAssertTrue(NativeM5DetailPolicy.compactActions(for: venue()).contains { $0.id == "checkIn" })
    }

    func testAdaptiveActionRowsRemainCompatibleWithIOS15() throws {
        let shell = try shellSource()
        let card = try region(in: shell, from: "private struct NativeDiscoverFeatureCard: View {",
                              to: "private struct NativeSpecialDiscoverCard: View {")
        let detail = try region(in: shell, from: "    private var placeBottomActions: some View {",
                                to: "    private func placeButton(")
        for (surface, buttons) in [(card, "cardActionButtons"), (detail, "placeActionButtons")] {
            for unsupportedAPI in ["AnyLayout(", "HStackLayout(", "VStackLayout("] {
                XCTAssertFalse(surface.contains(unsupportedAPI))
            }
            XCTAssertTrue(surface.contains("dynamicTypeSize.isAccessibilitySize"))
            XCTAssertTrue(surface.contains("VStack(spacing: 8) { \(buttons) }"))
            XCTAssertTrue(surface.contains("HStack(spacing: 8) { \(buttons) }"))
        }
        XCTAssertTrue(shell.contains("compactActions(for: venue, offering: exactOffering, isCatalogSource: offering != nil)"))
    }

    func testCoffeeContinuationRequiresSuccessfulExactAddAndRunsOnce() throws {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let selection = NativeDiscoverPlanSelection(title: coffee.title, needKind: coffee.category, offering: coffee)
        var intent = NativeDiscoverPlanIntent()
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: UUID(), userID: "user-1"))
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-2"))
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertFalse(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        let next = try XCTUnwrap(intent.takeCoffeeRequest(userID: "user-1"))
        XCTAssertEqual(next.spotID, coffee.sourceId)
        XCTAssertEqual(next.planID, "plan-1")
        XCTAssertEqual(next.userID, "user-1")
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
    }

    func testCancellationNormalPlanAddAndAccountSwapNeverRequest() {
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        let selection = NativeDiscoverPlanSelection(title: coffee.title, needKind: coffee.category, offering: coffee)
        var intent = NativeDiscoverPlanIntent()
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
        intent.begin(selection: selection, userID: "user-1", requestCoffee: false)
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
        intent.begin(selection: selection, userID: "user-1", requestCoffee: true)
        XCTAssertTrue(intent.acceptAdded(planID: "plan-1", selectionID: selection.id, userID: "user-1"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-2"))
        XCTAssertNil(intent.takeCoffeeRequest(userID: "user-1"))
    }

    // Source wiring regressions supplement pure policy tests; simulator smoke
    // coverage must still tap both entry points and test accessibility sizes.
    func testCardAndDetailRouteThroughSheetRatherThanImmediateMaps() throws {
        let shell = try shellSource()
        let discover = try region(in: shell, from: "private struct NativeDiscoverView: View {", to: "private struct NativeDiscoverFilterChip: View {")
        XCTAssertTrue(discover.contains(".sheet(item: $routeVenue)"))
        XCTAssertTrue(discover.contains("NativeM2RouteSheet(venue: venue)"))
        XCTAssertTrue(discover.contains("case .route: routeVenue = venueForDetail(card)"))
        XCTAssertTrue(discover.contains("detailVenue = venueForDetail(card)"))
        XCTAssertFalse(discover.contains("openDirectRoute("))
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {", to: "private struct NativeEventRideBookingSheet: View {")
        XCTAssertTrue(detail.contains(".sheet(isPresented: $showRoute) { NativeM2RouteSheet(venue: venue) }"))
        XCTAssertTrue(detail.contains("case .route: showRoute = true"))
        XCTAssertFalse(detail.contains("NativeMapFocusHandoff.store"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showParkingBooking)"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showStayBooking)"))
        XCTAssertFalse(detail.contains(".sheet(isPresented: $showPartnerMenu)"))
        XCTAssertTrue(detail.contains("var offering: NativePlanBookableOffering? = nil"))
        XCTAssertTrue(detail.contains("var externalURL: URL? = nil"))
        XCTAssertTrue(detail.contains("safeAreaInset(edge: .bottom"))
    }

    func testRenderedDetailUsesActualMediaAndSafeDynamicTypeSurface() throws {
        let shell = try shellSource()
        let surface = try region(in: shell, from: "    private var placeHeader: some View {", to: "    private func performPlacePrimaryAction() {")
        XCTAssertTrue(surface.contains("if let url = venue.imageUrl"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.address(for: venue)"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.hoursUnknown"))
        XCTAssertTrue(surface.contains("NativeM5DetailPolicy.activity(for: venue)"))
        XCTAssertFalse(surface.contains("unsplash"))
        XCTAssertFalse(surface.contains("minimumScaleFactor"))
        XCTAssertFalse(surface.contains("lineLimit(1)"))
        XCTAssertFalse(surface.contains("Free entry"))
        XCTAssertFalse(surface.contains("4.9"))
        XCTAssertTrue(surface.contains("minHeight: 44"))
    }

    private func shellSource() throws -> String {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("App/NativeShellView.swift")
        return try String(contentsOf: path, encoding: .utf8)
    }

    private func region(in source: String, from start: String, to end: String) throws -> String {
        let begin = try XCTUnwrap(source.range(of: start))
        let finish = try XCTUnwrap(source.range(of: end, range: begin.upperBound..<source.endIndex))
        return String(source[begin.lowerBound..<finish.lowerBound])
    }
}
