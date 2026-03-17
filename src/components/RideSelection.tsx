import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { X, Star, Navigation, ArrowRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { type ApiRidesResponse } from '../utils/api';
import { trpc } from '../utils/trpc';

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
      trpc.rides.get.query({ lat, lng }).then(res => {
        setRides(res);
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
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[393px] bg-[#1C1C1E] rounded-t-[32px] overflow-hidden border-t border-white/10 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springConfig}
            style={{ maxHeight: '80vh' }}
          >
            {/* Handle Bar */}
            <div className="w-full flex justify-center pt-2.5 pb-1.5" onClick={onClose}>
              <div className="w-11 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="px-4.5 pt-3 pb-8 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 56px)' }}>
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 pr-1">
                  <h2 className="text-[19px] leading-tight text-white mb-0.5" style={{ fontWeight: 700 }}>
                    Book a Ride
                  </h2>
                  {destination ? (
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3 h-3 text-cyan-400" strokeWidth={2.5} />
                      <p className="text-[12px] leading-tight text-cyan-300 truncate max-w-[205px]" style={{ fontWeight: 600 }}>
                        To: {destination}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12px] leading-tight text-white/60" style={{ fontWeight: 400 }}>
                      Ride ETAs & valet options nearby
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              <div className="space-y-1.5 rounded-[24px] border border-white/5 bg-white/[0.03] p-2 pt-1.5">
                {/* Valet Option */}
                <motion.button
                  onClick={() => {
                    onSelectValet();
                    onClose();
                  }}
                  className="w-full min-h-[74px] p-3 rounded-[20px] bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 flex items-center gap-2.5 group relative overflow-hidden"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg group-hover:shadow-orange-500/25 transition-shadow">
                    <Star className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 pr-2 text-left">
                    <h3 className="text-[15px] leading-tight text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Valet Service
                    </h3>
                    <p className="text-[11px] leading-tight text-white/60" style={{ fontWeight: 400 }}>
                      Premium parking & retrieval
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/50 group-hover:bg-white/20 group-hover:text-white transition-colors">
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                </motion.button>

                {/* Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#1F1F21] px-2.5 text-[10px] tracking-[0.18em] text-white/40 font-medium">
                      OR RIDE SHARE
                    </span>
                  </div>
                </div>

                {/* Uber Option */}
                <motion.button
                  onClick={() => handleRideShare('Uber')}
                  className="w-full min-h-[74px] p-3 rounded-[20px] bg-[#000000] border border-white/10 flex items-center gap-2.5 group hover:border-white/20 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                    <span className="text-[15px]" style={{ fontWeight: 700 }}>U</span>
                  </div>
                  <div className="flex-1 pr-2 text-left">
                    <h3 className="text-[15px] leading-tight text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Uber
                    </h3>
                    <p className="text-[11px] leading-tight text-white/60" style={{ fontWeight: 400 }}>
                      {uberData?.products[0]
                        ? `${uberData.products[0].etaMinutes} min · ${uberData.products[0].priceEstimate}`
                        : 'Request a ride now'}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:bg-white/10 group-hover:text-white/70 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </div>
                </motion.button>

                {/* Lyft Option */}
                <motion.button
                  onClick={() => handleRideShare('Lyft')}
                  className="w-full min-h-[74px] p-3 rounded-[20px] bg-[#FF00BF]/10 border border-[#FF00BF]/30 flex items-center gap-2.5 group hover:bg-[#FF00BF]/20 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-10 h-10 rounded-full bg-[#FF00BF] text-white flex items-center justify-center shadow-lg">
                    <span className="text-[13px] leading-none" style={{ fontWeight: 700, fontFamily: 'sans-serif' }}>lyft</span>
                  </div>
                  <div className="flex-1 pr-2 text-left">
                    <h3 className="text-[15px] leading-tight text-white mb-0.5" style={{ fontWeight: 600 }}>
                      Lyft
                    </h3>
                    <p className="text-[11px] leading-tight text-white/60" style={{ fontWeight: 400 }}>
                      {lyftData?.products[0]
                        ? `${lyftData.products[0].etaMinutes} min · ${lyftData.products[0].priceEstimate}`
                        : 'Wait & Save available'}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:bg-white/10 group-hover:text-white/70 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </div>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
