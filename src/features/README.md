# Feature Module Submission Rule

Every current swipeable card surface and every new consumer capability must be represented as a `FeatureModule` before it is ranked, expanded, or wired deeper into Bytspot core UI.

Required gate:

1. Add a module entry in `src/features/registry.ts` for future capabilities, or `src/features/swipeableCardRegistry.ts` for current swipeable card surfaces.
2. Declare the route, feature flag, Apple Review exposure, data contract, payment flow, and compliance risk.
3. Score the module with `Es = Φ_EM + Φ_E + ΔD + f × λ_sim`.
4. Keep `appleReviewSafe: false` or `appStoreExposure: hidden-behind-flag` until consumer copy and routes are approved.
5. Add focused tests before wiring the module into navigation or checkout.

Phase 5 must rank `allRankableModules`, which includes both current swipeable cards and future module proposals. It also layers release-work batches through `allPrioritizableWork` so internal planning cards, bug batches, and future modules use the same `Es = Φ_EM + Φ_E + ΔD + f × λ_sim` discipline. Do not expose raw execution scores, App Store risk, compliance risk, or capacity metrics in consumer UI; translate approved modules into user-facing experiences instead. This keeps Bytspot consumer app Store scope stable while allowing Premium Valet, Cottage Industry Services, Events, Music, Loyalty, and Concierge modules to plug in later.