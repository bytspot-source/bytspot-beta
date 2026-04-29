/**
 * Unit tests for the audit-emit branches feeding VirtualPatchScannerSheet
 * (NIST PR.PT-1). Covers the four outcome buckets the scanner emits:
 * success / failure / revoked / consent_denied — plus the revocation cache
 * that the scanner consults pre-flight before calling verifyTap.
 *
 * Run with:  npm run test:unit
 * Uses Node's built-in test runner + assert; no vitest/jest required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAuditEvent,
  isPatchRevoked,
  loadRevocationList,
  markPatchRevoked,
  type VirtualPatchAuditEvent,
} from '../virtualPatch.ts';

// ─── createAuditEvent shape ─────────────────────────────────────────────

test('createAuditEvent: success branch fills tokenJti and clears reason', () => {
  const evt = createAuditEvent({
    outcome: 'success',
    method: 'nfc',
    vendorId: 'vendor-1',
    venueId: 'venue-1',
    patchId: 'patch-1',
    uid: 'UID-AABBCC',
    tokenJti: 'jti-success',
  });

  assert.equal(evt.outcome, 'success');
  assert.equal(evt.method, 'nfc');
  assert.equal(evt.vendorId, 'vendor-1');
  assert.equal(evt.venueId, 'venue-1');
  assert.equal(evt.patchId, 'patch-1');
  assert.equal(evt.uid, 'UID-AABBCC');
  assert.equal(evt.tokenJti, 'jti-success');
  assert.equal(evt.reason, undefined);
  assert.match(evt.at, /^\d{4}-\d{2}-\d{2}T/); // ISO-8601
});

test('createAuditEvent: failure branch carries reason and null tokenJti', () => {
  const evt = createAuditEvent({
    outcome: 'failure',
    method: 'qr',
    patchId: 'patch-2',
    tokenJti: null,
    reason: 'Server returned 401 — token expired',
  });

  assert.equal(evt.outcome, 'failure');
  assert.equal(evt.method, 'qr');
  assert.equal(evt.tokenJti, null);
  assert.equal(evt.reason, 'Server returned 401 — token expired');
  // Vendor / venue not yet known at failure-before-resolve time.
  assert.equal(evt.vendorId, null);
  assert.equal(evt.venueId, null);
});

test('createAuditEvent: revoked branch surfaces patch + reason without token', () => {
  const evt = createAuditEvent({
    outcome: 'revoked',
    method: 'nfc',
    patchId: 'patch-bad',
    uid: 'UID-DEADBEEF',
    reason: 'Patch revoked client-side before verification',
  });

  assert.equal(evt.outcome, 'revoked');
  assert.equal(evt.patchId, 'patch-bad');
  assert.equal(evt.uid, 'UID-DEADBEEF');
  assert.equal(evt.tokenJti, null);
  assert.ok(evt.reason && evt.reason.length > 0);
});

test('createAuditEvent: consent_denied branch fires before any patch context exists', () => {
  const evt = createAuditEvent({
    outcome: 'consent_denied',
    method: 'qr',
  });

  assert.equal(evt.outcome, 'consent_denied');
  assert.equal(evt.method, 'qr');
  // Pre-consent → no patch, no UID, no token, no venue/vendor.
  assert.equal(evt.patchId, null);
  assert.equal(evt.uid, null);
  assert.equal(evt.tokenJti, null);
  assert.equal(evt.venueId, null);
  assert.equal(evt.vendorId, null);
});

test('createAuditEvent: defaults at to current ISO timestamp when omitted', () => {
  const before = Date.now();
  const evt = createAuditEvent({ outcome: 'success', method: 'qr' });
  const after = Date.now();
  const ts = Date.parse(evt.at);
  assert.ok(ts >= before && ts <= after, `expected ${evt.at} between ${before} and ${after}`);
});

// ─── revocation cache ───────────────────────────────────────────────────

test('isPatchRevoked: false for unknown patch ids', () => {
  loadRevocationList([]);
  assert.equal(isPatchRevoked('patch-unknown'), false);
  assert.equal(isPatchRevoked(null), false);
  assert.equal(isPatchRevoked(undefined), false);
  assert.equal(isPatchRevoked(''), false);
});

test('loadRevocationList: replaces cache contents wholesale', () => {
  loadRevocationList(['patch-a', 'patch-b']);
  assert.equal(isPatchRevoked('patch-a'), true);
  assert.equal(isPatchRevoked('patch-b'), true);

  loadRevocationList(['patch-c']);
  assert.equal(isPatchRevoked('patch-a'), false);
  assert.equal(isPatchRevoked('patch-b'), false);
  assert.equal(isPatchRevoked('patch-c'), true);
});

test('markPatchRevoked: additive — does not clear existing entries', () => {
  loadRevocationList(['patch-existing']);
  markPatchRevoked('patch-new');
  assert.equal(isPatchRevoked('patch-existing'), true);
  assert.equal(isPatchRevoked('patch-new'), true);
});

test('integration: revoked patch produces a revoked audit event', () => {
  loadRevocationList(['patch-bad']);
  // Scanner pre-flight: if isPatchRevoked, emit a revoked audit event and bail.
  const patchId = 'patch-bad';
  const event: VirtualPatchAuditEvent | null = isPatchRevoked(patchId)
    ? createAuditEvent({
        outcome: 'revoked',
        method: 'nfc',
        patchId,
        reason: 'Patch revoked client-side',
      })
    : null;

  assert.ok(event, 'expected an audit event when patch is revoked');
  assert.equal(event!.outcome, 'revoked');
  assert.equal(event!.patchId, 'patch-bad');
  assert.equal(event!.tokenJti, null);
});

// ─── coords-discard invariant (SECURE Data Act / CCPA 2026) ─────────────
//
// The audit record describes an operational moment, not a customer. Raw
// device coordinates flow into the verification call as transient request
// data and must never end up serialized in an audit event. This test pins
// that invariant so a future addition of a `lat`/`lng`/`coords` field on
// VirtualPatchAuditEvent triggers a hard test failure rather than a
// silent regulatory regression.

test('createAuditEvent: serialized payload never carries raw coordinates', () => {
  // Drive every outcome bucket through the constructor and assert the
  // JSON shape stays free of geolocation keys.
  const buckets: Array<Pick<VirtualPatchAuditEvent, 'outcome' | 'method'>> = [
    { outcome: 'success', method: 'nfc' },
    { outcome: 'failure', method: 'qr' },
    { outcome: 'revoked', method: 'nfc' },
    { outcome: 'consent_denied', method: 'qr' },
  ];

  for (const bucket of buckets) {
    const evt = createAuditEvent({
      ...bucket,
      vendorId: 'vendor-1',
      venueId: 'venue-1',
      patchId: 'patch-1',
      uid: 'UID-FFEEDD',
      tokenJti: bucket.outcome === 'success' ? 'jti-ok' : null,
      reason: bucket.outcome === 'success' ? undefined : 'test',
    });

    const json = JSON.stringify(evt);
    assert.ok(!/"lat"\s*:/i.test(json), `audit JSON must not include "lat": ${json}`);
    assert.ok(!/"lng"\s*:/i.test(json), `audit JSON must not include "lng": ${json}`);
    assert.ok(!/"longitude"\s*:/i.test(json), `audit JSON must not include "longitude": ${json}`);
    assert.ok(!/"latitude"\s*:/i.test(json), `audit JSON must not include "latitude": ${json}`);
    assert.ok(!/"coords"\s*:/i.test(json), `audit JSON must not include "coords": ${json}`);
    assert.ok(!/"geolocation"\s*:/i.test(json), `audit JSON must not include "geolocation": ${json}`);
  }
});

test('createAuditEvent: rejects coord-shaped extras silently — schema is closed', () => {
  // Even if a caller hands us a `lat`/`lng` via TypeScript escape hatches,
  // the constructor's explicit field list in createAuditEvent ignores
  // anything outside the documented shape. This test pins that behavior
  // at runtime.
  const rogue = {
    outcome: 'success' as const,
    method: 'nfc' as const,
    patchId: 'patch-1',
    tokenJti: 'jti-ok',
    // Fields that must NOT survive the constructor.
    lat: 33.789,
    lng: -84.384,
    coords: { latitude: 33.789, longitude: -84.384 },
  } as Parameters<typeof createAuditEvent>[0] & { lat: number; lng: number; coords: unknown };

  const evt = createAuditEvent(rogue);
  const json = JSON.stringify(evt);
  assert.ok(!json.includes('33.789'), `audit JSON leaked lat value: ${json}`);
  assert.ok(!json.includes('-84.384'), `audit JSON leaked lng value: ${json}`);
});
