import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertVendorWebhookContract,
  authorizeInbound,
  buildEnvelope,
  canSubscribeToEvent,
  eventsForRole,
  isDeliverySuccess,
  isDuplicateDelivery,
  listInboundEvents,
  listOutboundEvents,
  retryDelaySecs,
  scopesForRole,
  shouldDisableEndpoint,
  shouldRetry,
  signWebhook,
  signedPayload,
  verifyWebhook,
  VENDOR_WEBHOOKS,
  type VendorWebhookContract,
} from '../webhooks.ts';
import {
  getBookableAvailability,
  getBookableCatalog,
  getBookableDemand,
  getBookableLocations,
} from '../../utils/bookableTemplates.ts';

// Test-only material. Never a real signing secret.
const SECRET = 'whsec_unit_test_material';
const AT = Math.floor(new Date('2026-09-04T19:00:00Z').getTime() / 1000);

function body(): string {
  return JSON.stringify(
    buildEnvelope({
      eventId: 'evt_1',
      event: 'sku.confirmed',
      sellerId: 'sel_1',
      data: { skuId: 'sku_1' },
      occurredAt: new Date('2026-09-04T19:00:00Z'),
    }),
  );
}

test('an event cannot exist for a state the ontology does not have', () => {
  assert.deepEqual(assertVendorWebhookContract(), []);

  const machines: Record<string, string[]> = {
    sku: getBookableCatalog().skuStates,
    slot: getBookableAvailability().slotStates,
    demand: getBookableDemand().states,
    location: getBookableLocations().states,
  };
  for (const event of listOutboundEvents()) {
    assert.ok(machines[event.source]?.includes(event.state), `${event.id} reports an unreachable state`);
  }

  // The inbound half can only reach operations that already exist.
  const availability = new Set(getBookableAvailability().operations.map((item) => item.id));
  const demand = new Set(getBookableDemand().operations.map((item) => item.id));
  for (const event of listInboundEvents()) {
    const known = event.machine === 'availability' ? availability.has(event.operation as never) : demand.has(event.operation as never);
    assert.ok(known, `${event.id} maps to an operation the ontology does not define`);
  }
});

test('the contract guards fire when the webhook surface regresses', () => {
  const failsWith = (mutate: (draft: VendorWebhookContract) => void, fragment: string) => {
    const draft = JSON.parse(JSON.stringify(VENDOR_WEBHOOKS)) as VendorWebhookContract;
    mutate(draft);
    const errors = assertVendorWebhookContract(draft);
    assert.ok(
      errors.some((error) => error.includes(fragment)),
      `expected an error containing "${fragment}", got ${JSON.stringify(errors)}`,
    );
  };

  failsWith((draft) => {
    draft.outbound[0].state = 'PENDING';
  }, 'which is not a sku state');
  failsWith((draft) => {
    draft.inbound[0].operation = 'SET_PRICE' as never;
  }, 'which is not a availability operation');
  failsWith((draft) => {
    draft.scopes[0].events.push('sku.invented');
  }, 'names undeclared event');
  // An unscoped event has no capability gate, so it would reach any seat.
  failsWith((draft) => {
    draft.scopes = draft.scopes.filter((scope) => scope.id !== 'doors');
  }, 'is not covered by any scope');
  failsWith((draft) => {
    draft.scopes[1].events.push('sku.confirmed');
  }, 'appears in more than one scope');
  // Dropping the timestamp from the signed payload would allow a replay.
  failsWith((draft) => {
    draft.transport.signedPayloadFormat = '{body}';
  }, 'must bind the timestamp');
  failsWith((draft) => {
    draft.transport.delivery = 'exactly-once';
  }, 'must stay at-least-once');
  failsWith((draft) => {
    draft.retry.backoffSecs = [0, 30];
  }, 'one entry per attempt');
  failsWith((draft) => {
    draft.retry.backoffSecs = [0, 30, 30, 1800, 7200, 21600];
  }, 'must increase');
  failsWith((draft) => {
    draft.retry.retryOnStatus.push(200);
  }, 'both success and retryable');
});

test('a signature covers the body and is bound to its timestamp', async () => {
  const payload = body();
  const signature = await signWebhook(SECRET, AT, payload);

  assert.equal(signedPayload(AT, payload), `${AT}.${payload}`);
  assert.ok(signature.startsWith('v1='));
  assert.equal(signature.length, 'v1='.length + 64);
  // Deterministic for the same inputs, different for a different timestamp.
  assert.equal(await signWebhook(SECRET, AT, payload), signature);
  assert.notEqual(await signWebhook(SECRET, AT + 1, payload), signature);

  assert.deepEqual(await verifyWebhook({ secret: SECRET, body: payload, signature, timestampSecs: AT, nowSecs: AT + 5 }), {
    ok: true,
  });
});

