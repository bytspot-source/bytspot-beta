import { motion } from 'motion/react';
import { Calendar, MapPin, Car, Clock, User, Filter } from 'lucide-react';
import { mockBookings } from '../../../utils/hostMockData';
import { useState } from 'react';

interface DashboardBookingsProps {
  isDarkMode: boolean;
}

type BookingFilter = 'all' | 'active' | 'upcoming' | 'completed';

export function DashboardBookings({ isDarkMode }: DashboardBookingsProps) {
  const [filter, setFilter] = useState<BookingFilter>('all');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const filteredBookings = filter === 'all' 
    ? mockBookings 
    : mockBookings.filter(b => b.status === filter);

  const activeCount = mockBookings.filter(b => b.status === 'active').length;
  const upcomingCount = mockBookings.filter(b => b.status === 'upcoming').length;
  const completedCount = mockBookings.filter(b => b.status === 'completed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'upcoming':
        return 'text-cyan-400';
      case 'completed':
        return 'text-white/50';
      default:
        return 'text-white';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 border-green-400/30';
      case 'upcoming':
        return 'bg-cyan-500/20 border-cyan-400/30';
      case 'completed':
        return 'bg-white/10 border-white/20';
      default:
        return 'bg-white/10 border-white/30';
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

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
            All ({mockBookings.length})
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

      {/* Bookings List */}
      <div className="space-y-4">
        {filteredBookings.map((booking, index) => (
          <motion.div
            key={booking.id}
            className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.2 + index * 0.05 }}
            whileHover={{ scale: 1.01, y: -2 }}
          >
            {/* Status Badge */}
            <div className="flex items-center justify-between mb-4">
              <div className={`px-3 py-1.5 rounded-full border-2 backdrop-blur-xl ${getStatusBg(booking.status)}`}>
                <span className={`text-[12px] ${getStatusColor(booking.status)}`} style={{ fontWeight: 600 }}>
                  {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                </span>
              </div>

              <div className="text-[20px] text-green-400" style={{ fontWeight: 700 }}>
                ${booking.amount}
              </div>
            </div>

            {/* Guest Info */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center">
                <User className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              
              <div>
                <div className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  {booking.guestName}
                </div>
                <div className="flex items-center gap-2 text-[13px] text-white/70">
                  <Car className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{booking.vehicle}</span>
                </div>
              </div>
            </div>

            {/* Listing Info */}
            <div className="rounded-xl p-4 bg-[#2C2C2E]/60 border-2 border-white/10 mb-4">
              <div className="flex items-start gap-3 mb-3">
                <MapPin className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {booking.listingTitle}
                </div>
              </div>

              <div className="flex items-center gap-4 text-[13px] text-white/70">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{formatDateTime(booking.startTime)}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{booking.duration}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <motion.button
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border-2 border-white/20"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                  View Details
                </span>
              </motion.button>

              {booking.status === 'active' && (
                <motion.button
                  className="px-4 py-2.5 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/20"
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <span className="text-[13px] text-white/70" style={{ fontWeight: 600 }}>
                    Contact
                  </span>
                </motion.button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {filteredBookings.length === 0 && (
        <motion.div
          className="rounded-[20px] p-12 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <Filter className="w-12 h-12 text-white/30 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-[17px] text-white/50" style={{ fontWeight: 400 }}>
            No {filter !== 'all' ? filter : ''} bookings found
          </p>
        </motion.div>
      )}
    </div>
  );
}
