# Native Profile Product + Wireframe Contract

Status: Profile real-data integration P1 in progress — native account panels wired to profile, vehicles, and payment boundary routes 2026-06-20  
Scope: migrate `src/components/ProfileSection.tsx` into a professional native
SwiftUI Account/Profile surface without treating Profile as a settings junk drawer.

## Product Principle

Profile is the user's **Bytspot Passport**: identity, active access, rewards,
social trust, saved activity, and account controls. The main screen must answer,
in order:

1. Who am I in Bytspot?
2. What do I need right now?
3. What am I earning or unlocking?
4. Who am I connected to?
5. What have I saved or done?
6. How do I manage account, preferences, privacy, theme, legal, and session?

## React Feature Inventory

| Feature | React source behavior | Native product job |
| --- | --- | --- |
| Identity header | name/guest, tier, following, points, badges | Passport identity and status |
| Your Bytspot benefits | booking count, points, check-ins, insider state, next unlock | Progress toward benefits |
| Insider membership | active/available, Stripe checkout, review-build handling | Membership tier and subscription state, not a random promo |
| My Reservations | parking pass count, spot, address, window, price, pass code | Active arrival logistics |
| My Access | access passes, virtual patch, NFC/QR, service requests | Wallet for access and patch context |
| Rewards | points, badges, achievements | Earned value and gamification |
| Invite a Friend | referral URL, native share, referral count | Growth/social referral |
| Friends | follows, feed, contact sync, suggestions, privacy copy | Social graph and trust |
| Saved Spots | saved place list + count | Saved places |
| Places I've Been | check-in history, crowd level, timestamp | Activity history |
| Personal Information | profile edit sub-screen | Account identity management |
| Vehicles | vehicle list/count | Parking utility |
| Payment Methods | payment method list/count, Stripe return focus | Payment instruments/status |
| Vibe Preferences | preference screen | Discovery personalization |
| Parking Preferences | preference screen | Arrival personalization |
| Notifications | alert settings | Communication control |
| Location & Privacy | parker location/data settings | Trust and privacy controls |
| General | appearance, shortcuts, delete, version | App configuration |
| Delete Account | type DELETE + final confirmation | Destructive account lifecycle |
| Legal | privacy, terms, disclaimer | Compliance |
| Logout/Sign in | session control | Exit or authenticate |

## Native Information Architecture

### 1. Passport

- Avatar / initials
- User name or Guest
- Bytspot membership tier, shown as the literal label `Green`, `Platinum`, or `Black`. The tier is always rendered for signed-in members, because it states both what the member pays for and which premium features they are eligible for. Guests show no tier.
- Connections / Points / Check-ins
- Passive theme status only, e.g. `Auto theme`

### 2. Today

- My Reservations
- My Access
- Active Virtual Patch/QR/NFC state if present

### 3. Progress

- Points earned by verified check-in
- Membership state as a status line or CTA, not a disconnected card: an active tier reads as its label, and a member without a paid tier gets the upgrade CTA

### 4. Social

- Invite a Friend
- Find Friends
- Friends/social graph opens from the Find Friends surface, not as a repeated menu row

### 5. Places & Activity

- Saved Spots
- Places I've Been
- Vehicles may appear here only if framed around parking readiness

### 6. Account

- Personal Information
- Payment Methods
- My Vehicles

### 7. Preferences

- Vibe Preferences
- Parking Preferences
- Notifications
- Location & Privacy

### 8. App Settings

- General
- Appearance / Theme
- Version

### 9. Safety, Legal, Session

- Delete Account
- Privacy Policy
- Terms of Service
- Disclaimer
- Logout / Sign In

## Membership Contract

Premium Bytspot features are reached by holding a membership, and a membership is
obtained through a subscription. There is no other path to premium access.

- Tiers are exactly `Green`, `Platinum`, and `Black`. No other tier name may be
  rendered, and the set is closed.
- The tier is the single statement of subscription status and premium feature
  eligibility. Do not display a separate "premium", "pro", or "insider" badge
  beside it, because a second label invites the two to disagree.
