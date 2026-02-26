import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, Activity, Star, Users, Clock, DollarSign,
  Zap, MapPin, Flame, Sparkles, Eye, Heart, Music, Coffee,
  ShoppingBag, Utensils, Wine, Dumbbell, Camera, AlertTriangle
} from 'lucide-react';
import { useState, useEffect, memo } from 'react';
import type { MapFunction } from './MapMenuSlideUp';

interface MapIntelligenceOverlaysProps {
  activeFunction?: MapFunction;
  isDarkMode: boolean;
  zoomScale: number;
  latLngToScreen: (lat: number, lng: number) => { x: number; y: number };
}

// Live venue data
interface LiveVenue {
  id: number;
  lat: number;
  lng: number;
  name: string;
  type: 'bar' | 'restaurant' | 'club' | 'cafe' | 'gym' | 'shopping';
  crowdLevel: 'low' | 'medium' | 'high' | 'packed';
  waitTime: number; // minutes
  trending: boolean;
  popularity: number; // 0-100
}

// Trending hotspots
interface TrendingSpot {
  id: number;
  lat: number;
  lng: number;
  name: string;
  category: string;
  trendScore: number; // 0-100
  checkinsLastHour: number;
}

// Hidden gems (Spot Radar)
interface HiddenGem {
  id: number;
  lat: number;
  lng: number;
  name: string;
  description: string;
  rarity: 'rare' | 'uncommon' | 'hidden';
}

const LIVE_VENUES: LiveVenue[] = [
  {
    id: 1,
    lat: 37.7769,
    lng: -122.4174,
    name: 'The Rooftop Bar',
    type: 'bar',
    crowdLevel: 'high',
    waitTime: 15,
    trending: true,
    popularity: 92,
  },
  {
    id: 2,
    lat: 37.7759,
    lng: -122.4204,
    name: 'Neon District Club',
    type: 'club',
    crowdLevel: 'packed',
    waitTime: 30,
    trending: true,
    popularity: 98,
  },
  {
    id: 3,
    lat: 37.7729,
    lng: -122.4184,
    name: 'Jazz Lounge SF',
    type: 'bar',
    crowdLevel: 'medium',
    waitTime: 5,
    trending: false,
    popularity: 75,
  },
  {
    id: 4,
    lat: 37.7739,
    lng: -122.4214,
    name: 'Artisan Coffee Co',
    type: 'cafe',
    crowdLevel: 'low',
    waitTime: 0,
    trending: false,
    popularity: 65,
  },
  {
    id: 5,
    lat: 37.7789,
    lng: -122.4134,
    name: 'Fusion Bistro',
    type: 'restaurant',
    crowdLevel: 'high',
    waitTime: 25,
    trending: true,
    popularity: 88,
  },
];

const TRENDING_SPOTS: TrendingSpot[] = [
  {
    id: 1,
    lat: 37.7769,
    lng: -122.4174,
    name: 'The Rooftop Bar',
    category: 'Nightlife',
    trendScore: 98,
    checkinsLastHour: 247,
  },
  {
    id: 2,
    lat: 37.7759,
    lng: -122.4204,
    name: 'Neon District',
    category: 'Club',
    trendScore: 95,
    checkinsLastHour: 189,
  },
  {
    id: 3,
    lat: 37.7789,
    lng: -122.4134,
    name: 'Union Square',
    category: 'Shopping',
    trendScore: 82,
    checkinsLastHour: 156,
  },
];

const HIDDEN_GEMS: HiddenGem[] = [
  {
    id: 1,
    lat: 37.7719,
    lng: -122.4224,
    name: 'Secret Garden Cafe',
    description: 'Hidden rooftop cafe with city views',
    rarity: 'hidden',
  },
  {
    id: 2,
    lat: 37.7749,
    lng: -122.4144,
    name: 'Vintage Vinyl Records',
    description: 'Rare vinyl collection in basement shop',
    rarity: 'rare',
  },
  {
    id: 3,
    lat: 37.7709,
    lng: -122.4154,
    name: 'Underground Speakeasy',
    description: 'Password-only cocktail bar',
    rarity: 'hidden',
  },
];

