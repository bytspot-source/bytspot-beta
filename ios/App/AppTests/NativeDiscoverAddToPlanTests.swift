import XCTest
@testable import App

/// Kept separate from the existing NativeProfileDataAPITests class in
/// BytspotTrustEngineTests.swift. Register this file in AppTests when integrating.
@MainActor
final class NativeDiscoverAddToPlanTests: XCTestCase {
    private func offering(capability: String = "request", sourceKind: NativePlanBookableSelection.SourceKind = .coffeeSpot) -> NativePlanBookableOffering {
        .init(id: "display-only-id", sourceKind: sourceKind, sourceId: "canonical-source",
              category: "events", title: "An offering", subtitle: nil, capability: capability)
    }

    private func plan(id: String = "plan", creator: String = "member", lifecycle: String = "proposed",
                      state: String = "proposed", items: [NativePlan.Item] = [], canDelete: Bool? = nil) -> NativePlan {
        .init(id: id, title: "A Plan", intent: "Explore", creatorUserId: creator, startsAt: nil,
              endsAt: nil, areaLabel: nil, partySize: nil, needs: ["events"], lifecycle: lifecycle,
              state: state, readiness: .init(going: 1, maybe: 0, pending: 0, declined: 0, total: 1),
              openNeeds: ["events"], participants: [], items: items, canDelete: canDelete, joinToken: nil)
    }

    private func model(offering: NativePlanBookableOffering? = nil) -> NativeDiscoverAddToPlanModel {
        let model = NativeDiscoverAddToPlanModel(selection: .init(title: "A place", needKind: "events", offering: offering))
        model.bind(userID: "member")
        return model
    }

    func testReferencePayloadHasOnlyTheActualAttachFields() {
        let selection = NativeDiscoverPlanSelection(title: "  A place  ", needKind: " events ")
        let request = selection.addRequest(planID: "plan")
        XCTAssertEqual(request.path, "/trpc/plans.attach")
        XCTAssertEqual(request.input as? [String: String], ["planId": "plan", "title": "A place", "needKind": "events"])
        XCTAssertNil(request.input["supplyRef"])
        XCTAssertNil(request.input["capability"])
        XCTAssertNil(request.input["metadata"])
        XCTAssertNil(request.input["idempotencyKey"])
        XCTAssertTrue(selection.isValid)
    }

    func testEveryKnownOfferingCapabilityUsesCanonicalSourceIdentity() {
        for capability in ["details", "book", "request", "redirect"] {
            for sourceKind in [NativePlanBookableSelection.SourceKind.party, .coffeeSpot] {
                let selection = NativeDiscoverPlanSelection(title: "A card", needKind: "events",
                                                           offering: offering(capability: capability, sourceKind: sourceKind))
                let request = selection.addRequest(planID: "plan")
                XCTAssertEqual(request.path, "/trpc/plans.addBookables")
                XCTAssertEqual(Set(request.input.keys), ["planId", "bookableSelections"])
                XCTAssertEqual(request.input["bookableSelections"] as? [[String: String]],
                               [["sourceKind": sourceKind.rawValue, "sourceId": "canonical-source"]])
            }
        }
    }

    func testSelectionPresentationIdentityNeverTravelsToTheAPI() {
        let selection = NativeDiscoverPlanSelection(title: "Museum", needKind: "culture")
        XCTAssertEqual(selection.id, selection.id)
        XCTAssertNotEqual(selection.id, NativeDiscoverPlanSelection(title: "Museum", needKind: "culture").id)
        XCTAssertNil(selection.addRequest(planID: "plan").input["id"])
        XCTAssertNil(selection.offering)
    }

    func testCreatePreservesDiscoverNeedAndOmitsInventedScheduling() {
        let selection = NativeDiscoverPlanSelection(title: "Museum", needKind: "culture")
        let request = selection.createRequest(idempotencyKey: "create-key")
        XCTAssertEqual(request.path, "/trpc/plans.create")
        XCTAssertEqual(request.input["needs"] as? [String], ["culture"])
        XCTAssertEqual(request.input["idempotencyKey"] as? String, "create-key")
        XCTAssertEqual(request.input["title"] as? String, "Museum")
        XCTAssertEqual(Set(request.input.keys), ["title", "intent", "needs", "idempotencyKey"])
        let bookable = NativeDiscoverPlanSelection(title: "An offering", needKind: "events", offering: offering())
        XCTAssertEqual(bookable.createRequest(idempotencyKey: "key").path, "/trpc/plans.createWithBookables")
    }

