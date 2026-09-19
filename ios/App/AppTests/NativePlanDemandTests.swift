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
