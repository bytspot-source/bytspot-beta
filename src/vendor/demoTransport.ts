import { getBookableLocations } from '../utils/bookableTemplates.ts';
import { buildAvailabilityGrid } from './availability.ts';
import { respondToDemand, type Demand } from './demand.ts';
import type { DemandFeedSnapshot, DemandTransport } from './demandTransport.ts';
import { vendorAuthContract } from './vendorConsole.ts';
import type { AuthTransport, VendorMembership } from './auth.ts';
import type { GeocodeCandidate } from './geocoding.ts';
import type { PayoutAccount, VendorProfile } from './profile.ts';
import type { Seat, Seller } from './seller.ts';
import type { SetupTransport } from './setupTransport.ts';

/**
 * Compile-time only. The demo transport exists so the console can be opened and
 * driven before the API ships, and it is gated on a build flag rather than on
 * whether the API happens to answer: an auth bypass that switches itself on when
 * the network is unreachable is the same bug as no auth at all.
 *
 * Verified by grepping dist-vendor after a default build, which contains none of
 * this file.
 */
export const VENDOR_DEMO_MODE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_VENDOR_DEMO === 'true';

const seller = (over: Partial<Seller>): Seller => ({
  id: 'sel_demo',
  legalName: 'Demo business',
  state: 'ACTIVE',
  businessMode: 'standard',
  satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'],
  ...over,
});

const seat = (over: Partial<Seat>): Seat => ({
  id: 'seat_demo',
  sellerId: 'sel_demo',
  personId: 'per_demo',
  role: 'owner',
  state: 'ACTIVE',
  locationIds: ['loc_midtown'],
  bookableIds: ['bk_table_4'],
  ...over,
});

/**
 * Five businesses, chosen to exercise the parts of the console that are hard to
 * reach otherwise: a suspended business that withholds capability, a draft one
 * mid-setup, one already under review, one live but out of compliance, and an
 * assigned-scope seat that sees a single bookable.
 */
const MEMBERSHIPS: VendorMembership[] = [
  {
    seller: seller({ id: 'sel_midtown', legalName: 'Midtown Table' }),
    seat: seat({ id: 'seat_owner', sellerId: 'sel_midtown' }),
  },
  {
    seller: seller({ id: 'sel_suspended', legalName: 'Paused Diner', state: 'SUSPENDED' }),
    seat: seat({ id: 'seat_owner_2', sellerId: 'sel_suspended' }),
  },
  {
    seller: seller({
      id: 'sel_draft',
      legalName: 'Home Bakery',
      state: 'DRAFT',
      businessMode: 'cottage',
      satisfied: ['legalName'],
    }),
    seat: seat({ id: 'seat_owner_3', sellerId: 'sel_draft' }),
  },
  {
    seller: seller({
      id: 'sel_review',
      legalName: 'Harbour Sauna',
      state: 'PENDING',
      satisfied: ['legalName', 'contactEmail'],
    }),
    seat: seat({ id: 'seat_owner_4', sellerId: 'sel_review' }),
  },
  {
    // Live but out of compliance: the requirement came back after going live, so
    // this one keeps its console and is told what broke rather than being sent
    // back through setup.
    seller: seller({
      id: 'sel_lapsed',
      legalName: 'Riverside Lot',
      satisfied: ['legalName', 'contactEmail', 'payoutAccount'],
    }),
    seat: seat({ id: 'seat_owner_5', sellerId: 'sel_lapsed' }),
  },
  {
    seller: seller({ id: 'sel_spa', legalName: 'Northside Spa' }),
    seat: seat({ id: 'seat_provider', sellerId: 'sel_spa', role: 'serviceProvider', bookableIds: ['bk_massage'] }),
  },
];

/**
 * Accepts any well-formed code. It still refuses a malformed one, so the code
 * screen behaves the way it will in production rather than waving everything
 * through and hiding a validation bug until launch.
 */
