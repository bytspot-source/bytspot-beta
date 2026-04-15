import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation, Star, Plus, Minus, Target,
  Zap, Umbrella, Filter, X,
  MapPin, ChevronRight, Send,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { MapFunction, MapViewMode } from './MapMenuSlideUp';
import { toast } from 'sonner@2.0.3';
import { ParkingSpotDetails } from './ParkingSpotDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
import { TrafficIntelligencePanel } from './TrafficIntelligencePanel';
import { VenueDetails } from './VenueDetails';
import { useVenues, venueToCard } from '../utils/hooks/useVenues';
import { getTrendingVenueIds } from '../utils/venueHours';
import type { ApiVenue } from '../utils/trpc';

interface MapSectionProps {
  isDarkMode: boolean;
  selectedFunction?: MapFunction;
  viewMode?: MapViewMode;
  destination?: string;
  onBackToHome?: () => void;
  onBookRide?: (venue?: { name: string; lat?: number; lng?: number }) => void;
  onOpenAccessWallet?: () => void;
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

// ⚠️ PLACEHOLDER: Hardcoded Atlanta Midtown parking demo data.
// TODO: Replace with real parking API data when backend parking endpoints exist.
const ATLANTA_PARKING: ParkingSpot[] = [
  {
    id: 1, lat: 33.7844, lng: -84.3862, name: '1380 W Peachtree Garage',
    available: 22, total: 45, price: 8, isPremium: true,
    hasEVCharging: true, evConnectorTypes: ['ccs' as EVConnectorType],
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
  },
  {
    id: 2, lat: 33.7852, lng: -84.3845, name: 'Colony Square Garage',
    available: 14, total: 60, price: 6, isPremium: false,
    hasEVCharging: false, isCovered: true, securityLevel: 'standard', hasCameras: true, isReserved: false,
  },
  {
    id: 3, lat: 33.7883, lng: -84.3836, name: 'Promenade Midtown Garage',
    available: 38, total: 80, price: 5, isPremium: false,
    hasEVCharging: true, evConnectorTypes: ['j1772' as EVConnectorType],
    isCovered: true, securityLevel: 'standard', hasCameras: true, isReserved: false,
  },
  {
    id: 4, lat: 33.7896, lng: -84.3860, name: 'Midtown Place Parking',
    available: 0, total: 35, price: 10, isPremium: true,
    hasEVCharging: true, evConnectorTypes: ['tesla' as EVConnectorType, 'ccs' as EVConnectorType],
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
  },
  {
    id: 5, lat: 33.7904, lng: -84.3847, name: 'Arts Center MARTA Garage',
    available: 28, total: 50, price: 7, isPremium: false,
    hasEVCharging: false, isCovered: false, securityLevel: 'standard', hasCameras: true, isReserved: false,
  },
  {
    id: 6, lat: 33.7727, lng: -84.3876, name: 'Fox Theatre Parking',
    available: 12, total: 30, price: 9, isPremium: true,
    hasEVCharging: false, isCovered: false, securityLevel: 'premium', hasCameras: true, isReserved: true,
  },
  {
    id: 7, lat: 33.7780, lng: -84.3849, name: 'Biltmore Hotel Garage',
    available: 5, total: 25, price: 12, isPremium: true,
    hasEVCharging: true, evConnectorTypes: ['tesla' as EVConnectorType],
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
  },
  {
    id: 8, lat: 33.7859, lng: -84.3857, name: 'Pershing Point Garage',
    available: 18, total: 40, price: 6, isPremium: false,
    hasEVCharging: false, isCovered: false, securityLevel: 'basic', hasCameras: false, isReserved: false,
  },
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

// Shared CSS keyframes injected once
const PULSE_STYLE_ID = 'bytspot-pulse-css';
if (typeof document !== 'undefined' && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes bytspot-pulse { 0%{transform:scale(1);opacity:.7} 70%{transform:scale(2.2);opacity:0} 100%{transform:scale(2.2);opacity:0} }
    @keyframes bytspot-pulse-slow { 0%{transform:scale(1);opacity:.5} 70%{transform:scale(2.4);opacity:0} 100%{transform:scale(2.4);opacity:0} }
    @keyframes bytspot-trend { 0%{transform:scale(1);opacity:.85} 50%{transform:scale(2.8);opacity:0} 100%{transform:scale(2.8);opacity:0} }
    .byt-pulse-ring{position:absolute;inset:-6px;border-radius:50%;animation:bytspot-pulse 2s ease-out infinite;}
    .byt-pulse-ring-slow{position:absolute;inset:-5px;border-radius:50%;animation:bytspot-pulse-slow 3s ease-out infinite;}
    .byt-trend-pulse{position:absolute;inset:-9px;border-radius:50%;animation:bytspot-trend 1.1s ease-out infinite;}
  `;
  document.head.appendChild(style);
}

function createParkingIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="position:relative;width:32px;height:32px;">
      <div class="byt-pulse-ring" style="border:2px solid ${color};"></div>
      <div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.9);box-shadow:0 2px 12px rgba(0,0,0,0.7),0 0 20px ${color}44;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;cursor:pointer;line-height:1;">P</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    className: '',
  });
}

/** Vibe-level → hex color. Mirrors the 1-4 scale from crowdSimulator.ts. */
const VIBE_COLORS: Record<number, string> = {
  1: '#10B981', // Chill  — green
  2: '#EAB308', // Active — yellow
  3: '#F97316', // Busy   — orange
  4: '#EF4444', // Packed — red
};

/**
 * Vibe-driven marker icon:
 *   level    — 1-4 crowd level from Vibe Engine
 *   isPaid   — shows amber price badge on marker
 *   isTrending — faster, larger pulse ring for high check-in velocity venues
 *   priceBadge — e.g. "$20" text in the badge
 */
function createVibeMarkerIcon(
  level: number,
  isPaid: boolean,
  isTrending: boolean,
  priceBadge?: string | null,
): L.DivIcon {
  const color = VIBE_COLORS[level] ?? '#9333ea';
  const size = isTrending ? 34 : 28;
  const anchor = Math.floor(size / 2);
  const pulseClass = isTrending ? 'byt-trend-pulse' : 'byt-pulse-ring-slow';
  const priceBadgeHtml = isPaid
    ? `<div style="position:absolute;top:-7px;right:-8px;background:#F59E0B;color:white;font-size:8px;font-weight:800;padding:1px 4px;border-radius:5px;border:1.5px solid rgba(255,255,255,0.9);white-space:nowrap;line-height:1.5;">${priceBadge ?? '$'}</div>`
    : '';
  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div class="${pulseClass}" style="border:2px solid ${color};"></div>
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.92);box-shadow:0 2px 12px rgba(0,0,0,0.7),0 0 18px ${color}55;display:flex;align-items:center;justify-content:center;cursor:pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>
      </div>
      ${priceBadgeHtml}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -(anchor + 2)],
    className: '',
  });
}

// Community Report icons
type ReportType = 'accident' | 'closure' | 'police' | 'hazard' | 'construction';
interface CommunityReport {
  id: number; lat: number; lng: number; type: ReportType;
  description: string; reportedBy: string; timeAgo: string; upvotes: number;
}

const REPORT_ICONS: Record<ReportType, { emoji: string; color: string }> = {
  accident: { emoji: '🚨', color: '#EF4444' },
  closure: { emoji: '🚧', color: '#F59E0B' },
  police: { emoji: '👮', color: '#3B82F6' },
  hazard: { emoji: '⚠️', color: '#F97316' },
  construction: { emoji: '🔨', color: '#8B5CF6' },
};

const COMMUNITY_REPORTS: CommunityReport[] = [
  { id: 101, lat: 33.7870, lng: -84.3850, type: 'accident', description: 'Minor fender bender, right lane blocked', reportedBy: 'Alex M.', timeAgo: '5 min ago', upvotes: 12 },
  { id: 102, lat: 33.7830, lng: -84.3880, type: 'closure', description: 'Road closed for construction until 6 PM', reportedBy: 'Jordan K.', timeAgo: '22 min ago', upvotes: 34 },
  { id: 103, lat: 33.7900, lng: -84.3840, type: 'police', description: 'Speed trap on Peachtree near 14th', reportedBy: 'Sam W.', timeAgo: '8 min ago', upvotes: 45 },
  { id: 104, lat: 33.7780, lng: -84.3870, type: 'hazard', description: 'Large pothole in right lane', reportedBy: 'Chris D.', timeAgo: '1 hr ago', upvotes: 8 },
  { id: 105, lat: 33.7855, lng: -84.3820, type: 'construction', description: 'Lane shift ahead, expect delays', reportedBy: 'Taylor R.', timeAgo: '15 min ago', upvotes: 19 },
];

function createReportIcon(type: ReportType): L.DivIcon {
  const { emoji, color } = REPORT_ICONS[type];
  return L.divIcon({
    html: `<div style="position:relative;width:30px;height:30px;">
      <div class="byt-pulse-ring" style="border:2px solid ${color};"></div>
      <div style="width:30px;height:30px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;">${emoji}</div>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -17],
    className: '',
  });
}

