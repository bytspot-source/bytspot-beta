import 'leaflet/dist/leaflet.css';
import { Capacitor } from '@capacitor/core';
import { MapContainer, TileLayer, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation,
  Zap, X,
  MapPin, ChevronRight, QrCode,
  Lock, Sparkles, Wifi, Car, Route,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { MapFunction, MapViewMode } from './map/mapTypes';
import { toast } from 'sonner@2.0.3';
import { ParkingSpotDetails } from './ParkingSpotDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
import { TrafficIntelligencePanel } from './TrafficIntelligencePanel';
import { useVenues } from '../utils/hooks/useVenues';
import { getTrendingVenueIds } from '../utils/venueHours';
import { trpc, type ApiVenue } from '../utils/trpc';
import { VirtualPatchScannerSheet } from './VirtualPatchScannerSheet';
import { AITransparencyNotice } from './AITransparencyNotice';
import { buildVerifiedVirtualPatchContext, type VirtualPatchAuditEvent, type VirtualPatchContext, type VirtualPatchScanVerification, VIRTUAL_PATCH_CONTEXT_KEY } from '../utils/virtualPatch';
import { filterMapVenues, hasHardwarePatchInstalled } from '../utils/mapVenues';
import { getUserPreferences, getPreferredMapFilters, getCulturalContext } from '../utils/personalization';
import { type MapParkingSpot } from '../utils/mapParking';
import { impactLight } from '../utils/haptics';
import { MapActionStack } from './map/MapActionStack';
import { MapLayersMenu } from './map/MapLayersMenu';
import { MapSearchBar } from './map/MapSearchBar';
import { SpatialBottomSheetFrame } from './map/SpatialBottomSheetFrame';
import { type PendingPatchScan, useMapPatchScanner } from './map/useMapPatchScanner';
import { useMapParkingData } from './map/useMapParkingData';
import { BYTSPOT_COMMERCE_EVENT, PLATINUM_SUBSCRIPTION_PLAN } from '../utils/insiderCommerce';

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
  pendingPatchScan?: PendingPatchScan | null;
  /** Called once the pending scan has been delivered to the scanner so App.tsx can clear it. */
  onPendingPatchScanConsumed?: () => void;
  /** Route a map-created request into the established Concierge tab without adding nav layers. */
  onOpenConciergeRequest?: (prefill: string) => void;
  /** Request from the Map menu to create a Service Location at the user's current location. */
  requestServiceLocation?: boolean;
  onServiceLocationRequestConsumed?: () => void;
}

type MapMode = 'default' | 'nearby' | 'partnered' | 'station' | 'request' | 'ride' | 'navigation' | 'traffic';

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

