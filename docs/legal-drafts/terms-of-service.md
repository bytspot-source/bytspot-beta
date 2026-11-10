# Bytspot Terms of Service

> **DRAFT for attorney review, not legal advice.** Prepared 2026-11-10 from what the code does on branch `fix/abuse-risk-review-2026-11-10`. Do not publish until counsel has reviewed it. Bracketed items `[LIKE THIS]` need a decision from Daniel or counsel.
>
> Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · Support: `[SUPPORT_EMAIL — replace before publishing; do not use a personal Gmail]`

_Last updated: [DATE]. Version: [TERMS_VERSION, matching the API]_

## 1. Who we are
Bytspot is run by Bytspot Inc. ("Bytspot", "we"). These terms cover the Bytspot app, App Clip, website and API (the "Service").

## 2. Eligibility and accounts
- You must be at least **[13 / 18 — COUNSEL]** to make an account. The API enforces `MIN_SIGNUP_AGE`, which defaults to 13. Some features have higher age limits: events marked 21+ and anything involving alcohol need you to be 21, and buying passes or hosting paid events needs you to be 18.
- Give accurate information and keep your login safe. You are responsible for what happens on your account.
- We may ask you to confirm your email before you use certain features, such as private sales.

## 3. What Bytspot is
Bytspot helps people find places, make Plans with friends, host and join events, buy passes from hosts and businesses, and list personal items for private sale. **Bytspot does not run venues, does not sell alcohol and is not the organizer of events that users or businesses host.**

## 4. Your content
- You keep ownership of what you post: photos, plan names, chat, listings and reviews. You give Bytspot a non-exclusive licence to host and show it in order to run the Service.
- Don't post content that is illegal, sexual or involves minors, hateful, harassing, violent or threatening. Don't post someone else's personal information, spam, or anything you don't have the rights to.
- You can report users, messages, Plans, events, listings and photos in the app. We review reports. We may remove content, limit features or suspend accounts, and we may refund buyers where these terms allow.

## 5. AI concierge
The concierge uses **OpenAI** to answer questions about places. We send OpenAI your message and venue data. We don't send your contacts or exact location history. Answers can be wrong, so check hours, prices and age rules with the venue. Don't enter sensitive personal information. [If `CONCIERGE_REQUIRE_AI_CONSENT` is turned on, you will be asked to agree before first use.]

## 6. Payments
Paid passes and tickets are processed by **Stripe**. The Terms of Sale (/terms-of-sale) cover refunds and cancellations. Hosts who get paid also agree to the Host Terms (/host-terms). Private sales are paid directly between users and are **not** processed or protected by Bytspot (section 7).

## 7. Private sales
Private-sale payments go directly between buyer and seller, for example by Venmo or Cash App. Bytspot does not handle the money, does not hold funds in escrow, and does not guarantee items. Prohibited items and price limits are at /private-sales.

## 8. Things you may not do
- Scrape the Service.
- Get around rate limits, location or age checks.
- Make fake accounts or events.
- Use stolen payment methods or file false chargebacks.
- Resell tickets above the allowed price.
- Use Bytspot to sell alcohol, drugs or weapons.

## 9. Ending your account
You can delete your account in Settings. We may suspend or end accounts that break these terms. We will refund unhonoured purchases as the Terms of Sale describe.

## 10. Disclaimers and limits of liability
[COUNSEL: standard as-is disclaimer, liability cap, and indemnity for user-hosted events and private sales.]

## 11. Disputes
[COUNSEL: Georgia governing law; arbitration or small claims; class-action waiver if wanted.]

## 12. Contact
Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · [SUPPORT_EMAIL]

## Open questions for counsel
1. Minimum age: should it be 13, as now, or 18? This interacts with COPPA, Apple's age rating, and event and alcohol features.
2. Do we need an arbitration clause, and is it enforceable in Georgia?
3. Is the AI disclosure enough, or do we need opt-in consent before launch?
