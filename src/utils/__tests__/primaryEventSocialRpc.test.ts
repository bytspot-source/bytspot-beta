import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NETWORK_SOCIAL_RPC_CONTRACT,
  addPersonToCircleViaRpc,
  createSocialCircleViaRpc,
  hasCircleMembership,
  listSocialCirclesViaRpc,
  listSocialInvitationsViaRpc,
  normalizeSocialCircles,
  normalizeSocialInvitations,
  respondToSocialInvitationViaRpc,
  sendSocialInvitationViaRpc,
} from '../primaryEventSocialRpc.ts';

test('Network contract contains only people, circles, and invitation routes', () => {
  assert.equal(NETWORK_SOCIAL_RPC_CONTRACT.routes.groupsList, 'social.groups.list');
  assert.equal(NETWORK_SOCIAL_RPC_CONTRACT.routes.groupsDelete, 'social.groups.delete');
  assert.equal(NETWORK_SOCIAL_RPC_CONTRACT.routes.groupsMembersAdd, 'social.groups.members.add');
  assert.equal(NETWORK_SOCIAL_RPC_CONTRACT.routes.invitesCreate, 'social.invites.create');
  assert.equal(NETWORK_SOCIAL_RPC_CONTRACT.routes.invitesCancel, 'social.invites.cancel');
  assert.deepEqual(NETWORK_SOCIAL_RPC_CONTRACT.flow, ['Find a Person', 'Add to Circle', 'Send Invite']);
  assert.equal('draftsCreate' in NETWORK_SOCIAL_RPC_CONTRACT.routes, false);
});

test('normalizers retain only circle membership and invitation identity', () => {
  const groups = normalizeSocialCircles({ groups: [{ groupId: 'g1', title: 'Weekend Crew', memberCount: 3, memberIds: ['u1'], role: 'owner' }] });
  const invites = normalizeSocialInvitations({ invites: [{ inviteId: 'i1', direction: 'incoming', status: 'pending', sender: { userId: 'u2', name: 'Nia' }, groupId: 'g1', groupName: 'Weekend Crew' }] });

  assert.equal(groups[0].name, 'Weekend Crew');
  assert.deepEqual(groups[0].memberIds, ['u1']);
  assert.equal(invites[0].person.name, 'Nia');
  assert.equal(invites[0].person.relationshipStatus, 'invite_received');
});

test('normalizers accept enum casing and membership uses either server source', () => {
  const invite = normalizeSocialInvitations({ invites: [{ id: 'i2', direction: 'INCOMING', status: 'ACCEPTED', sender: { userId: 'u2', name: 'Nia', relationshipStatus: 'CONNECTED' } }] })[0];
  const circle = { id: 'crew', name: 'Crew', memberCount: 1, memberIds: ['u1'], role: 'owner' as const };
  assert.equal(invite.direction, 'incoming');
  assert.equal(invite.status, 'accepted');
  assert.equal(invite.person.relationshipStatus, 'connected');
  assert.equal(hasCircleMembership({ userId: 'u1', circleIds: [] }, circle), true);
  assert.equal(hasCircleMembership({ userId: 'u2', circleIds: ['crew'] }, circle), true);
  assert.equal(hasCircleMembership({ userId: 'u3', circleIds: [] }, circle), false);
});

test('RPC helpers implement circle then invite without event payloads', async () => {
  const calls: unknown[] = [];
  const client = { social: {
    groups: {
      list: { query: async () => ({ groups: [{ id: 'g2', name: 'Crew', memberCount: 3 }] }) },
      create: { mutate: async (input: unknown) => { calls.push(input); return { id: 'g3', name: 'Work Friends', memberCount: 0, role: 'owner' }; } },
      members: { add: { mutate: async (input: unknown) => { calls.push(input); return { ok: true }; } } },
    },
    invites: {
      list: { query: async () => ({ invites: [{ id: 'i1', direction: 'outgoing', recipient: { userId: 'u1', name: 'Ama' } }] }) },
      create: { mutate: async (input: unknown) => { calls.push(input); return { id: 'i2', direction: 'outgoing', recipient: { userId: 'u1', name: 'Ama' }, groupId: 'g3' }; } },
      respond: { mutate: async (input: unknown) => { calls.push(input); return { ok: true }; } },
    },
  } };
  const groups = await listSocialCirclesViaRpc(client);
  const fallback = await listSocialCirclesViaRpc({}, [{ id: 'fb', name: 'Fallback Circle', memberCount: 1, memberIds: [], role: 'member' }]);
  const circle = await createSocialCircleViaRpc(client, 'Work Friends');
  await addPersonToCircleViaRpc(client, 'g3', 'u1');
  const invite = await sendSocialInvitationViaRpc(client, 'u1', 'g3');
  const invitations = await listSocialInvitationsViaRpc(client);
  await respondToSocialInvitationViaRpc(client, 'i1', 'accepted');

  assert.equal(groups.source, 'backend');
  assert.equal(fallback.source, 'fallback');
  assert.equal(circle?.name, 'Work Friends');
  assert.equal(invite?.circleId, 'g3');
  assert.equal(invitations[0].person.name, 'Ama');
  assert.equal(calls.length, 4);
});