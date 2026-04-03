import { motion } from 'motion/react';
import { Home, Compass, Map, Sparkles } from 'lucide-react';
import { memo } from 'react';
import { impactLight } from '../utils/haptics';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDarkMode: boolean;
  onMapButtonClick?: () => void;
  isVisible?: boolean;
}

// PERFORMANCE: Memoized to prevent re-renders on parent updates
export const BottomNav = memo(function BottomNav({
  activeTab,
  setActiveTab,
  isDarkMode,
  onMapButtonClick,
  isVisible = true
}: BottomNavProps) {

  const handleNavClick = (itemId: string) => {
    impactLight();
    if (itemId === 'map' && onMapButtonClick) {
      onMapButtonClick();
    } else {
      setActiveTab(itemId);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'map', label: 'Map', icon: Map },
    { id: 'concierge', label: 'Concierge', icon: Sparkles },
  ];

  return (
    <motion.nav
      className="absolute bottom-0 left-0 right-0 pt-2"
      style={{ paddingBottom: 'max(2rem, var(--safe-area-bottom, 0px))' }}
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : 120 }}
      transition={{
        type: "spring" as const,
        stiffness: 320,
        damping: 30,
        mass: 0.8,
      }}
      aria-label="Main navigation"
      role="navigation"
    >
      {/* iOS-style tab bar with blur - 8pt spacing */}
      <motion.div
        className="mx-4 border-2 border-white/30 rounded-[24px] bg-[#1C1C1E]/90 backdrop-blur-xl shadow-2xl"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          type: "spring" as const,
          stiffness: 320,
          damping: 30,
          mass: 0.8,
          delay: 0.2,
        }}
      >
        <div className="px-1 py-2 flex items-center" role="tablist" aria-label="App sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <motion.button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="flex flex-col items-center gap-1 py-2 flex-1 relative tap-target min-h-[44px]"
                whileTap={{ scale: 0.9 }}
                transition={{
                  type: "spring" as const,
                  stiffness: 320,
                  damping: 30,
                  mass: 0.8,
                }}
                aria-label={`${item.label} tab`}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={0}
              >
                {/* Active background pill */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabBackground"
                    className="absolute inset-0 rounded-[14px] bg-white/25"
                    transition={{
                      type: "spring" as const,
                      stiffness: 320,
                      damping: 30,
                      mass: 0.8,
                    }}
                  />
                )}

                {/* Icon */}
                <motion.div
                  className="relative"
                  animate={{ scale: isActive ? 1 : 0.9 }}
                  transition={{ type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 }}
                >
                  <Icon
                    className={`w-[24px] h-[24px] relative ${isActive ? 'text-white' : 'text-white/85'}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {/* Active dot indicator */}
                  {isActive && (
                    <motion.div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 }}
                    />
                  )}
                </motion.div>

                {/* Label */}
                <span
                  className={`relative ${isActive ? 'text-white' : 'text-white/85'}`}
                  style={{
                    fontSize: 'var(--text-caption-2)',
                    lineHeight: 'var(--text-caption-2-line)',
                    fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.nav>
  );
});