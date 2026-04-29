import { motion } from 'motion/react';
import { ReactNode, memo } from 'react';

interface QuickActionCardProps {
  delay: number;
  icon: ReactNode;
  title: string;
  subtitle: string;
  color: 'cyan' | 'purple' | 'orange' | 'green' | 'pink' | 'magenta';
  isDarkMode: boolean;
  onClick?: () => void;
}

// Brand color mapping
// Cyan (#00BFFF) - Parking
// Magenta (#FF00FF) - Venues
// Orange (#FF4500) - Premium
// Purple (#A855F7) - AI/Personalized
// Pink (#D946EF) - Accents
const colorMap = {
  cyan: {
    darkBg: 'from-[#00BFFF]/90 to-[#00BFFF]/70',
    lightBg: 'from-[#00BFFF] to-[#0099CC]',
    shadow: 'shadow-[#00BFFF]/30',
    glow: 'rgba(0, 191, 255, 0.3)',
  },
  purple: {
    darkBg: 'from-[#A855F7]/90 to-[#A855F7]/70',
    lightBg: 'from-[#A855F7] to-[#9333EA]',
    shadow: 'shadow-[#A855F7]/30',
    glow: 'rgba(168, 85, 247, 0.3)',
  },
  orange: {
    darkBg: 'from-[#FF4500]/90 to-[#FF4500]/70',
    lightBg: 'from-[#FF4500] to-[#CC3700]',
    shadow: 'shadow-[#FF4500]/30',
    glow: 'rgba(255, 69, 0, 0.3)',
  },
  green: {
    darkBg: 'from-emerald-500/90 to-teal-500/90',
    lightBg: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/25',
    glow: 'rgba(16, 185, 129, 0.3)',
  },
  pink: {
    darkBg: 'from-[#D946EF]/90 to-[#D946EF]/70',
    lightBg: 'from-[#D946EF] to-[#C026D3]',
    shadow: 'shadow-[#D946EF]/30',
    glow: 'rgba(217, 70, 239, 0.3)',
  },
  magenta: {
    darkBg: 'from-[#FF00FF]/90 to-[#FF00FF]/70',
    lightBg: 'from-[#FF00FF] to-[#CC00CC]',
    shadow: 'shadow-[#FF00FF]/30',
    glow: 'rgba(255, 0, 255, 0.3)',
  },
};

// PERFORMANCE: Memoized to prevent re-renders when parent updates
export const QuickActionCard = memo(function QuickActionCard({ 
  delay, 
  icon, 
  title, 
  subtitle, 
  color, 
  isDarkMode, 
  onClick 
}: QuickActionCardProps) {
  const colors = colorMap[color];

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: "spring" as const,
        stiffness: 320,
        damping: 30,
        mass: 0.8,
        delay,
      }}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.015, y: -4 }}
      className="group relative overflow-hidden rounded-[20px] p-[1px] tap-target shadow-[0_16px_36px_rgba(0,0,0,0.26)]"
      style={{ height: 'clamp(98px, 24vw, 108px)' }}
      aria-label={`${title}: ${subtitle}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.darkBg} opacity-60`} />
      <div className="absolute inset-[1px] rounded-[19px] bg-[#111116]/90" />
      <div
        className="absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-90"
        style={{ background: colors.glow, opacity: 0.5 }}
      />

      <div className="relative h-full rounded-[19px] border border-white/20 bg-[linear-gradient(145deg,rgba(34,34,42,0.92),rgba(14,14,18,0.94))] p-3.5 text-left shadow-lg backdrop-blur-xl">
        <div className="absolute inset-x-3 top-0 h-px bg-white/35" />
        <div className="flex h-full flex-col">
          <motion.div
            className={`mb-2 flex h-9 w-9 items-center justify-center rounded-[12px] bg-gradient-to-br ${colors.darkBg} ${colors.shadow} shadow-lg ring-1 ring-white/25`}
            transition={{
              type: "spring" as const,
              stiffness: 320,
              damping: 30,
              mass: 0.8,
            }}
            aria-hidden="true"
          >
            <div className="text-white">
              {icon}
            </div>
          </motion.div>

          <div className="flex-1 min-w-0">
            <h3 className="text-white truncate" style={{
              fontSize: 'var(--text-headline)',
              lineHeight: 'var(--text-headline-line)',
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: '2px'
            }}>
              {title}
            </h3>
            <p className="text-white/80 line-clamp-2" style={{
              fontSize: 'var(--text-footnote)',
              lineHeight: 'var(--text-footnote-line)',
              fontWeight: 'var(--font-weight-regular)'
            }}>
              {subtitle}
            </p>
          </div>

          <div className="absolute top-3.5 right-3.5 rounded-full bg-white/10 p-1 text-white/75 ring-1 ring-white/10" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </motion.button>
  );
});