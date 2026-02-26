import { motion } from 'motion/react';
import { DollarSign, TrendingUp, Calendar, CreditCard, ArrowUpRight } from 'lucide-react';
import { mockEarnings } from '../../../utils/hostMockData';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardEarningsProps {
  isDarkMode: boolean;
}

export function DashboardEarnings({ isDarkMode }: DashboardEarningsProps) {
  const earnings = mockEarnings;

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'processing':
        return 'text-cyan-400';
      default:
        return 'text-white';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 border-green-400/30';
      case 'pending':
        return 'bg-yellow-500/20 border-yellow-400/30';
      case 'processing':
        return 'bg-cyan-500/20 border-cyan-400/30';
      default:
        return 'bg-white/10 border-white/30';
    }
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
          Earnings
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Track your revenue and payouts
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-green-500/30 to-emerald-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-400" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20">
              <TrendingUp className="w-3 h-3 text-green-400" strokeWidth={2.5} />
              <span className="text-[11px] text-green-400" style={{ fontWeight: 600 }}>
                +18%
              </span>
            </div>
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            ${earnings.totalEarnings.toLocaleString()}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Total Earnings
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
            <Calendar className="w-6 h-6 text-cyan-400" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            ${earnings.thisMonthEarnings.toLocaleString()}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            This Month
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
            <CreditCard className="w-6 h-6 text-purple-400" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            ${earnings.lastMonthEarnings.toLocaleString()}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Last Month
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-yellow-500/30 to-orange-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
            <ArrowUpRight className="w-6 h-6 text-yellow-400" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            ${earnings.pendingPayouts.toLocaleString()}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Pending Payouts
          </div>
        </motion.div>
      </div>

      {/* Revenue Chart */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
      >
        <h2 className="text-[22px] text-white mb-6" style={{ fontWeight: 600 }}>
          Revenue Trend
        </h2>

        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earnings.chartData}>
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
              <Bar
                dataKey="earnings"
                fill="url(#colorGradient)"
                radius={[8, 8, 0, 0]}
              />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#00BFFF" stopOpacity={0.6} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <h2 className="text-[22px] text-white mb-6" style={{ fontWeight: 600 }}>
          Recent Transactions
        </h2>

        <div className="space-y-3">
          {earnings.transactions.map((transaction, index) => {
            const date = new Date(transaction.date);
            const formattedDate = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <motion.div
                key={transaction.id}
                className="flex items-center justify-between p-4 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/10"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springConfig, delay: 0.5 + index * 0.05 }}
                whileHover={{ scale: 1.01, x: 4 }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </div>

                  <div>
                    <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                      {transaction.listing}
                    </div>
                    <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {formattedDate}
                    </div>
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-full border-2 backdrop-blur-xl ${getStatusBg(transaction.status)}`}>
                    <span className={`text-[12px] ${getStatusColor(transaction.status)}`} style={{ fontWeight: 600 }}>
                      {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                    </span>
                  </div>

                  <div className="text-[20px] text-green-400" style={{ fontWeight: 700 }}>
                    ${transaction.amount}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Payout Info */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 600 }}>
              Next Payout
            </h3>
            <p className="text-[15px] text-white/70 mb-4" style={{ fontWeight: 400 }}>
              Your earnings are automatically transferred every Monday
            </p>
            <div className="text-[28px] text-green-400" style={{ fontWeight: 700 }}>
              ${earnings.pendingPayouts}
            </div>
            <div className="text-[13px] text-white/70 mt-1" style={{ fontWeight: 500 }}>
              Scheduled for Monday, Oct 14
            </div>
          </div>

          <motion.button
            className="px-6 py-3 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 shadow-xl"
            whileTap={{ scale: 0.95 }}
            transition={springConfig}
          >
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Payout Settings
            </span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
