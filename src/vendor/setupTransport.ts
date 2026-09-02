import { VENDOR_API_BASE_URL } from './authTransport.ts';
import type { BookableLocationOperationId } from '../utils/bookableTemplates.ts';
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
  };
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
