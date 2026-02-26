import { useState } from 'react';
import { motion } from 'motion/react';
import { CreditCard, Building2, Calendar } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step8PayoutSetupProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['payout'];
}

export function Step8PayoutSetup({ onComplete, initialValue }: Step8PayoutSetupProps) {
  const [accountHolder, setAccountHolder] = useState(initialValue?.bankAccount.accountHolder || '');
  const [routingNumber, setRoutingNumber] = useState(initialValue?.bankAccount.routingNumber || '');
  const [accountNumber, setAccountNumber] = useState(initialValue?.bankAccount.accountNumber || '');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>(
    initialValue?.bankAccount.accountType || 'checking'
  );
  const [schedule, setSchedule] = useState<'weekly' | 'monthly'>(
    initialValue?.schedule || 'weekly'
  );

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const isValid = () => {
    return (
      accountHolder.trim() !== '' &&
      routingNumber.length === 9 &&
      accountNumber.length >= 4
    );
  };

  const handleContinue = () => {
    if (isValid()) {
      onComplete({
        payout: {
          bankAccount: {
            accountHolder,
            routingNumber,
            accountNumber,
            accountType,
          },
          schedule,
        },
      });
    }
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
          Payout Setup
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Where should we send your earnings?
        </p>
      </motion.div>

      <div className="space-y-5">
        {/* Account Holder Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Account Holder Name
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Building2 className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="Full legal name on account"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Routing Number */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Routing Number
          </label>
          <input
            type="text"
            value={routingNumber}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 9);
              setRoutingNumber(value);
            }}
            placeholder="9-digit routing number"
            maxLength={9}
            className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
            style={{ fontSize: '17px', fontWeight: 400 }}
          />
          {routingNumber.length > 0 && routingNumber.length < 9 && (
            <p className="text-[13px] text-orange-400 mt-2" style={{ fontWeight: 400 }}>
              Routing number must be 9 digits
            </p>
          )}
        </motion.div>

        {/* Account Number */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Account Number
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <CreditCard className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setAccountNumber(value);
              }}
              placeholder="Account number"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Account Type */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Account Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'checking' as const, label: 'Checking' },
              { id: 'savings' as const, label: 'Savings' },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setAccountType(type.id)}
                className={`p-4 rounded-[16px] border-2 transition-all ${
                  accountType === type.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {type.label}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Payout Schedule */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Payout Schedule
          </label>
          <div className="space-y-3">
            {[
              { id: 'weekly' as const, label: 'Weekly', description: 'Get paid every Friday' },
              { id: 'monthly' as const, label: 'Monthly', description: 'Get paid on the 1st of each month' },
            ].map((sched) => (
              <button
                key={sched.id}
                onClick={() => setSchedule(sched.id)}
                className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                  schedule === sched.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <div className="text-left">
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {sched.label}
                    </div>
                    <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {sched.description}
                    </div>
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  schedule === sched.id
                    ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'border-white/50'
                }`}>
                  {schedule === sched.id && (
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

        {/* Security Notice */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-green-500/50 bg-green-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.35 }}
        >
          <div className="flex items-start gap-4">
            <CreditCard className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" strokeWidth={2.5} />
            <div>
              <h3 className="text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
                Powered by Stripe
              </h3>
              <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                Your banking information is securely stored and encrypted. We never see or store your full account details.
              </p>
            </div>
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
          disabled={!isValid()}
          className={`w-full py-4 rounded-full shadow-xl transition-all ${
            isValid()
              ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white cursor-pointer'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
          whileTap={isValid() ? { scale: 0.98 } : {}}
          whileHover={isValid() ? { scale: 1.02 } : {}}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Continue
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}
