import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, TrendingUp, Car, Brain, Radar, Activity,
  Navigation, Search, Layers, Bookmark, ChevronDown, ChevronRight,
  Zap, Star, Shield, Clock, Map, Globe
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner@2.0.3';

interface MapMenuSlideUpProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFunction: (functionType: MapFunction) => void;
  onViewModeChange?: (mode: MapViewMode) => void;
  currentViewMode?: MapViewMode;
  isDarkMode: boolean;
}

export type MapFunction =
  | 'trending-hotspots'
  | 'live-venue-data'
  | 'smart-parking'
  | 'ai-navigation'
  | 'spot-radar'
  | 'route'
  | 'traffic-intelligence';

export type MapViewMode = 'standard' | 'satellite';

interface MapFunctionItem {
  id: MapFunction;
  icon: any;
  title: string;
  description: string;
  color: string;
  gradient: string;
  badge?: string;
  isPremium?: boolean;
}

// Beta: 3 core map functions only
const MAP_FUNCTIONS: MapFunctionItem[] = [
  {
    id: 'smart-parking',
    icon: Car,
    title: 'Smart Parking',
    description: 'Available spots with live pricing',
    color: '#A855F7',
    gradient: 'from-purple-500 to-fuchsia-500',
    badge: 'LIVE',
  },
  {
    id: 'live-venue-data',
    icon: Activity,
    title: 'Live Venue Data',
    description: 'Crowd levels & wait times',
    color: '#00BFFF',
    gradient: 'from-cyan-500 to-blue-500',
    badge: 'LIVE',
  },
  {
    id: 'trending-hotspots',
    icon: TrendingUp,
    title: 'Trending Hotspots',
    description: 'Real-time popular spots & events',
    color: '#FF4500',
    gradient: 'from-orange-500 to-red-500',
    badge: 'LIVE',
  },
];

const LAYER_OPTIONS = [
  { id: 'parking', label: 'Parking Spots', icon: Car },
  { id: 'venues', label: 'Venues & Bars', icon: Star },
  { id: 'traffic', label: 'Traffic', icon: Activity },
  { id: 'restaurants', label: 'Restaurants', icon: MapPin },
];

const SAVED_ROUTES = [
  { id: '1', name: 'Work Commute', time: '18 min', distance: '5.2 mi' },
  { id: '2', name: 'Gym → Home', time: '12 min', distance: '3.8 mi' },
  { id: '3', name: 'Weekend Route', time: '25 min', distance: '8.1 mi' },
];

