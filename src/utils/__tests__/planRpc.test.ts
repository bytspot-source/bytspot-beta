import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanApi, createPlanInput, emptyPlanDraft, localDateTimeInput, parsePlan, planDraftError, planEditDraft, planEditInput, planErrorMessage, planErrorRetryable, PLAN_IDEAS, PLAN_NEEDS, PLAN_STEPS, type PlansTransport } from '../planRpc.ts';

const key = '62de4f5f-9440-4921-af86-e086289ac7e5';
const now = new Date('2026-10-26T12:00:30Z');
const validDraft = () => ({ ...emptyPlanDraft(), title: ' Dinner ', intent: ' Meet friends ' });
const plan = () => ({ id: 'p1', title: 'Dinner', intent: 'Meet friends', creatorUserId: 'u1', state: 'proposed', startsAt: null, endsAt: null, expiresAt: null, partySize: null, areaLabel: null, latitude: null, longitude: null, needs: ['dining'], openNeeds: ['dining'], readiness: { going: 1, maybe: 0, pending: 2 }, items: [] });
const trpcError = (code: string, httpStatus: number, message: string) => Object.assign(new Error(message), { data: { code, httpStatus } });

test('Plan creates trimmed intent, leaving undecided details absent', () => {
  assert.deepEqual(createPlanInput(validDraft(), key), { idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', needs: [] });
});

test('Plan normalizes optional date, group size and duplicate needs', () => {
  assert.deepEqual(createPlanInput({ ...validDraft(), startsAt: '2027-01-05T19:00:00Z', partySize: '4', needs: ['dining', 'dining'] }, key, now), {
    idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', startsAt: '2027-01-05T19:00:00.000Z', partySize: 4, needs: ['dining'],
  });
});

test('Plan sends a typed area and coordinates only from a real fix', () => {
  const coords = { latitude: 40.74, longitude: -73.99 };
  assert.deepEqual(createPlanInput({ ...validDraft(), areaLabel: ' Chelsea ' }, key, now), { idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', needs: [], areaLabel: 'Chelsea' });
  assert.deepEqual(createPlanInput({ ...validDraft(), coords }, key, now), { idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', needs: [], areaLabel: 'Near me', ...coords });
  assert.deepEqual(createPlanInput({ ...validDraft(), areaLabel: 'Chelsea', coords }, key, now), { idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', needs: [], areaLabel: 'Chelsea', ...coords });
  for (const bad of [{ latitude: 0, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: Number.NaN, longitude: 1 }]) {
    assert.match(planDraftError({ ...validDraft(), coords: bad }, now) ?? '', /location/);
  }
  assert.match(planDraftError({ ...validDraft(), areaLabel: 'x'.repeat(81) }, now) ?? '', /80/);
});

test('Plan rejects a start time that has already passed', () => {
  assert.equal(planDraftError({ ...validDraft(), startsAt: '2026-10-26T12:00:00Z' }, now), null);
  assert.match(planDraftError({ ...validDraft(), startsAt: '2026-10-26T11:59:00Z' }, now) ?? '', /has not passed/);
  assert.throws(() => createPlanInput({ ...validDraft(), startsAt: '2026-10-25T12:00:00Z' }, key, now), /has not passed/);
  assert.equal(localDateTimeInput(new Date(2026, 0, 5, 9, 7, 45)), '2026-01-05T09:07');
});

test('Plan edits send only changed fields and null for cleared ones', () => {
  const current = parsePlan({ ...plan(), startsAt: '2026-11-01T19:00:00Z', partySize: 4, areaLabel: 'Chelsea', latitude: 40.74, longitude: -73.99 });
  const edit = planEditDraft(current);
  assert.deepEqual(planEditInput(current, edit, now), {});
  assert.deepEqual(planEditInput(current, { ...edit, partySize: '', areaLabel: '', coords: null }, now), { partySize: null, areaLabel: null, latitude: null, longitude: null });
  assert.deepEqual(planEditInput(current, { ...edit, startsAt: '' }, now), { startsAt: null });
  assert.deepEqual(planEditInput(current, { ...edit, areaLabel: '' }, now), { areaLabel: 'Near me' });
  assert.throws(() => planEditInput(current, { ...edit, startsAt: '2026-10-01T10:00' }, now), /has not passed/);
  const started = parsePlan({ ...plan(), startsAt: '2026-10-26T11:00:00Z' });
  assert.deepEqual(planEditInput(started, { ...planEditDraft(started), partySize: '3' }, now), { partySize: 3 });
});

for (const size of ['0', '201', '1.5', '-1', 'abc', '1e2']) {
  test(`Plan rejects invalid party size ${size}`, () => {
    assert.match(planDraftError({ ...validDraft(), partySize: size }) ?? '', /whole number/);
  });
}

test('Plan validates required fields and limits before submit', () => {
  assert.match(planDraftError(emptyPlanDraft()) ?? '', /title/);
  assert.match(planDraftError({ ...validDraft(), title: 'x'.repeat(81) }) ?? '', /title/);
  assert.match(planDraftError({ ...validDraft(), intent: ' ' }) ?? '', /idea/);
  assert.match(planDraftError({ ...validDraft(), intent: 'x'.repeat(281) }) ?? '', /idea/);
  assert.match(planDraftError({ ...validDraft(), startsAt: 'not a date' }) ?? '', /date/);
  assert.throws(() => createPlanInput(emptyPlanDraft(), key));
  assert.equal(planDraftError({ ...validDraft(), partySize: '200' }), null);
});

test('Quick ideas are editable intents, never inventory or confirmed plans', () => {
  assert.deepEqual(PLAN_STEPS, ['Idea', 'Details', 'Review']);
  for (const idea of PLAN_IDEAS) {
    assert.equal(planDraftError({ ...emptyPlanDraft(), ...idea }), null);
    assert.ok(idea.needs.every(need => PLAN_NEEDS.includes(need)));
    assert.equal('state' in idea, false);
  }
});

test('Parser preserves server truth, does not retain unrelated fields', () => {
  assert.deepEqual(parsePlan({ ...plan(), unrelatedField: 'discard' }), plan());
  const result = parsePlan({ ...plan(), state: 'confirmed', items: [{ id: 'i', title: 'Coffee', needKind: 'coffee', booked: false, status: 'proposed' }] });
  assert.equal(result.state, 'confirmed');
  assert.equal(result.items[0].booked, false);
});

test('Parser keeps timing, expiry and location, treating absent fields as undecided', () => {
  const row = { ...plan(), startsAt: '2026-11-01T19:00:00Z', endsAt: '2026-11-01T22:00:00Z', expiresAt: '2026-11-02T00:00:00Z', areaLabel: 'Chelsea', latitude: 40.74, longitude: -73.99 };
  assert.deepEqual(parsePlan(row), row);
  const legacy = Object.fromEntries(Object.entries(plan()).filter(([field]) => !['endsAt', 'expiresAt', 'areaLabel', 'latitude', 'longitude'].includes(field)));
  assert.deepEqual(parsePlan(legacy), plan());
});

test('Unknown states and malformed results fail closed rather than fabricate a plan', () => {
  for (const row of [null, {}, { ...plan(), state: 'guaranteed' }, { ...plan(), readiness: {} }, { ...plan(), startsAt: 'bad' }, { ...plan(), items: null },
    { ...plan(), expiresAt: 'soon' }, { ...plan(), endsAt: 5 }, { ...plan(), latitude: Number.POSITIVE_INFINITY }, { ...plan(), longitude: '1' }, { ...plan(), areaLabel: 3 }]) {
    assert.throws(() => parsePlan(row));
  }
});

test('RPC adapter sends only contracted paths/payloads and preserves retry key', async () => {
  const calls: unknown[] = [];
  const client: PlansTransport = { plans: {
    list: { query: async () => ({ plans: [plan()] }) },
    get: { query: async input => { calls.push(['get', input]); return plan(); } },
    create: { mutate: async input => { calls.push(['create', input]); return { id: 'p1' }; } },
    update: { mutate: async input => { calls.push(['update', input]); return { id: 'p1' }; } },
    confirm: { mutate: async input => { calls.push(['confirm', input]); } },
    cancel: { mutate: async input => { calls.push(['cancel', input]); } },
    respond: { mutate: async input => { calls.push(['respond', input]); } },
  } };
  const api = createPlanApi(client);
  assert.deepEqual(await api.list(), [plan()]);
  assert.deepEqual(await api.get('p1'), plan());
  const input = createPlanInput(validDraft(), key);
  assert.equal(await api.create(input), 'p1');
  assert.equal(await api.create(input), 'p1');
  await api.update('p1', { partySize: null, areaLabel: 'Chelsea', startsAt: undefined });
  await api.confirm('p1'); await api.cancel('p1'); await api.respond('p1', 'maybe');
  assert.deepEqual(calls, [
    ['get', { planId: 'p1' }], ['create', input], ['create', input], ['update', { planId: 'p1', partySize: null, areaLabel: 'Chelsea' }],
    ['confirm', { planId: 'p1' }], ['cancel', { planId: 'p1' }], ['respond', { planId: 'p1', response: 'maybe' }],
  ]);
});

test('Plan errors show app copy, passing through only known server messages', () => {
  const fallback = 'Fallback.';
  assert.equal(planErrorMessage(trpcError('BAD_REQUEST', 400, 'A Plan cannot start in the past.'), fallback), 'A Plan cannot start in the past.');
  assert.equal(planErrorMessage(trpcError('CONFLICT', 409, 'This Plan is full.'), fallback), 'This Plan is full.');
  assert.equal(planErrorMessage(trpcError('BAD_REQUEST', 400, 'select * from plans failed'), fallback), fallback);
  assert.equal(planErrorMessage(trpcError('INTERNAL_SERVER_ERROR', 500, 'This Plan is full. (stack)'), fallback), fallback);
  assert.equal(planErrorMessage(trpcError('NOT_FOUND', 404, 'Plan not found.'), fallback), "This plan isn't available anymore.");
  assert.equal(planErrorMessage(trpcError('UNAUTHORIZED', 401, 'jwt expired'), fallback), 'Sign in again to continue.');
  assert.match(planErrorMessage(trpcError('TOO_MANY_REQUESTS', 429, 'Slow down'), fallback), /Too many changes/);
  assert.match(planErrorMessage(new Error('Failed to fetch'), fallback), /couldn't connect/);
  assert.match(planErrorMessage(undefined, fallback), /couldn't connect/);
});

test('Only network, timeout, 429 and 5xx failures are safe to resend unchanged', () => {
  assert.equal(planErrorRetryable(new Error('Failed to fetch')), true);
  assert.equal(planErrorRetryable(trpcError('TOO_MANY_REQUESTS', 429, '')), true);
  assert.equal(planErrorRetryable(trpcError('INTERNAL_SERVER_ERROR', 500, '')), true);
  assert.equal(planErrorRetryable(trpcError('TIMEOUT', 408, '')), true);
  for (const [code, status] of [['BAD_REQUEST', 400], ['NOT_FOUND', 404], ['CONFLICT', 409], ['UNAUTHORIZED', 401]] as const) {
    assert.equal(planErrorRetryable(trpcError(code, status, '')), false);
  }
});

test('RPC list distinguishes empty from failed or malformed data', async () => {
  const client = { plans: { list: { query: async (): Promise<unknown> => ({ plans: [] }) } } } as PlansTransport;
  const api = createPlanApi(client);
  assert.deepEqual(await api.list(), []);
  client.plans.list.query = async () => ({ wrong: [] });
  await assert.rejects(api.list());
  client.plans.list.query = async () => { throw new Error('offline'); };
  await assert.rejects(api.list(), /offline/);
});
