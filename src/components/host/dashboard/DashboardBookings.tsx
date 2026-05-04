import { motion } from 'motion/react';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardBookingsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type BookingFilter = 'all' | 'active' | 'upcoming' | 'completed';

export function DashboardBookings({ isDarkMode, access }: DashboardBookingsProps) {
  void isDarkMode;
  void access;
  const [filter, setFilter] = useState<BookingFilter>('all');
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

  const emptyMessage = data.loading
    ? 'Loading bookings…'
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

      <motion.div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
        <p className="text-[13px] uppercase tracking-[0.18em] text-white/45" style={{ fontWeight: 850 }}>Booking workflow</p>
        <ol className="mt-3 grid gap-2 text-[13px] leading-5 text-white/65 md:grid-cols-3">
          <li>1. Open Active to manage in-progress arrivals and departures.</li>
          <li>2. Use Upcoming to confirm access instructions before guests arrive.</li>
          <li>3. Mark handoff notes in View Details so the team stays aligned.</li>
        </ol>
      </motion.div>

      {/* Filter Buttons */}
      <motion.div
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <button
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
