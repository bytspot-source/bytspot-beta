/**
 * Unit tests for the algorithmic-fairness rollup (Pillar II).
 * Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeFairnessRollup, type FairnessVenueInput } from '../fairnessRollup.ts';

const ATL_NEIGHBOURHOOD_A: FairnessVenueInput[] = [
  { id: 'a1', lat: 33.78, lng: -84.39, verified: true },
  { id: 'a2', lat: 33.78, lng: -84.39, verified: true },
  { id: 'a3', lat: 33.78, lng: -84.39, verified: true },
  { id: 'a4', lat: 33.78, lng: -84.39, verified: false },
];

const ATL_NEIGHBOURHOOD_B: FairnessVenueInput[] = [
  // Far-enough offset (> 0.05 deg) to fall in a separate cell.
  { id: 'b1', lat: 33.85, lng: -84.45, verified: false },
  { id: 'b2', lat: 33.85, lng: -84.45, verified: false },
  { id: 'b3', lat: 33.85, lng: -84.45, verified: false },
  { id: 'b4', lat: 33.85, lng: -84.45, verified: false },
];

test('computeFairnessRollup: empty input → empty cells, zero median', () => {
  const report = computeFairnessRollup([]);
  assert.equal(report.cells.length, 0);
  assert.equal(report.suspectCells.length, 0);
  assert.equal(report.medianRatio, 0);
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('computeFairnessRollup: buckets venues into separate cells by lat/lng', () => {
  const report = computeFairnessRollup([...ATL_NEIGHBOURHOOD_A, ...ATL_NEIGHBOURHOOD_B]);
  assert.equal(report.cells.length, 2);
  const totals = report.cells.map((cell) => cell.total).sort();
  assert.deepEqual(totals, [4, 4]);
});

test('computeFairnessRollup: flags low-coverage cell when peer median is healthy', () => {
  const report = computeFairnessRollup([...ATL_NEIGHBOURHOOD_A, ...ATL_NEIGHBOURHOOD_B]);
  // Neighbourhood A has 0.75 verified, B has 0.0 → median 0.375 → threshold ~0.187.
  // B falls below; A does not.
  const suspect = report.suspectCells;
  assert.equal(suspect.length, 1);
  assert.equal(suspect[0].verified, 0);
  assert.equal(suspect[0].verifiedRatio, 0);
});

test('computeFairnessRollup: respects minVenues to avoid single-venue noise', () => {
  // A cell with 2 unverified venues should not be flagged when minVenues=3.
  const tiny: FairnessVenueInput[] = [
    { id: 't1', lat: 40.0, lng: -75.0, verified: false },
    { id: 't2', lat: 40.0, lng: -75.0, verified: false },
    // Healthy peer cell to give the median something to chew on.
    { id: 'p1', lat: 40.2, lng: -75.2, verified: true },
    { id: 'p2', lat: 40.2, lng: -75.2, verified: true },
    { id: 'p3', lat: 40.2, lng: -75.2, verified: true },
  ];
  const report = computeFairnessRollup(tiny, { minVenues: 3 });
  assert.equal(report.suspectCells.length, 0);
});

test('computeFairnessRollup: drops venues with non-finite coords', () => {
  const venues: FairnessVenueInput[] = [
    { id: 'ok', lat: 33.78, lng: -84.39, verified: true },
    { id: 'nan', lat: Number.NaN, lng: -84.39, verified: false },
    { id: 'inf', lat: Number.POSITIVE_INFINITY, lng: -84.39, verified: false },
  ];
  const report = computeFairnessRollup(venues);
  assert.equal(report.cells.reduce((sum, cell) => sum + cell.total, 0), 1);
});

test('computeFairnessRollup: absoluteFloor protects against trivial-median collapse', () => {
  // If every cell is at 0% verified, the median is 0 — without an absolute
  // floor, *no* cell would ever look suspect. The floor pins the threshold.
  const allBad: FairnessVenueInput[] = [
    { id: '1', lat: 33.78, lng: -84.39, verified: false },
    { id: '2', lat: 33.78, lng: -84.39, verified: false },
    { id: '3', lat: 33.78, lng: -84.39, verified: false },
    { id: '4', lat: 34.78, lng: -84.39, verified: false },
    { id: '5', lat: 34.78, lng: -84.39, verified: false },
    { id: '6', lat: 34.78, lng: -84.39, verified: false },
  ];
  const report = computeFairnessRollup(allBad, { absoluteFloor: 0.1 });
  assert.equal(report.threshold, 0.1);
  // Both cells have ratio 0 < threshold 0.1 → both suspect.
  assert.equal(report.suspectCells.length, 2);
});
