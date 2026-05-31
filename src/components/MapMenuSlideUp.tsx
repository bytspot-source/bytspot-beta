import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, TrendingUp, Car, Brain, Radar, Activity,
  Navigation, Search, Layers, Bookmark, ChevronDown, ChevronRight,
  Zap, Star, Shield, Clock, Map, Globe
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner@2.0.3';
import type { MapFunction, MapViewMode } from './map/mapTypes';

interface MapMenuSlideUpProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFunction: (functionType: MapFunction) => void;
  onViewModeChange?: (mode: MapViewMode) => void;
  onSearchPress?: () => void;
  onServiceLocationPress?: () => void;
  currentViewMode?: MapViewMode;
  isDarkMode: boolean;
}

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

export function MapMenuSlideUp({
  isOpen,
  onClose,
  onSelectFunction,
  onViewModeChange,
  onSearchPress,
  onServiceLocationPress,
  currentViewMode = 'standard',
  isDarkMode,
}: MapMenuSlideUpProps) {
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

  // Lightweight haptic feedback when supported by the browser.
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

    if (action === 'layers') {
      setShowLayers(!showLayers);
    } else if (action === 'routes') {
      setShowRoutes(!showRoutes);
    } else if (action === 'service-location') {
      onServiceLocationPress?.();
      setTimeout(() => onClose(), 180);
    } else if (action === 'search') {
      onSearchPress?.();
      setTimeout(() => onClose(), 180);
    } else {
      toast.info('Map action unavailable');
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
            <div className="flex justify-center pt-2 pb-1">
              <motion.div
                className="h-1.5 w-11 rounded-full bg-white/40"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
                transition={springConfig}
              />
            </div>

            {/* Menu Content */}
            <div
              className="overflow-hidden rounded-t-[28px] border-t-2 border-white/30 bg-[#1C1C1E]/95 pb-safe shadow-2xl backdrop-blur-2xl"
              style={{ maxHeight: '46vh' }}
            >
              {/* Header */}
              <div className="border-b border-white/20 px-3 pb-2 pt-2">
                <div className="mb-2 flex items-center justify-between">
                  {/* Back button when sections are open */}
                  {(showLayers || showRoutes) ? (
                    <motion.button
                      onClick={() => {
                        setShowLayers(false);
                        setShowRoutes(false);
                        triggerHaptic();
                      }}
                      className="tap-target flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 bg-white/10"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                      aria-label="Go back"
                    >
                      <ChevronDown className="w-5 h-5 text-white rotate-90" strokeWidth={2.5} />
                    </motion.button>
                  ) : (
                    <div className="w-8" />
                  )}
                  
                  <h2 
                    id="map-menu-title"
                    className="flex-1 text-center text-[17px] text-white"
                    style={{ fontWeight: 800 }}
                  >
                    {showLayers ? 'Map Layers' : showRoutes ? 'Saved Routes' : 'Map Functions'}
                  </h2>
                  
                  <motion.button
                    onClick={onClose}
                    className="tap-target flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 bg-white/10"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {/* Quick Actions - Only show when no sections are expanded */}
                {!showLayers && !showRoutes && (
                  <div className="grid grid-cols-4 gap-1.5 rounded-[18px] border border-white/15 bg-[#080A10]/70 p-1.5">
                  {[
                    { id: 'service-location', icon: MapPin, label: 'Service Here' },
                    { id: 'search', icon: Search, label: 'Search' },
                    { id: 'layers', icon: Layers, label: 'Layers' },
                    { id: 'routes', icon: Bookmark, label: 'Routes' },
                  ].map((action) => (
                    <motion.button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[14px] border border-white/20 bg-white/5 px-1 py-2"
                      whileTap={{ scale: 0.95 }}
                      transition={springConfig}
                      aria-label={action.label}
                    >
                      <action.icon className="h-4 w-4 text-white" strokeWidth={2.3} />
                      <span className="text-center text-[9.5px] leading-tight text-white/85" style={{ fontWeight: 750 }}>
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
                    <div className="space-y-3 overflow-y-auto px-3 py-2.5 scrollbar-hide" style={{ maxHeight: '26vh' }}>
                      {/* Map View Mode Toggle */}
                      <div>
                        <div className="mb-2 text-[12px] text-white/70" style={{ fontWeight: 700 }}>
                          MAP VIEW
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <motion.button
                            onClick={() => {
                              triggerHaptic();
                              onViewModeChange?.('standard');
                              toast.success('Standard View', {
                                description: 'Switched to standard map view',
                                duration: 2000,
                              });
                            }}
                            className={`flex flex-col items-center gap-1.5 rounded-[14px] border-2 p-2.5 ${
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
                            <div className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 ${
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
                        <div className="mb-2 text-[12px] text-white/70" style={{ fontWeight: 700 }}>
                          MAP LAYERS
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {LAYER_OPTIONS.map((layer) => {
                            const isSelected = selectedLayers.includes(layer.id);
                            return (
                              <motion.button
                                key={layer.id}
                                onClick={() => toggleLayer(layer.id)}
                                className={`flex items-center gap-2.5 rounded-[14px] border-2 p-3 ${
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
                    <div className="overflow-y-auto px-3 py-2.5 scrollbar-hide" style={{ maxHeight: '26vh' }}>
                      <div className="space-y-2">
                        {SAVED_ROUTES.map((route) => (
                          <motion.button
                            key={route.id}
                            className="flex w-full items-center justify-between rounded-[14px] border-2 border-white/20 bg-white/5 p-2.5"
                            whileTap={{ scale: 0.98 }}
                            transition={springConfig}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                                <Navigation className="h-4 w-4 text-cyan-400" strokeWidth={2.5} />
                              </div>
                              <div className="text-left">
                                <div className="mb-0.5 text-[15px] text-white" style={{ fontWeight: 700 }}>
                                  {route.name}
                                </div>
                                <div className="text-[12px] text-white/70" style={{ fontWeight: 500 }}>
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
                <div className="overflow-y-auto px-3 py-2.5 scrollbar-hide" style={{ maxHeight: '26vh' }}>
                  <div className="grid grid-cols-1 gap-2">
                  {MAP_FUNCTIONS.map((func, index) => {
                    const Icon = func.icon;
                    
                    return (
                      <motion.button
                        key={func.id}
                        onClick={() => handleSelectFunction(func)}
                        className={`group relative flex items-center gap-2.5 overflow-hidden rounded-[15px] border-2 bg-gradient-to-br from-white/5 to-white/[0.02] p-2.5 ${
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
                          className={`relative flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br ${func.gradient} shadow-lg`}
                        >
                          <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                          
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
                            <h3 className="text-[14px] text-white" style={{ fontWeight: 800 }}>
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
                          <p className="text-[11px] leading-snug text-white/70" style={{ fontWeight: 550 }}>
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
              <div className="h-3" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}