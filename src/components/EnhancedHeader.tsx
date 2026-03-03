import { motion, useScroll, useTransform } from 'motion/react';
import { Sun, Cloud, CloudRain, MapPin, Menu, Zap, TrendingUp, Clock } from 'lucide-react';
import { ZoneUserCount } from './ZoneUserCount';
import { useRef, useEffect, useState } from 'react';

interface EnhancedHeaderProps {
  onProfileClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export function EnhancedHeader({ onProfileClick, scrollContainerRef }: EnhancedHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState('');
  const headerRef = useRef<HTMLDivElement>(null);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Generate personalized greeting with Midtown context
  useEffect(() => {
    const hour = currentTime.getHours();
    const userName = localStorage.getItem('bytspot_user_name') || '';

    let timeGreeting = '';
    let midtownContext = '';
    if (hour >= 5 && hour < 9) {
      timeGreeting = 'Good morning';
      midtownContext = 'Midtown is waking up ☕';
    } else if (hour >= 9 && hour < 12) {
      timeGreeting = 'Good morning';
      midtownContext = 'Perfect time to explore 🌤️';
    } else if (hour >= 12 && hour < 14) {
      timeGreeting = 'Good afternoon';
      midtownContext = 'Lunch rush in Midtown 🍽️';
    } else if (hour >= 14 && hour < 17) {
      timeGreeting = 'Good afternoon';
      midtownContext = 'Midtown is buzzing 🌆';
    } else if (hour >= 17 && hour < 20) {
      timeGreeting = 'Good evening';
      midtownContext = 'Happy hour time 🍸';
    } else if (hour >= 20 && hour < 23) {
      timeGreeting = 'Good evening';
      midtownContext = 'Midtown is live tonight 🔥';
    } else {
      timeGreeting = 'Late night';
      midtownContext = 'Late night in Midtown 🌙';
    }

    setGreeting(userName ? `${timeGreeting}, ${userName}` : `${timeGreeting} · ${midtownContext}`);
  }, [currentTime]);

  // Scroll-based animations
  const { scrollY } = useScroll({
    container: scrollContainerRef,
  });

  const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.95]);
  const headerBlur = useTransform(scrollY, [0, 100], [20, 40]);
  const titleScale = useTransform(scrollY, [0, 50], [1, 0.85]);
  const titleOpacity = useTransform(scrollY, [0, 80], [1, 0]);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Get weather icon
  const getWeatherIcon = () => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 20) {
      return <Sun className="w-[18px] h-[18px] text-amber-400" strokeWidth={2} />;
    }
    return <Cloud className="w-[18px] h-[18px] text-blue-400" strokeWidth={2} />;
  };

  return (
    <motion.div 
      ref={headerRef}
      className="relative"
      style={{ opacity: headerOpacity }}
    >
      {/* Status Bar - Enhanced */}
      <motion.div 
        className="px-4 mb-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div 
          className="rounded-[20px] overflow-hidden border-2 border-white/30 shadow-2xl"
          style={{
            backdropFilter: `blur(${headerBlur}px)`,
            WebkitBackdropFilter: `blur(${headerBlur}px)`,
          }}
        >
          {/* Main Status Row */}
          <div className="px-4 py-3 bg-[#1C1C1E]/85 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              {/* Left: Time-sensitive info */}
              <div className="flex items-center gap-3">
                {/* Weather */}
                <div className="flex items-center gap-2">
                  {getWeatherIcon()}
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    72°
                  </span>
                </div>
                
                {/* Separator */}
                <div className="w-px h-4 bg-white/20" />
                
                {/* Time */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-[14px] h-[14px] text-white/80" strokeWidth={2.5} />
                  <span className="text-[13px] text-white/90" style={{ fontWeight: 500 }}>
                    {currentTime.toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })}
                  </span>
                </div>
              </div>

              {/* Right: Location & Profile */}
              <div className="flex items-center gap-2">
                {/* Zone Activity */}
                <ZoneUserCount compact={true} />
                
                {/* Separator */}
                <div className="w-px h-4 bg-white/20" />
                
                {/* Location */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00BFFF]/15 border border-[#00BFFF]/30">
                  <MapPin className="w-[13px] h-[13px] text-[#00BFFF]" strokeWidth={2.5} />
                  <span className="text-[12px] text-[#00BFFF]" style={{ fontWeight: 600 }}>
                    ATL
                  </span>
                </div>
                
                {/* Profile Menu Button */}
                <motion.button
                  onClick={onProfileClick}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-[#A855F7]/50 to-[#00BFFF]/50 border-2 border-white/40 shadow-lg tap-target relative overflow-hidden"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  {/* Animated gradient overlay */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-[#00BFFF]/30 to-[#FF00FF]/30"
                    animate={{
                      rotate: [0, 360],
                    }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <Menu className="w-[18px] h-[18px] text-white relative z-10" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Quick Stats Bar - Glassmorphism */}
          <motion.div 
            className="px-4 py-2 bg-gradient-to-r from-[#00BFFF]/10 via-[#A855F7]/10 to-[#FF00FF]/10 backdrop-blur-sm border-t border-white/10"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between text-[11px]">
              {/* Live parking availability */}
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  <span className="text-green-400" style={{ fontWeight: 700 }}>342</span> spots nearby
                </span>
              </div>
              
              {/* Separator */}
              <div className="w-px h-3 bg-white/15" />
              
              {/* Peak hours indicator */}
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  <span className="text-orange-400" style={{ fontWeight: 700 }}>Peak</span> hours
                </span>
              </div>
              
              {/* Separator */}
              <div className="w-px h-3 bg-white/15" />
              
              {/* AI recommendations */}
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[#A855F7]" strokeWidth={2.5} />
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  <span className="text-[#A855F7]" style={{ fontWeight: 700 }}>8</span> for you
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Greeting - Compact */}
      <motion.div
        className="px-4 pt-3 pb-2"
        style={{ scale: titleScale, opacity: titleOpacity }}
      >
        <motion.p
          className="text-[15px] text-white/80"
          style={{ fontWeight: 500 }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          {greeting}
        </motion.p>
        {(() => {
          const userName = localStorage.getItem('bytspot_user_name') || '';
          const hour = new Date().getHours();
          let ctx = '';
          if (hour >= 5 && hour < 9) ctx = 'Midtown is waking up ☕';
          else if (hour >= 9 && hour < 12) ctx = 'Perfect time to explore 🌤️';
          else if (hour >= 12 && hour < 14) ctx = 'Lunch rush in Midtown 🍽️';
          else if (hour >= 14 && hour < 17) ctx = 'Midtown is buzzing 🌆';
          else if (hour >= 17 && hour < 20) ctx = 'Happy hour time 🍸';
          else if (hour >= 20 && hour < 23) ctx = 'Midtown is live tonight 🔥';
          else ctx = 'Late night in Midtown 🌙';
          if (!userName) return null;
          return (
            <motion.p
              className="text-[12px] text-white/50 mt-0.5"
              style={{ fontWeight: 400 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springConfig, delay: 0.25 }}
            >
              {ctx}
            </motion.p>
          );
        })()}
      </motion.div>
    </motion.div>
  );
}
