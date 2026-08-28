# Stripe Capital Cash-Flow Map

Scope: the Bytspot API in `bytspot/.augment/bytspot-api` and the iOS App/Clip in
`bytspot-beta/ios`. Every row below is either verified against that code or
labelled **Not implemented**. Nothing here describes intent as if it shipped.

> **Revision note.** An earlier version of this file described a vendor
> marketplace — `Vendor`, `Booking`, `vendors.startOnboarding`,
> `vendors.syncOnboarding`, `booking.createCheckout`, `Vendor.commissionBps`,
> `Booking.stripeTransferDestination`, `PointTransaction.entity`,
> `User.isVendorPremium`, `User.isValetPremium` — as implemented. None of those
> models, fields, or procedures exist in this codebase. The Prisma schema has 31
> models and no `Vendor` or `Booking`. That document could not be submitted to a
> lender as written, so it has been replaced with the verified state.

## Live Stripe Surfaces

| Surface | Router / route | Stripe object | Account | Status |
| --- | --- | --- | --- | --- |
| Insider Premium subscription | `subscription.createCheckout` | Checkout Session, `mode: 'subscription'` | Platform | Implemented. Returns `demoMode: true` when Stripe is unconfigured. |
| Party ticket | `party.createTicketCheckout` (`partyRouter.ts:1062`) | Checkout Session, `mode: 'payment'` | Platform | Implemented. Charge only — see the payout gap below. |
| Party ticket settlement | `routes/partyStripeWebhook.ts` | `checkout.session.completed` | Platform | Implemented. Sets `PartyGuest.status = 'ticketed'`, `accessGranted = true`. |
| Valet tip | `tips.createTip` | PaymentIntent | Platform | Implemented. Records `Tip.stripePaymentIntentId`; no transfer to the valet. |

Entitlement state on `User` is `isPremium`, `membershipTier`, and
`stripeCustomerId`. There are no vendor or valet premium flags.

## The Payout Gap

**No money leaves the platform account.** This is the single most important fact
for a Capital review and for any host-facing revenue promise.

- Stripe Connect is absent end to end: no `stripeAccountId`, no
  `onboardingStatus`, no `transfer_data`, no `application_fee_amount`, and no
  Connect onboarding or webhook anywhere in the API.
- `party.createTicketCheckout` builds a plain platform charge. The host is not a
  party to the transaction and no transfer is scheduled.
- `HostProfile` carries identity and onboarding-questionnaire fields only
  (`status`, `currentStep`, `onboardingData`, `handle`, `hostDestinations`).
  It has no payout destination.
- There is no platform fee for party tickets, so Bytspot's take is currently
  100% by omission rather than by policy.

Consequence: every ticket sold to date is Bytspot revenue held on the platform
account with no code path to pay the host. Any host-facing "cash out" or
earnings surface is unbuildable until a rail exists, and any UI that implies one
would be a promise the backend cannot keep.

## Ledger and Attribution Gaps

- `PointTransaction` has `type`, `amount`, `description`, `category` only — no
  `entity`, `stripeSessionId`, or `stripePaymentIntentId`. Point movements
  cannot currently be reconciled against Stripe objects.
- No model carries a subsidiary/entity tag, so the entity map below is a legal
  structure, not something the data can presently prove.
- Party ticket metadata does carry `kind`, `checkoutId`, `partyId`, `userId`,
  `ticketTierName`, and `idempotencyKey`, which is enough to attribute a charge
  to a party and a buyer.

## Entity Map

Legal structure. Only the rows marked with a code anchor have any code today.

| Entity | Role | Code anchor |
| --- | --- | --- |
| Bytspot Holdings LLC | Parent / IP holding | None. |
| Bytspot Inc. | Consumer app, Insider Premium, party tickets | `User.isPremium`, `subscription.createCheckout`, `party.createTicketCheckout`. |
| Bytspot Experiences LLC | Valet/logistics layer | `Tip`, `tips.createTip`. |
| Bytspot Vendor Services LLC | Vendor SaaS / marketplace | None. No vendor code exists. |
| Bytspot Property REIT LLC | Real-estate/parking assets | None. |
| Bytspot Foundation | Community / 501(c)(3) | None. |

## Stripe Dashboard Source of Truth

| Dashboard object | Config field | Status |
| --- | --- | --- |
| API secret key | `STRIPE_SECRET_KEY` / `config.stripeSecretKey` | In use. |
| Webhook signing secret | `STRIPE_WEBHOOK_SECRET` / `config.stripeWebhookSecret` | In use by the party webhook. |
| Connected accounts | — | Not implemented. |
| Application fee | — | Not implemented. |

## Capital Readiness

- Subscription MRR is the only clean Capital signal today, because it is the
  only recurring Stripe-backed revenue.
- Party ticket GMV is real charge volume, but it is platform revenue with an
  unfunded host obligation behind it. It should not be presented as marketplace
  GMV until a transfer rail exists.
- Marketplace GMV, application-fee revenue, and patch attribution are all
  unbuilt and should be described as roadmap.

## Next Implementation Slice

Ordered so that no surface promises money it cannot move.

1. **Host payout rail.** Add Connect Express onboarding for hosts: a payout
   destination on `HostProfile`, a synced readiness state, and account-status
   webhooks.
2. **Route ticket money through it.** Add `transfer_data.destination` and an
   explicit `application_fee_amount` to `party.createTicketCheckout`, with the
   platform fee stored on `PartyCheckout` so a host can be shown gross, fee, and
   net.
3. **Host earnings read surface.** Only after 1 and 2 — sold, gross, fee, net,
   and payout state, sourced from settled webhook data.
4. **Reconcilable ledger.** Add Stripe identifiers and an entity tag to
   `PointTransaction` so point movements tie back to Stripe objects.
5. **Add-on revenue (DJ tips and similar).** Last. An add-on inherits the payout
   gap of the stream it rides on, so it must not ship before step 3 proves a
   host can see and receive base ticket revenue.
