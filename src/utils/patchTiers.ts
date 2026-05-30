export type BytspotPatchTier = 'black' | 'platinum' | 'green';
export type BytspotTagUseMode = 'everyday' | 'one_time';
export type BytspotTagIntent = 'access' | 'friend_tap' | 'share' | 'social_tap';
export type BytspotTierResolutionSource = 'backend-registry' | 'url-tier' | 'tier-coded-tag' | 'service-price' | 'fallback';

export interface BytspotTierResolution {
  tier: BytspotPatchTier;
  source: BytspotTierResolutionSource;
  /** True when the server/registry can change this physical tag's tier without re-encoding the NFC URL. */
  dynamic: boolean;
}

export const BYTSPOT_PATCH_TIERS: readonly BytspotPatchTier[] = ['black', 'platinum', 'green'] as const;

export const BYTSPOT_PATCH_TIER_META: Record<BytspotPatchTier, { label: string; shortLabel: string; minCents: number }> = {
  black: { label: 'Bytspot Black', shortLabel: 'Black', minCents: 45000 },
  platinum: { label: 'Bytspot Platinum', shortLabel: 'Platinum', minCents: 5000 },
  green: { label: 'Bytspot Green', shortLabel: 'Green', minCents: 500 },
};

export function isBytspotPatchTier(value: unknown): value is BytspotPatchTier {
  return typeof value === 'string' && BYTSPOT_PATCH_TIERS.includes(value.toLowerCase() as BytspotPatchTier);
}

export function normalizeBytspotPatchTier(value: unknown, fallback: BytspotPatchTier | null = null): BytspotPatchTier | null {
  if (!isBytspotPatchTier(value)) return fallback;
  return value.toLowerCase() as BytspotPatchTier;
}

export function normalizeBytspotTagUseMode(value: unknown, fallback: BytspotTagUseMode | null = null): BytspotTagUseMode | null {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (['everyday', 'daily', 'member', 'monthly', 'retail', 'subscription', 'subscriber'].includes(normalized)) return 'everyday';
  if (['one_time', 'single', 'single_use', 'event', 'drop', 'temporary'].includes(normalized)) return 'one_time';
  return fallback;
}

export function normalizeBytspotTagIntent(value: unknown, fallback: BytspotTagIntent | null = null): BytspotTagIntent | null {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (['friend', 'friend_tap', 'guest', 'guest_pass', 'referral'].includes(normalized)) return 'friend_tap';
  if (['share', 'social_share', 'proof'].includes(normalized)) return 'share';
  if (['social', 'social_tap', 'group', 'group_tap'].includes(normalized)) return 'social_tap';
  if (normalized === 'access') return 'access';
  return fallback;
}

export function inferBytspotPatchTier(
  source: { tier?: unknown; priceCents?: number | null } | null | undefined,
  fallback: BytspotPatchTier = 'platinum',
): BytspotPatchTier {
  const explicit = normalizeBytspotPatchTier(source?.tier);
  if (explicit) return explicit;
  const priceCents = Number(source?.priceCents);
  if (!Number.isFinite(priceCents) || priceCents <= 0) return fallback;
  if (priceCents >= BYTSPOT_PATCH_TIER_META.black.minCents) return 'black';
  if (priceCents >= BYTSPOT_PATCH_TIER_META.platinum.minCents) return 'platinum';
  return 'green';
}

function queryValue(url: URL, names: readonly string[]): string | null {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [name, value] of url.searchParams.entries()) {
    if (wanted.has(name.toLowerCase())) return value;
  }
  return null;
}

export function detectTierCodedPatchId(patchId: string | null | undefined): BytspotPatchTier | null {
  const id = patchId?.trim().toUpperCase();
  if (!id) return null;
  if (id.startsWith('BLACK-') || id.startsWith('BYT-B-') || /[-_.](B|BLACK)$/.test(id)) return 'black';
  if (id.startsWith('PLATINUM-') || id.startsWith('BYT-P-') || /[-_.](P|PLATINUM)$/.test(id)) return 'platinum';
  if (id.startsWith('GREEN-') || id.startsWith('BYT-G-') || /[-_.](G|GREEN)$/.test(id)) return 'green';
  return null;
}

export function detectBytspotPatchTierFromUrl(url: URL, patchId?: string | null): BytspotPatchTier | null {
  const tier = normalizeBytspotPatchTier(queryValue(url, ['tier', 'scanner']));
  if (tier) return tier;

  const invite = queryValue(url, ['invite'])?.toUpperCase();
  if (invite?.startsWith('BLACK-')) return 'black';
  if (invite?.startsWith('PLATINUM-')) return 'platinum';
  if (invite?.startsWith('GREEN-')) return 'green';

  const parts = url.pathname.split('/').filter(Boolean).map((part) => part.toLowerCase());
  const pathMarker = parts[0] === 'p' || parts[0] === 'patch' ? parts[1] : parts[0];
  const pathTier = normalizeBytspotPatchTier(pathMarker?.split('-')[0]);
  if (pathTier) return pathTier;

  const codedTier = detectTierCodedPatchId(patchId ?? pathMarker);
  if (codedTier) return codedTier;
  return null;
}

export function detectBytspotTagUseModeFromUrl(url: URL): BytspotTagUseMode | null {
  const explicit = normalizeBytspotTagUseMode(queryValue(url, ['use', 'usage', 'mode', 'useMode', 'tagUseMode']));
  if (explicit) return explicit;
  if (queryValue(url, ['event', 'eventId', 'expires', 'expiresAt'])) return 'one_time';
  return null;
}

export function detectBytspotTagIntentFromUrl(url: URL): BytspotTagIntent | null {
  return normalizeBytspotTagIntent(queryValue(url, ['intent', 'action', 'tap']));
}

export function resolveBytspotPatchTier(input: {
  serverTier?: unknown;
  url?: URL | null;
  patchId?: string | null;
  service?: { tier?: unknown; priceCents?: number | null } | null;
  fallback?: BytspotPatchTier;
}): BytspotTierResolution {
  const fallback = input.fallback ?? 'platinum';
  const serverTier = normalizeBytspotPatchTier(input.serverTier);
  if (serverTier) return { tier: serverTier, source: 'backend-registry', dynamic: true };

  if (input.url) {
    const urlTier = normalizeBytspotPatchTier(queryValue(input.url, ['tier', 'scanner']));
    if (urlTier) return { tier: urlTier, source: 'url-tier', dynamic: false };
  }

  const pathMarker = input.url?.pathname.split('/').filter(Boolean).at(-1) ?? null;
  const codedTier = detectTierCodedPatchId(input.patchId ?? pathMarker);
  if (codedTier) return { tier: codedTier, source: 'tier-coded-tag', dynamic: false };

  if (input.service) return { tier: inferBytspotPatchTier(input.service, fallback), source: 'service-price', dynamic: false };
  return { tier: fallback, source: 'fallback', dynamic: false };
}

export function withBytspotPatchTier(url: string, tier: BytspotPatchTier, serviceId?: string | null): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tier', tier);
    if (serviceId && !parsed.searchParams.get('service')) parsed.searchParams.set('service', serviceId);
    return parsed.toString();
  } catch {
    return url;
  }
}