    func testInputLimitsUseUTF16AndDoNotInventFallbackCategories() {
        XCTAssertFalse(NativeDiscoverPlanSelection(title: " ", needKind: "events").isValid)
        XCTAssertFalse(NativeDiscoverPlanSelection(title: "Place", needKind: " ").isValid)
        XCTAssertFalse(NativeDiscoverPlanSelection(title: "Place", needKind: String(repeating: "x", count: 41)).isValid)
        XCTAssertFalse(NativeDiscoverPlanSelection(title: String(repeating: "😀", count: 61), needKind: "events").isValid)
        let selection = NativeDiscoverPlanSelection(title: String(repeating: "😀", count: 60), needKind: "events")
        XCTAssertTrue(selection.isValid)
        XCTAssertEqual((selection.createRequest(idempotencyKey: "key").input["title"] as? String)?.utf16.count, 80)
    }

    func testOpenSelectCancelAndLoadNeverWrite() async {
        let api = DiscoverPlanAPIStub()
        api.rows = [plan()]
        let model = model()
        await model.load(api: api, userID: "member", isCurrent: { true })
        model.destination = .existing(id: "plan", title: "A Plan")
        model.invalidate()
        XCTAssertEqual(api.writes.count, 0)
        XCTAssertEqual(api.getCount, 0)
    }

    func testListOnlyIncludesCreatorOwnedEditablePlansAndFailsClosedForUnknownLifecycle() async {
        let api = DiscoverPlanAPIStub()
        api.rows = [plan(), plan(id: "guest", creator: "someone-else"),
                    plan(id: "expired", state: "expired"), plan(id: "cancelled", lifecycle: "cancelled"),
                    plan(id: "completed", lifecycle: "confirmed", state: "completed"),
                    plan(id: "unknown", lifecycle: "future"),
                    plan(id: "active", lifecycle: "confirmed", state: "active")]
        let model = model()
        await model.load(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(model.plans.map(\.id), ["plan", "active"])
        XCTAssertFalse(NativeDiscoverAddToPlanModel.isEditable(plan(), userID: nil))
    }

    func testLoadFailureCanRetryWithoutWriting() async {
        let api = DiscoverPlanAPIStub()
        api.failList = true
        let model = model()
        await model.load(api: api, userID: "member", isCurrent: { true })
        XCTAssertTrue(model.loadFailed)
        api.failList = false
        api.rows = [plan()]
        await model.load(api: api, userID: "member", isCurrent: { true })
        XCTAssertFalse(model.loadFailed)
        XCTAssertEqual(model.plans.count, 1)
        XCTAssertTrue(api.writes.isEmpty)
    }

    func testGuestOrStaleUserCannotWriteEvenWithSelectedDestination() async {
        let api = DiscoverPlanAPIStub()
        let model = model()
        model.destination = .newPlan
        let staleResult = await model.save(api: api, userID: "member", isCurrent: { false })
        let otherResult = await model.save(api: api, userID: "other-member", isCurrent: { true })
        XCTAssertNil(staleResult)
        XCTAssertNil(otherResult)
        XCTAssertTrue(api.writes.isEmpty)
    }

    func testOwnershipIsRevalidatedBeforeAttach() async {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan(creator: "other-member")
        let model = model()
        model.destination = .existing(id: "plan", title: "A Plan")
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(result)
        XCTAssertTrue(api.writes.isEmpty)
        XCTAssertNotNil(model.errorMessage)
    }

    func testUserChangeDuringPreflightPreventsAnyAttachment() async {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan()
        let model = model()
        model.destination = .existing(id: "plan", title: "A Plan")
        api.onGet = { model.bind(userID: "other-member") }
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(result)
        XCTAssertTrue(api.writes.isEmpty)
        XCTAssertNil(model.destination)
        XCTAssertNil(model.errorMessage)
    }

    func testStaleListResponseCannotReplaceNewUsersPlans() async {
        let api = DiscoverPlanAPIStub()
        api.rows = [plan()]
        let model = model()
        api.onList = { model.bind(userID: "other-member") }
        await model.load(api: api, userID: "member", isCurrent: { true })
        XCTAssertTrue(model.plans.isEmpty)
    }

    func testAmbiguousReferenceAttachIsNeverRepeated() async {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan()
        api.failAttach = true
        let model = model()
        model.destination = .existing(id: "plan", title: "A Plan")
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        model.invalidate() // Credential refresh must not reset the at-most-once latch.
        let third = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first); XCTAssertNil(second); XCTAssertNil(third)
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.attach"])
        XCTAssertTrue(model.referenceAttachStarted)
        XCTAssertFalse(model.canSubmit)
        XCTAssertTrue(model.errorMessage?.contains("may have been added") == true)
    }

