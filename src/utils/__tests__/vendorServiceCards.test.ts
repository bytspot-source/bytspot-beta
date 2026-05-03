import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorServiceToCard } from '../vendorServiceCards.ts';

test('vendorServiceToCard maps patch-verified services into paid discover cards', () => {
  const card = vendorServiceToCard({
    id: 'svc-1',
    title: 'VIP Arrival',
    description: 'Door-to-table escort',
    priceCents: 15000,
    currency: 'USD',
    durationMins: 90,
    vendor: { id: 'vendor-1', displayName: 'Midtown Hosts', onboardingStatus: 'active' },
    patch: { id: 'patch-1', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' },
    cashFlow: { platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
  }, 0, { patchVerified: true, distanceMeters: 96 });

  assert.equal(card.type, 'entertainment');
  assert.equal(card.entryType, 'paid');
  assert.equal(card.entryPrice, '$150.00');
  assert.equal(card.vendorServiceId, 'svc-1');
  assert.equal(card.patchId, 'patch-1');
  assert.equal(card.verified, true);
  assert.ok(card.features?.includes('Patch-verified'));
  assert.ok(card.features?.includes('Connect-ready provider'));
  assert.equal(card.platformFeeCents, 1200);
});