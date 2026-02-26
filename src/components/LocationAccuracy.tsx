import { motion } from 'motion/react';
import { MapPin, Wifi, Bluetooth, Gauge, CheckCircle, AlertCircle } from 'lucide-react';
import { useSensorData } from './SensorManager';

interface LocationAccuracyProps {
  compact?: boolean;
  showDetails?: boolean;
}

export function LocationAccuracy({ compact = false, showDetails = false }: LocationAccuracyProps) {
  const sensorData = useSensorData();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const getAccuracyColor = () => {
    switch (sensorData.confidenceLevel) {
      case 'very-high':
        return 'from-green-500 to-emerald-500';
      case 'high':
        return 'from-blue-500 to-cyan-500';
      case 'medium':
        return 'from-yellow-500 to-orange-500';
      case 'low':
        return 'from-red-500 to-pink-500';
    }
  };

  const getAccuracyText = () => {
    switch (sensorData.confidenceLevel) {
      case 'very-high':
        return 'Excellent';
      case 'high':
        return 'Good';
      case 'medium':
        return 'Fair';
      case 'low':
        return 'Poor';
    }
  };

  const getAccuracyIcon = () => {
    return sensorData.confidenceLevel === 'very-high' || sensorData.confidenceLevel === 'high' 
      ? <CheckCircle className="w-4 h-4" strokeWidth={2.5} />
      : <AlertCircle className="w-4 h-4" strokeWidth={2.5} />;
  };

  if (compact) {
    return (
      <motion.div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${getAccuracyColor()} bg-opacity-20 border-2 border-white/30`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springConfig}
      >
        <MapPin className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
          ±{sensorData.fusedAccuracy.toFixed(1)}m
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${getAccuracyColor()} border-2 border-white/30`}>
            <MapPin className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Location Accuracy
            </h3>
            <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
              Multi-sensor fusion
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r ${getAccuracyColor()} bg-opacity-20 border border-white/30`}>
          {getAccuracyIcon()}
          <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
            {getAccuracyText()}
          </span>
        </div>
      </div>

      {/* Accuracy Metric */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[28px] text-white" style={{ fontWeight: 700 }}>
            ±{sensorData.fusedAccuracy.toFixed(1)}
          </span>
          <span className="text-[17px] text-white/80" style={{ fontWeight: 500 }}>
            meters
          </span>
        </div>
        
        {/* Accuracy Bar */}
        <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getAccuracyColor()} rounded-full`}
            initial={{ width: 0 }}
            animate={{ 
              width: `${Math.max(10, Math.min(100, 100 - (sensorData.fusedAccuracy * 3)))}%` 
            }}
            transition={springConfig}
          />
        </div>
      </div>

      {showDetails && (
        <>
          {/* Active Sensors */}
          <div className="space-y-2">
            <p className="text-[13px] text-white/80 mb-2" style={{ fontWeight: 500 }}>
              Active Sensors
            </p>

            {/* GPS */}
            <div className="flex items-center justify-between p-2 rounded-[12px] bg-white/5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
                <span className="text-[13px] text-white" style={{ fontWeight: 500 }}>
                  GPS
                </span>
              </div>
              <span className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                ±{sensorData.accuracy?.toFixed(1) || 'N/A'}m
              </span>
            </div>

            {/* WiFi */}
            {sensorData.wifiEnabled && (
              <div className="flex items-center justify-between p-2 rounded-[12px] bg-white/5">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
                  <span className="text-[13px] text-white" style={{ fontWeight: 500 }}>
                    WiFi ({sensorData.wifiNetworks.length} networks)
                  </span>
                </div>
                <span className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                  ±{sensorData.wifiAccuracy?.toFixed(1) || 'N/A'}m
                </span>
              </div>
            )}

            {/* BLE */}
            {sensorData.bleEnabled && (
              <div className="flex items-center justify-between p-2 rounded-[12px] bg-white/5">
                <div className="flex items-center gap-2">
                  <Bluetooth className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
                  <span className="text-[13px] text-white" style={{ fontWeight: 500 }}>
                    Bluetooth ({sensorData.bleBeacons.length} beacons)
                  </span>
                </div>
                <span className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                  ±{sensorData.bleAccuracy?.toFixed(1) || 'N/A'}m
                </span>
              </div>
            )}

            {/* IMU */}
            {sensorData.imuEnabled && (
              <div className="flex items-center justify-between p-2 rounded-[12px] bg-white/5">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: sensorData.movementDetected ? [0, 10, -10, 0] : 0 }}
                    transition={{ duration: 0.5, repeat: sensorData.movementDetected ? Infinity : 0 }}
                  >
                    <Gauge className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                  </motion.div>
                  <span className="text-[13px] text-white" style={{ fontWeight: 500 }}>
                    Motion Sensors
                  </span>
                </div>
                <span className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                  {sensorData.movementDetected ? 'Moving' : 'Stationary'}
                </span>
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center gap-4">
              {sensorData.indoorDetected && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/30">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-[11px] text-purple-200" style={{ fontWeight: 600 }}>
                    Indoor
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-1.5 text-[11px] text-white/60" style={{ fontWeight: 400 }}>
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Live
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
