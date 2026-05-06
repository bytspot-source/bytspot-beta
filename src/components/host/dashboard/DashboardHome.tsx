import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  ExternalLink,
  Inbox,
  LineChart as LineChartIcon,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react';
import type { ProviderReviewState } from '../../../utils/providerApproval';
import {
  summarizeBookingEarnings,
  useProviderDashboardData,
  type DashboardBookingSummary,
  type DashboardConnectStatus,
} from '../../../utils/providerDashboardData';
import { trpc } from '../../../utils/trpc';
import { guidanceForRole, roleLabel, type ProviderDashboardAccess } from './providerDashboardAccess';
import type { DashboardView } from './ProviderDashboardLayout';

const STRIPE_CONNECT_RETURN_PATH = '/provider/connect/return';
const STRIPE_CONNECT_REFRESH_PATH = '/provider/connect/refresh';

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  return CURRENCY_FORMATTER.format(Math.round(cents) / 100);
}

function isLiveBooking(booking: DashboardBookingSummary): boolean {
  return booking.status === 'confirmed' || booking.status === 'in_progress';
}

function isUpcomingBooking(booking: DashboardBookingSummary, now = new Date()): boolean {
  const startsAt = new Date(booking.startsAt);
  if (!Number.isFinite(startsAt.getTime())) return false;
  const next72Hours = now.getTime() + 72 * 60 * 60 * 1000;
  return startsAt.getTime() >= now.getTime() && startsAt.getTime() <= next72Hours && booking.status !== 'cancelled';
}

function formatBookingTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time pending';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type PayoutStatusLabel = 'Payouts Enabled' | 'Action Required' | 'Not Connected';

function getPayoutStatusLabel(connect: DashboardConnectStatus): PayoutStatusLabel {
  if (connect.payoutsEnabled && connect.chargesEnabled) return 'Payouts Enabled';
  if (connect.connected || connect.disabledReason) return 'Action Required';
  return 'Not Connected';
}

function getVendorDisplayName(): string {
  try {
    const user = JSON.parse(localStorage.getItem('bytspot_user') || '{}') as { name?: string; businessName?: string };
    return user.businessName || user.name || localStorage.getItem('bytspot_user_name') || 'Bytspot Provider';
  } catch {
    return localStorage.getItem('bytspot_user_name') || 'Bytspot Provider';
  }
}

interface DashboardHomeProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
  reviewState?: ProviderReviewState | null;
  onNavigate?: (view: DashboardView) => void;
}

