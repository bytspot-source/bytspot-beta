import { motion } from 'motion/react';

interface BrandLogoProps {
  size?: number;
  animated?: boolean;
  showGlow?: boolean;
}

export function BrandLogo({ size = 120, animated = false, showGlow = false }: BrandLogoProps) {
  const logoMotion = animated ? {
    animate: {
      rotate: [0, 360],
    },
    transition: {
      duration: 20,
      repeat: Infinity,
      ease: "linear",
    }
  } : {};

  return (
    <motion.div 
      className="flex items-center justify-center"
      {...logoMotion}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={showGlow ? {
          filter: 'drop-shadow(0 0 12px rgba(0, 191, 255, 0.4)) drop-shadow(0 0 24px rgba(168, 85, 247, 0.3))',
        } : undefined}
      >
        {/* Outer ring - Cyan to Purple gradient */}
        <circle
          cx="60"
          cy="60"
          r="48"
          stroke="url(#gradient-outer-ring)"
          strokeWidth="3"
          fill="none"
          opacity="1"
        />
        
        {/* Middle ring - subtle glow */}
        <circle
          cx="60"
          cy="60"
          r="38"
          stroke="url(#gradient-middle)"
          strokeWidth="2"
          fill="none"
          opacity="0.4"
        />
        
        {/* Central hexagon - filled with gradient */}
        <path
          d="M60 32 L74 41 L74 59 L60 68 L46 59 L46 41 Z"
          fill="url(#gradient-hexagon)"
          opacity="0.95"
        />
        
        {/* Hexagon border - bright accent */}
        <path
          d="M60 32 L74 41 L74 59 L60 68 L46 59 L46 41 Z"
          stroke="url(#gradient-hex-border)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.8"
        />
        
        {/* Center dot - location pin indicator */}
        <circle 
          cx="60" 
          cy="50" 
          r="8" 
          fill="url(#gradient-center-dot)"
        />
        
        {/* Inner glow around center dot */}
        <circle 
          cx="60" 
          cy="50" 
          r="12" 
          fill="url(#gradient-center-glow)"
          opacity="0.3"
        />
        
        <defs>
          {/* Outer ring gradient - Cyan to Purple */}
          <linearGradient id="gradient-outer-ring" x1="12" y1="12" x2="108" y2="108">
            <stop offset="0%" stopColor="#00BFFF" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#00BFFF" />
          </linearGradient>
          
          {/* Middle ring gradient */}
          <linearGradient id="gradient-middle" x1="22" y1="22" x2="98" y2="98">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
          
          {/* Hexagon fill gradient - Purple to Magenta */}
          <linearGradient id="gradient-hexagon" x1="46" y1="32" x2="74" y2="68">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="50%" stopColor="#D946EF" />
            <stop offset="100%" stopColor="#FF00FF" />
          </linearGradient>
          
          {/* Hexagon border gradient */}
          <linearGradient id="gradient-hex-border" x1="46" y1="32" x2="74" y2="68">
            <stop offset="0%" stopColor="#00BFFF" />
            <stop offset="50%" stopColor="#FF00FF" />
            <stop offset="100%" stopColor="#00BFFF" />
          </linearGradient>
          
          {/* Center dot gradient - Cyan */}
          <radialGradient id="gradient-center-dot">
            <stop offset="0%" stopColor="#00BFFF" />
            <stop offset="100%" stopColor="#0099CC" />
          </radialGradient>
          
          {/* Center glow */}
          <radialGradient id="gradient-center-glow">
            <stop offset="0%" stopColor="#00BFFF" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

export function BrandLogotype({ 
  size = "large",
  showLogo = true,
  animated = false 
}: { 
  size?: "small" | "medium" | "large";
  showLogo?: boolean;
  animated?: boolean;
}) {
  const heights = {
    small: 24,
    medium: 40,
    large: 60
  };
  
  const height = heights[size];
  const logoSize = size === "small" ? 24 : size === "medium" ? 40 : 60;
  
  return (
    <div className="flex items-center gap-3">
      {showLogo && <BrandLogo size={logoSize} animated={animated} />}
      <div className="flex flex-col justify-center">
        <div 
          className="tracking-tight leading-none"
          style={{ 
            fontSize: height,
            fontWeight: 700,
            background: 'linear-gradient(90deg, #00BFFF 0%, #A855F7 50%, #FF00FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          BYTSPOT
        </div>
      </div>
    </div>
  );
}

// Compact logo for small spaces (nav, headers, etc.)
export function BrandLogoCompact({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <BrandLogo size={size} />
      <span 
        className="tracking-tight leading-none"
        style={{
          fontSize: size * 0.6,
          fontWeight: 700,
          background: 'linear-gradient(90deg, #00BFFF 0%, #A855F7 50%, #FF00FF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        BYTSPOT
      </span>
    </div>
  );
}

// Animated splash version
export function BrandLogoAnimated({ 
  size = 120,
  withPulse = true,
  withRotation = true 
}: { 
  size?: number;
  withPulse?: boolean;
  withRotation?: boolean;
}) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: 1, 
        opacity: 1,
      }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
    >
      {withPulse ? (
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <BrandLogo size={size} animated={withRotation} showGlow />
        </motion.div>
      ) : (
        <BrandLogo size={size} animated={withRotation} showGlow />
      )}
    </motion.div>
  );
}
