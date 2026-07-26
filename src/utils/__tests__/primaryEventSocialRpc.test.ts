import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIMARY_EVENT_SOCIAL_RPC_CONTRACT,
  buildPrimaryEventDraftInput,
  capacityForTier,
  createPrimaryEventDraftViaRpc,
  listSocialCirclesViaRpc,
  normalizeEventDrafts,
  normalizeSocialCircles,
} from '../primaryEventSocialRpc.ts';

test('primary event social contract extends existing Network card routes', () => {
  assert.equal(PRIMARY_EVENT_SOCIAL_RPC_CONTRACT.routes.groupsList, 'social.groups.list');
  assert.equal(PRIMARY_EVENT_SOCIAL_RPC_CONTRACT.routes.invitesCreate, 'social.invites.create');
  assert.equal(PRIMARY_EVENT_SOCIAL_RPC_CONTRACT.routes.draftsCreate, 'events.drafts.create');
  assert.equal(PRIMARY_EVENT_SOCIAL_RPC_CONTRACT.routes.publish, 'events.publish');
  assert.equal(PRIMARY_EVENT_SOCIAL_RPC_CONTRACT.manualPaymentVerification, 'manual_unverified');
});

test('capacityForTier locks host spot limits by Bytspot tier', () => {
  assert.equal(capacityForTier('green'), 5);
  assert.equal(capacityForTier('platinum'), 25);
  assert.equal(capacityForTier('black'), 100);
});

test('buildPrimaryEventDraftInput clamps capacity and marks manual payments unverified', () => {
  const draft = buildPrimaryEventDraftInput({
    id: 'draft-1', title: 'Private Dinner', visibility: 'private', hostName: 'Ama', tier: 'green', capacityLimit: 999,
    audienceGroupIds: ['family'], invitedUserIds: [], fontStyle: 'serif-luxe', coHosts: [], media: {}, playlistUrl: 'https://music.example/playlist',
    paymentLinks: [{ method: 'venmo', label: 'Venmo Ama', url: 'https://venmo.example/ama', verification: 'manual_unverified' }],
    rsvp: { requireGuestApproval: true, hideActivityTimestamps: true, hideGuestList: true, customQuestions: ['Any allergies?'], remindersEnabled: true },
    metadata: { links: ['https://example.com'], dressCode: 'All black', parking: 'Use rear garage' },
  });

  assert.equal(draft.capacityLimit, 5);
  assert.equal(draft.paymentLinks[0].verification, 'manual_unverified');
  assert.equal(draft.rsvp.hideGuestList, true);
});

test('normalizers accept social circles and rich event drafts', () => {
  const groups = normalizeSocialCircles({ groups: [{ groupId: 'g1', title: 'Close Friends', memberCount: 8, privacy: 'private', role: 'owner' }] });
  const drafts = normalizeEventDrafts({ drafts: [{ eventId: 'e1', title: 'Listening Party', visibility: 'public', tier: 'platinum', capacityLimit: 40, hostName: 'DJ Kojo', coHosts: [{ name: 'DJ Kojo', role: 'dj' }], rsvp: { hideGuestList: true }, metadata: { foodSituation: 'Small bites' } }] });

  assert.equal(groups[0].name, 'Close Friends');
  assert.equal(drafts[0].capacityLimit, 25);
  assert.equal(drafts[0].coHosts[0].role, 'dj');
  assert.equal(drafts[0].metadata.foodSituation, 'Small bites');
});

test('RPC helpers prefer backend and safely fall back', async () => {
  const groups = await listSocialCirclesViaRpc({ social: { groups: { list: { query: async () => ({ groups: [{ id: 'g2', name: 'Crew', memberCount: 3 }] }) } } } });
  const fallback = await listSocialCirclesViaRpc({}, [{ id: 'fb', name: 'Fallback Circle', memberCount: 1, privacy: 'invite_only' }]);
  const draft = buildPrimaryEventDraftInput({ id: 'e2', title: 'Brunch', visibility: 'private', hostName: 'Nia', tier: 'green', audienceGroupIds: [], invitedUserIds: [], fontStyle: 'bytspot-rounded', coHosts: [], media: {}, paymentLinks: [], rsvp: { requireGuestApproval: false, hideActivityTimestamps: false, hideGuestList: false, customQuestions: [], remindersEnabled: true }, metadata: { links: [] } });
  const created = await createPrimaryEventDraftViaRpc({ events: { drafts: { create: { mutate: async () => ({ draftId: 'e2', title: 'Brunch', tier: 'green', hostName: 'Nia' }) } } } }, draft);

  assert.equal(groups.source, 'backend');
  assert.equal(fallback.source, 'fallback');
  assert.equal(created.drafts[0].id, 'e2');
});