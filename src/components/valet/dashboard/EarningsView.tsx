import { motion } from 'motion/react';
import { 
  DollarSign, 
  TrendingUp, 
  Calendar,
  Clock,
  Star,
  Briefcase,
  CheckCircle
} from 'lucide-react';
import { mockEarningsData } from '../../../utils/valetMockData';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface EarningsViewProps {
  isDarkMode: boolean;
}

export function EarningsView({ isDarkMode }: EarningsViewProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const { today, thisWeek, thisMonth, chartData, recentPayouts } = mockEarningsData;

  return (
    <div className="space-y-6">
      {/* Today's Earnings - Featured */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[15px] text-green-300 mb-2" style={{ fontWeight: 600 }}>
              TODAY'S EARNINGS
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[42px] text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                ${today.amount}
              </span>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/30 border border-green-400/50">
                <TrendingUp className="w-3 h-3 text-green-300" strokeWidth={2.5} />
                <span className="text-[11px] text-green-200" style={{ fontWeight: 600 }}>
                  +18%
                </span>
              </div>
            </div>
          </div>
          
          <div className="w-14 h-14 rounded-full bg-green-500/30 border-2 border-green-400/50 flex items-center justify-center">
            <DollarSign className="w-7 h-7 text-green-300" strokeWidth={2.5} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
              Jobs
            </div>
            <div className="flex items-center gap-1">
              <Briefcase className="w-4 h-4 text-white/70" strokeWidth={2.5} />
              <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                {today.jobs}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
              Tips
            </div>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
              <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                ${today.tips}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
              Hours
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-white/70" strokeWidth={2.5} />
              <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                {today.hours}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Period Summaries */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <Calendar className="w-5 h-5 text-cyan-400 mb-2" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            This Week
          </div>
          <div className="text-[28px] text-white mb-2" style={{ fontWeight: 700 }}>
            ${thisWeek.amount}
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/60">{thisWeek.jobs} jobs</span>
            <span className="text-green-400" style={{ fontWeight: 600 }}>
              +${thisWeek.tips} tips
            </span>
          </div>
        </motion.div>

        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <Calendar className="w-5 h-5 text-purple-400 mb-2" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            This Month
          </div>
          <div className="text-[28px] text-white mb-2" style={{ fontWeight: 700 }}>
            ${thisMonth.amount}
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/60">{thisMonth.jobs} jobs</span>
            <span className="text-green-400" style={{ fontWeight: 600 }}>
              +${thisMonth.tips} tips
            </span>
          </div>
        </motion.div>
      </div>

      {/* Weekly Chart */}
      <motion.div
        className="rounded-[16px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.2 }}
      >
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Weekly Performance
        </h3>
        
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis 
                dataKey="date" 
                stroke="rgba(255, 255, 255, 0.3)"
                style={{ fontSize: '12px', fill: 'rgba(255, 255, 255, 0.7)' }}
              />
              <YAxis 
                stroke="rgba(255, 255, 255, 0.3)"
                style={{ fontSize: '12px', fill: 'rgba(255, 255, 255, 0.7)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(28, 28, 30, 0.95)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(20px)',
                }}
                labelStyle={{ color: '#fff', fontWeight: 600 }}
              />
              <Bar 
                dataKey="earnings" 
                fill="url(#colorEarnings)" 
                radius={[8, 8, 0, 0]}
              />
              <defs>
                <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.3} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
          <div>
            <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
              Avg per Job
            </div>
            <div className="text-[20px] text-white" style={{ fontWeight: 700 }}>
              ${Math.round(thisWeek.amount / thisWeek.jobs)}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
              Hourly Rate
            </div>
            <div className="text-[20px] text-white" style={{ fontWeight: 700 }}>
              ${Math.round(thisWeek.amount / thisWeek.hours)}/hr
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recent Payouts */}
      <div>
        <h2 className="text-[20px] text-white mb-3 px-1" style={{ fontWeight: 600 }}>
          Recent Payouts
        </h2>

        <div className="space-y-3">
          {recentPayouts.map((payout, index) => (
            <motion.div
              key={payout.id}
              className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.25 + index * 0.05 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 border-2 border-green-400/50 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-400" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                      ${payout.amount}
                    </div>
                    <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {payout.method}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[13px] text-green-400 mb-1" style={{ fontWeight: 600 }}>
                    Completed
                  </div>
                  <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
                    {new Date(payout.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
