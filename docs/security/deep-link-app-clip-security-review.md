# Deep Link / App Clip Security Review

Date: 2026-05-25
Scope: Bytspot web deep links, App Clip/NFC-style patch entry, guest flow isolation, and `bytspot-api` patch token verification

## Executive Summary

The App Clip / patch guest flow is usable and reasonably isolated at the UI layer: patch links route guests into the Map tap/scan surface, create a `guest_session`, avoid provider/admin surfaces in Apple Review paths, and keep local virtual-patch context scoped to patch/service metadata.

The release-blocking patch-authenticity gap has been remediated at the trust-contract layer: public `patch.rotatingToken` now issues only `static-discovery` ICTs, and `patch.verifyTap` returns `verified: true` only for `patch.tap` ICTs that advance a fresh NFC `readCounter`. Static deep links can still open App Clip/service discovery, but they no longer become physical-presence claims.

## Validation Run

Backend:

- `npm test -- src/trpc/patchRouter.test.ts src/services/ictSigner.test.ts src/trpc/vendorRouter.test.ts src/trpc/bookingRouter.test.ts`
- Result: 55/55 passed
- `npm run build`
- Result: passed

Frontend:

- `npm run type-check`
- Result: passed
- `npm run test:unit -- src/utils/__tests__/virtualPatchAudit.test.ts`
- Result: 121/121 passed
- `npm run lint`
- Result: passed
- `npm run build`
- Result: passed
- Playwright App Clip/virtual-patch rerun: passed 7/7 after aligning stale visual-demo expectations to the current guest App Clip/Map UX.

Reviewed surfaces:

- `src/App.tsx`
- `src/utils/virtualPatch.ts`
- `e2e/apple-review-simulation.spec.ts`
- `e2e/vendor-service-booking.spec.ts`
- `bytspot-api/src/trpc/patchRouter.ts`
- `bytspot-api/src/services/ictSigner.ts`

## Coverage Matrix

| Area | Status | Evidence | PM Risk |
|---|---|---|---|
| Universal/App Clip link routing | Pass | `/p/:patchId`, `/patch/:patchId`, `/access/:patchId`, `/t/:uid`, and query patch aliases route into Map patch scan flow | Low |
| Guest session isolation | Pass | unauthenticated patch links create `guest_session` and a guest user object instead of forcing login | Low |
| Provider-owner routing | Pass/Watch | authenticated provider owners can be routed to patch controls after ownership check | Medium |
| Apple Review route hiding | Pass | E2E coverage asserts App Clip flow does not expose Provider/Vendor/Admin/Internal Ops text | Low |
| Local virtual-patch context | Pass/Watch | stores patch/service context in localStorage without raw GPS/biometrics; service requests are TTL-pruned | Medium |
| Revocation pre-flight | Partial | client revocation cache fast-fails known revoked patch IDs, but server verification remains authoritative | Medium |
| ICT signature/expiry | Pass | ICT signer tests cover tampering, expiry, future iat, and missing claims | Low |
| Public rotating token issuance | Pass | `patch.rotatingToken` is public but now issues `patch.discovery` / `static-discovery` ICTs only | Low |
| Physical tap proof | Pass | `patch.verifyTap` returns `verified: true` only for `patch.tap` ICTs with a fresh monotonic `readCounter` | Low |
| Replay resistance | Partial | Fresh counters reject stale physical taps; token `jti` persistence remains future hardening | Medium |

## Finding P1 — Static patch ID can be upgraded into a verified tap

Severity: High / Release blocker for production hardware trust

Status: Remediated

Previous behavior:

- `patch.rotatingToken` was a public procedure.
- It accepted `patchId` and returned a signed ICT that could be treated as a tap token.
- `patch.verifyTap` validated ICT signature/expiry and patch status.
- `readCounter` was optional. If absent, verification succeeded without advancing the counter.

Remediated behavior:

- Public `patch.rotatingToken` signs `action: 'patch.discovery'` with `trustLevel: 'static-discovery'`.
- `patch.verifyTap` accepts discovery ICTs for service context but returns `verified: false` and does not advance counters.
- `patch.verifyTap` returns `verified: true` only when the ICT action is `patch.tap` and the supplied `readCounter` is greater than the stored patch counter.
- Frontend scanner context now records low-trust scans as `patch-discovery`, not `tap-verified` or `qr-verified`.

Previous impact:

- Anyone with a static patch URL or exposed patch ID can mint a short-lived tap token.
- That token can be verified without proving physical possession of the NFC patch.
- A copied URL can imitate a patch tap for flows that rely on `verified: true` as proof of physical presence.

Recommended remediation:

1. Treat static deep links as `patch-invoked` / `patch-discovery`, not `tap-verified`. — Done
2. Require a fresh monotonic `readCounter` for NFC-backed verified taps. — Done
3. Split QR/deep-link verification from NFC verification with separate trust levels. — Done
4. Persist ICT `jti` values or verification events to enforce one-time use for high-trust claims. — Follow-up
5. Add cryptographic SDM/CMAC counter proof for production NFC hardware. — Follow-up

Minimum release gate:

- `verifyTap` must not return `verified: true` unless a fresh `readCounter` is supplied and advanced.
- Static patch links may still open guest App Clip services, but must not claim physical tap verification.

## Finding P2 — Local patch context is convenient but trust-sensitive

Severity: Medium

Current behavior:

- App Clip routing saves `bytspot_virtual_patch_context` to localStorage.
- Context includes source, mode, patchId, venueName, capabilities, scan metadata, and saved service requests.
- The code comments explicitly avoid raw GPS and biometrics, which is good.

Impact:

- localStorage is user-controlled and should never be treated as authorization evidence.
- Any future checkout, booking, perk, or access decision must re-check server-side patch state and token trust level.

Recommended remediation:

- Keep localStorage as display/navigation state only.
- Include a `trustLevel` field such as `static-discovery` or `nfc-counter-verified`.
- Require backend verification for any entitlement, payment, booking, or provider action.

## Positive Controls Confirmed

- Retired patches cannot issue rotating tokens or verify taps.
- UID mismatches between token/input/database are rejected.
- Stale `readCounter` values are rejected for high-trust tap tokens.
- Public rotating tokens are downgraded to `static-discovery` and cannot advance counters.
- ICT tampering and expiry are covered by tests.
- App Clip guest flow routes to Map and hides provider/admin/internal surfaces in E2E coverage.
- Guest patch invocation creates a local guest session without exposing authenticated account state.

## Release Recommendation

- Production hardware-trust claims may proceed at the trust-contract layer; production NFC hardware should still add cryptographic SDM/CMAC proof before paid entitlements depend on physical presence.
- App Clip discovery can continue as a low-trust guest entry point; UI copy and backend authorization no longer call static links verified physical taps.
- Track P2 as a hardening item before paid access or provider fulfillment depends on local patch context.

## Next Security Step

Proceed to Provider/Admin RBAC negative tests:

- cross-tenant vendor access
- staff attempting owner/manager actions
- guest/consumer access to provider routes
- admin-only route denial for normal users
