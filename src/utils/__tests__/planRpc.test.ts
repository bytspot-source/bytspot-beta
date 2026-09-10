import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanApi, createPlanInput, emptyPlanDraft, parsePlan, planDraftError, PLAN_IDEAS, PLAN_NEEDS, PLAN_STEPS, type PlansTransport } from '../planRpc.ts';

const key = '62de4f5f-9440-4921-af86-e086289ac7e5';
const validDraft = () => ({ ...emptyPlanDraft(), title: ' Dinner ', intent: ' Meet friends ' });
const plan = () => ({ id: 'p1', title: 'Dinner', intent: 'Meet friends', creatorUserId: 'u1', state: 'proposed', startsAt: null, partySize: null, needs: ['dining'], openNeeds: ['dining'], readiness: { going: 1, maybe: 0, pending: 2 }, items: [] });

test('Plan creates trimmed intent, leaving undecided details absent', () => {
  assert.deepEqual(createPlanInput(validDraft(), key), { idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', needs: [] });
});

test('Plan normalizes optional date, group size and duplicate needs', () => {
  assert.deepEqual(createPlanInput({ ...validDraft(), startsAt: '2027-01-05T19:00:00Z', partySize: '4', needs: ['dining', 'dining'] }, key), {
    idempotencyKey: key, title: 'Dinner', intent: 'Meet friends', startsAt: '2027-01-05T19:00:00.000Z', partySize: 4, needs: ['dining'],
  });
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

test('Unknown states and malformed results fail closed rather than fabricate a plan', () => {
  for (const row of [null, {}, { ...plan(), state: 'guaranteed' }, { ...plan(), readiness: {} }, { ...plan(), startsAt: 'bad' }, { ...plan(), items: null }]) {
    assert.throws(() => parsePlan(row));
  }
});

test('RPC adapter sends only contracted paths/payloads and preserves retry key', async () => {
  const calls: unknown[] = [];
  const client: PlansTransport = { plans: {
    list: { query: async () => ({ plans: [plan()] }) },
    get: { query: async input => { calls.push(['get', input]); return plan(); } },
    create: { mutate: async input => { calls.push(['create', input]); return { id: 'p1' }; } },
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
  await api.confirm('p1'); await api.cancel('p1'); await api.respond('p1', 'maybe');
  assert.deepEqual(calls, [
    ['get', { planId: 'p1' }], ['create', input], ['create', input],
    ['confirm', { planId: 'p1' }], ['cancel', { planId: 'p1' }], ['respond', { planId: 'p1', response: 'maybe' }],
  ]);
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
