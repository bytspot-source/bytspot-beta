import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation, Star, Plus, Minus, Target,
  Zap, Umbrella, Filter, X,
  Home, MapPin
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MapFunction, MapViewMode } from './MapMenuSlideUp';
import { toast } from 'sonner@2.0.3';
import { ParkingSpotDetails } from './ParkingSpotDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
import { TrafficIntelligencePanel } from './TrafficIntelligencePanel';
import { VenueDetails } from './VenueDetails';
import { useVenues } from '../utils/hooks/useVenues';

interface MapSectionProps {
  isDarkMode: boolean;
  selectedFunction?: MapFunction;
  viewMode?: MapViewMode;
  destination?: string;
  onBackToHome?: () => void;
  onBookRide?: (venue?: { name: string; lat?: number; lng?: number }) => void;
  /** Live user coordinates — map centers here instead of hardcoded Atlanta */
  userCoords?: { lat: number; lng: number };
}

type AvailabilityStatus = 'available' | 'limited' | 'full';
type SecurityLevel = 'basic' | 'standard' | 'premium';
type EVConnectorType = 'tesla' | 'ccs' | 'chademo' | 'j1772';

interface ParkingSpot {
  id: number;
  lat: number;
  lng: number;
  name: string;
  available: number;
  total: number;
  price: number; // price per hour in dollars
  isPremium: boolean;
  hasEVCharging: boolean;
  evConnectorTypes?: EVConnectorType[];
  isCovered: boolean;
  securityLevel: SecurityLevel;
  hasCameras: boolean;
  isReserved: boolean; // user has reserved this spot
}

interface Venue {
  id: number;
  lat: number;
  lng: number;
  name: string;
  type: string;
  rating: number;
}

interface FilterState {
  priceRange: [number, number]; // min, max price per hour
  securityLevel: SecurityLevel[];
  evChargingOnly: boolean;
  coveredOnly: boolean;
  showPremiumOnly: boolean;
}

// Fallback parking data — used until live API data loads
const FALLBACK_PARKING: ParkingSpot[] = [
  { id: 1, lat: 33.7844, lng: -84.3862, name: '1380 W Peachtree Garage', available: 22, total: 45, price: 8, isPremium: true, hasEVCharging: true, evConnectorTypes: ['ccs' as EVConnectorType], isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false },
  { id: 2, lat: 33.7852, lng: -84.3845, name: 'Colony Square Garage', available: 14, total: 60, price: 6, isPremium: false, hasEVCharging: false, isCovered: true, securityLevel: 'standard', hasCameras: true, isReserved: false },
  { id: 3, lat: 33.7883, lng: -84.3836, name: 'Promenade Midtown Garage', available: 38, total: 80, price: 5, isPremium: false, hasEVCharging: true, evConnectorTypes: ['j1772' as EVConnectorType], isCovered: true, securityLevel: 'standard', hasCameras: true, isReserved: false },
];

// Fix Leaflet's broken default icon paths in Vite builds
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Default center fallback — used only when no GPS coords are available
const DEFAULT_MAP_CENTER: [number, number] = [33.7866, -84.3833];

// Single controller inside MapContainer — handles recenter + zoom via state signals
function MapInteractionController({
  shouldRecenter, onRecentered,
  zoomDirection, onZoomed,
  center,
}: {
  shouldRecenter: boolean; onRecentered: () => void;
  zoomDirection: number; onZoomed: () => void;
  center: [number, number];
}) {
  const map = useMap();
  useEffect(() => {
    if (shouldRecenter) { map.setView(center, 14); onRecentered(); }
  }, [shouldRecenter, map, onRecentered, center]);
  useEffect(() => {
    if (zoomDirection === 1) { map.zoomIn(); onZoomed(); }
    else if (zoomDirection === -1) { map.zoomOut(); onZoomed(); }
  }, [zoomDirection, map, onZoomed]);
  return null;
}

function createParkingIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.9);box-shadow:0 2px 12px rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;cursor:pointer;line-height:1;">P</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    className: '',
  });
}


function createVenueIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#9333ea,#ec4899);border:2px solid rgba(255,255,255,0.8);box-shadow:0 2px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
    className: '',
  });
}

