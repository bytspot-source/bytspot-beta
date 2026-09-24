import Foundation
import Testing
@testable import App

@Suite("Party commerce contracts")
struct NativePartyCommerceTests {
    private let key = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    private func admission(_ action: String, _ status: String, granted: Bool = false) -> NativePartyAdmission {
        NativePartyAdmission(partyId: "party-1", action: action, guest: .init(status: status, accessGranted: granted))
    }
    private func offer(state: String = "open", startsAt: String = "2099-01-01T00:00:00Z", terms: String = "included", remaining: Int = 2) -> NativePartyCommerceOffer {
        NativePartyCommerceOffer(id: "party-1", accessMode: "paid-ticket", ticketTiers: [
            .init(name: "Door", priceCents: 2500, quantity: 5, requiredMembershipTier: "green"),
        ], sessions: [
            .init(id: "session-1", name: "Table", startsAt: startsAt, endsAt: "2099-01-02T00:00:00Z", priceCents: 90000, bottleCount: 4, bottleTerms: terms, remaining: remaining, state: state, requiredMembershipTier: nil),
        ])
    }

    @Test func choicesAreExplicitAndConfirmedGuestsCanBuyOnlyTheSession() {
        let empty = NativePartyCommerceSelection()
        #expect(empty.isEmpty)
        #expect(!empty.isAllowed(admission: admission("ticket", "eligible"), offer: offer()))
        let table = NativePartyCommerceSelection(sessionID: "session-1")
        #expect(table.isAllowed(admission: admission("view-pass", "ticketed", granted: true), offer: offer()))
        #expect(table.isAllowed(admission: admission("view-pass", "rsvp", granted: true), offer: offer()))
        #expect(!table.isAllowed(admission: admission("ticket", "eligible"), offer: offer()))
        let combined = NativePartyCommerceSelection(ticketTierName: "Door", sessionID: "session-1")
        #expect(combined.isAllowed(admission: admission("ticket", "eligible"), offer: offer()))
        #expect(!combined.isAllowed(admission: admission("view-pass", "ticketed", granted: true), offer: offer()))
        #expect(!table.isAllowed(admission: admission("view-pass", "host", granted: true), offer: offer()))
        let input = table.input(partyID: "party-1", key: key)
        #expect(input["ticketTierName"] == nil)
        #expect(input["sessionId"] as? String == "session-1")
        #expect(input["idempotencyKey"] as? String == key.uuidString.lowercased())
    }

    @Test(arguments: ["pending", "declined", "refund-required", "membership-required"])
    func unresolvedAdmissionCannotBuyOrBecomeAPass(_ status: String) {
        let state = admission("unavailable", status)
        #expect(!state.confirmed)
        #expect(!state.canRSVP)
        #expect(!state.canChooseSession)
        #expect(!state.canChooseTicket)
    }

    @Test func inventoryAndUnknownBottleTermsFailClosed() {
        let table = NativePartyCommerceSelection(sessionID: "session-1")
        let state = admission("view-pass", "approved", granted: true)
        #expect(!table.isAllowed(admission: state, offer: offer(state: "taken")))
        #expect(!table.isAllowed(admission: state, offer: offer(startsAt: "2020-01-01T00:00:00Z")))
        #expect(!table.isAllowed(admission: state, offer: offer(terms: "unknown")))
        #expect(offer(terms: "minimum").sessions[0].terms.contains("charged separately"))
        #expect(admission("request-approval", "eligible").canRSVP)
        #expect(admission("rsvp", "eligible").canRSVP)
    }