// Parking source merge lives in src/utils/mapParking.ts.

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
      if (target?.closest('.leaflet-control, .leaflet-interactive')) return;
      onMapTap();
    },
    contextmenu(event) {
      onDrop(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
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
  const { venues: apiVenues } = useVenues();
  const parkingData = useMapParkingData({ apiVenues, userCoords, fallbackCenter: DEFAULT_MAP_CENTER });
  const [showParkingSpots, setShowParkingSpots] = useState(true);
  const [showVenues, setShowVenues] = useState(true);
  const [showTapZones, setShowTapZones] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [showSpotDetails, setShowSpotDetails] = useState(false);
  const [routeDestination, setRouteDestination] = useState<string>(destination || '');
  const [showTrafficIntel, setShowTrafficIntel] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [openLayerGroup, setOpenLayerGroup] = useState('Explore');
  const [mapQuery, setMapQuery] = useState(destination || '');
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [droppedRequestPin, setDroppedRequestPin] = useState<DroppedRequestPin | null>(null);
  const [droppedPinServiceIntent, setDroppedPinServiceIntent] = useState<DroppedPinServiceIntent>('White-Glove Valet Pickup');
  const [shouldRecenter, setShouldRecenter] = useState(false);
  const [zoomDirection, setZoomDirection] = useState(0);
  const [reservationSpot, setReservationSpot] = useState<ReservationSpot | null>(null);

  // ─── Vibe-centric filter state ─────────────────────────────────────────────
  const [vibeFilter, setVibeFilter] = useState<number | null>(null);         // 1|2|3|4|null
  const [entryFilter, setEntryFilter] = useState<'free' | 'paid' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // 'dining'|'nightlife'|'coffee'|'parks'|null

  const preferredMapFilters = useMemo(
    () => getPreferredMapFilters(getUserPreferences(), getCulturalContext()),
    []
  );

  useEffect(() => {
    if (vibeFilter === null && categoryFilter === null) {
      if (preferredMapFilters.vibeFilter !== null) {
        setVibeFilter(preferredMapFilters.vibeFilter);
      }
      if (preferredMapFilters.categoryFilter !== null) {
        setCategoryFilter(preferredMapFilters.categoryFilter);
      }
    }
  }, [preferredMapFilters, vibeFilter, categoryFilter]);
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [peekVenue, setPeekVenue] = useState<ApiVenue | null>(null);
  const [nearbySheetDismissed, setNearbySheetDismissed] = useState(true);
  const [showVirtualPatchSheet, setShowVirtualPatchSheet] = useState(false);
  const [showAINotice, setShowAINotice] = useState(false);
  const {
    showQrScannerSheet,
    qrScannerVenue,
    qrScannerEntrySource,
    qrScannerTier,
    qrScannerTagUseMode,
    qrScannerTagIntent,
    qrScannerReferralCode,
    qrScannerGroupSize,
    setShowQrScannerSheet,
    setQrScannerVenue,
    resetQrScannerContext,
    openMapQrScanner,
    openPendingPatchScan,
    handleCloseQrScanner,
  } = useMapPatchScanner();
  const [showLiveUpdates, setShowLiveUpdates] = useState(true);
  // The backend's legacy isPremium flag maps to canonical Platinum membership.
  const [hasPlatinumMembership, setHasPlatinumMembership] = useState(false);
  const [showPlatinumTeaser, setShowPlatinumTeaser] = useState(false);
  const [platinumCheckoutPending, setPlatinumCheckoutPending] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const membershipRefreshGeneration = useRef(0);

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

  const refreshMembership = useCallback(() => {
    const generation = ++membershipRefreshGeneration.current;
    setHasPlatinumMembership(false);
    trpc.subscription.status.query()
      .then((data) => {
        if (generation !== membershipRefreshGeneration.current) return;
        setSubscriptionStatus(data);
        setHasPlatinumMembership(Boolean(data?.isPremium));
      })
      .catch(() => {
        if (generation === membershipRefreshGeneration.current) setHasPlatinumMembership(false);
      });
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshMembership(); };
    refreshMembership();
    window.addEventListener(BYTSPOT_COMMERCE_EVENT, refreshMembership);
    window.addEventListener('focus', refreshMembership);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      membershipRefreshGeneration.current += 1;
      window.removeEventListener(BYTSPOT_COMMERCE_EVENT, refreshMembership);
      window.removeEventListener('focus', refreshMembership);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshMembership]);

  const springConfig = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
  const triggerLightHaptic = useCallback(() => { void impactLight(); }, []);

  // Venues that have high check-in velocity in the last hour
  const trendingIds = useMemo(() => getTrendingVenueIds(), []);

  // Apply Verified-only / vibe / entry / category filters to the full ApiVenue list
  const normalizedMapQuery = mapQuery.trim().toLowerCase();
  const allFilteredVenues = useMemo<ApiVenue[]>(
    () => filterMapVenues(apiVenues, {
      showVerifiedOnly,
      vibeFilter: normalizedMapQuery ? null : vibeFilter,
      entryFilter,
      categoryFilter: normalizedMapQuery ? null : categoryFilter,
    }).filter((venue) => {
      if (!normalizedMapQuery) return true;
      const haystack = [venue.name, venue.category, venue.address, venue.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedMapQuery);
    }),
    [apiVenues, vibeFilter, entryFilter, categoryFilter, showVerifiedOnly, normalizedMapQuery],
  );
  const filteredMapVenues = useMemo<ApiVenue[]>(
    () => allFilteredVenues.filter((v) => !showTapZones || !hasHardwarePatchInstalled(v)),
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

  // Universal-link / App Clip / wallet handoff: when App.tsx receives a deep-link
  // or My Access resume request, auto-open the scanner. If a patch ID is known,
  // prefill it; otherwise the live NFC/QR payload supplies the patch identifier.
  useEffect(() => {
    if (!pendingPatchScan) return;
    openPendingPatchScan(pendingPatchScan);
    onPendingPatchScanConsumed?.();
  }, [openPendingPatchScan, pendingPatchScan, onPendingPatchScanConsumed]);

  const handleQrVerified = useCallback((verification: VirtualPatchScanVerification) => {
    const targetVenue = qrScannerVenue ?? nearbyVerifiedVenue?.venue ?? null;
    saveVirtualPatchContext(buildVerifiedVirtualPatchContext(verification, {
      source: 'map',
      venueId: targetVenue?.id ?? null,
      venueName: targetVenue?.name ?? null,
      patchId: verification.patchId ?? targetVenue?.hardwarePatch?.id ?? null,
      tier: verification.tier ?? qrScannerTier ?? null,
      tagUseMode: verification.tagUseMode ?? qrScannerTagUseMode ?? null,
      tagIntent: verification.tagIntent ?? qrScannerTagIntent ?? null,
      referralCode: verification.referralCode ?? qrScannerReferralCode ?? null,
      groupSize: verification.groupSize ?? qrScannerGroupSize ?? null,
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
  }, [nearbyVerifiedVenue, qrScannerGroupSize, qrScannerReferralCode, qrScannerTagIntent, qrScannerTagUseMode, qrScannerTier, qrScannerVenue, scanCapabilities]);

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
      openMapQrScanner(targetVenue);
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
  }, [nearbyVerifiedVenue, onOpenAccessWallet, openMapQrScanner, scanCapabilities]);

  const handleOpenVirtualPatch = useCallback(() => {
    void impactLight();
    setPeekVenue(null);
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);
    resetQrScannerContext();

    const suggestedVenue = nearbyVerifiedVenue?.venue ?? (peekVenueIsVerified ? peekVenue : nearestVerifiedVenue?.venue) ?? null;

    if (nearbyVerifiedVenue) {
      setShowVirtualPatchSheet(true);
      return;
    }

    if (suggestedVenue && (scanCapabilities.nfc || scanCapabilities.qr)) {
      openMapQrScanner(suggestedVenue);
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
      openMapQrScanner(synthetic);
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
  }, [nearbyVerifiedVenue, nearestVerifiedVenue, onOpenAccessWallet, openMapQrScanner, peekVenue, peekVenueIsVerified, resetQrScannerContext, scanCapabilities]);

  const platinumOffer = subscriptionStatus?.subscriptionOffers?.[PLATINUM_SUBSCRIPTION_PLAN];
  const platinumBaseCents = Number(platinumOffer?.baseUnitAmountCents ?? 999);
  const formatPlatinumCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleUpgradeToPlatinum = useCallback(async () => {
    if (platinumCheckoutPending) return;
    setPlatinumCheckoutPending(true);
    try {
      const result = await trpc.subscription.createCheckout.mutate({
        plan: PLATINUM_SUBSCRIPTION_PLAN,
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast('Platinum preview', {
        description: result?.message ?? 'Stripe is not configured in this build — perks unlock will be available soon.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not start checkout';
      toast.error('Platinum upgrade unavailable', { description: message });
    } finally {
      setPlatinumCheckoutPending(false);
    }
  }, [platinumCheckoutPending]);

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
    if (hasHardwarePatchInstalled(venue) && (scanCapabilities.nfc || scanCapabilities.qr)) {
      openMapQrScanner(venue);
      toast.success('Tap Zone ready', { description: `Verify access at ${venue.name}.` });
      return;
    }
    handleOpenVirtualPatch();
  }, [handleOpenVirtualPatch, openMapQrScanner, scanCapabilities]);

  const handleDroppedPin = useCallback((lat: number, lng: number) => {
    triggerLightHaptic();
    const pin = { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    setDroppedRequestPin(pin);
    setPeekVenue(null);
    setShowTrafficIntel(false);
    setShowVerifiedOnly(false);
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

  const filteredParkingSpots = showParkingSpots ? parkingData.filter((spot: ParkingSpot) => {
    if (normalizedMapQuery && !`${spot.name} ${spot.securityLevel} parking`.toLowerCase().includes(normalizedMapQuery)) return false;
    if (spot.price < filters.priceRange[0] || spot.price > filters.priceRange[1]) return false;
    if (!filters.securityLevel.includes(spot.securityLevel)) return false;
    if (filters.evChargingOnly && !spot.hasEVCharging) return false;
    if (filters.coveredOnly && !spot.isCovered) return false;
    if (filters.showPremiumOnly && !spot.isPremium) return false;
    return true;
  }) : [];

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
  const showTrendingHotspots = liveHotspotVenues.length > 0;

  const focusVenue = useCallback((venue: ApiVenue) => {
    setShowTrafficIntel(false);
    setShowLayerMenu(false);
    setDroppedRequestPin(null);
    setPeekVenue(venue);
    setBottomSheetExpanded(true);
  }, []);

  const mapVenueToSpatialResult = useCallback((venue: ApiVenue): SpatialResult => ({
      id: `venue-${venue.id ?? venue.name}`,
      name: venue.name,
      detail: `${venue.category ?? 'Service'} · ${getVenueWaitLabel(venue)}`,
      type: hasHardwarePatchInstalled(venue) ? 'Tap Zone' : 'Provider',
      crowdLabel: getVenueCrowdLabel(venue),
      waitLabel: getVenueWaitLabel(venue),
      isTrending: trendingIds.has(venue.id ?? '') || trendingIds.has(venue.name) || (venue.crowd?.level ?? 0) >= 3,
      onClick: () => focusVenue(venue),
  }), [focusVenue, trendingIds]);

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
  const trafficPanelActive = showTrafficIntel || selectedFunction === 'traffic-intelligence';
  const hasActiveSpatialQuery = normalizedMapQuery.length > 0;
  const shouldShowSpatialSheet = !trafficPanelActive && (peekVenue || droppedRequestPin || hasActiveSpatialQuery || (!nearbySheetDismissed && (partnerFocusActive || spatialResults.length > 0)));
  const mapMode: MapMode = isRideBookingOpen
    ? 'ride'
    : droppedRequestPin
      ? 'request'
      : peekVenue
        ? 'station'
      : trafficPanelActive
        ? 'traffic'
      : selectedDestinationCoords
      ? 'navigation'
      : partnerFocusActive
        ? 'partnered'
        : shouldShowSpatialSheet
          ? 'nearby'
          : 'default';
  const isFocusedMapMode = mapMode !== 'default';
  const showSearchBar = mapMode === 'default' || mapMode === 'nearby' || mapMode === 'navigation';
  const hideTapScanFab = showLayerMenu || shouldShowSpatialSheet || partnerFocusActive || isRideBookingOpen || mapMode === 'traffic';
  const hideRightActionStack = mapMode === 'traffic' || Boolean(droppedRequestPin) || mapMode === 'ride' || mapMode === 'partnered' || mapMode === 'station' || mapMode === 'request';
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

  const toggleTrafficIntel = useCallback(() => {
    const nextTrafficState = !showTrafficIntel;
    if (nextTrafficState) {
      setShowLayerMenu(false);
      setNearbySheetDismissed(true);
      setShowVerifiedOnly(false);
      setPeekVenue(null);
      setDroppedRequestPin(null);
      setBottomSheetExpanded(false);
      setShowSpotDetails(false);
      setSelectedSpot(null);
    }
    setShowTrafficIntel(nextTrafficState);
  }, [showTrafficIntel]);

  const visibleLayerControls = [
    { group: 'Explore', icon: 'P', label: 'Parking', detail: 'Include parking in results', checked: showParkingSpots, onToggle: () => setShowParkingSpots(v => !v), modes: ['default', 'navigation'] },
    { group: 'Explore', icon: '•', label: 'Places', detail: 'Include nearby services', checked: showVenues, onToggle: () => setShowVenues(v => !v), modes: ['default'] },
    { group: 'Explore', icon: '⬢', label: 'Tap Zones', detail: `${partnerVenueCount} Patch-ready nearby`, checked: showTapZones, onToggle: () => setShowTapZones(v => !v), modes: ['default'] },
    { group: 'Explore', icon: '✓', label: 'Verified partners only', detail: 'Prioritize partnered Bytspots', checked: showVerifiedOnly, onToggle: () => setShowVerifiedOnly(v => !v), modes: ['default'] },
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
    { group: 'Live info', icon: '⚡', label: 'Traffic', detail: 'Street movement conditions', checked: trafficPanelActive, onToggle: toggleTrafficIntel, modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '🔌', label: 'EV charging', detail: 'Chargers available', checked: filters.evChargingOnly, onToggle: () => setFilters(current => ({ ...current, evChargingOnly: !current.evChargingOnly })), modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '☂️', label: 'Covered', detail: 'Indoor or protected', checked: filters.coveredOnly, onToggle: () => setFilters(current => ({ ...current, coveredOnly: !current.coveredOnly })), modes: ['default', 'navigation'] },
    { group: 'Parking options', icon: '★', label: 'Premium', detail: 'Higher-security spots', checked: filters.showPremiumOnly, onToggle: () => setFilters(current => ({ ...current, showPremiumOnly: !current.showPremiumOnly })), modes: ['default', 'navigation'] },
  ].filter(item => item.modes.includes(mapMode));
  const layerControlGroups = ['Explore', 'Entry', 'Category', 'Vibe', 'Live info', 'Parking options']
    .map(group => ({ group, items: visibleLayerControls.filter(item => item.group === group) }))
    .filter(group => group.items.length > 0);

  useEffect(() => {
    if (!showLayerMenu) return;
    if (!layerControlGroups.some(({ group }) => group === openLayerGroup)) {
      setOpenLayerGroup(layerControlGroups[0]?.group ?? 'Explore');
    }
  }, [layerControlGroups, openLayerGroup, showLayerMenu]);

  const handleShowPartneredProviders = useCallback(() => {
    void impactLight();
    setShowLayerMenu(false);
    setShowTrafficIntel(false);
    setDroppedRequestPin(null);
    setShowTapZones(true);
    setShowVerifiedOnly(true);
    setNearbySheetDismissed(false);
    setPeekVenue(null);
    setBottomSheetExpanded(true);
    toast.success('Partnered providers', {
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

        {/* Clean canvas: only base tiles and the optional route line render inside the map. */}

      </MapContainer>

      <MapSearchBar
        isVisible={showSearchBar}
        isFocusedMapMode={isFocusedMapMode}
        value={mapQuery}
        onChange={(nextQuery) => {
          setMapQuery(nextQuery);
          if (nextQuery.trim()) {
            setNearbySheetDismissed(false);
            setBottomSheetExpanded(true);
          }
        }}
        onSubmit={(submittedQuery) => {
          setMapQuery(submittedQuery);
          setRouteDestination(submittedQuery);
          setNearbySheetDismissed(false);
          setBottomSheetExpanded(true);
          toast.success('Spatial search', { description: `Scanning for ${submittedQuery}` });
        }}
        transition={springConfig}
      />

      <MapActionStack
        mapMode={mapMode}
        hideRightActionStack={hideRightActionStack}
        showLayerButton={showLayerButton}
        showLayerMenu={showLayerMenu}
        showFullRightActionStack={showFullRightActionStack}
        showTrafficIntel={showTrafficIntel}
        showVerifiedOnly={showVerifiedOnly}
        onToggleLayers={(event) => {
          event.currentTarget.blur();
          triggerLightHaptic();
          setShowLayerMenu(prev => {
            const next = !prev;
            if (next) setOpenLayerGroup(layerControlGroups[0]?.group ?? 'Explore');
            return next;
          });
        }}
        onRecenter={() => { triggerLightHaptic(); setShouldRecenter(true); }}
        onZoomIn={() => { triggerLightHaptic(); setZoomDirection(1); }}
        onZoomOut={() => { triggerLightHaptic(); setZoomDirection(-1); }}
        onToggleTraffic={(event) => { event.currentTarget.blur(); triggerLightHaptic(); toggleTrafficIntel(); }}
        onShowPartneredProviders={(event) => { event.currentTarget.blur(); handleShowPartneredProviders(); }}
        transition={springConfig}
      />

      <MapLayersMenu
        isOpen={showLayerMenu}
        showLayerButton={showLayerButton}
        mapMode={mapMode}
        groups={layerControlGroups}
        openGroup={openLayerGroup}
        onOpenGroup={setOpenLayerGroup}
        onClose={() => setShowLayerMenu(false)}
        transition={springConfig}
      />

      {/* Route FAB — appears only after a destination context exists */}
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
              className="w-14 h-14 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl"
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
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/35 bg-black/15">
              <QrCode className="w-5 h-5 text-white" strokeWidth={2.6} />
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
          fallbackTier={qrScannerTier}
          fallbackTagUseMode={qrScannerTagUseMode}
          fallbackTagIntent={qrScannerTagIntent}
          fallbackReferralCode={qrScannerReferralCode}
          fallbackGroupSize={qrScannerGroupSize}
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
        isExpanded={mapMode === 'traffic'}
        onToggle={toggleTrafficIntel}
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

      <SpatialBottomSheetFrame
        isVisible={shouldShowSpatialSheet}
        isExpanded={bottomSheetExpanded}
        isVerified={peekVenueIsVerified}
        peekY={SPATIAL_SHEET_PEEK_Y}
        snapOffset={SPATIAL_SHEET_SNAP_OFFSET}
        snapVelocity={SPATIAL_SHEET_SNAP_VELOCITY}
        onExpandedChange={setBottomSheetExpanded}
      >
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

                    {peekVenueIsVerified && (
                      <div className="rounded-2xl border border-cyan-300/45 bg-[#06242B] p-3">
                        {hasPlatinumMembership ? (
                          <>
                            <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-100" style={{ fontWeight: 950 }}>PLATINUM · ACTIVE</p>
                            <p className="mt-1 text-[13px] text-white" style={{ fontWeight: 900 }}>10% off your tab</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[13px] text-white" style={{ fontWeight: 900 }}>Unlock perks at this Verified venue</p>
                            <button type="button" onClick={() => setShowPlatinumTeaser(true)} className="mt-2 rounded-xl bg-white px-3 py-2 text-[12px] text-black" style={{ fontWeight: 900 }} aria-label="Unlock Bytspot Platinum perks for this venue">Unlock perks</button>
                          </>
                        )}
                      </div>
                    )}

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
                          <span className="rounded-full bg-[#ff2f86] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-black" style={{ fontWeight: 950 }}>LIVE</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {liveHotspotVenues.map(venue => (
                            <button key={`trend-row-${venue.id ?? venue.name}`} onClick={() => focusVenue(venue)} className="min-w-[178px] rounded-2xl border border-orange-200/55 bg-[#050505] p-3 text-left">
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
                                {result.isTrending && <span className="rounded-full bg-[#ff2f86] px-2 py-0.5 text-[10px] text-black" style={{ fontWeight: 950 }}>LIVE</span>}
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
      </SpatialBottomSheetFrame>

      {/* Platinum membership teaser. */}
      <AnimatePresence>
        {showPlatinumTeaser && (
          <motion.div
            key="platinum-teaser"
            className="absolute inset-0 z-[1003]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="Unlock Bytspot Platinum"
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => !platinumCheckoutPending && setShowPlatinumTeaser(false)}
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
                      <p className="text-[11px] text-cyan-200 tracking-[0.1em]" style={{ fontWeight: 800 }}>BYTSPOT PLATINUM</p>
                      <h3 className="text-[19px] text-white leading-tight" style={{ fontWeight: 800 }}>Unlock Verified perks</h3>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => setShowPlatinumTeaser(false)}
                    disabled={platinumCheckoutPending}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/8 border border-white/15 disabled:opacity-50"
                    whileTap={{ scale: 0.9 }}
                  >
                    <X className="w-4 h-4 text-white" />
                  </motion.button>
                </div>
                <p className="text-[13px] text-white leading-snug mb-4" style={{ fontWeight: 600 }}>
                  Platinum adds elevated access and participation at Bytspot Verified venues.
                </p>
                <ul className="space-y-2 mb-5">
                  {[
                    { icon: '💸', label: '10% off your tab at every Verified venue' },
                    { icon: '🚪', label: 'Skip-the-line at participating partners' },
                    { icon: '🎟️', label: 'Platinum Tap / Scan access' },
                  ].map((perk) => (
                    <li key={perk.label} className="flex items-center gap-2.5 px-3 py-2 rounded-[12px] bg-white/5 border border-white/10">
                      <span className="text-[18px]">{perk.icon}</span>
                      <span className="text-[13px] text-white/90" style={{ fontWeight: 600 }}>{perk.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mb-4 rounded-[14px] border border-white/35 bg-[#080A10] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-white">
                    <span style={{ fontWeight: 800 }}>Platinum membership</span>
                    <span className="text-white" style={{ fontWeight: 900 }}>{formatPlatinumCents(platinumBaseCents)} / month</span>
                  </div>
                </div>
                <motion.button
                  onClick={handleUpgradeToPlatinum}
                  disabled={platinumCheckoutPending}
                  className="w-full py-3.5 rounded-[16px] border border-white/25 shadow-2xl text-white text-[15px] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))', fontWeight: 800 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {platinumCheckoutPending ? 'Opening checkout…' : `Upgrade to Platinum · ${formatPlatinumCents(platinumBaseCents)} / month`}
                </motion.button>
                <p className="text-[10.5px] text-white/45 text-center mt-2.5" style={{ fontWeight: 500 }}>
                  Cancel anytime · Powered by Stripe
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
