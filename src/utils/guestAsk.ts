import type { VendorAsk } from './mockData/discover.ts';

/**
 * A guest asking one vendor window for a time, from its Discover card.
 *
 * The API owns every rule; these checks only stop a request it would refuse
 * from leaving the phone. The client is passed in so the flow can be exercised
 * without a network.
 */

export interface AskDraft {
  partySize: number;
  startsAt: string;
  note?: string;
}

export interface AskOffer {
  id: string;
  where: string;
  startsAt: string;
  durationMins: number;
  priceCents: number;
  terms?: string;
  holdExpiresAt: string;
  accepted: boolean;
}

export interface AskStatus {
  id: string;
  state: string;
  expiresAt: string;
  offers: AskOffer[];
}

/** The slice of the tRPC client the flow uses. */
export interface AskClient {
  demand: {
    ask: { mutate: (input: { windowId: string; partySize: number; startsAt: string; note?: string }) => Promise<{ id: string; state: string; expiresAt: string }> };
    mine: { query: () => Promise<AskStatus[]> };
    acceptOffer: { mutate: (input: { offerId: string }) => Promise<unknown> };
    withdraw: { mutate: (input: { demandId: string }) => Promise<unknown> };
  };
}

export function askProblems(ask: VendorAsk, draft: AskDraft): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(draft.partySize) || draft.partySize < 1) problems.push('How many are coming?');
  else if (draft.partySize > ask.maxGuests) problems.push(`This takes up to ${ask.maxGuests} guests`);
  const slot = ask.slots.find((candidate) => candidate.startsAt === draft.startsAt);
  if (!slot) problems.push('Pick a time');
  else if (slot.remaining < draft.partySize) problems.push('Not enough room at that time');
  if ((draft.note ?? '').trim().length > 280) problems.push('Keep the note under 280 characters');
  return problems;
}

/** What the guest reads when the API says no. Signed-out is the common case. */
export function askErrorMessage(error: unknown): string {
  const shaped = error as { data?: { code?: string }; message?: string } | undefined;
  if (shaped?.data?.code === 'UNAUTHORIZED') return 'Sign in to send a request';
  if (shaped?.data?.code === 'TOO_MANY_REQUESTS') return 'Too many requests. Try again in a bit';
  return shaped?.message?.trim() || 'That did not send. Try again';
}

/** An ask is finished once it is booked, expired or withdrawn. */
export function askIsLive(status: AskStatus | undefined): boolean {
  return !!status && ['OPEN', 'MATCHED', 'OFFERED'].includes(status.state);
}

export function askTransport(client: AskClient) {
  return {
    send: (ask: VendorAsk, draft: AskDraft) =>
      client.demand.ask.mutate({
        windowId: ask.windowId,
        partySize: draft.partySize,
        startsAt: draft.startsAt,
        ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
      }),
    /** Undefined once the ask has left the guest's list (expired or finished). */
    read: async (demandId: string): Promise<AskStatus | undefined> =>
      (await client.demand.mine.query()).find((row) => row.id === demandId),
    accept: (offerId: string) => client.demand.acceptOffer.mutate({ offerId }),
    withdraw: (demandId: string) => client.demand.withdraw.mutate({ demandId }),
  };
}

export function formatSlotLabel(startsAt: string, now: Date = new Date()): string {
  const at = new Date(startsAt);
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = at.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000).toDateString() === at.toDateString();
  if (sameDay) return `Today ${time}`;
  if (tomorrow) return `Tomorrow ${time}`;
  return `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}
