/**
 * insiderCommerce — local source of truth for Insider membership + access wallet.
 * Keeps demo flows centralized and easy to replace with real backend-backed commerce.
 */

export const INSIDER_COMMERCE_EVENT = 'bytspot:insider-commerce-updated';

const MEMBERSHIP_KEY = 'bytspot_insider_membership';
const ACCESS_PASSES_KEY = 'bytspot_access_pass_wallet';
const LEGACY_TICKETS_KEY = 'bytspot_ticket_wallet';

export const INSIDER_PERKS = [
  'Priority access cues',
  'Access wallet in Profile',
  'Faster paid-entry nights',
] as const;

export interface InsiderMembership {
  isActive: boolean;
  label: 'Community Member' | 'Insider';
  activatedAt: string | null;
  source: 'local' | 'premium';
}

export interface AccessPass {
  id: string;
  productId: string;
  productType: 'venue' | 'event' | 'parking';
  title: string;
  subtitle: string;
  location: string;
  priceLabel: string;
  accessLabel: string;
  purchasedAt: string;
  orderNumber: string;
  status: 'confirmed';
  ticketUrl?: string | null;
}

interface LegacyWalletTicket {
  id: string;
  venueId: string;
  venueName: string;
  venueType: string;
  venueLocation: string;
  priceLabel: string;
  purchasedAt: string;
  orderNumber: string;
  status: 'confirmed';
}

export interface AccessPassInput {
  id?: string | number | null;
  name: string;
  type?: string | null;
  location?: string | null;
  entryPrice?: string | null;
  productType?: AccessPass['productType'];
  subtitle?: string | null;
  accessLabel?: string | null;
  ticketUrl?: string | null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function emitCommerceUpdate(): void {
  window.dispatchEvent(new Event(INSIDER_COMMERCE_EVENT));
}

export function getInsiderMembership(): InsiderMembership {
  return readJson<InsiderMembership>(MEMBERSHIP_KEY, {
    isActive: false,
    label: 'Community Member',
    activatedAt: null,
    source: 'local',
  });
}

export function activateMockInsiderMembership(): InsiderMembership {
  const membership: InsiderMembership = {
    isActive: true,
    label: 'Insider',
    activatedAt: new Date().toISOString(),
    source: 'local',
  };
  writeJson(MEMBERSHIP_KEY, membership);
  emitCommerceUpdate();
  return membership;
}

export function syncInsiderMembershipFromPremium(isPremium: boolean): InsiderMembership {
  if (!isPremium) return getInsiderMembership();
  const current = getInsiderMembership();
  if (current.isActive && current.source === 'premium') return current;
  const membership: InsiderMembership = {
    isActive: true,
    label: 'Insider',
    activatedAt: current.activatedAt ?? new Date().toISOString(),
    source: 'premium',
  };
  writeJson(MEMBERSHIP_KEY, membership);
  emitCommerceUpdate();
  return membership;
}

function getDefaultAccessLabel(productType: AccessPass['productType']): string {
  if (productType === 'event') return 'Event pass';
  if (productType === 'parking') return 'Parking pass';
  return 'Entry pass';
}

function getAccessPassProductType(pass: AccessPassInput): AccessPass['productType'] {
  if (pass.productType) return pass.productType;
  if (pass.type === 'entertainment') return 'event';
  if (pass.type === 'parking') return 'parking';
  return 'venue';
}

export function getAccessPassProductId(pass: AccessPassInput): string {
  return String(pass.id ?? pass.name.trim().toLowerCase().replace(/\s+/g, '-'));
}

function migrateLegacyTickets(): AccessPass[] {
  const legacyTickets = readJson<LegacyWalletTicket[]>(LEGACY_TICKETS_KEY, []);
  if (legacyTickets.length === 0) return [];

  const migrated = legacyTickets.map<AccessPass>((ticket) => ({
    id: ticket.id,
    productId: ticket.venueId,
    productType: ticket.venueType === 'entertainment' ? 'event' : 'venue',
    title: ticket.venueName,
    subtitle: ticket.venueType === 'entertainment' ? 'Event access' : 'Venue access',
    location: ticket.venueLocation,
    priceLabel: ticket.priceLabel,
    accessLabel: ticket.venueType === 'entertainment' ? 'Event pass' : 'Entry pass',
    purchasedAt: ticket.purchasedAt,
    orderNumber: ticket.orderNumber,
    status: ticket.status,
  }));

  writeJson(ACCESS_PASSES_KEY, migrated);
  return migrated;
}

function syncLegacyTicketWallet(passes: AccessPass[]): void {
  const legacyTickets: LegacyWalletTicket[] = passes
    .filter((pass) => pass.productType !== 'parking')
    .map((pass) => ({
      id: pass.id,
      venueId: pass.productId,
      venueName: pass.title,
      venueType: pass.productType === 'event' ? 'entertainment' : pass.productType,
      venueLocation: pass.location,
      priceLabel: pass.priceLabel,
      purchasedAt: pass.purchasedAt,
      orderNumber: pass.orderNumber,
      status: pass.status,
    }));

  writeJson(LEGACY_TICKETS_KEY, legacyTickets);
}

function writeAccessPasses(passes: AccessPass[]): void {
  writeJson(ACCESS_PASSES_KEY, passes);
  syncLegacyTicketWallet(passes);
}

export function replaceAccessPassesFromServer(passes: AccessPass[]): AccessPass[] {
  writeAccessPasses(passes.slice(0, 12));
  emitCommerceUpdate();
  return getAccessPasses();
}

export function upsertAccessPass(pass: AccessPass): AccessPass {
  const existing = getAccessPasses().filter((item) => !(item.productId === pass.productId && item.productType === pass.productType));
  writeAccessPasses([pass, ...existing].slice(0, 12));
  emitCommerceUpdate();
  return pass;
}

export function getAccessPasses(): AccessPass[] {
  const stored = readJson<AccessPass[]>(ACCESS_PASSES_KEY, []);
  const passes = stored.length > 0 ? stored : migrateLegacyTickets();
  return passes.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
}

export function getAccessPassForProduct(pass: AccessPassInput): AccessPass | null {
  const productId = getAccessPassProductId(pass);
  const productType = getAccessPassProductType(pass);
  return getAccessPasses().find((item) => item.productId === productId && item.productType === productType) ?? null;
}

export function addAccessPassToWallet(pass: AccessPassInput): AccessPass {
  const existing = getAccessPassForProduct(pass);
  if (existing) return existing;

  const now = new Date().toISOString();
  const productType = getAccessPassProductType(pass);
  const accessPass: AccessPass = {
    id: `pass-${Date.now()}`,
    productId: getAccessPassProductId(pass),
    productType,
    title: pass.name,
    subtitle: pass.subtitle ?? (productType === 'event' ? 'Tonight · Event access' : 'Venue access'),
    location: pass.location ?? 'Atlanta Midtown',
    priceLabel: pass.entryPrice ?? (productType === 'parking' ? 'Parking reservation' : 'Paid entry'),
    accessLabel: pass.accessLabel ?? getDefaultAccessLabel(productType),
    purchasedAt: now,
    orderNumber: `BS-${Date.now().toString().slice(-6)}`,
    status: 'confirmed',
    ticketUrl: pass.ticketUrl ?? null,
  };

  writeAccessPasses([accessPass, ...getAccessPasses()].slice(0, 12));
  emitCommerceUpdate();
  return accessPass;
}