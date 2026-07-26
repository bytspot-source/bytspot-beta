export type PrimaryEventVisibility = 'public' | 'private';
export type PrimaryEventTier = 'green' | 'platinum' | 'black';
export type RSVPResponse = 'going' | 'maybe' | 'cant_go';
export type ManualPaymentMethod = 'venmo' | 'cash_app' | 'paypal' | 'custom';

export interface SocialCircle { id: string; name: string; ownerUserId?: string; memberCount: number; privacy: 'private' | 'invite_only'; role?: 'owner' | 'admin' | 'member' }
export interface SocialInvite { id: string; targetType: 'user' | 'phone' | 'email' | 'link'; targetValue?: string; status: 'pending' | 'accepted' | 'declined' | 'expired'; groupId?: string; eventId?: string; expiresAt?: string }
export interface EventCoHost { id?: string; name: string; role: 'vendor' | 'dj' | 'artist' | 'host' | 'other' }
export interface EventMedia { thumbnailUrl?: string; imageUrls?: string[]; videoUrls?: string[] }
export interface ManualPaymentLink { method: ManualPaymentMethod; label: string; url: string; note?: string; verification: 'manual_unverified' }
export interface EventRSVPSettings { cutoffAt?: string; requireGuestApproval: boolean; hideActivityTimestamps: boolean; hideGuestList: boolean; customQuestions: string[]; remindersEnabled: boolean }
export interface EventCustomMetadata { links: string[]; registry?: string; dressCode?: string; foodSituation?: string; parking?: string; accommodation?: string; notes?: string; icon?: string }

export interface PrimaryEventDraft {
  id: string;
  title: string;
  visibility: PrimaryEventVisibility;
  hostName: string;
  hostNickname?: string;
  coHosts: EventCoHost[];
  tier: PrimaryEventTier;
  capacityLimit: number;
  audienceGroupIds: string[];
  invitedUserIds: string[];
  fontStyle: string;
  media: EventMedia;
  playlistUrl?: string;
  dateTimeLabel?: string;
  locationLabel?: string;
  ticketingLabel?: string;
  chipInLabel?: string;
  paymentLinks: ManualPaymentLink[];
  rsvp: EventRSVPSettings;
  metadata: EventCustomMetadata;
}

export const PRIMARY_EVENT_SOCIAL_RPC_CONTRACT = {
  routes: {
    groupsList: 'social.groups.list', groupsCreate: 'social.groups.create', groupsUpdate: 'social.groups.update', groupsMembersAdd: 'social.groups.members.add', groupsMembersRemove: 'social.groups.members.remove',
    invitesCreate: 'social.invites.create', invitesList: 'social.invites.list', invitesRespond: 'social.invites.respond',
    draftsCreate: 'events.drafts.create', draftsUpdate: 'events.drafts.update', publish: 'events.publish', rsvpRespond: 'events.rsvp.respond', rsvpList: 'events.rsvp.list',
  },
  manualPaymentVerification: 'manual_unverified',
  note: 'Extends the existing Profile Network card; backend owns social graph/event distribution while manual payments remain unverified metadata in this phase.',
} as const;

type AnyRecord = Record<string, unknown>;
type ProcedureLike<TInput, TOutput> = { query?: (input: TInput) => Promise<TOutput>; mutate?: (input: TInput) => Promise<TOutput> };
type PrimarySocialTrpcLike = { social?: { groups?: { list?: ProcedureLike<unknown, unknown>; create?: ProcedureLike<unknown, unknown> }; invites?: { create?: ProcedureLike<unknown, unknown>; list?: ProcedureLike<unknown, unknown>; respond?: ProcedureLike<unknown, unknown> } }; events?: { drafts?: { create?: ProcedureLike<unknown, unknown>; update?: ProcedureLike<unknown, unknown> }; publish?: ProcedureLike<unknown, unknown>; rsvp?: { respond?: ProcedureLike<unknown, unknown>; list?: ProcedureLike<unknown, unknown> } } };

const TIER_CAPACITY: Record<PrimaryEventTier, number> = { green: 5, platinum: 25, black: 100 };
const isRecord = (value: unknown): value is AnyRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const rowsFrom = (response: unknown, keys: string[]): unknown[] => { if (Array.isArray(response)) return response; const root = isRecord(response) ? response : {}; for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]; return []; };
async function call<TInput>(procedure: ProcedureLike<TInput, unknown> | undefined, input: TInput): Promise<unknown> { return procedure?.query ? procedure.query(input) : procedure?.mutate?.(input); }

export function capacityForTier(tier: PrimaryEventTier): number { return TIER_CAPACITY[tier] ?? TIER_CAPACITY.green; }

export function normalizeSocialCircle(value: unknown): SocialCircle | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.groupId);
  const name = clean(value.name ?? value.title);
  if (!id || !name) return null;
  return { id, name, ...(clean(value.ownerUserId) ? { ownerUserId: clean(value.ownerUserId)! } : {}), memberCount: Number(value.memberCount ?? value.membersCount ?? 0), privacy: value.privacy === 'private' ? 'private' : 'invite_only', role: (clean(value.role) as SocialCircle['role']) ?? 'member' };
}

