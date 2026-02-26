import { motion } from 'motion/react';
import { MapPin, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { BrandLogo } from './BrandLogo';

interface LandingPageProps {
  isDarkMode: boolean;
  onGetStarted: () => void;
}

export function LandingPage({ isDarkMode, onGetStarted }: LandingPageProps) {
  const [address, setAddress] = useState('');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onGetStarted();
    }
  };

  return (
    <div className={`min-h-screen overflow-hidden transition-colors duration-500 ${
      isDarkMode ? 'bg-[#000000]' : 'bg-[#F5F7FA]'
    }`}>
      {/* Background gradients - Brand Colors */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${
        isDarkMode ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          {/* Purple (AI) - Top */}
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.28) 0%, transparent 70%)' }} />
          {/* Cyan (Parking) - Bottom */}
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.22) 0%, transparent 70%)' }} />
          {/* Magenta (Venues) - Right */}
          <div className="absolute top-1/2 right-[5%] -translate-y-1/2 w-[400px] h-[400px]" 
               style={{ background: 'radial-gradient(circle, rgba(255, 0, 255, 0.18) 0%, transparent 70%)' }} />
        </div>
      </div>

      <div className={`absolute inset-0 transition-opacity duration-500 ${
        isDarkMode ? 'opacity-0' : 'opacity-100'
      }`}>
        <div className="absolute inset-0 bg-[#F5F7FA]" />
        <div className="absolute inset-0 opacity-15 pointer-events-none">
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.2) 0%, transparent 70%)' }} />
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)' }} />
        </div>
      </div>

      {/* Content */}
      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12">
        <div className="flex-1 flex flex-col justify-center">
          {/* Logo */}
          <div className="text-center mb-12">
            <div className="flex justify-center">
              <BrandLogo size={120} animated={false} />
            </div>
          </div>

          {/* Address Input Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <label className={`block text-[13px] mb-2 px-1 transition-colors ${
                isDarkMode ? 'text-white' : 'text-black/75'
              }`} style={{ fontWeight: 500 }}>
                Where are you going?
              </label>
              <div className={`rounded-[16px] border-2 transition-all duration-300 backdrop-blur-xl shadow-xl ${
                isDarkMode 
                  ? 'border-white/30 bg-[#1C1C1E]/80' 
                  : 'border-black/[0.14] bg-white/70'
              }`}>
                <div className="flex items-center gap-3 p-4">
                  <MapPin className={`w-5 h-5 flex-shrink-0 transition-colors ${
                    isDarkMode ? 'text-purple-400' : 'text-purple-600'
                  }`} strokeWidth={2.5} />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter address or location"
                    className={`flex-1 bg-transparent text-[17px] outline-none transition-colors ${
                      isDarkMode 
                        ? 'text-white placeholder:text-white/60' 
                        : 'text-black/95 placeholder:text-black/55'
                    }`}
                    style={{ fontWeight: 400 }}
                  />
                </div>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={!address.trim()}
              className={`w-full rounded-[16px] p-4 flex items-center justify-center gap-2 transition-all ${
                address.trim()
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25'
                  : (isDarkMode ? 'bg-white/10' : 'bg-black/10')
              }`}
              whileTap={{ scale: address.trim() ? 0.98 : 1 }}
              transition={springConfig}
            >
              <span className={`text-[17px] ${
                address.trim() ? 'text-white' : (isDarkMode ? 'text-white/40' : 'text-black/40')
              }`} style={{ fontWeight: 600 }}>
                Get Started
              </span>
              <ArrowRight className={`w-5 h-5 ${
                address.trim() ? 'text-white' : (isDarkMode ? 'text-white/40' : 'text-black/40')
              }`} strokeWidth={2.5} />
            </motion.button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center pt-8">
          <p className={`text-[12px] transition-colors ${
            isDarkMode ? 'text-white/40' : 'text-black/40'
          }`} style={{ fontWeight: 400 }}>
            By continuing, you agree to our Terms & Privacy
          </p>
        </div>
      </div>
    </div>
  );
}
