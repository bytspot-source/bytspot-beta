import { VENDOR_API_BASE_URL } from './authTransport.ts';
import { getBookableSeller, type BookableLocationOperationId } from '../utils/bookableTemplates.ts';
import { reviveCandidates, type GeocodeCandidate } from './geocoding.ts';
import type { PayoutAccount, VendorProfile } from './profile.ts';
import type { VendorLocation } from './locations.ts';

/**
 * A call that already carries the session, without the caller ever holding the
 * token. The access token stays in the ref useVendorAuth keeps it in; a screen
 * handed the token could put it somewhere a screen handed a function cannot.
 */
export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface SetupResult<T> {
  status: number;
  value?: T;
  /** What the server said was wrong, when it says so in a shape we can show. */
  blockers?: string[];
}

/**
 * Where the processor wants the vendor to go, and the reference we will see the
 * result under. The URL is opened rather than embedded: an iframe would put the
 * processor's form inside a page that also renders vendor-supplied strings.
 */
export interface PayoutOnboardingHandoff {
  reference: string;
  url: string;
}

export interface SetupTransport {
  loadProfile: () => Promise<SetupResult<VendorProfile>>;
  saveField: (field: 'legalName' | 'contactEmail', value: string) => Promise<SetupResult<VendorProfile>>;
  saveLocation: (location: VendorLocation) => Promise<SetupResult<VendorProfile>>;
  /**
   * Runs a lifecycle operation on one place.
   *
   * Sent as the operation the vendor pressed rather than the state to land in,
   * so the server applies the same transition table the console read from the
   * catalog. A client that posted a target state would be asserting a
   * transition is legal instead of asking.
   */
  moveLocation: (id: string, operation: BookableLocationOperationId) => Promise<SetupResult<VendorProfile>>;
  /** Starts hosted onboarding. This origin never sees the bank details. */
  startPayoutOnboarding: () => Promise<SetupResult<PayoutOnboardingHandoff>>;
  /** Reads back what the processor decided. The only source of payout status. */
  readPayout: () => Promise<SetupResult<PayoutAccount | undefined>>;
  /**
   * Address to candidate pins, through our API rather than from the browser.
   *
   * A geocoding provider is called with a key, and a key in a static bundle is
   * a public key: it would be extracted and spent within a day of the console
   * shipping. Proxying also puts the per-vendor rate limit and the provider's
   * caching terms somewhere we control.
   */
  geocode: (query: string, kind: string) => Promise<SetupResult<GeocodeCandidate[]>>;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function blockersFrom(json: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(json.blockers)) return undefined;
  return json.blockers.filter((item): item is string => typeof item === 'string');
}

/**
 * Locations arrive as plain JSON, and a radius that came back as a string would
 * compare wrong against the maximum rather than failing loudly.
 */
function reviveProfile(json: Record<string, unknown>): VendorProfile {
  const locations = Array.isArray(json.locations) ? json.locations : [];
  return {
    legalName: typeof json.legalName === 'string' ? json.legalName : undefined,
    contactEmail: typeof json.contactEmail === 'string' ? json.contactEmail : undefined,
    locations: locations.map((entry) => {
      const location = entry as VendorLocation;
      return {
        ...location,
        lat: Number(location.lat),
        lng: Number(location.lng),
        radiusMiles: location.radiusMiles === undefined ? undefined : Number(location.radiusMiles),
      };
    }),
    payout: revivePayout(json.payout),
    state: getBookableSeller().identity.states.find((state) => state === json.state),
    verifiedAt: reviveDate(json.verifiedAt),
  };
}

function reviveDate(raw: unknown): Date | undefined {
  if (typeof raw !== 'string') return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Only the four fields we are willing to hold. Copying the object wholesale
 * would let a server that started returning bank details store them in our
 * state, which is exactly the arrangement the hosted flow exists to avoid.
 */
function revivePayout(raw: unknown): PayoutAccount | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const payout = raw as Record<string, unknown>;
  if (typeof payout.reference !== 'string') return undefined;
  const status = payout.status;
  return {
    reference: payout.reference,
    status: status === 'active' || status === 'restricted' ? status : 'pending',
    last4: typeof payout.last4 === 'string' ? payout.last4 : undefined,
    detail: typeof payout.detail === 'string' ? payout.detail : undefined,
  };
}

export function httpSetupTransport(authorized: AuthorizedFetch): SetupTransport {
  const send = async <T,>(
    path: string,
    init: RequestInit,
    map: (json: Record<string, unknown>) => T,
  ): Promise<SetupResult<T>> => {
    const response = await authorized(path, init);
    const json = await readJson(response);
    if (!response.ok) return { status: response.status, blockers: blockersFrom(json) };
    return { status: response.status, value: map(json) };
  };

  const write = (body: unknown) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    loadProfile: () => send('/vendor/profile', { method: 'GET' }, reviveProfile),
    saveField: (field, value) => send('/vendor/profile', write({ [field]: value }), reviveProfile),
    saveLocation: (location) => send('/vendor/locations', write(location), reviveProfile),
    moveLocation: (id, operation) =>
      send(`/vendor/locations/${encodeURIComponent(id)}/state`, write({ operation }), reviveProfile),
    startPayoutOnboarding: () =>
      send('/vendor/payout/onboarding', write({}), (json) => ({
        reference: String(json.reference ?? ''),
        url: String(json.url ?? ''),
      })),
    readPayout: () => send('/vendor/payout', { method: 'GET' }, (json) => revivePayout(json.payout)),
    // POST, not GET with a query string: an address a vendor is still typing
    // would otherwise land in access logs and browser history.
    geocode: (query, kind) =>
      send('/vendor/geocode', write({ query, kind }), (json) => reviveCandidates(json.candidates)),
  };
}

