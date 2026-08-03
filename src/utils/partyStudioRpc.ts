import type { BytspotPatchTier } from './patchTiers.ts';

export type PartyTemplateId = 'listening-party' | 'comedy-night' | 'premiere' | 'private-party' | 'fan-meetup';
export type PartyAccessMode = 'free-rsvp' | 'paid-ticket' | 'private-approval';
export type PartyHostRole = 'owner' | 'cohost' | 'door' | 'finance';
export type PartyCapability = 'edit' | 'invite' | 'check-in' | 'refund' | 'payouts';

export interface PartyTemplate {
  id: PartyTemplateId;
  name: string;
  hook: string;
  emoji: string;
  accent: string;
  defaultItinerary: string[];
}

export const PARTY_TEMPLATES: readonly PartyTemplate[] = [
  { id: 'listening-party', name: 'Listening Party', hook: 'Drop the sound before everyone else.', emoji: '🎧', accent: 'from-fuchsia-600 to-violet-950', defaultItinerary: ['Doors open', 'First listen', 'Artist Q&A'] },
  { id: 'comedy-night', name: 'Comedy Night', hook: 'Turn a room into an inside joke.', emoji: '🎤', accent: 'from-amber-500 to-rose-950', defaultItinerary: ['Doors open', 'Warm-up set', 'Headliner'] },
  { id: 'premiere', name: 'Premiere', hook: 'Make the first watch feel legendary.', emoji: '🎬', accent: 'from-cyan-500 to-blue-950', defaultItinerary: ['Arrivals', 'Screening', 'Cast conversation'] },
  { id: 'private-party', name: 'Private Party', hook: 'One room. Your people. No noise.', emoji: '🪩', accent: 'from-emerald-500 to-slate-950', defaultItinerary: ['Guest arrival', 'Main moment', 'After-hours'] },
  { id: 'fan-meetup', name: 'Fan Meetup', hook: 'Turn followers into a real community.', emoji: '⚡️', accent: 'from-purple-500 to-indigo-950', defaultItinerary: ['Meet the community', 'Creator moment', 'Group photo'] },
] as const;

export const PARTY_ROLE_CAPABILITIES: Record<PartyHostRole, readonly PartyCapability[]> = {
  owner: ['edit', 'invite', 'check-in', 'refund', 'payouts'],
  cohost: ['edit', 'invite', 'check-in'],
  door: ['check-in'],
  finance: ['refund', 'payouts'],
};

export interface PartyItineraryItem { title: string; offsetMinutes: number }
export interface PartyTicketTier { name: string; priceCents: number; quantity: number; requiredMembershipTier: BytspotPatchTier }
export interface PartyHostAssignment { email: string; role: Exclude<PartyHostRole, 'owner'> }

export interface PartyDraftInput {
  templateId: PartyTemplateId;
  title: string;
  tagline: string;
  startsAt: string;
  venueName: string;
  capacity: number;
  accessMode: PartyAccessMode;
  requiredMembershipTier: BytspotPatchTier;
  audienceCircleIds: string[];
  itinerary: PartyItineraryItem[];
  ticketTiers: PartyTicketTier[];
  cohosts: PartyHostAssignment[];
}

export interface PublishedParty extends PartyDraftInput {
  id: string;
  status: 'published';
  shareUrl: string;
  passCode: string;
}

export const PARTY_STUDIO_RPC_CONTRACT = {
  createDraft: 'events.drafts.create',
  publish: 'events.publish',
  rsvp: 'events.rsvp.create',
  ticketCheckout: 'events.tickets.createCheckout',
  itinerary: 'events.itinerary.upsert',
  assignRole: 'events.roles.assign',
  attachAudience: 'events.audiences.attach',
} as const;

type Mutation = { mutate(input: unknown): Promise<unknown> };
export type PartyStudioTrpcLike = {
  events?: {
    drafts?: { create?: Mutation };
    publish?: Mutation;
  };
};

function objectRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  if (row.party && typeof row.party === 'object') return row.party as Record<string, unknown>;
  if (row.data && typeof row.data === 'object') return objectRow(row.data);
  return row;
}

export function canManageParty(role: PartyHostRole, capability: PartyCapability): boolean {
  return PARTY_ROLE_CAPABILITIES[role].includes(capability);
}

export function validatePartyDraft(input: PartyDraftInput): string[] {
  const errors: string[] = [];
  if (!PARTY_TEMPLATES.some((template) => template.id === input.templateId)) errors.push('Choose a party template.');
  if (input.title.trim().length < 3) errors.push('Add a party title.');
  if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) errors.push('Choose a valid date and time.');
  if (!input.venueName.trim()) errors.push('Add a venue.');
  if (!Number.isInteger(input.capacity) || input.capacity < 2) errors.push('Capacity must be at least 2.');
  if (input.accessMode === 'paid-ticket' && !input.ticketTiers.some((ticket) => ticket.priceCents > 0)) errors.push('Paid parties need a ticket price.');
  if (input.accessMode !== 'paid-ticket' && input.ticketTiers.some((ticket) => ticket.priceCents > 0)) errors.push('Only paid parties can include paid tickets.');
  return errors;
}

export async function createAndPublishPartyViaRpc(trpc: PartyStudioTrpcLike, input: PartyDraftInput): Promise<PublishedParty> {
  const errors = validatePartyDraft(input);
  if (errors.length) throw new Error(errors[0]);
  const create = trpc.events?.drafts?.create?.mutate;
  const publish = trpc.events?.publish?.mutate;
  if (!create || !publish) throw new Error('Host Studio publishing is unavailable.');

  const created = objectRow(await create({ ...input, source: 'host-studio' }));
  const partyId = String(created.id ?? created.partyId ?? '');
  if (!partyId) throw new Error('The party draft was not returned.');
  const published = objectRow(await publish({ partyId }));
  const id = String(published.id ?? published.partyId ?? partyId);
  const shareUrl = String(published.shareUrl ?? published.url ?? '');
  const passCode = String(published.passCode ?? published.accessCode ?? '');
  if (!shareUrl || !passCode) throw new Error('The Party Pass was not returned.');
  return { ...input, id, status: 'published', shareUrl, passCode };
}