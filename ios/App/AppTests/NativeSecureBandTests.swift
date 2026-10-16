import XCTest
@testable import App

final class NativeSecureBandTests: XCTestCase {
    private func json(_ text: String) -> Data { Data(text.utf8) }

    private func hex(_ text: String) -> Data { Data(secureBandHex: text)! }

    func testHexRoundTripsAndRejectsBadInput() {
        XCTAssertEqual(Data([0x04, 0xA1, 0xFF, 0x00]).secureBandHex, "04A1FF00")
        XCTAssertEqual(Data(secureBandHex: "04a1Ff00"), Data([0x04, 0xA1, 0xFF, 0x00]))
        XCTAssertEqual(Data(secureBandHex: ""), Data())
        XCTAssertNil(Data(secureBandHex: "ABC"))
        XCTAssertNil(Data(secureBandHex: "ZZ"))
    }

    func testFirstRequestOmitsStateAndResponses() throws {
        let first = SecureBandRequest(band: "https://bytspot.app/b/424", uid: "04A1B2C3D4E5F6")
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: first.jsonBody()) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["band", "uid"])
        let later = SecureBandRequest(band: "B", uid: "U", state: "sealed", responses: ["9000", "91AF"])
        XCTAssertEqual(String(data: try later.jsonBody(), encoding: .utf8), #"{"band":"B","responses":["9000","91AF"],"state":"sealed","uid":"U"}"#)
    }

    func testParsesApdusAndSecuredReplies() throws {
        XCTAssertEqual(try SecureBandReplyParser.parse(status: 200, data: json(#"{"apdus":["9060000000"],"state":"s1"}"#)), .apdus(["9060000000"], state: "s1"))
        let done = try SecureBandReplyParser.parse(status: 200, data: json(#"{"band":{"serial":"BYT424-0301","form":"band","secured":true}}"#))
        XCTAssertEqual(done, .secured(SecuredBand(serial: "BYT424-0301", form: "band", secured: true)))
        XCTAssertEqual(SecuredBand(serial: "x", form: "event_fob", secured: true).formLabel, "Event fob")
        XCTAssertThrowsError(try SecureBandReplyParser.parse(status: 200, data: json(#"{"band":{"serial":"BYT424-0301","secured":false}}"#))) {
            XCTAssertEqual($0 as? SecureBandError, .refused(SecureBandReplyParser.fallbackRefusal))
        }
        XCTAssertThrowsError(try SecureBandReplyParser.parse(status: 200, data: json("{}"))) { XCTAssertEqual($0 as? SecureBandError, .network) }
    }

    func testRefusalsShowFirstBlockerAndMapStatuses() {
        func error(_ status: Int, _ body: String) -> SecureBandError? {
            do { _ = try SecureBandReplyParser.parse(status: status, data: json(body)); return nil } catch { return error as? SecureBandError }
        }
        XCTAssertEqual(error(409, #"{"blockers":["This band is already secured.","Second"]}"#), .refused("This band is already secured."))
        XCTAssertEqual(error(403, "{}"), .refused(SecureBandReplyParser.noPublishRefusal))
        XCTAssertEqual(error(400, #"{"error":"Unknown band."}"#), .refused("Unknown band."))
        XCTAssertEqual(error(422, "not json"), .refused(SecureBandReplyParser.fallbackRefusal))
        XCTAssertEqual(error(401, #"{"blockers":["x"]}"#), .signedOut)
        XCTAssertEqual(error(502, "{}"), .network)
        XCTAssertEqual(SecureBandError.tagLost.staffMessage, SecureBandError.holdStill)
    }

    func testExchangeStopsAfterFirstNonContinueStatusAndKeepsIt() async throws {
        var sent: [String] = []
        let answers = ["AA9000", "BB91AF", "9100", "917E", "9000"]
        let relay = SecureBandRelay(send: { apdu in
            sent.append(apdu.secureBandHex)
            return Data(secureBandHex: answers[sent.count - 1])!
        }, post: { _ in .apdus([], state: "") })
        let responses = try await relay.exchange(["01", "02", "03", "04", "05"])
        XCTAssertEqual(sent, ["01", "02", "03", "04"])
        XCTAssertEqual(responses.map(\.secureBandHex), ["AA9000", "BB91AF", "9100", "917E"])
    }

    func testExchangeTreatsShortOrThrownResponsesAsTagLost() async {
        let short = SecureBandRelay(send: { _ in Data([0x90]) }, post: { _ in .apdus([], state: "") })
        do { _ = try await short.exchange(["01"]); XCTFail() } catch { XCTAssertEqual(error as? SecureBandError, .tagLost) }
        let lost = SecureBandRelay(send: { _ in throw URLError(.cancelled) }, post: { _ in .apdus([], state: "") })
        do { _ = try await lost.exchange(["01"]); XCTFail() } catch { XCTAssertEqual(error as? SecureBandError, .tagLost) }
    }

    func testFullRunRelaysBetweenFakeServerAndFakeChip() async throws {
        var posted: [SecureBandRequest] = []
        var rounds: [Int] = []
        let relay = SecureBandRelay(send: { apdu in
            apdu.secureBandHex == "905A000003000001" ? Data([0x91, 0x00]) : Data([0x12, 0x34, 0x91, 0xAF])
        }, post: { request in
            posted.append(request)
            switch posted.count {
            case 1: return .apdus(["905A000003000001", "90AA000000"], state: "s1")
            case 2: return .apdus(["90AF000000"], state: "s2")
            default: return .secured(SecuredBand(serial: "BYT424-0301", form: "card", secured: true))
            }
        }, progress: { rounds.append($0) })
        let band = try await relay.run(band: "https://bytspot.app/b/424", uid: "04A1B2C3D4E5F6")
        XCTAssertEqual(band.serial, "BYT424-0301")
        XCTAssertEqual(rounds, [1, 2, 3])
        XCTAssertEqual(posted[0], SecureBandRequest(band: "https://bytspot.app/b/424", uid: "04A1B2C3D4E5F6"))
        XCTAssertEqual(posted[1], SecureBandRequest(band: "https://bytspot.app/b/424", uid: "04A1B2C3D4E5F6", state: "s1", responses: ["9100", "123491AF"]))
        XCTAssertEqual(posted[2].state, "s2")
        XCTAssertEqual(posted[2].responses, ["123491AF"])
    }

    func testRunPassesRefusalsThroughAndCapsRounds() async {
        let refused = SecureBandRelay(send: { _ in Data([0x90, 0x00]) }, post: { _ in throw SecureBandError.refused("Not yours.") })
        do { _ = try await refused.run(band: "b", uid: "u"); XCTFail() } catch { XCTAssertEqual(error as? SecureBandError, .refused("Not yours.")) }
        let offline = SecureBandRelay(send: { _ in Data([0x90, 0x00]) }, post: { _ in throw URLError(.notConnectedToInternet) })
        do { _ = try await offline.run(band: "b", uid: "u"); XCTFail() } catch { XCTAssertEqual(error as? SecureBandError, .network) }
        let endless = SecureBandRelay(send: { _ in Data([0x90, 0x00]) }, post: { _ in .apdus(["00"], state: "s") })
        do { _ = try await endless.run(band: "b", uid: "u"); XCTFail() } catch { XCTAssertEqual(error as? SecureBandError, .tooManyRounds) }
    }

    func testVendorRequestCarriesBearerAndSellerOnlyWhenSet() throws {
        let plain = try NativeVendorAPI().request(path: NativeVendorAPI.codePath, body: Data())
        XCTAssertNil(plain.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(plain.value(forHTTPHeaderField: "x-bytspot-seller"))
        XCTAssertEqual(plain.httpMethod, "POST")
        let signed = try NativeVendorAPI(accessToken: "tok", sellerID: "seller-2").request(path: NativeVendorAPI.securePath, body: Data())
        XCTAssertEqual(signed.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(signed.value(forHTTPHeaderField: "x-bytspot-seller"), "seller-2")
        XCTAssertTrue(signed.url?.absoluteString.hasSuffix("/vendor/bands/secure") ?? false)
    }

    func testSessionHidesClosedSellersAndSendsSellerHeaderOnlyWithAChoice() throws {
        let body = #"{"accessToken":"tok","memberships":[{"seller":{"id":"s1","legalName":"Neon Room LLC","state":"ACTIVE"}},{"seller":{"id":"s2","legalName":"Old Bar","state":"CLOSED"}}]}"#
        let session = try VendorSignInParser.session(status: 200, data: json(body))
        XCTAssertEqual(session.openSellers.map(\.id), ["s1"])
        XCTAssertTrue(session.sendsSellerHeader)
        XCTAssertEqual(session.business(session.openSellers[0]).api.sellerID, "s1")
        let single = try VendorSignInParser.session(status: 200, data: json(#"{"accessToken":"tok","memberships":[{"seller":{"id":"s1","legalName":"Neon","state":"ACTIVE"}}]}"#))
        XCTAssertNil(single.business(single.openSellers[0]).api.sellerID)
        XCTAssertThrowsError(try VendorSignInParser.session(status: 200, data: json(#"{"accessToken":"t","memberships":[{"seller":{"id":"s2","legalName":"Old","state":"CLOSED"}}]}"#))) {
            XCTAssertEqual($0 as? VendorSignInError, .noOpenBusiness)
        }
    }

    func testSignInErrorsAreStaffReadable() {
        XCTAssertEqual(try VendorSignInParser.challengeID(status: 200, data: json(#"{"challengeId":"c1"}"#), retryAfter: nil), "c1")
        XCTAssertThrowsError(try VendorSignInParser.challengeID(status: 429, data: Data(), retryAfter: "120")) {
            XCTAssertEqual(($0 as? VendorSignInError)?.message, "Too many tries. Try again in 2 minutes.")
        }
        XCTAssertThrowsError(try VendorSignInParser.session(status: 401, data: Data())) {
            XCTAssertEqual(($0 as? VendorSignInError)?.message, "That code didn't work. Check it, or ask for a new one.")
        }
        XCTAssertEqual(VendorSignInParser.tooMany("30").message, "Too many tries. Try again in 1 minute.")
        XCTAssertEqual(VendorSignInParser.tooMany(nil).message, "Too many tries. Wait a few minutes and try again.")
    }

    private func bandRoute(_ raw: String) throws -> BytspotPatchRoute {
        try XCTUnwrap(BytspotPatchRoute(url: try XCTUnwrap(URL(string: raw))))
    }

    func testBandTapRoutingTitleWithoutTier() throws {
        let destination = NativeContextualDestination.patch(try bandRoute("https://bytspot.app/BYT424-0017"))
        XCTAssertEqual(destination.title, "Bytspot band BYT424-0017")
        XCTAssertEqual(destination.subtitle, NativeBandTapScreen.bodyText)
        XCTAssertEqual(destination.eyebrow, "BYTSPOT BAND")
        XCTAssertNil(NativeBandTapScreen(route: try bandRoute("https://bytspot.app/BYT424-0017")).tier)
    }

    func testBandTapRoutingTitleDropsTierSuffix() throws {
        for (raw, tier) in [("https://bytspot.app/BYT424-0017-B", "Black tier"), ("https://bytspot.app/BYT424-0017-P", "Platinum tier"), ("https://bytspot.app/BYT424-0017-g", "Green tier"), ("https://bytspot.app/BYT424-0017?tier=black", "Black tier")] {
            let destination = NativeContextualDestination.patch(try bandRoute(raw))
            XCTAssertEqual(destination.title, "Bytspot band BYT424-0017", raw)
            XCTAssertEqual(destination.subtitle, tier, raw)
        }
        XCTAssertEqual(NativeBandTapScreen.serial(from: "BYT424-0301"), "BYT424-0301")
        XCTAssertEqual(NativeBandTapScreen.serial(from: "BYT424-0301-X"), "BYT424-0301-X")
    }

    func testBandTapScreenShowsNoPriceOrCheckout() throws {
        let copy = [NativeBandTapScreen.eyebrow, NativeBandTapScreen.bodyText, NativeBandTapScreen.businessNote, NativeBandTapScreen.secureActionTitle, NativeBandTapScreen.accessActionTitle]
        for raw in ["https://bytspot.app/BYT424-0017", "https://bytspot.app/BYT424-0017-B?party=2", "https://bytspot.app/BYT424-0017-P"] {
            let screen = NativeBandTapScreen(route: try bandRoute(raw))
            for text in copy + [screen.title, screen.subtitle, screen.tierLine ?? ""] {
                XCTAssertFalse(text.contains("$"), text)
                for banned in ["hold", "checkout", "authorize", "starting at", "save for later", "apple pay"] {
                    XCTAssertFalse(text.lowercased().contains(banned), "\(banned) in \(text)")
                }
            }
        }
    }

    func testSecureThisBandVisibility() {
        XCTAssertFalse(NativeBandTapScreen.vendorSessionPersists)
        XCTAssertTrue(NativeBandTapScreen.showsSecureAction(vendorSignedIn: false))
        XCTAssertTrue(NativeBandTapScreen.showsBusinessNote(vendorSignedIn: false))
        XCTAssertTrue(NativeBandTapScreen.showsSecureAction(vendorSignedIn: true))
        XCTAssertFalse(NativeBandTapScreen.showsBusinessNote(vendorSignedIn: true))
        XCTAssertFalse(NativeBandTapScreen.showsSecureAction(vendorSignedIn: false, vendorSessionPersists: true))
        XCTAssertTrue(NativeBandTapScreen.showsSecureAction(vendorSignedIn: true, vendorSessionPersists: true))
    }
}