    func testFailedPreflightCanRetryBecauseReferenceWasNotSent() async {
        let api = DiscoverPlanAPIStub()
        api.failGet = true
        let model = model()
        model.destination = .existing(id: "plan", title: "A Plan")
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first)
        XCTAssertTrue(model.canSubmit)
        XCTAssertFalse(model.referenceAttachStarted)
        api.failGet = false
        api.currentPlan = plan()
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(second, "plan")
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.attach"])
    }

    func testBookableRetryKeepsTheFrozenDestinationAndSourcePayload() async throws {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan()
        api.failAdd = true
        let model = model(offering: offering())
        model.destination = .existing(id: "plan", title: "A Plan")
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first)
        XCTAssertTrue(model.canSubmit)
        model.destination = .newPlan // The UI disables this; freeze also protects the model.
        api.failAdd = false
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(second, "plan")
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.addBookables", "/trpc/plans.addBookables"])
        XCTAssertEqual(try canonical(api.writes[0]), try canonical(api.writes[1]))
    }

    func testCreateWithBookableIsAtomicAndRetriesTheSameKey() async throws {
        let api = DiscoverPlanAPIStub()
        api.failCreate = true
        let model = model(offering: offering())
        model.destination = .newPlan
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first)
        api.failCreate = false
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(second, "created-plan")
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.createWithBookables", "/trpc/plans.createWithBookables"])
        XCTAssertEqual(try canonical(api.writes[0]), try canonical(api.writes[1]))
        XCTAssertEqual(api.getCount, 0)
    }

    func testReferenceCreateKeepsCreatedPlanWhenPreflightMustBeRetried() async {
        let api = DiscoverPlanAPIStub()
        api.failGet = true
        let model = model()
        model.destination = .newPlan
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first)
        XCTAssertTrue(model.errorMessage?.contains("Plan was created") == true)
        api.failGet = false
        api.currentPlan = plan(id: "created-plan")
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(second, "created-plan")
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.create", "/trpc/plans.attach"])
        XCTAssertEqual(api.writes.last?.input["planId"] as? String, "created-plan")
    }

    func testReferenceCreateThenAmbiguousAttachCannotCreateOrAttachAgain() async {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan(id: "created-plan")
        api.failAttach = true
        let model = model()
        model.destination = .newPlan
        let first = await model.save(api: api, userID: "member", isCurrent: { true })
        let second = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(first); XCTAssertNil(second)
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.create", "/trpc/plans.attach"])
    }

    func testStaleCreateCompletionDoesNotStartReferenceAttachment() async {
        let api = DiscoverPlanAPIStub()
        let model = model()
        model.destination = .newPlan
        api.onCreate = { model.bind(userID: "other-member") }
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(result)
        XCTAssertEqual(api.writes.map(\.path), ["/trpc/plans.create"])
        XCTAssertEqual(api.getCount, 0)
    }

    func testBusyRejectsDoubleSubmit() async {
        let api = DiscoverPlanAPIStub()
        api.currentPlan = plan()
        let model = model()
        model.destination = .existing(id: "plan", title: "A Plan")
        api.onGet = {
            XCTAssertTrue(model.isSaving)
            XCTAssertFalse(model.canSubmit)
            let duplicate = await model.save(api: api, userID: "member", isCurrent: { true })
            XCTAssertNil(duplicate)
        }
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(result, "plan")
        XCTAssertEqual(api.writes.count, 1)
    }

    func testCancelledBookableHistoryIsNotRestored() async {
        let api = DiscoverPlanAPIStub()
        let item = NativePlan.Item(id: "item", needKind: "coffee", title: "Coffee", partyId: nil,
                                   coffeeReservationId: nil, coffeeSpotId: "canonical-source",
                                   capability: "request", status: "cancelled", reservation: nil)
        api.currentPlan = plan(items: [item])
        let model = model(offering: offering())
        model.destination = .existing(id: "plan", title: "A Plan")
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(result)
        XCTAssertTrue(api.writes.isEmpty)
        XCTAssertTrue(model.errorMessage?.contains("cancelled history") == true)
    }

    func testExistingCanonicalSelectionReconcilesWithoutAnotherWrite() async {
        let api = DiscoverPlanAPIStub()
        let item = NativePlan.Item(id: "item", needKind: "coffee", title: "Coffee", partyId: nil,
                                   coffeeReservationId: nil, coffeeSpotId: "canonical-source",
                                   capability: "request", status: "available", reservation: nil)
        api.currentPlan = plan(items: [item])
        let model = model(offering: offering())
        model.destination = .existing(id: "plan", title: "A Plan")
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertEqual(result, "plan")
        XCTAssertTrue(api.writes.isEmpty)
    }

    func testDuplicateCanonicalItemsCannotBypassServerConflict() async {
        let api = DiscoverPlanAPIStub()
        let item = NativePlan.Item(id: "item", needKind: "coffee", title: "Coffee", partyId: nil,
                                   coffeeReservationId: nil, coffeeSpotId: "canonical-source",
                                   capability: "request", status: "available", reservation: nil)
        api.currentPlan = plan(items: [item, item])
        let model = model(offering: offering())
        model.destination = .existing(id: "plan", title: "A Plan")
        let result = await model.save(api: api, userID: "member", isCurrent: { true })
        XCTAssertNil(result)
        XCTAssertTrue(api.writes.isEmpty)
        XCTAssertTrue(model.errorMessage?.contains("multiple existing items") == true)
    }

    func testDeletionStillRequiresExplicitServerPermissionAndOwnership() {
        XCTAssertFalse(NativePlanDisplay.canDelete(plan(), userID: "member"))
        XCTAssertFalse(NativePlanDisplay.canDelete(plan(canDelete: false), userID: "member"))
        XCTAssertFalse(NativePlanDisplay.canDelete(plan(canDelete: true), userID: "other-member"))
        XCTAssertTrue(NativePlanDisplay.canDelete(plan(canDelete: true), userID: "member"))
    }

    private func canonical(_ request: NativePlanWriteRequest) throws -> Data {
        try JSONSerialization.data(withJSONObject: request.input, options: [.sortedKeys])
    }
}

