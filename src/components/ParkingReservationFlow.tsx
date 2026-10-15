import { motion } from 'motion/react';
import { X, MapPin, Navigation, CreditCard, Timer } from 'lucide-react';

interface ParkingSpot {
  id: string;
  name: string;
  address?: string;
  /** Miles; omitted when unknown. */
  distance?: number;
  walkTime?: number;
  /** Posted dollars per hour; 0 means unknown. */
  price: number;
  /** Open spaces; only shown when the lot reports a total. */
  availability?: number;
  total?: number;
  features: string[];
  lat?: number;
  lng?: number;
}

interface ParkingReservationFlowProps {
  spot: ParkingSpot;
  isDarkMode: boolean;
  onClose: () => void;
}

export function parkingDirectionsUrl(spot: Pick<ParkingSpot, 'name' | 'address' | 'lat' | 'lng'>, isIOS: boolean): string {
  const destination = typeof spot.lat === 'number' && typeof spot.lng === 'number'
    ? `${spot.lat},${spot.lng}`
    : encodeURIComponent([spot.name, spot.address].filter(Boolean).join(', '));
  return isIOS
    ? `maps://maps.apple.com/?daddr=${destination}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/** Parking is paid on site. Bytspot shows the lot and routes there; it does not take payment. */
export function ParkingReservationFlow({ spot, onClose }: ParkingReservationFlowProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const hasCount = typeof spot.total === 'number' && spot.total > 0 && typeof spot.availability === 'number';
  const hasDistance = typeof spot.distance === 'number' && Number.isFinite(spot.distance) && spot.distance > 0;

  const openDirections = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.open(parkingDirectionsUrl(spot, isIOS), isIOS ? '_system' : '_blank');
  };

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-[#000000]"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={springConfig}
    >
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-b-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                  Parking
                </h2>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  {spot.name}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
                aria-label="Close"
              >
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="max-w-[393px] mx-auto p-4 space-y-4">
            <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {spot.name}
                  </h3>
                  {spot.address && (
                    <p className="text-[15px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                      {spot.address}
                    </p>
                  )}
                  {hasDistance && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[13px] text-cyan-400" style={{ fontWeight: 600 }}>
                        <Navigation className="w-3.5 h-3.5" />
                        {spot.distance} mi
                      </div>
                      {spot.walkTime ? (
                        <>
                          <span className="text-white/50">•</span>
                          <div className="flex items-center gap-1 text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                            <Timer className="w-3.5 h-3.5" />
                            {spot.walkTime} min walk
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {hasCount && (
              <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
                <div className="flex items-end gap-2">
                  <span className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                    {spot.availability}
                  </span>
                  <span className="text-[15px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
                    of {spot.total} spaces open
                  </span>
                </div>
              </div>
            )}

            {spot.features.length > 0 && (
              <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
                <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
                  Features
                </h3>
                <div className="flex flex-wrap gap-2">
                  {spot.features.map((feature) => (
                    <div
                      key={feature}
                      className="px-3 py-1.5 rounded-full bg-white/10 border border-white/30 text-[13px] text-white"
                      style={{ fontWeight: 500 }}
                    >
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-400/40">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-5 h-5 text-green-400" />
                <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                  Pay at the lot
                </span>
              </div>
              <p className="text-[14px] text-white/80" style={{ fontWeight: 400 }}>
                {spot.price > 0 ? `Posted rate $${spot.price}/hour. ` : 'Rates are posted at the lot. '}
                No payment in Bytspot.
              </p>
            </div>

            <motion.button
              onClick={openDirections}
              className="w-full py-4 rounded-[16px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target flex items-center justify-center gap-2"
              style={{ fontWeight: 600 }}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Navigation className="w-5 h-5" />
              Directions
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
