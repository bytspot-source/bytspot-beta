import { motion } from 'motion/react';
import { 
  Activity, 
  MapPin, 
  Wifi, 
  Bluetooth, 
  Navigation,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Zap,
  Play,
  Pause,
  RotateCcw,
  Download,
  Search,
  Filter
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { 
  generateMockTrip, 
  generateMockSystemHealth, 
  generateMockRecentEvents,
  mockActiveTrips,
  type TripData,
  type SystemHealth,
  type GeofenceEvent,
  type FusionDataPoint
} from '../../../utils/fusionEngineMockData';

interface DashboardFusionEngineProps {
  isDarkMode: boolean;
}

type ViewMode = 'overview' | 'trip-replay' | 'live-monitor' | 'events';

export function DashboardFusionEngine({ isDarkMode }: DashboardFusionEngineProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [systemHealth, setSystemHealth] = useState<SystemHealth>(generateMockSystemHealth());
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [recentEvents, setRecentEvents] = useState<GeofenceEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Update system health periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemHealth(generateMockSystemHealth());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load recent events
  useEffect(() => {
    setRecentEvents(generateMockRecentEvents());
  }, []);

  // Trip playback
  useEffect(() => {
    if (isPlaying && selectedTrip && playbackIndex < selectedTrip.waypoints.length - 1) {
      const timeout = setTimeout(() => {
        setPlaybackIndex(playbackIndex + 1);
      }, 500);
      return () => clearTimeout(timeout);
    } else if (isPlaying && selectedTrip && playbackIndex >= selectedTrip.waypoints.length - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, playbackIndex, selectedTrip]);

  const handleLoadTrip = () => {
    const trip = generateMockTrip();
    setSelectedTrip(trip);
    setPlaybackIndex(0);
    setViewMode('trip-replay');
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy < 5) return 'text-green-400';
    if (accuracy < 12) return 'text-blue-400';
    if (accuracy < 25) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'very-high': return 'text-green-400';
      case 'high': return 'text-blue-400';
      case 'medium': return 'text-yellow-400';
      default: return 'text-red-400';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-[#000000] pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-title-1 text-white mb-1">
              Fusion Engine Diagnostics
            </h1>
            <p className="text-[15px] text-white/70">
              Real-time sensor fusion monitoring & trip replay
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-full ${
            systemHealth.fusionEngineStatus === 'healthy' 
              ? 'bg-green-500/20 border border-green-400/30' 
              : 'bg-yellow-500/20 border border-yellow-400/30'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                systemHealth.fusionEngineStatus === 'healthy' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
              }`} />
              <span className={`text-[13px] ${
                systemHealth.fusionEngineStatus === 'healthy' ? 'text-green-300' : 'text-yellow-300'
              }`} style={{ fontWeight: 600 }}>
                {systemHealth.fusionEngineStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { id: 'overview', label: 'System Overview', icon: Activity },
            { id: 'trip-replay', label: 'Trip Replay', icon: Play },
            { id: 'live-monitor', label: 'Live Monitor', icon: MapPin },
            { id: 'events', label: 'Event Log', icon: AlertCircle },
          ].map((mode) => (
            <motion.button
              key={mode.id}
              onClick={() => setViewMode(mode.id as ViewMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 whitespace-nowrap ${
                viewMode === mode.id
                  ? 'bg-purple-500/30 border-purple-400/50'
                  : 'bg-white/5 border-white/20'
              }`}
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
            >
              <mode.icon className="w-4 h-4 text-white" strokeWidth={2.5} />
              <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                {mode.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* System Overview */}
      {viewMode === 'overview' && (
        <div className="px-4 py-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              className="rounded-[20px] p-4 border-2 border-white/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springConfig}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
                <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  Active Users
                </span>
              </div>
              <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                {systemHealth.activeUsers}
              </div>
            </motion.div>

            <motion.div
              className="rounded-[20px] p-4 border-2 border-white/20 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.05 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Navigation className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
                <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  Active Trips
                </span>
              </div>
              <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                {systemHealth.activeTrips}
              </div>
            </motion.div>

            <motion.div
              className="rounded-[20px] p-4 border-2 border-white/20 bg-gradient-to-br from-green-500/10 to-emerald-500/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  Avg Accuracy
                </span>
              </div>
              <div className="text-[28px] text-green-400" style={{ fontWeight: 700 }}>
                ±{systemHealth.averageAccuracy.toFixed(1)}m
              </div>
            </motion.div>

            <motion.div
              className="rounded-[20px] p-4 border-2 border-white/20 bg-gradient-to-br from-orange-500/10 to-red-500/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.15 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
                <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  Latency
                </span>
              </div>
              <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                {systemHealth.processingLatency}ms
              </div>
            </motion.div>
          </div>

          {/* Sensor Availability */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.2 }}
          >
            <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
              Sensor Availability
            </h3>
            
            <div className="space-y-4">
              {Object.entries(systemHealth.sensorAvailability).map(([sensor, percentage], index) => {
                const icons = {
                  gps: Navigation,
                  wifi: Wifi,
                  ble: Bluetooth,
                  imu: Activity,
                };
                const Icon = icons[sensor as keyof typeof icons];
                const color = percentage > 90 ? 'green' : percentage > 75 ? 'yellow' : 'red';
                
                return (
                  <div key={sensor}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-white/60" strokeWidth={2.5} />
                        <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                          {sensor.toUpperCase()}
                        </span>
                      </div>
                      <span className={`text-[15px] text-${color}-400`} style={{ fontWeight: 700 }}>
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r from-${color}-500 to-${color}-400`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, delay: 0.3 + index * 0.1 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Active Trips Preview */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                Active Trips
              </h3>
              <motion.button
                onClick={handleLoadTrip}
                className="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/30"
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-[13px] text-purple-300" style={{ fontWeight: 600 }}>
                  Load Sample
                </span>
              </motion.button>
            </div>
            
            <div className="space-y-3">
              {mockActiveTrips.map((trip, index) => (
                <motion.button
                  key={trip.id}
                  onClick={handleLoadTrip}
                  className="w-full rounded-[16px] p-4 border border-white/20 bg-white/5 text-left"
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springConfig, delay: 0.3 + index * 0.05 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {trip.userId}
                    </span>
                    <span className={`text-[13px] ${getConfidenceColor(trip.averageConfidence || 'medium')}`} style={{ fontWeight: 600 }}>
                      {trip.averageConfidence?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-white/60">
                    <span>{formatDuration(Date.now() - (trip.startTime || 0))}</span>
                    <span>•</span>
                    <span>{trip.totalDistance} mi</span>
                    <span>•</span>
                    <span className={getAccuracyColor(trip.averageAccuracy || 0)}>
                      ±{trip.averageAccuracy?.toFixed(1)}m
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Trip Replay */}
      {viewMode === 'trip-replay' && selectedTrip && (
        <div className="px-4 py-6 space-y-6">
          {/* Playback Controls */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-purple-400/30 bg-gradient-to-br from-purple-500/20 to-fuchsia-500/10 backdrop-blur-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Trip Replay
                </h3>
                <p className="text-[13px] text-white/70">
                  {selectedTrip.id} • {selectedTrip.userRole}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center"
                  whileTap={{ scale: 0.9 }}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-white" strokeWidth={2.5} />
                  ) : (
                    <Play className="w-5 h-5 text-white ml-0.5" strokeWidth={2.5} />
                  )}
                </motion.button>
                <motion.button
                  onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                  whileTap={{ scale: 0.9 }}
                >
                  <RotateCcw className="w-5 h-5 text-white" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
                  animate={{ width: `${(playbackIndex / (selectedTrip.waypoints.length - 1)) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[11px] text-white/60">
                <span>{formatTimestamp(selectedTrip.waypoints[playbackIndex]?.timestamp || 0)}</span>
                <span>{playbackIndex + 1} / {selectedTrip.waypoints.length}</span>
              </div>
            </div>

            {/* Current Waypoint Stats */}
            {selectedTrip.waypoints[playbackIndex] && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[12px] p-3 bg-white/10">
                  <div className="text-[11px] text-white/60 mb-1" style={{ fontWeight: 500 }}>
                    Fused Accuracy
                  </div>
                  <div className={`text-[20px] ${getAccuracyColor(selectedTrip.waypoints[playbackIndex].fusedAccuracy)}`} style={{ fontWeight: 700 }}>
                    ±{selectedTrip.waypoints[playbackIndex].fusedAccuracy.toFixed(1)}m
                  </div>
                </div>
                <div className="rounded-[12px] p-3 bg-white/10">
                  <div className="text-[11px] text-white/60 mb-1" style={{ fontWeight: 500 }}>
                    Confidence
                  </div>
                  <div className={`text-[15px] ${getConfidenceColor(selectedTrip.waypoints[playbackIndex].confidence)}`} style={{ fontWeight: 700 }}>
                    {selectedTrip.waypoints[playbackIndex].confidence.toUpperCase()}
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Sensor Fusion Breakdown */}
          {selectedTrip.waypoints[playbackIndex] && (
            <motion.div
              className="rounded-[24px] p-6 border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 }}
            >
              <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
                Sensor Sources
              </h3>
              
              <div className="space-y-4">
                {/* GPS */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>GPS</span>
                    </div>
                    <span className={getAccuracyColor(selectedTrip.waypoints[playbackIndex].sources.gps.accuracy)}>
                      ±{selectedTrip.waypoints[playbackIndex].sources.gps.accuracy.toFixed(1)}m
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${selectedTrip.waypoints[playbackIndex].sources.gps.weight * 100}%` }}
                    />
                  </div>
                </div>

                {/* WiFi */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>WiFi</span>
                      <span className="text-[11px] text-white/60">
                        ({selectedTrip.waypoints[playbackIndex].sources.wifi.networks} networks)
                      </span>
                    </div>
                    <span className={getAccuracyColor(selectedTrip.waypoints[playbackIndex].sources.wifi.accuracy)}>
                      ±{selectedTrip.waypoints[playbackIndex].sources.wifi.accuracy.toFixed(1)}m
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-purple-500"
                      style={{ width: `${selectedTrip.waypoints[playbackIndex].sources.wifi.weight * 100}%` }}
                    />
                  </div>
                </div>

                {/* BLE */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bluetooth className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>BLE</span>
                      <span className="text-[11px] text-white/60">
                        ({selectedTrip.waypoints[playbackIndex].sources.ble.beacons} beacons)
                      </span>
                    </div>
                    <span className={getAccuracyColor(selectedTrip.waypoints[playbackIndex].sources.ble.accuracy)}>
                      ±{selectedTrip.waypoints[playbackIndex].sources.ble.accuracy.toFixed(1)}m
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${selectedTrip.waypoints[playbackIndex].sources.ble.weight * 100}%` }}
                    />
                  </div>
                </div>

                {/* IMU */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>IMU</span>
                    </div>
                    <span className="text-orange-400">
                      {(selectedTrip.waypoints[playbackIndex].sources.imu.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${selectedTrip.waypoints[playbackIndex].sources.imu.weight * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Geofence Events in Trip */}
          {selectedTrip.geofenceEvents.length > 0 && (
            <motion.div
              className="rounded-[24px] p-6 border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.15 }}
            >
              <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
                Geofence Events
              </h3>
              
              <div className="space-y-3">
                {selectedTrip.geofenceEvents.map((event) => (
                  <div key={event.id} className="rounded-[12px] p-3 bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {event.type === 'enter' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
                        )}
                        <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                          {event.type === 'enter' ? 'Entered' : 'Exited'}
                        </span>
                      </div>
                      <span className="text-[11px] text-white/60">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <div className="text-[13px] text-white/80 mb-1">
                      {event.zoneName}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-white/60">
                      <span>{event.method.toUpperCase()}</span>
                      <span>•</span>
                      <span>±{event.accuracy.toFixed(1)}m</span>
                      <span>•</span>
                      <span>{(event.confidence * 100).toFixed(0)}% confidence</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Event Log */}
      {viewMode === 'events' && (
        <div className="px-4 py-6 space-y-4">
          <motion.div
            className="rounded-[16px] p-4 border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-white/40" strokeWidth={2.5} />
              <input
                type="text"
                placeholder="Search events..."
                className="flex-1 bg-transparent text-[15px] text-white outline-none"
              />
              <Filter className="w-4 h-4 text-white/40" strokeWidth={2.5} />
            </div>
          </motion.div>

          {recentEvents.map((event, index) => (
            <motion.div
              key={event.id}
              className="rounded-[16px] p-4 border border-white/20 bg-white/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: index * 0.03 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {event.type === 'enter' ? (
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
                    </div>
                  )}
                  <div>
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {event.type === 'enter' ? 'Zone Entry' : 'Zone Exit'}
                    </div>
                    <div className="text-[13px] text-white/60">
                      {event.zoneName}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-white/60 mb-1">
                    {formatTimestamp(event.timestamp)}
                  </div>
                  <div className={`text-[11px] ${getAccuracyColor(event.accuracy)}`} style={{ fontWeight: 600 }}>
                    ±{event.accuracy.toFixed(1)}m
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/60">
                <span>User: {event.userId}</span>
                <span>•</span>
                <span>{event.method.toUpperCase()}</span>
                <span>•</span>
                <span>{(event.confidence * 100).toFixed(0)}% confidence</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Info Notice */}
      <div className="px-4 pb-6">
        <motion.div
          className="rounded-[20px] p-5 border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-500/5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Backend Fusion Engine Ready
              </h4>
              <p className="text-[13px] text-white/80 leading-relaxed">
                This diagnostic interface visualizes real-time outputs from the Sensor Fusion Engine. 
                Connect your backend Kalman Filter, trilateration, and state machine outputs here for 
                live monitoring, dispute resolution, and quality assurance.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