// Live Events & Vibes
interface LiveEvent {
  id: number; lat: number; lng: number; name: string;
  type: 'concert' | 'food' | 'party' | 'sports' | 'market';
  crowd: 'low' | 'medium' | 'high'; description: string; time: string;
}

const EVENT_ICONS: Record<LiveEvent['type'], { emoji: string; color: string }> = {
  concert: { emoji: '🎵', color: '#EC4899' },
  food: { emoji: '🍔', color: '#F59E0B' },
  party: { emoji: '🎉', color: '#8B5CF6' },
  sports: { emoji: '⚽', color: '#10B981' },
  market: { emoji: '🛍️', color: '#06B6D4' },
};

const LIVE_EVENTS: LiveEvent[] = [
  { id: 201, lat: 33.7890, lng: -84.3870, name: 'Midtown Music Fest', type: 'concert', crowd: 'high', description: 'Live DJ set at Piedmont Park entrance', time: '8 PM - 12 AM' },
  { id: 202, lat: 33.7810, lng: -84.3855, name: 'ATL Food Truck Rally', type: 'food', crowd: 'medium', description: '12 food trucks on 10th Street', time: '11 AM - 9 PM' },
  { id: 203, lat: 33.7860, lng: -84.3895, name: 'Rooftop Block Party', type: 'party', crowd: 'high', description: 'Colony Square rooftop party', time: '7 PM - 2 AM' },
  { id: 204, lat: 33.7920, lng: -84.3860, name: 'Pickup Soccer', type: 'sports', crowd: 'low', description: 'Open pickup game at the park', time: '5 PM - 7 PM' },
  { id: 205, lat: 33.7750, lng: -84.3840, name: 'Artisan Market', type: 'market', crowd: 'medium', description: 'Local artisans and crafts', time: '10 AM - 6 PM' },
];

