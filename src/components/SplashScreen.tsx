import { motion } from 'motion/react';
import { useEffect } from 'react';
import { BrandLogoAnimated } from './BrandLogo';

interface SplashScreenProps {
  onComplete: () => void;
  isDarkMode: boolean;
}

export function SplashScreen({ onComplete, isDarkMode }: SplashScreenProps) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      onComplete();
    }, 3000); // Extended to 3s for better brand impression

    return () => clearTimeout(timeout);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#000000]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Animated gradient orbs using brand colors */}
      <div className="absolute inset-0">
        {/* Cyan (Parking) - Top left */}
        <motion.div 
          className="absolute top-[15%] left-[10%] w-[300px] h-[300px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle, rgba(0, 191, 255, 0.25) 0%, transparent 70%)',
            filter: 'blur(60px)'
          }}
          animate={{
            scale: [1, 1.3, 1],
            x: [0, 30, 0],
            y: [0, -20, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Purple (AI/Personalized) - Center */}
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.28) 0%, transparent 70%)',
            filter: 'blur(70px)'
          }}
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.35, 0.55, 0.35],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5
          }}
        />
        
        {/* Magenta (Venues) - Bottom right */}
        <motion.div 
          className="absolute bottom-[10%] right-[15%] w-[350px] h-[350px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle, rgba(255, 0, 255, 0.22) 0%, transparent 70%)',
            filter: 'blur(65px)'
          }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, -25, 0],
            y: [0, 15, 0],
            opacity: [0.3, 0.48, 0.3],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
        
        {/* Pink (Accents) - Top right */}
        <motion.div 
          className="absolute top-[20%] right-[5%] w-[250px] h-[250px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle, rgba(217, 70, 239, 0.20) 0%, transparent 70%)',
            filter: 'blur(55px)'
          }}
          animate={{
            scale: [1, 1.35, 1],
            rotate: [0, 90, 0],
            opacity: [0.28, 0.45, 0.28],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.5
          }}
        />
        
        {/* Orange (Premium) - Bottom left */}
        <motion.div 
          className="absolute bottom-[15%] left-[8%] w-[280px] h-[280px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle, rgba(255, 69, 0, 0.24) 0%, transparent 70%)',
            filter: 'blur(58px)'
          }}
          animate={{
            scale: [1, 1.28, 1],
            x: [0, 20, 0],
            opacity: [0.32, 0.52, 0.32],
          }}
          transition={{
            duration: 6.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
      </div>

      {/* Radial gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)'
        }}
      />

      {/* Premium scan line effect */}
      <motion.div
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
        style={{ top: '50%' }}
        animate={{
          y: ['-100vh', '100vh'],
        }}
        transition={{
          duration: 3,
          ease: "linear",
          repeat: Infinity,
        }}
      />

      {/* Logo and Brand name */}
      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Animated Logo with spring physics */}
        <motion.div
          initial={{ scale: 0.3, rotate: -180, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 25,
            mass: 0.9,
            delay: 0.2
          }}
        >
          <BrandLogoAnimated size={180} withPulse={true} withRotation={false} />
        </motion.div>
        
        {/* Brand name with letter-by-letter animation */}
        <div className="mt-10 flex overflow-hidden">
          {['B', 'Y', 'T', 'S', 'P', 'O', 'T'].map((letter, index) => (
            <motion.span
              key={index}
              className="text-[56px] tracking-tight text-brand-gradient"
              style={{
                fontWeight: 700,
                letterSpacing: index === 6 ? '0' : '-0.03em',
              }}
              initial={{ opacity: 0, y: 20, rotateX: -90 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.6 + index * 0.08,
              }}
            >
              {letter}
            </motion.span>
          ))}
        </div>
        
        {/* Loading dots with brand colors */}
        <motion.div
          className="mt-10 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.4 }}
        >
          <div className="flex gap-2">
            {[
              { color: 'bg-[#00BFFF]', label: 'Parking' },
              { color: 'bg-[#FF00FF]', label: 'Venues' },
              { color: 'bg-[#FF4500]', label: 'Premium' }
            ].map((dot, i) => (
              <motion.div
                key={i}
                className={`w-2.5 h-2.5 rounded-full ${dot.color} shadow-lg`}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>
        
        {/* Tagline */}
        <motion.p
          className="mt-6 text-center text-white/80"
          style={{ 
            fontSize: 'var(--text-headline)',
            lineHeight: 'var(--text-headline-line)',
            fontWeight: 'var(--font-weight-medium)',
            letterSpacing: '0.01em'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 0.6 }}
        >
          Your perfect spot awaits
        </motion.p>

        {/* Feature hints with color coding */}
        <motion.div
          className="mt-8 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 0.5 }}
        >
          {[
            { label: 'Parking', color: 'border-[#00BFFF]/50 text-[#00BFFF]' },
            { label: 'Venues', color: 'border-[#FF00FF]/50 text-[#FF00FF]' },
            { label: 'AI-Powered', color: 'border-[#A855F7]/50 text-[#A855F7]' },
          ].map((feature, i) => (
            <motion.div
              key={i}
              className={`px-3 py-1 rounded-full border ${feature.color} bg-black/40 backdrop-blur-sm`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 2.3 + i * 0.1,
                duration: 0.3,
                type: "spring",
                stiffness: 300,
                damping: 20
              }}
            >
              <span className="text-[11px]" style={{ fontWeight: 600 }}>
                {feature.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
