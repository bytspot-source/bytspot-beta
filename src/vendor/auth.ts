import { vendorAuthContract, type VendorAuthRefusalId, type VendorAuthStepId } from './vendorConsole.ts';
import { openSession, type Seat, type Seller, type SessionRefusal, type VendorSession } from './seller.ts';

/**
 * A verified person. This is what a token proves, and it is deliberately not a
 * seat: one person can hold seats in several businesses, and which one they are
 * acting as is a separate choice made after identity is settled.
 */
export interface VendorPrincipal {
  personId: string;
  email: string;
  /** Seconds since epoch at which the access token stops being accepted. */
  expiresAtSecs: number;
}

/** One seat this principal holds, with the business it sits in. */
export interface VendorMembership {
  seller: Seller;
  seat: Seat;
}

/**
 * The access token, kept apart from the principal so it can be held in memory
 * only and dropped without losing the identity it proved. It is never written
 * to storage, never put in a URL and never included in a refusal.
 */
export interface AccessToken {
  value: string;
  expiresAtSecs: number;
}

export interface SignInStarted {
  /** Opaque handle for the code exchange. Not the code, and not a credential. */
  challengeId: string;
  resendAfterSecs: number;
}

export type AuthRefusal = VendorAuthRefusalId;

export type StartResult =
  | { ok: true; started: SignInStarted; reason?: never }
  | { ok: false; reason: AuthRefusal };

export type VerifyResult =
  | { ok: true; principal: VendorPrincipal; token: AccessToken; memberships: VendorMembership[]; reason?: never }
  | { ok: false; reason: AuthRefusal };

/**
 * Everything that talks to the API, injected. The console never builds a request
 * itself, so there is exactly one place a token can be attached and exactly one
 * place a refusal is interpreted.
 */
export interface AuthTransport {
  requestCode: (email: string) => Promise<{ status: number; challengeId?: string; retryAfterSecs?: number }>;
  submitCode: (input: { challengeId: string; code: string }) => Promise<{
    status: number;
    accessToken?: string;
    expiresInSecs?: number;
    person?: { id: string; email: string };
    memberships?: VendorMembership[];
  }>;
  /** Spends the httpOnly refresh cookie. The cookie itself is never read here. */
  refresh: () => Promise<{ status: number; accessToken?: string; expiresInSecs?: number }>;
  signOut: () => Promise<void>;
}

