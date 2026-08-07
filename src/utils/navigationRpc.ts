export type NavigationProvider = 'google_maps' | 'apple_maps' | 'bytspot_curated';
export type NavigationFeedSource = 'backend' | 'fallback';

export interface NavigationPoint { lat?: number; lng?: number; address?: string; placeId?: string }
export interface NavigationRouteInput { origin: NavigationPoint; destination: NavigationPoint; mode?: 'drive' | 'walk' | 'transit'; departureAt?: string; arrivalAt?: string; providers?: NavigationProvider[] }
export interface NavigationEtaInput { origin: NavigationPoint; destinations: NavigationPoint[]; mode?: 'drive' | 'walk' | 'transit'; providers?: NavigationProvider[] }
export interface NavigationGeocodeInput { query?: string; placeId?: string; providers?: NavigationProvider[] }

export interface NormalizedNavigationRoute { id: string; provider: NavigationProvider; summary: string; distanceLabel: string; durationLabel: string; polyline?: string; deeplinkUrl?: string }
export interface NormalizedNavigationEta { id: string; provider: NavigationProvider; destinationLabel: string; distanceLabel: string; durationLabel: string }
export interface NormalizedGeocodeResult { id: string; provider: NavigationProvider; label: string; lat: number; lng: number; placeId?: string }

export const NAVIGATION_RPC_CONTRACT = {
  routes: { route: 'navigation.route', eta: 'navigation.eta', geocode: 'navigation.geocode' },
  providers: ['google_maps', 'apple_maps', 'bytspot_curated'],
  note: 'Backend owns Maps/Places credentials; clients consume normalized routes, ETAs, and geocodes.',
} as const;

type ProcedureLike<TInput, TOutput> = { query(input: TInput): Promise<TOutput> };
type NavigationTrpcLike = { navigation?: { route?: ProcedureLike<NavigationRouteInput, unknown>; eta?: ProcedureLike<NavigationEtaInput, unknown>; geocode?: ProcedureLike<NavigationGeocodeInput, unknown> } };
type AnyRecord = Record<string, unknown>;

const LOCKED_NAV_PROVIDERS: NavigationProvider[] = ['google_maps', 'apple_maps', 'bytspot_curated'];
const isRecord = (value: unknown): value is AnyRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const num = (value: unknown): number | undefined => Number.isFinite(Number(value)) ? Number(value) : undefined;
const rowsFrom = (response: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(response)) return response;
  const root = isRecord(response) ? response : {};
  for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[];
  const embedded = isRecord(root._embedded) ? root._embedded : {};
  for (const key of keys) if (Array.isArray(embedded[key])) return embedded[key] as unknown[];
  return [];
};

export function normalizeNavigationRoute(value: unknown): NormalizedNavigationRoute | null {
  if (!isRecord(value)) return null;
  const legs = Array.isArray(value.legs) ? value.legs : [];
  const leg = legs.find(isRecord) ?? {};
  const distance = isRecord(leg.distance) ? leg.distance : {};
  const duration = isRecord(leg.duration) ? leg.duration : {};
  const polyline = isRecord(value.overview_polyline) ? clean(value.overview_polyline.points) : clean(value.polyline);
  const summary = clean(value.summary) ?? clean(value.name) ?? 'Best route';
  return {
    id: clean(value.id) ?? clean(value.routeId) ?? `route-${summary.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    provider: (clean(value.provider) as NavigationProvider) ?? 'google_maps',
    summary,
    distanceLabel: clean(value.distanceLabel) ?? clean(distance.text) ?? 'Distance TBA',
    durationLabel: clean(value.durationLabel) ?? clean(duration.text) ?? 'ETA TBA',
    ...(polyline ? { polyline } : {}),
    ...(clean(value.deeplinkUrl ?? value.url) ? { deeplinkUrl: clean(value.deeplinkUrl ?? value.url)! } : {}),
  };
}

export function normalizeNavigationEta(value: unknown): NormalizedNavigationEta | null {
  if (!isRecord(value)) return null;
  const duration = isRecord(value.duration) ? value.duration : {};
  const distance = isRecord(value.distance) ? value.distance : {};
  const label = clean(value.destinationLabel ?? value.name ?? value.address);
  if (!label) return null;
  return {
    id: clean(value.id) ?? clean(value.placeId) ?? `eta-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    provider: (clean(value.provider) as NavigationProvider) ?? 'google_maps',
    destinationLabel: label,
    distanceLabel: clean(value.distanceLabel) ?? clean(distance.text) ?? 'Distance TBA',
    durationLabel: clean(value.durationLabel) ?? clean(duration.text) ?? 'ETA TBA',
  };
}