function createEventIcon(type: LiveEvent['type']): L.DivIcon {
  const { emoji, color } = EVENT_ICONS[type];
  return L.divIcon({
    html: `<div style="position:relative;width:34px;height:34px;">
      <div class="byt-pulse-ring-slow" style="border:2px solid ${color};"></div>
      <div style="width:34px;height:34px;border-radius:12px;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;">${emoji}</div>
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -19],
    className: '',
  });
}

const CROWD_COLORS: Record<LiveEvent['crowd'], string> = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' };

/** Open native navigation — Google Maps on Android/web, Apple Maps on iOS */
function openNativeNavigation(lat: number, lng: number, label?: string) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, '_system');
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${label ? `&destination_place_id=${encodeURIComponent(label)}` : ''}`, '_blank');
  }
}

export function MapSection({ isDarkMode, selectedFunction, destination, onBookRide, onOpenAccessWallet, userCoords }: MapSectionProps) {
  const mapCenter: [number, number] = userCoords ? [userCoords.lat, userCoords.lng] : DEFAULT_MAP_CENTER;
  const [parkingData, setParkingData] = useState<ParkingSpot[]>(ATLANTA_PARKING);
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
  // Community reports & live vibes/events layers
  const [showReports, setShowReports] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showReportForm, setShowReportForm] = useState(false);
  const [newReportType, setNewReportType] = useState<ReportType>('hazard');
  const [newReportDesc, setNewReportDesc] = useState('');
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>(COMMUNITY_REPORTS);

  // ─── Vibe-centric filter state ─────────────────────────────────────────────
  const [vibeFilter, setVibeFilter] = useState<number | null>(null);         // 1|2|3|4|null
  const [entryFilter, setEntryFilter] = useState<'free' | 'paid' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // 'dining'|'nightlife'|'coffee'|'parks'|null
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [peekVenue, setPeekVenue] = useState<ApiVenue | null>(null);
  const [venueDetailsVenue, setVenueDetailsVenue] = useState<ApiVenue | null>(null);

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

  // Venues that have high check-in velocity in the last hour
  const trendingIds = useMemo(() => getTrendingVenueIds(), []);

  // Apply vibe / entry / category filters to the full ApiVenue list
  const filteredMapVenues = useMemo<ApiVenue[]>(() => {
    const CAT_MAP: Record<string, string[]> = {
      dining:    ['restaurant', 'food', 'dining'],
      nightlife: ['bar', 'club', 'nightlife', 'lounge'],
      coffee:    ['coffee', 'cafe', 'bakery'],
      parks:     ['park', 'outdoor', 'garden'],
    };
    return apiVenues.filter(v => {
      if (vibeFilter !== null && (v.crowd?.level ?? 0) !== vibeFilter) return false;
      if (entryFilter !== null && ((v as any).entryType ?? 'free') !== entryFilter) return false;
      if (categoryFilter !== null) {
        const cat = (v.category ?? '').toLowerCase();
        const allowed = CAT_MAP[categoryFilter] ?? [categoryFilter];
        if (!allowed.some(a => cat.includes(a))) return false;
      }
      return true;
    });
  }, [apiVenues, vibeFilter, entryFilter, categoryFilter]);

  useEffect(() => {
    if (destination) {
      setRouteDestination(destination);
      toast.success('Route Planning', { description: `Navigating to ${destination}`, duration: 2000 });
    }
  }, [destination]);

  useEffect(() => {
    const toasts: Record<string, string> = {
      'traffic-intelligence': 'Traffic Intelligence Active',
      'trending-hotspots': 'Trending Hotspots Active',
      'live-venue-data': 'Live Venue Data Active',
      'smart-parking': 'Smart Parking Mode Active',
      'ai-navigation': 'AI Navigation Premium Active',
      'spot-radar': 'Spot Radar Active',
    };
    if (selectedFunction && toasts[selectedFunction]) {
      if (selectedFunction === 'traffic-intelligence') setShowTrafficIntel(true);
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

        {/* ── Vibe Heatmap Overlay — Busy/Packed venues cast a colour glow ── */}
        {showHeatmap && filteredMapVenues
          .filter(v => (v.crowd?.level ?? 0) >= 3)
          .map(v => (
            <Circle
              key={`heat-${v.id}`}
              center={[v.lat, v.lng]}
              radius={220}
              pathOptions={{
                fillColor: v.crowd?.level === 4 ? '#EF4444' : '#F97316',
                fillOpacity: 0.13,
                stroke: false,
              }}
            />
          ))
        }

        {/* ── Venue Markers — vibe-coloured, entry-badged, trending-pulsed ── */}
        {showVenues && filteredMapVenues.map((v) => {
          const level = v.crowd?.level ?? 1;
          const isPaid = (v as any).entryType === 'paid';
          const isTrending = trendingIds.has(v.id ?? '') || trendingIds.has(v.name);
          return (
            <Marker
              key={v.id}
              position={[v.lat, v.lng]}
              icon={createVibeMarkerIcon(level, isPaid, isTrending, (v as any).entryPrice)}
              eventHandlers={{
                click: () => {
                  setPeekVenue(v);
                  setVenueDetailsVenue(null);
                },
              }}
            />
          );
        })}

        {/* Community Report Markers */}
        {showReports && communityReports.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={createReportIcon(r.type)}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{REPORT_ICONS[r.type].emoji} {r.type.charAt(0).toUpperCase() + r.type.slice(1)}</div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{r.description}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{r.reportedBy} · {r.timeAgo} · 👍 {r.upvotes}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Live Event Markers */}
        {showEvents && LIVE_EVENTS.map((ev) => (
          <Marker key={ev.id} position={[ev.lat, ev.lng]} icon={createEventIcon(ev.type)}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{EVENT_ICONS[ev.type].emoji} {ev.name}</div>
                <div style={{ fontSize: 12, marginBottom: 2 }}>{ev.description}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>🕐 {ev.time}</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  Crowd: <span style={{ color: CROWD_COLORS[ev.crowd], fontWeight: 600 }}>{ev.crowd.toUpperCase()}</span>
                </div>
              </div>
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
        {/* Traffic Intelligence toggle */}
        <motion.button
          onClick={() => setShowTrafficIntel(!showTrafficIntel)}
          className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border-2 shadow-xl transition-colors ${showTrafficIntel ? 'bg-amber-500/90 border-amber-300/60' : 'bg-[#1C1C1E]/95 border-white/30'}`}
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
          title="Traffic Intelligence"
        >
          <Zap className={`w-5 h-5 ${showTrafficIntel ? 'text-white' : 'text-amber-400'}`} strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* ── Vibe Filter Bar — horizontal scroll, full width ── */}
      <div className="absolute top-4 left-3 right-3 z-[1000]">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

          {/* ─ Vibe chips ─ */}
          {([
            { label: 'All Vibes', value: null,  emoji: '✨' },
            { label: 'Chill',     value: 1,     emoji: '🟢' },
            { label: 'Active',    value: 2,     emoji: '🟡' },
            { label: 'Busy',      value: 3,     emoji: '🟠' },
            { label: 'Packed',    value: 4,     emoji: '🔴' },
          ] as { label: string; value: number | null; emoji: string }[]).map(chip => (
            <motion.button
              key={chip.label}
              onClick={() => setVibeFilter(vibeFilter === chip.value ? null : chip.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
                vibeFilter === chip.value
                  ? 'bg-white/20 border-white/70 text-white'
                  : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
              }`}
              style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
              whileTap={{ scale: 0.93 }}
            >
              {chip.emoji} {chip.label}
            </motion.button>
          ))}

          <div className="flex-shrink-0 w-px bg-white/18 my-1" />

          {/* ─ Entry chips ─ */}
          {([
            { label: 'Free', value: 'free' as const, emoji: '✅' },
            { label: 'Paid', value: 'paid' as const, emoji: '💰' },
          ]).map(chip => (
            <motion.button
              key={chip.label}
              onClick={() => setEntryFilter(entryFilter === chip.value ? null : chip.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
                entryFilter === chip.value
                  ? 'bg-amber-500/30 border-amber-400/70 text-amber-200'
                  : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
              }`}
              style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
              whileTap={{ scale: 0.93 }}
            >
              {chip.emoji} {chip.label}
            </motion.button>
          ))}

          <div className="flex-shrink-0 w-px bg-white/18 my-1" />

          {/* ─ Category chips ─ */}
          {([
            { label: 'Dining',    value: 'dining',    emoji: '🍽️' },
            { label: 'Nightlife', value: 'nightlife', emoji: '🍸' },
            { label: 'Coffee',    value: 'coffee',    emoji: '☕' },
            { label: 'Parks',     value: 'parks',     emoji: '🌳' },
          ]).map(chip => (
            <motion.button
              key={chip.label}
              onClick={() => setCategoryFilter(categoryFilter === chip.value ? null : chip.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
                categoryFilter === chip.value
                  ? 'bg-purple-500/30 border-purple-400/70 text-purple-200'
                  : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
              }`}
              style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
              whileTap={{ scale: 0.93 }}
            >
              {chip.emoji} {chip.label}
            </motion.button>
          ))}

          <div className="flex-shrink-0 w-px bg-white/18 my-1" />

          {/* ─ Layer toggles ─ */}
          <motion.button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
              showHeatmap ? 'bg-red-500/25 border-red-400/60 text-red-300' : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
            }`}
            style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            whileTap={{ scale: 0.93 }}
          >
            🌡️ Heatmap
          </motion.button>
          <motion.button
            onClick={() => setShowReports(!showReports)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
              showReports ? 'bg-red-500/25 border-red-400/60 text-red-300' : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
            }`}
            style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            whileTap={{ scale: 0.93 }}
          >
            ⚠️ Reports
          </motion.button>
          <motion.button
            onClick={() => setShowEvents(!showEvents)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
              showEvents ? 'bg-purple-500/25 border-purple-400/60 text-purple-300' : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
            }`}
            style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            whileTap={{ scale: 0.93 }}
          >
            🎶 Vibes
          </motion.button>
          <motion.button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
              (filters.evChargingOnly || filters.coveredOnly || filters.showPremiumOnly)
                ? 'bg-blue-500/25 border-blue-400/60 text-blue-300'
                : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
            }`}
            style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            whileTap={{ scale: 0.93 }}
          >
            <Filter className="inline w-3 h-3 mr-1" strokeWidth={2.5} />
            Parking
            {(filters.evChargingOnly || filters.coveredOnly || filters.showPremiumOnly) && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Report FAB — bottom-right, clear of filter bar */}
      <div className="fixed bottom-28 right-4 z-[1001]">
        <motion.button
          onClick={() => setShowReportForm(!showReportForm)}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-red-500 to-orange-500 border-2 border-white/40 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
          animate={{ boxShadow: showReportForm ? '0 0 20px rgba(239,68,68,0.5)' : '0 4px 12px rgba(0,0,0,0.4)' }}
          title="Community Report"
        >
          <Send className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* Community Report Form — slides up from bottom-right */}
      <AnimatePresence>
        {showReportForm && (
          <motion.div
            className="fixed bottom-44 right-4 w-72 z-[1002]"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
          >
            <div className="p-4 rounded-[20px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] text-white" style={{ fontWeight: 700 }}>📋 Community Report</h3>
                <motion.button onClick={() => setShowReportForm(false)} whileTap={{ scale: 0.9 }}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 border border-white/30">
                  <X className="w-3.5 h-3.5 text-white" />
                </motion.button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(Object.entries(REPORT_ICONS) as [ReportType, { emoji: string; color: string }][]).map(([key, { emoji, color }]) => (
                  <motion.button key={key}
                    onClick={() => setNewReportType(key)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] border ${newReportType === key ? 'border-white/60' : 'border-white/20'}`}
                    style={{ background: newReportType === key ? `${color}33` : 'rgba(255,255,255,0.05)', fontWeight: 600, color: 'white' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {emoji} {key}
                  </motion.button>
                ))}
              </div>
              <input
                type="text" value={newReportDesc} onChange={(e) => setNewReportDesc(e.target.value)}
                placeholder="What's happening?" className="w-full p-2.5 rounded-[12px] bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 outline-none mb-3"
              />
              <motion.button
                onClick={() => {
                  if (!newReportDesc.trim()) return;
                  const newReport: CommunityReport = {
                    id: Date.now(), lat: mapCenter[0] + (Math.random() - 0.5) * 0.005,
                    lng: mapCenter[1] + (Math.random() - 0.5) * 0.005, type: newReportType,
                    description: newReportDesc, reportedBy: 'You', timeAgo: 'Just now', upvotes: 0,
                  };
                  setCommunityReports(prev => [newReport, ...prev]);
                  setNewReportDesc(''); setShowReportForm(false);
                  toast.success('Report submitted', { description: `${REPORT_ICONS[newReportType].emoji} ${newReportDesc}` });
                }}
                className="w-full py-2.5 rounded-[12px] bg-gradient-to-r from-red-500 to-orange-500 text-white text-[14px] border border-white/30"
                style={{ fontWeight: 600 }} whileTap={{ scale: 0.98 }}
              >
                Submit Report
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    // Try to find a matching parking spot or venue for coordinates
                    const matchedSpot = parkingData.find(s => s.name.toLowerCase().includes(routeDestination.toLowerCase()));
                    if (matchedSpot) {
                      openNativeNavigation(matchedSpot.lat, matchedSpot.lng, matchedSpot.name);
                    } else {
                      // Fallback: open Google Maps search for the destination
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeDestination)}`, '_blank');
                    }
                    toast.success('Opening Navigation', { description: `Routing to ${routeDestination}`, duration: 2000 });
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
          const spot = parkingData.find(s => s.id === spotId);
          setShowSpotDetails(false);
          if (spot) {
            openNativeNavigation(spot.lat, spot.lng, spot.name);
          }
          toast.success('Navigation Started', { description: 'Opening maps app...', duration: 2000 });
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

      {/* ── Venue Peek Sheet — slides up when a vibe marker is tapped ── */}
      <AnimatePresence>
        {peekVenue && !venueDetailsVenue && (
          <motion.div
            className="absolute bottom-24 left-3 right-3 z-[1002]"
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          >
            <div className="rounded-[22px] bg-[#1C1C1E]/96 backdrop-blur-2xl border border-white/18 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between p-4 pb-3">
                <div className="flex-1 min-w-0">
                  {/* Vibe + Entry badges */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {(() => {
                      const lvl = peekVenue.crowd?.level ?? 1;
                      const badgeClass =
                        lvl === 4 ? 'bg-red-500/30 text-red-300' :
                        lvl === 3 ? 'bg-orange-500/30 text-orange-300' :
                        lvl === 2 ? 'bg-yellow-500/30 text-yellow-300' :
                                    'bg-green-500/30 text-green-300';
                      const emoji = lvl === 4 ? '🔴' : lvl === 3 ? '🟠' : lvl === 2 ? '🟡' : '🟢';
                      return (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${badgeClass}`}>
                          {emoji} {peekVenue.crowd?.label ?? 'Chill'}
                        </span>
                      );
                    })()}
                    {(peekVenue as any).entryType === 'paid' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 font-bold">
                        {(peekVenue as any).entryPrice ?? 'Paid'}
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 font-bold">
                        FREE
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <h3 className="text-[17px] text-white font-semibold leading-tight truncate">
                    {peekVenue.name}
                  </h3>
                  {/* Subtitle */}
                  <p className="text-[12px] text-white/50 mt-0.5 capitalize">
                    {peekVenue.category}
                    {peekVenue.crowd?.waitMins ? ` · ~${peekVenue.crowd.waitMins}m wait` : ' · No wait'}
                  </p>
                </div>
                {/* Dismiss */}
                <motion.button
                  onClick={() => setPeekVenue(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 border border-white/20 ml-3 flex-shrink-0 mt-0.5"
                  whileTap={{ scale: 0.88 }}
                >
                  <X className="w-3.5 h-3.5 text-white/70" />
                </motion.button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 px-4 pb-4">
                <motion.button
                  onClick={() => openNativeNavigation(peekVenue.lat, peekVenue.lng, peekVenue.name)}
                  className="flex-1 py-2.5 rounded-[14px] bg-white/10 border border-white/20 text-[13px] text-white/80 font-semibold flex items-center justify-center gap-1.5"
                  whileTap={{ scale: 0.96 }}
                >
                  <Navigation className="w-3.5 h-3.5" strokeWidth={2.5} />
                  Navigate
                </motion.button>
                <motion.button
                  onClick={() => setVenueDetailsVenue(peekVenue)}
                  className="flex-1 py-2.5 rounded-[14px] bg-purple-600/70 border border-purple-400/50 text-[13px] text-white font-bold flex items-center justify-center gap-1.5"
                  whileTap={{ scale: 0.96 }}
                >
                  View Details
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full Venue Details (opened from peek sheet) ── */}
      <AnimatePresence>
        {venueDetailsVenue && (
          <VenueDetails
            venue={venueToCard(venueDetailsVenue, 0, userCoords)}
            isDarkMode={true}
            onClose={() => { setVenueDetailsVenue(null); setPeekVenue(null); }}
            onOpenAccessWallet={onOpenAccessWallet}
            onNavigateToMap={() => {}}
            onBookRide={() => onBookRide?.({
              name: venueDetailsVenue.name,
              lat: venueDetailsVenue.lat,
              lng: venueDetailsVenue.lng,
            })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
