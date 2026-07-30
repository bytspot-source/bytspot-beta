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
| Insider membership | active/available, Stripe checkout, review-build handling | Subscription/access state, not random promo |
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
- Bytspot member tier
- Following / Points / Badges
- Passive theme status only, e.g. `Auto theme`

### 2. Today

- My Reservations
- My Access
- Active Virtual Patch/QR/NFC state if present

### 3. Progress

- Parker Progress
- Rewards & Badges
- Insider/subscription state as a status line or CTA, not a disconnected card

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
Avatar  Name / Guest       Tier + theme status
Following   Points   Badges

[QUICK ACTIONS]
Wallet          Bookings
Rewards         Saved

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
- The ready screen and Home venue rails use venue rows only when venue-specific provenance confirms live inventory with no refresh error. Bootstrap payloads must explicitly provide `hasLiveVenueInventory`; source labels alone never establish venue trust. Home events follow the same boundary through `hasLiveEventInventory`, and known venue/event fallback fixture identities are removed even if a snapshot flag is incorrectly set. Provider-backed local cards remain independently eligible only for matching provider-card surfaces; they cannot unlock generated cards, venue rails, or event rails. Fallback, loading, unresolved, or unproven inventory uses capability previews and fail-closed Home sections. The ready screen's secondary action is `Sign in to save your experience`.
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
| Parking Preferences | `src/components/ParkingPreferences.tsx` | Parking type defaults: Covered on, Outdoor off, Garage on, Street off. Feature defaults: EV and Security on, Accessible off, Valet on. Smart defaults: Auto-Reserve off, Auto-Extend on, Expiry on, Nearby off. Budget defaults are `$20/hr`, `$50/day`, walking `0.5 mi`, Closest on, Cheapest off. |
| Notifications | `src/components/NotificationSettings.tsx` | Channel groups are Push, Email, SMS. Push: reservations/promotions/reminders/insider on, nearby off. Email: reservations/newsletter/receipts on, promotions off. SMS: reservations/reminders/emergencies on. React backend routes are `user.notifications.getPrefs` and `user.notifications.updatePrefs`. |
| Location & Privacy | `src/components/LocationSettings.tsx` | Controls are Primary Location Permission, Enhanced Indoor Accuracy, Background Location, Location for Offers & Promotions, Venue Recommendations, Active Job Tracking, and Transparency & Privacy. React storage keys include `bytspot_location_settings`, `bytspot_venue_recommendations_enabled`, and `bytspot_active_valet_job`. |

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