- Server truth is `subscription.status`, which returns `membershipTier` and
  `isPremium`; the client mirrors it in `NativeMembershipTierStore`. Never infer
  a tier from a purchase, a pass, or a local flag.
- `Green` is the entry tier and carries no paid entitlement, so Progress shows the
  upgrade CTA for `Green` and the tier label for `Platinum` and `Black`.
- Tier gates feature eligibility only. It never implies a venue is available, a
  door is open, or occupancy is live.
- Guests have no tier. Show no tier label and no upgrade CTA until sign-in,
  rather than implying a signed-out visitor is on `Green`.

## Theme Placement Contract

Theme is an app setting, not a Profile identity feature.

- Main Passport may show current mode as passive text only: `Auto theme`, `Dark`, or `Light`.
- Editable control belongs at `Profile → General → Appearance`.
- Appearance uses a native segmented control: `Auto`, `Dark`, `Light`.
- Copy:
  - Auto: follows iPhone appearance.
  - Dark: keeps Bytspot in premium night interface.
  - Light: high-contrast daytime surfaces.

## Main Profile Wireframe v1 — Professional Passport

```text
[ACCOUNT CENTER]
Avatar  Name / Guest       Green | Platinum | Black + theme status
Connections   Points   Check-ins

[QUICK ACTIONS]
Wallet          Bookings
Points          Saved

[ACCOUNT ESSENTIALS]
Identity        name, email, phone, city
Payment         methods and secure setup
Vehicle         parking handoff cars
Note: Account Essentials owns the Personal Information, Payment Methods, and My Vehicles destinations. Do not repeat these rows in a second Account menu group.

[PREFERENCES]
Vibe Preferences
Parking Preferences
Notifications
Location & Privacy

[PLACES & ACTIVITY]
Saved Spots
Places I've Been

[NETWORK]
Invite & Find Friends     one fused card
  - Invite a Friend       referral link + share CTA
  - Find Friends          private contact matching + sign-in/sync CTA

[APP]
General
Appearance
Version

[SAFETY & LEGAL]
Delete Account
Privacy Policy
Terms of Service
Disclaimer

[Log Out / Sign In]
```

Professional guardrails:

- Do not show noisy implementation badges like `NATIVE` on normal menu rows.
- Keep the top visible area focused on universally understood actions: Wallet, Bookings, Rewards, Saved, Identity, Payment, Vehicle.
- Keep destructive/legal/session actions isolated at the bottom.
- Menus need short subtitles so rows explain outcomes without feeling like a settings dump.
- Network must stay visually unified: Invite and Find Friends belong in one card, not two mismatched cards.
- Do not duplicate Account Readiness with a second Account menu containing the same identity/payment/vehicle actions.

## Geometry Baseline — iPhone 14 Pro

All wireframes below are drawn to the shipped token set, not to invented values.
Target is the 393 x 852 pt logical canvas.

| Quantity | Value | Source |
| --- | --- | --- |
| Screen | 393 x 852 pt | iPhone 14 Pro logical size |
| Safe area top / bottom | 59 pt / 34 pt | Dynamic Island device class |
| Screen padding | 20 pt | `NativePolish.screenPadding` |
| Header horizontal margin | 16 pt | shipped header rows |
| Content width (header rows) | 361 pt | 393 - (16 x 2) |
| Content width (padded cards) | 353 pt | 393 - (20 x 2) |
| Card radius / hero radius | 24 pt / 30 pt | `NativePolish.cardRadius`, `.heroRadius` |
| Row radius | 16 pt | `NativeProfileStyle.rowRadius` |
| Card padding / spacing | 20 pt / 20 pt | `NativeProfileStyle.cardPadding`, `.cardSpacing` |
| Section spacing | 24 pt | `NativePolish.sectionSpacing` |
| Control size | 48 pt | `NativePolish.controlSize` |
| Chip height | 36 pt | `NativePolish.chipHeight` |
| Bottom bar | 72 pt, radius 24 pt | `NativePolish.bottomBar*` |

A 44 pt minimum hit target applies to every interactive element. Where a
wireframe shows a control smaller than 44 pt, the tappable area is padded to
44 pt without changing the drawn size.

## Upgrade Membership Wireframe v1

