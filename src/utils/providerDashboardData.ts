import { useCallback, useEffect, useState } from 'react';
import { trpc } from './trpc';
import { persistProviderRoleFromBackend, type ProviderRole } from '../components/host/dashboard/providerDashboardAccess';

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
  providerRole?: ProviderRole | null;
  groups?: string[];
  updatedAt?: string;
};

export type DashboardBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type DashboardBookingCashFlow = {
  grossCents: number;
  platformFeeCents: number;
  providerPayoutEstimateCents: number;
  commissionBps: number;
};

export type DashboardBookingSummary = {
  id: string;
  serviceId: string | null;
  serviceTitle: string;
  status: DashboardBookingStatus;
  startsAt: string;
  endsAt: string | null;
  guestName: string | null;
  patchLabel: string | null;
  priceCents: number;
  currency: string;
  cashFlow: DashboardBookingCashFlow;
};

export type DashboardPatchSummary = {
  id: string;
  uid?: string | null;
  label: string;
  venueName: string;
  createdAt: string;
  updatedAt?: string;
  url: string;
  status?: string | null;
  readCounter?: number;
  serviceId?: string | null;
  serviceTitle?: string | null;
};

export type DashboardEarningsTotals = {
  totalPayoutCents: number;
  totalGrossCents: number;
  totalPlatformFeeCents: number;
  thisMonthPayoutCents: number;
  lastMonthPayoutCents: number;
  pendingPayoutCents: number;
  paidBookingCount: number;
  pendingBookingCount: number;
};

export type ProviderDashboardData = {
  loading: boolean;
  authenticated: boolean;
  services: DashboardServiceSummary[];
  bookings: DashboardBookingSummary[];
  patches: DashboardPatchSummary[];
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
    if (!token || token === 'guest_session' || token === 'beta_guest') return null;
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

const VALID_BOOKING_STATUSES: ReadonlySet<DashboardBookingStatus> = new Set([
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
]);

function normalizeBookingStatus(raw: unknown): DashboardBookingStatus {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'paid') return 'confirmed';
  if (value === 'canceled') return 'cancelled';
  if (value === 'refunded' || value === 'disputed') return 'cancelled';
  return (VALID_BOOKING_STATUSES.has(value as DashboardBookingStatus)
    ? value
    : 'pending') as DashboardBookingStatus;
}

function mapBookingCashFlow(raw: any, fallbackPriceCents: number): DashboardBookingCashFlow {
  const cf = raw?.cashFlow ?? raw?.service?.cashFlow ?? null;
  const grossCents = Number(cf?.grossCents ?? fallbackPriceCents ?? 0);
  const platformFeeCents = Number(cf?.platformFeeCents ?? 0);
  const providerPayoutEstimateCents = Number(
    cf?.providerPayoutEstimateCents ?? Math.max(0, grossCents - platformFeeCents),
  );
  const commissionBps = Number(cf?.commissionBps ?? 0);
  return { grossCents, platformFeeCents, providerPayoutEstimateCents, commissionBps };
}

function mapBooking(raw: any): DashboardBookingSummary | null {
  const id = raw?.id != null ? String(raw.id) : null;
  const startsAt = raw?.startsAt ?? raw?.startTime ?? raw?.scheduledFor ?? null;
  if (!id || !startsAt) return null;
  const service = raw?.service ?? null;
  const priceCents = Number(raw?.priceCents ?? service?.priceCents ?? 0);
  return {
    id,
    serviceId: service?.id != null ? String(service.id) : raw?.serviceId != null ? String(raw.serviceId) : null,
    serviceTitle: String(service?.title ?? raw?.serviceTitle ?? 'Booking'),
    status: normalizeBookingStatus(raw?.status),
    startsAt: String(startsAt),
    endsAt: raw?.endsAt ?? raw?.endTime ?? null,
    guestName: raw?.guest?.displayName ?? raw?.guestName ?? null,
    patchLabel: raw?.patch?.label ?? raw?.patchLabel ?? null,
    priceCents,
    currency: String(raw?.currency ?? service?.currency ?? 'USD'),
    cashFlow: mapBookingCashFlow(raw, priceCents),
  };
}

function mapPatch(raw: any): DashboardPatchSummary | null {
  const id = raw?.id != null ? String(raw.id) : null;
  if (!id) return null;
  return {
    id,
    uid: raw?.uid ?? null,
    label: String(raw?.label ?? 'Provider Patch'),
    venueName: String(raw?.venueName ?? raw?.vendor?.displayName ?? 'Bytspot Provider'),
    createdAt: String(raw?.createdAt ?? raw?.updatedAt ?? new Date().toISOString()),
    updatedAt: raw?.updatedAt,
    url: String(raw?.url ?? ''),
    status: raw?.status ?? null,
    readCounter: Number(raw?.readCounter ?? 0),
    serviceId: raw?.serviceId != null ? String(raw.serviceId) : null,
    serviceTitle: raw?.serviceTitle ?? null,
  };
}

