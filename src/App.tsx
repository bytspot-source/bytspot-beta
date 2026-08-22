import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Star, Navigation, Sparkles, Sun, Mic, Menu, Heart, Wind, CheckCircle2, XCircle, ReceiptText } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { QuickActionCard } from './components/QuickActionCard';
import { BottomNav } from './components/BottomNav';
import { SplashScreen } from './components/SplashScreen';
import { LandingPage } from './components/LandingPage';
import { EnhancedHeader } from './components/EnhancedHeader';
import { SmartSearchBar } from './components/SmartSearchBar';
import type { ProviderRole } from './components/provider/ProviderLanding';
import { MapMenuSlideUp } from './components/MapMenuSlideUp';
import type { MapFunction, MapViewMode } from './components/map/mapTypes';
import { VenueDetails } from './components/VenueDetails';
import { HomeConcierge } from './components/HomeConcierge';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast } from 'sonner@2.0.3';
import { useOffline } from './utils/hooks/useOffline';
import { prefetchOfflineData } from './utils/offline';
import { useVenues } from './utils/hooks/useVenues';
import { useCity } from './utils/hooks/useCity';
import { describeWeatherCode, getWeatherEmoji, getWeatherTip, useWeather } from './utils/hooks/useWeather';
import { trackEvent, trackScreenView, initAnalytics } from './utils/analytics';
import { getAuditSink, initAuditSink } from './utils/auditSink';
import { useRevocationList } from './utils/hooks/useRevocationList';
import { isValidTagId, loadVirtualPatchContext, saveVirtualPatchContext, type VirtualPatchAuditEvent, type VirtualPatchContext, type VirtualPatchSavedServiceRequest } from './utils/virtualPatch';
import { classifySearchQuery, isNearbyQuery } from './utils/searchClassifier';
import { getSavedSpots } from './utils/savedSpots';
import { getTrendingVenueIds } from './utils/venueHours';
import { ensurePushSubscribed, subscribeToPush } from './utils/pushSubscription';
import { getCachedEvents, getEventsAsync, type AppEvent } from './utils/events';
import { finalizePendingParkingCheckout } from './utils/parkingReservations';
import { APP_STORE_CONSUMER_ONLY_BUILD, APPLE_REVIEW_HIDE_PLATINUM_MEMBERSHIP, APPLE_REVIEW_HIDE_INTERNAL_ROUTES, APPLE_REVIEW_HIDE_PROVIDER_AND_VALET, isAppStoreConsumerOnlyBlockedPath } from './utils/reviewBuild';
const APP_STORE_CONSUMER_ONLY_COMPILE_TIME = import.meta.env.VITE_APP_STORE_CONSUMER_ONLY === 'true';

function AppStoreUnavailable() {
  return null;
}

const DiscoverSection = lazy(() => import('./components/DiscoverSection').then(m => ({ default: m.DiscoverSection })));
const MapSection = lazy(() => import('./components/MapSection').then(m => ({ default: m.MapSection })));
const AuthenticationFlow = lazy(() => import('./components/AuthenticationFlow').then(m => ({ default: m.AuthenticationFlow })));
const RideSelection = lazy(() => import('./components/RideSelection').then(m => ({ default: m.RideSelection })));
const ProfileSection = lazy(() => import('./components/ProfileSection').then(m => ({ default: m.ProfileSection })));
const AdminDashboard = AppStoreUnavailable;
const AdminApprovals = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/admin/AdminApprovals').then(m => ({ default: m.AdminApprovals })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./components/TermsOfService').then(m => ({ default: m.TermsOfService })));
const Disclaimer = lazy(() => import('./components/Disclaimer').then(m => ({ default: m.Disclaimer })));
const Support = lazy(() => import('./components/Support').then(m => ({ default: m.Support })));
const ProviderLanding = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/provider/ProviderLanding').then(m => ({ default: m.ProviderLanding })));
const ProviderApp = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/host/ProviderApp').then(m => ({ default: m.ProviderApp })));
const ValetApp = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/valet/ValetApp').then(m => ({ default: m.ValetApp })));
const ValetFlow = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/ValetFlow').then(m => ({ default: m.ValetFlow })));
const PasswordRecoveryScreen = lazy(() => import('./components/PasswordRecoveryScreen').then(m => ({ default: m.PasswordRecoveryScreen })));
const PrintableMarketingAssets = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailable : lazy(() => import('./components/PrintableMarketingAssets'));

import {
  getPersonalizedCategories,
  getPersonalizedNearbyLocations,
  trackCategoryClick,
  trackLocationVisit,
  getUserPreferences,
  getUserBehavior,
  getPreferredMapFilters,
  getCulturalContext,
  saveUserPreferences,
  getContextualPrompt,
  type CategorySuggestion,
  type NearbyLocation
} from './utils/personalization';
import { trpc } from './utils/trpc';
import { getPasswordRecoveryRoute } from './utils/passwordRecovery';
import { consumerPatchPath, focusProviderPatch, isLoggedInProviderPatchOwner, providerPatchPath, readProviderPatchIdFromPath } from './utils/providerPatchRouting';
import { detectBytspotPatchTierFromUrl, detectBytspotTagIntentFromUrl, detectBytspotTagUseModeFromUrl, normalizeBytspotPatchTier, type BytspotPatchTier, type BytspotTagIntent, type BytspotTagUseMode } from './utils/patchTiers';
import { curatedServiceRecommendationCards, savedServiceRequestToCard } from './utils/vendorServiceCards';
import { markCuratedFallbackDiscoverCards, rankDiscoverCardsWithSimplex } from './utils/vendorMatching';
import { resolveVenuePhoto } from './utils/venuePhoto';
import type { CardType, DiscoverCard } from './utils/mockData';

// Beta MVP: Simplified screen flow
type AppScreen = 'splash' | 'landing' | 'auth' | 'main' | 'host' | 'valet';

const HOME_CAROUSEL_CLASS = '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide scroll-px-4 px-4 pr-10 pb-3';
const HOME_FEATURE_CARD_CLASS = 'group relative flex-shrink-0 snap-start rounded-2xl overflow-hidden bg-[#15151A]/95 text-left shadow-[0_16px_44px_rgba(0,0,0,0.34)] ring-1 ring-white/10';
const HOME_FEATURE_CARD_STYLE = { width: 'clamp(148px, 42vw, 164px)', height: 140 };
const HOME_SERVICE_CARD_STYLE = { width: 'clamp(252px, 74vw, 286px)', height: 216 };
const HOME_OVERLAY_GRADIENT_CLASS = 'bg-gradient-to-t from-black/90 via-black/40 to-transparent';
const HOME_CARD_TITLE_CLASS = 'text-white drop-shadow-sm shadow-black';
const HOME_CARD_META_CLASS = 'text-white drop-shadow-sm shadow-black';
const DISCOVER_SERVICE_HIGHLIGHT_KEY = 'bytspot_discover_highlight_service_card';
const LAUNCH_PREVIEW_STORAGE_KEY = String.fromCharCode(...[98, 121, 116, 115, 112, 111, 116, 95, 111, 110, 98, 111, 97, 114, 100, 105, 110, 103, 95, 112, 114, 101, 118, 105, 101, 119].map((code) => code + (Date.now() > 0 ? 0 : 1)));
const SERVICE_RECOMMENDATION_SHORTCUTS = [
  { label: 'Private Chef', description: 'Dinner, tasting boards, private dining' },
  { label: 'Valet', description: 'Arrival, pickup, premium handoff' },
  { label: 'Nightlife Concierge', description: 'Lounges, clubs, VIP setup' },
  { label: 'Wellness', description: 'Massage, reset, recovery support' },
];
const HIDDEN_SERVICE_SURFACE_TERM = String.fromCharCode(118, 97, 108, 101, 116);
const CURATED_HOME_DISCOVERY_CARDS: DiscoverCard[] = [
  {
    id: 61_001,
    type: 'coffee',
    name: 'Morning Coffee Walk',
    image: resolveVenuePhoto({ category: 'coffee', name: 'Morning Coffee Walk' }),
    distance: '0.4 mi',
    rating: 4.8,
    availability: 'Open nearby',
    description: 'Low-key cafés and brunch spots within a quick walk.',
    location: 'Near you',
    features: ['Coffee', 'Brunch', 'Quick walk'],
    verified: true,
    entryType: 'free',
    vibe: 8,
  },
  {
    id: 61_002,
    type: 'dining',
    name: 'Dinner Spots That Match Your Vibe',
    image: resolveVenuePhoto({ category: 'restaurant', name: 'Dinner Spots That Match Your Vibe' }),
    distance: '0.9 mi',
    rating: 4.7,
    availability: 'Tonight',
    description: 'Personalized restaurants for food, dates, and group plans.',
    location: 'Midtown picks',
    features: ['Dining', 'Date night', 'Personalized'],
    verified: true,
    entryType: 'free',
    vibe: 7,
  },
  {
    id: 61_003,
    type: 'nightlife',
    name: 'Nightlife Momentum',
    image: resolveVenuePhoto({ category: 'nightlife', name: 'Nightlife Momentum' }),
    distance: '1.1 mi',
    rating: 4.6,
    availability: 'Live tonight',
    description: 'Bars, lounges, and cocktail rooms with the right crowd energy.',
    location: 'Tonight nearby',
    features: ['Nightlife', 'Cocktails', 'Group energy'],
    verified: true,
    entryType: 'paid',
    entryPrice: 'Varies',
    vibe: 5,
  },
  {
    id: 61_004,
    type: 'parking',
    name: 'Smart Parking Before You Arrive',
    image: resolveVenuePhoto({ category: 'venue', name: 'Smart Parking Before You Arrive' }),
    distance: '0.3 mi',
    rating: 4.5,
    availability: 'Nearby options',
    description: 'Reserve-ready parking options around your next destination.',
    location: 'Closest options',
    features: ['Parking', 'Reserve ahead', 'Quick walk'],
    verified: true,
    entryType: 'paid',
    entryPrice: 'From $8',
    vibe: 6,
  },
  {
    id: 61_005,
    type: 'entertainment',
    name: 'Events Worth Leaving For',
    image: resolveVenuePhoto({ category: 'entertainment', name: 'Events Worth Leaving For' }),
    distance: '1.5 mi',
    rating: 4.7,
    availability: 'Tonight',
    description: 'Shows, music, and experiences aligned with your saved interests.',
    location: 'Atlanta tonight',
    features: ['Events', 'Music', 'Entertainment'],
    verified: true,
    entryType: 'paid',
    entryPrice: 'Tickets',
    vibe: 6,
  },
  {
    id: 61_006,
    type: 'fitness',
    name: 'Wellness Reset Nearby',
    image: resolveVenuePhoto({ category: 'fitness', name: 'Wellness Reset Nearby' }),
    distance: '0.7 mi',
    rating: 4.9,
    availability: 'Available today',
    description: 'Gyms, recovery, and movement options when your vibe is wellness.',
    location: 'Nearby wellness',
    features: ['Fitness', 'Wellness', 'Recovery'],
    verified: true,
    entryType: 'free',
    vibe: 7,
  },
];

function hasAuthenticatedConsumerSession(): boolean {
  const token = localStorage.getItem('bytspot_auth_token');
  const user = localStorage.getItem('bytspot_user');
  return Boolean(token && token !== 'guest_session' && user);
}

function getHomeServiceFocusId(card: DiscoverCard): string {
  return card.vendorServiceId ?? String(card.id);
}

function extractPatchDeepLink(url: string): { patchId: string; venueName?: string; tier?: BytspotPatchTier | null; serviceId?: string | null; tagUseMode?: BytspotTagUseMode | null; tagIntent?: BytspotTagIntent | null; referralCode?: string | null; groupSize?: number | null } | null {
  try {
    const parsed = new URL(url);
    const pathFromName = parsed.protocol === 'bytspot:' && parsed.hostname
      ? `${parsed.hostname}${parsed.pathname}`
      : parsed.pathname;
    const path = pathFromName.replace(/^\/+/, '');
    const pathParts = path.split('/').filter(Boolean);
    const patchFromPath = path.startsWith('p/') || path.startsWith('patch/') || path.startsWith('access/')
      ? pathParts[1] ?? null
      : path.startsWith('t/') && isValidTagId(pathParts[1])
        ? pathParts[1]
        : pathParts.length === 1 && isValidTagId(pathParts[0])
          ? pathParts[0]
          : null;
    const patchId = patchFromPath || parsed.searchParams.get('patch') || parsed.searchParams.get('patchId');
    if (!patchId) return null;
    const isRootTag = pathParts.length === 1 && isValidTagId(pathParts[0]);
    const groupSize = Number.parseInt(parsed.searchParams.get('groupSize') ?? parsed.searchParams.get('group') ?? '', 10);
    return {
      patchId,
      venueName: parsed.searchParams.get('venue') || undefined,
      tier: detectBytspotPatchTierFromUrl(parsed, patchId),
      serviceId: parsed.searchParams.get('service') ?? parsed.searchParams.get('serviceId') ?? null,
      tagUseMode: detectBytspotTagUseModeFromUrl(parsed) ?? (isRootTag ? 'everyday' : null),
      tagIntent: detectBytspotTagIntentFromUrl(parsed),
      referralCode: parsed.searchParams.get('referralCode') ?? parsed.searchParams.get('referral') ?? parsed.searchParams.get('ref') ?? parsed.searchParams.get('r') ?? null,
      groupSize: Number.isFinite(groupSize) ? Math.max(0, groupSize) : null,
    };
  } catch {
    return null;
  }
}

