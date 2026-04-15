# Bytspot — TestFlight / Release Checklist

## 1. Build Readiness

- [ ] `main` includes the latest App Review cleanup commit
- [ ] iOS app icon matches the final Bytspot brand mark
- [ ] `Info.plist` privacy strings are present and current
- [ ] Apple-review safety gates are enabled in `src/utils/reviewBuild.ts`

## 2. Local Verification

- [ ] Run `cmd /c npm run build`
- [ ] Run `cmd /c npm run test:e2e:ticketing:spec`
- [ ] Confirm no reviewer-visible `Beta`, `Coming Soon`, `mock checkout`, or `Stripe not configured` copy remains in app UI

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
- [ ] Confirm legal routes open correctly

## 6. TestFlight / Upload

- [ ] Confirm build number increments correctly in CI
- [ ] Upload / process build in TestFlight
- [ ] Verify splash, launch, guest entry, Home, Discover, Map, Profile
- [ ] Verify parking preview flow on device
- [ ] Verify no hidden internal routes are accessible in review build

## 7. Go / No-Go

- [ ] No blocker UI regressions
- [ ] No review-risk wording in user-facing flows
- [ ] Metadata + screenshots + reviewer notes all updated
- [ ] Ready to submit
