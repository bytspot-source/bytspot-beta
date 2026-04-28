/**
 * Unit tests for src/utils/efficiencyTelemetry.ts.
 *
 * Validates the adapter that converts SystemHealth into the normalized
 * efficiency component inputs. All outputs MUST be in [0, 1] regardless
 * of input.
 *
 *   npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  alignmentFromAccuracy,
  buildEfficiencyInputsFromSystemHealth,
  efficiencyFromLatency,
  engagementFromSensorAvailability,
  recurrenceFromUtilization,
} from '../efficiencyTelemetry.ts';
import { computeEfficiencyScore } from '../efficiencyScore.ts';
import type { SystemHealth } from '../fusionEngineMockData.ts';

const baseHealth = (over: Partial<SystemHealth> = {}): SystemHealth => ({
  timestamp: 0,
  activeUsers: 100,
  activeTrips: 50,
  averageAccuracy: 5,
  fusionEngineStatus: 'healthy',
  sensorAvailability: { gps: 100, wifi: 100, ble: 100, imu: 100 },
  processingLatency: 0,
  ...over,
});

test('engagement: full sensor availability saturates to 1', () => {
  assert.equal(engagementFromSensorAvailability(baseHealth()), 1);
});

test('engagement: zero sensor availability is 0', () => {
  const h = baseHealth({ sensorAvailability: { gps: 0, wifi: 0, ble: 0, imu: 0 } });
  assert.equal(engagementFromSensorAvailability(h), 0);
});

test('engagement: half availability across the board is 0.5', () => {
  const h = baseHealth({ sensorAvailability: { gps: 50, wifi: 50, ble: 50, imu: 50 } });
  assert.equal(engagementFromSensorAvailability(h), 0.5);
});

test('efficiency: zero latency saturates to 1 against any positive ceiling', () => {
  assert.equal(efficiencyFromLatency(baseHealth({ processingLatency: 0 }), 250), 1);
});

test('efficiency: latency at ceiling is 0', () => {
  assert.equal(efficiencyFromLatency(baseHealth({ processingLatency: 250 }), 250), 0);
});

test('efficiency: latency above ceiling clamps to 0 (never negative)', () => {
  assert.equal(efficiencyFromLatency(baseHealth({ processingLatency: 500 }), 250), 0);
});

test('efficiency: zero or negative ceiling returns 0', () => {
  assert.equal(efficiencyFromLatency(baseHealth(), 0), 0);
  assert.equal(efficiencyFromLatency(baseHealth(), -1), 0);
});

test('alignment: zero accuracy meters saturates to 1', () => {
  assert.equal(alignmentFromAccuracy(baseHealth({ averageAccuracy: 0 }), 30), 1);
});

test('alignment: accuracy at ceiling is 0', () => {
  assert.equal(alignmentFromAccuracy(baseHealth({ averageAccuracy: 30 }), 30), 0);
});

test('alignment: accuracy worse than ceiling clamps to 0', () => {
  assert.equal(alignmentFromAccuracy(baseHealth({ averageAccuracy: 100 }), 30), 0);
});

test('recurrence: trips == users saturates to 1', () => {
  const h = baseHealth({ activeUsers: 10, activeTrips: 10 });
  assert.equal(recurrenceFromUtilization(h, 1), 1);
});

test('recurrence: half utilization is 0.5', () => {
  const h = baseHealth({ activeUsers: 10, activeTrips: 5 });
  assert.equal(recurrenceFromUtilization(h, 1), 0.5);
});

test('recurrence: zero active users guards against divide-by-zero', () => {
  const h = baseHealth({ activeUsers: 0, activeTrips: 5 });
  assert.equal(recurrenceFromUtilization(h, 1), 0);
});

test('buildEfficiencyInputsFromSystemHealth: all outputs in [0, 1]', () => {
  const inputs = buildEfficiencyInputsFromSystemHealth(baseHealth());
  for (const key of Object.keys(inputs) as (keyof typeof inputs)[]) {
    assert.ok(inputs[key] >= 0 && inputs[key] <= 1, `${key} out of [0,1]: ${inputs[key]}`);
  }
});

test('buildEfficiencyInputsFromSystemHealth: feeds computeEfficiencyScore cleanly', () => {
  const inputs = buildEfficiencyInputsFromSystemHealth(baseHealth());
  const result = computeEfficiencyScore(inputs);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.decidesService, false);
  assert.equal(typeof result.explanation, 'string');
});

test('buildEfficiencyInputsFromSystemHealth: degraded session scores low', () => {
  const inputs = buildEfficiencyInputsFromSystemHealth(
    baseHealth({
      averageAccuracy: 50,
      processingLatency: 400,
      sensorAvailability: { gps: 10, wifi: 10, ble: 10, imu: 10 },
      activeUsers: 100,
      activeTrips: 5,
    }),
  );
  const result = computeEfficiencyScore(inputs);
  assert.ok(result.score < 30, `expected <30, got ${result.score}`);
});

test('buildEfficiencyInputsFromSystemHealth: respects custom ceilings', () => {
  const h = baseHealth({ processingLatency: 100 });
  const tight = buildEfficiencyInputsFromSystemHealth(h, { latencyCeilingMs: 100 });
  const loose = buildEfficiencyInputsFromSystemHealth(h, { latencyCeilingMs: 1000 });
  assert.equal(tight.efficiency, 0);
  assert.ok(loose.efficiency > 0.85);
});
