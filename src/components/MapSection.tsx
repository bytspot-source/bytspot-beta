import 'leaflet/dist/leaflet.css';
import { Capacitor } from '@capacitor/core';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation, Star, Plus, Minus, Target,
  Zap, X,
  MapPin, ChevronRight, QrCode,
  Lock, Sparkles, Wifi, Layers, Search, Car, Route, Crosshair, Check,
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
import { impactLight } from '../utils/haptics';

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
  isRideBookingOpen?: boolean;
  onBackToHome?: () => void;
  onBookRide?: (venue?: { name: string; lat?: number; lng?: number }) => void;
  onOpenAccessWallet?: () => void;
  /** Live user coordinates — map centers here instead of hardcoded Atlanta */
  userCoords?: { lat: number; lng: number };
  /** Audit log sink (NIST PR.PT-1). Wired by App.tsx to the durable audit pipeline. */
  onAuditEvent?: (event: VirtualPatchAuditEvent) => void;
  /** Universal-link / App Clip handoff — auto-opens the scanner with this patch pre-filled. */
  pendingPatchScan?: { patchId?: string | null; venueName?: string; source?: 'app-clip' | 'wallet' } | null;
  /** Called once the pending scan has been delivered to the scanner so App.tsx can clear it. */
  onPendingPatchScanConsumed?: () => void;
  /** Route a map-created request into the established Concierge tab without adding nav layers. */
  onOpenConciergeRequest?: (prefill: string) => void;
  /** Request from the Map menu to create a Service Location at the user's current location. */
  requestServiceLocation?: boolean;
  onServiceLocationRequestConsumed?: () => void;
}

type MapMode = 'default' | 'nearby' | 'partnered' | 'station' | 'request' | 'ride' | 'navigation';

type SpatialResult = {
  id: string;
  name: string;
  detail: string;
  type: string;
  onClick: () => void;
  crowdLabel?: string;
  waitLabel?: string;
  isTrending?: boolean;
};

const DROPPED_PIN_SERVICE_OPTIONS = [
  'White-Glove Valet Pickup',
  'Private Chef Delivery',
  'Concierge Runner',
  'Luxury Transportation',
  'Other',
] as const;

type DroppedPinServiceIntent = typeof DROPPED_PIN_SERVICE_OPTIONS[number];

type DroppedRequestPin = { lat: number; lng: number; label: string };

const CROWD_LEVEL_LABELS: Record<number, string> = {
  1: 'Chill',
  2: 'Active',
  3: 'Busy',
  4: 'Packed',
};

const SPATIAL_SHEET_PEEK_Y = 118;
const SPATIAL_SHEET_SNAP_OFFSET = 44;
const SPATIAL_SHEET_SNAP_VELOCITY = 420;

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

function LongPressDropController({ onDrop, onMapTap }: { onDrop: (lat: number, lng: number) => void; onMapTap: () => void }) {
  useMapEvents({
    click(event) {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control, .leaflet-interactive')) return;
      onMapTap();
    },
    contextmenu(event) {
      onDrop(event.latlng.lat, event.latlng.lng);
    },
  });
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
    @keyframes bytspot-station-orbit { 0%{transform:scale(.9);opacity:.7} 70%{transform:scale(2.15);opacity:0} 100%{transform:scale(2.15);opacity:0} }
    @keyframes bytspot-tapzone-scan { 0%,100%{transform:translateY(-2px);opacity:.35} 50%{transform:translateY(22px);opacity:.95} }
    @keyframes bytspot-live-pop { 0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(251,146,60,0)} 50%{transform:scale(1.08);box-shadow:0 0 16px rgba(251,146,60,.75)} }
    .byt-pulse-ring{position:absolute;inset:-6px;border-radius:50%;animation:bytspot-pulse 2s ease-out infinite;}
    .byt-pulse-ring-slow{position:absolute;inset:-5px;border-radius:50%;animation:bytspot-pulse-slow 3s ease-out infinite;}
    .byt-trend-pulse{position:absolute;inset:-9px;border-radius:50%;animation:bytspot-trend 1.1s ease-out infinite;}
    .byt-verified-glow{position:absolute;inset:-12px;border-radius:50%;background:radial-gradient(circle, rgba(34,211,238,.45) 0%, rgba(124,58,237,.24) 44%, rgba(236,72,153,0) 74%);animation:bytspot-verified-glow 2.6s ease-in-out infinite;}
    .byt-verified-ring{position:absolute;inset:-9px;border-radius:50%;border:2px solid rgba(103,232,249,.85);box-shadow:0 0 20px rgba(34,211,238,.45),0 0 28px rgba(124,58,237,.22);animation:bytspot-verified-ring 1.85s ease-out infinite;}
    .byt-marker-in{animation:bytspot-marker-in 320ms cubic-bezier(.2,.8,.25,1.05) both;transform-origin:center bottom;}
    .byt-station-orbit{position:absolute;inset:-9px;border-radius:50%;border:2px solid rgba(103,232,249,.72);animation:bytspot-station-orbit 1.9s ease-out infinite;}
    .byt-tapzone-scan{position:absolute;left:6px;right:6px;height:2px;border-radius:999px;background:rgba(103,232,249,.95);box-shadow:0 0 12px rgba(34,211,238,.8);animation:bytspot-tapzone-scan 1.6s ease-in-out infinite;}
    .byt-live-badge{animation:bytspot-live-pop 1.15s ease-in-out infinite;}
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

function createDroppedPinIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div class="byt-marker-in" style="position:relative;width:34px;height:42px;">
      <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:30px;height:30px;border-radius:50% 50% 50% 4px;background:linear-gradient(135deg,#22d3ee,#8b5cf6);border:2px solid rgba(255,255,255,.94);box-shadow:0 12px 26px rgba(0,0,0,.52),0 0 22px rgba(34,211,238,.5);transform-origin:center;rotate:-45deg;"></div>
      <div style="position:absolute;left:50%;top:11px;transform:translateX(-50%);width:8px;height:8px;border-radius:50%;background:white;"></div>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 36],
    popupAnchor: [0, -34],
    className: '',
  });
}

