export const PROVIDER_PREMIUM_EVENT = 'bytspot:provider-premium-updated';

const PROVIDER_PREMIUM_KEY = 'bytspot_provider_premium_entitlement';

export type ProviderPremiumTier = 'free' | 'vendor-premium' | 'valet-premium';

export interface ProviderPremiumEntitlement {
  isActive: boolean;
  tier: ProviderPremiumTier;
  label: 'Free Provider' | 'Provider Premium' | 'Valet Premium';
  activatedAt: string | null;
  source: 'none' | 'subscription';
}

const FREE_PROVIDER: ProviderPremiumEntitlement = {
  isActive: false,
  tier: 'free',
  label: 'Free Provider',
  activatedAt: null,
  source: 'none',
};

function readEntitlement(): ProviderPremiumEntitlement {
  try {
    const raw = localStorage.getItem(PROVIDER_PREMIUM_KEY);
    if (!raw) return FREE_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<ProviderPremiumEntitlement>;
    const source = parsed.source === 'subscription' ? 'subscription' : 'none';
    const tier = source === 'subscription' ? parsed.tier ?? 'free' : 'free';
    return {
      ...FREE_PROVIDER,
      ...parsed,
      isActive: source === 'subscription' && parsed.isActive === true,
      tier,
      label: source === 'subscription' ? parsed.label ?? 'Free Provider' : 'Free Provider',
      source,
    };
  } catch {
    return FREE_PROVIDER;
  }
}

function writeEntitlement(entitlement: ProviderPremiumEntitlement): ProviderPremiumEntitlement {
  localStorage.setItem(PROVIDER_PREMIUM_KEY, JSON.stringify(entitlement));
  window.dispatchEvent(new Event(PROVIDER_PREMIUM_EVENT));
  return entitlement;
}

export function getProviderPremiumEntitlement(): ProviderPremiumEntitlement {
  return readEntitlement();
}

function hasActivePlan(status: any, tier: Exclude<ProviderPremiumTier, 'free'>): boolean {
  const activePlans = Array.isArray(status?.activePlans) ? status.activePlans : [];
  if (tier === 'valet-premium') return Boolean(status?.isValetPremium || activePlans.includes('valet-premium'));
  return Boolean(status?.isVendorPremium || activePlans.includes('vendor-premium'));
}

export function providerPremiumEntitlementFromSubscription(
  status: any,
  tier: Exclude<ProviderPremiumTier, 'free'> = 'vendor-premium',
): ProviderPremiumEntitlement {
  if (!hasActivePlan(status, tier)) return { ...FREE_PROVIDER, source: 'subscription' };

  return {
    isActive: true,
    tier,
    label: tier === 'valet-premium' ? 'Valet Premium' : 'Provider Premium',
    activatedAt: new Date().toISOString(),
    source: 'subscription',
  };
}

export function syncProviderPremiumEntitlementFromSubscription(
  status: any,
  tier: Exclude<ProviderPremiumTier, 'free'> = 'vendor-premium',
): ProviderPremiumEntitlement {
  return writeEntitlement(providerPremiumEntitlementFromSubscription(status, tier));
}

export function clearProviderPremiumEntitlement(): ProviderPremiumEntitlement {
  localStorage.removeItem(PROVIDER_PREMIUM_KEY);
  window.dispatchEvent(new Event(PROVIDER_PREMIUM_EVENT));
  return FREE_PROVIDER;
}