export type OrderingProvider = 'toast' | 'square' | 'clover' | 'bytspot_vendor';
export type TableProvider = 'opentable' | 'resy' | 'sevenrooms' | 'bytspot_vendor';
export type AdapterSource = 'backend' | 'fallback';
export type OrderStatus = 'draft' | 'quoted' | 'payment_pending' | 'confirmed' | 'cancelled' | 'failed';

export interface MenusListInput { venueId?: string; location?: { lat: number; lng: number }; providers?: OrderingProvider[] }
export interface MenuGetInput { menuId: string; venueId?: string; providers?: OrderingProvider[] }
export interface OrderQuoteInput { venueId: string; menuId: string; items: Array<{ itemId: string; quantity: number }>; fulfillment?: 'pickup' | 'delivery' | 'dine_in'; providers?: OrderingProvider[] }
export interface OrderCreateInput extends OrderQuoteInput { quoteId: string; idempotencyKey: string }
export interface TableSearchInput { venueId: string; partySize: number; date: string; providers?: TableProvider[] }
export interface TableReserveInput { slotId: string; venueId: string; partySize: number; idempotencyKey: string; providers?: TableProvider[] }

export interface NormalizedMenuItem { id: string; name: string; priceLabel: string; description?: string; available: boolean }
export interface NormalizedMenuSection { id: string; title: string; items: NormalizedMenuItem[] }
export interface NormalizedMenu { id: string; provider: OrderingProvider; venueId: string; venueName: string; title: string; currencyCode: string; sections: NormalizedMenuSection[] }
export interface NormalizedOrderQuote { id: string; provider: OrderingProvider; totalLabel: string; fulfillmentLabel: string; expiresAt?: string }
export interface NormalizedOrder { id: string; provider: OrderingProvider; status: OrderStatus; orderCode?: string; totalLabel?: string; fulfillmentLabel?: string }
export interface NormalizedTableSlot { id: string; provider: TableProvider; timeLabel: string; partySize: number; deeplinkUrl?: string }
export interface NormalizedTableReservation { id: string; provider: TableProvider; status: 'pending' | 'confirmed' | 'cancelled' | 'failed'; confirmationCode?: string; timeLabel?: string }

export const ORDERING_RPC_CONTRACT = {
  routes: { menusList: 'menus.list', menusGet: 'menus.get', ordersQuote: 'orders.quote', ordersCreate: 'orders.create', tablesSearch: 'tables.search', tablesReserve: 'tables.reserve' },
  menuProviders: ['toast', 'square', 'clover', 'bytspot_vendor'],
  tableProviders: ['opentable', 'resy', 'sevenrooms', 'bytspot_vendor'],
  note: 'Backend owns menu/order/table provider credentials; clients consume normalized menu, order, and reservation DTOs.',
} as const;

type ProcedureLike<TInput, TOutput> = { query?: (input: TInput) => Promise<TOutput>; mutate?: (input: TInput) => Promise<TOutput> };
type OrderingTrpcLike = { menus?: { list?: ProcedureLike<MenusListInput, unknown>; get?: ProcedureLike<MenuGetInput, unknown> }; orders?: { quote?: ProcedureLike<OrderQuoteInput, unknown>; create?: ProcedureLike<OrderCreateInput, unknown> }; tables?: { search?: ProcedureLike<TableSearchInput, unknown>; reserve?: ProcedureLike<TableReserveInput, unknown> } };
type AnyRecord = Record<string, unknown>;

const LOCKED_MENU_PROVIDERS: OrderingProvider[] = ['toast', 'square', 'clover', 'bytspot_vendor'];
const LOCKED_TABLE_PROVIDERS: TableProvider[] = ['opentable', 'resy', 'sevenrooms', 'bytspot_vendor'];
const isRecord = (value: unknown): value is AnyRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const cents = (value: unknown): number | undefined => Number.isFinite(Number(value)) ? Math.round(Number(value)) : undefined;
const price = (row: AnyRecord): string => clean(row.priceLabel ?? row.price) ?? (cents(row.priceCents ?? row.totalCents) ? `$${Math.round((cents(row.priceCents ?? row.totalCents) ?? 0) / 100)}` : 'Price TBA');
const rowsFrom = (response: unknown, keys: string[]): unknown[] => { if (Array.isArray(response)) return response; const root = isRecord(response) ? response : {}; for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]; return []; };
async function call<TInput>(procedure: ProcedureLike<TInput, unknown> | undefined, input: TInput): Promise<unknown> { return procedure?.query ? procedure.query(input) : procedure?.mutate?.(input); }

