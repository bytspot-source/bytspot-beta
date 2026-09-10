import { motion, useScroll, useTransform } from 'motion/react';
import { Sun, Cloud, CloudRain, MapPin, Menu, Zap, TrendingUp, Clock } from 'lucide-react';
import { ZoneUserCount } from './ZoneUserCount';
import { useRef, useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';
import type { WeatherSnapshot } from '../utils/hooks/useWeather';
import { describeWeatherCode } from '../utils/hooks/useWeather';
import { canUseAutomaticBrowserGeolocation } from '../utils/nativeLocationPolicy';
import { formatCityBadge } from '../utils/cityBadge';
import {
  getPersonalizedCategories,
  getUserPreferences,
  getUserBehavior,
  inferCulturalContext,
  saveCulturalContext,
  getCulturalContext,
  trackFrequentLocation,
  resolveCulturalContext,
  inferCountryFromAffinities,
  saveCulturalIdentity,
} from '../utils/personalization';

interface EnhancedHeaderProps {
  onProfileClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  weather?: WeatherSnapshot | null;
  weatherLoading?: boolean;
  /** Reverse-geocoded city from useCity (e.g. "Atlanta"); null while resolving. */
  city?: string | null;
}

function getLocalContext(hour: number) {
  if (hour >= 5 && hour < 9) return 'Coffee, work spots, and easy arrivals nearby';
  if (hour >= 9 && hour < 12) return 'Coffee, errands, and low-friction parking';
  if (hour >= 12 && hour < 14) return 'A good table, a short walk, and an easy return';
  if (hour >= 14 && hour < 17) return 'Close stops, errands, and calm arrivals';
  if (hour >= 17 && hour < 20) return 'Dinner, drinks, and easy arrivals nearby';
  if (hour >= 20 && hour < 23) return 'Good rooms, late tables, and simpler routes';
  return 'Food, rides, and a softer landing nearby';
}

function getTimeGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 23) return 'Good evening';
  return 'Late night';
}

function getGuestGreetingTitle(hour: number, city: string) {
  if (hour >= 5 && hour < 12) return `Morning in ${city}`;
  if (hour >= 12 && hour < 17) return `Afternoon in ${city}`;
  if (hour >= 17 && hour < 20) return `Evening in ${city}`;
  if (hour >= 20 && hour < 23) return 'Tonight is still open';
  return 'Still out?';
}

