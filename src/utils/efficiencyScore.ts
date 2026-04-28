/**
 * Operational Efficiency Score module.
 *
 * The score is observational about an operational moment — a venue-session,
 * a shift, a service window — not predictive about a person. A customer
 * cannot have a score; a vendor-session can. This boundary keeps the score
 * below the "consequential decision about a person" threshold under the
 * Colorado AI Act and successor state laws preserved by EO 14365.
 *
 * Each component is normalized to [0, 1]; the composite is rescaled to
 * [0, 100] so the surfaced value is human-readable. Every result carries
 * its component breakdown and the inputs that produced it — explainability
 * by construction for the FCC uniform AI reporting standard contemplated
 * in EO 14365 §6.
 *
 * The internal weighting and component composition is proprietary and is
 * not described in source. Callers supply already-normalized component
 * inputs and receive a composite result.
 */

/** Component score in [0, 1]. */
export type ComponentScore = number;

export interface EfficiencyScoreInputs {
  engagement: ComponentScore;
  efficiency: ComponentScore;
  alignment: ComponentScore;
  recurrence: ComponentScore;
}

export interface EfficiencyScoreResult {
  /** Surfaced score in [0, 100]. */
  score: number;
  /** Per-component breakdown after clamping, in [0, 1]. */
  components: EfficiencyScoreInputs;
  /** Per-component weights used by the composite. */
  weights: EfficiencyScoreInputs;
  /** Plain-English explanation for the surface. */
  explanation: string;
  /** Type-level invariant: a score never decides service. Staff decide. */
  decidesService: false;
  /** ISO-8601 timestamp at which the score was computed. */
  computedAt: string;
}

/** Default equal-weight component weights. */
export const DEFAULT_WEIGHTS: EfficiencyScoreInputs = {
  engagement: 0.25,
  efficiency: 0.25,
  alignment: 0.25,
  recurrence: 0.25,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function describeBand(score: number): string {
  if (score >= 80) return 'operational state is well-aligned across all components';
  if (score >= 60) return 'operational state is generally efficient with minor mismatches';
  if (score >= 40) return 'operational state is mixed — at least one component is dragging the moment';
  if (score >= 20) return 'operational state is under-aligned — multiple components are weak';
  return 'operational state is poorly aligned — staff attention recommended';
}

/**
 * Compute the composite from already-normalized component inputs.
 *
 * The function is deliberately pure: callers normalize each component from
 * upstream signals and hand the [0, 1] values in. Keeping the composite math
 * independent of the signal source means the same function is reusable for
 * vendor-private operational scoring without ever touching cross-vendor data.
 */
export function computeEfficiencyScore(
  inputs: EfficiencyScoreInputs,
  weights: EfficiencyScoreInputs = DEFAULT_WEIGHTS,
): EfficiencyScoreResult {
  const components: EfficiencyScoreInputs = {
    engagement: clamp01(inputs.engagement),
    efficiency: clamp01(inputs.efficiency),
    alignment: clamp01(inputs.alignment),
    recurrence: clamp01(inputs.recurrence),
  };

  const weighted =
    components.engagement * weights.engagement +
    components.efficiency * weights.efficiency +
    components.alignment * weights.alignment +
    components.recurrence * weights.recurrence;

  const score = Math.round(clamp01(weighted) * 100);

  return {
    score,
    components,
    weights,
    explanation: describeBand(score),
    decidesService: false,
    computedAt: new Date().toISOString(),
  };
}
