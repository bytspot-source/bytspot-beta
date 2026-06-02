export const GH_AKWAABA_PASS_VENDOR_NAME = 'GH Akwaaba Pass';
export const FIFA_MATCHDAY_PASS_TITLE = 'FIFA Matchday Pass';
export const FIFA_MATCHDAY_PASS_CATEGORY = 'events';
export const FIFA_MATCHDAY_PASS_TIER = 'platinum' as const;
export const FIFA_MATCHDAY_PASS_HIGHLIGHTS = [
  'Fast-track entry',
  'VIP Lounge access',
  'Digital pass delivery',
  'On-site host support',
] as const;

export interface GhAkwaabaFifaServicePayload {
  title: string;
  description: string | null;
  category: string;
  tier: typeof FIFA_MATCHDAY_PASS_TIER;
  tagline: string;
  etaLabel: string;
  includedHighlights: string[];
  priceCents: number;
  durationMins: number;
  maxGuests: number;
  patchRequired: boolean;
  status: 'draft' | 'active';
}

export interface GhAkwaabaPatchLinkInput {
  patchId: string;
  serviceId: string;
  baseUrl?: string;
  venueName?: string;
}

type TrpcLike = {
  vendors: {
    createService: { mutate(input: GhAkwaabaFifaServicePayload): Promise<unknown> };
    createPatch: { mutate(input: { label: string; serviceId: string }): Promise<unknown> };
  };
};

function requireId(value: unknown, label: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`Missing ${label}`);
}

function resultRecord(result: unknown, key: 'service' | 'patch'): Record<string, unknown> {
  const direct = result as Record<string, unknown> | null;
  const nested = (direct?.result as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  const record = (direct?.[key] ?? nested?.[key]) as Record<string, unknown> | undefined;
  if (!record || typeof record !== 'object') throw new Error(`Missing ${key} result`);
  return record;
}

export function buildGhAkwaabaFifaServicePayload(
  overrides: Partial<GhAkwaabaFifaServicePayload> = {},
): GhAkwaabaFifaServicePayload {
  return {
    title: FIFA_MATCHDAY_PASS_TITLE,
    description: 'Premium FIFA event access brokered by GH Akwaaba Pass with Bytspot Platinum concierge support.',
    category: FIFA_MATCHDAY_PASS_CATEGORY,
    tier: FIFA_MATCHDAY_PASS_TIER,
    tagline: 'Premium Event Access & Concierge',
    etaLabel: 'Digital pass ready',
    includedHighlights: [...FIFA_MATCHDAY_PASS_HIGHLIGHTS],
    priceCents: 5_000,
    durationMins: 240,
    maxGuests: 4,
    patchRequired: true,
    status: 'active',
    ...overrides,
  };
}

export function buildGhAkwaabaPassPatchUrl(input: GhAkwaabaPatchLinkInput): string {
  const patchId = requireId(input.patchId, 'patchId');
  const serviceId = requireId(input.serviceId, 'serviceId');
  const base = (input.baseUrl ?? 'https://bytspot.app').replace(/\/+$/, '');
  const venue = encodeURIComponent(input.venueName ?? GH_AKWAABA_PASS_VENDOR_NAME);
  return `${base}/p/${encodeURIComponent(patchId)}?patch=${encodeURIComponent(patchId)}&venue=${venue}&tier=platinum&service=${encodeURIComponent(serviceId)}`;
}

export function buildGhAkwaabaPassServiceSearchInput(patchId: string): { patchId: string; tier: 'platinum'; limit: 24 } {
  return { patchId: requireId(patchId, 'patchId'), tier: 'platinum', limit: 24 };
}

export function buildGhAkwaabaPassVendorSearchInput(input: { patchId: string; serviceId: string }): { patchId: string; serviceId: string; tier: 'platinum'; limit: 6 } {
  return { patchId: requireId(input.patchId, 'patchId'), serviceId: requireId(input.serviceId, 'serviceId'), tier: 'platinum', limit: 6 };
}

export async function registerGhAkwaabaFifaPass(
  trpcClient: TrpcLike,
  options: { patchLabel?: string; service?: Partial<GhAkwaabaFifaServicePayload>; baseUrl?: string } = {},
): Promise<{ serviceId: string; patchId: string; patchUrl: string; service: Record<string, unknown>; patch: Record<string, unknown> }> {
  const serviceResult = await trpcClient.vendors.createService.mutate(buildGhAkwaabaFifaServicePayload(options.service));
  const service = resultRecord(serviceResult, 'service');
  const serviceId = requireId(service.id, 'service.id');
  const patchResult = await trpcClient.vendors.createPatch.mutate({ label: options.patchLabel ?? 'FIFA Matchday Entry', serviceId });
  const patch = resultRecord(patchResult, 'patch');
  const patchId = requireId(patch.id, 'patch.id');
  return { serviceId, patchId, service, patch, patchUrl: buildGhAkwaabaPassPatchUrl({ patchId, serviceId, baseUrl: options.baseUrl }) };
}