import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Star, Navigation, Sparkles, Sun, Mic, Menu, Heart, Wind } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { QuickActionCard } from './components/QuickActionCard';
import { BottomNav } from './components/BottomNav';
import { SplashScreen } from './components/SplashScreen';
import { LandingPage } from './components/LandingPage';
import { EnhancedHeader } from './components/EnhancedHeader';
import { SmartSearchBar } from './components/SmartSearchBar';
const DiscoverSection = lazy(() => import('./components/DiscoverSection').then(m => ({ default: m.DiscoverSection })));
const MapSection = lazy(() => import('./components/MapSection').then(m => ({ default: m.MapSection })));
const AuthenticationFlow = lazy(() => import('./components/AuthenticationFlow').then(m => ({ default: m.AuthenticationFlow })));
const RideSelection = lazy(() => import('./components/RideSelection').then(m => ({ default: m.RideSelection })));
const ProfileSection = lazy(() => import('./components/ProfileSection').then(m => ({ default: m.ProfileSection })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./components/TermsOfService').then(m => ({ default: m.TermsOfService })));
const Disclaimer = lazy(() => import('./components/Disclaimer').then(m => ({ default: m.Disclaimer })));
const HostApp = lazy(() => import('./components/host/HostApp').then(m => ({ default: m.HostApp })));
const ValetApp = lazy(() => import('./components/valet/ValetApp').then(m => ({ default: m.ValetApp })));
const ValetFlow = lazy(() => import('./components/ValetFlow').then(m => ({ default: m.ValetFlow })));
import { MapMenuSlideUp, type MapFunction, type MapViewMode } from './components/MapMenuSlideUp';
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
import type { VirtualPatchAuditEvent } from './utils/virtualPatch';
import { classifySearchQuery, isNearbyQuery } from './utils/searchClassifier';
import { getSavedSpots } from './utils/savedSpots';
import { getTrendingVenueIds } from './utils/venueHours';
import { getSocialFeed } from './utils/social';
import { ensurePushSubscribed, subscribeToPush } from './utils/pushSubscription';
import { getCachedEvents, getEventsAsync, type AppEvent } from './utils/events';
import { syncInsiderMembershipFromPremium } from './utils/insiderCommerce';
import { finalizePendingParkingCheckout } from './utils/parkingReservations';
import { APPLE_REVIEW_HIDE_INSIDER_PREMIUM, APPLE_REVIEW_HIDE_INTERNAL_ROUTES, APPLE_REVIEW_HIDE_PROVIDER_AND_VALET } from './utils/reviewBuild';

import {
  getPersonalizedCategories,
  getPersonalizedNearbyLocations,
  trackCategoryClick,
  trackLocationVisit,
  getUserPreferences,
  getUserBehavior,
  getContextualPrompt,
  type CategorySuggestion,
  type NearbyLocation
} from './utils/personalization';
import { trpc } from './utils/trpc';

// Beta MVP: Simplified screen flow
type AppScreen = 'splash' | 'landing' | 'auth' | 'main' | 'host' | 'valet';

const HOME_CAROUSEL_CLASS = '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide scroll-px-4 px-4 pr-10 pb-3';
const HOME_FEATURE_CARD_CLASS = 'group relative flex-shrink-0 snap-start rounded-2xl overflow-hidden bg-[#15151A]/95 text-left shadow-[0_16px_44px_rgba(0,0,0,0.34)] ring-1 ring-white/10';
const HOME_FEATURE_CARD_STYLE = { width: 'clamp(148px, 42vw, 164px)', height: 140 };

export default function App() {
  // Determine initial screen: skip splash/landing/auth if user already has a token
  const hasAuthToken = !!localStorage.getItem('bytspot_auth_token');
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(hasAuthToken ? 'main' : 'splash');
  const [activeTab, setActiveTab] = useState('home');
  const [isHost, setIsHost] = useState(false);
  const [isValet, setIsValet] = useState(false);
  const isDarkMode = true; // Fixed to dark mode

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
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const navHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [discoverFilter, setDiscoverFilter] = useState<'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness' | undefined>(undefined);
  const [selectedDestination, setSelectedDestination] = useState<string | undefined>(undefined);
  const [showRideSelection, setShowRideSelection] = useState(false);
  const [rideDestination, setRideDestination] = useState<{ name: string; lat?: number; lng?: number } | undefined>(undefined);
  const [valetServiceFromRide, setValetServiceFromRide] = useState<any>(null);
  const [selectedSearchVenue, setSelectedSearchVenue] = useState<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);
  const [quizStep, setQuizStep] = useState(0);
  // Read ?email= and ?ref= URL params (referral link or bytspot.com funnel)
  const prefillEmail = useMemo(() => new URLSearchParams(window.location.search).get('email') ?? '', []);
  const prefillRef = useMemo(() => new URLSearchParams(window.location.search).get('ref') ?? '', []);
  const [quizSelections, setQuizSelections] = useState<{ vibe?: string; walk?: string; group?: string }>({});
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [personalizedCategories, setPersonalizedCategories] = useState<CategorySuggestion[]>([]);
  const [personalizedLocations, setPersonalizedLocations] = useState<NearbyLocation[]>([]);

  // Universal-link / App Clip handoff — when the user lands via bytspot.app/p/<id>?venue=...
  // we surface this to MapSection which auto-opens the scanner with the patch pre-filled.
  const [pendingPatchScan, setPendingPatchScan] = useState<{ patchId: string; venueName?: string } | null>(null);
  const consumePendingPatchScan = useCallback(() => setPendingPatchScan(null), []);

  const openAccessWallet = useCallback(() => {
    localStorage.setItem('bytspot_profile_focus', 'tickets');
    setCurrentScreen('main');
    setActiveTab('profile');
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
  const homeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && (currentScreen === 'host' || currentScreen === 'valet')) {
      setCurrentScreen('main');
    }
    if (APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && valetServiceFromRide) {
      setValetServiceFromRide(null);
    }
  }, [currentScreen, valetServiceFromRide]);

  // ─── Tonight's Pick: smart venue recommendation ────────────────────────────
  const tonightsPick = useMemo(() => {
    if (!apiVenues || apiVenues.length === 0) return null;
    let quizAnswers: Record<string, string> = {};
    try { const raw = localStorage.getItem('bytspot_quiz_answers'); if (raw) quizAnswers = JSON.parse(raw); } catch { /* ignore */ }

    // Map quiz vibe → preferred API categories
    const vibeMap: Record<string, string[]> = {
      drinks: ['bar', 'nightlife', 'cocktails'],
      coffee: ['coffee', 'cafe', 'brunch'],
      food: ['restaurant', 'dining', 'food'],
      fitness: ['fitness', 'gym', 'wellness'],
    };
    const preferredCats = vibeMap[quizAnswers.vibe ?? ''] ?? [];

    // Score each venue: prefer quiz match (2pts), prefer crowd 1-2 (1pt for date, deduct for group=solo if packed)
    const scored = apiVenues.map(v => {
      const catMatch = preferredCats.some(c => (v.category ?? '').toLowerCase().includes(c));
      const lvl = v.crowd?.level ?? 2;
      let score = catMatch ? 2 : 0;
      if (quizAnswers.group === 'date') score += lvl <= 2 ? 1 : -1; // date prefers chill
      else if (quizAnswers.group === 'group') score += lvl >= 3 ? 1 : 0; // group prefers busy
      else score += lvl <= 3 ? 1 : 0; // default: not packed
      if (lvl === 4) score -= 2; // heavily penalise Packed
      return { v, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.v ?? null;
  }, [apiVenues]);

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
        const path = parsed.pathname.replace(/^\/+/, '');

        // Patch verify universal-link: bytspot.app/p/<patchId>?venue=<name>&t=<token>
        // or query-string variant: bytspot.app/?patch=<id>&venue=<name>
        const patchFromPath = path.startsWith('p/') ? path.slice(2).split('/')[0] : null;
        const patchFromQuery = parsed.searchParams.get('patch');
        const patchId = patchFromPath || patchFromQuery;
        if (patchId) {
          const venueName = parsed.searchParams.get('venue') || undefined;
          setActiveTab('map');
          setPendingPatchScan({ patchId, venueName });
          return;
        }

        if (path.startsWith('venue/')) {
          // bytspot://venue/<id> → open venue details via discover tab
          setActiveTab('discover');
        } else if (path === 'map') {
          setActiveTab('map');
        } else if (path === 'profile') {
          setActiveTab('profile');
        }
      } catch { /* ignore malformed URLs */ }
    };

    // Pick up patch deep-links present at first paint (web universal link
    // landing or App Clip → full-app handoff via SKOverlay).
    if (typeof window !== 'undefined') {
      handleDeepLink(window.location.href);
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

        // App is fixed to dark mode → light text on dark background
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
  }, []);

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

  // PERFORMANCE: Memoize user preferences and behavior to prevent redundant calculations
  const userPreferences = useMemo(() => getUserPreferences(), [activeTab, currentScreen]);
  const userBehavior = useMemo(() => getUserBehavior(), [activeTab, currentScreen]);
  
  // PERFORMANCE: Memoize personalized categories
  const memoizedCategories = useMemo(() => {
    if (activeTab === 'home' || currentScreen === 'main') {
      return getPersonalizedCategories(userPreferences, userBehavior);
    }
    return [];
  }, [activeTab, currentScreen, userPreferences, userBehavior]);
  
  // PERFORMANCE: Memoize personalized locations — use live GPS coords, fall back to Atlanta
  const activeCoords = userCoords ?? cityCoords ?? { lat: 33.7866, lng: -84.3833 };
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
      // Fetch provider status to populate isHost / isValet flags
      trpc.providers.getStatus.query().then((res) => {
        setIsHost(
          res.host?.status === 'approved' || res.host?.status === 'pending'
        );
        setIsValet(res.valet?.status === 'active');
      }).catch(() => { /* silently ignore — user may not be a provider */ });
    }

    // Handle Stripe return URLs (/premium/success, /parking/success, /premium/cancelled)
    const path = window.location.pathname;
    if (path.includes('/premium/success')) {
      if (APPLE_REVIEW_HIDE_INSIDER_PREMIUM) {
        setActiveTab('profile');
        setCurrentScreen('main');
        window.history.replaceState({}, '', '/');
        return;
      }
      syncInsiderMembershipFromPremium(true);
      toast.success('🎉 Welcome to Insider!', { description: 'Your membership is now active.', duration: 5000 });
      setActiveTab('profile');
      setCurrentScreen('main');
      // Clean the URL without reload
      window.history.replaceState({}, '', '/');
    } else if (path.includes('/premium/cancelled')) {
      if (APPLE_REVIEW_HIDE_INSIDER_PREMIUM) {
        setActiveTab('profile');
        window.history.replaceState({}, '', '/');
        return;
      }
      toast('Insider checkout cancelled — no charges made.', { duration: 3000 });
      setActiveTab('profile');
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

    if (APPLE_REVIEW_HIDE_INTERNAL_ROUTES && (normalizedPath === '/admin' || normalizedPath === '/marketing')) {
      window.history.replaceState({}, '', '/');
    } else if (normalizedPath === '/marketing') {
      const PrintableMarketingAssets = lazy(() => import('./components/PrintableMarketingAssets'));
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <PrintableMarketingAssets />
        </Suspense>
      );
    }

    if (normalizedPath === '/admin') {
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
          <AdminDashboard />
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
          // Refresh provider status after login
          trpc.providers.getStatus.query().then((res) => {
            setIsHost(
              res.host?.status === 'approved' || res.host?.status === 'pending'
            );
            setIsValet(res.valet?.status === 'active');
          }).catch(() => { /* ignore */ });
          if (!localStorage.getItem('bytspot_onboarding_seen')) {
            setOnboardingSlide(0);
            setShowOnboarding(true);
          }
        }}
      />
      </Suspense>
    );
  }

  // ── Host App ─────────────────────────────────────────
  if (!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && currentScreen === 'host') {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
        <HostApp
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
            onProfileClick={() => setActiveTab('profile')}
            scrollContainerRef={homeScrollRef}
            weather={weather.current}
            weatherLoading={weather.loading}
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
          <AnimatePresence mode="wait">
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
                {/* ── Tonight's Pick ── Smart venue recommendation */}
                {tonightsPick && (() => {
                  const v = tonightsPick;
                  const lvl = v.crowd?.level ?? 1;
                  const crowdLabel = v.crowd?.label ?? 'Chill';
                  const crowdColor = lvl === 4 ? 'bg-red-500/30 border-red-400/50 text-red-300'
                    : lvl === 3 ? 'bg-orange-500/30 border-orange-400/50 text-orange-300'
                    : lvl === 2 ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-300'
                    : 'bg-green-500/30 border-green-400/50 text-green-300';
                  const crowdEmoji = lvl === 4 ? '🔴' : lvl === 3 ? '🟠' : lvl === 2 ? '🟡' : '🟢';
                  const catEmoji: Record<string, string> = {
                    restaurant: '🍽️', bar: '🍸', coffee: '☕', nightlife: '🎶',
                    shopping: '🛍️', fitness: '💪', entertainment: '🎭', park: '🌳',
                  };
                  const icon = catEmoji[v.category] || '📍';
                  const imgUrl = v.imageUrl || `https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80`;
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
                        className="relative w-full rounded-2xl overflow-hidden text-left"
	                        style={{ height: 118 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setSelectedSearchVenue(v)}
                      >
                        {/* Background image */}
                        <img src={imgUrl} alt={v.name} className="absolute inset-0 w-full h-full object-cover" />
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        {/* AI Pick badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#A855F7]/80 backdrop-blur-sm border border-[#A855F7]/50">
                          <Sparkles className="w-3 h-3 text-white" strokeWidth={2.5} />
                          <span className="text-white text-[11px]" style={{ fontWeight: 700 }}>AI Pick</span>
                        </div>
                        {/* Content */}
	                        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-3">
                          <div>
	                            <div className="text-[16px] mb-0.5">{icon}</div>
	                            <h3 className="text-white text-[15px] leading-tight" style={{ fontWeight: 700 }}>{v.name}</h3>
                            {v.address && <p className="text-white/60 text-[12px] mt-0.5 truncate">{v.address}</p>}
                          </div>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[12px] backdrop-blur-sm ${crowdColor}`} style={{ fontWeight: 700 }}>
                            {crowdEmoji} {crowdLabel}
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
	                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
	                              <div className="absolute inset-x-0 top-0 h-px bg-white/35" />
	                              <span className="absolute top-2 left-2 text-[18px]">{evt.emoji}</span>
	                              <span className="absolute bottom-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/20">
	                                {evt.price}
	                              </span>
	                            </div>
	                            <div className="p-2.5">
	                              <p className="text-[13px] text-white font-semibold leading-tight line-clamp-2 min-h-[32px]">{evt.title}</p>
	                              <p className="text-[11px] text-white/50 mt-0.5 truncate">{evt.venue}</p>
	                              <div className="flex items-center gap-1.5 mt-1">
	                                <p className="text-[11px] text-cyan-400 font-semibold">{evt.time}</p>
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
				                                  <div className="flex h-[137px] flex-col p-3">
	                                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-xl ring-1 ring-white/15">{icon}</div>
				                                    <h3 className="text-white text-[13px] leading-tight mb-2 line-clamp-2 min-h-[32px]" style={{ fontWeight: 600 }}>{v.name}</h3>
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
				                                      <p className="text-white/50 text-[11px] mt-auto pt-1">~{wait}m wait</p>
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
                              {byCheckins ? 'By check-ins' : 'Live crowd'}
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
				                                  <div className="flex h-[137px] flex-col p-3">
	                                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] bg-orange-500/15 text-xl ring-1 ring-orange-300/20">{icon}</div>
				                                    <h3 className="text-white text-[13px] leading-tight mb-2 line-clamp-2 min-h-[32px]" style={{ fontWeight: 600 }}>{v.name}</h3>
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

                    {/* ── 👥 Friends are at... ── Social feed row */}
                    {(() => {
                      const feed = getSocialFeed().slice(0, 6);
                      if (feed.length === 0) return null;
                      const crowdEmoji: Record<string, string> = { Chill: '🟢', Active: '🟡', Busy: '🟠', Packed: '🔴' };
                      const timeAgo = (ts: string) => {
                        const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        return `${Math.floor(mins / 60)}h ago`;
                      };
                      return (
				                        <div className="mb-6">
                          <div className="mb-3 flex items-center justify-between">
				                            <h2 className="text-[20px] leading-6 text-white" style={{ fontWeight: 700 }}>👥 Friends Are At…</h2>
                            <span className="text-[11px] text-purple-300/80" style={{ fontWeight: 600 }}>Live</span>
                          </div>
				                          <div className={HOME_CAROUSEL_CLASS}>
                            {feed.map((event, i) => (
                              <motion.div
                                key={event.id}
				                                className={`${HOME_FEATURE_CARD_CLASS} border border-purple-500/20 p-3`}
				                                style={HOME_FEATURE_CARD_STYLE}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ...springConfig, delay: 0.35 + i * 0.04 }}
                              >
	                                <div className="absolute inset-x-3 top-0 h-px bg-purple-200/30" />
                                <div className="flex items-center gap-2 mb-2">
	                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white text-[11px] shadow-lg shadow-purple-500/20 ring-1 ring-white/25" style={{ fontWeight: 700 }}>
                                    {event.userName.slice(0, 1).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] text-white truncate" style={{ fontWeight: 600 }}>{event.userName}</p>
                                    <p className="text-[10px] text-white/40">{timeAgo(event.timestamp)}</p>
                                  </div>
                                </div>
				                                <p className="text-[12px] text-white/90 line-clamp-2 leading-snug min-h-[32px]" style={{ fontWeight: 500 }}>{event.venueName}</p>
                                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-purple-500/20 border border-purple-400/30 text-purple-300" style={{ fontWeight: 600 }}>
                                  {crowdEmoji[event.crowdLabel] ?? '📍'} {event.crowdLabel}
                                </div>
                              </motion.div>
                            ))}
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
                    apiCards={discoverApiCards}
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
                    userCoords={activeCoords}
                    onOpenAccessWallet={openAccessWallet}
                    onAuditEvent={emitAuditEvent}
                    pendingPatchScan={pendingPatchScan}
                    onPendingPatchScanConsumed={consumePendingPatchScan}
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
                      isHost={isHost}
                      isValet={isValet}
                      onBecomeHost={APPLE_REVIEW_HIDE_PROVIDER_AND_VALET ? undefined : () => setCurrentScreen('host')}
                      onBecomeValet={APPLE_REVIEW_HIDE_PROVIDER_AND_VALET ? undefined : () => setCurrentScreen('valet')}
                      onLogout={() => {
                        localStorage.removeItem('bytspot_auth_token');
                        localStorage.removeItem('bytspot_user');
                        localStorage.removeItem('bytspot_user_name');
                        setIsHost(false);
                        setIsValet(false);
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

        {/* Map Menu Slide Up */}
        <MapMenuSlideUp
          isOpen={showMapMenu}
          onClose={() => setShowMapMenu(false)}
          onSelectFunction={(func) => {
            setSelectedMapFunction(func);
            setActiveTab('map');
          }}
          onViewModeChange={(mode) => setMapViewMode(mode)}
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
        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              background: 'rgba(28, 28, 30, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              color: '#fff',
            },
            // ACCESSIBILITY: Ensure toasts are announced to screen readers

          }}
        />

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
            const quizQuestions = [
              { emoji: '✨', question: "What's your vibe tonight?", key: 'vibe' as const,
                options: [{ label: '🍸 Drinks', value: 'drinks' }, { label: '☕ Coffee', value: 'coffee' }, { label: '🍔 Food', value: 'food' }, { label: '🏋️ Fitness', value: 'fitness' }] },
              { emoji: '🗺️', question: "How far will you walk?", key: 'walk' as const,
                options: [{ label: '🚶 < 5 min', value: 'close' }, { label: '🚶‍♀️ 10 min', value: 'medium' }, { label: '🚌 Anywhere', value: 'far' }] },
              { emoji: '👥', question: "Solo or with crew?", key: 'group' as const,
                options: [{ label: '🙋 Solo', value: 'solo' }, { label: '👫 Date night', value: 'date' }, { label: '👥 Group', value: 'group' }] },
            ];
            const total = quizQuestions.length;
            const isConfirmation = quizStep === total;
            const q = isConfirmation ? null : quizQuestions[quizStep];
            const isLast = quizStep === total - 1;
            const dismiss = (final?: typeof quizSelections) => {
              const answers = final ?? quizSelections;
              localStorage.setItem('bytspot_onboarding_seen', 'true');
              localStorage.setItem('bytspot_quiz_answers', JSON.stringify(answers));
              const vibeToInterests: Record<string, string[]> = { drinks: ['bars','nightlife','cocktails'], coffee: ['coffee','cafes','brunch'], food: ['dining','restaurants','food'], fitness: ['fitness','gym','wellness'] };
              const interests = [...(answers.vibe ? vibeToInterests[answers.vibe] ?? [] : []), ...(answers.group === 'date' ? ['date night','romantic'] : []), ...(answers.group === 'group' ? ['group','nightlife'] : [])];
              localStorage.setItem('bytspot_preferences', JSON.stringify({ interests, vibePreferences: answers.vibe ? { selectedVibes: [answers.vibe] } : undefined }));
              setShowOnboarding(false); setQuizStep(0);
              if ('Notification' in window && Notification.permission === 'default') setTimeout(() => setShowNotifPrompt(true), 600);
            };
            // Top-3 venue picks for confirmation screen
            const picks = (() => {
              if (!isConfirmation || !apiVenues?.length) return [];
              const vibeMap: Record<string, string[]> = { drinks: ['bar','nightlife','cocktail'], coffee: ['coffee','cafe'], food: ['restaurant','dining'], fitness: ['fitness','gym'] };
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
            // Animated SVG ring
            const ringR = 18; const ringC = 2 * Math.PI * ringR;
            const ringFill = isConfirmation ? 1 : (quizStep + 1) / total;
            return (
              <motion.div key="onboarding-quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
                    /* ── Confirmation: Here's your city ── */
                    <>
                      <div className="text-center">
                        <div className="text-4xl mb-2">🗺️</div>
                        <h2 className="text-[22px] text-white leading-snug" style={{ fontWeight: 700 }}>Here's your {userCity}</h2>
                        <p className="text-[14px] mt-1" style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>Tonight's top picks, just for you</p>
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
                      <motion.button className="w-full rounded-[18px] py-4 text-[16px] text-black"
                        style={{ background: 'linear-gradient(135deg,#00BFFF,#7c3aed)', fontWeight: 700 }}
                        whileTap={{ scale: 0.97 }} onClick={() => dismiss()}>
                        Let's Go 🚀
                      </motion.button>
                    </>
                  ) : (
                    /* ── Quiz slide ── */
                    <>
                      <div className="text-5xl text-center">{q!.emoji}</div>
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
