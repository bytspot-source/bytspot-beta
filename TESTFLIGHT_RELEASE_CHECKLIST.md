# Bytspot — TestFlight / Release Checklist

> The submission target is the pure native SwiftUI app (`ios/App/App.xcodeproj`, App + Clip targets). The npm/web commands apply only to the separate React web beta and are not part of this release gate.

## 1. Build Readiness

- [ ] Release branch includes the latest App Review cleanup commits (backdoor removal, privacy manifests, Concierge live wiring)
- [ ] iOS app icon matches the final Bytspot brand mark (App and Clip)
- [ ] `ios/App/App/Info.plist` and `ios/App/Clip/Info.plist` privacy strings are present and current
- [ ] `PrivacyInfo.xcprivacy` present in both App and Clip targets and matches actual data collection (email/name, contacts, payment, purchases, phone, address, other data, precise location not-linked)
- [ ] Marketing version and build number bumped for both App and Clip targets (versions must match)

## 2. Local Verification

- [ ] Build: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`
- [ ] Tests: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test` (AppTests must be green; DEBUG parity self-tests run on launch)
- [ ] Lint manifests: `plutil -lint ios/App/App/PrivacyInfo.xcprivacy ios/App/Clip/PrivacyInfo.xcprivacy`
- [ ] AASA live check: `curl https://bytspot.app/.well-known/apple-app-site-association` shows `applinks` + `appclips` + `webcredentials` for `MK4J6M36S8.com.bytspot.app(.Clip)`
- [ ] Confirm no reviewer-visible `Beta`, internal planning metrics, Provider/Admin dashboard copy, placeholder payment instruments, or fabricated hours remain in app UI

## 3. App Store Connect Metadata

- [ ] Use `app-store-listing.md` for final metadata copy
- [ ] Upload 6.7-inch screenshots only from a consistent set
- [ ] Confirm Privacy Policy URL: `https://bytspot.com/privacy`
- [ ] Confirm Support URL: `https://bytspot.com/support`
- [ ] Confirm Marketing URL: `https://bytspot.com`
- [ ] Confirm age rating and category selection

## 4. Screenshot Set

- [ ] Use `screenshots/appstore/README.md` as the final screenshot upload guide
- [ ] Do not mix 6.7-inch uploads with smaller captures
- [ ] Prefer a final set that covers:
  - landing / welcome
  - home feed
  - venue discovery
  - discover cards
  - map or parking flow

## 5. Reviewer Notes

- [ ] Paste `APP_REVIEW_NOTES.md` into App Store Connect review notes
- [ ] Confirm guest path still works: `Get Started` → `Continue as Guest`
- [ ] Confirm legal routes open correctly (Profile → legal links)
- [ ] Confirm Home shows consumer tier cards, not internal priority/score cards
- [ ] Confirm Concierge shows `Local help` for guests and `Live` only when signed in

## 6. TestFlight / Upload

- [ ] Archive from Xcode (App scheme, Any iOS Device) or CI; App Clip is embedded automatically
- [ ] Confirm build number increments correctly
- [ ] Upload / process build in TestFlight
- [ ] Verify splash, launch, guest entry, and the Home · Discover · Map · Concierge tabs; open Profile from Home
- [ ] Verify parking preview flow on device
- [ ] Verify App Clip invocation from a group-event invite link (RSVP without full app)
- [ ] Verify no hidden internal routes are accessible in review build

## 7. Go / No-Go

- [ ] No blocker UI regressions
- [ ] No review-risk wording in user-facing flows
- [ ] Metadata + screenshots + reviewer notes all updated
- [ ] Ready to submit
