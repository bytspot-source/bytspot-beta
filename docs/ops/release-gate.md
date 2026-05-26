# Bytspot P0 Release Gate

This gate is the minimum standard before broad production release.

## Required checks

1. `npm ci`
2. `npm run type-check`
3. `npm run lint`
4. `npm run build`
5. `npm run build:app-store`
6. `npm run test:unit`
7. `npm audit --omit=dev --audit-level=high`
8. `npm run release:e2e:smoke`

## Smoke E2E coverage

The release smoke suite covers:

- Google auth fallback/origin guard
- Map spatial mode discipline
- Toast contrast/readability
- App Store consumer-only purity

The full E2E suite remains available through `npm run test:e2e` and the dedicated ticketing/virtual-patch workflows.

## Release decision rule

- Green: all required checks pass and no open P0/P1 bugs.
- Yellow: only accepted non-production or dev-only risks remain with an owner and mitigation.
- Red: any critical/high runtime security finding, failed build, failed test, missing rollback owner, or missing monitoring owner.

## Current accepted advisory

The runtime audit gate is aligned to `npm audit --omit=dev --audit-level=high` and must pass before broad launch. Full `npm audit --audit-level=high` still reports accepted dev/build-tool findings tracked in `docs/security/dependency-vulnerability-audit.md`; these remain Yellow until remediated or renewed by the release owner.
