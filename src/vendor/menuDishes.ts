import type { AuthorizedFetch } from './setupTransport.ts';
import { VENDOR_API_BASE_URL } from './authTransport.ts';
import { MEDIA_MAX_IMAGE_BYTES, MEDIA_MAX_MENU_BYTES, MEDIA_MENU_MIME, vendorCanEditMedia } from './media.ts';
import { canSeeLocation, type VendorSession } from './seller.ts';

export type MenuReviewStatus = 'pending' | 'approved' | 'rejected';
export interface MenuDish {
  id: string; dishName: string; aliases: string[]; mediaId: string; sourceUrl: string;
  reviewStatus: MenuReviewStatus; reviewNote: string | null; reviewedAt: string | null;
  updatedAt: string; mediaUpdatedAt: string; mediaReviewStatus: MenuReviewStatus;
}
export interface MenuDishList { venueId: string | null; dishes: MenuDish[] }
export interface MenuSubmission { mediaId: string; dishName: string; aliases: string[]; dishId?: string; expectedUpdatedAt?: string }
export interface MenuQueueDish extends MenuDish {
  locationId: string; locationLabel: string; address: string | null; sellerId: string; business: string;
  venueId: string | null; venueName: string | null; venueAddress: string | null; venueDiscoverable: boolean;
}
export interface MenuVenue { venueId: string; name: string; address: string }
export const MENU_REVIEW_NOTICE = 'Optional evidence: “Listed on reviewed menu.” Review expires after 30 days. This does not verify quality, availability or ingredients.';
export const MENU_REVIEW_MS = 30 * 86400000;
export function canManageMenuDishes(session: VendorSession, locationId: string): boolean {
  return session.seat.state === 'ACTIVE' && session.seat.sellerId === session.seller.id
    && canSeeLocation(session, locationId) && vendorCanEditMedia(session);
}
/** The DTO omits reviewedVenueId/sourceUpdatedAt: never assert discovery eligibility from it. */
export function menuReviewLabel(dish: MenuDish, now = Date.now()): string {
  if (dish.reviewStatus !== 'approved') return dish.reviewStatus;
  const reviewed = dish.reviewedAt ? Date.parse(dish.reviewedAt) : NaN;
  if (!Number.isFinite(reviewed) || reviewed > now) return 'Approved record — needs re-review';
  if (dish.mediaReviewStatus !== 'approved' || Date.parse(dish.mediaUpdatedAt) > reviewed) return 'Approved record — source changed; needs re-review';
  if (now - reviewed >= MENU_REVIEW_MS) return 'Expired approval — needs re-review';
  return 'Approved record — current evidence eligibility is not verified here';
}
export const MENU_ALIAS_NOTICE = 'Exact dish-name and alias word matching only; no fuzzy guesses. Add only names shown on the source menu.';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const status = (v: unknown): v is MenuReviewStatus => v === 'pending' || v === 'approved' || v === 'rejected';
const version = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](\d\d):(\d\d))$/.exec(v);
  if (!m || !Number.isFinite(Date.parse(v))) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60
    && (m[7] === undefined || (Number(m[7]) < 24 && Number(m[8]) < 60));
};
const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
const nullableVersion = (v: unknown): v is string | null => v === null || version(v);
const nullableId = (v: unknown): v is string | null => v === null || id(v);
const revision = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]*$/.test(v)
  && Number.isSafeInteger(Number(v)) && String(Number(v)) === v;
