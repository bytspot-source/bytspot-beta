# Private sales: rules and prohibited items

> **DRAFT for attorney review, not legal advice.** Prepared 2026-11-10 from what the code does on branch `fix/abuse-risk-review-2026-11-10`. Do not publish until counsel has reviewed it. Bracketed items `[LIKE THIS]` need a decision from Daniel or counsel.
>
> Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · Support: `[SUPPORT_EMAIL — replace before publishing; do not use a personal Gmail]`

## How private sales work
Buyers pay sellers **directly**, for example by Venmo or Cash App. **Bytspot doesn't process or protect these payments.** Meet in a public place, check the item before you pay, and never pay a stranger in advance. Venmo and Cash App personal accounts may have their own rules about selling goods.

## Limits
These are enforced by the API:
- You must confirm your email before you buy or sell.
- The maximum price is **$5,000** per listing. New sellers can list up to **$2,000** until they have completed **3** sales.
- **Event tickets:** you must enter the face value, and you can sell **at face value or less**.

## Prohibited items
Listings that match these are refused, and reports are reviewed:
- Alcohol of any kind, including bottle service
- Tobacco, vapes and nicotine
- Drugs, cannabis or THC, kratom, and prescription drugs
- Injectables and prescription-only drugs, such as insulin, GLP-1s and steroids
- Weapons, ammunition, explosives and fireworks
- Counterfeit or replica goods
- Gift cards, cash, crypto, and accounts or followers
- IDs, documents and personal data
- Adult content and services
- Live animals
- Stolen goods, recalled products, and anything illegal to sell in Georgia or the buyer's state

## Open questions for counsel
1. Does Georgia ticket-resale law (O.C.G.A. 43-4B-25) allow any markup without a broker licence? The code allows 0% (`TICKET_RESALE_MAX_MARKUP_BPS`).
2. Does showing P2P handles create any money-transmission or payment-app terms exposure for Bytspot?
3. Are the price caps reasonable for fraud and safety?