@MainActor
private final class DiscoverPlanAPIStub: NativeDiscoverPlanAdding {
    var rows: [NativePlan] = []
    var currentPlan: NativePlan?
    var writes: [NativePlanWriteRequest] = []
    var getCount = 0
    var failList = false
    var failGet = false
    var failCreate = false
    var failAdd = false
    var failAttach = false
    var onList: (() async -> Void)?
    var onGet: (() async -> Void)?
    var onCreate: (() async -> Void)?

    func list() async throws -> [NativePlan] {
        await onList?()
        if failList { throw URLError(.timedOut) }
        return rows
    }
    func get(_ planID: String) async throws -> NativePlan {
        getCount += 1
        await onGet?()
        if failGet { throw URLError(.timedOut) }
        guard let currentPlan else { throw URLError(.badServerResponse) }
        return currentPlan
    }
    func create(_ request: NativePlanWriteRequest) async throws -> String {
        writes.append(request)
        await onCreate?()
        if failCreate { throw URLError(.timedOut) }
        return "created-plan"
    }
    func addBookables(_ request: NativePlanWriteRequest) async throws -> [String] {
        writes.append(request)
        if failAdd { throw URLError(.timedOut) }
        return ["item"]
    }
    func attachReference(_ request: NativePlanWriteRequest) async throws {
        writes.append(request)
        if failAttach { throw URLError(.timedOut) }
    }
}
