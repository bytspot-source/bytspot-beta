import { motion } from 'motion/react';
import { Star, MessageSquare } from 'lucide-react';

interface DashboardReviewsProps {
  isDarkMode: boolean;
}

export function DashboardReviews({ isDarkMode }: DashboardReviewsProps) {
  void isDarkMode;

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const dash = '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Reviews
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          See what guests are saying
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center mb-3">
            <Star className="w-6 h-6 text-white/70" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {dash}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Average Rating
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6 text-white/70" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            0
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Total Reviews
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6 text-white/70" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            0
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Needs Response
          </div>
        </motion.div>
      </div>

      {/* Reviews empty state */}
      <motion.div
        className="rounded-[20px] p-12 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
        data-testid="provider-reviews-empty"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5">
          <Star className="h-7 w-7 text-white/80" strokeWidth={2.5} />
        </div>
        <p className="text-[17px] text-white" style={{ fontWeight: 700 }}>
          No reviews yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-white/70" style={{ fontWeight: 400 }}>
          Guest reviews will appear here after completed bookings. Reply directly from this view to keep your response time strong.
        </p>
      </motion.div>
    </div>
  );
}
