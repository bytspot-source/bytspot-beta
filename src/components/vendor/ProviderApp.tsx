import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { trpc } from '../../utils/trpc';
import { persistProviderReviewState, readProviderReviewState, resolveProviderReviewState, type ProviderReviewState } from '../../utils/providerApproval';
import { saveProviderProgress } from '../../utils/providerOnboardingApi';
import { isProviderStripeConnectPath, syncProviderStripeConnectReturn } from '../../utils/providerStripeConnectReturn';
import { ProviderLanding } from './ProviderLanding';
import { ProviderOnboarding } from './ProviderOnboarding';
import { ProviderDashboardLayout, type DashboardView } from './dashboard/ProviderDashboardLayout';
import { DashboardHome } from './dashboard/DashboardHome';
import { DashboardListings } from './dashboard/DashboardListings';
import { ProviderConsole } from './dashboard/ProviderConsole';
import { DashboardEarnings } from './dashboard/DashboardEarnings';
import { DashboardReviews } from './dashboard/DashboardReviews';
import { DashboardCalendar } from './dashboard/DashboardCalendar';
import { DashboardPatches } from './dashboard/DashboardPatches';
import { DashboardSettings } from './dashboard/DashboardSettings';
import { DashboardCompliance } from './dashboard/DashboardCompliance';
import { ArrowLeft } from 'lucide-react';
import {
  canAccessDashboardView,
  firstAllowedDashboardView,
  readProviderDashboardAccess,
  type ProviderDashboardAccess,
} from './dashboard/providerDashboardAccess';

type ProviderScreen = 'landing' | 'onboarding' | 'dashboard';

interface ProviderAppProps {
  isDarkMode: boolean;
  onBackToMain?: () => void;
  initialScreen?: ProviderScreen;
  initialDashboardView?: DashboardView;
}

