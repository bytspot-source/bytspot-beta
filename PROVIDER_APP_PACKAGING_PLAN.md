# Bytspot Provider App Packaging Plan

Provider analytics use internal Optimization Logic and Efficiency Metrics. Implementation details are intentionally omitted from planning docs.

## Recommendation

Build **Bytspot Provider** in stages. Do not split into a separate App Store binary immediately.

The best path is:

1. **Now:** Use `/provider` and `/vendor` inside the current web app as the fast onboarding entry.
2. **Next:** Promote `/provider` as an installable PWA/provider shortcut.
3. **Then:** Extract provider surfaces into a provider workspace/package.
4. **Later:** Submit a standalone **Bytspot Provider** app after provider workflows are stable.

This protects the current Parker App Store review while solving the vendor question: “Where do I onboard?”

## Product Scope

**Bytspot Provider** serves:

- Parking Hosts
- Venue Vendors
- Event Partners
- Valet / Service Teams

Core free capabilities:

- Open `/provider`
- Choose provider role
- Start onboarding
- Establish basic Bytspot patch links
- Copy/test patch URLs for QR, NFC, App Clip, or universal links

Vendor Premium capabilities:

- AI patch placement recommendations
- Bulk QR/NFC rollout planning
- Boosted verified patch visibility
- Fusion Engine operational insights
- Resource allocation recommendations
- Premium payout recommendations using Efficiency Metrics

## Phase 1 — Current Super-App Route

Status: implemented.

Routes:

- `/provider`
- `/vendor`
- `/provider/onboarding`
- `/vendor/onboarding`

Benefits:

- Fastest vendor onboarding path
- No App Store delay
- Reuses existing Host onboarding/dashboard
- Keeps provider features out of Parker home navigation

Guardrails:

- Keep `APPLE_REVIEW_HIDE_PROVIDER_AND_VALET` enabled for App Store submissions until provider flows are review-ready.
- Do not market unfinished provider flows inside the Parker consumer app.

## Phase 2 — Provider PWA Shortcut

Status: implemented.

Use the existing PWA manifest and service worker, with provider shortcuts:

- Bytspot Provider → `/provider`
- Provider Patches → `/provider/onboarding`

Vendor instruction:

> Go to `https://bytspot.app/provider`, then add it to your home screen.

## Phase 3 — Provider Workspace Extraction

Recommended next engineering step before a standalone binary.

Create a clean boundary:

- `src/components/provider/*`
- `src/components/host/*`
- `src/components/valet/*`
- `src/utils/providerPremium.ts`
- shared `virtualPatch`, `efficiencyScore`, and tRPC utilities

Target shape:

- Consumer/Parker shell imports consumer modules.
- Provider shell imports provider modules.
- Shared packages hold auth, patch, premium, analytics, and AI utilities.

Acceptance criteria:

- Provider shell can render without Parker home code.
- Provider routes are covered by Playwright.
- Apple review build can exclude provider navigation safely.

## Phase 4 — Standalone App Store Binary

Only start after Phase 3 is stable.

App name: **Bytspot Provider**

Bundle ID recommendation: `com.bytspot.provider`

Primary screens:

1. Provider role selection
2. Account creation/sign-in
3. Provider onboarding
4. Patch management
5. Dashboard/Fusion insights
6. Vendor Premium billing
7. Valet/service team operations

App Store positioning:

> Bytspot Provider helps hosts, vendors, event partners, and valet/service teams onboard, establish Tap & Scan patches, and manage operational intelligence.

## App Clip Strategy

Keep the App Clip attached to the consumer app/domain flow.

Provider app manages patch creation and setup, but customers should still tap/scan into:

- App Clip
- Full Bytspot consumer app
- Universal link fallback

This keeps the App Clip small and focused on verification/access, not provider management.

## Release Checklist

Before pushing provider work live:

- Run `npm run type-check`
- Run `npm run lint`
- Run `npm run build`
- Run provider Playwright route check
- Confirm `APPLE_REVIEW_HIDE_PROVIDER_AND_VALET` remains correct for App Store builds
- Confirm `/provider` works on mobile Safari and Chrome
- Confirm `https://bytspot.app/provider` is the vendor onboarding URL to share