function normalizeMenuItem(value: unknown): NormalizedMenuItem | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.itemId ?? value.guid);
  const name = clean(value.name ?? value.title);
  if (!id || !name) return null;
  return { id, name, priceLabel: price(value), ...(clean(value.description) ? { description: clean(value.description)! } : {}), available: value.available !== false && value.soldOut !== true };
}

function normalizeSection(value: unknown, index = 0): NormalizedMenuSection | null {
  if (!isRecord(value)) return null;
  const items = rowsFrom(value, ['items', 'menuItems']).map(normalizeMenuItem).filter((row): row is NormalizedMenuItem => Boolean(row));
  const title = clean(value.title ?? value.name) ?? `Section ${index + 1}`;
  return { id: clean(value.id ?? value.sectionId) ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, items };
}

export function normalizeMenu(value: unknown): NormalizedMenu | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.menuId);
  const venueId = clean(value.venueId ?? value.restaurantId ?? value.merchantId);
  if (!id || !venueId) return null;
  const sections = rowsFrom(value, ['sections', 'groups', 'categories']).map((row, index) => normalizeSection(row, index)).filter((row): row is NormalizedMenuSection => Boolean(row));
  return { id, provider: (clean(value.provider) as OrderingProvider) ?? 'toast', venueId, venueName: clean(value.venueName ?? value.restaurantName ?? value.merchantName) ?? 'Restaurant', title: clean(value.title ?? value.name) ?? 'Menu', currencyCode: clean(value.currencyCode ?? value.currency) ?? 'USD', sections };
}

export function normalizeOrderQuote(value: unknown): NormalizedOrderQuote | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.quoteId);
  if (!id) return null;
  return { id, provider: (clean(value.provider) as OrderingProvider) ?? 'toast', totalLabel: clean(value.totalLabel) ?? price(value), fulfillmentLabel: clean(value.fulfillmentLabel) ?? 'Confirm with venue', ...(clean(value.expiresAt) ? { expiresAt: clean(value.expiresAt)! } : {}) };
}

export function normalizeOrder(value: unknown): NormalizedOrder | null {
  if (!isRecord(value)) return null;
  const id = clean(value.id ?? value.orderId);
  if (!id) return null;
  const raw = clean(value.status)?.toLowerCase();
  const status: OrderStatus = raw === 'draft' || raw === 'quoted' || raw === 'payment_pending' || raw === 'cancelled' || raw === 'failed' ? raw : 'confirmed';
  return { id, provider: (clean(value.provider) as OrderingProvider) ?? 'toast', status, ...(clean(value.orderCode ?? value.code) ? { orderCode: clean(value.orderCode ?? value.code)! } : {}), ...(clean(value.totalLabel) ? { totalLabel: clean(value.totalLabel)! } : {}), ...(clean(value.fulfillmentLabel) ? { fulfillmentLabel: clean(value.fulfillmentLabel)! } : {}) };
}

export function normalizeTableSlot(value: unknown): NormalizedTableSlot | null { if (!isRecord(value)) return null; const id = clean(value.id ?? value.slotId); const timeLabel = clean(value.timeLabel ?? value.time); const partySize = Number(value.partySize ?? value.covers); if (!id || !timeLabel || !Number.isFinite(partySize)) return null; return { id, provider: (clean(value.provider) as TableProvider) ?? 'opentable', timeLabel, partySize, ...(clean(value.deeplinkUrl ?? value.url) ? { deeplinkUrl: clean(value.deeplinkUrl ?? value.url)! } : {}) }; }
export function normalizeTableReservation(value: unknown): NormalizedTableReservation | null { if (!isRecord(value)) return null; const id = clean(value.id ?? value.reservationId); if (!id) return null; const raw = clean(value.status)?.toLowerCase(); const status = raw === 'pending' || raw === 'cancelled' || raw === 'failed' ? raw : 'confirmed'; return { id, provider: (clean(value.provider) as TableProvider) ?? 'opentable', status, ...(clean(value.confirmationCode ?? value.code) ? { confirmationCode: clean(value.confirmationCode ?? value.code)! } : {}), ...(clean(value.timeLabel ?? value.time) ? { timeLabel: clean(value.timeLabel ?? value.time)! } : {}) }; }

