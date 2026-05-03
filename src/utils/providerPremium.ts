export const PROVIDER_PREMIUM_EVENT = 'bytspot:provider-premium-updated';

const PROVIDER_PREMIUM_KEY = 'bytspot_provider_premium_entitlement';

export type ProviderPremiumTier = 'free' | 'vendor-premium' | 'valet-premium';

export interface ProviderPremiumEntitlement {
  isActive: boolean;
  tier: ProviderPremiumTier;
  label: 'Free Provider' | 'Vendor Premium' | 'Valet Premium';
  activatedAt: string | null;
  source: 'local-preview' | 'subscription';
}

const FREE_PROVIDER: ProviderPremiumEntitlement = {
  isActive: false,
  tier: 'free',
  label: 'Free Provider',
  activatedAt: null,
  source: 'local-preview',
};

function readEntitlement(): ProviderPremiumEntitlement {
  try {
    const raw = localStorage.getItem(PROVIDER_PREMIUM_KEY);
    if (!raw) return FREE_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<ProviderPremiumEntitlement>;
    return {
      ...FREE_PROVIDER,
      ...parsed,
      isActive: parsed.isActive === true,
      tier: parsed.tier ?? 'free',
      label: parsed.label ?? 'Free Provider',
      source: parsed.source ?? 'local-preview',
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

export function activateProviderPremiumPreview(tier: Exclude<ProviderPremiumTier, 'free'> = 'vendor-premium'): ProviderPremiumEntitlement {
  return writeEntitlement({
    isActive: true,
    tier,
    label: tier === 'valet-premium' ? 'Valet Premium' : 'Vendor Premium',
    activatedAt: new Date().toISOString(),
    source: 'local-preview',
  });
}

export function clearProviderPremiumPreview(): ProviderPremiumEntitlement {
  localStorage.removeItem(PROVIDER_PREMIUM_KEY);
  window.dispatchEvent(new Event(PROVIDER_PREMIUM_EVENT));
  return FREE_PROVIDER;
}