export function DashboardHome({ isDarkMode, access, reviewState, onNavigate }: DashboardHomeProps) {
  void isDarkMode;
  const data = useProviderDashboardData();
  const approved = reviewState?.status === 'approved';
  const reviewLabel = reviewState?.label ?? 'Pending Verification';
  const stripeConnected = data.connect.connected;
  const stripeReady = approved && data.connect.payoutsEnabled;
  const payoutStatusLabel = getPayoutStatusLabel(data.connect);
  const payoutsEnabled = payoutStatusLabel === 'Payouts Enabled';
  const [connectStarting, setConnectStarting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const totals = useMemo(() => summarizeBookingEarnings(data.bookings), [data.bookings]);
  const liveBookings = useMemo(() => data.bookings.filter(isLiveBooking), [data.bookings]);
  const upcomingBookings = useMemo(
    () => data.bookings.filter((booking) => isUpcomingBooking(booking)).slice(0, 4),
    [data.bookings],
  );
  const activeBookingCount = liveBookings.length;
  const upcomingBookingCount = upcomingBookings.length;

  const handleConnectStripe = async () => {
    if (connectStarting) return;
    setConnectStarting(true);
    setConnectError(null);
    try {
      const result = await trpc.vendors.startOnboarding.mutate({
        displayName: data.vendor?.displayName || getVendorDisplayName(),
        refreshPath: STRIPE_CONNECT_REFRESH_PATH,
        returnPath: STRIPE_CONNECT_RETURN_PATH,
      });
      const onboardingUrl = typeof result?.url === 'string' ? result.url.trim() : '';
      if (onboardingUrl) {
        window.location.href = onboardingUrl;
        return;
      }
      setConnectError(result?.message ?? 'Stripe onboarding is not available yet.');
    } catch (err: any) {
      setConnectError(err?.message ?? 'Unable to start Stripe onboarding.');
    } finally {
      setConnectStarting(false);
    }
  };

  const springConfig = {
    type: 'spring' as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const totalListings = data.totalServices;
  const activeListings = data.activeServices;
  const listingHealth = data.listingHealth;
  const dash = '—';
  const hasEarnings = totals.totalPayoutCents > 0 || totals.pendingPayoutCents > 0;

  const priorityCards = [
    {
      testId: 'earnings',
      title: access.canSeeFinancials ? 'Total earnings' : 'Operational role',
      value: access.canSeeFinancials ? (data.loading ? dash : formatCents(totals.totalPayoutCents)) : roleLabel(access.role),
      detail: access.canSeeFinancials
        ? data.loading
          ? 'Syncing payout history'
          : totals.paidBookingCount > 0
            ? `${totals.paidBookingCount} settled booking${totals.paidBookingCount === 1 ? '' : 's'}`
            : 'No settled payouts yet'
        : access.role === 'manager' ? 'Payout settings stay owner-only' : 'Revenue hidden for this role',
      icon: access.canSeeFinancials ? DollarSign : ShieldCheck,
      tone: 'from-emerald-400/22 to-cyan-400/10',
    },
    {
      testId: 'active-bookings',
      title: 'Active bookings',
      value: data.loading ? dash : String(activeBookingCount),
      detail: data.loading
        ? 'Loading bookings'
        : activeBookingCount > 0
          ? `${upcomingBookingCount} upcoming in the next 72 hours`
          : 'Confirmed reservations appear here automatically',
      icon: Calendar,
      tone: 'from-cyan-400/22 to-blue-500/10',
    },
    {
      testId: 'listing-health',
      title: 'Listing health',
      value: data.loading ? dash : totalListings === 0 ? '0%' : `${listingHealth}%`,
      detail: data.loading
        ? 'Loading services'
        : totalListings === 0
          ? 'Publish your first marketplace service'
          : `${activeListings}/${totalListings} services live`,
      icon: ShieldCheck,
      tone: 'from-violet-400/22 to-fuchsia-500/10',
    },
    {
      testId: 'guest-rating',
      title: 'Guest rating',
      value: dash,
      detail: data.bookings.length > 0 ? 'Review aggregation connects when backend ratings ship' : 'Tracking activates after the first guest review',
      icon: Star,
      tone: 'from-amber-300/22 to-orange-500/10',
    },
  ];

  const payoutDetail = !approved
    ? 'Revenue tracking remains visible, but payout release waits for manual verification.'
    : !stripeConnected
      ? 'Connect a Stripe Express account to enable marketplace payouts.'
      : !stripeReady
        ? 'Stripe is connected. Finish remaining identity, tax, or bank verification to release payouts.'
        : 'Stripe Connect is verified. The next confirmed booking will be eligible for automatic payout.';

  const actionItems: Array<{ title: string; detail: string; icon: typeof Wallet; target: DashboardView }> = access.canManagePayouts
    ? [
        {
          title: approved && stripeReady ? 'Review payout settings' : approved ? 'Finish Stripe verification' : 'Complete provider verification',
          detail: approved && stripeReady
            ? 'Confirm bank account, tax ID, and payout schedule.'
            : approved
              ? 'Resolve remaining Stripe Connect requirements to enable payouts.'
              : 'Resolve required metadata before payouts go live.',
          icon: Wallet,
          target: 'settings',
        },
        {
          title: totalListings === 0 ? 'Publish your first service' : 'Refine listing health',
          detail: totalListings === 0 ? 'Add a marketplace service so guests can book.' : 'Update pricing, photos, and availability windows.',
          icon: MapPin,
          target: 'listings',
        },
        {
          title: 'Review the booking queue',
          detail: 'Confirm arrivals and prepare access instructions.',
          icon: CheckCircle2,
          target: 'bookings',
        },
      ]
    : [
        { title: 'Review today’s bookings', detail: 'Keep arrivals and departures current.', icon: Clock, target: 'bookings' },
        { title: 'Open the team calendar', detail: 'Coordinate handoffs across the schedule.', icon: Calendar, target: 'calendar' },
        { title: 'Audit listing details', detail: totalListings === 0 ? 'No services published yet.' : 'Confirm published services and access notes.', icon: MapPin, target: 'listings' },
      ];

  const handleAction = (target: DashboardView) => {
    if (onNavigate) onNavigate(target);
  };

  return (
    <div className="space-y-6">
      <motion.section className="relative overflow-hidden rounded-[32px] border border-white/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.26),transparent_32%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(5,5,8,0.96))] p-5 shadow-2xl lg:p-7" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[12px] text-cyan-100" style={{ fontWeight: 800 }}>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              {roleLabel(access.role)} command center · {access.isCottage ? 'Cottage business' : 'Provider business'}
            </div>
            <div data-testid="provider-dashboard-review-state" className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${approved ? 'border-emerald-300/25 bg-emerald-400/12 text-emerald-100' : 'border-amber-300/25 bg-amber-400/12 text-amber-100'}`} style={{ fontWeight: 850 }}>
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
              {reviewLabel}
            </div>
            <h1 className="max-w-2xl text-[36px] leading-[1.02] text-white lg:text-[48px]" style={{ fontWeight: 850 }}>
              {approved ? (access.role === 'staff' ? 'Today’s operations are ready.' : access.isCottage ? 'Your cottage business is ready for bookings.' : 'Your marketplace is approved and ready for bookings.') : 'Your provider application is pending verification.'}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-white/90 lg:text-[16px]">
              {approved ? guidanceForRole(access) : 'We found metadata that requires manual verification before marketplace payouts and automatic booking expansion are enabled.'}
            </p>
            {!approved && reviewState?.reasons?.length ? (
              <ul className="mt-4 grid gap-2 text-[13px] leading-5 text-amber-50/90" data-testid="provider-dashboard-review-reasons">
                {reviewState.reasons.map((reason) => <li key={reason} className="rounded-2xl border border-amber-200/15 bg-amber-400/10 px-3 py-2">{reason}</li>)}
              </ul>
            ) : null}
          </div>

          {access.canSeeFinancials ? (
          <div className="rounded-[26px] border border-slate-600/60 bg-slate-950/70 p-4 shadow-xl shadow-black/25 backdrop-blur-xl" data-testid="provider-dashboard-payout-card">
            <div data-testid="stripe-connect-payout-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.18em] text-white/80" style={{ fontWeight: 800 }}>Next payout</p>
	                  <p className="mt-1 text-[34px] text-white" style={{ fontWeight: 850 }} data-testid="provider-dashboard-next-payout-value">{data.loading ? dash : formatCents(totals.pendingPayoutCents)}</p>
                </div>
                <span
                  data-testid="stripe-connect-status-badge"
                  className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] ${payoutsEnabled ? 'bg-emerald-400/18 text-emerald-100 ring-1 ring-emerald-200/20' : 'bg-amber-400/18 text-amber-100 ring-1 ring-amber-200/20'}`}
                  style={{ fontWeight: 900 }}
                >
                  {payoutStatusLabel}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${payoutsEnabled ? 'w-full bg-gradient-to-r from-emerald-300 to-cyan-300' : 'w-1/3 bg-gradient-to-r from-amber-300 to-orange-300'}`} />
              </div>
              <p className="mt-3 text-[12px] leading-5 text-white/80">{payoutDetail}</p>
              {connectError && (
                <p className="mt-3 rounded-[14px] border border-amber-200/20 bg-amber-400/10 px-3 py-2 text-[12px] leading-5 text-amber-100">{connectError}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!payoutsEnabled && (
                  <button
                    type="button"
                    onClick={handleConnectStripe}
                    disabled={connectStarting}
                    data-testid="stripe-connect-onboarding-cta"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] text-black shadow-lg shadow-cyan-950/10 transition disabled:opacity-60"
                    style={{ fontWeight: 900 }}
                  >
                    {connectStarting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {stripeConnected ? 'Update Stripe Payout Account' : 'Connect Stripe for Payouts'}
                  </button>
                )}
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => handleAction('settings')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/90 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
                    style={{ fontWeight: 800 }}
                  >
                    Open payout settings <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          ) : (
          <div className="rounded-[26px] border border-cyan-200/40 bg-cyan-950/70 p-5 shadow-[0_18px_60px_rgba(34,211,238,0.12)] backdrop-blur-xl">
            <p className="text-[12px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 900 }}>Today’s operating plan</p>
	            <p className="mt-2 text-[26px] text-white" style={{ fontWeight: 850 }}>{data.loading ? dash : activeBookingCount} active · {data.loading ? dash : upcomingBookingCount} upcoming</p>
            <ol className="mt-4 space-y-2 text-[13px] leading-5 text-white/95">
              <li className="rounded-2xl border border-cyan-100/25 bg-black/50 px-3 py-2 shadow-inner">1. Open each active booking and confirm vehicle and location details.</li>
              <li className="rounded-2xl border border-cyan-100/25 bg-black/50 px-3 py-2 shadow-inner">2. Keep the calendar updated before handoff windows.</li>
              <li className="rounded-2xl border border-cyan-100/25 bg-black/50 px-3 py-2 shadow-inner">3. Escalate payout or account questions to the Owner.</li>
            </ol>
          </div>
          )}
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {priorityCards.map((card, index) => {
          const Icon = card.icon;
          return (
	            <motion.div key={card.title} data-testid={`provider-dashboard-priority-${card.testId}`} className={`rounded-[24px] border border-white/12 bg-gradient-to-br ${card.tone} p-5 shadow-xl backdrop-blur-xl`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.06 }} whileHover={{ y: -3 }}>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-black/25">
                  <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
              </div>
              <p className="text-[13px] text-white/90" style={{ fontWeight: 800 }}>{card.title}</p>
              <p className="mt-1 text-[31px] leading-none text-white" style={{ fontWeight: 850 }}>{card.value}</p>
              <p className="mt-3 text-[12px] leading-5 text-white/90">{card.detail}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.25 }}>
          {access.canSeeFinancials ? (
          <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] text-white" style={{ fontWeight: 800 }}>Earnings momentum</h2>
              <p className="mt-1 text-[14px] text-white/80">Daily revenue from confirmed marketplace bookings.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/90" style={{ fontWeight: 800 }}>This month</p>
	              <p className="text-[19px] text-white" style={{ fontWeight: 850 }}>{data.loading ? dash : formatCents(totals.thisMonthPayoutCents)}</p>
            </div>
          </div>
	          <div className="flex h-[260px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/12 bg-black/25 px-6 text-center" data-testid="provider-dashboard-earnings-empty">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5">
              <LineChartIcon className="h-6 w-6 text-cyan-200" strokeWidth={2.5} />
            </div>
	            <p className="text-[15px] text-white" style={{ fontWeight: 800 }}>{hasEarnings ? `${formatCents(totals.pendingPayoutCents)} pending payout` : 'Earnings will appear after your first payout'}</p>
	            <p className="max-w-md text-[13px] leading-5 text-white/80">{hasEarnings ? `${totals.pendingBookingCount} pending and ${totals.paidBookingCount} settled booking${data.bookings.length === 1 ? '' : 's'} are feeding this dashboard.` : stripeReady ? 'Stripe Connect is verified. Confirmed bookings will populate this chart automatically.' : 'Finish Stripe verification to start tracking confirmed booking revenue here.'}</p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => handleAction(stripeReady ? 'earnings' : 'settings')}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-cyan-200/40 bg-cyan-300/10 px-3 py-1.5 text-[12px] text-cyan-100 transition hover:bg-cyan-300/20"
                style={{ fontWeight: 800 }}
              >
                {stripeReady ? 'Open earnings' : 'Open payout settings'} <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          </>
          ) : (
          <div className="rounded-[22px] border border-cyan-200/40 bg-slate-900/95 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.45)]">
            <h2 className="text-[22px] text-white" style={{ fontWeight: 800 }}>Operational guidance</h2>
            <p className="mt-2 text-[14px] leading-6 text-white/90">Financial trends are Owner-only. This workspace keeps your role focused on bookings, calendars, listing quality, and customer handoffs.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-100/20 bg-cyan-950/60 p-3 text-white/95">Check active bookings</div>
              <div className="rounded-2xl border border-cyan-100/20 bg-cyan-950/60 p-3 text-white/95">Confirm upcoming arrivals</div>
              <div className="rounded-2xl border border-cyan-100/20 bg-cyan-950/60 p-3 text-white/95">Report listing issues</div>
            </div>
          </div>
          )}
        </motion.section>

        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.32 }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[21px] text-white" style={{ fontWeight: 800 }}>Today’s focus</h2>
              <p className="mt-1 text-[13px] text-white/90">Recommended next moves.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="space-y-3" data-testid="provider-dashboard-actions">
            {actionItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => handleAction(item.target)}
                  className="w-full rounded-[18px] border border-white/20 bg-white/10 p-4 text-left transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8">
                      <Icon className="h-5 w-5 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] text-white" style={{ fontWeight: 800 }}>{item.title}</p>
                        <ArrowUpRight className="h-4 w-4 text-white/70" />
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-white/90">{item.detail}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.38 }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[20px] text-white" style={{ fontWeight: 800 }}>Live bookings</h2>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-[12px] text-white/80" style={{ fontWeight: 800 }}>
	              <span className={`h-2 w-2 rounded-full ${activeBookingCount > 0 ? 'bg-emerald-300' : 'bg-white/50'}`} /> {activeBookingCount > 0 ? 'Live' : 'Idle'}
            </span>
          </div>
	          {activeBookingCount > 0 ? (
	            <div className="space-y-3" data-testid="provider-dashboard-live-list">
	              {liveBookings.slice(0, 3).map((booking) => (
	                <button key={booking.id} type="button" onClick={() => handleAction('bookings')} className="w-full rounded-[18px] border border-cyan-200/20 bg-cyan-300/10 p-4 text-left transition hover:bg-cyan-300/15">
	                  <div className="flex items-start justify-between gap-3">
	                    <div>
	                      <p className="text-[14px] text-white" style={{ fontWeight: 850 }}>{booking.serviceTitle}</p>
	                      <p className="mt-1 text-[12px] leading-5 text-white/75">{booking.guestName ?? 'Guest'} · {booking.patchLabel ?? 'Patch pending'}</p>
	                    </div>
	                    <span className="rounded-full border border-emerald-200/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] uppercase text-emerald-100" style={{ fontWeight: 900 }}>{booking.status.replace('_', ' ')}</span>
	                  </div>
	                </button>
	              ))}
	            </div>
	          ) : (
	            <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/12 bg-black/25 px-5 py-10 text-center" data-testid="provider-dashboard-live-empty">
	              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5">
	                <Inbox className="h-6 w-6 text-white/80" strokeWidth={2.5} />
	              </div>
	              <p className="text-[15px] text-white" style={{ fontWeight: 800 }}>No bookings in progress</p>
	              <p className="max-w-sm text-[13px] leading-5 text-white/80">Confirmed marketplace bookings will appear here in real time once guests check in.</p>
	              {onNavigate && (
	                <button
	                  type="button"
	                  onClick={() => handleAction('bookings')}
	                  className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] text-white/90 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
	                  style={{ fontWeight: 800 }}
	                >
	                  Open bookings <ArrowUpRight className="h-3.5 w-3.5" />
	                </button>
	              )}
	            </div>
	          )}
        </motion.section>

        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.44 }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[20px] text-white" style={{ fontWeight: 800 }}>Upcoming</h2>
            <span className="text-[12px] text-white/80" style={{ fontWeight: 750 }}>Next 72 hours</span>
          </div>
	          {upcomingBookingCount > 0 ? (
	            <div className="space-y-3" data-testid="provider-dashboard-upcoming-list">
	              {upcomingBookings.map((booking) => (
	                <button key={booking.id} type="button" onClick={() => handleAction('calendar')} className="w-full rounded-[18px] border border-white/15 bg-white/8 p-4 text-left transition hover:border-cyan-200/30 hover:bg-cyan-300/10">
	                  <p className="text-[14px] text-white" style={{ fontWeight: 850 }}>{booking.serviceTitle}</p>
	                  <p className="mt-1 text-[12px] leading-5 text-white/75">{formatBookingTime(booking.startsAt)} · {booking.guestName ?? 'Guest pending'}</p>
	                </button>
	              ))}
	            </div>
	          ) : (
	            <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/12 bg-black/25 px-5 py-10 text-center" data-testid="provider-dashboard-upcoming-empty">
	              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5">
	                <ClipboardList className="h-6 w-6 text-white/80" strokeWidth={2.5} />
	              </div>
	              <p className="text-[15px] text-white" style={{ fontWeight: 800 }}>No upcoming reservations</p>
	              <p className="max-w-sm text-[13px] leading-5 text-white/80">{totalListings === 0 ? 'Publish a service so guests can request bookings.' : 'New reservations will surface here as soon as guests confirm.'}</p>
	              {onNavigate && (
	                <button
	                  type="button"
	                  onClick={() => handleAction(totalListings === 0 ? 'listings' : 'calendar')}
	                  className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] text-white/90 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
	                  style={{ fontWeight: 800 }}
	                >
	                  {totalListings === 0 ? 'Create listing' : 'Open calendar'} <ArrowUpRight className="h-3.5 w-3.5" />
	                </button>
	              )}
	            </div>
	          )}
        </motion.section>
      </div>
    </div>
  );
}