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
} | null = null;

let locationsCache: {
  result: NearbyLocation[];
  timestamp: number;
  prefsKey: string;
  behaviorKey: string;
} | null = null;

const CACHE_TTL = 60000; // 1 minute cache

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
}

export interface UserBehavior {
  categoryClicks: Record<string, number>;
  locationVisits: Record<string, number>;
  searchHistory: string[];
  lastActive: string;
}

export interface CategorySuggestion {
  label: string;
  category: string;
  priority: number;
  reason: 'preference' | 'time' | 'behavior' | 'trending';
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

/**
 * Get personalized category suggestions based on context
 * PERFORMANCE: Memoized with cache to prevent redundant calculations
 */
export function getPersonalizedCategories(
  preferences?: UserPreferences,
  behavior?: UserBehavior
): CategorySuggestion[] {
  // Create cache keys
  const prefsKey = JSON.stringify(preferences || {});
  const behaviorKey = JSON.stringify(behavior || {});
  const now = Date.now();
  
  // Check if we have a valid cached result
  if (
    categoriesCache &&
    categoriesCache.timestamp + CACHE_TTL > now &&
    categoriesCache.prefsKey === prefsKey &&
    categoriesCache.behaviorKey === behaviorKey
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

  // Sort by priority and return top 6
  const result = categories.sort((a, b) => b.priority - a.priority).slice(0, 6);
  
  // Cache the result
  categoriesCache = {
    result,
    timestamp: now,
    prefsKey,
    behaviorKey,
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
