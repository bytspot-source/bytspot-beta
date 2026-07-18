export type EventCategory = 'concert' | 'rooftop' | 'happyhour' | 'comedy' | 'art' | 'food' | 'sports';
export type EventFeedSource = 'backend' | 'fallback';
export type EventProvider = 'ticketmaster' | 'bytspot_curated';

export interface AppEvent {
  id: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  category: EventCategory;
  emoji: string;
  price: string;
  image: string;
  url?: string;
}

export interface EventsListRpcInput {
  query?: string;
  category?: string;
  city?: string;
  location?: { lat: number; lng: number; radiusMiles?: number };
  startDateTime?: string;
  endDateTime?: string;
  providers?: EventProvider[];
  limit?: number;
}

export interface EventsListRpcResponse {
  source: EventFeedSource;
  provider: EventProvider | 'fallback';
  events: AppEvent[];
}

export const EVENT_DISCOVERY_RPC_CONTRACT = {
  route: 'events.list',
  provider: 'ticketmaster',
  input: 'EventsListRpcInput',
  output: 'EventsListRpcResponse',
  note: 'Backend owns Ticketmaster credentials; clients request normalized event cards for Parker/native/App Clip surfaces.',
} as const;

type ProcedureLike<TInput, TOutput> = { query(input: TInput): Promise<TOutput> };
type EventsTrpcLike = { events?: { list?: ProcedureLike<EventsListRpcInput, unknown> } };

const DEFAULT_EVENT_IMAGE = 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringFrom(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function categoryFrom(value: unknown): EventCategory {
  const raw = stringFrom(value)?.toLowerCase() ?? '';
  if (/sport|soccer|football|basketball|baseball|hockey/.test(raw)) return 'sports';
  if (/comedy/.test(raw)) return 'comedy';
  if (/art|museum|gallery/.test(raw)) return 'art';
  if (/food|dining|restaurant|brunch/.test(raw)) return 'food';
  if (/rooftop|nightlife|club|lounge/.test(raw)) return 'rooftop';
  if (/happy/.test(raw)) return 'happyhour';
  return 'concert';
}

function emojiForCategory(category: EventCategory): string {
  return ({ concert: '🎵', rooftop: '🌃', happyhour: '🍻', comedy: '😂', art: '🎨', food: '🍽️', sports: '🏟️' })[category];
}

function formatLocalTime(value: unknown): string | null {
  const raw = stringFrom(value);
  if (!raw) return null;
  const match = raw.match(/^([0-9]{2}):([0-9]{2})/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function priceLabel(raw: Record<string, unknown>): string {
  const direct = stringFrom(raw.price ?? raw.priceLabel);
  if (direct) return direct;
  const ranges = Array.isArray(raw.priceRanges) ? raw.priceRanges : [];
  const first = ranges.find(isRecord);
  const min = Number(first?.min);
  if (Number.isFinite(min) && min > 0) return `${first?.currency === 'USD' || !first?.currency ? '$' : `${first.currency} `}${Math.round(min)}`;
  return 'Tickets';
}

function ticketmasterVenue(raw: Record<string, unknown>): string | null {
  const embedded = isRecord(raw._embedded) ? raw._embedded : null;
  const venues = Array.isArray(embedded?.venues) ? embedded?.venues : [];
  const first = venues.find(isRecord);
  return stringFrom(first?.name);
}

function ticketmasterCategory(raw: Record<string, unknown>): EventCategory {
  const classifications = Array.isArray(raw.classifications) ? raw.classifications : [];
  const first = classifications.find(isRecord);
  const segment = isRecord(first?.segment) ? stringFrom(first.segment.name) : null;
  const genre = isRecord(first?.genre) ? stringFrom(first.genre.name) : null;
  return categoryFrom(genre ?? segment ?? raw.category);
}

export function normalizeEventRow(value: unknown): AppEvent | null {
  if (!isRecord(value)) return null;
  const dates = isRecord(value.dates) ? value.dates : null;
  const start = isRecord(dates?.start) ? dates.start : null;
  const category = ticketmasterCategory(value);
  const images = Array.isArray(value.images) ? value.images : [];
  const firstImage = images.find(isRecord);
  const title = stringFrom(value.title ?? value.name);
  const id = stringFrom(value.id);
  if (!title || !id) return null;
  return {
    id,
    title,
    venue: stringFrom(value.venue) ?? ticketmasterVenue(value) ?? 'Venue TBA',
    date: stringFrom(value.date) ?? stringFrom(start?.localDate) ?? 'Tonight',
    time: stringFrom(value.time) ?? formatLocalTime(start?.localTime) ?? 'TBA',
    category,
    emoji: stringFrom(value.emoji) ?? emojiForCategory(category),
    price: priceLabel(value),
    image: stringFrom(value.image) ?? stringFrom(firstImage?.url) ?? DEFAULT_EVENT_IMAGE,
    ...(stringFrom(value.url) ? { url: stringFrom(value.url)! } : {}),
  };
}

export function normalizeEventsResponse(response: unknown): AppEvent[] {
  const root = isRecord(response) ? response : {};
  const embedded = isRecord(root._embedded) ? root._embedded : null;
  const rows = Array.isArray(root.events) ? root.events : Array.isArray(root.items) ? root.items : Array.isArray(embedded?.events) ? embedded.events : Array.isArray(response) ? response : [];
  return rows.map(normalizeEventRow).filter((event): event is AppEvent => Boolean(event));
}

export async function loadEventsViaRpc(
  trpcClient: EventsTrpcLike,
  input: EventsListRpcInput = {},
  fallbackEvents: AppEvent[] = [],
): Promise<EventsListRpcResponse> {
  try {
    const response = await trpcClient.events?.list?.query({ ...input, providers: ['ticketmaster', 'bytspot_curated'] });
    const events = normalizeEventsResponse(response);
    if (events.length > 0) return { source: 'backend', provider: 'ticketmaster', events };
  } catch {
    // Event provider may be unavailable in preview/dev; keep Parker usable with curated events.
  }
  return { source: 'fallback', provider: 'fallback', events: fallbackEvents };
}