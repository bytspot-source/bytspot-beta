import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nativeAppClipArgumentFor,
  nativeHandoffContext,
  shouldBlockLegacyPwaFallback,
} from '../nativeHandoffGuard.ts';

test('blocks group invite URLs from booting the legacy PWA', () => {
  const url = 'https://bytspot.app/group/platinum-private-dinner?tier=platinum&source=app_clip&hero=https%3A%2F%2Fcdn.example%2Fhero.jpg';
  const context = nativeHandoffContext(url);

  assert.equal(shouldBlockLegacyPwaFallback(url), true);
  assert.equal(context?.kind, 'group');
  assert.equal(context?.appArgument, url);
  assert.match(context?.appSchemeURL ?? '', /^bytspot:\/\/group\/platinum-private-dinner/);
});

test('canonicalizes NFC patch URLs into App Clip arguments', () => {
  const url = 'https://bytspot.app/p/PATCH-FIFA-001?tier=platinum&service=gh-akwaaba-fifa';
  const argument = nativeAppClipArgumentFor(url);

  assert.equal(shouldBlockLegacyPwaFallback(url), true);
  assert.match(argument, /^https:\/\/bytspot\.app\/p\/app-clip\?/);
  assert.match(argument, /patchId=PATCH-FIFA-001/);
  assert.match(argument, /tier=platinum/);
  assert.match(argument, /service=gh-akwaaba-fifa/);
});

test('blocks root BYT tag and query patch links', () => {
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/BYT424-0301?tier=platinum'), true);
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/?patchId=BYT424-0301&tier=platinum'), true);
});

test('does not block ordinary web pages', () => {
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/privacy'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/discover'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://example.com/p/BYT424'), false);
});
