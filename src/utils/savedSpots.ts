/**
 * Saved Spots Management Utility
 * v2 — API-first: calls tRPC user.savedSpots.*, falls back to localStorage.
 */
import { trpc } from './trpc';

export type SpotType = 'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness';

export interface SavedSpot {
  id: string;
  type: SpotType;
  name: string;
  address: string;
  distance?: string;
  rating?: number;
  imageUrl?: string;
  notes?: string;
  tags?: string[];
  savedAt: number;
  lastVisited?: number;
  visitCount?: number;
  spots?: number;
  price?: string;
  features?: string[];
  cuisine?: string;
  hours?: string;
  coordinates?: { lat: number; lng: number };
}

export interface SavedCollection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  spotIds: string[];
  createdAt: number;
  color?: string;
}

const STORAGE_KEY = 'bytspot_saved_spots';
const COLLECTIONS_KEY = 'bytspot_spot_collections';

function isAuthenticated(): boolean {
  return !!localStorage.getItem('bytspot_auth_token');
}

/**
 * Get all saved spots — sync localStorage
 */
export function getSavedSpots(): SavedSpot[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading saved spots:', error);
    return [];
  }
}

/**
 * Get all saved spots — API-first
 */
export async function getSavedSpotsAsync(): Promise<SavedSpot[]> {
  if (!isAuthenticated()) return getSavedSpots();
  try {
    const rows = await trpc.user.savedSpots.list.query();
    const mapped: SavedSpot[] = rows.map((r: any) => ({
      id: r.venue?.id ?? r.venueId,
      type: (r.venue?.category ?? 'venue') as SpotType,
      name: r.venue?.name ?? '',
      address: r.venue?.address ?? '',
      imageUrl: r.venue?.imageUrl ?? undefined,
      notes: r.notes ?? undefined,
      tags: r.tags ?? [],
      savedAt: new Date(r.savedAt).getTime(),
      coordinates: r.venue?.lat && r.venue?.lng ? { lat: r.venue.lat, lng: r.venue.lng } : undefined,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
    return mapped;
  } catch { return getSavedSpots(); }
}

export function getSavedSpotsByType(type: SpotType): SavedSpot[] {
  return getSavedSpots().filter(spot => spot.type === type);
}

export function getSavedSpot(id: string): SavedSpot | undefined {
  return getSavedSpots().find(spot => spot.id === id);
}

export function isSpotSaved(id: string): boolean {
  return getSavedSpots().some(spot => spot.id === id);
}

/**
 * Save a spot — optimistic localStorage + fire-and-forget API call
 */
export function saveSpot(spot: Omit<SavedSpot, 'savedAt' | 'visitCount'>): SavedSpot {
  const spots = getSavedSpots();
  const existingIndex = spots.findIndex(s => s.id === spot.id);
  const savedSpot: SavedSpot = {
    ...spot,
    savedAt: Date.now(),
    visitCount: existingIndex >= 0 ? spots[existingIndex].visitCount : 0,
    lastVisited: existingIndex >= 0 ? spots[existingIndex].lastVisited : undefined,
  };
  if (existingIndex >= 0) {
    spots[existingIndex] = savedSpot;
  } else {
    spots.unshift(savedSpot);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));

  // Fire-and-forget API save
  if (isAuthenticated()) {
    trpc.user.savedSpots.save.mutate({
      venueId: spot.id,
      notes: spot.notes,
      tags: spot.tags,
    }).catch(() => {});
  }

  return savedSpot;
}

/**
 * Remove a saved spot — optimistic localStorage + fire-and-forget API call
 */
export function removeSavedSpot(id: string): boolean {
  const spots = getSavedSpots();
  const filtered = spots.filter(spot => spot.id !== id);
  if (filtered.length === spots.length) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

  // Also remove from collections
  const collections = getCollections();
  collections.forEach(collection => {
    collection.spotIds = collection.spotIds.filter(spotId => spotId !== id);
  });
  saveCollections(collections);

  // Fire-and-forget API remove
  if (isAuthenticated()) {
    trpc.user.savedSpots.remove.mutate({ venueId: id }).catch(() => {});
  }

  return true;
}

/**
 * Toggle save status of a spot
 */
export function toggleSaveSpot(spot: Omit<SavedSpot, 'savedAt' | 'visitCount'>): boolean {
  if (isSpotSaved(spot.id)) {
    removeSavedSpot(spot.id);
    return false;
  } else {
    saveSpot(spot);
    return true;
  }
}

/**
 * Update spot notes
 */
export function updateSpotNotes(id: string, notes: string): boolean {
  const spots = getSavedSpots();
  const spot = spots.find(s => s.id === id);
  
  if (!spot) return false;
  
  spot.notes = notes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
  return true;
}

/**
 * Update spot tags
 */
export function updateSpotTags(id: string, tags: string[]): boolean {
  const spots = getSavedSpots();
  const spot = spots.find(s => s.id === id);
  
  if (!spot) return false;
  
  spot.tags = tags;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
  return true;
}

/**
 * Record a visit to a saved spot
 */
export function recordSpotVisit(id: string): boolean {
  const spots = getSavedSpots();
  const spot = spots.find(s => s.id === id);
  
  if (!spot) return false;
  
  spot.lastVisited = Date.now();
  spot.visitCount = (spot.visitCount || 0) + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
  return true;
}

/**
 * Get saved spots sorted by criteria
 */
export function getSortedSavedSpots(sortBy: 'recent' | 'name' | 'visits' | 'distance' = 'recent'): SavedSpot[] {
  const spots = getSavedSpots();
  
  switch (sortBy) {
    case 'recent':
      return spots.sort((a, b) => b.savedAt - a.savedAt);
    case 'name':
      return spots.sort((a, b) => a.name.localeCompare(b.name));
    case 'visits':
      return spots.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
    case 'distance':
      return spots.sort((a, b) => {
        const aDistance = parseFloat(a.distance || '999');
        const bDistance = parseFloat(b.distance || '999');
        return aDistance - bDistance;
      });
    default:
      return spots;
  }
}

/**
 * Search saved spots
 */
export function searchSavedSpots(query: string): SavedSpot[] {
  const lowerQuery = query.toLowerCase();
  return getSavedSpots().filter(spot =>
    spot.name.toLowerCase().includes(lowerQuery) ||
    spot.address.toLowerCase().includes(lowerQuery) ||
    spot.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    spot.notes?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get saved spots statistics
 */
export function getSavedSpotsStats() {
  const spots = getSavedSpots();
  
  const typeCount: Record<SpotType, number> = {
    parking: 0,
    venue: 0,
    valet: 0,
    coffee: 0,
    dining: 0,
    shopping: 0,
    nightlife: 0,
    entertainment: 0,
    fitness: 0,
  };
  
  spots.forEach(spot => {
    typeCount[spot.type] = (typeCount[spot.type] || 0) + 1;
  });
  
  const totalVisits = spots.reduce((sum, spot) => sum + (spot.visitCount || 0), 0);
  const mostVisited = spots.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))[0];
  
  return {
    total: spots.length,
    byType: typeCount,
    totalVisits,
    mostVisited,
  };
}

// Collections Management

/**
 * Get all collections
 */
export function getCollections(): SavedCollection[] {
  try {
    const stored = localStorage.getItem(COLLECTIONS_KEY);
    return stored ? JSON.parse(stored) : getDefaultCollections();
  } catch (error) {
    console.error('Error loading collections:', error);
    return getDefaultCollections();
  }
}

/**
 * Get default collections
 */
function getDefaultCollections(): SavedCollection[] {
  return [
    {
      id: 'favorites',
      name: 'Favorites',
      description: 'Your most loved spots',
      icon: '⭐',
      spotIds: [],
      createdAt: Date.now(),
      color: 'purple',
    },
    {
      id: 'work',
      name: 'Work',
      description: 'Spots near work',
      icon: '💼',
      spotIds: [],
      createdAt: Date.now(),
      color: 'blue',
    },
    {
      id: 'weekend',
      name: 'Weekend',
      description: 'Weekend destinations',
      icon: '🎉',
      spotIds: [],
      createdAt: Date.now(),
      color: 'orange',
    },
  ];
}

/**
 * Save collections
 */
function saveCollections(collections: SavedCollection[]): void {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

/**
 * Create a new collection
 */
export function createCollection(
  name: string,
  description?: string,
  icon?: string,
  color?: string
): SavedCollection {
  const collections = getCollections();
  
  const newCollection: SavedCollection = {
    id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    icon,
    spotIds: [],
    createdAt: Date.now(),
    color,
  };
  
  collections.push(newCollection);
  saveCollections(collections);
  return newCollection;
}

/**
 * Add spot to collection
 */
export function addSpotToCollection(collectionId: string, spotId: string): boolean {
  const collections = getCollections();
  const collection = collections.find(c => c.id === collectionId);
  
  if (!collection) return false;
  
  if (!collection.spotIds.includes(spotId)) {
    collection.spotIds.push(spotId);
    saveCollections(collections);
  }
  
  return true;
}

/**
 * Remove spot from collection
 */
export function removeSpotFromCollection(collectionId: string, spotId: string): boolean {
  const collections = getCollections();
  const collection = collections.find(c => c.id === collectionId);
  
  if (!collection) return false;
  
  collection.spotIds = collection.spotIds.filter(id => id !== spotId);
  saveCollections(collections);
  return true;
}

/**
 * Get spots in a collection
 */
export function getCollectionSpots(collectionId: string): SavedSpot[] {
  const collection = getCollections().find(c => c.id === collectionId);
  if (!collection) return [];
  
  const allSpots = getSavedSpots();
  return collection.spotIds
    .map(id => allSpots.find(spot => spot.id === id))
    .filter((spot): spot is SavedSpot => spot !== undefined);
}

/**
 * Delete a collection
 */
export function deleteCollection(collectionId: string): boolean {
  // Don't allow deleting default collections
  if (['favorites', 'work', 'weekend'].includes(collectionId)) {
    return false;
  }
  
  const collections = getCollections();
  const filtered = collections.filter(c => c.id !== collectionId);
  
  if (filtered.length === collections.length) {
    return false; // Collection not found
  }
  
  saveCollections(filtered);
  return true;
}
