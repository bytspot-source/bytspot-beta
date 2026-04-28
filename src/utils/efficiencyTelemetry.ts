/**
 * Operational Efficiency telemetry adapter (internal-only).
 *
 * Converts the existing operational telemetry surface (`SystemHealth`) into
 * the normalized [0, 1] inputs consumed by `computeEfficiencyScore`. Pure
 * and side-effect free — the same inputs always produce the same output,
 * which is what makes the score defensible against the FCC uniform reporting
 * standard contemplated in EO 14365 §6.
 *
 * Boundary invariants:
 *   - No raw coordinates are ever passed through this adapter.
 *   - The output is observational about an operational moment, not about a
 *     person — `decidesService: false` is preserved by construction.
 *   - This module is for internal admin/ops surfaces only. Do not import it
 *     from any customer-adjacent component until the calibration has been
 *     validated against real data.
 */
import type { SystemHealth } from './fusionEngineMockData';
import type { EfficiencyScoreInputs } from './efficiencyScore';

/** Tunable ceilings — vendors override per their venue profile. */
export interface EfficiencyTelemetryOptions {
  /** Latency ceiling in ms beyond which the efficiency component saturates to 0. */
  latencyCeilingMs?: number;
  /** Accuracy ceiling in meters beyond which the alignment component saturates to 0. */
  accuracyCeilingM?: number;
  /** Utilization ceiling for the recurrence component. Default 1.0 (full match). */
  utilizationCeiling?: number;
}

const DEFAULTS: Required<EfficiencyTelemetryOptions> = {
  latencyCeilingMs: 250,
  accuracyCeilingM: 30,
  utilizationCeiling: 1,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Engagement component.
 *
 * Until App Clip launches and NFC tap counts are wired into the operational
 * telemetry surface, the closest available proxy is the composite sensor
 * availability across GPS/WiFi/BLE/IMU. A venue session with 100% sensor
 * availability across all four is treated as a saturated engagement signal.
 * This mapping is intentionally a placeholder and is annotated as such on
 * the dashboard.
 */
export function engagementFromSensorAvailability(health: SystemHealth): number {
  const { gps, wifi, ble, imu } = health.sensorAvailability;
  return clamp01((gps + wifi + ble + imu) / 400);
}

/**
 * Efficiency component.
 *
 * Lower processing latency means less compute per outcome. Inverted and
 * normalized against `latencyCeilingMs` so a 0 ms session would score 1.0
 * and a session at-or-above the ceiling scores 0.
 */
export function efficiencyFromLatency(health: SystemHealth, ceilingMs: number): number {
  if (ceilingMs <= 0) return 0;
  return clamp01(1 - health.processingLatency / ceilingMs);
}

/**
 * Alignment component.
 *
 * Inverse of average accuracy in meters, normalized against `accuracyCeilingM`.
 * Tighter accuracy = better alignment between predicted and actual movement.
 * No raw coordinates are read here — only the pre-aggregated meter value.
 */
export function alignmentFromAccuracy(health: SystemHealth, ceilingM: number): number {
  if (ceilingM <= 0) return 0;
  return clamp01(1 - health.averageAccuracy / ceilingM);
}

/**
 * Recurrence component.
 *
 * Coarse proxy: the ratio of active trips to active users in the current
 * moment. A 1.0 ratio means every active user is in a tracked session, which
 * we interpret as the system matching demand correctly. Capped by
 * `utilizationCeiling` so over-counting (e.g. parked + valet legs) cannot
 * blow out the score.
 */
export function recurrenceFromUtilization(health: SystemHealth, ceiling: number): number {
  if (ceiling <= 0) return 0;
  if (health.activeUsers <= 0) return 0;
  return clamp01(health.activeTrips / health.activeUsers / ceiling);
}

/**
 * Build a fully-normalized `EfficiencyScoreInputs` payload from a
 * `SystemHealth` snapshot. Pure — no mutation, no IO, no PII.
 */
export function buildEfficiencyInputsFromSystemHealth(
  health: SystemHealth,
  options: EfficiencyTelemetryOptions = {},
): EfficiencyScoreInputs {
  const opts = { ...DEFAULTS, ...options };
  return {
    engagement: engagementFromSensorAvailability(health),
    efficiency: efficiencyFromLatency(health, opts.latencyCeilingMs),
    alignment: alignmentFromAccuracy(health, opts.accuracyCeilingM),
    recurrence: recurrenceFromUtilization(health, opts.utilizationCeiling),
  };
}

/** Per-component label/description metadata for the admin surface. */
export const EFFICIENCY_COMPONENT_META: Record<keyof EfficiencyScoreInputs, { label: string; source: string }> = {
  engagement: {
    label: 'Engagement',
    source: 'Composite sensor availability (GPS/WiFi/BLE/IMU). Placeholder until NFC tap and App Clip launch counts are wired in.',
  },
  efficiency: {
    label: 'Efficiency',
    source: 'Inverse of processing latency vs the configured ceiling.',
  },
  alignment: {
    label: 'Alignment',
    source: 'Inverse of average position accuracy in meters. No raw coordinates are read.',
  },
  recurrence: {
    label: 'Recurrence',
    source: 'Active trips ÷ active users — coarse session-utilization proxy.',
  },
};
