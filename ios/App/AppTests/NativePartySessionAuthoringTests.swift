import Foundation
import Testing
@testable import App

@Suite(.serialized)
struct NativePartySessionAuthoringTests {
    private func validDraft() -> NativeSessionAuthoringDraft {
        var draft = NativeSessionAuthoringDraft()
        draft.name = "Front table"
        draft.price = "123.45"
        draft.startsAt = Date(timeIntervalSince1970: 1_900_000_000)
        draft.endsAt = draft.startsAt.addingTimeInterval(3_600)
        return draft
    }

    @Test func exactMoneyDoesNotRoundOrCoerce() {
        #expect(NativeSessionAuthoringDraft.cents("0.01") == 1)
        #expect(NativeSessionAuthoringDraft.cents("123.45") == 12345)
        #expect(NativeSessionAuthoringDraft.cents("10.1") == 1010)
        #expect(NativeSessionAuthoringDraft.cents("100000.00") == 10_000_000)
        #expect(NativeSessionAuthoringDraft.cents(" 5 ") == 500)
        for value in ["0", "0.00", "-1", "+1", "1.001", "1e3", "1,50", "NaN", "Infinity", "100000.01", "9999999999999999999999999999", "", ".25", "1.", "١٢", "$25"] {
            #expect(NativeSessionAuthoringDraft.cents(value) == nil, "Must reject \(value)")
        }
    }

    @Test func defaultsAndNullSemanticsMatchService() throws {
        let draft = validDraft()
        #expect(draft.problems.isEmpty)
        let input = try draft.input()
        #expect(input["name"] as? String == "Front table")
        #expect(input["kind"] as? String == "table")
        #expect(input["bottleCount"] as? Int == 0)
        #expect(input["bottleTerms"] as? String == "included")
        #expect(input["priceCents"] as? Int == 12345)
        #expect(input["quantity"] as? Int == 1)
        #expect(input["venueName"] is NSNull)
        #expect(input["lat"] is NSNull)
        #expect(input["lng"] is NSNull)
        #expect(input["requiredMembershipTier"] is NSNull)
        #expect(input["id"] == nil)
        #expect(input["sessionId"] == nil)
        #expect(NativeAuthoredPartySession.date(input["startsAt"] as? String ?? "") == draft.startsAt)
    }

    @Test func formRejectsInvalidTimesCountsTermsAndTiers() throws {
        var draft = validDraft()
        draft.endsAt = draft.startsAt
        #expect(draft.problems.contains { $0.contains("End time") })
        draft = validDraft()
        draft.bottleTerms = "minimum"
        #expect(draft.problems.contains { $0.contains("at least one bottle") })
        draft.bottleCount = 1
        #expect(draft.problems.isEmpty)
        draft.quantity = 0
        #expect(!draft.problems.isEmpty)
        draft.quantity = 501
        #expect(!draft.problems.isEmpty)
        draft = validDraft()
        draft.bottleCount = 201
        #expect(!draft.problems.isEmpty)
        draft = validDraft()
        draft.membership = "platinum"
        #expect(!draft.problems.isEmpty)
        draft = validDraft()
        draft.kind = "invented-kind"
        #expect(!draft.problems.isEmpty)
        draft = validDraft()
        draft.name = "  \n "
        #expect(!draft.problems.isEmpty)
        draft.name = String(repeating: "a", count: 81)
        #expect(!draft.problems.isEmpty)
        draft = validDraft()
        draft.venueName = String(repeating: "a", count: 121)
        #expect(!draft.problems.isEmpty)
    }

    @Test func afterHoursSeparateVenueAndMembershipAreExplicit() throws {
        var draft = validDraft()
        draft.kind = "after-hours"
        draft.venueName = "  Other venue  "
        draft.bottleTerms = "minimum"
        draft.bottleCount = 2
        draft.membership = "black"
        let input = try draft.input()
        #expect(input["kind"] as? String == "after-hours")
        #expect(input["venueName"] as? String == "Other venue")
        #expect(input["requiredMembershipTier"] as? String == "black")
        #expect(input["bottleTerms"] as? String == "minimum")
        // No Party start/end arguments: service permits independent session hours.
        #expect(draft.problems.isEmpty)
    }

