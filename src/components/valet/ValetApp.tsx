import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '../../utils/trpc';
import { ValetDashboard } from './ValetDashboard';
import { IndependentContractorAgreement } from '../legal/IndependentContractorAgreement';

type ValetScreen = 'contractor-agreement' | 'dashboard';

interface ValetAppProps {
  isDarkMode: boolean;
  onBackToMain?: () => void;
}

export function ValetApp({ isDarkMode, onBackToMain }: ValetAppProps) {
  const [currentScreen, setCurrentScreen] = useState<ValetScreen>('contractor-agreement');
  
  const [isLoading, setIsLoading] = useState(true);

  // Check provider status from API
  useEffect(() => {
    trpc.providers.getStatus.query().then((res) => {
      if (res?.valet?.status === 'active') {
        setCurrentScreen('dashboard');
      }
    }).finally(() => setIsLoading(false));
  }, []);
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  if (isLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#000000] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, transparent 70%)' }} />
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.15) 0%, transparent 70%)' }} />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-[393px] mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {currentScreen === 'contractor-agreement' && (
            <motion.div
              key="contractor-agreement"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <IndependentContractorAgreement
                isDarkMode={isDarkMode}
                serviceType="valet"
                onAccept={async () => {
                  await trpc.providers.acceptValetAgreement.mutate();
                  setCurrentScreen('dashboard');
                }}
                onDecline={() => {
                  if (onBackToMain) onBackToMain();
                }}
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
              <ValetDashboard
                isDarkMode={isDarkMode}
                onBackToMain={onBackToMain}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
