export type RelationshipStatus = 'suggested' | 'connected' | 'invite_sent' | 'invite_received';
export type CircleRole = 'owner' | 'admin' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type InvitationDirection = 'incoming' | 'outgoing';

export interface SocialIdentity { userId: string; name: string; profileImage?: string; relationshipStatus: RelationshipStatus }
export interface SocialCircle { id: string; name: string; ownerUserId?: string; memberCount: number; memberIds: string[]; role: CircleRole }
export interface SocialInvitation { id: string; direction: InvitationDirection; status: InvitationStatus; person: SocialIdentity; circleId?: string; circleName?: string; createdAt?: string }

export const NETWORK_SOCIAL_RPC_CONTRACT = {
  routes: {
    groupsList: 'social.groups.list', groupsCreate: 'social.groups.create', groupsMembersAdd: 'social.groups.members.add', groupsMembersRemove: 'social.groups.members.remove',
    invitesCreate: 'social.invites.create', invitesList: 'social.invites.list', invitesRespond: 'social.invites.respond',
  },
  flow: ['Find a Person', 'Add to Circle', 'Send Invite'],
  circlePurpose: 'Circles save repeated people selection so a venue can be shared with a group instantly.',
} as const;

type AnyRecord = Record<string, unknown>;
type ProcedureLike = { query?: (input: unknown) => Promise<unknown>; mutate?: (input: unknown) => Promise<unknown> };
type SocialTrpcLike = { social?: { groups?: { list?: ProcedureLike; create?: ProcedureLike; members?: { add?: ProcedureLike; remove?: ProcedureLike } }; invites?: { create?: ProcedureLike; list?: ProcedureLike; respond?: ProcedureLike } } };
const isRecord = (value: unknown): value is AnyRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const rowsFrom = (response: unknown, keys: string[]): unknown[] => { if (Array.isArray(response)) return response; const root = isRecord(response) ? response : {}; for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]; return []; };
async function call(procedure: ProcedureLike | undefined, input: unknown): Promise<unknown> { if (procedure?.query) return procedure.query(input); if (procedure?.mutate) return procedure.mutate(input); throw new Error('Social procedure is unavailable'); }

export function normalizeSocialIdentity(value: unknown, fallbackStatus: RelationshipStatus = 'suggested'): SocialIdentity | null {
  if (!isRecord(value)) return null;
  const userId = clean(value.userId ?? value.id);
  if (!userId) return null;
  const rawStatus = clean(value.relationshipStatus ?? value.relationship);
  const relationshipStatus = ['suggested', 'connected', 'invite_sent', 'invite_received'].includes(rawStatus ?? '') ? rawStatus as RelationshipStatus : fallbackStatus;
  return { userId, name: clean(value.name ?? value.displayName) ?? 'Bytspot member', ...(clean(value.profileImage ?? value.avatarUrl) ? { profileImage: clean(value.profileImage ?? value.avatarUrl)! } : {}), relationshipStatus };
}

export function normalizeSocialCircle(value: unknown): SocialCircle | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.groupId);
  const name = clean(value.name ?? value.title);
  if (!id || !name) return null;
  const memberIds = Array.isArray(value.memberIds) ? value.memberIds.map(String).filter(Boolean) : [];
  const rawRole = clean(value.role);
  return { id, name, ...(clean(value.ownerUserId) ? { ownerUserId: clean(value.ownerUserId)! } : {}), memberCount: Math.max(0, Number(value.memberCount ?? value.membersCount ?? memberIds.length) || 0), memberIds, role: rawRole === 'owner' || rawRole === 'admin' ? rawRole : 'member' };
}

export function normalizeSocialInvitation(value: unknown): SocialInvitation | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.inviteId);
  const direction: InvitationDirection = clean(value.direction) === 'incoming' || value.incoming === true ? 'incoming' : 'outgoing';
  const personValue = isRecord(value.person) ? value.person : direction === 'incoming' && isRecord(value.sender) ? value.sender : isRecord(value.recipient) ? value.recipient : value;
  const person = normalizeSocialIdentity(personValue, direction === 'incoming' ? 'invite_received' : 'invite_sent');
  if (!id || !person) return null;
  const rawStatus = clean(value.status);
  const status: InvitationStatus = ['accepted', 'declined', 'expired'].includes(rawStatus ?? '') ? rawStatus as InvitationStatus : 'pending';
  return { id, direction, status, person, ...(clean(value.groupId ?? value.circleId) ? { circleId: clean(value.groupId ?? value.circleId)! } : {}), ...(clean(value.groupName ?? value.circleName) ? { circleName: clean(value.groupName ?? value.circleName)! } : {}), ...(clean(value.createdAt) ? { createdAt: clean(value.createdAt)! } : {}) };
}

export const normalizeSocialCircles = (response: unknown): SocialCircle[] => rowsFrom(response, ['groups', 'circles', 'items']).map(normalizeSocialCircle).filter((row): row is SocialCircle => Boolean(row));
export const normalizeSocialInvitations = (response: unknown): SocialInvitation[] => rowsFrom(response, ['invites', 'invitations', 'items']).map(normalizeSocialInvitation).filter((row): row is SocialInvitation => Boolean(row));

export async function listSocialCirclesViaRpc(trpcClient: SocialTrpcLike, fallback: SocialCircle[] = []) { try { return { source: 'backend' as const, groups: normalizeSocialCircles(await call(trpcClient.social?.groups?.list, { surface: 'network' })) }; } catch { return { source: 'fallback' as const, groups: fallback }; } }
export async function createSocialCircleViaRpc(trpcClient: SocialTrpcLike, name: string) { const response = await call(trpcClient.social?.groups?.create, { name: name.trim(), privacy: 'private', surface: 'network' }); return normalizeSocialCircle(response) ?? normalizeSocialCircles(response)[0] ?? null; }
export async function addPersonToCircleViaRpc(trpcClient: SocialTrpcLike, circleId: string, userId: string) { await call(trpcClient.social?.groups?.members?.add, { groupId: circleId, userId, surface: 'network' }); return true; }
export async function listSocialInvitationsViaRpc(trpcClient: SocialTrpcLike) { return normalizeSocialInvitations(await call(trpcClient.social?.invites?.list, { surface: 'network' })); }
export async function sendSocialInvitationViaRpc(trpcClient: SocialTrpcLike, userId: string, circleId?: string) { const response = await call(trpcClient.social?.invites?.create, { targetType: 'user', targetValue: userId, ...(circleId ? { groupId: circleId } : {}), surface: 'network' }); return normalizeSocialInvitation(response) ?? normalizeSocialInvitations(response)[0] ?? null; }
export async function respondToSocialInvitationViaRpc(trpcClient: SocialTrpcLike, inviteId: string, response: 'accepted' | 'declined') { await call(trpcClient.social?.invites?.respond, { inviteId, response, surface: 'network' }); return true; }