export function demoAuthTransport(): AuthTransport {
  const { accessTtlSecs } = vendorAuthContract().token;
  let issued = 0;

  return {
    requestCode: async (email) => {
      if (email.includes('ratelimited')) return { status: 429, retryAfterSecs: 30 };
      if (email.includes('nobody')) return { status: 403 };
      return { status: 200, challengeId: `demo_${(issued += 1)}` };
    },

    submitCode: async ({ code }) => {
      // 000000 is reserved so the refusal path is reachable in a demo too.
      if (code === '000000') return { status: 401 };
      return {
        status: 200,
        accessToken: 'demo-not-a-credential',
        expiresInSecs: accessTtlSecs,
        person: { id: 'per_demo', email: 'demo@bytspot.app' },
        memberships: MEMBERSHIPS,
      };
    },

    refresh: async () => ({ status: 200, accessToken: 'demo-not-a-credential', expiresInSecs: accessTtlSecs }),
    signOut: async () => undefined,
  };
}

/**
 * The records that back a seeded seller's `satisfied` list.
 *
 * The console recomputes `satisfied` from the records rather than trusting the
 * list, so a demo profile that started empty would strip every tick off a live
 * business and drop it back into setup. The seed exists to keep the demo
 * self-consistent: what the seller claims is what the profile can prove.
 */
function seededProfile(opened?: Seller): VendorProfile {
  const met = (id: string) => opened?.satisfied.includes(id) ?? false;
  return {
    legalName: met('legalName') ? opened?.legalName : undefined,
    contactEmail: met('contactEmail') ? 'owner@demo.bytspot.app' : undefined,
    locations: met('activeLocation')
      ? [
          {
            id: 'loc_demo',
            label: `${opened?.legalName ?? 'Demo'} — main`,
            kind: 'fixed',
            state: 'ACTIVE',
            address: '1 Peachtree St NE, Atlanta, GA 30303',
            lat: 33.7866,
            lng: -84.3833,
            timezone: 'America/New_York',
          },
        ]
      : [],
    payout: met('payoutAccount') ? { reference: 'acct_demo', status: 'active', last4: '4242' } : undefined,
  };
}

/**
 * An in-memory profile store, so the gate can be walked end to end before the
 * write endpoints exist. It holds the same shape the API will return, including
 * refusing to hold anything bank-shaped, so the screens are exercised against
 * the record they will really get.
 */
export function demoSetupTransport(opened?: Seller): SetupTransport {
  let profile: VendorProfile = seededProfile(opened);
  let payoutCalls = 0;

  const ok = () => ({ status: 200, value: { ...profile, locations: [...profile.locations] } });

  return {
    loadProfile: async () => ok(),

    saveField: async (field, value) => {
      profile = { ...profile, [field]: value };
      return ok();
    },

    saveLocation: async (location) => {
      const rest = profile.locations.filter((item) => item.id !== location.id);
      profile = { ...profile, locations: [...rest, location] };
      return ok();
    },

    /**
     * Resolves the target from the same transition table the console reads, so
     * the demo cannot accept a move production would reject.
     */
    moveLocation: async (id, operation) => {
      const target = getBookableLocations().operations.find((item) => item.id === operation);
      const current = profile.locations.find((item) => item.id === id);
      if (!target || !current) return { status: 404, blockers: ['That place no longer exists'] };
      if (!target.from.includes(current.state)) {
        return { status: 422, blockers: [`Cannot ${target.label.toLowerCase()} a place that is ${current.state}`] };
      }
      profile = {
        ...profile,
        locations: profile.locations.map((item) => (item.id === id ? { ...item, state: target.to } : item)),
      };
      return ok();
    },

    startPayoutOnboarding: async () => ({
      status: 200,
      value: { reference: 'acct_demo', url: 'https://example.invalid/demo-payout-onboarding' },
    }),

    /**
     * Pending on the first read and active on the second, because a processor
     * rarely decides instantly and a console that assumes it does never shows
     * the waiting state to anyone.
     */
    readPayout: async () => {
      payoutCalls += 1;
      const payout: PayoutAccount =
        payoutCalls === 1
          ? { reference: 'acct_demo', status: 'pending', detail: 'Usually takes a minute.' }
          : { reference: 'acct_demo', status: 'active', last4: '4242' };
      profile = { ...profile, payout };
      return { status: 200, value: payout };
    },

    /**
     * Reproduces what real providers do, not just the case that works: an exact
     * hit, an ambiguous pair, and the town-centroid fallback that a provider
     * returns for a street it cannot find. The last one is the whole reason the
     * precision check exists, so the demo has to be able to produce it.
     */
    geocode: async (query) => {
      const text = query.trim().toLowerCase();
      if (!text) return { status: 400, blockers: ['Type an address first'] };

      if (text.includes('peachtree')) {
        return {
          status: 200,
          value: [
            {
              formatted: '1 Peachtree St NE, Atlanta, GA 30303',
              lat: 33.7866,
              lng: -84.3833,
              precision: 'rooftop',
              timezone: 'America/New_York',
            },
          ] satisfies GeocodeCandidate[],
        };
      }

      if (text.includes('main')) {
        return {
          status: 200,
          value: [
            { formatted: '100 Main St E, Atlanta, GA 30303', lat: 33.7531, lng: -84.3901, precision: 'street' },
            { formatted: '100 Main St W, Atlanta, GA 30313', lat: 33.7712, lng: -84.4012, precision: 'street' },
          ] satisfies GeocodeCandidate[],
        };
      }

      // The dangerous default. A vendor travelling a radius can use it; a place
      // guests navigate to cannot, and the console has to say so.
      return {
        status: 200,
        value: [
          { formatted: 'Atlanta, GA', lat: 33.749, lng: -84.388, precision: 'locality' },
        ] satisfies GeocodeCandidate[],
      };
    },
  };
}