Reached from Progress on `Green` only. `Platinum` and `Black` see the tier
label, never this CTA. Guests see neither until sign-in.

```text
[SHEET · presented over Profile · 393 pt wide]

  ← Close                                    Bytspot Passport
  ─────────────────────────────────────────────────  (353 pt content)

  [CURRENT → TARGET · hero card, radius 30]
    NOW          Green        — no paid entitlement
       ↓
    CHOOSE       Platinum  |  Black       (segmented, 2 up, 48 pt)

  [WHAT THE PASSPORT ADDS · card, radius 24, padding 20]
    ● Priority access        earlier entry windows where a host offers them
    ● Access wallet          passes and tickets in one place
    ● Faster paid entry      saved payment, fewer steps at the door

  [WHAT IT DOES NOT DO · card, radius 24]
    A membership does not open a door, reserve a spot, or make a
    venue available. Hosts set access; tier only decides eligibility.

  [PRICE · card]
    Platinum   $X / month        Black   $Y / month
    Billed by Apple. Cancel anytime in Settings.

  [Continue →]                       (primary, 56 pt, full width)
  Restore purchase                    (tertiary text button, 44 pt)
```

Rules:

- The benefit list states eligibility, never availability. Copy may not imply a
  door is open, a venue has room, or occupancy is live.
- Exactly two upgrade targets are offered, because the tier set is closed.
  Never render a fourth name, and never render `Green` as purchasable.
- The screen must not claim a benefit the backend does not gate. Each bullet maps
  to a real entitlement check or it does not appear.
- Price is presented as a subscription, since subscription is the only path to a
  membership. No one-time "unlock" framing.
- `Continue` hands off to the production purchase flow. Until that flow is wired,
  this is a native local shell that states the boundary rather than a dead button.

## Add Payment Method Wireframe v1

At `Profile → Account → Payment Methods`. This surface may never collect card
numbers, CVC, or bank details — see Native/Web Boundary Rules.

```text
[NATIVE LOCAL SHELL · NativeProfilePanel]

  ← Payment Methods
  ─────────────────────────────────────────────────

  [ON FILE · card, radius 24]
    □  Visa ···· 4242        Default        (row, radius 16, 44 pt)
    □  Mastercard ···· 8210                     Remove
    — or, when empty —
    No payment method yet. Add one to speed up paid entry.

  [ADD A METHOD · card, radius 24]
    Bytspot never sees your card. Setup opens Stripe, and only a
    token comes back.
    [ Add payment method → ]        (primary, 56 pt)

  [WHAT COMES BACK · passive text]
    Brand, last four digits, expiry. Nothing else is stored.
```

On tap, the native shell hands off. The boundary is visible, never silent:

```text
[SECURE SETUP · Stripe setup session]

  ← Cancel            Secure setup · Stripe        🔒
  ─────────────────────────────────────────────────
  Leaving the native shell for card entry. This screen is
  operated by Stripe.

  [ Stripe-hosted card entry — not rendered by Bytspot ]

  → on success: return to native Payment Methods, list refreshed
  → on cancel:  return unchanged, no partial method shown
```

Rules:

- The native shell renders readiness and the list only. Card entry is always the
  hosted session; there is no native card form, disabled or otherwise.
- The handoff is labeled as a production/web continuation, which is the allowed
  explicit fallback for payment authorization. It must not use the hybrid
  `Back to native` overlay.
- A cancelled session leaves no optimistic row. A method appears only after the
  server confirms the token.
- Never display a full number, CVC, or expiry-with-number combination, including
  in error copy or logs.

## All Saved Wireframe v1

One destination consolidating `Saved Spots` and `Places I've Been`, reachable
from Quick Actions `Saved` and from Places & Activity. Both entry points open
this same screen — they are not two lists.

```text
[ALL SAVED]

  ← All Saved                                        ⌗ Search
  ─────────────────────────────────────────────────

  [ Saved  |  Been ]                 (segmented, 2 up, 36 pt chips)

  [LIST · rows radius 16, 20 pt spacing]
    ───────────────────────────────────────────
    [64x64]  Venue name                            ♡
             Neighborhood · 0.4 mi
             Typical: busy around now              (provenance)
    ───────────────────────────────────────────
    [64x64]  Venue name                            ♡
             Neighborhood · 1.1 mi
             Saved 3 weeks ago
    ───────────────────────────────────────────

  [EMPTY · Saved]
    Nothing saved yet. Tap ♡ on a spot to keep it here.

  [EMPTY · Been]
    No check-ins yet. Visits appear here after you arrive.
```

