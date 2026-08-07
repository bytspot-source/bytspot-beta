/**
 * Access-pass wallet plus a cached view of canonical Bytspot membership.
 * The backend's legacy isPremium flag maps to Platinum; it never creates a
 * separate consumer tier and legacy locally persisted Insider status is ignored.
 */
import type { BytspotPatchTier } from './patchTiers.ts';

export const BYTSPOT_COMMERCE_EVENT = 'bytspot:commerce-updated';
export const PLATINUM_SUBSCRIPTION_PLAN = 'insider-premium'; // Backend compatibility identifier.

const MEMBERSHIP_KEY = 'bytspot_membership';
const LEGACY_MEMBERSHIP_KEY = 'bytspot_insider_membership';
const ACCESS_PASSES_KEY = 'bytspot_access_pass_wallet';
const LEGACY_TICKETS_KEY = 'bytspot_ticket_wallet';

export const PLATINUM_PERKS = [
  'Priority access cues',
  'Access wallet in Profile',
  'Faster paid-entry nights',
] as const;

export interface BytspotMembershipSnapshot {
  tier: BytspotPatchTier;
  label: 'Green' | 'Platinum' | 'Black';
  activatedAt: string | null;
  source: 'default' | 'subscription';
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
  window.dispatchEvent(new Event(BYTSPOT_COMMERCE_EVENT));
}

function greenMembership(): BytspotMembershipSnapshot {
  return {
    tier: 'green',
    label: 'Green',
    activatedAt: null,
    source: 'default',
  };
}

let currentMembership = greenMembership();

export function getBytspotMembership(storage: Pick<Storage, 'removeItem'> = localStorage): BytspotMembershipSnapshot {
  storage.removeItem(LEGACY_MEMBERSHIP_KEY);
  storage.removeItem(MEMBERSHIP_KEY);
  return currentMembership;
}

export function hasPlatinumAccess(membership: BytspotMembershipSnapshot): boolean {
  return membership.tier === 'platinum' || membership.tier === 'black';
}

export function syncBytspotMembershipFromSubscription(isPremium: boolean): BytspotMembershipSnapshot {
  const current = getBytspotMembership();
  const membership: BytspotMembershipSnapshot = isPremium ? {
    tier: 'platinum',
    label: 'Platinum',
    activatedAt: current.tier === 'platinum' ? current.activatedAt : new Date().toISOString(),
    source: 'subscription',
  } : {
    ...greenMembership(),
    source: 'subscription',
  };
  currentMembership = membership;
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