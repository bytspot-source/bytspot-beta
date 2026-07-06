import type { DiscoverCard } from './mockData';
import type { UserPreferences, CulturalContext } from './personalization';
import type { VendorDiscoveryService } from './vendorServiceCards';

export type BytspotProviderSource = 'google_places' | 'yelp_fusion' | 'bytspot_vendor' | 'bytspot_discover' | 'bytspot_curated';
export type BytspotMediaKind = 'image' | 'video' | 'thumbnail';

export interface BytspotProviderAttribution {
  source: BytspotProviderSource;
  label: string;
  url?: string;
  text?: string;
}

export interface BytspotMediaItem {
  id: string;
  source: BytspotProviderSource;
  kind: BytspotMediaKind;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  altText: string;
  attribution?: BytspotProviderAttribution;
  priority: number;
}

export interface BytspotVendorMatchDocument {
  /** Canonical normalized document consumed by Simplex ranking and AI discovery.
   *  Treat this shape as the cross-platform source of truth; native shells should
   *  preserve these semantics even when rendering lighter UI card models.
   */
  id: string;
  source: BytspotProviderSource;
  providerId?: string;
  vendorServiceId?: string;
  vendorId?: string;
  name: string;
  description?: string;
  categories: string[];
  tags: string[];
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  isOpen?: boolean | null;
  verified?: boolean;
  distanceMeters?: number;
  media: BytspotMediaItem[];
  attribution?: BytspotProviderAttribution;
}

export interface GooglePlacesCandidate {
  id?: string;
  placeId?: string;
  place_id?: string;
  displayName?: string | { text?: string };
  name?: string;
  formattedAddress?: string;
  vicinity?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number | string;
  businessStatus?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  currentOpeningHours?: { openNow?: boolean };
  location?: { latitude?: number; longitude?: number; lat?: number; lng?: number };
  photos?: Array<{ name?: string; photoUri?: string; widthPx?: number; heightPx?: number; authorAttributions?: Array<{ displayName?: string; uri?: string }> }>;
}

export interface YelpFusionCandidate {
  id: string;
  alias?: string;
  name: string;
  url?: string;
  image_url?: string;
  photos?: string[];
  rating?: number;
  review_count?: number;
  price?: string;
  is_closed?: boolean;
  categories?: Array<{ alias?: string; title?: string }>;
  coordinates?: { latitude?: number; longitude?: number };
  location?: { display_address?: string[]; address1?: string; city?: string; state?: string; zip_code?: string };
  distance?: number;
  transactions?: string[];
}

export interface VendorMatchRpcInput {
  query?: string;
  preferences?: UserPreferences;
  culturalContext?: CulturalContext | null;
  documents: BytspotVendorMatchDocument[];
  limit?: number;
}

export interface SimplexScoreParts {
  phiEm: number;
  phiE: number;
  deltaD: number;
  lambdaSim: number;
  f: number;
  total: number;
}

export interface VendorMatchResult {
  document: BytspotVendorMatchDocument;
  score: number;
  matchedTokens: string[];
  simplex: SimplexScoreParts;
}

export interface DiscoverCardMatchOptions {
  query?: string;
  preferences?: UserPreferences;
  culturalContext?: CulturalContext | null;
  limit?: number;
}

export interface RankedDiscoverCard<T extends DiscoverCard = DiscoverCard> {
  card: T;
  result: VendorMatchResult;
}

export interface VendorInvertedIndex {
  documents: Map<string, BytspotVendorMatchDocument>;
  postings: Map<string, Map<string, number>>;
  documentTokens: Map<string, Set<string>>;
}

export const VENDOR_MATCH_RPC_CONTRACT = {
  route: 'vendors.match',
  input: 'VendorMatchRpcInput',
  output: 'VendorMatchRpcResponse',
  note: 'Backend owns provider keys; clients send user intent and receive normalized ranked matches.',
} as const;

