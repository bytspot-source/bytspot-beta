import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { DollarSign, TrendingUp, Sparkles } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step5PricingSetupProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['pricing'];
  listing?: OnboardingData['listing'];
}

export function Step5PricingSetup({ onComplete, initialValue, listing }: Step5PricingSetupProps) {
  const [hourly, setHourly] = useState(initialValue?.hourly || 10);
  const [daily, setDaily] = useState(initialValue?.daily || 45);
  const [monthly, setMonthly] = useState(initialValue?.monthly || 200);
  const [dynamicEnabled, setDynamicEnabled] = useState(initialValue?.dynamicPricing.enabled || false);
  const [surgePricing, setSurgePricing] = useState(initialValue?.dynamicPricing.surgePricing || false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Calculate AI pricing suggestion based on amenities
  const calculateSuggestion = () => {
    let basePrice = 8;
    
    if (listing?.amenities.evCharging) basePrice += 2;
    if (listing?.amenities.covered) basePrice += 1;
    if (listing?.amenities.gated) basePrice += 1;
    if (listing?.amenities.security) basePrice += 0.5;
    if (listing?.amenities.access24) basePrice += 1;
    
    return {
      hourly: Math.round(basePrice),
      daily: Math.round(basePrice * 4.5),
      monthly: Math.round(basePrice * 20),
    };
  };

  const suggestion = calculateSuggestion();

  const estimatedMonthlyEarnings = Math.round((hourly * 8 * 0.7 * 30) + (daily * 0.3 * 4));

  const handleContinue = () => {
    onComplete({
      pricing: {
        hourly,
        daily,
        monthly,
        dynamicPricing: {
          enabled: dynamicEnabled,
          surgePricing,
        },
      },
    });
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 pb-8">
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          Set Your Pricing
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          We'll help you price competitively
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* AI Pricing Suggestion */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-purple-500/50 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                AI Pricing Recommendation
              </h3>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Based on your location and amenities
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
                ${suggestion.hourly}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                per hour
              </div>
            </div>
            <div className="text-center">
              <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
                ${suggestion.daily}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                per day
              </div>
            </div>
            <div className="text-center">
              <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
                ${suggestion.monthly}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                per month
              </div>
            </div>
          </div>
        </motion.div>

        {/* Custom Pricing */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Your Pricing
          </label>
          
          <div className="space-y-4">
            <div>
              <div className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                Hourly Rate
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <DollarSign className="w-5 h-5 text-white/60" strokeWidth={2.5} />
                  </div>
                  <input
                    type="number"
                    value={hourly}
                    onChange={(e) => setHourly(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.5"
                    className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white outline-none focus:border-purple-500/50 transition-colors"
                    style={{ fontSize: '17px', fontWeight: 600 }}
                  />
                </div>
                <button
                  onClick={() => setHourly(suggestion.hourly)}
                  className="px-4 py-2 rounded-full border-2 border-purple-500/50 bg-purple-500/20 text-purple-300 text-[13px]"
                  style={{ fontWeight: 600 }}
                >
                  Use AI
                </button>
              </div>
            </div>

            <div>
              <div className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                Daily Rate
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <DollarSign className="w-5 h-5 text-white/60" strokeWidth={2.5} />
                  </div>
                  <input
                    type="number"
                    value={daily}
                    onChange={(e) => setDaily(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="1"
                    className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white outline-none focus:border-purple-500/50 transition-colors"
                    style={{ fontSize: '17px', fontWeight: 600 }}
                  />
                </div>
                <button
                  onClick={() => setDaily(suggestion.daily)}
                  className="px-4 py-2 rounded-full border-2 border-purple-500/50 bg-purple-500/20 text-purple-300 text-[13px]"
                  style={{ fontWeight: 600 }}
                >
                  Use AI
                </button>
              </div>
            </div>

            <div>
              <div className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                Monthly Rate
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <DollarSign className="w-5 h-5 text-white/60" strokeWidth={2.5} />
                  </div>
                  <input
                    type="number"
                    value={monthly}
                    onChange={(e) => setMonthly(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="5"
                    className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white outline-none focus:border-purple-500/50 transition-colors"
                    style={{ fontSize: '17px', fontWeight: 600 }}
                  />
                </div>
                <button
                  onClick={() => setMonthly(suggestion.monthly)}
                  className="px-4 py-2 rounded-full border-2 border-purple-500/50 bg-purple-500/20 text-purple-300 text-[13px]"
                  style={{ fontWeight: 600 }}
                >
                  Use AI
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dynamic Pricing */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Dynamic Pricing
          </label>
          
          <div className="space-y-3">
            <button
              onClick={() => setDynamicEnabled(!dynamicEnabled)}
              className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                dynamicEnabled
                  ? 'border-green-500/50 bg-green-500/20'
                  : 'border-white/30 bg-[#1C1C1E]/80'
              } backdrop-blur-xl`}
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.5} />
                <div className="text-left">
                  <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Enable Smart Pricing
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    Optimize rates based on demand
                  </div>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full border-2 transition-all ${
                dynamicEnabled ? 'bg-green-500 border-green-400' : 'bg-white/20 border-white/30'
              }`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  dynamicEnabled ? 'translate-x-6' : 'translate-x-1'
                } mt-0.5`} />
              </div>
            </button>

            {dynamicEnabled && (
              <button
                onClick={() => setSurgePricing(!surgePricing)}
                className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                  surgePricing
                    ? 'border-orange-500/50 bg-orange-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="text-left">
                  <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Surge Pricing During Events
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    Increase rates during high demand
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  surgePricing
                    ? 'border-white bg-gradient-to-br from-orange-500 to-red-500'
                    : 'border-white/50'
                }`}>
                  {surgePricing && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path
                        d="M1 5L4.5 8.5L11 1.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </button>
            )}
          </div>
        </motion.div>

        {/* Revenue Estimate */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springConfig, delay: 0.4 }}
        >
          <div className="text-center">
            <div className="text-[13px] text-white/80 mb-2" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Estimated Monthly Earnings
            </div>
            <div className="text-[40px] text-white mb-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              ${estimatedMonthlyEarnings}
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Based on 70% occupancy rate • You keep 85%
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.45 }}
      >
        <motion.button
          onClick={handleContinue}
          className="w-full py-4 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-xl"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Continue
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}