    @Test(arguments: [
        "http://checkout.stripe.com/c/pay/test", "https://checkout.stripe.com.evil.test/c/pay/test",
        "https://stripe.com/c/pay/test", "https://checkout.stripe.com@evil.test/c/pay/test",
        "https://name@checkout.stripe.com/c/pay/test", "https://checkout.stripe.com:444/c/pay/test",
        "//checkout.stripe.com/c/pay/test", "javascript:alert(1)",
        "https://checkout.stripe.com\\@evil.test/c/pay/test", "https://checkout.stripe.com/redirect",
    ])
    func unsafeCheckoutURLsAreRejected(_ url: String) {
        #expect(NativePartyCommerceFormat.checkoutURL(url) == nil)
    }
    @Test func onlyHostedStripeCheckoutIsOpened() {
        #expect(NativePartyCommerceFormat.checkoutURL("https://checkout.stripe.com/c/pay/example")?.host == "checkout.stripe.com")
        #expect(NativePartyCommerceFormat.checkoutURL("https://checkout.stripe.com:443/pay/example") != nil)
    }

    @Test func staleRequestsCannotCrossAccountsTokensOrDismissal() {
        let a = NativePartyCommerceScope(userID: "a", authorization: "test-scope-a")
        let b = NativePartyCommerceScope(userID: "b", authorization: "test-scope-b")
        var gate = NativePartyCommerceGeneration()
        let request = gate.id
        #expect(gate.accepts(request, captured: a, current: a))
        #expect(!gate.accepts(request, captured: a, current: b))
        #expect(!gate.accepts(request, captured: a, current: .init(userID: "a", authorization: "replacement-test-scope")))
        #expect(!gate.accepts(request, captured: a, current: .init(userID: nil, authorization: nil)))
        gate.invalidate()
        #expect(!gate.accepts(request, captured: a, current: a))
    }

    @MainActor @Test func retryKeysSurviveReopeningButNeverCrossAccountsOrSelections() throws {
        let suite = "NativePartyCommerceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = NativePartyCommerceRetries(defaults: defaults)
        let choice = NativePartyCommerceSelection(sessionID: "session-1")
        let original = store.key(userID: "a", partyID: "party-1", selection: choice)
        #expect(NativePartyCommerceRetries(defaults: defaults).key(userID: "a", partyID: "party-1", selection: choice) == original)
        #expect(store.key(userID: "b", partyID: "party-1", selection: choice) != original)
        #expect(store.key(userID: "a", partyID: "party-2", selection: choice) != original)
        #expect(store.key(userID: "a", partyID: "party-1", selection: .init(ticketTierName: "Door", sessionID: "session-1")) != original)
        let pending = try receipt(status: "pending", retryKey: original)
        store.reconcile(userID: "a", purchases: [pending])
        #expect(store.key(userID: "a", partyID: "party-1", selection: choice) == original)
        let completed = try receipt(status: "completed", retryKey: original)
        store.reconcile(userID: "a", purchases: [completed])
        let next = store.key(userID: "a", partyID: "party-1", selection: choice)
        #expect(next != original)
        store.reconcile(userID: "a", purchases: [completed])
        #expect(store.key(userID: "a", partyID: "party-1", selection: choice) == next)
    }

    @Test func receiptsDoNotInferAdmissionOrSuccessfulPaymentFromExpiry() throws {
        #expect(try receipt(status: "pending", retryKey: key).statusLabel == "Reservation elapsed — payment not confirmed")
        #expect(try receipt(status: "refund-required", retryKey: key).statusLabel == "Refund required — contact the host")
        #expect(try receipt(status: "unknown", retryKey: key).statusLabel == "Payment status unavailable")
        #expect(!admission("ticket", "checkout-pending").confirmed)
    }