export const PLACE_ENRICH_RPC_CONTRACT = {
  route: 'places.enrich',
  input: 'provider IDs, coordinates, or query text',
  output: 'normalized BytspotVendorMatchDocument[] with media and attribution',
  note: 'Future backend endpoint for Google/Yelp enrichment before vendors.match ranking.',
} as const;

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'near', 'nearby', 'open', 'now', 'spot', 'spots', 'best', 'good']);
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  ghanaian: ['ghana', 'jollof', 'banku', 'fufu', 'waakye', 'west', 'african', 'afrobeats'],
  dining: ['food', 'restaurant', 'chef', 'menu', 'pickup', 'delivery', 'jollof'],
  nightlife: ['bar', 'cocktail', 'club', 'lounge', 'afrobeats', 'music'],
  event: ['pass', 'ticket', 'matchday', 'stadium', 'vip', 'entry'],
  parking: ['garage', 'valet', 'reserve', 'car'],
  boutique: ['apartment', 'stay', 'suite', 'lodging', 'furnished', 'host', 'checkin', 'booking'],
  apartment: ['boutique', 'stay', 'suite', 'lodging', 'furnished', 'host', 'checkin', 'booking'],
};

const BYTSPOT_PROVIDER_LABELS: Record<Extract<BytspotProviderSource, 'bytspot_vendor' | 'bytspot_discover' | 'bytspot_curated'>, string> = {
  bytspot_vendor: 'Bytspot vendor',
  bytspot_discover: 'Bytspot',
  bytspot_curated: 'Bytspot curated',
};

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function tokenize(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function uniqueTokens(values: unknown[]): string[] {
  const tokens = new Set<string>();
  values.flatMap(tokenize).forEach((token) => {
    tokens.add(token);
    CATEGORY_SYNONYMS[token]?.forEach((synonym) => tokens.add(synonym));
  });
  return [...tokens];
}

function stableCompact(values: unknown[]): string[] {
  const items = new Set<string>();
  values.flatMap((value) => Array.isArray(value) ? value : [value]).forEach((value) => {
    const text = String(value ?? '').trim();
    if (text) items.add(text);
  });
  return [...items];
}

function discoverSourceForCard(card: DiscoverCard): Extract<BytspotProviderSource, 'bytspot_vendor' | 'bytspot_discover' | 'bytspot_curated'> {
  if (card.discoverSource === 'bytspot_vendor' || card.discoverSource === 'bytspot_curated' || card.discoverSource === 'bytspot_discover') return card.discoverSource;
  if (card.curatedFallback) return 'bytspot_curated';
  if (card.vendorServiceId || card.vendorId || card.vendorServiceStatus) return 'bytspot_vendor';
  return 'bytspot_discover';
}

function parseGooglePriceLevel(priceLevel?: number | string): number | undefined {
  if (typeof priceLevel === 'number') return priceLevel;
  const match = String(priceLevel ?? '').match(/[0-4]/);
  return match ? Number(match[0]) : undefined;
}

function parseYelpPriceLevel(price?: string): number | undefined {
  return price ? Math.min(price.length, 4) : undefined;
}

function compactAddress(parts: Array<string | undefined | null>): string | undefined {
  const value = parts.filter(Boolean).join(', ').trim();
  return value || undefined;
}

function parseDistanceMeters(distance?: string): number | undefined {
  if (!distance) return undefined;
  const normalized = distance.trim().toLowerCase();
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return undefined;
  if (normalized.includes('ft')) return value * 0.3048;
  if (normalized.includes('km')) return value * 1000;
  if (normalized.includes('m') && !normalized.includes('mi')) return value;
  return value * 1609.344;
}

function parseCardPriceLevel(card: DiscoverCard): number | undefined {
  const value = [card.entryPrice, card.price, card.priceRange].find(Boolean);
  if (!value) return undefined;
  const text = String(value);
  if (text.includes('$$$$')) return 4;
  if (text.includes('$$$')) return 3;
  if (text.includes('$$')) return 2;
  if (text.includes('$')) return 1;
  const amount = Number.parseFloat(text.replace(/[^0-9.]+/g, ''));
  if (!Number.isFinite(amount)) return undefined;
  return amount >= 200 ? 4 : amount >= 80 ? 3 : amount >= 25 ? 2 : 1;
}

export function adaptGooglePlaceToMatchDocument(place: GooglePlacesCandidate): BytspotVendorMatchDocument {
  const providerId = place.placeId ?? place.place_id ?? place.id ?? normalizeId(String(place.name ?? 'google-place'));
  const name = typeof place.displayName === 'string' ? place.displayName : place.displayName?.text ?? place.name ?? 'Google place';
  const attribution: BytspotProviderAttribution = { source: 'google_places', label: 'Google', url: place.googleMapsUri };
  return {
    id: `google:${providerId}`,
    source: 'google_places',
    providerId,
    name,
    description: place.formattedAddress ?? place.vicinity,
    categories: place.types ?? [],
    tags: uniqueTokens([name, ...(place.types ?? [])]),
    address: place.formattedAddress ?? place.vicinity,
    latitude: place.location?.latitude ?? place.location?.lat,
    longitude: place.location?.longitude ?? place.location?.lng,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    priceLevel: parseGooglePriceLevel(place.priceLevel),
    isOpen: place.currentOpeningHours?.openNow ?? (place.businessStatus === 'OPERATIONAL' ? null : false),
    verified: false,
    media: (place.photos ?? []).slice(0, 6).map((photo, index) => ({
      id: `google:${providerId}:photo:${index}`,
      source: 'google_places' as const,
      kind: 'image' as const,
      url: photo.photoUri ?? photo.name ?? '',
      width: photo.widthPx,
      height: photo.heightPx,
      altText: `${name} photo ${index + 1}`,
      attribution: { ...attribution, text: photo.authorAttributions?.map((a) => a.displayName).filter(Boolean).join(', ') },
      priority: 40 - index,
    })).filter((item) => item.url),
    attribution,
  };
}

export function adaptYelpBusinessToMatchDocument(business: YelpFusionCandidate): BytspotVendorMatchDocument {
  const categories = business.categories?.flatMap((category) => [category.alias, category.title].filter(Boolean) as string[]) ?? [];
  const address = business.location?.display_address?.join(', ') ?? compactAddress([business.location?.address1, business.location?.city, business.location?.state, business.location?.zip_code]);
  const attribution: BytspotProviderAttribution = { source: 'yelp_fusion', label: 'Yelp', url: business.url };
  const photoUrls = [business.image_url, ...(business.photos ?? [])].filter(Boolean) as string[];
  return {
    id: `yelp:${business.id}`,
    source: 'yelp_fusion',
    providerId: business.id,
    name: business.name,
    description: [address, business.transactions?.join(' · ')].filter(Boolean).join(' · ') || undefined,
    categories,
    tags: uniqueTokens([business.name, ...categories, ...(business.transactions ?? [])]),
    address,
    latitude: business.coordinates?.latitude,
    longitude: business.coordinates?.longitude,
    rating: business.rating,
    reviewCount: business.review_count,
    priceLevel: parseYelpPriceLevel(business.price),
    isOpen: typeof business.is_closed === 'boolean' ? !business.is_closed : null,
    verified: false,
    distanceMeters: business.distance,
    media: photoUrls.slice(0, 6).map((url, index) => ({
      id: `yelp:${business.id}:photo:${index}`,
      source: 'yelp_fusion' as const,
      kind: 'image' as const,
      url,
      altText: `${business.name} photo ${index + 1}`,
      attribution,
      priority: 35 - index,
    })),
    attribution,
  };
}

export function adaptVendorServiceToMatchDocument(service: VendorDiscoveryService, options: { distanceMeters?: number; verified?: boolean } = {}): BytspotVendorMatchDocument {
  const providerId = service.id;
  const verified = options.verified ?? Boolean(service.patch);
  const marketplaceTrust = [
    service.vendor.onboardingStatus === 'active' ? 'Connect-ready provider' : service.vendor.onboardingStatus,
    verified ? 'Patch-verified' : undefined,
    service.patch?.label,
  ];
  const categories = stableCompact([service.category, service.vendor.displayName, service.patch?.label, marketplaceTrust]);
  return {
    id: `vendor:${providerId}`,
    source: 'bytspot_vendor',
    providerId,
    vendorServiceId: service.id,
    vendorId: service.vendor.id,
    name: service.title,
    description: service.subtitle ?? service.description ?? undefined,
    categories,
    tags: uniqueTokens([
      service.id,
      service.vendor.id,
      service.title,
      service.subtitle,
      service.description,
      service.category,
      service.vendor.displayName,
      service.vendor.onboardingStatus,
      service.patch?.id,
      service.patch?.uid,
      service.patch?.label,
      service.availability,
      marketplaceTrust,
    ]),
    rating: service.rating,
    reviewCount: service.bookingCount,
    priceLevel: service.priceCents > 20000 ? 4 : service.priceCents > 10000 ? 3 : service.priceCents > 4000 ? 2 : 1,
    isOpen: service.vendor.onboardingStatus === 'active' ? true : null,
    verified,
    distanceMeters: options.distanceMeters,
    media: [],
    attribution: { source: 'bytspot_vendor', label: 'Bytspot vendor' },
  };
}

export function adaptDiscoverCardToMatchDocument(card: DiscoverCard): BytspotVendorMatchDocument {
  if (card.matchDocument) return card.matchDocument;
  const source = discoverSourceForCard(card);
  const providerId = card.vendorServiceId ?? card.placeId ?? String(card.id);
  const vendorId = card.vendorId;
  const categories = stableCompact([card.type, card.serviceCategory, card.location, ...(card.features ?? [])]);
  return {
    id: `discover:${providerId}`,
    source,
    providerId,
    vendorServiceId: card.vendorServiceId,
    vendorId,
    name: card.name,
    description: card.description ?? card.serviceSubtitle,
    categories,
    tags: uniqueTokens([
      card.id,
      card.vendorServiceId,
      card.vendorId,
      card.placeId,
      source,
      card.name,
      card.type,
      card.description,
      card.serviceCategory,
      card.serviceSubtitle,
      card.location,
      card.availability,
      card.vendorServiceStatus,
      card.curatedFallback ? 'curated fallback fixture' : undefined,
      ...(card.features ?? []),
    ]),
    address: card.location,
    latitude: card._lat,
    longitude: card._lng,
    rating: card.rating,
    reviewCount: card.ratingCount ?? card.reviews ?? card.bookingCount,
    priceLevel: parseCardPriceLevel(card),
    isOpen: card.isOpen,
    verified: card.verified,
    distanceMeters: parseDistanceMeters(card.distance),
    media: [card.image, ...(card.photoUrls ?? [])].filter(Boolean).slice(0, 6).map((url, index) => ({
      id: `discover:${providerId}:photo:${index}`,
      source,
      kind: 'image' as const,
      url,
      altText: `${card.name} photo ${index + 1}`,
      priority: 50 - index,
    })),
    attribution: { source, label: BYTSPOT_PROVIDER_LABELS[source] },
  };
}

export function buildVendorInvertedIndex(documents: BytspotVendorMatchDocument[]): VendorInvertedIndex {
  const index: VendorInvertedIndex = { documents: new Map(), postings: new Map(), documentTokens: new Map() };
  for (const document of documents) {
    index.documents.set(document.id, document);
    const weightedFields: Array<[unknown, number]> = [
      [document.name, 8],
      [document.categories, 6],
      [document.tags, 5],
      [document.description, 3],
      [document.address, 1],
    ];
    const docTokens = new Set<string>();
    for (const [value, weight] of weightedFields) {
      for (const token of uniqueTokens(Array.isArray(value) ? value : [value])) {
        docTokens.add(token);
        if (!index.postings.has(token)) index.postings.set(token, new Map());
        const postings = index.postings.get(token)!;
        postings.set(document.id, (postings.get(document.id) ?? 0) + weight);
      }
    }
    index.documentTokens.set(document.id, docTokens);
  }
  return index;
}

function preferenceTokens(preferences?: UserPreferences, culturalContext?: CulturalContext | null): string[] {
  return uniqueTokens([
    preferences?.interests,
    preferences?.vibePreferences?.selectedVibes,
    preferences?.cuisineAffinities,
    preferences?.culturalIdentity,
    preferences?.discoveryPreferences?.groupPreference,
    culturalContext?.country,
    culturalContext?.inferredCuisinePreferences,
    culturalContext?.inferredVibePreferences,
  ]);
}

function distanceScore(distanceMeters?: number): number {
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters)) return 4;
  const miles = distanceMeters / 1609.344;
  return Math.max(0, 16 - miles * 4);
}

