import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!(globalThis as any).crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const contactHash = await import('../contactHash.ts');
const social = await import('../social.ts');

beforeEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
});

test('contact hash normalization matches native/server contract', () => {
  assert.equal(contactHash.CONTACT_HASH_SALT, 'dev-contact-salt-change-me');
  assert.equal(contactHash.normalizeEmail('  Jane.Doe@GMAIL.com '), 'jane.doe@gmail.com');
  assert.equal(contactHash.normalizeEmail('notanemail'), null);
  assert.equal(contactHash.normalizePhone('+1 (404) 555-1234'), '14045551234');
  assert.equal(contactHash.normalizePhone('(404) 555-1234'), '14045551234');
  assert.equal(contactHash.normalizePhone('+44 20 7946 0958'), '442079460958');
  assert.equal(contactHash.normalizePhone('123'), null);
});

test('contact hashes are deterministic salted SHA-256 values with separated namespaces', async () => {
  const email = await contactHash.hashEmail('  Jane.Doe@GMAIL.com ');
  const phone = await contactHash.hashPhone('(404) 555-1234');
  assert.equal(email, '800aef3ef453c1fb70bbd8436b6a6bb7110acf25869a510ceb3acbba0878db18');
  assert.equal(phone, 'bd34e22123ce3d1c442cdb69c9f5401a96fef5623e1db858889e1c0745c8bf4b');
  assert.equal(await contactHash.hashEmail('4045551234@x.co'), 'feb30b3d94aa0c847c4427317a38cc0fb747e58670cc1f3add956aa88785252c');
  assert.notEqual(await contactHash.hashEmail('4045551234@x.co'), await contactHash.hashPhone('4045551234'));
  assert.equal(await contactHash.hashContactValue('jane.doe@gmail.com'), email);
  assert.equal(await contactHash.hashContactValue('+1 404 555 1234'), phone);
});

test('web contact picker hashes selected values locally and de-duplicates raw contacts', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      contacts: {
        select: async () => [
          { email: ['Jane.Doe@gmail.com', ' jane.doe@gmail.com '], tel: ['(404) 555-1234'] },
          { email: ['bad'], tel: ['+1 404 555 1234'] },
        ],
      },
    },
  });
  const hashes = await contactHash.pickAndHashContacts();
  assert.deepEqual(hashes?.sort(), [
    '800aef3ef453c1fb70bbd8436b6a6bb7110acf25869a510ceb3acbba0878db18',
    'bd34e22123ce3d1c442cdb69c9f5401a96fef5623e1db858889e1c0745c8bf4b',
  ].sort());
});

test('suggestion reasons and ranking use relationship status only', () => {
  const ranked = social.rankFriendSuggestions([
    { userId: 'suggested', name: 'Suggested', profileImage: null, relationshipStatus: 'suggested', circleIds: [] },
    { userId: 'connected', name: 'Connected', profileImage: null, relationshipStatus: 'connected', circleIds: ['crew'] },
    { userId: 'incoming', name: 'Incoming', profileImage: null, relationshipStatus: 'invite_received', circleIds: [] },
  ]);
  assert.deepEqual(ranked.map((s) => s.userId), ['incoming', 'connected', 'suggested']);
  assert.equal(social.suggestionReason(ranked[0]), 'Invited you');
  assert.equal(social.suggestionReason(ranked[1]), 'Connected');
  assert.equal(social.suggestionReason(ranked[2]), 'Suggested from your contacts');
});