/**
 * The demand feed the API will push over the webhook, and the capacity it is
 * matched against.
 *
 * This lived in DemandFeed.tsx as a module constant, which meant the seeded
 * requests and a hardcoded Atlanta address shipped in the production bundle.
 * Here it is behind the same build-time substitution as the sign-in bypass, so
 * a real console starts empty rather than showing a demo business's guests.
 */
export function demoDemandTransport(seller: Seller): DemandTransport {
  const now = new Date();
  const at = (dayOffset: number, hour: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  const location = seededProfile(seller).locations[0];

  // Deliberately mixed: one that fits, one too large for the table, one on a
  // day with no window, one at lunch, and one out of range. The console's value
  // is the reason each failed, so the seed has to produce more than one reason.
  let demand: Demand[] = [
    { id: 'd1', category: 'dining', state: 'OPEN', partySize: 2, earliest: at(1, 20), latest: at(1, 21), lat: 33.79, lng: -84.39, radiusMiles: 5, note: 'Anniversary, quiet table', raisedAt: now },
    { id: 'd2', category: 'dining', state: 'OPEN', partySize: 8, earliest: at(1, 20), latest: at(1, 21), lat: 33.79, lng: -84.39, radiusMiles: 5, note: 'Birthday group', raisedAt: now },
    { id: 'd3', category: 'dining', state: 'OPEN', partySize: 4, earliest: at(3, 19), latest: at(3, 21), lat: 33.8, lng: -84.38, radiusMiles: 8, note: 'Tuesday dinner', raisedAt: now },
    { id: 'd4', category: 'dining', state: 'OPEN', partySize: 2, earliest: at(1, 12), latest: at(1, 13), lat: 33.79, lng: -84.39, radiusMiles: 5, note: 'Lunch', raisedAt: now },
    { id: 'd5', category: 'dining', state: 'OPEN', partySize: 2, earliest: at(1, 20), latest: at(1, 21), lat: 34.6, lng: -84.39, radiusMiles: 5, note: 'Out of town', raisedAt: now },
  ];

  const snapshot = (): DemandFeedSnapshot => ({
    demand,
    // No location means no supply. A business still in setup can see what
    // demand it is missing, which is the argument for finishing setup.
    supply: location
      ? [
          {
            bookableId: 'bk_table_4',
            title: 'Table for 4',
            domain: 'dining',
            location,
            priceCents: 0,
            maxGuests: 4,
            slots: buildAvailabilityGrid({
              domain: 'dining',
              window: { weekdays: [4, 5, 6], openMins: 18 * 60, closeMins: 23 * 60, quantity: 4 },
              days: 14,
              from: now,
              now,
            }),
          },
        ]
      : [],
  });

  return {
    loadFeed: async () => ({ status: 200, value: snapshot() }),

    /**
     * Runs the same guard the console does, so the demo cannot accept a
     * response the role is not allowed to give.
     */
    respond: async (demandId, _bookableId, operation) => {
      const current = demand.find((item) => item.id === demandId);
      if (!current) return { status: 404, blockers: ['That request is no longer open'] };
      const next = respondToDemand({ ...current, state: 'MATCHED' }, 'owner', operation);
      if (!next) return { status: 422, blockers: ['That response is not allowed from here'] };
      demand = demand.map((item) => (item.id === demandId ? next : item));
      return { status: 200, value: snapshot() };
    },
  };
}
