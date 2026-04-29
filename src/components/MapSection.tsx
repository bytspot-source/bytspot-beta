import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation, Star, Plus, Minus, Target,
  Zap, Umbrella, Filter, X,
  MapPin, ChevronRight, Send, QrCode,
  Lock, Sparkles, Wifi,
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
import { trpc, type ApiVenue } from '../utils/trpc';
import { VirtualPatchScannerSheet } from './VirtualPatchScannerSheet';
import { AITransparencyNotice } from './AITransparencyNotice';
import { buildVerifiedVirtualPatchContext, type VirtualPatchAuditEvent, type VirtualPatchContext, type VirtualPatchScanVerification, VIRTUAL_PATCH_CONTEXT_KEY } from '../utils/virtualPatch';
import { filterMapVenues, hasHardwarePatchInstalled, isBikeStation } from '../utils/mapVenues';
import {
  FALLBACK_ATLANTA_PARKING,
  mergeParkingSources,
  placeToParkingSpot,
  venueToParkingSpot,
  type MapParkingSpot,
} from '../utils/mapParking';

type LeafletDefaultIconPrototype = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown };

type ReservationSpot = {
  id: string;
  name: string;
  address: string;
  distance: number;
  walkTime: number;
  price: number;
  availability: number;
  total: number;
  securityRating: number;
  rating: number;
  reviews: number;
  features: string[];
  iotEnabled: boolean;
  lastUpdate?: Date | string;
};

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
  /** Audit log sink (NIST PR.PT-1). Wired by App.tsx to the durable audit pipeline. */
  onAuditEvent?: (event: VirtualPatchAuditEvent) => void;
  /** Universal-link / App Clip handoff — auto-opens the scanner with this patch pre-filled. */
  pendingPatchScan?: { patchId: string; venueName?: string } | null;
  /** Called once the pending scan has been delivered to the scanner so App.tsx can clear it. */
  onPendingPatchScanConsumed?: () => void;
}

type AvailabilityStatus = 'available' | 'limited' | 'full';

// ParkingSpot definition lives in src/utils/mapParking.ts. Local alias keeps
// existing call sites compiling while the helpers do the heavy lifting.
type ParkingSpot = MapParkingSpot;
type SecurityLevel = MapParkingSpot['securityLevel'];

interface FilterState {
  priceRange: [number, number]; // min, max price per hour
  securityLevel: SecurityLevel[];
  evChargingOnly: boolean;
  coveredOnly: boolean;
  showPremiumOnly: boolean;
}

// Tiered parking strategy: vendor-reported (apiVenues) → Google Places nearby
// → static fallback. See src/utils/mapParking.ts for the merge logic.

// Fix Leaflet's broken default icon paths in Vite builds
delete (L.Icon.Default.prototype as LeafletDefaultIconPrototype)._getIconUrl;
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
    @keyframes bytspot-verified-glow { 0%,100%{transform:scale(1);opacity:.45} 50%{transform:scale(1.24);opacity:.12} }
    @keyframes bytspot-verified-ring { 0%{transform:scale(.98);opacity:.8} 70%{transform:scale(1.75);opacity:0} 100%{transform:scale(1.75);opacity:0} }
    @keyframes bytspot-marker-in { 0%{opacity:0;transform:scale(.55) translateY(4px)} 60%{opacity:1;transform:scale(1.06) translateY(0)} 100%{opacity:1;transform:scale(1) translateY(0)} }
    .byt-pulse-ring{position:absolute;inset:-6px;border-radius:50%;animation:bytspot-pulse 2s ease-out infinite;}
    .byt-pulse-ring-slow{position:absolute;inset:-5px;border-radius:50%;animation:bytspot-pulse-slow 3s ease-out infinite;}
    .byt-trend-pulse{position:absolute;inset:-9px;border-radius:50%;animation:bytspot-trend 1.1s ease-out infinite;}
    .byt-verified-glow{position:absolute;inset:-12px;border-radius:50%;background:radial-gradient(circle, rgba(34,211,238,.45) 0%, rgba(124,58,237,.24) 44%, rgba(236,72,153,0) 74%);animation:bytspot-verified-glow 2.6s ease-in-out infinite;}
    .byt-verified-ring{position:absolute;inset:-9px;border-radius:50%;border:2px solid rgba(103,232,249,.85);box-shadow:0 0 20px rgba(34,211,238,.45),0 0 28px rgba(124,58,237,.22);animation:bytspot-verified-ring 1.85s ease-out infinite;}
    .byt-marker-in{animation:bytspot-marker-in 320ms cubic-bezier(.2,.8,.25,1.05) both;transform-origin:center bottom;}
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

/** eBike / bike-share station marker — squared teal badge keeps it visually
 *  distinct from circular parking pins and rounded venue tiles. */
