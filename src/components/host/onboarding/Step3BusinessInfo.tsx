import { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, User, MapPin, Hash } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step3BusinessInfoProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['businessInfo'];
  hostType?: 'venue' | 'parking' | 'valet';
}

export function Step3BusinessInfo({ onComplete, initialValue, hostType }: Step3BusinessInfoProps) {
  const [contactName, setContactName] = useState(initialValue?.contactName || '');
  const [contactTitle, setContactTitle] = useState(initialValue?.contactTitle || '');
  const [street, setStreet] = useState(initialValue?.address.street || '');
  const [city, setCity] = useState(initialValue?.address.city || '');
  const [state, setState] = useState(initialValue?.address.state || '');
  const [zipCode, setZipCode] = useState(initialValue?.address.zipCode || '');
  const [numberOfSpots, setNumberOfSpots] = useState(initialValue?.numberOfSpots || 1);
  const [legalName, setLegalName] = useState(initialValue?.legalName || '');
  const [taxId, setTaxId] = useState(initialValue?.taxId || '');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const isCommercial = hostType === 'parking' || hostType === 'valet';

  const isValid = () => {
    return (
      contactName.trim() !== '' &&
      street.trim() !== '' &&
      city.trim() !== '' &&
      state.trim() !== '' &&
      zipCode.trim() !== '' &&
      numberOfSpots > 0 &&
      (!isCommercial || (legalName.trim() !== '' && taxId.trim() !== ''))
    );
  };

  const handleContinue = () => {
    if (isValid()) {
      onComplete({
        businessInfo: {
          legalName: isCommercial ? legalName : undefined,
          contactName,
          contactTitle: contactTitle || undefined,
          address: { street, city, state, zipCode },
          taxId: isCommercial ? taxId : undefined,
          numberOfSpots,
        },
      });
    }
  };

  return (
    <div className="max-w-[800px] mx-auto px-4">
      {/* Header */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          Business Information
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Tell us about your {hostType === 'venue' ? 'venue' : hostType === 'parking' ? 'parking operation' : 'valet service'}
        </p>
      </motion.div>

      <div className="space-y-5">
        {/* Legal Name - Commercial only */}
        {isCommercial && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 }}
          >
            <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
              Business Legal Name
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Building2 className="w-5 h-5 text-white/60" strokeWidth={2.5} />
              </div>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="ABC Parking LLC"
                className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
                style={{ fontSize: '17px', fontWeight: 400 }}
              />
            </div>
          </motion.div>
        )}

        {/* Contact Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Your Name
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <User className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="John Smith"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Contact Title - Optional */}
        {isCommercial && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.2 }}
          >
            <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
              Title / Role <span className="text-white/50">(Optional)</span>
            </label>
            <input
              type="text"
              value={contactTitle}
              onChange={(e) => setContactTitle(e.target.value)}
              placeholder="Property Manager"
              className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </motion.div>
        )}

        {/* Address */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            {hostType === 'venue' ? 'Venue' : 'Property'} Address
          </label>
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <MapPin className="w-5 h-5 text-white/60" strokeWidth={2.5} />
              </div>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Street address"
                className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
                style={{ fontSize: '17px', fontWeight: 400 }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
                style={{ fontSize: '17px', fontWeight: 400 }}
              />
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className="px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
                style={{ fontSize: '17px', fontWeight: 400 }}
              />
            </div>
            
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="ZIP code"
              className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Number of Spots */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Number of {hostType === 'venue' ? 'Parking' : ''} Spots
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Hash className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              type="number"
              min="1"
              value={numberOfSpots}
              onChange={(e) => setNumberOfSpots(parseInt(e.target.value) || 1)}
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Tax ID - Commercial only */}
        {isCommercial && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.35 }}
          >
            <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
              Tax ID / EIN
            </label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="XX-XXXXXXX"
              className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
            <p className="text-[13px] text-white/50 mt-2" style={{ fontWeight: 400 }}>
              Required for tax reporting and payments
            </p>
          </motion.div>
        )}
      </div>

      {/* Continue Button */}
      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
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
