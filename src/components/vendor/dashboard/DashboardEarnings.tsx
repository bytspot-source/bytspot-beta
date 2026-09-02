import { useMemo } from 'react';
import { motion } from 'motion/react';
import { DollarSign, Calendar, CreditCard, ArrowUpRight, LineChart as LineChartIcon, PieChart, Receipt } from 'lucide-react';
import type { ProviderReviewState } from '../../../utils/providerApproval';
import { summarizeBookingEarnings, useProviderDashboardData, type DashboardBookingSummary } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardEarningsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
  reviewState?: ProviderReviewState | null;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  return CURRENCY_FORMATTER.format(Math.round(cents) / 100);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Pending';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function nextPayoutLabel(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildDailyRevenue(bookings: DashboardBookingSummary[]) {
  const buckets = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status !== 'completed') continue;
    const date = new Date(booking.startsAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + booking.cashFlow.providerPayoutEstimateCents);
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-7);
}

function buildServiceTypeBreakdown(bookings: DashboardBookingSummary[], services: { id: string; category?: string | null }[]) {
  const categoryByService = new Map(services.map((service) => [service.id, service.category || 'General']));
  const totals = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === 'cancelled' || booking.status === 'pending') continue;
    const category = booking.serviceId ? categoryByService.get(booking.serviceId) ?? 'General' : 'General';
    totals.set(category, (totals.get(category) ?? 0) + booking.cashFlow.providerPayoutEstimateCents);
  }
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
}

function buildConicGradient(rows: Array<[string, number]>, total: number) {
  let cursor = 0;
  return `conic-gradient(${rows.map(([, cents], index) => {
    const start = cursor;
    cursor += (cents / total) * 100;
    return `${['#22d3ee', '#a78bfa', '#34d399', '#f59e0b'][index % 4]} ${start}% ${cursor}%`;
  }).join(', ')})`;
}

