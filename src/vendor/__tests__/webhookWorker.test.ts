import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOutcome,
  deliverOnce,
  drainQueue,
  dueAttempts,
  endpointStillEntitled,
  enqueueEvent,
  routeEvent,
  scheduleFirstAttempt,
  type DeliveryAttempt,
  type Transport,
  type TransportRequest,
  type WebhookEndpoint,
  type WorkerState,
} from '../webhookWorker.ts';
import { buildEnvelope, verifyWebhook, VENDOR_WEBHOOKS } from '../webhooks.ts';
import type { Seat, Seller } from '../seller.ts';

// Test-only material. Never a real signing secret.
const SECRET = 'whsec_worker_unit_test';
const AT = Math.floor(new Date('2026-09-04T19:00:00Z').getTime() / 1000);

const SELLER: Seller = {
  id: 'sel_1',
  legalName: 'Midtown Table',
  state: 'ACTIVE',
  businessMode: 'standard',
  satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'],
};

const OWNER_SEAT: Seat = {
  id: 'seat_1',
  sellerId: 'sel_1',
  personId: 'per_1',
  role: 'owner',
  state: 'ACTIVE',
  locationIds: [],
  bookableIds: [],
};

const DOOR_SEAT: Seat = { ...OWNER_SEAT, id: 'seat_2', personId: 'per_2', role: 'door' };

function endpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: 'ep_1',
    sellerId: 'sel_1',
    seatId: 'seat_1',
    url: 'https://pos.example.com/hooks/bytspot',
    scopes: ['bookings'],
    state: 'ACTIVE',
    consecutiveFailures: 0,
    ...overrides,
  };
}

function envelope(event = 'sku.confirmed', sellerId = 'sel_1', eventId = 'evt_1') {
  return buildEnvelope({
    eventId,
    event,
    sellerId,
    data: { skuId: 'sku_1' },
    occurredAt: new Date(AT * 1000),
  });
}

const clock = (secs = AT) => ({ nowSecs: () => secs });
const secrets = async () => SECRET;

function recordingTransport(status = 200): { transport: Transport; sent: TransportRequest[] } {
  const sent: TransportRequest[] = [];
  return {
    sent,
    transport: async (request) => {
      sent.push(request);
      return { status };
    },
  };
}

test('an event never leaves the seller it belongs to', () => {
  const endpoints = [
    endpoint({ id: 'ep_mine' }),
    endpoint({ id: 'ep_theirs', sellerId: 'sel_2' }),
    endpoint({ id: 'ep_also_theirs', sellerId: 'sel_3' }),
  ];

  assert.deepEqual(routeEvent(endpoints, envelope()).map((item) => item.id), ['ep_mine']);
  assert.deepEqual(routeEvent(endpoints, envelope('sku.confirmed', 'sel_2')).map((item) => item.id), ['ep_theirs']);
  assert.deepEqual(routeEvent(endpoints, envelope('sku.confirmed', 'sel_9')), []);
});

test('an endpoint only carries what its own scopes name', () => {
  const bookings = endpoint({ id: 'ep_bookings', scopes: ['bookings'] });
  const doors = endpoint({ id: 'ep_doors', scopes: ['doors'] });
  const both = endpoint({ id: 'ep_both', scopes: ['bookings', 'doors'] });
  const all = [bookings, doors, both];

  // A door endpoint learns that a guest arrived and nothing about the money.
  assert.deepEqual(routeEvent(all, envelope('sku.checked_in')).map((item) => item.id), ['ep_doors', 'ep_both']);
  assert.deepEqual(routeEvent(all, envelope('sku.confirmed')).map((item) => item.id), ['ep_bookings', 'ep_both']);

  // A paused or disabled endpoint receives nothing at all.
  for (const state of ['PAUSED', 'DISABLED'] as const) {
    assert.deepEqual(routeEvent([endpoint({ state })], envelope()), []);
  }
  // An event no scope carries is undeliverable rather than broadcast.
  assert.deepEqual(routeEvent(all, envelope('sku.invented')), []);
});

