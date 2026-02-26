import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ChevronLeft, MapPin, Clock, DollarSign, Shield, Star, 
  Navigation, Phone, Camera, QrCode, Check, AlertCircle,
  TrendingUp, Users, Zap, Car, Bell, Receipt, ArrowRight,
  WifiOff, Wifi, Circle, Timer, CreditCard
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface ParkingSpot {
  id: string;
  name: string;
  address: string;
  distance: number;
  walkTime: number;
  price: number;
  availability: number;
  total: number;
  securityRating: number;
  rating: number;
  reviews: number;
  features: string[];
  iotEnabled: boolean;
  lastUpdate?: Date | string; // Optional and can be Date or string
}

interface ParkingReservationFlowProps {
  spot: ParkingSpot;
  isDarkMode: boolean;
  onClose: () => void;
}

type FlowScreen = 'details' | 'comparison' | 'reviews' | 'confirmation' | 'active';

const sampleNearbySpots: ParkingSpot[] = [
  {
    id: '1',
    name: 'Downtown Plaza Garage',
    address: '123 Main St',
    distance: 0.3,
    walkTime: 4,
    price: 8,
    availability: 24,
    total: 150,
    securityRating: 4.8,
    rating: 4.7,
    reviews: 342,
    features: ['24/7 Security', 'EV Charging', 'Covered'],
    iotEnabled: true,
    lastUpdate: new Date(),
  },
  {
    id: '2',
    name: 'Central Station Lot',
    address: '456 Oak Ave',
    distance: 0.5,
    walkTime: 6,
    price: 6,
    availability: 18,
    total: 100,
    securityRating: 4.5,
    rating: 4.6,
    reviews: 231,
    features: ['CCTV', 'Well-lit', 'Attendant'],
    iotEnabled: true,
    lastUpdate: new Date(),
  },
  {
    id: '3',
    name: 'Bay Area Mall',
    address: '789 Commerce Blvd',
    distance: 0.8,
    walkTime: 10,
    price: 5,
    availability: 42,
    total: 300,
    securityRating: 4.3,
    rating: 4.4,
    reviews: 567,
    features: ['Covered', 'Restrooms', 'Elevators'],
    iotEnabled: true,
    lastUpdate: new Date(),
  },
];