export function validDishText(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 120 && v.trim().length > 0
    && !/[\p{C}\p{Zl}\p{Zp}<>@]/u.test(v)
    && !/(?:[a-z][a-z0-9+.-]*:\/\/|(?:https?|mailto|tel|data|javascript):|www\.|[\p{L}\p{N}-]+\.[\p{L}]{2,}(?:[^\p{L}\p{N}]|$))/iu.test(v)
    && !/(?:\d[ .()+-]*){7,}/u.test(v);
}
/** Never navigate a server URL. Reconstruct only our exact, revision-bound source route. */
export function menuSourcePath(raw: unknown, mediaId: string, expectedRevision?: string, apiBase = VENDOR_API_BASE_URL): string | undefined {
  if (typeof raw !== 'string' || !id(mediaId) || (expectedRevision !== undefined && !revision(expectedRevision))) return;
  try {
    const url = raw.startsWith('/') ? undefined : new URL(raw);
    const pathname = url ? url.pathname : raw;
    const prefix = `/media/menu-source/${encodeURIComponent(mediaId)}/`;
    if (!pathname.startsWith(prefix)) return;
    const sourceRevision = pathname.slice(prefix.length);
    if (!revision(sourceRevision) || (expectedRevision !== undefined && sourceRevision !== expectedRevision)) return;
    const path = `${prefix}${sourceRevision}`;
    if (raw === path) return path;
    if (!url) return;
    const base = new URL(apiBase);
    const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if ((base.protocol === 'https:' || localHttp) && !base.username && !base.password && !base.search && !base.hash
      && base.pathname === '/' && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash
      && raw === `${base.origin}${path}`) return path;
  } catch { /* Not a source route. */ }
}
export function parseMenuDish(raw: unknown): MenuDish {
  if (!record(raw) || !id(raw.id) || !id(raw.mediaId) || !validDishText(raw.dishName)
    || !Array.isArray(raw.aliases) || raw.aliases.length > 5 || !raw.aliases.every(validDishText)
    || !status(raw.reviewStatus) || !status(raw.mediaReviewStatus) || !nullableText(raw.reviewNote)
    || (raw.reviewNote !== null && raw.reviewNote.length > 280)
    || !nullableVersion(raw.reviewedAt) || !version(raw.updatedAt) || !version(raw.mediaUpdatedAt)) throw new Error('Invalid menu reply');
  const sourceUrl = menuSourcePath(raw.sourceUrl, raw.mediaId, String(Date.parse(raw.mediaUpdatedAt)));
  if (!sourceUrl) throw new Error('Invalid menu source');
  return { id: raw.id, mediaId: raw.mediaId, dishName: raw.dishName, aliases: raw.aliases,
    sourceUrl, reviewStatus: raw.reviewStatus, mediaReviewStatus: raw.mediaReviewStatus, reviewNote: raw.reviewNote,
    reviewedAt: raw.reviewedAt, updatedAt: raw.updatedAt, mediaUpdatedAt: raw.mediaUpdatedAt };
}
export function parseMenuList(raw: unknown): MenuDishList {
  if (!record(raw) || !nullableId(raw.venueId) || !Array.isArray(raw.dishes) || raw.dishes.length > 100) throw new Error('Invalid menu reply');
  const dishes = raw.dishes.map(parseMenuDish);
  if (new Set(dishes.map((dish) => dish.id)).size !== dishes.length) throw new Error('Duplicate dishes');
  return { venueId: raw.venueId, dishes };
}
export function parseMenuQueue(raw: unknown): MenuQueueDish[] {
  if (!record(raw) || !Array.isArray(raw.dishes) || raw.dishes.length > 200) throw new Error('Invalid queue');
  const dishes = raw.dishes.map((row: unknown) => {
    const dish = parseMenuDish(row);
    if (!record(row) || !id(row.locationId) || !id(row.sellerId) || typeof row.locationLabel !== 'string'
      || typeof row.business !== 'string' || !nullableText(row.address) || !nullableId(row.venueId)
      || !nullableText(row.venueName) || !nullableText(row.venueAddress) || typeof row.venueDiscoverable !== 'boolean') throw new Error('Invalid queue');
    return { ...dish, locationId: row.locationId, sellerId: row.sellerId, locationLabel: row.locationLabel,
      business: row.business, address: row.address, venueId: row.venueId, venueName: row.venueName,
      venueAddress: row.venueAddress, venueDiscoverable: row.venueDiscoverable };
  });
  if (new Set(dishes.map((dish) => dish.id)).size !== dishes.length) throw new Error('Duplicate dishes');
  return dishes;
}
export function parseMenuVenues(raw: unknown): MenuVenue[] {
  if (!record(raw) || !Array.isArray(raw.venues) || raw.venues.length > 20) throw new Error('Invalid venues');
  const venues = raw.venues.map((v: unknown) => {
    if (!record(v) || !id(v.venueId) || typeof v.name !== 'string' || typeof v.address !== 'string') throw new Error('Invalid venue');
    return { venueId: v.venueId, name: v.name, address: v.address };
  });
  if (new Set(venues.map((venue) => venue.venueId)).size !== venues.length) throw new Error('Duplicate venues');
  return venues;
}
export function submissionProblem(input: MenuSubmission): string | undefined {
  if (!id(input.mediaId)) return 'Choose a menu uploaded to this place.';
  if (!validDishText(input.dishName) || !Array.isArray(input.aliases) || input.aliases.length > 5 || !input.aliases.every(validDishText)) return 'Use a plain dish name (1–120 characters) and up to five plain alias names, without links or contact details.';
  if ((input.dishId !== undefined || input.expectedUpdatedAt !== undefined) && (!id(input.dishId) || !version(input.expectedUpdatedAt))) return 'Reload before editing this dish.';
}
export class MenuRequestError extends Error {
  readonly status: number;
  constructor(statusCode: number) { super(menuErrorText(statusCode)); this.status = statusCode; }
}
export function menuErrorText(error: unknown): string {
  const code = typeof error === 'number' ? error : error instanceof MenuRequestError ? error.status
    : record(error) && record(error.data) ? error.data.code : undefined;
  if (code === 409 || code === 'CONFLICT') return 'The dish, menu or venue changed. Reload before trying again. Nothing was retried automatically.';
  if (code === 401 || code === 'UNAUTHORIZED') return 'Sign in again to manage menu evidence.';
  if (code === 403 || code === 'FORBIDDEN') return 'This account cannot manage menu evidence here.';
  if (code === 400 || code === 'BAD_REQUEST') return 'Check the dish names, source and current versions, then try again.';
  return 'Menu evidence could not be loaded or saved. Reload and try again.';
}
export function menuDishesTransport(authorized: AuthorizedFetch, locationId: string) {
  if (!id(locationId)) throw new Error('Invalid location');
  const base = `/vendor/locations/${encodeURIComponent(locationId)}/menu-dishes`;
  const send = async (path: string, body?: object, signal?: AbortSignal) => {
    try {
      signal?.throwIfAborted();
      const response = await authorized(path, { method: body ? 'POST' : 'GET', signal, cache: 'no-store', redirect: 'error',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      signal?.throwIfAborted();
      if (!response.ok) throw new MenuRequestError(response.status);
      const json: unknown = await response.json();
      signal?.throwIfAborted();
      return parseMenuList(json);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof MenuRequestError) throw error;
      throw new MenuRequestError(0);
    }
  };
  return {
    list: (signal?: AbortSignal) => send(base, undefined, signal),
    save: (input: MenuSubmission, signal?: AbortSignal) => {
      if (submissionProblem(input)) return Promise.reject(new MenuRequestError(400));
      return send(base, { mediaId: input.mediaId, dishName: input.dishName.trim(), aliases: input.aliases.map((a) => a.trim()),
        ...(input.dishId ? { dishId: input.dishId, expectedUpdatedAt: input.expectedUpdatedAt } : {}) }, signal);
    },
    withdraw: (dishId: string, expectedUpdatedAt: string, signal?: AbortSignal) => {
      if (!id(dishId) || !version(expectedUpdatedAt)) return Promise.reject(new MenuRequestError(400));
      return send(`${base}/${encodeURIComponent(dishId)}/withdraw`, { expectedUpdatedAt }, signal);
    },
  };
}
export interface MenuReviewChecks { previewReady: boolean; inspected: boolean; namesChecked: boolean; samePlace: boolean }
export function menuReviewInput(dish: MenuQueueDish, approve: boolean, note: string, checks?: MenuReviewChecks) {
  if (approve && (!checks || !canApproveMenuDish(dish, checks))) throw new MenuRequestError(400);
  if (!id(dish.id) || !version(dish.updatedAt) || !version(dish.mediaUpdatedAt)
    || !(dish.venueId === null || id(dish.venueId)) || note.trim().length > 280 || (!approve && !note.trim())) throw new MenuRequestError(400);
  return { dishId: dish.id, approve, expectedUpdatedAt: dish.updatedAt, expectedMediaUpdatedAt: dish.mediaUpdatedAt,
    expectedVenueId: dish.venueId, ...(note.trim() ? { note: note.trim() } : {}) };
}
export function menuVenueBindingInput(dish: MenuQueueDish, venueId: string | null) {
  if (!id(dish.locationId) || !(venueId === null || id(venueId)) || !(dish.venueId === null || id(dish.venueId))) throw new MenuRequestError(400);
  return { locationId: dish.locationId, venueId, expectedVenueId: dish.venueId };
}
export function canApproveMenuDish(dish: MenuQueueDish, checks: MenuReviewChecks): boolean {
  return checks.previewReady === true && checks.inspected === true && checks.namesChecked === true && checks.samePlace === true
    && dish.mediaReviewStatus === 'approved' && id(dish.venueId) && dish.venueDiscoverable === true;
}
export function assertMenuReviewReply(raw: unknown, approve: boolean): void {
  if (!record(raw) || raw.reviewStatus !== (approve ? 'approved' : 'rejected')) throw new MenuRequestError(0);
}
export function assertMenuBindingReply(raw: unknown, venueId: string | null): void {
  if (!record(raw) || raw.venueId !== venueId) throw new MenuRequestError(0);
}
export async function fetchMenuSource(authorized: AuthorizedFetch, sourceUrl: string, mediaId: string, signal?: AbortSignal): Promise<Blob> {
  const path = menuSourcePath(sourceUrl, mediaId);
  if (!path) throw new MenuRequestError(0);
  signal?.throwIfAborted();
  const response = await authorized(path, { method: 'GET', signal, cache: 'no-store', redirect: 'error' });
  signal?.throwIfAborted();
  if (!response.ok) throw new MenuRequestError(response.status);
  const blob = await response.blob();
  signal?.throwIfAborted();
  const limit = blob.type === 'application/pdf' ? MEDIA_MAX_MENU_BYTES : MEDIA_MAX_IMAGE_BYTES;
  if (!(MEDIA_MENU_MIME as readonly string[]).includes(blob.type) || blob.size === 0 || blob.size > limit) throw new MenuRequestError(0);
  return blob;
}
