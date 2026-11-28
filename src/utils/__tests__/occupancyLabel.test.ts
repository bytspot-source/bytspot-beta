import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  crowdRecordedAt,
  isFreshOccupancyReading,
  isLiveOccupancyReading,
  isLiveOccupancySource,
  occupancyKindLabel,
  typicalCrowdCurve,
  venueAvailabilityLabel,
  venueWaitFallbackLabel,
} from '../occupancyLabel.ts';

const NOW = Date.parse('2026-11-28T18:00:00.000Z');
const FRESH = new Date(NOW - 5 * 60 * 1000).toISOString();
const STALE = new Date(NOW - 31 * 60 * 1000).toISOString();

test('treats only door / report / sensor as live sources', () => {
  assert.equal(isLiveOccupancySource('bytspot'), true);
  assert.equal(isLiveOccupancySource('user_report'), true);
  assert.equal(isLiveOccupancySource('sensor'), true);
  assert.equal(isLiveOccupancySource('typical'), false);
  assert.equal(isLiveOccupancySource('simulation'), false);
  assert.equal(isLiveOccupancySource('manual'), false);
  assert.equal(isLiveOccupancySource(undefined), false);
});

test('a live source is live only while the reading is 30 minutes old or newer', () => {
  assert.equal(isFreshOccupancyReading(FRESH, NOW), true);
  assert.equal(isFreshOccupancyReading(STALE, NOW), false);
  assert.equal(isFreshOccupancyReading(undefined, NOW), false);
  assert.equal(isFreshOccupancyReading(new Date(NOW + 60_000).toISOString(), NOW), false);
  assert.equal(isLiveOccupancyReading({ source: 'bytspot', recordedAt: FRESH, now: NOW }), true);
  assert.equal(isLiveOccupancyReading({ source: 'user_report', recordedAt: FRESH, now: NOW }), true);
  assert.equal(isLiveOccupancyReading({ source: 'sensor', recordedAt: FRESH, now: NOW }), true);
  assert.equal(isLiveOccupancyReading({ source: 'sensor', recordedAt: STALE, now: NOW }), false);
  assert.equal(isLiveOccupancyReading({ source: 'bytspot', now: NOW }), false);
  assert.equal(isLiveOccupancyReading({ source: 'typical', recordedAt: FRESH, now: NOW }), false);
});

test('never labels a catalog row Live', () => {
  assert.equal(occupancyKindLabel('typical'), 'Typical');
  assert.equal(occupancyKindLabel(undefined), 'Typical');
  assert.equal(occupancyKindLabel('bytspot'), 'Typical');
  assert.equal(occupancyKindLabel('user_report', STALE, NOW), 'Typical');
  assert.equal(venueAvailabilityLabel({ source: 'typical', level: 2 }), 'Typical now');
  assert.equal(venueWaitFallbackLabel('typical'), 'Typical wait');
  assert.equal(venueWaitFallbackLabel('sensor'), 'Typical wait');
});

test('keeps Live wording for a fresh door, host, or sensor reading', () => {
  assert.equal(occupancyKindLabel('user_report', FRESH, NOW), 'Live');
  assert.equal(venueAvailabilityLabel({ source: 'bytspot', level: 2, recordedAt: FRESH, now: NOW }), 'Live availability');
  assert.equal(venueWaitFallbackLabel('sensor', FRESH, NOW), 'Live wait');
  assert.equal(venueAvailabilityLabel({ source: 'sensor', waitMins: 12, recordedAt: FRESH, now: NOW }), '~12m wait');
});

test('prefixes a typical wait and does not call a stale reading live', () => {
  assert.equal(venueAvailabilityLabel({ source: 'typical', waitMins: 12 }), 'typically ~12m wait');
  assert.equal(venueAvailabilityLabel({ source: 'bytspot', waitMins: 12 }), 'typically ~12m wait');
  assert.equal(venueAvailabilityLabel({ source: 'user_report', waitMins: 12, recordedAt: STALE, now: NOW }), 'typically ~12m wait');
  assert.equal(venueAvailabilityLabel({ source: 'typical', level: 4 }), 'Typically high activity');
});

test('reads a crowd timestamp from recordedAt, updatedAt, or observedAt', () => {
  assert.equal(crowdRecordedAt({ recordedAt: FRESH }), FRESH);
  assert.equal(crowdRecordedAt({ updatedAt: FRESH }), FRESH);
  assert.equal(crowdRecordedAt({ observedAt: FRESH }), FRESH);
  assert.equal(crowdRecordedAt({ recordedAt: { bad: true } }), undefined);
  assert.equal(crowdRecordedAt(null), undefined);
});

test('uses an API typical curve and ignores history or empty payloads', () => {
  assert.deepEqual(typicalCrowdCurve({
    crowd: { history: [{ level: 4, label: 'Packed', recordedAt: FRESH }], typicalCurve: [{ level: 2, label: 'Active' }, 4] },
  }), [
    { level: 2, label: 'Active' },
    { level: 4, label: 'Packed' },
  ]);
  assert.deepEqual(typicalCrowdCurve({ crowd: { history: [{ level: 3, label: 'Busy', recordedAt: FRESH }] } }), []);
  assert.deepEqual(typicalCrowdCurve(null), []);
});

test('venue detail does not invent crowd history', () => {
  const source = readFileSync(new URL('../../components/VenueDetails.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /Updated just now/);
  assert.doesNotMatch(source, /generateEstimatedCrowdHistory/);
  assert.match(source, /Typical for this hour, not live/);
});