// PERFORMANCE: Memoized to prevent unnecessary re-renders
export const MapIntelligenceOverlays = memo(function MapIntelligenceOverlays({ 
  activeFunction, 
  isDarkMode, 
  zoomScale,
  latLngToScreen 
}: MapIntelligenceOverlaysProps) {
  const [venues, setVenues] = useState<LiveVenue[]>(LIVE_VENUES);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Simulate live venue updates
  useEffect(() => {
    if (activeFunction === 'live-venue-data') {
      const interval = setInterval(() => {
        setVenues(prev => prev.map(venue => ({
          ...venue,
          waitTime: Math.max(0, venue.waitTime + Math.floor(Math.random() * 6) - 3),
          popularity: Math.min(100, Math.max(0, venue.popularity + Math.floor(Math.random() * 6) - 3)),
        })));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeFunction]);

  const getCrowdColor = (level: string) => {
    switch (level) {
      case 'low': return { primary: '#10B981', glow: 'rgba(16, 185, 129, 0.4)' };
      case 'medium': return { primary: '#F59E0B', glow: 'rgba(245, 158, 11, 0.4)' };
      case 'high': return { primary: '#EF4444', glow: 'rgba(239, 68, 68, 0.4)' };
      case 'packed': return { primary: '#DC2626', glow: 'rgba(220, 38, 38, 0.6)' };
      default: return { primary: '#10B981', glow: 'rgba(16, 185, 129, 0.4)' };
    }
  };

  const getVenueIcon = (type: string) => {
    switch (type) {
      case 'bar': return <Wine className="w-4 h-4" strokeWidth={2.5} />;
      case 'restaurant': return <Utensils className="w-4 h-4" strokeWidth={2.5} />;
      case 'club': return <Music className="w-4 h-4" strokeWidth={2.5} />;
      case 'cafe': return <Coffee className="w-4 h-4" strokeWidth={2.5} />;
      case 'gym': return <Dumbbell className="w-4 h-4" strokeWidth={2.5} />;
      case 'shopping': return <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />;
      default: return <Star className="w-4 h-4" strokeWidth={2.5} />;
    }
  };

  return (
    <>
      {/* Trending Hotspots */}
      <AnimatePresence>
        {activeFunction === 'trending-hotspots' && TRENDING_SPOTS.map((spot) => {
          const { x, y } = latLngToScreen(spot.lat, spot.lng);
          
          return (
            <motion.div
              key={`trending-${spot.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)',
                zIndex: 25,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={springConfig}
            >
              {/* Pulsing rings */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  width: `${60 * Math.min(zoomScale, 1.5)}px`,
                  height: `${60 * Math.min(zoomScale, 1.5)}px`,
                }}
                animate={{ 
                  scale: [1, 1.8, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="w-full h-full rounded-full bg-gradient-to-br from-orange-500/40 to-red-500/40" />
              </motion.div>

              {/* Main marker */}
              <div 
                className="relative rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  width: `${44 * Math.min(zoomScale, 1.5)}px`,
                  height: `${44 * Math.min(zoomScale, 1.5)}px`,
                  background: 'linear-gradient(135deg, #FF4500 0%, #FF6B00 100%)',
                  border: `${3 * Math.min(zoomScale, 1.5)}px solid white`,
                  boxShadow: `0 0 ${24 * Math.min(zoomScale, 1.5)}px rgba(255, 69, 0, 0.6)`,
                }}
              >
                <Flame 
                  className="text-white" 
                  strokeWidth={2.5}
                  style={{
                    width: `${22 * Math.min(zoomScale, 1.5)}px`,
                    height: `${22 * Math.min(zoomScale, 1.5)}px`,
                  }}
                />

                {/* Trend badge */}
                <div 
                  className="absolute -top-1 -right-1 rounded-full bg-white flex items-center justify-center"
                  style={{
                    width: `${18 * Math.min(zoomScale, 1.5)}px`,
                    height: `${18 * Math.min(zoomScale, 1.5)}px`,
                  }}
                >
                  <TrendingUp 
                    className="text-orange-500" 
                    strokeWidth={3}
                    style={{
                      width: `${12 * Math.min(zoomScale, 1.5)}px`,
                      height: `${12 * Math.min(zoomScale, 1.5)}px`,
                    }}
                  />
                </div>
              </div>

              {/* Info card */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                style={{
                  bottom: `${52 * Math.min(zoomScale, 1.5)}px`,
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-orange-400/50 shadow-2xl">
                  <div className="text-[13px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {spot.name}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-orange-400" style={{ fontWeight: 700 }}>
                      🔥 {spot.trendScore}% trending
                    </span>
                    <span className="text-white/70">•</span>
                    <span className="text-white/90" style={{ fontWeight: 500 }}>
                      {spot.checkinsLastHour} check-ins
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Live Venue Data */}
      <AnimatePresence>
        {activeFunction === 'live-venue-data' && venues.map((venue) => {
          const { x, y } = latLngToScreen(venue.lat, venue.lng);
          const colors = getCrowdColor(venue.crowdLevel);
          
          return (
            <motion.div
              key={`venue-${venue.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)',
                zIndex: 25,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={springConfig}
            >
              {/* Crowd level rings */}
              {venue.crowdLevel === 'high' || venue.crowdLevel === 'packed' ? (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    width: `${50 * Math.min(zoomScale, 1.5)}px`,
                    height: `${50 * Math.min(zoomScale, 1.5)}px`,
                  }}
                  animate={{ 
                    scale: [1, 1.4, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div 
                    className="w-full h-full rounded-full"
                    style={{ backgroundColor: colors.glow }}
                  />
                </motion.div>
              ) : null}

              {/* Main marker */}
              <div 
                className="relative rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  width: `${40 * Math.min(zoomScale, 1.5)}px`,
                  height: `${40 * Math.min(zoomScale, 1.5)}px`,
                  backgroundColor: colors.primary,
                  border: `${3 * Math.min(zoomScale, 1.5)}px solid white`,
                  boxShadow: `0 0 ${20 * Math.min(zoomScale, 1.5)}px ${colors.glow}`,
                }}
              >
                <div className="text-white">
                  {getVenueIcon(venue.type)}
                </div>

                {/* Trending indicator */}
                {venue.trending && (
                  <motion.div 
                    className="absolute -top-1 -right-1 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center"
                    style={{
                      width: `${16 * Math.min(zoomScale, 1.5)}px`,
                      height: `${16 * Math.min(zoomScale, 1.5)}px`,
                    }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Flame 
                      className="text-white" 
                      strokeWidth={3}
                      style={{
                        width: `${10 * Math.min(zoomScale, 1.5)}px`,
                        height: `${10 * Math.min(zoomScale, 1.5)}px`,
                      }}
                    />
                  </motion.div>
                )}
              </div>

              {/* Info card */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                style={{
                  bottom: `${48 * Math.min(zoomScale, 1.5)}px`,
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-2xl">
                  <div className="text-[13px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {venue.name}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" strokeWidth={2.5} style={{ color: colors.primary }} />
                      <span className="text-white/90 capitalize">{venue.crowdLevel}</span>
                    </div>
                    {venue.waitTime > 0 && (
                      <>
                        <span className="text-white/70">•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-yellow-400" strokeWidth={2.5} />
                          <span className="text-white/90">{venue.waitTime}min wait</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Hidden Gems (Spot Radar) */}
      <AnimatePresence>
        {activeFunction === 'spot-radar' && HIDDEN_GEMS.map((gem) => {
          const { x, y } = latLngToScreen(gem.lat, gem.lng);
          
          return (
            <motion.div
              key={`gem-${gem.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)',
                zIndex: 25,
              }}
              initial={{ opacity: 0, scale: 0, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0, rotate: 180 }}
              transition={springConfig}
            >
              {/* Sparkle effect */}
              <motion.div
                className="absolute inset-0"
                animate={{ 
                  rotate: [0, 360],
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{
                  width: `${60 * Math.min(zoomScale, 1.5)}px`,
                  height: `${60 * Math.min(zoomScale, 1.5)}px`,
                }}
              >
                {[0, 90, 180, 270].map((angle) => (
                  <div
                    key={angle}
                    className="absolute w-1 h-1 bg-purple-400 rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${20 * Math.min(zoomScale, 1.5)}px)`,
                    }}
                  />
                ))}
              </motion.div>

              {/* Main marker */}
              <div 
                className="relative rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  width: `${40 * Math.min(zoomScale, 1.5)}px`,
                  height: `${40 * Math.min(zoomScale, 1.5)}px`,
                  background: 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)',
                  border: `${3 * Math.min(zoomScale, 1.5)}px solid white`,
                  boxShadow: `0 0 ${24 * Math.min(zoomScale, 1.5)}px rgba(168, 85, 247, 0.6)`,
                }}
              >
                <Sparkles 
                  className="text-white" 
                  strokeWidth={2.5}
                  style={{
                    width: `${20 * Math.min(zoomScale, 1.5)}px`,
                    height: `${20 * Math.min(zoomScale, 1.5)}px`,
                  }}
                />
              </div>

              {/* Info card */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                style={{
                  bottom: `${48 * Math.min(zoomScale, 1.5)}px`,
                  maxWidth: '200px',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-purple-400/50 shadow-2xl">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles className="w-3 h-3 text-purple-400" strokeWidth={2.5} />
                    <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                      {gem.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/80 mb-1" style={{ fontWeight: 400 }}>
                    {gem.description}
                  </div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block ${
                    gem.rarity === 'hidden' ? 'bg-purple-500/30 text-purple-300' :
                    gem.rarity === 'rare' ? 'bg-fuchsia-500/30 text-fuchsia-300' :
                    'bg-pink-500/30 text-pink-300'
                  }`} style={{ fontWeight: 600 }}>
                    {gem.rarity.toUpperCase()} GEM
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
});
