# Rollback Runbook

## Rollback owners

Use these role aliases for release-day rollback authority. The named release-day
owner mapping below must be mirrored in the launch calendar and release channel
topic before broad launch.

| Role | Owner alias | Named owner | Rollback authority |
| --- | --- | --- | --- |
| Release captain | `release-captain` | Kojo | Final rollback decision and customer-impact messaging |
| Web deploy owner | `frontend-oncall` | Kojo | Frontend hosting redeploys and web feature flags |
| Backend deploy owner | `backend-oncall` | Kojo | Render backend rollback/redeploy and API feature flags |
| Database owner | `database-oncall` | Kojo | Migration halt/forward-fix/restore approval |
| iOS owner | `ios-oncall` | Kojo | TestFlight/App Store phased release pause and native feature kill switches |
| Payments owner | `payments-oncall` | Kojo | Stripe feature flags, checkout disablement, webhook reconciliation pause |
| Support owner | `support-oncall` | Kojo | Customer/provider communications and incident-response ticket routing |

## Web rollback

1. Identify last known-good commit/deploy.
2. Re-deploy last known-good web build from hosting provider.
3. Verify Home, Discover, Map, auth, and checkout smoke paths.
4. Announce rollback status in release channel.
5. Owner: `frontend-oncall`; approval required from `release-captain` for full web rollback.

## Backend rollback

1. Confirm whether failure is code, config, dependency, or data-related.
2. Re-deploy last known-good backend artifact.
3. Verify `/health`, auth, venues, booking, and social endpoints.
4. Keep feature flags disabled until root cause is understood.
5. Owner: `backend-oncall`; approval required from `release-captain` for full backend rollback.

## Database rollback

1. Do not run destructive migrations without a backup.
2. Confirm migration ID and affected tables.
3. Prefer forward-fix migration when data has changed.
4. Restore from backup only with release captain and database owner approval.
5. Owner: `database-oncall`; any restore requires two-person approval from `database-oncall` and `release-captain`.

## iOS rollback

1. Pause phased release or stop TestFlight promotion.
2. Promote previous known-good build if needed.
3. Disable risky server-driven features when possible.
4. File App Store/TestFlight incident notes.
5. Owner: `ios-oncall`; approval required from `release-captain` for App Store release pause.

## Feature rollback

If the issue is isolated, disable the feature flag before full rollback. Candidate flags:

- Home personalized recommendation surface
- Provider/service marketplace surfaces
- Premium valet/provider surfaces
- Native shell deep-link handoffs
