import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canonicalLegalPath,
  HOME_HANDOFF_SUBTITLE,
  HOME_HANDOFF_TITLE,
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
  const banner = readFileSync(new URL('../../../public/app-banner.js', import.meta.url), 'utf8');
  // A /party/<id> page must not inherit the homepage app-argument, or iOS
  // caches a Default App Clip card for every share link. The script is
  // classic and synchronous so it runs before the default banner meta.
  assert.match(html, /<script src="\/app-banner\.js"><\/script>\s*<meta name="apple-itunes-app"/);
  assert.match(banner, /parts\[0\] === 'party'[\s\S]*?document\.write/);
  assert.match(banner, /app-argument=' \+ window\.location\.href/);
});

test('sale links hand the App Clip the sale, never the home page', () => {
  const banner = readFileSync(new URL('../../../public/app-banner.js', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../../../public/app-boot.js', import.meta.url), 'utf8');
  assert.match(banner, /parts\[0\] === 'sale'\) && parts\[1\]\) \{\s*document\.write/);
  assert.match(boot, /pathParts\[0\] === 'sale'\) && pathParts\[1\]/);
  // A ?p= or ?patch= on a sale link is not a patch; the sale URL is kept whole.
  assert.equal(nativeAppClipArgumentFor('https://bytspot.app/sale/sale-1?p=BYT424-0301'), 'https://bytspot.app/sale/sale-1?p=BYT424-0301');
});

test('the homepage runs no inline script, so a strict CSP can drop unsafe-inline', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="application\/ld\+json"/.test(m[1]));
  assert.deepEqual(inline, []);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test('search structured data parses and claims only what ships', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);

  const graph = JSON.parse(blocks[0][1])['@graph'] as Array<{ '@type': string | string[] }>;
  assert.equal(graph[0]['@type'], 'Organization');
  assert.equal(graph[1]['@type'], 'WebSite');
  assert.deepEqual(graph[2]['@type'], ['SoftwareApplication', 'MobileApplication']);

  // Ratings and a "live" crowd would contradict the Typical contract.
  // A free price of 0 is the App Store price.
  const serialized = blocks[0][1];
  assert.doesNotMatch(serialized, /aggregateRating|reviewCount|ratingValue|\blive\b/i);
  assert.match(serialized, /"price": "0"/);
  assert.match(serialized, /"priceCurrency": "USD"/);
  const body = html.slice(html.indexOf('<body'));
  assert.match(body, /Bytspot is an intent app for people to find spots and plan outings\./);
  assert.match(body, /chill date night under \$50 near Midtown/);
  assert.match(body, /Find the spot\. Make the plan\. Send the link\./);
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
  // Stripe and the App Store need a refunds URL that stays on the web.
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/refunds'), false);
  assert.equal(shouldBlockLegacyPwaFallback('https://example.com/p/BYT424'), false);
});

test('the homepage handoff covers the day, not only the night', () => {
  const home = nativeHandoffContext('https://bytspot.app/');
  assert.equal(home?.title, HOME_HANDOFF_TITLE);
  assert.equal(home?.subtitle, HOME_HANDOFF_SUBTITLE);
  assert.equal(HOME_HANDOFF_TITLE, 'Find the spot. Make the plan. Send the link.');
  assert.match(HOME_HANDOFF_SUBTITLE, /intent app for people to find spots and plan outings/);
  assert.match(HOME_HANDOFF_SUBTITLE, /chill date night under \$50 near Midtown/);
  assert.match(HOME_HANDOFF_SUBTITLE, /brunch through after hours/i);
  assert.doesNotMatch(HOME_HANDOFF_TITLE, /\bnight\b/i);
  assert.doesNotMatch(`${HOME_HANDOFF_TITLE} ${HOME_HANDOFF_SUBTITLE}`, /\blive\b/i);
  const main = readFileSync(new URL('../../main.tsx', import.meta.url), 'utf8');
  assert.match(main, /href="\/refunds">Refunds/);
  assert.match(main, /href="\/support\/">Support/);
  assert.doesNotMatch(main, /Plan the night/);
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
  assert.equal(canonicalLegalPath('/refunds'), '/refunds');
  assert.equal(canonicalLegalPath('/refunds/'), '/refunds');
  assert.equal(canonicalLegalPath('/Refunds'), '/refunds');

  // Everything else stays native-only.
  assert.equal(canonicalLegalPath('/discover'), null);
  assert.equal(canonicalLegalPath('/support/extra'), null);
  assert.equal(canonicalLegalPath('/'), null);
});

test('published legal pages do not promise an automatic refund', () => {
  const terms = readFileSync(new URL('../../components/TermsOfService.tsx', import.meta.url), 'utf8');
  const privacy = readFileSync(new URL('../../components/PrivacyPolicy.tsx', import.meta.url), 'utf8');
  const support = readFileSync(new URL('../../components/Support.tsx', import.meta.url), 'utf8');
  const refunds = readFileSync(new URL('../../components/Refunds.tsx', import.meta.url), 'utf8');
  for (const source of [terms, privacy, support, refunds]) {
    assert.doesNotMatch(source, /refunded automatically/i);
    assert.doesNotMatch(source, /starts the refund automatically/i);
  }
  assert.match(terms, /eligible for a refund to the original payment method, which Bytspot will process/);
  assert.match(terms, /Our goal is to process an eligible refund within 10 business days/);
  assert.match(terms, /operated by Bytspot Inc\., a Delaware corporation/);
  assert.match(privacy, /Bytspot Inc\., a Delaware corporation \("we", "us", or "our"\), operates/);
  assert.match(terms, /Last updated: November 19, 2026/);
  assert.match(privacy, /Last updated: November 19, 2026/);
  assert.match(refunds, /href="\/terms#refunds"/);
  const disclaimer = readFileSync(new URL('../../components/Disclaimer.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(disclaimer, /real-time crowd|sensor data/i);
  assert.match(disclaimer, /typical pattern for that hour/);
  assert.match(disclaimer, /section 7 of the/);
  assert.match(disclaimer, /Bytspot Inc\., a Delaware corporation/);
  assert.match(disclaimer, /Last updated: November 19, 2026/);
  assert.match(terms, /18 or older to buy a pass/);
  assert.match(terms, /weapons; drugs and drug paraphernalia/);
  assert.match(privacy, /dish photo finder/);
  assert.match(privacy, /protect personal information at least as well as this policy/);
  assert.match(privacy, /18 or older to buy a pass/);
});

test('a trailing slash on a legal path never reopens the retired web app', () => {
  for (const path of ['/support/', '/privacy/', '/terms/', '/disclaimer/', '/refunds/', '/Support']) {
    assert.equal(shouldBlockLegacyPwaFallback(`https://bytspot.app${path}`), false, path);
  }
  assert.equal(shouldBlockLegacyPwaFallback('https://bytspot.app/discover/'), true);
});
