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
  /** Absent from an older API, which only knew paying at the venue. */
  payAt?: 'venue' | 'bytspot';
  payment?: { state: 'paying' | 'paid' | 'refunded'; reason?: string };
}

export interface AskStatus {
  id: string;
  state: string;
  expiresAt: string;
  offers: AskOffer[];
  partySize?: number;
  earliest?: string;
  targetWindowId?: string;
  askedOf?: { sellerName: string; place: string };
}

/** The slice of the tRPC client the flow uses. */
export interface AskClient {
  demand: {
    ask: { mutate: (input: { windowId: string; partySize: number; startsAt: string; note?: string }) => Promise<{ id: string; state: string; expiresAt: string }> };
    mine: { query: () => Promise<AskStatus[]> };
    acceptOffer: { mutate: (input: { offerId: string }) => Promise<unknown> };
    payOffer: { mutate: (input: { offerId: string }) => Promise<{ url: string }> };
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
  // No tRPC code means the request never reached the API.
  if (!shaped?.data?.code && /failed to fetch|network|load failed/i.test(shaped?.message ?? '')) {
    return 'You look offline. Try again';
  }
  return shaped?.message?.trim() || 'That did not send. Try again';
}

/** An ask is finished once it is booked, expired or withdrawn. */
export function askIsLive(status: AskStatus | undefined): boolean {
  return !!status && ['OPEN', 'MATCHED', 'OFFERED'].includes(status.state);
}

/** The guest's open ask on this window, so reopening its card resumes it rather than asking twice. */
export function liveAskFor(rows: AskStatus[], windowId: string): AskStatus | undefined {
  return rows.find((row) => row.targetWindowId === windowId && askIsLive(row));
}

/** One line on where a request stands, for the guest's list. */
export function askStateLabel(status: AskStatus): string {
  if (status.state === 'BOOKED') return 'Booked';
  if (status.offers.some((offer) => offer.payment?.state === 'paying')) return 'Confirming payment';
  const waiting = status.offers.filter((offer) => !offer.accepted).length;
  if (waiting > 0) return waiting === 1 ? '1 offer to answer' : `${waiting} offers to answer`;
  if (askIsLive(status)) return 'Waiting for an answer';
  return 'Closed';
}

/** Offers the guest has been told about, so each one is announced once. */
export const SEEN_OFFERS_KEY = 'bytspot_seen_offers';

/** Offers on live requests that are waiting on the guest and not yet announced. */
export function unseenOffers(rows: AskStatus[], seen: ReadonlySet<string>): { row: AskStatus; offer: AskOffer }[] {
  return rows
    .filter(askIsLive)
    .flatMap((row) => row.offers.filter((offer) => !offer.accepted && !seen.has(offer.id)).map((offer) => ({ row, offer })));
}

/**
 * What the guest can do with one offer.
 *
 * An offer paid in the app is booked by paying for it, never by Accept: the
 * API refuses that. Paying again while a checkout is open resumes it.
 */
export function offerAction(offer: AskOffer): { kind: 'accept' | 'pay' | 'none'; label: string } {
  if (offer.accepted) return { kind: 'none', label: '' };
  if (offer.payAt !== 'bytspot') return { kind: 'accept', label: 'Accept' };
  if (offer.payment?.state === 'paying') return { kind: 'pay', label: 'Finish paying' };
  return { kind: 'pay', label: `Pay $${(offer.priceCents / 100).toFixed(2)}` };
}

/** Where Stripe sent the guest back, if it did. */
export function offerCheckoutReturn(search: string): { outcome: 'paid' | 'cancelled'; demandId?: string } | undefined {
  const query = new URLSearchParams(search);
  const checkout = query.get('checkout');
  if (checkout !== 'offer-paid' && checkout !== 'offer-cancelled') return undefined;
  return { outcome: checkout === 'offer-paid' ? 'paid' : 'cancelled', demandId: query.get('demand') ?? undefined };
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
    list: () => client.demand.mine.query(),
    resume: async (windowId: string) => liveAskFor(await client.demand.mine.query(), windowId),
    accept: (offerId: string) => client.demand.acceptOffer.mutate({ offerId }),
    /** A hosted checkout URL; the booking is made when the payment is confirmed. */
    pay: async (offerId: string) => (await client.demand.payOffer.mutate({ offerId })).url,
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
