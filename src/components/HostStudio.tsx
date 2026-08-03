import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, Copy, Loader2, MapPin, ShieldCheck, Sparkles, Ticket, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { trpc } from '../utils/trpc.ts';
import type { SocialCircle } from '../utils/primaryEventSocialRpc.ts';
import type { BytspotPatchTier } from '../utils/patchTiers.ts';
import {
  PARTY_TEMPLATES,
  createAndPublishPartyViaRpc,
  type PartyAccessMode,
  type PartyHostRole,
  type PartyTemplateId,
  type PublishedParty,
} from '../utils/partyStudioRpc.ts';

interface HostStudioProps {
  circles: SocialCircle[];
  membershipTier: BytspotPatchTier;
  onBack: () => void;
}

const STEPS = ['Spark', 'Build', 'Invite', 'Drop'] as const;
const ACCESS_OPTIONS: { id: PartyAccessMode; label: string; detail: string }[] = [
  { id: 'free-rsvp', label: 'Free RSVP', detail: 'Fastest way to fill the room.' },
  { id: 'paid-ticket', label: 'Paid Ticket', detail: 'Sell a limited first drop.' },
  { id: 'private-approval', label: 'Private Approval', detail: 'You control every guest.' },
];

function defaultStart(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(20, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function tierLabel(tier: BytspotPatchTier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}

export function HostStudio({ circles, membershipTier, onBack }: HostStudioProps) {
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<PartyTemplateId>('listening-party');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('One moment. Your people.');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [venueName, setVenueName] = useState('');
  const [capacity, setCapacity] = useState('80');
  const [accessMode, setAccessMode] = useState<PartyAccessMode>('free-rsvp');
  const [requiredTier, setRequiredTier] = useState<BytspotPatchTier>('green');
  const [price, setPrice] = useState('25');
  const [selectedCircles, setSelectedCircles] = useState<string[]>([]);
  const [cohostEmail, setCohostEmail] = useState('');
  const [cohostRole, setCohostRole] = useState<Exclude<PartyHostRole, 'owner'>>('cohost');
  const [publishing, setPublishing] = useState(false);
  const [publishedParty, setPublishedParty] = useState<PublishedParty | null>(null);
  const [error, setError] = useState('');

  const template = PARTY_TEMPLATES.find((item) => item.id === templateId) ?? PARTY_TEMPLATES[0];
  const displayTitle = title.trim() || template.name;
  const accessLabel = ACCESS_OPTIONS.find((item) => item.id === accessMode)?.label ?? 'Free RSVP';
  const canContinue = step === 0 || (step === 1 ? title.trim().length >= 3 && venueName.trim().length > 0 : true);
  const dateLabel = useMemo(() => {
    const date = new Date(startsAt);
    return Number.isNaN(date.getTime()) ? 'Date coming soon' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, [startsAt]);

  const toggleCircle = (circleId: string) => {
    setSelectedCircles((current) => current.includes(circleId) ? current.filter((id) => id !== circleId) : [...current, circleId]);
  };

  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    setError('');
    try {
      const itinerary = template.defaultItinerary.map((item, index) => ({ title: item, offsetMinutes: index * 60 }));
      const priceCents = Math.max(0, Math.round(Number(price) * 100));
      const result = await createAndPublishPartyViaRpc(trpc, {
        templateId, title: title.trim(), tagline: tagline.trim(), startsAt: new Date(startsAt).toISOString(),
        venueName: venueName.trim(), capacity: Number(capacity), accessMode, requiredMembershipTier: requiredTier,
        audienceCircleIds: selectedCircles, itinerary,
        ticketTiers: accessMode === 'paid-ticket' ? [{ name: 'First Drop', priceCents, quantity: Number(capacity), requiredMembershipTier: requiredTier }] : [],
        cohosts: cohostEmail.trim() ? [{ email: cohostEmail.trim(), role: cohostRole }] : [],
      });
      setPublishedParty(result);
      toast.success('Your moment is live');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The party could not be published.');
    } finally {
      setPublishing(false);
    }
  };

  const copyPass = async () => {
    if (!publishedParty) return;
    try { await navigator.clipboard.writeText(publishedParty.shareUrl); toast.success('Party link copied'); }
    catch { toast('Share link', { description: publishedParty.shareUrl }); }
  };

  return (
    <div className="h-full overflow-y-auto bg-black pb-24 text-white" data-testid="host-studio">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-xl">
        <button onClick={onBack} aria-label="Back to Network" className="flex items-center gap-1 text-[14px] font-bold text-white"><ChevronLeft className="h-5 w-5" /> Network</button>
        <div className="text-center"><p className="text-[10px] font-black tracking-[0.2em] text-fuchsia-300">HOST STUDIO</p><p className="text-[12px] text-slate-400">The backstage</p></div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-300">{tierLabel(membershipTier)}</span>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 pt-4">
        <div className="grid grid-cols-4 gap-2" aria-label="Host Studio progress">
          {STEPS.map((label, index) => <div key={label} className="text-center"><div className={`h-1 rounded-full ${index <= step ? 'bg-fuchsia-400' : 'bg-slate-800'}`} /><p className={`mt-1 text-[10px] font-bold ${index === step ? 'text-white' : 'text-slate-500'}`}>{label}</p></div>)}
        </div>

        <motion.section layout className={`relative overflow-hidden rounded-[30px] bg-gradient-to-br ${template.accent} p-6 shadow-2xl`}>
          <div className="absolute -right-8 -top-8 text-[110px] opacity-20">{template.emoji}</div>
          <p className="text-[10px] font-black tracking-[0.2em] text-white/70">BYTSPOT PRESENTS</p>
          <p className="mt-8 max-w-[80%] text-[30px] font-black leading-[0.95]">{displayTitle}</p>
          <p className="mt-3 max-w-[80%] text-[13px] font-semibold text-white/75">{tagline || template.hook}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] font-black uppercase">
            <span className="rounded-full bg-black/35 px-3 py-2">{tierLabel(requiredTier)}</span>
            <span className="rounded-full bg-black/35 px-3 py-2">{accessLabel}</span>
            <span className="rounded-full bg-black/35 px-3 py-2">{dateLabel}</span>
          </div>
        </motion.section>

        {step === 0 && <section>
          <p className="text-[11px] font-black tracking-[0.18em] text-fuchsia-300">SPARK THE VIBE</p>
          <h1 className="mt-1 text-[26px] font-black">What are we making?</h1>
          <p className="mt-1 text-[13px] text-slate-400">Pick a feeling. We build the night around it.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {PARTY_TEMPLATES.map((item) => <button key={item.id} onClick={() => setTemplateId(item.id)} aria-pressed={templateId === item.id} className={`rounded-[22px] border p-4 text-left ${templateId === item.id ? 'border-fuchsia-400 bg-fuchsia-500/15' : 'border-slate-800 bg-slate-950'}`}>
              <span className="text-[28px]">{item.emoji}</span><p className="mt-2 text-[14px] font-black">{item.name}</p><p className="mt-1 text-[11px] leading-snug text-slate-400">{item.hook}</p>
            </button>)}
          </div>
        </section>}

        {step === 1 && <section className="space-y-3">
          <p className="text-[11px] font-black tracking-[0.18em] text-fuchsia-300">BUILD THE MOMENT</p>
          <h1 className="text-[26px] font-black">Make it yours.</h1>
          <input aria-label="Party title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give the night a name" className="w-full rounded-[18px] border border-slate-700 bg-slate-950 px-4 py-4 text-[15px] outline-none focus:border-fuchsia-400" />
          <input aria-label="Party tagline" value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="One-line hook" className="w-full rounded-[18px] border border-slate-700 bg-slate-950 px-4 py-4 text-[15px] outline-none focus:border-fuchsia-400" />
          <label className="flex items-center gap-3 rounded-[18px] border border-slate-700 bg-slate-950 px-4 py-3"><CalendarDays className="h-5 w-5 text-fuchsia-300" /><input aria-label="Party date and time" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] text-white [color-scheme:dark]" /></label>
          <label className="flex items-center gap-3 rounded-[18px] border border-slate-700 bg-slate-950 px-4 py-3"><MapPin className="h-5 w-5 text-cyan-300" /><input aria-label="Party venue" value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="Venue or secret location" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" /></label>
        </section>}

        {step === 2 && <section className="space-y-4">
          <div><p className="text-[11px] font-black tracking-[0.18em] text-fuchsia-300">SET THE DOOR</p><h1 className="text-[26px] font-black">Who gets in?</h1></div>
          <div className="space-y-2">{ACCESS_OPTIONS.map((option) => <button key={option.id} onClick={() => setAccessMode(option.id)} aria-pressed={accessMode === option.id} className={`flex w-full items-center gap-3 rounded-[18px] border p-4 text-left ${accessMode === option.id ? 'border-fuchsia-400 bg-fuchsia-500/15' : 'border-slate-800 bg-slate-950'}`}><Ticket className="h-5 w-5 text-fuchsia-300" /><span className="flex-1"><span className="block text-[14px] font-black">{option.label}</span><span className="text-[11px] text-slate-400">{option.detail}</span></span>{accessMode === option.id && <Check className="h-5 w-5" />}</button>)}</div>
          {accessMode === 'paid-ticket' && <label className="block rounded-[18px] border border-slate-700 bg-slate-950 p-4 text-[12px] font-bold text-slate-300">FIRST DROP PRICE<input aria-label="Ticket price" type="number" min="1" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 w-full bg-transparent text-[24px] font-black text-white outline-none" /></label>}
          <div><p className="mb-2 text-[11px] font-black tracking-[0.14em] text-slate-400">MINIMUM MEMBERSHIP</p><div className="grid grid-cols-3 gap-2">{(['green', 'platinum', 'black'] as const).map((tier) => <button key={tier} onClick={() => setRequiredTier(tier)} aria-pressed={requiredTier === tier} className={`rounded-[16px] border px-2 py-3 text-[12px] font-black uppercase ${requiredTier === tier ? 'border-emerald-300 bg-emerald-400/15 text-white' : 'border-slate-800 text-slate-400'}`}>{tier}</button>)}</div></div>
          <label className="block rounded-[18px] border border-slate-700 bg-slate-950 p-4 text-[12px] font-bold text-slate-300">CAPACITY<input aria-label="Party capacity" type="number" min="2" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-2 w-full bg-transparent text-[24px] font-black text-white outline-none" /></label>
        </section>}

        {step === 3 && !publishedParty && <section className="space-y-4">
          <div><p className="text-[11px] font-black tracking-[0.18em] text-fuchsia-300">INVITE YOUR PEOPLE</p><h1 className="text-[26px] font-black">Build the room.</h1><p className="text-[13px] text-slate-400">Choose Circles or drop a link anywhere.</p></div>
          <div className="rounded-[20px] border border-slate-800 bg-slate-950 p-4"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-cyan-300" /><p className="text-[13px] font-black">Audience Circles</p></div><div className="mt-3 flex flex-wrap gap-2">{circles.length === 0 && <span className="text-[12px] text-slate-400">Shareable link · Everyone you choose</span>}{circles.map((circle) => <button key={circle.id} onClick={() => toggleCircle(circle.id)} aria-pressed={selectedCircles.includes(circle.id)} className={`rounded-full border px-3 py-2 text-[11px] font-bold ${selectedCircles.includes(circle.id) ? 'border-cyan-300 bg-cyan-400/15 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{circle.name} · {circle.memberCount}</button>)}</div></div>
          <div className="rounded-[20px] border border-slate-800 bg-slate-950 p-4"><p className="text-[13px] font-black">Backstage teammate <span className="font-medium text-slate-500">· optional</span></p><div className="mt-3 flex gap-2"><input aria-label="Co-host email" type="email" value={cohostEmail} onChange={(event) => setCohostEmail(event.target.value)} placeholder="name@email.com" className="min-w-0 flex-1 rounded-[14px] border border-slate-700 bg-black px-3 text-[12px] outline-none" /><select aria-label="Co-host role" value={cohostRole} onChange={(event) => setCohostRole(event.target.value as Exclude<PartyHostRole, 'owner'>)} className="rounded-[14px] border border-slate-700 bg-black px-2 text-[12px]"><option value="cohost">Co-host</option><option value="door">Door</option><option value="finance">Finance</option></select></div></div>
          <div className="rounded-[20px] border border-emerald-400/25 bg-emerald-400/5 p-4"><div className="flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-5 w-5" /><p className="text-[12px] font-black">BACKSTAGE READY</p></div><p className="mt-2 text-[12px] text-slate-300">Itinerary · RSVP · ticketing · check-in · role-scoped controls</p></div>
          {error && <p role="alert" className="rounded-[14px] bg-rose-500/15 p-3 text-[12px] font-bold text-rose-300">{error}</p>}
          <button onClick={() => void publish()} disabled={publishing} className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-white py-4 text-[14px] font-black text-black disabled:opacity-60">{publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{publishing ? 'Dropping…' : 'Drop the Moment'}</button>
        </section>}

        {publishedParty && <section className="space-y-4" aria-label="Party Pass live">
          <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-black"><Check className="h-7 w-7" /></div><p className="mt-3 text-[11px] font-black tracking-[0.2em] text-emerald-300">YOUR MOMENT IS LIVE</p><h1 className="text-[28px] font-black">Party Pass ready.</h1></div>
          <div className="rounded-[26px] border border-white/15 bg-slate-950 p-5"><div className="flex items-center justify-between"><span className="text-[11px] font-black text-fuchsia-300">{tierLabel(requiredTier).toUpperCase()} PARTY PASS</span><span className="text-[24px]">{template.emoji}</span></div><p className="mt-5 text-[24px] font-black">{displayTitle}</p><p className="mt-2 text-[12px] text-slate-400">{dateLabel} · {venueName}</p><div className="mt-5 rounded-[18px] border border-dashed border-white/25 bg-black p-4 text-center"><p className="text-[10px] font-black tracking-[0.18em] text-slate-500">PASS CODE</p><p className="mt-1 text-[24px] font-black tracking-[0.25em]">{publishedParty.passCode}</p></div></div>
          <button onClick={() => void copyPass()} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-fuchsia-500 py-4 text-[14px] font-black"><Copy className="h-5 w-5" /> Copy Party Link</button>
        </section>}

        {!publishedParty && step < 3 && <div className="flex gap-3 pb-4">{step > 0 && <button onClick={() => setStep((current) => current - 1)} className="rounded-[18px] border border-slate-700 px-5 py-4 text-[13px] font-black">Back</button>}<button onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={!canContinue} className="flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-white py-4 text-[14px] font-black text-black disabled:opacity-40">{step === 0 ? 'Build this vibe' : step === 1 ? 'Set the door' : 'Invite your people'} <Sparkles className="h-4 w-4" /></button></div>}
      </main>
    </div>
  );
}