export function DashboardEarnings({ isDarkMode, access, reviewState }: DashboardEarningsProps) {
  const data = useProviderDashboardData();
  const approved = reviewState?.status === 'approved';
  const stripeReady = approved && data.connect.payoutsEnabled;
  const totals = useMemo(() => summarizeBookingEarnings(data.bookings), [data.bookings]);
  const hasBookings = data.bookings.length > 0;
  const hasServices = data.activeServices > 0;
  const revenueTrend = useMemo(() => buildDailyRevenue(data.bookings), [data.bookings]);
  const serviceTypeBreakdown = useMemo(() => buildServiceTypeBreakdown(data.bookings, data.services), [data.bookings, data.services]);
  const maxTrendCents = Math.max(1, ...revenueTrend.map(([, cents]) => cents));
  const totalBreakdownCents = Math.max(1, serviceTypeBreakdown.reduce((sum, [, cents]) => sum + cents, 0));
  const bookedDeltaCents = totals.thisMonthBookedCents - totals.lastMonthBookedCents;
  const bookedDeltaLabel = bookedDeltaCents === 0 ? 'Flat vs last month' : `${bookedDeltaCents > 0 ? '+' : '-'}${formatCents(Math.abs(bookedDeltaCents))} vs last month`;
  const recentTransactions = useMemo(
    () => data.bookings.filter((booking) => booking.status === 'completed' || booking.status === 'funds_authorized' || booking.status === 'confirmed' || booking.status === 'in_progress').slice(0, 6),
    [data.bookings],
  );
  const tone = {
    strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-50' : 'text-slate-700',
    muted: isDarkMode ? 'text-slate-100' : 'text-slate-600',
    panel: isDarkMode ? 'border-slate-500 bg-slate-800 shadow-black/45' : 'border-slate-200 bg-white shadow-slate-200/70',
    soft: isDarkMode ? 'border-slate-500 bg-slate-700' : 'border-slate-200 bg-slate-50',
  };

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  if (!access.canSeeFinancials) {
    return (
      <div className="rounded-[28px] border-2 border-amber-300 bg-amber-900 p-6 text-white shadow-xl shadow-black/40">
        <h1 className="text-[28px]" style={{ fontWeight: 850 }}>Owner approval required</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-6 text-amber-50">Earnings, payout timing, and transactions are visible to Owners only. Managers and Staff can continue with bookings, calendar operations, and listing setup.</p>
      </div>
    );
  }

  const trackingNote = data.loading
    ? 'Syncing payout history'
    : !hasBookings
      ? 'Tracking activates after the first confirmed payout'
      : stripeReady
        ? `Tracking ${totals.paidBookingCount} settled and ${totals.pendingBookingCount} pending booking${totals.pendingBookingCount === 1 ? '' : 's'}`
        : approved
          ? 'Finish Stripe verification to start tracking revenue'
          : 'Payouts are on hold until manual verification clears';
  const estimatedNextPayout = stripeReady ? nextPayoutLabel() : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
            <h1 className={`text-[34px] mb-2 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Earnings
        </h1>
        <p className={`text-[17px] ${tone.body}`} style={{ fontWeight: 400 }}>
          Track your revenue and payouts
        </p>
      </motion.div>

      <motion.div
        data-testid="provider-earnings-review-state"
        className={`rounded-[22px] border-2 p-5 shadow-xl shadow-black/40 ${approved ? 'border-emerald-300 bg-emerald-900' : 'border-amber-300 bg-amber-900'} text-white`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.08 }}
      >
        <p className="text-[12px] uppercase tracking-[0.18em] text-slate-100" style={{ fontWeight: 850 }}>Provider review</p>
        <h2 className="mt-2 text-[22px]" style={{ fontWeight: 850 }}>{reviewState?.label ?? 'Pending Verification'}</h2>
        <p className="mt-2 max-w-2xl text-slate-50 text-[14px] leading-6">
          {approved ? 'Payouts and marketplace revenue tracking are cleared for normal operation.' : 'Revenue tracking remains available, but payouts stay in verification hold until required metadata and Stripe Connect are approved.'}
        </p>
      </motion.div>

      <motion.div
        data-testid="provider-earnings-stripe-readiness"
        className={`rounded-[22px] border-2 p-5 shadow-xl shadow-black/40 ${stripeReady ? 'border-emerald-300 bg-emerald-900' : 'border-cyan-300 bg-cyan-900'} text-white`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.09 }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] text-slate-100" style={{ fontWeight: 850 }}>Stripe Connect</p>
            <h2 className="mt-2 text-[22px]" style={{ fontWeight: 850 }}>{stripeReady ? 'Payout setup complete' : 'Complete payout setup'}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-50">
              {stripeReady ? `Estimated next payout: ${estimatedNextPayout}. Pending and paid amounts stay separated below.` : 'Connect Stripe to unlock payouts, settlement timing, and transaction reconciliation.'}
            </p>
          </div>
          {!stripeReady && (
            <button type="button" className="rounded-2xl bg-white px-4 py-3 text-[13px] text-slate-950 shadow-xl shadow-black/20" style={{ fontWeight: 850 }}>
              Complete Payout Setup
            </button>
          )}
        </div>
      </motion.div>

      {/* Empty-state ladder: unauth → no-services → no-bookings → live totals */}
      {!data.loading && !data.authenticated ? (
        <motion.div
          data-testid="provider-earnings-empty-unauth"
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 text-white shadow-lg shadow-black/45"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <p className="text-[15px]" style={{ fontWeight: 700 }}>Sign in to view earnings</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-100">Lifetime payouts, monthly trends, and pending settlements appear here once you sign in with your provider account.</p>
        </motion.div>
      ) : !data.loading && !hasServices ? (
        <motion.div
          data-testid="provider-earnings-empty-no-services"
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 text-white shadow-lg shadow-black/45"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <p className="text-[15px]" style={{ fontWeight: 700 }}>No services in Station Mode yet</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-100">Earnings track payouts from confirmed marketplace bookings. Publish a service so guests can start booking.</p>
        </motion.div>
      ) : (
        <>
          {!data.loading && !hasBookings && (
            <motion.div
              data-testid="provider-earnings-empty-no-bookings"
              className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-5 text-white shadow-lg shadow-black/45"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 }}
            >
              <p className="text-[14px]" style={{ fontWeight: 700 }}>No bookings yet</p>
              <p className="mt-1 text-[13px] leading-5 text-slate-100">{data.activeServices} active service{data.activeServices === 1 ? ' is' : 's are'} available. Totals will populate after the first confirmed booking.</p>
            </motion.div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="provider-earnings-stats">
            {/* Revenue Breakdown Card */}
            <motion.div
              data-testid="provider-earnings-card-revenue-breakdown"
              className="col-span-1 rounded-[20px] border-2 border-emerald-300 bg-slate-800 p-6 shadow-xl shadow-black/45 md:col-span-2 lg:col-span-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 }}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-900">
                <DollarSign className="w-6 h-6 text-green-400" strokeWidth={2.5} />
              </div>
              <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
                Total Revenue Breakdown
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-100">Gross Revenue</span>
                  <div data-testid="provider-earnings-value-gross" className="text-[18px] text-white" style={{ fontWeight: 700 }}>
                    {data.loading ? '—' : formatCents(totals.totalGrossCents)}
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-100">Platform Fees</span>
                  <div data-testid="provider-earnings-value-fees" className="text-[18px] text-amber-300" style={{ fontWeight: 700 }}>
                    {data.loading ? '—' : `-${formatCents(totals.totalPlatformFeeCents)}`}
                  </div>
                </div>
                <div className="flex items-baseline justify-between border-t border-slate-500 pt-2">
                  <span className="text-[11px] text-slate-50" style={{ fontWeight: 600 }}>Your Payout</span>
                  <div data-testid="provider-earnings-value-payout" className="text-[18px] text-green-300" style={{ fontWeight: 700 }}>
                    {data.loading ? '—' : formatCents(totals.totalPayoutCents)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-200" style={{ fontWeight: 600 }}>
                {totals.paidBookingCount} settled booking{totals.paidBookingCount === 1 ? '' : 's'}
              </div>
            </motion.div>

            {/* This Month Card */}
            <motion.div
              data-testid="provider-earnings-card-this-month"
              className="rounded-[20px] border-2 border-cyan-300 bg-slate-800 p-6 shadow-xl shadow-black/45"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.15 }}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-cyan-300 bg-cyan-900">
                <Calendar className="w-6 h-6 text-cyan-400" strokeWidth={2.5} />
              </div>
              <div data-testid="provider-earnings-value-this-month" className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
                {data.loading ? '—' : formatCents(totals.thisMonthBookedCents)}
              </div>
              <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
                This Month
              </div>
              <div className="mt-2 text-[11px] text-slate-200" style={{ fontWeight: 600 }}>
                Booked value · {bookedDeltaLabel}
              </div>
            </motion.div>

            {/* Last Month Card */}
            <motion.div
              data-testid="provider-earnings-card-last-month"
              className="rounded-[20px] border-2 border-violet-300 bg-slate-800 p-6 shadow-xl shadow-black/45"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.2 }}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-violet-300 bg-violet-900">
                <CreditCard className="w-6 h-6 text-purple-400" strokeWidth={2.5} />
              </div>
              <div data-testid="provider-earnings-value-last-month" className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
                {data.loading ? '—' : formatCents(totals.lastMonthBookedCents)}
              </div>
              <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
                Last Month
              </div>
              <div className="mt-2 text-[11px] text-slate-200" style={{ fontWeight: 600 }}>
                Booked value last calendar month
              </div>
            </motion.div>

            {/* Pending Payouts Card */}
            <motion.div
              data-testid="provider-earnings-card-pending"
              className="rounded-[20px] border-2 border-amber-300 bg-slate-800 p-6 shadow-xl shadow-black/45"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.25 }}
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-900">
                <ArrowUpRight className="w-6 h-6 text-yellow-400" strokeWidth={2.5} />
              </div>
              <div data-testid="provider-earnings-value-pending" className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
                {data.loading ? '—' : formatCents(totals.pendingPayoutCents)}
              </div>
              <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
                Pending Payouts
              </div>
              <div className="mt-2 text-[11px] text-slate-200" style={{ fontWeight: 600 }}>
                {totals.pendingBookingCount} confirmed booking{totals.pendingBookingCount === 1 ? '' : 's'} awaiting settlement
              </div>
            </motion.div>
          </div>
        </>
      )}

      <motion.div
        className={`rounded-[20px] border-2 p-6 shadow-xl ${tone.panel}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.28 }}
        data-testid="provider-earnings-service-type-breakdown"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-[22px] ${tone.strong}`} style={{ fontWeight: 700 }}>By service type</h2>
            <p className={`mt-1 text-[13px] ${tone.muted}`}>Booked value from confirmed, in-progress, and settled bookings.</p>
          </div>
          <PieChart className="h-6 w-6 text-cyan-300" strokeWidth={2.5} />
        </div>
        {serviceTypeBreakdown.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
            <div
              className="mx-auto h-40 w-40 rounded-full border border-slate-500"
              style={{ background: buildConicGradient(serviceTypeBreakdown, totalBreakdownCents) }}
              aria-hidden
            />
            <div className="space-y-3">
              {serviceTypeBreakdown.map(([category, cents], index) => (
                <div key={category} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${tone.soft}`}>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b'][index % 4] }} /> <span className={tone.strong}>{category}</span></span>
                  <span className={tone.strong} style={{ fontWeight: 800 }}>{formatCents(cents)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`rounded-[18px] border border-dashed px-6 py-8 text-center ${tone.soft}`}>
            <p className={`text-[15px] ${tone.strong}`} style={{ fontWeight: 700 }}>No service mix yet</p>
            <p className={`mt-1 text-[13px] ${tone.muted}`}>Service-type revenue appears after confirmed bookings sync.</p>
          </div>
        )}
      </motion.div>

      {/* Revenue Trend */}
      <motion.div
        className={`rounded-[20px] border-2 p-6 shadow-xl ${tone.panel}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
        data-testid="provider-earnings-revenue-empty"
      >
        <h2 className={`text-[22px] mb-2 ${tone.strong}`} style={{ fontWeight: 600 }}>Revenue Trend</h2>
        <p className={`text-[13px] mb-6 ${tone.muted}`}>{trackingNote}</p>
        {revenueTrend.length > 0 ? (
          <div className={`grid h-[260px] items-end gap-3 rounded-[18px] border p-5 ${tone.soft}`} style={{ gridTemplateColumns: `repeat(${Math.min(revenueTrend.length, 7)}, minmax(0, 1fr))` }} data-testid="provider-earnings-revenue-bars">
            {revenueTrend.map(([day, cents]) => (
              <div key={day} className="flex h-full flex-col justify-end gap-2 text-center">
                <div className="mx-auto w-full max-w-[54px] rounded-t-2xl bg-gradient-to-t from-emerald-500 to-cyan-300" style={{ height: `${Math.max(10, (cents / maxTrendCents) * 100)}%` }} />
                <p className={`text-[11px] ${tone.muted}`}>{formatShortDate(day)}</p>
                <p className={`text-[12px] ${tone.strong}`} style={{ fontWeight: 800 }}>{formatCents(cents)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={`flex h-[260px] flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed px-6 text-center ${tone.soft}`}>
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone.soft}`}>
              <LineChartIcon className="h-6 w-6 text-cyan-400" strokeWidth={2.5} />
            </div>
            <p className={`text-[15px] ${tone.strong}`} style={{ fontWeight: 700 }}>No settled revenue yet</p>
            <p className={`max-w-md text-[13px] leading-5 ${tone.muted}`}>{stripeReady ? 'Completed marketplace bookings will populate this chart automatically.' : 'Once Stripe Connect is verified and a guest completes a booking, daily revenue will appear here.'}</p>
          </div>
        )}
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        className={`rounded-[20px] border-2 p-6 shadow-xl ${tone.panel}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
        data-testid="provider-earnings-transactions-empty"
      >
        <h2 className={`text-[22px] mb-6 ${tone.strong}`} style={{ fontWeight: 600 }}>Recent Transactions</h2>
        {recentTransactions.length > 0 ? (
          <div className="space-y-3" data-testid="provider-earnings-transactions-list">
            {recentTransactions.map((booking) => (
              <div key={booking.id} className={`flex items-center justify-between gap-3 rounded-[18px] border p-4 ${tone.soft}`}>
                <div>
                  <p className={`text-[14px] ${tone.strong}`} style={{ fontWeight: 800 }}>{booking.serviceTitle}</p>
                  <p className={`text-[12px] ${tone.muted}`}>{formatShortDate(booking.startsAt)} · {booking.status.replace('_', ' ')}</p>
                </div>
                <p className={booking.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'} style={{ fontWeight: 800 }}>{formatCents(booking.cashFlow.providerPayoutEstimateCents)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed px-6 py-10 text-center ${tone.soft}`}>
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone.soft}`}><Receipt className="h-6 w-6 text-cyan-400" strokeWidth={2.5} /></div>
            <p className={`text-[15px] ${tone.strong}`} style={{ fontWeight: 700 }}>No transactions yet</p>
            <p className={`max-w-md text-[13px] leading-5 ${tone.muted}`}>Marketplace payouts and refunds will appear here once your first booking settles through Stripe.</p>
          </div>
        )}
      </motion.div>

      {/* Payout Info */}
      <motion.div
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
        data-testid="provider-earnings-next-payout"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 600 }}>Next Payout</h3>
            <p className="mb-4 text-[15px] text-slate-100" style={{ fontWeight: 500 }}>
              {stripeReady
                ? 'Confirmed bookings will be released to your Stripe account on the next payout cycle.'
                : approved
                  ? 'Finish Stripe verification to start receiving automatic payouts.'
                  : 'Payout release begins once manual verification is complete.'}
            </p>
            <div data-testid="provider-earnings-next-payout-value" className="text-[28px] text-green-400" style={{ fontWeight: 700 }}>
              {data.loading ? '—' : formatCents(totals.pendingPayoutCents)}
            </div>
            <div className="mt-1 text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
              {totals.pendingBookingCount > 0
                ? `Across ${totals.pendingBookingCount} confirmed booking${totals.pendingBookingCount === 1 ? '' : 's'}`
                : stripeReady ? 'No payout currently scheduled' : 'Scheduled once verification is complete'}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
