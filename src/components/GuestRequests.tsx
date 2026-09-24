import { useCallback, useEffect, useMemo, useState } from 'react';
import { trpc } from '../utils/trpc';
import {
  askErrorMessage,
  askIsLive,
  askStateLabel,
  askTransport,
  formatSlotLabel,
  offerAction,
  type AskClient,
  type AskOffer,
  type AskStatus,
} from '../utils/guestAsk';

const POLL_MS = 15_000;

/** Every request the guest has open or booked, with its offers to answer. */
export function GuestRequests() {
  const transport = useMemo(() => askTransport(trpc as AskClient), []);
  const [rows, setRows] = useState<AskStatus[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await transport.list());
      setProblem(undefined);
    } catch (error) {
      setProblem(askErrorMessage(error));
    }
  }, [transport]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await load();
    } catch (error) {
      setProblem(askErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const take = (offer: AskOffer) =>
    act(async () => {
      if (offerAction(offer).kind === 'pay') {
        window.location.assign(await transport.pay(offer.id));
        return;
      }
      await transport.accept(offer.id);
    });

  if (!rows) {
    return <p className="px-4 py-10 text-center text-[14px] text-slate-300">{problem ?? 'Loading…'}</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 mt-2" data-testid="guest-requests">
      {rows.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-slate-300">
          No requests. Ask a place from its card on Discover and the answer lands here.
        </p>
      ) : null}
      {rows.map((row) => (
        <div key={row.id} className="rounded-[16px] border border-slate-600 bg-slate-950 p-4 text-white">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[16px]" style={{ fontWeight: 700 }}>
              {row.askedOf?.sellerName ?? row.offers[0]?.where ?? 'Your request'}
            </p>
            <span className="text-[12px] text-cyan-300" style={{ fontWeight: 700 }}>{askStateLabel(row)}</span>
          </div>
          <p className="text-[13px] text-slate-300">
            {row.partySize ? `${row.partySize} ${row.partySize === 1 ? 'guest' : 'guests'}` : ''}
            {row.earliest ? ` · ${formatSlotLabel(row.earliest)}` : ''}
            {row.askedOf ? ` · ${row.askedOf.place}` : ''}
          </p>

          {row.offers.map((offer) => (
            <div key={offer.id} className="mt-3 rounded-[12px] border border-white/15 bg-white/5 p-3">
              <p className="text-[14px]" style={{ fontWeight: 600 }}>
                {offer.where} · {formatSlotLabel(offer.startsAt)}
              </p>
              <p className="text-[12px] text-slate-300">
                ${(offer.priceCents / 100).toFixed(2)} · {offer.durationMins} min{offer.terms ? ` · ${offer.terms}` : ''}
              </p>
              {offer.payment?.state === 'refunded' ? (
                <p className="mt-1 text-[12px]" style={{ color: '#fda4af' }}>
                  Refunded{offer.payment.reason ? `: ${offer.payment.reason}` : ''}
                </p>
              ) : null}
              {offerAction(offer).kind !== 'none' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void take(offer)}
                  className="mt-2 w-full rounded-[10px] py-2 text-[14px] disabled:opacity-50"
                  style={{ fontWeight: 700, background: 'linear-gradient(135deg,#10b981,#059669)' }}
                >
                  {offerAction(offer).label}
                </button>
              ) : null}
              {offer.payAt === 'bytspot' && !offer.accepted ? (
                <p className="mt-1 text-center text-[11px] text-slate-400">Paid through Stripe. Refunded in full if the time is gone.</p>
              ) : null}
            </div>
          ))}

          {askIsLive(row) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => transport.withdraw(row.id))}
              className="mt-3 w-full rounded-[10px] border border-white/30 py-2 text-[13px] text-slate-200"
            >
              Withdraw
            </button>
          ) : null}
        </div>
      ))}
      {problem ? <p className="text-center text-[13px]" style={{ color: '#fda4af' }} role="alert">{problem}</p> : null}
    </div>
  );
}
