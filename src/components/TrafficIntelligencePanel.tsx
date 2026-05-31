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
      case 'high': return 'border-red-300 bg-red-950';
      case 'medium': return 'border-amber-300 bg-amber-950';
      case 'low': return 'border-emerald-300 bg-emerald-950';
      default: return 'border-slate-600 bg-slate-900';
    }
  };

  return (
    <>

      {/* Expanded Panel - Slides from Right */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            data-testid="traffic-intelligence-panel"
            role="dialog"
            aria-label="Traffic Intelligence"
            className="fixed top-16 right-0 bottom-24 z-40 flex w-[340px] max-w-[90vw] flex-col border-l-2 border-slate-600 bg-slate-950 shadow-2xl"
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={springConfig}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-slate-700 bg-slate-900 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-orange-200 bg-gradient-to-br from-red-500 to-orange-500">
                    <ShieldAlert className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                    Traffic Intel
                  </h3>
                </div>
                <motion.button
                  onClick={onToggle}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-500 bg-slate-900 text-white shadow-lg"
                  aria-label="Close Traffic Intelligence"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <ChevronRight className="w-4 h-4 text-white" strokeWidth={2.5} />
                </motion.button>
              </div>

              {/* Current Speed Limit */}
              <div className="rounded-[12px] border border-cyan-300 bg-cyan-950 p-3 shadow-inner shadow-cyan-950">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-200" strokeWidth={2.5} />
                    <span className="text-[13px] text-slate-50" style={{ fontWeight: 600 }}>
                      Speed Limit
                    </span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[11px] ${
                    currentSpeed > CURRENT_SPEED_LIMIT.current 
                      ? 'border border-red-300 bg-red-950 text-red-100'
                      : 'border border-emerald-300 bg-emerald-950 text-emerald-100'
                  }`} style={{ fontWeight: 600 }}>
                    {currentSpeed > CURRENT_SPEED_LIMIT.current ? 'SLOW DOWN' : 'OK'}
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] text-white" style={{ fontWeight: 700 }}>
                    {CURRENT_SPEED_LIMIT.current}
                  </span>
                  <span className="text-[15px] text-slate-200" style={{ fontWeight: 400 }}>
                    MPH
                  </span>
                  <span className="ml-auto text-[12px] text-slate-300" style={{ fontWeight: 400 }}>
                    {CURRENT_SPEED_LIMIT.zone}
                  </span>
                </div>
                <div className="mt-1.5 text-[11px] text-red-200" style={{ fontWeight: 600 }}>
                  Fine: {CURRENT_SPEED_LIMIT.fine}
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-slate-950 px-4 py-3">
              {/* Live Alerts */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Live Alerts
                  </h4>
                  <div className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-950 px-2 py-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[11px] text-red-100" style={{ fontWeight: 700 }}>
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
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br ${alert.color}`}>
                          {alert.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h5 className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                              {alert.location}
                            </h5>
                            <span className="flex-shrink-0 text-[12px] text-slate-200" style={{ fontWeight: 600 }}>
                              {alert.distance} mi
                            </span>
                          </div>
                          <p className="mb-1.5 text-[12px] text-slate-100" style={{ fontWeight: 400 }}>
                            {alert.description}
                          </p>
                          <div className="flex items-center gap-2 text-[11px]">
                            <div className="flex items-center gap-1 text-slate-300">
                              <Eye className="w-3 h-3" strokeWidth={2.5} />
                              <span>{alert.reportedBy} reports</span>
                            </div>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-300">{alert.timeAgo}</span>
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
                      className="flex items-center gap-2.5 rounded-[10px] border border-slate-700 bg-slate-900 px-3 py-2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springConfig, delay: 0.3 + index * 0.05 }}
                    >
                      <div className={rule.color}>
                        {rule.icon}
                      </div>
                      <span className="text-[13px] text-slate-100" style={{ fontWeight: 500 }}>
                        {rule.text}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Safety Tips */}
              <div className="rounded-[12px] border border-emerald-300 bg-emerald-950 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <div>
                    <h5 className="text-[13px] text-white mb-1" style={{ fontWeight: 600 }}>
                      Safe Driving Zone
                    </h5>
                    <p className="text-[12px] text-emerald-50" style={{ fontWeight: 400 }}>
                      No recent violations reported in this area. Keep following traffic rules!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-slate-700 bg-slate-900 px-4 py-3">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
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
