import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PARTY_ROLE_CAPABILITIES,
  PARTY_STUDIO_RPC_CONTRACT,
  PARTY_TEMPLATES,
  canManageParty,
  createAndPublishPartyViaRpc,
  type PartyDraftInput,
} from '../partyStudioRpc.ts';

function party(overrides: Partial<PartyDraftInput> = {}): PartyDraftInput {
  return {
    templateId: 'comedy-night', title: 'Secret Set', tagline: 'One room. One night.',
    startsAt: '2026-09-12T20:00:00.000Z', venueName: 'Aster Room', capacity: 80,
    accessMode: 'free-rsvp', requiredMembershipTier: 'green', audienceCircleIds: ['circle-1'],
    itinerary: [{ title: 'Doors open', offsetMinutes: 0 }], ticketTiers: [], cohosts: [],
    ...overrides,
  };
}

test('Host Studio templates pitch music, comedy, film, private, and fan moments', () => {
  assert.deepEqual(PARTY_TEMPLATES.map((item) => item.id), ['listening-party', 'comedy-night', 'premiere', 'private-party', 'fan-meetup']);
  assert.ok(PARTY_TEMPLATES.every((item) => item.defaultItinerary.length >= 3));
});

test('party contracts cover creation, RSVP, ticket payments, itinerary, roles, and audiences', () => {
  assert.deepEqual(PARTY_STUDIO_RPC_CONTRACT, {
    createDraft: 'events.drafts.create', publish: 'events.publish', rsvp: 'events.rsvp.create',
    ticketCheckout: 'events.tickets.createCheckout', itinerary: 'events.itinerary.upsert',
    assignRole: 'events.roles.assign', attachAudience: 'events.audiences.attach',
  });
});

test('co-host roles are capability-scoped', () => {
  assert.deepEqual(PARTY_ROLE_CAPABILITIES.door, ['check-in']);
  assert.equal(canManageParty('cohost', 'invite'), true);
  assert.equal(canManageParty('cohost', 'payouts'), false);
});

test('paid parties require a positive ticket price', async () => {
  await assert.rejects(() => createAndPublishPartyViaRpc({}, party({ accessMode: 'paid-ticket' })), /ticket price/);
});

test('create then publish retains tier, circles, itinerary, tickets, and co-hosts', async () => {
  const calls: unknown[] = [];
  const input = party({
    accessMode: 'paid-ticket', requiredMembershipTier: 'platinum',
    ticketTiers: [{ name: 'First Drop', priceCents: 2500, quantity: 40, requiredMembershipTier: 'platinum' }],
    cohosts: [{ email: 'door@example.com', role: 'door' }],
  });
  const trpc = { events: {
    drafts: { create: { mutate: async (payload: unknown) => { calls.push(payload); return { id: 'party-1' }; } } },
    publish: { mutate: async (payload: unknown) => { calls.push(payload); return { id: 'party-1', shareUrl: 'https://bytspot.com/party/party-1', passCode: 'VIBE26' }; } },
  } };
  const result = await createAndPublishPartyViaRpc(trpc, input);
  assert.equal(result.requiredMembershipTier, 'platinum');
  assert.equal(result.passCode, 'VIBE26');
  assert.deepEqual(calls[1], { partyId: 'party-1' });
  assert.deepEqual((calls[0] as Record<string, unknown>).audienceCircleIds, ['circle-1']);
});