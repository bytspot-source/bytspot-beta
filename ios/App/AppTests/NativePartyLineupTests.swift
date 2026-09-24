import Foundation
import Testing
@testable import App

@MainActor
struct NativePartyLineupTests {
    @Test func providerSpecificValidationAndCanonicalDestinations() {
        #expect(NativeLineupTipProvider.cashApp.normalizedHandle(" $DJ42 ") == "DJ42")
        #expect(NativeLineupTipProvider.cashApp.normalizedHandle("12345") == nil)
        #expect(NativeLineupTipProvider.cashApp.normalizedHandle("DJ_42") == nil)
        #expect(NativeLineupTipProvider.cashApp.normalizedHandle(String(repeating: "a", count: 21)) == nil)
        #expect(NativeLineupTipProvider.paypalMe.normalizedHandle("DJ-42") == nil)
        #expect(NativeLineupTipProvider.paypalMe.normalizedHandle(String(repeating: "a", count: 21)) == nil)
        #expect(NativeLineupTipProvider.venmo.normalizedHandle("@DJ_42") == "DJ_42")
        #expect(NativeLineupTipProvider.venmo.normalizedHandle("four") == nil)
        #expect(NativeLineupTipProvider.venmo.normalizedHandle(String(repeating: "a", count: 31)) == nil)
        #expect(NativeLineupTipProvider.cashApp.recipientURL(handle: "$DJ42")?.absoluteString == "https://cash.app/$DJ42")
        #expect(NativeLineupTipProvider.paypalMe.recipientURL(handle: "DJ42")?.absoluteString == "https://paypal.me/DJ42")
        #expect(NativeLineupTipProvider.venmo.recipientURL(handle: "@DJ_42")?.absoluteString == "https://venmo.com/DJ_42")
    }

    @Test(arguments: ["https://venmo.com/good", "good?amount=20", "good/20", "good#x", "good%2Fbad", "a@evil.test", "good\\evil", "ＤＪname", "good\nname"])
    func rejectsNonHandles(_ input: String) {
        for provider in NativeLineupTipProvider.allCases { #expect(provider.normalizedHandle(input) == nil) }
    }

    @Test(arguments: ["http://venmo.com/DJ_42", "https://venmo.com.evil.test/DJ_42", "https://venmo.com@evil.test/DJ_42", "https://venmo.com:443/DJ_42", "https://venmo.com/DJ_42?amount=20", "https://venmo.com/DJ_42#next", "venmo://paycharge", "https://paypal.me/DJ_42"])
    func rejectsNonCanonicalServerURLs(_ url: String) {
        #expect(NativeLineupTip(provider: .venmo, handle: "DJ_42", url: url).safeURL == nil)
    }

    @Test func publicProjectionAndPrivateInboxDecodeWithoutContactInformation() throws {
        let payload: [String: Any] = ["entries": [[
            "id": "credit", "displayName": "DJ North", "role": "dj", "version": 1,
            "tips": [["provider": "cash-app", "handle": "DJ42", "url": "https://cash.app/$DJ42"]],
        ]]]
        let page = try JSONDecoder().decode(NativePartyLineupPage.self, from: JSONSerialization.data(withJSONObject: payload))
        let entry = try #require(page.entries.first)
        #expect(entry.roleLabel == "DJ")
        #expect(entry.publicTips.count == 1)
        #expect(entry.invitedUserId == nil)
        #expect(entry.status == nil)
        #expect(page.nextCursor == nil)
        #expect(entry.partyId == nil)
    }

    @Test func accountChangesAndDismissalInvalidateEveryPendingResponse() {
        var state = NativeLineupLoadState()
        let old = state.generation
        let entry = NativePartyLineupEntry(id: "credit", displayName: "DJ North", role: "dj", version: 1)
        state.finish(NativePartyLineupPage(entries: [entry], nextCursor: "next"), generation: old)
        #expect(state.entries.count == 1)
        state.invalidate()
        #expect(state.entries.isEmpty)
        #expect(state.nextCursor == nil)
        #expect(state.loading)
        state.finish(NativePartyLineupPage(entries: [entry], nextCursor: nil), generation: old)
        #expect(state.entries.isEmpty)
        state.finish(nil, generation: old)
        #expect(!state.failed)
        state.finish(nil, generation: state.generation)
        #expect(state.failed)
        #expect(!state.loading)
    }

    @Test func paginationDeduplicatesAndRetryClearsOldData() {
        var state = NativeLineupLoadState()
        let first = NativePartyLineupEntry(id: "a", displayName: "DJ North", role: "dj", version: 1)
        let second = NativePartyLineupEntry(id: "b", displayName: "MC West", role: "mc", version: 1)
        state.finish(NativePartyLineupPage(entries: [first], nextCursor: "a"), generation: state.generation)
        state.finish(NativePartyLineupPage(entries: [first, second], nextCursor: nil), generation: state.generation, append: true)
        #expect(state.entries.map(\.id) == ["a", "b"])
        state.invalidate()
        #expect(state.entries.isEmpty)
    }

    @Test func sessionClientDisablesCachingAndPersistentStorage() {
        let client = NativePartyLineupAPI.session(authorization: nil).client
        defer { client.urlSession.invalidateAndCancel() }
        let configuration = client.urlSession.configuration
        #expect(client.urlSession !== URLSession.shared)
        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
        #expect(configuration.urlCredentialStorage !== URLCredentialStorage.shared)
        #expect(configuration.httpCookieStorage !== HTTPCookieStorage.shared)
        #expect(client.tokenProvider() == nil)
    }

    private func api() -> NativePartyLineupAPI {
        var client = NativePartyLineupAPI.session(authorization: nil).client
        let configuration = client.urlSession.configuration
        client.urlSession.invalidateAndCancel()
        configuration.protocolClasses = [NativePartyLineupStub.self]
        client.baseURL = URL(string: "https://lineup.test")!
        client.urlSession = URLSession(configuration: configuration)
        return NativePartyLineupAPI(client: client)
    }

    @Test func queriesUseGETAndTheEventsLineupNamespace() async throws {
        let page = try await api().page("list", input: ["partyId": "party"])
        #expect(page.entries.first?.displayName == "DJ North")
        let inbox = try await api().page("myInvitations")
        #expect(inbox.entries.first?.displayName == "DJ North")
        let tip = try await api().tip(partyID: "party", entryID: "credit", version: 1, provider: .venmo)
        #expect(tip.tip.safeURL?.absoluteString == "https://venmo.com/DJ_42")
    }

    @Test func handoffRejectsAChangedIdentityVersionOrUnsafeDestination() async {
        await #expect(throws: (any Error).self) {
            _ = try await api().tip(partyID: "party", entryID: "credit", version: 2, provider: .venmo)
        }
        await #expect(throws: (any Error).self) {
            _ = try await api().tip(partyID: "unsafe", entryID: "credit", version: 1, provider: .venmo)
        }
    }

    @Test func mutationUsesPOSTAndDoesNotInterpretUnknownStatusAsSuccess() async throws {
        try await api().mutate("confirm", input: ["id": "credit", "version": 0, "consent": true, "tips": []])
        await #expect(throws: (any Error).self) {
            try await api().mutate("confirm", input: ["id": "bad-reply", "version": 0, "consent": true, "tips": []])
        }
    }
}

