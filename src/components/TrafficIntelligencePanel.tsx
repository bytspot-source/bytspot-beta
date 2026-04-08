import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, Camera, ShieldAlert, X, ChevronRight, 
  Car, Construction, AlertCircle, Zap, Clock, MapPin,
  Eye, Info, Ban, School, Bell, Navigation, Timer,
  DollarSign, CheckCircle2, Sparkles
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface TrafficIntelligencePanelProps {
  isDarkMode: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

type AlertType = 'police' | 'accident' | 'hazard' | 'construction' | 'camera' | 'speed-trap' | 'checkpoint';

interface TrafficAlert {
  id: string;
  type: AlertType;
  location: string;
  distance: string; // in miles
  severity: 'low' | 'medium' | 'high';
  description: string;
  reportedBy: number; // number of users who reported
  timeAgo: string;
  icon: React.ReactNode;
  color: string;
}

interface SpeedLimit {
  current: number;
  zone: string;
  fine: string;
}

interface QuickRule {
  icon: React.ReactNode;
  text: string;
  color: string;
}

// Live traffic alerts - would come from real API
const LIVE_ALERTS: TrafficAlert[] = [
  {
    id: '1',
    type: 'police',
    location: 'Market St & 5th',
    distance: '0.2',
    severity: 'high',
    description: 'Police car parked, speed enforcement',
    reportedBy: 12,
    timeAgo: '2 min ago',
    icon: <ShieldAlert className="w-4 h-4" strokeWidth={2.5} />,
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: '2',
    type: 'accident',
    location: 'Van Ness Ave & Broadway',
    distance: '0.5',
    severity: 'high',
    description: 'Multi-car accident, right lane blocked',
    reportedBy: 28,
    timeAgo: '5 min ago',
    icon: <AlertTriangle className="w-4 h-4" strokeWidth={2.5} />,
    color: 'from-red-500 to-red-600',
  },
  {
    id: '3',
    type: 'speed-trap',
    location: 'Geary Blvd near Masonic',
    distance: '0.8',
    severity: 'medium',
    description: 'Speed camera active',
    reportedBy: 8,
    timeAgo: '10 min ago',
    icon: <Camera className="w-4 h-4" strokeWidth={2.5} />,
    color: 'from-orange-500 to-orange-600',
  },
  {
    id: '4',
    type: 'construction',
    location: 'Lombard St',
    distance: '1.1',
    severity: 'medium',
    description: 'Road work, expect delays',
    reportedBy: 15,
    timeAgo: '15 min ago',
    icon: <Construction className="w-4 h-4" strokeWidth={2.5} />,
    color: 'from-yellow-500 to-yellow-600',
  },
  {
    id: '5',
    type: 'checkpoint',
    location: 'Bay Bridge Toll Plaza',
    distance: '2.3',
    severity: 'high',
    description: 'DUI checkpoint active',
    reportedBy: 45,
    timeAgo: '20 min ago',
    icon: <AlertCircle className="w-4 h-4" strokeWidth={2.5} />,
    color: 'from-purple-500 to-purple-600',
  },
];

const CURRENT_SPEED_LIMIT: SpeedLimit = {
  current: 25,
  zone: 'Residential Area',
  fine: '$100-$250',
};

const QUICK_RULES: QuickRule[] = [
  {
    icon: <Ban className="w-3.5 h-3.5" strokeWidth={2.5} />,
    text: 'No parking red zones',
    color: 'text-red-400',
  },
  {
    icon: <School className="w-3.5 h-3.5" strokeWidth={2.5} />,
    text: 'School zone: 15 MPH',
    color: 'text-orange-400',
  },
  {
    icon: <Bell className="w-3.5 h-3.5" strokeWidth={2.5} />,
    text: 'Street cleaning Tue 8-10AM',
    color: 'text-yellow-400',
  },
  {
    icon: <Camera className="w-3.5 h-3.5" strokeWidth={2.5} />,
    text: 'Red light camera ahead',
    color: 'text-purple-400',
  },
];

export function TrafficIntelligencePanel({ isDarkMode, isExpanded, onToggle }: TrafficIntelligencePanelProps) {
  const [activeAlerts, setActiveAlerts] = useState<TrafficAlert[]>(LIVE_ALERTS);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Simulate speed updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSpeed(Math.floor(Math.random() * 10) + 20); // 20-30 MPH
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-400/50 bg-red-500/10';
      case 'medium': return 'border-yellow-400/50 bg-yellow-500/10';
      case 'low': return 'border-green-400/50 bg-green-500/10';
      default: return 'border-white/20 bg-white/5';
    }
  };

  return (
    <>

      {/* Expanded Panel - Slides from Right */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="fixed top-16 right-0 bottom-24 w-[340px] max-w-[90vw] bg-[#1C1C1E]/95 backdrop-blur-xl border-l-2 border-white/30 shadow-2xl z-40 flex flex-col"
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={springConfig}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 border-2 border-white/30 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                    Traffic Intel
                  </h3>
                </div>
                <motion.button
                  onClick={onToggle}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/20"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <ChevronRight className="w-4 h-4 text-white" strokeWidth={2.5} />
                </motion.button>
              </div>

              {/* Current Speed Limit */}
              <div className="rounded-[12px] p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
                    <span className="text-[13px] text-white/90" style={{ fontWeight: 600 }}>
                      Speed Limit
                    </span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[11px] ${
                    currentSpeed > CURRENT_SPEED_LIMIT.current 
                      ? 'bg-red-500/30 border border-red-400/50 text-red-300'
                      : 'bg-green-500/30 border border-green-400/50 text-green-300'
                  }`} style={{ fontWeight: 600 }}>
                    {currentSpeed > CURRENT_SPEED_LIMIT.current ? 'SLOW DOWN' : 'OK'}
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                    {CURRENT_SPEED_LIMIT.current}
                  </span>
                  <span className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
                    MPH
                  </span>
                  <span className="text-[12px] text-white/60 ml-auto" style={{ fontWeight: 400 }}>
                    {CURRENT_SPEED_LIMIT.zone}
                  </span>
                </div>
                <div className="mt-1.5 text-[11px] text-red-400" style={{ fontWeight: 500 }}>
                  Fine: {CURRENT_SPEED_LIMIT.fine}
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* Live Alerts */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Live Alerts
                  </h4>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-400/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[11px] text-red-300" style={{ fontWeight: 600 }}>
                      {activeAlerts.length} Active
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {activeAlerts.map((alert, index) => (
                    <motion.div
                      key={alert.id}
                      className={`rounded-[12px] p-3 border ${getSeverityColor(alert.severity)}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springConfig, delay: index * 0.05 }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${alert.color} border border-white/30 flex items-center justify-center flex-shrink-0`}>
                          {alert.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h5 className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                              {alert.location}
                            </h5>
                            <span className="text-[12px] text-white/70 flex-shrink-0" style={{ fontWeight: 500 }}>
                              {alert.distance} mi
                            </span>
                          </div>
                          <p className="text-[12px] text-white/80 mb-1.5" style={{ fontWeight: 400 }}>
                            {alert.description}
                          </p>
                          <div className="flex items-center gap-2 text-[11px]">
                            <div className="flex items-center gap-1 text-white/60">
                              <Eye className="w-3 h-3" strokeWidth={2.5} />
                              <span>{alert.reportedBy} reports</span>
                            </div>
                            <span className="text-white/40">•</span>
                            <span className="text-white/60">{alert.timeAgo}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Quick Rules */}
              <div className="mb-4">
                <h4 className="text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
                  Current Area Rules
                </h4>
                <div className="space-y-2">
                  {QUICK_RULES.map((rule, index) => (
                    <motion.div
                      key={index}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-white/5 border border-white/10"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springConfig, delay: 0.3 + index * 0.05 }}
                    >
                      <div className={rule.color}>
                        {rule.icon}
                      </div>
                      <span className="text-[13px] text-white/90" style={{ fontWeight: 400 }}>
                        {rule.text}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Safety Tips */}
              <div className="rounded-[12px] p-3 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-400/30">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <div>
                    <h5 className="text-[13px] text-white mb-1" style={{ fontWeight: 600 }}>
                      Safe Driving Zone
                    </h5>
                    <p className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                      No recent violations reported in this area. Keep following traffic rules!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-white/20 bg-[#1C1C1E]/60">
              <div className="flex items-center justify-between text-[11px] text-white/60">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                  <span>Powered by community reports</span>
                </div>
                <span>Updated 1 min ago</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
