import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';
import { partyPassCopy, type PartyPassAction } from '../utils/partyPassRoute';

type Props = { partyID: string };

export function PartyPassPage({ partyID }: Props) {
  const [invite, setInvite] = useState<any>(null);
  const [pass, setPass] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);

  const resolve = async () => {
    const nextPass = await trpc.events.pass.resolve.query({ partyId: partyID });
    setPass(nextPass);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([trpc.events.invite.query({ partyId: partyID }), trpc.events.pass.resolve.query({ partyId: partyID })])
      .then(([nextInvite, nextPass]) => { if (active) { setInvite(nextInvite); setPass(nextPass); } })
      .catch(() => { if (active) setMessage('This Party Pass is unavailable right now.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [partyID]);

  const action = (pass?.action ?? 'unavailable') as PartyPassAction;
  const copy = partyPassCopy(invite?.accessMode ?? 'free-rsvp', action, invite?.cashDoorPriceCents);
  const openNative = () => { window.location.href = `bytspot://party/${encodeURIComponent(partyID)}`; };
  const startAction = async () => {
    if (action === 'authenticate') { openNative(); return; }
    if (!['rsvp', 'reserve-cash', 'request-approval'].includes(action)) return;
    setBusy(true);
    try {
      await trpc.events.rsvp.create.mutate({ partyId: partyID, idempotencyKey: crypto.randomUUID?.() ?? `party-${Date.now()}` });
      await resolve();
      setMessage(action === 'reserve-cash' ? 'Your spot is reserved. Cash is due at the door.' : action === 'request-approval' ? 'Your request is with the host.' : 'Your free RSVP is confirmed.');
    } catch {
      setMessage('Your request could not be completed. Sign in in Bytspot if needed and try again.');
    } finally {
      setBusy(false);
    }
  };
  const startCheckout = async (tierName: string) => {
    if (action !== 'ticket') return;
    setBusy(true);
    try {
      const result = await trpc.events.tickets.createCheckout.mutate({ partyId: partyID, ticketTierName: tierName, idempotencyKey: crypto.randomUUID?.() ?? `party-ticket-${Date.now()}` });
      window.location.assign(result.url);
    } catch {
      setMessage('Checkout could not be started. Please try again.');
      setBusy(false);
    }
  };

  if (busy && !invite) return <main className="min-h-screen bg-black p-8 text-center text-white">Preparing your Party Pass…</main>;
  if (!invite) return <main className="min-h-screen bg-black p-8 text-center text-white">{message || 'Party Pass unavailable'}</main>;

  return <main className="min-h-screen bg-[#07080d] px-5 py-10 text-white"><section className="mx-auto max-w-lg rounded-[32px] border border-white/15 bg-white/10 p-6 shadow-2xl">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Bytspot Party Pass</p>
    <h1 className="mt-3 text-3xl font-black">{invite.title}</h1>
    <p className="mt-2 text-sm font-semibold text-white/70">Hosted by {invite.hostName} · {invite.scheduledDate}</p>
    <div className="mt-6 rounded-2xl bg-black/30 p-4"><p className="font-black">{copy.admission}</p><p className="mt-1 text-sm text-white/70">{copy.detail}</p></div>
    {action === 'ticket' ? <div className="mt-5 space-y-3">{(invite.ticketTiers ?? []).map((tier: any) => <button key={tier.name} disabled={busy} onClick={() => void startCheckout(tier.name)} className="flex w-full items-center justify-between rounded-2xl bg-cyan-300 px-4 py-4 text-left font-black text-black"><span>{tier.name}</span><span>${(tier.priceCents / 100).toFixed(2)}</span></button>)}</div> : <button disabled={busy || action === 'view-pass' || action === 'unavailable'} onClick={() => void startAction()} className="mt-5 h-14 w-full rounded-2xl bg-cyan-300 px-4 font-black text-black disabled:opacity-50">{copy.primary}</button>}
    {action === 'authenticate' && <button onClick={openNative} className="mt-3 w-full text-sm font-bold text-cyan-200">Open Bytspot to sign in</button>}
    {message && <p className="mt-4 text-center text-sm font-semibold text-white/75">{message}</p>}
  </section></main>;
}