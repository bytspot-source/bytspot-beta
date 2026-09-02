import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduler, jitteredSecs, nextWakeSecs } from '../webhookScheduler.ts';
import {
  grantableScopes,
  moveEndpoint,
  registerEndpoint,
  scheduleFirstAttempt,
  webhookUrlRefusal,
  type WebhookEndpoint,
  type WorkerState,
} from '../webhookWorker.ts';
import { openSession, type Seat, type Seller, type VendorSession } from '../seller.ts';
import { VENDOR_WEBHOOKS } from '../webhooks.ts';
import type { VendorWebhookEnvelope } from '../webhooks.ts';

const NOW = 1_700_000_000;

const seller = (over: Partial<Seller> = {}): Seller => ({
  id: 'sel_1',
  legalName: 'Midtown Table',
  state: 'ACTIVE',
  businessMode: 'standard',
  satisfied: [],
  ...over,
});

const seat = (over: Partial<Seat> = {}): Seat => ({
  id: 'seat_1',
  sellerId: 'sel_1',
  personId: 'per_1',
  role: 'owner',
  state: 'ACTIVE',
  locationIds: [],
  bookableIds: [],
  ...over,
});

function session(sellerOver: Partial<Seller> = {}, seatOver: Partial<Seat> = {}): VendorSession {
  const opened = openSession(seller(sellerOver), seat(seatOver), new Date(NOW * 1000));
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error(opened.reason);
  return opened.session;
}

const endpoint = (over: Partial<WebhookEndpoint> = {}): WebhookEndpoint => ({
  id: 'whe_1',
  sellerId: 'sel_1',
  seatId: 'seat_1',
  url: 'https://hooks.example.com/bytspot',
  scopes: ['bookings'],
  state: 'ACTIVE',
  consecutiveFailures: 0,
  ...over,
});

const envelope = (event = 'sku.reserved'): VendorWebhookEnvelope => ({
  eventId: 'evt_1',
  event,
  version: VENDOR_WEBHOOKS.version,
  occurredAt: new Date(NOW * 1000).toISOString(),
  sellerId: 'sel_1',
  data: {},
});

test('a receiver we POST to on a schedule cannot be an address only we can reach', () => {
  assert.equal(webhookUrlRefusal('https://hooks.example.com/bytspot'), null);

  // Plain http would put a signed payload on the wire in clear.
  assert.equal(webhookUrlRefusal('http://hooks.example.com/x'), 'insecure-url');
  assert.equal(webhookUrlRefusal('not a url'), 'insecure-url');
  // Credentials in the URL would be logged with every attempt.
  assert.equal(webhookUrlRefusal('https://user:pw@hooks.example.com/x'), 'insecure-url');

  // Our own scheduler makes these requests, so an address that resolves only
  // inside our network is a server-side request forgery with extra steps.
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.0.0.5',
    '192.168.1.1',
    '172.16.0.1',
    '169.254.169.254',
    'db.internal',
    'printer.local',
  ]) {
    assert.equal(webhookUrlRefusal(`https://${host}/x`), 'unroutable-url', host);
  }
  // A public host that merely looks private is fine.
  assert.equal(webhookUrlRefusal('https://172.32.0.1/x'), null);
});

