import { useCallback, useEffect, useState } from 'react';
import { trpc } from './trpc';

export type DashboardServiceSummary = {
  id: string;
  title: string;
  status: string;
  priceCents: number;
  currency: string;
  durationMins: number | null;
  updatedAt?: string;
  patchLabel?: string | null;
};

export type DashboardConnectStatus = {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason?: string | null;
  accountId?: string | null;
};

export type DashboardVendorSummary = {
  id?: string | null;
  displayName?: string | null;
  onboardingStatus?: string | null;
  stripeAccountId?: string | null;
  updatedAt?: string;
};

export type ProviderDashboardData = {
  loading: boolean;
  authenticated: boolean;
  services: DashboardServiceSummary[];
  activeServices: number;
  totalServices: number;
  listingHealth: number;
  connect: DashboardConnectStatus;
  vendor: DashboardVendorSummary | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const EMPTY_CONNECT: DashboardConnectStatus = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  disabledReason: null,
  accountId: null,
};

function readAuthToken(): string | null {
  try {
    const token = localStorage.getItem('bytspot_auth_token');
    if (!token || token === 'beta_guest') return null;
    return token;
  } catch {
    return null;
  }
}

function mapService(raw: any): DashboardServiceSummary {
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? 'Untitled service'),
    status: String(raw?.status ?? 'draft'),
    priceCents: Number(raw?.priceCents ?? 0),
    currency: String(raw?.currency ?? 'USD'),
    durationMins: raw?.durationMins ?? null,
    updatedAt: raw?.updatedAt,
    patchLabel: raw?.patch?.label ?? null,
  };
}

export function useProviderDashboardData(): ProviderDashboardData {
  const [loading, setLoading] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [services, setServices] = useState<DashboardServiceSummary[]>([]);
  const [connect, setConnect] = useState<DashboardConnectStatus>(EMPTY_CONNECT);
  const [vendor, setVendor] = useState<DashboardVendorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = readAuthToken();
    if (!token) {
      setAuthenticated(false);
      setServices([]);
      setConnect(EMPTY_CONNECT);
      setVendor(null);
      setError(null);
      setLoading(false);
      return;
    }
    setAuthenticated(true);
    setLoading(true);
    setError(null);
    try {
      const [servicesResult, connectResult] = await Promise.allSettled([
        trpc.vendors.listServices.query({ status: 'all', limit: 50 }),
        trpc.vendors.syncOnboarding.mutate(),
      ]);
      if (servicesResult.status === 'fulfilled') {
        const rows = (servicesResult.value as any)?.services ?? [];
        setServices(Array.isArray(rows) ? rows.map(mapService) : []);
      } else {
        setServices([]);
      }
      if (connectResult.status === 'fulfilled') {
        const value = connectResult.value as any;
        const account = value?.account ?? null;
        const vendorRow = value?.vendor ?? null;
        setVendor(vendorRow);
        setConnect({
          connected: Boolean(vendorRow?.stripeAccountId || account?.id),
          chargesEnabled: Boolean(account?.chargesEnabled || vendorRow?.onboardingStatus === 'active'),
          payoutsEnabled: Boolean(account?.payoutsEnabled || vendorRow?.onboardingStatus === 'active'),
          disabledReason: account?.disabledReason ?? null,
          accountId: vendorRow?.stripeAccountId ?? account?.id ?? null,
        });
      } else {
        setConnect(EMPTY_CONNECT);
        setVendor(null);
      }
      if (servicesResult.status === 'rejected' && connectResult.status === 'rejected') {
        setError('Unable to load provider data. Pull to refresh once your connection is restored.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load provider data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalServices = services.length;
  const activeServices = services.filter((service) => service.status === 'active').length;
  const listingHealth = totalServices === 0 ? 0 : Math.round((activeServices / totalServices) * 100);

  return {
    loading,
    authenticated,
    services,
    activeServices,
    totalServices,
    listingHealth,
    connect,
    vendor,
    error,
    refresh,
  };
}
