import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGhAkwaabaFifaServicePayload,
  buildGhAkwaabaPassPatchUrl,
  buildGhAkwaabaPassServiceSearchInput,
  buildGhAkwaabaPassVendorSearchInput,
  registerGhAkwaabaFifaPass,
} from '../ghAkwaabaFifaPass.ts';

test('buildGhAkwaabaFifaServicePayload defines the Platinum FIFA Matchday Pass service', () => {
  const payload = buildGhAkwaabaFifaServicePayload();
  assert.equal(payload.title, 'FIFA Matchday Pass');
  assert.equal(payload.category, 'events');
  assert.equal(payload.tier, 'platinum');
  assert.equal(payload.tagline, 'Premium Event Access & Concierge');
  assert.deepEqual(payload.includedHighlights.slice(0, 3), ['Fast-track entry', 'VIP Lounge access', 'Digital pass delivery']);
  assert.equal(payload.patchRequired, true);
});

test('buildGhAkwaabaPassPatchUrl constructs deterministic Platinum patch links', () => {
  const url = buildGhAkwaabaPassPatchUrl({ patchId: 'PATCH-FIFA-001', serviceId: 'svc-fifa-matchday' });
  assert.equal(url, 'https://bytspot.app/p/PATCH-FIFA-001?patch=PATCH-FIFA-001&venue=GH%20Akwaaba%20Pass&tier=platinum&service=svc-fifa-matchday');
});

test('GH Akwaaba search helpers expose App Clip vendors.search inputs', () => {
  assert.deepEqual(buildGhAkwaabaPassServiceSearchInput('PATCH-FIFA-001'), {
    patchId: 'PATCH-FIFA-001',
    tier: 'platinum',
    limit: 24,
  });
  assert.deepEqual(buildGhAkwaabaPassVendorSearchInput({ patchId: 'PATCH-FIFA-001', serviceId: 'svc-fifa-matchday' }), {
    patchId: 'PATCH-FIFA-001',
    serviceId: 'svc-fifa-matchday',
    tier: 'platinum',
    limit: 6,
  });
});

test('registerGhAkwaabaFifaPass calls createService then createPatch and returns patch URL', async () => {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  const fakeTrpc = {
    vendors: {
      createService: { mutate: async (input: unknown) => { calls.push({ procedure: 'vendors.createService', input }); return { service: { id: 'svc-fifa-matchday' } }; } },
      createPatch: { mutate: async (input: unknown) => { calls.push({ procedure: 'vendors.createPatch', input }); return { patch: { id: 'PATCH-FIFA-001' } }; } },
    },
  };

  const result = await registerGhAkwaabaFifaPass(fakeTrpc);
  assert.equal(calls[0].procedure, 'vendors.createService');
  assert.equal((calls[0].input as { title: string }).title, 'FIFA Matchday Pass');
  assert.deepEqual(calls[1], { procedure: 'vendors.createPatch', input: { label: 'FIFA Matchday Entry', serviceId: 'svc-fifa-matchday' } });
  assert.equal(result.patchUrl, 'https://bytspot.app/p/PATCH-FIFA-001?patch=PATCH-FIFA-001&venue=GH%20Akwaaba%20Pass&tier=platinum&service=svc-fifa-matchday');
});