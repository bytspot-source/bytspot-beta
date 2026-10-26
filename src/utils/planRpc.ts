import { tableBookingFrom, type TableBooking } from './tableBooking.ts';
// The web adapter mirrors plans.create/list/get. A Plan coordinates intent;
// confirming a Plan never confirms inventory, payment, or someone else's RSVP.
export const PLAN_NEEDS = ['coffee', 'dining', 'nightlife', 'parking', 'stay', 'ride'] as const;
export type PlanNeed = typeof PLAN_NEEDS[number];
export const PLAN_STEPS = ['Idea', 'Details', 'Review'] as const;
export const PLAN_IDEAS = [
  { title: 'Coffee catch-up', intent: 'Grab coffee and catch up.', needs: ['coffee'] },
  { title: 'Dinner out', intent: 'Dinner out with the crew.', needs: ['dining'] },
  { title: 'Night out', intent: 'Dinner and drinks — make a night of it.', needs: ['dining', 'nightlife'] },
] satisfies Array<{ title: string; intent: string; needs: PlanNeed[] }>;

export interface PlanCoords { latitude: number; longitude: number }
export interface PlanDraft {
  title: string;
  intent: string;
  startsAt: string;
  partySize: string;
  areaLabel: string;
  coords: PlanCoords | null;
  needs: PlanNeed[];
}
export const emptyPlanDraft = (): PlanDraft => ({ title: '', intent: '', startsAt: '', partySize: '', areaLabel: '', coords: null, needs: [] });
export interface CreatePlanInput {
  idempotencyKey: string;
  title: string;
  intent: string;
  startsAt?: string;
  partySize?: number;
  areaLabel?: string;
  latitude?: number;
  longitude?: number;
  needs: string[];
}
export interface UpdatePlanInput {
  startsAt?: string | null;
  endsAt?: string | null;
  partySize?: number | null;
  areaLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
/** A real position fix only: finite, in range, and never the 0,0 placeholder. */
export function validPlanCoords(coords: PlanCoords): boolean {
  const { latitude, longitude } = coords;
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0);
}
export function planArea(areaLabel: string, coords: PlanCoords | null): string | null {
  return areaLabel.trim() || (coords ? 'Near me' : null);
}
/** `YYYY-MM-DDTHH:mm` in local time, the datetime-local input format. */
export function localDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function whenError(startsAt: string, now: Date): string | null {
  if (!startsAt) return null;
  const time = new Date(startsAt).getTime();
  if (!Number.isFinite(time)) return 'Choose a valid date and time.';
  return time < Math.floor(now.getTime() / 60_000) * 60_000 ? 'Choose a time that has not passed.' : null;
}
function sizeError(partySize: string): string | null {
  return partySize && (!/^\d+$/.test(partySize) || Number(partySize) < 1 || Number(partySize) > 200) ? 'Group size must be a whole number from 1 to 200.' : null;
}
function whereError(areaLabel: string, coords: PlanCoords | null): string | null {
  if (areaLabel.trim().length > 80) return 'Keep the area to 80 characters or fewer.';
  if (coords && !validPlanCoords(coords)) return 'That location is not valid.';
  // A typed area with no map point cannot be used to ask venues nearby.
  return areaLabel.trim() && !coords ? `Pick a match for “${areaLabel.trim()}”, or clear it.` : null;
}
export function planDraftError(draft: PlanDraft, now: Date = new Date()): string | null {
  if (!draft.title.trim() || draft.title.trim().length > 80) return 'Give your plan a title of 1–80 characters.';
  if (!draft.intent.trim() || draft.intent.trim().length > 280) return 'Describe your idea in 1–280 characters.';
  const problem = whenError(draft.startsAt, now) ?? sizeError(draft.partySize) ?? whereError(draft.areaLabel, draft.coords);
  if (problem) return problem;
  if (draft.needs.some(need => !PLAN_NEEDS.includes(need))) return 'Choose a supported need.';
  return null;
}
export function createPlanInput(draft: PlanDraft, idempotencyKey: string, now: Date = new Date()): CreatePlanInput {
  const error = planDraftError(draft, now);
  if (error) throw new Error(error);
  const areaLabel = planArea(draft.areaLabel, draft.coords);
  return {
    idempotencyKey, title: draft.title.trim(), intent: draft.intent.trim(), needs: [...new Set(draft.needs)],
    ...(draft.startsAt ? { startsAt: new Date(draft.startsAt).toISOString() } : {}),
    ...(draft.partySize ? { partySize: Number(draft.partySize) } : {}),
    ...(areaLabel ? { areaLabel } : {}),
    ...(draft.coords ? { latitude: draft.coords.latitude, longitude: draft.coords.longitude } : {}),
  };
}
export interface PlanEditDraft {
  startsAt: string;
  partySize: string;
  areaLabel: string;
  coords: PlanCoords | null;
}
export function planEditDraft(plan: Plan): PlanEditDraft {
  return {
    startsAt: plan.startsAt ? localDateTimeInput(new Date(plan.startsAt)) : '',
    partySize: plan.partySize == null ? '' : String(plan.partySize),
    areaLabel: plan.areaLabel ?? '',
    coords: plan.latitude != null && plan.longitude != null ? { latitude: plan.latitude, longitude: plan.longitude } : null,
  };
}
export function planEditError(plan: Plan, edit: PlanEditDraft, now: Date = new Date()): string | null {
  const original = planEditDraft(plan);
  const whereChanged = edit.areaLabel !== original.areaLabel || edit.coords?.latitude !== original.coords?.latitude || edit.coords?.longitude !== original.coords?.longitude;
  return (edit.startsAt !== original.startsAt ? whenError(edit.startsAt, now) : null) ?? sizeError(edit.partySize) ?? (whereChanged ? whereError(edit.areaLabel, edit.coords) : null);
}
export interface PlanPlaceMatch { id: string; name: string; address: string; coords: PlanCoords }
/** Only results with a real map point; anything else cannot anchor a Plan. */
export function parsePlaceMatches(value: unknown): PlanPlaceMatch[] {
  const rows = value && typeof value === 'object' && Array.isArray((value as RecordValue).places) ? (value as { places: unknown[] }).places : [];
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return [];
    const place = row as RecordValue;
    const name = typeof place.name === 'string' ? place.name.trim().slice(0, 80) : '';
    const coords = { latitude: Number(place.lat), longitude: Number(place.lng) };
    if (!name || typeof place.lat !== 'number' || typeof place.lng !== 'number' || !validPlanCoords(coords)) return [];
    const id = typeof place.placeId === 'string' && place.placeId ? place.placeId : `place-${index}`;
    return [{ id, name, address: typeof place.address === 'string' ? place.address : '', coords }];
  });
}
/** Only changed fields are sent; a cleared field is sent as null. */
export function planEditInput(plan: Plan, edit: PlanEditDraft, now: Date = new Date()): UpdatePlanInput {
  const error = planEditError(plan, edit, now);
  if (error) throw new Error(error);
  const original = planEditDraft(plan);
  const input: UpdatePlanInput = {};
  if (edit.startsAt !== original.startsAt) input.startsAt = edit.startsAt ? new Date(edit.startsAt).toISOString() : null;
  if (edit.partySize !== original.partySize) input.partySize = edit.partySize ? Number(edit.partySize) : null;
  const areaLabel = planArea(edit.areaLabel, edit.coords);
  if (areaLabel !== plan.areaLabel) input.areaLabel = areaLabel;
  if (edit.coords?.latitude !== original.coords?.latitude || edit.coords?.longitude !== original.coords?.longitude) {
    input.latitude = edit.coords?.latitude ?? null; input.longitude = edit.coords?.longitude ?? null;
  }
  return input;
}
const PLAN_SERVER_MESSAGES = new Set([
  'This Plan was cancelled.', 'This Plan expired.', 'This Plan is full.',
  'A Plan cannot start in the past.', 'A Plan cannot end before it starts.', 'Send latitude and longitude together.', 'That location is not valid.',
]);
const RETRYABLE_CODES = new Set(['TOO_MANY_REQUESTS', 'TIMEOUT', 'INTERNAL_SERVER_ERROR', 'BAD_GATEWAY', 'SERVICE_UNAVAILABLE', 'GATEWAY_TIMEOUT']);
function errorShape(error: unknown): { code?: string; status?: number; message?: string } {
  const row = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {};
  return {
    code: typeof data.code === 'string' ? data.code : undefined,
    status: typeof data.httpStatus === 'number' ? data.httpStatus : undefined,
    message: typeof row.message === 'string' ? row.message : undefined,
  };
}
/** True when resending the same request could succeed: network failure, timeout, 429 or 5xx. */
export function planErrorRetryable(error: unknown): boolean {
  const { code, status } = errorShape(error);
  if (!code && status === undefined) return true;
  if (code && RETRYABLE_CODES.has(code)) return true;
  return status !== undefined && (status === 408 || status === 429 || status >= 500);
}
/** App-authored copy; server text is shown only when it is a known Plan message. */
export function planErrorMessage(error: unknown, fallback: string): string {
  const { code, status, message } = errorShape(error);
  if (!code && status === undefined) return "We couldn't connect. Check your connection and try again.";
  if (code === 'TOO_MANY_REQUESTS' || status === 429) return 'Too many changes just now. Wait a moment and try again.';
  if (code === 'UNAUTHORIZED') return 'Sign in again to continue.';
  if (code === 'NOT_FOUND') return "This plan isn't available anymore.";
  return message && PLAN_SERVER_MESSAGES.has(message) ? message : fallback;
}
export interface Plan {
  id: string;
  title: string;
  intent: string;
  creatorUserId: string;
  state: string;
  startsAt: string | null;
  endsAt: string | null;
  expiresAt: string | null;
  partySize: number | null;
  areaLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  needs: string[];
  openNeeds: string[];
  readiness: { going: number; maybe: number; pending: number };
  items: Array<{
    id: string; title: string; needKind: string; booked: boolean; status: string;
    tableBooking?: TableBooking;
    /** The guest's own record that they booked it with the provider; never `booked`. */
    guestBooking?: { bookedFor: string | null };
  }>;
}
export interface PlanApi {
  list(): Promise<Plan[]>;
  get(id: string): Promise<Plan>;
  create(input: CreatePlanInput): Promise<string>;
  update(id: string, input: UpdatePlanInput): Promise<void>;
  confirm(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  respond(id: string, response: 'accepted' | 'maybe' | 'declined'): Promise<void>;
  searchPlaces(query: string): Promise<PlanPlaceMatch[]>;
}
type Query<I> = { query(input: I): Promise<unknown> };
type Mutation<I> = { mutate(input: I): Promise<unknown> };
export interface PlansTransport {
  plans: {
    list: Query<void>; get: Query<{ planId: string }>; create: Mutation<CreatePlanInput>;
    update: Mutation<{ planId: string } & UpdatePlanInput>;
    confirm: Mutation<{ planId: string }>; cancel: Mutation<{ planId: string }>;
    respond: Mutation<{ planId: string; response: 'accepted' | 'maybe' | 'declined' }>;
  };
  places: { textSearch: Query<{ query: string; maxResults: number }> };
}
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Plan response. Please retry.');
  return value as RecordValue;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid Plan response. Please retry.');
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid Plan response. Please retry.');
  return value.map(text);
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Invalid Plan response. Please retry.');
  return value;
}
function optionalDate(value: unknown): string | null {
  const date = value == null ? null : text(value);
  if (date && !Number.isFinite(Date.parse(date))) throw new Error('Invalid Plan date. Please refresh.');
  return date;
}
function optionalNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid Plan response. Please retry.');
  return value;
}
export function parsePlan(value: unknown): Plan {
  const row = object(value);
  const readiness = object(row.readiness);
  if (!Array.isArray(row.items)) throw new Error('Invalid Plan response. Please retry.');
  const state = text(row.state);
  if (!['proposed', 'confirmed', 'booked', 'active', 'completed', 'cancelled', 'expired'].includes(state)) throw new Error('Unrecognized Plan state. Please refresh.');
  // Explicit projection: never retain join-link credentials or unrelated data.
  return {
    id: text(row.id), title: text(row.title), intent: text(row.intent), creatorUserId: text(row.creatorUserId), state,
    startsAt: optionalDate(row.startsAt), endsAt: optionalDate(row.endsAt), expiresAt: optionalDate(row.expiresAt),
    partySize: row.partySize == null ? null : count(row.partySize),
    areaLabel: row.areaLabel == null ? null : text(row.areaLabel),
    latitude: optionalNumber(row.latitude), longitude: optionalNumber(row.longitude),
    needs: strings(row.needs), openNeeds: strings(row.openNeeds),
    readiness: { going: count(readiness.going), maybe: count(readiness.maybe), pending: count(readiness.pending) },
    items: row.items.map(value => {
      const item = object(value);
      const tableBooking = tableBookingFrom(item.tableBooking);
      const report = item.guestBooking && typeof item.guestBooking === 'object' ? item.guestBooking as RecordValue : null;
      const reported = report && typeof report.reportedAt === 'string' && Number.isFinite(Date.parse(report.reportedAt));
      const bookedFor = reported && typeof report.bookedFor === 'string' && Number.isFinite(Date.parse(report.bookedFor)) ? report.bookedFor : null;
      return {
        id: text(item.id), title: text(item.title), needKind: text(item.needKind), booked: item.booked === true, status: text(item.status),
        ...(tableBooking ? { tableBooking } : {}),
        ...(reported ? { guestBooking: { bookedFor } } : {}),
      };
    }),
  };
}
/** "Booked" only ever means Bytspot settled it; the guest's own report says so. */
export function planItemStatus(item: Plan['items'][number]): string {
  if (item.status === 'cancelled') return 'Cancelled';
  if (item.booked) return 'Booked';
  return item.guestBooking ? 'Booked (by you)' : 'Not booked';
}
export function createPlanApi(client: PlansTransport): PlanApi {
  return {
    async list() {
      const response = object(await client.plans.list.query());
      if (!Array.isArray(response.plans)) throw new Error('Invalid Plan list. Please retry.');
      return response.plans.map(parsePlan);
    },
    async get(id) { return parsePlan(await client.plans.get.query({ planId: id })); },
    async create(input) { return text(object(await client.plans.create.mutate(input)).id); },
    async update(id, input) {
      const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as UpdatePlanInput;
      await client.plans.update.mutate({ planId: id, ...changes });
    },
    async confirm(id) { await client.plans.confirm.mutate({ planId: id }); },
    async cancel(id) { await client.plans.cancel.mutate({ planId: id }); },
    async respond(id, response) { await client.plans.respond.mutate({ planId: id, response }); },
    async searchPlaces(query) { return parsePlaceMatches(await client.places.textSearch.query({ query: query.trim(), maxResults: 5 })); },
  };
}
