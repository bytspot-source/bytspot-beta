# Bytspot Privacy Policy

> **DRAFT for attorney review, not legal advice.** Prepared 2026-11-10 from what the code does on branch `fix/abuse-risk-review-2026-11-10`. Do not publish until counsel has reviewed it. Bracketed items `[LIKE THIS]` need a decision from Daniel or counsel.
>
> Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · Support: `[SUPPORT_EMAIL — replace before publishing; do not use a personal Gmail]`

_Must match the iOS privacy manifests (`ios/App/App/PrivacyInfo.xcprivacy`, `ios/App/Clip/PrivacyInfo.xcprivacy`) and the App Store Connect privacy labels._

## What we collect
| Data | Why | Linked to you |
|---|---|---|
| Name, email, phone, date of birth | Account, sign-in, age rules | Yes |
| **Contacts (as one-way codes)** | Finding friends on Bytspot. Your phone turns contact phone numbers and emails into keyed one-way codes (HMAC) and sends only those codes. Contact names and other details stay on your device. | Yes |
| **Precise location** | Nearby places, Plan meet-up points, and live location sharing with Plan members **only when you turn it on** | Yes |
| Coarse location | Area-level demand and "who's out" counts. Rounded to about 500 m before storage or display. | Yes |
| Photos | Profile, Plans, listings and reviews | Yes |
| Voice | Voice search and concierge, if you use them. [DANIEL: confirm whether audio leaves the device or only the transcript.] | Yes |
| Payment info and purchases | Passes and tickets. Card details are collected by Stripe; Bytspot doesn't see full card numbers. | Yes |
| Messages, listings, reports | Running the features you use, and safety | Yes |
| App activity and crash data | Fixing bugs and preventing abuse | [Yes/No] |

## Who we share it with (service providers)
- **Stripe:** payments, Connect payouts, and identity checks for hosts
- **OpenAI:** concierge answers. Your messages and venue data are sent; contacts and location history are not.
- **Resend:** sign-in codes and transactional email
- **Sentry:** crash and error reports
- **Cloudflare:** hosting, network and security
- **Google (Places):** place details and photos
- [**Render:** API hosting, plus any other providers DANIEL confirms]

We don't sell your personal information, and we don't use it for cross-app tracking.

## Who else can see what
- Plan members see what you share in the Plan, including live location if you turn it on.
- Event guests see the exact venue only after they are approved or have bought a pass.
- Private-sale buyers see the payment handle the seller chose to share.

## Your choices
- Turn location, contacts, camera and microphone permissions on or off in iOS Settings.
- Stop location sharing in any Plan.
- Delete your account in Settings. We delete or anonymise your data within [30] days, except for what we must keep for payments, tax, disputes or legal reasons, for [X] years.

## Children
Bytspot isn't meant for children under [13 / 18 — COUNSEL]. Accounts found to be under age are removed.

## Security
We protect data in transit with encryption, limit who on our team can see it, and rate-limit lookups. No system is perfect.

## Contact
Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · [SUPPORT_EMAIL]

## Open questions for counsel
1. Do we need state-specific sections (CCPA/CPRA, and others) given our current users?
2. Retention periods for payment and dispute records.
3. Is the contact-hash upload "collection" of third parties' data that needs extra disclosure?
