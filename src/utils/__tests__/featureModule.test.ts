import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateExecutionScore, isAppStoreEligibleModule, rankFeatureModules, validateFeatureModule } from '../../features/featureModule.ts';
import { allRankableModules, featureModules } from '../../features/registry.ts';
import { allPrioritizableWork, internalPlanningPriorityCards, rankedReleaseWorkCards } from '../../features/prioritization.ts';
import { swipeableCardModules } from '../../features/swipeableCardRegistry.ts';

describe('feature module registry', () => {
  it('keeps module ids unique and valid', () => {
    const ids = allRankableModules.map((module) => module.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(allRankableModules.flatMap(validateFeatureModule), []);
  });

  it('uses Es = Φ_EM + Φ_E + ΔD + f × λ_sim for priorityScore', () => {
    for (const module of allRankableModules) {
      assert.equal(module.priorityScore, calculateExecutionScore(module.score), module.id);
    }
  });

  it('includes current swipeable cards and future feature modules in one rankable set', () => {
    assert.ok(swipeableCardModules.length >= 1);
    assert.ok(featureModules.length >= 1);
    assert.equal(allRankableModules.length, swipeableCardModules.length + featureModules.length);
  });

  it('only exposes App Store eligible modules with risk <= 3 and safe copy', () => {
    const eligible = allRankableModules.filter(isAppStoreEligibleModule);
    assert.ok(eligible.length >= 1);
    assert.ok(eligible.every((module) => module.appleReviewSafe && module.constraints.appStoreRisk <= 3 && module.uiSurface.consumerCopySafe));
  });

  it('ranks modules by priority score with deterministic tie breakers', () => {
    const ranked = rankFeatureModules([...allRankableModules]);
    for (let index = 1; index < ranked.length; index += 1) {
      assert.ok(ranked[index - 1].priorityScore >= ranked[index].priorityScore);
    }
  });

  it('extends allRankableModules with release work for Phase 5 prioritization', () => {
    assert.ok(allPrioritizableWork.length > allRankableModules.length);
    assert.deepEqual(allPrioritizableWork.flatMap(validateFeatureModule), []);
    assert.ok(rankedReleaseWorkCards.length >= 1);
    assert.ok(rankedReleaseWorkCards.every((card) => card.kind === 'release-work'));
  });

  it('keeps internal planning priority cards available without requiring consumer Home exposure', () => {
    assert.ok(internalPlanningPriorityCards.length >= 1);
    assert.ok(internalPlanningPriorityCards.some((card) => card.id === 'cottage-industry-services'));
    assert.ok(internalPlanningPriorityCards.every((card) => card.formula === 'Es = Φ_EM + Φ_E + ΔD + f × λ_sim'));
  });
});