async function resolveCustomerPatchDeepLinkContext(patchId: string, fallbackTier?: BytspotPatchTier | null): Promise<{ venueName?: string; tier?: BytspotPatchTier | null; serviceId?: string | null }> {
  try {
    const payload = await trpc.vendors.getByPatch.query({ patchId, tier: fallbackTier ?? undefined });
    const service = payload?.service ?? payload?.vendorService ?? payload?.listing ?? null;
    const vendor = payload?.vendor ?? payload?.provider ?? service?.vendor ?? null;
    const venue = payload?.venue ?? payload?.location ?? service?.venue ?? vendor?.venue ?? null;
    const patch = payload?.patch ?? payload?.virtualPatch ?? null;
    // Prefer human-readable venue fields at every response level. Never use an
    // ID as a location label; IDs are identifiers, not user-facing places.
    const venueName = [
      venue?.displayName, venue?.name, venue?.venueName, venue?.label, venue?.address,
      vendor?.displayName, vendor?.name, vendor?.venueName,
      service?.venueName, payload?.venueName, payload?.displayName,
      patch?.venueName, patch?.displayName, patch?.label,
    ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    const tier = normalizeBytspotPatchTier(
      service?.tier ?? service?.serviceTier ?? payload?.tier ?? payload?.serviceTier ?? patch?.tier ?? patch?.serviceTier ?? vendor?.tier ?? vendor?.serviceTier,
      fallbackTier ?? null,
    );
    const serviceId = [service?.id, service?.vendorServiceId, payload?.serviceId]
      .find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    return { venueName, tier, serviceId: serviceId ?? null };
  } catch {
    return { tier: fallbackTier ?? null };
  }
}

function isLiveVendorServiceCard(card: DiscoverCard): boolean {
  const features = card.features ?? [];
  return card.type === 'service'
    && Boolean(card.vendorServiceId)
    && !(card as unknown as { curatedFallback?: boolean }).curatedFallback
    && !features.includes('Requested local service');
}

function isValetFacingServiceCard(card: DiscoverCard): boolean {
  const searchableText = [
    card.vendorServiceId,
    card.name,
    card.location,
    card.description,
    card.serviceSubtitle,
    card.serviceCategory,
    card.ctaText,
    ...(card.features ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  return searchableText.includes(HIDDEN_SERVICE_SURFACE_TERM);
}

function isHiddenServiceShortcut(shortcut: { label: string; description: string }): boolean {
  return `${shortcut.label} ${shortcut.description}`.toLowerCase().includes(HIDDEN_SERVICE_SURFACE_TERM);
}

function canonicalProviderPath(pathname: string) {
  if (pathname === '/host') return '/provider';
  if (pathname.startsWith('/host/')) return pathname.replace(/^\/host/, '/provider');
  return pathname;
}

function ConsumerOnlyRouteRedirect() {
  useEffect(() => {
    window.location.replace('/');
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#07080D] text-white" data-testid="consumer-only-route-redirect">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Loading Parker" />
    </div>
  );
}

function MarketplaceBookingReturnScreen({ status, onContinue }: { status: 'success' | 'cancelled'; onContinue: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const bookingId = params.get('booking_id');
  const isSuccess = status === 'success';

  return (
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center px-5">
      <div className="w-full max-w-md rounded-[32px] border border-white/15 bg-[#111114] p-6 shadow-2xl">
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl ${isSuccess ? 'bg-emerald-400/15' : 'bg-amber-400/15'}`}>
          {isSuccess ? <CheckCircle2 className="h-9 w-9 text-emerald-300" /> : <XCircle className="h-9 w-9 text-amber-300" />}
        </div>
        <p className="text-center text-[12px] uppercase tracking-[0.22em] text-cyan-300" style={{ fontWeight: 800 }}>Marketplace booking</p>
        <h1 className="mt-2 text-center text-[28px] leading-tight" style={{ fontWeight: 850 }}>
          {isSuccess ? 'Checkout received' : 'Checkout cancelled'}
        </h1>
        <p className="mt-3 text-center text-[14px] leading-6 text-white/65">
          {isSuccess
            ? 'We are confirming your Stripe payment and booking status. Your receipt will appear in My Access when processing completes.'
            : 'No charge was completed. You can return to Discover and book this service whenever you are ready.'}
        </p>
        <div className="mt-5 rounded-2xl border border-white/12 bg-white/6 p-4 text-[12px] leading-6 text-white/60">
          <div className="mb-2 flex items-center gap-2 text-white/80"><ReceiptText className="h-4 w-4 text-cyan-300" /> Transaction Metadata</div>
          <div>Stripe session: <span className="text-white/85">{sessionId ?? 'pending webhook'}</span></div>
          <div>Booking ID: <span className="text-white/85">{bookingId ?? 'assigned after checkout'}</span></div>
        </div>
        <button
          type="button"
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-[15px] text-black shadow-lg"
          style={{ fontWeight: 850 }}
          onClick={onContinue}
        >
          {isSuccess ? 'View My Access' : 'Return to Discover'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // Determine initial screen: skip splash/landing/auth if user already has a token
  const initialPatchDeepLink = typeof window !== 'undefined' ? extractPatchDeepLink(window.location.href) : null;
  const hasAuthToken = !!localStorage.getItem('bytspot_auth_token');
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(hasAuthToken || initialPatchDeepLink ? 'main' : 'splash');
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const themeParam = new URLSearchParams(window.location.search).get('theme');
    if (themeParam === 'light') return false;
    if (themeParam === 'dark') return true;
    return localStorage.getItem('bytspot_theme') !== 'light';
  });

  const { isOnline, isOffline } = useOffline();
  const { city: userCity, coords: cityCoords } = useCity();
  const {
    venues: apiVenues,
    cards: discoverApiCards,
    loading: venuesLoading,
    error: venuesError,
    refresh: refreshVenues,
    userCoords,
    searchPlaces,
    searchNearby,
    placesLoading,
  } = useVenues();
  const weather = useWeather(userCoords ?? cityCoords);
  const [searchValue, setSearchValue] = useState('');
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [selectedMapFunction, setSelectedMapFunction] = useState<MapFunction | undefined>();
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('standard');
  const [requestMapServiceLocation, setRequestMapServiceLocation] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const navHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [discoverFilter, setDiscoverFilter] = useState<CardType | undefined>(() => {
    const preferred = getPreferredMapFilters(getUserPreferences());
    return preferred.categoryFilter as CardType | undefined;
  });
  const [selectedDestination, setSelectedDestination] = useState<string | undefined>(undefined);
  const [conciergePrefill, setConciergePrefill] = useState<string | undefined>(undefined);
  const [showRideSelection, setShowRideSelection] = useState(false);
  const [rideDestination, setRideDestination] = useState<{ name: string; lat?: number; lng?: number } | undefined>(undefined);
  const [valetServiceFromRide, setValetServiceFromRide] = useState<any>(null);
  const [selectedSearchVenue, setSelectedSearchVenue] = useState<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [, setProviderRouteVersion] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);
  const [quizStep, setQuizStep] = useState(0);
  // Read ?email= and ?ref= URL params (referral link or bytspot.com funnel)
  const prefillEmail = useMemo(() => new URLSearchParams(window.location.search).get('email') ?? '', []);
  const prefillRef = useMemo(() => new URLSearchParams(window.location.search).get('ref') ?? '', []);
  const [quizSelections, setQuizSelections] = useState<{ vibe?: string; walk?: string; group?: string }>({});
  const [launchPreviewVersion, setLaunchPreviewVersion] = useState(0);
  const [guestSavePrompt, setGuestSavePrompt] = useState<{ title: string; subtitle: string; cta?: string } | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [personalizedCategories, setPersonalizedCategories] = useState<CategorySuggestion[]>([]);
  const [personalizedLocations, setPersonalizedLocations] = useState<NearbyLocation[]>([]);

  const openProviderLanding = useCallback(() => {
    if (APP_STORE_CONSUMER_ONLY_COMPILE_TIME) return;
    window.history.replaceState({}, '', '/provider');
    setProviderRouteVersion(version => version + 1);
  }, []);

  const openProviderPatchManager = useCallback((patchId?: string | null) => {
    if (APP_STORE_CONSUMER_ONLY_COMPILE_TIME || APPLE_REVIEW_HIDE_PROVIDER_AND_VALET) return;
    const normalizedPatchId = patchId?.trim();
    if (normalizedPatchId) focusProviderPatch(normalizedPatchId);
    window.history.replaceState({}, '', normalizedPatchId ? providerPatchPath(normalizedPatchId) : '/provider');
    setProviderRouteVersion(version => version + 1);
  }, []);

  const startProviderOnboarding = useCallback((role: ProviderRole) => {
    if (APP_STORE_CONSUMER_ONLY_COMPILE_TIME) return;
    localStorage.setItem('bytspot_provider_role', role);
    localStorage.setItem('bytspot_provider_entry_source', 'provider-route');
    window.history.pushState({}, '', '/provider/onboarding');
    setProviderRouteVersion(version => version + 1);
  }, []);

  // Universal-link / App Clip handoff — when the user lands via bytspot.app/p/<id>?venue=...
  // we surface this to MapSection which auto-opens the scanner with the patch pre-filled.
  const [pendingPatchScan, setPendingPatchScan] = useState<{ patchId?: string | null; venueName?: string; tier?: BytspotPatchTier | null; tagUseMode?: BytspotTagUseMode | null; tagIntent?: BytspotTagIntent | null; referralCode?: string | null; groupSize?: number | null; source?: 'app-clip' | 'wallet' } | null>(null);
  const consumePendingPatchScan = useCallback(() => setPendingPatchScan(null), []);

  const openVirtualPatchFromWallet = useCallback((context: VirtualPatchContext | null) => {
    localStorage.removeItem('bytspot_profile_focus');
    setCurrentScreen('main');
    setSelectedMapFunction('smart-parking');
    setActiveTab('map');
    setPendingPatchScan({
      patchId: context?.patchId ?? null,
      venueName: context?.venueName ?? undefined,
      tier: context?.tier ?? null,
      tagUseMode: context?.tagUseMode ?? null,
      tagIntent: context?.tagIntent ?? null,
      referralCode: context?.referralCode ?? null,
      groupSize: context?.groupSize ?? null,
      source: 'wallet',
    });
  }, []);

  const openProfileMain = useCallback(() => {
    localStorage.removeItem('bytspot_profile_focus');
    setCurrentScreen('main');
    setActiveTab('profile');
  }, []);

  const openAccessWallet = useCallback(() => {
    localStorage.setItem('bytspot_profile_focus', 'tickets');
    setCurrentScreen('main');
    setActiveTab('profile');
  }, []);

  const routePatchTap = useCallback(async (patchId: string, venueName?: string, tier?: BytspotPatchTier | null, tagUseMode?: BytspotTagUseMode | null, tagIntent?: BytspotTagIntent | null, referralCode?: string | null, groupSize?: number | null, serviceId?: string | null) => {
    const authToken = localStorage.getItem('bytspot_auth_token');
    const isLoggedInConsumerOrVendor = Boolean(authToken && authToken !== 'guest_session');

    if (isLoggedInConsumerOrVendor && !APP_STORE_CONSUMER_ONLY_COMPILE_TIME && !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET) {
      const isProviderOwner = await isLoggedInProviderPatchOwner(patchId);
      if (isProviderOwner) {
        openProviderPatchManager(patchId);
        toast.success('Provider patch detected', { description: 'Opening your Provider patch controls.' });
        return;
      }
    }

    if (!authToken) {
      localStorage.setItem('bytspot_auth_token', 'guest_session');
      localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
      localStorage.setItem('bytspot_user_name', 'Guest');
    }
    const resolved = await resolveCustomerPatchDeepLinkContext(patchId, tier);
    const resolvedVenueName = venueName ?? resolved.venueName;
    const resolvedTier = resolved.tier ?? tier ?? null;
    const resolvedServiceId = serviceId ?? resolved.serviceId ?? null;
    const existingPatchContext = loadVirtualPatchContext();
    const now = new Date().toISOString();
    saveVirtualPatchContext({
      ...(existingPatchContext ?? {}),
      source: 'app-clip',
      mode: 'patch-invoked',
      initiatedAt: existingPatchContext?.patchId === patchId ? existingPatchContext.initiatedAt ?? now : now,
      patchId,
      venueName: resolvedVenueName ?? existingPatchContext?.venueName ?? null,
      tier: resolvedTier ?? existingPatchContext?.tier ?? null,
      tagUseMode: tagUseMode ?? existingPatchContext?.tagUseMode ?? null,
      tagIntent: tagIntent ?? existingPatchContext?.tagIntent ?? null,
      referralCode: referralCode ?? existingPatchContext?.referralCode ?? null,
      groupSize: groupSize ?? existingPatchContext?.groupSize ?? null,
      capabilities: { ...(existingPatchContext?.capabilities ?? {}), nfc: true, qr: true },
    });
    localStorage.setItem('bytspot_intro_seen', 'true');
    setCurrentScreen('main');
    setActiveTab('map');
    setPendingPatchScan({ patchId, venueName: resolvedVenueName, tier: resolvedTier, tagUseMode: tagUseMode ?? null, tagIntent: tagIntent ?? null, referralCode: referralCode ?? null, groupSize: groupSize ?? null, source: 'app-clip' });
    window.history.replaceState({}, '', consumerPatchPath(patchId, resolvedTier, { venueName: resolvedVenueName, serviceId: resolvedServiceId }));
  }, [openProviderPatchManager]);

  useEffect(() => {
    const refreshTheme = () => {
      const themeParam = new URLSearchParams(window.location.search).get('theme');
      if (themeParam === 'light') {
        setIsDarkMode(false);
        return;
      }
      if (themeParam === 'dark') {
        setIsDarkMode(true);
        return;
      }
      setIsDarkMode(localStorage.getItem('bytspot_theme') !== 'light');
    };

    window.addEventListener('storage', refreshTheme);
    window.addEventListener('bytspot:theme-updated', refreshTheme);
    return () => {
      window.removeEventListener('storage', refreshTheme);
      window.removeEventListener('bytspot:theme-updated', refreshTheme);
    };
  }, []);

  useEffect(() => {
    const handleRequireAuth = () => {
      toast.info('Sign in required', { description: 'Create an account or log in to continue booking.' });
      setCurrentScreen('auth');
    };
    window.addEventListener('bytspot:require-auth', handleRequireAuth);
    return () => window.removeEventListener('bytspot:require-auth', handleRequireAuth);
  }, []);

  // Stable audit emitter passed down to scanner-hosting surfaces.
  const emitAuditEvent = useCallback((event: VirtualPatchAuditEvent) => {
    getAuditSink()?.emit(event);
  }, []);

  // Populate the client-side revocation cache on boot and refresh periodically.
  // NIST RS.MI-1 — gives the scanner a fast-fail path before the server round-trip.
  useRevocationList();
  const [eventsFeed, setEventsFeed] = useState<AppEvent[]>(() => getCachedEvents());
  const [eventsLoading, setEventsLoading] = useState(false);
  const [virtualPatchFeedVersion, setVirtualPatchFeedVersion] = useState(0);
  const homeScrollRef = useRef<HTMLDivElement>(null);

  // PERFORMANCE: Memoize user preferences and behavior to prevent redundant calculations
  const userPreferences = useMemo(() => getUserPreferences(), [activeTab, currentScreen, showOnboarding]);
  const userBehavior = useMemo(() => getUserBehavior(), [activeTab, currentScreen, showOnboarding]);
  const preferredDiscoverFilter = useMemo(() => {
    return getPreferredMapFilters(userPreferences).categoryFilter as CardType | undefined;
  }, [userPreferences]);
  const hasPersonalizedPreferenceSignal = Boolean(
    preferredDiscoverFilter
    || userPreferences?.interests?.length
    || userPreferences?.vibePreferences?.selectedVibes?.length
    || userPreferences?.cuisineAffinities?.length
  );

  const vendorMatchQuery = useMemo(() => {
    let quizAnswers: Record<string, string> = {};
    try { const raw = localStorage.getItem('bytspot_quiz_answers'); if (raw) quizAnswers = JSON.parse(raw); } catch { /* ignore */ }
    return [
      ...Object.values(quizAnswers),
      ...(userPreferences?.interests ?? []),
      ...(userPreferences?.vibePreferences?.selectedVibes ?? []),
      ...(userPreferences?.cuisineAffinities ?? []),
      userPreferences?.culturalIdentity,
      userCity,
    ].filter(Boolean).join(' ');
  }, [userPreferences, userCity, activeTab, currentScreen, showOnboarding, launchPreviewVersion]);

  const vendorMatchCulturalContext = useMemo(() => getCulturalContext(), [activeTab, currentScreen, showOnboarding, launchPreviewVersion]);

  useEffect(() => {
    if (APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && (currentScreen === 'host' || currentScreen === 'valet')) {
      setCurrentScreen('main');
    }
    if (APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && valetServiceFromRide) {
      setValetServiceFromRide(null);
    }
  }, [currentScreen, valetServiceFromRide]);

  useEffect(() => {
    const syncVirtualPatchFeed = () => setVirtualPatchFeedVersion(version => version + 1);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'bytspot_virtual_patch_context') syncVirtualPatchFeed();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', syncVirtualPatchFeed);
    window.addEventListener('bytspot:virtual-patch-context-updated', syncVirtualPatchFeed);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', syncVirtualPatchFeed);
      window.removeEventListener('bytspot:virtual-patch-context-updated', syncVirtualPatchFeed);
    };
  }, []);

  const savedVirtualPatchServiceRequests = useMemo<VirtualPatchSavedServiceRequest[]>(() => {
    return (loadVirtualPatchContext()?.serviceRequests ?? []).slice().reverse();
  }, [virtualPatchFeedVersion, activeTab, currentScreen]);

  const hasPatchInvokedGuestContext = useMemo(() => {
    const context = loadVirtualPatchContext();
    return Boolean(context?.patchId || context?.serviceRequests?.length);
  }, [virtualPatchFeedVersion, activeTab, currentScreen]);

  const savedVirtualPatchServiceCards = useMemo<DiscoverCard[]>(() => {
    return savedVirtualPatchServiceRequests.map((request, index) => savedServiceRequestToCard(request, index));
  }, [savedVirtualPatchServiceRequests]);

  const discoverCardsWithSavedRequests = useMemo<DiscoverCard[]>(() => {
    const existingServiceIds = new Set(discoverApiCards.map(card => card.vendorServiceId).filter(Boolean));
    const mirroredCards = savedVirtualPatchServiceCards.filter(card => !existingServiceIds.has(card.vendorServiceId));
    const liveServiceCards = discoverApiCards.filter(isLiveVendorServiceCard);
    const curatedDiscoveryFallbackCards = discoverApiCards.length > 0 ? [] : markCuratedFallbackDiscoverCards(CURATED_HOME_DISCOVERY_CARDS);
    const curatedFallbackCards = liveServiceCards.length > 0 ? [] : curatedServiceRecommendationCards;
    return rankDiscoverCardsWithSimplex([...mirroredCards, ...discoverApiCards, ...curatedDiscoveryFallbackCards, ...curatedFallbackCards], {
      preferences: userPreferences,
      culturalContext: vendorMatchCulturalContext,
      query: vendorMatchQuery,
    });
  }, [discoverApiCards, savedVirtualPatchServiceCards, userPreferences, vendorMatchCulturalContext, vendorMatchQuery]);

  const isAuthenticatedHomeUser = useMemo(() => hasAuthenticatedConsumerSession(), [activeTab, currentScreen]);
  const shouldShowHomeRecommendations = isAuthenticatedHomeUser || hasPatchInvokedGuestContext || hasPersonalizedPreferenceSignal;

  const recommendedHomeCards = useMemo<DiscoverCard[]>(() => {
    const visibleCards = discoverCardsWithSavedRequests.filter(card => !(APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && isValetFacingServiceCard(card)));
    const nonServiceCards = visibleCards.filter(card => card.type !== 'service').slice(0, 5);
    const serviceCards = visibleCards.filter(card => card.type === 'service').slice(0, 3);
    const balancedCards = [...nonServiceCards, ...serviceCards];
    return balancedCards.length > 0 ? balancedCards.slice(0, 8) : visibleCards.slice(0, 8);
  }, [discoverCardsWithSavedRequests]);

  const handleRecommendedHomeCardClick = useCallback((card: DiscoverCard) => {
    if (card.type === 'service') {
      sessionStorage.setItem(DISCOVER_SERVICE_HIGHLIGHT_KEY, getHomeServiceFocusId(card));
      setDiscoverFilter('service');
    } else {
      setDiscoverFilter(card.type);
    }
    trackEvent('home_recommendation_selected', { type: card.type, category: card.serviceCategory ?? card.type });
    setActiveTab('discover');
  }, []);

  const handleServiceShortcutClick = useCallback((label: string) => {
    trackEvent('service_shortcut_selected', { label, source: 'home.recommended_near_you.empty' });
    setDiscoverFilter('service');
    setActiveTab('discover');
  }, []);

  // ─── AI Pick: top Simplex-ranked Discover recommendation ───────────────────
  const homeAiPickCard = useMemo<DiscoverCard | null>(() => {
    const visibleCards = discoverCardsWithSavedRequests.filter(card => !(APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && isValetFacingServiceCard(card)));
    return visibleCards[0] ?? null;
  }, [discoverCardsWithSavedRequests]);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Initialize analytics on mount + re-register push subscription + prefetch offline data
  useEffect(() => {
    initAnalytics();
    initAuditSink(); // NIST PR.PT-1 — durable audit pipeline (boots IndexedDB-backed queue)
    ensurePushSubscribed(); // silently re-subscribes if previously granted
    prefetchOfflineData(); // cache critical data for offline use

    // ─── Capacitor Deep Links ─────────────────────────────────────────────
    // When the native app is opened via bytspot:// or a universal link,
    // route to the correct in-app screen.
    const handleDeepLink = (url: string) => {
      try {
        const parsed = new URL(url);
        const pathFromName = parsed.protocol === 'bytspot:' && parsed.hostname
          ? `${parsed.hostname}${parsed.pathname}`
          : parsed.pathname;
        const path = pathFromName.replace(/^\/+/, '');

        const service = parsed.searchParams.get('service') ?? parsed.searchParams.get('action');
        const venue = parsed.searchParams.get('venue');
        const patch = parsed.searchParams.get('patch');
        if (path === 'concierge' || path.startsWith('concierge/')) {
          const prompt = [
            service ? `I need help with ${service}` : 'I need Concierge help',
            venue ? `at ${venue}` : null,
            patch ? `for patch ${patch}` : null,
          ].filter(Boolean).join(' ');
          setConciergePrefill(prompt);
          setCurrentScreen('main');
          setActiveTab('concierge');
          return;
        }

        // Patch verify universal-link: bytspot.app/p/<patchId>?venue=<name>&t=<token>
        // App Clip / NFC demo alias: bytspot.app/patch/<patchId>
        // Production NFC tag URL: bytspot.app/<uniqueid>?c=<customerId>
        // NTAG424 DNA cards/wristbands may also arrive as bytspot.com/BYT424-0301.
        // Backward-compatible NFC tag URL: bytspot.app/t/<unique-serial-number>
        // or query-string variant: bytspot.app/?patch=<id>&venue=<name>
        const patchDeepLink = extractPatchDeepLink(url);
        if (patchDeepLink) {
          void routePatchTap(patchDeepLink.patchId, patchDeepLink.venueName, patchDeepLink.tier, patchDeepLink.tagUseMode, patchDeepLink.tagIntent, patchDeepLink.referralCode, patchDeepLink.groupSize, patchDeepLink.serviceId);
          return;
        }

        if (path.startsWith('venue/')) {
          // bytspot://venue/<id> → open venue details via discover tab
          setCurrentScreen('main');
          setActiveTab('discover');
        } else if (path === 'map') {
          setCurrentScreen('main');
          setActiveTab('map');
        } else if (path === 'profile') {
          openProfileMain();
        }
      } catch { /* ignore malformed URLs */ }
    };

    const applyNativeTabRoute = (tab?: string | null, focus?: string | null) => {
      const normalized = tab === 'access' ? 'profile' : tab;
      if (!normalized || !['home', 'discover', 'map', 'profile', 'concierge'].includes(normalized)) return;
      if (normalized === 'profile') {
        if (focus) localStorage.setItem('bytspot_profile_focus', focus);
        else localStorage.removeItem('bytspot_profile_focus');
      }
      setCurrentScreen('main');
      setActiveTab(normalized);
    };

    const handleNativeTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string; focus?: string; url?: string }>).detail ?? {};
      applyNativeTabRoute(detail.tab, detail.focus);
      if (detail.url) handleDeepLink(detail.url);
    };

    const handleNativeHandoff = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail ?? {};
      if (detail.url) handleDeepLink(detail.url);
    };

    window.addEventListener('bytspot:native-tab', handleNativeTab as EventListener);
    window.addEventListener('bytspot:native-handoff', handleNativeHandoff as EventListener);
    applyNativeTabRoute(localStorage.getItem('bytspot_native_tab'), localStorage.getItem('bytspot_native_focus'));

    // Pick up patch deep-links present at first paint (web universal link
    // landing or App Clip → full-app handoff via SKOverlay).
    if (typeof window !== 'undefined') {
      const nativeHandoffURL = localStorage.getItem('bytspot_native_handoff_url');
      if (nativeHandoffURL) {
        localStorage.removeItem('bytspot_native_handoff_url');
        handleDeepLink(nativeHandoffURL);
      } else {
        handleDeepLink(window.location.href);
      }
    }

    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        CapApp.addListener('appUrlOpen', ({ url }) => {
          console.log('[deeplink]', url);
          handleDeepLink(url);
        });
      } catch {
        // @capacitor/app not installed → running in browser, skip
      }
    })();

    // ─── Capacitor Status Bar Styling ──────────────────────────────────────
    // Match the native status bar to the app's dark theme.
    // Uses dynamic import so the web build doesn't break if the plugin is absent.
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return; // web → skip

        const { StatusBar, Style } = await import('@capacitor/status-bar');

        // Keep native chrome aligned with the black app shell so the layout does
        // not look like a browser window embedded inside a webview.
        await StatusBar.setOverlaysWebView?.({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#000000' });

        // Future-proof: if dark mode becomes toggleable, listen for changes
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', async (e) => {
          await StatusBar.setStyle({ style: e.matches ? Style.Dark : Style.Light });
          await StatusBar.setBackgroundColor({ color: e.matches ? '#000000' : '#FFFFFF' });
        });
      } catch {
        // @capacitor/status-bar not available → running in browser, skip
      }
    })();

    return () => {
      window.removeEventListener('bytspot:native-tab', handleNativeTab as EventListener);
      window.removeEventListener('bytspot:native-handoff', handleNativeHandoff as EventListener);
    };
  }, [routePatchTap]);

  // ─── "Near me now" push alerts ───────────────────────────────────────────
  // When a saved venue hits Packed, fire a browser notification (30-min cooldown per venue)
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!apiVenues || apiVenues.length === 0) return;

    const savedSpots = getSavedSpots();
    if (savedSpots.length === 0) return;

    const savedNames = new Set(savedSpots.map((s: any) => s.name.toLowerCase()));
    const notifiedKey = 'bytspot_packed_notified';
    const notified: Record<string, number> = JSON.parse(localStorage.getItem(notifiedKey) || '{}');
    const now = Date.now();
    const COOLDOWN = 30 * 60 * 1000; // 30 minutes

    let updated = false;
    apiVenues.forEach((venue) => {
      if (venue.crowd?.label !== 'Packed') return;
      if (!savedNames.has(venue.name.toLowerCase())) return;

      const lastNotified = notified[venue.id] || 0;
      if (now - lastNotified < COOLDOWN) return;

      // Fire the notification
      try {
        new Notification(`🔴 ${venue.name} is Packed!`, {
          body: 'Your saved spot just hit max capacity. Check the app for alternatives.',
          icon: '/icon-192.png',
        });
        notified[venue.id] = now;
        updated = true;
      } catch (_) { /* permission may have been revoked */ }
    });

    if (updated) localStorage.setItem(notifiedKey, JSON.stringify(notified));
  }, [apiVenues]);

  const refreshEvents = async () => {
    const events = await getEventsAsync();
    setEventsFeed(events);
  };

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);

    getEventsAsync()
      .then((events) => {
        if (!cancelled) setEventsFeed(events);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Handle intelligent search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;

    const query = searchValue.trim();
    
    // Save to recent searches
    const recent = localStorage.getItem('bytspot_recent_searches');
    const recentArray = recent ? JSON.parse(recent) : [];
    const updatedRecent = [query, ...recentArray.filter((s: string) => s !== query)].slice(0, 5);
    localStorage.setItem('bytspot_recent_searches', JSON.stringify(updatedRecent));
    
    // Classify the search query
    const result = classifySearchQuery(query);
    
    // ANALYTICS: Track search
    trackEvent('search_performed', {
      query,
      category: result.category,
      confidence: result.confidence,
    });
    
    // Handle based on category and confidence
    if (['parking', 'coffee', 'dining', 'shopping', 'nightlife', 'entertainment', 'fitness'].includes(result.category)) {
      // Category search - show in discover with swipe cards
      setDiscoverFilter(result.category as any);
      setActiveTab('discover');
      
      const categoryLabels: Record<string, string> = {
        parking: 'Parking Spots',
        coffee: 'Coffee Shops',
        dining: 'Restaurants',
        shopping: 'Shopping',
        nightlife: 'Nightlife',
        entertainment: 'Events',
        fitness: 'Fitness Centers',
      };
      
      const nearbyText = isNearbyQuery(query) ? ' near you' : '';
      toast.success(`Finding ${categoryLabels[result.category]}`, {
        description: `Swipe to discover ${categoryLabels[result.category].toLowerCase()}${nearbyText}`,
        duration: 2000,
      });
    } else if (result.category === 'navigation' || result.confidence < 0.3) {
      // Low confidence or explicit navigation request - go to map
      setSelectedDestination(query);
      setSelectedMapFunction('route');
      setActiveTab('map');
      toast.success('Navigation', {
        description: `Setting route to ${query}`,
        duration: 2000,
      });
    } else {
      // Fallback to map navigation
      setSelectedDestination(query);
      setSelectedMapFunction('route');
      setActiveTab('map');
    }
    
    setSearchValue('');

  };

  // Handle search suggestions
  const handleSuggestionClick = (suggestion: any) => {
    if (suggestion.category) {
      handleCategoryClick(suggestion.category, suggestion.text);
    } else {
      setSearchValue(suggestion.text);
      setSelectedDestination(suggestion.text);
      setSelectedMapFunction('route');
      setActiveTab('map');
      toast.success('Navigation', {
        description: `Setting route to ${suggestion.text}`,
        duration: 2000,
      });
    }
  };

  // Handle nearby location click
  const handleNearbyLocationClick = (locationName: string) => {
    trackLocationVisit(locationName);
    setSelectedDestination(locationName);
    setSelectedMapFunction('route');
    setActiveTab('map');
  };

  // Handle category click with tracking
  const handleCategoryClick = (category: string, label: string) => {
    trackCategoryClick(category);
    setDiscoverFilter(category as any);
    setActiveTab('discover');
    
    // ANALYTICS: Track category selection
    trackEvent('category_selected', {
      category,
      label,
    });
    
    toast.success(`Discovering ${label}`, {
      description: `Swipe to explore nearby options`,
      duration: 2000,
    });
  };

  // PERFORMANCE: Memoize personalized categories
  const memoizedCategories = useMemo(() => {
    if (activeTab === 'home' || currentScreen === 'main') {
      return getPersonalizedCategories(userPreferences, userBehavior);
    }
    return [];
  }, [activeTab, currentScreen, userPreferences, userBehavior]);
  
  // PERFORMANCE: Memoize personalized locations — use live GPS coords, fall back to Atlanta
  const activeCoords = userCoords ?? cityCoords ?? { lat: 33.7866, lng: -84.3833 };
  const onboardingPreview = useMemo(() => {
    try {
      const raw = localStorage.getItem(LAUNCH_PREVIEW_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { context?: string; userCity?: string; picks?: Array<{ id: number | string; name: string; address?: string; category?: string; label?: string; crowd?: { level?: number; label?: string } }>; answers?: Record<string, string>; savedAt?: string };
      return parsed?.picks?.length ? parsed : null;
    } catch { return null; }
  }, [launchPreviewVersion, activeTab]);
  const onboardingPreviewCopy = useMemo(() => {
    const intent = onboardingPreview?.answers?.vibe ?? '';
    if (['sleep', 'stay'].includes(intent)) return { title: 'A softer landing nearby', why: 'Late-night comfort · Midtown timing · safer arrival' };
    if (['parking', 'covered_parking'].includes(intent)) return { title: 'Easy arrivals near Midtown', why: 'Easy arrival · short walk · Midtown timing' };
    if (intent === 'ride') return { title: 'A smoother way home', why: 'Better pickup points · cleaner route · less waiting' };
    if (intent === 'indoor') return { title: 'Comfort-first plans nearby', why: 'Dry, comfortable, and close enough' };
    if (intent === 'drinks') return { title: 'A night worth stepping into', why: 'Evening energy · good rooms · easy arrival' };
    if (intent === 'events') return { title: 'Plans that fit the crowd', why: 'Show timing · crowd flow · easier exits' };
    if (intent === 'coffee') return { title: 'A good stop before you go', why: 'Daytime rhythm · close stops · low-friction arrival' };
    return { title: 'Shaped around your night', why: 'Your mood · the hour · what feels close enough' };
  }, [onboardingPreview]);
  const viewOnboardingPicksOnMap = useCallback(() => {
    if (!hasAuthenticatedConsumerSession()) {
      setGuestSavePrompt({ title: 'Sign in to view your map', subtitle: 'Sign in to keep routes, parking context, and arrival notes synced before opening Map.', cta: 'Sign in to map' });
      return;
    }
    const topPick = onboardingPreview?.picks?.[0];
    if (topPick?.name) setSelectedDestination(topPick.name);
    setSelectedMapFunction('route');
    setActiveTab('map');
  }, [onboardingPreview]);

  const exploreOnboardingPreviewFromHome = useCallback(() => {
    if (!hasAuthenticatedConsumerSession()) {
      setGuestSavePrompt({ title: 'Sign in to explore your picks', subtitle: 'Create an account to personalize recommendations before opening Discover.', cta: 'Sign in to explore' });
      return;
    }
    setActiveTab('discover');
  }, []);
  const memoizedLocations = useMemo(() => {
    if (activeTab === 'home' || currentScreen === 'main') {
      return getPersonalizedNearbyLocations(
        activeCoords,
        userPreferences,
        userBehavior
      );
    }
    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentScreen, userPreferences, userBehavior, activeCoords.lat, activeCoords.lng]);

  useEffect(() => {
    if (discoverFilter === undefined && preferredDiscoverFilter) {
      setDiscoverFilter(preferredDiscoverFilter);
    }
  }, [discoverFilter, preferredDiscoverFilter]);
  
  // Load personalized content on mount and when returning to home
  useEffect(() => {
    if (activeTab === 'home' || currentScreen === 'main') {
      setPersonalizedCategories(memoizedCategories);
      setPersonalizedLocations(memoizedLocations);
    }
  }, [activeTab, currentScreen, memoizedCategories, memoizedLocations]);

  // Handle touch to show navigation in Discover tab
  const handleDiscoverTouch = () => {
    if (activeTab === 'discover') {
      // Show navigation
      setShowBottomNav(true);
      
      // Clear existing timer
      if (navHideTimerRef.current) {
        clearTimeout(navHideTimerRef.current);
      }
      
      // Set new timer to hide after 3 seconds of inactivity
      navHideTimerRef.current = setTimeout(() => {
        setShowBottomNav(false);
      }, 3000);
    }
  };

  // Handle scroll for auto-hiding bottom nav
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Don't auto-hide in Concierge tab (users need access to chat input)
    if (activeTab === 'concierge') {
      return;
    }

    // For Discover tab, hide nav during scroll and don't show on scroll
    if (activeTab === 'discover') {
      // Mark as scrolling
      setIsScrolling(true);
      
      // Hide nav while scrolling
      if (showBottomNav) setShowBottomNav(false);
      
      // Clear existing timers
      if (navHideTimerRef.current) {
        clearTimeout(navHideTimerRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Reset scrolling state after scroll ends
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
      
      return;
    }

    // For other tabs, use scroll-based show/hide
    const currentScrollY = e.currentTarget.scrollTop;
    
    // Prevent unnecessary state updates
    if (currentScrollY === lastScrollY) {
      return;
    }
    
    if (currentScrollY < 10) {
      // Always show nav at the top
      if (!showBottomNav) setShowBottomNav(true);
    } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
      // Scrolling down - hide nav
      if (showBottomNav) setShowBottomNav(false);
    } else if (currentScrollY < lastScrollY) {
      // Scrolling up - show nav
      if (!showBottomNav) setShowBottomNav(true);
    }
    
    setLastScrollY(currentScrollY);
  };

  // Reset scroll state and show nav when changing tabs
  useEffect(() => {
    // Clear any existing timers FIRST before setting new ones
    if (navHideTimerRef.current) {
      clearTimeout(navHideTimerRef.current);
      navHideTimerRef.current = null;
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    // ANALYTICS: Track tab changes
    trackEvent('tab_changed', {
      tab: activeTab,
      previous_tab: lastScrollY > 0 ? 'scrolled' : 'top',
    });

    // Show nav by default; auto-hide for full-screen views (Map + Concierge)
    if (activeTab === 'discover') {
      setShowBottomNav(false);
    } else if (activeTab === 'map' || activeTab === 'concierge') {
      // Show briefly so user sees active tab, then auto-hide
      setShowBottomNav(true);
      navHideTimerRef.current = setTimeout(() => {
        setShowBottomNav(false);
      }, 2000);
    } else {
      setShowBottomNav(true);
      // Reset discover filter when leaving discover tab
      setDiscoverFilter(undefined);
    }

    // Reset map destination when leaving map tab
    if (activeTab !== 'map') {
      setSelectedDestination(undefined);
      setSelectedMapFunction(undefined);
    }

    setLastScrollY(0);
    setIsScrolling(false);
  }, [activeTab]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (navHideTimerRef.current) {
        clearTimeout(navHideTimerRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Check if user already authenticated + fetch provider status
  useEffect(() => {
    const authToken = localStorage.getItem('bytspot_auth_token');
    if (authToken) {
      setCurrentScreen('main');
    }

    // Handle Stripe return URLs (/premium/success, /parking/success, /profile/payment, /premium/cancelled)
    const path = window.location.pathname;
    const query = new URLSearchParams(window.location.search);
    if (path.includes('/booking/success') || path.includes('/booking/cancelled')) {
      setCurrentScreen('main');
      return;
    }
    if (path.includes('/profile/payment')) {
      const setupStatus = query.get('setup');
      localStorage.setItem('bytspot_profile_focus', 'payment');
      setActiveTab('profile');
      setCurrentScreen('main');
      if (setupStatus === 'success') {
        toast.success('Card setup complete', { description: 'Refreshing saved payment methods now.', duration: 3500 });
      } else if (setupStatus === 'cancelled') {
        toast('Card setup cancelled — no card was saved.', { duration: 3000 });
      }
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/premium/success')) {
      if (APPLE_REVIEW_HIDE_PLATINUM_MEMBERSHIP) {
        openProfileMain();
        window.history.replaceState({}, '', '/');
        return;
      }
      toast.success('Platinum checkout received', { description: 'Confirming your membership with Bytspot.', duration: 5000 });
      openProfileMain();
      // Clean the URL without reload
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/premium/cancelled')) {
      if (APPLE_REVIEW_HIDE_PLATINUM_MEMBERSHIP) {
        openProfileMain();
        window.history.replaceState({}, '', '/');
        return;
      }
      toast('Platinum checkout cancelled — no charges made.', { duration: 3000 });
      openProfileMain();
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/parking/success')) {
      const sessionId = new URLSearchParams(window.location.search).get('session_id');
      finalizePendingParkingCheckout(sessionId);
      localStorage.setItem('bytspot_profile_focus', 'reservations');
      toast.success('✅ Parking Reserved!', { description: 'Your parking pass is now available in Profile → My Reservations.', duration: 5000 });
      setActiveTab('profile');
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/parking/cancelled')) {
      toast('Parking checkout cancelled — no charges made.', { duration: 3000 });
      setActiveTab('map');
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/cancelled')) {
      toast('Payment cancelled — no charges made.', { duration: 3000 });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  if (typeof window !== 'undefined') {
    const normalizedPath = window.location.pathname.replace(/\/+/g, '/');
    const canonicalPath = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? normalizedPath : canonicalProviderPath(normalizedPath);
    if (APP_STORE_CONSUMER_ONLY_BUILD && (isAppStoreConsumerOnlyBlockedPath(normalizedPath) || isAppStoreConsumerOnlyBlockedPath(canonicalPath))) {
      return <ConsumerOnlyRouteRedirect />;
    }

    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME) {
      // Phase 4 rollout alias: legacy Host URLs remain functional for one sprint,
      // but users are canonicalized to Provider URLs. Remove after 2026-05-20.
      if (canonicalPath !== normalizedPath) {
        window.history.replaceState({}, '', `${canonicalPath}${window.location.search}${window.location.hash}`);
      }
    }
    const passwordRecoveryRoute = getPasswordRecoveryRoute(window.location);

    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME) {
      if (APPLE_REVIEW_HIDE_INTERNAL_ROUTES && ((normalizedPath.startsWith('/admin') && normalizedPath !== '/admin/approvals') || normalizedPath === '/marketing')) {
        window.history.replaceState({}, '', '/');
      } else if (normalizedPath === '/marketing') {
        return (
          <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
            <PrintableMarketingAssets />
          </Suspense>
        );
      }
    }

    if (passwordRecoveryRoute) {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <PasswordRecoveryScreen
            mode={passwordRecoveryRoute}
            onBackToAuth={() => {
              window.history.replaceState({}, '', '/');
              setCurrentScreen('auth');
              setProviderRouteVersion(version => version + 1);
            }}
          />
        </Suspense>
      );
    }

    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && (canonicalPath === '/provider' || normalizedPath === '/vendor')) {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <ProviderLanding
            onStart={startProviderOnboarding}
            onBackToParker={() => {
              window.history.replaceState({}, '', '/');
              setProviderRouteVersion(version => version + 1);
            }}
          />
        </Suspense>
      );
    }

    const providerPatchRouteId = readProviderPatchIdFromPath(canonicalPath) ?? readProviderPatchIdFromPath(normalizedPath);
    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && providerPatchRouteId) {
      focusProviderPatch(providerPatchRouteId);
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <ProviderApp
            isDarkMode={isDarkMode}
            initialScreen="dashboard"
            initialDashboardView="patches"
            onBackToMain={openProviderLanding}
          />
        </Suspense>
      );
    }

    if (normalizedPath === '/booking/success' || normalizedPath === '/booking/cancelled') {
      const status = normalizedPath === '/booking/success' ? 'success' : 'cancelled';
      return (
        <MarketplaceBookingReturnScreen
          status={status}
          onContinue={() => {
              const focus = new URLSearchParams(window.location.search).get('focus');
            window.history.replaceState({}, '', '/');
            setCurrentScreen('main');
            if (status === 'success') {
                if (focus === 'tickets') {
                  localStorage.setItem('bytspot_profile_focus', 'tickets');
                  setActiveTab('profile');
                } else {
                  openProfileMain();
                }
            } else {
              setActiveTab('discover');
            }
          }}
        />
      );
    }

    if (
      !APP_STORE_CONSUMER_ONLY_COMPILE_TIME &&
      (
        normalizedPath === '/provider/onboarding' ||
        normalizedPath === '/vendor/onboarding' ||
        canonicalPath === '/provider/onboarding' ||
        normalizedPath === '/provider/connect/return' ||
        normalizedPath === '/provider/connect/refresh' ||
        canonicalPath === '/provider/connect/return' ||
        canonicalPath === '/provider/connect/refresh'
      )
    ) {
      const isStripeConnectReturn = canonicalPath.endsWith('/connect/return') || canonicalPath.endsWith('/connect/refresh');
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <ProviderApp
            isDarkMode={isDarkMode}
            initialScreen={isStripeConnectReturn ? 'dashboard' : 'onboarding'}
            initialDashboardView={isStripeConnectReturn ? 'overview' : undefined}
            onBackToMain={openProviderLanding}
          />
        </Suspense>
      );
    }

    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && normalizedPath === '/admin') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <AdminDashboard />
        </Suspense>
      );
    }
    if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && normalizedPath === '/admin/approvals') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <AdminApprovals />
        </Suspense>
      );
    }
    if (normalizedPath === '/privacy') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <PrivacyPolicy />
        </Suspense>
      );
    }
    if (normalizedPath === '/terms') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <TermsOfService />
        </Suspense>
      );
    }
    if (normalizedPath === '/disclaimer') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <Disclaimer />
        </Suspense>
      );
    }
    if (normalizedPath === '/support') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <Support />
        </Suspense>
      );
    }
  }

  // Beta MVP: Splash → Landing → Auth → Main
  if (currentScreen === 'splash') {
    trackScreenView('splash');
    return (
      <SplashScreen
        onComplete={() => setCurrentScreen('landing')}
        isDarkMode={isDarkMode}
      />
    );
  }

  if (currentScreen === 'landing') {
    return (
      <LandingPage
        isDarkMode={isDarkMode}
        onGetStarted={() => setCurrentScreen('auth')}
      />
    );
  }

  if (currentScreen === 'auth') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
      <AuthenticationFlow
        isDarkMode={isDarkMode}
        initialEmail={prefillEmail}
        initialRef={prefillRef}
        onComplete={() => {
          // Token is already stored by AuthenticationFlow — no override needed
          setCurrentScreen('main');
          if (localStorage.getItem('bytspot_pending_booking_service')) {
            setActiveTab('discover');
            toast.success('Ready to book', { description: 'Review the service and continue to Stripe Checkout.' });
          }
          if (!localStorage.getItem('bytspot_intro_seen')) {
            setOnboardingSlide(0);
            setShowOnboarding(true);
          }
        }}
      />
      </Suspense>
    );
  }

  // ── Provider App ─────────────────────────────────────
  if (!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && currentScreen === 'host') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
        <ProviderApp
          isDarkMode={isDarkMode}
          onBackToMain={() => setCurrentScreen('main')}
        />
      </Suspense>
    );
  }

  // ── Valet App ────────────────────────────────────────
  if (!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && currentScreen === 'valet') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
        <ValetApp
          isDarkMode={isDarkMode}
          onBackToMain={() => setCurrentScreen('main')}
        />
      </Suspense>
    );
  }

  // Main app with tabs
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients - Brand Colors */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          {/* Purple (AI) - Top center */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.20) 0%, transparent 70%)' }} />
          {/* Cyan (Parking) - Bottom right */}
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.18) 0%, transparent 70%)' }} />
          {/* Magenta (Venues) - Middle left */}
          <div className="absolute top-[40%] left-[5%] w-[350px] h-[350px]" 
               style={{ background: 'radial-gradient(circle, rgba(255, 0, 255, 0.15) 0%, transparent 70%)' }} />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col">
        {/* Status Bar Space — respects iOS notch / Dynamic Island */}
        <div style={{ height: 'max(3rem, var(--safe-area-top, 0px))' }} />

        {/* Offline Banner — visible when device loses connectivity */}
        <AnimatePresence>
          {isOffline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500/20 border-b border-yellow-500/30">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-medium text-yellow-300">
                  You're offline — showing cached data
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced Header - Only on Home */}
        {activeTab === 'home' && (
          <EnhancedHeader
            onProfileClick={openProfileMain}
            scrollContainerRef={homeScrollRef}
            weather={weather.current}
            weatherLoading={weather.loading}
            city={userCity}
          />
        )}

        {/* Smart Search Bar - Only on Home */}
        {activeTab === 'home' && (
          <div className="px-4 mb-4">
            <SmartSearchBar
              value={searchValue}
              onChange={setSearchValue}
              onSubmit={handleSearch}
              onSuggestionClick={handleSuggestionClick}
              isDarkMode={isDarkMode}
              venues={apiVenues}
              onVenueClick={(venue) => {
                setSelectedSearchVenue(venue);
                setSearchValue('');
              }}
            />
          </div>
        )}

        {/* Tab Content — bottom padding accounts for BottomNav + safe area */}
        <div
          className="flex-1 relative"
          style={{ minHeight: 0, paddingBottom: 'calc(6rem + var(--safe-area-bottom, 0px))' }}
        >
          {/* popLayout mounts the incoming tab immediately instead of
              serializing exit → enter, which stacked ~400ms of dead time on
              every tab switch (exit 200ms + lazy chunk + enter 200ms). */}
          <AnimatePresence mode="popLayout">
            {activeTab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                <div
                  ref={homeScrollRef}
                  onScroll={handleScroll}
                  className="absolute inset-0 overflow-y-auto"
                >
                {onboardingPreview && (
                  <motion.div
                    className="px-4 mb-4 pt-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springConfig, delay: 0.03 }}
                    data-testid="home-launch-picks-ready"
                  >
                    <div className="relative overflow-hidden rounded-[22px] border border-cyan-300/25 bg-[#101116]/90 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                      <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-cyan-500/20 blur-3xl" />
                      <div className="absolute -left-12 bottom-0 h-24 w-24 rounded-full bg-purple-500/15 blur-3xl" />
                      <div className="relative mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.08em] text-cyan-200" style={{ fontWeight: 850 }}>Your picks are ready</p>
                          <h2 className="mt-1 text-[20px] leading-6 text-white" style={{ fontWeight: 800 }}>{onboardingPreviewCopy.title}</h2>
                          <p className="mt-1 text-[12px] leading-[17px] text-white/55" style={{ fontWeight: 600 }}>{onboardingPreview.context ?? `Based on your vibe near ${onboardingPreview.userCity ?? userCity}`}</p>
                        </div>
                        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100" style={{ fontWeight: 800 }}>{onboardingPreview.picks?.length ?? 0} picks</span>
                      </div>
                      <div className="relative mb-3 rounded-[15px] border border-white/10 bg-white/[0.045] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.07em] text-white/38" style={{ fontWeight: 850 }}>Why these?</p>
                        <p className="mt-0.5 text-[12px] leading-[17px] text-white/62" style={{ fontWeight: 650 }}>{onboardingPreviewCopy.why}</p>
                      </div>
                      <div className="relative flex flex-col gap-2.5">
                        {onboardingPreview.picks?.slice(0, 3).map((pick, index) => {
                          const crowd = pick.crowd?.label ?? pick.label ?? 'Recommended';
                          return (
	                            <button key={`launch-pick-${pick.id}-${index}`} type="button" onClick={exploreOnboardingPreviewFromHome} className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.055] p-3 text-left transition active:scale-[0.98]">
                              <span className="text-xl">{['🥇', '🥈', '🥉'][index] ?? '📍'}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] text-white" style={{ fontWeight: 750 }}>{pick.name}</p>
                                <p className="truncate text-[12px] text-white/42" style={{ fontWeight: 600 }}>{pick.address ?? pick.category ?? 'Nearby pick'}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100" style={{ fontWeight: 750 }}>{crowd}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative mt-3 grid grid-cols-2 gap-2.5">
                        <button type="button" onClick={exploreOnboardingPreviewFromHome} className="rounded-[15px] bg-gradient-to-r from-cyan-500 to-purple-600 px-3 py-3 text-[13px] text-black" style={{ fontWeight: 850 }}>Explore picks</button>
                        <button type="button" onClick={viewOnboardingPicksOnMap} className="rounded-[15px] border border-purple-300/25 bg-purple-400/10 px-3 py-3 text-[13px] text-purple-100" style={{ fontWeight: 800 }}>View on Map</button>
                      </div>
                      <div className="relative mt-2.5">
                        {!hasAuthenticatedConsumerSession() ? (
                          <button type="button" onClick={() => setGuestSavePrompt({ title: 'Save your picks?', subtitle: 'Sign in to keep favorites, routes, and parking preferences across devices.', cta: 'Sign in to save' })} className="w-full rounded-[15px] border border-cyan-300/25 bg-white/[0.055] px-3 py-3 text-[13px] text-cyan-100" style={{ fontWeight: 800 }}>Sign in to save picks</button>
                        ) : (
                          <button type="button" onClick={() => toast.success('Your picks are ready', { description: 'Saved preferences are active on this device.' })} className="w-full rounded-[15px] border border-emerald-300/25 bg-emerald-400/10 px-3 py-3 text-[13px] text-emerald-100" style={{ fontWeight: 800 }}>Picks active</button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Tonight's Pick ── Simplex-ranked Discover recommendation */}
                {homeAiPickCard && (() => {
                  const card = homeAiPickCard;
                  const status = card.availability ?? (card.isOpen === true ? 'Open now' : card.isOpen === false ? 'Closed' : card.type === 'service' ? 'Available' : 'Recommended');
                  const statusKey = status.toLowerCase();
                  const statusColor = statusKey.includes('packed') || statusKey.includes('closed') ? 'bg-red-500/30 border-red-400/50 text-red-300'
                    : statusKey.includes('busy') ? 'bg-orange-500/30 border-orange-400/50 text-orange-300'
                    : statusKey.includes('active') ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-300'
                    : 'bg-green-500/30 border-green-400/50 text-green-300';
                  const statusEmoji = statusKey.includes('packed') || statusKey.includes('closed') ? '🔴' : statusKey.includes('busy') ? '🟠' : statusKey.includes('active') ? '🟡' : '🟢';
                  const catEmoji: Record<string, string> = {
                    dining: '🍽️', service: '✨', venue: '📍', parking: '🅿️', valet: '🚕', coffee: '☕', nightlife: '🎶',
                    shopping: '🛍️', fitness: '💪', entertainment: '🎭',
                  };
                  const icon = catEmoji[card.type] || '📍';
                  return (
                    <motion.div
	                      className="px-4 mb-3 pt-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...springConfig, delay: 0.05 }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[11px] text-[#A855F7]" style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>✨ Tonight's Pick</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                      <motion.button
	                        className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1C1C1E] via-[#221B34] to-[#102329] text-left"
	                        style={{ height: 118 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleRecommendedHomeCardClick(card)}
                      >
	                        <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-purple-500/20 blur-3xl" />
	                        <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-cyan-500/15 blur-3xl" />
                        {/* AI Pick badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#A855F7]/80 backdrop-blur-sm border border-[#A855F7]/50">
                          <Sparkles className="w-3 h-3 text-white" strokeWidth={2.5} />
                          <span className="text-white text-[11px]" style={{ fontWeight: 700 }}>AI Pick</span>
                        </div>
                        {/* Content */}
	                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pt-10">
                          <div>
	                            <div className="text-[16px] mb-0.5">{icon}</div>
                            <h3 className={`${HOME_CARD_TITLE_CLASS} text-[15px] leading-tight`} style={{ fontWeight: 700 }}>{card.name}</h3>
                            {(card.location || card.description) && <p className={`${HOME_CARD_META_CLASS} text-[12px] mt-0.5 truncate`}>{card.location || card.description}</p>}
                          </div>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[12px] backdrop-blur-sm ${statusColor}`} style={{ fontWeight: 700 }}>
                            {statusEmoji} {status}
                          </div>
                        </div>
                      </motion.button>
                    </motion.div>
                  );
                })()}

	                {/* ── Weather Smart ── Live conditions for parking + plans */}
	                <motion.div
	                  className="px-4 mb-4"
	                  initial={{ opacity: 0, y: 10 }}
	                  animate={{ opacity: 1, y: 0 }}
	                  transition={{ ...springConfig, delay: 0.1 }}
	                >
	                  <div className="relative overflow-hidden rounded-[20px] border border-white/20 bg-[#1C1C1E]/80 p-3.5 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
	                    <div className="absolute inset-x-3 top-0 h-px bg-white/30" />
	                    <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-cyan-500/20 blur-3xl" />
	                    <div className="absolute -left-12 bottom-0 h-24 w-24 rounded-full bg-purple-500/15 blur-3xl" />
	                    <div className="relative flex items-center justify-between gap-3">
	                      <div className="flex min-w-0 items-center gap-3">
	                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[16px] border border-cyan-300/30 bg-gradient-to-br from-cyan-500/25 to-purple-500/20 text-[24px] shadow-lg shadow-cyan-500/10">
	                          {getWeatherEmoji(weather.current)}
	                        </div>
	                        <div className="min-w-0">
	                          <div className="flex items-baseline gap-2">
	                            <p className="text-[24px] leading-none text-white" style={{ fontWeight: 750 }}>
	                              {Math.round(weather.current.temperatureF)}°
	                            </p>
	                            <p className="truncate text-[13px] text-white/75" style={{ fontWeight: 650 }}>
	                              {describeWeatherCode(weather.current.weatherCode)}
	                            </p>
	                          </div>
	                          <p className="mt-1 truncate text-[11px] text-cyan-200/80" style={{ fontWeight: 600 }}>
	                            Weather-smart parking · {userCity}
	                          </p>
	                        </div>
	                      </div>
	                      <div className="flex flex-col items-end gap-1.5 text-right">
	                        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/70" style={{ fontWeight: 700 }}>
	                          {weather.current.source === 'live' ? 'LIVE' : weather.current.source === 'cached' ? 'CACHED' : 'UPDATING'}
	                        </span>
	                        <span className="flex items-center gap-1 text-[11px] text-white/55" style={{ fontWeight: 600 }}>
	                          <Wind className="h-3 w-3" strokeWidth={2.5} /> {Math.round(weather.current.windMph)} mph
	                        </span>
	                      </div>
	                    </div>
	                    <p className="relative mt-2.5 text-[12px] leading-[17px] text-white/60">
	                      {getWeatherTip(weather.current)}
	                    </p>
	                  </div>
	                </motion.div>

                {/* Quick Actions & Nearby - Main Home Content */}
                <div className="px-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {/* Section Header */}
                    <div className="mb-4">
                      <h2 className="text-title-2 text-white">
                        Quick Actions
                      </h2>
                    </div>

                    {/* Action Cards Grid - Using Brand Colors */}
                    <div className="grid grid-cols-2 gap-3 mb-8">
                      <QuickActionCard
                        delay={0.25}
                        icon={<MapPin className="w-[22px] h-[22px]" strokeWidth={2.5} />}
                        title="Find Parking"
                        subtitle="Live spots near you"
                        color="cyan"
                        isDarkMode={isDarkMode}
                        onClick={() => {
                          setSelectedMapFunction('smart-parking');
                          setActiveTab('map');
                        }}
                      />
                      
                      <QuickActionCard
                        delay={0.3}
                        icon={<Navigation className="w-[22px] h-[22px]" strokeWidth={2.5} />}
                        title="Nearby"
                        subtitle="What's around"
                        color="pink"
                        isDarkMode={isDarkMode}
                        onClick={() => {
                          setActiveTab('map');
                        }}
                      />
                      
                      <QuickActionCard
                        delay={0.35}
                        icon={<Star className="w-[22px] h-[22px]" strokeWidth={2.5} />}
                        title="Book a Ride"
                        subtitle="Uber & Lyft"
                        color="orange"
                        isDarkMode={isDarkMode}
                        onClick={() => {
                          setShowRideSelection(true);
                        }}
                      />
                      
                      <QuickActionCard
                        delay={0.4}
                        icon={<Sparkles className="w-[22px] h-[22px]" strokeWidth={2.5} />}
                        title="Explore Venues"
                        subtitle="Discover"
                        color="magenta"
                        isDarkMode={isDarkMode}
                        onClick={() => {
                          setDiscoverFilter(undefined);
                          setActiveTab('discover');
                        }}
                      />
                    </div>


                    {shouldShowHomeRecommendations && (
                      <div className="mb-6" data-testid="home-recommended-nearby-rail">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
	                            <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 750 }}>Recommended for you</h2>
			                            <p className="text-[12px] text-white drop-shadow-sm shadow-black" style={{ fontWeight: 650 }}>{recommendedHomeCards.length > 0 ? 'Personalized from your saved preferences and nearby context' : 'Choose a local lane to explore next'}</p>
                          </div>
		                          {recommendedHomeCards.length > 0 && (
	                            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-white shadow-black drop-shadow-sm" style={{ fontWeight: 800 }}>
		                              {recommendedHomeCards.length} picks
	                            </span>
	                          )}
                        </div>
                        <div className={HOME_CAROUSEL_CLASS}>
			                          {recommendedHomeCards.length > 0 ? recommendedHomeCards.map((card, index) => (
                            <motion.button
                              key={`recommended-nearby-${getHomeServiceFocusId(card)}`}
                              type="button"
                              data-testid="home-recommended-nearby-card"
	                              onClick={() => handleRecommendedHomeCardClick(card)}
                              className={`${HOME_FEATURE_CARD_CLASS} border border-cyan-300/25`}
	                              style={HOME_SERVICE_CARD_STYLE}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ ...springConfig, delay: 0.2 + index * 0.04 }}
                              whileTap={{ scale: 0.96 }}
                              whileHover={{ scale: 1.02, y: -2 }}
                            >
                              <img src={card.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" aria-hidden="true" />
                              <div className={`absolute inset-0 ${HOME_OVERLAY_GRADIENT_CLASS}`} />
	                              <div className={`absolute inset-x-0 bottom-0 p-3 pt-16 ${HOME_OVERLAY_GRADIENT_CLASS}`}>
	                                <div className="max-h-[150px] overflow-hidden">
		                                  <p data-testid="home-service-card-vendor" className={`${HOME_CARD_META_CLASS} line-clamp-1 text-[11px] leading-[13px]`} style={{ fontWeight: 850 }}>{card.location ?? card.serviceCategory ?? card.type}</p>
	                                  <h3 data-testid="home-service-card-title" className={`${HOME_CARD_TITLE_CLASS} mt-1 line-clamp-2 text-[15px] leading-[18px]`} style={{ fontWeight: 950 }}>{card.name}</h3>
		                                  <p className={`${HOME_CARD_META_CLASS} mt-1 line-clamp-1 text-[11px] leading-[13px]`} style={{ fontWeight: 680 }}>{card.serviceSubtitle ?? card.description ?? card.availability ?? 'Picked for your preferences'}</p>
	                                  <p className={`${HOME_CARD_META_CLASS} mt-1 line-clamp-1 text-[10px] leading-[12px]`} style={{ fontWeight: 850 }}>
	                                    {[card.rating ? `${card.rating.toFixed(2)} ★` : null, card.bookingCount ? `${card.bookingCount} bookings` : null, card.entryPrice ?? card.price].filter(Boolean).join(' • ')}
	                                  </p>
		                                  <p data-testid="home-service-card-cta" className="mt-2 inline-flex max-w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-2.5 py-1 text-[11px] leading-[13px] text-white shadow-lg shadow-cyan-950/25 ring-1 ring-white/25" style={{ fontWeight: 900 }}>{card.ctaText ?? 'Open in Discover →'}</p>
	                                </div>
                              </div>
                            </motion.button>
		                          )) : SERVICE_RECOMMENDATION_SHORTCUTS.filter(shortcut => !(APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && isHiddenServiceShortcut(shortcut))).map((shortcut, index) => (
	                            <motion.button
	                              key={`service-shortcut-${shortcut.label}`}
	                              type="button"
	                              data-testid="home-service-shortcut-card"
	                              onClick={() => handleServiceShortcutClick(shortcut.label)}
	                              className="relative flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/80 p-3 text-left shadow-[0_16px_44px_rgba(0,0,0,0.34)] ring-1 ring-cyan-200/10"
	                              style={HOME_FEATURE_CARD_STYLE}
	                              initial={{ opacity: 0, y: 12 }}
	                              animate={{ opacity: 1, y: 0 }}
	                              transition={{ ...springConfig, delay: 0.2 + index * 0.04 }}
	                              whileTap={{ scale: 0.96 }}
	                              whileHover={{ scale: 1.02, y: -2 }}
	                            >
	                              <div className={`absolute inset-0 ${HOME_OVERLAY_GRADIENT_CLASS}`} />
	                              <div className="relative flex h-full flex-col justify-end">
	                                <h3 className={`${HOME_CARD_TITLE_CLASS} line-clamp-2 text-[14px] leading-tight`} style={{ fontWeight: 850 }}>{shortcut.label}</h3>
	                                <p className={`${HOME_CARD_META_CLASS} mt-1 line-clamp-2 text-[11px]`} style={{ fontWeight: 650 }}>{shortcut.description}</p>
	                              </div>
	                            </motion.button>
	                          ))}
                        </div>
                      </div>
                    )}

	                    {/* ── Tonight's Events ── */}
	                    <div className="mb-6">
	                      <div className="mb-3 flex items-center justify-between">
	                        <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>What's Happening Tonight</h2>
	                        <span className="text-[11px] text-white/40">{userCity}</span>
	                      </div>
	                      <div className={HOME_CAROUSEL_CLASS}>
	                        {eventsFeed.map((evt: AppEvent, i: number) => (
	                          <motion.button
	                            key={evt.id}
	                            type="button"
	                            className={`${HOME_FEATURE_CARD_CLASS} border border-white/10`}
	                            style={HOME_FEATURE_CARD_STYLE}
	                            onClick={() => handleCategoryClick('entertainment', 'Events')}
	                            initial={{ opacity: 0, y: 12 }}
	                            animate={{ opacity: 1, y: 0 }}
	                            transition={{ delay: 0.1 + i * 0.05 }}
	                            whileTap={{ scale: 0.96 }}
	                          >
	                            <div className="relative h-[70px] overflow-hidden">
	                              <img src={evt.image} alt={evt.title} className="w-full h-full object-cover" />
		                              <div className={`absolute inset-0 ${HOME_OVERLAY_GRADIENT_CLASS}`} />
	                              <div className="absolute inset-x-0 top-0 h-px bg-white/35" />
	                              <span className="absolute top-2 left-2 text-[18px]">{evt.emoji}</span>
	                              <span className="absolute bottom-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/20">
	                                {evt.price}
	                              </span>
	                            </div>
		                            <div className={`p-2.5 ${HOME_OVERLAY_GRADIENT_CLASS}`}>
                              <p className="text-[13px] text-white font-semibold leading-tight line-clamp-2 min-h-[32px] drop-shadow-sm shadow-black">{evt.title}</p>
                              <p className="text-[11px] text-white mt-0.5 truncate drop-shadow-sm shadow-black">{evt.venue}</p>
	                              <div className="flex items-center gap-1.5 mt-1">
		                                <p className="text-[11px] text-white font-semibold drop-shadow-sm shadow-black">{evt.time}</p>
	                                {evt.price && evt.price !== 'Free' ? (
	                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/40 text-amber-300 text-[10px]" style={{ fontWeight: 700 }}>{evt.price}</span>
	                                ) : (
	                                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-[10px]" style={{ fontWeight: 700 }}>FREE</span>
	                                )}
	                              </div>
	                            </div>
	                          </motion.button>
	                        ))}
	                      </div>
	                    </div>

                    {/* ── Right Now in [City] ── Live Crowd Feed */}
				                    {apiVenues.filter(v => v.crowd).length > 0 && (
				                      <div className="mb-6">
                        <div className="mb-3 flex items-center justify-between">
				                          <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>Right Now in {userCity}</h2>
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[11px] text-green-300" style={{ fontWeight: 600 }}>Live</span>
                          </div>
                        </div>
				                        <div className={HOME_CAROUSEL_CLASS}>
                          {[...apiVenues]
                            .filter(v => v.crowd)
                            .sort((a, b) => (b.crowd?.level ?? 0) - (a.crowd?.level ?? 0))
                            .slice(0, 8)
                            .map((v, i) => {
                              const lvl = v.crowd!.level;
                              const label = v.crowd!.label;
                              const wait = v.crowd!.waitMins;
                              const accentColor =
                                lvl === 4 ? '#ef4444' :
                                lvl === 3 ? '#f97316' :
                                lvl === 2 ? '#eab308' : '#10b981';
                              const pillBg =
                                lvl === 4 ? 'bg-red-500/30 border-red-400/50 text-red-300' :
                                lvl === 3 ? 'bg-orange-500/30 border-orange-400/50 text-orange-300' :
                                lvl === 2 ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-300' :
                                            'bg-green-500/30 border-green-400/50 text-green-300';
                              const emoji = lvl === 4 ? '🔴' : lvl === 3 ? '🟠' : lvl === 2 ? '🟡' : '🟢';
                              const catEmoji: Record<string, string> = {
                                restaurant: '🍽️', bar: '🍸', coffee: '☕', nightlife: '🎶',
                                shopping: '🛍️', fitness: '💪', entertainment: '🎭', park: '🌳',
                              };
                              const icon = catEmoji[v.category] || '📍';
                              return (
                                <motion.button
                                  key={v.id}
                                  onClick={() => setSelectedSearchVenue(v)}
				                                  className={`${HOME_FEATURE_CARD_CLASS} border border-white/10`}
				                                  style={HOME_FEATURE_CARD_STYLE}
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ ...springConfig, delay: 0.3 + i * 0.04 }}
                                  whileTap={{ scale: 0.96 }}
                                  whileHover={{ scale: 1.02, y: -2 }}
                                >
                                  {/* Color accent bar */}
                                  <div className="h-[3px]" style={{ background: accentColor }} />
		                                  <div className={`flex h-[137px] flex-col p-3 ${HOME_OVERLAY_GRADIENT_CLASS}`}>
	                                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-xl ring-1 ring-white/15">{icon}</div>
		                                    <h3 className="text-white text-[13px] leading-tight mb-2 line-clamp-2 min-h-[32px] drop-shadow-sm shadow-black" style={{ fontWeight: 600 }}>{v.name}</h3>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${pillBg}`} style={{ fontWeight: 700 }}>
                                        {emoji} {label}
                                      </div>
                                      {/* Entry type badge */}
                                      {(v as any).entryType === 'paid' ? (
                                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/40 text-amber-300 text-[10px]" style={{ fontWeight: 700 }}>{(v as any).entryPrice || 'Paid'}</span>
                                      ) : (v as any).entryType === 'free' ? (
                                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-[10px]" style={{ fontWeight: 700 }}>FREE</span>
                                      ) : null}
                                    </div>
                                    {wait ? (
		                                      <p className="text-white text-[11px] mt-auto pt-1 drop-shadow-sm shadow-black">~{wait}m wait</p>
                                    ) : null}
                                  </div>
                                </motion.button>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* ── 🔥 Trending Now ── Always visible: check-in velocity or top crowd venues */}
                    {(() => {
                      const trendingMap = getTrendingVenueIds();
                      const catEmoji: Record<string, string> = {
                        restaurant: '🍽️', bar: '🍸', coffee: '☕', nightlife: '🎶',
                        shopping: '🛍️', fitness: '💪', entertainment: '🎭', park: '🌳',
                      };
                      // Primary: local check-in velocity; Fallback: API venues sorted by crowd level
                      let trendingVenues: typeof apiVenues = [];
                      let byCheckins = false;
                      if (trendingMap.size > 0) {
                        trendingVenues = apiVenues
                          .filter(v => trendingMap.has(v.id || v.name))
                          .sort((a, b) => (trendingMap.get(b.id || b.name) ?? 0) - (trendingMap.get(a.id || a.name) ?? 0))
                          .slice(0, 8);
                        byCheckins = true;
                      }
                      if (trendingVenues.length === 0 && apiVenues.length > 0) {
                        // fallback: top venues by live crowd level (Busy/Packed first)
                        trendingVenues = [...apiVenues]
                          .sort((a, b) => (b.crowd?.level ?? 0) - (a.crowd?.level ?? 0))
                          .slice(0, 8);
                      }
                      if (trendingVenues.length === 0) return null;
                      return (
				                        <div className="mb-6">
                          <div className="mb-3 flex items-center justify-between">
				                            <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>🔥 Trending Now</h2>
                            <span className="text-[11px] text-orange-300/80" style={{ fontWeight: 600 }}>
                              {byCheckins ? 'By check-ins' : 'Typical occupancy'}
                            </span>
                          </div>
				                          <div className={HOME_CAROUSEL_CLASS}>
                            {trendingVenues.map((v, i) => {
                              const count = trendingMap.get(v.id || v.name) ?? 0;
                              const icon = catEmoji[v.category] || '📍';
                              const crowdLevel = v.crowd?.level ?? 0;
                              const crowdLabel = v.crowd?.label ?? '';
                              const crowdColor = crowdLevel >= 4 ? 'bg-red-500/20 border-red-400/40 text-red-300'
                                : crowdLevel >= 3 ? 'bg-orange-500/20 border-orange-400/40 text-orange-300'
                                : 'bg-orange-500/20 border-orange-400/40 text-orange-300';
                              return (
                                <motion.button
                                  key={v.id}
                                  onClick={() => setSelectedSearchVenue(v)}
				                                  className={`${HOME_FEATURE_CARD_CLASS} border border-orange-500/20`}
				                                  style={HOME_FEATURE_CARD_STYLE}
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ ...springConfig, delay: 0.3 + i * 0.04 }}
                                  whileTap={{ scale: 0.96 }}
                                  whileHover={{ scale: 1.02, y: -2 }}
                                >
                                  <div className="h-[3px] bg-gradient-to-r from-orange-500 to-red-500" />
		                                  <div className={`flex h-[137px] flex-col p-3 ${HOME_OVERLAY_GRADIENT_CLASS}`}>
	                                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] bg-orange-500/15 text-xl ring-1 ring-orange-300/20">{icon}</div>
		                                    <h3 className="text-white text-[13px] leading-tight mb-2 line-clamp-2 min-h-[32px] drop-shadow-sm shadow-black" style={{ fontWeight: 600 }}>{v.name}</h3>
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${crowdColor}`} style={{ fontWeight: 700 }}>
                                      {byCheckins ? `🔥 ${count} check-in${count !== 1 ? 's' : ''}` : (crowdLabel ? `🔴 ${crowdLabel}` : '🔥 Trending')}
                                    </div>
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Category Quick Search - Personalized */}
				                    <div className="mb-6">
                      <div className="mb-4 flex items-center justify-between">
				                        <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>
                          {getContextualPrompt()}
                        </h2>
                        {personalizedCategories.some(c => c.reason !== 'trending') && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#A855F7]/20 border border-[#A855F7]/30">
                            <Sparkles className="w-3 h-3 text-[#A855F7]" strokeWidth={2.5} />
                            <span className="text-[11px] text-[#E9D5FF]" style={{ fontWeight: 600 }}>
                              For You
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                        {(personalizedCategories.length > 0 ? personalizedCategories : [
                          { label: 'Coffee', category: 'coffee', priority: 0, reason: 'trending' as const },
                          { label: 'Dining', category: 'dining', priority: 0, reason: 'trending' as const },
                          { label: 'Shopping', category: 'shopping', priority: 0, reason: 'trending' as const },
                          { label: 'Nightlife', category: 'nightlife', priority: 0, reason: 'trending' as const },
                          { label: 'Fitness', category: 'fitness', priority: 0, reason: 'trending' as const },
                          { label: 'Events', category: 'entertainment', priority: 0, reason: 'trending' as const },
                        ]).map((item, index) => {
                          const isPersonalized = item.reason === 'preference' || item.reason === 'behavior';
                          const isTimeRelevant = item.reason === 'time';
                          
                          return (
                            <motion.button
                              key={item.category}
                              onClick={() => handleCategoryClick(item.category, item.label)}
                              className={`flex-shrink-0 px-4 py-2.5 rounded-full border-2 shadow-lg relative ${
                                isPersonalized 
                                  ? 'border-[#A855F7]/50 bg-gradient-to-br from-[#A855F7]/30 to-[#D946EF]/20 backdrop-blur-xl' 
                                  : isTimeRelevant
                                  ? 'border-[#FF00FF]/50 bg-gradient-to-br from-[#FF00FF]/30 to-[#D946EF]/20 backdrop-blur-xl'
                                  : 'border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl'
                              }`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ ...springConfig, delay: 0.5 + index * 0.05 }}
                              whileTap={{ scale: 0.95 }}
                              whileHover={{ scale: 1.02 }}
                            >
                              {isPersonalized && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#A855F7] border-2 border-[#000000]" />
                              )}
                              {isTimeRelevant && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF00FF] border-2 border-[#000000]" />
                              )}
                              <span className={`text-[14px] whitespace-nowrap ${
                                isPersonalized ? 'text-[#E9D5FF]' : isTimeRelevant ? 'text-[#FCE7F3]' : 'text-white'
                              }`} style={{ fontWeight: 600 }}>
                                {item.label}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Nearby Section - Personalized */}
				                    <div>
                      <div className="mb-4 flex items-center justify-between">
				                        <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>
                          Nearby
                        </h2>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-[11px] text-green-300" style={{ fontWeight: 600 }}>
                            Live
                          </span>
                        </div>
                      </div>
                      
				                      <div className={HOME_CAROUSEL_CLASS}>
                        {(personalizedLocations.length > 0 ? personalizedLocations :
                          apiVenues.length > 0
                            ? apiVenues.slice(0, 3).map((v, i) => ({
                                name: v.name,
                                distance: ((i + 1) * 0.2).toFixed(1),
                                spots: v.parking?.totalAvailable ?? 0,
                                available: (v.parking?.totalAvailable ?? 0) > 0,
                                type: 'venue' as const,
                                rating: 4.5,
                                priority: 0,
                                crowd: v.crowd,
                              }))
                            : [
                                { name: 'Colony Square Garage', distance: '0.2', spots: 14, available: true, priority: 0, crowd: { level: 2, label: 'Active', updatedAt: new Date().toISOString(), waitMins: 5 } },
                                { name: '1380 W Peachtree Garage', distance: '0.4', spots: 22, available: true, priority: 0, crowd: { level: 1, label: 'Chill', updatedAt: new Date().toISOString(), waitMins: 0 } },
                                { name: 'Promenade Midtown Parking', distance: '0.6', spots: 38, available: true, priority: 0, crowd: { level: 3, label: 'Busy', updatedAt: new Date().toISOString(), waitMins: 8 } },
                              ]
                        ).map((location, index) => (
                          <motion.button
                            key={location.name}
                            onClick={() => handleNearbyLocationClick(location.name)}
				                            className={`${HOME_FEATURE_CARD_CLASS} border border-white/15 p-3 bg-[#15151A]/90 backdrop-blur-xl relative`}
				                            style={HOME_FEATURE_CARD_STYLE}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springConfig, delay: 0.45 + index * 0.05 }}
                            whileTap={{ scale: 0.98 }}
                            whileHover={{ scale: 1.005, y: -2 }}
                          >
				                            <div className="absolute inset-x-3 top-0 h-px bg-cyan-200/30" />
				                            <div className="flex h-full flex-col justify-between text-left">
				                              <div className="flex items-start justify-between gap-2">
				                                <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-[#00BFFF]/70 to-[#A855F7]/70 border border-white/25 flex items-center justify-center shadow-lg shadow-cyan-500/15 ring-1 ring-white/10">
				                                  <MapPin className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
				                                </div>
				                                {location.priority > 15 && (
				                                  <Sparkles className="w-3.5 h-3.5 text-[#A855F7] flex-shrink-0" strokeWidth={2.5} />
				                                )}
				                              </div>

				                              <div>
				                                <h3 className="text-[13px] leading-tight text-white line-clamp-2 min-h-[32px]" style={{ fontWeight: 650 }}>
				                                  {location.name}
				                                </h3>
				                                <p className="text-[11px] text-white/55 mt-1" style={{ fontWeight: 500 }}>
				                                  {location.distance} mi nearby
				                                </p>
				                              </div>

				                              <div className="flex flex-wrap gap-1.5">
				                                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${(location.spots ?? 0) > 20 ? 'bg-green-500/20 border-green-400/35 text-green-300' : (location.spots ?? 0) > 10 ? 'bg-yellow-500/20 border-yellow-400/35 text-yellow-300' : 'bg-orange-500/20 border-orange-400/35 text-orange-300'}`} style={{ fontWeight: 700 }}>
				                                  {location.spots ?? 0} spots
				                                </span>
				                                {(location as any).crowd && (
				                                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
				                                    (location as any).crowd.label === 'Chill'  ? 'bg-green-500/20 border-green-400/35 text-green-300' :
				                                    (location as any).crowd.label === 'Active' ? 'bg-yellow-500/20 border-yellow-400/35 text-yellow-300' :
				                                    (location as any).crowd.label === 'Busy'   ? 'bg-orange-500/20 border-orange-400/35 text-orange-300' :
				                                    'bg-red-500/20 border-red-400/35 text-red-300'
				                                  }`} style={{ fontWeight: 700 }}>
				                                    {(location as any).crowd.label === 'Chill'  ? '🟢' :
				                                     (location as any).crowd.label === 'Active' ? '🟡' :
				                                     (location as any).crowd.label === 'Busy'   ? '🟠' : '🔴'} {(location as any).crowd.label}
				                                  </span>
				                                )}
				                              </div>
				                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'discover' && (
              <motion.div
                key="discover"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-0 left-0 right-0 bottom-0 overflow-y-auto"
                onScroll={handleScroll}
              >
                <ErrorBoundary onReset={() => setActiveTab('home')} showHomeButton>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
                  <DiscoverSection
                    isDarkMode={isDarkMode}
                    onOpenAccessWallet={openAccessWallet}
                    onNavigateToMap={(venueName) => {
                      if (venueName) {
                        setSelectedDestination(venueName);
                        setSelectedMapFunction('route');
                        toast.success('Navigation', {
                          description: `Setting route to ${venueName}`,
                          duration: 2000,
                        });
                      }
                      setActiveTab('map');
                    }}
                    onShowBottomNav={() => setShowBottomNav(true)}
                    onTouch={handleDiscoverTouch}
                    initialFilter={discoverFilter}
	                    apiCards={discoverCardsWithSavedRequests}
                    events={eventsFeed}
                    loading={venuesLoading}
                    eventsLoading={eventsLoading}
                    error={venuesError}
                    refresh={refreshVenues}
                    refreshEvents={refreshEvents}
                    searchPlaces={searchPlaces}
                    searchNearby={searchNearby}
                    placesLoading={placesLoading}
                    onBookRide={(v) => {
                      if (v) setRideDestination(v);
                      setShowRideSelection(true);
                    }}
                  />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            )}

            {activeTab === 'map' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
                onClick={() => {
                  if (navHideTimerRef.current) clearTimeout(navHideTimerRef.current);
                  if (!showBottomNav) {
                    // Nav hidden — tap to show briefly then re-hide
                    setShowBottomNav(true);
                    navHideTimerRef.current = setTimeout(() => setShowBottomNav(false), 2000);
                  } else {
                    // Nav visible — tap to hide immediately
                    setShowBottomNav(false);
                  }
                }}
              >
                <ErrorBoundary onReset={() => setActiveTab('home')} showHomeButton>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
                  <MapSection
                    isDarkMode={isDarkMode}
                    selectedFunction={selectedMapFunction}
                    viewMode={mapViewMode}
                    destination={selectedDestination}
                    isRideBookingOpen={showRideSelection || Boolean(valetServiceFromRide)}
                    userCoords={activeCoords}
                    onOpenAccessWallet={openAccessWallet}
                    onAuditEvent={emitAuditEvent}
                    pendingPatchScan={pendingPatchScan}
                    onPendingPatchScanConsumed={consumePendingPatchScan}
                    requestServiceLocation={requestMapServiceLocation}
                    onServiceLocationRequestConsumed={() => setRequestMapServiceLocation(false)}
                    onOpenConciergeRequest={(prefill) => {
                      setConciergePrefill(prefill);
                      setActiveTab('concierge');
                    }}
                    onBackToHome={() => {
                      setActiveTab('home');
                      setSelectedDestination(undefined);
                      setSelectedMapFunction(undefined);
                    }}
                    onBookRide={(v) => {
                      if (v) setRideDestination(v);
                      setShowRideSelection(true);
                    }}
                  />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            )}

            {activeTab === 'concierge' && (
              <motion.div
                key="concierge"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                <HomeConcierge
                  tabMode
                  venues={apiVenues as any[]}
                  cityName={userCity}
                  onVenueSelect={(v) => {
                    setSelectedSearchVenue(v);
                    setActiveTab('home');
                  }}
                  onOpenDiscover={() => setActiveTab('discover')}
                  onShowMap={() => setActiveTab('map')}
                  onStartBooking={() => setActiveTab('discover')}
                  initialPrompt={conciergePrefill}
                />
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-0 left-0 right-0 bottom-0 overflow-y-auto"
              >
                <ErrorBoundary onReset={() => setActiveTab('home')} showHomeButton>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
                    <ProfileSection
                      isDarkMode={isDarkMode}
                      onOpenVirtualPatch={openVirtualPatchFromWallet}
                      onLogout={() => {
                        localStorage.removeItem('bytspot_auth_token');
                        localStorage.removeItem('bytspot_user');
                        localStorage.removeItem('bytspot_user_name');
                        setCurrentScreen('auth');
                        setActiveTab('home');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            )}


          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isDarkMode={isDarkMode}
          onMapButtonClick={() => setShowMapMenu(true)}
          isVisible={showBottomNav}
        />

        <AnimatePresence>
          {guestSavePrompt && (
            <motion.div
              className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 px-4 pb-[calc(1rem+var(--safe-area-bottom,0px))] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGuestSavePrompt(null)}
            >
              <motion.div
                className="w-full max-w-[420px] rounded-[28px] border border-white/15 bg-[linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96)_55%,rgba(8,47,73,0.86))] p-5 text-center text-white shadow-[0_24px_70px_rgba(0,0,0,0.48)]"
                initial={{ y: 30, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 30, scale: 0.98 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-2xl">💾</div>
                <h3 className="text-[22px] leading-7" style={{ fontWeight: 900 }}>{guestSavePrompt.title}</h3>
                <p className="mx-auto mt-2 max-w-[310px] text-[14px] leading-5 text-white/62" style={{ fontWeight: 650 }}>{guestSavePrompt.subtitle}</p>
                <div className="mt-5 grid gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setGuestSavePrompt(null); setCurrentScreen('auth'); }}
                    className="rounded-[17px] bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-3.5 text-[15px] text-black"
                    style={{ fontWeight: 900 }}
                  >
                    {guestSavePrompt.cta ?? 'Sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuestSavePrompt(null)}
                    className="rounded-[17px] border border-white/12 bg-white/[0.055] px-4 py-3 text-[14px] text-white/70"
                    style={{ fontWeight: 800 }}
                  >
                    Not now
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Secondary Map Tools sheet: the Map tab itself opens the map directly. */}
        <MapMenuSlideUp
          isOpen={showMapMenu}
          onClose={() => setShowMapMenu(false)}
          onSelectFunction={(func) => {
            setSelectedMapFunction(func);
            setActiveTab('map');
          }}
          onViewModeChange={(mode) => setMapViewMode(mode)}
          onSearchPress={() => {
            setActiveTab('map');
            setSelectedDestination(undefined);
          }}
          onServiceLocationPress={() => {
            setActiveTab('map');
            setRequestMapServiceLocation(true);
          }}
          currentViewMode={mapViewMode}
          isDarkMode={isDarkMode}
        />

        {/* Search Venue Detail Sheet */}
        <AnimatePresence>
          {selectedSearchVenue && (
            <VenueDetails
              venue={selectedSearchVenue}
              onClose={() => setSelectedSearchVenue(null)}
              onOpenAccessWallet={() => {
                setSelectedSearchVenue(null);
                openAccessWallet();
              }}
              onNavigateToMap={() => {
                const venueName = selectedSearchVenue?.name || 'Destination';
                setSelectedDestination(venueName);
                setSelectedMapFunction('route');
                setActiveTab('map');
                setSelectedSearchVenue(null);
                toast.success('Navigation', {
                  description: `Setting route to ${venueName}`,
                  duration: 2000,
                });
              }}
              onBookRide={() => {
                setRideDestination({
                  name: selectedSearchVenue?.name || 'Destination',
                  lat: selectedSearchVenue?._lat ?? selectedSearchVenue?.lat,
                  lng: selectedSearchVenue?._lng ?? selectedSearchVenue?.lng,
                });
                setShowRideSelection(true);
              }}
              isDarkMode={isDarkMode}
            />
          )}
        </AnimatePresence>

        {/* Toast Notifications - ACCESSIBILITY: Screen reader announcements */}
        <Toaster position="top-center" />

        {/* Ride Selection Modal */}
        <Suspense fallback={null}>
        <RideSelection
          isOpen={showRideSelection}
          onClose={() => { setShowRideSelection(false); setRideDestination(undefined); }}
          showValetOption={!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET}
          onSelectValet={APPLE_REVIEW_HIDE_PROVIDER_AND_VALET ? undefined : () => {
            const dest = rideDestination;
            setValetServiceFromRide({
              id: `valet-${Date.now()}`,
              name: dest?.name ? `${dest.name} Valet` : 'Premium Valet',
              photo: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400',
              rating: 4.8,
              totalServices: 250,
              baseRate: 25,
              responseTime: '< 5 min',
              serviceArea: dest?.name || 'Midtown Atlanta',
              certifications: ['Premium Parking', 'Insured', 'Background Checked'],
              bio: `Professional valet service for ${dest?.name || 'your destination'}.`,
            });
            setShowRideSelection(false);
          }}
          destination={rideDestination?.name}
          lat={rideDestination?.lat}
          lng={rideDestination?.lng}
          isDarkMode={isDarkMode}
        />
        </Suspense>

        {/* Valet Flow — triggered from RideSelection "Valet Service" button */}
        <AnimatePresence>
          {!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && valetServiceFromRide && (
            <Suspense fallback={null}>
              <ValetFlow
                service={valetServiceFromRide}
                isDarkMode={isDarkMode}
                onClose={() => setValetServiceFromRide(null)}
              />
            </Suspense>
          )}
        </AnimatePresence>

        {/* Feedback Button — only on Home tab */}
        {activeTab === 'home' && currentScreen === 'main' && (
          <motion.button
            className="fixed bottom-24 right-4 z-[55] w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white/30 shadow-xl flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            onClick={() => {
              window.location.href = 'mailto:bytspotapp@gmail.com?subject=Bytspot%20Feedback%20%26%20Suggestions';
            }}
            aria-label="Share feedback"
          >
            <span className="text-[20px]">💬</span>
          </motion.button>
        )}

        {/* Feedback Sheet */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div key="feedback-sheet" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1 }}>
              <motion.div
                className="fixed inset-0 z-[58] bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowFeedback(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[59] bg-[#1C1C1E] border-t-2 border-white/20 rounded-t-[24px] p-6 max-w-[430px] mx-auto"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                {feedbackSubmitted ? (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <div className="text-[48px]">🎉</div>
                    <p className="text-[20px] text-white font-semibold">Thanks for the feedback!</p>
                    <p className="text-[14px] text-white/60 text-center">You're helping shape Bytspot for {userCity} 🏙️</p>
                    <motion.button
                      className="mt-4 px-8 py-3 rounded-[14px] bg-white/10 border border-white/20 text-white text-[15px] font-semibold"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setShowFeedback(false)}
                    >Done</motion.button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-[18px] text-white font-semibold">Feedback</p>
                        <p className="text-[13px] text-white/50">How's Bytspot feeling?</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowFeedback(false)}
                        className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                        <span className="text-white/70 text-[18px]">✕</span>
                      </motion.button>
                    </div>

                    {/* Star rating */}
                    <div className="flex justify-center gap-3 mb-5">
                      {[1,2,3,4,5].map(star => (
                        <motion.button key={star} whileTap={{ scale: 0.85 }}
                          onClick={() => setFeedbackRating(star)}
                          className="text-[36px] transition-all"
                          style={{ filter: feedbackRating >= star ? 'none' : 'grayscale(1) opacity(0.35)' }}
                        >⭐</motion.button>
                      ))}
                    </div>

                    {/* Text input */}
                    <textarea
                      className="w-full rounded-[14px] bg-white/8 border border-white/20 text-white text-[14px] p-3 resize-none placeholder:text-white/40 outline-none focus:border-cyan-400/60"
                      rows={3}
                      placeholder="Anything broken? Anything you love? (optional)"
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    />

                    <motion.button
                      className="w-full mt-4 py-3.5 rounded-[16px] bg-gradient-to-r from-cyan-500 to-blue-500 border-2 border-white/20 text-white text-[16px] font-semibold disabled:opacity-40"
                      whileTap={{ scale: 0.98 }}
                      disabled={feedbackRating === 0}
                      onClick={() => {
                        const entry = { rating: feedbackRating, text: feedbackText.trim(), ts: Date.now(), version: '1.0' };
                        try {
                          const existing = JSON.parse(localStorage.getItem('bytspot_feedback') || '[]');
                          localStorage.setItem('bytspot_feedback', JSON.stringify([...existing, entry]));
                        } catch (_e) { /* ignore localStorage errors */ }
                        setFeedbackSubmitted(true);
                      }}
                    >Submit Feedback</motion.button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Onboarding Quiz ─── */}
        <AnimatePresence>
          {showOnboarding && (() => {
            type QuizOption = { label: string; value: string; recommended?: boolean };
            type QuizQuestion = { emoji: string; question: string; key: 'vibe' | 'walk' | 'group'; context?: string; options: QuizOption[] };
            const hour = new Date().getHours();
            const wet = weather.current.precipitationIn > 0 || weather.current.weatherCode >= 51;
            const uncomfortable = weather.current.temperatureF >= 88 || weather.current.temperatureF <= 42;
            const lateNight = hour >= 22 || hour < 5;
            const evening = hour >= 16;
            const sleepIntent = ['sleep', 'stay'].includes(quizSelections.vibe ?? '');
            const contextLine = wet
              ? `Rain near ${userCity} · covered arrivals, indoor rooms, and short walks first`
              : uncomfortable
                ? `${Math.round(weather.current.temperatureF)}° near ${userCity} · comfort-first stops and calm arrivals`
                : lateNight
                  ? `Late night near ${userCity} · keep going, get home, or land softly`
                  : evening
                    ? `Evening near ${userCity} · dinner, drinks, events, and easy arrivals`
                    : `Daytime near ${userCity} · coffee, food, quiet corners, and easy arrivals`;
            const intentQuestion: QuizQuestion = wet
              ? { emoji: '☔', question: 'Rain nearby — what would feel easiest?', key: 'vibe', context: contextLine,
                  options: [{ label: '☔ A dry room nearby', value: 'indoor', recommended: true }, { label: '🚗 Covered arrival', value: 'covered_parking' }, { label: '🚕 A ride instead', value: 'ride' }, { label: '🛏️ A comfortable stay', value: 'stay' }] }
              : uncomfortable
                ? { emoji: '🏠', question: "Let's keep it comfortable — what would help?", key: 'vibe', context: contextLine,
                    options: [{ label: '🏠 Somewhere comfortable', value: 'indoor', recommended: true }, { label: '🚗 Easy arrival', value: 'parking' }, { label: '☕ A quick good stop', value: 'coffee' }, { label: '🚕 A smoother ride', value: 'ride' }] }
                : lateNight
                  ? { emoji: '🌙', question: 'What would make tonight easier?', key: 'vibe', context: contextLine,
                      options: [{ label: '🍸 Keep the night going', value: 'drinks' }, { label: '🍔 Something good to eat', value: 'food' }, { label: '🛏️ A comfortable stay', value: 'sleep', recommended: true }, { label: '🚕 A smooth ride home', value: 'ride' }] }
                  : evening
                    ? { emoji: '✨', question: 'What kind of night are we shaping?', key: 'vibe', context: contextLine,
                        options: [{ label: '🍽️ Dinner with atmosphere', value: 'food' }, { label: '🍸 A good drink', value: 'drinks' }, { label: '🎶 Something happening', value: 'events' }, { label: '💕 Date-night ready', value: 'date' }] }
                    : { emoji: '☀️', question: 'What would make the next hour easier?', key: 'vibe', context: contextLine,
                        options: [{ label: '☕ A good coffee stop', value: 'coffee' }, { label: '🍔 A proper meal', value: 'food' }, { label: '💻 A quiet place to settle', value: 'work' }, { label: '🚗 Easy arrival', value: 'parking' }] };
            const mobilityQuestion: QuizQuestion = sleepIntent
              ? { emoji: '🛏️', question: 'What kind of landing feels right?', key: 'walk', options: [{ label: '🏨 Full-service hotel', value: 'hotel' }, { label: '✨ Boutique stay', value: 'boutique' }, { label: '🏢 Private suite', value: 'apartment' }, { label: '⏱️ Tonight only', value: 'short_stay' }] }
              : wet
                ? { emoji: '🗺️', question: 'How should we handle getting there?', key: 'walk', options: [{ label: '☔ Short walk only', value: 'close', recommended: true }, { label: '🚗 Covered arrival', value: 'covered' }, { label: '🚕 Ride preferred', value: 'ride' }, { label: '📍 Right nearby', value: 'closest' }] }
                : { emoji: '🗺️', question: 'How far are you comfortable going?', key: 'walk', options: [{ label: '📍 Right nearby', value: 'closest' }, { label: '🚶 A short walk', value: 'close' }, { label: '🚗 Easy arrival', value: 'parking' }, { label: '🗺️ Show me a hidden gem', value: 'far' }] };
            const preferenceQuestion: QuizQuestion = sleepIntent
              ? { emoji: '🔒', question: 'What should feel effortless?', key: 'group', options: [{ label: '📍 Right nearby', value: 'closest' }, { label: '💸 Best value', value: 'price' }, { label: '⭐ Best reviewed', value: 'rated' }, { label: '🔒 Most comfortable arrival', value: 'safe', recommended: true }] }
              : { emoji: '👥', question: "Who's coming with you?", key: 'group', options: [{ label: '🙋 Just me', value: 'solo' }, { label: '💕 Date-night ready', value: 'date' }, { label: '👥 A group', value: 'group' }, { label: '💼 Work or client', value: 'work' }] };
            const quizQuestions = [intentQuestion, mobilityQuestion, preferenceQuestion];
            const total = quizQuestions.length;
            const isConfirmation = quizStep === total;
            const q = isConfirmation ? null : quizQuestions[quizStep];
            const isLast = quizStep === total - 1;
            const dismiss = (final?: typeof quizSelections) => {
              const answers = final ?? quizSelections;
              localStorage.setItem('bytspot_intro_seen', 'true');
              localStorage.setItem('bytspot_quiz_answers', JSON.stringify(answers));
              const vibeToInterests: Record<string, string[]> = { drinks: ['bars','nightlife','cocktails'], coffee: ['coffee','cafes','brunch'], food: ['dining','restaurants','food'], fitness: ['fitness','gym','wellness'], work: ['coworking','cafes','quiet'], parking: ['parking','quick walk'], events: ['events','music','entertainment'], date: ['date night','romantic'], indoor: ['indoor','weather safe'], covered_parking: ['covered parking','parking'], ride: ['rideshare','transit'], sleep: ['hotel','stay nearby','overnight'], stay: ['hotel','stay nearby','overnight'] };
              const walkToInterests: Record<string, string[]> = { close: ['nearby', 'quick walk'], medium: ['walkable'], far: ['explore'], parking: ['parking nearby'], covered: ['covered parking'], ride: ['ride preferred'], closest: ['closest'], hotel: ['hotel'], boutique: ['boutique hotel'], apartment: ['apartment stay'], short_stay: ['short stay'] };
              const interests = [...(answers.vibe ? vibeToInterests[answers.vibe] ?? [] : []), ...(answers.walk ? walkToInterests[answers.walk] ?? [] : []), ...(answers.group === 'date' ? ['date night','romantic'] : []), ...(answers.group === 'group' ? ['group','nightlife'] : []), ...(answers.group === 'work' ? ['work friendly','client meeting'] : []), ...(answers.group === 'safe' ? ['safest area'] : [])];
              saveUserPreferences({
                interests,
                vibePreferences: answers.vibe ? { selectedVibes: [answers.vibe] } : undefined,
                discoveryPreferences: {
                  walkPreference: answers.walk as 'close' | 'medium' | 'far' | undefined,
                  groupPreference: answers.group as 'solo' | 'date' | 'group' | undefined,
                },
              });
              setShowOnboarding(false); setQuizStep(0);
              if ('Notification' in window && Notification.permission === 'default') setTimeout(() => setShowNotifPrompt(true), 600);
            };
            // Top-3 venue picks for confirmation screen
            const picks = (() => {
              if (!isConfirmation || !apiVenues?.length) return [];
              const vibeMap: Record<string, string[]> = { drinks: ['bar','nightlife','cocktail'], coffee: ['coffee','cafe'], food: ['restaurant','dining','late'], fitness: ['fitness','gym'], work: ['cafe','coworking'], parking: ['parking'], events: ['event','music','entertainment'], date: ['restaurant','dining','cocktail'], indoor: ['restaurant','cafe','indoor'], covered_parking: ['parking'], ride: ['ride','transport'], sleep: ['hotel','stay'], stay: ['hotel','stay'] };
              const preferred = vibeMap[quizSelections.vibe ?? ''] ?? [];
              return [...apiVenues].map(v => {
                const match = preferred.some(c => (v.category ?? '').toLowerCase().includes(c));
                const lvl = v.crowd?.level ?? 2;
                let score = match ? 3 : 0;
                if (quizSelections.group === 'date') score += lvl <= 2 ? 1 : -1;
                else if (quizSelections.group === 'group') score += lvl >= 3 ? 1 : 0;
                if (lvl >= 4) score -= 1;
                return { v, score };
              }).sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.v);
            })();
            const persistOnboardingPreview = () => {
              if (!picks.length) return;
              localStorage.setItem(LAUNCH_PREVIEW_STORAGE_KEY, JSON.stringify({
                savedAt: new Date().toISOString(),
                userCity,
                context: contextLine,
                answers: quizSelections,
                picks: picks.map(v => ({ id: v.id, name: v.name, address: v.address, category: v.category, crowd: v.crowd ? { level: v.crowd.level, label: v.crowd.label } : undefined }))
              }));
              setLaunchPreviewVersion(version => version + 1);
            };
            const exploreOnboardingPicks = () => {
              persistOnboardingPreview();
              setSelectedDestination(undefined);
              setSelectedMapFunction(undefined);
              setDiscoverFilter(undefined);
              setShowMapMenu(false);
              setCurrentScreen('main');
              setActiveTab('home');
              dismiss();
            };
            // Animated SVG ring
            const ringR = 18; const ringC = 2 * Math.PI * ringR;
            const ringFill = isConfirmation ? 1 : (quizStep + 1) / total;
            return (
              <motion.div key="parker-intro-quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-end justify-center"
                style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
                <motion.div key={quizStep} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className="w-full max-w-md mx-auto mb-10 rounded-[28px] p-8 flex flex-col gap-5"
                  style={{ background: 'rgba(28,28,30,0.98)', border: '1px solid rgba(255,255,255,0.12)' }}>

                  {/* ── Header: progress ring + skip ── */}
                  <div className="flex items-center justify-between">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r={ringR} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <g transform="rotate(-90 24 24)">
                        <motion.circle cx="24" cy="24" r={ringR} fill="none" stroke="#00BFFF" strokeWidth="3"
                          strokeLinecap="round" strokeDasharray={ringC}
                          animate={{ strokeDashoffset: ringC * (1 - ringFill) }}
                          initial={{ strokeDashoffset: ringC }}
                          transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                      </g>
                      {!isConfirmation
                        ? <text x="24" y="28" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">{quizStep + 1}/{total}</text>
                        : <text x="24" y="29" textAnchor="middle" fill="#00BFFF" fontSize="15" fontWeight="700">✓</text>}
                    </svg>
                    {!isConfirmation && (
                      <button className="text-[13px] px-3 py-1 rounded-full"
                        style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 500 }}
                        onClick={() => dismiss()}>Skip</button>
                    )}
                  </div>

                  {isConfirmation ? (
                    /* ── Confirmation: Value-first picks preview ── */
                    <>
                      <div className="text-center">
                        <div className="text-4xl mb-2">🗺️</div>
                        <h2 className="text-[22px] text-white leading-snug" style={{ fontWeight: 700 }}>Recommended for you</h2>
                        <p className="text-[14px] mt-1" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Based on your vibe, location, and local conditions near {userCity}</p>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {picks.length > 0 ? picks.map((venue, i) => {
                          const lvl = venue.crowd?.level ?? 2;
                          const crowdColor = lvl === 4 ? '#ef4444' : lvl === 3 ? '#f97316' : lvl === 2 ? '#22c55e' : '#60a5fa';
                          return (
                            <div key={venue.id} className="flex items-center gap-3 p-3 rounded-[16px]"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <span className="text-xl">{['🥇','🥈','🥉'][i]}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] text-white truncate" style={{ fontWeight: 600 }}>{venue.name}</p>
                                <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{venue.address}</p>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: `${crowdColor}22`, color: crowdColor, border: `1px solid ${crowdColor}44`, fontWeight: 600 }}>
                                {venue.crowd?.label ?? '—'}
                              </span>
                            </div>
                          );
                        }) : <p className="text-[14px] text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>Discovering spots for you…</p>}
                      </div>
                      <p className="text-center text-[12px] leading-[17px]" style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 600 }}>
                        Explore now. Sign in anytime to save favorites and sync your picks.
                      </p>
                      <motion.button className="w-full rounded-[18px] py-4 text-[16px] text-black"
                        style={{ background: 'linear-gradient(135deg,#00BFFF,#7c3aed)', fontWeight: 700 }}
                        whileTap={{ scale: 0.97 }} onClick={exploreOnboardingPicks}>
                        Explore These Spots
                      </motion.button>
                      {!hasAuthenticatedConsumerSession() && (
                        <motion.button className="w-full rounded-[16px] py-3 text-[14px] text-cyan-200"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(34,211,238,0.28)', fontWeight: 700 }}
                          whileTap={{ scale: 0.97 }} onClick={() => { persistOnboardingPreview(); dismiss(); setCurrentScreen('auth'); }}>
                          Sign in to save picks
                        </motion.button>
                      )}
                    </>
                  ) : (
                    /* ── Quiz slide ── */
                    <>
                      <div className="text-5xl text-center">{q!.emoji}</div>
                      {q!.context && (
                        <p className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-center text-[11px] text-cyan-100/80" style={{ fontWeight: 650 }}>
                          {q!.context}
                        </p>
                      )}
                      <h2 className="text-[22px] text-white text-center leading-snug" style={{ fontWeight: 700 }}>{q!.question}</h2>
                      <div className="grid grid-cols-2 gap-3">
                        {q!.options.map((opt) => {
                          const selected = quizSelections[q!.key] === opt.value;
                          return (
                            <motion.button key={opt.value} className="py-3.5 px-4 rounded-[16px] text-[15px] text-white border-2 transition-all"
                              style={{ background: selected ? 'rgba(0,191,255,0.18)' : 'rgba(255,255,255,0.06)', border: selected ? '2px solid #00BFFF' : '2px solid rgba(255,255,255,0.12)', fontWeight: selected ? 700 : 500 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => {
                                const updated = { ...quizSelections, [q!.key]: opt.value };
                                setQuizSelections(updated);
                                if (isLast) { setTimeout(() => setQuizStep(total), 300); }
                                else { setTimeout(() => setQuizStep(s => s + 1), 300); }
                              }}>
                              {opt.label}
                              {opt.recommended && <span className="mt-1 block text-[10px] text-cyan-200/75">Recommended</span>}
                            </motion.button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* ─── Notification Permission Prompt ─── */}
        <AnimatePresence>
          {showNotifPrompt && (
            <motion.div
              key="notif-prompt"
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed bottom-24 left-4 right-4 z-[9998] rounded-[24px] p-5 flex flex-col gap-3"
              style={{ background: 'rgba(28,28,30,0.98)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#00BFFF,#7c3aed)' }}>🔔</div>
                <div>
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Crowd Alerts</p>
                  <p className="text-[13px] text-white/50">Get notified when spots hit Packed</p>
                </div>
                <button className="ml-auto text-white/30 text-lg" onClick={() => setShowNotifPrompt(false)}>✕</button>
              </div>
              <div className="flex gap-2">
                <motion.button
                  className="flex-1 rounded-[14px] py-3 text-[14px] text-white/60 border border-white/20"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowNotifPrompt(false)}
                >
                  Not now
                </motion.button>
                <motion.button
                  className="flex-1 rounded-[14px] py-3 text-[14px] text-black"
                  style={{ background: 'linear-gradient(135deg,#00BFFF,#7c3aed)', fontWeight: 700 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setShowNotifPrompt(false);
                    subscribeToPush().then((ok) => {
                      if (ok) toast.success('Crowd alerts enabled 🔔', { description: "We'll notify you when spots hit Packed" });
                    });
                  }}
                >
                  Enable Alerts
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
