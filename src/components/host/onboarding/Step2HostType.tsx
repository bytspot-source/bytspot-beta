import { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Car, Users } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step2HostTypeProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: 'venue' | 'parking' | 'valet';
}

export function Step2HostType({ onComplete, initialValue }: Step2HostTypeProps) {
  const [selectedType, setSelectedType] = useState<'venue' | 'parking' | 'valet' | undefined>(initialValue);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const hostTypes = [
    {
      id: 'venue' as const,
      title: 'Venue Hosting',
      description: 'Restaurants, bars, event spaces, and entertainment venues',
      icon: Building2,
      gradient: 'from-purple-500 to-fuchsia-500',
      bgGradient: 'from-purple-500/30 to-fuchsia-500/30',
    },
    {
      id: 'parking' as const,
      title: 'Parking Management',
      description: 'Parking lots, garages, and private parking spaces',
      icon: Car,
      gradient: 'from-cyan-500 to-blue-500',
      bgGradient: 'from-cyan-500/30 to-blue-500/30',
    },
    {
      id: 'valet' as const,
      title: 'Valet Service',
      description: 'Professional valet and concierge services',
      icon: Users,
      gradient: 'from-green-500 to-emerald-500',
      bgGradient: 'from-green-500/30 to-emerald-500/30',
    },
  ];

  const handleSelectType = (type: 'venue' | 'parking' | 'valet') => {
    setSelectedType(type);
  };

  const handleContinue = () => {
    if (selectedType) {
      onComplete({ hostType: selectedType });
    }
  };

  return (
    <div className="max-w-[800px] mx-auto px-8">
      {/* Header */}
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-4">
          What would you like to host?
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Choose the type of service you want to offer on Bytspot
        </p>
      </motion.div>

      {/* Host Type Cards */}
      <div className="space-y-4 mb-8">
        {hostTypes.map((type, index) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id;

          return (
            <motion.button
              key={type.id}
              onClick={() => handleSelectType(type.id)}
              className={`w-full rounded-[20px] p-6 border-2 transition-all duration-300 ${
                isSelected
                  ? 'border-white/50 bg-[#1C1C1E]/95 shadow-2xl scale-[1.02]'
                  : 'border-white/30 bg-[#1C1C1E]/80 hover:border-white/40 hover:bg-[#1C1C1E]/90'
              } backdrop-blur-xl cursor-pointer`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: index * 0.1 }}
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: isSelected ? 1.02 : 1.01 }}
            >
              <div className="flex items-center gap-6">
                {/* Icon */}
                <div className={`w-16 h-16 rounded-[16px] bg-gradient-to-br ${type.bgGradient} border-2 border-white/30 flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <Icon className="w-8 h-8 text-white" strokeWidth={2.5} />
                </div>

                {/* Content */}
                <div className="flex-1 text-left">
                  <h3 className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {type.title}
                  </h3>
                  <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
                    {type.description}
                  </p>
                </div>

                {/* Selection Indicator */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  isSelected
                    ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'border-white/50'
                }`}>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={springConfig}
                    >
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path
                          d="M1 5L4.5 8.5L11 1.5"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Continue Button */}
      <motion.div
        className="sticky bottom-8 left-0 right-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <motion.button
          onClick={handleContinue}
          disabled={!selectedType}
          className={`w-full py-4 rounded-full shadow-xl transition-all duration-300 ${
            selectedType
              ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white cursor-pointer'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
          whileTap={selectedType ? { scale: 0.98 } : {}}
          whileHover={selectedType ? { scale: 1.02 } : {}}
          transition={springConfig}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Continue
          </span>
        </motion.button>
      </motion.div>

      {/* Helper Text */}
      <motion.div
        className="text-center mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-[13px] text-white/50" style={{ fontWeight: 400 }}>
          You can add multiple service types later from your dashboard
        </p>
      </motion.div>
    </div>
  );
}
