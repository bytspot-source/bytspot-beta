import XCTest
@testable import App

/// Asking venues to fill a gap in a Plan.
///
/// Most of what matters here is what the client refuses to invent: it does not
/// decide which needs can be asked about, and it does not translate a refusal
/// into a friendlier lie.
final class NativePlanDemandTests: XCTestCase {
    private func ask(
        id: String = "demand-1",
        state: String = "OPEN",
        category: String = "dining",
        planId: String? = "plan-1",
        offers: [NativePlanDemandOffer] = [],
    ) -> NativePlanDemandAsk {
        NativePlanDemandAsk(
            id: id,
            state: state,
            category: category,
            partySize: 4,
            planId: planId,
            expiresAt: "2026-09-20T02:00:00.000Z",
            offers: offers,
        )
    }

    private func offer(id: String = "offer-1") -> NativePlanDemandOffer {
        NativePlanDemandOffer(
            id: id,
            where: "Broni Home Taste",
            startsAt: "2026-09-19T23:00:00.000Z",
            durationMins: 90,
            priceCents: 5000,
            terms: nil,
            holdExpiresAt: "2026-09-19T22:00:00.000Z",
        )
    }

    // MARK: - What the guest is told while waiting

    func testWaitingNeverReadsAsProgressTowardABooking() {
        XCTAssertEqual(ask(state: "OPEN").status, "Waiting")
        // MATCHED means a venue that could answer has seen it. It does not mean
        // anyone intends to, and must not imply a table is coming.
        XCTAssertEqual(ask(state: "MATCHED").status, "Venues can see this")
    }

    func testOffersAreCountedPlainly() {
        XCTAssertEqual(ask(state: "OFFERED", offers: [offer()]).status, "1 offer")
        XCTAssertEqual(ask(state: "OFFERED", offers: [offer(), offer(id: "offer-2")]).status, "2 offers")
    }

    // MARK: - Reading asks back

    func testAnAskIsRecognisedAsBelongingToTheNeedThatRaisedIt() {
        var state = NativePlanDemandState()
        state.adopt([ask(category: "dining")], planID: "plan-1", needs: ["dining", "coffee"])
        XCTAssertEqual(state.asks["dining"]?.id, "demand-1")
        XCTAssertNil(state.asks["coffee"])
    }

    func testAsksRaisedByAnotherPlanAreNotShownOnThisOne() {
        var state = NativePlanDemandState()
        state.adopt([ask(planId: "plan-2")], planID: "plan-1", needs: ["dining"])
        XCTAssertTrue(state.asks.isEmpty)
    }

    func testAnUnrecognisedCategoryCostsAStatusLineAndNothingMore() {
        // A pair the client does not know must never be attached to the wrong
        // need: losing the status line is the safe failure.
        var state = NativePlanDemandState()
        state.adopt([ask(category: "parking")], planID: "plan-1", needs: ["dining"])
        XCTAssertTrue(state.asks.isEmpty)
    }

    func testEveryPairTheClientKnowsMatchesTheNeedItCameFrom() {
        for (need, category) in NativePlanDemandCategory.pairs {
            XCTAssertTrue(NativePlanDemandCategory.matches(need: need, category: category))
            XCTAssertFalse(NativePlanDemandCategory.matches(need: need, category: "parking"))
        }
    }

    // MARK: - Refusals

    func testTheServersRefusalIsShownAsSentBecauseItNamesWhatToFix() {
        let body = #"{"error":{"message":"Say how many people are coming first.","code":-32600}}"#
        let error = BytspotAPIClient.APIError.server(status: 400, body: body)
        XCTAssertEqual(NativePlanDemandFailure.message(for: error), "Say how many people are coming first.")
    }

    func testATransportFailureDoesNotBlameThePlan() {
        struct Offline: Error {}
        // "Add a time to the plan" would be a guess, and a wrong one.
        XCTAssertEqual(NativePlanDemandFailure.message(for: Offline()), "Couldn't reach Bytspot. Try again.")
    }

    func testAServerErrorWithNothingToSayStillSaysSomethingTrue() {
        let error = BytspotAPIClient.APIError.server(status: 500, body: "<html>oops</html>")
        XCTAssertEqual(NativePlanDemandFailure.message(for: error), "Couldn't ask right now. Try again.")
    }

    // MARK: - State transitions

