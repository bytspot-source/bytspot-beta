import { useEffect, useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { trpc } from '../utils/trpc';
import { askErrorMessage } from '../utils/guestAsk';
import { ticketAction, ticketsTransport, ticketWhen, type GuestTicket, type TicketsClient } from '../utils/guestTickets';

/** A business's dated ticket, opened from its shared link. Bought through Stripe. */
export function TicketSheet({ ticketId, onClose, onSignIn }: { ticketId: string; onClose: () => void; onSignIn: () => void }) {
  const transport = useMemo(() => ticketsTransport(trpc as unknown as TicketsClient), []);
  const [ticket, setTicket] = useState<GuestTicket | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    transport
      .get(ticketId)
      .then((row) => live && setTicket(row))
      .catch((error) => live && setProblem(askErrorMessage(error)));
    return () => {
      live = false;
    };
  }, [ticketId, transport]);

  const buy = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      window.location.assign(await transport.buy(ticketId));
    } catch (error) {
      const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
      if (code === 'UNAUTHORIZED') setNeedsSignIn(true);
      else setProblem(askErrorMessage(error));
      setBusy(false);
    }
  };

  const action = ticket ? ticketAction(ticket) : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={ticket?.title ?? 'Ticket'} data-testid="ticket-sheet">
      <div className="w-full max-w-[393px] rounded-t-[24px] border-t-2 border-white/30 bg-[#1C1C1E] p-5 text-white">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px]" style={{ fontWeight: 700 }}>{ticket?.title ?? 'Ticket'}</h2>
            {ticket ? <p className="text-[13px] text-white/70">{ticket.sellerName}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!ticket ? (
          <p className="py-6 text-center text-[14px] text-white/70">{problem ?? 'Loading…'}</p>
        ) : (
          <>
            <p className="text-[14px]" style={{ fontWeight: 600 }}>{ticketWhen(ticket)}</p>
            <p className="mt-1 flex items-center gap-1 text-[13px] text-white/70">
              <MapPin className="h-3.5 w-3.5" />
              {ticket.place.label}
              {ticket.place.address ? ` · ${ticket.place.address}` : ''}
            </p>
            {ticket.details ? <p className="mt-3 whitespace-pre-line text-[13px] text-white/80">{ticket.details}</p> : null}
            {action?.canBuy && ticket.remaining <= 10 ? (
              <p className="mt-3 text-[12px] text-amber-300">{ticket.remaining} left</p>
            ) : null}

            {needsSignIn ? (
              <button
                type="button"
                onClick={onSignIn}
                className="mt-4 w-full rounded-[16px] py-3.5 text-[15px]"
                style={{ fontWeight: 700, background: 'linear-gradient(135deg,#00BFFF,#A855F7)' }}
              >
                Sign in to buy
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !action?.canBuy}
                onClick={() => void buy()}
                className="mt-4 w-full rounded-[16px] py-3.5 text-[15px] disabled:opacity-50"
                style={{ fontWeight: 700, background: 'linear-gradient(135deg,#10b981,#059669)' }}
              >
                {busy ? 'Opening checkout…' : action?.label}
              </button>
            )}
            <p className="mt-2 text-center text-[12px] text-white/50">
              Paid through Stripe. Your pass shows under My Requests to scan at the door. Refunded in full if the last ticket goes while you pay.
            </p>
            {problem ? <p className="mt-2 text-center text-[13px]" style={{ color: '#fda4af' }} role="alert">{problem}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
