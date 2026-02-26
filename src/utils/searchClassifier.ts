// Search Query Classifier for Bytspot
// Intelligently categorizes user search queries

export type SearchCategory = 
  | 'coffee' 
  | 'dining' 
  | 'shopping' 
  | 'entertainment'
  | 'nightlife'
  | 'fitness'
  | 'parking'
  | 'location'
  | 'navigation';

export interface SearchResult {
  category: SearchCategory;
  confidence: number;
  originalQuery: string;
  normalizedQuery: string;
  suggestedAction: 'discover' | 'map' | 'concierge';
}

// Category keyword mappings
const categoryKeywords: Record<SearchCategory, string[]> = {
  coffee: [
    'coffee', 'cafe', 'cafes', 'espresso', 'latte', 'cappuccino', 
    'starbucks', 'coffee shop', 'coffeehouse', 'brew', 'barista'
  ],
  dining: [
    'restaurant', 'restaurants', 'food', 'eat', 'eating', 'dinner', 
    'lunch', 'breakfast', 'brunch', 'cuisine', 'dining', 'meal',
    'italian', 'chinese', 'mexican', 'japanese', 'thai', 'indian',
    'pizza', 'burger', 'sushi', 'taco', 'noodles', 'bistro', 'diner'
  ],
  shopping: [
    'shop', 'shopping', 'mall', 'store', 'stores', 'retail', 'boutique',
    'shopping center', 'plaza', 'market', 'marketplace', 'outlet',
    'clothes', 'clothing', 'fashion', 'grocery', 'supermarket'
  ],
  entertainment: [
    'movie', 'movies', 'cinema', 'theater', 'theatre', 'concert',
    'show', 'entertainment', 'arcade', 'bowling', 'museum', 'gallery',
    'art', 'exhibit', 'performance', 'venue'
  ],
  nightlife: [
    'bar', 'bars', 'pub', 'club', 'nightclub', 'lounge', 'nightlife',
    'drinks', 'cocktail', 'beer', 'wine', 'happy hour', 'dance',
    'live music', 'karaoke', 'brewery', 'distillery'
  ],
  fitness: [
    'gym', 'fitness', 'workout', 'exercise', 'yoga', 'pilates',
    'crossfit', 'training', 'sports', 'athletic', 'health club',
    'wellness', 'spa', 'massage'
  ],
  parking: [
    'parking', 'park', 'garage', 'lot', 'spot', 'valet',
    'parking lot', 'parking garage', 'parking spot'
  ],
  location: [
    'plaza', 'center', 'station', 'building', 'tower', 'square',
    'district', 'area', 'neighborhood', 'street', 'avenue'
  ],
  navigation: [
    'navigate', 'directions', 'route', 'go to', 'how to get',
    'drive to', 'walk to', 'find', 'locate', 'where is'
  ]
};

// Venue type descriptions for UI
export const categoryLabels: Record<SearchCategory, string> = {
  coffee: 'Coffee Shops & Cafes',
  dining: 'Restaurants & Dining',
  shopping: 'Shopping & Retail',
  entertainment: 'Entertainment & Events',
  nightlife: 'Bars & Nightlife',
  fitness: 'Fitness & Wellness',
  parking: 'Parking Spots',
  location: 'Location',
  navigation: 'Navigation'
};

// Venue icons for each category
export const categoryIcons: Record<SearchCategory, string> = {
  coffee: '☕',
  dining: '🍽️',
  shopping: '🛍️',
  entertainment: '🎭',
  nightlife: '🍸',
  fitness: '💪',
  parking: '🅿️',
  location: '📍',
  navigation: '🧭'
};

/**
 * Classifies a search query into a category
 */
export function classifySearchQuery(query: string): SearchResult {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Score each category
  const scores: Record<SearchCategory, number> = {
    coffee: 0,
    dining: 0,
    shopping: 0,
    entertainment: 0,
    nightlife: 0,
    fitness: 0,
    parking: 0,
    location: 0,
    navigation: 0
  };
  
  // Calculate scores based on keyword matches
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (normalizedQuery.includes(keyword)) {
        // Exact match gets higher score
        if (normalizedQuery === keyword) {
          scores[category as SearchCategory] += 10;
        }
        // Word boundary match gets medium score
        else if (new RegExp(`\\b${keyword}\\b`).test(normalizedQuery)) {
          scores[category as SearchCategory] += 5;
        }
        // Substring match gets lower score
        else {
          scores[category as SearchCategory] += 2;
        }
      }
    }
  }
  
  // Find category with highest score
  let bestCategory: SearchCategory = 'location';
  let bestScore = 0;
  
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as SearchCategory;
    }
  }
  
  // Determine suggested action
  let suggestedAction: 'discover' | 'map' | 'concierge' = 'discover';
  
  if (bestCategory === 'navigation' || bestScore === 0) {
    suggestedAction = 'map';
  } else if (bestCategory === 'parking') {
    suggestedAction = 'discover';
  } else if (bestScore < 3) {
    // Low confidence - might need AI help
    suggestedAction = 'concierge';
  }
  
  // Calculate confidence (0-1)
  const confidence = Math.min(bestScore / 10, 1);
  
  return {
    category: bestCategory,
    confidence,
    originalQuery: query,
    normalizedQuery,
    suggestedAction
  };
}

/**
 * Checks if query is asking for nearby results
 */
export function isNearbyQuery(query: string): boolean {
  const nearbyKeywords = [
    'near', 'nearby', 'around', 'close', 'closest', 
    'near me', 'around me', 'around here', 'close by'
  ];
  
  const normalized = query.toLowerCase();
  return nearbyKeywords.some(keyword => normalized.includes(keyword));
}

/**
 * Extracts location from query if present
 */
export function extractLocation(query: string): string | null {
  const normalized = query.toLowerCase();
  
  // Common location patterns
  const patterns = [
    /in\s+([a-z\s]+)/i,
    /at\s+([a-z\s]+)/i,
    /near\s+([a-z\s]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Gets search suggestions based on partial query
 */
export function getSearchSuggestions(query: string): string[] {
  if (!query || query.length < 2) return [];
  
  const normalized = query.toLowerCase();
  const suggestions: string[] = [];
  
  // Add category suggestions
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords.slice(0, 3)) { // Top 3 keywords per category
      if (keyword.startsWith(normalized)) {
        suggestions.push(keyword);
      }
    }
  }
  
  // Add common full phrases
  const commonPhrases = [
    'coffee near me',
    'restaurants nearby',
    'shopping mall',
    'parking garage',
    'bars open now',
    'italian restaurant',
    'coffee shop',
    'movie theater',
    'gym near me',
    'nightlife',
  ];
  
  for (const phrase of commonPhrases) {
    if (phrase.includes(normalized)) {
      suggestions.push(phrase);
    }
  }
  
  return suggestions.slice(0, 5); // Return top 5
}
