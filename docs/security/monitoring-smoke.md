# Monitoring Smoke

Date: 2026-05-25
Scope: release-gate workflow, monitoring/alerting runbook, rollback runbook, live health endpoints, and release smoke E2E

## Executive Summary

The technical smoke signals are healthy: live frontend/API endpoints respond with 200s, the webhook health endpoint is reachable, and the local release smoke suite passed 17/17 after a production build.

Operational readiness is improved: the runbooks now use release-day owner aliases, named owner mapping, escalation order, response targets, and numeric alert thresholds. The release channel/calendar should mirror the documented Kojo assignment before broad launch.

## Validation Run

Live endpoint smoke:

- `https://bytspot-api.onrender.com/health` → 200 in 492 ms
- `https://bytspot-api.onrender.com/stripe/webhook` → 200 in 91 ms
- `https://bytspot-beta-app.onrender.com/` → 200 in 418 ms

Frontend release smoke:

- `npm run release:e2e:smoke`
- Result: production build succeeded and Playwright smoke passed 17/17

Reviewed documents/workflow:

- `.github/workflows/release-gate.yml`
- `docs/ops/release-gate.md`
- `docs/ops/monitoring-alerting.md`
- `docs/ops/rollback-runbook.md`

## Coverage Matrix

| Area | Status | Evidence | PM Risk |
|---|---|---|---|
| API health smoke | Pass | `/health` returned 200 | Low |
| Stripe webhook endpoint reachability | Pass | `/stripe/webhook` GET returned 200 | Low |
| Frontend availability smoke | Pass | deployed frontend root returned 200 | Low |
| Release smoke E2E | Pass | 17/17 passed after local production build | Low |
| CI release gate workflow | Pass/Watch | workflow runs install, type-check, lint, unit, runtime audit, advisory full audit, builds, release smoke | Medium |
| Security audit in CI | Pass/Watch | workflow blocks on `npm audit --omit=dev --audit-level=high`; full audit remains non-blocking advisory for dev-tool debt | Low/Medium |
| Monitoring runbook existence | Pass | minimum dashboards/alerts/first-48-hour cadence documented | Low |
| Monitoring owners | Pass | release-day owner aliases, Kojo named-owner mapping, and response targets are documented | Low |
| Alert thresholds | Pass | numeric thresholds documented for frontend errors, API 5xx/latency, auth, checkout, iOS crashes, and availability | Low |
| Rollback runbook existence | Pass | web/backend/database/iOS/feature rollback sections exist | Low |
| Rollback owners | Pass | rollback owner aliases, Kojo named-owner mapping, and approval authority are documented | Low |
| Rollback commands/provider details | Partial | steps name Render/hosting/TestFlight surfaces conceptually; exact dashboard URLs remain environment-specific | Medium |

## Finding P1 — Release owners are not assigned

Severity: High / Release blocker by current gate policy

Previous behavior:

- Monitoring owners are all `TBD`.
- Rollback owners are all `TBD`.
- `docs/ops/release-gate.md` says missing rollback owner or missing monitoring owner makes the release decision Red.

Remediated behavior:

- Monitoring runbook defines `release-captain`, `frontend-oncall`, `backend-oncall`, `ios-oncall`, `payments-oncall`, `monitoring-oncall`, and `support-oncall` aliases mapped to Kojo.
- Rollback runbook defines `release-captain`, `frontend-oncall`, `backend-oncall`, `database-oncall`, `ios-oncall`, `payments-oncall`, and `support-oncall` aliases mapped to Kojo.
- P0/P1 escalation order and response-time targets are documented.
- Remaining launch action: mirror the Kojo assignment in the launch calendar/release channel before broad release.

Previous impact:

- Incidents may not have an accountable first responder.
- Rollback authority is unclear for web, backend, database, and iOS incidents.
- This blocks a clean production release decision unless formally accepted by the release owner.

Recommended remediation:

1. Assign named people or rotation aliases for release captain, frontend, backend, iOS, database, web deploy, and support. — Alias layer done; named calendar mapping remains.
2. Add escalation order and response-time target for P0/P1. — Done.
3. Add release-channel location and incident update cadence. — Incident cadence done; channel URL remains environment-specific.

## Finding P2 — Alert thresholds are not concrete

Severity: Medium

Previous behavior:

- Alerts use `above baseline`, `sudden spike`, and `sustained failure spike` without numeric thresholds.
- Dashboard URLs and alert provider locations are not listed.

Remediated behavior:

- Monitoring runbook now defines numeric triggers for frontend errors, API 5xx/p95, auth failures, checkout failures, iOS crash-free sessions, and availability checks.
- Dashboard/provider URLs remain environment-specific and should be added when the final monitoring provider is selected.

Impact:

- Operators may disagree on when to page, hotfix, or rollback.
- Smoke health is verifiable, but real incident detection is not fully deterministic.

Recommended remediation:

- Define numeric thresholds, for example:
  - API 5xx > 2% for 5 minutes
  - API p95 latency > 1500 ms for 5 minutes
  - homepage/API health fails twice in 5 minutes
  - checkout failure rate > 3% for 5 minutes
  - iOS crash-free sessions < 99.5%
- Add links to Render metrics/logs, frontend error monitoring, Stripe dashboard, and App Store Connect crash data.

## Finding P2 — CI audit command conflicts with runtime audit acceptance

Severity: Medium

Previous behavior:

- `docs/security/dependency-vulnerability-audit.md` classifies current findings as dev/build-tool-only and notes `npm audit --omit=dev` is clean.
- `.github/workflows/release-gate.yml` still ran `npm audit --audit-level=high`, which could fail on dev-only findings.

Remediated behavior:

- `.github/workflows/release-gate.yml` and `npm run release:gate` now run `npm audit --omit=dev --audit-level=high`.
- Full dev-tool findings remain tracked in `docs/security/dependency-vulnerability-audit.md` as a Yellow exception until remediated.

Impact:

- CI runtime security policy is aligned with the accepted runtime gate.
- Full dev-tool audit findings still require later remediation or renewed exception approval.

Recommended remediation:

- Keep the short-term runtime gate: `npm audit --omit=dev --audit-level=high`. — Done.
- Long-term: remove or upgrade dev-only vulnerable packages so full `npm audit --audit-level=high` is clean without exceptions.

## Positive Controls Confirmed

- Live API health endpoint is responsive.
- Live Stripe webhook endpoint is mounted and reachable.
- Live frontend root is responsive.
- Release smoke suite exercises Google auth fallback/origin guard, Map strict mode, toast contrast, and App Store consumer-only route hiding.
- CI workflow uploads Playwright artifacts for failed smoke debugging.
- Rollback runbook covers web, backend, database, iOS, and feature rollback paths.

## Release Recommendation

- Technical smoke: Green.
- Operational readiness: Green for runbook ownership and thresholds.
- Before broad launch, mirror the Kojo owner assignment in the release channel/calendar.

## Next Step

Commit the release ops/docs/CI workstream separately from dependency lockfile churn, then decide whether to keep or revert the outstanding `package-lock.json` changes.