/// No shared mutable static handler: tests can run in parallel safely.
private final class NativePartyLineupStub: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "lineup.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let url = request.url else { throw URLError(.badURL) }
            let path = url.path
            let row: [String: Any] = ["id": "credit", "displayName": "DJ North", "role": "dj", "version": 1, "tips": []]
            var reply: [String: Any]
            if path.hasSuffix(".confirm") {
                guard request.httpMethod == "POST" else { throw URLError(.badServerResponse) }
                var data = request.httpBody
                if data == nil, let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var bytes = Data(); var buffer = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }
                        bytes.append(contentsOf: buffer.prefix(count))
                    }
                    data = bytes
                }
                let input = try JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any]
                guard input?["consent"] as? Bool == true, input?["tips"] is [Any] else { throw URLError(.badServerResponse) }
                reply = ["status": input?["id"] as? String == "bad-reply" ? "paid" : "accepted"]
            } else {
                guard request.httpMethod == "GET", request.httpBody == nil,
                      let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "input" })?.value,
                      let data = raw.data(using: .utf8),
                      let input = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.badServerResponse) }
                if path == "/trpc/events.lineup.list" {
                    guard input["partyId"] as? String == "party" else { throw URLError(.badServerResponse) }
                    reply = ["entries": [row]]
                } else if path == "/trpc/events.lineup.myInvitations" {
                    guard input.isEmpty else { throw URLError(.badServerResponse) }
                    reply = ["entries": [row]]
                } else if path == "/trpc/events.lineup.tip" {
                    reply = ["id": "credit", "version": 1, "displayName": "DJ North", "provider": "venmo", "handle": "DJ_42",
                             "url": input["partyId"] as? String == "unsafe" ? "https://evil.test" : "https://venmo.com/DJ_42"]
                } else { throw URLError(.badServerResponse) }
            }
            let data = try JSONSerialization.data(withJSONObject: ["result": ["data": reply]])
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
