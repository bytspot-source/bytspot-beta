import { motion, AnimatePresence } from 'motion/react';
import { Shield, ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';

interface DataConsentFlowProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

type ConsentStep = 'intro';

export function DataConsentFlow({ isDarkMode, onComplete }: DataConsentFlowProps) {
  const [currentStep, setCurrentStep] = useState<ConsentStep>('intro');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };



  return (
    <div className="min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)' }} />
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.2) 0%, transparent 70%)' }} />
        </div>
      </div>

      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12">
        <AnimatePresence mode="wait">
          {/* Intro Step */}
          {currentStep === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={springConfig}
              className="flex-1 flex flex-col justify-center"
            >
              <div className="text-center mb-12">
                <motion.div
                  className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 shadow-xl"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ ...springConfig, delay: 0.1 }}
                >
                  <Shield className="w-12 h-12 text-white" strokeWidth={2.5} />
                </motion.div>

                <motion.h1
                  className="text-large-title mb-4 text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  Privacy & Permissions
                </motion.h1>

                <motion.p
                  className="text-[17px] text-white/90 mb-2"
                  style={{ fontWeight: 400 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Your privacy matters to us.
                </motion.p>

                <motion.p
                  className="text-[15px] text-white/70 max-w-[320px] mx-auto"
                  style={{ fontWeight: 400 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Bytspot needs certain permissions to provide you with the best experience.
                </motion.p>
              </div>

              <motion.div
                className="space-y-4 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
                  <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                    What We Collect
                  </h3>
                  <ul className="space-y-3 text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><span style={{ fontWeight: 600 }}>Location (While Using)</span> for nearby parking, real-time valet tracking, and local venue suggestions.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><span style={{ fontWeight: 600 }}>App Usage (Clicks & Feature use)</span> to improve recommendations and the app experience.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span><span style={{ fontWeight: 600 }}>Account Info (Name & Email)</span> for personalization and communicating with your Valet.</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
                  <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                    What We Don't Do
                  </h3>
                  <ul className="space-y-3 text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 flex-shrink-0">✕</span>
                      <span>Sell your data to third parties</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 flex-shrink-0">✕</span>
                      <span>Track you when the app is closed (unless you opt-in for 'Always' location for a specific feature)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 flex-shrink-0">✕</span>
                      <span>Collect sensitive PII (e.g., SSN, financial data) without explicit consent</span>
                    </li>
                  </ul>
                </div>
              </motion.div>

              <motion.button
                onClick={onComplete}
                className="w-full rounded-[16px] p-4 flex items-center justify-center gap-2 bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25"
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ transitionDelay: '0.6s' }}
              >
                <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                  Continue to Sign Up
                </span>
                <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
              </motion.button>

              <motion.p
                className="text-[13px] text-white/50 text-center mt-6 px-4"
                style={{ fontWeight: 400, lineHeight: '1.5' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                By continuing, you agree to our{' '}
                <button className="text-cyan-400 underline underline-offset-2">
                  Terms of Service
                </button>
                {' '}and{' '}
                <button className="text-cyan-400 underline underline-offset-2">
                  Privacy Policy
                </button>
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