test('verification refuses a replay before it ever checks the signature', async () => {
  const payload = body();
  const signature = await signWebhook(SECRET, AT, payload);
  const verify = (overrides: Partial<Parameters<typeof verifyWebhook>[0]>) =>
    verifyWebhook({ secret: SECRET, body: payload, signature, timestampSecs: AT, nowSecs: AT, ...overrides });

  // A validly signed body captured and resent later is still rejected.
  const { toleranceSecs } = VENDOR_WEBHOOKS.transport;
  assert.deepEqual(await verify({ nowSecs: AT + toleranceSecs + 1 }), { ok: false, reason: 'stale-timestamp' });
  assert.deepEqual(await verify({ nowSecs: AT - toleranceSecs - 1 }), { ok: false, reason: 'stale-timestamp' });
  assert.deepEqual(await verify({ nowSecs: AT + toleranceSecs }), { ok: true });

  assert.deepEqual(await verify({ body: payload.replace('sku_1', 'sku_2') }), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(await verify({ secret: 'whsec_other_material' }), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(await verify({ signature: 'deadbeef' }), { ok: false, reason: 'malformed' });
  assert.deepEqual(await verify({ timestampSecs: Number.NaN }), { ok: false, reason: 'malformed' });
  assert.deepEqual(await verify({ body: 'x'.repeat(VENDOR_WEBHOOKS.transport.maxBodyBytes + 1) }), {
    ok: false,
    reason: 'body-too-large',
  });
});

test('delivery is at-least-once, so the event id is the dedupe key', () => {
  assert.equal(VENDOR_WEBHOOKS.transport.delivery, 'at-least-once');
  const seen = new Set<string>();
  assert.equal(isDuplicateDelivery(seen, 'evt_1'), false);
  seen.add('evt_1');
  assert.equal(isDuplicateDelivery(seen, 'evt_1'), true);
  assert.equal(isDuplicateDelivery(seen, 'evt_2'), false);

  const envelope = buildEnvelope({ eventId: 'evt_1', event: 'sku.reserved', sellerId: 'sel_1', data: {} });
  assert.equal(envelope.version, VENDOR_WEBHOOKS.version);
  assert.equal(envelope.eventId, 'evt_1');
  // The secret never travels in the envelope.
  assert.equal(JSON.stringify(envelope).includes('whsec'), false);
});

test('a dead endpoint stops itself instead of becoming our backlog', () => {
  const { maxAttempts, backoffSecs } = VENDOR_WEBHOOKS.retry;

  assert.equal(shouldRetry(500, 1), true);
  assert.equal(shouldRetry(429, 1), true);
  // A 400 or a 404 is the vendor's own bug, so retrying it changes nothing.
  assert.equal(shouldRetry(400, 1), false);
  assert.equal(shouldRetry(404, 1), false);
  assert.equal(shouldRetry(500, maxAttempts), false);

  assert.equal(retryDelaySecs(0), backoffSecs[0]);
  assert.equal(retryDelaySecs(maxAttempts - 1), backoffSecs[maxAttempts - 1]);
  assert.equal(retryDelaySecs(maxAttempts), null);

  assert.equal(isDeliverySuccess(200), true);
  assert.equal(isDeliverySuccess(204), true);
  assert.equal(isDeliverySuccess(500), false);

  const { disableAfterConsecutiveFailures } = VENDOR_WEBHOOKS.retry;
  assert.equal(shouldDisableEndpoint(disableAfterConsecutiveFailures - 1), false);
  assert.equal(shouldDisableEndpoint(disableAfterConsecutiveFailures), true);
});

test('a scope is a property of the endpoint, so a door seat sees only doors', () => {
  assert.deepEqual(scopesForRole('door').map((scope) => scope.id), ['doors']);
  assert.deepEqual(scopesForRole('staff').map((scope) => scope.id), ['doors']);
  assert.deepEqual(scopesForRole('owner').map((scope) => scope.id).sort(), [
    'bookings',
    'capacity',
    'demand',
    'doors',
    'locations',
  ]);

  // The door learns that a guest arrived and nothing about the money.
  assert.equal(canSubscribeToEvent('door', 'sku.checked_in'), true);
  assert.equal(canSubscribeToEvent('door', 'sku.confirmed'), false);
  assert.equal(canSubscribeToEvent('door', 'demand.open'), false);
  assert.equal(canSubscribeToEvent('owner', 'sku.confirmed'), true);

  // A scheduling seat sees capacity but not bookings.
  assert.equal(canSubscribeToEvent('serviceProvider', 'slot.full'), true);
  assert.equal(canSubscribeToEvent('serviceProvider', 'sku.confirmed'), false);
  assert.ok(eventsForRole('owner').length > eventsForRole('door').length);
});

test('an integration can never do more than the seat behind it', () => {
  assert.deepEqual(authorizeInbound({ eventId: 'availability.setQuantity', role: 'owner', state: 'OPEN' }), {
    ok: true,
    operation: 'SET_QUANTITY',
  });
  assert.deepEqual(authorizeInbound({ eventId: 'demand.offer', role: 'manager', state: 'MATCHED' }), {
    ok: true,
    operation: 'OFFER',
  });

  // The same two-part check the console runs: capability, then state.
  assert.deepEqual(authorizeInbound({ eventId: 'availability.block', role: 'door', state: 'OPEN' }), {
    ok: false,
    reason: 'forbidden',
  });
  assert.deepEqual(authorizeInbound({ eventId: 'demand.offer', role: 'staff', state: 'MATCHED' }), {
    ok: false,
    reason: 'forbidden',
  });
  assert.deepEqual(authorizeInbound({ eventId: 'availability.open', role: 'owner', state: 'OPEN' }), {
    ok: false,
    reason: 'illegal-state',
  });
  assert.deepEqual(authorizeInbound({ eventId: 'demand.offer', role: 'owner', state: 'BOOKED' }), {
    ok: false,
    reason: 'illegal-state',
  });

  // Nothing outside the declared inbound surface is reachable at all.
  assert.deepEqual(authorizeInbound({ eventId: 'sku.refund', role: 'owner', state: 'CONFIRMED' }), {
    ok: false,
    reason: 'unknown-event',
  });
  assert.deepEqual(authorizeInbound({ eventId: 'sku.confirmed', role: 'owner', state: 'CONFIRMED' }), {
    ok: false,
    reason: 'unknown-event',
  });
});
