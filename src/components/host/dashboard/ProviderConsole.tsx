import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Bell, CalendarClock, CheckCircle2, Clock, Crown, DollarSign, Gem, Inbox, Leaf, MessageSquare, RefreshCcw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { trpc } from '../../../utils/trpc';
import { type DashboardBookingStatus } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface ProviderConsoleProps { isDarkMode: boolean; access: ProviderDashboardAccess }
type ConsoleTier = 'BLACK' | 'PLATINUM' | 'GREEN' | 'SIMPLE';
type RequestStatus = 'REQUESTED' | 'HOLD_AUTHORIZED' | 'ACCEPTED' | 'DECLINED' | 'COUNTER_OFFERED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
type ConsoleBooking = {
  id: string;
  serviceTitle: string;
  status: DashboardBookingStatus;
  requestStatus: RequestStatus | null;
  tier: ConsoleTier;
  startsAt: string;
  expiresAt: string | null;
  guestName: string | null;
  patchLabel: string | null;
  priceCents: number;
  currency: string;
  paymentStatus: string | null;
  guestNotes: string | null;
  logisticsMode: string | null;
  counterOfferCents: number | null;
  counterOfferCurrency: string | null;
  counterOfferMessage: string | null;
  cashFlow?: { providerPayoutEstimateCents?: number } | null;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const spring = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
const PROVIDER_CONSOLE_POLL_MS = 20_000;
const PROVIDER_CONSOLE_CLOCK_MS = 30_000;

function formatCents(cents: number) { return money.format(Math.round(cents) / 100); }
function centsFromDollars(value: string) { return Math.round(Number(value || '0') * 100); }
function formatDate(value: string | null) {
  if (!value) return 'Time pending';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time pending';
}
function minutesUntil(value: string | null, nowMs = Date.now()) {
  if (!value) return 'No expiry set';
  const ms = new Date(value).getTime() - nowMs;
  if (!Number.isFinite(ms)) return 'No expiry set';
  if (ms <= 0) return 'Expired';
  const mins = Math.ceil(ms / 60_000);
  return mins >= 60 ? `${Math.ceil(mins / 60)}h left` : `${mins}m left`;
}
function normalizeStatus(raw: unknown): DashboardBookingStatus {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'paid' || value === 'funds_authorized') return 'confirmed';
  if (value === 'canceled' || value === 'refunded' || value === 'disputed') return 'cancelled';
  return ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(value) ? value as DashboardBookingStatus : 'pending';
}
function normalizeTier(raw: unknown): ConsoleTier {
  const value = String(raw ?? 'SIMPLE').toUpperCase();
  return ['BLACK', 'PLATINUM', 'GREEN', 'SIMPLE'].includes(value) ? value as ConsoleTier : 'SIMPLE';
}
function isOpenRequestStatus(status: RequestStatus | null): boolean {
  return status === 'REQUESTED' || status === 'HOLD_AUTHORIZED' || status === 'COUNTER_OFFERED';
}
function requestIsExpired(booking: ConsoleBooking, nowMs = Date.now()): boolean {
  if (!isOpenRequestStatus(booking.requestStatus) || !booking.expiresAt) return false;
  const expiresAt = new Date(booking.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}
function mapBooking(raw: any): ConsoleBooking | null {
  const id = raw?.id != null ? String(raw.id) : null;
  if (!id) return null;
  const service = raw?.service ?? null;
  const request = raw?.request ?? null;
  return {
    id,
    serviceTitle: String(service?.title ?? raw?.serviceTitle ?? 'Provider Request'),
    status: normalizeStatus(raw?.status),
    requestStatus: (raw?.requestStatus ?? request?.status ?? null) as RequestStatus | null,
    tier: normalizeTier(raw?.tier ?? service?.tier),
    startsAt: String(raw?.startsAt ?? raw?.scheduledFor ?? raw?.createdAt ?? new Date().toISOString()),
    expiresAt: request?.expiresAt ?? raw?.requestExpiresAt ?? null,
    guestName: raw?.guest?.displayName ?? raw?.guestName ?? 'Guest',
    patchLabel: raw?.patch?.label ?? service?.patch?.label ?? raw?.patchLabel ?? null,
    priceCents: Number(raw?.priceCents ?? service?.priceCents ?? 0),
    currency: String(raw?.currency ?? service?.currency ?? 'USD'),
    paymentStatus: raw?.payment?.status ?? null,
    guestNotes: request?.guestNotes ?? raw?.guestNotes ?? null,
    logisticsMode: request?.logisticsMode ?? raw?.logisticsMode ?? null,
    counterOfferCents: request?.counterOfferCents ?? raw?.counterOfferCents ?? null,
    counterOfferCurrency: request?.counterOfferCurrency ?? raw?.counterOfferCurrency ?? null,
    counterOfferMessage: request?.counterOfferMessage ?? raw?.counterOfferMessage ?? null,
    cashFlow: raw?.cashFlow ?? null,
  };
}
function tierStyle(tier: ConsoleTier) {
  if (tier === 'BLACK') return { icon: Crown, label: 'Black', cls: 'border-slate-300 bg-slate-950 text-white' };
  if (tier === 'PLATINUM') return { icon: Gem, label: 'Platinum', cls: 'border-cyan-200 bg-cyan-50 text-cyan-950' };
  if (tier === 'GREEN') return { icon: Leaf, label: 'Green', cls: 'border-emerald-200 bg-emerald-50 text-emerald-950' };
  return { icon: Sparkles, label: 'Simple', cls: 'border-violet-200 bg-violet-50 text-violet-950' };
}

export function ProviderConsole({ isDarkMode, access }: ProviderConsoleProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<ConsoleBooking[]>([]);
  const [active, setActive] = useState<ConsoleBooking[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DashboardBookingStatus>>({});
  const [selected, setSelected] = useState<ConsoleBooking | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const tone = {
    page: isDarkMode ? 'text-white' : 'text-slate-950', strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-50' : 'text-slate-700', muted: isDarkMode ? 'text-slate-100' : 'text-slate-600',
    panel: isDarkMode ? 'border-slate-500 bg-slate-900 shadow-black/45' : 'border-slate-200 bg-white shadow-slate-200/70',
    soft: isDarkMode ? 'border-slate-500 bg-slate-800' : 'border-slate-200 bg-slate-50',
    input: isDarkMode ? 'border-slate-500 bg-slate-950 text-white placeholder:text-slate-400' : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-500',
  };
  const canCheckIn = access.role === 'owner' || access.role === 'manager' || access.role === 'staff';
  const canOperate = access.role === 'owner' || access.role === 'manager';

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!localStorage.getItem('bytspot_auth_token')) { setLoading(false); setIncoming([]); setActive([]); setLastSyncedAt(null); return; }
    if (!silent) setLoading(true);
    setError(null);
    try { await trpc.vendors.syncNotifications.mutate({ warningWindowMinutes: 15 }); } catch { /* non-blocking */ }
    try {
      const [incomingResult, activeResult, legacyResult, notesResult] = await Promise.allSettled([
        trpc.vendors.listIncomingRequests.query({ limit: 20 }), trpc.vendors.listActiveBookings.query({ limit: 50 }),
        trpc.vendors.listBookings.query({ limit: 100 }), trpc.vendors.listNotifications.query({ unreadOnly: true, limit: 20 }),
      ]);
      const incomingRows = incomingResult.status === 'fulfilled' ? ((incomingResult.value as any)?.requests ?? []) : [];
      const activeRows = activeResult.status === 'fulfilled' && Array.isArray((activeResult.value as any)?.bookings)
        ? (activeResult.value as any).bookings : legacyResult.status === 'fulfilled' ? ((legacyResult.value as any)?.bookings ?? []) : [];
      setIncoming((Array.isArray(incomingRows) ? incomingRows : []).map(mapBooking).filter(Boolean) as ConsoleBooking[]);
      setActive((Array.isArray(activeRows) ? activeRows : []).map(mapBooking).filter(Boolean) as ConsoleBooking[]);
      setUnreadCount(notesResult.status === 'fulfilled' ? Number((notesResult.value as any)?.unreadCount ?? 0) : 0);
      setLastSyncedAt(new Date().toISOString());
    } catch (err: any) { setError(err?.message ?? 'Unable to load Provider Console.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const clock = window.setInterval(() => setLiveNow(Date.now()), PROVIDER_CONSOLE_CLOCK_MS);
    return () => window.clearInterval(clock);
  }, []);
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    }, PROVIDER_CONSOLE_POLL_MS);
    const onFocus = () => refresh({ silent: true });
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh({ silent: true }); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const activeRows = useMemo(() => active.map((row) => ({ ...row, status: statusOverrides[row.id] ?? row.status })), [active, statusOverrides]);
  const incomingRows = useMemo(() => incoming.filter((row) => !requestIsExpired(row, liveNow)), [incoming, liveNow]);
  useEffect(() => {
    if (selected && requestIsExpired(selected, liveNow)) {
      setSelected(null);
      setActionMessage('An expired request was removed from incoming triage.');
    }
  }, [selected, liveNow]);
  const upsertSelected = (next: ConsoleBooking | null) => {
    setSelected(next);
    setActionMessage(null);
    setDeclineReason('');
    setCounterAmount(next ? (next.priceCents / 100).toFixed(0) : '');
    setCounterMessage('');
  };
  const applyReturnedBooking = (raw: any, mode: 'request' | 'active') => {
    const mapped = mapBooking(raw);
    if (!mapped) return null;
    if (mode === 'active' || mapped.requestStatus === 'ACCEPTED') {
      setIncoming((prev) => prev.filter((item) => item.id !== mapped.id));
      setActive((prev) => [mapped, ...prev.filter((item) => item.id !== mapped.id)]);
    } else if (mapped.requestStatus === 'DECLINED' || mapped.status === 'cancelled') {
      setIncoming((prev) => prev.filter((item) => item.id !== mapped.id));
    } else {
      setIncoming((prev) => prev.map((item) => item.id === mapped.id ? mapped : item));
    }
    setSelected(mapped);
    return mapped;
  };
  const runAction = async (label: string, action: () => Promise<any>, success: string, mode: 'request' | 'active' = 'request') => {
    setActionBusy(label); setActionMessage(null); setError(null);
    try {
      const result = await action();
      const returned = (result as any)?.request ?? (result as any)?.booking ?? null;
      if (returned) applyReturnedBooking(returned, mode);
      setActionMessage(success);
      if (label === 'accept') setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err: any) { setActionMessage(err?.message ?? 'Unable to complete this action.'); }
    finally { setActionBusy(null); }
  };
  const checkInBooking = (booking: ConsoleBooking) => runAction(
    'check-in',
    () => trpc.vendors.updateBookingStatus.mutate({ bookingId: booking.id, status: 'in_progress' }),
    'Guest checked in. The booking is now marked in progress for the Provider team.',
    'active',
  ).then(() => setStatusOverrides((prev) => ({ ...prev, [booking.id]: 'in_progress' })));
  const statCards = [{ label: 'Incoming', value: incomingRows.length }, { label: 'Active', value: activeRows.length }, { label: 'Unread', value: unreadCount }];
  const syncedLabel = lastSyncedAt ? `Auto-refresh · synced ${formatDate(lastSyncedAt)}` : 'Auto-refresh starting';

  return <div className={`space-y-6 ${tone.page}`} data-testid="provider-console-shell">
    <motion.div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div><p className={`text-[12px] uppercase tracking-[0.2em] ${tone.muted}`} style={{ fontWeight: 900 }}>Provider Console</p><h1 className={`mt-1 text-[34px] ${tone.strong}`} style={{ fontWeight: 800 }}>Requests & Active Bookings</h1><p className={`mt-2 text-[16px] ${tone.body}`}>Triage luxury requests, monitor holds, and keep service handoffs App Clip ready.</p></div>
      <div className="flex flex-col gap-2 xl:items-end"><button type="button" onClick={() => refresh()} className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[13px] ${tone.soft}`} style={{ fontWeight: 800 }} data-testid="provider-console-refresh"><RefreshCcw className="h-4 w-4" />Refresh</button><p className={`text-[12px] ${tone.muted}`} data-testid="provider-console-auto-refresh">{syncedLabel}</p></div>
    </motion.div>
    <div className="grid gap-3 sm:grid-cols-3">{statCards.map((card) => <div key={card.label} className={`rounded-[20px] border p-4 shadow-lg ${tone.panel}`}><p className={`text-[12px] uppercase tracking-[0.16em] ${tone.muted}`} style={{ fontWeight: 850 }}>{card.label}</p><p className="mt-1 text-[30px]" style={{ fontWeight: 900 }}>{card.value}</p></div>)}</div>
    {actionMessage && <p className={`rounded-2xl border px-4 py-3 text-[13px] ${tone.soft}`} style={{ fontWeight: 800 }} data-testid="provider-console-action-message"><span data-testid="provider-bookings-handoff-message">{actionMessage}</span></p>}
    {error && <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-900">{error}</p>}
    <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <div className="grid gap-5 2xl:grid-cols-2">
        <ConsolePanel title="Incoming Requests" subtitle="Black, Platinum, and Green requests waiting on Provider triage." icon={Bell} tone={tone} loading={loading} empty="No incoming requests right now." testId="provider-console-incoming">
          {incomingRows.map((booking, index) => <BookingCard key={booking.id} booking={booking} index={index} isDarkMode={isDarkMode} tone={tone} mode="request" canSeeFinancials={access.canSeeFinancials} selected={selected?.id === booking.id} onSelect={upsertSelected} nowMs={liveNow} />)}
        </ConsolePanel>
        <ConsolePanel title="Active Bookings" subtitle="Accepted bookings and service handoffs ready for the team." icon={ShieldCheck} tone={tone} loading={loading} empty="No active bookings yet." testId="provider-bookings-list">
          {activeRows.map((booking, index) => <BookingCard key={booking.id} booking={booking} index={index} isDarkMode={isDarkMode} tone={tone} mode="active" canSeeFinancials={access.canSeeFinancials} selected={selected?.id === booking.id} onSelect={upsertSelected} onCheckIn={checkInBooking} canManage={canCheckIn} updating={actionBusy === 'check-in' && selected?.id === booking.id} nowMs={liveNow} />)}
        </ConsolePanel>
      </div>
      <RequestDetailPanel
        booking={selected}
        tone={tone}
        canOperate={canOperate}
        canCheckIn={canCheckIn}
        busy={actionBusy}
        declineReason={declineReason}
        counterAmount={counterAmount}
        counterMessage={counterMessage}
        onDeclineReason={setDeclineReason}
        onCounterAmount={setCounterAmount}
        onCounterMessage={setCounterMessage}
        onAccept={(booking) => runAction('accept', () => trpc.vendors.acceptRequest.mutate({ bookingId: booking.id }), 'Request accepted. It moved into Active Bookings.', 'active')}
        onDecline={(booking) => runAction('decline', () => trpc.vendors.declineRequest.mutate({ bookingId: booking.id, reason: declineReason || undefined }), 'Request declined and removed from incoming triage.')}
        onCounter={(booking) => runAction('counter', () => trpc.vendors.counterOffer.mutate({ bookingId: booking.id, amountCents: centsFromDollars(counterAmount), currency: booking.currency, message: counterMessage || undefined }), 'Counter offer sent to the guest.')}
        onComplete={(booking) => runAction('complete', () => trpc.vendors.completeBooking.mutate({ bookingId: booking.id }), 'Booking completed. Secure hold capture was requested if eligible.', 'active')}
        onCheckIn={checkInBooking}
        nowMs={liveNow}
      />
    </section>
  </div>;
}

function ConsolePanel({ title, subtitle, icon: Icon, tone, loading, empty, testId, children }: any) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <motion.section className={`rounded-[26px] border p-5 shadow-xl ${tone.panel}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} data-testid={testId}>
    <div className="mb-4 flex items-start gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone.soft}`}><Icon className="h-5 w-5 text-cyan-400" /></div><div><h2 className={`text-[22px] ${tone.strong}`} style={{ fontWeight: 850 }}>{title}</h2><p className={`mt-1 text-[13px] leading-5 ${tone.muted}`}>{subtitle}</p></div></div>
    {hasChildren ? <div className="grid gap-3">{children}</div> : <div className={`rounded-[20px] border p-8 text-center ${tone.soft}`} data-testid={`${testId}-empty`}><Inbox className="mx-auto mb-3 h-8 w-8 text-slate-400" /><p className={tone.strong} style={{ fontWeight: 800 }}>{loading ? 'Loading Provider Console…' : empty}</p></div>}
  </motion.section>;
}

