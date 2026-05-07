import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateExecutionScore, isAppStoreEligibleModule, rankFeatureModules, validateFeatureModule } from '../../features/featureModule.ts';
import { featureModules } from '../../features/registry.ts';

describe('feature module registry', () => {
  it('keeps module ids unique and valid', () => {
    const ids = featureModules.map((module) => module.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(featureModules.flatMap(validateFeatureModule), []);
  });

  it('uses Es = Φ_EM + Φ_E + ΔD + f × λ_sim for priorityScore', () => {
    for (const module of featureModules) {
      assert.equal(module.priorityScore, calculateExecutionScore(module.score), module.id);
    }
  });

  it('only exposes App Store eligible modules with risk <= 3 and safe copy', () => {
    const eligible = featureModules.filter(isAppStoreEligibleModule);
    assert.ok(eligible.length >= 1);
    assert.ok(eligible.every((module) => module.appleReviewSafe && module.constraints.appStoreRisk <= 3 && module.uiSurface.consumerCopySafe));
  });

  it('ranks modules by priority score with deterministic tie breakers', () => {
    const ranked = rankFeatureModules([...featureModules]);
    for (let index = 1; index < ranked.length; index += 1) {
      assert.ok(ranked[index - 1].priorityScore >= ranked[index].priorityScore);
    }
  });
});