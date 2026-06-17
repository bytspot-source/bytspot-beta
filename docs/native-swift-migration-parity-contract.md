# Native Swift Migration Parity Contract

Status: Phase 0 started 2026-06-13  
Scope: migrate Bytspot iOS from Capacitor React webview to SwiftUI without losing production behavior.

## Non-negotiables

- Do not replace the App Store launch root until native parity is proven in simulator.
- Keep current Capacitor root as the shipping fallback during migration.
- Keep App Clip SwiftUI flow as the strongest native reference implementation.
- Preserve BYT424 App Clip invocation and AASA behavior.
- Every native slice must have simulator proof before it can become the default.

## Current iOS State

| Area | Current source | Notes |
| --- | --- | --- |
| Full app launch | `ios/App/App/AppDelegate.swift` | App Store invariant still launches `CAPBridgeViewController` directly. |
| Native shell prototype | `ios/App/App/NativeShellView.swift` | SwiftUI tabs exist, but currently bridge to React for full features. |
| App Clip | `ios/App/Clip/*` | Native SwiftUI catalog/vendor/checkout/success flow is production-quality reference. |
| App Clip routing | `ClipInvocationModel.handle(url:)` | Query `patchId` wins over path, supports `/BYT424?patchId=...`. |
| App Clip handoff | `mainAppHandoffURL` | Uses `https://bytspot.app/access/{patchId}` with tier/source/handoff query. |

## React Source-of-Truth Screens

| Product area | React files | Native target |
| --- | --- | --- |
| Splash/Landing/Auth | `SplashScreen`, `LandingPage`, `AuthenticationFlow`, auth buttons | `NativeAuthFlow`, `SessionStore` |
| Home | `App.tsx`, `EnhancedHeader`, quick actions, recommendations | `NativeHomeDashboardView` replacement |
| Discover | `DiscoverSection`, venue/service cards, events | `NativeDiscoverView` with typed cards |
| Map/Scanner | `MapSection`, `useMapPatchScanner`, `VirtualPatchScannerSheet` | `NativeMapExploreView`, native scanner coordinator |
| Access/Wallet | `ProfileSection`, virtual patch saved requests | `NativeAccessWalletView` as a profile/account subview, not a bottom tab |
| Concierge | `HomeConcierge`, `ConciergeSection`, `ConciergeChat` | `NativeConciergeView` |
| Provider/ERP | `ProviderApp`, dashboard/onboarding/listings/patches | Later SwiftUI ERP module |
| Valet | `ValetApp`, `ValetFlow` | Later native operations module |
| Legal/static | Privacy, Terms, Disclaimer | Native Web/SFSafari fallback acceptable initially |

## Route And Deep-Link Contract

| Input | Current behavior | Native requirement |
| --- | --- | --- |
| `/p/{patchId}` | Consumer patch flow, Map scanner sheet | Parse into `PatchRoute` and open access/patch UI. |
| `/patch/{patchId}` | App Clip / NFC compatibility alias | Same as `/p`. |
| `/access/{patchId}` | Full app handoff / access wallet context | Open native access wallet or patch detail. |
| `/t/{serial}` | Production NFC tag URL | Normalize to patch scan. |
| `/BYT424?patchId=BYT424-0301&tier=platinum` | App Clip campaign root with serialized patch | Preserve query `patchId`, tier, and source. |
| `bytspot://map` | Opens Map tab | Native tab route. |
| `bytspot://venue/{id}` | Opens Discover venue detail | Native discover route. |
| `bytspot://profile` | Opens profile/access area | Native account/access route. |
| `/provider`, `/vendor` | Provider app routes, hidden in App Store mode | Keep web fallback until ERP phase. |
| `/booking/success|cancelled` | Stripe return handler | Native booking return state. |
| `/privacy`, `/terms`, `/disclaimer` | Static legal screens | Native or web fallback. |

## Shared Data Contracts To Port

| Contract | React source | Swift model target |
| --- | --- | --- |
| API base + auth header | `src/utils/trpc.ts` | `BytspotAPIClient` with bearer token injection. |
| Patch tiers | `src/utils/patchTiers.ts` | Shared `BytspotTier` already mirrored in Swift; consolidate. |
| Virtual patch context | `src/utils/virtualPatch.ts` | `VirtualPatchContext`, `PatchVerification`, saved requests. |
| Provider patch URLs | `src/utils/providerPatchRouting.ts` | `PatchRouteBuilder`. |
| Map scanner state | `src/components/map/useMapPatchScanner.ts` | `NativePatchScannerCoordinator`. |
| Venue/service cards | `vendorServiceCards`, `mockData`, `useVenues` | `DiscoverCard`, `VendorService`, `VenueSummary`. |
| Auth/session | `AuthenticationFlow`, native Google/Apple buttons | `SessionStore`, Keychain storage, native auth providers. |

## Backend API Inventory

Current frontend uses permissive tRPC client at `https://bytspot-api.onrender.com/trpc`.

Known backend routers from sibling backend inventory:

- `auth`
- `venues`
- `rides`
- `concierge`
- `payments`
- `subscription`
- `providers`
- `admin`
- `push`
- `user`
- `social`
- `reviews`
- `events`
- `places`
- `patch`
- `booking`
- `vendors`
- `audit`

Swift must use typed request/response DTOs for each migrated route instead of `any`.

## First Native Implementation Slice

Recommended first slice: native authenticated shell with React fallback preserved.

1. Add `BytspotNativeAppRoot` behind a build flag or runtime debug flag.
2. Add `SessionStore` using Keychain for `bytspot_auth_token` equivalent.
3. Add typed `BytspotAPIClient` with health/auth/me smoke endpoints.
4. Add native tab shell with exactly four tabs: Home, Discover, Map, Concierge.
5. Keep Access / My Wallet inside profile/account and contextual CTAs, not bottom navigation.
6. Each tab initially shows native skeleton + "Open legacy web" fallback.
7. Run simulator smoke before any release-root switch.

## No-Ship Gates Per Slice

- `npm run type-check`
- `npm run test:unit`
- `npm run build`
- `node scripts/assert-ios-app-clip-packaging.mjs`
- `xcodebuild -scheme App -sdk iphonesimulator ... build`
- `xcodebuild -scheme Clip -sdk iphonesimulator ... build`
- Simulator launch of full app.
- For deep-link work: `simctl openurl` or `_XCAppClipURL` proof screenshot.

## Current Decision

Start with Phase 0 inventory and native shell contracts. Do not make the native shell the default App Store root until Phase 1 gates pass and App Clip invocation remains green.
