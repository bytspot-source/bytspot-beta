import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Bluetooth, Wifi, Navigation, Clock, AlertCircle, CheckCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useGeofencing, type GeofenceZone, type GeofenceEvent } from '../utils/geofencing';
import { toast } from 'sonner@2.0.3';

interface GeofenceMonitorProps {
  isDarkMode: boolean;
  compact?: boolean;
}

export function GeofenceMonitor({ isDarkMode, compact = false }: GeofenceMonitorProps) {
  const { activeZones, recentEvents, service } = useGeofencing(true);
  const [showDetails, setShowDetails] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const getZoneTypeColor = (type: string) => {
    switch (type) {
      case 'parking':
        return 'from-blue-500 to-cyan-500';
      case 'valet':
        return 'from-purple-500 to-pink-500';
      case 'saved':
        return 'from-green-500 to-emerald-500';
      case 'venue':
        return 'from-orange-500 to-red-500';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getZoneTypeIcon = (type: string) => {
    switch (type) {
      case 'parking':
        return <MapPin className="w-4 h-4" strokeWidth={2.5} />;
      case 'valet':
        return <Navigation className="w-4 h-4" strokeWidth={2.5} />;
      default:
        return <MapPin className="w-4 h-4" strokeWidth={2.5} />;
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  if (compact) {
    if (activeZones.length === 0) return null;

    return (
      <motion.button
        onClick={() => setShowDetails(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-green-500/30 to-emerald-500/30 border-2 border-green-400/50"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.95 }}
        transition={springConfig}
      >
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
          {activeZones.length} Active Zone{activeZones.length !== 1 ? 's' : ''}
        </span>
      </motion.button>
    );
  }

  return (
    <>
      {/* Active Zones Display */}
      <AnimatePresence>
        {activeZones.length > 0 && (
          <motion.div
            className="rounded-[20px] p-4 border-2 border-green-400/50 bg-gradient-to-br from-green-500/20 to-emerald-500/10 backdrop-blur-xl shadow-xl mb-4"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/40 border-2 border-green-400/50">
                  <CheckCircle className="w-4 h-4 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Active Geofences
                  </h3>
                  <p className="text-[11px] text-green-200" style={{ fontWeight: 500 }}>
                    {activeZones.length} zone{activeZones.length !== 1 ? 's' : ''} detected
                  </p>
                </div>
              </div>
              <motion.button
                onClick={() => setShowDetails(!showDetails)}
                className="tap-target px-3 py-1.5 rounded-full bg-white/10 border border-white/20"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
                  {showDetails ? 'Hide' : 'Details'}
                </span>
              </motion.button>
            </div>

            <div className="space-y-2">
              {activeZones.map((zone, index) => (
                <motion.div
                  key={zone.id}
                  className={`p-3 rounded-[12px] bg-gradient-to-r ${getZoneTypeColor(zone.type)} bg-opacity-10 border border-white/20`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springConfig, delay: index * 0.05 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br ${getZoneTypeColor(zone.type)} border border-white/30`}>
                        {getZoneTypeIcon(zone.type)}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                          {zone.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-white/70">
                          <span className="capitalize">{zone.type}</span>
                          {zone.metadata?.spotNumber && (
                            <>
                              <span>•</span>
                              <span>Spot {zone.metadata.spotNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {zone.bluetooth && (
                        <div className="p-1 rounded bg-blue-500/20">
                          <Bluetooth className="w-3 h-3 text-blue-400" strokeWidth={2.5} />
                        </div>
                      )}
                      {zone.wifi && (
                        <div className="p-1 rounded bg-purple-500/20">
                          <Wifi className="w-3 h-3 text-purple-400" strokeWidth={2.5} />
                        </div>
                      )}
                      {zone.location && (
                        <div className="p-1 rounded bg-cyan-500/20">
                          <Navigation className="w-3 h-3 text-cyan-400" strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Events (when showing details) */}
      <AnimatePresence>
        {showDetails && recentEvents.length > 0 && (
          <motion.div
            className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl mb-4"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-white/80" strokeWidth={2.5} />
              <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Recent Activity
              </h3>
            </div>

            <div className="space-y-2">
              {recentEvents.slice(0, 5).map((event, index) => (
                <motion.div
                  key={`${event.zoneId}-${event.timestamp.getTime()}`}
                  className="flex items-center justify-between p-2 rounded-[8px] bg-white/5"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springConfig, delay: index * 0.03 }}
                >
                  <div className="flex items-center gap-2 flex-1">
                    {event.type === 'enter' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" strokeWidth={2.5} />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" strokeWidth={2.5} />
                    )}
                    <div className="flex-1">
                      <p className="text-[12px] text-white" style={{ fontWeight: 500 }}>
                        {event.type === 'enter' ? 'Entered' : 'Exited'} {event.zoneName}
                      </p>
                      <p className="text-[10px] text-white/60" style={{ fontWeight: 400 }}>
                        {formatTimestamp(event.timestamp)} • {event.method.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-white/50" style={{ fontWeight: 500 }}>
                    ±{event.accuracy}m
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Active Zones Message */}
      {!compact && activeZones.length === 0 && (
        <motion.div
          className="rounded-[20px] p-4 border-2 border-white/20 bg-[#1C1C1E]/60 backdrop-blur-xl shadow-xl mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={springConfig}
        >
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
              <MapPin className="w-6 h-6 text-white/40" strokeWidth={2.5} />
            </div>
            <p className="text-[13px] text-white/60 mb-1" style={{ fontWeight: 500 }}>
              No active geofences
            </p>
            <p className="text-[11px] text-white/40" style={{ fontWeight: 400 }}>
              Move near a saved location or parking zone
            </p>
          </div>
        </motion.div>
      )}
    </>
  );
}

// Standalone notification component for geofence events
export function GeofenceEventToast({ event }: { event: GeofenceEvent }) {
  const getIcon = () => {
    if (event.type === 'enter') {
      return <CheckCircle className="w-5 h-5 text-green-400" strokeWidth={2.5} />;
    }
    return <AlertCircle className="w-5 h-5 text-orange-400" strokeWidth={2.5} />;
  };

  return (
    <div className="flex items-center gap-3">
      {getIcon()}
      <div className="flex-1">
        <p className="text-[15px] mb-0.5" style={{ fontWeight: 600 }}>
          {event.type === 'enter' ? 'Arrived at' : 'Left'} {event.zoneName}
        </p>
        <p className="text-[13px] opacity-80" style={{ fontWeight: 400 }}>
          {event.method.toUpperCase()} positioning • ±{event.accuracy}m accuracy
        </p>
      </div>
    </div>
  );
}

// Hook up geofence events to toast notifications
export function useGeofenceNotifications() {
  const { recentEvents } = useGeofencing(true);

  // Show toast for new events
  useState(() => {
    if (recentEvents.length > 0) {
      const latestEvent = recentEvents[0];
      
      if (latestEvent.type === 'enter') {
        toast.success(`Arrived at ${latestEvent.zoneName}`, {
          description: `${latestEvent.method.toUpperCase()} • ±${latestEvent.accuracy}m`,
          duration: 4000,
        });
      } else {
        toast.info(`Left ${latestEvent.zoneName}`, {
          description: `${latestEvent.method.toUpperCase()} • ±${latestEvent.accuracy}m`,
          duration: 4000,
        });
      }
    }
  });
}