const sampleReviews = [
  {
    id: 1,
    user: 'Sarah Chen',
    avatar: 'https://i.pravatar.cc/150?img=1',
    rating: 5,
    date: '2 days ago',
    text: 'Great location! Always find a spot. Security cameras everywhere make me feel safe.',
    verified: true,
    photos: ['https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=400', 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=400'],
  },
  {
    id: 2,
    user: 'Mike Johnson',
    avatar: 'https://i.pravatar.cc/150?img=3',
    rating: 4,
    date: '5 days ago',
    text: 'Convenient spot near downtown. A bit pricey during events but the real-time availability feature is super helpful.',
    verified: true,
    photos: [],
  },
];

export function ParkingReservationFlow({ spot: initialSpot, isDarkMode, onClose }: ParkingReservationFlowProps) {
  const [currentScreen, setCurrentScreen] = useState<FlowScreen>('details');
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot>(initialSpot);
  const [nearbySpots] = useState(sampleNearbySpots);
  const [duration, setDuration] = useState(2); // hours
  const [isReserving, setIsReserving] = useState(false);
  const [reservationCode, setReservationCode] = useState('');
  const [availabilityTimer, setAvailabilityTimer] = useState(30);
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Simulate real-time availability updates - only on details screen
  useEffect(() => {
    if (currentScreen !== 'details') return;
    
    let mounted = true;

    const interval = setInterval(() => {
      if (!mounted) return;
      setAvailabilityTimer(30);
      setSelectedSpot(prev => ({
        ...prev,
        availability: Math.max(0, prev.availability + Math.floor(Math.random() * 6) - 3),
        lastUpdate: new Date(),
      }));
    }, 30000);

    const timer = setInterval(() => {
      if (!mounted) return;
      setAvailabilityTimer(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [currentScreen]);

  const handleReserve = () => {
    setIsReserving(true);
    // Simulate reservation process
    setTimeout(() => {
      setReservationCode(`BYT${Date.now().toString().slice(-6)}`);
      setIsReserving(false);
      setCurrentScreen('active');
    }, 2000);
  };

  const totalCost = selectedSpot.price * duration;
  const availabilityPercent = (selectedSpot.availability / selectedSpot.total) * 100;

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-[#000000]"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={springConfig}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-b-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentScreen !== 'details' && currentScreen !== 'active' && (
                  <motion.button
                    onClick={() => setCurrentScreen('details')}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                )}
                <div>
                  <h2 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {currentScreen === 'details' && 'Parking Details'}
                    {currentScreen === 'comparison' && 'Compare Options'}
                    {currentScreen === 'reviews' && 'Reviews & Ratings'}
                    {currentScreen === 'confirmation' && 'Confirm Reservation'}
                    {currentScreen === 'active' && 'Active Reservation'}
                  </h2>
                  <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {currentScreen === 'active' ? `Code: ${reservationCode}` : selectedSpot.name}
                  </p>
                </div>
              </div>

              <motion.button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {currentScreen === 'details' && (
              <DetailsScreen
                spot={selectedSpot}
                duration={duration}
                setDuration={setDuration}
                availabilityTimer={availabilityTimer}
                availabilityPercent={availabilityPercent}
                onCompare={() => setCurrentScreen('comparison')}
                onViewReviews={() => setCurrentScreen('reviews')}
                onContinue={() => setCurrentScreen('confirmation')}
                springConfig={springConfig}
              />
            )}

            {currentScreen === 'comparison' && (
              <ComparisonScreen
                spots={nearbySpots}
                selectedSpot={selectedSpot}
                onSelectSpot={(spot) => {
                  setSelectedSpot(spot);
                  setCurrentScreen('details');
                }}
                springConfig={springConfig}
              />
            )}

            {currentScreen === 'reviews' && (
              <ReviewsScreen
                spot={selectedSpot}
                reviews={sampleReviews}
                springConfig={springConfig}
              />
            )}

            {currentScreen === 'confirmation' && (
              <ConfirmationScreen
                spot={selectedSpot}
                duration={duration}
                totalCost={totalCost}
                isReserving={isReserving}
                onConfirm={handleReserve}
                springConfig={springConfig}
              />
            )}

            {currentScreen === 'active' && (
              <ActiveReservationScreen
                spot={selectedSpot}
                duration={duration}
                totalCost={totalCost}
                reservationCode={reservationCode}
                springConfig={springConfig}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Details Screen Component
function DetailsScreen({ spot, duration, setDuration, availabilityTimer, availabilityPercent, onCompare, onViewReviews, onContinue, springConfig }: any) {
  return (
    <motion.div
      key="details"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Real-time Availability */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Wifi className="w-5 h-5 text-cyan-400" />
            </motion.div>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Live Availability
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            <Clock className="w-3.5 h-3.5" />
            Updates in {availabilityTimer}s
          </div>
        </div>

        <div className="mb-2">
          <div className="flex items-end gap-2 mb-2">
            <span className="text-[34px] text-white" style={{ fontWeight: 700 }}>
              {spot.availability}
            </span>
            <span className="text-[17px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
              / {spot.total} spots
            </span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${availabilityPercent > 30 ? 'bg-green-400' : availabilityPercent > 10 ? 'bg-yellow-400' : 'bg-red-400'}`}
              initial={{ width: 0 }}
              animate={{ width: `${availabilityPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-[13px]">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-white/90" style={{ fontWeight: 500 }}>
            IoT sensors active • Updated {spot.lastUpdate ? Math.floor((Date.now() - new Date(spot.lastUpdate).getTime()) / 1000) : 0}s ago
          </span>
        </div>
      </div>

      {/* Location & Distance */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              {spot.name}
            </h3>
            <p className="text-[15px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
              {spot.address}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-[13px] text-cyan-400" style={{ fontWeight: 600 }}>
                <Navigation className="w-3.5 h-3.5" />
                {spot.distance} mi
              </div>
              <span className="text-white/50">•</span>
              <div className="flex items-center gap-1 text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                <Timer className="w-3.5 h-3.5" />
                {spot.walkTime} min walk
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onCompare}
          className="w-full py-2.5 rounded-[12px] bg-white/10 border border-white/30 text-[15px] text-white flex items-center justify-center gap-2"
          style={{ fontWeight: 600 }}
        >
          Compare Nearby Options
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Security & Ratings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-green-400" />
            <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
              Security
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[24px] text-white" style={{ fontWeight: 700 }}>
              {spot.securityRating}
            </span>
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              / 5.0
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${i < Math.floor(spot.securityRating) ? 'fill-yellow-400 text-yellow-400' : 'text-white/30'}`}
              />
            ))}
          </div>
        </div>

        <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
              Rating
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[24px] text-white" style={{ fontWeight: 700 }}>
              {spot.rating}
            </span>
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              / 5.0
            </span>
          </div>
          <button
            onClick={onViewReviews}
            className="text-[13px] text-cyan-400 mt-1"
            style={{ fontWeight: 600 }}
          >
            {spot.reviews} reviews
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Features
        </h3>
        <div className="flex flex-wrap gap-2">
          {spot.features.map((feature: string) => (
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

      {/* Duration Selector */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Duration
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
              {duration} {duration === 1 ? 'hour' : 'hours'}
            </span>
          </div>
        </div>
        
        <input
          type="range"
          min="0.5"
          max="12"
          step="0.5"
          value={duration}
          onChange={(e) => setDuration(parseFloat(e.target.value))}
          className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-cyan-500 [&::-webkit-slider-thumb]:to-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
        />
        
        <div className="flex items-center justify-between mt-2 text-[13px] text-white/70" style={{ fontWeight: 500 }}>
          <span>30 min</span>
          <span>12 hours</span>
        </div>
      </div>

      {/* Pricing */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-400/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
            ${spot.price}/hour
          </span>
          <div className="text-right">
            <div className="text-[13px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
              Total
            </div>
            <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
              ${(spot.price * duration).toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-green-400" style={{ fontWeight: 500 }}>
          <TrendingUp className="w-3.5 h-3.5" />
          15 min grace period for auto-extension
        </div>
      </div>

      {/* Continue Button */}
      <motion.button
        onClick={onContinue}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Continue to Reservation
      </motion.button>
    </motion.div>
  );
}

// Comparison Screen Component
function ComparisonScreen({ spots, selectedSpot, onSelectSpot, springConfig }: any) {
  return (
    <motion.div
      key="comparison"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-3"
    >
      <div className="mb-4">
        <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
          Compare pricing and availability across nearby parking options
        </p>
      </div>

      {spots.map((spot: ParkingSpot, index: number) => (
        <motion.div
          key={spot.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onSelectSpot(spot)}
          className={`p-4 rounded-[16px] border-2 cursor-pointer ${
            spot.id === selectedSpot.id
              ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-400'
              : 'bg-[#1C1C1E]/80 border-white/30'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                {spot.name}
              </h3>
              <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                {spot.address}
              </p>
              <div className="flex items-center gap-3 text-[13px]">
                <div className="flex items-center gap-1 text-cyan-400" style={{ fontWeight: 600 }}>
                  <Navigation className="w-3.5 h-3.5" />
                  {spot.distance} mi
                </div>
                <span className="text-white/50">•</span>
                <div className="text-white/70" style={{ fontWeight: 500 }}>
                  {spot.walkTime} min walk
                </div>
              </div>
            </div>
            
            {spot.id === selectedSpot.id && (
              <div className="w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center">
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-2 rounded-[12px] bg-white/10 border border-white/30">
              <div className="text-[11px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                Available
              </div>
              <div className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                {spot.availability}
              </div>
            </div>
            
            <div className="p-2 rounded-[12px] bg-white/10 border border-white/30">
              <div className="text-[11px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                Price
              </div>
              <div className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                ${spot.price}/hr
              </div>
            </div>
            
            <div className="p-2 rounded-[12px] bg-white/10 border border-white/30">
              <div className="text-[11px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                Rating
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                  {spot.rating}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-white/70" style={{ fontWeight: 500 }}>
            <Wifi className="w-3 h-3 text-cyan-400" />
            Live updates • IoT enabled
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// Reviews Screen Component
function ReviewsScreen({ spot, reviews, springConfig }: any) {
  return (
    <motion.div
      key="reviews"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Rating Summary */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-2 border-yellow-400/40">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-[48px] text-white mb-1" style={{ fontWeight: 700 }}>
              {spot.rating}
            </div>
            <div className="flex items-center gap-1 justify-center mb-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < Math.floor(spot.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-white/30'}`}
                />
              ))}
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
              {spot.reviews} reviews
            </div>
          </div>
          
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((rating) => (
              <div key={rating} className="flex items-center gap-2">
                <span className="text-[13px] text-white w-3" style={{ fontWeight: 500 }}>
                  {rating}
                </span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${rating === 5 ? 70 : rating === 4 ? 20 : 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {reviews.map((review: any) => (
          <div
            key={review.id}
            className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30"
          >
            <div className="flex items-start gap-3 mb-3">
              <img
                src={review.avatar}
                alt={review.user}
                className="w-10 h-10 rounded-full"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {review.user}
                    </span>
                    {review.verified && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40">
                        <Check className="w-3 h-3 text-blue-400" />
                        <span className="text-[11px] text-blue-400" style={{ fontWeight: 600 }}>
                          Verified
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {review.date}
                  </span>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-white/30'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <p className="text-[15px] text-white/90 mb-3" style={{ fontWeight: 400 }}>
              {review.text}
            </p>
            
            {review.photos.length > 0 && (
              <div className="flex gap-2">
                {review.photos.map((photo: string, idx: number) => (
                  <div
                    key={idx}
                    className="w-20 h-20 rounded-[12px] overflow-hidden border-2 border-white/30"
                  >
                    <img
                      src={photo}
                      alt="Review"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// Confirmation Screen Component
function ConfirmationScreen({ spot, duration, totalCost, isReserving, onConfirm, springConfig }: any) {
  return (
    <motion.div
      key="confirmation"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Reservation Summary */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
          Reservation Summary
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              Location
            </span>
            <span className="text-[15px] text-white text-right" style={{ fontWeight: 600 }}>
              {spot.name}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              Duration
            </span>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              {duration} {duration === 1 ? 'hour' : 'hours'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              Rate
            </span>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              ${spot.price}/hour
            </span>
          </div>
          
          <div className="h-px bg-white/30 my-2" />
          
          <div className="flex items-center justify-between">
            <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Total
            </span>
            <span className="text-[24px] text-white" style={{ fontWeight: 700 }}>
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Smart Features */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Included Features
        </h3>
        
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Bell className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Geofence Notifications
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                100m radius alerts
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Auto-Extension
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                15 min grace period
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Digital Receipt
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                For expense tracking
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-8 rounded bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                •••• 4242
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Visa ending in 4242
              </div>
            </div>
          </div>
          <button className="text-[15px] text-cyan-400" style={{ fontWeight: 600 }}>
            Change
          </button>
        </div>
      </div>

      {/* Confirm Button */}
      <motion.button
        onClick={onConfirm}
        disabled={isReserving}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target disabled:opacity-50"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: isReserving ? 1 : 0.98 }}
        transition={springConfig}
      >
        {isReserving ? (
          <div className="flex items-center justify-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Circle className="w-5 h-5" />
            </motion.div>
            Reserving...
          </div>
        ) : (
          'Confirm & Pay'
        )}
      </motion.button>

      <p className="text-[13px] text-white/70 text-center" style={{ fontWeight: 400 }}>
        By confirming, you agree to the parking terms and conditions
      </p>
    </motion.div>
  );
}

// Active Reservation Screen Component
function ActiveReservationScreen({ spot, duration, totalCost, reservationCode, springConfig }: any) {
  const [timeRemaining, setTimeRemaining] = useState(duration * 60); // minutes
  const endTime = new Date(Date.now() + duration * 60 * 60 * 1000);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      key="active"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Success Message */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="flex flex-col items-center justify-center py-6"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </div>
        <h2 className="text-[24px] text-white mb-2" style={{ fontWeight: 700 }}>
          Reservation Confirmed!
        </h2>
        <p className="text-[15px] text-white/70 text-center" style={{ fontWeight: 400 }}>
          Your parking spot is reserved
        </p>
      </motion.div>

      {/* QR Code */}
      <div className="p-6 rounded-[16px] bg-white border-2 border-white/30">
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-[12px] flex items-center justify-center mb-3">
            <QrCode className="w-32 h-32 text-gray-800" />
          </div>
          <div className="text-center">
            <div className="text-[24px] text-gray-900 mb-1" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {reservationCode}
            </div>
            <div className="text-[13px] text-gray-600" style={{ fontWeight: 500 }}>
              Scan at entry gate
            </div>
          </div>
        </div>
      </div>

      {/* Time Remaining */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-orange-500/10 to-red-500/10 border-2 border-orange-400/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Time Remaining
          </span>
          <div className="flex items-center gap-1.5 text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            <Clock className="w-3.5 h-3.5" />
            Ends at {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div className="text-[34px] text-white" style={{ fontWeight: 700 }}>
          {Math.floor(timeRemaining / 60)}h {timeRemaining % 60}m
        </div>
      </div>

      {/* Location Info */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
          {spot.name}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[15px] text-white/70">
            <MapPin className="w-4 h-4" />
            <span style={{ fontWeight: 400 }}>{spot.address}</span>
          </div>
          <div className="flex items-center gap-2 text-[15px] text-white/70">
            <Navigation className="w-4 h-4" />
            <span style={{ fontWeight: 400 }}>{spot.distance} mi away • {spot.walkTime} min walk</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button className="p-3 rounded-[12px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 flex flex-col items-center gap-1">
          <Navigation className="w-5 h-5 text-white" />
          <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
            Navigate
          </span>
        </button>
        
        <button className="p-3 rounded-[12px] bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30 flex flex-col items-center gap-1">
          <Phone className="w-5 h-5 text-white" />
          <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
            Call Support
          </span>
        </button>
      </div>

      {/* Extend Reservation */}
      <motion.button
        className="w-full py-4 rounded-[16px] bg-white/10 border-2 border-white/30 text-[17px] text-white tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Extend Reservation
      </motion.button>

      {/* Receipt */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Digital Receipt
          </h3>
          <Receipt className="w-5 h-5 text-white/70" />
        </div>
        <div className="space-y-2 text-[15px]">
          <div className="flex justify-between">
            <span className="text-white/70" style={{ fontWeight: 400 }}>Duration</span>
            <span className="text-white" style={{ fontWeight: 600 }}>{duration} hours</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70" style={{ fontWeight: 400 }}>Rate</span>
            <span className="text-white" style={{ fontWeight: 600 }}>${spot.price}/hr</span>
          </div>
          <div className="h-px bg-white/30 my-2" />
          <div className="flex justify-between">
            <span className="text-white" style={{ fontWeight: 600 }}>Total Paid</span>
            <span className="text-white" style={{ fontWeight: 700 }}>${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <button className="w-full mt-3 py-2 rounded-[12px] bg-white/10 border border-white/30 text-[15px] text-cyan-400" style={{ fontWeight: 600 }}>
          Email Receipt
        </button>
      </div>
    </motion.div>
  );
}