    func testRecordingAnAskClearsTheRefusalItReplaces() {
        var state = NativePlanDemandState()
        state.asking = "dining"
        state.refuse("Add a time to the plan first.", for: "dining")
        XCTAssertNil(state.asking)
        XCTAssertEqual(state.refusal["dining"], "Add a time to the plan first.")

        state.asking = "dining"
        state.record(ask(), for: "dining")
        XCTAssertNil(state.refusal["dining"] ?? nil)
        XCTAssertNil(state.asking)
        XCTAssertEqual(state.asks["dining"]?.id, "demand-1")
    }

    func testARefusalOnOneNeedDoesNotMarkAnother() {
        var state = NativePlanDemandState()
        state.refuse("We cannot ask vendors for that yet.", for: "automotive")
        XCTAssertNil(state.refusal["dining"] ?? nil)
    }

    // MARK: - Contract with the server

    func testTheClientDoesNotDecideWhichNeedsCanBeAsked() throws {
        // The vendor vocabulary is the server's to own. A second copy here
        // would drift, so the client must not gate the button on its own map.
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("App/NativePlansPanel.swift"),
            encoding: .utf8,
        )
        let askRow = try XCTUnwrap(source.range(of: "private func askRow("))
        let body = String(source[askRow.lowerBound...].prefix(2000))
        XCTAssertFalse(
            body.contains("NativePlanDemandCategory"),
            "askRow must not gate on the client's copy of the vendor vocabulary",
        )
    }
}

// MARK: - Offers

/// An offer is a held table with a price and a deadline. Everything below is
/// about not overstating any of those three.
final class NativePlanOfferTests: XCTestCase {
    private func offer(
        id: String = "offer-1",
        priceCents: Int = 5000,
        holdExpiresAt: String,
        accepted: Bool = false
    ) -> NativePlanDemandOffer {
        NativePlanDemandOffer(
            id: id, where: "Broni Home Taste", startsAt: "2026-09-20T23:30:00.000Z", durationMins: 90,
            priceCents: priceCents, terms: nil, holdExpiresAt: holdExpiresAt, accepted: accepted
        )
    }

    private let now = ISO8601DateFormatter().date(from: "2026-09-19T20:00:00Z")!

    func testAHoldThatHasLapsedIsNotLiveAndSaysSo() {
        let lapsed = offer(holdExpiresAt: "2026-09-19T19:59:00.000Z")
        XCTAssertFalse(lapsed.isLive(now: now), "an expired hold must not present an Accept button")
        XCTAssertEqual(lapsed.hold(now: now), "Hold expired")

        // Exactly at the boundary is gone, not nearly gone: the server would
        // refuse it, so the button must not be offered.
        let boundary = offer(holdExpiresAt: "2026-09-19T20:00:00.000Z")
        XCTAssertFalse(boundary.isLive(now: now))
    }

    func testHoldCountsInTheUnitTheGuestNeeds() {
        XCTAssertEqual(offer(holdExpiresAt: "2026-09-19T20:25:00.000Z").hold(now: now), "Held for 25 min")
        XCTAssertEqual(offer(holdExpiresAt: "2026-09-19T21:00:00.000Z").hold(now: now), "Held for 1 hr")
        XCTAssertEqual(offer(holdExpiresAt: "2026-09-19T23:00:00.000Z").hold(now: now), "Held for 3 hrs")
        // Never a countdown that keeps ticking below a minute.
        XCTAssertEqual(offer(holdExpiresAt: "2026-09-19T20:00:30.000Z").hold(now: now), "Held for under a minute")
    }

    func testPriceReadsAsAPriceNotAForm() {
        XCTAssertEqual(offer(priceCents: 5000, holdExpiresAt: "2026-09-19T21:00:00.000Z").price, "$50")
        XCTAssertEqual(offer(priceCents: 4250, holdExpiresAt: "2026-09-19T21:00:00.000Z").price, "$42.50")
        XCTAssertEqual(offer(priceCents: 0, holdExpiresAt: "2026-09-19T21:00:00.000Z").price, "$0")
    }

    func testAnUnreadableTimeIsAdmittedRatherThanInvented() {
        let broken = NativePlanDemandOffer(
            id: "x", where: "Somewhere", startsAt: "not a date", durationMins: 60,
            priceCents: 1000, terms: nil, holdExpiresAt: "also not a date"
        )
        XCTAssertEqual(broken.when, "Time to confirm")
        XCTAssertEqual(broken.hold(now: now), "Hold time unknown")
        // A hold that cannot be read is not treated as valid.
        XCTAssertFalse(broken.isLive(now: now))
    }

