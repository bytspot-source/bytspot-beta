import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canonicalLegalPath,
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

test('preserves authoritative Party Pass URLs for App Clip invocation', () => {
  const url = 'https://bytspot.app/party/party-1?handoff=1';
  const context = nativeHandoffContext(url);

  assert.equal(nativeAppClipArgumentFor(url), url);
  assert.equal(shouldBlockLegacyPwaFallback(url), true);
  assert.equal(context?.kind, 'party');
  assert.equal(context?.appArgument, url);
  assert.match(context?.appSchemeURL ?? '', /^bytspot:\/\/party\/party-1/);
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

test('blocks bare native compatibility paths listed in AASA', () => {
  assert.equal(nativeHandoffContext('https://bytspot.app/access')?.kind, 'access');
  assert.equal(nativeHandoffContext('https://bytspot.app/access/BYT424-0301')?.kind, 'patch');
  assert.equal(nativeHandoffContext('https://bytspot.app/patch')?.kind, 'access');
  assert.equal(nativeHandoffContext('https://bytspot.app/patch/BYT424-0301')?.kind, 'patch');
});

test('retired service worker is a kill-switch, not a cache', () => {
  const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /registration\.unregister/);
  assert.match(source, /caches\.delete/);
  assert.doesNotMatch(source, /bytspot-v2/);
  assert.doesNotMatch(source, /isNativeHandoffURL/);
});

test('share metadata carries no retired campaign artwork', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /akwaaba/i);
  assert.match(html, /og:image" content="https:\/\/bytspot\.app\/media\/bytspot-og\.png"/);
  assert.match(html, /twitter:image" content="https:\/\/bytspot\.app\/media\/bytspot-og\.png"/);
});

test('party links get a self-referencing Smart App Banner before the bundle boots', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  // A /party/<id> page must not inherit the homepage app-argument, or iOS
  // caches a Default App Clip card for every share link.
  assert.match(html, /parts\[0\] === 'party'[\s\S]*?document\.write/);
  assert.match(html, /app-argument=' \+ window\.location\.href/);
});

test('search structured data parses and claims only what ships', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);

  const graph = JSON.parse(blocks[0][1])['@graph'];
  assert.deepEqual(graph.map((n: { '@type': string }) => n['@type']), ['Organization', 'WebSite', 'MobileApplication']);

  // Unverifiable markup is a manual-action risk and would contradict the
  // Typical-never-Live contract, so these must stay absent.
  const serialized = blocks[0][1];
  assert.doesNotMatch(serialized, /aggregateRating|reviewCount|"Offer"|priceCurrency/);
});

test('product routes never boot the web app; legal pages stay on the web', () => {
  assert.equal(nativeHandoffContext('https://bytspot.app/discover')?.kind, 'app');
  assert.equal(nativeHandoffContext('https://bytspot.app/')?.kind, 'app');
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/privacy'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/terms'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/disclaimer'), false);
  // The support page has to be reachable on the web: App Review requires a
  // working support URL, and a member locked out of the app needs a way in.
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/support'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://example.com/p/BYT424'), false);
});

test('legal web paths canonicalize identically for the bootstrap and the router', () => {
  // A trailing slash previously passed the kill-switch but matched no route,
  // dropping the visitor into the retired web app.
  assert.equal(canonicalLegalPath('/support'), '/support');
  assert.equal(canonicalLegalPath('/support/'), '/support');
  assert.equal(canonicalLegalPath('//support//'), '/support');
  assert.equal(canonicalLegalPath('/Support'), '/support');
  assert.equal(canonicalLegalPath('/privacy/'), '/privacy');
  assert.equal(canonicalLegalPath('/terms/'), '/terms');
  assert.equal(canonicalLegalPath('/disclaimer/'), '/disclaimer');

  // Everything else stays native-only.
  assert.equal(canonicalLegalPath('/discover'), null);
  assert.equal(canonicalLegalPath('/support/extra'), null);
  assert.equal(canonicalLegalPath('/'), null);
});

test('a trailing slash on a legal path never reopens the retired web app', () => {
  for (const path of ['/support/', '/privacy/', '/terms/', '/disclaimer/', '/Support']) {
    assert.equal(shouldBlockLegacyPwaFallback(`https://bytspot.app${path}`), false, path);
  }
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/discover/'), true);
});
