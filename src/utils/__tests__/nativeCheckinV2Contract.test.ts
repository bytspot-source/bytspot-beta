import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NATIVE_CHECKIN_V2_ROUTES,
  buildManualCheckInCreateInput,
  loadProviderCheckInCountsViaRpc,
  normalizeProviderCheckInCounts,
} from '../nativeCheckinV2Contract.ts';

test('native check-in v2 routes lock backend procedure names', () => {
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.createCheckIn, 'checkins.create');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.sync, 'checkins.sync');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.reconcilePoints, 'checkins.reconcilePoints');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.providerCounts, 'checkins.providerCounts');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.venueIntelligence, 'venues.intelligence');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.verify, 'checkins.verify');
  assert.equal(NATIVE_CHECKIN_V2_ROUTES.groupJoin, 'groupEvents.join');
});

test('buildManualCheckInCreateInput tags manual native check-ins as static discovery', () => {
  const input = buildManualCheckInCreateInput({
    venueId: 'venue-42',
    idempotencyKey: 'idem-42',
    observedAt: new Date('2026-07-17T12:00:00Z'),
    patchId: 'BYT424-0301-P',
  });

  assert.deepEqual(input, {
    venueId: 'venue-42',
    idempotencyKey: 'idem-42',
    trustLevel: 'staticDiscovery',
    source: 'native_ios_manual',
    observedAt: '2026-07-17T12:00:00.000Z',
    patchId: 'BYT424-0301-P',
  });
});

test('normalizeProviderCheckInCounts accepts nested backend count payloads', () => {
  const counts = normalizeProviderCheckInCounts({
    counts: { total: 12, manualCount: 7, verifiedCount: 5, active: 3, pendingSync: 2, updatedAt: 'now' },
    venues: [{ venueId: 'venue-1', venueName: 'Broni Home Taste', manualCount: 4, verifiedCount: 2, active: 1 }],
  });

  assert.equal(counts.source, 'backend');
  assert.equal(counts.total, 12);
  assert.equal(counts.manual, 7);
  assert.equal(counts.verified, 5);
  assert.equal(counts.activeNow, 3);
  assert.equal(counts.pendingSync, 2);
  assert.equal(counts.venues[0].venueName, 'Broni Home Taste');
});

test('loadProviderCheckInCountsViaRpc prefers checkins.providerCounts and falls back safely', async () => {
  const backend = await loadProviderCheckInCountsViaRpc({
    checkins: { providerCounts: { query: async () => ({ total: 2, manual: 1, verified: 1 }) } },
  }, { window: 'today' });
  const fallback = await loadProviderCheckInCountsViaRpc({}, { window: 'today' });

  assert.equal(backend.source, 'backend');
  assert.equal(backend.total, 2);
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.total, 0);
});
