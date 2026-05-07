# Parker App Store Release Handoff

Baseline release commit before Phase 6 handoff: `c7a9482`.

## Release Scope

- App Store build is Parker consumer-only.
- Provider, Vendor, Host legacy, Admin, Marketing, and internal review surfaces are hidden from the App Store build.
- Home exposes consumer experiences only: Explorer / Insider / VIP cards, private chef dinner, premium valet, and cottage experience cards.
- Simplex scoring remains internal only: `Es = Φ_EM + Φ_E + ΔD + f × λ_sim` must not appear in Parker consumer UI.

## Final Validation Commands

Run these before uploading the next iOS build:

```bash
npm run type-check
npm run test:unit
npm run lint
npm run build
npm run build:app-store
npm run test:e2e:apple-review
```

Latest local Phase 6 results:

- `npm run type-check` — passed
- `npm run test:unit` — passed, 101 tests
- `npm run lint` — passed with existing TypeScript version warning only
- `npm run build` — passed
- `npm run build:app-store` — passed; purity scan reported 29 built files with zero forbidden leaks
- `npm run test:e2e:apple-review` — passed, 15/15 tests across Apple Review simulation and consumer-only route gate

## Reviewer Notes Summary

- No demo account is required.
- Reviewer can enter using guest flow.
- Location and notifications are optional.
- Reviewable tabs: Home, Discover, Map, and Profile.
- Legal routes: `/privacy` and `/terms`.
- App Clip / NFC-style patch route opens the Parker map/tap-scan flow without exposing internal routes.

## Go / No-Go

- Go if App Store purity scan passes.
- Go if Apple Review E2E passes on iPhone and iPad coverage.
- No-go if consumer UI shows internal planning terms such as `Es`, `priority score`, `App Store risk`, `compliance level`, Provider/Admin dashboards, or onboarding copy.