export function ProviderApp({ isDarkMode, onBackToMain, initialScreen = 'landing', initialDashboardView = 'overview' }: ProviderAppProps) {
  const [currentScreen, setCurrentScreen] = useState<ProviderScreen>(initialScreen);
  const [dashboardView, setDashboardView] = useState<DashboardView>(initialDashboardView);
  const [dashboardAccess, setDashboardAccess] = useState<ProviderDashboardAccess>(() => readProviderDashboardAccess());
  const [providerReviewState, setProviderReviewState] = useState<ProviderReviewState | null>(() => readProviderReviewState());
  const [isLoading, setIsLoading] = useState(true);
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Check provider status from API to determine initial screen
  useEffect(() => {
    const initializeProviderApp = async () => {
      try {
        // Check for force-onboarding flag (useful for development/testing)
        const forceOnboarding = new URLSearchParams(window.location.search).get('force-onboarding');
        if (forceOnboarding === 'true') {
          await trpc.providers.resetHostProfile.mutate();
          setCurrentScreen('landing');
          setIsLoading(false);
          return;
        }

        const res = await trpc.providers.getStatus.query();
        if (res?.host) {
          const providerProfile = res.host;
          const { status } = providerProfile;
          let providerOnboardingData = providerProfile.onboardingData;
          let providerCurrentStep = Number(providerProfile.currentStep ?? 1);
          if (providerOnboardingData && isProviderStripeConnectPath()) {
            const synced = await syncProviderStripeConnectReturn(providerOnboardingData, providerCurrentStep);
            providerOnboardingData = synced.onboardingData;
            providerCurrentStep = synced.currentStep;
            if (synced.payoutUpdated) {
              saveProviderProgress(providerCurrentStep, providerOnboardingData).catch(() => {
                // Non-blocking: the dashboard remains usable and will retry on the next return/refresh.
              });
            }
          }
          const reviewState = resolveProviderReviewState(status, providerOnboardingData);
          persistProviderReviewState(reviewState);
          setProviderReviewState(reviewState);
          if (status === 'approved' || status === 'pending') {
            setCurrentScreen('dashboard');
          } else if (status === 'draft') {
            // Resume onboarding from where they left off
            setCurrentScreen('onboarding');
          }
        }
      } catch (error) {
        console.error('Error loading provider profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeProviderApp();
  }, []);

  useEffect(() => {
    const refreshAccess = () => {
      const nextAccess = readProviderDashboardAccess();
      setDashboardAccess(nextAccess);
      setDashboardView((currentView) => canAccessDashboardView(nextAccess, currentView) ? currentView : firstAllowedDashboardView(nextAccess));
    };
    const refreshReview = () => setProviderReviewState(readProviderReviewState());
    window.addEventListener('storage', refreshAccess);
    window.addEventListener('bytspot:provider-access-updated', refreshAccess);
    window.addEventListener('bytspot:provider-review-updated', refreshReview);
    return () => {
      window.removeEventListener('storage', refreshAccess);
      window.removeEventListener('bytspot:provider-access-updated', refreshAccess);
      window.removeEventListener('bytspot:provider-review-updated', refreshReview);
    };
  }, []);

  useEffect(() => {
    if (!canAccessDashboardView(dashboardAccess, dashboardView)) {
      setDashboardView(firstAllowedDashboardView(dashboardAccess));
    }
  }, [dashboardAccess, dashboardView]);

  const handleDashboardNavigate = (target: DashboardView) => {
    if (canAccessDashboardView(dashboardAccess, target)) setDashboardView(target);
  };

  const openDashboardAfterOnboarding = () => {
    setProviderReviewState(readProviderReviewState());
    try {
      const requestedView = localStorage.getItem('bytspot_provider_dashboard_view') as DashboardView | null;
      localStorage.removeItem('bytspot_provider_dashboard_view');
      if (requestedView && canAccessDashboardView(dashboardAccess, requestedView)) setDashboardView(requestedView);
    } catch {
      // Continue to the dashboard even if localStorage is unavailable.
    }
    setCurrentScreen('dashboard');
  };

  // Render dashboard content based on current view
  const renderDashboardContent = () => {
    if (!canAccessDashboardView(dashboardAccess, dashboardView)) {
      return <DashboardHome isDarkMode={isDarkMode} access={dashboardAccess} reviewState={providerReviewState} onNavigate={handleDashboardNavigate} />;
    }

    switch (dashboardView) {
      case 'overview':
        return <DashboardHome isDarkMode={isDarkMode} access={dashboardAccess} reviewState={providerReviewState} onNavigate={handleDashboardNavigate} />;
      case 'listings':
        return <DashboardListings isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'bookings':
        return <ProviderConsole isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'earnings':
        return <DashboardEarnings isDarkMode={isDarkMode} access={dashboardAccess} reviewState={providerReviewState} />;
      case 'reviews':
        return <DashboardReviews isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'calendar':
        return <DashboardCalendar isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'patches':
        return <DashboardPatches isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'compliance':
        return <DashboardCompliance isDarkMode={isDarkMode} access={dashboardAccess} />;
      case 'settings':
        return <DashboardSettings isDarkMode={isDarkMode} access={dashboardAccess} />;
      default:
        return <DashboardHome isDarkMode={isDarkMode} access={dashboardAccess} reviewState={providerReviewState} onNavigate={handleDashboardNavigate} />;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className={`relative min-h-screen overflow-x-hidden flex items-center justify-center ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <div className={`w-8 h-8 rounded-full border-4 ${isDarkMode ? 'border-white/30 border-t-white' : 'border-slate-300 border-t-slate-700'} animate-spin`} />
          </div>
          <p className={`text-[15px] ${isDarkMode ? 'text-slate-100' : 'text-slate-600'}`} style={{ fontWeight: 500 }}>
            Loading Provider Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen overflow-x-hidden ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
      {/* Background gradients - Only show on landing and onboarding */}
      {currentScreen !== 'dashboard' && (
        <div className="absolute inset-0">
          <div className={`absolute inset-0 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`} />
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
              <ProviderLanding
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
              <ProviderOnboarding
                isDarkMode={isDarkMode}
                onComplete={openDashboardAfterOnboarding}
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
              <ProviderDashboardLayout
                isDarkMode={isDarkMode}
                currentView={dashboardView}
                onViewChange={setDashboardView}
                onBackToMain={onBackToMain}
                access={dashboardAccess}
                reviewState={providerReviewState}
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
              </ProviderDashboardLayout>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