export function MapMenuSlideUp({ isOpen, onClose, onSelectFunction, onViewModeChange, currentViewMode = 'standard', isDarkMode }: MapMenuSlideUpProps) {
  const [showLayers, setShowLayers] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['parking']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Haptic feedback simulation
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleSelectFunction = (func: MapFunctionItem) => {
    triggerHaptic();
    
    if (func.isPremium) {
      toast.success('🌟 Premium Feature', {
        description: `${func.title} - Upgrade to unlock advanced AI routing`,
        duration: 3000,
      });
    } else {
      const messages: Record<MapFunction, string> = {
        'trending-hotspots': '🔥 Loading trending hotspots near you...',
        'live-venue-data': '📊 Fetching real-time venue data...',
        'smart-parking': '🚗 Finding available parking spots...',
        'ai-navigation': '🧠 Calculating optimal route...',
        'spot-radar': '📡 Scanning for hidden gems...',
        'traffic-intelligence': '🚦 Analyzing traffic patterns...',
        'route': '🗺️ Setting route...',
      };
      
      toast.success(func.title, {
        description: messages[func.id],
        duration: 2500,
      });
    }
    
    onSelectFunction(func.id);
    setTimeout(() => onClose(), 300);
  };

  const handleQuickAction = (action: string) => {
    triggerHaptic();
    
    const messages: Record<string, string> = {
      location: '📍 Centering map on your location...',
      search: '🔍 Opening search...',
      layers: '🗺️ Map layers',
      routes: '🚗 Saved routes',
    };
    
    if (action === 'layers') {
      setShowLayers(!showLayers);
    } else if (action === 'routes') {
      setShowRoutes(!showRoutes);
    } else {
      toast.info(messages[action]);
    }
  };

  const toggleLayer = (layerId: string) => {
    triggerHaptic();
    setSelectedLayers(prev => 
      prev.includes(layerId) 
        ? prev.filter(id => id !== layerId)
        : [...prev, layerId]
    );
  };

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ACCESSIBILITY: Comprehensive keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      
      // Navigate with arrow keys
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const functions = MAP_FUNCTIONS;
        const maxIndex = functions.length - 1;
        
        if (e.key === 'ArrowDown') {
          setFocusedIndex(prev => Math.min(prev + 1, maxIndex));
        } else {
          setFocusedIndex(prev => Math.max(prev - 1, 0));
        }
      }
      
      // Activate with Enter or Space
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const selectedFunction = MAP_FUNCTIONS[focusedIndex];
        if (selectedFunction) {
          handleSelectFunction(selectedFunction);
        }
      }
      
      // Go back with Backspace
      if (e.key === 'Backspace' && (showLayers || showRoutes)) {
        e.preventDefault();
        setShowLayers(false);
        setShowRoutes(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, focusedIndex, showLayers, showRoutes]);
  
  // ACCESSIBILITY: Focus management - trap focus in modal
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    
    // Focus first element when opened
    const focusableElements = menuRef.current.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
    
    // Trap focus within modal
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Slide Up Menu */}
          <motion.div
            ref={menuRef}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-[393px] mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springConfig}
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-menu-title"
            aria-describedby="map-menu-description"
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <motion.div
                className="w-12 h-1.5 rounded-full bg-white/40"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
                transition={springConfig}
              />
            </div>

            {/* Menu Content */}
            <div className="bg-[#1C1C1E]/95 backdrop-blur-2xl border-t-2 border-white/30 rounded-t-[28px] overflow-hidden shadow-2xl pb-safe">
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-white/20">
                <div className="flex items-center justify-between mb-4">
                  {/* Back button when sections are open */}
                  {(showLayers || showRoutes) ? (
                    <motion.button
                      onClick={() => {
                        setShowLayers(false);
                        setShowRoutes(false);
                        triggerHaptic();
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                      aria-label="Go back"
                    >
                      <ChevronDown className="w-5 h-5 text-white rotate-90" strokeWidth={2.5} />
                    </motion.button>
                  ) : (
                    <div className="w-10" />
                  )}
                  
                  <h2 
                    id="map-menu-title"
                    className="text-[20px] text-white flex-1 text-center" 
                    style={{ fontWeight: 700 }}
                  >
                    {showLayers ? 'Map Layers' : showRoutes ? 'Saved Routes' : 'Map Functions'}
                  </h2>
                  
                  <motion.button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {/* Quick Actions - Only show when no sections are expanded */}
                {!showLayers && !showRoutes && (
                  <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'location', icon: Navigation, label: 'My Location' },
                    { id: 'search', icon: Search, label: 'Search' },
                    { id: 'layers', icon: Layers, label: 'Layers' },
                    { id: 'routes', icon: Bookmark, label: 'Routes' },
                  ].map((action) => (
                    <motion.button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-[16px] bg-white/5 border border-white/20"
                      whileTap={{ scale: 0.95 }}
                      transition={springConfig}
                      aria-label={action.label}
                    >
                      <action.icon className="w-5 h-5 text-white" strokeWidth={2} />
                      <span className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                        {action.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
                )}
              </div>

              {/* Map Layers (Expandable) */}
              <AnimatePresence>
                {showLayers && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-5 space-y-5">
                      {/* Map View Mode Toggle */}
                      <div>
                        <div className="text-[13px] text-white/70 mb-3" style={{ fontWeight: 600 }}>
                          MAP VIEW
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <motion.button
                            onClick={() => {
                              triggerHaptic();
                              onViewModeChange?.('standard');
                              toast.success('Standard View', {
                                description: 'Switched to standard map view',
                                duration: 2000,
                              });
                            }}
                            className={`flex flex-col items-center gap-2 p-4 rounded-[14px] border-2 ${
                              currentViewMode === 'standard'
                                ? 'bg-cyan-500/20 border-cyan-400'
                                : 'bg-white/5 border-white/20'
                            }`}
                            whileTap={{ scale: 0.95 }}
                            transition={springConfig}
                            aria-label="Switch to standard map view"
                            aria-pressed={currentViewMode === 'standard'}
                            role="radio"
                          >
                            <div className={`w-8 h-8 rounded-lg border-2 ${
                              currentViewMode === 'standard' ? 'border-cyan-400' : 'border-white/30'
                            } flex items-center justify-center`}>
                              <MapPin 
                                className={`w-4 h-4 ${currentViewMode === 'standard' ? 'text-cyan-400' : 'text-white/70'}`} 
                                strokeWidth={2.5}
                              />
                            </div>
                            <span 
                              className={`text-[13px] ${currentViewMode === 'standard' ? 'text-white' : 'text-white/70'}`}
                              style={{ fontWeight: 600 }}
                            >
                              Standard
                            </span>
                          </motion.button>

                          <motion.button
                            onClick={() => {
                              triggerHaptic();
                              onViewModeChange?.('satellite');
                              toast.success('Satellite View', {
                                description: 'Switched to satellite imagery',
                                duration: 2000,
                              });
                            }}
                            className={`flex flex-col items-center gap-2 p-4 rounded-[14px] border-2 ${
                              currentViewMode === 'satellite'
                                ? 'bg-cyan-500/20 border-cyan-400'
                                : 'bg-white/5 border-white/20'
                            }`}
                            whileTap={{ scale: 0.95 }}
                            transition={springConfig}
                            aria-label="Switch to satellite map view"
                            aria-pressed={currentViewMode === 'satellite'}
                            role="radio"
                          >
                            <div className={`w-8 h-8 rounded-lg border-2 ${
                              currentViewMode === 'satellite' ? 'border-cyan-400' : 'border-white/30'
                            } overflow-hidden`}>
                              <div className="w-full h-full bg-gradient-to-br from-green-600/40 via-blue-900/60 to-blue-800/80" />
                            </div>
                            <span 
                              className={`text-[13px] ${currentViewMode === 'satellite' ? 'text-white' : 'text-white/70'}`}
                              style={{ fontWeight: 600 }}
                            >
                              Satellite
                            </span>
                          </motion.button>
                        </div>
                      </div>

                      {/* Layer Toggles */}
                      <div>
                        <div className="text-[13px] text-white/70 mb-3" style={{ fontWeight: 600 }}>
                          MAP LAYERS
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {LAYER_OPTIONS.map((layer) => {
                            const isSelected = selectedLayers.includes(layer.id);
                            return (
                              <motion.button
                                key={layer.id}
                                onClick={() => toggleLayer(layer.id)}
                                className={`flex items-center gap-2.5 p-4 rounded-[14px] border-2 ${
                                  isSelected
                                    ? 'bg-purple-500/20 border-purple-400'
                                    : 'bg-white/5 border-white/20'
                                }`}
                                whileTap={{ scale: 0.95 }}
                                transition={springConfig}
                                aria-label={`Toggle ${layer.label} layer`}
                                aria-pressed={isSelected}
                                role="switch"
                              >
                                <layer.icon 
                                  className={`w-5 h-5 ${isSelected ? 'text-purple-400' : 'text-white/70'}`} 
                                  strokeWidth={2}
                                />
                                <span 
                                  className={`text-[14px] ${isSelected ? 'text-white' : 'text-white/70'}`}
                                  style={{ fontWeight: 500 }}
                                >
                                  {layer.label}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Saved Routes (Expandable) */}
              <AnimatePresence>
                {showRoutes && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-5">
                      <div className="space-y-3">
                        {SAVED_ROUTES.map((route) => (
                          <motion.button
                            key={route.id}
                            className="w-full flex items-center justify-between p-4 rounded-[14px] bg-white/5 border-2 border-white/20"
                            whileTap={{ scale: 0.98 }}
                            transition={springConfig}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-400/40 flex items-center justify-center">
                                <Navigation className="w-6 h-6 text-cyan-400" strokeWidth={2.5} />
                              </div>
                              <div className="text-left">
                                <div className="text-[16px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                                  {route.name}
                                </div>
                                <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                                  {route.time} • {route.distance}
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-white/50" strokeWidth={2.5} />
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main Functions Grid - Only show when no sections are expanded */}
              {!showLayers && !showRoutes && (
                <div className="px-6 py-5 max-h-[50vh] overflow-y-auto scrollbar-hide">
                  <div className="grid grid-cols-1 gap-3">
                  {MAP_FUNCTIONS.map((func, index) => {
                    const Icon = func.icon;
                    
                    return (
                      <motion.button
                        key={func.id}
                        onClick={() => handleSelectFunction(func)}
                        className={`relative flex items-center gap-4 p-4 rounded-[16px] bg-gradient-to-br from-white/5 to-white/[0.02] border-2 overflow-hidden group ${
                          focusedIndex === index 
                            ? 'border-white/60 ring-2 ring-white/40' 
                            : 'border-white/20'
                        }`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          ...springConfig, 
                          delay: index * 0.05 
                        }}
                        whileHover={{ scale: 1.02, borderColor: func.color }}
                        whileTap={{ scale: 0.98 }}
                        aria-label={`${func.title}: ${func.description}`}
                        aria-describedby={`func-desc-${func.id}`}
                        tabIndex={0}
                      >
                        {/* Animated Background Gradient */}
                        <motion.div
                          className={`absolute inset-0 bg-gradient-to-br ${func.gradient} opacity-0 group-hover:opacity-10`}
                          transition={{ duration: 0.3 }}
                        />

                        {/* Icon */}
                        <div 
                          className={`relative w-14 h-14 rounded-[14px] bg-gradient-to-br ${func.gradient} flex items-center justify-center shadow-lg`}
                        >
                          <Icon className="w-7 h-7 text-white" strokeWidth={2} />
                          
                          {/* Badge */}
                          {func.badge && (
                            <motion.div
                              className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                                func.badge === 'PRO' 
                                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500' 
                                  : func.badge === 'NEW'
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                                  : 'bg-gradient-to-r from-red-500 to-pink-500'
                              }`}
                              style={{ fontWeight: 700 }}
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              {func.badge}
                            </motion.div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                              {func.title}
                            </h3>
                            {func.isPremium && (
                              <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/40">
                                <span className="text-[10px] text-yellow-400" style={{ fontWeight: 700 }}>
                                  PREMIUM
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                            {func.description}
                          </p>
                        </div>

                        {/* Arrow Indicator */}
                        <ChevronRight 
                          className="w-6 h-6 text-white/40 group-hover:text-white/70 group-hover:translate-x-1 transition-all" 
                          strokeWidth={2.5} 
                        />

                        {/* Particle Effect on Hover */}
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          initial={false}
                          animate={{
                            background: [
                              `radial-gradient(circle at 0% 0%, ${func.color}22 0%, transparent 50%)`,
                              `radial-gradient(circle at 100% 100%, ${func.color}22 0%, transparent 50%)`,
                            ],
                          }}
                          transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
                        />
                      </motion.button>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* Bottom Safe Area */}
              <div className="h-8" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}