export interface AuthClock {
  nowSecs: () => number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isPlausibleEmail(email: string): boolean {
  return EMAIL.test(email.trim());
}

/** A code is digits of a fixed length. Anything else is refused without a call. */
export function isWellFormedCode(code: string): boolean {
  const { length } = vendorAuthContract().code;
  return new RegExp(`^\\d{${length}}$`).test(code.trim());
}

/**
 * The only place an HTTP status becomes a refusal. Every failure that could
 * distinguish an unknown email from a wrong code collapses to invalid-code, so
 * the endpoint cannot be used to enumerate accounts.
 */
export function refusalForStatus(status: number): AuthRefusal {
  if (status === 429) return 'rate-limited';
  if (status === 423) return 'locked';
  if (status === 403) return 'no-seats';
  return 'invalid-code';
}

export async function startSignIn(
  email: string,
  transport: AuthTransport,
): Promise<StartResult> {
  const { code } = vendorAuthContract();
  // A malformed address is refused locally, which keeps the rate limit for
  // addresses that could actually exist.
  if (!isPlausibleEmail(email)) return { ok: false, reason: 'invalid-code' };

  const response = await transport.requestCode(email.trim().toLowerCase());
  if (response.status !== 200 || !response.challengeId) {
    return { ok: false, reason: refusalForStatus(response.status) };
  }
  return {
    ok: true,
    started: {
      challengeId: response.challengeId,
      resendAfterSecs: response.retryAfterSecs ?? code.resendCooldownSecs,
    },
  };
}

/**
 * Exchanges a code for a principal and the seats it holds. A person with a valid
 * code but no seats is refused here rather than dropped into an empty console,
 * because there is nothing for them to do until an owner invites them.
 */
export async function completeSignIn(
  input: { challengeId: string; code: string },
  transport: AuthTransport,
  clock: AuthClock = { nowSecs: () => Math.floor(Date.now() / 1000) },
): Promise<VerifyResult> {
  if (!isWellFormedCode(input.code)) return { ok: false, reason: 'invalid-code' };

  const response = await transport.submitCode({ challengeId: input.challengeId, code: input.code.trim() });
  if (response.status !== 200 || !response.accessToken || !response.person) {
    return { ok: false, reason: refusalForStatus(response.status) };
  }

  const memberships = (response.memberships ?? []).filter(
    (membership) => membership.seat.sellerId === membership.seller.id,
  );
  if (memberships.length === 0) return { ok: false, reason: 'no-seats' };

  const ttl = response.expiresInSecs ?? vendorAuthContract().token.accessTtlSecs;
  const expiresAtSecs = clock.nowSecs() + ttl;
  return {
    ok: true,
    principal: { personId: response.person.id, email: response.person.email, expiresAtSecs },
    token: { value: response.accessToken, expiresAtSecs },
    memberships,
  };
}

export function tokenExpired(token: AccessToken, nowSecs: number): boolean {
  return token.expiresAtSecs <= nowSecs;
}

/** True while the token is close enough to expiry that it should be replaced. */
export function tokenNeedsRefresh(token: AccessToken, nowSecs: number): boolean {
  const { refreshBeforeExpirySecs } = vendorAuthContract().token;
  return token.expiresAtSecs - nowSecs <= refreshBeforeExpirySecs;
}

export type RefreshResult =
  | { ok: true; token: AccessToken; reason?: never }
  | { ok: false; reason: AuthRefusal };

/**
 * Spends the refresh cookie for a new access token. A failure here is always
 * expired-session: the refresh cookie is the last thing standing between the
 * console and a sign-in screen, so there is no partial recovery.
 */
export async function refreshAccess(
  transport: AuthTransport,
  clock: AuthClock = { nowSecs: () => Math.floor(Date.now() / 1000) },
): Promise<RefreshResult> {
  const response = await transport.refresh();
  if (response.status !== 200 || !response.accessToken) return { ok: false, reason: 'expired-session' };
  const ttl = response.expiresInSecs ?? vendorAuthContract().token.accessTtlSecs;
  return { ok: true, token: { value: response.accessToken, expiresAtSecs: clock.nowSecs() + ttl } };
}

export type VerifiedSessionRefusal = SessionRefusal | 'wrong-person' | 'expired-session' | 'no-seats';

export type VerifiedSessionResult =
  | { ok: true; session: VendorSession; reason?: never }
  | { ok: false; reason: VerifiedSessionRefusal };

/**
 * The gap this closes: openSession can decide whether a seat may act, but it
 * cannot know who is asking. Here the seat must belong to the principal that
 * the token proved, and the token must still be live, before the seat's own
 * rules are consulted at all.
 */
export function openVerifiedSession(
  principal: VendorPrincipal,
  membership: VendorMembership,
  nowSecs: number,
): VerifiedSessionResult {
  if (principal.expiresAtSecs <= nowSecs) return { ok: false, reason: 'expired-session' };
  if (membership.seat.personId !== principal.personId) return { ok: false, reason: 'wrong-person' };

  const opened = openSession(membership.seller, membership.seat, new Date(nowSecs * 1000));
  if (!opened.ok) return { ok: false, reason: opened.reason };
  return { ok: true, session: opened.session };
}

/**
 * Memberships this principal can actually open a console with. A seat on a
 * closed business, an expired invite or a revoked seat is filtered here so the
 * business picker never offers a door that will not open.
 */
export function openableMemberships(
  principal: VendorPrincipal,
  memberships: VendorMembership[],
  nowSecs: number,
): VendorMembership[] {
  return memberships.filter((membership) => openVerifiedSession(principal, membership, nowSecs).ok);
}

/**
 * Which business to land on. A remembered choice is honoured only if it is still
 * openable, so a suspended business does not trap a vendor who holds two seats.
 */
export function preferredMembership(
  principal: VendorPrincipal,
  memberships: VendorMembership[],
  nowSecs: number,
  lastSellerId?: string,
): VendorMembership | undefined {
  const openable = openableMemberships(principal, memberships, nowSecs);
  return openable.find((membership) => membership.seller.id === lastSellerId) ?? openable[0];
}

export function currentAuthStep(state: {
  principal?: VendorPrincipal;
  challengeId?: string;
  session?: VendorSession;
}): VendorAuthStepId {
  if (state.session) return 'console';
  if (state.principal) return 'seat';
  if (state.challengeId) return 'code';
  return 'email';
}

/**
 * The only key this origin is allowed to persist, checked against the contract
 * allowlist rather than trusted. Storing a token would put it within reach of
 * any injected script, so the write is refused rather than sanitised.
 */
export function rememberSeller(sellerId: string, storage: Pick<Storage, 'setItem'>): boolean {
  if (!vendorAuthContract().persistableKeys.includes('lastSellerId')) return false;
  try {
    storage.setItem('bytspot.vendor.lastSellerId', sellerId);
    return true;
  } catch {
    // A vendor with storage disabled still gets a console, just without a default.
    return false;
  }
}

export function recallSeller(storage: Pick<Storage, 'getItem'>): string | undefined {
  try {
    return storage.getItem('bytspot.vendor.lastSellerId') ?? undefined;
  } catch {
    return undefined;
  }
}
