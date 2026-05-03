import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mockBookings, mockDashboardStats, mockEarnings, mockListings } from '../../../utils/hostMockData';
import { financialValue, guidanceForRole, roleLabel, type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardHomeProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

export function DashboardHome({ isDarkMode, access }: DashboardHomeProps) {
  const stats = mockDashboardStats;
  const activeBookings = mockBookings.filter((booking) => booking.status === 'active');
  const upcomingBookings = mockBookings.filter((booking) => booking.status === 'upcoming').slice(0, 3);
  const activeListings = mockListings.filter((listing) => listing.status === 'active');
  const listingHealth = Math.round((activeListings.length / Math.max(1, mockListings.length)) * 100);
  const nextPayout = mockEarnings.pendingPayouts;

  const springConfig = {
    type: 'spring' as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const priorityCards = [
    { title: access.canSeeFinancials ? 'Total earnings' : 'Access scope', value: financialValue(access, `$${mockEarnings.totalEarnings.toLocaleString()}`), detail: access.canSeeFinancials ? `+$${mockEarnings.thisMonthEarnings.toLocaleString()} this month` : `${roleLabel(access.role)} workspace`, icon: access.canSeeFinancials ? DollarSign : ShieldCheck, tone: 'from-emerald-400/22 to-cyan-400/10' },
    { title: 'Active bookings', value: activeBookings.length.toString(), detail: `${upcomingBookings.length} upcoming reservations`, icon: Calendar, tone: 'from-cyan-400/22 to-blue-500/10' },
    { title: 'Listing health', value: `${listingHealth}%`, detail: `${activeListings.length}/${mockListings.length} listings live`, icon: ShieldCheck, tone: 'from-violet-400/22 to-fuchsia-500/10' },
    { title: 'Guest rating', value: stats.averageRating.toFixed(1), detail: 'High-trust marketplace profile', icon: Star, tone: 'from-amber-300/22 to-orange-500/10' },
  ];

  const actionItems = [
    { title: access.canManagePayouts ? 'Review payout setup' : 'Review today’s handoffs', detail: access.canManagePayouts ? `$${nextPayout.toLocaleString()} pending` : 'Keep arrivals and departures current', icon: access.canManagePayouts ? Wallet : Clock },
    { title: 'Improve listing health', detail: 'Add photos and availability windows', icon: MapPin },
    { title: 'Confirm upcoming bookings', detail: `${upcomingBookings.length} reservations need attention`, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <motion.section className="relative overflow-hidden rounded-[32px] border border-white/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.26),transparent_32%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(5,5,8,0.96))] p-5 shadow-2xl lg:p-7" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[12px] text-cyan-100" style={{ fontWeight: 800 }}>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              {roleLabel(access.role)} command center · {access.isCottage ? 'Cottage business' : 'Provider business'}
            </div>
            <h1 className="max-w-2xl text-[36px] leading-[1.02] text-white lg:text-[48px]" style={{ fontWeight: 850 }}>
              {access.role === 'staff' ? 'Today’s operations are ready.' : access.isCottage ? 'Your cottage business is ready for bookings.' : 'Your marketplace is healthy and ready for bookings.'}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-white/64 lg:text-[16px]">
              {guidanceForRole(access)}
            </p>
          </div>

          {access.canSeeFinancials ? (
          <div className="rounded-[26px] border border-white/12 bg-black/28 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] uppercase tracking-[0.18em] text-white/45" style={{ fontWeight: 800 }}>Next payout</p>
                <p className="mt-1 text-[34px] text-white" style={{ fontWeight: 850 }}>${nextPayout.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-emerald-400/14 px-3 py-2 text-right text-emerald-100">
                <p className="text-[11px]" style={{ fontWeight: 800 }}>On track</p>
                <p className="text-[12px] text-emerald-100/70">Stripe-ready</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300" />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-white/50">82% of this week’s expected payout volume has already been captured.</p>
          </div>
          ) : (
          <div className="rounded-[26px] border border-white/12 bg-black/28 p-4 backdrop-blur-xl">
            <p className="text-[12px] uppercase tracking-[0.18em] text-white/45" style={{ fontWeight: 800 }}>Today’s operating plan</p>
            <p className="mt-2 text-[26px] text-white" style={{ fontWeight: 850 }}>{activeBookings.length} active · {upcomingBookings.length} upcoming</p>
            <ol className="mt-4 space-y-2 text-[13px] leading-5 text-white/58">
              <li>1. Open each active booking and confirm vehicle/location details.</li>
              <li>2. Keep the calendar updated before handoff windows.</li>
              <li>3. Escalate payout or account questions to the Owner.</li>
            </ol>
          </div>
          )}
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {priorityCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.title} className={`rounded-[24px] border border-white/12 bg-gradient-to-br ${card.tone} p-5 shadow-xl backdrop-blur-xl`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.06 }} whileHover={{ y: -3 }}>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-black/25">
                  <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                {index === 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] text-emerald-100" style={{ fontWeight: 800 }}>
                    <TrendingUp className="h-3 w-3" /> +{stats.monthlyGrowth}%
                  </span>
                )}
              </div>
              <p className="text-[13px] text-white/55" style={{ fontWeight: 700 }}>{card.title}</p>
              <p className="mt-1 text-[31px] leading-none text-white" style={{ fontWeight: 850 }}>{card.value}</p>
              <p className="mt-3 text-[12px] leading-5 text-white/48">{card.detail}</p>
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
              <p className="mt-1 text-[14px] text-white/55">Daily revenue from confirmed marketplace bookings.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/40" style={{ fontWeight: 800 }}>This month</p>
              <p className="text-[19px] text-white" style={{ fontWeight: 850 }}>${mockEarnings.thisMonthEarnings.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockEarnings.chartData}>
                <defs>
                  <linearGradient id="earningsFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" tickLine={false} axisLine={false} style={{ fontSize: '12px' }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(17,17,20,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '16px', color: '#fff' }} />
                <Area type="monotone" dataKey="earnings" stroke="#22d3ee" strokeWidth={3} fill="url(#earningsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </>
          ) : (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-[22px] text-white" style={{ fontWeight: 800 }}>Operational guidance</h2>
            <p className="mt-2 text-[14px] leading-6 text-white/58">Financial trends are Owner-only. This workspace keeps your role focused on bookings, calendars, listing quality, and customer handoffs.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-black/20 p-3 text-white/65">Check active bookings</div>
              <div className="rounded-2xl bg-black/20 p-3 text-white/65">Confirm upcoming arrivals</div>
              <div className="rounded-2xl bg-black/20 p-3 text-white/65">Report listing issues</div>
            </div>
          </div>
          )}
        </motion.section>

        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.32 }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[21px] text-white" style={{ fontWeight: 800 }}>Today’s focus</h2>
              <p className="mt-1 text-[13px] text-white/52">Recommended next moves.</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="space-y-3">
            {actionItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.title} className="w-full rounded-[18px] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-200/30 hover:bg-cyan-300/[0.07]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8">
                      <Icon className="h-5 w-5 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[14px] text-white" style={{ fontWeight: 800 }}>{item.title}</p>
                      <p className="mt-1 text-[12px] leading-5 text-white/50">{item.detail}</p>
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
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/12 px-3 py-1.5 text-[12px] text-emerald-100" style={{ fontWeight: 800 }}>
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> Active
            </span>
          </div>
          <div className="space-y-3">
            {activeBookings.map((booking) => (
              <div key={booking.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] text-white" style={{ fontWeight: 800 }}>{booking.guestName}</p>
                    <p className="mt-1 text-[12px] text-white/50">{booking.listingTitle}</p>
                  </div>
                  <p className="text-[17px] text-emerald-100" style={{ fontWeight: 850 }}>${booking.amount}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/48">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{booking.duration}</span>
                  <span>•</span>
                  <span>{booking.vehicle}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-5 shadow-xl backdrop-blur-xl lg:p-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.44 }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[20px] text-white" style={{ fontWeight: 800 }}>Upcoming</h2>
            <span className="text-[12px] text-white/45" style={{ fontWeight: 700 }}>Next 72 hours</span>
          </div>
          <div className="space-y-3">
            {upcomingBookings.map((booking) => {
              const startDate = new Date(booking.startTime);
              const formattedDate = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
              return (
                <div key={booking.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] text-white" style={{ fontWeight: 800 }}>{booking.guestName}</p>
                      <p className="mt-1 text-[12px] text-white/50">{booking.listingTitle}</p>
                    </div>
                    <p className="text-[17px] text-cyan-100" style={{ fontWeight: 850 }}>${booking.amount}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/48">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formattedDate}</span>
                    <span>•</span>
                    <span>{booking.duration}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    </div>
  );
}