export function EnhancedHeader({ onProfileClick, scrollContainerRef, weather, weatherLoading = false, city = null }: EnhancedHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [spotsNearby, setSpotsNearby] = useState(12);
  const [aiRecs, setAiRecs] = useState(8);
  const headerRef = useRef<HTMLDivElement>(null);

  // 1. GPS geolocation on mount — stored as LOCATION context (Tier 2 fallback only).
  //    Native iOS suppresses automatic browser geolocation so WKWebView does
  //    not show a confusing "localhost" permission prompt on app launch.
  //    A user's cultural identity (cuisineAffinities / culturalIdentity in prefs)
  //    always takes priority over GPS in resolveCulturalContext().
  useEffect(() => {
    if (!canUseAutomaticBrowserGeolocation()) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Store GPS-inferred context as location signal (NOT identity)
        const gpsCtx = inferCulturalContext(latitude, longitude);
        saveCulturalContext(gpsCtx);
        trackFrequentLocation(latitude, longitude);

        // If user has cuisine affinities, persist their derived identity so
        // the next cold-start resolves identity-first without needing GPS.
        const prefs = getUserPreferences();
        if (prefs?.cuisineAffinities?.length) {
          const { inferCountryFromAffinities: infer } = { inferCountryFromAffinities: inferCountryFromAffinities };
          const country = infer(prefs.cuisineAffinities);
          if (country) saveCulturalIdentity(country);
        }
      },
      () => { /* permission denied or unavailable — use cached context if any */ },
      { timeout: 5000, maximumAge: 3600000 } // cache geo result for 1 hour
    );
  }, []);

  // 2. Fetch live stats + derive AI recs using identity-first context resolution.
  //    resolveCulturalContext() inside getPersonalizedCategories() ensures:
  //    - Ghanaian user in Atlanta → Ghanaian recommendations (identity wins)
  //    - New user with no prefs in Atlanta → Atlanta/USA recommendations (GPS fallback)
  useEffect(() => {
    trpc.health.stats.query().then(res => {
      if (res.venueCount) {
        setSpotsNearby(res.venueCount);

        const prefs = getUserPreferences();
        const behavior = getUserBehavior();
        // Pass the GPS context — getPersonalizedCategories internally calls
        // resolveCulturalContext(prefs, gpsCtx) and identity preferences win.
        const gpsCtx = getCulturalContext();
        const categories = getPersonalizedCategories(prefs, behavior, gpsCtx);
        const highPriority = categories.filter(c => c.priority >= 50).length;
        const recs = Math.max(
          1,
          Math.min(
            res.venueCount,
            Math.round(res.venueCount * (highPriority / Math.max(1, categories.length)))
          )
        );
        setAiRecs(recs > 0 ? recs : Math.round(res.venueCount * 0.6));
      }
    }).catch(() => { /* keep fallback values */ });
  }, []);

  // Update time every minute
  useEffect(() => {
    const syncTime = () => setCurrentTime(new Date());
    syncTime();
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      syncTime();
      interval = setInterval(syncTime, 60000);
    }, 60000 - (Date.now() % 60000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  // Scroll-based animations
  const { scrollY } = useScroll({
    container: scrollContainerRef,
  });

  const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.95]);
  const headerBlur = useTransform(scrollY, [0, 100], [20, 40]);
  const titleScale = useTransform(scrollY, [0, 50], [1, 0.85]);
  const titleOpacity = useTransform(scrollY, [0, 80], [1, 0]);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const compactTime = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const cityBadge = formatCityBadge(city);
  const midtownContext = getLocalContext(currentTime.getHours());
  const timeGreeting = getTimeGreeting(currentTime.getHours());
  const userName = localStorage.getItem('bytspot_user_name') || '';
  const greeting = userName ? `${timeGreeting}, ${userName}` : getGuestGreetingTitle(currentTime.getHours(), cityBadge === 'Nearby' ? 'your city' : cityBadge);

  // Get weather icon
  const getWeatherIcon = () => {
    const code = weather?.weatherCode ?? 1;
    const isDaytime = weather?.isDay ?? (currentTime.getHours() >= 6 && currentTime.getHours() < 20);
    if (code >= 95 || (code >= 51 && code <= 82)) {
      return <CloudRain className="w-[18px] h-[18px] text-cyan-300" strokeWidth={2} />;
    }
    if (code >= 2 || !isDaytime) {
      return <Cloud className="w-[18px] h-[18px] text-blue-300" strokeWidth={2} />;
    }
    if (isDaytime) {
      return <Sun className="w-[18px] h-[18px] text-amber-400" strokeWidth={2} />;
    }
    return <Cloud className="w-[18px] h-[18px] text-blue-400" strokeWidth={2} />;
  };

  return (
    <motion.div 
      ref={headerRef}
      className="relative"
      style={{ opacity: headerOpacity }}
    >
      {/* Status Bar + Quick Stats - 8pt grid glass cluster */}
      <motion.div 
        className="px-4 pb-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div 
          className="overflow-hidden rounded-[28px] border border-white/[0.15] bg-[#1C1C1E]/80 shadow-[0_18px_54px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.04]"
          style={{
            backdropFilter: `blur(${headerBlur}px)`,
            WebkitBackdropFilter: `blur(${headerBlur}px)`,
          }}
        >
          {/* Main Status Row */}
          <div className="min-h-[56px] bg-[#1C1C1E]/[0.78] px-4 py-2 backdrop-blur-xl">
            <div className="flex min-w-0 items-center justify-between gap-1.5">
              {/* Left: Time-sensitive info */}
              <div className="flex h-10 w-[124px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.09] px-2.5 shadow-inner shadow-white/[0.03]">
                {/* Weather */}
                <div className="flex shrink-0 items-center gap-1">
                  {getWeatherIcon()}
                  <span className="whitespace-nowrap text-[13px] leading-[18px] text-white" style={{ fontWeight: 700 }} title={weather ? describeWeatherCode(weather.weatherCode) : 'Weather updating'}>
                    {weatherLoading && weather?.source === 'fallback' ? '…' : `${Math.round(weather?.temperatureF ?? 72)}°`}
                  </span>
                </div>
                
                {/* Separator */}
                <div className="h-4 w-px bg-white/20" />
                
                {/* Time */}
                <div className="flex w-[52px] shrink-0 items-center justify-end gap-1">
                  <Clock className="h-3.5 w-3.5 text-white/75" strokeWidth={2.5} />
                  <span className="block w-[34px] shrink-0 whitespace-nowrap text-right text-[11px] leading-none text-white/90 [font-variant-numeric:tabular-nums]" style={{ fontWeight: 750 }}>
                    {compactTime}
                  </span>
                </div>
              </div>

              {/* Right: Location & Profile */}
              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                {/* Zone Activity */}
                <div className="min-w-0 shrink">
                  <ZoneUserCount compact={true} />
                </div>
                
                {/* Location */}
                <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#00BFFF]/[0.25] bg-[#00BFFF]/[0.12] px-3" data-testid="header-city-badge">
                  <MapPin className="h-[13px] w-[13px] text-[#00BFFF]" strokeWidth={2.5} />
                  <span className="whitespace-nowrap text-[12px] leading-4 text-[#7DE3FF]" style={{ fontWeight: 750 }}>
                    {cityBadge}
                  </span>
                </div>
                
                {/* Profile Menu Button */}
                <motion.button
                  onClick={onProfileClick}
                  aria-label="Open profile"
                  data-testid="open-profile-button"
                  className="tap-target relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-gradient-to-br from-[#A855F7]/[0.60] to-[#00BFFF]/[0.45] shadow-[0_10px_28px_rgba(168,85,247,0.36)]"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  {/* Animated gradient overlay */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-[#00BFFF]/[0.30] to-[#FF00FF]/[0.30]"
                    animate={{
                      rotate: [0, 360],
                    }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <Menu className="relative z-10 h-[18px] w-[18px] text-white" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Quick Stats Bar - Glassmorphism */}
          <motion.div 
            className="border-t border-white/10 bg-gradient-to-r from-[#00BFFF]/[0.09] via-white/[0.035] to-[#A855F7]/10 px-4 py-2 backdrop-blur-sm"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="grid h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px] leading-[13px]">
              {/* Live parking availability */}
              <div className="flex min-w-0 items-center justify-start gap-1.5">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400 animate-pulse" />
                <span className="min-w-0 truncate text-white/[0.78]" style={{ fontWeight: 600 }}>
                  <span className="text-green-300" style={{ fontWeight: 800 }}>{spotsNearby}</span> spots nearby
                </span>
              </div>
              
              {/* Separator */}
              <div className="h-5 w-px bg-white/[0.12]" />
              
              {/* Peak hours indicator */}
              <div className="flex min-w-0 items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-orange-400" strokeWidth={2.5} />
                <span className="min-w-0 truncate text-white/[0.78]" style={{ fontWeight: 600 }}>
                  <span className="text-orange-400" style={{ fontWeight: 800 }}>Peak</span> hours
                </span>
              </div>
              
              {/* Separator */}
              <div className="h-5 w-px bg-white/[0.12]" />
              
              {/* AI recommendations */}
              <div className="flex min-w-0 items-center justify-end gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-[#A855F7]" strokeWidth={2.5} />
                <span className="min-w-0 truncate text-white/[0.78]" style={{ fontWeight: 600 }}>
                  <span className="text-[#C084FC]" style={{ fontWeight: 800 }}>{aiRecs}</span> for you
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Greeting - Compact */}
      <motion.div
        className="origin-top-left px-4 pb-2 pt-2"
        style={{ scale: titleScale, opacity: titleOpacity }}
      >
        <motion.p
          className="text-[15px] leading-5 text-white/[0.88]"
          style={{ fontWeight: 650, letterSpacing: '-0.01em' }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          {greeting}
        </motion.p>
        <motion.p
          className="mt-0.5 text-[12px] leading-4 text-white/[0.52]"
          style={{ fontWeight: 500 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          {midtownContext}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