export function normalizeGeocodeResult(value: unknown): NormalizedGeocodeResult | null {
  if (!isRecord(value)) return null;
  const geometry = isRecord(value.geometry) ? value.geometry : {};
  const location = isRecord(geometry.location) ? geometry.location : {};
  const lat = num(value.lat ?? location.lat);
  const lng = num(value.lng ?? location.lng);
  const label = clean(value.label ?? value.formatted_address ?? value.name);
  if (!label || lat === undefined || lng === undefined) return null;
  return { id: clean(value.id) ?? clean(value.placeId ?? value.place_id) ?? `geo-${lat},${lng}`, provider: (clean(value.provider) as NavigationProvider) ?? 'google_maps', label, lat, lng, ...(clean(value.placeId ?? value.place_id) ? { placeId: clean(value.placeId ?? value.place_id)! } : {}) };
}

export const normalizeNavigationRoutes = (response: unknown): NormalizedNavigationRoute[] => rowsFrom(response, ['routes', 'items']).map(normalizeNavigationRoute).filter((row): row is NormalizedNavigationRoute => Boolean(row));
export const normalizeNavigationEtas = (response: unknown): NormalizedNavigationEta[] => rowsFrom(response, ['etas', 'destinations', 'rows', 'items']).map(normalizeNavigationEta).filter((row): row is NormalizedNavigationEta => Boolean(row));
export const normalizeGeocodeResults = (response: unknown): NormalizedGeocodeResult[] => rowsFrom(response, ['results', 'places', 'items']).map(normalizeGeocodeResult).filter((row): row is NormalizedGeocodeResult => Boolean(row));

export async function loadNavigationRoutesViaRpc(trpcClient: NavigationTrpcLike, input: NavigationRouteInput, fallback: NormalizedNavigationRoute[] = []) {
  try { const routes = normalizeNavigationRoutes(await trpcClient.navigation?.route?.query({ ...input, providers: LOCKED_NAV_PROVIDERS })); if (routes.length) return { source: 'backend' as const, provider: 'google_maps' as const, routes }; } catch {}
  return { source: 'fallback' as const, provider: 'bytspot_curated' as const, routes: fallback };
}

export async function loadNavigationEtasViaRpc(trpcClient: NavigationTrpcLike, input: NavigationEtaInput, fallback: NormalizedNavigationEta[] = []) {
  try { const etas = normalizeNavigationEtas(await trpcClient.navigation?.eta?.query({ ...input, providers: LOCKED_NAV_PROVIDERS })); if (etas.length) return { source: 'backend' as const, provider: 'google_maps' as const, etas }; } catch {}
  return { source: 'fallback' as const, provider: 'bytspot_curated' as const, etas: fallback };
}

export async function geocodeViaRpc(trpcClient: NavigationTrpcLike, input: NavigationGeocodeInput, fallback: NormalizedGeocodeResult[] = []) {
  try { const results = normalizeGeocodeResults(await trpcClient.navigation?.geocode?.query({ ...input, providers: LOCKED_NAV_PROVIDERS })); if (results.length) return { source: 'backend' as const, provider: 'google_maps' as const, results }; } catch {}
  return { source: 'fallback' as const, provider: 'bytspot_curated' as const, results: fallback };
}