function scoreSimplex(document: BytspotVendorMatchDocument, matchedTokens: string[], rawIndexScore: number, input: VendorMatchRpcInput): SimplexScoreParts {
  const ratingConfidence = (document.rating ?? 4.2) * 3 + Math.min((document.reviewCount ?? 0) / 20, 8);
  const phiEm = ratingConfidence + (document.verified ? 8 : 0) + (document.isOpen ? 5 : 0) + Math.min(document.media.length * 2, 6);
  const phiE = distanceScore(document.distanceMeters) + (matchedTokens.some((token) => document.categories.join(' ').toLowerCase().includes(token)) ? 8 : 0);
  const deltaD = document.priceLevel ? Math.max(2, 8 - document.priceLevel) : 4;
  const lambdaSim = matchedTokens.length * 7 + Math.min(rawIndexScore, 24);
  const closeBoost = input.preferences?.discoveryPreferences?.walkPreference === 'close' && (document.distanceMeters ?? Infinity) <= 1200;
  const f = closeBoost ? 1.25 : 1;
  const total = phiEm + phiE + deltaD + f * lambdaSim;
  return { phiEm, phiE, deltaD, lambdaSim, f, total };
}

export function matchVendorsWithSimplex(input: VendorMatchRpcInput): VendorMatchResult[] {
  const index = buildVendorInvertedIndex(input.documents);
  const intentTokens = uniqueTokens([input.query, ...preferenceTokens(input.preferences, input.culturalContext)]);
  const candidateScores = new Map<string, number>(input.documents.map((document) => [document.id, 0]));

  for (const token of intentTokens) {
    const postings = index.postings.get(token);
    postings?.forEach((weight, documentId) => candidateScores.set(documentId, (candidateScores.get(documentId) ?? 0) + weight));
  }

  return [...candidateScores.entries()]
    .map(([documentId, rawIndexScore]) => {
      const document = index.documents.get(documentId)!;
      const docTokens = index.documentTokens.get(documentId) ?? new Set<string>();
      const matchedTokens = intentTokens.filter((token) => docTokens.has(token));
      const simplex = scoreSimplex(document, matchedTokens, rawIndexScore, input);
      return { document, score: simplex.total, matchedTokens, simplex };
    })
    .sort((a, b) => b.score - a.score || a.document.name.localeCompare(b.document.name))
    .slice(0, input.limit ?? 10);
}

export function rankDiscoverCardsWithSimplex<T extends DiscoverCard>(cards: T[], options: DiscoverCardMatchOptions = {}): T[] {
  return getRankedDiscoverCardsWithSimplex(cards, options).map(({ card }) => card);
}

export function getRankedDiscoverCardsWithSimplex<T extends DiscoverCard>(cards: T[], options: DiscoverCardMatchOptions = {}): RankedDiscoverCard<T>[] {
  const entries = cards.map((card, index) => {
    const document = adaptDiscoverCardToMatchDocument(card);
    return { card, index, document: { ...document, id: `${document.id}:rank:${index}` } };
  });

  const byDocumentId = new Map(entries.map((entry) => [entry.document.id, entry]));
  const ranked = matchVendorsWithSimplex({
    query: options.query,
    preferences: options.preferences,
    culturalContext: options.culturalContext,
    documents: entries.map((entry) => entry.document),
    limit: options.limit ?? entries.length,
  })
    .map((result) => {
      const entry = byDocumentId.get(result.document.id)!;
      return { card: entry.card, result, index: entry.index };
    })
    .sort((a, b) => b.result.score - a.result.score || a.index - b.index);

  return ranked.map(({ card, result }) => ({ card, result }));
}
