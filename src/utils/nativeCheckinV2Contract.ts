export const NATIVE_CHECKIN_V2_ROUTES = {
  createCheckIn: 'checkins.create',
  sync: 'checkins.sync',
  reconcilePoints: 'checkins.reconcilePoints',
  providerCounts: 'checkins.providerCounts',
  venueIntelligence: 'venues.intelligence',
  verify: 'checkins.verify',
  groupJoin: 'groupEvents.join',
} as const;

export type NativeCheckInTrustLevel = 'staticDiscovery' | 'proximate' | 'signedToken' | 'nfcCounterVerified';
export type NativeCheckInSource = 'native_ios_manual' | 'app_clip_group' | 'provider_console' | 'web_discover';
export type NativeCheckInProviderSource = 'backend' | 'fallback';

export interface NativeCheckInCreateInput {
  venueId: string;
  idempotencyKey: string;
  trustLevel: NativeCheckInTrustLevel;
  source: NativeCheckInSource;
  observedAt?: string;
  patchId?: string;
  groupEventId?: string;
}

export interface NativeCheckInCreateResponse {
  checkInId: string;
  venueId: string;
  trustLevel: NativeCheckInTrustLevel;
  pointsAwarded: number;
  pointsBalance?: number;
  syncedAt: string;
  providerVisible: boolean;
}

export interface NativeCheckInProviderCountsInput {
  vendorId?: string;
  serviceId?: string;
  venueId?: string;
  patchId?: string;
  window?: 'live' | 'today' | 'last24h';
}

export interface NativeCheckInProviderVenueCount {
  venueId: string;
  venueName?: string | null;
  manual: number;
  verified: number;
  activeNow: number;
}

export interface NativeCheckInProviderCountsResponse {
  source: NativeCheckInProviderSource;
  total: number;
  manual: number;
  verified: number;
  activeNow: number;
  pendingSync: number;
  updatedAt: string | null;
  venues: NativeCheckInProviderVenueCount[];
}

type QueryLike<TInput, TOutput> = { query(input: TInput): Promise<TOutput> };
type CheckInCountsTrpcLike = {
  checkins?: { providerCounts?: QueryLike<NativeCheckInProviderCountsInput, unknown> };
  providers?: { checkInCounts?: QueryLike<NativeCheckInProviderCountsInput, unknown> };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberFrom(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeVenueCount(value: unknown): NativeCheckInProviderVenueCount | null {
  if (!isRecord(value) || value.venueId == null) return null;
  return {
    venueId: String(value.venueId),
    venueName: stringOrNull(value.venueName),
    manual: numberFrom(value.manual ?? value.manualCount),
    verified: numberFrom(value.verified ?? value.verifiedCount),
    activeNow: numberFrom(value.activeNow ?? value.active),
  };
}

export function buildManualCheckInCreateInput(input: {
  venueId: string;
  idempotencyKey: string;
  observedAt?: string | Date;
  patchId?: string;
  groupEventId?: string;
}): NativeCheckInCreateInput {
  const observedAt = input.observedAt instanceof Date ? input.observedAt.toISOString() : input.observedAt;
  return {
    venueId: input.venueId,
    idempotencyKey: input.idempotencyKey,
    trustLevel: 'staticDiscovery',
    source: 'native_ios_manual',
    ...(observedAt ? { observedAt } : {}),
    ...(input.patchId ? { patchId: input.patchId } : {}),
    ...(input.groupEventId ? { groupEventId: input.groupEventId } : {}),
  };
}

export function normalizeProviderCheckInCounts(response: unknown): NativeCheckInProviderCountsResponse {
  const root = isRecord(response) ? response : {};
  const counts = isRecord(root.counts) ? root.counts : root;
  const venues = Array.isArray(root.venues) ? root.venues : Array.isArray(counts.venues) ? counts.venues : [];
  const manual = numberFrom(counts.manual ?? counts.manualCount);
  const verified = numberFrom(counts.verified ?? counts.verifiedCount);
  return {
    source: root.source === 'fallback' ? 'fallback' : 'backend',
    total: numberFrom(counts.total ?? manual + verified),
    manual,
    verified,
    activeNow: numberFrom(counts.activeNow ?? counts.active),
    pendingSync: numberFrom(counts.pendingSync),
    updatedAt: stringOrNull(root.updatedAt ?? counts.updatedAt),
    venues: venues.map(normalizeVenueCount).filter((row): row is NativeCheckInProviderVenueCount => Boolean(row)),
  };
}

export async function loadProviderCheckInCountsViaRpc(
  trpcClient: CheckInCountsTrpcLike,
  input: NativeCheckInProviderCountsInput,
): Promise<NativeCheckInProviderCountsResponse> {
  try {
    const primary = trpcClient.checkins?.providerCounts;
    if (primary) return normalizeProviderCheckInCounts(await primary.query(input));
    const legacy = trpcClient.providers?.checkInCounts;
    if (legacy) return normalizeProviderCheckInCounts(await legacy.query(input));
  } catch {
    // Backend route is a v2 follow-up; provider UI must remain usable offline.
  }
  return { source: 'fallback', total: 0, manual: 0, verified: 0, activeNow: 0, pendingSync: 0, updatedAt: null, venues: [] };
}
