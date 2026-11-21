import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');

const POSITIONING = 'Bytspot is an intent app for people to find spots and plan outings.';
const INTENT = 'Tell Bytspot what you want to do, like a chill date night under $50 near Midtown, and it finds spots that fit and builds a plan you can share with friends.';

test('bytspot.app crawl files use this domain and do not invent ratings or live busyness', () => {
  const robots = read('public/robots.txt');
  const llms = read('public/llms.txt');
  const sitemap = read('public/sitemap.xml');
  const support = read('public/support/index.html');
  const home = read('index.html');

  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(robots, /User-agent: Googlebot\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/bytspot\.app\/sitemap\.xml/);
  assert.doesNotMatch(robots, /bytspot\.com/);

  assert.match(llms, new RegExp(POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(llms, /typical busyness by hour/i);
  assert.match(llms, /https:\/\/bytspot\.app\//);
  assert.doesNotMatch(llms, /live updates/i);
  assert.doesNotMatch(llms, /aggregateRating|ratingValue|\d\.\d\s*stars/i);

  assert.match(sitemap, /<loc>https:\/\/bytspot\.app\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/bytspot\.app\/support\/<\/loc>/);
  assert.doesNotMatch(sitemap, /bytspot\.com|<loc>https:\/\/bytspot\.app\/terms<\/loc>|<loc>https:\/\/bytspot\.app\/privacy<\/loc>/);

  for (const page of [support, home]) {
    assert.match(page, new RegExp(POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(page, new RegExp(INTENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(page, /aggregateRating|live crowd is available|TODO/);
  }

  assert.match(support, /mailto:update@bytspot.app/);
  assert.match(support, /href="\/terms"/);
  assert.match(support, /href="\/privacy"/);
  assert.match(support, /href="\/refunds"/);
  assert.match(support, /Delete Account/);
  assert.match(support, /30 days/);
  assert.match(support, /URGENT/);

  const reactSupport = read('src/components/Support.tsx');
  assert.match(reactSupport, /update@bytspot.app/);
  assert.match(reactSupport, /href="\/refunds"/);
  assert.match(reactSupport, new RegExp(POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
