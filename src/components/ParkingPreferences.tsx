import { motion } from 'motion/react';
import { ArrowLeft, Shield, Zap, DollarSign, MapPin, Star, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner@2.0.3';

interface ParkingPreferencesProps {
  isDarkMode: boolean;
  onBack: () => void;
}

export function ParkingPreferences({ isDarkMode, onBack }: ParkingPreferencesProps) {
  const [preferences, setPreferences] = useState({
    // Parking Type Preferences
    covered: true,
    outdoor: false,
    garage: true,
    street: false,
    
    // Feature Preferences
    evCharging: true,
    security: true,
    accessible: false,
    valetAvailable: true,
    
    // Service Preferences
    autoReserve: false,
    extendAutomatically: true,
    notifyOnExpiry: true,
    nearbyAlerts: false,
    
    // Budget Preferences
    maxHourlyRate: '20',
    maxDailyRate: '50',
    prioritizeCheapest: false,
    
    // Distance Preferences
    maxWalkingDistance: '0.5',
    prioritizeClosest: true,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <motion.button
      onClick={onToggle}
      className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
        enabled ? 'bg-green-500' : 'bg-white/20'
      }`}
      whileTap={{ scale: 0.95 }}
      transition={springConfig}
    >
      <motion.div
        className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
        animate={{ x: enabled ? 20 : 0 }}
        transition={springConfig}
      />
    </motion.button>
  );

  const handleSave = () => {
    toast.success('Parking preferences saved');
    setTimeout(() => onBack(), 1000);
  };

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">
          Parking Preferences
        </h1>
      </motion.div>

      <div className="px-4 space-y-6">
        {/* Parking Type */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-pink-500/40 border-2 border-purple-400/30">
              <MapPin className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Parking Type
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Covered Parking
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Protected from weather
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.covered}
                onToggle={() => setPreferences({ ...preferences, covered: !preferences.covered })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Outdoor Lots
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Open-air parking areas
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.outdoor}
                onToggle={() => setPreferences({ ...preferences, outdoor: !preferences.outdoor })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Parking Garages
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Multi-level structures
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.garage}
                onToggle={() => setPreferences({ ...preferences, garage: !preferences.garage })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Street Parking
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Metered street spots
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.street}
                onToggle={() => setPreferences({ ...preferences, street: !preferences.street })}
              />
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30">
              <Star className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Required Features
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  EV Charging
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Electric vehicle charging stations
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.evCharging}
                onToggle={() => setPreferences({ ...preferences, evCharging: !preferences.evCharging })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  24/7 Security
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Cameras and attendants
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.security}
                onToggle={() => setPreferences({ ...preferences, security: !preferences.security })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Accessible Parking
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  ADA-compliant spaces
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.accessible}
                onToggle={() => setPreferences({ ...preferences, accessible: !preferences.accessible })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Valet Service
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Premium valet available
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.valetAvailable}
                onToggle={() => setPreferences({ ...preferences, valetAvailable: !preferences.valetAvailable })}
              />
            </div>
          </div>
        </motion.div>

        {/* Smart Features */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-orange-500/40 to-amber-500/40 border-2 border-orange-400/30">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Smart Features
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Auto-Reserve
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Automatically book regular spots
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.autoReserve}
                onToggle={() => setPreferences({ ...preferences, autoReserve: !preferences.autoReserve })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Auto-Extend
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Extend parking time automatically
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.extendAutomatically}
                onToggle={() => setPreferences({ ...preferences, extendAutomatically: !preferences.extendAutomatically })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Expiry Notifications
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Alert 30 min before expiration
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.notifyOnExpiry}
                onToggle={() => setPreferences({ ...preferences, notifyOnExpiry: !preferences.notifyOnExpiry })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Nearby Alerts
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Notify when near saved locations
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.nearbyAlerts}
                onToggle={() => setPreferences({ ...preferences, nearbyAlerts: !preferences.nearbyAlerts })}
              />
            </div>
          </div>
        </motion.div>

        {/* Budget & Distance */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-green-400/30">
              <DollarSign className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Budget & Distance
            </h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Max Hourly Rate: ${preferences.maxHourlyRate}/hr
              </label>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={preferences.maxHourlyRate}
                onChange={(e) => setPreferences({ ...preferences, maxHourlyRate: e.target.value })}
                className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500"
              />
            </div>

            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Max Daily Rate: ${preferences.maxDailyRate}/day
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={preferences.maxDailyRate}
                onChange={(e) => setPreferences({ ...preferences, maxDailyRate: e.target.value })}
                className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500"
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Prioritize Cheapest
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Show lowest price options first
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.prioritizeCheapest}
                onToggle={() => setPreferences({ ...preferences, prioritizeCheapest: !preferences.prioritizeCheapest })}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Max Walking Distance: {preferences.maxWalkingDistance} mi
              </label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={preferences.maxWalkingDistance}
                onChange={(e) => setPreferences({ ...preferences, maxWalkingDistance: e.target.value })}
                className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Prioritize Closest
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Show nearest options first
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.prioritizeClosest}
                onToggle={() => setPreferences({ ...preferences, prioritizeClosest: !preferences.prioritizeClosest })}
              />
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Save className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Save Preferences
          </span>
        </motion.button>
      </div>
    </div>
  );
}
