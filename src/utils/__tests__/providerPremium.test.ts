/**
 * Unit tests for src/utils/providerPremium.ts.
 *
 * Exercises the entitlement state machine across free /
 * subscription branches for both vendor-premium and valet-premium tiers.
 * The module reaches for browser globals (localStorage, window) at call
 * time, so we install lightweight stubs before importing it.
 *
 *   npm run test:unit
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

const dispatched: string[] = [];

const storage = new MemoryStorage();
(globalThis as any).localStorage = storage;
(globalThis as any).window = {
  dispatchEvent: (event: Event) => { dispatched.push(event.type); return true; },
};
(globalThis as any).Event = class { type: string; constructor(type: string) { this.type = type; } };

const {
  PROVIDER_PREMIUM_EVENT,
  clearProviderPremiumEntitlement,
  getProviderPremiumEntitlement,
  providerPremiumEntitlementFromSubscription,
  syncProviderPremiumEntitlementFromSubscription,
} = await import('../providerPremium.ts');

beforeEach(() => {
  storage.clear();
  dispatched.length = 0;
});

test('free: empty storage returns the canonical Free Provider entitlement', () => {
  const e = getProviderPremiumEntitlement();
  assert.equal(e.isActive, false);
  assert.equal(e.tier, 'free');
  assert.equal(e.label, 'Free Provider');
  assert.equal(e.activatedAt, null);
  assert.equal(e.source, 'none');
});

test('free: malformed JSON in storage falls back to Free Provider', () => {
  storage.setItem('bytspot_provider_premium_entitlement', '{not-json');
  const e = getProviderPremiumEntitlement();
  assert.equal(e.isActive, false);
  assert.equal(e.tier, 'free');
});

test('local active entitlements are ignored unless backed by subscription source', () => {
  storage.setItem('bytspot_provider_premium_entitlement', JSON.stringify({ isActive: true, tier: 'vendor-premium', source: 'none' }));
  const e = getProviderPremiumEntitlement();
  assert.equal(e.isActive, false);
  assert.equal(e.tier, 'free');
  assert.equal(e.source, 'none');
});

test('subscription: vendor-premium when status.isVendorPremium is true', () => {
  const e = providerPremiumEntitlementFromSubscription({ isVendorPremium: true }, 'vendor-premium');
  assert.equal(e.isActive, true);
  assert.equal(e.tier, 'vendor-premium');
  assert.equal(e.label, 'Provider Premium');
  assert.equal(e.source, 'subscription');
});

test('subscription: vendor-premium when activePlans includes vendor-premium', () => {
  const e = providerPremiumEntitlementFromSubscription({ activePlans: ['vendor-premium'] }, 'vendor-premium');
  assert.equal(e.isActive, true);
  assert.equal(e.tier, 'vendor-premium');
});

test('subscription: valet-premium recognized via isValetPremium flag', () => {
  const e = providerPremiumEntitlementFromSubscription({ isValetPremium: true }, 'valet-premium');
  assert.equal(e.isActive, true);
  assert.equal(e.tier, 'valet-premium');
  assert.equal(e.label, 'Valet Premium');
});

test('subscription: valet-premium recognized via activePlans entry', () => {
  const e = providerPremiumEntitlementFromSubscription({ activePlans: ['valet-premium'] }, 'valet-premium');
  assert.equal(e.isActive, true);
  assert.equal(e.tier, 'valet-premium');
});

test('subscription: cross-tier flags do NOT unlock the requested tier', () => {
  const valetOnly = providerPremiumEntitlementFromSubscription({ isValetPremium: true }, 'vendor-premium');
  assert.equal(valetOnly.isActive, false);
  assert.equal(valetOnly.tier, 'free');
  assert.equal(valetOnly.source, 'subscription');

  const vendorOnly = providerPremiumEntitlementFromSubscription({ isVendorPremium: true }, 'valet-premium');
  assert.equal(vendorOnly.isActive, false);
  assert.equal(vendorOnly.tier, 'free');
});

test('subscription: missing/empty status returns Free Provider with subscription source', () => {
  const e = providerPremiumEntitlementFromSubscription(null, 'vendor-premium');
  assert.equal(e.isActive, false);
  assert.equal(e.source, 'subscription');
});

test('sync: persists subscription-derived entitlement and emits the update event', () => {
  syncProviderPremiumEntitlementFromSubscription({ isVendorPremium: true }, 'vendor-premium');
  assert.deepEqual(dispatched, [PROVIDER_PREMIUM_EVENT]);
  const e = getProviderPremiumEntitlement();
  assert.equal(e.isActive, true);
  assert.equal(e.tier, 'vendor-premium');
  assert.equal(e.source, 'subscription');
});

test('clear: removes the cached entitlement and emits the update event', () => {
  syncProviderPremiumEntitlementFromSubscription({ isVendorPremium: true }, 'vendor-premium');
  dispatched.length = 0;
  const cleared = clearProviderPremiumEntitlement();
  assert.equal(cleared.isActive, false);
  assert.equal(cleared.tier, 'free');
  assert.equal(getProviderPremiumEntitlement().isActive, false);
  assert.deepEqual(dispatched, [PROVIDER_PREMIUM_EVENT]);
});
