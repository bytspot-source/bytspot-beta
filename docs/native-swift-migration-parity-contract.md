# Native Swift Migration Parity Contract

Status: Native root active; source-of-truth refreshed 2026-07-15  
Scope: finish native SwiftUI parity for the existing App Store app without reintroducing Capacitor, WebKit, or the React web bundle into the iOS App target.

## Non-negotiables

- The iOS App target must launch the SwiftUI native root unconditionally.
- Do not reintroduce Capacitor, WebKit, `CAPBridgeViewController`, or a bundled React web app into the App target.
- Keep App Clip SwiftUI flow as the strongest native reference implementation.
- Preserve BYT424 App Clip invocation and AASA behavior.
- Every native slice must have native gate + simulator build proof before App Store release.
- First public native release remains Parker consumer-only; Provider, Vendor, Admin, and internal review surfaces stay hidden.

## Current iOS State

| Area | Current source | Notes |
| --- | --- | --- |
| Full app launch | `ios/App/App/AppDelegate.swift` | App Store invariant launches `BytspotNativeAppRoot()` directly via SwiftUI. |
| Native root gate | `scripts/assert-ios-native-root.mjs` | Release gate forbids Capacitor, WebKit, React web bundle, legacy storyboard, and hybrid webview root. |
| Native shell | `ios/App/App/NativeShellView.swift` | SwiftUI Home, Discover, Map, Concierge, Profile/Access panels, wallet, preferences, and consumer booking contexts. |
| Native routing | `ios/App/App/BytspotNativeRouting.swift` | Native deep links/universal links for map, discover, profile, access, booking returns, legal, patch, group invites. |
| Native API client | `ios/App/App/BytspotAPIClient.swift` | Typed DTOs/stores for venues, events, vendor services, profile, vehicles, payments, preferences, wallet, mobility. |
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
| Provider/ERP | `ProviderApp`, dashboard/onboarding/listings/patches | Deferred from public App Store native release; later TestFlight/internal SwiftUI module. |
| Vendor/Admin | `ProviderConsole`, admin routes | Deferred from public App Store native release until backend review + native authorization gates are complete. |
| Valet/mobility | `ValetApp`, `ValetFlow`, mobility utils | Consumer airport transfer request flow is native; operations dashboards remain deferred. |
| Legal/static | Privacy, Terms, Disclaimer | Native legal surfaces required for App Store scope. |

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
| `/provider`, `/vendor`, `/admin` | Internal/provider routes | Do not advertise or expose in Parker consumer App Store build. Later native ERP/TestFlight workstream only. |
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

## Current Native Implementation Slice

Approved sequence as of 2026-07-15:

1. Keep the existing SwiftUI native root and four-tab consumer shell.
2. Refresh this source-of-truth document so migration instructions no longer describe a Capacitor fallback.
3. Add only low-risk consumer-native parity slices that fit the existing design system.
4. First new slice: privacy-safe Home context snapshot using existing safe signals only.
5. Continue to hide Provider, Vendor, Admin, raw sensor, and internal review surfaces from the public App Store build.

### Privacy-safe context snapshot boundary

Allowed now:

- time/day pattern from the device clock
- venue category from existing venue/discover data
- aggregate/live crowd labels already returned by backend or curated fallback fixtures
- nearby events already returned by `events.list`/`native.bootstrap`
- parking availability already returned by venue/live-value data or curated fallback fixtures

Not allowed in this slice:

- Wi-Fi/Bluetooth device density collection
- raw MAC addresses, device identifiers, or background scans
- microphone/sound-level collection
- POS/reservation ingestion unless a vendor explicitly opts in and a backend policy contract exists
- Provider/Vendor/Admin UI exposure in the consumer App Store shell

## Workstream C — Native Venue Details

Status: scoped 2026-06-18. Next slice after WS-A (trust ladder) and WS-B (Map
Functions premium gating). Source of truth: `src/components/VenueDetails.tsx`.
Rationale for sequencing before Checkout: the venue detail surface is the read
surface (`viewVenue` = capability L0, no trust gate, low risk) already reachable
from two migrated entry points that today collapse to a coarse
`openHybrid(.discover)` handoff; it is the natural precursor to the higher-trust
Checkout surface (L3, irreversible, Stripe redirect) which is already partially
modeled by the contract `checkout` block + `NativePatchBookingSelfTests`.

| Item | React anchor | Native target | Trust mapping |
| --- | --- | --- | --- |
| Read surface | `VenueDetails` modal | `NativeVenueDetailView` | `viewVenue` (L0) |
| Navigate / Call / Share | `handleNavigate` / `handleCall` / `handleShare` | Device intents (Maps, `tel:`, share sheet) | none (device) |
| Save | `handleToggleFavorite` (savedSpots) | Save-to-wallet action | `saveToWallet` (L1) |
| Get Tickets | `handleOpenTicketFlow` (access pass) | Ticket/access pass action | `saveToWallet` (L1) |
| Check In | `trpc.venues.checkin.mutate` (idempotent) | Authed write | session-gated, advisory (reversible — no trust rung) |
| Concierge | `onOpenConcierge` | `openHybrid(.concierge)` | handoff |
| Book Ride | `handleBookValet` / `onBookRide` | L3 checkout bridge → WS-D | `createCheckoutHold` (L3) |

Anchors are locked in `contracts/native-trust-contract.json → venueDetail`
(generated from React source; the `venues.checkin` endpoint is extracted
verbatim). Anything not yet native falls back to web. WS-D (Checkout parity) is
the follow-on: it consumes the existing `checkout` contract block and the L3
`createCheckoutHold` capability that Book Ride bridges into.

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

The native shell is already the default App Store root. Continue with consumer-only native parity, native App/Clip gates, Xcode simulator builds, and App Store purity checks before release.