    @MainActor @Test func pendingLastTableResumesWithServerKeyAndExactTuple() throws {
        let suite = "NativePartyCommerceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = NativePartyCommerceRetries(defaults: defaults)
        let state = admission("view-pass", "rsvp", granted: true)
        let pending = try activeReceipt()
        let choice = pending.selection
        #expect(!choice.isAllowed(admission: state, offer: offer(state: "taken", remaining: 0)))
        #expect(pending.canResume(admission: state))
        #expect(store.existingKey(userID: "a", partyID: "party-1", selection: choice) == nil)
        let recovered = try #require(store.recoveryKey(userID: "a", partyID: "party-1", selection: choice, admission: state, purchases: [pending]))
        #expect(recovered == key)
        #expect(store.existingKey(userID: "a", partyID: "party-1", selection: choice) == nil)
        let input = choice.input(partyID: "party-1", key: recovered)
        #expect(input["sessionId"] as? String == "session-1")
        #expect(input["ticketTierName"] == nil)
        #expect(store.recoveryKey(userID: "a", partyID: "party-2", selection: choice, admission: state, purchases: [pending]) == nil)
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: .init(sessionID: "other"), admission: state, purchases: [pending]) == nil)
        let combined = try activeReceipt(overrides: ["ticketTierName": "Door"])
        let waiting = admission("ticket", "checkout-pending")
        #expect(combined.canResume(admission: waiting))
        #expect(!combined.canResume(admission: state)) // Never charge the door twice.
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: combined.selection, admission: waiting, purchases: [combined]) == key)
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: .init(ticketTierName: "Door"), admission: waiting, purchases: [combined]) == nil)
    }

    @MainActor @Test func lostResponseRecoveryRequiresAnExistingScopedUUIDAndNeverMintsOne() throws {
        let suite = "NativePartyCommerceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = NativePartyCommerceRetries(defaults: defaults)
        let choice = NativePartyCommerceSelection(sessionID: "session-1")
        let state = admission("view-pass", "rsvp", granted: true)
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: choice, admission: state, purchases: []) == nil)
        #expect(store.existingKey(userID: "a", partyID: "party-1", selection: choice) == nil)
        let original = store.key(userID: "a", partyID: "party-1", selection: choice)
        #expect(!choice.isAllowed(admission: state, offer: offer(remaining: 0)))
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: choice, admission: state, purchases: []) == original)
        #expect(store.recoveryKey(userID: "b", partyID: "party-1", selection: choice, admission: state, purchases: []) == nil)
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: .init(sessionID: "other"), admission: state, purchases: []) == nil)
        let serverPending = try activeReceipt()
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: choice, admission: state, purchases: [serverPending]) == key)
        store.remember(key, userID: "a", partyID: "party-1", selection: choice)
        #expect(store.existingKey(userID: "a", partyID: "party-1", selection: choice) == key)
    }

    @MainActor @Test(arguments: ["completed", "expired", "cancelled", "refunded", "refund-required", "unknown"])
    func knownNonPendingPurchaseNeverFallsBackToLostResponse(_ status: String) throws {
        let suite = "NativePartyCommerceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = NativePartyCommerceRetries(defaults: defaults)
        let purchase = try activeReceipt(overrides: ["status": status])
        let state = admission("view-pass", "rsvp", granted: true)
        store.remember(key, userID: "a", partyID: "party-1", selection: purchase.selection)
        #expect(!purchase.canResume(admission: state))
        #expect(store.recoveryKey(userID: "a", partyID: "party-1", selection: purchase.selection, admission: state, purchases: [purchase]) == nil)
        #expect(store.existingKey(userID: "a", partyID: "party-1", selection: purchase.selection) == key)
    }

    @Test func pendingResumePreservesExpiryWithdrawalAndAdmissionSafeguards() throws {
        let state = admission("view-pass", "rsvp", granted: true)
        let pending = try activeReceipt()
        #expect(try activeReceipt(overrides: ["status": "creating"]).canResume(admission: state))
        #expect(!pending.canResume(admission: admission("unavailable", "declined")))
        #expect(!pending.canResume(admission: admission("view-pass", "declined", granted: true)))
        #expect(!pending.canResume(admission: admission("unavailable", "membership-required")))
        #expect(!pending.canResume(admission: admission("unavailable", "refund-required")))
        #expect(!pending.canResume(admission: admission("ticket", "checkout-pending"))) // Table alone is not admission.
        let expiry = try #require(NativeAccountDeletionFormat.date(fromISO: "2098-01-01T00:00:00Z"))
        #expect(!pending.canResume(admission: state, now: expiry))
        #expect(try !activeReceipt(overrides: ["reservationElapsed": true]).canResume(admission: state))
        #expect(try !activeReceipt(overrides: ["reservationExpiresAt": "invalid"]).canResume(admission: state))
        #expect(try !activeReceipt(overrides: ["retryKey": "invalid"]).canResume(admission: state))
        var session = CommerceProtocol.session
        session["withdrawn"] = true
        #expect(try !activeReceipt(overrides: ["session": session]).canResume(admission: state))
        session["withdrawn"] = false; session["startsAt"] = "2020-01-01T00:00:00Z"
        #expect(try !activeReceipt(overrides: ["session": session]).canResume(admission: state))
        var party = CommerceProtocol.party
        party["closed"] = true
        #expect(try !activeReceipt(overrides: ["party": party]).canResume(admission: state))
    }

    @Test func credentialDisplayDeadlineHonorsTTLAndBoundsLegacyResponses() throws {
        let now = try #require(NativeAccountDeletionFormat.date(fromISO: "2030-01-01T00:00:00Z"))
        let short = NativePartyCommerceCredential.displayDeadline("2030-01-01T00:00:10Z", requestedAt: now, now: now)
        #expect(short == now.addingTimeInterval(10))
        let value = NativePartyCommerceCredential(value: "unused-test-value", expiresAt: try #require(short))
        #expect(value.isValid(now: now.addingTimeInterval(9)))
        #expect(!value.isValid(now: now.addingTimeInterval(10)))
        #expect(!value.isValid(now: now.addingTimeInterval(11)))
        #expect(NativePartyCommerceCredential.displayDeadline("2030-01-01T01:00:00Z", requestedAt: now, now: now) == now.addingTimeInterval(60))
        #expect(NativePartyCommerceCredential.displayDeadline(nil, requestedAt: now, now: now) == now.addingTimeInterval(60))
        #expect(NativePartyCommerceCredential.displayDeadline(nil, requestedAt: now, now: now.addingTimeInterval(60)) == nil)
        let invalidExpiries: [Any] = ["invalid", "2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z", NSNull(), 123]
        for invalid in invalidExpiries {
            #expect(NativePartyCommerceCredential.displayDeadline(invalid, requestedAt: now, now: now) == nil)
        }
    }

    private func activeReceipt(overrides: [String: Any] = [:]) throws -> NativePartyCommercePurchase {
        var row = CommerceProtocol.purchase
        row["reservationExpiresAt"] = "2098-01-01T00:00:00Z"
        row["reservationElapsed"] = false
        row.merge(overrides) { _, new in new }
        return try NativePartyCommerceAPI.decode(NativePartyCommercePurchase.self, row)
    }
    private func receipt(status: String, retryKey: UUID) throws -> NativePartyCommercePurchase {
        var row = CommerceProtocol.purchase
        row["status"] = status
        row["retryKey"] = retryKey.uuidString.lowercased()
        return try NativePartyCommerceAPI.decode(NativePartyCommercePurchase.self, row)
    }
    private func api() -> NativePartyCommerceAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CommerceProtocol.self]
        configuration.urlCache = nil
        return NativePartyCommerceAPI(client: BytspotAPIClient(baseURL: URL(string: "https://commerce.test")!, urlSession: URLSession(configuration: configuration)))
    }

    @Test func nativeAPIExecutesResolveRSVPCheckoutAndLedgerWireContracts() async throws {
        let api = api()
        let state = try await api.admission("party-1")
        #expect(state.confirmed)
        try await api.rsvp("party-1", key: key)
        let table = NativePartyCommerceSelection(sessionID: "session-1")
        let url = try await api.checkout("party-1", selection: table, key: key)
        #expect(url.host == "checkout.stripe.com")
        let inventory = try await api.offer("party-1")
        #expect(inventory.sessions[0].bottleTerms == "minimum")
        let page = try await api.mine("purchases", cursor: "next", partyID: "party-1")
        #expect(page.purchases?.first?.status == "pending")
        #expect(page.nextCursor == "more")
        let credential = try await api.credential("party-1")
        #expect(credential.value.count == 43)
        #expect(credential.isValid())
        #expect(credential.expiresAt.timeIntervalSinceNow <= 60)
        #expect(NativePartyDoorPassInput.normalized(credential.value) != nil)
    }
    @MainActor @Test func soldOutPendingCheckoutRecoveryExecutesTheOriginalWireRequest() async throws {
        let suite = "NativePartyCommerceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = NativePartyCommerceRetries(defaults: defaults)
        let api = api()
        let state = try await api.admission("party-1")
        let inventory = try await api.offer("party-1")
        let page = try await api.mine("purchases", partyID: "party-1")
        let purchase = try #require(page.purchases?.first)
        #expect(!purchase.selection.isAllowed(admission: state, offer: inventory))
        let recovered = try #require(store.recoveryKey(userID: "a", partyID: "party-1", selection: purchase.selection, admission: state, purchases: page.purchases ?? []))
        // The fixture rejects a new UUID or any change to the original tuple.
        let url = try await api.checkout("party-1", selection: purchase.selection, key: recovered)
        #expect(url.host == "checkout.stripe.com")
        store.remember(recovered, userID: "a", partyID: "party-1", selection: purchase.selection)
        let lostResponse = try #require(store.recoveryKey(userID: "a", partyID: "party-1", selection: purchase.selection, admission: state, purchases: []))
        #expect(lostResponse == recovered)
        let retryURL = try await api.checkout("party-1", selection: purchase.selection, key: lostResponse)
        #expect(retryURL.host == "checkout.stripe.com")
    }

    @Test func signedCredentialAndLegacyResponsesHaveBoundedLifetimes() async throws {
        let signed = try await api().credential("signed-credential")
        #expect(signed.isValid())
        #expect(signed.expiresAt.timeIntervalSinceNow <= 10)
        #expect(signed.value.contains("."))
        let legacy = try await api().credential("legacy-credential")
        #expect(legacy.isValid())
        #expect(legacy.expiresAt.timeIntervalSinceNow <= 60)
    }

    @Test(arguments: ["bad-credential", "expired-credential", "malformed-expiry", "null-expiry", "malformed-credential", "trailing-newline"])
    func credentialEndpointCannotFallBackToPartyIDOrInvitationURL(_ partyID: String) async {
        do {
            _ = try await api().credential(partyID)
            Issue.record("Invalid credential was accepted")
        } catch { /* Expected: never manufacture a QR fallback. */ }
    }
    @Test func unsafeCheckoutResponseIsNeverOpened() async {
        do {
            _ = try await api().checkout("party-1", selection: .init(sessionID: "unsafe"), key: key)
            Issue.record("Unsafe checkout URL was accepted")
        } catch { /* Expected; no browser is used by this test. */ }
    }
}