export function normalizeEventDraft(value: unknown): PrimaryEventDraft | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.eventId ?? value.draftId);
  const title = clean(value.title);
  if (!id || !title) return null;
  const tier = (clean(value.tier) as PrimaryEventTier) ?? 'green';
  const rsvp = isRecord(value.rsvp) ? value.rsvp : {};
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  return buildPrimaryEventDraftInput({
    id, title, tier, visibility: value.visibility === 'public' ? 'public' : 'private',
    hostName: clean(value.hostName) ?? 'Bytspot Member',
    capacityLimit: Number(value.capacityLimit ?? capacityForTier(tier)),
    audienceGroupIds: Array.isArray(value.audienceGroupIds) ? value.audienceGroupIds.map(String) : [],
    invitedUserIds: Array.isArray(value.invitedUserIds) ? value.invitedUserIds.map(String) : [],
    fontStyle: clean(value.fontStyle) ?? 'bytspot-rounded',
    coHosts: Array.isArray(value.coHosts) ? value.coHosts.filter(isRecord).map((row) => ({ name: clean(row.name) ?? 'Co-host', role: (clean(row.role) as EventCoHost['role']) ?? 'other' })) : [],
    media: isRecord(value.media) ? value.media as EventMedia : {},
    playlistUrl: clean(value.playlistUrl), dateTimeLabel: clean(value.dateTimeLabel), locationLabel: clean(value.locationLabel),
    ticketingLabel: clean(value.ticketingLabel), chipInLabel: clean(value.chipInLabel),
    paymentLinks: Array.isArray(value.paymentLinks) ? value.paymentLinks.filter(isRecord).map(normalizeManualPaymentLink).filter((row): row is ManualPaymentLink => Boolean(row)) : [],
    rsvp: { cutoffAt: clean(rsvp.cutoffAt), requireGuestApproval: Boolean(rsvp.requireGuestApproval), hideActivityTimestamps: Boolean(rsvp.hideActivityTimestamps), hideGuestList: Boolean(rsvp.hideGuestList), customQuestions: Array.isArray(rsvp.customQuestions) ? rsvp.customQuestions.map(String) : [], remindersEnabled: rsvp.remindersEnabled !== false },
    metadata: { links: Array.isArray(metadata.links) ? metadata.links.map(String) : [], registry: clean(metadata.registry), dressCode: clean(metadata.dressCode), foodSituation: clean(metadata.foodSituation), parking: clean(metadata.parking), accommodation: clean(metadata.accommodation), notes: clean(metadata.notes), icon: clean(metadata.icon) },
  });
}

export function normalizeManualPaymentLink(value: unknown): ManualPaymentLink | null {
  if (!isRecord(value)) return null;
  const url = clean(value.url);
  if (!url) return null;
  return { method: (clean(value.method) as ManualPaymentMethod) ?? 'custom', label: clean(value.label) ?? 'Manual payment', url, ...(clean(value.note) ? { note: clean(value.note)! } : {}), verification: 'manual_unverified' };
}

export function buildPrimaryEventDraftInput(input: Omit<PrimaryEventDraft, 'capacityLimit'> & { capacityLimit?: number }): PrimaryEventDraft {
  const tier = input.tier ?? 'green';
  const capacityLimit = Math.min(Math.max(1, Math.floor(input.capacityLimit ?? capacityForTier(tier))), capacityForTier(tier));
  return { ...input, tier, capacityLimit, visibility: input.visibility ?? 'private', fontStyle: input.fontStyle || 'bytspot-rounded', coHosts: input.coHosts ?? [], audienceGroupIds: input.audienceGroupIds ?? [], invitedUserIds: input.invitedUserIds ?? [], media: input.media ?? {}, paymentLinks: (input.paymentLinks ?? []).map((link) => ({ ...link, verification: 'manual_unverified' })), rsvp: { remindersEnabled: true, customQuestions: [], requireGuestApproval: false, hideActivityTimestamps: false, hideGuestList: false, ...input.rsvp }, metadata: { links: [], ...input.metadata } };
}

export const normalizeSocialCircles = (response: unknown): SocialCircle[] => rowsFrom(response, ['groups', 'circles', 'items']).map(normalizeSocialCircle).filter((row): row is SocialCircle => Boolean(row));
export const normalizeEventDrafts = (response: unknown): PrimaryEventDraft[] => (isRecord(response) && (response.draftId || response.eventId || response.id) && !Array.isArray(response.drafts) ? [response] : rowsFrom(response, ['drafts', 'events', 'items'])).map(normalizeEventDraft).filter((row): row is PrimaryEventDraft => Boolean(row));

export async function listSocialCirclesViaRpc(trpcClient: PrimarySocialTrpcLike, fallback: SocialCircle[] = []) { try { const groups = normalizeSocialCircles(await call(trpcClient.social?.groups?.list, { surface: 'profile_network_card' })); if (groups.length) return { source: 'backend' as const, groups }; } catch {} return { source: 'fallback' as const, groups: fallback }; }
export async function createPrimaryEventDraftViaRpc(trpcClient: PrimarySocialTrpcLike, input: PrimaryEventDraft, fallback: PrimaryEventDraft[] = []) { try { const drafts = normalizeEventDrafts(await call(trpcClient.events?.drafts?.create, { ...input, surface: 'profile_network_card' })); if (drafts.length) return { source: 'backend' as const, drafts }; } catch {} return { source: 'fallback' as const, drafts: fallback }; }
export async function publishPrimaryEventViaRpc(trpcClient: PrimarySocialTrpcLike, input: { eventId: string; visibility: PrimaryEventVisibility }, fallback: PrimaryEventDraft[] = []) { try { const drafts = normalizeEventDrafts(await call(trpcClient.events?.publish, { ...input, surface: 'profile_network_card' })); if (drafts.length) return { source: 'backend' as const, drafts }; } catch {} return { source: 'fallback' as const, drafts: fallback }; }