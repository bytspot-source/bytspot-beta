import Foundation

#if DEBUG
/// DEBUG-only guard locking the client-side contact-hash contract against the
/// server (`src/lib/contactHash.ts` + `contactHash.test.ts`). If any expectation
/// here drifts, Apple-sourced hashes stop matching server-stored hashes.
/// Runs only when the opt-in SwiftUI root is enabled via BYT_NATIVE_ROOT=1.
enum NativeContactSyncSelfTests {
    static func runIfRequested() {
        guard NativeMigrationConfig.isNativeRootEnabled else { return }
        run()
    }

    private static func run() {
        assertNormalization()
        assertHashContract()
        assertSuggestionRanking()
    }

    private static func assertNormalization() {
        precondition(BytspotContactHasher.normalizeEmail("  Jane.Doe@GMAIL.com ") == "jane.doe@gmail.com", "NativeContactSyncSelfTests: email normalization drifted.")
        precondition(BytspotContactHasher.normalizeEmail("notanemail") == nil, "NativeContactSyncSelfTests: email without @ should be nil.")
        precondition(BytspotContactHasher.normalizeEmail("a@") == nil, "NativeContactSyncSelfTests: too-short email should be nil.")
        precondition(BytspotContactHasher.normalizeEmail(nil) == nil, "NativeContactSyncSelfTests: nil email should be nil.")

        precondition(BytspotContactHasher.normalizePhone("+1 (404) 555-1234") == "14045551234", "NativeContactSyncSelfTests: phone non-digit strip drifted.")
        precondition(BytspotContactHasher.normalizePhone("(404) 555-1234") == "14045551234", "NativeContactSyncSelfTests: bare 10-digit NANP should prefix 1.")
        precondition(BytspotContactHasher.normalizePhone("4045551234") == "14045551234", "NativeContactSyncSelfTests: 10-digit should prefix 1.")
        precondition(BytspotContactHasher.normalizePhone("+44 20 7946 0958") == "442079460958", "NativeContactSyncSelfTests: international number should be kept as-is.")
        precondition(BytspotContactHasher.normalizePhone("123") == nil, "NativeContactSyncSelfTests: too-short phone should be nil.")
        precondition(BytspotContactHasher.normalizePhone(nil) == nil, "NativeContactSyncSelfTests: nil phone should be nil.")
    }

    private static func assertHashContract() {
        let a = BytspotContactHasher.hashEmail("  Jane.Doe@GMAIL.com ")
        let b = BytspotContactHasher.hashEmail("jane.doe@gmail.com")
        precondition(a != nil && a == b, "NativeContactSyncSelfTests: equivalent emails must hash identically.")
        precondition(a?.count == 64, "NativeContactSyncSelfTests: email hash must be 64 hex chars.")
        precondition(isHex(a), "NativeContactSyncSelfTests: email hash must be lowercase hex.")

        precondition(BytspotContactHasher.hashPhone("(404) 555-1234") == BytspotContactHasher.hashPhone("+1 404 555 1234"), "NativeContactSyncSelfTests: 10-digit and +1 phone forms must match.")

        // Email and phone namespaces must not collide.
        precondition(BytspotContactHasher.hashEmail("4045551234@x.co") != BytspotContactHasher.hashPhone("4045551234"), "NativeContactSyncSelfTests: email/phone namespaces must not collide.")

        // Auto-detection routes by the presence of "@".
        precondition(BytspotContactHasher.hashContactValue("jane.doe@gmail.com") == BytspotContactHasher.hashEmail("jane.doe@gmail.com"), "NativeContactSyncSelfTests: hashContactValue should route @ values to the email hasher.")
        precondition(BytspotContactHasher.hashContactValue("(404) 555-1234") == BytspotContactHasher.hashPhone("(404) 555-1234"), "NativeContactSyncSelfTests: hashContactValue should route non-@ values to the phone hasher.")
        precondition(BytspotContactHasher.hashContactValue("") == nil, "NativeContactSyncSelfTests: empty contact value should be nil.")
        precondition(BytspotContactHasher.hashEmail("nope") == nil, "NativeContactSyncSelfTests: unhashable email should be nil.")
        precondition(BytspotContactHasher.hashPhone("12") == nil, "NativeContactSyncSelfTests: unhashable phone should be nil.")
    }

    private static func assertSuggestionRanking() {
        let mutual = NativeFriendSuggestion(userId: "a", name: "A", source: "apple", mutual: true, mutualContacts: 0, sharedVerifiedVenues: 0)
        let common = NativeFriendSuggestion(userId: "b", name: "B", source: "apple", mutual: false, mutualContacts: 2, sharedVerifiedVenues: 0)
        let venues = NativeFriendSuggestion(userId: "c", name: "C", source: "google", mutual: false, mutualContacts: 0, sharedVerifiedVenues: 3)
        precondition(mutual.reason == "Mutual contact", "NativeContactSyncSelfTests: mutual reason drifted.")
        precondition(common.reason == "2 contacts in common", "NativeContactSyncSelfTests: contacts-in-common reason drifted.")
        precondition(venues.reason == "3 shared verified spots", "NativeContactSyncSelfTests: shared-venues reason drifted.")
        precondition(BytspotContactSyncStore.ranked([venues, mutual, common]).map(\.userId) == ["a", "b", "c"], "NativeContactSyncSelfTests: suggestion ranking must prioritize mutual edges, contacts, then verified venues.")
        precondition(BytspotContactSyncStore.previewSuggestionsEnvironmentKey == "BYT_NATIVE_CONTACT_PREVIEW", "NativeContactSyncSelfTests: contact preview screenshot env key drifted.")
        precondition(BytspotContactSyncStore.previewSuggestions.map(\.userId) == ["preview-mutual", "preview-contacts", "preview-venues"], "NativeContactSyncSelfTests: preview suggestions must stay ranked for deterministic screenshots.")
    }

    private static func isHex(_ value: String?) -> Bool {
        guard let value else { return false }
        return value.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) }
    }
}
#endif
