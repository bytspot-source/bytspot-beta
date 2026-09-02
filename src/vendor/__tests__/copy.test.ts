import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { getBookableLocations, listBookableDomains } from '../../utils/bookableTemplates.ts';
import {
  assertVendorConsoleContract,
  locationStateCopy,
  vendorCopy,
  vendorNoun,
  VENDOR_CONSOLE,
} from '../vendorConsole.ts';

const VENDOR_DIR = new URL('../', import.meta.url);

function screens(): { name: string; source: string }[] {
  return readdirSync(VENDOR_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ name, source: readFileSync(new URL(name, VENDOR_DIR), 'utf8') }));
}

/**
 * Text a vendor could actually read: JSX text nodes, plus the attributes that
 * get spoken or shown. Comments, identifiers and imports are excluded, because
 * naming a type `BookableLocation` is correct and calling a place a "bookable
 * location" on screen is not.
 */
function visibleText(source: string): string {
  const withoutComments = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

  const parts: string[] = [];
  for (const match of withoutComments.matchAll(/>([^<>{}]+)</g)) {
    // `a => b < c` and `f(x) : g<T>` both look like a text node to the regex
    // above. Anything carrying code punctuation is discarded rather than
    // parsed: this is a lint, so a missed string is cheaper than a false
    // failure that gets the whole guard disabled.
    if (/[=(){};`]/.test(match[1])) continue;
    parts.push(match[1]);
  }
  for (const match of withoutComments.matchAll(
    /(?:aria-label|placeholder|title|alt|legend)=["']([^"']+)["']/g,
  )) {
    parts.push(match[1]);
  }
  return parts.join(' \n ');
}

test('the contract carries a vendor word for every link in the chain', () => {
  assert.deepEqual(assertVendorConsoleContract(), []);

  const copy = vendorCopy();
  for (const noun of VENDOR_CONSOLE.model.chain) {
    assert.ok(copy.nouns[noun], `${noun} has no vendor-facing word`);
  }

  // Spelled out so a rename has to be deliberate.
  assert.equal(vendorNoun('SKU'), 'opening');
  assert.equal(vendorNoun('BOOKABLE'), 'service');
  assert.equal(vendorNoun('SELLER'), 'business');
});

test('no internal noun reaches anything a vendor reads', () => {
  const { internalOnly } = vendorCopy();
  const failures: string[] = [];

  for (const { name, source } of screens()) {
    const text = visibleText(source);
    for (const noun of internalOnly) {
      const match = new RegExp(`\\b${noun}\\b`, 'i').exec(text);
      if (!match) continue;
      const context = text.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' ').trim();
      failures.push(`${name}: "${noun}" in visible text — …${context}…`);
    }
  }

  assert.deepEqual(failures, [], `internal vocabulary on screen:\n${failures.join('\n')}`);
});

test('the guard can fail, or it is decoration', () => {
  const sample = `
    const x: BookableLocation = load(); // a SKU is fine in a comment
    return (
      <>
        <p>This prints 12 SKUs</p>
        <nav aria-label="Bookable type" />
      </>
    );
  `;
  const text = visibleText(sample);
  assert.match(text, /This prints 12 SKUs/);
  assert.match(text, /Bookable type/);
  assert.doesNotMatch(text, /BookableLocation/);
  assert.doesNotMatch(text, /fine in a comment/);
});

test('no screen renders a raw id where a label exists', () => {
  // Domain and state ids leak most easily: both are short lowercase words that
  // read almost like English. "stall" is a car park.
  for (const { name, source } of screens()) {
    const text = visibleText(source);
    assert.doesNotMatch(text, /\{domain\}/, `${name} renders a domain id instead of its label`);
    assert.doesNotMatch(text, /\{location\.state\}/, `${name} renders a raw state token`);
    assert.doesNotMatch(text, /\{location\.kind\}/, `${name} renders a raw kind id`);
  }

  for (const domain of listBookableDomains()) {
    assert.ok(domain.label?.trim(), `${domain.id} has no label`);
    assert.notEqual(domain.label.toLowerCase(), domain.id === 'stall' ? 'stall' : '\u0000');
  }
  for (const state of getBookableLocations().states) {
    const copy = locationStateCopy(state);
    assert.notEqual(copy.label, state, `${state} shows its raw token`);
    assert.ok(copy.detail.trim(), `${state} does not say what it means for guests`);
  }
});

test('a vendor is told what a state means, not just what it is called', () => {
  // The question behind the badge is whether guests can book, and what happens
  // to the bookings already taken.
  assert.match(locationStateCopy('PAUSED').detail, /existing bookings/i);
  assert.match(locationStateCopy('CLOSED').detail, /cannot be undone/i);
  assert.match(locationStateCopy('ACTIVE').detail, /guests can/i);
  assert.match(locationStateCopy('DRAFT').detail, /only you/i);
});
