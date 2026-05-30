/**
 * Bytspot Black — stealth invite gate.
 *
 * Black tier is invisible in the public onboarding picker. Operators
 * receive an invite code (e.g. ?invite=BLACK-ABC123) that flips the
 * provider draft into a Black-tier flow and pre-selects the operational
 * shape so the wizard can skip the public tier/provider-type picker.
 *
 * Validation is currently a client-side stub. Once bytspot-api ships
 * `providers.redeemBlackInvite`, swap `validateBlackInvite` to call
 * that endpoint — the surface here keeps the shape identical.
 */

export const BLACK_INVITE_STORAGE_KEY = 'bytspot_black_invite';
export const BLACK_INVITE_REGEX = /^BLACK-[A-Z0-9]{6,32}$/;

export interface BlackInviteRecord {
  code: string;
  acceptedAt: string;
  source: 'url' | 'storage';
}

/** Read `?invite=...` from the current URL, normalize, and return the candidate (or null). */
export function readInviteFromUrl(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const raw = params.get('invite') ?? params.get('inviteCode');
    if (!raw) return null;
    return raw.trim().toUpperCase();
  } catch {
    return null;
  }
}

/** Strict format check — rejects anything that isn't `BLACK-` prefixed with 6–32 alnum chars. */
export function isBlackInviteFormat(code: string | null | undefined): code is string {
  return typeof code === 'string' && BLACK_INVITE_REGEX.test(code);
}

/**
 * Stub validator. Returns `{ ok, tier }` synchronously. Replace the body with a
 * trpc.providers.redeemBlackInvite mutation once the endpoint lands; the call
 * sites only consume `ok` + `tier`.
 */
export function validateBlackInvite(code: string | null | undefined): { ok: boolean; tier: 'black' | null; code: string | null } {
  if (!isBlackInviteFormat(code)) return { ok: false, tier: null, code: null };
  return { ok: true, tier: 'black', code };
}

/**
 * Async stub for `providers.redeemBlackInvite`. Mirrors the shape the eventual
 * tRPC mutation will return so call sites can adopt it now and swap the body
 * for `trpc.providers.redeemBlackInvite.mutate({ code })` later.
 */
export async function redeemBlackInvite(code: string | null | undefined): Promise<{ ok: boolean; tier: 'black' | null; code: string | null }> {
  return validateBlackInvite(code);
}

/** Persist the accepted invite locally so refreshes / cross-tab nav keep the gate open. */
export function persistBlackInvite(record: BlackInviteRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BLACK_INVITE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage is optional — the gate still works for the current session via in-memory state.
  }
}

/** Load a previously accepted invite from storage (returns null if missing or malformed). */
export function loadStoredBlackInvite(): BlackInviteRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BLACK_INVITE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BlackInviteRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isBlackInviteFormat(parsed.code)) return null;
    return {
      code: parsed.code,
      acceptedAt: typeof parsed.acceptedAt === 'string' ? parsed.acceptedAt : new Date().toISOString(),
      source: parsed.source === 'url' || parsed.source === 'storage' ? parsed.source : 'storage',
    };
  } catch {
    return null;
  }
}

/** Clear the stored invite (used on sign-out or explicit revoke). */
export function clearStoredBlackInvite(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BLACK_INVITE_STORAGE_KEY);
  } catch {
    // No-op — clearing is best-effort.
  }
}

/**
 * One-call helper for the onboarding shell: resolves the invite from the URL
 * first, falling back to a previously accepted one in storage. Returns the
 * accepted record (and persists it if it came from the URL) or null.
 */
export function resolveBlackInvite(): BlackInviteRecord | null {
  const fromUrl = readInviteFromUrl();
  const validated = validateBlackInvite(fromUrl);
  if (validated.ok && validated.code) {
    const record: BlackInviteRecord = { code: validated.code, acceptedAt: new Date().toISOString(), source: 'url' };
    persistBlackInvite(record);
    return record;
  }
  return loadStoredBlackInvite();
}