test('revoking the seat silences its endpoints without touching the endpoint', () => {
  const owned = endpoint();
  const now = new Date(AT * 1000);

  assert.equal(endpointStillEntitled(owned, SELLER, OWNER_SEAT, now), true);

  // The endpoint record is untouched in every case below; only the seat changed.
  for (const state of ['INVITED', 'SUSPENDED', 'REVOKED'] as const) {
    assert.equal(
      endpointStillEntitled(owned, SELLER, { ...OWNER_SEAT, state }, now),
      false,
      `a ${state} seat still delivered`,
    );
  }
  // A seat that no longer exists cannot entitle anything.
  assert.equal(endpointStillEntitled(owned, SELLER, undefined, now), false);
  // Suspending the business strips SELL, so a bookings endpoint stops with it.
  assert.equal(endpointStillEntitled(owned, { ...SELLER, state: 'SUSPENDED' }, OWNER_SEAT, now), false);
  assert.equal(endpointStillEntitled(owned, { ...SELLER, state: 'CLOSED' }, OWNER_SEAT, now), false);

  // A door seat can hold a doors endpoint and never a bookings one.
  const doorEndpoint = endpoint({ id: 'ep_door', seatId: 'seat_2', scopes: ['doors'] });
  assert.equal(endpointStillEntitled(doorEndpoint, SELLER, DOOR_SEAT, now), true);
  assert.equal(
    endpointStillEntitled({ ...doorEndpoint, scopes: ['bookings'] }, SELLER, DOOR_SEAT, now),
    false,
  );
  // A demoted seat loses the endpoint it created while senior.
  assert.equal(endpointStillEntitled(owned, SELLER, { ...OWNER_SEAT, role: 'door' }, now), false);
});

test('entitlement is re-derived at enqueue, so a demotion takes effect on the next event', () => {
  const state: WorkerState = { endpoints: [endpoint(), endpoint({ id: 'ep_door', seatId: 'seat_2', scopes: ['doors'] })], queue: [] };
  const seats = [OWNER_SEAT, DOOR_SEAT];

  const live = enqueueEvent(state, envelope(), { seller: SELLER, seats, nowSecs: AT });
  assert.deepEqual(live.queue.map((item) => item.endpointId), ['ep_1']);

  // Revoke the owner seat and the very next event reaches nobody.
  const revoked = enqueueEvent(state, envelope('sku.confirmed', 'sel_1', 'evt_2'), {
    seller: SELLER,
    seats: [{ ...OWNER_SEAT, state: 'REVOKED' }, DOOR_SEAT],
    nowSecs: AT,
  });
  assert.deepEqual(revoked.queue, []);

  // The door endpoint still works, because its own seat is untouched.
  const checkedIn = enqueueEvent(state, envelope('sku.checked_in', 'sel_1', 'evt_3'), {
    seller: SELLER,
    seats,
    nowSecs: AT,
  });
  assert.deepEqual(checkedIn.queue.map((item) => item.endpointId), ['ep_door']);

  // Suspending the business stops bookings but keeps the door informed.
  const suspended = { ...SELLER, state: 'SUSPENDED' as const };
  assert.deepEqual(enqueueEvent(state, envelope(), { seller: suspended, seats, nowSecs: AT }).queue, []);
  assert.equal(
    enqueueEvent(state, envelope('sku.checked_in'), { seller: suspended, seats, nowSecs: AT }).queue.length,
    1,
  );

  // The same event is never queued twice for the same endpoint.
  const again = enqueueEvent(live, envelope(), { seller: SELLER, seats, nowSecs: AT });
  assert.equal(again.queue.length, 1);
});

test('a delivery is signed with the contract headers and verifies at the far end', async () => {
  const { transport, sent } = recordingTransport(200);
  const attempt = scheduleFirstAttempt(endpoint(), envelope(), AT);

  const outcome = await deliverOnce({ endpoint: endpoint(), attempt, secrets, transport, clock: clock() });
  assert.deepEqual(outcome, { kind: 'delivered', status: 200 });

  const { transport: wire } = VENDOR_WEBHOOKS;
  const request = sent[0];
  assert.equal(request.url, 'https://pos.example.com/hooks/bytspot');
  assert.equal(request.headers['Content-Type'], wire.contentType);
  assert.equal(request.headers[wire.eventIdHeader], 'evt_1');
  assert.equal(request.headers[wire.timestampHeader], String(AT));

  // The receiver's own verifier accepts it, which is the only proof that counts.
  assert.deepEqual(
    await verifyWebhook({
      secret: SECRET,
      body: request.body,
      signature: request.headers[wire.signatureHeader],
      timestampSecs: Number(request.headers[wire.timestampHeader]),
      nowSecs: AT,
    }),
    { ok: true },
  );
  // And rejects the same body under a different secret.
  assert.equal(
    (
      await verifyWebhook({
        secret: 'whsec_someone_else',
        body: request.body,
        signature: request.headers[wire.signatureHeader],
        timestampSecs: AT,
        nowSecs: AT,
      })
    ).ok,
    false,
  );
});

