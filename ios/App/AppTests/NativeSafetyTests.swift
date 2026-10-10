import XCTest
@testable import App

final class NativeSafetyTests: XCTestCase {
    private let party = NativeSafetyTarget(kind: .party, targetID: "party-1", ownerName: "Maya")
    private let person = NativeSafetyTarget(kind: .user, targetID: "user-2", ownerName: "Jordan")

    private func server(_ status: Int, code: String, message: String) -> Error {
        BytspotAPIClient.APIError.server(status: status, body: #"{"error":{"message":"\#(message)","data":{"code":"\#(code)"},"code":"\#(code)"}}"#)
    }

    func testReasonsMatchServerAndLabels() {
        XCTAssertEqual(NativeReportReason.allCases.map(\.rawValue), ["spam", "harassment", "sexual", "violence", "impersonation", "other"])
        XCTAssertEqual(NativeReportReason.allCases.map(\.label), [
            "Spam", "Harassment or bullying", "Nudity or sexual content",
            "Violence or threats", "Pretending to be someone else", "Something else",
        ])
        XCTAssertEqual(NativeSafetyKind.allCases.map(\.rawValue), ["user", "party", "review", "sale"])
    }

    func testReportInputTrimsAndCapsNote() {
        let input = NativeSafetyAPI.reportInput(target: party, reason: .spam, note: "  " + String(repeating: "a", count: 600) + " ")
        XCTAssertEqual(input["kind"] as? String, "party")
        XCTAssertEqual(input["targetId"] as? String, "party-1")
        XCTAssertEqual(input["reason"] as? String, "spam")
        XCTAssertEqual((input["note"] as? String)?.count, 500)
    }

    func testReportInputOmitsBlankNote() {
        let input = NativeSafetyAPI.reportInput(target: person, reason: .other, note: " \n ")
        XCTAssertNil(input["note"])
        XCTAssertEqual(input["kind"] as? String, "user")
    }

    func testBlockInputByUserOrByItem() {
        XCTAssertEqual(NativeSafetyAPI.blockInput(target: person) as? [String: String], ["userId": "user-2"])
        XCTAssertEqual(NativeSafetyAPI.blockInput(target: party) as? [String: String], ["kind": "party", "targetId": "party-1"])
        let sale = NativeSafetyTarget(kind: .sale, targetID: "sale-9", ownerName: "Ari")
        XCTAssertEqual(NativeSafetyAPI.blockInput(target: sale) as? [String: String], ["kind": "sale", "targetId": "sale-9"])
        XCTAssertEqual(NativeSafetyAPI.unblockInput(userID: "user-2") as? [String: String], ["userId": "user-2"])
    }

    func testDecodeBlocks() throws {
        let blocks = try NativeSafetyAPI.decodeBlocks(["blocks": [
            ["userId": "u1", "name": "Sam", "blockedAt": "2026-10-09T12:30:00.000Z"],
            ["userId": "u2", "name": "Lee", "blockedAt": "2026-10-08T08:00:00Z"],
        ]])
        XCTAssertEqual(blocks.map(\.userId), ["u1", "u2"])
        XCTAssertNotNil(blocks[0].blockedDate)
        XCTAssertNotNil(blocks[1].blockedDate)
        XCTAssertEqual(try NativeSafetyAPI.decodeBlocks(["blocks": []]), [])
        XCTAssertThrowsError(try NativeSafetyAPI.decodeBlocks(["nope": true]))
    }

    func testHiddenSetHidesAndRestores() {
        var hidden = NativeSafetyHiddenSet()
        let rows = ["a", "b", "c"]
        hidden.hide("b")
        XCTAssertEqual(hidden.visible(rows, id: { $0 }), ["a", "c"])
        XCTAssertTrue(hidden.contains("b"))
        hidden.restore("b")
        XCTAssertEqual(hidden.visible(rows, id: { $0 }), rows)
    }

    func testErrorCopy() {
        let fallback = "Your report couldn't be sent. Try again."
        XCTAssertEqual(NativeSafetyAPI.message(for: server(404, code: "NOT_FOUND", message: "Not found"), fallback: fallback), NativeSafetyCopy.unavailable)
        XCTAssertEqual(NativeSafetyAPI.message(for: server(429, code: "TOO_MANY_REQUESTS", message: "Slow down"), fallback: fallback), NativeSafetyCopy.tooMany)
        XCTAssertEqual(NativeSafetyAPI.message(for: server(401, code: "UNAUTHORIZED", message: "No"), fallback: fallback), NativeSafetyCopy.signInAgain)
        XCTAssertEqual(NativeSafetyAPI.message(for: server(400, code: "BAD_REQUEST", message: "You can't block yourself."), fallback: fallback), "You can't block yourself.")
        XCTAssertEqual(NativeSafetyAPI.message(for: server(500, code: "INTERNAL_SERVER_ERROR", message: "boom"), fallback: fallback), fallback)
        XCTAssertEqual(NativeSafetyAPI.message(for: URLError(.notConnectedToInternet), fallback: fallback), NativeSafetyCopy.offline)
        XCTAssertEqual(NativeSafetyAPI.message(for: server(403, code: "FORBIDDEN", message: "This account has been suspended."), fallback: fallback), "This account has been suspended.")
    }

    func testSuspendedAccountDetection() {
        let suspended = server(403, code: "FORBIDDEN", message: "This account has been suspended.")
        XCTAssertTrue(NativeAuthDataAPI.isAccountSuspended(suspended))
        XCTAssertFalse(NativeAuthDataAPI.isAccountSuspended(server(403, code: "FORBIDDEN", message: "Not allowed")))
        XCTAssertEqual(NativeAuthDataAPI.userMessage(for: suspended, mode: .login), "This account has been suspended.")
    }

    func testCopyAndContact() {
        XCTAssertEqual(NativeSafetyCopy.reportThanks, "Thanks. We review reports within 24 hours.")
        XCTAssertEqual(NativeContactBytspotPanel.mailURL.absoluteString, "mailto:safety@bytspot.com")
        XCTAssertEqual(person.blockTitle, "Block Jordan")
        XCTAssertNotEqual(NativeSafetyAction.report(party).id, NativeSafetyAction.block(party).id)
        XCTAssertEqual(NativeSafetyAction.block(party).target, party)
    }
}
