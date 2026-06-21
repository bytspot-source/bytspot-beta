/**
 * Contact hashing — privacy-first contact graph (WS-Social Phase 1).
 *
 * Web mirror of the server `src/lib/contactHash.ts` and the native
 * `BytspotContactHasher.swift`. Raw contacts are never sent — only a salted
 * SHA-256 of the normalized email/phone is posted to social.syncCloudContact.
 *
 * IMPORTANT: the normalization rules below are the shared contract with the
 * server and native client. Any change here MUST be mirrored there or
 * web-sourced hashes will stop matching server-stored hashes.
 */

/**
 * Resolved salt: Vite build-time env (VITE_CONTACT_HASH_SALT) → dev default.
 * Mirrors the server's `config.contactHashSalt` dev fallback so a local
 * backend matches out of the box. Production builds must set the env var to
 * match the deployed CONTACT_HASH_SALT.
 */
const contactHashEnv = (import.meta as unknown as { env?: { VITE_CONTACT_HASH_SALT?: string } }).env;

export const CONTACT_HASH_SALT: string =
  contactHashEnv?.VITE_CONTACT_HASH_SALT?.trim() || 'dev-contact-salt-change-me';

/** Lowercase + trim. Returns null when the value is not a plausible email. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return v.length > 2 && v.includes('@') ? v : null;
}

/**
 * Normalize a phone number to a digit-only string.
 * Rules (must match the server + native client):
 *   - strip every non-digit character
 *   - a bare 10-digit number is assumed NANP → prefix "1"
 *   - everything else is kept as-is (best-effort international)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  if (digits.length < 7) return null; // too short to be a real number
  return digits.length === 10 ? `1${digits}` : digits;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Salted hash of a normalized email, or null when not hashable. */
export async function hashEmail(raw: string | null | undefined): Promise<string | null> {
  const v = normalizeEmail(raw);
  return v ? sha256Hex(`${CONTACT_HASH_SALT}:email:${v}`) : null;
}

/** Salted hash of a normalized phone, or null when not hashable. */
export async function hashPhone(raw: string | null | undefined): Promise<string | null> {
  const v = normalizePhone(raw);
  return v ? sha256Hex(`${CONTACT_HASH_SALT}:phone:${v}`) : null;
}

/**
 * Hash an arbitrary contact value, auto-detecting email vs phone by the
 * presence of "@".
 */
export async function hashContactValue(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  return raw.includes('@') ? hashEmail(raw) : hashPhone(raw);
}

/** True when the Web Contact Picker API is available (Android Chrome). */
export function isContactPickerSupported(): boolean {
  return typeof navigator !== 'undefined'
    && 'contacts' in navigator
    && typeof (navigator as Navigator & { contacts?: { select?: unknown } }).contacts?.select === 'function';
}

type WebContact = { email?: string[]; tel?: string[] };
type WebContactsManager = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<WebContact[]>;
};

/**
 * Open the Web Contact Picker, hash the selected emails/phones on-device, and
 * return the unique 64-char hex hashes. Returns null when the picker is
 * unsupported or the user cancels. Raw contacts never leave the device.
 */
export async function pickAndHashContacts(): Promise<string[] | null> {
  if (!isContactPickerSupported()) return null;
  const manager = (navigator as Navigator & { contacts?: WebContactsManager }).contacts;
  if (!manager) return null;

  let contacts: WebContact[];
  try {
    contacts = await manager.select(['email', 'tel'], { multiple: true });
  } catch {
    return null; // user cancelled or permission denied
  }

  const hashes = new Set<string>();
  for (const contact of contacts) {
    for (const email of contact.email ?? []) {
      const h = await hashEmail(email);
      if (h) hashes.add(h);
    }
    for (const tel of contact.tel ?? []) {
      const h = await hashPhone(tel);
      if (h) hashes.add(h);
    }
  }
  return Array.from(hashes);
}