test('an endpoint cannot subscribe past the seat that created it', () => {
  const owner = session();
  assert.deepEqual(grantableScopes(owner).sort(), ['bookings', 'capacity', 'demand', 'doors', 'locations']);

  // The door seat can only ever hear about doors, which is the one scope its
  // capability covers. Everything else is refused at registration.
  const door = session({}, { role: 'door' });
  assert.deepEqual(grantableScopes(door), ['doors']);
  assert.deepEqual(
    registerEndpoint(door, { id: 'whe_2', url: 'https://hooks.example.com/d', scopes: ['bookings'] }),
    { ok: false, reason: 'forbidden' },
  );
  // Minting a credential is owner-only even when the scope itself would pass.
  assert.deepEqual(
    registerEndpoint(door, { id: 'whe_2', url: 'https://hooks.example.com/d', scopes: ['doors'] }),
    { ok: false, reason: 'forbidden' },
  );

  // Suspending the business narrows what its own owner may register, with no
  // role edited: the same rule the worker re-applies before every send.
  const suspended = session({ state: 'SUSPENDED' });
  assert.deepEqual(grantableScopes(suspended).sort(), ['doors']);
  assert.deepEqual(
    registerEndpoint(suspended, { id: 'whe_2', url: 'https://hooks.example.com/s', scopes: ['bookings'] }),
    { ok: false, reason: 'forbidden' },
  );

  const good = registerEndpoint(owner, {
    id: 'whe_2',
    url: 'https://hooks.example.com/ok',
    scopes: ['bookings', 'bookings', 'doors'],
  });
  assert.equal(good.ok, true);
  if (!good.ok) return;
  assert.deepEqual(good.endpoint.scopes, ['bookings', 'doors']);
  assert.equal(good.endpoint.seatId, 'seat_1');
  assert.equal(good.endpoint.consecutiveFailures, 0);

  assert.deepEqual(
    registerEndpoint(owner, { id: 'whe_3', url: 'https://hooks.example.com/x', scopes: [] }),
    { ok: false, reason: 'no-scopes' },
  );
  assert.deepEqual(
    registerEndpoint(owner, { id: 'whe_3', url: 'https://hooks.example.com/x', scopes: ['payouts'] }),
    { ok: false, reason: 'unknown-scope' },
  );
  // A duplicate would double every delivery to the same receiver.
  assert.deepEqual(
    registerEndpoint(owner, { id: 'whe_3', url: good.endpoint.url, scopes: ['bookings'] }, [good.endpoint]),
    { ok: false, reason: 'duplicate-url' },
  );
  // Unless the old one is disabled, in which case the URL is free again.
  assert.equal(
    registerEndpoint(owner, { id: 'whe_3', url: good.endpoint.url, scopes: ['bookings'] }, [
      { ...good.endpoint, state: 'DISABLED' },
    ]).ok,
    true,
  );
});

test('a disabled endpoint is recoverable, and resuming forgives its history', () => {
  const owner = session();
  const dead = endpoint({ state: 'DISABLED', consecutiveFailures: 20 });

  const resumed = moveEndpoint(owner, dead, 'RESUME');
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.endpoint.state, 'ACTIVE');
  // Without clearing the count, the next single failure would disable it again.
  assert.equal(resumed.endpoint.consecutiveFailures, 0);

  assert.deepEqual(moveEndpoint(owner, dead, 'PAUSE'), { ok: false, reason: 'illegal-state' });
  const paused = moveEndpoint(owner, endpoint(), 'PAUSE');
  assert.equal(paused.ok && paused.endpoint.state, 'PAUSED');
  // Pausing keeps the history, because nothing was fixed.
  const failing = moveEndpoint(owner, endpoint({ consecutiveFailures: 3 }), 'PAUSE');
  assert.equal(failing.ok && failing.endpoint.consecutiveFailures, 3);

  // Rotation reassigns the endpoint to whoever holds the new secret, so the
  // entitlement check follows the credential rather than its original creator.
  const rotated = moveEndpoint(session({}, { id: 'seat_2', role: 'owner' }), dead, 'ROTATE');
  assert.equal(rotated.ok && rotated.endpoint.seatId, 'seat_2');

  assert.deepEqual(moveEndpoint(session({}, { role: 'manager' }), endpoint(), 'PAUSE'), {
    ok: false,
    reason: 'forbidden',
  });
  // An endpoint belonging to another business is invisible, not merely refused.
  assert.deepEqual(moveEndpoint(owner, endpoint({ sellerId: 'sel_other' }), 'PAUSE'), {
    ok: false,
    reason: 'forbidden',
  });
});

test('the loop wakes for the soonest attempt and never busy-polls', () => {
  assert.equal(nextWakeSecs([], NOW), 30);

  const soon = scheduleFirstAttempt(endpoint(), envelope(), NOW);
  const later = { ...soon, id: 'whe_1:evt_2', nextAttemptAtSecs: NOW + 21_600 };
  // A 30-second retry is not held behind a six-hour one.
  assert.equal(nextWakeSecs([later, { ...soon, nextAttemptAtSecs: NOW + 5 }], NOW), 5);
  // Nothing sleeps longer than the idle interval, so a re-enabled endpoint is
  // picked up without a restart.
  assert.equal(nextWakeSecs([later], NOW), 30);
  // Something already due wakes immediately rather than going negative.
  assert.equal(nextWakeSecs([{ ...soon, nextAttemptAtSecs: NOW - 100 }], NOW), 0);

  // Jitter keeps a hundred simultaneous retries from returning as one spike.
  assert.equal(jitteredSecs(0, () => 0.5), 0);
  assert.equal(jitteredSecs(30, () => 0.5), 30);
  assert.ok(jitteredSecs(30, () => 0) < 30);
  assert.ok(jitteredSecs(30, () => 1) > 30);
  for (const random of [0, 0.5, 1]) {
    assert.ok(jitteredSecs(10, () => random) >= 0);
  }
});

