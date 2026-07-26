export type ParkingProvider = 'spothero' | 'parkwhiz' | 'parkmobile' | 'bytspot_vendor' | 'google_places';
export type ParkingSource = 'backend' | 'fallback';
export type ParkingReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'failed';

export interface ParkingSearchInput { location?: { lat: number; lng: number; radiusMiles?: number }; venueId?: string; eventId?: string; startAt?: string; endAt?: string; providers?: ParkingProvider[]; limit?: number }
export interface ParkingQuoteInput { listingId: string; startAt?: string; endAt?: string; providers?: ParkingProvider[] }
export interface ParkingReserveInput { quoteId: string; listingId: string; idempotencyKey: string; providers?: ParkingProvider[] }
export interface ParkingAvailabilityInput { listingIds?: string[]; location?: { lat: number; lng: number }; providers?: ParkingProvider[] }
export interface ParkingCancelInput { reservationId: string; reason?: string; providers?: ParkingProvider[] }

export interface NormalizedParkingListing { id: string; provider: ParkingProvider; title: string; address?: string; distanceLabel?: string; priceLabel: string; availabilityLabel: string; available: boolean; reservable: boolean; deeplinkUrl?: string }
export interface NormalizedParkingQuote { id: string; provider: ParkingProvider; listingId: string; totalLabel: string; currency?: string; totalCents?: number; expiresAt?: string; cancellationLabel?: string }
export interface NormalizedParkingReservation { id: string; provider: ParkingProvider; listingId?: string; quoteId?: string; status: ParkingReservationStatus; confirmationCode?: string; arrivalLabel?: string; cancelByLabel?: string }

export const PARKING_RESERVATION_RPC_CONTRACT = {
  routes: { search: 'parking.search', quote: 'parking.quote', reserve: 'parking.reserve', availability: 'parking.availability', cancel: 'parking.cancel' },
  providers: ['spothero', 'parkwhiz', 'parkmobile', 'bytspot_vendor', 'google_places'],
  note: 'Backend owns parking marketplace credentials; clients receive normalized listing/quote/reservation DTOs.',
} as const;

type ProcedureLike<TInput, TOutput> = { query?: (input: TInput) => Promise<TOutput>; mutate?: (input: TInput) => Promise<TOutput> };
type ParkingTrpcLike = { parking?: { search?: ProcedureLike<ParkingSearchInput, unknown>; quote?: ProcedureLike<ParkingQuoteInput, unknown>; reserve?: ProcedureLike<ParkingReserveInput, unknown>; availability?: ProcedureLike<ParkingAvailabilityInput, unknown>; cancel?: ProcedureLike<ParkingCancelInput, unknown> } };
type AnyRecord = Record<string, unknown>;

const LOCKED_PARKING_PROVIDERS: ParkingProvider[] = ['spothero', 'parkwhiz', 'parkmobile', 'bytspot_vendor', 'google_places'];
const isRecord = (value: unknown): value is AnyRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const cents = (value: unknown): number | undefined => Number.isFinite(Number(value)) ? Math.round(Number(value)) : undefined;
const price = (row: AnyRecord): string => clean(row.priceLabel ?? row.price) ?? (cents(row.totalCents ?? row.amountCents) ? `$${Math.round((cents(row.totalCents ?? row.amountCents) ?? 0) / 100)}` : 'Quote required');
const rowsFrom = (response: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(response)) return response;
  const root = isRecord(response) ? response : {};
  for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[];
  return [];
};
async function call<TInput>(procedure: ProcedureLike<TInput, unknown> | undefined, input: TInput): Promise<unknown> { return procedure?.query ? procedure.query(input) : procedure?.mutate?.(input); }

export function normalizeParkingListing(value: unknown): NormalizedParkingListing | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.listingId ?? value.facilityId);
  const title = clean(value.title ?? value.name ?? value.facilityName);
  if (!id || !title) return null;
  const available = value.available === false || value.status === 'full' ? false : true;
  return { id, provider: (clean(value.provider) as ParkingProvider) ?? 'spothero', title, ...(clean(value.address) ? { address: clean(value.address)! } : {}), ...(clean(value.distanceLabel) ? { distanceLabel: clean(value.distanceLabel)! } : {}), priceLabel: price(value), availabilityLabel: clean(value.availabilityLabel) ?? (available ? 'Available' : 'Full'), available, reservable: value.reservable !== false && available, ...(clean(value.deeplinkUrl ?? value.url) ? { deeplinkUrl: clean(value.deeplinkUrl ?? value.url)! } : {}) };
}