const PAID_STATUSES: ReadonlySet<DashboardBookingStatus> = new Set(['completed']);
const PENDING_STATUSES: ReadonlySet<DashboardBookingStatus> = new Set(['confirmed', 'in_progress']);

function safeBookingDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Aggregate booking-level cashFlow into the surfaces consumed by
 * DashboardEarnings. Cancelled and `pending` bookings never contribute to
 * payouts. `completed` rolls up into lifetime/this-month/last-month buckets;
 * `confirmed` and `in_progress` roll up into the pending-payout bucket.
 */
export function summarizeBookingEarnings(
  bookings: ReadonlyArray<DashboardBookingSummary>,
  now: Date = new Date(),
): DashboardEarningsTotals {
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastYear = lastMonthDate.getFullYear();
  const lastMonth = lastMonthDate.getMonth();
  const totals: DashboardEarningsTotals = {
    totalPayoutCents: 0,
    totalGrossCents: 0,
    totalPlatformFeeCents: 0,
    thisMonthPayoutCents: 0,
    lastMonthPayoutCents: 0,
    pendingPayoutCents: 0,
    paidBookingCount: 0,
    pendingBookingCount: 0,
  };
  for (const booking of bookings) {
    const payout = booking.cashFlow.providerPayoutEstimateCents;
    if (PAID_STATUSES.has(booking.status)) {
      totals.totalPayoutCents += payout;
      totals.totalGrossCents += booking.cashFlow.grossCents;
      totals.totalPlatformFeeCents += booking.cashFlow.platformFeeCents;
      totals.paidBookingCount += 1;
      const d = safeBookingDate(booking.startsAt);
      if (d) {
        if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) totals.thisMonthPayoutCents += payout;
        else if (d.getFullYear() === lastYear && d.getMonth() === lastMonth) totals.lastMonthPayoutCents += payout;
      }
    } else if (PENDING_STATUSES.has(booking.status)) {
      totals.pendingPayoutCents += payout;
      totals.pendingBookingCount += 1;
    }
  }
  return totals;
}

export function useProviderDashboardData(): ProviderDashboardData {
  const [loading, setLoading] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [services, setServices] = useState<DashboardServiceSummary[]>([]);
  const [bookings, setBookings] = useState<DashboardBookingSummary[]>([]);
  const [patches, setPatches] = useState<DashboardPatchSummary[]>([]);
  const [connect, setConnect] = useState<DashboardConnectStatus>(EMPTY_CONNECT);
  const [vendor, setVendor] = useState<DashboardVendorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = readAuthToken();
    if (!token) {
      setAuthenticated(false);
      setServices([]);
      setBookings([]);
      setPatches([]);
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
      const [servicesResult, connectResult, bookingsResult, patchesResult] = await Promise.allSettled([
        trpc.vendors.listServices.query({ status: 'all', limit: 50 }),
        trpc.vendors.syncOnboarding.mutate(),
        trpc.vendors.listBookings.query({ limit: 100 }),
        trpc.vendors.listPatches.query({ limit: 50 }),
      ]);
      if (servicesResult.status === 'fulfilled') {
        const rows = (servicesResult.value as any)?.services ?? [];
        setServices(Array.isArray(rows) ? rows.map(mapService) : []);
      } else {
        setServices([]);
      }
      if (bookingsResult.status === 'fulfilled') {
        const rows = (bookingsResult.value as any)?.bookings ?? [];
        const mapped = (Array.isArray(rows) ? rows : [])
          .map(mapBooking)
          .filter((row): row is DashboardBookingSummary => row !== null);
        setBookings(mapped);
      } else {
        // Backend may not yet expose vendors.listBookings in every environment;
        // surface a deterministic empty list so the calendar shows the
        // no-bookings branch instead of a hard error.
        setBookings([]);
      }
      if (patchesResult.status === 'fulfilled') {
        const rows = (patchesResult.value as any)?.patches ?? [];
        const mapped = (Array.isArray(rows) ? rows : [])
          .map(mapPatch)
          .filter((row): row is DashboardPatchSummary => row !== null);
        setPatches(mapped);
      } else {
        // Patch APIs may not be deployed in every preview environment yet.
        // Keep the dashboard live-ready by rendering an empty list instead of
        // a local list that would bypass backend state.
        setPatches([]);
      }
      if (connectResult.status === 'fulfilled') {
        const value = connectResult.value as any;
        const account = value?.account ?? null;
        const vendorRow = value?.vendor ?? null;
        const providerRole = persistProviderRoleFromBackend(value?.providerRole ?? vendorRow?.providerRole ?? null);
        const backendGroups = Array.isArray(vendorRow?.groups) ? vendorRow.groups.map(String) : [];
        setVendor(vendorRow ? { ...vendorRow, providerRole: providerRole ?? vendorRow.providerRole ?? null, groups: backendGroups } : null);
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
    bookings,
    patches,
    activeServices,
    totalServices,
    listingHealth,
    connect,
    vendor,
    error,
    refresh,
  };
}
