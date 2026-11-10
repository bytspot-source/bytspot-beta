# Legal drafts (REA X3, item 12)

> **DRAFT for attorney review, not legal advice.** Prepared 2026-11-10 from what the code does on branch `fix/abuse-risk-review-2026-11-10`. Do not publish until counsel has reviewed it. Bracketed items `[LIKE THIS]` need a decision from Daniel or counsel.
>
> Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · Support: `[SUPPORT_EMAIL — replace before publishing; do not use a personal Gmail]`

| File | Publish at | Used by |
|---|---|---|
| terms-of-service.md | /terms | signup terms consent (API `termsVersion`) |
| terms-of-sale.md | /terms-of-sale | Stripe Checkout `custom_text` (API `src/lib/checkoutTerms.ts` links here) |
| host-terms.md | /host-terms | host onboarding / Connect gate |
| private-sales-prohibited-items.md | /private-sales | mirrors `PROHIBITED_ITEMS` in API `src/services/privateSalesPolicy.ts` |
| alcohol-policy.md | /alcohol-policy | 21+ / bottle-minimum events |
| privacy-policy.md | /privacy | App Store privacy URL; must match the iOS privacy manifests |

Questions for counsel are in **Open questions** at the end of each file. The web components `src/components/TermsOfService.tsx` and `PrivacyPolicy.tsx` were deliberately **not** changed. Update them only from counsel-approved text.