Rules:

- `Saved` is intent, `Been` is history. They share one screen and one row shape,
  but never merge into a single undifferentiated list, because a place you
  bookmarked and a place you visited are different claims.
- A row may show `Typical` occupancy with that word attached, or nothing. It may
  never show a bare number, a `Live` label, or an availability claim.
- Distance requires a current location fix. Without one the line is omitted, not
  filled with a stale or default distance.
- Unsaving is immediate and reversible in place; it must not silently drop the row
  from `Been`, which is history and not user-editable.

## Home Header Refinement v2

```text
[HEADER · 393 pt wide · below 59 pt safe area]

  ┌─ row 1 · 16 pt margins · 361 pt ────────────────────────┐
  │  (AR)          Bytspot                            ≡    │
  │  40 pt                                           44 pt  │
  └──────────────────────────────────────────────┘

  ┌─ row 2 · context ─────────────────────────────────┐
  │  ◉ Atlanta · Midtown              72° clear          │
  └──────────────────────────────────────────────┘

  Removed: tier chip (Platinum), presence chip (Live 65).
  Avatar = photo, else initials, else neutral glyph for a guest.
```

The hamburger opens a shortcut sheet, not a second settings tree:

```text
[MENU SHEET · shortcuts into existing destinations]

  Profile / Passport            → Profile root
  ─────────────────────────────────────────────────
  Vibe Preferences              → Profile → Preferences → Vibe
  Notifications                 → Profile → Preferences → Notifications
  Location & Privacy            → Profile → Preferences → Location
  Appearance                    → Profile → General → Appearance
  ─────────────────────────────────────────────────
  Sign In / Log Out             → session action
```

Rules:

- Every menu row is a route into an existing Profile destination. The sheet owns
  no settings state of its own, because a second place to change a preference is
  a second place for the two to disagree.
- Removing the tier chip does not remove the tier. Tier remains the single
  statement of subscription status in Profile Progress. The header stops being a
  second place it is asserted.
- The avatar asserts identity only. It carries no tier ring, no badge, and no
  count, so it cannot imply an entitlement or an activity level.
- A guest shows a neutral glyph and the menu shows `Sign In`. No tier is implied.
- Removing the presence chip retires the only Home surface that stated a presence
  window. `presenceSummary` wiring and the withheld-below-15 floor stay in place
  for whatever surface states presence next; they must not be deleted as dead code
  and silently re-added later without the window sentence.

## Native/Web Boundary Rules

- Main Profile and menu rows must open native `NativeProfilePanel` sheets.
- React `ProfileSection` remains a fallback, not the main native destination.
- Native root P1 owns the frontend entry journey as SwiftUI: `Splash → Landing → Auth → Main`.
- Payment authorization and real Stripe checkout may remain explicit web/secure boundary.
- Legal may use native text or SFSafari-style fallback initially.
- Any fallback CTA must say what it is, e.g. `Use Web Access`, not silently open React.
- OCR/simulator proof must show no `Back to native` for native Profile rows.

## Hardening Slice Contract

- Signed-out `Find Friends` must stay compact: short privacy copy, one native sign-in CTA, no duplicate Friends menu row, and no React fallback.
- `Personal Information` must render a native editable local draft shell before any production profile mutation is wired.
- `My Vehicles` must render a native local garage draft/list shell. Plate data should be framed as a nickname or partial hint until secure sync exists.
- `Payment Methods` must render a native payment-readiness boundary only. It must not collect card numbers, CVC, bank details, or other raw payment credentials.
- Profile-critical rows must not show the hybrid `Back to native` overlay during normal native-root use.

## Profile Real-Data Integration P1

The native account panels now mirror the existing React tRPC contracts:

