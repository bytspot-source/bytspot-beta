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
        // Use an otherwise eligible venue so the catalog exclusion is the
        // reason Check In is suppressed, not the suggestion-ID guard.
        let eligibleVenue = NativeVenueSummary(id: "venue-1", name: "Local Cafe",
            category: "coffee", address: "1 Example Street", distance: "—", rating: nil,
            latitude: 33.78, longitude: -84.38, crowd: nil,
            parking: NativeParkingSummary(totalAvailable: 0, priceLabel: "—", isKnown: false),
            verifiedPatchId: nil, imageUrl: nil)
        XCTAssertTrue(NativeVenueDetailPresentation.supportsManualCheckIn(eligibleVenue))
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: eligibleVenue, offering: nil,
            isCatalogSource: true).map(\.id), ["save", "share"])
        XCTAssertTrue(NativeM5DetailPolicy.compactActions(for: eligibleVenue).contains { $0.id == "checkIn" })
        let coffee = offering("request", kind: .coffeeSpot, category: "coffee")
        XCTAssertEqual(NativeM5DetailPolicy.compactActions(for: eligibleVenue, offering: coffee)
            .map(\.id), ["save", "share"])
        let suggestion = venue()
        XCTAssertTrue(suggestion.id.hasPrefix("suggestion-"))
        XCTAssertFalse(NativeM5DetailPolicy.compactActions(for: suggestion).contains { $0.id == "checkIn" })
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

    func testFinalM5M2CheckInIsSeparateAndUsesOnlyAuthoritativeVenueIdentity() throws {
        var place = venue()
        place.checkInVenueID = place.id
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(place), "Synthetic suggestions remain ineligible")
        let payload: [String: Any] = ["id": "real-venue", "name": "Cafe", "category": "coffee", "lat": 33.78, "lng": -84.38]
        let canonical = try XCTUnwrap(NativeTabContentStore.canonicalVenue(from: payload))
        let reference = try XCTUnwrap(NativeTabContentStore.venue(from: payload))
        XCTAssertTrue(NativeM5DetailPolicy.canValidateVisit(canonical), "Listed capability doesn't block authoritative visit validation")
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(reference))
        var mismatched = canonical
        mismatched.checkInVenueID = "other-venue"
        XCTAssertFalse(NativeM5DetailPolicy.canValidateVisit(mismatched))
        let shell = try shellSource()
        XCTAssertTrue(shell.contains("NativeVenueCheckInChip(venue: venue"))
        let chip = try region(in: shell, from: "private struct NativeVenueCheckInChip", to: "private struct NativeVenueVibeSheet")
        XCTAssertTrue(chip.contains("state.isConfirmed"))
        XCTAssertTrue(chip.contains("NativeVenueVisitLocation.freshCoordinate"))
        XCTAssertTrue(chip.contains("visits.submit(context:"))
        XCTAssertFalse(chip.contains("NativeManualCheckInStore.record"))
        let submit = try region(in: shell, from: "    private func submitCheckIn() async {", to: "    private func detailActionTitle(")
        XCTAssertFalse(submit.contains("NativeManualCheckInStore.record"))
        XCTAssertFalse(submit.contains("didCheckIn = true"))
    }

    func testFinalDetailUtilitiesVibeAndTransactionsAreSuppliedAndSeparate() throws {
        let shell = try shellSource()
        let detail = try region(in: shell, from: "private struct NativeVenueDetailView: View {", to: "private struct NativeEventRideBookingSheet: View {")
        let rendered = try region(in: detail, from: "    private var placeHeader: some View {", to: "    private func performPlacePrimaryAction() {")
        for optional in ["details?.phoneURL", "details?.menuURL", "details?.websiteURL", "details?.vibeVideoURL"] {
            XCTAssertTrue(rendered.contains(optional), optional)
        }
        XCTAssertTrue(rendered.contains("showVibe = true"))
        XCTAssertTrue(rendered.contains("heroControl(\"Back\""))
        XCTAssertTrue(rendered.contains("NativeM2ArrivalModule(venue: venue"))
        XCTAssertTrue(rendered.contains("currentTransaction?.primaryTitle"))
        XCTAssertTrue(detail.contains("requestStatusReady && currentTransaction == nil"))
        XCTAssertFalse(rendered.contains("PartnerMenu.sample"))
        XCTAssertFalse(rendered.contains("startParkingCheckout"))
        let player = try region(in: shell, from: "private struct NativeVenueVibeSheet", to: "private struct NativeDiscoverPlanDestination")
        XCTAssertTrue(player.contains("Recorded Vibe · not live"))
        XCTAssertTrue(player.contains("player?.pause()"))
    }

    func testDistanceDoesNotPromoteMarketingTextAndSaveIsAccountScoped() throws {
        for raw in ["", "—", "Dining", "Stay", "Near you", "3 min walk"] {
            XCTAssertNil(NativeM5DetailPolicy.distance(raw))
        }
        XCTAssertEqual(NativeM5DetailPolicy.distance("0.4 mi"), "0.4 mi")
        XCTAssertEqual(NativeM5DetailPolicy.distance("Here"), "Here")
        let name = "NativeVenueSavedStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        XCTAssertTrue(NativeVenueSavedState.toggle(venueID: "venue", userID: "one", defaults: defaults))
        XCTAssertTrue(NativeVenueSavedState.contains(venueID: "venue", userID: "one", defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.contains(venueID: "venue", userID: "two", defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.contains(venueID: "venue", userID: nil, defaults: defaults))
        XCTAssertFalse(NativeVenueSavedState.toggle(venueID: "venue", userID: "one", defaults: defaults))
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

@MainActor
final class NativeDiscoverTransactionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 2_000_000_000)

    private func offering(sourceID: String = "spot-1", kind: NativePlanBookableSelection.SourceKind = .coffeeSpot,
                          capability: String = "request") -> NativePlanBookableOffering {
        .init(id: "catalog-1", sourceKind: kind, sourceId: sourceID, category: "coffee",
              title: "Same cafe title", subtitle: nil, capability: capability)
    }

    private func item(spotID: String? = "spot-1", reservationID: String? = "reservation-1",
                      status: String = "pending", reservationStatus: String? = "pending",
                      expiry: String? = nil, hasReservation: Bool = true) -> NativePlan.Item {
        .init(id: "item-1", needKind: "coffee", title: "Same cafe title", partyId: nil,
              coffeeReservationId: reservationID, coffeeSpotId: spotID, selectionKey: "coffeeSpot:spot-1",
              booked: true, capability: "request", status: status,
              reservation: hasReservation ? .init(holdExpiresAt: expiry, status: reservationStatus) : nil)
    }

    private func plan(_ items: [NativePlan.Item], id: String = "plan-1", creator: String = "user-1") -> NativePlan {
        .init(id: id, title: "Coffee Plan", intent: "Coffee", creatorUserId: creator,
              startsAt: nil, endsAt: nil, areaLabel: nil, partySize: nil, needs: ["coffee"],
              lifecycle: "confirmed", state: "booked",
              readiness: .init(going: 1, maybe: 0, pending: 0, declined: 0, total: 1), openNeeds: [],
              participants: [.init(userId: "user-1", role: "guest", status: "accepted")], items: items,
              joinToken: nil)
    }

    private func project(_ plans: [NativePlan], offering: NativePlanBookableOffering? = nil,
                         userID: String? = "user-1") -> NativeDiscoverTransaction? {
        NativeDiscoverTransaction.transaction(for: offering ?? self.offering(), plans: plans, userID: userID, now: now)
    }

    func testExactSourceAndRealReservationContinueToExistingPlan() throws {
        let transaction = try XCTUnwrap(project([plan([item()])]))
        XCTAssertEqual(transaction.planID, "plan-1")
        XCTAssertEqual(transaction.planTitle, "Coffee Plan")
        XCTAssertEqual(transaction.reservationID, "reservation-1")
        XCTAssertEqual(transaction.statusLabel, "Requested")
        XCTAssertEqual(transaction.primaryTitle, "View request")
        XCTAssertTrue(transaction.detail.contains("subject to host acceptance"))
    }

    func testTitlesSelectionKeysAndReservationIDsCannotSubstituteForExactSource() {
        // Every row keeps the same title and matching selectionKey; none has
        // the exact source identity required to continue this offering.
        for spotID in [nil, "spot-2", "SPOT-1", " spot-1", "spot-1 "] as [String?] {
            XCTAssertNil(project([plan([item(spotID: spotID)])]))
        }
        XCTAssertNil(project([plan([item(spotID: nil, reservationID: "spot-1")])]))
        XCTAssertNil(project([plan([item()])], offering: offering(sourceID: "spot-2")))
    }

    func testBareSelectionReferenceAndMissingReservationSummaryNeverProject() {
        for reservationID in [nil, "", "  "] as [String?] {
            XCTAssertNil(project([plan([item(reservationID: reservationID)])]))
        }
        XCTAssertNil(project([plan([item(hasReservation: false)])]))
        XCTAssertNil(project([plan([item(spotID: nil, reservationID: nil, hasReservation: false)])]))
    }

    func testUnsupportedOfferingsNeverInventTransactions() {
        for capability in ["book", "details", "redirect"] {
            XCTAssertNil(project([plan([item()])], offering: offering(capability: capability)))
        }
        XCTAssertNil(project([plan([item()])], offering: offering(kind: .party)))
        XCTAssertNil(project([plan([item(spotID: "")])], offering: offering(sourceID: "")))
    }

    func testAcceptedAndConfirmedHoldsAreRequestedNotPaidOrBooked() throws {
        for status in ["pending", "accepted", "confirmed"] {
            let transaction = try XCTUnwrap(project([plan([item(status: "booked", reservationStatus: status)])]))
            // Both Plan.state and item.booked deliberately claim booked in
            // the fixture. Neither can promote a coffee hold into payment.
            XCTAssertEqual(transaction.statusLabel, "Requested")
            XCTAssertEqual(transaction.primaryTitle, "View request")
            XCTAssertNotEqual(transaction.statusLabel, "Booked")
            if status != "pending" {
                XCTAssertTrue(transaction.detail.contains("not a paid booking confirmation"))
            }
        }
    }

    func testTerminalReservationAndItemStatusesUseDetails() throws {
        for (status, label) in [("expired", "Expired"), ("cancelled", "Cancelled"), ("declined", "Declined")] {
            for row in [item(reservationStatus: status), item(status: status)] {
                let transaction = try XCTUnwrap(project([plan([row])]))
                XCTAssertEqual(transaction.statusLabel, label)
                XCTAssertEqual(transaction.primaryTitle, "View details")
            }
        }
    }

    func testPendingHoldExpiryUsesActualWindowIncludingBoundaryAndFractionalSeconds() throws {
        let formatter = ISO8601DateFormatter()
        let formats: [ISO8601DateFormatter.Options] = [.withInternetDateTime, [.withInternetDateTime, .withFractionalSeconds]]
        for options in formats {
            formatter.formatOptions = options
            for interval in [-1, 0, 1] as [TimeInterval] {
                let expiry = formatter.string(from: now.addingTimeInterval(interval))
                let transaction = try XCTUnwrap(project([plan([item(expiry: expiry)])]))
                XCTAssertEqual(transaction.statusLabel, interval <= 0 ? "Expired" : "Requested")
            }
        }
        // Confirmed supply is not expired just because the old pending hold
        // window passed. Only a terminal status can end an accepted hold.
        XCTAssertEqual(project([plan([item(reservationStatus: "confirmed", expiry: "2000-01-01T00:00:00Z")])])?.statusLabel, "Requested")
        XCTAssertEqual(project([plan([item(expiry: "invalid-date")])])?.statusLabel, "Requested")
    }

    func testUnknownReservationStatusDoesNotClaimRequestedOrAllowNewAcquisition() {
        for status in [nil, "future-status"] as [String?] {
            let transaction = project([plan([item(reservationStatus: status)])])
            XCTAssertEqual(transaction?.statusLabel, "Status unavailable")
            XCTAssertEqual(transaction?.primaryTitle, "View details")
        }
    }

    func testGuestMembershipAndAnonymousUsersDoNotOwnCreatorsRequest() {
        XCTAssertNil(project([plan([item()], creator: "other-user")]))
        XCTAssertNil(project([plan([item()])], userID: nil))
        XCTAssertNil(project([plan([item()])], userID: ""))
        XCTAssertNil(project([plan([item()])], userID: "user-2"))
    }

    func testLiveRequestWinsOverHistoricalTerminalRequest() {
        let historical = plan([item(reservationStatus: "expired")], id: "old-plan")
        let live = plan([item()], id: "live-plan")
        XCTAssertEqual(project([historical, live])?.planID, "live-plan")
        XCTAssertEqual(project([live, historical])?.planID, "live-plan")
    }

    func testStoreDistinguishesInitialLoadingFailureAndSuccessfulEmptyState() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        XCTAssertFalse(store.hasLoaded)
        XCTAssertFalse(store.isLoading)
        XCTAssertFalse(store.failed)
        await store.refresh(userID: "user-1", load: {
            XCTAssertTrue(store.isLoading)
            XCTAssertFalse(store.hasLoaded)
            throw TestFailure.unavailable
        })
        XCTAssertTrue(store.failed)
        XCTAssertFalse(store.isLoading)
        XCTAssertFalse(store.hasLoaded)
        await store.refresh(userID: "user-1", load: { [] })
        XCTAssertTrue(store.hasLoaded)
        XCTAssertFalse(store.failed)
        XCTAssertFalse(store.isLoading)
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
    }

    func testStoreScopesRowsResetsAccountAndDoesNotLoadWhenSignedOut() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "user-1")
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()], creator: "other-user")] })
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
        await store.refresh(userID: "user-1", load: { [self.plan([self.item()])] })
        XCTAssertNotNil(store.transaction(for: offering(), userID: "user-1"))
        XCTAssertNil(store.transaction(for: offering(), userID: "other-user"))
        store.synchronize(userID: "user-1")
        XCTAssertTrue(store.hasLoaded)
        store.synchronize(userID: "user-1", forceReset: true)
        XCTAssertFalse(store.hasLoaded)
        XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
        store.synchronize(userID: nil)
        await store.refresh(userID: nil, load: { XCTFail("Signed-out refresh must not load Plans"); return [] })
        XCTAssertNil(store.userID)
        XCTAssertFalse(store.hasLoaded)
    }

    func testConcurrentRefreshCannotReplaceNewerRowsOrReportStaleFailure() async {
        for shouldFail in [false, true] {
            let store = NativeDiscoverTransactionStore()
            let suspended = SuspendedLoad()
            let old = await startRefresh(store, userID: "user-1", suspended: suspended)
            await store.refresh(userID: "user-1", load: { [self.plan([self.item()], id: "new-plan")] })
            suspended.finish(shouldFail ? .failure(TestFailure.unavailable) : .success([plan([item()], id: "stale-plan")]))
            await old.value
            XCTAssertEqual(store.transaction(for: offering(), userID: "user-1")?.planID, "new-plan")
            XCTAssertFalse(store.isLoading)
            XCTAssertFalse(store.failed)
            XCTAssertTrue(store.hasLoaded)
        }
    }

    func testAccountRoundTripAndForceResetInvalidateInFlightRefresh() async {
        for changeAccount in [true, false] {
            let store = NativeDiscoverTransactionStore()
            let suspended = SuspendedLoad()
            let old = await startRefresh(store, userID: "user-1", suspended: suspended)
            if changeAccount {
                store.synchronize(userID: "user-2")
                store.synchronize(userID: "user-1")
            } else {
                store.synchronize(userID: "user-1", forceReset: true)
            }
            suspended.finish(.success([plan([item()])]))
            await old.value
            XCTAssertNil(store.transaction(for: offering(), userID: "user-1"))
            XCTAssertFalse(store.hasLoaded)
            XCTAssertFalse(store.isLoading)
            XCTAssertFalse(store.failed)
        }
    }

    func testQueuedOldAccountRefreshCannotRestoreAnotherUsersState() async {
        let store = NativeDiscoverTransactionStore()
        store.synchronize(userID: "new-user")
        await store.refresh(userID: "old-user", load: {
            XCTFail("A queued request for another account must not execute")
            return []
        })
        XCTAssertEqual(store.userID, "new-user")
        XCTAssertFalse(store.hasLoaded)
    }

    private enum TestFailure: Error { case unavailable }

    @MainActor
    private final class SuspendedLoad {
        var onStart: (() -> Void)?
        private var continuation: CheckedContinuation<[NativePlan], Error>?
        func load() async throws -> [NativePlan] {
            try await withCheckedThrowingContinuation {
                continuation = $0
                onStart?()
            }
        }
        func finish(_ result: Result<[NativePlan], Error>) {
            continuation?.resume(with: result)
            continuation = nil
        }
    }

    private func startRefresh(_ store: NativeDiscoverTransactionStore, userID: String,
                              suspended: SuspendedLoad) async -> Task<Void, Never> {
        store.synchronize(userID: userID)
        return await withCheckedContinuation { started in
            let task = Task { await store.refresh(userID: userID, load: { try await suspended.load() }) }
            suspended.onStart = { started.resume(returning: task) }
        }
    }
}
