import type { DiscoverCard } from './mockData';
import type { CulturalContext, UserPreferences } from './personalization';
import {
  adaptDiscoverCardToMatchDocument,
  matchVendorsWithSimplex,
  type BytspotVendorMatchDocument,
  type VendorMatchResult,
  type VendorMatchRpcInput,
} from './vendorMatching.ts';

export type VendorMatchingRpcSource = 'backend' | 'fallback';

export interface PlacesEnrichRpcInput {
  query?: string;
  providerIds?: { googlePlaceIds?: string[]; yelpBusinessIds?: string[] };
  location?: { lat: number; lng: number; radiusMeters?: number };
  providers?: Array<'google_places' | 'yelp_fusion'>;
  limit?: number;
}

export interface PlacesEnrichRpcResponse {
  source: VendorMatchingRpcSource;
  documents: BytspotVendorMatchDocument[];
}

export interface VendorsMatchRpcResponse {
  source: VendorMatchingRpcSource;
  results: VendorMatchResult[];
}

export interface DiscoverCardRpcMatchOptions {
  query?: string;
  preferences?: UserPreferences;
  culturalContext?: CulturalContext | null;
  limit?: number;
}

type ProcedureLike<TInput, TOutput> = { query(input: TInput): Promise<TOutput> };
type VendorMatchTrpcLike = {
  places?: { enrich?: ProcedureLike<PlacesEnrichRpcInput, unknown> };
  vendors?: { match?: ProcedureLike<VendorMatchRpcInput, unknown> };
};

function isDocument(value: unknown): value is BytspotVendorMatchDocument {
  const record = value as Partial<BytspotVendorMatchDocument> | null;
  return Boolean(record && typeof record.id === 'string' && typeof record.name === 'string' && Array.isArray(record.categories) && Array.isArray(record.tags) && Array.isArray(record.media));
}

function isMatchResult(value: unknown): value is VendorMatchResult {
  const record = value as Partial<VendorMatchResult> | null;
  return Boolean(record && isDocument(record.document) && typeof record.score === 'number' && Array.isArray(record.matchedTokens) && record.simplex);
}

function extractDocuments(response: unknown): BytspotVendorMatchDocument[] {
  const record = response as Record<string, unknown> | null;
  const candidates = Array.isArray(response) ? response : record?.documents ?? record?.items ?? record?.results;
  return Array.isArray(candidates) ? candidates.filter(isDocument) : [];
}

function extractMatchResults(response: unknown): VendorMatchResult[] {
  const record = response as Record<string, unknown> | null;
  const candidates = Array.isArray(response) ? response : record?.results ?? record?.items;
  return Array.isArray(candidates) ? candidates.filter(isMatchResult) : [];
}

export async function enrichPlacesViaRpc(trpcClient: VendorMatchTrpcLike, input: PlacesEnrichRpcInput): Promise<PlacesEnrichRpcResponse> {
  try {
    const response = await trpcClient.places?.enrich?.query(input);
    return { source: 'backend', documents: extractDocuments(response) };
  } catch {
    return { source: 'fallback', documents: [] };
  }
}

export async function matchVendorsViaRpcWithFallback(trpcClient: VendorMatchTrpcLike, input: VendorMatchRpcInput): Promise<VendorsMatchRpcResponse> {
  try {
    const response = await trpcClient.vendors?.match?.query(input);
    const results = extractMatchResults(response);
    if (results.length > 0) return { source: 'backend', results };
  } catch {
    // Route is not deployed yet, provider timed out, or user is offline.
  }

  return { source: 'fallback', results: matchVendorsWithSimplex(input) };
}

export async function rankDiscoverCardsViaRpcWithFallback<T extends DiscoverCard>(
  trpcClient: VendorMatchTrpcLike,
  cards: T[],
  options: DiscoverCardRpcMatchOptions = {},
): Promise<{ source: VendorMatchingRpcSource; cards: T[]; results: VendorMatchResult[] }> {
  const entries = cards.map((card, index) => {
    const document = adaptDiscoverCardToMatchDocument(card);
    return { card, document: { ...document, id: `${document.id}:rpc:${index}` }, index };
  });
  const byDocumentId = new Map(entries.map((entry) => [entry.document.id, entry]));
  const response = await matchVendorsViaRpcWithFallback(trpcClient, {
    query: options.query,
    preferences: options.preferences,
    culturalContext: options.culturalContext,
    documents: entries.map((entry) => entry.document),
    limit: options.limit ?? entries.length,
  });

  const ranked = response.results
    .map((result) => ({ result, entry: byDocumentId.get(result.document.id) }))
    .filter((item): item is { result: VendorMatchResult; entry: typeof entries[number] } => Boolean(item.entry))
    .sort((a, b) => b.result.score - a.result.score || a.entry.index - b.entry.index);

  return { source: response.source, cards: ranked.map(({ entry }) => entry.card), results: ranked.map(({ result }) => result) };
}