function BookingCard({ booking, index, isDarkMode, tone, mode, canSeeFinancials, selected, onSelect, onCheckIn, canManage, updating, nowMs }: any) {
  const tier = tierStyle(booking.tier); const TierIcon = tier.icon;
  return <motion.article className={`rounded-[22px] border p-4 ${selected ? 'ring-2 ring-cyan-300' : ''} ${tone.soft}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: index * 0.04 }} data-testid={mode === 'request' ? 'provider-request-row' : 'provider-booking-row'}>
    <button type="button" onClick={() => onSelect?.(booking)} className="w-full text-left" data-testid={`${mode === 'request' ? 'provider-request-detail' : 'provider-booking-detail'}-${booking.id}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${tier.cls}`} style={{ fontWeight: 950 }}><TierIcon className="h-3 w-3" />{tier.label}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${isDarkMode ? 'border-cyan-300 bg-cyan-950 text-cyan-50' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`} style={{ fontWeight: 900 }}>{booking.requestStatus ?? booking.status}</span></div><h3 className={`mt-2 text-[18px] ${tone.strong}`} style={{ fontWeight: 850 }}>{booking.serviceTitle}</h3><p className={`mt-1 text-[13px] ${tone.muted}`}>{booking.guestName} · {booking.patchLabel ?? 'Patch pending'}</p></div><div className="text-left md:text-right"><p className={`text-[22px] ${tone.strong}`} style={{ fontWeight: 900 }}>{formatCents(booking.priceCents)}</p><p className={`text-[12px] ${tone.muted}`}>{canSeeFinancials ? `Payout est. ${formatCents(booking.cashFlow?.providerPayoutEstimateCents ?? booking.priceCents)}` : 'Financials owner-only'}</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><Mini icon={CalendarClock} label="Start" value={formatDate(booking.startsAt)} tone={tone} /><Mini icon={Clock} label={mode === 'request' ? 'Hold timer' : 'Handoff'} value={mode === 'request' ? minutesUntil(booking.expiresAt, nowMs) : booking.status === 'in_progress' ? 'Checked in' : 'Check-in ready'} tone={tone} /><Mini icon={DollarSign} label="Payment" value={booking.paymentStatus ?? 'Pending'} tone={tone} /></div>
    </button>
    {mode === 'active' && booking.status !== 'completed' && booking.status !== 'cancelled' && <div className="mt-4 flex justify-end"><button type="button" onClick={() => onCheckIn?.(booking)} disabled={!canManage || updating || booking.status === 'in_progress'} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 850 }} data-testid={`provider-booking-checkin-${booking.id}`}><CheckCircle2 className="h-4 w-4" />{booking.status === 'in_progress' ? 'Checked In' : updating ? 'Checking In…' : 'Check In Guest'}</button></div>}
  </motion.article>;
}