test('the signing secret never reaches the queue, the envelope, or the outcome', async () => {
  const { transport, sent } = recordingTransport(200);
  const attempt = scheduleFirstAttempt(endpoint(), envelope(), AT);

  // Nothing persisted about a delivery contains the material used to sign it.
  assert.equal(JSON.stringify(attempt).includes(SECRET), false);
  assert.equal(JSON.stringify(endpoint()).includes(SECRET), false);

  const outcome = await deliverOnce({ endpoint: endpoint(), attempt, secrets, transport, clock: clock() });
  assert.equal(JSON.stringify(outcome).includes(SECRET), false);
  assert.equal(JSON.stringify(sent).includes(SECRET), false);
  assert.equal(sent[0].body.includes(SECRET), false);

  // An endpoint with no resolvable secret is dropped rather than sent unsigned.
  const unsigned = await deliverOnce({
    endpoint: endpoint(),
    attempt,
    secrets: async () => null,
    transport,
    clock: clock(),
  });
  assert.deepEqual(unsigned, { kind: 'dropped', reason: 'no-secret' });
  assert.equal(sent.length, 1, 'a delivery went out without a signature');
});

test('retries follow the contract schedule exactly and then stop', async () => {
  const { backoffSecs, maxAttempts } = VENDOR_WEBHOOKS.retry;
  const { transport } = recordingTransport(503);

  let attempt = scheduleFirstAttempt(endpoint(), envelope(), AT);
  assert.equal(attempt.nextAttemptAtSecs, AT + backoffSecs[0]);

  const scheduled: number[] = [];
  for (let index = 1; index < maxAttempts; index += 1) {
    const at = attempt.nextAttemptAtSecs;
    const outcome = await deliverOnce({ endpoint: endpoint(), attempt, secrets, transport, clock: clock(at) });
    assert.equal(outcome.kind, 'retry', `attempt ${index} should have been retried`);
    if (outcome.kind !== 'retry') break;
    scheduled.push(outcome.nextAttemptAtSecs - at);
    attempt = { ...attempt, attempt: outcome.attempt, nextAttemptAtSecs: outcome.nextAttemptAtSecs };
  }
  assert.deepEqual(scheduled, backoffSecs.slice(1));

  // The last attempt exhausts rather than retrying forever.
  const last = await deliverOnce({
    endpoint: endpoint(),
    attempt,
    secrets,
    transport,
    clock: clock(attempt.nextAttemptAtSecs),
  });
  assert.deepEqual(last, { kind: 'exhausted', status: 503 });

  // A 400 is the vendor's own bug, so it exhausts on the first attempt.
  const { transport: badRequest } = recordingTransport(400);
  assert.deepEqual(
    await deliverOnce({
      endpoint: endpoint(),
      attempt: scheduleFirstAttempt(endpoint(), envelope(), AT),
      secrets,
      transport: badRequest,
      clock: clock(),
    }),
    { kind: 'exhausted', status: 400 },
  );
});

test('a retry reuses the event id, because the receiver dedupes on it', async () => {
  const { transport, sent } = recordingTransport(503);
  const first = scheduleFirstAttempt(endpoint(), envelope(), AT);

  const retry = await deliverOnce({ endpoint: endpoint(), attempt: first, secrets, transport, clock: clock() });
  assert.equal(retry.kind, 'retry');
  if (retry.kind !== 'retry') return;

  const second = { ...first, attempt: retry.attempt, nextAttemptAtSecs: retry.nextAttemptAtSecs };
  await deliverOnce({ endpoint: endpoint(), attempt: second, secrets, transport, clock: clock(retry.nextAttemptAtSecs) });

  const header = VENDOR_WEBHOOKS.transport.eventIdHeader;
  assert.equal(sent.length, 2);
  assert.equal(sent[0].headers[header], sent[1].headers[header]);
  assert.equal(sent[0].body, sent[1].body);
  // The signature is not reused, because each attempt carries its own timestamp.
  assert.notEqual(
    sent[0].headers[VENDOR_WEBHOOKS.transport.signatureHeader],
    sent[1].headers[VENDOR_WEBHOOKS.transport.signatureHeader],
  );
});

test('a refused connection is treated as a retryable failure, not a lost event', async () => {
  const attempt = scheduleFirstAttempt(endpoint(), envelope(), AT);
  const outcome = await deliverOnce({
    endpoint: endpoint(),
    attempt,
    secrets,
    transport: async () => {
      throw new Error('ECONNREFUSED');
    },
    clock: clock(),
  });
  assert.equal(outcome.kind, 'retry');
  assert.equal(outcome.kind === 'retry' && outcome.status, 503);
});

