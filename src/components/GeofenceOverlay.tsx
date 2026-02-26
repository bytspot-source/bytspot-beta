import { motion } from 'motion/react';
import { MapPin, Radio, Wifi } from 'lucide-react';
import { useGeofencing } from '../utils/geofencing';

interface GeofenceOverlayProps {
  isDarkMode: boolean;
  showLabels?: boolean;
}

export function GeofenceOverlay({ isDarkMode, showLabels = true }: GeofenceOverlayProps) {
  const { activeZones, service } = useGeofencing(false);
  const allZones = service.getAllZones();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Calculate position on map (simplified - in real app would use actual map projection)
  const calculateMapPosition = (lat: number, lng: number) => {
    // Mock positioning for demonstration
    // In real implementation, would convert lat/lng to screen coordinates
    return {
      x: 50 + Math.random() * 200,
      y: 100 + Math.random() * 300,
    };
  };

  const getZoneColor = (type: string, isActive: boolean) => {
    const baseColors: Record<string, string> = {
      parking: isActive ? 'rgb(6, 182, 212)' : 'rgb(34, 211, 238)',
      valet: isActive ? 'rgb(168, 85, 247)' : 'rgb(192, 132, 252)',
      saved: isActive ? 'rgb(34, 197, 94)' : 'rgb(74, 222, 128)',
      venue: isActive ? 'rgb(249, 115, 22)' : 'rgb(251, 146, 60)',
      custom: isActive ? 'rgb(156, 163, 175)' : 'rgb(209, 213, 219)',
    };
    return baseColors[type] || baseColors.custom;
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {allZones.map((zone) => {
        if (!zone.location) return null;
        
        const isActive = activeZones.some(z => z.id === zone.id);
        const pos = calculateMapPosition(zone.location.latitude, zone.location.longitude);
        const color = getZoneColor(zone.type, isActive);
        const radius = zone.location.radiusMeters / 2; // Scale for visualization

        return (
          <motion.div
            key={zone.id}
            className="absolute"
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={springConfig}
          >
            {/* Geofence Circle */}
            <motion.div
              className="absolute"
              style={{
                width: radius,
                height: radius,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `2px solid ${color}`,
                backgroundColor: `${color}20`,
              }}
              animate={{
                scale: isActive ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 2,
                repeat: isActive ? Infinity : 0,
                ease: "easeInOut",
              }}
            />

            {/* Pulsing Ring for Active Zones */}
            {isActive && (
              <motion.div
                className="absolute"
                style={{
                  width: radius,
                  height: radius,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                }}
                initial={{ scale: 1, opacity: 1 }}
                animate={{
                  scale: [1, 1.5, 1.5],
                  opacity: [1, 0.3, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            )}

            {/* Center Pin */}
            <div
              className="absolute w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg"
              style={{
                transform: 'translate(-50%, -50%)',
                backgroundColor: color,
                borderColor: 'white',
              }}
            >
              <MapPin className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>

            {/* Zone Label */}
            {showLabels && (
              <div
                className="absolute top-full mt-2 px-3 py-1.5 rounded-full border-2 shadow-lg whitespace-nowrap"
                style={{
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(28, 28, 30, 0.95)',
                  backdropFilter: 'blur(20px)',
                  borderColor: color,
                }}
              >
                <div className="flex items-center gap-1.5">
                  {zone.bluetooth && (
                    <Radio className="w-3 h-3 text-blue-400" strokeWidth={2.5} />
                  )}
                  {zone.wifi && (
                    <Wifi className="w-3 h-3 text-purple-400" strokeWidth={2.5} />
                  )}
                  <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
                    {zone.name}
                  </span>
                </div>
              </div>
            )}

            {/* Active Indicator */}
            {isActive && (
              <div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 animate-pulse"
                style={{
                  backgroundColor: color,
                  borderColor: 'white',
                }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
