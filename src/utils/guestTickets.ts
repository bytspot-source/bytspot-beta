/**
 * A ticket a business sells for one of its own dates, as a guest opens it from
 * a shared link (`/?ticket=…`), buys it through Stripe and shows its pass at
 * the door. The pass is the same code and QR a booking carries, so the door
 * scanner reads both.
 */

export type GuestTicketState = 'on_sale' | 'sold_out' | 'stopped' | 'ended';

export interface GuestTicket {
  id: string;
  title: string;
  details: string | null;
  sellerName: string;
  place: { label: string; address: string | null; lat: number; lng: number };
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  priceCents: number;
  remaining: number;
  state: GuestTicketState;
}

export interface MyTicket {
  orderId: string;
  ticketId: string;
  title: string;
  sellerName: string;
  place: string;
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  priceCents: number;
  payment: 'paying' | 'paid' | 'refunded';
  refundReason?: string;
  pass?: string;
  checkedIn: boolean;
}

export interface TicketsClient {
  tickets: {
    get: { query: (input: { ticketId: string }) => Promise<GuestTicket> };
    checkout: { mutate: (input: { ticketId: string }) => Promise<{ url: string }> };
    mine: { query: () => Promise<MyTicket[]> };
  };
}

export function ticketsTransport(client: TicketsClient) {
  return {
    get: (ticketId: string) => client.tickets.get.query({ ticketId }),
    /** A hosted checkout URL; the ticket is counted when the payment is confirmed. */
    buy: async (ticketId: string) => (await client.tickets.checkout.mutate({ ticketId })).url,
    mine: () => client.tickets.mine.query(),
  };
}

/** Kept across sign-in, so a guest who opened a ticket link signed out lands back on it. */
export const PENDING_TICKET_KEY = 'bytspot_pending_ticket';

const TICKET_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The ticket a link opened, and where Stripe sent the guest back from, if it did. */
export function ticketLink(search: string): { ticketId: string; outcome?: 'paid' | 'cancelled' } | undefined {
  const query = new URLSearchParams(search);
  const ticketId = query.get('ticket')?.trim() ?? '';
  if (!TICKET_ID.test(ticketId)) return undefined;
  const checkout = query.get('checkout');
  const outcome = checkout === 'ticket-paid' ? 'paid' : checkout === 'ticket-cancelled' ? 'cancelled' : undefined;
  return outcome ? { ticketId, outcome } : { ticketId };
}

/** "Sunday, Oct 18, 1:00 PM to 5:00 PM", on the place's clock. */
export function ticketWhen(ticket: { startsAt: string; endsAt: string; timezone: string | null }): string {
  const zone = ticket.timezone ? { timeZone: ticket.timezone } : {};
  const start = new Date(ticket.startsAt);
  const time = (at: Date) => at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...zone });
  const day = start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', ...zone });
  return `${day}, ${time(start)} to ${time(new Date(ticket.endsAt))}`;
}

/** What the guest can do with a ticket they opened. */
export function ticketAction(ticket: Pick<GuestTicket, 'state' | 'priceCents' | 'remaining'>): { canBuy: boolean; label: string } {
  if (ticket.state === 'sold_out' || (ticket.state === 'on_sale' && ticket.remaining <= 0)) return { canBuy: false, label: 'Sold out' };
  if (ticket.state === 'stopped') return { canBuy: false, label: 'No longer on sale' };
  if (ticket.state === 'ended') return { canBuy: false, label: 'This date has ended' };
  return { canBuy: true, label: `Buy for $${(ticket.priceCents / 100).toFixed(2)}` };
}
