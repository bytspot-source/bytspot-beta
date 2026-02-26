import { motion } from 'motion/react';
import { 
  CheckCircle, 
  DollarSign, 
  Clock, 
  MapPin,
  Star,
  TrendingUp
} from 'lucide-react';
import { mockCompletedJobs } from '../../../utils/valetMockData';

interface JobHistoryViewProps {
  isDarkMode: boolean;
}

export function JobHistoryView({ isDarkMode }: JobHistoryViewProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const totalEarnings = mockCompletedJobs.reduce((sum, job) => sum + job.earnings + (job.tip || 0), 0);
  const totalTips = mockCompletedJobs.reduce((sum, job) => sum + (job.tip || 0), 0);
  const avgJobTime = Math.round(
    mockCompletedJobs.reduce((sum, job) => {
      if (job.pickupTime && job.deliveryTime) {
        const duration = (new Date(job.deliveryTime).getTime() - new Date(job.pickupTime).getTime()) / 60000;
        return sum + duration;
      }
      return sum;
    }, 0) / mockCompletedJobs.length
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0 }}
        >
          <CheckCircle className="w-5 h-5 text-green-400 mb-2" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Completed
          </div>
          <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            {mockCompletedJobs.length}
          </div>
        </motion.div>

        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.05 }}
        >
          <DollarSign className="w-5 h-5 text-green-400 mb-2" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Total
          </div>
          <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            ${totalEarnings}
          </div>
        </motion.div>

        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <Clock className="w-5 h-5 text-cyan-400 mb-2" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Avg Time
          </div>
          <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            {avgJobTime}m
          </div>
        </motion.div>
      </div>

      {/* Job List */}
      <div>
        <h2 className="text-[20px] text-white mb-3 px-1" style={{ fontWeight: 600 }}>
          Recent Jobs
        </h2>

        <div className="space-y-3">
          {mockCompletedJobs.map((job, index) => (
            <motion.div
              key={job.id}
              className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.15 + index * 0.05 }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      {job.customerName}
                    </h3>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {job.vehicleInfo.year} {job.vehicleInfo.make} {job.vehicleInfo.model}
                  </div>
                </div>

                {/* Earnings */}
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <DollarSign className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                    <span className="text-[17px] text-green-400" style={{ fontWeight: 700 }}>
                      {job.earnings + (job.tip || 0)}
                    </span>
                  </div>
                  {job.tip && job.tip > 0 && (
                    <div className="flex items-center gap-1 justify-end">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
                      <span className="text-[12px] text-yellow-400" style={{ fontWeight: 600 }}>
                        +${job.tip} tip
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Route Info */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-[13px]">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-white/90 truncate" style={{ fontWeight: 500 }}>
                    {job.pickupLocation.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" strokeWidth={2.5} />
                  <span className="text-white/90 truncate" style={{ fontWeight: 500 }}>
                    {job.deliveryLocation.name}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
                  {job.distance} mi • {job.estimatedDuration} min
                </div>
                <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
                  {new Date(job.completedTime!).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Performance Insight */}
      <motion.div
        className="rounded-[16px] p-5 border-2 border-green-400/50 bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/30 border-2 border-green-400/50 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-green-300" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              Great Performance!
            </h3>
            <p className="text-[15px] text-white/90 mb-2" style={{ fontWeight: 400 }}>
              Your average tip is ${(totalTips / mockCompletedJobs.length).toFixed(2)} per job, which is 25% above average!
            </p>
            <p className="text-[13px] text-green-300" style={{ fontWeight: 600 }}>
              Keep up the excellent service 👏
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
