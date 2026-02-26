/**
 * VenueRecommendationsPermission Component
 * 
 * Implements iOS best practice for contextual permissions.
 * This prompt appears when users first visit the Insider tab, asking if they want
 * location-based venue recommendations (restaurants, shops, attractions).
 * 
 * Key principles:
 * - Asked IN CONTEXT when user is actively exploring venues
 * - NOT asked during onboarding (reduces permission fatigue)
 * - Clearly optional - core app works without it
 * - Graceful dismissal without negative consequences
 * - Can be changed anytime in Settings › Privacy
 * 
 * This separates "nice to have" features from core functionality,
 * increasing trust and opt-in rates.
 */

import { motion } from 'motion/react';
import { MapPin, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

interface VenueRecommendationsPermissionProps {
  isDarkMode: boolean;
  onEnableRecommendations: () => void;
  onDismiss: () => void;
}

export function VenueRecommendationsPermission({ 
  isDarkMode, 
  onEnableRecommendations, 
  onDismiss 
}: VenueRecommendationsPermissionProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onDismiss}
      />

      {/* Permission Card */}
      <motion.div
        className="relative w-full max-w-[340px] rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/95 backdrop-blur-xl shadow-2xl"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={springConfig}
      >
        {/* Close Button */}
        <motion.button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <X className="w-4 h-4 text-white/70" strokeWidth={2.5} />
        </motion.button>

        {/* Icon */}
        <motion.div
          className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border-2 border-white/30 flex items-center justify-center"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <Sparkles className="w-8 h-8 text-cyan-300" strokeWidth={2.5} />
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="text-title-2 text-white text-center mb-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          Discover Great Spots Near You
        </motion.h2>

        {/* Body Text */}
        <motion.p
          className="text-[15px] text-white/90 text-center mb-6"
          style={{ fontWeight: 400, lineHeight: '22px' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          Would you like Bytspot to show you recommended restaurants, shops, and attractions based on your current location?
        </motion.p>

        {/* Benefit Section */}
        <motion.div
          className="rounded-[16px] p-4 mb-6 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-purple-400/30"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin className="w-4 h-4 text-cyan-300" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <p className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Real-time deals & points of interest
              </p>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400, lineHeight: '18px' }}>
                See recommendations based on your distance and preferences, updated as you explore
              </p>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Primary Action */}
          <motion.button
            onClick={onEnableRecommendations}
            className="w-full rounded-[16px] p-4 bg-gradient-to-br from-purple-500 to-cyan-500 shadow-lg shadow-purple-500/25"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ transitionDelay: '0.3s' }}
          >
            <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Yes, Enable Recommendations
            </span>
          </motion.button>

          {/* Secondary Action */}
          <motion.button
            onClick={onDismiss}
            className="w-full rounded-[16px] p-4 border-2 border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ transitionDelay: '0.35s' }}
          >
            <span className="text-[17px] text-white/70" style={{ fontWeight: 600 }}>
              Not Right Now
            </span>
          </motion.button>
        </div>

        {/* Privacy Note */}
        <motion.p
          className="text-[11px] text-white/40 text-center mt-4"
          style={{ fontWeight: 400, lineHeight: '14px' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          You can change this anytime in Settings › Privacy
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
