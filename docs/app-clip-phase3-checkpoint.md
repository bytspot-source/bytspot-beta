# App Clip Phase 3 Checkpoint · Luxury Flow Contract

Status: last-known-green checkpoint for preserving and hardening the native SwiftUI App Clip luxury flow.

## Scope

Phase 3 keeps the App Clip native and production-safe while the full app migrates incrementally to SwiftUI/Kotlin.

- App Clip bundle: `com.bytspot.app.Clip`
- Host app bundle: `com.bytspot.app`
- App Clip associated domain: `appclips:bytspot.app`
- Host app associated domain: `applinks:bytspot.app`
- No App Clip entitlement belongs in the host app.
- No native SwiftUI shell takeover is allowed in the production App root.

## Primary Files

- `ios/App/Clip/ClipApp.swift`
  - `ClipInvocationModel`
  - URL/activity handling
  - catalog → vendors → checkout → success state machine
  - DEBUG screenshot walkthrough hooks
- `ios/App/Clip/ClipPatchVerifier.swift`
  - tier detection
  - fallback service/vendor catalogs
  - `vendors.getByPatch`, `vendors.search`, `patch.resolve`, `patch.verifyTap`
  - dynamic line-item parsing
- `ios/App/Clip/ClipContentView.swift`
  - App Clip UI, Apple Pay checkout, success/hold/pass/logistics views
- `ios/App/Clip/BytspotAviationFallbackTests.swift`
  - DEBUG runtime contract guard at Clip launch
- `scripts/assert-ios-app-clip-packaging.mjs`
  - static packaging and contract assertions
- `scripts/clip-screencap-sweep.sh`
  - DEBUG visual sweep for catalog/vendors/checkout/success across tiers
- `scripts/clip-platinum-pass-smoke.sh`
  - GH Akwaaba digital pass smoke artifact

## Flow Contract

`ClipInvocationModel.flow` has four production states:

1. `catalog`
2. `vendors(service:)`
3. `checkout(service:vendor:)`
4. `success(service:vendor:bookingRef:)`

Every new invocation must reset:

- active load/vendor tasks
- `flow` back to `catalog`
- vendor filter to `Now`
- guest count to `1`
- dynamic line-item quantities
- context/verification errors
- vendor caches when tier changes

## Tier Contract

Tier detection order lives in `BytspotTier.detect(url:patchId:)`:

1. `?tier=` query
2. `?invite=BLACK|PLATINUM|GREEN-...`
3. `/p/<tier>-...` or `/patch/<tier>-...`
4. `/black|/platinum|/green/...`
5. patch ID prefixes such as `BLACK-`, `BYT-P-`, `BYT-G-`
6. NTAG424 suffixes such as `BYT424-0301-B/P/G`
7. default: Black, preserving the luxury App Clip default

Tier catalogs must stay isolated:

- Black: aviation, marine, elite dining, chauffeur, wellness, concierge, events
- Platinum: parking, valet, dining, event access, rideshare, nightlife, experiences
- Green: neighborhood/cottage-industry services only

## Special Product Contracts

### Black Aviation + Marine

- Black aviation fallback vendors are locked by DEBUG self-test:
  - Stratos Jet Charters · $28,000
  - Solitaire Aviation · $33,040
  - Vector Air · $40,600
- Black aviation/marine success uses a protected 45-minute hold flow.
- Success actions prioritize live concierge, route/vessel tracking, valet/dockside coordination, and Black ride handoff.
- Near-expiration QA uses DEBUG-only `holdRemaining`, `holdRemainingSeconds`, or `remainingSeconds` URL params.

### Platinum GH Akwaaba Pass

- GH/FIFA/Akwaaba/matchday URLs resolve into the existing `platinum-entry` service.
- It must not become a standalone service tile.
- Explicit vendor: `GH Akwaaba Pass`.
- Product hero: `public/media/gh-akwaaba-fifa-ghana-thumbnail.png`.
- Line items: tickets, souvenirs, Ghana home jersey.
- Success opens the digital pass flow, share action, and Save to Wallet handoff.

### Broni Home Taste

- Broni stays in Platinum dining fallback vendors.
- It carries curated dining line items:
  - Jollof Rice with Chicken
  - White Rice with Stew
  - Waakye
  - Fried Plantain and Beans
  - Banku and Fried Fish/Tilapia
  - Fufu
- Dining success hides the property-access CTA and uses instant order confirmation copy.

## Handoff Contract

`ClipInvocationModel.mainAppHandoffURL` must build `https://bytspot.app/access/<patchId>` with:

- `tier=<tier>`
- `source=app_clip`
- `handoff=1`
- optional secure token as `t=`
- optional `venue=`

`ClipContentView.openFullApp` must use `universalLinksOnly`; if the full app cannot open, it falls back to `SKOverlay`.

## Last-Known-Green Validation

Run from repository root:

```bash
git diff --check
node scripts/assert-ios-capacitor-root.mjs
node scripts/assert-ios-app-clip-packaging.mjs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/App/build/Phase3AppClipApp CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/App/App.xcodeproj -scheme Clip -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/App/build/Phase3AppClipClip CODE_SIGNING_ALLOWED=NO build
```

Optional visual smokes when a simulator is available:

```bash
REBUILD=1 scripts/clip-screencap-sweep.sh
REBUILD=1 scripts/clip-platinum-pass-smoke.sh
```

Expected static guard output:

- `[ios-capacitor-root] PASS`
- `[ios-app-clip-packaging] PASS (39 checks)`
- App and Clip Debug simulator builds succeed.

## Recovery If The App Clip Stops Working

1. Re-run `git diff --check` and both Node guards.
2. Build `Clip` first; DEBUG self-tests fail early if the fallback data contract drifted.
3. Verify `BytspotAviationFallbackTests.run()` is still called from `BytspotClipApp.init()`.
4. Verify `BytspotAviationFallbackTests.swift` remains in the Clip target sources.
5. Confirm `Clip.entitlements` still has `appclips:bytspot.app` and the host app does not.
6. Confirm `public/.well-known/apple-app-site-association` and `public/apple-app-site-association` still match.
7. If visual flow broke but builds pass, run the screenshot sweep and compare the affected tier/step artifact.