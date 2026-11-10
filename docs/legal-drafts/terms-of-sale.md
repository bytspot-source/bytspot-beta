# Bytspot Terms of Sale (passes and tickets)

> **DRAFT for attorney review, not legal advice.** Prepared 2026-11-10 from what the code does on branch `fix/abuse-risk-review-2026-11-10`. Do not publish until counsel has reviewed it. Bracketed items `[LIKE THIS]` need a decision from Daniel or counsel.
>
> Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350 · Support: `[SUPPORT_EMAIL — replace before publishing; do not use a personal Gmail]`

_This page must be live at **https://bytspot.app/terms-of-sale** before paid checkout is turned on. The Stripe Checkout page links to it._

## 1. Who sells what
- **Party and event passes** are sold by the **host** who created the event. Bytspot Inc. takes the payment through Stripe and pays the host after the event, minus any platform fee shown at checkout.
- **Venue tickets** are sold by the **business named at checkout**. Bytspot processes the payment.

## 2. Price and fees
The total, including any fees, is shown before you pay. [COUNSEL/DANIEL: sales tax. Stripe Tax is not on yet. See the open questions.]

## 3. Refunds
These match the text shown on the Stripe Checkout page:
- **The host or business cancels, or Bytspot removes the event:** you get a full refund to the card you paid with. Bytspot starts the refund automatically.
- **Otherwise,** passes are non-refundable unless the host offers a refund.
- **Bottle minimums** and anything you buy at the venue are settled with the venue. Bytspot doesn't sell alcohol.
- **21+ events** need a valid government ID at the door. If you are turned away because you are under age or have no ID, you don't get a refund.

## 4. Chargebacks
If you dispute a charge with your bank, we may pause the pass and the host's payout while the dispute is open. Please contact [SUPPORT_EMAIL] first. Most problems are faster to fix directly.

## 5. Payouts to hosts
Hosts are paid only after the event, only if it wasn't cancelled, and only while no dispute or fraud warning is open on the order. Host Terms (/host-terms) apply.

## Open questions for counsel
1. Who collects and remits Georgia sales tax on admissions? See O.C.G.A. 48-8-2(31)(C) and the marketplace-facilitator rules. Who is the seller of record?
2. Is "non-refundable unless the host offers one" acceptable under Georgia consumer law and Apple and Stripe rules?
3. Should a **won** dispute bring the pass back automatically? The code does not do this.
