// Consumer discovery taxonomy, resolved at the boundary where vendor inventory
// enters. Kept in lockstep with the hand-written Swift by
// scripts/assert-discovery-taxonomy.mjs, which reads the same contract.
//
// A category with no alias resolves to the fallback rail rather than vanishing:
// the place stays visible and routable, and the parity gate fails naming the
// category so the alias can be added. Hiding it would lose real inventory and
// buy nothing, because capability is gated separately — an unmapped place is
// Listed, which promises nothing.

import contract from '../../contracts/discovery-taxonomy.json' with { type: 'json' };

export type DiscoveryRailToken = string;

export const DISCOVERY_RAIL_TOKENS: readonly DiscoveryRailToken[] = contract.rails.map((rail) => rail.token);
export const DISCOVERY_RAIL_LABELS: readonly string[] = contract.rails.map((rail) => rail.label);
export const DISCOVERY_FALLBACK_RAIL: DiscoveryRailToken = contract.fallbackRail;

const ALIASES: Record<string, DiscoveryRailToken> = contract.aliases;
const LABEL_TO_TOKEN = new Map(contract.rails.map((rail) => [rail.label.toLowerCase(), rail.token]));

function normalize(category: string): string {
  return category.trim().toLowerCase();
}

/** The rail a category names, or null when nothing on the contract claims it. */
export function railForCategory(category: string | null | undefined): DiscoveryRailToken | null {
  if (!category) return null;
  const normalized = normalize(category);
  if (!normalized) return null;
  const label = LABEL_TO_TOKEN.get(normalized);
  if (label) return label;
  if (ALIASES[normalized]) return ALIASES[normalized];
  return DISCOVERY_RAIL_TOKENS.includes(normalized) ? normalized : null;
}

/** Never null: an unclaimed category still lands on a shelf. */
export function resolveRail(category: string | null | undefined): DiscoveryRailToken {
  return railForCategory(category) ?? DISCOVERY_FALLBACK_RAIL;
}

/** First claimed rail wins, preferring a specific shelf over the catch-all.
 *  Third-party vocabularies (Google types, Yelp aliases) name several
 *  categories at once and only some of them are ours to map. */
export function resolveRailFromList(categories: readonly (string | null | undefined)[]): DiscoveryRailToken {
  const claimed = categories.map(railForCategory).filter((rail): rail is DiscoveryRailToken => rail !== null);
  return claimed.find((rail) => rail !== DISCOVERY_FALLBACK_RAIL) ?? claimed[0] ?? DISCOVERY_FALLBACK_RAIL;
}

/** True when the category reached the fallback without being claimed. */
export function isUnmappedCategory(category: string | null | undefined): boolean {
  if (!category || !normalize(category)) return false;
  return railForCategory(category) === null;
}

/** Every category a document names that no rail claims, for the parity gate. */
export function unmappedCategories(categories: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const category of categories) {
    if (isUnmappedCategory(category)) seen.add(normalize(category as string));
  }
  return [...seen].sort();
}

export type DiscoveryCapability = 'book' | 'order' | 'request' | 'redirect' | 'details';

const CAPABILITIES: Record<string, { label: string; ring: string; actionHex: string | null }> =
  contract.cardIndicator.capabilities;

export const DISCOVERY_CAPABILITY_ORDER = contract.cardIndicator.order as readonly DiscoveryCapability[];

export function capabilityLabel(capability: DiscoveryCapability): string {
  return CAPABILITIES[capability].label;
}

export function capabilityRing(capability: DiscoveryCapability): string {
  return CAPABILITIES[capability].ring;
}

/** Premium is earned by supply. A rail never selects a chassis. */
export function chassisFor(capability: DiscoveryCapability, options: { isPublishedParty?: boolean } = {}): 'premium' | 'plain' {
  if (options.isPublishedParty) return 'premium';
  return (contract.chassis.premium as readonly string[]).includes(capability) ? 'premium' : 'plain';
}
