# Provider/Admin RBAC Negative Tests

Date: 2026-05-25
Scope: `bytspot-api` Provider/Vendor workspace authorization, admin approval authorization, role claims, and frontend Apple Review route hiding

## Executive Summary

Provider workspace RBAC is in good shape for the core server-side flows. Owner/Manager/Staff boundaries are enforced by backend procedures, financial fields are omitted for non-owner roles, and staff write/payment-capture attempts are blocked. Admin provider approvals are also protected by authenticated JWT group claims (`BYTSPOT_ADMIN` or `INTERNAL_OPS`).

The main caveat is a legacy admin invite/stats surface that still uses a static `ADMIN_PASSWORD` model through public tRPC procedures and REST routes. This is separate from Provider approval RBAC. It should be migrated to authenticated admin groups before production admin operations expand.

## Validation Run

Backend:

- `npm test -- src/trpc/adminProviderApproval.test.ts src/trpc/vendorRouter.test.ts src/__tests__/router.test.ts`
- Result: 98/98 passed

Reviewed surfaces:

- `bytspot-api/src/auth/vendorRbac.ts`
- `bytspot-api/src/services/providerApproval.ts`
- `bytspot-api/src/trpc/vendorRouter.ts`
- `bytspot-api/src/trpc/router.ts`
- `bytspot-api/src/routes/admin.ts`
- `e2e/apple-review-simulation.spec.ts`
- `e2e/app-store-consumer-only.spec.ts`
- `e2e/provider-patch-approval.spec.ts`

## Coverage Matrix

| Area | Status | Evidence | PM Risk |
|---|---|---|---|
| Vendor role claims in JWT | Pass | Login tests sign `vendorRoles` and vendor group claims for Manager/Owner/Admin emails | Low |
| Owner/Manager/Staff role normalization | Pass | Shared `vendorRbac` role helpers rank and normalize workspace roles | Low |
| Cross-vendor access denial | Pass | `resolveVendorAccess` loads target vendor and rejects users without DB owner/member role | Low |
| Staff catalog write denial | Pass | Staff `vendors.createService` negative test rejects before DB create | Low |
| Manager catalog write allowed | Pass | Manager create/update service tests pass without exposing `cashFlow` | Low |
| Staff booking read allowed | Pass | Staff can list/check in owned bookings without financial `cashFlow` | Low |
| Staff secure-hold capture denied | Pass | Staff completion of funds-authorized booking rejects and Stripe capture is not called | Low |
| Manager secure-hold capture allowed | Pass | Manager completion captures manual hold and records capture metadata | Low |
| Manager Stripe Connect denied | Pass | `vendors.startOnboarding` requires owner role | Low |
| Manager Stripe account sync denied | Pass | Manager `syncOnboarding` returns `account: null` and does not retrieve Stripe account | Low |
| Provider approval admin auth | Pass | Public caller gets `UNAUTHORIZED`; authenticated non-admin gets `FORBIDDEN` | Low |
| Provider approval admin groups | Pass | `BYTSPOT_ADMIN` and `INTERNAL_OPS` are accepted by `assertProviderApprovalAdmin` | Low |
| Apple Review internal route hiding | Pass | E2E asserts `/provider`, `/vendor`, `/host`, `/admin`, `/admin/approvals` hide in review build | Low |
| Legacy invite/stats admin password | Partial | REST and tRPC `admin.stats` / `admin.generateInvite` use static password instead of JWT admin groups | Medium |

## Negative Tests Confirmed

Server-side forbidden-role behavior is covered for:

- unauthenticated admin approval mutation → `UNAUTHORIZED`
- authenticated non-admin admin approval mutation → `FORBIDDEN`
- staff create service → rejected; `db.vendorService.create` not called
- staff secure-hold capture → rejected; `stripe.paymentIntents.capture` and `db.booking.update` not called
- manager Stripe Connect onboarding → rejected; `stripe.accounts.create` not called
- manager Stripe account sync → `account: null`; `stripe.accounts.retrieve` not called
- staff/manager non-owner financial visibility → `cashFlow` omitted
- route hiding in App Store / Apple Review builds → provider/admin surfaces not exposed

## Finding P2 — Legacy admin invite/stats use static password auth

Severity: Medium / Hardening before broader admin launch

Current behavior:

- `src/routes/admin.ts` protects REST `/admin/generate-invite` and `/admin/stats` with `X-Admin-Password`.
- `src/trpc/router.ts` exposes `admin.stats` and `admin.generateInvite` as `publicProcedure`s that accept `adminPassword` in request input.
- Provider approval procedures are better: they require JWT auth and `BYTSPOT_ADMIN`/`INTERNAL_OPS` group membership.

Impact:

- Admin identity is not attributable for invite/stats actions using the legacy password surface.
- Static shared secrets are harder to rotate per-user and easier to misuse than group-based JWT auth.
- Public password-bearing procedures increase brute-force and logging sensitivity compared with protected admin-group procedures.

Recommended remediation:

1. Move `admin.stats` and `admin.generateInvite` to `protectedProcedure`.
2. Reuse `assertProviderApprovalAdmin(ctx.user)` or split a dedicated `assertBytspotAdmin` helper.
3. Add rate limits and audit logs for invite generation.
4. Deprecate the REST `/admin/*` password endpoints or make them internal-only.
5. Keep `/admin/validate-invite` public if invite-code validation is still required during signup.

## Release Recommendation

- Provider/Admin RBAC negative-test gate passes for current Provider workspace and Provider approval launch.
- Treat the legacy admin password surface as a P2 hardening item before expanding admin operations beyond invite/stats.
- Do not use `adminPassword` procedures for new admin capabilities.

## Next Security Step

Proceed to Monitoring Smoke:

- confirm alert/runbook documents exist and are actionable
- verify health endpoints and smoke signals
- check rollback instructions are clear enough for first-response use
