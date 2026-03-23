/**
 * venuePhoto.ts — Deterministic Unsplash photo selection per venue
 * No API key needed. Photos are stable (same venue → same photos every render).
 */

/**
 * Venue-specific photos for the 12 Atlanta beta venues.
 * Each venue gets a distinct, recognizable image that matches its actual vibe.
 * Key = lowercased venue name.
 */
const VENUE_PHOTO_MAP: Record<string, string> = {
  'colony square': 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800', // modern mixed-use plaza
  'fado irish pub': 'https://images.unsplash.com/photo-1555658636-6e4a36218be7?w=800', // warm pub interior
  'krog street market': 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800', // food hall market
  'ladybird grove & mess hall': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800', // outdoor dining patio
  'livingston': 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800', // upscale restaurant
  'lyla lila': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800', // fine dining
  'mbar': 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800', // rooftop bar city view
  "ormsby's": 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800', // game bar atmosphere
  'piedmont park': 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800', // green park landscape
  'ponce city market': 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=800', // historic brick market building
  'the painted pin': 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800', // bowling/entertainment lounge
  'tongue & groove': 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800', // nightclub dance floor
};

const CATEGORY_PHOTO_POOLS: Record<string, string[]> = {
  bar: [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
    'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800',
    'https://images.unsplash.com/photo-1436262513933-a0b06755c784?w=800',
    'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800',
  ],
  nightlife: [
    'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800',
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=800',
    'https://images.unsplash.com/photo-1493655430934-68cbc7b4a14b?w=800',
  ],
  restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=800',
    'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800',
  ],
  coffee: [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800',
  ],
  shopping: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800',
    'https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=800',
    'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800',
  ],
  entertainment: [
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800',
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
  ],
  fitness: [
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
    'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=800',
  ],
  park: [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
    'https://images.unsplash.com/photo-1441555368234-b0b4cf17b04f?w=800',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800',
    'https://images.unsplash.com/photo-1563781064-e7a1c2e50070?w=800',
  ],
  venue: [
    'https://images.unsplash.com/photo-1496568816309-51d7c20e3b21?w=800',
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800',
    'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
  ],
};

/** Simple deterministic hash of a string → number */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Return `count` distinct photos for a venue.
 * Selection is deterministic: same name + category → same photos every time.
 */
export function getVenuePhotos(category: string, name: string, count = 4): string[] {
  const pool = CATEGORY_PHOTO_POOLS[category] || CATEGORY_PHOTO_POOLS.venue;
  const hash = hashString(name + category);
  const photos: string[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    photos.push(pool[(hash + i) % pool.length]);
  }
  return photos;
}

/** Primary hero photo for a venue (for card thumbnails) */
export function getVenuePrimaryPhoto(category: string, name: string): string {
  return getVenuePhotos(category, name, 1)[0];
}

/**
 * Resolve a venue's best photo URL.
 * Priority: Google Places photoUrls → DB imageUrl → Unsplash fallback
 */
export function resolveVenuePhoto(opts: {
  photoUrls?: string[];
  imageUrl?: string | null;
  category: string;
  name: string;
}): string {
  if (opts.photoUrls?.length) return opts.photoUrls[0];
  if (opts.imageUrl) return opts.imageUrl;
  // Check venue-specific photo map before falling back to generic category
  const venueSpecific = VENUE_PHOTO_MAP[opts.name.toLowerCase()];
  if (venueSpecific) return venueSpecific;
  return getVenuePrimaryPhoto(opts.category, opts.name);
}

/**
 * Get all available photos for a venue (for gallery/detail views).
 * Merges Google Places photos with Unsplash fallbacks to ensure ≥ count items.
 */
export function resolveVenuePhotos(opts: {
  photoUrls?: string[];
  imageUrl?: string | null;
  category: string;
  name: string;
  count?: number;
}): string[] {
  const count = opts.count ?? 4;
  const real = opts.photoUrls?.slice(0, count) ?? [];
  if (real.length >= count) return real;
  // Fill remaining slots with Unsplash fallbacks
  const fallbacks = getVenuePhotos(opts.category, opts.name, count - real.length);
  return [...real, ...fallbacks];
}