    private func ask(offers: [NativePlanDemandOffer], state: String = "OFFERED") -> NativePlanDemandAsk {
        NativePlanDemandAsk(id: "demand-1", state: state, category: "dining", partySize: 2,
                            planId: "plan-1", expiresAt: "2026-09-20T00:00:00.000Z", offers: offers)
    }

    func testTakenTableReadsAsBookedRatherThanAsAnotherOffer() {
        let waiting = ask(offers: [offer(holdExpiresAt: "2026-09-19T21:00:00.000Z")])
        XCTAssertEqual(waiting.status, "1 offer")
        XCTAssertNil(waiting.booked)

        let held = ask(offers: [offer(holdExpiresAt: "2026-09-19T21:00:00.000Z", accepted: true)], state: "BOOKED")
        XCTAssertNotNil(held.booked, "the offer the guest took must be identifiable")
        XCTAssertTrue(held.status.hasPrefix("Booked"), "a held table must not read as an offer still to weigh")
    }

    func testVenuesSeeingAnAskIsNotProgressTowardABooking() {
        // MATCHED means a venue could answer, not that anyone intends to.
        XCTAssertEqual(ask(offers: [], state: "MATCHED").status, "Venues can see this")
        XCTAssertEqual(ask(offers: [], state: "OPEN").status, "Waiting")
    }
}

/// Decoding against a server that has not shipped the field yet.
final class NativePlanOfferDecodingTests: XCTestCase {
    /// The iOS app and the API deploy separately, so the client must read a
    /// response written before `accepted` existed. A property default does not
    /// do this: the synthesized decoder would throw, and `mine()` reads through
    /// `try?`, so the guest would lose every ask without being told why.
    func testAnOfferFromAServerWithoutTheAcceptedFieldStillDecodes() throws {
        let json = """
        {"id":"offer-1","where":"Broni Home Taste","startsAt":"2026-09-20T23:30:00.000Z",
         "durationMins":90,"priceCents":5000,"holdExpiresAt":"2026-09-19T21:00:00.000Z"}
        """.data(using: .utf8)!

        let offer = try JSONDecoder().decode(NativePlanDemandOffer.self, from: json)
        XCTAssertEqual(offer.id, "offer-1")
        XCTAssertNil(offer.terms)
        // Absent must mean not accepted: showing a table as choosable is
        // recoverable, claiming one is held is not.
        XCTAssertFalse(offer.accepted)
    }

    func testAWholeAskDecodesWhenNoOfferCarriesTheField() throws {
        let json = """
        {"id":"demand-1","state":"OFFERED","category":"dining","partySize":2,"planId":"plan-1",
         "expiresAt":"2026-09-20T00:00:00.000Z",
         "offers":[{"id":"o1","where":"A","startsAt":"2026-09-20T23:30:00.000Z","durationMins":60,
                    "priceCents":1000,"holdExpiresAt":"2026-09-19T21:00:00.000Z"}]}
        """.data(using: .utf8)!

        let ask = try JSONDecoder().decode(NativePlanDemandAsk.self, from: json)
        XCTAssertEqual(ask.offers.count, 1)
        XCTAssertNil(ask.booked, "nothing is booked when the server never said so")
        XCTAssertEqual(ask.status, "1 offer")
    }

    func testAcceptedIsReadWhenTheServerSendsIt() throws {
        let json = """
        {"id":"o1","where":"A","startsAt":"2026-09-20T23:30:00.000Z","durationMins":60,
         "priceCents":1000,"holdExpiresAt":"2026-09-19T21:00:00.000Z","accepted":true}
        """.data(using: .utf8)!
        XCTAssertTrue(try JSONDecoder().decode(NativePlanDemandOffer.self, from: json).accepted)
    }
}

/// Does this Plan work?
///
/// The server answers in three values and the third one, `unknown`, is the
/// one a UI is tempted to lose. These tests exist to stop it being quietly
/// rounded into a pass.
final class NativePlanFeasibilityTests: XCTestCase {
    private func check(
        _ name: String,
        _ verdict: NativePlanFeasibilityVerdict,
        detail: String = "Detail.",
        itemIds: [String] = []
    ) -> NativePlanFeasibilityCheck {
        NativePlanFeasibilityCheck(check: name, verdict: verdict, detail: detail, itemIds: itemIds)
    }

