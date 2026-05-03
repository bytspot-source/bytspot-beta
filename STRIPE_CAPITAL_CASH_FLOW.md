# Stripe Capital Cash-Flow Map

This artifact uses standard Transaction Metadata, Revenue Lifecycle, and Efficiency Metrics terminology. Implementation-specific scoring details are intentionally omitted.

This artifact maps Bytspot revenue streams to the approved entity structure and the current code paths that
will support a Stripe Capital review. It distinguishes implemented subscription cash flow from marketplace
cash flow now backed by Stripe Connect onboarding, destination-charge payment creation, and frontend payout status sync.

## Entity Map

| Entity | Role | Current code anchors |
| --- | --- | --- |
| Bytspot Holdings LLC | Parent / IP holding | Strategic owner; no direct app payment path. |
| Bytspot Inc. | Consumer app, Insider Premium, platform services | `subscriptionPlans['insider-premium']`, `User.isPremium`. |
| Bytspot Vendor Services LLC | Vendor SaaS, marketplace booking rails, patch/service analytics | `Vendor`, `VendorService`, `Booking`, `HardwarePatch`, `User.isVendorPremium`. |
| Bytspot Experiences LLC | Valet/logistics provider layer | `User.isValetPremium`, `tips.createTip`, valet provider UI. |
| Bytspot Property REIT LLC | Real-estate/parking asset layer | Future parking/lot ownership contracts; not part of current vendor patch code. |
| Bytspot Foundation | Community/501(c)(3) | Future grant/donation flows; no current Stripe path. |

## Revenue Streams

| Stream | Entity | Stripe flow | Gross | Bytspot net basis | Provider payout basis | Current implementation status |
| --- | --- | --- | ---: | --- | --- | --- |
| Insider Premium | Bytspot Inc. | Checkout subscription | `$9.99/mo` fallback or `STRIPE_PREMIUM_PRICE_ID` | Gross less Stripe fees | N/A | Implemented in `subscription.createCheckout`; activates `User.isPremium`. |
| Vendor Premium | Bytspot Vendor Services LLC | Checkout subscription | `$49.00/mo` fallback or `STRIPE_VENDOR_PREMIUM_PRICE_ID` | Gross less Stripe fees | N/A | Implemented; activates `User.isVendorPremium`. |
| Valet Premium | Bytspot Experiences LLC | Checkout subscription | `$14.99/mo` fallback or `STRIPE_VALET_PREMIUM_PRICE_ID` | Gross less Stripe fees | N/A | Implemented; activates `User.isValetPremium`. |
| Vendor service booking | Bytspot Vendor Services LLC | Connect Checkout destination charge with `application_fee_amount` | `Booking.priceCents` after point discounts | `Booking.platformFeeCents`, default `Vendor.commissionBps = 800` (8%) | Gross less platform fee, Stripe fees, refunds/disputes | Implemented as `booking.createCheckout`; requires active Connect onboarding. |
| Patch-attributed service conversion | Bytspot Vendor Services LLC | Checkout Session + PaymentIntent metadata | Same as booked service | Same as booking; patch provenance in metadata | Same as booking | Implemented for service-bound patches via `patchId` / `patchUid` metadata. |
| Valet jobs/add-ons | Bytspot Experiences LLC | Target Connect destination charge or separate charges/transfers | Job/add-on price TBD | Platform commission policy TBD | Driver/provider payout after commission | UI/provider surfaces exist; production payment rail is not implemented. |
| Valet tips | Bytspot Experiences LLC | PaymentIntent | User-entered amount | Current code records full PaymentIntent on platform; target should pass through or use Connect transfer | Tip amount less Stripe fees, depending on policy | Implemented as `tips.createTip`; no Connect transfer yet. |
| Parking / property revenue | Bytspot Property REIT LLC or Bytspot Inc. | Checkout / Connect depending on asset ownership | Reservation price | Margin or commission by property agreement | Lot/operator payout when third-party-owned | Existing app parking flows should be reviewed before Capital submission. |

## Stripe Dashboard Source of Truth

