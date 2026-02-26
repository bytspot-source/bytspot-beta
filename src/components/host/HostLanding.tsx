import { motion } from 'motion/react';
import { DollarSign, Shield, Clock, TrendingUp, Users, Sparkles, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

interface HostLandingProps {
  isDarkMode: boolean;
  onGetStarted: () => void;
  onBackToMain?: () => void;
}

export function HostLanding({ isDarkMode, onGetStarted, onBackToMain }: HostLandingProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const benefits = [
    {
      icon: DollarSign,
      title: 'Earn Passive Income',
      description: 'Average hosts earn $850-1,200/month',
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      icon: Clock,
      title: 'Easy Management',
      description: 'Set your hours and availability',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Shield,
      title: 'Secure Payments',
      description: '$1M insurance coverage included',
      gradient: 'from-purple-500 to-fuchsia-500',
    },
    {
      icon: TrendingUp,
      title: 'Smart Pricing',
      description: 'AI-powered pricing optimization',
      gradient: 'from-orange-500 to-red-500',
    },
    {
      icon: Users,
      title: 'Trusted Community',
      description: 'Join 500+ hosts in San Francisco',
      gradient: 'from-pink-500 to-rose-500',
    },
    {
      icon: Sparkles,
      title: 'Premium Tools',
      description: 'Analytics, bookings & more',
      gradient: 'from-yellow-500 to-amber-500',
    },
  ];

  return (
    <div className="min-h-screen overflow-y-auto pb-24">
      {/* Back Button */}
      {onBackToMain && (
        <div className="px-4 pt-4">
          <motion.button
            onClick={onBackToMain}
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

      {/* Hero Section */}
      <motion.div
        className="px-8 pt-12 pb-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.div
          className="mx-auto mb-6 flex items-center justify-center"
          initial={{ scale: 0.8, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <BrandLogo size={100} animated={true} />
        </motion.div>

        <h1 className="text-large-title text-white mb-4">
          Become a Bytspot Host
        </h1>
        <p className="text-[17px] text-white/80 mb-8" style={{ fontWeight: 400 }}>
          Turn your parking space, venue, or valet service into a revenue stream. Join the Bytspot network and start earning today.
        </p>

        {/* Earnings Card */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl shadow-xl mb-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="text-[13px] text-white/80 mb-2" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Average Monthly Earnings
          </div>
          <div className="text-[48px] mb-2 text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            $850-1,200
          </div>
          <div className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
            Based on hosts in San Francisco
          </div>
        </motion.div>

        {/* Commission Info */}
        <motion.div
          className="text-center text-[15px] text-white/70 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ fontWeight: 400 }}
        >
          You keep <span className="text-green-400" style={{ fontWeight: 700 }}>85%</span> of every booking
        </motion.div>
        <motion.div
          className="text-center text-[13px] text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          style={{ fontWeight: 400 }}
        >
          15% platform fee • No hidden charges
        </motion.div>
      </motion.div>

      {/* Benefits Grid */}
      <div className="px-8 mb-8">
        <h2 className="text-title-2 text-white mb-4">
          Why Host with Bytspot?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: 0.4 + index * 0.05 }}
              >
                <div className={`w-12 h-12 rounded-[14px] bg-gradient-to-br ${benefit.gradient} opacity-90 flex items-center justify-center mb-3 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                </div>
                <h3 className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                  {benefit.title}
                </h3>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  {benefit.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* How It Works */}
      <div className="px-8 mb-8">
        <h2 className="text-title-2 text-white mb-4">
          How It Works
        </h2>
        <div className="space-y-3">
          {[
            { step: '1', title: 'Sign Up', description: 'Create your host account in minutes' },
            { step: '2', title: 'List Your Space', description: 'Add photos and set your pricing' },
            { step: '3', title: 'Get Verified', description: 'Quick verification process' },
            { step: '4', title: 'Start Earning', description: 'Accept bookings and get paid weekly' },
          ].map((item, index) => (
            <motion.div
              key={item.step}
              className="flex items-center gap-4 rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springConfig, delay: 0.7 + index * 0.05 }}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                <span className="text-white text-[17px]" style={{ fontWeight: 700 }}>
                  {item.step}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                  {item.title}
                </h3>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <motion.div
        className="px-8 sticky bottom-8 left-0 right-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.9 }}
      >
        <motion.button
          onClick={onGetStarted}
          className="w-full py-4 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-2xl"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
          transition={springConfig}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Become a Host
          </span>
        </motion.button>

        <p className="text-center text-[13px] text-white/50 mt-4" style={{ fontWeight: 400 }}>
          Takes less than 10 minutes to get started
        </p>
      </motion.div>
    </div>
  );
}
