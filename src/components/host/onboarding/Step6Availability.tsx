import { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Calendar } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step6AvailabilityProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['availability'];
}

export function Step6Availability({ onComplete, initialValue }: Step6AvailabilityProps) {
  const [availabilityMode, setAvailabilityMode] = useState<'24/7' | 'weekdays' | 'custom'>('24/7');
  const [minBooking, setMinBooking] = useState(initialValue?.rules.minBooking || 1);
  const [cancellationPolicy, setCancellationPolicy] = useState<'flexible' | 'moderate' | 'strict'>(
    initialValue?.rules.cancellationPolicy || 'flexible'
  );

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleContinue = () => {
    const schedule = availabilityMode === '24/7' 
      ? {
          monday: [{ start: '00:00', end: '23:59' }],
          tuesday: [{ start: '00:00', end: '23:59' }],
          wednesday: [{ start: '00:00', end: '23:59' }],
          thursday: [{ start: '00:00', end: '23:59' }],
          friday: [{ start: '00:00', end: '23:59' }],
          saturday: [{ start: '00:00', end: '23:59' }],
          sunday: [{ start: '00:00', end: '23:59' }],
        }
      : {
          monday: [{ start: '09:00', end: '17:00' }],
          tuesday: [{ start: '09:00', end: '17:00' }],
          wednesday: [{ start: '09:00', end: '17:00' }],
          thursday: [{ start: '09:00', end: '17:00' }],
          friday: [{ start: '09:00', end: '17:00' }],
          saturday: [],
          sunday: [],
        };

    onComplete({
      availability: {
        schedule,
        blockedDates: [],
        rules: {
          minBooking,
          maxBooking: 168, // 7 days
          advanceNotice: 1,
          cancellationPolicy,
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
          Availability
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          When is your spot available?
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* Quick Setup */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Quick Setup
          </label>
          <div className="space-y-3">
            {[
              { id: '24/7' as const, label: '24/7 Available', description: 'Round-the-clock access' },
              { id: 'weekdays' as const, label: 'Weekdays 9-5', description: 'Business hours only' },
              { id: 'custom' as const, label: 'Custom Schedule', description: 'Set your own hours' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setAvailabilityMode(mode.id)}
                className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                  availabilityMode === mode.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <div className="text-left">
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {mode.label}
                    </div>
                    <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {mode.description}
                    </div>
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  availabilityMode === mode.id
                    ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'border-white/50'
                }`}>
                  {availabilityMode === mode.id && (
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
            ))}
          </div>
        </motion.div>

        {/* Booking Rules */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Booking Rules
          </label>
          
          <div className="space-y-4">
            <div>
              <div className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                Minimum Booking
              </div>
              <select
                value={minBooking}
                onChange={(e) => setMinBooking(parseInt(e.target.value))}
                className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white outline-none focus:border-purple-500/50"
                style={{ fontSize: '17px', fontWeight: 600 }}
              >
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="4">4 hours</option>
                <option value="24">1 day</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Cancellation Policy */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Cancellation Policy
          </label>
          <div className="space-y-3">
            {[
              { id: 'flexible' as const, label: 'Flexible', description: 'Full refund up to 24 hours before' },
              { id: 'moderate' as const, label: 'Moderate', description: 'Full refund up to 5 days before' },
              { id: 'strict' as const, label: 'Strict', description: '50% refund up to 7 days before' },
            ].map((policy) => (
              <button
                key={policy.id}
                onClick={() => setCancellationPolicy(policy.id)}
                className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                  cancellationPolicy === policy.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="text-left">
                  <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {policy.label}
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {policy.description}
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  cancellationPolicy === policy.id
                    ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'border-white/50'
                }`}>
                  {cancellationPolicy === policy.id && (
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
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
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
