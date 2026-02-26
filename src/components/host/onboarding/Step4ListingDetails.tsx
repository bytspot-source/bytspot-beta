import { useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, Upload, Zap, Shield, Clock, Car } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step4ListingDetailsProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['listing'];
  hostType?: 'venue' | 'parking' | 'valet';
}

export function Step4ListingDetails({ onComplete, initialValue, hostType }: Step4ListingDetailsProps) {
  const [address, setAddress] = useState(initialValue?.location.address || '');
  const [notes, setNotes] = useState(initialValue?.location.notes || '');
  const [spotType, setSpotType] = useState<'outdoor' | 'covered' | 'garage' | 'valet'>(
    initialValue?.spotType || 'outdoor'
  );
  const [size, setSize] = useState<'compact' | 'standard' | 'large' | 'oversized'>(
    initialValue?.size || 'standard'
  );
  const [amenities, setAmenities] = useState({
    evCharging: initialValue?.amenities.evCharging || undefined,
    covered: initialValue?.amenities.covered || false,
    security: initialValue?.amenities.security || false,
    gated: initialValue?.amenities.gated || false,
    access24: initialValue?.amenities.access24 || false,
    restroom: initialValue?.amenities.restroom || false,
    attendant: initialValue?.amenities.attendant || false,
    accessible: initialValue?.amenities.accessible || false,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const spotTypes = [
    { id: 'outdoor' as const, label: 'Outdoor', icon: Car },
    { id: 'covered' as const, label: 'Covered', icon: Shield },
    { id: 'garage' as const, label: 'Garage', icon: Car },
    { id: 'valet' as const, label: 'Valet', icon: Car },
  ];

  const sizes = [
    { id: 'compact' as const, label: 'Compact' },
    { id: 'standard' as const, label: 'Standard' },
    { id: 'large' as const, label: 'Large' },
    { id: 'oversized' as const, label: 'Oversized' },
  ];

  const toggleAmenity = (key: keyof typeof amenities) => {
    setAmenities(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isValid = () => {
    return address.trim() !== '';
  };

  const handleContinue = () => {
    if (isValid()) {
      onComplete({
        listing: {
          location: {
            address,
            coordinates: { lat: 37.7749, lng: -122.4194 }, // Mock coordinates
            notes,
          },
          spotType,
          accessType: 'self',
          size,
          photos: [], // Photos would be uploaded here
          amenities,
        },
      });
    }
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 pb-8">
      {/* Header */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          List Your Space
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Tell us about your parking space
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* Location */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Location
          </label>
          <div className="relative mb-3">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <MapPin className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter parking spot address"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
          
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Location notes (e.g., Behind building, Level 2)"
            className="w-full px-4 py-3 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
            style={{ fontSize: '15px', fontWeight: 400 }}
          />
        </motion.div>

        {/* Spot Type */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Spot Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {spotTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setSpotType(type.id)}
                  className={`p-4 rounded-[16px] border-2 transition-all ${
                    spotType === type.id
                      ? 'border-purple-500/50 bg-purple-500/20'
                      : 'border-white/30 bg-[#1C1C1E]/80'
                  } backdrop-blur-xl`}
                >
                  <Icon className="w-6 h-6 text-white mb-2" strokeWidth={2.5} />
                  <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {type.label}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Size */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Vehicle Size
          </label>
          <div className="grid grid-cols-2 gap-3">
            {sizes.map((s) => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={`p-3 rounded-[16px] border-2 transition-all ${
                  size === s.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {s.label}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Amenities */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Amenities
          </label>
          <div className="space-y-2">
            {[
              { key: 'evCharging' as const, label: 'EV Charging', icon: Zap },
              { key: 'covered' as const, label: 'Covered/Sheltered', icon: Shield },
              { key: 'security' as const, label: 'Security Camera', icon: Shield },
              { key: 'gated' as const, label: 'Gated Access', icon: Shield },
              { key: 'access24' as const, label: '24/7 Access', icon: Clock },
              { key: 'attendant' as const, label: 'Attendant On-Site', icon: Car },
              { key: 'accessible' as const, label: 'Wheelchair Accessible', icon: Car },
            ].map((amenity) => {
              const Icon = amenity.icon;
              return (
                <button
                  key={amenity.key}
                  onClick={() => toggleAmenity(amenity.key)}
                  className={`w-full flex items-center gap-3 p-4 rounded-[16px] border-2 transition-all ${
                    amenities[amenity.key]
                      ? 'border-purple-500/50 bg-purple-500/20'
                      : 'border-white/30 bg-[#1C1C1E]/80'
                  } backdrop-blur-xl`}
                >
                  <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <span className="flex-1 text-left text-[15px] text-white" style={{ fontWeight: 500 }}>
                    {amenity.label}
                  </span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    amenities[amenity.key]
                      ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                      : 'border-white/50'
                  }`}>
                    {amenities[amenity.key] && (
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
              );
            })}
          </div>
        </motion.div>

        {/* Photo Upload Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Photos
          </label>
          <div className="border-2 border-dashed border-white/30 rounded-[16px] p-8 text-center bg-[#1C1C1E]/50 backdrop-blur-xl">
            <Upload className="w-12 h-12 text-white/60 mx-auto mb-3" strokeWidth={2} />
            <p className="text-[15px] text-white/80 mb-2" style={{ fontWeight: 600 }}>
              Add Photos
            </p>
            <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
              Upload at least 3 photos of your parking space
            </p>
          </div>
        </motion.div>
      </div>

      {/* Continue Button */}
      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.35 }}
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