test('a success clears the failure count and a dead endpoint disables itself', () => {
  const { disableAfterConsecutiveFailures } = VENDOR_WEBHOOKS.retry;

  // Recovery must not be punished by history.
  const recovering = applyOutcome(endpoint({ consecutiveFailures: 12 }), { kind: 'delivered', status: 200 });
  assert.equal(recovering.consecutiveFailures, 0);
  assert.equal(recovering.state, 'ACTIVE');

  // Only an exhausted delivery counts as a failure; a pending retry does not.
  assert.equal(applyOutcome(endpoint(), { kind: 'retry', status: 503, attempt: 1, nextAttemptAtSecs: AT }).consecutiveFailures, 0);
  assert.equal(applyOutcome(endpoint(), { kind: 'exhausted', status: 503 }).consecutiveFailures, 1);
  assert.equal(applyOutcome(endpoint(), { kind: 'dropped', reason: 'no-secret' }).consecutiveFailures, 0);

  const nearlyDead = endpoint({ consecutiveFailures: disableAfterConsecutiveFailures - 2 });
  assert.equal(applyOutcome(nearlyDead, { kind: 'exhausted', status: 500 }).state, 'ACTIVE');
  const dead = applyOutcome(
    endpoint({ consecutiveFailures: disableAfterConsecutiveFailures - 1 }),
    { kind: 'exhausted', status: 500 },
  );
  assert.equal(dead.state, 'DISABLED');
});

test('a drain sends only what is due and puts retries back with their backoff', async () => {
  const { transport, sent } = recordingTransport(200);
  const soon: DeliveryAttempt = { ...scheduleFirstAttempt(endpoint(), envelope(), AT), id: 'a', eventId: 'evt_a' };
  const later: DeliveryAttempt = { ...soon, id: 'b', eventId: 'evt_b', nextAttemptAtSecs: AT + 3600 };

  assert.deepEqual(dueAttempts([soon, later], AT).map((item) => item.id), ['a']);

  const drained = await drainQueue({ endpoints: [endpoint()], queue: [soon, later] }, { secrets, transport, clock: clock() });
  assert.deepEqual(drained.report, { delivered: 1, retried: 0, exhausted: 0, dropped: 0, disabled: [] });
  assert.equal(sent.length, 1, 'an attempt was sent before it was due');
  // The undue attempt stays queued rather than being dropped.
  assert.deepEqual(drained.state.queue.map((item) => item.id), ['b']);

  // A failing endpoint keeps its attempt, with the next backoff applied.
  const { transport: failing } = recordingTransport(500);
  const retried = await drainQueue({ endpoints: [endpoint()], queue: [soon] }, { secrets, transport: failing, clock: clock() });
  assert.equal(retried.report.retried, 1);
  assert.equal(retried.state.queue[0].attempt, 1);
  assert.equal(retried.state.queue[0].nextAttemptAtSecs, AT + VENDOR_WEBHOOKS.retry.backoffSecs[1]);

  // An attempt whose endpoint has gone is dropped rather than retried forever.
  const orphaned = await drainQueue({ endpoints: [], queue: [soon] }, { secrets, transport, clock: clock() });
  assert.deepEqual(orphaned.report.dropped, 1);
  assert.deepEqual(orphaned.state.queue, []);
});

test('a drain reports the endpoints it disabled, so the vendor can be told', async () => {
  const { disableAfterConsecutiveFailures } = VENDOR_WEBHOOKS.retry;
  const { transport } = recordingTransport(400);
  const dying = endpoint({ consecutiveFailures: disableAfterConsecutiveFailures - 1 });
  const attempt = scheduleFirstAttempt(dying, envelope(), AT);

  const drained = await drainQueue({ endpoints: [dying], queue: [attempt] }, { secrets, transport, clock: clock() });
  assert.deepEqual(drained.report.disabled, ['ep_1']);
  assert.equal(drained.state.endpoints[0].state, 'DISABLED');
  assert.deepEqual(drained.state.queue, []);

  // Once disabled it takes no further events and sends nothing more.
  assert.deepEqual(routeEvent(drained.state.endpoints, envelope()), []);
  const after = await drainQueue(
    { endpoints: drained.state.endpoints, queue: [scheduleFirstAttempt(dying, envelope('sku.confirmed', 'sel_1', 'evt_9'), AT)] },
    { secrets, transport, clock: clock() },
  );
  assert.deepEqual(after.report.dropped, 1);
});

test('a body over the transport limit is dropped rather than sent and retried', async () => {
  const { transport, sent } = recordingTransport(200);
  const attempt = scheduleFirstAttempt(endpoint(), envelope(), AT);
  const oversized = { ...attempt, body: 'x'.repeat(VENDOR_WEBHOOKS.transport.maxBodyBytes + 1) };

  assert.deepEqual(await deliverOnce({ endpoint: endpoint(), attempt: oversized, secrets, transport, clock: clock() }), {
    kind: 'dropped',
    reason: 'body-too-large',
  });
  assert.equal(sent.length, 0);

  // An inactive endpoint is refused before any signing work is done.
  assert.deepEqual(
    await deliverOnce({ endpoint: endpoint({ state: 'DISABLED' }), attempt, secrets, transport, clock: clock() }),
    { kind: 'dropped', reason: 'endpoint-inactive' },
  );
  assert.equal(sent.length, 0);
});
