# iOS / Xcode work for Daniel (REA re-review follow-up)

Local API branch: `fix/abuse-risk-review-2026-11-10` in bytspot (not pushed).
These screens have to ship **before** the server flags below are turned on in Render. Nothing here has been pushed, merged or deployed.

The box has no Xcode, so none of this was built. The API already has the procedures and the `X-Bytspot-Client: ios` header (commit `ee18ca0`).

## 1. Date of birth / age screen (`consent.setAge`)

Call after sign-in, and again if a 18+ or 21+ party, bottle session, or host publish is refused with a `FORBIDDEN` message about age.

- **Procedure:** `consent.setAge` (authenticated, rate-limited 10/min)
- **Input (at least one field required):**
  ```
  { birthDate?: "YYYY-MM-DD", confirm18?: true }
  ```
  - 21+ parties and any bottle session need `birthDate`. An 18+ checkbox is not enough.
  - 18+ parties accept either a birth date or `confirm18: true`.
  - Birth date can only be set once. A second call returns `CONFLICT` ("already set. Contact support").
  - Under `MIN_SIGNUP_AGE` (default 13) the API refuses the date.
- **Output:** `{ ok: true }`
- **What the client can read back:** `consent.status` → `age.hasBirthDate`, `age.confirmed18`, `age.canEnter21Plus`. The API never returns the birth date itself.

Copy to show:
- 18+: "Confirm you are 18 or older, or enter your date of birth."
- 21+: "This is 21+. Add your date of birth. ID is checked at the door."

## 2. Terms consent at signup and on version change (`consent.acceptTerms`)

- **Procedure:** `consent.acceptTerms`
- **Input:** `{ version: string }` — must equal `consent.status.terms.currentVersion` (today the default is `2026-10-10`, the published bytspot.app terms, not the 2026-11-10 drafts).
- **Output:** `{ version, acceptedAt }` (ISO timestamp)
- **Mismatch:** `CONFLICT` — reload the terms and retry.
- Also accepted on `auth.signup` as optional fields until the flag is on:
  ```
  { birthDate?: "YYYY-MM-DD", ageConfirmed18?: boolean, acceptTerms?: boolean, termsVersion?: string, ...existing signup fields }
  ```
  When `SIGNUP_REQUIRE_AGE_AND_TERMS=true`, signup without both age and terms is refused.

`consent.status.terms.needsAcceptance` is true when the accepted version is not the current one. Show the terms sheet then.

Legal pages are still drafts in `bytspot-beta/docs/legal-drafts/`. Do not point the live UI at those until counsel signs off and they are published. Checkout already links to `https://bytspot.app/terms-of-sale`, which is not published yet.

## 3. AI concierge consent sheet (`consent.setAiConsent`)

Show this before `concierge.plan` or `concierge.chat` once the flag is on.

- **Procedure:** `consent.setAiConsent`
- **Input:** `{ consent: boolean }` — `true` records consent, `false` withdraws it.
- **Output:** `{ consentedAt: string | null }`
- **Status:** `consent.status.ai` → `{ provider: "OpenAI", consentedAt, required }`
  - `required` mirrors `CONCIERGE_REQUIRE_AI_CONSENT`. When it is true and `consentedAt` is null, the API refuses concierge calls.

Sheet copy should name OpenAI and say approximate location and preferences may be sent to it. (App Review 5.1.2(i).)

## 4. Read `consent.status` on launch

- **Procedure:** `consent.status` (authenticated, 60/min)
- **Output:**
  ```
  {
    terms: { currentVersion, acceptedVersion, acceptedAt, needsAcceptance },
    age:   { hasBirthDate, confirmed18, canEnter21Plus },
    ai:    { provider: "OpenAI", consentedAt, required }
  }
  ```
Use this to decide which of the three sheets to present. A tested helper with the same rules lives in the web app at `src/utils/memberConsent.ts` (`pendingConsentGates`).

## 5. Header already added

`BytspotAPIClient.makeRequest` already sends `X-Bytspot-Client: ios`. Keep it. The API uses it to refuse Platinum checkout on iOS. It is not a security boundary.

## 6. Move the API base URL off Render

Shipped iOS and web still call `https://bytspot-api.onrender.com`. The origin lock (`ORIGIN_LOCK_SECRET`) must stay off until both clients use `https://api.bytspot.app`. After the new build is out:

1. Point iOS / App Clip base URL at `https://api.bytspot.app`.
2. Point web at `VITE_API_URL=https://api.bytspot.app`.
3. Only then set `ORIGIN_LOCK_SECRET` on Render (32+ characters). Direct calls to the Render origin will then 403 with "Use https://api.bytspot.app."

See `bytspot/.augment/bytspot-api/docs/RENDER_ORIGIN_LOCK.md`.

## 7. App Store Connect privacy labels

Mirror the privacy manifests already updated in this branch (`ios/App/App/PrivacyInfo.xcprivacy` and `ios/App/Clip/PrivacyInfo.xcprivacy`): Photos or Videos, User ID, Other User Content, Coarse Location, Product Interaction, Audio Data; Precise Location is Linked in the app, Linked **false** in the Clip. Confirm whether Audio Data leaves the device. Set the age rating for alcohol and 21+ events.

## 8. Flags to turn on in Render AFTER the iOS (and web) screens ship

Do not turn these on in the same deploy as the API if the App Store build is not out yet.

| Flag | Default | Turn on when |
|---|---|---|
| `AGE_GATE_ENFORCED` | `false` | The DOB / 18+ screen can call `consent.setAge`. Enables 18+/21+ at request, checkout, approve and check-in, and host 18+ at publish. |
| `SIGNUP_REQUIRE_AGE_AND_TERMS` | `false` | Signup can send `birthDate`/`ageConfirmed18` and `acceptTerms` + `termsVersion`. |
| `CONCIERGE_REQUIRE_AI_CONSENT` | `false` | The concierge consent sheet can call `consent.setAiConsent`. |
| `PLACES_PHOTO_REQUIRE_AUTH` | `false` | Only if iOS loads place photos from URLs returned by the API (they now include `exp` and `sig`). Do not turn on if the app still uses a hand-built `/places/photo?name=` URL. |
| `ORIGIN_LOCK_SECRET` | unset (off) | After clients call `api.bytspot.app`, never before. |

Leave `PAID_CHECKOUT_ENABLED` and `PARTY_PAYOUTS_ENABLED` as they are until the live Stripe key, webhook events, and counsel items in FIXES.md are done.

## 9. Not in this iOS pass (still open)

- Image moderation (needs a vendor).
- Rotating or device-bound attendee QR (P3).
- Admin 2FA, vendor EIN, Stripe Tax, charge-type change, per-user contact salts.
- Blurring signed-out private-sale photos (no image processor on the API; Open Graph still uses the full photo).
