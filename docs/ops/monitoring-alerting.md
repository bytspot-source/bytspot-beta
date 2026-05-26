# Monitoring and Alerting Runbook

## Launch owners

Use these role aliases for the release gate. The named release-day owner mapping
below must be mirrored in the launch calendar and release channel topic before
broad launch.

| Role | Owner alias | Named owner | Primary responsibility | P0 response target |
| --- | --- | --- | --- | --- |
| Release captain | `release-captain` | Kojo | Final go/no-go, incident severity, rollback approval | 5 minutes |
| Frontend owner | `frontend-oncall` | Kojo | Web/iOS webview errors, UI regressions, release smoke failures | 10 minutes |
| Backend owner | `backend-oncall` | Kojo | API health, auth, booking/payment tRPC, Render service issues | 10 minutes |
| iOS owner | `ios-oncall` | Kojo | TestFlight/App Store build, crash reports, native shell/App Clip issues | 15 minutes |
| Payments owner | `payments-oncall` | Kojo | Stripe checkout, Apple Pay hold/capture, webhook reconciliation | 10 minutes |
| Monitoring owner | `monitoring-oncall` | Kojo | Dashboards, alert routing, incident timeline, P0/P1 update cadence | 10 minutes |
| Support owner | `support-oncall` | Kojo | User/provider reports, public incident updates, ticket triage | 15 minutes |

Escalation order for P0: `release-captain` → affected surface owner → all owners.
Escalation order for P1: affected surface owner → `release-captain` if unresolved after 30 minutes.

## Minimum dashboards

1. Frontend error rate and top stack traces
2. API 5xx rate and p95 latency
3. Auth success/failure rate
4. Checkout and booking failure rate
5. Home recommendation impressions/clicks
6. iOS crash-free sessions

## Minimum alerts

| Signal | Trigger | Owner |
| --- | --- | --- |
| Frontend errors | JS error sessions > 2% for 5 minutes or any top crash affecting checkout/auth/map | `frontend-oncall` |
| API 5xx | 5xx rate > 2% for 5 minutes or p95 latency > 1500 ms for 5 minutes | `backend-oncall` |
| Auth failures | login/signup/OAuth failure rate > 10% for 5 minutes, excluding expected invalid-password attempts | `frontend-oncall` + `backend-oncall` |
| Checkout failures | Stripe checkout, Apple Pay hold, or booking capture failure rate > 3% for 5 minutes | `backend-oncall` |
| iOS crashes | crash-free sessions < 99.5% over 1 hour or any App Clip launch crash cluster | `ios-oncall` |
| App availability | frontend root, `/health`, or `/stripe/webhook` health check fails twice within 5 minutes | `release-captain` |

## First 48 hours

- Review dashboards every 2 hours during business hours.
- Triage support reports into P0/P1/P2.
- P0: rollback or disable feature immediately.
- P1: hotfix same day.
- P2: schedule next patch.
- Post an incident update every 15 minutes for P0 and every 60 minutes for P1 until resolved.