function createEBikeIcon(): L.DivIcon {
  const color = '#14B8A6'; // teal-500
  return L.divIcon({
    html: `<div style="position:relative;width:32px;height:32px;">
      <div class="byt-pulse-ring" style="border:2px solid ${color};border-radius:8px;"></div>
      <div style="width:32px;height:32px;border-radius:8px;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 12px rgba(0,0,0,0.7),0 0 18px ${color}55;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;line-height:1;">🚲</div>
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
  isVerified: boolean = false,
): L.DivIcon {
  const color = VIBE_COLORS[level] ?? '#9333ea';
  const size = isVerified ? (isTrending ? 38 : 34) : (isTrending ? 34 : 28);
  const anchor = Math.floor(size / 2);
  const pulseClass = isTrending ? 'byt-trend-pulse' : 'byt-pulse-ring-slow';
  const priceBadgeHtml = isPaid
    ? `<div style="position:absolute;top:-7px;right:-8px;background:#F59E0B;color:white;font-size:8px;font-weight:800;padding:1px 4px;border-radius:5px;border:1.5px solid rgba(255,255,255,0.9);white-space:nowrap;line-height:1.5;">${priceBadge ?? '$'}</div>`
    : '';
  const verifiedGlowHtml = isVerified
    ? `<div class="byt-verified-glow"></div>
       <div class="byt-verified-ring"></div>
       <div style="position:absolute;top:-6px;left:-6px;width:15px;height:15px;border-radius:50%;background:linear-gradient(135deg,#22d3ee,#8b5cf6);border:1.5px solid rgba(255,255,255,0.95);box-shadow:0 0 14px rgba(34,211,238,0.48);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:900;line-height:1;">✓</div>
       <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);padding:1px 5px;border-radius:999px;background:rgba(3,7,18,0.92);border:1px solid rgba(103,232,249,0.55);color:#a5f3fc;font-size:7px;font-weight:900;letter-spacing:.08em;line-height:1.35;white-space:nowrap;">BYT</div>`
    : '';
  return L.divIcon({
    html: `<div class="byt-marker-in" style="position:relative;width:${size}px;height:${size}px;">
      ${verifiedGlowHtml}
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

const VERIFIED_ZONE_RADIUS_METERS = 120;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestVerifiedVenue(venues: ApiVenue[], coords?: { lat: number; lng: number }) {
  if (!coords) return null;

  let closestVenue: ApiVenue | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const venue of venues) {
    if (!hasHardwarePatchInstalled(venue)) continue;
    if (typeof venue.lat !== 'number' || typeof venue.lng !== 'number') continue;

    const distanceMeters = haversineMeters(coords.lat, coords.lng, venue.lat, venue.lng);
    if (distanceMeters < closestDistance) {
      closestDistance = distanceMeters;
      closestVenue = venue;
    }
  }

  return closestVenue ? { venue: closestVenue, distanceMeters: closestDistance } : null;
}

function formatMeters(distanceMeters: number): string {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${Math.round(distanceMeters)} m`;
}

function saveVirtualPatchContext(payload: Record<string, unknown> | VirtualPatchContext) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIRTUAL_PATCH_CONTEXT_KEY, JSON.stringify(payload));
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

export function MapSection({ isDarkMode, selectedFunction, destination, onBookRide, onOpenAccessWallet, userCoords, onAuditEvent, pendingPatchScan, onPendingPatchScanConsumed }: MapSectionProps) {
  const mapCenter: [number, number] = userCoords ? [userCoords.lat, userCoords.lng] : DEFAULT_MAP_CENTER;
  const [parkingData, setParkingData] = useState<ParkingSpot[]>(FALLBACK_ATLANTA_PARKING);
  const [showParkingSpots] = useState(true);
  const [showVenues] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [showSpotDetails, setShowSpotDetails] = useState(false);
  const [routeDestination, setRouteDestination] = useState<string>(destination || '');
  const [showTrafficIntel, setShowTrafficIntel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [shouldRecenter, setShouldRecenter] = useState(false);
  const [zoomDirection, setZoomDirection] = useState(0);
  const [reservationSpot, setReservationSpot] = useState<ReservationSpot | null>(null);
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
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [peekVenue, setPeekVenue] = useState<ApiVenue | null>(null);
  const [venueDetailsVenue, setVenueDetailsVenue] = useState<ApiVenue | null>(null);
  const [showVirtualPatchSheet, setShowVirtualPatchSheet] = useState(false);
  const [showAINotice, setShowAINotice] = useState(false);
  const [showQrScannerSheet, setShowQrScannerSheet] = useState(false);
  const [qrScannerVenue, setQrScannerVenue] = useState<ApiVenue | null>(null);
  const [showLiveUpdates, setShowLiveUpdates] = useState(true);
  // Bytspot Premium gating: drives the perks panel inside the verified peek sheet
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumTeaser, setShowPremiumTeaser] = useState(false);
  const [premiumCheckoutPending, setPremiumCheckoutPending] = useState(false);

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

  // Auto-hide the "Live Updates Active" pill after a brief moment so the map stays clean
  useEffect(() => {
    if (!showLiveUpdates) return;
    const t = setTimeout(() => setShowLiveUpdates(false), 3500);
    return () => clearTimeout(t);
  }, [showLiveUpdates]);

  // Pull Bytspot Premium status — silently defaults to free on any error (e.g. guest)
  useEffect(() => {
    let cancelled = false;
    trpc.subscription.status.query()
      .then((data) => { if (!cancelled) setIsPremium(Boolean(data?.isPremium)); })
      .catch(() => { if (!cancelled) setIsPremium(false); });
    return () => { cancelled = true; };
  }, []);

  const springConfig = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
  const { venues: apiVenues } = useVenues();

  // Venues that have high check-in velocity in the last hour
  const trendingIds = useMemo(() => getTrendingVenueIds(), []);

  // Apply Verified-only / vibe / entry / category filters to the full ApiVenue list
  const allFilteredVenues = useMemo<ApiVenue[]>(
    () => filterMapVenues(apiVenues, { showVerifiedOnly, vibeFilter, entryFilter, categoryFilter }),
    [apiVenues, vibeFilter, entryFilter, categoryFilter, showVerifiedOnly],
  );
  // eBike stations render as their own marker type; everything else uses the vibe tile.
  const bikeStations = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter(isBikeStation),
    [allFilteredVenues],
  );
  const filteredMapVenues = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter((v) => !isBikeStation(v)),
    [allFilteredVenues],
  );
  const verifiedVenues = useMemo(() => apiVenues.filter((venue) => hasHardwarePatchInstalled(venue)), [apiVenues]);
  const verifiedVenueCount = useMemo(() => filteredMapVenues.filter((venue) => hasHardwarePatchInstalled(venue)).length, [filteredMapVenues]);
  const peekVenueIsVerified = hasHardwarePatchInstalled(peekVenue);
  const nearestVerifiedVenue = useMemo(
    () => findNearestVerifiedVenue(verifiedVenues, userCoords),
    [verifiedVenues, userCoords],
  );
  const nearbyVerifiedVenue = useMemo(() => {
    if (!nearestVerifiedVenue) return null;
    return nearestVerifiedVenue.distanceMeters <= VERIFIED_ZONE_RADIUS_METERS ? nearestVerifiedVenue : null;
  }, [nearestVerifiedVenue]);
  const scanCapabilities = useMemo(
    () => ({
      qr: typeof window !== 'undefined' && 'BarcodeDetector' in window,
      nfc: typeof window !== 'undefined' && 'NDEFReader' in window,
    }),
    [],
  );
  const virtualPatchSubtitle = nearbyVerifiedVenue
    ? `${nearbyVerifiedVenue.venue.name} · ${formatMeters(nearbyVerifiedVenue.distanceMeters)}`
    : 'Open Virtual Patch';

  const handleCloseQrScanner = useCallback(() => {
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);
  }, []);

  // Universal-link / App Clip handoff: when App.tsx receives a deep-link with a
  // patch ID, auto-open the scanner pre-loaded with that patch as the fallback.
  useEffect(() => {
    if (!pendingPatchScan?.patchId) return;
    const synthetic = {
      id: null,
      name: pendingPatchScan.venueName ?? 'Bytspot patch',
      hardwarePatch: { id: pendingPatchScan.patchId },
    } as unknown as ApiVenue;
    setQrScannerVenue(synthetic);
    setShowQrScannerSheet(true);
    onPendingPatchScanConsumed?.();
  }, [pendingPatchScan, onPendingPatchScanConsumed]);

  const handleQrVerified = useCallback((verification: VirtualPatchScanVerification) => {
    const targetVenue = qrScannerVenue ?? nearbyVerifiedVenue?.venue ?? null;
    saveVirtualPatchContext(buildVerifiedVirtualPatchContext(verification, {
      source: 'map',
      venueId: targetVenue?.id ?? null,
      venueName: targetVenue?.name ?? null,
      patchId: verification.patchId ?? targetVenue?.hardwarePatch?.id ?? null,
      distanceMeters: nearbyVerifiedVenue ? Math.round(nearbyVerifiedVenue.distanceMeters) : null,
      capabilities: scanCapabilities,
    }));

    // C11: dismiss the scanner UI and hand off to VenueDetails for the venue
    // that was just verified. Falls back to a toast when the venue isn't known
    // (e.g. universal-link entry without a resolved venue yet).
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);
    setShowVirtualPatchSheet(false);
    setPeekVenue(null);

    if (targetVenue) {
      setVenueDetailsVenue(targetVenue);
      toast.success('Verified', { description: `Tap confirmed at ${targetVenue.name}.` });
    } else {
      toast.success('Verified', { description: 'Tap confirmed.' });
    }
  }, [nearbyVerifiedVenue, qrScannerVenue, scanCapabilities]);

  const handleLaunchVirtualPatchSession = useCallback(() => {
    if (!nearbyVerifiedVenue) return;

    const targetVenue = nearbyVerifiedVenue.venue;
    saveVirtualPatchContext({
      source: 'map',
      mode: 'verified-zone',
      initiatedAt: new Date().toISOString(),
      venueId: targetVenue.id,
      venueName: targetVenue.name,
      patchId: targetVenue.hardwarePatch?.id ?? null,
      distanceMeters: Math.round(nearbyVerifiedVenue.distanceMeters),
      capabilities: scanCapabilities,
    });

    setShowVirtualPatchSheet(false);

    if (scanCapabilities.nfc || scanCapabilities.qr) {
      setQrScannerVenue(targetVenue);
      setShowQrScannerSheet(true);
      toast.success('Tap / Scan ready', {
        description: scanCapabilities.nfc
          ? `Hold your phone near the patch sticker at ${targetVenue.name}, or switch to QR if needed.`
          : `Point your camera at the patch code at ${targetVenue.name}.`,
      });
      return;
    }

    const description = scanCapabilities.nfc
      ? `Hold your phone near the patch sticker at ${targetVenue.name}.`
      : scanCapabilities.qr
        ? `Point your camera at the patch code at ${targetVenue.name}.`
        : `Opening My Access so you can continue the Tap / Scan flow for ${targetVenue.name}.`;

    toast.success('Virtual Patch ready', { description });
    onOpenAccessWallet?.();
  }, [nearbyVerifiedVenue, onOpenAccessWallet, scanCapabilities]);

  const handleOpenVirtualPatch = useCallback(() => {
    setShowReportForm(false);
    setPeekVenue(null);
    setVenueDetailsVenue(null);
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);

    if (nearbyVerifiedVenue) {
      setShowVirtualPatchSheet(true);
      return;
    }

    const suggestedVenue = peekVenueIsVerified ? peekVenue : nearestVerifiedVenue?.venue ?? null;
    saveVirtualPatchContext({
      source: 'map',
      mode: 'wallet-fallback',
      initiatedAt: new Date().toISOString(),
      venueId: suggestedVenue?.id ?? null,
      venueName: suggestedVenue?.name ?? null,
      patchId: suggestedVenue?.hardwarePatch?.id ?? null,
      distanceMeters: nearestVerifiedVenue ? Math.round(nearestVerifiedVenue.distanceMeters) : null,
    });

    if (!onOpenAccessWallet) {
      toast.success('Tap / Scan', {
        description: nearestVerifiedVenue
          ? `Move within ${VERIFIED_ZONE_RADIUS_METERS} m of a Bytspot Verified venue to start a direct scan.`
          : 'Virtual Patch will open in My Access in this build.',
      });
      return;
    }

    toast.success('Virtual Patch standby', {
      description: nearestVerifiedVenue
        ? `${nearestVerifiedVenue.venue.name} is ${formatMeters(nearestVerifiedVenue.distanceMeters)} away. Opening My Access until you are in range.`
        : 'Opening My Access for your Tap / Scan flow.',
    });
    onOpenAccessWallet();
  }, [nearbyVerifiedVenue, nearestVerifiedVenue, onOpenAccessWallet, peekVenue, peekVenueIsVerified]);

  // Premium upgrade flow — kicks off Stripe Checkout via tRPC, falls back to a toast in demo mode
  const handleUpgradeToPremium = useCallback(async () => {
    if (premiumCheckoutPending) return;
    setPremiumCheckoutPending(true);
    try {
      const result = await trpc.subscription.createCheckout.mutate();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast('Premium preview', {
        description: result?.message ?? 'Stripe is not configured in this build — perks unlock will go live soon.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not start checkout';
      toast.error('Upgrade unavailable', { description: message });
    } finally {
      setPremiumCheckoutPending(false);
    }
  }, [premiumCheckoutPending]);

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

  // Tiered parking fetch: vendor-reported venues + Google Places nearby +
  // static fallback. Vendor entries always win; Places fills gaps; the static
  // fallback only renders if both are empty (cold-start / offline).
  useEffect(() => {
    let cancelled = false;
    const center = userCoords ?? { lat: DEFAULT_MAP_CENTER[0], lng: DEFAULT_MAP_CENTER[1] };
    const vendor = apiVenues
      .map(venueToParkingSpot)
      .filter((s): s is MapParkingSpot => s !== null);

    trpc.places.nearbySearch.query({ lat: center.lat, lng: center.lng, type: 'parking', maxResults: 12 })
      .then((res: { places?: Array<{ placeId: string; name: string; lat: number; lng: number }> }) => {
        if (cancelled) return;
        const places = (res.places ?? []).map(placeToParkingSpot);
        setParkingData(mergeParkingSources({ vendor, places, fallback: FALLBACK_ATLANTA_PARKING }));
      })
      .catch(() => {
        if (cancelled) return;
        setParkingData(mergeParkingSources({ vendor, places: [], fallback: FALLBACK_ATLANTA_PARKING }));
      });

    return () => { cancelled = true; };
  }, [apiVenues, userCoords]);

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
          const isPaid = v.entryType === 'paid';
          const isTrending = trendingIds.has(v.id ?? '') || trendingIds.has(v.name);
          const isVerified = hasHardwarePatchInstalled(v);
          return (
            <Marker
              key={v.id}
              position={[v.lat, v.lng]}
              icon={createVibeMarkerIcon(level, isPaid, isTrending, v.entryPrice, isVerified)}
              eventHandlers={{
                click: () => {
                  setPeekVenue(v);
                  setVenueDetailsVenue(null);
                },
              }}
            />
          );
        })}

        {/* ── eBike Station Markers — distinct teal squared icon ── */}
        {showVenues && bikeStations.map((b) => (
          <Marker
            key={`bike-${b.id}`}
            position={[b.lat, b.lng]}
            icon={createEBikeIcon()}
            eventHandlers={{
              click: () => {
                setPeekVenue(b);
                setVenueDetailsVenue(null);
              },
            }}
          />
        ))}

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

        {/* ── Bytspot Verified Only — hexagonal FAB toggle ── */}
        <motion.button
          onClick={() => setShowVerifiedOnly(v => !v)}
          className="relative w-11 h-11 flex items-center justify-center"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
          aria-pressed={showVerifiedOnly}
          aria-label={showVerifiedOnly ? 'Showing Bytspot Verified venues only — tap to show all' : 'Show Bytspot Verified venues only'}
          title="Bytspot Verified only"
        >
          {showVerifiedOnly && (
            <motion.span
              key="verified-ping"
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.55), rgba(124,58,237,0.25) 60%, transparent 75%)' }}
              animate={{ scale: [1, 1.55, 1.85], opacity: [0.65, 0.15, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <motion.span
            className="absolute inset-0 flex items-center justify-center border-2 shadow-xl backdrop-blur-xl"
            style={{
              clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)',
              background: showVerifiedOnly
                ? 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))'
                : 'rgba(28,28,30,0.95)',
              borderColor: showVerifiedOnly ? 'rgba(165,243,252,0.7)' : 'rgba(255,255,255,0.3)',
            }}
            animate={showVerifiedOnly
              ? { boxShadow: ['0 0 14px rgba(34,211,238,0.45)', '0 0 22px rgba(124,58,237,0.55)', '0 0 14px rgba(236,72,153,0.45)'] }
              : { boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}
            transition={{ duration: 2.4, repeat: showVerifiedOnly ? Infinity : 0, ease: 'easeInOut' }}
          >
            <Zap
              className={`w-5 h-5 ${showVerifiedOnly ? 'text-white' : 'text-cyan-300'}`}
              strokeWidth={2.6}
            />
          </motion.span>
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
          ] as { label: string; value: number | null; emoji: string }[]).map((chip, idx) => (
            <div key={chip.label} className="flex-shrink-0 inline-flex items-stretch gap-1">
              <motion.button
                onClick={() => setVibeFilter(vibeFilter === chip.value ? null : chip.value)}
                className={`px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg ${
                  vibeFilter === chip.value
                    ? 'bg-white/20 border-white/70 text-white'
                    : 'bg-[#1C1C1E]/92 border-white/22 text-white/80'
                }`}
                style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                whileTap={{ scale: 0.93 }}
              >
                {chip.emoji} {chip.label}
              </motion.button>
              {idx === 0 && (
                <motion.button
                  onClick={() => setShowAINotice(true)}
                  className="px-2 py-1.5 rounded-full bg-cyan-400/14 border border-cyan-300/35 text-cyan-100 backdrop-blur-xl shadow-lg"
                  whileTap={{ scale: 0.9 }}
                  aria-label="How Bytspot AI works"
                  title="How Bytspot AI works"
                >
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
                </motion.button>
              )}
            </div>
          ))}

          {(verifiedVenues.length > 0 || showVerifiedOnly) && (
            <motion.button
              onClick={() => setShowVerifiedOnly(v => !v)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] border backdrop-blur-xl shadow-lg transition-colors ${
                showVerifiedOnly
                  ? 'bg-cyan-400/30 border-cyan-200/70 text-white'
                  : 'bg-cyan-500/18 border-cyan-300/35 text-cyan-100'
              }`}
              style={{ fontWeight: 800, whiteSpace: 'nowrap' }}
              whileTap={{ scale: 0.93 }}
              aria-pressed={showVerifiedOnly}
              title={showVerifiedOnly ? 'Showing Verified only' : 'Tap to show Verified only'}
            >
              ⬢ {verifiedVenueCount} Verified{showVerifiedOnly ? ' · On' : ''}
            </motion.button>
          )}

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

      {/* ── Bytspot Verified — Partner-Only mode indicators ── */}
      <AnimatePresence>
        {showVerifiedOnly && (
          <>
            {/* Cyan vignette accent so it's obvious the map is in a special mode */}
            <motion.div
              key="verified-vignette"
              className="pointer-events-none absolute inset-0 z-[999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              style={{
                boxShadow: 'inset 0 0 0 2px rgba(103,232,249,0.55), inset 0 0 60px rgba(34,211,238,0.18)',
              }}
            />
            {/* "Verified Mode" badge — sits just under the filter chips */}
            <motion.div
              key="verified-badge"
              className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none"
              initial={{ opacity: 0, y: -8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.94 }}
              transition={springConfig}
            >
              <div
                className="px-3 py-1.5 rounded-full border border-cyan-200/60 shadow-2xl flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(6,182,212,0.92), rgba(124,58,237,0.92) 60%, rgba(236,72,153,0.9))',
                }}
              >
                <span className="text-[12px] text-white" style={{ fontWeight: 900, letterSpacing: '0.04em' }}>
                  ⬢ VERIFIED MODE
                </span>
                <span className="text-[10px] text-white/85" style={{ fontWeight: 700 }}>
                  Partner venues only
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1001]">
        <motion.button
          onClick={handleOpenVirtualPatch}
          className="relative min-w-[210px] px-3 py-3 rounded-full border border-white/25 shadow-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))' }}
          whileTap={{ scale: 0.96 }}
          animate={{ y: [0, -2, 0], boxShadow: ['0 12px 36px rgba(6,182,212,0.26)', '0 16px 42px rgba(124,58,237,0.36)', '0 12px 36px rgba(236,72,153,0.24)'] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-label="Open Tap and Scan virtual patch flow"
        >
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 flex items-center justify-center border border-white/35 bg-black/15" style={{ clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)' }}>
              <Zap className="w-5 h-5 text-white" strokeWidth={2.6} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-[15px] text-white leading-tight" style={{ fontWeight: 900 }}>Tap / Scan</div>
              <div className="text-[11px] text-white/80 leading-tight truncate" style={{ fontWeight: 600 }}>{virtualPatchSubtitle}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/90 ml-1" strokeWidth={2.8} />
          </div>
        </motion.button>
      </div>

      {createPortal(
        <AnimatePresence>
          {showVirtualPatchSheet && nearbyVerifiedVenue && (
            <motion.div
              className="fixed inset-0 z-[1004] bg-black/55 backdrop-blur-[2px] flex items-end justify-center p-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVirtualPatchSheet(false)}
            >
            <motion.div
              className="w-full max-w-sm rounded-[28px] border border-cyan-300/30 bg-[#11131A]/96 backdrop-blur-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 0 46px rgba(34,211,238,0.18), 0 18px 48px rgba(0,0,0,0.52)' }}
              initial={{ y: 140, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 140, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative p-6 pb-5">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.20),transparent_68%)]" />
                <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-3xl" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/12 border border-cyan-300/25 text-cyan-100 text-[11px] tracking-[0.18em] uppercase" style={{ fontWeight: 800 }}>
                          <QrCode className="w-3.5 h-3.5" strokeWidth={2.4} />
                          Virtual Patch
                        </div>
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/6 border border-white/10 text-[10px] text-white/55 uppercase tracking-[0.18em]" style={{ fontWeight: 700 }}>
                          {formatMeters(nearbyVerifiedVenue.distanceMeters)} away
                        </div>
                      </div>
                      <h3 className="text-[24px] text-white leading-[1.05] tracking-[-0.02em]" style={{ fontWeight: 800 }}>Tap / Scan ready</h3>
                      <p className="text-[13px] text-white/68 mt-2 max-w-[18rem] leading-[1.5]" style={{ fontWeight: 500 }}>
                        You’re in range for a fast patch handshake at <span className="text-white" style={{ fontWeight: 700 }}>{nearbyVerifiedVenue.venue.name}</span>.
                      </p>
                    </div>
                    <motion.button
                      onClick={() => setShowVirtualPatchSheet(false)}
                      className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center bg-white/7 border border-white/12 text-white/70"
                      whileTap={{ scale: 0.92 }}
                      transition={springConfig}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>

                  <div className="relative rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(21,25,35,0.96)_0%,rgba(14,18,27,0.92)_100%)] px-4 py-[18px] mb-5 overflow-hidden">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />

                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-[16px] bg-cyan-400/12 border border-cyan-300/18 flex items-center justify-center shadow-[0_10px_24px_rgba(34,211,238,0.12)] shrink-0">
                        <Zap className="w-4.5 h-4.5 text-cyan-200" strokeWidth={2.6} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[16px] text-white leading-tight truncate" style={{ fontWeight: 700 }}>{nearbyVerifiedVenue.venue.name}</div>
                            <div className="text-[10px] text-cyan-100/55 uppercase tracking-[0.22em] mt-1" style={{ fontWeight: 700 }}>
                              Bytspot Verified access point
                            </div>
                          </div>
                          <div className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/55 uppercase tracking-[0.16em]" style={{ fontWeight: 700 }}>
                            Live now
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/72" style={{ fontWeight: 600 }}>
                            <Zap className="w-3.5 h-3.5 text-cyan-200" strokeWidth={2.4} />
                            {scanCapabilities.nfc ? 'NFC handshake ready' : 'Wallet-guided entry'}
                          </div>
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/72" style={{ fontWeight: 600 }}>
                            <QrCode className="w-3.5 h-3.5 text-fuchsia-200" strokeWidth={2.4} />
                            {scanCapabilities.qr ? 'QR fallback ready' : 'Manual code fallback'}
                          </div>
                          {nearbyVerifiedVenue.venue?.hardwarePatch?.wifi?.available && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/25 text-[11px] text-emerald-100/85" style={{ fontWeight: 600 }} title={nearbyVerifiedVenue.venue.hardwarePatch.wifi.ssid ? `Network: ${nearbyVerifiedVenue.venue.hardwarePatch.wifi.ssid}` : undefined}>
                              <Wifi className="w-3.5 h-3.5 text-emerald-200" strokeWidth={2.4} />
                              Venue Wi-Fi on tap
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 mt-[18px]">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-white/6 border border-white/10 text-[11px] text-white/75 flex items-center justify-center shrink-0" style={{ fontWeight: 700 }}>1</div>
                        <p className="text-[12px] text-white/72 leading-[1.55]" style={{ fontWeight: 500 }}>
                          Find the glowing Bytspot sticker or patch near the venue entrance.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-white/6 border border-white/10 text-[11px] text-white/75 flex items-center justify-center shrink-0" style={{ fontWeight: 700 }}>2</div>
                        <p className="text-[12px] text-white/72 leading-[1.55]" style={{ fontWeight: 500 }}>
                          {scanCapabilities.nfc ? 'Hold your phone near the patch to begin the tap handshake.' : 'Open the guided wallet flow to continue the patch handshake.'}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-white/6 border border-white/10 text-[11px] text-white/75 flex items-center justify-center shrink-0" style={{ fontWeight: 700 }}>3</div>
                        <p className="text-[12px] text-white/72 leading-[1.55]" style={{ fontWeight: 500 }}>
                          {scanCapabilities.qr ? 'If needed, use your camera to scan the QR fallback on the sticker.' : 'Use the visible patch code as the fallback verification step if needed.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      onClick={() => setShowVirtualPatchSheet(false)}
                      className="flex-1 px-4 py-3.5 rounded-[18px] bg-white/6 border border-white/10 text-white/78"
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.01 }}
                      transition={springConfig}
                    >
                      <span className="text-[14px]" style={{ fontWeight: 700 }}>Not now</span>
                    </motion.button>
                    <motion.button
                      onClick={handleLaunchVirtualPatchSession}
                      className="flex-[1.2] px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_14px_34px_rgba(124,58,237,0.28)]"
                      whileTap={{ scale: 0.97, y: 1 }}
                      whileHover={{ scale: 1.01, y: -1 }}
                      transition={springConfig}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {scanCapabilities.nfc ? <Zap className="w-4 h-4 text-white" strokeWidth={2.6} /> : <QrCode className="w-4 h-4 text-white" strokeWidth={2.6} />}
                        <span className="text-[14px]" style={{ fontWeight: 800 }}>
                          {scanCapabilities.nfc || scanCapabilities.qr ? 'Start Tap / Scan' : 'Open My Access'}
                        </span>
                      </div>
                      <p aria-hidden="true" className="text-[11px] text-white/75 mt-1.5 text-center" style={{ fontWeight: 600 }}>
                        {scanCapabilities.nfc
                          ? 'Hold near the venue patch when prompted.'
                          : scanCapabilities.qr
                            ? 'Camera fallback stays ready if NFC is unavailable.'
                            : 'Continue the flow from your access wallet.'}
                      </p>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <VirtualPatchScannerSheet
          isOpen={showQrScannerSheet && Boolean(qrScannerVenue)}
          venueName={qrScannerVenue?.name ?? 'Bytspot Verified venue'}
          fallbackPatchId={qrScannerVenue?.hardwarePatch?.id ?? null}
          venueId={qrScannerVenue?.id ?? null}
          userCoords={userCoords}
          onClose={handleCloseQrScanner}
          onVerified={handleQrVerified}
          onOpenAccessWallet={onOpenAccessWallet}
          onAuditEvent={onAuditEvent}
        />,
        document.body,
      )}

      <AITransparencyNotice isOpen={showAINotice} onClose={() => setShowAINotice(false)} />

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

      {/* Live Update Indicator — auto-hides so it doesn't obstruct the map */}
      <AnimatePresence>
        {showLiveUpdates && (
          <motion.div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/30 shadow-xl flex items-center gap-2 pointer-events-none"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
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
        )}
      </AnimatePresence>

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
            <div
              className={`rounded-[22px] bg-[#1C1C1E]/96 backdrop-blur-2xl border shadow-2xl overflow-hidden ${peekVenueIsVerified ? 'border-cyan-300/35' : 'border-white/18'}`}
              style={peekVenueIsVerified ? { boxShadow: '0 0 34px rgba(34,211,238,0.16), 0 18px 42px rgba(0,0,0,0.48)' } : undefined}
            >
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
                    {peekVenueIsVerified && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-200 border border-cyan-300/30 font-bold">
                        ⬢ Bytspot Verified
                      </span>
                    )}
                    {peekVenue.entryType === 'paid' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 font-bold">
                        {peekVenue.entryPrice ?? 'Paid'}
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
                    {peekVenueIsVerified ? ' · Tap-ready' : ''}
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

              {/* ── Member Perks — only on Verified venues; gated by Bytspot Premium ── */}
              {peekVenueIsVerified && (
                isPremium ? (
                  <div
                    className="mx-4 mb-3 px-3 py-2.5 rounded-[14px] border border-cyan-300/45"
                    style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(124,58,237,0.18) 60%, rgba(236,72,153,0.16))' }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-200" strokeWidth={2.5} />
                      <span className="text-[11px] text-cyan-100 tracking-[0.08em]" style={{ fontWeight: 800 }}>
                        MEMBER PERKS · ACTIVE
                      </span>
                    </div>
                    <ul className="text-[12px] text-white/85 space-y-0.5" style={{ fontWeight: 600 }}>
                      <li>· 10% off your tab</li>
                      <li>· Skip the line at entry</li>
                      <li>· Member-only Tap / Scan rewards</li>
                    </ul>
                  </div>
                ) : (
                  <motion.button
                    onClick={() => setShowPremiumTeaser(true)}
                    className="mx-4 mb-3 px-3 py-2.5 rounded-[14px] border border-white/15 bg-white/5 flex items-center gap-2 w-[calc(100%-32px)] text-left"
                    whileTap={{ scale: 0.98 }}
                    aria-label="Unlock Bytspot Premium perks for this venue"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.85), rgba(124,58,237,0.85))' }}>
                      <Lock className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white/95 leading-tight" style={{ fontWeight: 700 }}>
                        Unlock perks at this Verified venue
                      </p>
                      <p className="text-[10.5px] text-white/55 leading-tight mt-0.5" style={{ fontWeight: 500 }}>
                        Discounts · Skip the line · Tap / Scan rewards
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/55 flex-shrink-0" strokeWidth={2.5} />
                  </motion.button>
                )
              )}

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

      {/* ── Premium Teaser Sheet — single keyed motion child so AnimatePresence treats it as one unit ── */}
      <AnimatePresence>
        {showPremiumTeaser && (
          <motion.div
            key="premium-teaser"
            className="absolute inset-0 z-[1003]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="Unlock Bytspot Premium"
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => !premiumCheckoutPending && setShowPremiumTeaser(false)}
            />
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-[1004]"
              initial={{ y: 320 }}
              animate={{ y: 0 }}
              exit={{ y: 320 }}
              transition={springConfig}
            >
              <div
                className="rounded-t-[28px] border-t border-cyan-300/35 px-5 pt-5 pb-7 shadow-2xl"
                style={{ background: 'linear-gradient(180deg, rgba(28,28,30,0.98), rgba(10,10,12,0.98))' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.95), rgba(124,58,237,0.95) 60%, rgba(236,72,153,0.92))' }}>
                      <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[11px] text-cyan-200 tracking-[0.1em]" style={{ fontWeight: 800 }}>BYTSPOT PREMIUM</p>
                      <h3 className="text-[19px] text-white leading-tight" style={{ fontWeight: 800 }}>Unlock Verified perks</h3>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => setShowPremiumTeaser(false)}
                    disabled={premiumCheckoutPending}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/8 border border-white/15 disabled:opacity-50"
                    whileTap={{ scale: 0.9 }}
                  >
                    <X className="w-4 h-4 text-white/70" />
                  </motion.button>
                </div>
                <p className="text-[13px] text-white/70 leading-snug mb-4" style={{ fontWeight: 500 }}>
                  Premium turns every Bytspot Verified venue into a perks venue — discounts, skip-the-line entry, and exclusive Tap / Scan rewards.
                </p>
                <ul className="space-y-2 mb-5">
                  {[
                    { icon: '💸', label: '10% off your tab at every Verified venue' },
                    { icon: '🚪', label: 'Skip-the-line at participating partners' },
                    { icon: '🎁', label: 'Member-only Tap / Scan rewards' },
                  ].map((perk) => (
                    <li key={perk.label} className="flex items-center gap-2.5 px-3 py-2 rounded-[12px] bg-white/5 border border-white/10">
                      <span className="text-[18px]">{perk.icon}</span>
                      <span className="text-[13px] text-white/90" style={{ fontWeight: 600 }}>{perk.label}</span>
                    </li>
                  ))}
                </ul>
                <motion.button
                  onClick={handleUpgradeToPremium}
                  disabled={premiumCheckoutPending}
                  className="w-full py-3.5 rounded-[16px] border border-white/25 shadow-2xl text-white text-[15px] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))', fontWeight: 800 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {premiumCheckoutPending ? 'Opening checkout…' : 'Upgrade · $9.99 / month'}
                </motion.button>
                <p className="text-[10.5px] text-white/45 text-center mt-2.5" style={{ fontWeight: 500 }}>
                  Cancel anytime · Powered by Stripe
                </p>
              </div>
            </motion.div>
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