function createTapZoneIcon(crowdLabel = 'Live', waitLabel = 'Now'): L.DivIcon {
  return L.divIcon({
    html: `<div class="byt-marker-in" style="position:relative;width:40px;height:40px;">
      <div class="byt-verified-glow"></div>
      <div style="position:absolute;inset:1px;clip-path:polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%);background:linear-gradient(135deg,#06b6d4,#7c3aed 58%,#ec4899);border:2px solid rgba(255,255,255,.9);box-shadow:0 12px 28px rgba(0,0,0,.55),0 0 24px rgba(34,211,238,.45);overflow:hidden;">
        <div class="byt-tapzone-scan"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-size:15px;font-weight:900;line-height:1;">⌁</div>
      </div>
      <div style="position:absolute;top:-12px;right:-18px;padding:2px 6px;border-radius:999px;background:#050505;border:1px solid rgba(103,232,249,.8);color:#a5f3fc;font-size:7px;font-weight:900;letter-spacing:.08em;white-space:nowrap;box-shadow:0 0 12px rgba(34,211,238,.35);">${crowdLabel}</div>
      <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);padding:1px 5px;border-radius:999px;background:rgba(3,7,18,.94);border:1px solid rgba(103,232,249,.65);color:#a5f3fc;font-size:7px;font-weight:900;letter-spacing:.08em;white-space:nowrap;">TAP</div>
      <div style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);padding:1px 5px;border-radius:999px;background:rgba(3,7,18,.94);border:1px solid rgba(255,255,255,.45);color:white;font-size:7px;font-weight:900;white-space:nowrap;">${waitLabel}</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
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
  crowdLabel: string = CROWD_LEVEL_LABELS[level] ?? 'Live',
  waitLabel: string = 'Now',
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
      <div class="byt-station-orbit" style="border-color:${color};"></div>
      <div class="${pulseClass}" style="border:2px solid ${color};"></div>
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.92);box-shadow:0 2px 12px rgba(0,0,0,0.7),0 0 18px ${color}55;display:flex;align-items:center;justify-content:center;cursor:pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>
      </div>
      <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);display:flex;gap:3px;align-items:center;white-space:nowrap;">
        <span style="padding:1px 5px;border-radius:999px;background:rgba(3,7,18,.95);border:1px solid rgba(255,255,255,.5);color:white;font-size:7px;font-weight:900;line-height:1.35;">${crowdLabel}</span>
        <span style="padding:1px 5px;border-radius:999px;background:rgba(3,7,18,.95);border:1px solid ${color};color:#fff;font-size:7px;font-weight:900;line-height:1.35;">${waitLabel}</span>
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

function createHotspotIcon(label = 'LIVE'): L.DivIcon {
  return L.divIcon({
    html: `<div class="byt-marker-in" style="position:relative;width:42px;height:42px;">
      <div class="byt-trend-pulse" style="border:2px solid #fb923c;box-shadow:0 0 28px rgba(249,115,22,.8);"></div>
      <div style="position:absolute;inset:7px;border-radius:999px;background:radial-gradient(circle,#fed7aa 0%,#fb923c 46%,#ea580c 100%);border:2px solid rgba(255,255,255,.96);box-shadow:0 0 24px rgba(251,146,60,.9),0 12px 26px rgba(0,0,0,.58);"></div>
      <div class="byt-live-badge" style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);padding:2px 7px;border-radius:999px;background:#ff2f86;color:#050505;border:1px solid rgba(255,255,255,.92);font-size:8px;font-weight:950;letter-spacing:.08em;white-space:nowrap;">LIVE</div>
      <div style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:999px;background:#050505;border:1px solid rgba(251,146,60,.85);color:#fed7aa;font-size:7px;font-weight:900;white-space:nowrap;">${label}</div>
    </div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22],
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

function estimateEtaMinutes(from: [number, number], to: [number, number]): number {
  const meters = haversineMeters(from[0], from[1], to[0], to[1]);
  return Math.max(2, Math.round(meters / 70));
}

function formatVenueAvailability(venue: ApiVenue): string {
  if (venue.crowd?.waitMins) return `~${venue.crowd.waitMins}m wait`;
  if (venue.availability) return String(venue.availability);
  return (venue.crowd?.level ?? 1) >= 4 ? 'High activity' : 'Live availability';
}

function getVenueCrowdLabel(venue: ApiVenue): string {
  return venue.crowd?.label ?? CROWD_LEVEL_LABELS[venue.crowd?.level ?? 1] ?? 'Live';
}

function getVenueWaitLabel(venue: ApiVenue): string {
  return typeof venue.crowd?.waitMins === 'number' ? `${venue.crowd.waitMins} min wait` : 'Live wait';
}

function getVenueWaitShortLabel(venue: ApiVenue): string {
  return typeof venue.crowd?.waitMins === 'number' ? `${venue.crowd.waitMins}m` : 'Now';
}

export function MapSection({ isDarkMode, selectedFunction, destination, isRideBookingOpen = false, onBookRide, onOpenAccessWallet, userCoords, onAuditEvent, pendingPatchScan, onPendingPatchScanConsumed, onOpenConciergeRequest, requestServiceLocation = false, onServiceLocationRequestConsumed }: MapSectionProps) {
  const mapCenter: [number, number] = userCoords ? [userCoords.lat, userCoords.lng] : DEFAULT_MAP_CENTER;
  const [parkingData, setParkingData] = useState<ParkingSpot[]>(FALLBACK_ATLANTA_PARKING);
  const [showParkingSpots, setShowParkingSpots] = useState(true);
  const [showVenues, setShowVenues] = useState(true);
  const [showTapZones, setShowTapZones] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [showSpotDetails, setShowSpotDetails] = useState(false);
  const [routeDestination, setRouteDestination] = useState<string>(destination || '');
  const [showTrafficIntel, setShowTrafficIntel] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [openLayerGroup, setOpenLayerGroup] = useState('Show on map');
  const [mapQuery, setMapQuery] = useState(destination || '');
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [droppedRequestPin, setDroppedRequestPin] = useState<DroppedRequestPin | null>(null);
  const [droppedPinServiceIntent, setDroppedPinServiceIntent] = useState<DroppedPinServiceIntent>('White-Glove Valet Pickup');
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
  const [nearbySheetDismissed, setNearbySheetDismissed] = useState(true);
  const [venueDetailsVenue, setVenueDetailsVenue] = useState<ApiVenue | null>(null);
  const [showVirtualPatchSheet, setShowVirtualPatchSheet] = useState(false);
  const [showAINotice, setShowAINotice] = useState(false);
  const [showQrScannerSheet, setShowQrScannerSheet] = useState(false);
  const [qrScannerVenue, setQrScannerVenue] = useState<ApiVenue | null>(null);
  const [qrScannerEntrySource, setQrScannerEntrySource] = useState<'map' | 'app-clip' | 'wallet'>('map');
  const [showLiveUpdates, setShowLiveUpdates] = useState(true);
  // Bytspot Premium gating: drives the perks panel inside the verified peek sheet
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumTeaser, setShowPremiumTeaser] = useState(false);
  const [premiumCheckoutPending, setPremiumCheckoutPending] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [usePremiumPoints, setUsePremiumPoints] = useState(false);
  const [premiumCouponCode, setPremiumCouponCode] = useState('');

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
      .then((data) => {
        if (!cancelled) {
          setSubscriptionStatus(data);
          setIsPremium(Boolean(data?.isPremium));
        }
      })
      .catch(() => { if (!cancelled) setIsPremium(false); });
    return () => { cancelled = true; };
  }, []);

  const springConfig = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
  const triggerLightHaptic = useCallback(() => { void impactLight(); }, []);
  const { venues: apiVenues } = useVenues();

  // Venues that have high check-in velocity in the last hour
  const trendingIds = useMemo(() => getTrendingVenueIds(), []);

  // Apply Verified-only / vibe / entry / category filters to the full ApiVenue list
  const normalizedMapQuery = mapQuery.trim().toLowerCase();
  const allFilteredVenues = useMemo<ApiVenue[]>(
    () => filterMapVenues(apiVenues, { showVerifiedOnly, vibeFilter, entryFilter, categoryFilter }).filter((venue) => {
      if (!normalizedMapQuery) return true;
      const haystack = [venue.name, venue.category, venue.address, venue.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedMapQuery);
    }),
    [apiVenues, vibeFilter, entryFilter, categoryFilter, showVerifiedOnly, normalizedMapQuery],
  );
  // eBike stations render as their own marker type; everything else uses the vibe tile.
  const bikeStations = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter(isBikeStation),
    [allFilteredVenues],
  );
  const filteredMapVenues = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter((v) => !isBikeStation(v) && (!showTapZones || !hasHardwarePatchInstalled(v))),
    [allFilteredVenues, showTapZones],
  );
  const tapZoneVenues = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter((venue) => hasHardwarePatchInstalled(venue)),
    [allFilteredVenues],
  );
  const verifiedVenues = useMemo(() => apiVenues.filter((venue) => hasHardwarePatchInstalled(venue)), [apiVenues]);
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
      nfc: Capacitor.isNativePlatform() || (typeof window !== 'undefined' && 'NDEFReader' in window),
    }),
    [],
  );
  const virtualPatchSubtitle = nearbyVerifiedVenue
    ? `${nearbyVerifiedVenue.venue.name} · ${formatMeters(nearbyVerifiedVenue.distanceMeters)}`
    : 'Open Virtual Patch';

  const handleCloseQrScanner = useCallback(() => {
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);
    setQrScannerEntrySource('map');
  }, []);

  // Universal-link / App Clip / wallet handoff: when App.tsx receives a deep-link
  // or My Access resume request, auto-open the scanner. If a patch ID is known,
  // prefill it; otherwise the live NFC/QR payload supplies the patch identifier.
  useEffect(() => {
    if (!pendingPatchScan) return;
    const synthetic = {
      id: null,
      name: pendingPatchScan.venueName ?? 'Bytspot patch',
      hardwarePatch: { id: pendingPatchScan.patchId ?? null },
    } as unknown as ApiVenue;
    setQrScannerEntrySource(pendingPatchScan.source ?? 'app-clip');
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

    // Keep the scanner sheet mounted so it can render its own "Patch verified"
    // success state and Continue-in-My-Access CTA. Dismissal + wallet handoff
    // are driven from inside the sheet (handleContinue → onClose → onOpenAccessWallet).
    if (targetVenue) {
      toast.success('Verified', { description: `Tap confirmed at ${targetVenue.name}.` });
    } else {
      toast.success('Verified', { description: 'Tap confirmed.' });
    }
  }, [nearbyVerifiedVenue, qrScannerVenue, scanCapabilities]);

  const handleLaunchVirtualPatchSession = useCallback(() => {
    if (!nearbyVerifiedVenue) return;
    void impactLight();

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
      setQrScannerEntrySource('map');
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
    void impactLight();
    setShowReportForm(false);
    setPeekVenue(null);
    setVenueDetailsVenue(null);
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);

    const suggestedVenue = nearbyVerifiedVenue?.venue ?? (peekVenueIsVerified ? peekVenue : nearestVerifiedVenue?.venue) ?? null;

    if (nearbyVerifiedVenue) {
      setShowVirtualPatchSheet(true);
      return;
    }

    if (suggestedVenue && (scanCapabilities.nfc || scanCapabilities.qr)) {
      setQrScannerEntrySource('map');
      setQrScannerVenue(suggestedVenue);
      setShowQrScannerSheet(true);
      toast.success('Tap / Scan ready', {
        description: scanCapabilities.nfc
          ? `Reader opened for ${suggestedVenue.name}. Hold your phone near the sticker when prompted.`
          : `Camera opened for ${suggestedVenue.name}. Point it at the sticker QR code.`,
      });
      return;
    }

    if (scanCapabilities.nfc || scanCapabilities.qr) {
      const synthetic = {
        id: null,
        name: 'Bytspot patch',
        hardwarePatch: { id: null },
      } as unknown as ApiVenue;
      setQrScannerEntrySource('map');
      setQrScannerVenue(synthetic);
      setShowQrScannerSheet(true);
      toast.success('Tap / Scan ready', {
        description: scanCapabilities.nfc
          ? 'Reader opened. Hold your phone near the Bytspot sticker when prompted.'
          : 'Camera opened. Point it at the sticker QR code.',
      });
      return;
    }

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
  }, [nearbyVerifiedVenue, nearestVerifiedVenue, onOpenAccessWallet, peekVenue, peekVenueIsVerified, scanCapabilities]);

  const premiumOffer = subscriptionStatus?.subscriptionOffers?.['insider-premium'];
  const premiumAvailablePoints = Number(subscriptionStatus?.availablePoints ?? subscriptionStatus?.loyalty?.availablePoints ?? 0);
  const premiumBaseCents = Number(premiumOffer?.baseUnitAmountCents ?? 999);
  const premiumMaxPointsDiscountCents = Number(premiumOffer?.maxPointsDiscountCents ?? 0);
  const premiumPointsDiscountCents = usePremiumPoints ? premiumMaxPointsDiscountCents : 0;
  const premiumEstimatedCents = Math.max(50, premiumBaseCents - premiumPointsDiscountCents);
  const formatPremiumCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Premium upgrade flow — kicks off Stripe Checkout via tRPC, falls back to a toast in demo mode
  const handleUpgradeToPremium = useCallback(async () => {
    if (premiumCheckoutPending) return;
    setPremiumCheckoutPending(true);
    try {
      const result = await trpc.subscription.createCheckout.mutate({
        plan: 'insider-premium',
        usePoints: usePremiumPoints,
        couponCode: premiumCouponCode.trim() || undefined,
      });
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
  }, [premiumCheckoutPending, premiumCouponCode, usePremiumPoints]);

  useEffect(() => {
    if (destination) {
      setRouteDestination(destination);
      setMapQuery(destination);
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

  const handleVerifyVenueAccess = useCallback((venue: ApiVenue) => {
    setPeekVenue(venue);
    setVenueDetailsVenue(null);
    if (hasHardwarePatchInstalled(venue) && (scanCapabilities.nfc || scanCapabilities.qr)) {
      setQrScannerEntrySource('map');
      setQrScannerVenue(venue);
      setShowQrScannerSheet(true);
      toast.success('Tap Zone ready', { description: `Verify access at ${venue.name}.` });
      return;
    }
    handleOpenVirtualPatch();
  }, [handleOpenVirtualPatch, scanCapabilities]);

  const handleDroppedPin = useCallback((lat: number, lng: number) => {
    triggerLightHaptic();
    const pin = { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    setDroppedRequestPin(pin);
    setPeekVenue(null);
    setShowLayerMenu(false);
    setDroppedPinServiceIntent('White-Glove Valet Pickup');
    setBottomSheetExpanded(true);
    toast('Service location selected', { description: 'Choose what you need at this location.' });
  }, [triggerLightHaptic]);

  useEffect(() => {
    if (!requestServiceLocation) return;
    const target = userCoords ?? { lat: mapCenter[0], lng: mapCenter[1] };
    handleDroppedPin(target.lat, target.lng);
    onServiceLocationRequestConsumed?.();
  }, [handleDroppedPin, mapCenter, onServiceLocationRequestConsumed, requestServiceLocation, userCoords]);

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
    if (normalizedMapQuery && !`${spot.name} ${spot.securityLevel} parking`.toLowerCase().includes(normalizedMapQuery)) return false;
    if (spot.price < filters.priceRange[0] || spot.price > filters.priceRange[1]) return false;
    if (!filters.securityLevel.includes(spot.securityLevel)) return false;
    if (filters.evChargingOnly && !spot.hasEVCharging) return false;
    if (filters.coveredOnly && !spot.isCovered) return false;
    if (filters.showPremiumOnly && !spot.isPremium) return false;
    return true;
  });

  const selectedDestinationCoords = peekVenue
    ? [peekVenue.lat, peekVenue.lng] as [number, number]
    : droppedRequestPin
      ? [droppedRequestPin.lat, droppedRequestPin.lng] as [number, number]
      : null;
  const routeEtaMinutes = selectedDestinationCoords ? estimateEtaMinutes(mapCenter, selectedDestinationCoords) : null;
  const smartParkingSuggestions = useMemo(() => {
    const target = selectedDestinationCoords ?? mapCenter;
    return filteredParkingSpots
      .map(spot => ({ spot, distanceMeters: haversineMeters(target[0], target[1], spot.lat, spot.lng) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 3);
  }, [filteredParkingSpots, selectedDestinationCoords, mapCenter]);
  const droppedPinLandmark = useMemo(() => {
    if (!droppedRequestPin) return null;
    const nearbyVenue = [...tapZoneVenues, ...filteredMapVenues]
      .map(venue => ({ name: venue.name, distanceMeters: haversineMeters(droppedRequestPin.lat, droppedRequestPin.lng, venue.lat, venue.lng) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    const nearbyParking = filteredParkingSpots
      .map(spot => ({ name: spot.name, distanceMeters: haversineMeters(droppedRequestPin.lat, droppedRequestPin.lng, spot.lat, spot.lng) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    const nearest = [nearbyVenue, nearbyParking].filter(Boolean).sort((a, b) => a!.distanceMeters - b!.distanceMeters)[0];
    return nearest ? `Near ${nearest.name}` : 'Nearby area';
  }, [droppedRequestPin, filteredMapVenues, filteredParkingSpots, tapZoneVenues]);
  const visibleSmartParkingSuggestions = droppedRequestPin ? smartParkingSuggestions.slice(0, 2) : smartParkingSuggestions;
  const liveHotspotVenues = useMemo(() => {
    const sourceVenues = [
      ...(showTapZones ? tapZoneVenues : []),
      ...(showVenues ? filteredMapVenues : []),
    ];
    const uniqueVenues = new Map<string, ApiVenue>();
    sourceVenues.forEach((venue) => {
      uniqueVenues.set(String(venue.id ?? venue.name), venue);
    });
    return Array.from(uniqueVenues.values())
      .filter(venue => trendingIds.has(venue.id ?? '') || trendingIds.has(venue.name) || (venue.crowd?.level ?? 0) >= 3)
      .sort((a, b) => (b.crowd?.level ?? 0) - (a.crowd?.level ?? 0))
      .slice(0, 4);
  }, [filteredMapVenues, showTapZones, showVenues, tapZoneVenues, trendingIds]);
  const showTrendingHotspots = (showEvents || showHeatmap) && liveHotspotVenues.length > 0;

  const mapVenueToSpatialResult = useCallback((venue: ApiVenue): SpatialResult => ({
      id: `venue-${venue.id ?? venue.name}`,
      name: venue.name,
      detail: `${venue.category ?? 'Service'} · ${getVenueWaitLabel(venue)}`,
      type: hasHardwarePatchInstalled(venue) ? 'Tap Zone' : 'Provider',
      crowdLabel: getVenueCrowdLabel(venue),
      waitLabel: getVenueWaitLabel(venue),
      isTrending: trendingIds.has(venue.id ?? '') || trendingIds.has(venue.name) || (venue.crowd?.level ?? 0) >= 3,
      onClick: () => { setPeekVenue(venue); setBottomSheetExpanded(true); },
  }), [trendingIds]);

  const partneredResults = useMemo(() => tapZoneVenues.slice(0, 8).map(mapVenueToSpatialResult), [mapVenueToSpatialResult, tapZoneVenues]);

  const nearbyResults = useMemo(() => {
    const providerResults = [...tapZoneVenues, ...filteredMapVenues].slice(0, 8).map(mapVenueToSpatialResult);
    const parkingResults: SpatialResult[] = smartParkingSuggestions.map(({ spot, distanceMeters }) => ({
      id: `parking-${spot.id}`,
      name: spot.name,
      detail: `${formatMeters(distanceMeters)} · ${spot.available}/${spot.total} spots · $${spot.price}/hr`,
      type: 'Parking',
      onClick: () => { setSelectedSpot(spot.id); setShowSpotDetails(true); },
    }));
    return [...providerResults, ...parkingResults].slice(0, 8);
  }, [filteredMapVenues, mapVenueToSpatialResult, smartParkingSuggestions, tapZoneVenues]);

  const partnerVenueCount = tapZoneVenues.length;
  const partnerFocusActive = showVerifiedOnly && showTapZones;
  const spatialResults = partnerFocusActive ? partneredResults : nearbyResults;
  useEffect(() => {
    if (partnerFocusActive || routeDestination || selectedFunction) setNearbySheetDismissed(false);
  }, [partnerFocusActive, routeDestination, selectedFunction]);
  const shouldShowSpatialSheet = !venueDetailsVenue && (peekVenue || droppedRequestPin || (!nearbySheetDismissed && (partnerFocusActive || spatialResults.length > 0)));
  const mapMode: MapMode = isRideBookingOpen
    ? 'ride'
    : droppedRequestPin
      ? 'request'
      : peekVenue
        ? 'station'
      : selectedDestinationCoords
      ? 'navigation'
      : partnerFocusActive
        ? 'partnered'
        : shouldShowSpatialSheet
          ? 'nearby'
          : 'default';
  const isFocusedMapMode = mapMode !== 'default';
  const showSearchBar = mapMode === 'default' || mapMode === 'nearby' || mapMode === 'navigation';
  const trafficPanelActive = showTrafficIntel || selectedFunction === 'traffic-intelligence';
  const hideTapScanFab = showLayerMenu || shouldShowSpatialSheet || partnerFocusActive || isRideBookingOpen;
  const hideRightActionStack = trafficPanelActive || Boolean(droppedRequestPin) || mapMode === 'ride' || mapMode === 'partnered' || mapMode === 'station' || mapMode === 'request';
  const showFloatingNavigationFab = Boolean(selectedDestinationCoords) && mapMode === 'navigation';
  const showLayerButton = mapMode === 'default' || mapMode === 'navigation';
  const showFullRightActionStack = mapMode === 'default' && !showLayerMenu;
  const showSmartParkingRail = visibleSmartParkingSuggestions.length > 0 && !peekVenue && (mapMode === 'nearby' || mapMode === 'navigation');
  const sheetTitle = mapMode === 'partnered' ? 'Partnered Tap Zones' : 'Nearby Intelligence';
  const sheetModeChip = mapMode === 'partnered' ? 'Verified' : 'General';
  const sheetResultCount = spatialResults.length;

  useEffect(() => {
    if (!showLayerButton) setShowLayerMenu(false);
  }, [showLayerButton]);

  const visibleLayerControls = [
    { group: 'Show on map', icon: 'P', label: 'Parking', detail: 'Garages, lots, valet', checked: showParkingSpots, onToggle: () => setShowParkingSpots(v => !v), modes: ['default', 'navigation'] },
    { group: 'Show on map', icon: '•', label: 'Places', detail: 'Restaurants, nightlife, wellness', checked: showVenues, onToggle: () => setShowVenues(v => !v), modes: ['default'] },
    { group: 'Show on map', icon: '⬢', label: 'Tap Zones', detail: `${partnerVenueCount} Patch-ready nearby`, checked: showTapZones, onToggle: () => setShowTapZones(v => !v), modes: ['default'] },
    { group: 'Show on map', icon: '✓', label: 'Verified partners only', detail: 'Show partnered Bytspots first', checked: showVerifiedOnly, onToggle: () => setShowVerifiedOnly(v => !v), modes: ['default'] },
    { group: 'Entry', icon: '✅', label: 'Free', detail: 'No-cost entry', checked: entryFilter === 'free', onToggle: () => setEntryFilter(current => current === 'free' ? null : 'free'), modes: ['default'] },
    { group: 'Entry', icon: '💰', label: 'Paid', detail: 'Premium access', checked: entryFilter === 'paid', onToggle: () => setEntryFilter(current => current === 'paid' ? null : 'paid'), modes: ['default'] },
    { group: 'Category', icon: '🍽️', label: 'Dining', detail: 'Food and chefs', checked: categoryFilter === 'dining', onToggle: () => setCategoryFilter(current => current === 'dining' ? null : 'dining'), modes: ['default'] },
    { group: 'Category', icon: '🍸', label: 'Nightlife', detail: 'Bars and lounges', checked: categoryFilter === 'nightlife', onToggle: () => setCategoryFilter(current => current === 'nightlife' ? null : 'nightlife'), modes: ['default'] },
    { group: 'Category', icon: '☕', label: 'Coffee', detail: 'Work-friendly', checked: categoryFilter === 'coffee', onToggle: () => setCategoryFilter(current => current === 'coffee' ? null : 'coffee'), modes: ['default'] },
    { group: 'Category', icon: '🌳', label: 'Parks', detail: 'Outdoor spots', checked: categoryFilter === 'parks', onToggle: () => setCategoryFilter(current => current === 'parks' ? null : 'parks'), modes: ['default'] },
    { group: 'Vibe', icon: '🟢', label: 'Chill', detail: 'Low-key', checked: vibeFilter === 1, onToggle: () => setVibeFilter(current => current === 1 ? null : 1), modes: ['default'] },
    { group: 'Vibe', icon: '🟡', label: 'Active', detail: 'Balanced', checked: vibeFilter === 2, onToggle: () => setVibeFilter(current => current === 2 ? null : 2), modes: ['default'] },
    { group: 'Vibe', icon: '🟠', label: 'Busy', detail: 'Lively', checked: vibeFilter === 3, onToggle: () => setVibeFilter(current => current === 3 ? null : 3), modes: ['default'] },
    { group: 'Vibe', icon: '🔴', label: 'Packed', detail: 'Peak', checked: vibeFilter === 4, onToggle: () => setVibeFilter(current => current === 4 ? null : 4), modes: ['default'] },
    { group: 'Live info', icon: '⚠️', label: 'Live Reports', detail: 'Crowd, hazards, closures', checked: showReports, onToggle: () => setShowReports(v => !v), modes: ['default', 'navigation'] },
    { group: 'Live info', icon: '🎶', label: 'Live Events', detail: 'Music, activity, momentum', checked: showEvents, onToggle: () => setShowEvents(v => !v), modes: ['default'] },
    { group: 'Live info', icon: '🌡️', label: 'Heatmap', detail: 'Busy areas at a glance', checked: showHeatmap, onToggle: () => setShowHeatmap(v => !v), modes: ['default'] },
    { group: 'Live info', icon: '⚡', label: 'Traffic', detail: 'Street movement conditions', checked: showTrafficIntel, onToggle: () => setShowTrafficIntel(v => !v), modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '🔌', label: 'EV charging', detail: 'Chargers available', checked: filters.evChargingOnly, onToggle: () => setFilters(current => ({ ...current, evChargingOnly: !current.evChargingOnly })), modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '☂️', label: 'Covered', detail: 'Indoor or protected', checked: filters.coveredOnly, onToggle: () => setFilters(current => ({ ...current, coveredOnly: !current.coveredOnly })), modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '★', label: 'Premium', detail: 'Higher-security spots', checked: filters.showPremiumOnly, onToggle: () => setFilters(current => ({ ...current, showPremiumOnly: !current.showPremiumOnly })), modes: ['default', 'navigation'] },
  ].filter(item => item.modes.includes(mapMode));
  const layerControlGroups = ['Show on map', 'Entry', 'Category', 'Vibe', 'Live info', 'Parking options']
    .map(group => ({ group, items: visibleLayerControls.filter(item => item.group === group) }))
    .filter(group => group.items.length > 0);

  useEffect(() => {
    if (!showLayerMenu) return;
    if (!layerControlGroups.some(({ group }) => group === openLayerGroup)) {
      setOpenLayerGroup(layerControlGroups[0]?.group ?? 'Show on map');
    }
  }, [layerControlGroups, openLayerGroup, showLayerMenu]);

  const handleShowPartneredVendors = useCallback(() => {
    void impactLight();
    setShowTapZones(true);
    setShowVerifiedOnly(true);
    setNearbySheetDismissed(false);
    setPeekVenue(null);
    setVenueDetailsVenue(null);
    setBottomSheetExpanded(true);
    toast.success('Partnered vendors', {
      description: partnerVenueCount > 0
        ? `Showing ${partnerVenueCount} Tap Zone partner${partnerVenueCount === 1 ? '' : 's'} nearby.`
        : 'Scanning for Bytspot Verified partners nearby.',
    });
  }, [partnerVenueCount]);

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
        <LongPressDropController
          onDrop={handleDroppedPin}
          onMapTap={() => {
            setShowLayerMenu(false);
            if (!partnerFocusActive) setNearbySheetDismissed(true);
          }}
        />

        {selectedDestinationCoords && (mapMode === 'navigation' || mapMode === 'station') && (
          <Polyline
            positions={[mapCenter, selectedDestinationCoords]}
            pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.78, dashArray: '10 12' }}
          />
        )}

        {/* Parking Markers */}
        {droppedRequestPin && (
          <Marker
            position={[droppedRequestPin.lat, droppedRequestPin.lng]}
            icon={createDroppedPinIcon()}
            eventHandlers={{ click: () => setBottomSheetExpanded(true) }}
          />
        )}

        {showParkingSpots && filteredParkingSpots.map((spot: ParkingSpot) => {
          const status = getAvailabilityStatus(spot);
          const color = getColor(status);
          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={createParkingIcon(color)}
	              eventHandlers={{ click: () => { setSelectedSpot(spot.id); setShowSpotDetails(true); setBottomSheetExpanded(true); } }}
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
              icon={createVibeMarkerIcon(level, isPaid, isTrending, v.entryPrice, isVerified, getVenueCrowdLabel(v), getVenueWaitShortLabel(v))}
              eventHandlers={{
                click: () => {
                  setPeekVenue(v);
                  setVenueDetailsVenue(null);
	                  setBottomSheetExpanded(true);
                },
              }}
            />
          );
        })}

        {/* ── NFC Tap Zone Markers — distinct hex/scanner icon ── */}
        {showTapZones && tapZoneVenues.map((v) => (
          <Marker
            key={`tap-zone-${v.id ?? v.name}`}
            position={[v.lat, v.lng]}
            icon={createTapZoneIcon(getVenueCrowdLabel(v), getVenueWaitShortLabel(v))}
            eventHandlers={{
              click: () => {
                setPeekVenue(v);
                setVenueDetailsVenue(null);
                setBottomSheetExpanded(true);
              },
            }}
          />
        ))}

        {/* Trending Hotspots — high-momentum LIVE layer follows Live Events / Heatmap toggles */}
        {showTrendingHotspots && liveHotspotVenues.map((venue) => (
          <Marker
            key={`hotspot-${venue.id ?? venue.name}`}
            position={[venue.lat, venue.lng]}
            icon={createHotspotIcon(getVenueCrowdLabel(venue))}
            eventHandlers={{
              click: () => {
                setPeekVenue(venue);
                setVenueDetailsVenue(null);
                setBottomSheetExpanded(true);
              },
            }}
          />
        ))}

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
	                setBottomSheetExpanded(true);
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

      {/* Spatial Intelligence Search */}
      <AnimatePresence>
      {showSearchBar && (
      <motion.div
        className="absolute left-3 right-20 top-4 z-[1000]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: isFocusedMapMode ? 0.92 : 1, y: 0, scale: isFocusedMapMode ? 0.98 : 1 }}
        exit={{ opacity: 0, y: -10 }}
        transition={springConfig}
      >
        <div className={`rounded-[24px] border border-white/35 bg-[#080A10] px-3 shadow-2xl ${isFocusedMapMode ? 'py-2.5' : 'py-3'}`}>
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 flex-shrink-0 text-cyan-200" strokeWidth={2.5} />
            <input
              value={mapQuery}
              onChange={(event) => setMapQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && mapQuery.trim()) {
                  setRouteDestination(mapQuery.trim());
                  setBottomSheetExpanded(true);
                  toast.success('Spatial search', { description: `Scanning for ${mapQuery.trim()}` });
                }
              }}
              placeholder="Search destination or service type"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
              style={{ fontWeight: 700 }}
            />
            <div className="hidden rounded-full border border-cyan-400/50 bg-[#06242B] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100 sm:block" style={{ fontWeight: 900 }}>
              Station Mode
            </div>
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Floating Spatial Intelligence Actions */}
      <motion.div
        className={`absolute top-28 right-4 flex flex-col gap-2 ${mapMode === 'navigation' ? 'z-[1006]' : 'z-[1000]'}`}
        data-testid="map-right-action-stack"
        animate={hideRightActionStack ? { opacity: 0, x: 28, scale: 0.96 } : { opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32, mass: 0.85 }}
        style={{ pointerEvents: hideRightActionStack ? 'none' : 'auto', zIndex: mapMode === 'navigation' ? 1006 : 1000 }}
        aria-hidden={hideRightActionStack}
      >
        {showLayerButton && (
        <div className="relative">
          <motion.button
            onClick={(event) => {
              event.currentTarget.blur();
              triggerLightHaptic();
              setShowLayerMenu(prev => {
                const next = !prev;
                if (next) setOpenLayerGroup(layerControlGroups[0]?.group ?? 'Show on map');
                return next;
              });
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showLayerMenu ? 'bg-cyan-500 border-cyan-100' : 'bg-[#050505] border-white/40'}`}
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
            aria-label="Map layers"
            aria-expanded={showLayerMenu}
          >
            <Layers className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
        </div>
        )}
        {!showLayerMenu && (
        <motion.button
          onClick={() => { triggerLightHaptic(); setShouldRecenter(true); }}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
          aria-label="Current location"
        >
          <Crosshair className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        )}
        {showFullRightActionStack && (
        <>
        <motion.button
          onClick={() => { triggerLightHaptic(); setZoomDirection(1); }}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <motion.button
          onClick={() => { triggerLightHaptic(); setZoomDirection(-1); }}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Minus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        {/* Traffic Intelligence toggle */}
        <motion.button
          onClick={(event) => { event.currentTarget.blur(); triggerLightHaptic(); setShowTrafficIntel(!showTrafficIntel); }}
          className={`w-11 h-11 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showTrafficIntel ? 'bg-amber-500 border-amber-200' : 'bg-[#050505] border-white/40'}`}
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
          title="Traffic Intelligence"
          aria-label="Traffic intelligence"
          data-testid="traffic-intelligence-fab"
        >
          <Zap className={`w-5 h-5 ${showTrafficIntel ? 'text-white' : 'text-amber-400'}`} strokeWidth={2.5} />
        </motion.button>

        {/* ── Bytspot Verified Only — hexagonal FAB toggle ── */}
        <motion.button
          onClick={(event) => { event.currentTarget.blur(); handleShowPartneredVendors(); }}
          className="relative w-11 h-11 flex items-center justify-center"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
          aria-pressed={showVerifiedOnly}
          aria-label="Show partnered Tap Zone vendors"
          data-testid="partnered-vendors-patch-button"
          title="Partnered Tap Zone vendors"
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
            className="absolute inset-0 flex items-center justify-center border-2 shadow-xl"
            style={{
              clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)',
              background: showVerifiedOnly
                ? 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))'
                : '#050505',
              borderColor: showVerifiedOnly ? 'rgba(165,243,252,1)' : 'rgba(255,255,255,0.42)',
            }}
            animate={showVerifiedOnly
              ? { scale: [1, 1.04, 1] }
              : { scale: 1 }}
            transition={{ duration: 2.4, repeat: showVerifiedOnly ? Infinity : 0, ease: 'easeInOut' }}
          >
            <Zap
              className={`w-5 h-5 ${showVerifiedOnly ? 'text-white' : 'text-cyan-300'}`}
              strokeWidth={2.6}
            />
          </motion.span>
        </motion.button>
        </>
        )}
      </motion.div>

      {/* Map Layers — full-width mobile sheet so controls do not clip off-screen */}
      <AnimatePresence>
        {showLayerMenu && showLayerButton && (
          <motion.div
            className="absolute inset-0 z-[1007] flex items-end px-3 pb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setShowLayerMenu(false)}
              aria-label="Close Map Layers"
            />
            <motion.div
              className="relative z-10 flex w-full flex-col overflow-hidden rounded-[28px] border border-white/35 bg-[#050505] shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 96px)' }}
              data-testid="map-layers-menu"
              role="dialog"
              aria-label="Map Layers"
              initial={{ y: 28, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 28, scale: 0.98 }}
              transition={springConfig}
            >
              <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/70" />
              <div className="flex items-start justify-between gap-3 border-b border-white/15 px-4 pb-3 pt-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" style={{ fontWeight: 900 }}>Map Layers</p>
                  <h3 className="mt-1 text-[20px] leading-tight text-white" style={{ fontWeight: 900 }}>
                    {mapMode === 'navigation' ? 'What helps this route?' : 'What do you want to see?'}
                  </h3>
                  <p className="mt-0.5 text-[12px] text-white/85" style={{ fontWeight: 650 }}>
                    {mapMode === 'navigation' ? 'Only route-useful layers are shown.' : 'Pick the map signals that matter right now.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLayerMenu(false)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/35 bg-[#080A10] text-white"
                  aria-label="Close Map Layers"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-y-auto px-4 pb-4 pt-3 scrollbar-hide" style={{ maxHeight: 'calc(100vh - 240px)' }}>
                <div className="space-y-2.5">
                  {layerControlGroups.map(({ group, items }) => {
                    const isOpen = openLayerGroup === group;
                    const activeCount = items.filter(item => item.checked).length;
                    return (
                      <section key={group} className="rounded-[22px] border border-white/22 bg-[#080A10] p-2">
                        <button
                          type="button"
                          className={`flex min-h-[56px] w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-colors ${isOpen ? 'border-cyan-300 bg-[#06242B]' : 'border-transparent bg-[#0E1117]'}`}
                          onClick={() => setOpenLayerGroup(group)}
                          aria-expanded={isOpen}
                          aria-controls={`map-layer-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border text-[13px] ${activeCount > 0 ? 'border-cyan-200 bg-cyan-400 text-black' : 'border-white/35 bg-[#050505] text-cyan-100'}`} style={{ fontWeight: 900 }}>
                            {activeCount || items.length}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] leading-tight text-white" style={{ fontWeight: 900 }}>{group}</span>
                            <span className="mt-0.5 block text-[12px] leading-snug text-white/85" style={{ fontWeight: 650 }}>
                              {activeCount > 0 ? `${activeCount} active` : `${items.length} option${items.length === 1 ? '' : 's'}`}
                            </span>
                          </span>
                          <ChevronRight className={`h-5 w-5 flex-shrink-0 text-white transition-transform ${isOpen ? 'rotate-90 text-cyan-100' : ''}`} strokeWidth={2.7} />
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              id={`map-layer-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
                              className="space-y-2 pt-2"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              style={{ overflow: 'hidden' }}
                            >
                              {items.map(item => (
                                <button
                                  key={item.label}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={item.checked}
                                  onClick={item.onToggle}
                                  data-layer-selected={item.checked ? 'true' : 'false'}
                                  className={`flex min-h-[74px] w-full items-center gap-3 rounded-[20px] border p-3.5 text-left transition-colors ${item.checked ? 'border-cyan-200 bg-cyan-400 text-black shadow-[0_0_0_2px_rgba(165,243,252,0.35)]' : 'border-white/30 bg-[#050505] text-white'}`}
                                >
                                  <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border text-[16px] ${item.checked ? 'border-black/20 bg-black/10 text-black' : 'border-cyan-400/35 bg-[#061B22] text-cyan-100'}`} style={{ fontWeight: 900 }}>{item.icon}</span>
                                  <span className="min-w-0 flex-1 pr-1">
                                    <span className={`block whitespace-normal text-[16px] leading-tight ${item.checked ? 'text-black' : 'text-white'}`} style={{ fontWeight: 950 }}>{item.label}</span>
                                    <span className={`mt-1 block whitespace-normal text-[12px] leading-snug ${item.checked ? 'text-black/80' : 'text-white/85'}`} style={{ fontWeight: 750 }}>{item.detail}</span>
                                  </span>
                                  <span className={`flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-xl border px-1.5 ${item.checked ? 'border-black/25 bg-black text-cyan-200' : 'border-white/45 bg-[#080A10] text-transparent'}`}>
                                    {item.checked ? <span className="text-[10px] uppercase tracking-[0.08em]" style={{ fontWeight: 950 }}>On</span> : <Check className="h-4 w-4" strokeWidth={3} />}
                                  </span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </section>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Route FAB — appears only after a venue/pin route context exists */}
      <AnimatePresence>
        {showFloatingNavigationFab && selectedDestinationCoords && (
          <motion.div
            className="fixed bottom-28 right-4 z-[1001]"
            initial={{ opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: 14 }}
            transition={springConfig}
          >
            <motion.button
              data-testid="orange-navigation-fab"
              onClick={() => openNativeNavigation(selectedDestinationCoords[0], selectedDestinationCoords[1], peekVenue?.name ?? droppedRequestPin?.label ?? routeDestination ?? 'Destination')}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-500 border-2 border-white/40 shadow-xl"
              whileTap={{ scale: 0.9 }}
              title="Start navigation"
              aria-label="Start navigation"
            >
              <Navigation className="w-6 h-6 text-white" strokeWidth={2.7} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {!hideTapScanFab && (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1001]" data-testid="tap-scan-fab">
        <motion.button
          onClick={handleOpenVirtualPatch}
          className="relative min-w-[210px] px-3 py-3 rounded-full border border-white/25 shadow-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))' }}
          whileTap={{ scale: 0.96 }}
          animate={{ y: [0, -2, 0] }}
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
      )}

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
              className="w-full max-w-sm rounded-[28px] border border-cyan-400/55 bg-[#050505] shadow-2xl overflow-hidden"
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
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#080A10] border border-white/30 text-[10px] text-white uppercase tracking-[0.18em]" style={{ fontWeight: 700 }}>
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
                      className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center bg-[#080A10] border border-white/35 text-white"
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
                          <div className="shrink-0 px-2.5 py-1 rounded-full bg-[#080A10] border border-white/30 text-[10px] text-white uppercase tracking-[0.16em]" style={{ fontWeight: 700 }}>
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
          ageGate={qrScannerVenue?.ageGate ?? null}
          appClipEntry={qrScannerEntrySource === 'app-clip'}
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
            <div className="p-4 rounded-[20px] bg-[#050505] border-2 border-white/40 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] text-white" style={{ fontWeight: 700 }}>📋 Community Report</h3>
                <motion.button onClick={() => setShowReportForm(false)} whileTap={{ scale: 0.9 }}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[#080A10] border border-white/40">
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
                placeholder="What's happening?" className="w-full p-2.5 rounded-[12px] bg-[#080A10] border border-white/40 text-[13px] text-white placeholder:text-white/55 outline-none mb-3"
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

      {/* Live Update Indicator — auto-hides so it doesn't obstruct the map */}
      <AnimatePresence>
        {showLiveUpdates && (
          <motion.div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-[#050505] border border-white/40 shadow-xl flex items-center gap-2 pointer-events-none"
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
          <div className="p-4 rounded-[20px] bg-[#050505] border-2 border-white/40 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-white/30 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white flex-1" style={{ fontWeight: 600 }}>
                Route Planning
              </h3>
              <motion.button
                onClick={() => setRouteDestination('')}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#080A10] border border-white/40"
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
            
            {/* Destination Input */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-[14px] bg-[#080A10] border border-white/40">
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

      {/* Spatial Intelligence Bottom Sheet */}
      <AnimatePresence>
        {shouldShowSpatialSheet && (
          <motion.div
            className="absolute bottom-20 left-3 right-3 z-[1002]"
            data-testid="spatial-intelligence-sheet"
            initial={{ y: SPATIAL_SHEET_PEEK_Y, opacity: 0 }}
            animate={{ y: bottomSheetExpanded ? 0 : SPATIAL_SHEET_PEEK_Y, opacity: 1 }}
            exit={{ y: 180, opacity: 0 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: SPATIAL_SHEET_PEEK_Y }}
            dragElastic={0.06}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              const shouldExpand = info.velocity.y < -SPATIAL_SHEET_SNAP_VELOCITY || info.offset.y < -SPATIAL_SHEET_SNAP_OFFSET;
              const shouldCollapse = info.velocity.y > SPATIAL_SHEET_SNAP_VELOCITY || info.offset.y > SPATIAL_SHEET_SNAP_OFFSET;
              setBottomSheetExpanded(current => shouldExpand ? true : shouldCollapse ? false : current);
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.82 }}
          >
            <div
              className={`max-h-[72vh] overflow-hidden rounded-[28px] border bg-[#050505] shadow-2xl ${peekVenueIsVerified ? 'border-cyan-400/55' : 'border-white/35'}`}
              data-testid="spatial-sheet-surface"
              style={peekVenueIsVerified ? { boxShadow: '0 0 34px rgba(34,211,238,0.16), 0 18px 42px rgba(0,0,0,0.48)' } : undefined}
            >
              <button
                className="mx-auto mt-3 block h-1.5 w-12 rounded-full bg-white/70"
                data-testid="spatial-sheet-toggle"
                onClick={() => setBottomSheetExpanded(prev => !prev)}
                aria-label="Toggle map results sheet"
              />

              <div className="max-h-[68vh] overflow-y-auto px-4 pb-4 pt-3 scrollbar-hide">
                {peekVenue ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-400/50 bg-[#06242B] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100" style={{ fontWeight: 900 }}>Station Mode</span>
                          {peekVenueIsVerified && <span className="rounded-full border border-cyan-300/60 bg-[#06242B] px-2.5 py-1 text-[10px] text-cyan-100" style={{ fontWeight: 900 }}>Tap Zone</span>}
                          <span className="rounded-full border border-orange-300/70 bg-[#2A1205] px-2.5 py-1 text-[10px] text-orange-100" style={{ fontWeight: 900 }}>Crowd Level · {getVenueCrowdLabel(peekVenue)}</span>
                          <span className="rounded-full border border-white/35 bg-[#0B0B0F] px-2.5 py-1 text-[10px] text-white" style={{ fontWeight: 800 }}>Wait Time · {getVenueWaitLabel(peekVenue)}</span>
                        </div>
                        <h3 className="truncate text-[20px] leading-tight text-white" style={{ fontWeight: 900 }}>{peekVenue.name}</h3>
                        <p className="mt-1 text-[12px] capitalize text-white">{peekVenue.category} · {peekVenue.address || 'Nearby'}{routeEtaMinutes ? ` · ${routeEtaMinutes} min ETA` : ''}</p>
                      </div>
                      <motion.button
                        onClick={() => setPeekVenue(null)}
                        className="h-8 w-8 flex-shrink-0 rounded-full border border-white/40 bg-[#080A10] flex items-center justify-center"
                        whileTap={{ scale: 0.88 }}
                      >
                        <X className="h-3.5 w-3.5 text-white" />
                      </motion.button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-orange-300/50 bg-[#2A1205] p-3"><p className="text-[10px] text-orange-100">Crowd Level</p><p className="text-[13px] text-white" style={{ fontWeight: 900 }}>{getVenueCrowdLabel(peekVenue)}</p></div>
                      <div className="rounded-2xl border border-white/30 bg-[#080A10] p-3"><p className="text-[10px] text-cyan-100">Access</p><p className="text-[13px] text-white" style={{ fontWeight: 900 }}>{peekVenueIsVerified ? 'Patch ready' : 'Standard'}</p></div>
                      <div className="rounded-2xl border border-white/30 bg-[#080A10] p-3"><p className="text-[10px] text-cyan-100">Wait Time</p><p className="text-[13px] text-white" style={{ fontWeight: 900 }}>{getVenueWaitShortLabel(peekVenue)}</p></div>
                    </div>

                    {selectedDestinationCoords && (
                      <div className="rounded-2xl border border-cyan-400/50 bg-[#06242B] p-3">
                        <div className="flex items-center gap-2 text-cyan-100"><Route className="h-4 w-4" /><span className="text-[12px]" style={{ fontWeight: 900 }}>Route preview · {routeEtaMinutes} min ETA</span></div>
                        <p className="mt-1 text-[11px] text-white">Preview shown on map. Start Navigation hands off to Apple Maps / Google Maps.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <motion.button onClick={() => handleVerifyVenueAccess(peekVenue)} className="rounded-2xl bg-cyan-400 px-3 py-3 text-[13px] text-black flex items-center justify-center gap-1.5" style={{ fontWeight: 900 }} whileTap={{ scale: 0.96 }}>
                        <QrCode className="h-4 w-4" /> Verify Access
                      </motion.button>
                      <motion.button onClick={() => openNativeNavigation(peekVenue.lat, peekVenue.lng, peekVenue.name)} className="rounded-2xl border border-white/40 bg-[#080A10] px-3 py-3 text-[13px] text-white flex items-center justify-center gap-1.5" style={{ fontWeight: 900 }} whileTap={{ scale: 0.96 }}>
                        <Navigation className="h-4 w-4" /> Start Navigation
                      </motion.button>
                    </div>
                    <button onClick={() => setVenueDetailsVenue(peekVenue)} className="w-full rounded-2xl border border-purple-300/55 bg-[#21102F] px-3 py-3 text-[13px] text-purple-100" style={{ fontWeight: 900 }}>View full venue details</button>
                    <motion.button
                      onClick={() => onOpenConciergeRequest?.(`Create a Concierge request for services at ${peekVenue.name}.`)}
                      className="w-full rounded-2xl bg-white px-3 py-3.5 text-[14px] text-black flex items-center justify-center gap-1.5"
                      style={{ fontWeight: 900 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <Sparkles className="h-4 w-4" /> Request Concierge Service
                    </motion.button>
                  </div>
                ) : droppedRequestPin ? (
                  <div className="space-y-3" data-testid="dropped-location-request-flow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100" style={{ fontWeight: 900 }}>Service location</p>
                        <h3 className="mt-1 text-[20px] leading-tight text-white" style={{ fontWeight: 900 }}>Request Service at This Location</h3>
                        <p className="mt-1 text-[12px] text-white/85" style={{ fontWeight: 700 }}>{droppedRequestPin.label} · {droppedPinLandmark}</p>
                      </div>
                      <button onClick={() => setDroppedRequestPin(null)} className="h-8 w-8 flex-shrink-0 rounded-full border border-white/40 bg-[#080A10] flex items-center justify-center" aria-label="Close service location request"><X className="h-3.5 w-3.5 text-white" /></button>
                    </div>

                    <div className="rounded-[22px] border border-white/30 bg-[#080A10] p-3">
                      <div className="mb-3 flex items-center gap-2 text-white">
                        <Sparkles className="h-4 w-4 text-cyan-200" strokeWidth={2.6} />
                        <span className="text-[15px]" style={{ fontWeight: 900 }}>What would you like?</span>
                      </div>
                      <div className="space-y-2">
                        {DROPPED_PIN_SERVICE_OPTIONS.map(option => (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={droppedPinServiceIntent === option}
                            onClick={() => setDroppedPinServiceIntent(option)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors ${droppedPinServiceIntent === option ? 'border-cyan-300 bg-[#06242B]' : 'border-white/25 bg-[#050505]'}`}
                          >
                            <span className="text-[13px] text-white" style={{ fontWeight: 850 }}>{option}</span>
                            <span className={`h-3 w-3 rounded-full border ${droppedPinServiceIntent === option ? 'border-cyan-100 bg-cyan-300' : 'border-white/45'}`} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <motion.button
                      onClick={() => onOpenConciergeRequest?.(`Create a Concierge request for ${droppedPinServiceIntent} at ${droppedRequestPin.label} (${droppedPinLandmark ?? 'nearby area'}). Include smart parking, access, arrival timing, and nearby service context.`)}
                      className="w-full rounded-2xl bg-white px-3 py-3.5 text-[14px] text-black flex items-center justify-center gap-1.5"
                      style={{ fontWeight: 900 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <Sparkles className="h-4 w-4" /> Create Concierge Request
                    </motion.button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-400/50 bg-[#06242B] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-100" style={{ fontWeight: 900 }}>{sheetModeChip}</span>
                          {mapMode === 'partnered' && <span className="rounded-full border border-white/30 bg-[#080A10] px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 800 }}>{partnerVenueCount} nearby</span>}
                        </div>
                        <h3 className="truncate text-[20px] text-white" style={{ fontWeight: 900 }}>{sheetTitle}</h3>
                        <p className="mt-0.5 text-[12px] text-white/80" style={{ fontWeight: 650 }}>{mapMode === 'partnered' ? 'Verified hardware-patch venues only' : 'Live context around your map view'}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="rounded-full border border-white/35 bg-[#080A10] px-2.5 py-1 text-[11px] text-white" style={{ fontWeight: 800 }}>{sheetResultCount} results</span>
                        <button
                          type="button"
                          aria-label="Close nearby intelligence sheet"
                          data-testid="close-nearby-intelligence-sheet"
                          onClick={() => {
                            setNearbySheetDismissed(true);
                            if (partnerFocusActive) setShowVerifiedOnly(false);
                            setBottomSheetExpanded(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-[#080A10] text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {showTrendingHotspots && mapMode === 'nearby' && (
                      <div className="rounded-[22px] border border-orange-300/55 bg-[#2A1205] p-3" data-testid="trending-now-section">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-white"><Zap className="h-4 w-4 text-orange-200" /><span className="text-[14px]" style={{ fontWeight: 950 }}>Trending Now</span></div>
                          <span className="byt-live-badge rounded-full bg-[#ff2f86] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-black" style={{ fontWeight: 950 }}>LIVE</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {liveHotspotVenues.map(venue => (
                            <button key={`trend-row-${venue.id ?? venue.name}`} onClick={() => { setPeekVenue(venue); setBottomSheetExpanded(true); }} className="min-w-[178px] rounded-2xl border border-orange-200/55 bg-[#050505] p-3 text-left">
                              <span className="block text-[13px] leading-tight text-white" style={{ fontWeight: 900 }}>{venue.name}</span>
                              <span className="mt-2 inline-flex rounded-full border border-orange-300/60 bg-[#2A1205] px-2 py-0.5 text-[10px] text-orange-100" style={{ fontWeight: 900 }}>{getVenueCrowdLabel(venue)}</span>
                              <span className="ml-1 inline-flex rounded-full border border-white/30 bg-[#080A10] px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 850 }}>{getVenueWaitLabel(venue)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {spatialResults.length > 0 ? (
                      spatialResults.map(result => (
                        <button key={result.id} onClick={result.onClick} className="flex w-full items-center gap-3 rounded-2xl border border-white/30 bg-[#080A10] p-3 text-left">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/40 bg-[#06242B] text-cyan-100"><MapPin className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-white" style={{ fontWeight: 850 }}>{result.name}</span>
                            <span className="block truncate text-[11px] text-white">{result.type} · {result.detail}</span>
                            {result.crowdLabel && (
                              <span className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-orange-300/55 bg-[#2A1205] px-2 py-0.5 text-[10px] text-orange-100" style={{ fontWeight: 900 }}>Crowd Level · {result.crowdLabel}</span>
                                <span className="rounded-full border border-white/25 bg-[#050505] px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 850 }}>{result.waitLabel}</span>
                                {result.isTrending && <span className="byt-live-badge rounded-full bg-[#ff2f86] px-2 py-0.5 text-[10px] text-black" style={{ fontWeight: 950 }}>LIVE</span>}
                              </span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 text-white" />
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/30 bg-[#080A10] p-4 text-left">
                        <p className="text-[15px] text-white" style={{ fontWeight: 900 }}>No Partnered Tap Zones nearby yet.</p>
                        <p className="mt-1 text-[12px] text-white/80">Ask Concierge to locate verified access, parking, or services.</p>
                        <button
                          onClick={() => onOpenConciergeRequest?.('Help me locate verified Tap Zone access, parking, or services near my current map area.')}
                          className="mt-3 rounded-2xl bg-white px-3 py-2.5 text-[13px] text-black"
                          style={{ fontWeight: 900 }}
                        >
                          Ask Concierge
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {showSmartParkingRail && (
                  <div className="mt-4 space-y-2" data-testid="smart-parking-live-rail">
                    <div className="flex items-center justify-between gap-2 text-white">
                      <div className="flex items-center gap-2"><Car className="h-4 w-4 text-cyan-200" /><span className="text-[13px]" style={{ fontWeight: 950 }}>Smart Parking</span></div>
                      <span className="rounded-full bg-[#ff2f86] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-black" style={{ fontWeight: 950 }}>LIVE</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {visibleSmartParkingSuggestions.map(({ spot, distanceMeters }) => (
                        <button key={spot.id} onClick={() => { setSelectedSpot(spot.id); setShowSpotDetails(true); }} className="min-w-[178px] rounded-[20px] border border-cyan-300/45 bg-[#06242B] p-3 text-left">
                          <span className="block text-[13px] leading-tight text-white" style={{ fontWeight: 900 }}>{spot.name}</span>
                          <span className="mt-2 flex items-center justify-between gap-2">
                            <span className="rounded-full border border-emerald-300/50 bg-[#062415] px-2 py-0.5 text-[11px] text-emerald-100" style={{ fontWeight: 900 }}>{spot.available}/{spot.total} spots</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-black" style={{ fontWeight: 950 }}>{spot.price > 0 ? `$${spot.price}/hr` : 'Live price'}</span>
                          </span>
                          <span className="mt-2 block text-[11px] text-white/85" style={{ fontWeight: 700 }}>{formatMeters(distanceMeters)} away · {spot.isCovered ? 'Covered' : 'Open-air'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    <X className="w-4 h-4 text-white" />
                  </motion.button>
                </div>
                <p className="text-[13px] text-white leading-snug mb-4" style={{ fontWeight: 600 }}>
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
                <div className="mb-4 rounded-[14px] border border-white/35 bg-[#080A10] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-white">
                    <span style={{ fontWeight: 800 }}>Loyalty price</span>
                    <span className="text-white" style={{ fontWeight: 900 }}>{formatPremiumCents(premiumEstimatedCents)} / month</span>
                  </div>
                  <label className="mb-2 flex items-center justify-between gap-3 rounded-[12px] bg-white/5 px-3 py-2 text-[12px] text-white/75" style={{ fontWeight: 700 }}>
                    <span>Use {premiumAvailablePoints.toLocaleString()} points</span>
                    <input
                      type="checkbox"
                      checked={usePremiumPoints}
                      disabled={premiumAvailablePoints <= 0 || premiumMaxPointsDiscountCents <= 0}
                      onChange={(event) => setUsePremiumPoints(event.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                  <input
                    value={premiumCouponCode}
                    onChange={(event) => setPremiumCouponCode(event.target.value)}
                    placeholder="Coupon code"
                    className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white placeholder:text-white/35 outline-none focus:border-cyan-300/60"
                    style={{ fontWeight: 700 }}
                  />
                  {premiumPointsDiscountCents > 0 && (
                    <p className="mt-2 text-[11px] text-emerald-200/80" style={{ fontWeight: 700 }}>
                      Points save {formatPremiumCents(premiumPointsDiscountCents)} before any Stripe coupon is applied.
                    </p>
                  )}
                </div>
                <motion.button
                  onClick={handleUpgradeToPremium}
                  disabled={premiumCheckoutPending}
                  className="w-full py-3.5 rounded-[16px] border border-white/25 shadow-2xl text-white text-[15px] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))', fontWeight: 800 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {premiumCheckoutPending ? 'Opening checkout…' : `Upgrade · ${formatPremiumCents(premiumEstimatedCents)} / month`}
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
