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

export interface PlanDraft {
  title: string;
  intent: string;
  startsAt: string;
  partySize: string;
  needs: PlanNeed[];
}
export const emptyPlanDraft = (): PlanDraft => ({ title: '', intent: '', startsAt: '', partySize: '', needs: [] });
export interface CreatePlanInput {
  idempotencyKey: string;
  title: string;
  intent: string;
  startsAt?: string;
  partySize?: number;
  needs: string[];
}
export function planDraftError(draft: PlanDraft): string | null {
  if (!draft.title.trim() || draft.title.trim().length > 80) return 'Give your plan a title of 1–80 characters.';
  if (!draft.intent.trim() || draft.intent.trim().length > 280) return 'Describe your idea in 1–280 characters.';
  if (draft.startsAt && !Number.isFinite(new Date(draft.startsAt).getTime())) return 'Choose a valid date and time.';
  if (draft.partySize && (!/^\d+$/.test(draft.partySize) || Number(draft.partySize) < 1 || Number(draft.partySize) > 200)) return 'Group size must be a whole number from 1 to 200.';
  if (draft.needs.some(need => !PLAN_NEEDS.includes(need))) return 'Choose a supported need.';
  return null;
}
export function createPlanInput(draft: PlanDraft, idempotencyKey: string): CreatePlanInput {
  const error = planDraftError(draft);
  if (error) throw new Error(error);
  return {
    idempotencyKey, title: draft.title.trim(), intent: draft.intent.trim(), needs: [...new Set(draft.needs)],
    ...(draft.startsAt ? { startsAt: new Date(draft.startsAt).toISOString() } : {}),
    ...(draft.partySize ? { partySize: Number(draft.partySize) } : {}),
  };
}
export interface Plan {
  id: string;
  title: string;
  intent: string;
  creatorUserId: string;
  state: string;
  startsAt: string | null;
  partySize: number | null;
  needs: string[];
  openNeeds: string[];
  readiness: { going: number; maybe: number; pending: number };
  items: Array<{ id: string; title: string; needKind: string; booked: boolean; status: string }>;
}
export interface PlanApi {
  list(): Promise<Plan[]>;
  get(id: string): Promise<Plan>;
  create(input: CreatePlanInput): Promise<string>;
  confirm(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  respond(id: string, response: 'accepted' | 'maybe' | 'declined'): Promise<void>;
}
type Query<I> = { query(input: I): Promise<unknown> };
type Mutation<I> = { mutate(input: I): Promise<unknown> };
export interface PlansTransport {
  plans: {
    list: Query<void>; get: Query<{ planId: string }>; create: Mutation<CreatePlanInput>;
    confirm: Mutation<{ planId: string }>; cancel: Mutation<{ planId: string }>;
    respond: Mutation<{ planId: string; response: 'accepted' | 'maybe' | 'declined' }>;
  };
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
export function parsePlan(value: unknown): Plan {
  const row = object(value);
  const readiness = object(row.readiness);
  if (!Array.isArray(row.items)) throw new Error('Invalid Plan response. Please retry.');
  const state = text(row.state);
  if (!['proposed', 'confirmed', 'booked', 'active', 'completed', 'cancelled', 'expired'].includes(state)) throw new Error('Unrecognized Plan state. Please refresh.');
  const startsAt = row.startsAt == null ? null : text(row.startsAt);
  if (startsAt && !Number.isFinite(Date.parse(startsAt))) throw new Error('Invalid Plan date. Please refresh.');
  // Explicit projection: never retain join-link credentials or unrelated data.
  return {
    id: text(row.id), title: text(row.title), intent: text(row.intent), creatorUserId: text(row.creatorUserId), state,
    startsAt, partySize: row.partySize == null ? null : count(row.partySize),
    needs: strings(row.needs), openNeeds: strings(row.openNeeds),
    readiness: { going: count(readiness.going), maybe: count(readiness.maybe), pending: count(readiness.pending) },
    items: row.items.map(value => {
      const item = object(value);
      return { id: text(item.id), title: text(item.title), needKind: text(item.needKind), booked: item.booked === true, status: text(item.status) };
    }),
  };
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
    async confirm(id) { await client.plans.confirm.mutate({ planId: id }); },
    async cancel(id) { await client.plans.cancel.mutate({ planId: id }); },
    async respond(id, response) { await client.plans.respond.mutate({ planId: id, response }); },
  };
}
