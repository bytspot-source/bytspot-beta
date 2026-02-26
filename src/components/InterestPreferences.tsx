import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';

interface InterestPreferencesProps {
  isDarkMode: boolean;
  onComplete: (selectedInterests: string[]) => void;
}

interface InterestCategory {
  id: string;
  emoji: string;
  title: string;
  color: string;
}

const interests: InterestCategory[] = [
  { id: 'nightlife', emoji: '🍸', title: 'Nightlife & Bars', color: 'from-purple-500 to-fuchsia-500' },
  { id: 'parking', emoji: '🚗', title: 'Smart Parking', color: 'from-cyan-500 to-blue-500' },
  { id: 'dining', emoji: '🍽️', title: 'Dining & Restaurants', color: 'from-orange-500 to-red-500' },
  { id: 'coffee', emoji: '☕', title: 'Coffee & Casual', color: 'from-amber-500 to-orange-500' },
  { id: 'music', emoji: '🎵', title: 'Live Music & Events', color: 'from-pink-500 to-rose-500' },
  { id: 'fitness', emoji: '🏃', title: 'Fitness & Wellness', color: 'from-green-500 to-emerald-500' },
  { id: 'shopping', emoji: '🛍️', title: 'Shopping & Retail', color: 'from-indigo-500 to-purple-500' },
  { id: 'arts', emoji: '🎨', title: 'Arts & Culture', color: 'from-violet-500 to-purple-500' },
  { id: 'outdoor', emoji: '🌿', title: 'Outdoor & Nature', color: 'from-teal-500 to-green-500' },
  { id: 'valet', emoji: '🚙', title: 'Valet Services', color: 'from-blue-500 to-indigo-500' },
  { id: 'premium', emoji: '🅿️', title: 'Premium Parking Spots', color: 'from-yellow-500 to-orange-500' },
];

export function InterestPreferences({ isDarkMode, onComplete }: InterestPreferencesProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const toggleInterest = (interestId: string) => {
    setSelectedInterests(prev => {
      if (prev.includes(interestId)) {
        return prev.filter(id => id !== interestId);
      } else {
        return [...prev, interestId];
      }
    });
  };

  const handleContinue = () => {
    if (selectedInterests.length > 0) {
      onComplete(selectedInterests);
    }
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="flex-1 flex flex-col"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 shadow-xl"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ ...springConfig, delay: 0.1 }}
            >
              <span className="text-[40px]">✨</span>
            </motion.div>

            <motion.h1
              className="text-large-title mb-4 text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              What interests you?
            </motion.h1>

            <motion.p
              className="text-[17px] text-white/90 max-w-[320px] mx-auto"
              style={{ fontWeight: 400 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Select your preferences to get personalized recommendations
            </motion.p>
          </div>

          {/* Selection Counter */}
          {selectedInterests.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 flex justify-center"
            >
              <div className="px-4 py-2 rounded-full text-[13px] backdrop-blur-xl border-2 bg-cyan-500/20 border-cyan-400/50 text-cyan-400 shadow-lg" style={{ fontWeight: 600 }}>
                {selectedInterests.length} selected
              </div>
            </motion.div>
          )}

          {/* Interest Cards Grid */}
          <motion.div
            className="flex-1 overflow-y-auto scrollbar-hide mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="grid grid-cols-2 gap-3 pb-4">
              {interests.map((interest, index) => {
                const isSelected = selectedInterests.includes(interest.id);
                
                return (
                  <motion.button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    className={`relative rounded-[20px] p-4 border-2 backdrop-blur-xl shadow-xl transition-all ${
                      isSelected
                        ? 'border-white/50 bg-gradient-to-br ' + interest.color
                        : 'border-white/30 bg-[#1C1C1E]/80'
                    }`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springConfig, delay: 0.5 + index * 0.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {/* Selection Checkmark */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={springConfig}
                        >
                          <Check className="w-4 h-4 text-black" strokeWidth={3} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex flex-col items-center text-center">
                      <motion.div
                        className="text-[40px] mb-2"
                        animate={{ 
                          scale: isSelected ? [1, 1.2, 1] : 1,
                        }}
                        transition={{ duration: 0.3 }}
                      >
                        {interest.emoji}
                      </motion.div>
                      <p className={`text-[15px] ${
                        isSelected ? 'text-white' : 'text-white/90'
                      }`} style={{ fontWeight: isSelected ? 600 : 500 }}>
                        {interest.title}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {/* Continue Button */}
            <motion.button
              onClick={handleContinue}
              disabled={selectedInterests.length === 0}
              className={`w-full rounded-[16px] p-4 flex items-center justify-center gap-2 transition-all ${
                selectedInterests.length > 0
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25'
                  : 'bg-white/10'
              }`}
              whileTap={{ scale: selectedInterests.length > 0 ? 0.98 : 1 }}
              transition={springConfig}
            >
              <span className={`text-[17px] ${
                selectedInterests.length > 0 ? 'text-white' : 'text-white/40'
              }`} style={{ fontWeight: 600 }}>
                Continue
              </span>
              <ChevronRight className={`w-5 h-5 ${
                selectedInterests.length > 0 ? 'text-white' : 'text-white/40'
              }`} strokeWidth={2.5} />
            </motion.button>

            {/* Skip Button */}
            <motion.button
              onClick={() => onComplete([])}
              className="w-full p-3 text-[15px] text-white/70"
              style={{ fontWeight: 500 }}
              whileTap={{ scale: 0.98 }}
            >
              Skip for now
            </motion.button>
          </motion.div>

          {/* Helper Text */}
          <motion.p
            className="text-[12px] text-white/40 text-center mt-4"
            style={{ fontWeight: 400 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            You can always change these in your profile settings
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
