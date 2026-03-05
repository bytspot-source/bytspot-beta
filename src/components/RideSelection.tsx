import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { X, Car, Star, Navigation, ArrowRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { ridesApi, type ApiRidesResponse } from '../utils/api';

interface RideSelectionProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectValet: () => void;
  isDarkMode: boolean;
  destination?: string;
  lat?: number;
  lng?: number;
}

export function RideSelection({ isOpen, onClose, onSelectValet, isDarkMode, destination, lat = 33.7866, lng = -84.3833 }: RideSelectionProps) {
  const [rides, setRides] = useState<ApiRidesResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      ridesApi.get(lat, lng).then(res => {
        if (res.success) setRides(res.data);
      });
    }
  }, [isOpen, lat, lng]);

  // Helper to get provider data
  const getProvider = (name: string) => rides?.providers.find(p => p.name === name);
  const uberData = getProvider('Uber');
  const lyftData = getProvider('Lyft');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleRideShare = (service: 'Uber' | 'Lyft') => {
    toast.success(`Opening ${service}`, {
      description: `Redirecting to ${service} app...`,
      duration: 2000,
    });
    // In a real app, this would use deep links:
    // Uber: uber://
    // Lyft: lyft://
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Slide-up Panel */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#1C1C1E] rounded-t-[32px] overflow-hidden border-t border-white/10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springConfig}
            style={{ maxHeight: '80vh' }}
          >
            {/* Handle Bar */}
            <div className="w-full flex justify-center pt-3 pb-2" onClick={onClose}>
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="p-6 pb-12 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 56px)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[22px] text-white mb-1" style={{ fontWeight: 700 }}>
                    Book a Ride
                  </h2>
                  {destination ? (
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2.5} />
                      <p className="text-[15px] text-cyan-300 truncate max-w-[200px]" style={{ fontWeight: 600 }}>
                        To: {destination}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[15px] text-white/60" style={{ fontWeight: 400 }}>
                      Choose your preferred way to travel
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Valet Option */}
                <motion.button
                  onClick={() => {
                    onSelectValet();
                    onClose();
                  }}
                  className="w-full p-4 rounded-[24px] bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 flex items-center gap-4 group relative overflow-hidden"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg group-hover:shadow-orange-500/25 transition-shadow">
                    <Star className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Valet Service
                    </h3>
                    <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                      Premium parking & retrieval
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 group-hover:bg-white/20 group-hover:text-white transition-colors">
                    <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
                  </div>
                </motion.button>

                {/* Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#1C1C1E] px-3 text-[12px] text-white/40 font-medium">
                      OR RIDE SHARE
                    </span>
                  </div>
                </div>

                {/* Uber Option */}
                <motion.button
                  onClick={() => handleRideShare('Uber')}
                  className="w-full p-4 rounded-[24px] bg-[#000000] border border-white/10 flex items-center gap-4 group hover:border-white/20 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                    <span className="text-[18px]" style={{ fontWeight: 700 }}>U</span>
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Uber
                    </h3>
                    <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                      {uberData?.products[0]
                        ? `${uberData.products[0].etaMinutes} min · ${uberData.products[0].priceEstimate}`
                        : 'Request a ride now'}
                    </p>
                  </div>
                  <ExternalLink className="w-5 h-5 text-white/30 group-hover:text-white/70 transition-colors" strokeWidth={2.5} />
                </motion.button>

                {/* Lyft Option */}
                <motion.button
                  onClick={() => handleRideShare('Lyft')}
                  className="w-full p-4 rounded-[24px] bg-[#FF00BF]/10 border border-[#FF00BF]/30 flex items-center gap-4 group hover:bg-[#FF00BF]/20 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-12 h-12 rounded-full bg-[#FF00BF] text-white flex items-center justify-center shadow-lg">
                    <span className="text-[18px]" style={{ fontWeight: 700, fontFamily: 'sans-serif' }}>lyft</span>
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Lyft
                    </h3>
                    <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                      {lyftData?.products[0]
                        ? `${lyftData.products[0].etaMinutes} min · ${lyftData.products[0].priceEstimate}`
                        : 'Wait & Save available'}
                    </p>
                  </div>
                  <ExternalLink className="w-5 h-5 text-white/30 group-hover:text-white/70 transition-colors" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
