import { defineFeatureModule, isAppStoreEligibleModule, rankFeatureModules, type FeatureModule } from './featureModule.ts';
import { allRankableModules } from './registry.ts';

export type PriorityCardKind = 'current-card' | 'future-feature' | 'release-work';

export interface PlanningPriorityCard {
  id: string;
  title: string;
  kicker: string;
  route: string;
  kind: PriorityCardKind;
  priorityScore: number;
  formula: 'Es = Φ_EM + Φ_E + ΔD + f × λ_sim';
  appStoreRisk: number;
  capacityScore: number;
  complianceRisk: string;
  revenuePotential: number;
  timeToReleaseWeeks: number;
  summary: string;
  ctaLabel: string;
}

const releaseWorkModules = [
  defineFeatureModule({
    id: 'release-purity-scan',
    name: 'Release Purity Scan',
    stage: 'app-store-safe',
    audience: ['parker-consumer'],
    route: '/release/purity',
    featureFlag: 'VITE_FEATURE_RELEASE_PURITY_SCAN',
    appleReviewSafe: true,
    dataContract: { schemaName: 'ReleaseWorkBatch', version: 1, requiredFields: ['buildMode', 'scanResult', 'fixedAt'], optionalFields: ['notes'] },
    uiSurface: { route: '/', componentName: 'ReleasePurityGuardrail', appStoreExposure: 'current-app-store', consumerCopySafe: true },
    paymentFlow: 'none',
    complianceRisk: 'low',
    score: { phiMarket: 8, phiExecution: 9, deltaDifferentiation: 7, feasibility: 9, lambdaSimilarity: 0.95 },
    constraints: { appStoreRisk: 1, engineeringEffort: 1, complianceRisk: 'low', revenuePotential: 3, timeToReleaseWeeks: 1 },
    summary: 'Keeps consumer release copy safe by scanning the final build before submission.',
    dependencies: ['build-app-store', 'purity-scan'],
  }),
  defineFeatureModule({
    id: 'ipad-release-smoke',
    name: 'iPad Release Smoke',
    stage: 'app-store-safe',
    audience: ['parker-consumer'],
    route: '/release/ipad-smoke',
    featureFlag: 'VITE_FEATURE_IPAD_RELEASE_SMOKE',
    appleReviewSafe: true,
    dataContract: { schemaName: 'ReleaseWorkBatch', version: 1, requiredFields: ['viewport', 'flowName', 'status'], optionalFields: ['screenshot'] },
    uiSurface: { route: '/', componentName: 'IpadReleaseSmokeGuardrail', appStoreExposure: 'current-app-store', consumerCopySafe: true },
    paymentFlow: 'none',
    complianceRisk: 'low',
    score: { phiMarket: 7, phiExecution: 8, deltaDifferentiation: 7, feasibility: 8, lambdaSimilarity: 0.9 },
    constraints: { appStoreRisk: 1, engineeringEffort: 2, complianceRisk: 'low', revenuePotential: 3, timeToReleaseWeeks: 1 },
    summary: 'Prioritizes iPad layout, privacy links, search, discovery, and checkout confidence.',
    dependencies: ['playwright', 'ipad-viewport', 'privacy-links'],
  }),
  defineFeatureModule({
    id: 'checkout-confidence-batch',
    name: 'Checkout Confidence Batch',
    stage: 'app-store-safe',
    audience: ['parker-consumer'],
    route: '/release/checkout-confidence',
    featureFlag: 'VITE_FEATURE_CHECKOUT_CONFIDENCE_BATCH',
    appleReviewSafe: true,
    dataContract: { schemaName: 'ReleaseWorkBatch', version: 1, requiredFields: ['flowName', 'successPath', 'cancelPath'], optionalFields: ['stripeSessionId'] },
    uiSurface: { route: '/', componentName: 'CheckoutConfidenceGuardrail', appStoreExposure: 'current-app-store', consumerCopySafe: true },
    paymentFlow: 'stripe',
    complianceRisk: 'medium',
    score: { phiMarket: 8, phiExecution: 7, deltaDifferentiation: 7, feasibility: 7, lambdaSimilarity: 0.85 },
    constraints: { appStoreRisk: 2, engineeringEffort: 3, complianceRisk: 'medium', revenuePotential: 5, timeToReleaseWeeks: 2 },
    summary: 'Ranks payment-return bugs by user impact, revenue protection, and review safety.',
    dependencies: ['stripe-checkout', 'parking-return', 'ticket-return'],
  }),
] as const satisfies readonly FeatureModule[];

const currentCardIds = new Set([
  'discover-swipe-deck',
  'home-events-carousel',
  'home-live-crowd-carousel',
  'home-trending-carousel',
  'home-social-carousel',
  'home-category-strip',
  'home-nearby-carousel',
]);

const releaseWorkIds = new Set(releaseWorkModules.map((module) => module.id));

export const allPrioritizableWork = [
  ...allRankableModules,
  ...releaseWorkModules,
] as const satisfies readonly FeatureModule[];

function priorityKind(module: FeatureModule): PriorityCardKind {
  if (releaseWorkIds.has(module.id)) return 'release-work';
  if (currentCardIds.has(module.id)) return 'current-card';
  return 'future-feature';
}

function ctaLabel(module: FeatureModule): string {
  if (module.id === 'cottage-industry-services') return 'Explore services';
  if (module.route === '/discover') return 'Open Discover';
  if (module.route === '/events' || module.route === '/shows') return 'Explore events';
  if (module.route === '/rewards') return 'View rewards';
  if (priorityKind(module) === 'release-work') return 'Keep release ready';
  return 'View priority';
}

export function toPlanningPriorityCard(module: FeatureModule): PlanningPriorityCard {
  return {
    id: module.id,
    title: module.name,
    kicker: priorityKind(module).replace('-', ' '),
    route: module.uiSurface.route,
    kind: priorityKind(module),
    priorityScore: module.priorityScore,
    formula: 'Es = Φ_EM + Φ_E + ΔD + f × λ_sim',
    appStoreRisk: module.constraints.appStoreRisk,
    capacityScore: 6 - module.constraints.engineeringEffort,
    complianceRisk: module.complianceRisk,
    revenuePotential: module.constraints.revenuePotential,
    timeToReleaseWeeks: module.constraints.timeToReleaseWeeks,
    summary: module.summary,
    ctaLabel: ctaLabel(module),
  };
}

const planningCandidateIds = new Set([
  ...currentCardIds,
  'cottage-industry-services',
  'events-nightlife',
  'loyalty-rewards',
  'music-concerts',
  ...releaseWorkIds,
]);

const planningRankedModules = rankFeatureModules(
  allPrioritizableWork.filter((module) => planningCandidateIds.has(module.id) && isAppStoreEligibleModule(module)),
);

const topPlanningModules = planningRankedModules.slice(0, 7);
const cottageModule = planningRankedModules.find((module) => module.id === 'cottage-industry-services');

export const internalPlanningPriorityCards = [
  ...topPlanningModules,
  ...(cottageModule && !topPlanningModules.some((module) => module.id === cottageModule.id) ? [cottageModule] : []),
].map(toPlanningPriorityCard);

export const rankedReleaseWorkCards = rankFeatureModules(releaseWorkModules).map(toPlanningPriorityCard);
