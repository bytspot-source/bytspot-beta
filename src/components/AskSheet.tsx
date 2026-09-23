import { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, CheckCircle } from 'lucide-react';
import { trpc } from '../utils/trpc';
import type { VendorAsk } from '../utils/mockData/discover';
import {
  askErrorMessage,
  askIsLive,
  askProblems,
  askTransport,
  formatSlotLabel,
  type AskClient,
  type AskStatus,
} from '../utils/guestAsk';

const POLL_MS = 10_000;

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Ask one vendor window for a time, then wait for its answer here.
 *
 * The seller sees the ask in their demand feed and answers with an offer that
 * holds a slot; accepting it is the booking.
 */
export function AskSheet({ ask, onClose }: { ask: VendorAsk; onClose: () => void }) {
  const transport = useMemo(() => askTransport(trpc as AskClient), []);
  const [partySize, setPartySize] = useState(Math.min(2, ask.maxGuests));
  const [startsAt, setStartsAt] = useState(ask.slots[0]?.startsAt ?? '');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [demandId, setDemandId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AskStatus | undefined>(undefined);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (!demandId || booked) return;
    let live = true;
    const tick = async () => {
      try {
        const next = await transport.read(demandId);
        if (!live) return;
        setStatus(next);
        if (next?.state === 'BOOKED') setBooked(true);
      } catch {
        /* the next tick retries */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [demandId, booked, transport]);

  const send = async () => {
    const problems = askProblems(ask, { partySize, startsAt, note });
    if (problems.length) {
      setProblem(problems[0]);
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      const raised = await transport.send(ask, { partySize, startsAt, note });
      setDemandId(raised.id);
    } catch (error) {
      setProblem(askErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (offerId: string) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await transport.accept(offerId);
      setBooked(true);
    } catch (error) {
      setProblem(askErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!demandId) return;
    setBusy(true);
    try {
      await transport.withdraw(demandId);
      onClose();
    } catch (error) {
      setProblem(askErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const offers = status?.offers ?? [];
  const finished = !!demandId && !!status && !askIsLive(status) && !booked;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={`Ask ${ask.sellerName}`}>
      <div className="w-full max-w-[393px] rounded-t-[24px] border-t-2 border-white/30 bg-[#1C1C1E] p-5 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px]" style={{ fontWeight: 700 }}>
            {booked ? 'You are booked' : demandId ? `Asked ${ask.sellerName}` : `Ask ${ask.sellerName}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!demandId ? (
          <>
            <p className="mb-2 text-[13px] text-white/70">How many</p>
            <div className="mb-4 flex items-center gap-3">
              <button type="button" aria-label="Fewer" disabled={partySize <= 1} onClick={() => setPartySize(partySize - 1)} className="rounded-full bg-white/10 p-2 disabled:opacity-40">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-[17px]" style={{ fontWeight: 700 }}>{partySize}</span>
              <button type="button" aria-label="More" disabled={partySize >= ask.maxGuests} onClick={() => setPartySize(partySize + 1)} className="rounded-full bg-white/10 p-2 disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-[12px] text-white/50">up to {ask.maxGuests}</span>
            </div>

            <p className="mb-2 text-[13px] text-white/70">When</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {ask.slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => setStartsAt(slot.startsAt)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${slot.startsAt === startsAt ? 'border-cyan-300 bg-cyan-500/30' : 'border-white/25 bg-white/5'}`}
                >
                  {formatSlotLabel(slot.startsAt)}
                </button>
              ))}
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-[13px] text-white/70">Note (optional)</span>
              <input
                value={note}
                maxLength={280}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-[12px] border border-white/20 bg-black/40 px-3 py-2 text-[14px]"
                placeholder="Birthday, window seat…"
              />
            </label>

            <button
              type="button"
              disabled={busy || !ask.slots.length}
              onClick={() => void send()}
              className="w-full rounded-[16px] py-3.5 text-[15px] disabled:opacity-50"
              style={{ fontWeight: 700, background: 'linear-gradient(135deg,#00BFFF,#A855F7)' }}
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <p className="mt-2 text-center text-[12px] text-white/50">Free to ask. Nothing is booked until you accept an offer.</p>
          </>
        ) : booked ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
            <p className="text-[15px]">{ask.sellerName} is holding it for you.</p>
          </div>
        ) : (
          <>
            {offers.length === 0 && !finished ? (
              <p className="mb-4 text-[14px] text-white/70">Sent. {ask.sellerName} will answer here; you can close this and come back.</p>
            ) : null}
            {finished ? <p className="mb-4 text-[14px] text-white/70">This request has closed without a booking.</p> : null}
            <ul className="mb-4 flex flex-col gap-2">
              {offers.map((offer) => (
                <li key={offer.id} className="rounded-[14px] border border-white/20 bg-white/5 p-3">
                  <p className="text-[15px]" style={{ fontWeight: 600 }}>
                    {offer.where} · {formatSlotLabel(offer.startsAt)}
                  </p>
                  <p className="text-[13px] text-white/60">
                    {dollars(offer.priceCents)} · {offer.durationMins} min{offer.terms ? ` · ${offer.terms}` : ''}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void accept(offer.id)}
                    className="mt-2 w-full rounded-[12px] bg-emerald-500 py-2.5 text-[14px] disabled:opacity-50"
                    style={{ fontWeight: 700 }}
                  >
                    Accept · held until {new Date(offer.holdExpiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </button>
                </li>
              ))}
            </ul>
            {!finished ? (
              <button type="button" disabled={busy} onClick={() => void withdraw()} className="w-full rounded-[12px] border border-white/25 py-2.5 text-[14px] text-white/80">
                Withdraw request
              </button>
            ) : null}
          </>
        )}

        {problem ? <p className="mt-3 text-center text-[13px] text-rose-300" role="alert">{problem}</p> : null}
      </div>
    </div>
  );
}
