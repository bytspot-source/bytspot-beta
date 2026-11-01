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

@Suite("Host payouts")
struct NativeHostPayoutsTests {
    private func status(_ json: String) throws -> NativeHostPayoutStatus {
        try JSONDecoder().decode(NativeHostPayoutStatus.self, from: Data(json.utf8))
    }

    @Test func eachPayoutStateSaysWhatIsTrueAndOffersTheNextStep() throws {
        let none = try status(#"{"status":"none","last4":null,"detail":null,"payoutsLive":false}"#)
        #expect(NativeHostPayoutsContract.headline(none).title == "Get paid for ticket sales")
        #expect(NativeHostPayoutsContract.actionTitle(none.status) == "Set up payouts")

        let pending = try status(#"{"status":"pending","last4":null,"detail":"The processor is reviewing these details","payoutsLive":true}"#)
        #expect(NativeHostPayoutsContract.headline(pending).body == "The processor is reviewing these details")
        #expect(NativeHostPayoutsContract.actionTitle(pending.status) == "Continue setup")

        let restricted = try status(#"{"status":"restricted","last4":null,"detail":null,"payoutsLive":true}"#)
        #expect(NativeHostPayoutsContract.headline(restricted).title == "Stripe needs more information")
        #expect(NativeHostPayoutsContract.actionTitle(restricted.status) == "Update details")

        let active = try status(#"{"status":"active","last4":"6789","detail":null,"payoutsLive":true}"#)
        #expect(NativeHostPayoutsContract.headline(active).title == "Payouts are on")
        #expect(NativeHostPayoutsContract.headline(active).body == "Paid to the account ending in 6789.")
        #expect(NativeHostPayoutsContract.actionTitle(active.status) == "Change bank account")
    }

    @Test func feeAndTimingComeFromTheServerQuote() throws {
        let quote = try JSONDecoder().decode(NativeTicketFeeQuote.self, from: Data(#"{"feeBps":1250,"feePercent":12.5,"hostSharePercent":87.5,"payoutsEnabled":false,"payoutDelayHours":48,"note":"x"}"#.utf8))
        #expect(NativeHostPayoutsContract.feeLine(quote) == "You keep 87.5% of each ticket. Bytspot keeps 12.5%.")
        #expect(NativeHostPayoutsContract.delayLine(quote) == "Your share is sent 48 hours after your party ends.")
        #expect(NativeHostPayoutsContract.percentLabel(10) == "10%")
    }

    @Test func onlyStripePagesAreOpened() {
        #expect(NativeHostPayoutsContract.stripeURL("https://connect.stripe.com/setup/e/acct_1/abc") != nil)
        #expect(NativeHostPayoutsContract.stripeURL("https://connect.stripe.com/express/acct_1/xyz") != nil)
        #expect(NativeHostPayoutsContract.stripeURL("http://connect.stripe.com/setup/e/acct_1/abc") == nil)
        #expect(NativeHostPayoutsContract.stripeURL("https://connect.stripe.com.example.net/setup") == nil)
        #expect(NativeHostPayoutsContract.stripeURL("https://notstripe.com/setup") == nil)
        #expect(NativeHostPayoutsContract.stripeURL(nil) == nil)
    }

    @Test func onlyThePayoutRefusalOffersSetupWhenPublishing() {
        let refusal = BytspotAPIClient.APIError.server(status: 412, body: #"{"error":{"message":"Set up payouts before publishing a party with paid tickets. Free parties do not need payouts.","code":-32012,"data":{"code":"PRECONDITION_FAILED"}}}"#)
        #expect(NativeHostPayoutsContract.needsSetup(refusal))
        #expect(NativePartyStudioError.publishUserMessage(for: refusal) == NativeHostPayoutsContract.setupRequiredMessage)

        let other = BytspotAPIClient.APIError.server(status: 412, body: #"{"error":{"message":"Add at least one recap photo before publishing."}}"#)
        #expect(!NativeHostPayoutsContract.needsSetup(other))
        #expect(NativePartyStudioError.publishUserMessage(for: other) != NativeHostPayoutsContract.setupRequiredMessage)
    }

    @MainActor @Test func stripeReturnLinkOpensGetPaid() throws {
        let coordinator = NativeNavigationCoordinator()
        #expect(coordinator.handle(url: try #require(URL(string: "bytspot://payouts/host"))))
        #expect(coordinator.requestedProfilePanel == .getPaid)
        #expect(coordinator.requestedDestination == nil)
        #expect(NativeProfilePanel.getPaid.title == "Get paid")
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

@Suite("Party request notes")
struct NativePartyRequestNotesTests {
    private func note(_ id: String, status: String = "accepted") -> NativePartyRequestNote {
        NativePartyRequestNote(id: id, performerId: "dj", performerName: "DJ North", performerRole: "dj", body: "Play Outkast", senderName: nil,
                               status: status, version: 1, createdAt: "2026-10-29T02:00:00Z", acceptedAt: "2026-10-29T02:01:00Z", playedAt: nil)
    }
    private func eligibility(_ json: String) throws -> NativePartyRequestEligibility {
        try JSONDecoder().decode(NativePartyRequestEligibility.self, from: Data(json.utf8))
    }

    @Test func requestsAreSentOnlyOnPaidTiersAndCapped() {
        let vip = NativePartyTicketTier(name: "First Drop", priceCents: 4000, quantity: 10, requiredMembershipTier: .green, requestNotes: 3)
        #expect(vip.rpcInput["requestNotes"] as? Int == 3)
        let free = NativePartyTicketTier(name: "Comp", priceCents: 0, quantity: 10, requiredMembershipTier: .green, requestNotes: 3)
        #expect(free.rpcInput["requestNotes"] == nil)
        let none = NativePartyTicketTier(name: "First Drop", priceCents: 2500, quantity: 10, requiredMembershipTier: .green)
        #expect(none.rpcInput["requestNotes"] == nil)
        let tooMany = NativePartyTicketTier(name: "First Drop", priceCents: 2500, quantity: 10, requiredMembershipTier: .green, requestNotes: 9)
        #expect(tooMany.rpcInput["requestNotes"] as? Int == 5)
    }

    @Test func notesAreOneLineOfPlainTextUpTo140Characters() {
        #expect(NativePartyRequestsContract.normalizedBody("  Play Outkast  ") == "Play Outkast")
        #expect(NativePartyRequestsContract.normalizedBody("line one\nline two") == nil)
        #expect(NativePartyRequestsContract.normalizedBody("   ") == nil)
        #expect(NativePartyRequestsContract.normalizedBody(String(repeating: "x", count: 141)) == nil)
        #expect(NativePartyRequestsContract.normalizedBody("hi \u{202E}there") == nil)
    }

    @Test func eligibilityDecodesAndSaysWhatIsTrue() throws {
        let open = try eligibility(#"{"state":"open","allowance":3,"used":1,"remaining":2,"opensAt":"x","closesAt":"y","performers":[{"id":"dj","displayName":"DJ North","role":"dj"}],"tiersWithRequests":[{"name":"VIP","priceCents":4000,"requestNotes":3}]}"#)
        #expect(open.canSend)
        #expect(NativePartyRequestsContract.eligibilityHeadline(open) == "2 of 3 requests left")

        let general = try eligibility(#"{"state":"no-request-ticket","allowance":0,"used":0,"remaining":0,"opensAt":"x","closesAt":"y","performers":[],"tiersWithRequests":[{"name":"VIP","priceCents":4000,"requestNotes":3}]}"#)
        #expect(!general.canSend)
        #expect(NativePartyRequestsContract.eligibilityHeadline(general) == "VIP tickets include 3 requests to the lineup.")

        let noPerk = try eligibility(#"{"state":"no-request-ticket","allowance":0,"used":0,"remaining":0,"opensAt":"x","closesAt":"y","performers":[],"tiersWithRequests":[]}"#)
        #expect(NativePartyRequestsContract.eligibilityHeadline(noPerk) == nil)

        let early = try eligibility(#"{"state":"not-started","allowance":1,"used":0,"remaining":1,"opensAt":"x","closesAt":"y","performers":[{"id":"dj","displayName":"DJ North","role":"dj"}],"tiersWithRequests":[]}"#)
        #expect(!early.canSend)
        #expect(NativePartyRequestsContract.eligibilityHeadline(early) == "Your ticket includes 1 request to the lineup. They open when the party starts.")
    }

    @Test func aNewlyAcceptedNoteJumpsToTheFrontAndOtherwiseTheCurrentOneStays() {
        let a = note("a"), b = note("b"), c = note("c")
        #expect(NativePartyStageCarousel.nextIndex(previous: [], fresh: [a, b], index: 0) == 0)
        #expect(NativePartyStageCarousel.nextIndex(previous: [a, b], fresh: [c, a, b], index: 1) == 0)
        #expect(NativePartyStageCarousel.nextIndex(previous: [a, b, c], fresh: [a, c], index: 2) == 1)
        #expect(NativePartyStageCarousel.nextIndex(previous: [a, b], fresh: [a], index: 1) == 0)
        #expect(NativePartyStageCarousel.nextIndex(previous: [a], fresh: [], index: 0) == 0)
        #expect(NativePartyStageCarousel.current([], index: 3) == nil)
        #expect(NativePartyStageCarousel.current([a, b], index: 3)?.id == "b")
    }

    @Test func guestStatusWordingNeverPromisesAPlay() {
        #expect(NativePartyRequestsContract.guestStatusLabel("sent") == "Waiting for the performer")
        #expect(NativePartyRequestsContract.guestStatusLabel("dismissed") == "Not picked")
        #expect(NativePartyRequestsContract.perTicketLabel(0) == "No lineup requests")
    }
}

@Suite("Party music on Home")
struct NativePartyMusicTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return calendar
    }
    private func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }
    private func row(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var row: [String: Any] = [
            "id": "party-1", "title": "Afro Night", "venueName": "Aster Room",
            "startsAt": "2026-11-07T01:00:00.000Z", "endsAt": "2026-11-07T05:00:00.000Z",
            "door": "open", "locationHidden": false, "latitude": 33.787, "longitude": -84.384, "distanceMiles": 1.2,
            "music": (["kind": "dj", "genres": ["afrobeats", "amapiano"], "setStartsAt": "2026-11-07T02:30:00.000Z"] as [String: Any]),
            "entry": ["kind": "ticket", "fromCents": 1500] as [String: Any],
            "performers": [["displayName": "DJ Kofi", "role": "dj"]],
            "coverURL": "https://api.bytspot.app/media/parties/m1",
        ]
        for (key, value) in overrides { row[key] = value }
        return row
    }

    @Test func decodesAConfirmedPublicListing() throws {
        let listing = try #require(NativeMusicListing.decode(row()))
        #expect(listing.music == NativePartyMusic(kind: .dj, genres: [.afrobeats, .amapiano], setStartsAt: date("2026-11-07T02:30:00Z")))
        #expect(listing.entryLine == "Tickets from $15")
        #expect(listing.performerLine == "With DJ Kofi")
        #expect(listing.confirmationLine == "Host-published · Performer confirmed")
        #expect(listing.distanceLine == "1.2 mi")
        #expect(listing.directionsURL?.absoluteString == "https://maps.apple.com/?daddr=33.787,-84.384&dirflg=d")
        #expect(listing.invitation.partyID == "party-1")
    }

    @Test func refusesHiddenPlacesAndUndeclaredMusic() {
        #expect(NativeMusicListing.decode(row(["door": "approval", "locationHidden": true])) == nil)
        #expect(NativeMusicListing.decode(row(["venueName": NSNull()])) == nil)
        #expect(NativeMusicListing.decode(row(["latitude": 0.0, "longitude": 0.0])) == nil)
        #expect(NativeMusicListing.decode(row(["music": NSNull()])) == nil)
        #expect(NativeMusicListing.decode(row(["music": (["kind": "karaoke", "genres": ["jazz"]] as [String: Any])])) == nil)
        #expect(NativeMusicListing.decode(row(["music": (["kind": "dj", "genres": ["polka"]] as [String: Any])])) == nil)
    }

    @Test func freeEntryAndNoCreditsReadPlainly() throws {
        let listing = try #require(NativeMusicListing.decode(row(["entry": ["kind": "free"], "performers": [] as [[String: Any]]])))
        #expect(listing.entryLine == "Free")
        #expect(listing.performerLine == nil)
        #expect(listing.confirmationLine == "Host-published")
    }

    @Test func timeLineNamesTheSetAndNeverClaimsPlayingNow() throws {
        let listing = try #require(NativeMusicListing.decode(row()))
        // 8 PM Friday New York: the 9:30 PM set is later today.
        #expect(listing.timeLine(now: date("2026-11-07T01:00:00Z"), calendar: calendar) == "Set starts 9:30 PM")
        #expect(listing.timeLine(now: date("2026-11-07T03:00:00Z"), calendar: calendar) == "Set started 9:30 PM")
        #expect(listing.timeLine(now: date("2026-11-05T15:00:00Z"), calendar: calendar) == "Fri · Set starts 9:30 PM")
        let noSet = try #require(NativeMusicListing.decode(row(["music": (["kind": "live", "genres": ["jazz"]] as [String: Any])])))
        #expect(noSet.timeLine(now: date("2026-11-06T22:00:00Z"), calendar: calendar) == "Starts 8:00 PM")
    }

    @Test func filtersLetBothKindsAnswerEitherChip() throws {
        let dj = try #require(NativeMusicListing.decode(row(["id": "a"])))
        let both = try #require(NativeMusicListing.decode(row(["id": "b", "music": (["kind": "both", "genres": ["jazz"]] as [String: Any])])))
        let live = try #require(NativeMusicListing.decode(row(["id": "c", "music": (["kind": "live", "genres": ["gospel", "jazz"]] as [String: Any])])))
        #expect(NativeMusicFilter(kind: .live).apply([dj, both, live]).map(\.id) == ["b", "c"])
        #expect(NativeMusicFilter(kind: .dj).apply([dj, both, live]).map(\.id) == ["a", "b"])
        #expect(NativeMusicFilter(genre: .jazz).apply([dj, both, live]).map(\.id) == ["b", "c"])
        #expect(NativeMusicFilter.availableGenres(in: [live, dj]) == [.afrobeats, .amapiano, .jazz, .gospel])
    }

    @Test func tonightRunsToFourAndTheWeekendIsFridayEveningToMonday() {
        let wednesdayEvening = date("2026-11-04T23:00:00Z") // 6 PM Wed New York
        let tonight = NativeMusicWindow.tonight.interval(now: wednesdayEvening, calendar: calendar)
        #expect(tonight.start == wednesdayEvening)
        #expect(tonight.end == date("2026-11-05T09:00:00Z")) // 4 AM Thu
        let weekend = NativeMusicWindow.weekend.interval(now: wednesdayEvening, calendar: calendar)
        #expect(weekend.start == date("2026-11-06T22:00:00Z")) // Fri 5 PM
        #expect(weekend.end == date("2026-11-09T09:00:00Z")) // Mon 4 AM
        let saturdayNoon = date("2026-11-07T17:00:00Z")
        let underway = NativeMusicWindow.weekend.interval(now: saturdayNoon, calendar: calendar)
        #expect(underway.start == saturdayNoon)
        #expect(underway.end == date("2026-11-09T09:00:00Z"))
        #expect(NativeMusicWindow.offersWeekendFallback(now: wednesdayEvening, calendar: calendar))
        #expect(!NativeMusicWindow.offersWeekendFallback(now: saturdayNoon, calendar: calendar))
    }

    @Test func hostDraftSendsMusicOnlyWhenDeclaredAndCapsGenresAtTwo() {
        let start = date("2026-11-07T01:00:00Z")
        var draft = NativePartyMusicDraft(defaultSetStart: start)
        #expect(draft.music == nil)
        draft.kind = .dj
        draft.toggle(.afrobeats); draft.toggle(.house); draft.toggle(.jazz)
        #expect(draft.genres == [.afrobeats, .house])
        draft.hasSetTime = true
        draft.setStartsAt = start.addingTimeInterval(90 * 60)
        let input = NativePartyDraftInput(templateID: .listeningParty, title: "Afro Night", tagline: "", startsAt: start, endsAt: start.addingTimeInterval(4 * 3600), venueName: "Aster Room", capacity: 40, accessMode: .freeRSVP, requiredMembershipTier: .green, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .listeningParty(.listeningSession), music: draft.music)
        let music = input.rpcInput["music"] as? [String: Any]
        #expect(music?["kind"] as? String == "dj")
        #expect(music?["genres"] as? [String] == ["afrobeats", "house"])
        #expect(music?["setStartsAt"] as? String == "2026-11-07T02:30:00Z")
        #expect(NativePartyMusic(kind: .dj, genres: [], setStartsAt: nil).validationMessage(startsAt: start, endsAt: nil) != nil)
        #expect(NativePartyMusic(kind: .dj, genres: [.house], setStartsAt: start.addingTimeInterval(-60)).validationMessage(startsAt: start, endsAt: nil) == "The set cannot start before the Party.")
        #expect(NativePartyMusic(kind: .dj, genres: [.house], setStartsAt: start.addingTimeInterval(5 * 3600)).validationMessage(startsAt: start, endsAt: start.addingTimeInterval(4 * 3600)) == "The set has to start before the Party ends.")
        draft.kind = nil
        let silent = NativePartyDraftInput(templateID: .listeningParty, title: "Afro Night", tagline: "", startsAt: start, venueName: "Aster Room", capacity: 40, accessMode: .freeRSVP, requiredMembershipTier: .green, audienceCircleIDs: [], itinerary: [], ticketTiers: [], cohosts: [], templateConfiguration: .listeningParty(.listeningSession), music: draft.music)
        #expect(silent.rpcInput["music"] == nil)
    }
}
