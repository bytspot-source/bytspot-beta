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
      whileHover={{ scale: 1.01, y: -4 }}
	      className="relative overflow-hidden rounded-[18px] p-[1px] tap-target"
	      style={{ height: 'clamp(96px, 24vw, 112px)' }}
      aria-label={`${title}: ${subtitle}`}
    >
      {/* Gradient border effect */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.darkBg} opacity-30`} />
      
      {/* Card content */}
	      <div className="relative rounded-[17px] p-3.5 border border-white/25 text-left h-full flex flex-col bg-[#1C1C1E]/80 backdrop-blur-xl shadow-lg hover:shadow-xl">
	        {/* Icon - compact but still legible in App Clip */}
        <motion.div
	          className={`w-9 h-9 rounded-[11px] bg-gradient-to-br ${colors.darkBg} ${colors.shadow} shadow-lg flex items-center justify-center mb-2.5`}
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

        {/* Text - Using iOS typography scale */}
        <div className="flex-1">
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

        {/* Chevron indicator */}
	        <div className="absolute top-3.5 right-3.5 text-white/70" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </motion.button>
  );
});