test('the scheduler is single-flight, survives a thrown pass, and stops cleanly', async () => {
  let clockSecs = NOW;
  const sent: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const state: WorkerState = {
    endpoints: [endpoint()],
    queue: [scheduleFirstAttempt(endpoint(), envelope(), NOW)],
  };

  const scheduler = createScheduler(state, {
    secrets: async () => 'shhh',
    transport: async ({ url }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      sent.push(url);
      return { status: 200 };
    },
    clock: { nowSecs: () => clockSecs },
    sleep: async () => undefined,
    random: () => 0.5,
  });

  // Two callers, one pass. A second pass over the same attempts would deliver
  // the same event twice, which at-least-once permits but nobody wants.
  const [first, second] = await Promise.all([scheduler.runOnce(), scheduler.runOnce()]);
  assert.equal(first.delivered + second.delivered, 1);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(sent, ['https://hooks.example.com/bytspot']);
  assert.deepEqual(scheduler.state().queue, []);

  // A pass that throws is reported and the loop keeps running: ending it would
  // silently stop every future delivery.
  const errors: unknown[] = [];
  let attempts = 0;
  const brittle = createScheduler(
    { endpoints: [endpoint()], queue: [scheduleFirstAttempt(endpoint(), envelope(), NOW)] },
    {
      secrets: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('vault unreachable');
        return 'shhh';
      },
      transport: async () => ({ status: 200 }),
      clock: { nowSecs: () => clockSecs },
      sleep: async () => undefined,
      onError: (error) => errors.push(error),
    },
  );
  await brittle.runOnce().catch((error) => errors.push(error));
  assert.equal(errors.length, 1);
  assert.equal(brittle.state().queue.length, 1, 'a thrown pass must not consume the attempt');
  const recovered = await brittle.runOnce();
  assert.equal(recovered.delivered, 1);

  // start() runs a real loop, and stop() must not leave a pass in flight.
  let sleeps = 0;
  let ranThreeTimes: () => void;
  const settled = new Promise<void>((resolve) => {
    ranThreeTimes = resolve;
  });
  const looping = createScheduler(
    { endpoints: [endpoint()], queue: [] },
    {
      secrets: async () => 'shhh',
      transport: async () => ({ status: 200 }),
      clock: { nowSecs: () => clockSecs },
      sleep: async () => {
        sleeps += 1;
        if (sleeps >= 3) ranThreeTimes();
        await new Promise((resolve) => setImmediate(resolve));
      },
    },
  );
  looping.start();
  assert.equal(looping.running(), true);
  // A second start is a no-op, or there would be two loops on one queue.
  looping.start();
  await settled;
  assert.ok(sleeps >= 3);

  await looping.stop();
  assert.equal(looping.running(), false);
  // Stopped means stopped: no further pass runs after stop() resolves.
  const after = sleeps;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sleeps, after);

  clockSecs += 1;
});

test('a retry re-signs but keeps its event id, so dedupe works and replay does not', async () => {
  let clockSecs = NOW;
  const signatures: string[] = [];
  const eventIds: string[] = [];
  let status = 503;

  const scheduler = createScheduler(
    { endpoints: [endpoint()], queue: [scheduleFirstAttempt(endpoint(), envelope(), NOW)] },
    {
      secrets: async () => 'shhh',
      transport: async ({ headers }) => {
        signatures.push(headers[VENDOR_WEBHOOKS.transport.signatureHeader]);
        eventIds.push(headers[VENDOR_WEBHOOKS.transport.eventIdHeader]);
        return { status };
      },
      clock: { nowSecs: () => clockSecs },
      sleep: async () => undefined,
    },
  );

  const first = await scheduler.runOnce();
  assert.equal(first.retried, 1);

  clockSecs += VENDOR_WEBHOOKS.retry.backoffSecs[1];
  status = 200;
  const second = await scheduler.runOnce();
  assert.equal(second.delivered, 1);

  assert.equal(eventIds.length, 2);
  // The receiver dedupes on this, so it must not change between attempts.
  assert.equal(eventIds[0], eventIds[1]);
  // The signature is timestamp-bound, so it must change: a replayed attempt
  // would otherwise stay valid forever.
  assert.notEqual(signatures[0], signatures[1]);
  for (const signature of signatures) {
    assert.match(signature, new RegExp(`^${VENDOR_WEBHOOKS.transport.signaturePrefix}`));
    // The secret must never appear in what goes on the wire.
    assert.doesNotMatch(signature, /shhh/);
  }
  assert.deepEqual(scheduler.state().queue, []);
});
