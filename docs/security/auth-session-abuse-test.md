# Auth / Session Abuse Test

Date: 2026-05-25
Scope: Bytspot frontend auth flows and `bytspot-api` backend auth/session procedures

## Executive Summary

Focused backend and frontend auth checks passed, and the deleted-account JWT gap is now remediated for protected tRPC procedures. `protectedProcedure` rejects a valid JWT if the backing user row no longer exists, so a token captured before account deletion can no longer continue through protected tRPC surfaces.

## Validation Run

Frontend:

- `node ./node_modules/@playwright/test/cli.js test e2e/password-recovery.spec.ts e2e/google-auth.spec.ts --project=chromium --reporter=line`
- Result: 6/6 passed
- `npm run type-check`
- Result: passed

Backend:

- `npm test`
- Result: 150/150 passed
- `npm run build`
- Result: passed

## Coverage Matrix

| Area | Status | Evidence | PM Risk |
|---|---|---|---|
| Signup validation | Pass | Backend rejects duplicate/invalid/short password cases | Low |
| Signup abuse | Pass | Signup rate limit test exists and passed | Low |
| Login success/failure | Pass | Valid login and wrong-password tests passed | Low |
| Login abuse | Pass | Repeated failed login returns `TOO_MANY_REQUESTS` on 11th attempt | Low |
| OAuth: Google | Pass | Valid sign-in and wrong audience rejection tests exist | Low |
| OAuth: Apple | Pass | Apple JWT verification/sign-in test exists | Low |
| Password reset enumeration | Pass | Missing email path does not create token or reveal account existence | Low |
| Password reset token safety | Pass | Tokens are hashed, single-use, expire, and used tokens reject | Low |
| `auth.me` protection | Pass | Public caller rejected; authenticated caller returns profile | Low |
| Account deletion UI | Pass | Frontend requires real auth token and clears `bytspot_*` keys on success | Low |
| Account deletion backend | Pass | Deletes signed-in user row | Low |
| Post-delete session invalidation | Pass | `protectedProcedure` re-checks that the JWT user row still exists | Low |

## Finding A1 — Stateless JWTs remain valid after account deletion

Severity: Medium/High

Previous behavior:

- `protectedProcedure` only checks `ctx.user` from JWT verification.
- `createContext` verifies JWT signature/expiry but does not check `db.user.findUnique`.
- `deleteAccount` deletes the user row, but existing JWTs remain valid until `JWT_EXPIRES_IN`.
- The client clears local storage, but an attacker with a captured token could continue calling protected procedures until expiry if those procedures do not query the deleted user.

Remediated behavior:

- `protectedProcedure` still rejects missing/invalid auth.
- For protected tRPC calls, it now checks `db.user.findUnique({ id: ctx.user.userId })` unless the request context has already been marked as user-existence checked.
- If the user row is missing, the procedure fails with `UNAUTHORIZED` before the business handler runs.
- A regression test proves a stale/deleted JWT context cannot call `user.profile.get`.

Recommended remediation options:

1. Short-term: in `protectedProcedure`, re-check that `ctx.user.userId` still exists before allowing protected calls. — Done
2. Medium-term: add `tokenVersion` or `sessionVersion` to User and JWT claims; increment on account deletion/password reset/logout-all.
3. Long-term: maintain explicit session records with revocation and device-level logout.

Release recommendation:

- The minimum acceptable fix is complete for protected tRPC procedures: protected calls fail after account deletion.
- Keep token/session versioning as a future defense-in-depth improvement for logout-all and password-reset revocation.

## Next Security Step

Proceed to Payment Security Test:

- Stripe checkout amount/server authority
- Apple Pay secure hold validation
- capture authorization
- webhook replay/idempotency/signature posture
