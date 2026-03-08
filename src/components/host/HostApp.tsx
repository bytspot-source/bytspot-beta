import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { providerApi } from '../../utils/api';
import { HostLanding } from './HostLanding';
import { HostOnboarding } from './HostOnboarding';
import { HostDashboardLayout, type DashboardView } from './dashboard/HostDashboardLayout';
import { DashboardHome } from './dashboard/DashboardHome';
import { DashboardListings } from './dashboard/DashboardListings';
import { DashboardBookings } from './dashboard/DashboardBookings';
import { DashboardEarnings } from './dashboard/DashboardEarnings';
import { DashboardReviews } from './dashboard/DashboardReviews';
import { DashboardCalendar } from './dashboard/DashboardCalendar';
import { DashboardSettings } from './dashboard/DashboardSettings';
import { DashboardFusionEngine } from './dashboard/DashboardFusionEngine';
import { DashboardCompliance } from './dashboard/DashboardCompliance';
import { ArrowLeft } from 'lucide-react';

type HostScreen = 'landing' | 'onboarding' | 'dashboard';

interface HostAppProps {
  isDarkMode: boolean;
  onBackToMain?: () => void;
}

export function HostApp({ isDarkMode, onBackToMain }: HostAppProps) {
  const [currentScreen, setCurrentScreen] = useState<HostScreen>('landing');
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [isLoading, setIsLoading] = useState(true);
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Check provider status from API to determine initial screen
  useEffect(() => {
    const initializeHostApp = async () => {
      try {
        // Check for force-onboarding flag (useful for development/testing)
        const forceOnboarding = new URLSearchParams(window.location.search).get('force-onboarding');
        if (forceOnboarding === 'true') {
          await providerApi.resetHostProfile();
          setCurrentScreen('landing');
          setIsLoading(false);
          return;
        }

        const res = await providerApi.getStatus();
        if (res.success && res.data?.host) {
          const { status } = res.data.host;
          if (status === 'approved' || status === 'pending') {
            setCurrentScreen('dashboard');
          } else if (status === 'draft') {
            // Resume onboarding from where they left off
            setCurrentScreen('onboarding');
          }
        }
      } catch (error) {
        console.error('Error loading host profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeHostApp();
  }, []);

  // Render dashboard content based on current view
  const renderDashboardContent = () => {
    switch (dashboardView) {
      case 'overview':
        return <DashboardHome isDarkMode={isDarkMode} />;
      case 'listings':
        return <DashboardListings isDarkMode={isDarkMode} />;
      case 'bookings':
        return <DashboardBookings isDarkMode={isDarkMode} />;
      case 'earnings':
        return <DashboardEarnings isDarkMode={isDarkMode} />;
      case 'reviews':
        return <DashboardReviews isDarkMode={isDarkMode} />;
      case 'calendar':
        return <DashboardCalendar isDarkMode={isDarkMode} />;
      case 'fusion-engine':
        return <DashboardFusionEngine isDarkMode={isDarkMode} />;
      case 'compliance':
        return <DashboardCompliance isDarkMode={isDarkMode} />;
      case 'settings':
        return <DashboardSettings isDarkMode={isDarkMode} />;
      default:
        return <DashboardHome isDarkMode={isDarkMode} />;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <div className="w-8 h-8 rounded-full border-4 border-white/30 border-t-white animate-spin" />
          </div>
          <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
            Loading Host Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients - Only show on landing and onboarding */}
      {currentScreen !== 'dashboard' && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[#000000]" />
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
                 style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, transparent 70%)' }} />
            <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px]" 
                 style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.15) 0%, transparent 70%)' }} />
          </div>
        </div>
      )}

      {/* Back Button - Show on onboarding screen */}
      {currentScreen === 'onboarding' && (
        <div className="absolute top-4 left-4 z-50">
          <motion.button
            onClick={() => setCurrentScreen('landing')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
        </div>
      )}

      {/* Main Content */}
      <div className={currentScreen === 'dashboard' ? '' : 'relative max-w-[1200px] mx-auto min-h-screen'}>
        <AnimatePresence mode="wait">
          {currentScreen === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <HostLanding
                isDarkMode={isDarkMode}
                onGetStarted={() => setCurrentScreen('onboarding')}
                onBackToMain={onBackToMain}
              />
            </motion.div>
          )}

          {currentScreen === 'onboarding' && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <HostOnboarding
                isDarkMode={isDarkMode}
                onComplete={() => setCurrentScreen('dashboard')}
              />
            </motion.div>
          )}

          {currentScreen === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <HostDashboardLayout
                isDarkMode={isDarkMode}
                currentView={dashboardView}
                onViewChange={setDashboardView}
                onBackToMain={onBackToMain}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={dashboardView}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderDashboardContent()}
                  </motion.div>
                </AnimatePresence>
              </HostDashboardLayout>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