    private func decode(_ json: String) throws -> NativePlanFeasibility {
        try JSONDecoder().decode(NativePlanFeasibility.self, from: Data(json.utf8))
    }

    func testUnknownIsNeverDrawnAsAPass() {
        // The whole point. If these ever collapse, the guest is told their
        // evening works when nothing has been established.
        XCTAssertNotEqual(
            NativePlanFeasibilityDisplay.tint(for: .unknown),
            NativePlanFeasibilityDisplay.tint(for: .fits)
        )
        XCTAssertNotEqual(
            NativePlanFeasibilityDisplay.symbol(for: .unknown),
            NativePlanFeasibilityDisplay.symbol(for: .fits)
        )
        XCTAssertNotEqual(
            NativePlanFeasibilityDisplay.headline(for: .unknown),
            NativePlanFeasibilityDisplay.headline(for: .fits)
        )
    }

    func testUnknownEarnsNoColourAndIsTheOnlyOutlinedState() {
        // Colour is earned by a check that could actually be run.
        XCTAssertEqual(NativePlanFeasibilityDisplay.tint(for: .unknown), NativeTheme.neutral)
        XCTAssertTrue(NativePlanFeasibilityDisplay.isOutlined(.unknown))
        XCTAssertFalse(NativePlanFeasibilityDisplay.isOutlined(.fits))
        XCTAssertFalse(NativePlanFeasibilityDisplay.isOutlined(.breaks))
    }

    func testUnknownReadsAsUnknownWithoutColour() {
        // Anyone who cannot use colour still has to be able to tell the three
        // apart, so the symbol carries the difference on its own.
        let symbols = Set([
            NativePlanFeasibilityDisplay.symbol(for: .fits),
            NativePlanFeasibilityDisplay.symbol(for: .breaks),
            NativePlanFeasibilityDisplay.symbol(for: .unknown),
        ])
        XCTAssertEqual(symbols.count, 3)
        // Filled means settled; the unanswered one must not be filled.
        XCTAssertFalse(NativePlanFeasibilityDisplay.symbol(for: .unknown).hasSuffix(".fill"))
        XCTAssertTrue(NativePlanFeasibilityDisplay.symbol(for: .fits).hasSuffix(".fill"))
    }

    func testTheHeadlineForUnknownDoesNotHedgeTowardFine() {
        let headline = NativePlanFeasibilityDisplay.headline(for: .unknown)
        XCTAssertEqual(headline, "Not enough to tell yet")
        for reassurance in ["works", "fine", "good", "ready"] {
            XCTAssertFalse(headline.lowercased().contains(reassurance), "headline hedges toward a pass: \(headline)")
        }
    }

    func testProblemsComeFirstThenTheUnansweredThenTheSettled() {
        let ordered = NativePlanFeasibilityDisplay.ordered([
            check("window", .fits),
            check("budget", .unknown),
            check("capacity", .breaks),
            check("travel", .fits),
            check("overlap", .unknown),
        ])
        XCTAssertEqual(ordered.map(\.check), ["capacity", "budget", "overlap", "window", "travel"])
    }

    func testRowsDoNotShuffleBetweenRefreshes() {
        // Equal verdicts keep the server's order, which is the contract's.
        let checks = [check("window", .unknown), check("overlap", .unknown), check("travel", .unknown)]
        XCTAssertEqual(NativePlanFeasibilityDisplay.ordered(checks).map(\.check), ["window", "overlap", "travel"])
    }

    func testAnUnknownCheckIsSpokenAsNotChecked() {
        let label = NativePlanFeasibilityDisplay.accessibilityLabel(
            for: check("budget", .unknown, detail: "No budget was set for this Plan.")
        )
        XCTAssertEqual(label, "Budget, not checked. No budget was set for this Plan.")
    }

    func testASettledCheckIsNotSpokenAsUnchecked() {
        let label = NativePlanFeasibilityDisplay.accessibilityLabel(for: check("capacity", .fits, detail: "Everything here can take 4."))
        XCTAssertEqual(label, "Room for everyone, checked and fine. Everything here can take 4.")
    }

