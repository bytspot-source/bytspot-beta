import { motion } from 'motion/react';
import { ArrowLeft, MapPin, Bluetooth, Wifi, Shield, Bell, Gift, Eye, ExternalLink, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect, memo } from 'react';
import { toast } from 'sonner@2.0.3';
import { useLocationPermissions } from './LocationPermissionFlow';

interface LocationSettingsProps {
  isDarkMode: boolean;
  onBack: () => void;
  userRole?: 'parker' | 'driver'; // Parker (customer) vs Driver (valet contractor)
}

export function LocationSettings({ isDarkMode, onBack, userRole = 'parker' }: LocationSettingsProps) {
  const { permissions } = useLocationPermissions();
  const [enhancedIndoorAccuracy, setEnhancedIndoorAccuracy] = useState(false);
  const [backgroundLocation, setBackgroundLocation] = useState(false);
  const [locationForOffers, setLocationForOffers] = useState(false);
  const [venueRecommendations, setVenueRecommendations] = useState(false);
  const [activeJobTracking, setActiveJobTracking] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Load settings from localStorage
  useEffect(() => {
    const settings = localStorage.getItem('bytspot_location_settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      setEnhancedIndoorAccuracy(parsed.enhancedIndoorAccuracy ?? false);
      setBackgroundLocation(parsed.backgroundLocation ?? false);
      setLocationForOffers(parsed.locationForOffers ?? false);
    }

    // Load venue recommendations setting
    const venueRecsEnabled = localStorage.getItem('bytspot_venue_recommendations_enabled');
    setVenueRecommendations(venueRecsEnabled === 'true');

    // Check if there's an active job (for tracking status)
    const activeJob = localStorage.getItem('bytspot_active_valet_job');
    setActiveJobTracking(!!activeJob);
  }, []);

  // Save settings to localStorage
  const saveSettings = (key: string, value: boolean) => {
    const settings = {
      enhancedIndoorAccuracy,
      backgroundLocation,
      locationForOffers,
      [key]: value,
    };
    localStorage.setItem('bytspot_location_settings', JSON.stringify(settings));
  };

  const handleVenueRecommendationsToggle = () => {
    const newValue = !venueRecommendations;
    setVenueRecommendations(newValue);
    localStorage.setItem('bytspot_venue_recommendations_enabled', String(newValue));
    
    if (newValue) {
      toast.success('Venue Recommendations Enabled', {
        description: 'You\'ll see personalized venue suggestions in the Insider tab',
        duration: 3000,
      });
    } else {
      toast.info('Venue Recommendations Disabled', {
        description: 'You won\'t receive location-based venue suggestions',
        duration: 3000,
      });
    }
  };

  const ToggleSwitch = memo(({ enabled, onToggle, disabled = false }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) => (
    <motion.button
      onClick={() => !disabled && onToggle()}
      className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
        enabled ? 'bg-green-500' : 'bg-white/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      whileTap={disabled ? {} : { scale: 0.95 }}
      transition={springConfig}
      disabled={disabled}
    >
      <motion.div
        className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
        animate={{ x: enabled ? 20 : 0 }}
        transition={springConfig}
      />
    </motion.button>
  ));

  const getLocationStatusColor = () => {
    if (permissions.location === 'always') return 'text-green-400';
    if (permissions.location === 'whenInUse') return 'text-blue-400';
    return 'text-red-400';
  };

  const getLocationStatusText = () => {
    if (permissions.location === 'always') return 'Always Allow';
    if (permissions.location === 'whenInUse') return 'While Using App';
    if (permissions.location === 'denied') return 'Disabled';
    return 'Not Set';
  };

  const openSystemSettings = () => {
    toast.info('Opening system settings...', {
      description: 'Please update location permissions in your device settings',
    });
    // In a real app, this would open the system settings
  };

  const handleEnhancedIndoorToggle = () => {
    if (!permissions.bluetooth || !permissions.wifi) {
      toast.error('Requires Bluetooth and WiFi permissions', {
        description: 'Enable both to use Enhanced Indoor Accuracy',
      });
      return;
    }
    const newValue = !enhancedIndoorAccuracy;
    setEnhancedIndoorAccuracy(newValue);
    saveSettings('enhancedIndoorAccuracy', newValue);
    toast.success(newValue ? 'Enhanced Indoor Accuracy enabled' : 'Enhanced Indoor Accuracy disabled');
  };

  const handleBackgroundLocationToggle = () => {
    if (permissions.location !== 'always') {
      toast.error('Requires "Always Allow" location permission', {
        description: 'Tap "Primary Location Permission" to update',
        duration: 4000,
      });
      return;
    }
    const newValue = !backgroundLocation;
    setBackgroundLocation(newValue);
    saveSettings('backgroundLocation', newValue);
    
    if (newValue) {
      toast.success('Background Location enabled', {
        description: 'Track valet return trip even when app is closed',
      });
    } else {
      toast.info('Background Location disabled');
    }
  };

  const handleLocationForOffersToggle = () => {
    const newValue = !locationForOffers;
    setLocationForOffers(newValue);
    saveSettings('locationForOffers', newValue);
    
    if (newValue) {
      toast.success('Location-based offers enabled', {
        description: 'Receive special offers from nearby partners',
      });
    } else {
      toast.info('Location-based offers disabled');
    }
  };

  return (
    <div className="h-full overflow-y-auto pb-24 bg-[#000000]">
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
          Location Settings
        </h1>
      </motion.div>

      <div className="px-4 space-y-6">
        {/* Driver Warning - Always On Required */}
        {userRole === 'driver' && permissions.location !== 'always' && (
          <motion.div
            className="rounded-[24px] p-6 border-2 border-red-500/50 bg-gradient-to-br from-red-500/20 to-orange-500/10 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-red-500/40 to-orange-500/40 border-2 border-red-400/30">
                <AlertCircle className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Location Required for Valet Service
                </h3>
                <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                  "Always Allow" location is mandatory to accept jobs
                </p>
              </div>
            </div>

            <motion.button
              onClick={openSystemSettings}
              className="w-full rounded-[16px] px-5 py-3 border-2 border-red-500/50 bg-gradient-to-br from-red-500/30 to-orange-500/20 text-white"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <span className="text-[15px]" style={{ fontWeight: 600 }}>
                Enable in System Settings
              </span>
            </motion.button>

            <div className="mt-3 p-3 rounded-[12px] bg-white/5 border border-white/10">
              <p className="text-[11px] text-white/70 leading-relaxed" style={{ fontWeight: 400 }}>
                <span style={{ fontWeight: 600 }}>Why it's required:</span> Always-on location enables accurate distance/pay calculation, 
                ensures the safest service, and allows dispatch to find you for the next job, even when the app is closed.
              </p>
            </div>
          </motion.div>
        )}

        {/* A. Main Location Toggle (OS-Level Permission Status) */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.05 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30">
              <MapPin className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Primary Location Permission
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="flex-1">
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Current Status
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Managed in system settings
                </p>
              </div>
              <div className={`text-[15px] ${getLocationStatusColor()}`} style={{ fontWeight: 700 }}>
                {getLocationStatusText()}
              </div>
            </div>

            <div className="h-px bg-white/20" />

            <motion.button
              onClick={openSystemSettings}
              className="w-full rounded-[16px] px-5 py-3 flex items-center justify-between border-2 border-blue-500/50 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-white"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <span className="text-[15px]" style={{ fontWeight: 600 }}>
                View/Change in System Settings
              </span>
              <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
            </motion.button>

            <div className="p-3 rounded-[12px] bg-blue-500/10 border border-blue-400/30">
              <p className="text-[13px] text-blue-200" style={{ fontWeight: 500 }}>
                You must enable this for the app to function. Tap above to update location permissions in your device settings.
              </p>
            </div>
          </div>
        </motion.div>

        {/* B. Optional Enhanced Location Features */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-pink-500/40 border-2 border-purple-400/30">
              <Bluetooth className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Enhanced Features
            </h3>
          </div>
          
          <div className="space-y-4">
            {/* Enhanced Indoor Accuracy */}
            <div className="flex items-start justify-between py-2">
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                    Enhanced Indoor Accuracy
                  </p>
                  {userRole === 'driver' && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-[10px] text-purple-300" style={{ fontWeight: 600 }}>
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-white/60 leading-relaxed" style={{ fontWeight: 400 }}>
                  {userRole === 'driver' 
                    ? 'Uses Wi-Fi and Bluetooth signals for meter-level accuracy inside parking garages. Helps ensure precise car retrieval and handoff.'
                    : 'Uses Wi-Fi and Bluetooth signals to pinpoint your exact location inside multi-level garages for the Valet. (More accurate drop-off/retrieval).'
                  }
                </p>
                {(!permissions.bluetooth || !permissions.wifi) && (
                  <p className="text-[12px] text-orange-400 mt-1" style={{ fontWeight: 500 }}>
                    Requires: Bluetooth and WiFi permissions
                  </p>
                )}
              </div>
              <ToggleSwitch
                enabled={enhancedIndoorAccuracy}
                onToggle={handleEnhancedIndoorToggle}
                disabled={!permissions.bluetooth || !permissions.wifi}
              />
            </div>

            <div className="h-px bg-white/20" />

            {/* Background Location */}
            {userRole === 'parker' && (
              <>
                <div className="flex items-start justify-between py-2">
                  <div className="flex-1 pr-3">
                    <p className="text-[15px] text-white mb-1" style={{ fontWeight: 500 }}>
                      Background Location
                    </p>
                    <p className="text-[13px] text-white/60 leading-relaxed" style={{ fontWeight: 400 }}>
                      Allow Valet to track your car's return trip even when the app is closed. 
                      (Only needed for the final valet retrieval phase).
                    </p>
                    {permissions.location !== 'always' && (
                      <p className="text-[12px] text-orange-400 mt-1" style={{ fontWeight: 500 }}>
                        Requires: "Always Allow" location permission
                      </p>
                    )}
                  </div>
                  <ToggleSwitch
                    enabled={backgroundLocation}
                    onToggle={handleBackgroundLocationToggle}
                    disabled={permissions.location !== 'always'}
                  />
                </div>

                {backgroundLocation && (
                  <div className="p-3 rounded-[12px] bg-orange-500/10 border border-orange-400/30">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      <p className="text-[12px] text-orange-200 leading-relaxed" style={{ fontWeight: 500 }}>
                        This feature uses more battery. It's automatically enabled during active valet services 
                        and disabled when not in use.
                      </p>
                    </div>
                  </div>
                )}

                <div className="h-px bg-white/20" />
              </>
            )}

            {/* Location for Offers & Promotions */}
            {userRole === 'parker' && (
              <>
                <div className="flex items-start justify-between py-2">
                  <div className="flex-1 pr-3">
                    <p className="text-[15px] text-white mb-1" style={{ fontWeight: 500 }}>
                      Location for Offers & Promotions
                    </p>
                    <p className="text-[13px] text-white/60 leading-relaxed" style={{ fontWeight: 400 }}>
                      Use your general location to send special offers when you are near our partner venues.
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={locationForOffers}
                    onToggle={handleLocationForOffersToggle}
                  />
                </div>

                <div className="h-px bg-white/20" />

                {/* Venue Recommendations */}
                <div className="flex items-start justify-between py-2">
                  <div className="flex-1 pr-3">
                    <p className="text-[15px] text-white mb-1" style={{ fontWeight: 500 }}>
                      Venue Recommendations
                    </p>
                    <p className="text-[13px] text-white/60 leading-relaxed" style={{ fontWeight: 400 }}>
                      Show recommended restaurants, shops, and attractions based on your current location in the Insider tab.
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={venueRecommendations}
                    onToggle={handleVenueRecommendationsToggle}
                  />
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* C. Transparency and Privacy */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-green-400/30">
              <Eye className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Transparency & Privacy
            </h3>
          </div>
          
          <div className="space-y-4">
            {/* Active Job Tracking Status */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                  Active Job Tracking
                </p>
                <div className="flex items-center gap-2">
                  {activeJobTracking ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[13px] text-green-400" style={{ fontWeight: 600 }}>
                        ON
                      </span>
                    </>
                  ) : (
                    <span className="text-[13px] text-white/60" style={{ fontWeight: 600 }}>
                      OFF
                    </span>
                  )}
                </div>
              </div>
              
              {activeJobTracking ? (
                <div className="p-3 rounded-[12px] bg-green-500/10 border border-green-400/30">
                  <div className="flex items-start gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                    <p className="text-[13px] text-green-200" style={{ fontWeight: 600 }}>
                      Tracking is ON
                    </p>
                  </div>
                  <p className="text-[12px] text-green-200/80 leading-relaxed" style={{ fontWeight: 400 }}>
                    Location is actively being used to {userRole === 'driver' ? 'track your current job, calculate earnings, and ensure service quality' : 'guide the Valet and track the vehicle'}.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-[12px] bg-white/5 border border-white/10">
                  <div className="flex items-start gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                    <p className="text-[13px] text-white/60" style={{ fontWeight: 600 }}>
                      Tracking is OFF
                    </p>
                  </div>
                  <p className="text-[12px] text-white/60 leading-relaxed" style={{ fontWeight: 400 }}>
                    {userRole === 'driver' 
                      ? 'No active jobs. Your location is not being tracked by the platform.'
                      : 'Your location is not being tracked by the Valet service.'
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="h-px bg-white/20" />

            {/* Privacy Policy Link */}
            <motion.button
              onClick={() => {
                toast.info('Opening Privacy Policy...');
                // In real app, open privacy policy
              }}
              className="w-full rounded-[16px] px-5 py-3 flex items-center justify-between border-2 border-white/20 bg-[#2C2C2E]/60 backdrop-blur-xl text-white"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-white/60" strokeWidth={2.5} />
                <span className="text-[15px]" style={{ fontWeight: 500 }}>
                  Privacy Policy
                </span>
              </div>
              <ExternalLink className="w-4 h-4 text-white/40" strokeWidth={2.5} />
            </motion.button>

            <div className="p-3 rounded-[12px] bg-white/5 border border-white/10">
              <p className="text-[11px] text-white/70 leading-relaxed" style={{ fontWeight: 400 }}>
                Read how your location data is used, stored, and protected. Your privacy matters to us.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Information Card */}
        <motion.div
          className="rounded-[20px] p-5 border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-500/40 to-blue-500/40 border border-cyan-400/30 flex-shrink-0">
              <Shield className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h4 className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Your Privacy is Protected
              </h4>
              <p className="text-[13px] text-white/80 leading-relaxed" style={{ fontWeight: 400 }}>
                All location data is encrypted end-to-end and never shared with third parties. 
                {userRole === 'driver' 
                  ? ' Location tracking is only active during jobs and for platform safety/quality assurance.'
                  : ' You have complete control over when and how your location is used.'
                }
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