- `Personal Information`
  - Load: `user.profile.get`
  - Save: `user.profile.update`
  - Email is loaded as account identity; editable fields are name, phone, address/city, and birthday.
  - Signed-out/guest mode remains a local-only native draft.
- `My Vehicles`
  - List: `user.vehicles.list`
  - Add: `user.vehicles.add`
  - Edit: `user.vehicles.update`
  - Delete: `user.vehicles.remove`
  - Guest mode keeps plate entry framed as a local hint/nickname; authenticated sync may send the plate through the protected API route.
- `Payment Methods`
  - List summaries: `payments.listMethods`
  - Secure setup: `payments.setupSession`
  - Set default: `payments.setDefaultMethod`
  - Remove: `payments.removeMethod`
  - Native SwiftUI may show brand/last4/default status only. It must never collect raw card number, CVC, bank, or credential fields.

### Authenticated Smoke Safety

- DEBUG fixture mode uses `BYT_NATIVE_AUTH_MOCK=success`, `BYT_NATIVE_AUTH_AUTORUN=apple`, and `BYT_NATIVE_PROFILE_DATA_FIXTURES=authenticated` to render signed-in Profile panels without real credentials.
- Fixture data is intentionally non-secret and limited to representative profile, vehicle, and card-summary values.
- Live authenticated smoke is opt-in via `LIVE_AUTH_SMOKE=1` and relies only on an already-signed-in simulator/device session. Do not pass bearer tokens through command-line arguments, URLs, or logs.
- Live-auth smoke command: sign in through the app first, then run `LIVE_AUTH_SMOKE=1 bash scripts/native-root-smoke.sh`. The script must not accept token flags or print auth headers.
- Normal smoke resets app data by default for deterministic guest fixtures. `LIVE_AUTH_SMOKE=1` disables that reset so the existing signed-in simulator session is preserved.
- If live-auth OCR shows `sync unavailable`, capture that as backend/session diagnostics rather than replacing the native panel with a React fallback.
- Payment setup remains a hosted/certified flow. Native Profile can open a setup URL, but cannot render custom card-entry fields.

### Native Auth + Splash P1

React source of truth:

| Native surface | React source | Locked copy / contract |
| --- | --- | --- |
| Splash | `src/components/SplashScreen.tsx` + provided launch imagery | 1.8-second post-launch brand impression, native-drawn Bytspot mark, gradient BYTSPOT wordmark, `Your perfect spot awaits`, chips: Parking, Venues, AI-Powered. |
| Landing | `src/components/LandingPage.tsx` | `Know Before You Go.`, location-safe product value, `Get Started`, Terms & Privacy footer. |
| Location | Native value-first permission seam | Explain nearby recommendations, arrival context, and privacy before offering `Use My Location` or `Not Now`. |
| Personalization | `src/App.tsx` onboarding quiz + provided imagery | Short context-aware Vibe → Walk → Crew quiz followed by a complete ready screen with verified live picks or capability previews. |
| Auth | `src/components/AuthenticationFlow.tsx`, `AppleSignInButton.tsx`, `GoogleSignInButton.tsx` | Sign Up / Log In toggle, Apple/Google buttons, email form, full name + optional invite code for signup, forgot password for login. |

Native frontend/API boundary:

