import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Bluetooth, Shield, CheckCircle, XCircle, Navigation2, Clock, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';

type PermissionType = 'location' | 'bluetooth' | 'complete';
type LocationPermissionLevel = 'always' | 'whenInUse' | 'denied';
type UserRole = 'parker' | 'driver';

interface LocationPermissions {
  location: LocationPermissionLevel | null;
  bluetooth: boolean | null;
  wifi: boolean | null; // Auto-granted, no prompt needed
}

interface LocationPermissionFlowProps {
  isDarkMode: boolean;
  onComplete: (permissions: LocationPermissions) => void;
  autoStart?: boolean;
  userRole?: UserRole; // 'parker' for customers, 'driver' for valet contractors
}

export function LocationPermissionFlow({ 
  isDarkMode, 
  onComplete, 
  autoStart = true,
  userRole = 'parker' // Default to parker (customer)
}: LocationPermissionFlowProps) {
  const [currentStep, setCurrentStep] = useState<PermissionType | null>(autoStart ? 'location' : null);
  const [permissions, setPermissions] = useState<LocationPermissions>({
    location: null,
    bluetooth: null,
    wifi: null,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Save permissions to localStorage
  const savePermissions = (perms: LocationPermissions) => {
    localStorage.setItem('bytspot_location_permissions', JSON.stringify(perms));
  };

  // Load existing permissions
  useEffect(() => {
    const stored = localStorage.getItem('bytspot_location_permissions');
    if (stored) {
      const parsed = JSON.parse(stored);
      setPermissions(parsed);
    }
  }, []);

  const handleLocationPermission = async (level: LocationPermissionLevel) => {
    const newPermissions = { ...permissions, location: level };
    setPermissions(newPermissions);
    savePermissions(newPermissions);

    if (level === 'denied') {
      toast.error('Location access denied', {
        description: 'Some features may be limited',
      });
      // Skip to complete for parkers, but drivers need location
      if (userRole === 'parker') {
        setCurrentStep('complete');
        onComplete(newPermissions);
      } else {
        // Drivers must grant location
        toast.error('Valet drivers require location access', {
          description: 'Location is mandatory for active jobs',
          duration: 5000,
        });
      }
    } else {
      toast.success(`Location access: ${level === 'always' ? 'Always' : 'While using app'}`, {
        description: 'Enhanced positioning enabled',
      });

      // Request actual browser geolocation permission
      if ('geolocation' in navigator) {
        try {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(),
              () => reject(),
              { enableHighAccuracy: true }
            );
          });
        } catch (error) {
          // Browser denied permission
        }
      }

      // For parkers, bluetooth/wifi are optional enhancements
      // For drivers, they're recommended for accuracy
      setTimeout(() => {
        setCurrentStep('bluetooth');
      }, 800);
    }
  };

  const handleBluetoothPermission = async (granted: boolean) => {
    // Auto-grant WiFi scanning (no prompt needed)
    const newPermissions = { ...permissions, bluetooth: granted, wifi: true };
    setPermissions(newPermissions);
    savePermissions(newPermissions);

    if (granted) {
      toast.success('Bluetooth access granted', {
        description: 'Enhanced indoor positioning enabled',
      });
    } else {
      toast.info('Bluetooth access denied', {
        description: 'Indoor positioning may be limited',
      });
    }

    // Complete flow (skip WiFi prompt)
    setTimeout(() => {
      setCurrentStep('complete');
      onComplete(newPermissions);
    }, 800);
  };

  // WiFi permission removed - auto-granted without prompt

  if (!currentStep || currentStep === 'complete') {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {/* LOCATION PERMISSION SCREEN */}
      {currentStep === 'location' && (
        <motion.div
          key="location"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

          {/* Permission Dialog */}
          <motion.div
            className="relative max-w-[320px] w-full rounded-[20px] overflow-hidden border-2 border-white/30 bg-[#1C1C1E]/95 backdrop-blur-xl shadow-2xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={springConfig}
          >
            {/* Content */}
            <div className="p-5">
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30">
                  <MapPin className="w-7 h-7 text-white" strokeWidth={2.5} />
                </div>
                <h2 className="text-[19px] mb-2 text-white" style={{ fontWeight: 700 }}>
                  Allow "Bytspot" to use your location?
                </h2>
                <p className="text-[13px] text-white/80 leading-snug mb-3" style={{ fontWeight: 400 }}>
                  {userRole === 'driver'
                    ? 'Required to track jobs, calculate earnings, and match you with nearby requests.'
                    : 'Track your valet\'s arrival in real-time and get accurate pick-up locations.'
                  }
                </p>

                {/* Benefits */}
                <div className="space-y-2 text-left mb-4">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500/30 to-emerald-500/30 border border-green-400/30 flex-shrink-0">
                      <Navigation2 className="w-3 h-3 text-green-400" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] text-white mb-0" style={{ fontWeight: 600 }}>
                        Pinpoint Accuracy
                      </p>
                      <p className="text-[11px] text-white/70" style={{ fontWeight: 400 }}>
                        Find your exact spot in crowded areas
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-blue-400/30 flex-shrink-0">
                      <Clock className="w-3 h-3 text-blue-400" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] text-white mb-0" style={{ fontWeight: 600 }}>
                        Real-Time Tracking
                      </p>
                      <p className="text-[11px] text-white/70" style={{ fontWeight: 400 }}>
                        See your valet moving to you
                      </p>
                    </div>
                  </div>

                  {userRole === 'parker' && (
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/30 flex-shrink-0">
                        <Sparkles className="w-3 h-3 text-purple-400" strokeWidth={2.5} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] text-white mb-0" style={{ fontWeight: 600 }}>
                          Smart Suggestions
                        </p>
                        <p className="text-[11px] text-white/70" style={{ fontWeight: 400 }}>
                          Personalized parking recommendations
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Permission Options */}
              <div className="space-y-2.5">
                {userRole === 'driver' && (
                  <motion.button
                    onClick={() => handleLocationPermission('always')}
                    className="w-full rounded-[14px] px-4 py-3.5 border-2 border-blue-500/50 bg-gradient-to-br from-blue-500/30 to-cyan-500/20 backdrop-blur-xl text-white text-left"
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle className="w-4.5 h-4.5 text-blue-400 flex-shrink-0" strokeWidth={2.5} />
                      <div className="flex-1">
                        <p className="text-[15px] mb-0" style={{ fontWeight: 600 }}>
                          Always Allow (Required)
                        </p>
                        <p className="text-[12px] text-white/70" style={{ fontWeight: 400 }}>
                          Mandatory for valet drivers
                        </p>
                      </div>
                    </div>
                  </motion.button>
                )}

                {userRole === 'parker' && (
                  <>
                    <motion.button
                      onClick={() => handleLocationPermission('always')}
                      className="w-full rounded-[14px] px-4 py-3.5 border-2 border-blue-500/50 bg-gradient-to-br from-blue-500/30 to-cyan-500/20 backdrop-blur-xl text-white text-left"
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle className="w-4.5 h-4.5 text-blue-400 flex-shrink-0" strokeWidth={2.5} />
                        <div className="flex-1">
                          <p className="text-[15px] mb-0" style={{ fontWeight: 600 }}>
                            Always Allow
                          </p>
                          <p className="text-[12px] text-white/70" style={{ fontWeight: 400 }}> 
                            Best experience with geofencing
                          </p>
                        </div>
                      </div>
                    </motion.button>

                    <motion.button
                      onClick={() => handleLocationPermission('whenInUse')}
                      className="w-full rounded-[14px] px-4 py-3.5 border-2 border-white/30 bg-[#2C2C2E]/80 backdrop-blur-xl text-white text-left"
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle className="w-4.5 h-4.5 text-white/60 flex-shrink-0" strokeWidth={2.5} />
                        <div className="flex-1">
                          <p className="text-[15px] mb-0" style={{ fontWeight: 600 }}>
                            Allow While Using App
                          </p>
                          <p className="text-[12px] text-white/70" style={{ fontWeight: 400 }}>
                            Only when app is open
                          </p>
                        </div>
                      </div>
                    </motion.button>

                    <motion.button
                      onClick={() => handleLocationPermission('denied')}
                      className="w-full rounded-[14px] px-4 py-3 border-2 border-white/20 bg-[#2C2C2E]/60 backdrop-blur-xl text-white text-left"
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <div className="flex items-center gap-2.5">
                        <XCircle className="w-4.5 h-4.5 text-white/40 flex-shrink-0" strokeWidth={2.5} />
                        <div className="flex-1">
                          <p className="text-[15px] mb-0 text-white/80" style={{ fontWeight: 600 }}>
                            Don't Allow
                          </p>
                          <p className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>
                            Limited functionality
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  </>
                )}
              </div>

              {/* Privacy Note */}
              <div className="mt-3 p-2.5 rounded-[10px] bg-white/5 border border-white/10">
                <div className="flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 text-white/60 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[10px] text-white/60 leading-snug" style={{ fontWeight: 400 }}>
                    Encrypted and never shared with third parties. 
                    Used for {userRole === 'driver' ? 'job matching and service delivery' : 'parking and navigation services'}.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* BLUETOOTH PERMISSION */}
      {currentStep === 'bluetooth' && (
        <motion.div
          key="bluetooth"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

          {/* Permission Dialog */}
          <motion.div
            className="relative max-w-[320px] w-full rounded-[20px] overflow-hidden border-2 border-white/30 bg-[#1C1C1E]/95 backdrop-blur-xl shadow-2xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={springConfig}
          >
            {/* Content */}
            <div className="p-5">
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-indigo-500/40 border-2 border-blue-400/30">
                  <Bluetooth className="w-7 h-7 text-white" strokeWidth={2.5} />
                </div>
                <h2 className="text-[19px] mb-2 text-white" style={{ fontWeight: 700 }}>
                  {userRole === 'driver' ? 'Enable Bluetooth?' : 'Allow "Bytspot" to find Bluetooth devices?'}
                </h2>
                <p className="text-[13px] text-white/80 leading-snug mb-3" style={{ fontWeight: 400 }}>
                  {userRole === 'driver'
                    ? 'Pinpoints your location inside parking garages for precise car retrieval.'
                    : 'Uses Wi-Fi and Bluetooth for precise location inside multi-level garages.'
                  }
                </p>
                <div className="p-2.5 rounded-[10px] bg-blue-500/10 border border-blue-400/30">
                  <p className="text-[11px] text-blue-200" style={{ fontWeight: 500 }}>
                    <span style={{ fontWeight: 700 }}>How BLE works:</span> We scan for iBeacons to provide accurate indoor location within parking garages.
                  </p>
                </div>
              </div>

              {/* Permission Options */}
              <div className="space-y-2.5">
                <motion.button
                  onClick={() => handleBluetoothPermission(true)}
                  className="w-full rounded-[14px] px-4 py-3.5 border-2 border-blue-500/50 bg-gradient-to-br from-blue-500/30 to-indigo-500/20 backdrop-blur-xl text-white"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4.5 h-4.5 text-blue-400" strokeWidth={2.5} />
                    <span className="text-[15px]" style={{ fontWeight: 600 }}>
                      {userRole === 'driver' ? 'Enable (Recommended)' : 'Allow'}
                    </span>
                  </div>
                </motion.button>

                <motion.button
                  onClick={() => handleBluetoothPermission(false)}
                  className="w-full rounded-[14px] px-4 py-3 border-2 border-white/20 bg-[#2C2C2E]/60 backdrop-blur-xl text-white"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="flex items-center justify-center gap-2">
                    <XCircle className="w-4.5 h-4.5 text-white/40" strokeWidth={2.5} />
                    <span className="text-[15px] text-white/80" style={{ fontWeight: 600 }}>
                      {userRole === 'driver' ? 'Skip' : 'Don\'t Allow'}
                    </span>
                  </div>
                </motion.button>
              </div>

              {/* Privacy Note */}
              <div className="mt-3 p-2.5 rounded-[10px] bg-white/5 border border-white/10">
                <div className="flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 text-white/60 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[10px] text-white/60 leading-snug" style={{ fontWeight: 400 }}>
                    Provides meter-level accuracy in parking garages. No personal data transmitted to beacons.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}


    </AnimatePresence>
  );
}

// Hook to check if permissions are granted
export function useLocationPermissions() {
  const [permissions, setPermissions] = useState<LocationPermissions>({
    location: null,
    bluetooth: null,
    wifi: null,
  });

  useEffect(() => {
    const stored = localStorage.getItem('bytspot_location_permissions');
    if (stored) {
      setPermissions(JSON.parse(stored));
    }
  }, []);

  const hasAllPermissions = () => {
    return permissions.location !== null && 
           permissions.location !== 'denied' &&
           permissions.bluetooth !== null &&
           permissions.wifi !== null;
  };

  const needsPermissions = () => {
    return !hasAllPermissions();
  };

  return {
    permissions,
    hasAllPermissions,
    needsPermissions,
  };
}
