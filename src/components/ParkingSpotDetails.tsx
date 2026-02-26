import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, Star, Navigation, Clock, Shield, Camera, 
  Zap, Umbrella, DollarSign, Phone, Share2, Heart,
  ChevronRight, CheckCircle, AlertCircle, Car, Smartphone,
  CreditCard, Info
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { saveSpot, isSpotSaved, removeSavedSpot } from '../utils/savedSpots';

type AvailabilityStatus = 'available' | 'limited' | 'full';
type SecurityLevel = 'basic' | 'standard' | 'premium';
type EVConnectorType = 'tesla' | 'ccs' | 'chademo' | 'j1772';

interface ParkingSpot {
  id: number;
  lat: number;
  lng: number;
  name: string;
  available: number;
  total: number;
  price: number;
  isPremium: boolean;
  hasEVCharging: boolean;
  evConnectorTypes?: EVConnectorType[];
  isCovered: boolean;
  securityLevel: SecurityLevel;
  hasCameras: boolean;
  isReserved: boolean;
  rating?: number;
  reviews?: number;
  distance?: number;
  walkTime?: number;
  address?: string;
  hours?: string;
  description?: string;
  amenities?: string[];
  hostName?: string;
  responseTime?: string;
}

interface ParkingSpotDetailsProps {
  spot: ParkingSpot | null;
  isOpen: boolean;
  onClose: () => void;
  onReserve: (spotId: number) => void;
  onNavigate: (spotId: number) => void;
  isDarkMode: boolean;
}

const EV_CONNECTOR_LABELS: Record<EVConnectorType, string> = {
  tesla: 'Tesla Supercharger',
  ccs: 'CCS (Combined)',
  chademo: 'CHAdeMO',
  j1772: 'J1772 (Level 2)',
};

