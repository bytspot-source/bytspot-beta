import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarClock, Clock, DollarSign, Inbox, ShieldCheck } from 'lucide-react';
import { useProviderDashboardData, type DashboardBookingStatus, type DashboardBookingSummary } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';
import { trpc } from '../../../utils/trpc';

interface DashboardBookingsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type BookingFilter = 'all' | 'active' | 'upcoming' | 'completed';

const STATUS_GUIDANCE: Record<BookingFilter, { headline: string; body: string; checklist: string[] }> = {
  all: {
    headline: 'All bookings overview',
    body: 'See every booking across your Provider services. Switch filters to focus on the next operational step.',
    checklist: ['Triage active bookings first.', 'Confirm service and patch assignments.', 'Review payout estimates after each handoff.'],
  },
  active: {
    headline: 'Active arrivals in progress',
    body: 'A guest is on-site or mid-service. Keep response time under five minutes and update internal handoff notes.',
    checklist: ['Verify the patch label.', 'Confirm staff coverage.', 'Prepare completion and payout review.'],
  },
  upcoming: {
    headline: 'Upcoming reservations',
    body: 'Confirm access instructions, parking notes, and prep before the guest arrives.',
    checklist: ['Send arrival instructions.', 'Verify the service is still active.', 'Stage any required staff or gear.'],
  },
  completed: {
    headline: 'Recently completed',
    body: 'Use this view for reconciliation: review payouts, capture review prompts, and follow up on escalations.',
    checklist: ['Cross-check payouts.', 'Request a guest review.', 'Resolve open patch or compliance flags.'],
  },
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatCents(cents: number): string {
  return CURRENCY_FORMATTER.format(Math.round(cents) / 100);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time pending';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isUpcoming(booking: DashboardBookingSummary, now = new Date()): boolean {
  const startsAt = new Date(booking.startsAt);
  return Number.isFinite(startsAt.getTime()) && startsAt.getTime() > now.getTime() && booking.status !== 'cancelled';
}

function matchesFilter(booking: DashboardBookingSummary, filter: BookingFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return booking.status === 'funds_authorized' || booking.status === 'confirmed' || booking.status === 'in_progress';
  if (filter === 'completed') return booking.status === 'completed';
  return isUpcoming(booking);
}

export function DashboardBookings({ isDarkMode, access }: DashboardBookingsProps) {
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, DashboardBookingStatus>>({});
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const data = useProviderDashboardData();
  const tone = {
    page: isDarkMode ? 'text-white' : 'text-slate-950',
    strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-50' : 'text-slate-700',
    muted: isDarkMode ? 'text-slate-100' : 'text-slate-600',
    panel: isDarkMode ? 'border-slate-500 bg-slate-800 shadow-black/45' : 'border-slate-200 bg-white shadow-slate-200/70',
    soft: isDarkMode ? 'border-slate-500 bg-slate-700' : 'border-slate-200 bg-slate-50',
    empty: isDarkMode ? 'border-slate-500 bg-slate-800' : 'border-slate-200 bg-white',
  };
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

  const bookings = useMemo(() => data.bookings.map((booking) => ({ ...booking, status: statusOverrides[booking.id] ?? booking.status })), [data.bookings, statusOverrides]);

  const counts = useMemo(() => ({
    all: bookings.length,
    active: bookings.filter((booking) => matchesFilter(booking, 'active')).length,
    upcoming: bookings.filter((booking) => matchesFilter(booking, 'upcoming')).length,
    completed: bookings.filter((booking) => matchesFilter(booking, 'completed')).length,
  }), [bookings]);

  const filteredBookings = useMemo(
    () => bookings.filter((booking) => matchesFilter(booking, filter)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [bookings, filter],
  );
  const guidance = STATUS_GUIDANCE[filter];
  const canManageHandoff = data.authenticated && (access.role === 'owner' || access.role === 'manager' || access.role === 'staff');

  const checkInBooking = async (booking: DashboardBookingSummary) => {
    if (!canManageHandoff || updatingBookingId) return;
    setUpdatingBookingId(booking.id);
    setHandoffMessage(null);
    try {
      const result = await trpc.vendors.updateBookingStatus.mutate({ bookingId: booking.id, status: 'in_progress' });
      const updatedStatus = ((result as any)?.booking?.status ?? 'in_progress') as DashboardBookingStatus;
      setStatusOverrides((prev) => ({ ...prev, [booking.id]: updatedStatus }));
      setHandoffMessage('Guest checked in. The booking is now marked in progress for the Provider team.');
    } catch (err: any) {
      setHandoffMessage(err?.message ?? 'Unable to check in this booking.');
    } finally {
      setUpdatingBookingId(null);
    }
  };
  const emptyMessage = data.loading
    ? 'Loading bookings from your Provider workspace…'
    : !data.authenticated
      ? 'Sign in to load bookings tied to your services.'
      : data.totalServices === 0
        ? 'Publish your first service from My Services so guests can request bookings.'
        : filter === 'all'
          ? 'New Provider bookings will surface here automatically.'
          : `No ${filter} bookings yet. They will appear here as guests confirm.`;

  const filters: Array<{ id: BookingFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'completed', label: 'Completed', count: counts.completed },
  ];

  return (
    <div className={`space-y-6 ${tone.page}`}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <h1 className={`mb-2 text-[34px] ${tone.strong}`} style={{ fontWeight: 700 }}>Bookings</h1>
        <p className={`text-[17px] ${tone.body}`} style={{ fontWeight: 500 }}>Manage reservations and service handoffs</p>
      </motion.div>

      <motion.div className={`rounded-[22px] border p-5 shadow-xl ${tone.panel}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }} data-testid="provider-bookings-guidance">
        <div className="flex items-center gap-2">
          <ShieldCheck className={isDarkMode ? 'h-5 w-5 text-cyan-200' : 'h-5 w-5 text-cyan-700'} strokeWidth={2.5} />
          <p className={`text-[13px] uppercase tracking-[0.18em] ${tone.muted}`} style={{ fontWeight: 850 }}>{guidance.headline}</p>
        </div>
        <p className={`mt-2 text-[14px] leading-6 ${tone.body}`} data-testid="provider-bookings-guidance-body">{guidance.body}</p>
        <ol className={`mt-3 grid gap-2 text-[13px] leading-5 ${tone.muted} md:grid-cols-3`} data-testid="provider-bookings-guidance-checklist">
          {guidance.checklist.map((item, index) => <li key={item}>{`${index + 1}. ${item}`}</li>)}
        </ol>
      </motion.div>

      {handoffMessage && <p className={`rounded-2xl border px-4 py-3 text-[13px] ${tone.soft}`} style={{ fontWeight: 700 }} data-testid="provider-bookings-handoff-message">{handoffMessage}</p>}

      <motion.div className="flex gap-2 overflow-x-auto pb-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }} data-testid="provider-bookings-filters">
        {filters.map((item) => (
          <button key={item.id} data-testid={`provider-bookings-filter-${item.id}`} onClick={() => setFilter(item.id)} className={`shrink-0 rounded-xl border px-4 py-2.5 transition-colors ${filter === item.id ? (isDarkMode ? 'border-cyan-300 bg-cyan-900 text-cyan-50' : 'border-cyan-400 bg-cyan-50 text-cyan-900') : `${tone.soft} ${tone.muted}`}`}>
            <span className="text-[15px]" style={{ fontWeight: 700 }}>{item.label} ({item.count})</span>
          </button>
        ))}
      </motion.div>

      {filteredBookings.length > 0 ? (
        <div className="grid gap-4" data-testid="provider-bookings-list">
          {filteredBookings.map((booking, index) => (
            <motion.article key={booking.id} className={`rounded-[22px] border p-5 shadow-xl ${tone.panel}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.14 + index * 0.04 }} data-testid="provider-booking-row">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={`text-[20px] ${tone.strong}`} style={{ fontWeight: 800 }}>{booking.serviceTitle}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${isDarkMode ? 'border-cyan-300 bg-cyan-900 text-cyan-50' : 'border-cyan-200 bg-cyan-50 text-cyan-800'}`} style={{ fontWeight: 900 }}>{booking.status.replace('_', ' ')}</span>
                  </div>
                  <p className={`mt-1 text-[13px] leading-5 ${tone.muted}`}>{booking.guestName ?? 'Guest'} · {booking.patchLabel ?? 'Patch pending'}</p>
                </div>
                <div className="grid gap-2 text-[13px] sm:grid-cols-3 lg:min-w-[440px]">
                  <div className={`rounded-2xl border p-3 ${tone.soft}`}><CalendarClock className="mb-1 h-4 w-4 text-cyan-400" /><p className={tone.muted}>Starts</p><p className={tone.strong}>{formatDateTime(booking.startsAt)}</p></div>
                  <div className={`rounded-2xl border p-3 ${tone.soft}`}><DollarSign className="mb-1 h-4 w-4 text-emerald-400" /><p className={tone.muted}>{access.canSeeFinancials ? 'Payout est.' : 'Payout'}</p><p className={tone.strong}>{access.canSeeFinancials ? formatCents(booking.cashFlow.providerPayoutEstimateCents) : 'Owner-only'}</p></div>
                  <div className={`rounded-2xl border p-3 ${tone.soft}`}><Clock className="mb-1 h-4 w-4 text-violet-400" /><p className={tone.muted}>Handoff</p><p className={tone.strong}>{canManageHandoff ? (booking.status === 'in_progress' ? 'Checked in' : 'Check-in ready') : 'Read-only'}</p></div>
                </div>
              </div>
              {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => checkInBooking(booking)} disabled={!canManageHandoff || updatingBookingId === booking.id || booking.status === 'in_progress'} className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 800 }} data-testid={`provider-booking-checkin-${booking.id}`}>
                    {booking.status === 'in_progress' ? 'Checked In' : updatingBookingId === booking.id ? 'Checking In…' : 'Check In Guest'}
                  </button>
                </div>
              )}
            </motion.article>
          ))}
        </div>
      ) : (
        <motion.div className={`rounded-[22px] border p-12 text-center shadow-xl ${tone.empty}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.2 }} data-testid="provider-bookings-empty">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border ${tone.soft}`}>
            <Inbox className={isDarkMode ? 'h-7 w-7 text-slate-200' : 'h-7 w-7 text-slate-700'} strokeWidth={2.5} />
          </div>
          <p className={`text-[17px] ${tone.strong}`} style={{ fontWeight: 700 }}>{data.loading ? 'Loading bookings…' : 'No bookings yet'}</p>
          <p className={`mx-auto mt-2 max-w-md text-[14px] leading-6 ${tone.muted}`} style={{ fontWeight: 500 }}>{emptyMessage}</p>
        </motion.div>
      )}
    </div>
  );
}