    @Test func transportUsesAuthenticatedQueriesAndPostMutations() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SessionAuthoringURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { urlSession.invalidateAndCancel(); SessionAuthoringURLProtocol.handler = nil }
        var routes: [String] = []
        SessionAuthoringURLProtocol.handler = { request in
            let path = try #require(request.url?.path)
            routes.append(path)
            #expect(request.value(forHTTPHeaderField: "Authorization") != nil)
            let input: [String: Any]
            if request.httpMethod == "GET" {
                #expect(request.httpBody == nil)
                let requestURL = try #require(request.url)
                let components = try #require(URLComponents(url: requestURL, resolvingAgainstBaseURL: false))
                let raw = try #require(components.queryItems?.first(where: { $0.name == "input" })?.value)
                input = try #require(JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
            } else {
                #expect(request.httpMethod == "POST")
                input = try #require(JSONSerialization.jsonObject(with: SessionAuthoringURLProtocol.body(request)) as? [String: Any])
                #expect(input["json"] == nil) // API has no SuperJSON transformer.
            }
            #expect(input["partyId"] as? String == "party / & 1")
            let payload: [String: Any]
            switch path {
            case NativePartySessionAuthoringAPI.accessPath:
                payload = ["sellers": [["id": "seller", "name": "Test business", "canAuthor": true, "reason": NSNull()]], "reason": NSNull()]
            case NativePartySessionAuthoringAPI.listPath:
                #expect(input["sellerId"] as? String == "seller")
                payload = ["sessions": [Self.sessionFixture]]
            case NativePartySessionAuthoringAPI.upsertPath:
                #expect(input["sellerId"] as? String == "seller")
                #expect(input["sessionId"] == nil)
                let draft = try #require(input["session"] as? [String: Any])
                #expect(draft["priceCents"] as? Int == 12345)
                #expect(draft["requiredMembershipTier"] is NSNull)
                payload = Self.sessionFixture
            case NativePartySessionAuthoringAPI.withdrawPath:
                #expect(input["sellerId"] as? String == "seller")
                #expect(input["sessionId"] as? String == "session")
                payload = ["withdrawn": true]
            default:
                throw NativeSessionAuthoringFailure.validation("Unexpected route")
            }
            return (200, try JSONSerialization.data(withJSONObject: ["result": ["data": payload]]))
        }
        let client = BytspotAPIClient(baseURL: URL(string: "https://session-authoring.test")!, tokenProvider: { "synthetic-test-session" }, urlSession: urlSession)
        let api = NativePartySessionAuthoringAPI(client: client)
        let access = try await api.access(partyID: "party / & 1")
        #expect(access.sellers.first?.canAuthor == true)
        let rows = try await api.list(partyID: "party / & 1", sellerID: "seller")
        #expect(rows.count == 1)
        let created = try await api.create(partyID: "party / & 1", sellerID: "seller", draft: validDraft())
        #expect(created.priceCents == 12345)
        try await api.withdraw(partyID: "party / & 1", sellerID: "seller", sessionID: "session")
        #expect(routes == [NativePartySessionAuthoringAPI.accessPath, NativePartySessionAuthoringAPI.listPath, NativePartySessionAuthoringAPI.upsertPath, NativePartySessionAuthoringAPI.withdrawPath])
    }

    @Test func transportPreservesAuthorizationErrorsAndDoesNotRetryWrites() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SessionAuthoringURLProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        defer { urlSession.invalidateAndCancel(); SessionAuthoringURLProtocol.handler = nil }
        var requests = 0
        SessionAuthoringURLProtocol.handler = { _ in
            requests += 1
            return (403, try JSONSerialization.data(withJSONObject: ["error": ["message": "An active seller seat is required.", "data": ["code": "FORBIDDEN"]]]))
        }
        let api = NativePartySessionAuthoringAPI(client: BytspotAPIClient(baseURL: URL(string: "https://session-authoring.test")!, urlSession: urlSession))
        do {
            _ = try await api.create(partyID: "party", sellerID: "seller", draft: validDraft())
            Issue.record("Expected seller authorization refusal")
        } catch {
            #expect(NativeSessionAuthoringFailure.message(error) == "An active seller seat is required.")
        }
        #expect(requests == 1)
        var invalid = validDraft()
        invalid.price = "0"
        do {
            _ = try await api.create(partyID: "party", sellerID: "seller", draft: invalid)
            Issue.record("Expected local validation refusal")
        } catch {
            #expect(NativeSessionAuthoringFailure.message(error).contains("Free sessions"))
        }
        #expect(requests == 1) // Invalid forms never reach URLSession.
    }

    @Test func errorsNeverRenderArbitraryServerBodies() {
        let error = BytspotAPIClient.APIError.server(status: 500, body: "<html>Internal details</html>")
        #expect(!NativeSessionAuthoringFailure.message(error).contains("Internal details"))
        #expect(NativeSessionAuthoringFailure.message(error).contains("Refresh"))
        let notFound = BytspotAPIClient.APIError.server(status: 404, body: "")
        #expect(NativeSessionAuthoringFailure.message(notFound).contains("not available"))
    }

    private static var sessionFixture: [String: Any] {
        ["id": "session", "partyId": "party / & 1", "name": "Front table", "kind": "table",
         "startsAt": "2030-03-17T17:46:40.000Z", "endsAt": "2030-03-17T18:46:40.000Z",
         "venueName": NSNull(), "bottleCount": 0, "bottleTerms": "included", "priceCents": 12345,
         "quantity": 1, "committed": 0, "requiredMembershipTier": NSNull()]
    }
}

private final class SessionAuthoringURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let action = try #require(Self.handler)
            let (status, data) = try action(request)
            let requestURL = try #require(request.url)
            let response = try #require(HTTPURLResponse(url: requestURL, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"]))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}

    static func body(_ request: URLRequest) throws -> Data {
        if let body = request.httpBody { return body }
        let stream = try #require(request.httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
            if count == 0 { break }
            data.append(contentsOf: buffer.prefix(count))
        }
        return data
    }
}