export function normalizeParkingQuote(value: unknown): NormalizedParkingQuote | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.quoteId);
  const listingId = clean(value.listingId ?? value.facilityId);
  if (!id || !listingId) return null;
  const totalCents = cents(value.totalCents ?? value.amountCents);
  return { id, provider: (clean(value.provider) as ParkingProvider) ?? 'spothero', listingId, totalLabel: clean(value.totalLabel) ?? (totalCents ? `$${Math.round(totalCents / 100)}` : price(value)), ...(clean(value.currency) ? { currency: clean(value.currency)! } : {}), ...(totalCents ? { totalCents } : {}), ...(clean(value.expiresAt) ? { expiresAt: clean(value.expiresAt)! } : {}), ...(clean(value.cancellationLabel) ? { cancellationLabel: clean(value.cancellationLabel)! } : {}) };
}

export function normalizeParkingReservation(value: unknown): NormalizedParkingReservation | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.reservationId ?? value.bookingId);
  if (!id) return null;
  const rawStatus = clean(value.status)?.toLowerCase();
  const status: ParkingReservationStatus = rawStatus === 'cancelled' || rawStatus === 'failed' || rawStatus === 'pending' ? rawStatus : 'confirmed';
  return { id, provider: (clean(value.provider) as ParkingProvider) ?? 'spothero', ...(clean(value.listingId) ? { listingId: clean(value.listingId)! } : {}), ...(clean(value.quoteId) ? { quoteId: clean(value.quoteId)! } : {}), status, ...(clean(value.confirmationCode ?? value.code) ? { confirmationCode: clean(value.confirmationCode ?? value.code)! } : {}), ...(clean(value.arrivalLabel) ? { arrivalLabel: clean(value.arrivalLabel)! } : {}), ...(clean(value.cancelByLabel) ? { cancelByLabel: clean(value.cancelByLabel)! } : {}) };
}

export const normalizeParkingListings = (response: unknown): NormalizedParkingListing[] => rowsFrom(response, ['listings', 'parking', 'items', 'results']).map(normalizeParkingListing).filter((row): row is NormalizedParkingListing => Boolean(row));
export const normalizeParkingQuotes = (response: unknown): NormalizedParkingQuote[] => (isRecord(response) && !Array.isArray(response.quotes) && (response.quoteId || response.id) ? [response] : rowsFrom(response, ['quotes', 'items'])).map(normalizeParkingQuote).filter((row): row is NormalizedParkingQuote => Boolean(row));
export const normalizeParkingReservations = (response: unknown): NormalizedParkingReservation[] => (isRecord(response) && !Array.isArray(response.reservations) && (response.reservationId || response.id) ? [response] : rowsFrom(response, ['reservations', 'items'])).map(normalizeParkingReservation).filter((row): row is NormalizedParkingReservation => Boolean(row));

export async function searchParkingViaRpc(trpcClient: ParkingTrpcLike, input: ParkingSearchInput, fallback: NormalizedParkingListing[] = []) { try { const listings = normalizeParkingListings(await call(trpcClient.parking?.search, { ...input, providers: LOCKED_PARKING_PROVIDERS })); if (listings.length) return { source: 'backend' as const, provider: 'spothero' as const, listings }; } catch {} return { source: 'fallback' as const, provider: 'google_places' as const, listings: fallback }; }
export async function quoteParkingViaRpc(trpcClient: ParkingTrpcLike, input: ParkingQuoteInput, fallback: NormalizedParkingQuote[] = []) { try { const quotes = normalizeParkingQuotes(await call(trpcClient.parking?.quote, { ...input, providers: LOCKED_PARKING_PROVIDERS })); if (quotes.length) return { source: 'backend' as const, provider: 'spothero' as const, quotes }; } catch {} return { source: 'fallback' as const, provider: 'google_places' as const, quotes: fallback }; }
export async function reserveParkingViaRpc(trpcClient: ParkingTrpcLike, input: ParkingReserveInput, fallback: NormalizedParkingReservation[] = []) { try { const reservations = normalizeParkingReservations(await call(trpcClient.parking?.reserve, { ...input, providers: LOCKED_PARKING_PROVIDERS })); if (reservations.length) return { source: 'backend' as const, provider: 'spothero' as const, reservations }; } catch {} return { source: 'fallback' as const, provider: 'google_places' as const, reservations: fallback }; }
export async function parkingAvailabilityViaRpc(trpcClient: ParkingTrpcLike, input: ParkingAvailabilityInput, fallback: NormalizedParkingListing[] = []) { try { const listings = normalizeParkingListings(await call(trpcClient.parking?.availability, { ...input, providers: LOCKED_PARKING_PROVIDERS })); if (listings.length) return { source: 'backend' as const, provider: 'spothero' as const, listings }; } catch {} return { source: 'fallback' as const, provider: 'google_places' as const, listings: fallback }; }
export async function cancelParkingViaRpc(trpcClient: ParkingTrpcLike, input: ParkingCancelInput, fallback: NormalizedParkingReservation[] = []) { try { const reservations = normalizeParkingReservations(await call(trpcClient.parking?.cancel, { ...input, providers: LOCKED_PARKING_PROVIDERS })); if (reservations.length) return { source: 'backend' as const, provider: 'spothero' as const, reservations }; } catch {} return { source: 'fallback' as const, provider: 'google_places' as const, reservations: fallback }; }