- Native auth route contracts are `auth.signup`, `auth.login`, `auth.googleSignIn`, and `auth.appleSignIn`; no backend route changes are part of P1.
- Native signup uses the shared 6-character account minimum enforced by the current authentication contract.
- DEBUG smoke hooks are `BYT_NATIVE_PREVIEW_SPLASH=1`, `BYT_NATIVE_PREVIEW_LANDING=1`, `BYT_NATIVE_PREVIEW_LOCATION=1`, `BYT_NATIVE_PREVIEW_PERSONALIZATION=vibe|walk|crew|recommendations`, and `BYT_NATIVE_PREVIEW_AUTH=signup|login`.
- Crash-on-drift DEBUG contract self-tests are opt-in via `BYT_NATIVE_SELF_TESTS=1`; ordinary simulator, XCTest, and visual-smoke launches rely on their dedicated assertions without risking a pre-UI process exit.
- `BYT_NATIVE_LAUNCH_AUTORUN=1` is DEBUG smoke-only and auto-advances Landing → Location → Vibe → Walk → Crew → Recommendations → Main using the same state actions because this Xcode simulator runtime does not expose a `simctl io tap` operation.
- Existing Profile/tab smoke hooks bypass the launch journey so account-panel validation stays deterministic.
- Signed-out launch CTA path is frontend-only: Splash → Landing → Location → personalization → Recommendations → Main as a guest session. Auth remains available through the native auth screen/entry seams without adding backend routes.
- The ready screen and Home venue rails use venue rows only when venue-specific provenance confirms live inventory with no refresh error. Bootstrap payloads must explicitly provide `hasLiveVenueInventory`; source labels alone never establish venue trust. Home events follow the same boundary through `hasLiveEventInventory`, and known venue/event fallback fixture identities are removed even if a snapshot flag is incorrectly set. Generic Home cards are regenerated from those trustworthy venue/event models rather than accepted from opaque card IDs. Provider-backed local cards remain independently eligible on provider-labeled Discover surfaces; they cannot enter Today's Pick, generic recommendations, venue rails, or event rails. The `Available Tonight` Home claim remains hidden until dedicated availability provenance exists. Fallback, loading, unresolved, or unproven inventory uses capability previews and fail-closed Home sections. The ready screen's secondary action is `Sign in to save your experience`.
- Personalization selections persist locally under `bytspot_native_launch_vibe`, `bytspot_native_launch_walk`, `bytspot_native_launch_crew`, and `bytspot_native_launch_completed` so the main shell can later consume them without backend work.
- The ready screen's sign-in action routes to native auth without losing the frontend-only boundary.
- Password recovery is a native shell that mirrors route intent without logging credentials or accepting token flags.

Auth P2 polish contract:

- Email validation copy mirrors React: `Enter a valid email address.`
- Native signup password copy is `Use at least 6 characters.`
- Invalid signup submit copy is `Enter your name, a valid email address, and a password with at least 6 characters.`
- Native auth fields use keyboard submit progression, focus restoration on mode switch, VoiceOver labels/hints, Dynamic Type-aware spacing, and a reduced-motion-safe launch stage transition.

Launch Visual QA contract:

- Launch and auth surfaces must use geometry-aware sizing rather than single-device fixed hero sizes, with compact-height spacing for small phones and scroll-safe cards for Landing, Recommendations, and Auth.
- VoiceOver read-through must keep the launch order clear: brand impression, landing CTA, location value/actions, personalization progress/question/options, Recommendations, then auth mode/provider/email controls.
- Apple/Google native buttons must clearly expose provider-ready/connecting state and keep email sign-in available when production provider setup is unavailable on the current build.
- Multi-device visual smoke may run the launch-only capture path with `LAUNCH_VISUAL_ONLY=1` and an overridden `UDID`/`OUT` directory, reusing the same Splash → Landing → Location → Vibe → Walk → Crew → Recommendations → Main autorun guard.

## Native Fallback Audit

Allowed explicit hybrid fallbacks remain outside the Profile-critical account rows:

- Access/checkout production authorization, where real payment or access entitlement must remain behind the secure production flow.
- Venue/search/Concierge handoffs that are visibly labeled as production/web continuation.
- DEBUG-only bridge smoke hooks that intentionally open React to prove the native bridge returns to SwiftUI panels.

Guardrails:

- Main Profile, Account rows, Preferences, App Settings, Safety, and Legal rows open `NativeProfilePanel` sheets.
- Source guards must reject a repeated Social/Friends menu group and stale P1/P2 panel naming.
- OCR guards must reject `Back to native` on native Profile and targeted native Profile panels.

## React Preference Source of Truth

Native Profile preference panels mirror the React/web files below. The SwiftUI panels may store granular native keys locally, but their labels, defaults, and product intent must stay aligned with these sources until a shared preferences API is introduced.