    func testTheServersSentenceIsShownAsSentBecauseItNamesWhatIsMissing() throws {
        // The client must not rewrite the detail into something vaguer; the
        // server's wording is what tells the guest which fact to go supply.
        let decoded = try decode("""
        {"verdict":"unknown","checks":[
          {"check":"budget","verdict":"unknown","detail":"No party size was set, so a per-person price cannot be totalled.","itemIds":[]}
        ]}
        """)
        XCTAssertEqual(decoded.checks[0].detail, "No party size was set, so a per-person price cannot be totalled.")
    }

    func testAVerdictThisClientHasNotBeenTaughtReadsAsUnknown() throws {
        // An older app meeting a newer server must not treat a word it does
        // not recognise as a pass.
        let decoded = try decode("""
        {"verdict":"probably-fine","checks":[
          {"check":"window","verdict":"someday","detail":"x","itemIds":[]}
        ]}
        """)
        XCTAssertEqual(decoded.verdict, .unknown)
        XCTAssertEqual(decoded.checks[0].verdict, .unknown)
    }

    func testTheWireShapeTheServerSendsDecodes() throws {
        let decoded = try decode("""
        {"verdict":"breaks","checks":[
          {"check":"capacity","verdict":"breaks","detail":"Tiny bar (1 left) cannot take 4.","itemIds":["item-1"]},
          {"check":"budget","verdict":"fits","detail":"$40.00 for 4 is within the $400.00 you set.","itemIds":["item-1"]}
        ]}
        """)
        XCTAssertEqual(decoded.verdict, .breaks)
        XCTAssertEqual(decoded.checks.count, 2)
        XCTAssertEqual(decoded.checks[0].itemIds, ["item-1"])
        XCTAssertEqual(NativePlanFeasibilityDisplay.title(for: "capacity"), "Room for everyone")
    }

    func testAnUnnamedCheckStillGetsATitleRatherThanBlank() {
        // A check added server-side before this client knows it must still
        // render, because its detail sentence is the useful part.
        XCTAssertEqual(NativePlanFeasibilityDisplay.title(for: "weather"), "Weather")
    }

    func testAPassWithNothingBehindItIsNotAPass() throws {
        // The one malformed shape that decodes cleanly and still overstates:
        // a green headline with no checks under it. A pass asserts the checks
        // were run, so with none to show it is downgraded rather than trusted.
        let decoded = try decode(#"{"verdict":"fits","checks":[]}"#)
        XCTAssertEqual(decoded.verdict, .unknown)
        XCTAssertTrue(decoded.checks.isEmpty)
    }

    func testAProblemWithNoChecksIsStillAProblem() throws {
        // The downgrade runs one way only. Refusing to believe a reported
        // failure would be the same mistake pointed the other direction.
        let decoded = try decode(#"{"verdict":"breaks","checks":[]}"#)
        XCTAssertEqual(decoded.verdict, .breaks)
    }

    func testAVerdictThatNeverArrivedIsNotReadAsAPass() throws {
        // Absent, null, and the wrong type all mean the same thing: nobody
        // told this client the answer.
        XCTAssertEqual(try decode(#"{"checks":[]}"#).verdict, .unknown)
        XCTAssertEqual(try decode(#"{"verdict":null,"checks":[]}"#).verdict, .unknown)
        XCTAssertEqual(try decode(#"{"verdict":7,"checks":[]}"#).verdict, .unknown)
    }

    func testAMissingChecksArrayDecodesRatherThanThrowingTheSectionAway() throws {
        let decoded = try decode(#"{"verdict":"breaks"}"#)
        XCTAssertEqual(decoded.verdict, .breaks)
        XCTAssertTrue(decoded.checks.isEmpty)
    }

    func testACheckThatLostItsVerdictIsNotCountedAsSettled() throws {
        // Previously any malformed member threw and took the whole section
        // with it. It now survives, and the member that lost its verdict is
        // unknown rather than quietly sorted in with the passes.
        let decoded = try decode(#"""
        {"verdict":"unknown","checks":[
          {"check":"budget"},
          {"check":"travel","verdict":"fits","detail":"Fine.","itemIds":[]}
        ]}
        """#)
        XCTAssertEqual(decoded.checks.count, 2)
        XCTAssertEqual(decoded.checks[0].verdict, .unknown)
        XCTAssertEqual(decoded.checks[0].detail, "")
        XCTAssertEqual(decoded.checks[1].verdict, .fits)
        // And it sorts as unanswered, ahead of the settled one.
        XCTAssertEqual(NativePlanFeasibilityDisplay.ordered(decoded.checks).map(\.check), ["budget", "travel"])
    }
}
