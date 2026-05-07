export type PaymentFlow = 'bytpay' | 'stripe' | 'none';
export type ComplianceRisk = 'low' | 'medium' | 'high';
export type ModuleStage = 'idea' | 'design' | 'internal-beta' | 'app-store-safe' | 'frozen';
export type ModuleAudience = 'parker-consumer' | 'provider-operator' | 'venue-partner' | 'artist-promoter' | 'enterprise';
export type AppStoreExposure = 'current-app-store' | 'hidden-behind-flag' | 'web-internal-only';

export interface FeatureModuleScore {
  /** Φ_EM: market/emotional pull, normalized 0..10. */
  phiMarket: number;
  /** Φ_E: execution/economic efficiency, normalized 0..10. */
  phiExecution: number;
  /** ΔD: differentiation delta, normalized 0..10. */
  deltaDifferentiation: number;
  /** f: delivery feasibility/reuse, normalized 0..10. */
  feasibility: number;
  /** λ_sim: similarity/reuse multiplier, normalized 0..1. */
  lambdaSimilarity: number;
}

export interface FeatureModuleConstraintProfile {
  appStoreRisk: 1 | 2 | 3 | 4 | 5;
  engineeringEffort: 1 | 2 | 3 | 4 | 5;
  complianceRisk: ComplianceRisk;
  revenuePotential: 1 | 2 | 3 | 4 | 5;
  timeToReleaseWeeks: number;
}

export interface FeatureModuleDataContract {
  schemaName: string;
  version: number;
  requiredFields: string[];
  optionalFields?: string[];
}

export interface FeatureModuleUiSurface {
  route: string;
  componentName: string;
  appStoreExposure: AppStoreExposure;
  consumerCopySafe: boolean;
}

export interface FeatureModule {
  id: string;
  name: string;
  stage: ModuleStage;
  audience: ModuleAudience[];
  route: string;
  featureFlag: string;
  appleReviewSafe: boolean;
  dataContract: FeatureModuleDataContract;
  uiSurface: FeatureModuleUiSurface;
  paymentFlow: PaymentFlow;
  complianceRisk: ComplianceRisk;
  score: FeatureModuleScore;
  constraints: FeatureModuleConstraintProfile;
  priorityScore: number;
  summary: string;
  dependencies: string[];
}

export function defineFeatureModule(input: Omit<FeatureModule, 'priorityScore'>): FeatureModule {
  return { ...input, priorityScore: calculateExecutionScore(input.score) };
}

export function calculateExecutionScore(score: FeatureModuleScore): number {
  const es = score.phiMarket + score.phiExecution + score.deltaDifferentiation + score.feasibility * score.lambdaSimilarity;
  return Number(es.toFixed(2));
}

export function isAppStoreEligibleModule(module: FeatureModule): boolean {
  return module.appleReviewSafe && module.uiSurface.appStoreExposure === 'current-app-store' && module.constraints.appStoreRisk <= 3;
}

export function validateFeatureModule(module: FeatureModule): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(module.id)) errors.push(`${module.id}: id must be kebab-case`);
  if (!module.route.startsWith('/')) errors.push(`${module.id}: route must start with /`);
  if (!module.featureFlag.startsWith('VITE_FEATURE_')) errors.push(`${module.id}: featureFlag must start with VITE_FEATURE_`);
  if (module.priorityScore !== calculateExecutionScore(module.score)) errors.push(`${module.id}: priorityScore must equal Es = Φ_EM + Φ_E + ΔD + f × λ_sim`);
  if (module.appleReviewSafe && module.uiSurface.appStoreExposure !== 'current-app-store') errors.push(`${module.id}: appleReviewSafe modules must declare current-app-store exposure`);
  if (!module.uiSurface.consumerCopySafe && module.uiSurface.appStoreExposure === 'current-app-store') errors.push(`${module.id}: current App Store modules must have consumer-safe copy`);
  return errors;
}

export function rankFeatureModules(modules: FeatureModule[]): FeatureModule[] {
  return [...modules].sort((a, b) => b.priorityScore - a.priorityScore || a.constraints.appStoreRisk - b.constraints.appStoreRisk || a.id.localeCompare(b.id));
}