export const normalizeMenus = (response: unknown): NormalizedMenu[] => (isRecord(response) && (response.menuId || response.id) && !Array.isArray(response.menus) ? [response] : rowsFrom(response, ['menus', 'items'])).map(normalizeMenu).filter((row): row is NormalizedMenu => Boolean(row));
export const normalizeOrderQuotes = (response: unknown): NormalizedOrderQuote[] => (isRecord(response) && (response.quoteId || response.id) && !Array.isArray(response.quotes) ? [response] : rowsFrom(response, ['quotes', 'items'])).map(normalizeOrderQuote).filter((row): row is NormalizedOrderQuote => Boolean(row));
export const normalizeOrders = (response: unknown): NormalizedOrder[] => (isRecord(response) && (response.orderId || response.id) && !Array.isArray(response.orders) ? [response] : rowsFrom(response, ['orders', 'items'])).map(normalizeOrder).filter((row): row is NormalizedOrder => Boolean(row));
export const normalizeTableSlots = (response: unknown): NormalizedTableSlot[] => rowsFrom(response, ['slots', 'times', 'items']).map(normalizeTableSlot).filter((row): row is NormalizedTableSlot => Boolean(row));
export const normalizeTableReservations = (response: unknown): NormalizedTableReservation[] => (isRecord(response) && (response.reservationId || response.id) && !Array.isArray(response.reservations) ? [response] : rowsFrom(response, ['reservations', 'items'])).map(normalizeTableReservation).filter((row): row is NormalizedTableReservation => Boolean(row));

export async function listMenusViaRpc(trpcClient: OrderingTrpcLike, input: MenusListInput, fallback: NormalizedMenu[] = []) { try { const menus = normalizeMenus(await call(trpcClient.menus?.list, { ...input, providers: LOCKED_MENU_PROVIDERS })); if (menus.length) return { source: 'backend' as const, provider: 'toast' as const, menus }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, menus: fallback }; }
export async function getMenuViaRpc(trpcClient: OrderingTrpcLike, input: MenuGetInput, fallback: NormalizedMenu[] = []) { try { const menus = normalizeMenus(await call(trpcClient.menus?.get, { ...input, providers: LOCKED_MENU_PROVIDERS })); if (menus.length) return { source: 'backend' as const, provider: 'toast' as const, menu: menus[0] }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, menu: fallback[0] ?? null }; }
export async function quoteOrderViaRpc(trpcClient: OrderingTrpcLike, input: OrderQuoteInput, fallback: NormalizedOrderQuote[] = []) { try { const quotes = normalizeOrderQuotes(await call(trpcClient.orders?.quote, { ...input, providers: LOCKED_MENU_PROVIDERS })); if (quotes.length) return { source: 'backend' as const, provider: 'toast' as const, quotes }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, quotes: fallback }; }
export async function createOrderViaRpc(trpcClient: OrderingTrpcLike, input: OrderCreateInput, fallback: NormalizedOrder[] = []) { try { const orders = normalizeOrders(await call(trpcClient.orders?.create, { ...input, providers: LOCKED_MENU_PROVIDERS })); if (orders.length) return { source: 'backend' as const, provider: 'toast' as const, orders }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, orders: fallback }; }
export async function searchTablesViaRpc(trpcClient: OrderingTrpcLike, input: TableSearchInput, fallback: NormalizedTableSlot[] = []) { try { const slots = normalizeTableSlots(await call(trpcClient.tables?.search, { ...input, providers: LOCKED_TABLE_PROVIDERS })); if (slots.length) return { source: 'backend' as const, provider: 'opentable' as const, slots }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, slots: fallback }; }
export async function reserveTableViaRpc(trpcClient: OrderingTrpcLike, input: TableReserveInput, fallback: NormalizedTableReservation[] = []) { try { const reservations = normalizeTableReservations(await call(trpcClient.tables?.reserve, { ...input, providers: LOCKED_TABLE_PROVIDERS })); if (reservations.length) return { source: 'backend' as const, provider: 'opentable' as const, reservations }; } catch {} return { source: 'fallback' as const, provider: 'bytspot_vendor' as const, reservations: fallback }; }