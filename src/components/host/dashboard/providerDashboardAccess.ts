import type { DashboardView } from './HostDashboardLayout';

export type ProviderRole = 'owner' | 'manager' | 'staff';
export type ProviderBusinessMode = 'standard' | 'cottage';

export type ProviderDashboardAccess = {
  role: ProviderRole;
  businessMode: ProviderBusinessMode;
  isCottage: boolean;
  canSeeFinancials: boolean;
  canManagePayouts: boolean;
  canSeeAdvancedConfig: boolean;
  canSeeEnterpriseTelemetry: boolean;
  allowedViews: DashboardView[];
};

const OWNER_VIEWS: DashboardView[] = ['overview', 'listings', 'bookings', 'earnings', 'reviews', 'calendar', 'patches', 'compliance', 'settings'];
const MANAGER_VIEWS: DashboardView[] = ['overview', 'listings', 'bookings', 'reviews', 'calendar', 'patches', 'settings'];
const STAFF_VIEWS: DashboardView[] = ['overview', 'bookings', 'calendar', 'settings'];
const COTTAGE_OWNER_VIEWS: DashboardView[] = ['overview', 'listings', 'bookings', 'earnings', 'calendar', 'patches', 'settings'];

function normalizeRole(value: unknown): ProviderRole {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'manager') return 'manager';
  if (normalized === 'staff') return 'staff';
  return 'owner';
}

function normalizeBusinessMode(value: unknown): ProviderBusinessMode {
  const normalized = String(value ?? '').toLowerCase();
  return normalized === 'cottage' ? 'cottage' : 'standard';
}

export function roleLabel(role: ProviderRole): string {
  if (role === 'manager') return 'Manager';
  if (role === 'staff') return 'Staff';
  return 'Owner';
}

export function readProviderDashboardAccess(): ProviderDashboardAccess {
  let storedUser: Record<string, unknown> = {};
  try {
    storedUser = JSON.parse(localStorage.getItem('bytspot_user') || '{}') as Record<string, unknown>;
  } catch {
    storedUser = {};
  }

  const role = normalizeRole(
    localStorage.getItem('bytspot_provider_role') ??
    storedUser.providerRole ??
    storedUser.role ??
    'owner',
  );
  const businessMode = normalizeBusinessMode(
    localStorage.getItem('bytspot_provider_business_mode') ??
    storedUser.providerBusinessMode ??
    storedUser.businessMode ??
    (localStorage.getItem('bytspot_provider_is_cottage') === 'true' ? 'cottage' : 'standard'),
  );

  const baseViews = role === 'owner' ? (businessMode === 'cottage' ? COTTAGE_OWNER_VIEWS : OWNER_VIEWS) : role === 'manager' ? MANAGER_VIEWS : STAFF_VIEWS;

  return {
    role,
    businessMode,
    isCottage: businessMode === 'cottage',
    canSeeFinancials: role === 'owner',
    canManagePayouts: role === 'owner',
    canSeeAdvancedConfig: false,
    canSeeEnterpriseTelemetry: false,
    allowedViews: baseViews,
  };
}

export function canAccessDashboardView(access: ProviderDashboardAccess, view: DashboardView): boolean {
  return access.allowedViews.includes(view);
}

export function firstAllowedDashboardView(access: ProviderDashboardAccess): DashboardView {
  return access.allowedViews[0] ?? 'overview';
}

export function financialValue(access: ProviderDashboardAccess, value: string): string {
  return access.canSeeFinancials ? value : 'Restricted';
}

export function guidanceForRole(access: ProviderDashboardAccess): string {
  if (access.role === 'staff') return 'Staff mode shows only the tasks needed to operate today: arrivals, active bookings, and schedule handoffs.';
  if (access.role === 'manager') return 'Manager mode focuses on listings, bookings, calendars, reviews, and patch operations while keeping payout settings owner-only.';
  if (access.isCottage) return 'Cottage mode keeps your workspace lightweight: bookings, listings, patches, payouts, and a simple setup path.';
  return 'Owner mode includes full financials, Stripe Connect payouts, compliance, listings, bookings, and calendar operations.';
}