| Native panel | React source | Source-of-truth semantics |
| --- | --- | --- |
| Vibe Preferences | `src/components/VibePreferences.tsx` | Atmosphere sliders are 1–10 for Energy, Social, Style, Noise, Crowd. Defaults are `7/6/7/5/5`; price range starts `$60–$250`; max distance starts `5 mi`; time slots default Afternoon+Evening; groups default Solo+Couple+Small Group; AI Learning and Seasonal Adjustments default on; Social Influence defaults off. Vibe score maps to selected tokens `coffee`, `food`, `drinks`, `nightlife` through `saveUserPreferences({ vibePreferences.selectedVibes })`. |
| Parking Preferences | `src/components/ParkingPreferences.tsx` | Parking type defaults: Covered on, Outdoor off, Garage on, Street off. Feature defaults: EV and Security on, Accessible off, Valet on. Smart defaults: Auto-Reserve off, Auto-Extend on, Expiry on, Nearby off. Budget defaults are `$20/hr`, `$50/day`, walking `0.5 mi`, Closest on, Cheapest off. The API stores `parking.security` as `basic | standard | premium`; the native toggle maps off to `basic` and preserves whichever level the server last returned when on. |
| Notifications | `src/components/NotificationSettings.tsx` | Channel groups are Push, Email, SMS. Push: reservations/promotions/reminders/insider on, nearby off. Email: reservations/newsletter/receipts on, promotions off. SMS: reservations/reminders/emergencies on. React backend routes are `user.notifications.getPrefs` and `user.notifications.updatePrefs`. |
| Location & Privacy | `src/components/LocationSettings.tsx` | Controls are Primary Location Permission, Enhanced Indoor Accuracy, Background Location, Location for Offers & Promotions, Venue Recommendations, and Transparency & Privacy. The native panel omits Active Job Tracking, which belongs to the valet driver experience. React storage keys include `bytspot_location_settings` and `bytspot_venue_recommendations_enabled`. |

Native API persistence:

- Notifications now load/save natively through `user.notifications.getPrefs` and `user.notifications.updatePrefs` when an authenticated bearer session is available; guest mode remains local/native only.
- Vibe/Parking use the existing `user.preferences.get` and `user.preferences.update` API where the current backend schema supports it.
- Vibe API sync scope is the compatible `vibes` token derived from the React Vibe score mapping (`coffee`, `food`, `drinks`, `nightlife`).
- Parking API sync scope is the compatible subset: `parking.covered`, `parking.evCharging`, and `parking.security`.
- Rich Vibe/Parking controls that have no backend fields yet remain persisted natively via `@AppStorage`; do not add a React fallback to compensate for missing API fields.

Guardrails:

- Do not collapse Vibe/Parking into generic placeholder rows.
- Do not replace notification channel groups with three custom native-only toggles.
- Do not imply continuous background tracking; background location remains contextual to valet return/job flows.
- DEBUG self-tests must lock the React source file names, key label arrays, defaults, and native storage keys.

## Rollout Order

| Priority | Scope | Done when |
| --- | --- | --- |
| P0 | Main native Profile IA and native row routing | Passport, Today, Progress, Social, Account, Preferences, App, Legal order visible |
| P1 | Primary panels | Reservations, My Access, Rewards, Payment Methods, Vehicles, Personal Info native interaction shells |
| P2 | Social/activity panels | Invite, Find Friends/social graph, Saved Spots, Places I've Been — native SwiftUI panels complete without duplicate Social menu row |
| P3 | Settings/legal completion | Appearance is persisted; Notifications, Location & Privacy, General, Delete Account, Legal, and logout/session actions are native SwiftUI |

## Validation Gate

- Swift diagnostics clean.
- `xcodebuild` App simulator build succeeds.
- Native Profile OCR smoke confirms Passport + target panel text.
- Native Auth/Splash OCR smoke confirms Splash, Landing, Auth signup, and Auth login surfaces render React source-of-truth copy.
- OCR does not detect `Back to native` on native Profile rows.
- DEBUG self-tests lock section labels, native panel mappings, card radius, spacing, and theme placement.
- XCTest locks tRPC envelope unwrapping for profile, vehicle, and payment-summary payloads.
- Consolidated smoke suite covers all-tab Light Mode, account interaction panels, selected P3 panels, source fallback guards, and `Back to native` OCR rejection.
- Auth fixture smoke confirms signed-in Profile, Vehicles, and Payment Methods surfaces render non-guest real-data states without using secrets.