| Dashboard object | Required value | Code/config field |
| --- | --- | --- |
| API key | Live secret key for API runtime | `STRIPE_SECRET_KEY` / `config.stripeSecretKey` |
| Webhook signing secret | Live endpoint secret | `STRIPE_WEBHOOK_SECRET` / `config.stripeWebhookSecret` |
| Insider Premium Price | Recurring monthly Price ID | `STRIPE_PREMIUM_PRICE_ID` |
| Vendor Premium Price | Recurring monthly Price ID | `STRIPE_VENDOR_PREMIUM_PRICE_ID` |
| Valet Premium Price | Recurring monthly Price ID | `STRIPE_VALET_PREMIUM_PRICE_ID` |
| Connected account | Vendor Express account ID | `Vendor.stripeAccountId` |
| Connected account state | `charges_enabled`, `payouts_enabled`, requirements | `vendors.startOnboarding`, `vendors.syncOnboarding`, `Vendor.onboardingStatus`. |
| Marketplace fee | Application fee amount/percent | `Vendor.commissionBps`, `Booking.platformFeeCents` |
| Revenue attribution | Checkout/PaymentIntent metadata | `userId`, `plan`, future `vendorId`, `serviceId`, `bookingId`, `patchId`, `entity`. |

## Current Code Truths

- Subscriptions already use plan metadata and map webhook events to the correct user entitlement flags.
- `vendors.startOnboarding` creates Stripe Express accounts, generates account links, and stores `Vendor.stripeAccountId`.
- `vendors.syncOnboarding` and `vendors.connectWebhook` mirror Connect readiness into `Vendor.onboardingStatus`.
- The Vendor Dashboard Fusion Engine surface now exposes a **Connect Stripe for Payouts** CTA, redirects vendors into Stripe-hosted onboarding, and calls `vendors.syncOnboarding` when Stripe returns to `/provider/connect/return`.
- `booking.createCheckout` creates pending marketplace bookings, Stripe Checkout Sessions, destination-charge PaymentIntents, and `application_fee_amount` values.
- `HardwarePatch` can bind to a vendor, service, or venue. Service binding also writes `VendorService.patchId`.
- `PointTransaction.entity` and `Booking.entity` now attach each money movement to the owning subsidiary for Stripe Capital audit exports.
- Discovery cards consume API-provided venue cards plus vendor-service cards from `vendors.search`; recent patch context can prioritize `vendors.getByPatch` service cards.

## Implemented Transaction-Proof Path

1. **Subscription MRR:** `subscription.createCheckout` writes plan, entity, points, coupon, and final-unit-amount metadata onto Stripe Checkout and subscription objects.
2. **Point redemption ledger:** On `checkout.session.completed`, point redemptions create `PointTransaction` rows with `stripeSessionId`, optional `stripePaymentIntentId`, and `entity`.
3. **Marketplace GMV:** `booking.createCheckout` creates a pending `Booking`, then a Stripe Checkout Session with `payment_intent_data.application_fee_amount` and `transfer_data.destination`.
4. **Vendor payout proof:** `Booking.stripeTransferDestination` stores the connected account, while session/payment metadata carries `vendorId`, `serviceId`, `bookingId`, `entity`, `platformFeeCents`, and payout estimate.
5. **Frontend payout readiness:** Vendors access `https://bytspot.app/provider`, open the Vendor Dashboard Fusion Engine, connect Stripe for payouts, and see `Payouts Enabled` or `Action Required` from the synced Connect account state.
6. **Webhook confirmation:** Completed payment-mode sessions update the booking to `paid`, persist `stripeSessionId` / `stripePaymentIntentId`, and ledger any marketplace point redemption.
7. **Refund/dispute handling:** Refund and dispute webhooks update booking status and restore marketplace point redemptions through `MARKETPLACE_CREDIT_REVERSAL` ledger rows tied to Stripe refund/dispute IDs.

## Recommended Next Implementation Slice

1. Add a `vendorRouter` public search surface:
   - `vendors.search` for active services with vendor and optional patch summary.
   - `vendors.getByPatch` to resolve a verified patch tap into a bookable service card.
2. Harden paid booking operations:
   - Gate `booking.createCheckout` on synced Connect readiness from `Vendor.onboardingStatus`.
   - Periodically refresh `charges_enabled`, `payouts_enabled`, and requirements for active vendors.
   - Add operational alerts for high refund/dispute rates by vendor and service.
3. Harden frontend booking actions:
   - Add persisted receipt/history views once booking read APIs expose paid/refunded/disputed marketplace bookings.
   - Add authenticated checkout restore flow that re-opens the pending service card after login/signup.
   - Add provider-facing operational alerts for high refund/dispute rates by vendor and service.

## Capital Readiness Notes

- Subscription MRR is the cleanest current Stripe Capital signal because it is already backed by Checkout subscriptions.
- Marketplace GMV becomes Capital-relevant after Connect charges are live and fee revenue appears as Stripe application fees.
- Patch attribution should be included in Stripe metadata so each physical patch can prove conversion lift and support the premium analytics narrative.