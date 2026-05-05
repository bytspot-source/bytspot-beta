import { motion } from 'motion/react';
import { ArrowUpRight, ChevronDown, ChevronUp, Inbox, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardBookingsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type BookingFilter = 'all' | 'active' | 'upcoming' | 'completed';

// Per-status guidance + handoff-checklist scaffolding. These render today
// against zero-count states so the surface ships fully copy-complete; once
// the bookings tRPC query lands, the same copy keys will be reused next to
// real booking rows.
const STATUS_GUIDANCE: Record<BookingFilter, { headline: string; body: string; checklist: string[] }> = {
  all: {
    headline: 'All bookings overview',
    body: 'See every booking across your services. Switch to a status filter to focus on the next operational step.',
    checklist: [
      'Triage by status: active first, upcoming next, completed for reconciliation.',
      'Confirm patch + service assignments stay in sync as services evolve.',
      'Share handoff notes with managers and staff so context survives shift changes.',
    ],
  },
  active: {
    headline: 'Active arrivals in progress',
    body: 'A guest is on-site or mid-service. Keep response time under five minutes and update status as soon as the guest is wrapped.',
    checklist: [
      'Verify the linked patch label matches the entrance the guest scanned.',
      'Confirm staff handoff is logged so the shift lead has live context.',
      'Mark the booking complete the moment the service ends to free the slot.',
    ],
  },
  upcoming: {
    headline: 'Upcoming reservations',
    body: 'Confirm access instructions, parking notes, and any required prep before the guest arrives.',
    checklist: [
      'Send arrival instructions at least an hour before the booking start.',
      'Verify the assigned service is still active and priced correctly.',
      'Stage any required gear, valets, or staff coverage for the window.',
    ],
  },
  completed: {
    headline: 'Recently completed',
    body: 'Use this view for reconciliation: review payouts, capture review prompts, and follow up on escalations.',
    checklist: [
      'Cross-check payouts against expected service price after platform fee.',
      'Trigger a review request for guests who had a smooth handoff.',
      'Resolve any open patch or compliance flags before close-of-day.',
    ],
  },
};

export function DashboardBookings({ isDarkMode, access }: DashboardBookingsProps) {
  void isDarkMode;
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const data = useProviderDashboardData();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const totalCount = 0;
  const activeCount = 0;
  const upcomingCount = 0;
  const completedCount = 0;

  const guidance = STATUS_GUIDANCE[filter];
  const canEditHandoff = access.role === 'owner' || access.role === 'manager';

  const emptyMessage = data.loading
    ? 'Loading bookings…'
    : !data.authenticated
      ? 'Sign in to load bookings tied to your services.'
      : data.totalServices === 0
        ? 'Publish your first marketplace service so guests can request bookings.'
        : filter === 'all'
          ? 'New marketplace bookings will surface here automatically.'
          : `No ${filter} bookings yet. They will appear here as guests confirm.`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Bookings
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Manage your parking reservations
        </p>
      </motion.div>

      <motion.div
        className="rounded-[22px] border border-white/12 bg-white/[0.055] p-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.05 }}
        data-testid="provider-bookings-guidance"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-cyan-200" strokeWidth={2.5} />
          <p className="text-[13px] uppercase tracking-[0.18em] text-white/45" style={{ fontWeight: 850 }}>
            {guidance.headline}
          </p>
        </div>
        <p className="mt-2 text-[14px] leading-6 text-white/70" data-testid="provider-bookings-guidance-body">
          {guidance.body}
        </p>
        <ol className="mt-3 grid gap-2 text-[13px] leading-5 text-white/65 md:grid-cols-3" data-testid="provider-bookings-guidance-checklist">
          {guidance.checklist.map((item, index) => (
            <li key={index}>{`${index + 1}. ${item}`}</li>
          ))}
        </ol>
      </motion.div>

      {/* Tap-through scaffold: opens an inline preview of the per-booking detail
          surface so providers can see what handoff context will look like once
          the bookings tRPC query lands. The button is visible against zero-count
          states because the guidance and checklist are useful even before the
          first real booking comes in. */}
      <motion.div
        className="rounded-[22px] border border-white/12 bg-white/[0.04]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.08 }}
        data-testid="provider-bookings-detail-scaffold"
      >
        <button
          type="button"
          onClick={() => setDetailOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          data-testid="provider-bookings-detail-toggle"
          aria-expanded={detailOpen}
        >
          <div>
            <p className="text-[14px] font-bold text-white">Preview booking detail layout</p>
            <p className="text-[12px] leading-5 text-white/55">
              See the handoff timeline, patch context, and payout estimate that surface for each booking once a guest confirms.
            </p>
          </div>
          {detailOpen ? <ChevronUp className="h-5 w-5 text-white/70" /> : <ChevronDown className="h-5 w-5 text-white/70" />}
        </button>
        {detailOpen && (
          <div className="border-t border-white/10 px-4 py-4 text-[13px] leading-6 text-white/70" data-testid="provider-bookings-detail-panel">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Guest</p>
                <p className="mt-1 text-white">Name surfaces from booking record</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Linked patch</p>
                <p className="mt-1 text-white">Pulled from the service’s assigned patch</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Payout estimate</p>
                <p className="mt-1 text-white">Service price minus platform fee</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canEditHandoff}
                className="flex items-center gap-2 rounded-[14px] border border-white/15 bg-white/10 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                data-testid="provider-bookings-detail-cta-handoff"
              >
                <ArrowUpRight className="h-4 w-4" /> Edit handoff notes
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[14px] border border-cyan-300/25 bg-cyan-500/15 px-3 py-2 text-[13px] font-bold text-cyan-100"
                data-testid="provider-bookings-detail-cta-message"
              >
                <ArrowUpRight className="h-4 w-4" /> Message guest
              </button>
            </div>
            {!canEditHandoff && (
              <p className="mt-3 text-[12px] text-white/50" data-testid="provider-bookings-detail-staff-note">
                Staff mode is read-only on handoff notes. Owners and managers can edit.
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Filter Buttons */}
      <motion.div
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
        data-testid="provider-bookings-filters"
      >
        <button
          data-testid="provider-bookings-filter-all"
          onClick={() => setFilter('all')}
          className={`flex-shrink-0 px-4 py-2.5 rounded-xl border-2 transition-colors ${
            filter === 'all'
              ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-white/30'
              : 'bg-[#1C1C1E]/80 border-white/20 hover:border-white/30'
          }`}
        >
          <span className={`text-[15px] ${filter === 'all' ? 'text-white' : 'text-white/70'}`} style={{ fontWeight: 600 }}>
            All ({totalCount})
          </span>
        </button>

        <button
          data-testid="provider-bookings-filter-active"
          onClick={() => setFilter('active')}
          className={`flex-shrink-0 px-4 py-2.5 rounded-xl border-2 transition-colors ${
            filter === 'active'
              ? 'bg-green-500/30 border-green-400/50'
              : 'bg-[#1C1C1E]/80 border-white/20 hover:border-white/30'
          }`}
        >
          <span className={`text-[15px] ${filter === 'active' ? 'text-green-300' : 'text-white/70'}`} style={{ fontWeight: 600 }}>
            Active ({activeCount})
          </span>
        </button>

        <button
          data-testid="provider-bookings-filter-upcoming"
          onClick={() => setFilter('upcoming')}
          className={`flex-shrink-0 px-4 py-2.5 rounded-xl border-2 transition-colors ${
            filter === 'upcoming'
              ? 'bg-cyan-500/30 border-cyan-400/50'
              : 'bg-[#1C1C1E]/80 border-white/20 hover:border-white/30'
          }`}
        >
          <span className={`text-[15px] ${filter === 'upcoming' ? 'text-cyan-300' : 'text-white/70'}`} style={{ fontWeight: 600 }}>
            Upcoming ({upcomingCount})
          </span>
        </button>

        <button
          data-testid="provider-bookings-filter-completed"
          onClick={() => setFilter('completed')}
          className={`flex-shrink-0 px-4 py-2.5 rounded-xl border-2 transition-colors ${
            filter === 'completed'
              ? 'bg-white/20 border-white/40'
              : 'bg-[#1C1C1E]/80 border-white/20 hover:border-white/30'
          }`}
        >
          <span className={`text-[15px] ${filter === 'completed' ? 'text-white' : 'text-white/70'}`} style={{ fontWeight: 600 }}>
            Completed ({completedCount})
          </span>
        </button>
      </motion.div>

      {/* Bookings empty state */}
      <motion.div
        className="rounded-[20px] p-12 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.2 }}
        data-testid="provider-bookings-empty"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
          <Inbox className="h-7 w-7 text-white/80" strokeWidth={2.5} />
        </div>
        <p className="text-[17px] text-white" style={{ fontWeight: 700 }}>
          {data.loading ? 'Loading bookings…' : 'No bookings yet'}
        </p>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-white/70" style={{ fontWeight: 400 }}>
          {emptyMessage}
        </p>
      </motion.div>
    </div>
  );
}