function RequestDetailPanel(props: any) {
  const { booking, tone, canOperate, canCheckIn, busy, declineReason, counterAmount, counterMessage, onDeclineReason, onCounterAmount, onCounterMessage, onAccept, onDecline, onCounter, onComplete, onCheckIn, nowMs } = props;
  if (!booking) return <aside className={`rounded-[26px] border p-6 shadow-xl ${tone.panel}`} data-testid="provider-request-detail-empty"><Inbox className="mb-3 h-8 w-8 text-cyan-400" /><h2 className={`text-[22px] ${tone.strong}`} style={{ fontWeight: 850 }}>Select a request</h2><p className={`mt-2 text-[13px] leading-6 ${tone.muted}`}>Open an incoming request or active booking to review guest notes, logistics, hold timing, and available Provider actions.</p></aside>;
  const tier = tierStyle(booking.tier); const TierIcon = tier.icon;
  const isRequest = booking.requestStatus && booking.requestStatus !== 'ACCEPTED' && booking.requestStatus !== 'COMPLETED';
  const canComplete = booking.status !== 'completed' && booking.status !== 'cancelled';
  const counterCents = centsFromDollars(counterAmount);
  return <aside className={`rounded-[26px] border p-5 shadow-xl ${tone.panel}`} data-testid="provider-request-detail-panel">
    <div className="flex items-start justify-between gap-3"><div><p className={`text-[11px] uppercase tracking-[0.18em] ${tone.muted}`} style={{ fontWeight: 900 }}>Request Detail</p><h2 className={`mt-1 text-[24px] ${tone.strong}`} style={{ fontWeight: 900 }}>{booking.serviceTitle}</h2></div><span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] ${tier.cls}`} style={{ fontWeight: 950 }}><TierIcon className="h-3.5 w-3.5" />{tier.label}</span></div>
    <div className="mt-4 grid gap-2"><Mini icon={CalendarClock} label="Arrival" value={formatDate(booking.startsAt)} tone={tone} /><Mini icon={Clock} label="Hold expires" value={minutesUntil(booking.expiresAt, nowMs)} tone={tone} /><Mini icon={DollarSign} label="Amount" value={`${formatCents(booking.priceCents)} ${booking.currency}`} tone={tone} /></div>
    <div className={`mt-4 rounded-2xl border p-4 ${tone.soft}`}><p className={`text-[12px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 850 }}>Guest + logistics</p><p className={`mt-2 text-[14px] ${tone.strong}`} style={{ fontWeight: 800 }}>{booking.guestName ?? 'Guest'} · {booking.patchLabel ?? 'Patch pending'}</p><p className={`mt-2 text-[13px] leading-5 ${tone.muted}`}>Notes: {booking.guestNotes ?? 'No guest notes supplied.'}</p><p className={`mt-1 text-[13px] leading-5 ${tone.muted}`}>Logistics: {booking.logisticsMode ?? 'Standard Provider handoff'}</p></div>
    {booking.counterOfferCents != null && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><p className="text-[12px] uppercase tracking-[0.14em]" style={{ fontWeight: 900 }}>Counter offer</p><p className="mt-1 text-[14px]" style={{ fontWeight: 850 }}>{formatCents(booking.counterOfferCents)} {booking.counterOfferCurrency ?? booking.currency}</p><p className="text-[13px]">{booking.counterOfferMessage ?? 'Counter offer awaiting guest response.'}</p></div>}
    {!canOperate && <p className={`mt-4 rounded-2xl border px-4 py-3 text-[13px] ${tone.soft}`} style={{ fontWeight: 750 }}>Owner or Manager access is required for accept, decline, counter offer, and capture actions.</p>}
    {isRequest && <div className="mt-4 grid gap-3" data-testid="provider-request-actions">
      <button type="button" onClick={() => onAccept(booking)} disabled={!canOperate || busy === 'accept'} className="rounded-xl bg-emerald-500 px-4 py-3 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60" data-testid="provider-request-accept">{busy === 'accept' ? 'Accepting…' : 'Accept Request'}</button>
      <div className="grid gap-2"><input value={counterAmount} onChange={(e) => onCounterAmount(e.target.value)} className={`rounded-xl border px-3 py-2 text-[13px] ${tone.input}`} placeholder="Counter amount" data-testid="provider-request-counter-amount" /><textarea value={counterMessage} onChange={(e) => onCounterMessage(e.target.value)} className={`min-h-[74px] rounded-xl border px-3 py-2 text-[13px] ${tone.input}`} placeholder="Counter offer note" data-testid="provider-request-counter-message" /><button type="button" onClick={() => onCounter(booking)} disabled={!canOperate || busy === 'counter' || counterCents < 50} className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-[13px] font-black text-cyan-950 disabled:cursor-not-allowed disabled:opacity-60" data-testid="provider-request-counter">{busy === 'counter' ? 'Sending…' : 'Send Counter Offer'}</button></div>
      <div className="grid gap-2"><textarea value={declineReason} onChange={(e) => onDeclineReason(e.target.value)} className={`min-h-[74px] rounded-xl border px-3 py-2 text-[13px] ${tone.input}`} placeholder="Optional decline reason" data-testid="provider-request-decline-reason" /><button type="button" onClick={() => onDecline(booking)} disabled={!canOperate || busy === 'decline'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[13px] font-black text-red-900 disabled:cursor-not-allowed disabled:opacity-60" data-testid="provider-request-decline"><XCircle className="h-4 w-4" />{busy === 'decline' ? 'Declining…' : 'Decline'}</button></div>
    </div>}
    {!isRequest && <div className="mt-4 grid gap-3" data-testid="provider-active-actions"><button type="button" onClick={() => onCheckIn(booking)} disabled={!canCheckIn || busy === 'check-in' || booking.status === 'in_progress' || !canComplete} className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{booking.status === 'in_progress' ? 'Checked In' : busy === 'check-in' ? 'Checking In…' : 'Check In Guest'}</button><button type="button" onClick={() => onComplete(booking)} disabled={!canOperate || busy === 'complete' || !canComplete} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-60" data-testid="provider-booking-complete-capture"><MessageSquare className="h-4 w-4" />{busy === 'complete' ? 'Completing…' : 'Complete & Capture'}</button></div>}
  </aside>;
}

function Mini({ icon: Icon, label, value, tone }: any) {
  return <div className={`rounded-2xl border p-3 ${tone.panel}`}><Icon className="mb-1 h-4 w-4 text-cyan-400" /><p className={`text-[11px] uppercase tracking-[0.12em] ${tone.muted}`} style={{ fontWeight: 850 }}>{label}</p><p className={`mt-1 text-[13px] ${tone.strong}`} style={{ fontWeight: 800 }}>{value}</p></div>;
}