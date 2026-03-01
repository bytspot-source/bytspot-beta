import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Star, Navigation, Sparkles, Sun, Mic, Menu, Heart } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
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
import { MapMenuSlideUp, type MapFunction, type MapViewMode } from './components/MapMenuSlideUp';
import { VenueDetails } from './components/VenueDetails';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast } from 'sonner@2.0.3';
import { useOffline } from './utils/hooks/useOffline';
import { useVenues } from './utils/hooks/useVenues';
import { trackEvent, trackScreenView, initAnalytics } from './utils/analytics';
import { classifySearchQuery, isNearbyQuery } from './utils/searchClassifier';

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

// Beta MVP: Simplified screen flow
type AppScreen = 'splash' | 'landing' | 'auth' | 'main';



export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('splash');
  const [activeTab, setActiveTab] = useState('home');
  const isDarkMode = true; // Fixed to dark mode

  const { isOnline, isOffline } = useOffline();
  const { venues: apiVenues } = useVenues();
  const [searchValue, setSearchValue] = useState('');
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [selectedMapFunction, setSelectedMapFunction] = useState<MapFunction | undefined>();
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('standard');
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const navHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [discoverFilter, setDiscoverFilter] = useState<'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness' | undefined>(undefined);
  const [selectedDestination, setSelectedDestination] = useState<string | undefined>(undefined);
  const [showRideSelection, setShowRideSelection] = useState(false);
  const [selectedSearchVenue, setSelectedSearchVenue] = useState<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [personalizedCategories, setPersonalizedCategories] = useState<CategorySuggestion[]>([]);
  const [personalizedLocations, setPersonalizedLocations] = useState<NearbyLocation[]>([]);
  const homeScrollRef = useRef<HTMLDivElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics();
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
        entertainment: 'Entertainment',
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
  
  // PERFORMANCE: Memoize personalized locations
  const memoizedLocations = useMemo(() => {
    if (activeTab === 'home' || currentScreen === 'main') {
      return getPersonalizedNearbyLocations(
        { lat: 33.7866, lng: -84.3833 },
        userPreferences,
        userBehavior
      );
    }
    return [];
  }, [activeTab, currentScreen, userPreferences, userBehavior]);
  
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
    // ANALYTICS: Track tab changes
    trackEvent('tab_changed', {
      tab: activeTab,
      previous_tab: lastScrollY > 0 ? 'scrolled' : 'top',
    });
    
    // Show nav by default for all tabs except Discover
    if (activeTab === 'discover') {
      setShowBottomNav(false);
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
    
    // Clear timers when changing tabs
    if (navHideTimerRef.current) {
      clearTimeout(navHideTimerRef.current);
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
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

  // Check if user already authenticated
  useEffect(() => {
    const authToken = localStorage.getItem('bytspot_auth_token');
    if (authToken) {
      setCurrentScreen('main');
    }
  }, []);

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
        onComplete={() => {
          localStorage.setItem('bytspot_auth_token', 'beta_user');
          setCurrentScreen('main');
        }}
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
        {/* Status Bar Space */}
        <div className="h-12" />

        {/* Enhanced Header - Only on Home */}
        {activeTab === 'home' && (
          <EnhancedHeader
            onProfileClick={() => setActiveTab('profile')}
            scrollContainerRef={homeScrollRef}
          />
        )}

        {/* Smart Search Bar - Only on Home */}
        {activeTab === 'home' && (
          <div className="px-4 mb-6">
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

        {/* Tab Content */}
        <div 
          className="flex-1 pb-24 relative" 
          style={{ minHeight: 0 }}
        >
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div
                key="home"
                ref={homeScrollRef}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 overflow-y-auto"
                onScroll={handleScroll}
              >
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
                        subtitle="Near you"
                        color="cyan"
                        isDarkMode={isDarkMode}
                        onClick={() => {
                          setDiscoverFilter('parking');
                          setActiveTab('discover');
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
                        subtitle="Valet & Rideshare"
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

                    {/* ── Right Now in Midtown ── Live Crowd Feed */}
                    {apiVenues.filter(v => v.crowd).length > 0 && (
                      <div className="mb-8">
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-title-2 text-white">Right Now in Midtown</h2>
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[11px] text-green-300" style={{ fontWeight: 600 }}>Live</span>
                          </div>
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
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
                                  onClick={() => { setDiscoverFilter(undefined); setActiveTab('discover'); }}
                                  className="flex-shrink-0 w-[148px] rounded-2xl overflow-hidden bg-[#1C1C1E]/90 border border-white/10 text-left"
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ ...springConfig, delay: 0.3 + i * 0.04 }}
                                  whileTap={{ scale: 0.96 }}
                                  whileHover={{ scale: 1.02, y: -2 }}
                                >
                                  {/* Color accent bar */}
                                  <div className="h-[3px]" style={{ background: accentColor }} />
                                  <div className="p-3">
                                    <div className="text-xl mb-1.5">{icon}</div>
                                    <h3 className="text-white text-[13px] leading-tight mb-2 truncate" style={{ fontWeight: 600 }}>{v.name}</h3>
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${pillBg}`} style={{ fontWeight: 700 }}>
                                      {emoji} {label}
                                    </div>
                                    {wait ? (
                                      <p className="text-white/50 text-[11px] mt-1">~{wait}m wait</p>
                                    ) : null}
                                  </div>
                                </motion.button>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Category Quick Search - Personalized */}
                    <div className="mb-8">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-title-2 text-white">
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
                          { label: 'Entertainment', category: 'entertainment', priority: 0, reason: 'trending' as const },
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
                        <h2 className="text-title-2 text-white">
                          Nearby
                        </h2>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-[11px] text-green-300" style={{ fontWeight: 600 }}>
                            Live
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
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
                                { name: 'Colony Square Garage', distance: '0.2', spots: 14, available: true, priority: 0 },
                                { name: '1380 W Peachtree Garage', distance: '0.4', spots: 22, available: true, priority: 0 },
                                { name: 'Promenade Midtown Parking', distance: '0.6', spots: 38, available: true, priority: 0 },
                              ]
                        ).map((location, index) => (
                          <motion.button
                            key={location.name}
                            onClick={() => handleNearbyLocationClick(location.name)}
                            className="w-full rounded-[16px] p-4 border-2 border-white/30 cursor-pointer bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl hover:shadow-2xl relative overflow-hidden"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springConfig, delay: 0.45 + index * 0.05 }}
                            whileTap={{ scale: 0.98 }}
                            whileHover={{ scale: 1.005, y: -2 }}
                          >
                            {/* Personalization indicator */}
                            {location.priority > 15 && (
                              <div className="absolute top-2 right-2">
                                <Sparkles className="w-3.5 h-3.5 text-[#A855F7]" strokeWidth={2.5} />
                              </div>
                            )}
                            
                            <div className="flex items-center justify-between">
                              <div className="flex-1 text-left">
                                <h3 className="text-[17px] mb-1 text-white" style={{ fontWeight: 600 }}>
                                  {location.name}
                                </h3>
                                <div className="flex items-center gap-2 flex-wrap text-[13px]">
                                  <span className="text-white/80" style={{ fontWeight: 400 }}>
                                    {location.distance} mi
                                  </span>
                                  <span className="text-white/40">•</span>
                                  <span className={`${(location.spots ?? 0) > 20 ? 'text-green-400' : (location.spots ?? 0) > 10 ? 'text-yellow-400' : 'text-orange-400'}`} style={{ fontWeight: 600 }}>
                                    {location.spots ?? 0} spots
                                  </span>
                                  {(location as any).crowd && (
                                    <>
                                      <span className="text-white/40">•</span>
                                      <div className={`px-2 py-0.5 rounded-full text-[11px] border ${
                                        (location as any).crowd.label === 'Chill'  ? 'bg-green-500/30 border-green-400/50 text-green-300' :
                                        (location as any).crowd.label === 'Active' ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-300' :
                                        (location as any).crowd.label === 'Busy'   ? 'bg-orange-500/30 border-orange-400/50 text-orange-300' :
                                        'bg-red-500/30 border-red-400/50 text-red-300'
                                      }`} style={{ fontWeight: 700 }}>
                                        {(location as any).crowd.label === 'Chill'  ? '🟢' :
                                         (location as any).crowd.label === 'Active' ? '🟡' :
                                         (location as any).crowd.label === 'Busy'   ? '🟠' : '🔴'} {(location as any).crowd.label}
                                        {(location as any).crowd.waitMins ? ` · ${(location as any).crowd.waitMins}m wait` : ''}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00BFFF]/60 to-[#A855F7]/60 border-2 border-white/30 flex items-center justify-center shadow-lg">
                                <MapPin className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
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
                    onNavigateToMap={() => setActiveTab('map')}
                    onShowBottomNav={() => setShowBottomNav(true)}
                    onTouch={handleDiscoverTouch}
                    initialFilter={discoverFilter}
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
              >
                <ErrorBoundary onReset={() => setActiveTab('home')} showHomeButton>
                  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" /></div>}>
                  <MapSection
                    isDarkMode={isDarkMode}
                    selectedFunction={selectedMapFunction}
                    viewMode={mapViewMode}
                    destination={selectedDestination}
                    onBackToHome={() => {
                      setActiveTab('home');
                      setSelectedDestination(undefined);
                      setSelectedMapFunction(undefined);
                    }}
                  />
                  </Suspense>
                </ErrorBoundary>
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
                      onLogout={() => {
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
            ariaProps: {
              role: 'status',
              'aria-live': 'polite',
              'aria-atomic': 'true',
            },
          }}
        />

        {/* Ride Selection Modal */}
        <Suspense fallback={null}>
        <RideSelection
          isOpen={showRideSelection}
          onClose={() => setShowRideSelection(false)}
          onSelectValet={() => {
            setDiscoverFilter('valet');
            setActiveTab('discover');
          }}
          isDarkMode={isDarkMode}
        />
        </Suspense>

        {/* Beta Feedback Button — floating, above bottom nav */}
        <motion.button
          className="fixed bottom-24 right-4 z-[55] w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white/30 shadow-xl flex items-center justify-center"
          whileTap={{ scale: 0.9 }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => { setShowFeedback(true); setFeedbackSubmitted(false); setFeedbackRating(0); setFeedbackText(''); }}
          aria-label="Share beta feedback"
        >
          <span className="text-[20px]">💬</span>
        </motion.button>

        {/* Beta Feedback Sheet */}
        <AnimatePresence>
          {showFeedback && (
            <>
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
                    <p className="text-[14px] text-white/60 text-center">You're helping shape Bytspot for Atlanta 🏙️</p>
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
                        <p className="text-[18px] text-white font-semibold">Beta Feedback</p>
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
                        const entry = { rating: feedbackRating, text: feedbackText.trim(), ts: Date.now(), version: '0.1-beta' };
                        try {
                          const existing = JSON.parse(localStorage.getItem('bytspot_feedback') || '[]');
                          localStorage.setItem('bytspot_feedback', JSON.stringify([...existing, entry]));
                        } catch {}
                        setFeedbackSubmitted(true);
                      }}
                    >Submit Feedback</motion.button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
