/**
 * Personalization Engine
 * Learns from user behavior, preferences, and context to provide intelligent suggestions
 * 
 * PERFORMANCE: Results are cached to prevent redundant calculations
 */

// Cache for personalization results
let categoriesCache: {
  result: CategorySuggestion[];
  timestamp: number;
  prefsKey: string;
  behaviorKey: string;
  locationKey: string;
} | null = null;

let locationsCache: {
  result: NearbyLocation[];
  timestamp: number;
  prefsKey: string;
  behaviorKey: string;
} | null = null;

const CACHE_TTL = 60000; // 1 minute cache

// ─── Cultural Context ─────────────────────────────────────────────────────────

export interface CulturalContext {
  country: string;                        // e.g. "Ghana", "USA"
  region: string;                         // e.g. "West Africa", "Southeast US"
  inferredCuisinePreferences: string[];   // e.g. ["jollof", "fufu", "waakye"]
  inferredVibePreferences: string[];      // e.g. ["afrobeats", "highlife"]
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UserPreferences {
  interests: string[];
  parkingPreferences?: {
    covered?: boolean;
    evCharging?: boolean;
    security?: 'basic' | 'standard' | 'premium';
  };
  vibePreferences?: {
    selectedVibes: string[];
  };
  /** Inferred from geolocation — user can override in settings */
  culturalContext?: CulturalContext;
}

export interface UserBehavior {
  categoryClicks: Record<string, number>;
  locationVisits: Record<string, number>;
  searchHistory: string[];
  lastActive: string;
  /** City-level visit counts — never stores precise coords */
  frequentLocations?: Record<string, { lat: number; lng: number; visits: number }>;
  /** Per-city category preferences derived from behavior */
  locationBasedCategoryPreferences?: Record<string, string[]>;
}

export interface CategorySuggestion {
  label: string;
  category: string;
  priority: number;
  reason: 'preference' | 'time' | 'behavior' | 'trending' | 'cultural';
}

export interface NearbyLocation {
  name: string;
  distance: string;
  spots: number;
  available: boolean;
  type?: 'parking' | 'venue';
  rating?: number;
  priority: number;
}

// ─── Region Bounding Boxes ────────────────────────────────────────────────────
// Format: [minLat, maxLat, minLng, maxLng]
// Ordered from most-specific to least-specific so the first match wins.

const REGION_MAP: Array<{
  country: string;
  region: string;
  bounds: [number, number, number, number]; // [minLat, maxLat, minLng, maxLng]
}> = [
  // ── Africa ────────────────────────────────────────────────────────────
  { country: 'Ghana',        region: 'West Africa',    bounds: [4.5, 11.2,  -3.3,   1.2] },
  { country: 'Nigeria',      region: 'West Africa',    bounds: [4.3, 13.9,   2.7,  14.7] },
  { country: 'Senegal',      region: 'West Africa',    bounds: [12.3, 16.7, -17.5,  -11.4] },
  { country: 'Ivory Coast',  region: 'West Africa',    bounds: [4.3, 10.7,  -8.6,   -2.5] },
  { country: 'Kenya',        region: 'East Africa',    bounds: [-4.7, 5.0,   33.9,  41.9] },
  { country: 'Ethiopia',     region: 'East Africa',    bounds: [3.4, 14.9,   33.0,  47.9] },
  { country: 'South Africa', region: 'Southern Africa',bounds: [-34.8, -22.1, 16.5, 32.9] },
  { country: 'Egypt',        region: 'North Africa',   bounds: [22.0, 31.7,  24.7,  37.1] },
  // ── Europe ────────────────────────────────────────────────────────────
  { country: 'UK',           region: 'Western Europe', bounds: [49.9, 60.9, -8.2,   1.8] },
  { country: 'France',       region: 'Western Europe', bounds: [42.3, 51.1,  -4.8,   8.2] },
  { country: 'Germany',      region: 'Central Europe', bounds: [47.3, 55.1,   6.0,  15.0] },
  { country: 'Netherlands',  region: 'Western Europe', bounds: [50.7, 53.6,   3.4,   7.2] },
  { country: 'Spain',        region: 'Southern Europe',bounds: [36.0, 43.8,  -9.3,   4.3] },
  { country: 'Italy',        region: 'Southern Europe',bounds: [36.6, 47.1,   6.6,  18.5] },
  // ── Americas ──────────────────────────────────────────────────────────
  { country: 'USA',          region: 'North America',  bounds: [24.5, 49.4, -125.0, -66.9] },
  { country: 'Canada',       region: 'North America',  bounds: [41.7, 83.2, -141.0, -52.6] },
  { country: 'Brazil',       region: 'South America',  bounds: [-33.8, 5.3,  -73.9, -34.8] },
  { country: 'Mexico',       region: 'North America',  bounds: [14.5, 32.7, -117.1, -86.7] },
  // ── Asia-Pacific ──────────────────────────────────────────────────────
  { country: 'India',        region: 'South Asia',     bounds: [8.1, 37.1,   68.1,  97.4] },
  { country: 'China',        region: 'East Asia',      bounds: [18.2, 53.6,  73.5,  134.8] },
  { country: 'Japan',        region: 'East Asia',      bounds: [24.0, 45.5, 123.0,  145.8] },
  { country: 'Australia',    region: 'Oceania',        bounds: [-43.6, -10.7, 113.3, 153.6] },
  { country: 'UAE',          region: 'Middle East',    bounds: [22.6, 26.1,   51.6,  56.4] },
];

// ─── Cultural Mappings ────────────────────────────────────────────────────────

interface CulturalMapping {
  cuisine: string[];
  vibes: string[];
  /** Categories to boost and their bonus points */
  categoryBoosts: Record<string, number>;
}

const CULTURAL_MAPPINGS: Record<string, CulturalMapping> = {
  Ghana: {
    cuisine: ['jollof', 'fufu', 'waakye', 'kenkey', 'kelewele', 'banku'],
    vibes: ['afrobeats', 'highlife', 'hiplife', 'azonto'],
    categoryBoosts: { dining: 45, nightlife: 40, entertainment: 30 },
  },
  Nigeria: {
    cuisine: ['jollof', 'suya', 'egusi', 'pounded yam', 'pepper soup'],
    vibes: ['afrobeats', 'afropop', 'amapiano', 'fuji'],
    categoryBoosts: { dining: 45, nightlife: 40, entertainment: 35 },
  },
  'Ivory Coast': {
    cuisine: ['attiéké', 'aloco', 'garba', 'kedjenou'],
    vibes: ['coupé-décalé', 'afrobeats', 'zouglou'],
    categoryBoosts: { dining: 40, nightlife: 35, entertainment: 25 },
  },
  Kenya: {
    cuisine: ['ugali', 'nyama choma', 'sukuma wiki', 'githeri'],
    vibes: ['bongo flava', 'afrobeats', 'genge'],
    categoryBoosts: { dining: 40, fitness: 25, entertainment: 30 },
  },
  'South Africa': {
    cuisine: ['braai', 'bunny chow', 'biltong', 'boerewors'],
    vibes: ['amapiano', 'kwaito', 'house'],
    categoryBoosts: { dining: 40, nightlife: 45, shopping: 25 },
  },
  UK: {
    cuisine: ['fish and chips', 'curry', 'sunday roast', 'pie'],
    vibes: ['grime', 'drum and bass', 'uk garage', 'indie'],
    categoryBoosts: { coffee: 35, dining: 35, nightlife: 30, shopping: 30 },
  },
  France: {
    cuisine: ['boulangerie', 'bistro', 'croissant', 'wine', 'cheese'],
    vibes: ['french house', 'chanson', 'electronic'],
    categoryBoosts: { dining: 50, coffee: 35, shopping: 30 },
  },
  Germany: {
    cuisine: ['bratwurst', 'schnitzel', 'pretzels', 'beer'],
    vibes: ['techno', 'electronic', 'rock'],
    categoryBoosts: { nightlife: 40, dining: 35, fitness: 25 },
  },
  USA: {
    cuisine: ['burgers', 'bbq', 'pizza', 'tacos', 'brunch'],
    vibes: ['hip-hop', 'r&b', 'country', 'pop'],
    categoryBoosts: { dining: 35, coffee: 30, fitness: 30, entertainment: 25 },
  },
  India: {
    cuisine: ['curry', 'biryani', 'dal', 'dosa', 'naan', 'street food'],
    vibes: ['bollywood', 'bhangra', 'classical'],
    categoryBoosts: { dining: 50, shopping: 35, entertainment: 30 },
  },
  Japan: {
    cuisine: ['ramen', 'sushi', 'tempura', 'yakitori', 'izakaya'],
    vibes: ['j-pop', 'anime', 'electronic', 'jazz'],
    categoryBoosts: { dining: 50, coffee: 40, entertainment: 35, shopping: 30 },
  },
  Australia: {
    cuisine: ['brunch', 'bbq', 'flat white', 'pie', 'seafood'],
    vibes: ['indie', 'rock', 'electronic', 'pop'],
    categoryBoosts: { coffee: 45, fitness: 35, dining: 30, nightlife: 25 },
  },
  UAE: {
    cuisine: ['shawarma', 'mandi', 'luqaimat', 'machboos', 'arabic coffee'],
    vibes: ['arabic pop', 'electro', 'hip-hop'],
    categoryBoosts: { dining: 45, shopping: 50, nightlife: 30, entertainment: 35 },
  },
};

// Fallback for countries not in the mapping
const DEFAULT_CULTURAL_MAPPING: CulturalMapping = {
  cuisine: [],
  vibes: [],
  categoryBoosts: {},
};

// ─── Inference Functions ──────────────────────────────────────────────────────

const LOCATION_CONTEXT_KEY = 'bytspot_user_location_context';

/**
 * Infer cultural context from lat/lng using local bounding box lookup.
 * Privacy-safe: coordinates never leave the device.
 */
export function inferCulturalContext(lat: number, lng: number): CulturalContext {
  const match = REGION_MAP.find(
    ({ bounds: [minLat, maxLat, minLng, maxLng] }) =>
      lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  );

  if (!match) {
    return { country: 'Unknown', region: 'Global', inferredCuisinePreferences: [], inferredVibePreferences: [] };
  }

  const mapping = CULTURAL_MAPPINGS[match.country] ?? DEFAULT_CULTURAL_MAPPING;

  return {
    country: match.country,
    region: match.region,
    inferredCuisinePreferences: mapping.cuisine,
    inferredVibePreferences: mapping.vibes,
  };
}

/**
 * Save inferred cultural context to localStorage (city/region level only, no precise coords).
 */
export function saveCulturalContext(context: CulturalContext): void {
  localStorage.setItem(LOCATION_CONTEXT_KEY, JSON.stringify(context));
}

/**
 * Load previously saved cultural context.
 */
export function getCulturalContext(): CulturalContext | null {
  const raw = localStorage.getItem(LOCATION_CONTEXT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Track a city-level location visit in UserBehavior (no precise coords stored).
 * Rounds coordinates to ~10km precision before storing.
 */
export function trackFrequentLocation(lat: number, lng: number): void {
  const context = inferCulturalContext(lat, lng);
  if (context.country === 'Unknown') return;

  const behaviorKey = 'bytspot_user_behavior';
  const stored = localStorage.getItem(behaviorKey);
  let behavior: UserBehavior = stored
    ? JSON.parse(stored)
    : { categoryClicks: {}, locationVisits: {}, searchHistory: [], lastActive: new Date().toISOString() };

  if (!behavior.frequentLocations) behavior.frequentLocations = {};

  // Round to ~10km precision for privacy
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLng = Math.round(lng * 10) / 10;
  const key = context.country;

  const existing = behavior.frequentLocations[key];
  behavior.frequentLocations[key] = {
    lat: roundedLat,
    lng: roundedLng,
    visits: (existing?.visits ?? 0) + 1,
  };

  // Update category preferences for this location
  if (!behavior.locationBasedCategoryPreferences) behavior.locationBasedCategoryPreferences = {};
  const mapping = CULTURAL_MAPPINGS[context.country] ?? DEFAULT_CULTURAL_MAPPING;
  const topCategories = Object.entries(mapping.categoryBoosts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
  behavior.locationBasedCategoryPreferences[context.country] = topCategories;

  behavior.lastActive = new Date().toISOString();
  localStorage.setItem(behaviorKey, JSON.stringify(behavior));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get personalized category suggestions based on context
 * PERFORMANCE: Memoized with cache to prevent redundant calculations
 */
export function getPersonalizedCategories(
  preferences?: UserPreferences,
  behavior?: UserBehavior,
  locationContext?: CulturalContext | null
): CategorySuggestion[] {
  // Resolve cultural context: explicit param > stored in prefs > localStorage
  const cultural =
    locationContext ??
    preferences?.culturalContext ??
    getCulturalContext();

  // Create cache keys
  const prefsKey = JSON.stringify(preferences || {});
  const behaviorKey = JSON.stringify(behavior || {});
  const locationKey = cultural ? cultural.country : 'none';
  const now = Date.now();

  // Check if we have a valid cached result
  if (
    categoriesCache &&
    categoriesCache.timestamp + CACHE_TTL > now &&
    categoriesCache.prefsKey === prefsKey &&
    categoriesCache.behaviorKey === behaviorKey &&
    categoriesCache.locationKey === locationKey
  ) {
    return categoriesCache.result;
  }
  
  const currentHour = new Date().getHours();
  
  // Base categories with context-aware priorities
  const categories: CategorySuggestion[] = [
    { 
      label: 'Coffee', 
      category: 'coffee',
      priority: 0,
      reason: 'trending'
    },
    { 
      label: 'Dining', 
      category: 'dining',
      priority: 0,
      reason: 'trending'
    },
    { 
      label: 'Shopping', 
      category: 'shopping',
      priority: 0,
      reason: 'trending'
    },
    { 
      label: 'Nightlife', 
      category: 'nightlife',
      priority: 0,
      reason: 'trending'
    },
    { 
      label: 'Fitness', 
      category: 'fitness',
      priority: 0,
      reason: 'trending'
    },
    { 
      label: 'Entertainment', 
      category: 'entertainment',
      priority: 0,
      reason: 'trending'
    },
  ];

  // Time-based boosting
  if (currentHour >= 6 && currentHour < 11) {
    // Morning: boost coffee and fitness
    const coffee = categories.find(c => c.category === 'coffee');
    const fitness = categories.find(c => c.category === 'fitness');
    if (coffee) {
      coffee.priority += 50;
      coffee.reason = 'time';
    }
    if (fitness) {
      fitness.priority += 30;
      fitness.reason = 'time';
    }
  } else if (currentHour >= 11 && currentHour < 15) {
    // Lunch: boost dining
    const dining = categories.find(c => c.category === 'dining');
    if (dining) {
      dining.priority += 40;
      dining.reason = 'time';
    }
  } else if (currentHour >= 15 && currentHour < 18) {
    // Afternoon: boost shopping and coffee
    const shopping = categories.find(c => c.category === 'shopping');
    const coffee = categories.find(c => c.category === 'coffee');
    if (shopping) {
      shopping.priority += 35;
      shopping.reason = 'time';
    }
    if (coffee) {
      coffee.priority += 25;
      coffee.reason = 'time';
    }
  } else if (currentHour >= 18 && currentHour < 23) {
    // Evening: boost dining and nightlife
    const dining = categories.find(c => c.category === 'dining');
    const nightlife = categories.find(c => c.category === 'nightlife');
    if (dining) {
      dining.priority += 45;
      dining.reason = 'time';
    }
    if (nightlife) {
      nightlife.priority += 40;
      nightlife.reason = 'time';
    }
  } else {
    // Late night: boost nightlife and entertainment
    const nightlife = categories.find(c => c.category === 'nightlife');
    const entertainment = categories.find(c => c.category === 'entertainment');
    if (nightlife) {
      nightlife.priority += 50;
      nightlife.reason = 'time';
    }
    if (entertainment) {
      entertainment.priority += 35;
      entertainment.reason = 'time';
    }
  }

  // User preference boosting
  if (preferences?.interests) {
    preferences.interests.forEach(interest => {
      const normalized = interest.toLowerCase();
      
      if (normalized.includes('coffee') || normalized.includes('cafe')) {
        const coffee = categories.find(c => c.category === 'coffee');
        if (coffee) {
          coffee.priority += 35;
          coffee.reason = 'preference';
        }
      }
      if (normalized.includes('food') || normalized.includes('dining') || normalized.includes('restaurant')) {
        const dining = categories.find(c => c.category === 'dining');
        if (dining) {
          dining.priority += 35;
          dining.reason = 'preference';
        }
      }
      if (normalized.includes('shop') || normalized.includes('retail')) {
        const shopping = categories.find(c => c.category === 'shopping');
        if (shopping) {
          shopping.priority += 35;
          shopping.reason = 'preference';
        }
      }
      if (normalized.includes('night') || normalized.includes('bar') || normalized.includes('club')) {
        const nightlife = categories.find(c => c.category === 'nightlife');
        if (nightlife) {
          nightlife.priority += 35;
          nightlife.reason = 'preference';
        }
      }
      if (normalized.includes('fitness') || normalized.includes('gym') || normalized.includes('workout')) {
        const fitness = categories.find(c => c.category === 'fitness');
        if (fitness) {
          fitness.priority += 35;
          fitness.reason = 'preference';
        }
      }
      if (normalized.includes('entertainment') || normalized.includes('movie') || normalized.includes('theater')) {
        const entertainment = categories.find(c => c.category === 'entertainment');
        if (entertainment) {
          entertainment.priority += 35;
          entertainment.reason = 'preference';
        }
      }
    });
  }

  // Behavior-based boosting (user's past interactions)
  if (behavior?.categoryClicks) {
    Object.entries(behavior.categoryClicks).forEach(([category, clicks]) => {
      const cat = categories.find(c => c.category === category);
      if (cat) {
        cat.priority += clicks * 10; // 10 points per click
        cat.reason = 'behavior';
      }
    });
  }

  // Cultural context boosting (location-inferred regional preferences)
  if (cultural && cultural.country !== 'Unknown') {
    const mapping = CULTURAL_MAPPINGS[cultural.country] ?? DEFAULT_CULTURAL_MAPPING;
    Object.entries(mapping.categoryBoosts).forEach(([category, boost]) => {
      const cat = categories.find(c => c.category === category);
      if (cat) {
        cat.priority += boost;
        cat.reason = 'cultural';
      }
    });

    // Also apply location-based behavior preferences if available
    const locationCategoryPrefs = behavior?.locationBasedCategoryPreferences?.[cultural.country];
    if (locationCategoryPrefs) {
      locationCategoryPrefs.forEach(category => {
        const cat = categories.find(c => c.category === category);
        if (cat) {
          cat.priority += 20; // bonus for location-behavior match
        }
      });
    }
  }

  // Sort by priority and return top 6
  const result = categories.sort((a, b) => b.priority - a.priority).slice(0, 6);

  // Cache the result
  categoriesCache = {
    result,
    timestamp: now,
    prefsKey,
    behaviorKey,
    locationKey,
  };
  
  return result;
}

/**
 * Get personalized nearby locations based on user context
 * PERFORMANCE: Memoized with cache to prevent redundant calculations
 */
export function getPersonalizedNearbyLocations(
  userLocation: { lat: number; lng: number },
  preferences?: UserPreferences,
  behavior?: UserBehavior
): NearbyLocation[] {
  // Create cache keys
  const prefsKey = JSON.stringify(preferences || {});
  const behaviorKey = JSON.stringify(behavior || {});
  const now = Date.now();
  
  // Check if we have a valid cached result
  if (
    locationsCache &&
    locationsCache.timestamp + CACHE_TTL > now &&
    locationsCache.prefsKey === prefsKey &&
    locationsCache.behaviorKey === behaviorKey
  ) {
    return locationsCache.result;
  }
  
  // Sample locations with priorities
  const locations: NearbyLocation[] = [
    {
      name: 'Colony Square Garage',
      distance: '0.2',
      spots: 14,
      available: true,
      type: 'parking',
      rating: 4.8,
      priority: 10,
    },
    {
      name: '1380 W Peachtree Garage',
      distance: '0.4',
      spots: 22,
      available: true,
      type: 'parking',
      rating: 4.3,
      priority: 8,
    },
    {
      name: 'Promenade Midtown Parking',
      distance: '0.6',
      spots: 38,
      available: true,
      type: 'parking',
      rating: 4.6,
      priority: 6,
    },
    {
      name: 'Midtown Place Parking',
      distance: '0.5',
      spots: 0,
      available: false,
      type: 'parking',
      rating: 4.9,
      priority: 5,
    },
    {
      name: 'Arts Center MARTA Garage',
      distance: '0.7',
      spots: 28,
      available: true,
      type: 'parking',
      rating: 4.7,
      priority: 7,
    },
  ];

  // Boost based on parking preferences
  if (preferences?.parkingPreferences) {
    const prefs = preferences.parkingPreferences;
    
    // For now, boost premium locations if user prefers premium security
    if (prefs.security === 'premium') {
      const premiumSpots = ['Colony Square Garage', 'Midtown Place Parking'];
      locations.forEach(loc => {
        if (premiumSpots.includes(loc.name)) {
          loc.priority += 20;
        }
      });
    }

    // Boost EV charging locations if preferred
    if (prefs.evCharging) {
      const evLocations = ['Downtown Plaza Garage', 'Bay Area Mall Garage'];
      locations.forEach(loc => {
        if (evLocations.includes(loc.name)) {
          loc.priority += 15;
        }
      });
    }

    // Boost covered locations if preferred
    if (prefs.covered) {
      const coveredLocations = ['Downtown Plaza Garage', 'Bay Area Mall Garage', 'Union Square Garage'];
      locations.forEach(loc => {
        if (coveredLocations.includes(loc.name)) {
          loc.priority += 12;
        }
      });
    }
  }

  // Boost based on past visits
  if (behavior?.locationVisits) {
    Object.entries(behavior.locationVisits).forEach(([locationName, visits]) => {
      const loc = locations.find(l => l.name === locationName);
      if (loc) {
        loc.priority += visits * 5; // 5 points per visit
      }
    });
  }

  // Boost closer locations slightly
  locations.forEach(loc => {
    const distance = parseFloat(loc.distance);
    if (distance < 0.4) {
      loc.priority += 15;
    } else if (distance < 0.6) {
      loc.priority += 10;
    } else if (distance < 1.0) {
      loc.priority += 5;
    }
  });

  // Sort by priority and return top 3
  const result = locations.sort((a, b) => b.priority - a.priority).slice(0, 3);
  
  // Cache the result
  locationsCache = {
    result,
    timestamp: now,
    prefsKey,
    behaviorKey,
  };
  
  return result;
}

/**
 * Track user behavior for personalization
 */
export function trackCategoryClick(category: string): void {
  const behaviorKey = 'bytspot_user_behavior';
  const stored = localStorage.getItem(behaviorKey);
  
  let behavior: UserBehavior = stored 
    ? JSON.parse(stored) 
    : { categoryClicks: {}, locationVisits: {}, searchHistory: [], lastActive: new Date().toISOString() };

  // Increment category click count
  behavior.categoryClicks[category] = (behavior.categoryClicks[category] || 0) + 1;
  behavior.lastActive = new Date().toISOString();

  // Store updated behavior
  localStorage.setItem(behaviorKey, JSON.stringify(behavior));
}

/**
 * Track location visits
 */
export function trackLocationVisit(locationName: string): void {
  const behaviorKey = 'bytspot_user_behavior';
  const stored = localStorage.getItem(behaviorKey);
  
  let behavior: UserBehavior = stored 
    ? JSON.parse(stored) 
    : { categoryClicks: {}, locationVisits: {}, searchHistory: [], lastActive: new Date().toISOString() };

  // Increment location visit count
  behavior.locationVisits[locationName] = (behavior.locationVisits[locationName] || 0) + 1;
  behavior.lastActive = new Date().toISOString();

  // Store updated behavior
  localStorage.setItem(behaviorKey, JSON.stringify(behavior));
}

/**
 * Get user preferences from storage
 */
export function getUserPreferences(): UserPreferences | undefined {
  const prefsString = localStorage.getItem('bytspot_preferences');
  if (!prefsString) return undefined;
  
  try {
    return JSON.parse(prefsString);
  } catch {
    return undefined;
  }
}

/**
 * Get user behavior from storage
 */
export function getUserBehavior(): UserBehavior | undefined {
  const behaviorString = localStorage.getItem('bytspot_user_behavior');
  if (!behaviorString) return undefined;
  
  try {
    return JSON.parse(behaviorString);
  } catch {
    return undefined;
  }
}

/**
 * Get contextual prompt text based on time of day
 */
export function getContextualPrompt(): string {
  const currentHour = new Date().getHours();
  
  if (currentHour >= 6 && currentHour < 11) {
    return 'Good morning! What are you looking for?';
  } else if (currentHour >= 11 && currentHour < 17) {
    return 'What are you looking for?';
  } else if (currentHour >= 17 && currentHour < 22) {
    return 'Good evening! What are you looking for?';
  } else {
    return 'What are you looking for tonight?';
  }
}