/// Immutable per-request fixture: tests can run concurrently, no live network
/// or Stripe methods are invoked. Rejects malformed native payloads with 400.
private final class CommerceProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "commerce.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    static var party: [String: Any] {
        ["id": "party-1", "title": "The night", "startsAt": "2099-01-01T00:00:00Z", "isPast": false, "closed": false]
    }
    static var session: [String: Any] {
        ["id": "session-1", "name": "Table", "startsAt": "2099-01-01T00:00:00Z", "endsAt": "2099-01-02T00:00:00Z", "bottleCount": 4, "bottleTerms": "minimum", "withdrawn": false]
    }
    static var purchase: [String: Any] {
        ["id": "purchase", "status": "pending", "retryKey": "00000000-0000-4000-8000-000000000001", "amountCents": 90000,
         "sessionAmountCents": 90000, "currency": "usd", "reservationExpiresAt": "2020-01-01T00:00:00Z",
         "reservationElapsed": true, "party": party, "session": session]
    }
    override func startLoading() {
        do {
            var payload: Any = [:]
            var status = 200
            let path = request.url?.path ?? ""
            let input: [String: Any]
            if request.httpMethod == "POST" {
                var data = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        guard count > 0 else { break }
                        data.append(contentsOf: buffer.prefix(count))
                    }
                }
                input = (try JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            } else {
                let raw = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "input" }?.value ?? "{}"
                input = (try JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any] ?? [:]
            }
            switch path {
            case "/trpc/events.pass.resolve":
                payload = ["partyId": input["partyId"] ?? "", "action": "view-pass", "guest": ["status": "rsvp", "accessGranted": true]]
            case "/trpc/events.invite":
                var session = Self.session
                session.merge(["priceCents": 90000, "remaining": 0, "state": "taken"]) { _, new in new }
                payload = ["id": "party-1", "accessMode": "free-rsvp", "ticketTiers": [], "sessions": [session]]
            case "/trpc/events.rsvp.create":
                status = request.httpMethod == "POST" && input["idempotencyKey"] as? String == "00000000-0000-4000-8000-000000000001" ? 200 : 400
                payload = ["status": "pending", "accessGranted": false]
            case "/trpc/events.tickets.createCheckout":
                status = request.httpMethod == "POST" && input["partyId"] as? String == "party-1" && input["ticketTierName"] == nil
                    && ["session-1", "unsafe"].contains(input["sessionId"] as? String ?? "")
                    && input["idempotencyKey"] as? String == "00000000-0000-4000-8000-000000000001" ? 200 : 400
                payload = ["url": input["sessionId"] as? String == "unsafe" ? "https://evil.test/checkout" : "https://checkout.stripe.com/c/pay/example"]
            case "/trpc/events.commerce.mine":
                status = request.httpMethod == "GET" && input["kind"] as? String == "purchases"
                    && (input["cursor"] == nil || input["cursor"] as? String == "next")
                    && input["partyId"] as? String == "party-1" ? 200 : 400
                var purchase = Self.purchase
                if input["cursor"] == nil {
                    purchase["reservationExpiresAt"] = "2098-01-01T00:00:00Z"
                    purchase["reservationElapsed"] = false
                }
                payload = ["kind": "purchases", "purchases": [purchase], "nextCursor": "more"]
            case "/trpc/events.pass.attendeeCredential":
                let partyID = input["partyId"] as? String ?? ""
                status = request.httpMethod == "POST" ? 200 : 400
                var row: [String: Any] = ["partyId": partyID, "attendeeCredential": partyID == "bad-credential" ? "https://bytspot.app/party/party-1" : String(repeating: "a", count: 43)]
                switch partyID {
                case "expired-credential": row["expiresAt"] = "2020-01-01T00:00:00Z"
                case "malformed-expiry": row["expiresAt"] = "invalid"
                case "null-expiry": row["expiresAt"] = NSNull()
                case "malformed-credential": row["attendeeCredential"] = String(repeating: "a", count: 44)
                case "trailing-newline": row["attendeeCredential"] = String(repeating: "a", count: 43) + "\n"
                case "legacy-credential": break
                case "signed-credential":
                    row["attendeeCredential"] = "test." + String(repeating: "a", count: 64) + "." + String(repeating: "b", count: 43)
                    row["expiresAt"] = ISO8601DateFormatter().string(from: Date().addingTimeInterval(10))
                default: row["expiresAt"] = "2099-01-01T00:00:00Z"
                }
                payload = row
            default: status = 404
            }
            let data = try JSONSerialization.data(withJSONObject: ["result": ["data": payload]])
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
}
