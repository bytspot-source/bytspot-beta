/**
 * Unit tests for src/utils/blackInvite.ts.
 *
 * The module reaches for browser globals (localStorage, window.location) at
 * call time, so we install lightweight stubs before importing it. Mirrors
 * the pattern used by providerPremium.test.ts.
 *
 *   npm run test:unit
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

const storage = new MemoryStorage();
const windowStub = { location: { search: '' } };
(globalThis as any).localStorage = storage;
(globalThis as any).window = windowStub;

const {
  BLACK_INVITE_REGEX,
  BLACK_INVITE_STORAGE_KEY,
  readInviteFromUrl,
  isBlackInviteFormat,
  validateBlackInvite,
  redeemBlackInvite,
  persistBlackInvite,
  loadStoredBlackInvite,
  clearStoredBlackInvite,
  resolveBlackInvite,
} = await import('../blackInvite.ts');

beforeEach(() => {
  storage.clear();
  windowStub.location.search = '';
});

test('BLACK_INVITE_REGEX accepts canonical 6–32 alnum codes and rejects everything else', () => {
  assert.equal(BLACK_INVITE_REGEX.test('BLACK-ABC123'), true);
  assert.equal(BLACK_INVITE_REGEX.test('BLACK-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5'), true);
  assert.equal(BLACK_INVITE_REGEX.test('BLACK-ABCDE'), false);          // 5 chars after prefix
  assert.equal(BLACK_INVITE_REGEX.test('BLACK-ABC-DEF'), false);        // dash in body
  assert.equal(BLACK_INVITE_REGEX.test('black-abc123'), false);         // lowercase prefix
  assert.equal(BLACK_INVITE_REGEX.test('PLATINUM-ABC123'), false);      // wrong tier
  assert.equal(BLACK_INVITE_REGEX.test(''), false);
});

test('readInviteFromUrl extracts ?invite=, normalizes case, supports inviteCode alias', () => {
  assert.equal(readInviteFromUrl('?invite=BLACK-abc123'), 'BLACK-ABC123');
  assert.equal(readInviteFromUrl('invite=BLACK-XYZ789'), 'BLACK-XYZ789');
  assert.equal(readInviteFromUrl('?inviteCode=black-aaa111'), 'BLACK-AAA111');
  assert.equal(readInviteFromUrl('?other=foo'), null);
  assert.equal(readInviteFromUrl(''), null);
});

test('isBlackInviteFormat narrows the type for valid codes only', () => {
  assert.equal(isBlackInviteFormat('BLACK-ABC123'), true);
  assert.equal(isBlackInviteFormat('not-an-invite'), false);
  assert.equal(isBlackInviteFormat(null), false);
  assert.equal(isBlackInviteFormat(undefined), false);
});

test('validateBlackInvite returns ok+tier for valid codes, rejects others', () => {
  assert.deepEqual(validateBlackInvite('BLACK-ABC123'), { ok: true, tier: 'black', code: 'BLACK-ABC123' });
  assert.deepEqual(validateBlackInvite('BLACK-AB'), { ok: false, tier: null, code: null });
  assert.deepEqual(validateBlackInvite(null), { ok: false, tier: null, code: null });
});

test('redeemBlackInvite mirrors validateBlackInvite asynchronously (future trpc swap surface)', async () => {
  assert.deepEqual(await redeemBlackInvite('BLACK-ABC123'), { ok: true, tier: 'black', code: 'BLACK-ABC123' });
  assert.deepEqual(await redeemBlackInvite('bogus'), { ok: false, tier: null, code: null });
});

test('persistBlackInvite + loadStoredBlackInvite round-trip a record under the canonical key', () => {
  const record = { code: 'BLACK-ABC123', acceptedAt: '2026-05-30T12:00:00.000Z', source: 'url' as const };
  persistBlackInvite(record);
  assert.ok(storage.getItem(BLACK_INVITE_STORAGE_KEY));
  assert.deepEqual(loadStoredBlackInvite(), record);
});

test('loadStoredBlackInvite returns null for missing, malformed, or invalid-code payloads', () => {
  assert.equal(loadStoredBlackInvite(), null);
  storage.setItem(BLACK_INVITE_STORAGE_KEY, 'not-json');
  assert.equal(loadStoredBlackInvite(), null);
  storage.setItem(BLACK_INVITE_STORAGE_KEY, JSON.stringify({ code: 'not-black', acceptedAt: '', source: 'url' }));
  assert.equal(loadStoredBlackInvite(), null);
});

test('clearStoredBlackInvite removes the stored record', () => {
  persistBlackInvite({ code: 'BLACK-ABC123', acceptedAt: '2026-05-30T12:00:00.000Z', source: 'url' });
  clearStoredBlackInvite();
  assert.equal(storage.getItem(BLACK_INVITE_STORAGE_KEY), null);
});

test('resolveBlackInvite prefers ?invite= in URL and persists it for future loads', () => {
  windowStub.location.search = '?invite=BLACK-FROMURL';
  const resolved = resolveBlackInvite();
  assert.equal(resolved?.code, 'BLACK-FROMURL');
  assert.equal(resolved?.source, 'url');
  assert.ok(typeof resolved?.acceptedAt === 'string' && resolved.acceptedAt.length > 0);
  assert.ok(storage.getItem(BLACK_INVITE_STORAGE_KEY));
});

test('resolveBlackInvite falls back to stored record when URL is empty', () => {
  persistBlackInvite({ code: 'BLACK-FROMDISK', acceptedAt: '2026-05-30T12:00:00.000Z', source: 'storage' });
  const resolved = resolveBlackInvite();
  assert.equal(resolved?.code, 'BLACK-FROMDISK');
  assert.equal(resolved?.source, 'storage');
});

test('resolveBlackInvite returns null when neither URL nor storage has a valid invite', () => {
  windowStub.location.search = '?invite=NOT-BLACK';
  assert.equal(resolveBlackInvite(), null);
});
