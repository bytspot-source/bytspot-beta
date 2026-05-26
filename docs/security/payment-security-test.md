# Payment Security Test

Date: 2026-05-25
Scope: Bytspot frontend payment posture and `bytspot-api` Stripe/payment procedures

## Executive Summary

Core payment amount, capture, and ledger tests passed. Marketplace checkout and Apple Pay secure holds are mostly server-authoritative, and Stripe webhook ingress has a signed raw-body Express route.

Update 2026-05-25: the public tRPC webhook bypass finding is remediated. `subscription.webhook` and `vendors.connectWebhook` now require an internal Stripe webhook context flag that is set only by the signed `/stripe/webhook` REST dispatcher after Stripe signature verification. Direct public callers are covered by negative tests and return `UNAUTHORIZED`.

## Validation Run

Backend:

- Initial audit: `npm test -- src/trpc/bookingRouter.test.ts src/__tests__/router.test.ts src/trpc/vendorRouter.test.ts`
- Initial result: 104/104 passed
- Remediation validation: `npm test -- src/__tests__/router.test.ts src/trpc/vendorRouter.test.ts src/trpc/bookingRouter.test.ts`
- Remediation result: 106/106 passed
- Build validation: `npm run build` passed

Reviewed payment surfaces:

- `src/routes/stripeWebhook.ts`
- `src/index.ts`
- `src/trpc/router.ts`
- `src/trpc/bookingRouter.ts`
- `src/trpc/vendorRouter.ts`
- `prisma/schema.prisma`

## Coverage Matrix

| Area | Status | Evidence | PM Risk |
|---|---|---|---|
| Stripe webhook raw-body route | Pass | `/stripe/webhook` is mounted before `express.json()` and uses `express.raw()` | Low |
| Stripe webhook signature verification | Pass on REST route | REST route calls `stripe.webhooks.constructEvent(...)` using configured webhook secret | Low |
| Public tRPC webhook bypass | Remediated | `subscription.webhook` and `vendors.connectWebhook` now require signed-route internal Stripe webhook context; direct public callers are denied | Low |
| Marketplace checkout amount authority | Pass | Booking checkout derives `unit_amount` from service offer/server-calculated `finalChargeCents` | Low |
| Apple Pay hold amount authority | Pass | Secure hold rejects client amount/currency mismatch against service price/currency | Low |
| Apple Pay manual capture | Pass | Secure hold uses `capture_method: manual` and only captures on completion | Low |
| Secure hold idempotency | Partial | Stripe idempotency key is forwarded for payment intent creation | Medium |
| Provider capture permission | Pass | Capture path requires owner/manager role; staff capture rejection test exists | Low |
| Connected account transfer destination | Pass | Checkout/hold include vendor Stripe account destination and platform fee metadata | Low |
| Ledger replay resistance | Pass/Partial | Unique Stripe IDs on Booking/PointTransaction plus P2002 handling reduce duplicate ledger writes | Medium |
| Parking checkout fulfillment | Partial | Parking checkout webhook is acknowledged/logged but does not create/update a durable booking row | Medium |

## Finding P1 — Public tRPC webhook signature bypass — Remediated

Severity: High / Release blocker for production payments — closed 2026-05-25

Original behavior:

- `src/routes/stripeWebhook.ts` correctly verifies Stripe signatures for `/stripe/webhook`.
- That route dispatches verified events into tRPC callers.
- However, `subscription.webhook` and `vendors.connectWebhook` are `publicProcedure`s.
- Existing tests call these procedures directly with mock event payloads, proving they can process events without a Stripe signature when invoked through tRPC.

Impact:

- A forged `checkout.session.completed` payload could mark subscription or booking state paid/active if IDs are known or guessed.
- A forged Connect `account.updated` payload could alter vendor onboarding status if a Stripe account ID is known.
- Rate limiting reduces abuse volume but does not establish authenticity.

Remediation implemented:

1. Added internal Stripe webhook context to the tRPC `Context` type.
2. Added `stripeWebhookProcedure`, which rejects callers unless `ctx.internal.stripeWebhook` is set.
3. Updated the signed `/stripe/webhook` route to call tRPC with `{ internal: { stripeWebhook: true } }` only after Stripe `constructEvent(...)` succeeds.
4. Updated `subscription.webhook` and `vendors.connectWebhook` to use the internal procedure.
5. Added negative tests proving direct public callers cannot invoke either webhook processor.

Minimum release gate:

- Direct tRPC calls to `subscription.webhook` and `vendors.connectWebhook` return `UNAUTHORIZED` unless invoked by the signed route dispatcher.

## Finding P2 — Parking checkout has no durable booking fulfillment

Severity: Medium

Current behavior:

- Parking Checkout creates a Stripe session with metadata.
- The webhook acknowledges `parking.checkout` and returns metadata.
- Tests assert no `db.booking.update` or point ledger mutation happens for parking checkout.

Impact:

- Payment completion is observable in logs but not clearly tied to a durable entitlement/reservation in the backend.
- Customer support and reconciliation may be difficult if parking purchases need fulfillment, refunds, or dispute handling.

Recommended remediation:

- Create a durable parking purchase/reservation record before checkout and update it on signed webhook completion.
- Store `stripeSessionId`, `stripePaymentIntentId`, `amountCents`, `spotId`, `userId`, and fulfillment status.

## Positive Controls Confirmed

- Payment tests passed 104/104.
- Apple Pay secure holds require configured Stripe secure-hold payment method configuration.
- Guest Apple Pay secure holds require contact email for later account linking.
- Secure hold amount and currency must match service price and currency.
- Capture happens after provider completion, not at authorization time.
- Secure hold capture is role-restricted; staff can progress status but cannot capture funds.
- Booking and point ledgers use unique Stripe identifiers to reduce duplicate credit/debit records.
- Refund/dispute handlers restore marketplace points with refund/dispute audit IDs.

## Release Recommendation

- Finding P1 is closed and no longer blocks production payment launch.
- P2 can ship only if parking checkout is intentionally an MVP acknowledgement flow; otherwise treat it as required before paid parking launch.

## Next Security Step

Proceed to Deep Link / App Clip security review:

- patch ID tokenization
- rotating token expiry/replay behavior
- guest flow isolation
- QR/NFC abuse boundaries
