import { motion } from 'motion/react';
import { TrendingUp, MapPin, Calendar, Star, DollarSign, Activity } from 'lucide-react';
import { mockDashboardStats, mockBookings, mockEarnings } from '../../../utils/hostMockData';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardHomeProps {
  isDarkMode: boolean;
}

export function DashboardHome({ isDarkMode }: DashboardHomeProps) {
  const stats = mockDashboardStats;
  const activeBookings = mockBookings.filter(b => b.status === 'active');
  const upcomingBookings = mockBookings.filter(b => b.status === 'upcoming').slice(0, 3);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const statCards = [
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'from-green-500/40 to-emerald-500/40',
      iconColor: 'text-green-400',
      change: `+${stats.monthlyGrowth}%`,
      changePositive: true,
    },
    {
      title: 'Active Bookings',
      value: stats.activeBookings,
      icon: Activity,
      color: 'from-cyan-500/40 to-blue-500/40',
      iconColor: 'text-cyan-400',
    },
    {
      title: 'Total Listings',
      value: stats.totalListings,
      icon: MapPin,
      color: 'from-purple-500/40 to-fuchsia-500/40',
      iconColor: 'text-purple-400',
    },
    {
      title: 'Average Rating',
      value: stats.averageRating.toFixed(1),
      icon: Star,
      color: 'from-yellow-500/40 to-orange-500/40',
      iconColor: 'text-yellow-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Welcome Back
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Here's what's happening with your listings today
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          
          return (
            <motion.div
              key={stat.title}
              className={`rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br ${stat.color} backdrop-blur-xl shadow-xl`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: index * 0.1 }}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${stat.iconColor}`} strokeWidth={2.5} />
                </div>
                {stat.change && (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                    stat.changePositive ? 'bg-green-500/20' : 'bg-red-500/20'
                  }`}>
                    <TrendingUp className={`w-3 h-3 ${stat.changePositive ? 'text-green-400' : 'text-red-400'}`} strokeWidth={2.5} />
                    <span className={`text-[11px] ${stat.changePositive ? 'text-green-400' : 'text-red-400'}`} style={{ fontWeight: 600 }}>
                      {stat.change}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="text-[28px] text-white mb-1" style={{ fontWeight: 700 }}>
                {stat.value}
              </div>
              
              <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                {stat.title}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[22px] text-white mb-1" style={{ fontWeight: 600 }}>
              Revenue Overview
            </h2>
            <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
              Last 10 days
            </p>
          </div>
          <div className="text-right">
            <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
              ${mockEarnings.thisMonthEarnings.toLocaleString()}
            </div>
            <div className="text-[13px] text-green-400" style={{ fontWeight: 600 }}>
              This month
            </div>
          </div>
        </div>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockEarnings.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.5)"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(28, 28, 30, 0.95)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  color: '#fff',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="earnings" 
                stroke="#00BFFF" 
                strokeWidth={3}
                dot={{ fill: '#00BFFF', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Bookings */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[20px] text-white" style={{ fontWeight: 600 }}>
              Active Now
            </h2>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-400/30">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[12px] text-green-400" style={{ fontWeight: 600 }}>
                Live
              </span>
            </div>
          </div>

          {activeBookings.length > 0 ? (
            <div className="space-y-3">
              {activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl p-4 bg-[#2C2C2E]/60 border-2 border-white/20"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                        {booking.guestName}
                      </div>
                      <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                        {booking.listingTitle}
                      </div>
                    </div>
                    <div className="text-[17px] text-green-400" style={{ fontWeight: 700 }}>
                      ${booking.amount}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-[13px] text-white/70">
                    <Calendar className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>{booking.duration}</span>
                    <span>•</span>
                    <span>{booking.vehicle}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-white/30 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-[15px] text-white/50" style={{ fontWeight: 400 }}>
                No active bookings
              </p>
            </div>
          )}
        </motion.div>

        {/* Upcoming Bookings */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.6 }}
        >
          <h2 className="text-[20px] text-white mb-4" style={{ fontWeight: 600 }}>
            Upcoming Bookings
          </h2>

          <div className="space-y-3">
            {upcomingBookings.map((booking) => {
              const startDate = new Date(booking.startTime);
              const formattedDate = startDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });

              return (
                <div
                  key={booking.id}
                  className="rounded-xl p-4 bg-[#2C2C2E]/60 border-2 border-white/20"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                        {booking.guestName}
                      </div>
                      <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                        {booking.listingTitle}
                      </div>
                    </div>
                    <div className="text-[17px] text-cyan-400" style={{ fontWeight: 700 }}>
                      ${booking.amount}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-[13px] text-white/70">
                    <Calendar className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>{formattedDate}</span>
                    <span>•</span>
                    <span>{booking.duration}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
      >
        <h2 className="text-[20px] text-white mb-4" style={{ fontWeight: 600 }}>
          Quick Actions
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="rounded-xl p-4 bg-[#1C1C1E]/60 border-2 border-white/20 hover:border-white/40 transition-colors">
            <MapPin className="w-6 h-6 text-purple-400 mb-2" strokeWidth={2.5} />
            <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
              Add Listing
            </div>
          </button>
          
          <button className="rounded-xl p-4 bg-[#1C1C1E]/60 border-2 border-white/20 hover:border-white/40 transition-colors">
            <Calendar className="w-6 h-6 text-cyan-400 mb-2" strokeWidth={2.5} />
            <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
              View Calendar
            </div>
          </button>
          
          <button className="rounded-xl p-4 bg-[#1C1C1E]/60 border-2 border-white/20 hover:border-white/40 transition-colors">
            <DollarSign className="w-6 h-6 text-green-400 mb-2" strokeWidth={2.5} />
            <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
              Payouts
            </div>
          </button>
          
          <button className="rounded-xl p-4 bg-[#1C1C1E]/60 border-2 border-white/20 hover:border-white/40 transition-colors">
            <Star className="w-6 h-6 text-yellow-400 mb-2" strokeWidth={2.5} />
            <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
              Reviews
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