/* ── Windows: the real bookable ────────────────────────────────────────── */

/** A template sold from one place on a weekly shape. The console calls it a bookable. */
export interface VendorWindow {
  id: string;
  skuTemplateId: string;
  title: string;
  domain: string;
  locationId: string;
  /** 0 = Sunday. */
  weekdays: number[];
  openMins: number;
  closeMins: number;
  quantity: number;
  priceCents: number;
  maxGuests: number;
  intent: string;
  published: boolean;
  coverUrl?: string;
}

export interface WindowDraft {
  skuTemplateId: string;
  locationId: string;
  weekdays: number[];
  openMins: number;
  closeMins: number;
  quantity: number;
}

export interface WindowsTransport {
  list: () => Promise<SetupResult<VendorWindow[]>>;
  /** Always lands as a draft; nothing a guest can see until it is published. */
  create: (draft: WindowDraft) => Promise<SetupResult<VendorWindow>>;
  setPublished: (id: string, published: boolean) => Promise<SetupResult<VendorWindow>>;
}

/** The refusals the API would give, checked before the round-trip. */
export function windowDraftProblems(draft: WindowDraft): string[] {
  const problems: string[] = [];
  if (!draft.locationId) problems.push('Choose one of your places');
  if (!draft.weekdays.length) problems.push('Pick at least one day');
  if (draft.closeMins <= draft.openMins) problems.push('Closing has to come after opening');
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) problems.push('Sell at least one per slot');
  return problems;
}

function reviveWindow(raw: unknown): VendorWindow {
  const json = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(json.id ?? ''),
    skuTemplateId: String(json.skuTemplateId ?? ''),
    title: String(json.title ?? json.skuTemplateId ?? ''),
    domain: String(json.domain ?? ''),
    locationId: String(json.locationId ?? ''),
    weekdays: Array.isArray(json.weekdays) ? json.weekdays.map(Number).filter(Number.isInteger) : [],
    openMins: Number(json.openMins ?? 0),
    closeMins: Number(json.closeMins ?? 0),
    quantity: Number(json.quantity ?? 0),
    priceCents: Number(json.priceCents ?? 0),
    maxGuests: Number(json.maxGuests ?? 0),
    intent: String(json.intent ?? 'request'),
    // Only an explicit true is published: a missing flag must read as a draft.
    published: json.published === true,
    coverUrl: typeof json.coverUrl === 'string' ? json.coverUrl : undefined,
  };
}

export function httpWindowsTransport(authorized: AuthorizedFetch): WindowsTransport {
  const send = async <T,>(path: string, init: RequestInit, map: (json: Record<string, unknown>) => T) => {
    const response = await authorized(path, init);
    const json = await readJson(response);
    if (!response.ok) return { status: response.status, blockers: blockersFrom(json) } as SetupResult<T>;
    return { status: response.status, value: map(json) } as SetupResult<T>;
  };
  const post = (body: unknown) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    list: () =>
      send('/vendor/windows', { method: 'GET' }, (json) =>
        (Array.isArray(json.windows) ? json.windows : []).map(reviveWindow),
      ),
    create: (draft) => send('/vendor/windows', post(draft), reviveWindow),
    setPublished: (id, published) =>
      send(`/vendor/windows/${encodeURIComponent(id)}/${published ? 'publish' : 'unpublish'}`, post({}), reviveWindow),
  };
}

/** In memory, for the demo build only. Publishing is always allowed here. */
export function demoWindowsTransport(): WindowsTransport {
  const rows: VendorWindow[] = [];
  let issued = 0;
  return {
    list: async () => ({ status: 200, value: rows.map((row) => ({ ...row })) }),
    create: async (draft) => {
      const problems = windowDraftProblems(draft);
      if (problems.length) return { status: 422, blockers: problems };
      issued += 1;
      const row: VendorWindow = {
        ...draft,
        id: `demo_window_${issued}`,
        title: draft.skuTemplateId,
        domain: draft.skuTemplateId.split('.')[0] ?? '',
        priceCents: 0,
        maxGuests: 1,
        intent: 'request',
        published: false,
      };
      rows.push(row);
      return { status: 201, value: { ...row } };
    },
    setPublished: async (id, published) => {
      const row = rows.find((entry) => entry.id === id);
      if (!row) return { status: 404, blockers: ['No such offering'] };
      row.published = published;
      return { status: 200, value: { ...row } };
    },
  };
}