export function MapSection({ isDarkMode, selectedFunction, destination, onBookRide, userCoords }: MapSectionProps) {
  const mapCenter: [number, number] = userCoords ? [userCoords.lat, userCoords.lng] : DEFAULT_MAP_CENTER;
  const [parkingData, setParkingData] = useState<ParkingSpot[]>(FALLBACK_PARKING);
  const [showParkingSpots, setShowParkingSpots] = useState(true);
  const [showVenues, setShowVenues] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [showSpotDetails, setShowSpotDetails] = useState(false);
  const [routeDestination, setRouteDestination] = useState<string>(destination || '');
  const [showTrafficIntel, setShowTrafficIntel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [shouldRecenter, setShouldRecenter] = useState(false);
  const [zoomDirection, setZoomDirection] = useState(0);
  const [reservationSpot, setReservationSpot] = useState<any>(null);
  const [selectedMapVenue, setSelectedMapVenue] = useState<any>(null);

  // Refs so callbacks never close over stale values
  const parkingDataRef = useRef(parkingData);
  const selectedSpotRef = useRef(selectedSpot);
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 20],
    securityLevel: ['basic', 'standard', 'premium'],
    evChargingOnly: false,
    coveredOnly: false,
    showPremiumOnly: false,
  });

  // Keep refs in sync
  useEffect(() => { parkingDataRef.current = parkingData; }, [parkingData]);
  useEffect(() => { selectedSpotRef.current = selectedSpot; }, [selectedSpot]);

  const springConfig = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
  const { venues: apiVenues } = useVenues();

  const mapVenues: Venue[] = apiVenues.map((v, i) => ({
    id: i + 100, lat: v.lat, lng: v.lng, name: v.name, type: v.category, rating: 4.5,
  }));

  // Merge live API parking data into map pins
  useEffect(() => {
    if (!apiVenues.length) return;
    const liveSpots: ParkingSpot[] = [];
    let idCounter = 1000;
    apiVenues.forEach((venue) => {
      venue.parking.spots.forEach((spot: any) => {
        liveSpots.push({
          id: idCounter++,
          lat: venue.lat + (Math.random() - 0.5) * 0.001, // slight offset so pins don't stack
          lng: venue.lng + (Math.random() - 0.5) * 0.001,
          name: spot.name || `${venue.name} Parking`,
          available: spot.available,
          total: spot.capacity,
          price: spot.pricePerHr,
          isPremium: spot.pricePerHr >= 8,
          hasEVCharging: false,
          isCovered: true,
          securityLevel: spot.pricePerHr >= 8 ? 'premium' : 'standard',
          hasCameras: true,
          isReserved: false,
        });
      });
    });
    if (liveSpots.length > 0) setParkingData(liveSpots);
  }, [apiVenues]);

  useEffect(() => {
    if (destination) {
      setRouteDestination(destination);
      toast.success('Route Planning', { description: `Navigating to ${destination}`, duration: 2000 });
    }
  }, [destination]);

  useEffect(() => {
    if (!selectedFunction) return;

    const toasts: Record<string, string> = {
      'traffic-intelligence': 'Traffic Intelligence Active',
      'trending-hotspots': 'Trending Hotspots Active',
      'live-venue-data': 'Live Venue Data Active',
      'smart-parking': 'Smart Parking Mode Active',
      'ai-navigation': 'AI Navigation Premium Active',
      'spot-radar': 'Spot Radar Active',
    };

    // Apply functional behavior per mode
    switch (selectedFunction) {
      case 'smart-parking':
        setShowParkingSpots(true);
        setShowVenues(false);
        // Sort by best value: cheapest with availability
        setParkingData((prev) => [...prev].sort((a, b) => {
          if (a.available === 0 && b.available > 0) return 1;
          if (b.available === 0 && a.available > 0) return -1;
          return a.price - b.price;
        }));
        break;
      case 'live-venue-data':
        setShowVenues(true);
        setShowParkingSpots(true);
        break;
      case 'trending-hotspots':
        setShowVenues(true);
        setShowParkingSpots(false);
        break;
      case 'traffic-intelligence':
        setShowTrafficIntel(true);
        break;
      case 'spot-radar':
        setShowParkingSpots(true);
        setShowVenues(false);
        // Filter to only spots with availability
        setParkingData((prev) => prev.filter((s) => s.available > 0));
        break;
      default:
        break;
    }

    if (toasts[selectedFunction]) {
      toast.success(toasts[selectedFunction], { duration: 2000 });
    }
  }, [selectedFunction]);

  useEffect(() => {
    const interval = setInterval(() => {
      setParkingData(prev => prev.map((spot: ParkingSpot) => ({
        ...spot,
        available: Math.max(0, Math.min(spot.total, spot.available + Math.floor(Math.random() * 7) - 3)),
      })));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Stable reserve callback — reads from refs so never stale
  const handleSpotReserve = useCallback((spotId: number) => {
    const data = parkingDataRef.current;
    const spot = data.find((s: ParkingSpot) => s.id === spotId)
      || data.find((s: ParkingSpot) => s.id === selectedSpotRef.current);
    setShowSpotDetails(false);
    setSelectedSpot(null);
    if (spot) {
      setReservationSpot({
        id: spot.id.toString(),
        name: spot.name,
        address: '123 Peachtree St NE, Atlanta, GA',
        distance: 0.3,
        walkTime: 4,
        price: spot.price,
        availability: spot.available,
        total: spot.total,
        securityRating: spot.securityLevel === 'premium' ? 5 : spot.securityLevel === 'standard' ? 4 : 3,
        rating: 4.7,
        reviews: 128,
        features: [
          spot.hasEVCharging ? 'EV Charging' : null,
          spot.isCovered ? 'Covered' : null,
          spot.hasCameras ? 'Security Cameras' : null,
          spot.isPremium ? 'Premium' : null,
        ].filter(Boolean) as string[],
        iotEnabled: true,
      });
    }
  }, []);

  const getAvailabilityStatus = (spot: ParkingSpot): AvailabilityStatus => {
    const pct = (spot.available / spot.total) * 100;
    if (pct === 0) return 'full';
    if (pct < 25) return 'limited';
    return 'available';
  };

  const getColor = (status: AvailabilityStatus): string => {
    if (status === 'available') return '#10B981';
    if (status === 'limited') return '#F59E0B';
    return '#EF4444';
  };

  const filteredParkingSpots = parkingData.filter((spot: ParkingSpot) => {
    if (spot.price < filters.priceRange[0] || spot.price > filters.priceRange[1]) return false;
    if (!filters.securityLevel.includes(spot.securityLevel)) return false;
    if (filters.evChargingOnly && !spot.hasEVCharging) return false;
    if (filters.coveredOnly && !spot.isCovered) return false;
    if (filters.showPremiumOnly && !spot.isPremium) return false;
    return true;
  });

  return (
    <div className="relative w-full h-full" style={{ zIndex: 0 }}>
      {/* Real Leaflet Map */}
      <MapContainer
        center={mapCenter}
        zoom={14}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
        zoomControl={false}
      >
        {/* Tile Layer — CartoDB Dark Matter */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        <MapInteractionController
          shouldRecenter={shouldRecenter} onRecentered={() => setShouldRecenter(false)}
          zoomDirection={zoomDirection} onZoomed={() => setZoomDirection(0)}
          center={mapCenter}
        />

        {/* Parking Markers */}
        {showParkingSpots && filteredParkingSpots.map((spot: ParkingSpot) => {
          const status = getAvailabilityStatus(spot);
          const color = getColor(status);
          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={createParkingIcon(color)}
              eventHandlers={{ click: () => { setSelectedSpot(spot.id); setShowSpotDetails(true); } }}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{spot.name}</div>
                  <div style={{ color, fontWeight: 600 }}>{spot.available}/{spot.total} spots · ${spot.price}/hr</div>
                  {spot.isPremium && <div style={{ fontSize: 11, color: '#9333ea', marginTop: 2 }}>★ Premium</div>}
                  {spot.hasEVCharging && <div style={{ fontSize: 11, color: '#10B981', marginTop: 2 }}>⚡ EV Charging</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Venue Markers */}
        {showVenues && mapVenues.map((venue: Venue) => (
          <Marker key={venue.id} position={[venue.lat, venue.lng]} icon={createVenueIcon()}>
            <Popup>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{venue.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>{venue.type}</div>
            </Popup>
          </Marker>
        ))}

      </MapContainer>


      {/* Right Controls — Zoom + Recenter */}
      <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 z-[1000]">
        <motion.button
          onClick={() => setZoomDirection(1)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <motion.button
          onClick={() => setZoomDirection(-1)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Minus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <motion.button
          onClick={() => setShouldRecenter(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Target className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* Left Controls — Filters */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2">
        <motion.button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2.5 rounded-full flex items-center gap-2 bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <Filter className="w-4 h-4 text-white" strokeWidth={2.5} />
          <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>Filters</span>
          {(filters.evChargingOnly || filters.coveredOnly || filters.showPremiumOnly) && (
            <div className="w-2 h-2 rounded-full bg-purple-500" />
          )}
        </motion.button>
      </div>



      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <>
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFilters(false)}
            />

            {/* Filter Panel */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springConfig}
            >
              <div className="bg-[#1C1C1E]/95 backdrop-blur-2xl border-t-2 border-white/30 rounded-t-[28px] overflow-hidden shadow-2xl p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[20px] text-white" style={{ fontWeight: 700 }}>
                    Map Filters
                  </h3>
                  <motion.button
                    onClick={() => setShowFilters(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/30"
                    whileTap={{ scale: 0.9 }}
                  >
                    <X className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {/* Quick Toggles */}
                <div className="space-y-3 mb-6">
                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-green-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        EV Charging Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.evChargingOnly}
                      onChange={(e) => setFilters({ ...filters, evChargingOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Umbrella className="w-5 h-5 text-blue-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Covered Parking Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.coveredOnly}
                      onChange={(e) => setFilters({ ...filters, coveredOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Star className="w-5 h-5 text-purple-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Premium Spots Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.showPremiumOnly}
                      onChange={(e) => setFilters({ ...filters, showPremiumOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      Price Range
                    </span>
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      ${filters.priceRange[0]} - ${filters.priceRange[1]}/hr
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={filters.priceRange[1]}
                    onChange={(e) => setFilters({ ...filters, priceRange: [0, parseInt(e.target.value)] })}
                    className="w-full h-2 rounded-full bg-white/20"
                  />
                </div>

                {/* Apply Button */}
                <motion.button
                  onClick={() => {
                    setShowFilters(false);
                    toast.success('Filters applied', {
                      description: `Showing ${filteredParkingSpots.length} parking spots`,
                    });
                  }}
                  className="w-full py-3 rounded-[14px] bg-gradient-to-r from-purple-500 to-cyan-500 text-white"
                  style={{ fontWeight: 600 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  Apply Filters ({filteredParkingSpots.length} spots)
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Live Update Indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
        <motion.div
          className="px-3 py-1.5 rounded-full bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/30 shadow-xl flex items-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <motion.div
            className="w-2 h-2 rounded-full bg-green-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[11px] text-white/90" style={{ fontWeight: 500 }}>
            Live Updates Active
          </span>
        </motion.div>
      </div>

      {/* Route Planning Panel */}
      {selectedFunction === 'route' && (
        <motion.div 
          className="absolute bottom-4 left-4 right-4 z-50"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={springConfig}
        >
          <div className="p-4 rounded-[20px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-white/30 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white flex-1" style={{ fontWeight: 600 }}>
                Route Planning
              </h3>
              <motion.button
                onClick={() => setRouteDestination('')}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/30"
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
            
            {/* Destination Input */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-[14px] bg-white/10 border border-white/20">
                <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
                <input
                  type="text"
                  value={routeDestination}
                  onChange={(e) => setRouteDestination(e.target.value)}
                  placeholder="Enter destination..."
                  className="flex-1 bg-transparent text-[15px] outline-none text-white placeholder:text-white/50"
                  style={{ fontWeight: 400 }}
                />
              </div>
              
              {routeDestination && (
                <motion.button
                  onClick={() => {
                    toast.success('Starting Navigation', {
                      description: `Calculating route to ${routeDestination}`,
                      duration: 2000,
                    });
                  }}
                  className="w-full py-3 rounded-[14px] bg-gradient-to-r from-green-500 to-emerald-500 border-2 border-white/30 shadow-lg"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Start Navigation
                  </span>
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Legend */}
      {selectedFunction !== 'route' && (
        <div className="absolute bottom-4 right-4 z-50">
          <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/30 shadow-xl">
            <div className="space-y-1.5">
              {[
                { color: '#10B981', label: 'Available' },
                { color: '#F59E0B', label: 'Limited' },
                { color: '#EF4444', label: 'Full' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[11px] text-white/90" style={{ fontWeight: 500 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Parking Spot Details Panel */}
      <ParkingSpotDetails
        spot={selectedSpot ? parkingData.find(s => s.id === selectedSpot) || null : null}
        isOpen={showSpotDetails}
        onClose={() => {
          setShowSpotDetails(false);
          setSelectedSpot(null);
        }}
        onReserve={handleSpotReserve}
        onNavigate={(spotId) => {
          setShowSpotDetails(false);
          toast.success('Navigation Started', {
            description: 'Opening navigation app...',
            duration: 2000,
          });
        }}
        isDarkMode={isDarkMode}
      />

      {/* Traffic Intelligence Panel */}
      <TrafficIntelligencePanel
        isDarkMode={isDarkMode}
        isExpanded={showTrafficIntel || selectedFunction === 'traffic-intelligence'}
        onToggle={() => setShowTrafficIntel(!showTrafficIntel)}
      />

      {/* Parking Reservation Flow — portal escapes Leaflet z-index stacking */}
      {createPortal(
        <AnimatePresence>
          {reservationSpot && (
            <ParkingReservationFlow
              spot={reservationSpot}
              isDarkMode={isDarkMode}
              onClose={() => setReservationSpot(null)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