export function ParkingSpotDetails({ 
  spot, 
  isOpen, 
  onClose, 
  onReserve, 
  onNavigate,
  isDarkMode 
}: ParkingSpotDetailsProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(2); // hours

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Check if spot is saved
  useEffect(() => {
    if (spot) {
      const spotId = `parking-${spot.id}`;
      setIsFavorite(isSpotSaved(spotId));
    }
  }, [spot]);

  if (!spot) return null;

  // Calculate availability status
  const getAvailabilityStatus = (): AvailabilityStatus => {
    const percentage = (spot.available / spot.total) * 100;
    if (percentage === 0) return 'full';
    if (percentage < 25) return 'limited';
    return 'available';
  };

  const status = getAvailabilityStatus();
  const percentage = Math.round((spot.available / spot.total) * 100);

  // Get status color and text
  const getStatusInfo = () => {
    switch (status) {
      case 'available':
        return { 
          color: '#10B981', 
          bg: 'rgba(16, 185, 129, 0.15)',
          text: 'Available',
          icon: CheckCircle 
        };
      case 'limited':
        return { 
          color: '#F59E0B', 
          bg: 'rgba(245, 158, 11, 0.15)',
          text: 'Limited Availability',
          icon: AlertCircle 
        };
      case 'full':
        return { 
          color: '#EF4444', 
          bg: 'rgba(239, 68, 68, 0.15)',
          text: 'Full',
          icon: AlertCircle 
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Calculate total price
  const totalPrice = spot.price * selectedDuration;

  // Default values for optional fields
  const rating = spot.rating || 4.7;
  const reviews = spot.reviews || 128;
  const distance = spot.distance || 0.3;
  const walkTime = spot.walkTime || 4;
  const address = spot.address || '123 Downtown Plaza, San Francisco, CA';
  const hours = spot.hours || '24/7 Access';
  const description = spot.description || 'Secure parking in the heart of downtown with 24/7 access and premium amenities.';
  const hostName = spot.hostName || 'ParkHost Pro';
  const responseTime = spot.responseTime || 'Usually responds within 5 minutes';

  const amenities = spot.amenities || [
    'Security Cameras',
    'Well Lit',
    'Wheelchair Accessible',
    'Credit Card Accepted',
    'Mobile App Access',
    'Height Clearance 7ft',
  ];

  // Haptic feedback
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleReserve = () => {
    triggerHaptic();
    onReserve(spot.id);
    toast.success('Reservation Started', {
      description: `Reserving ${spot.name} for ${selectedDuration} hours`,
      duration: 3000,
    });
  };

  const handleNavigate = () => {
    triggerHaptic();
    onNavigate(spot.id);
    toast.success('Navigation Started', {
      description: `Navigating to ${spot.name}`,
      duration: 3000,
    });
  };

  const handleShare = () => {
    triggerHaptic();
    toast.success('Link Copied', {
      description: 'Parking spot link copied to clipboard',
      duration: 2000,
    });
  };

  const handleFavorite = () => {
    triggerHaptic();
    
    const spotId = `parking-${spot.id}`;
    const spotData = {
      id: spotId,
      type: 'parking' as const,
      name: spot.name,
      address: address,
      distance: distance.toString(),
      rating,
      spots: spot.available,
      price: `${spot.price}/hr`,
      features: amenities,
    };

    if (isFavorite) {
      removeSavedSpot(spotId);
      setIsFavorite(false);
      toast.success('Removed from Saved Spots', {
        description: spot.name,
        duration: 2000,
      });
    } else {
      saveSpot(spotData);
      setIsFavorite(true);
      toast.success('Added to Saved Spots', {
        description: spot.name,
        duration: 2000,
      });
    }
  };

  const handleContact = () => {
    triggerHaptic();
    toast.info('Opening Messages', {
      description: `Contact ${hostName}`,
      duration: 2000,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Details Panel */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] max-w-[393px] mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springConfig}
            role="dialog"
            aria-modal="true"
            aria-labelledby="spot-details-title"
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <motion.div
                className="w-12 h-1.5 rounded-full bg-white/40"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
                transition={springConfig}
              />
            </div>

            {/* Content */}
            <div className="bg-[#1C1C1E]/95 backdrop-blur-2xl border-t-2 border-white/30 rounded-t-[28px] overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-hide pb-safe">
              {/* Header Section */}
              <div className="sticky top-0 bg-[#1C1C1E]/95 backdrop-blur-2xl border-b border-white/20 z-10">
                <div className="px-6 pt-5 pb-4">
                  {/* Top Row - Close & Actions */}
                  <div className="flex items-center justify-between mb-4">
                    <motion.button
                      onClick={onClose}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </motion.button>

                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={handleShare}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30"
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                        aria-label="Share"
                      >
                        <Share2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                      </motion.button>

                      <motion.button
                        onClick={handleFavorite}
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                          isFavorite 
                            ? 'bg-pink-500/20 border-pink-400' 
                            : 'bg-white/10 border-white/30'
                        }`}
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart 
                          className={`w-5 h-5 ${isFavorite ? 'text-pink-400 fill-pink-400' : 'text-white'}`} 
                          strokeWidth={2.5} 
                        />
                      </motion.button>
                    </div>
                  </div>

                  {/* Title & Rating */}
                  <h2 
                    id="spot-details-title"
                    className="text-[24px] text-white mb-2" 
                    style={{ fontWeight: 700 }}
                  >
                    {spot.name}
                  </h2>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                        {rating.toFixed(1)}
                      </span>
                      <span className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
                        ({reviews})
                      </span>
                    </div>
                    
                    {spot.isPremium && (
                      <div className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/40">
                        <span className="text-[11px] text-purple-300" style={{ fontWeight: 700 }}>
                          PREMIUM
                        </span>
                      </div>
                    )}

                    {spot.isReserved && (
                      <div className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/40">
                        <span className="text-[11px] text-blue-300" style={{ fontWeight: 700 }}>
                          YOUR SPOT
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Availability Status */}
                  <div 
                    className="flex items-center gap-3 p-3 rounded-[14px] border-2"
                    style={{ 
                      backgroundColor: statusInfo.bg,
                      borderColor: statusInfo.color,
                    }}
                  >
                    <StatusIcon 
                      className="w-5 h-5 flex-shrink-0" 
                      style={{ color: statusInfo.color }}
                      strokeWidth={2.5}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span 
                          className="text-[15px]" 
                          style={{ 
                            fontWeight: 600,
                            color: statusInfo.color,
                          }}
                        >
                          {statusInfo.text}
                        </span>
                        <span 
                          className="text-[14px]" 
                          style={{ 
                            fontWeight: 600,
                            color: statusInfo.color,
                          }}
                        >
                          {spot.available}/{spot.total} spots
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: statusInfo.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Info Cards */}
              <div className="px-6 py-4 grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-3 rounded-[14px] bg-white/5 border border-white/20">
                  <DollarSign className="w-5 h-5 text-green-400 mb-1.5" strokeWidth={2.5} />
                  <span className="text-[16px] text-white mb-0.5" style={{ fontWeight: 700 }}>
                    ${spot.price}
                  </span>
                  <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                    per hour
                  </span>
                </div>

                <div className="flex flex-col items-center p-3 rounded-[14px] bg-white/5 border border-white/20">
                  <MapPin className="w-5 h-5 text-blue-400 mb-1.5" strokeWidth={2.5} />
                  <span className="text-[16px] text-white mb-0.5" style={{ fontWeight: 700 }}>
                    {distance} mi
                  </span>
                  <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                    {walkTime} min walk
                  </span>
                </div>

                <div className="flex flex-col items-center p-3 rounded-[14px] bg-white/5 border border-white/20">
                  <Clock className="w-5 h-5 text-purple-400 mb-1.5" strokeWidth={2.5} />
                  <span className="text-[12px] text-white mb-0.5 text-center" style={{ fontWeight: 700 }}>
                    {hours}
                  </span>
                  <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                    access
                  </span>
                </div>
              </div>

              {/* Features Section */}
              <div className="px-6 py-4 border-t border-white/10">
                <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                  Features & Amenities
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  {/* EV Charging */}
                  {spot.hasEVCharging && spot.evConnectorTypes && (
                    <div className="p-3 rounded-[14px] bg-green-500/10 border border-green-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-green-400 fill-green-400" strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          EV Charging
                        </span>
                      </div>
                      <div className="space-y-1">
                        {spot.evConnectorTypes.map((type) => (
                          <div key={type} className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                            • {EV_CONNECTOR_LABELS[type]}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Security */}
                  {spot.securityLevel === 'premium' && (
                    <div className="p-3 rounded-[14px] bg-purple-500/10 border border-purple-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Shield className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          Premium Security
                        </span>
                      </div>
                      <p className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                        24/7 surveillance with guard patrol
                      </p>
                    </div>
                  )}

                  {/* Covered Parking */}
                  {spot.isCovered && (
                    <div className="p-3 rounded-[14px] bg-blue-500/10 border border-blue-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <Umbrella className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          Covered
                        </span>
                      </div>
                      <p className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                        Weather protected parking
                      </p>
                    </div>
                  )}

                  {/* Camera Surveillance */}
                  {spot.hasCameras && (
                    <div className="p-3 rounded-[14px] bg-cyan-500/10 border border-cyan-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          Security Cameras
                        </span>
                      </div>
                      <p className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                        Full camera coverage
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Amenities */}
              <div className="px-6 py-4 border-t border-white/10">
                <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                  Additional Amenities
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" strokeWidth={2.5} />
                      <span className="text-[13px] text-white/90" style={{ fontWeight: 500 }}>
                        {amenity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="px-6 py-4 border-t border-white/10">
                <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
                  About This Spot
                </h3>
                <p className="text-[14px] text-white/80 leading-relaxed" style={{ fontWeight: 400 }}>
                  {description}
                </p>
              </div>

              {/* Location */}
              <div className="px-6 py-4 border-t border-white/10">
                <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                  Location
                </h3>
                <div className="flex items-start gap-3 p-3 rounded-[14px] bg-white/5 border border-white/20">
                  <MapPin className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <div className="flex-1">
                    <p className="text-[14px] text-white mb-1" style={{ fontWeight: 500 }}>
                      {address}
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {distance} miles away • {walkTime} min walk
                    </p>
                  </div>
                </div>
              </div>

              {/* Host Information */}
              <div className="px-6 py-4 border-t border-white/10">
                <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                  Hosted By
                </h3>
                <div className="flex items-center justify-between p-4 rounded-[14px] bg-white/5 border border-white/20">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                      <span className="text-[18px] text-white" style={{ fontWeight: 700 }}>
                        {hostName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                        {hostName}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" strokeWidth={2} />
                        <span className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                          {rating.toFixed(1)} • {responseTime}
                        </span>
                      </div>
                    </div>
                  </div>
                  <motion.button
                    onClick={handleContact}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border border-white/30"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                    aria-label="Contact host"
                  >
                    <Phone className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>

              {/* Duration Selector */}
              {!spot.isReserved && status !== 'full' && (
                <div className="px-6 py-4 border-t border-white/10">
                  <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
                    Select Duration
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 8].map((hours) => (
                      <motion.button
                        key={hours}
                        onClick={() => {
                          triggerHaptic();
                          setSelectedDuration(hours);
                        }}
                        className={`p-3 rounded-[14px] border-2 ${
                          selectedDuration === hours
                            ? 'bg-purple-500/20 border-purple-400'
                            : 'bg-white/5 border-white/20'
                        }`}
                        whileTap={{ scale: 0.95 }}
                        transition={springConfig}
                      >
                        <div 
                          className={`text-[16px] mb-0.5 ${
                            selectedDuration === hours ? 'text-white' : 'text-white/70'
                          }`}
                          style={{ fontWeight: 700 }}
                        >
                          {hours}h
                        </div>
                        <div 
                          className={`text-[11px] ${
                            selectedDuration === hours ? 'text-white/90' : 'text-white/60'
                          }`}
                          style={{ fontWeight: 500 }}
                        >
                          ${spot.price * hours}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="sticky bottom-0 px-6 py-4 bg-[#1C1C1E]/95 backdrop-blur-2xl border-t border-white/20">
                {status === 'full' ? (
                  <div className="p-4 rounded-[14px] bg-red-500/10 border border-red-500/30 mb-3">
                    <div className="flex items-center gap-2">
                      <Info className="w-5 h-5 text-red-400" strokeWidth={2.5} />
                      <span className="text-[14px] text-red-400" style={{ fontWeight: 600 }}>
                        This parking spot is currently full
                      </span>
                    </div>
                  </div>
                ) : spot.isReserved ? (
                  <div className="p-4 rounded-[14px] bg-blue-500/10 border border-blue-500/30 mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-blue-400" strokeWidth={2.5} />
                      <span className="text-[14px] text-blue-400" style={{ fontWeight: 600 }}>
                        You have an active reservation here
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 mb-3">
                    <div>
                      <div className="text-[13px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                        Total for {selectedDuration}h
                      </div>
                      <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
                        ${totalPrice}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                        ${spot.price}/hour
                      </div>
                      {status === 'limited' && (
                        <div className="text-[11px] text-yellow-400" style={{ fontWeight: 600 }}>
                          Only {spot.available} spots left!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    onClick={handleNavigate}
                    className="py-3.5 px-4 rounded-[14px] bg-white/10 border-2 border-white/30 flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                  >
                    <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
                    <span className="text-[16px] text-white" style={{ fontWeight: 600 }}>
                      Navigate
                    </span>
                  </motion.button>

                  {status !== 'full' && !spot.isReserved && (
                    <motion.button
                      onClick={handleReserve}
                      className="py-3.5 px-4 rounded-[14px] bg-gradient-to-r from-purple-500 to-cyan-500 border-2 border-white/30 flex items-center justify-center gap-2"
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <Car className="w-5 h-5 text-white" strokeWidth={2.5} />
                      <span className="text-[16px] text-white" style={{ fontWeight: 600 }}>
                        Reserve Now
                      </span>
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}