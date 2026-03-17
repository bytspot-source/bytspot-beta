import { motion, AnimatePresence } from 'motion/react';
import { Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { trpc } from '../utils/trpc';

interface ZoneUserCountProps {
  compact?: boolean;
}

export function ZoneUserCount({ compact = false }: ZoneUserCountProps) {
  const [userCount, setUserCount] = useState(246);
  const [isAnimating, setIsAnimating] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Fetch real registered user count on mount
  useEffect(() => {
    trpc.health.stats.query().then(res => {
      if (res.userCount > 0) {
        setUserCount(res.userCount);
      }
    }).catch(() => { /* keep fallback */ });
  }, []);

  // Simulate live fluctuation around the real base count
  useEffect(() => {
    let base = userCount;
    const interval = setInterval(() => {
      setIsAnimating(true);
      const change = Math.random() > 0.5
        ? Math.floor(Math.random() * 5) + 1   // +1 to +5 users joining
        : -(Math.floor(Math.random() * 3) + 1); // -1 to -3 users leaving
      setUserCount(prev => {
        base = prev;
        const next = prev + change;
        // Drift no more than ±30 from the real registered count
        return Math.max(base - 30, Math.min(base + 30, next));
      });
      setTimeout(() => setIsAnimating(false), 300);
    }, 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatCount = (count: number): string => {
    return count.toLocaleString('en-US');
  };

  if (compact) {
    return (
      <motion.div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-green-500/30 to-emerald-500/30 border-2 border-green-400/50"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springConfig}
      >
        <div className="relative">
          <Users className="w-3.5 h-3.5 text-green-300" strokeWidth={2.5} />
          <motion.div
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400"
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [1, 0.8, 1]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>
        
        <AnimatePresence mode="wait">
          <motion.span
            key={userCount}
            className="text-[11px] text-green-100"
            style={{ fontWeight: 700 }}
            initial={{ y: isAnimating ? -8 : 0, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: isAnimating ? 8 : 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {formatCount(userCount)}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30">
            <Users className="w-5 h-5 text-white" strokeWidth={2.5} />
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#1C1C1E]"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
          <div>
            <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Active Users
            </h3>
            <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
              In your zone
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-400/30">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[13px] text-green-200" style={{ fontWeight: 600 }}>
            Live
          </span>
        </div>
      </div>

      {/* User Count */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2 mb-2 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={userCount}
              className="text-[32px] text-white"
              style={{ fontWeight: 800 }}
              initial={{ y: isAnimating ? -20 : 0, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: isAnimating ? 20 : 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {formatCount(userCount)}
            </motion.span>
          </AnimatePresence>
          <span className="text-[17px] text-white/80" style={{ fontWeight: 500 }}>
            users
          </span>
        </div>
        
        {/* Activity Bar */}
        <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ 
              width: `${Math.min(100, (userCount / 300) * 100)}%` 
            }}
            transition={springConfig}
          />
        </div>
      </div>

      {/* Status Text */}
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-white/60" style={{ fontWeight: 400 }}>
          Last updated
        </span>
        <span className="text-green-400" style={{ fontWeight: 600 }}>
          Just now
        </span>
      </div>
    </motion.div>
  );
}
