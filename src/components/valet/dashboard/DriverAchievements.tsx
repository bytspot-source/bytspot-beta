import { motion } from 'motion/react';
import { ArrowLeft, Award, Star, Zap, Shield, Crown } from 'lucide-react';
import { mockDriverProfile } from '../../../utils/valetMockData';

interface DriverAchievementsProps {
  isDarkMode: boolean;
  onBack: () => void;
}

const certificationMeta: Record<string, { label: string; icon: typeof Star; color: string; bg: string; description: string }> = {
  manual_transmission: { label: 'Manual Pro', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-400/30', description: 'Certified manual transmission driver' },
  ev_specialist: { label: 'EV Specialist', icon: Zap, color: 'text-green-400', bg: 'bg-green-500/20 border-green-400/30', description: 'Electric vehicle handling expert' },
  luxury_handling: { label: 'Luxury Elite', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-400/30', description: 'Premium & luxury vehicle certified' },
  etiquette_gold: { label: 'Etiquette Gold', icon: Star, color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-400/30', description: 'Top-tier customer service standard' },
};

const milestones = [
  { jobs: 100, label: '100 Jobs', icon: Award, unlocked: true, color: 'text-green-400', bg: 'bg-green-500/20 border-green-400/30' },
  { jobs: 250, label: '250 Jobs', icon: Star, unlocked: true, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-400/30' },
  { jobs: 500, label: '500 Jobs', icon: Shield, unlocked: true, color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-400/30' },
  { jobs: 1000, label: '1K Club', icon: Crown, unlocked: true, color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-400/30' },
  { jobs: 1500, label: '1500 Jobs', icon: Crown, unlocked: false, color: 'text-white/30', bg: 'bg-white/5 border-white/10' },
  { jobs: 2500, label: '2500 Elite', icon: Crown, unlocked: false, color: 'text-white/30', bg: 'bg-white/5 border-white/10' },
];

export function DriverAchievements({ isDarkMode, onBack }: DriverAchievementsProps) {
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const { totalJobs, rating, certifications } = mockDriverProfile;

  const nextMilestone = milestones.find((m) => !m.unlocked);
  const progress = nextMilestone ? Math.min((totalJobs / nextMilestone.jobs) * 100, 100) : 100;

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <motion.button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }} transition={springConfig}>
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <div>
          <h1 className="text-title-2 text-white">Achievements</h1>
          <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>Your milestones and badges</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-5">
        {/* Stats Banner */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-gradient-to-br from-yellow-500/20 to-purple-500/20 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>{totalJobs.toLocaleString()}</div>
              <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-[28px] text-yellow-400" style={{ fontWeight: 700 }}>⭐ {rating}</div>
              <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>Avg Rating</div>
            </div>
            <div className="text-center">
              <div className="text-[28px] text-purple-400" style={{ fontWeight: 700 }}>{certifications.length}</div>
              <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>Certs</div>
            </div>
          </div>
          {nextMilestone && (
            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-white/60">{totalJobs} jobs</span>
                <span className="text-white/60">Next: {nextMilestone.label} ({nextMilestone.jobs - totalJobs} to go)</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-purple-400"
                  initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ...springConfig, delay: 0.3 }} />
              </div>
            </div>
          )}
        </motion.div>

        {/* Milestone Badges */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }}>
          <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>Job Milestones</h3>
          <div className="grid grid-cols-3 gap-3">
            {milestones.map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div key={m.label}
                  className={`rounded-[16px] p-3 border ${m.bg} flex flex-col items-center gap-1.5 ${!m.unlocked ? 'opacity-40' : ''}`}
                  initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: m.unlocked ? 1 : 0.4, scale: 1 }}
                  transition={{ ...springConfig, delay: 0.12 + i * 0.04 }}>
                  <Icon className={`w-6 h-6 ${m.color}`} strokeWidth={2.5} />
                  <span className="text-[12px] text-white text-center" style={{ fontWeight: 600 }}>{m.label}</span>
                  {!m.unlocked && <span className="text-[10px] text-white/40" style={{ fontWeight: 400 }}>Locked</span>}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Certifications */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.2 }}>
          <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>Driver Certifications</h3>
          <div className="space-y-3">
            {certifications.map((certKey, i) => {
              const meta = certificationMeta[certKey];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <motion.div key={certKey}
                  className={`rounded-[16px] p-4 border ${meta.bg} flex items-center gap-3`}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springConfig, delay: 0.22 + i * 0.05 }}>
                  <div className={`w-10 h-10 rounded-full ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${meta.color}`} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>{meta.label}</div>
                    <div className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>{meta.description}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

