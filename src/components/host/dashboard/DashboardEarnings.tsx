import { motion } from 'motion/react';
import { DollarSign, Calendar, CreditCard, ArrowUpRight, LineChart as LineChartIcon, Receipt } from 'lucide-react';
import type { ProviderReviewState } from '../../../utils/providerApproval';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardEarningsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
  reviewState?: ProviderReviewState | null;
}

export function DashboardEarnings({ isDarkMode, access, reviewState }: DashboardEarningsProps) {
  void isDarkMode;
  const data = useProviderDashboardData();
  const approved = reviewState?.status === 'approved';
  const stripeReady = approved && data.connect.payoutsEnabled;

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  if (!access.canSeeFinancials) {
    return (
      <div className="rounded-[28px] border border-amber-300/20 bg-amber-500/10 p-6 text-white">
        <h1 className="text-[28px]" style={{ fontWeight: 850 }}>Owner approval required</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-6 text-white/62">Earnings, payout timing, and transactions are visible to Owners only. Managers and Staff can continue with bookings, calendar operations, and listing setup.</p>
      </div>
    );
  }

  const trackingNote = data.loading
    ? 'Syncing payout history'
    : stripeReady
      ? 'Tracking activates after the first confirmed payout'
      : approved
        ? 'Finish Stripe verification to start tracking revenue'
        : 'Payouts are on hold until manual verification clears';
  const zero = '$0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Earnings
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Track your revenue and payouts
        </p>
      </motion.div>

      <motion.div
        data-testid="provider-earnings-review-state"
        className={`rounded-[22px] border-2 p-5 ${approved ? 'border-emerald-300/25 bg-emerald-400/12' : 'border-amber-300/25 bg-amber-400/12'} text-white`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.08 }}
      >
        <p className="text-[12px] uppercase tracking-[0.18em] text-white/70" style={{ fontWeight: 850 }}>Provider review</p>
        <h2 className="mt-2 text-[22px]" style={{ fontWeight: 850 }}>{reviewState?.label ?? 'Pending Verification'}</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-white/72">
          {approved ? 'Payouts and marketplace revenue tracking are cleared for normal operation.' : 'Revenue tracking remains available, but payouts stay in verification hold until required metadata and Stripe Connect are approved.'}
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="provider-earnings-stats">
        {[
          { label: 'Total Earnings', icon: DollarSign, accent: 'from-green-500/30 to-emerald-500/30', iconColor: 'text-green-400' },
          { label: 'This Month', icon: Calendar, accent: 'from-cyan-500/30 to-blue-500/30', iconColor: 'text-cyan-400' },
          { label: 'Last Month', icon: CreditCard, accent: 'from-purple-500/30 to-fuchsia-500/30', iconColor: 'text-purple-400' },
          { label: 'Pending Payouts', icon: ArrowUpRight, accent: 'from-yellow-500/30 to-orange-500/30', iconColor: 'text-yellow-400' },
        ].map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              className={`rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br ${card.accent} backdrop-blur-xl shadow-xl`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 + index * 0.05 }}
            >
              <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
                <Icon className={`w-6 h-6 ${card.iconColor}`} strokeWidth={2.5} />
              </div>
              <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
                {data.loading ? '—' : zero}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                {card.label}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue Trend */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
        data-testid="provider-earnings-revenue-empty"
      >
        <h2 className="text-[22px] text-white mb-2" style={{ fontWeight: 600 }}>Revenue Trend</h2>
        <p className="text-[13px] text-white/70 mb-6">{trackingNote}</p>
        <div className="flex h-[260px] flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/15 bg-black/30 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
            <LineChartIcon className="h-6 w-6 text-cyan-200" strokeWidth={2.5} />
          </div>
          <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>No revenue data yet</p>
          <p className="max-w-md text-[13px] leading-5 text-white/70">
            {stripeReady
              ? 'Confirmed marketplace bookings will populate this chart automatically.'
              : 'Once Stripe Connect is verified and a guest completes a booking, daily revenue will appear here.'}
          </p>
        </div>
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
        data-testid="provider-earnings-transactions-empty"
      >
        <h2 className="text-[22px] text-white mb-6" style={{ fontWeight: 600 }}>Recent Transactions</h2>
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/15 bg-black/30 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
            <Receipt className="h-6 w-6 text-white/80" strokeWidth={2.5} />
          </div>
          <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>No transactions yet</p>
          <p className="max-w-md text-[13px] leading-5 text-white/70">Marketplace payouts and refunds will appear here once your first booking settles through Stripe.</p>
        </div>
      </motion.div>

      {/* Payout Info */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
        data-testid="provider-earnings-next-payout"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 600 }}>Next Payout</h3>
            <p className="text-[15px] text-white/70 mb-4" style={{ fontWeight: 400 }}>
              {stripeReady
                ? 'Confirmed bookings will be released to your Stripe account on the next payout cycle.'
                : approved
                  ? 'Finish Stripe verification to start receiving automatic payouts.'
                  : 'Payout release begins once manual verification is complete.'}
            </p>
            <div className="text-[28px] text-green-400" style={{ fontWeight: 700 }}>{zero}</div>
            <div className="text-[13px] text-white/70 mt-1" style={{ fontWeight: 500 }}>
              {stripeReady ? 'No payout currently scheduled' : 'Scheduled once verification is complete'}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
