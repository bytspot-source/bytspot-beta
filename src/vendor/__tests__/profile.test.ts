import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getBookableLocations } from '../../utils/bookableTemplates.ts';
import type { VendorLocation } from '../locations.ts';
import { locationPublishBlockers, locationSetupBlockers } from '../locations.ts';
import {
  applyProfileEdit,
  EMPTY_PROFILE,
  payoutBlockersFor,
  payoutIsUsable,
  reconcileSeller,
  requirementIsMet,
  satisfiedRequirements,
  unmetFor,
  type PayoutAccount,
  type VendorProfile,
} from '../profile.ts';
import { shouldShowOnboarding } from '../onboarding.ts';
import type { Seller } from '../seller.ts';

const location = (over: Partial<VendorLocation> = {}): VendorLocation => ({
  id: 'loc_1',
  label: 'Midtown',
  kind: 'fixed',
  state: 'ACTIVE',
  address: '1 Peachtree St',
  lat: 33.75,
  lng: -84.39,
  ...over,
});

const seller = (over: Partial<Seller> = {}): Seller => ({
  id: 'sel_1',
  legalName: 'Midtown Table',
  state: 'DRAFT',
  businessMode: 'standard',
  satisfied: [],
  ...over,
});

const complete: VendorProfile = {
  legalName: 'Midtown Table LLC',
  contactEmail: 'owner@midtown.example',
  locations: [location()],
  payout: { reference: 'acct_1', status: 'active', last4: '4242' },
};

test('a requirement is met by the record, not by having filled in a form', () => {
  assert.deepEqual(satisfiedRequirements(EMPTY_PROFILE), []);
  assert.deepEqual(satisfiedRequirements(complete), [
    'legalName',
    'contactEmail',
    'activeLocation',
    'payoutAccount',
  ]);

  // A location that exists but is not usable satisfies nothing. This is the
  // whole reason the list is derived: an appended tick would still be there.
  assert.equal(requirementIsMet('activeLocation', { ...complete, locations: [location({ state: 'PAUSED' })] }), false);
  assert.equal(requirementIsMet('activeLocation', { ...complete, locations: [location({ address: '  ' })] }), false);

  // And an unknown requirement is never quietly satisfied.
  assert.equal(requirementIsMet('vibes', complete), false);
});

test('a tick disappears when the reason for it does', () => {
  const live = seller({ state: 'ACTIVE', satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'] });
  assert.equal(shouldShowOnboarding(reconcileSeller(live, complete)), false);

  // The only location closes. The server's stale list said four; the records
  // say three, and the records win.
  const closed = { ...complete, locations: [location({ state: 'CLOSED' })] };
  const reconciled = reconcileSeller(live, closed);
  assert.deepEqual(reconciled.satisfied, ['legalName', 'contactEmail', 'payoutAccount']);
  assert.equal(shouldShowOnboarding(reconciled), true);
  assert.deepEqual(unmetFor(closed).map((item) => item.id), ['activeLocation']);
});

test('only an account that can receive money counts', () => {
  // A processor parks an account in pending while it decides. Treating that as
  // done would let a business go live and then fail to be paid.
  assert.equal(payoutIsUsable({ reference: 'a', status: 'pending' }), false);
  assert.equal(payoutIsUsable({ reference: 'a', status: 'restricted' }), false);
  assert.equal(payoutIsUsable({ reference: 'a', status: 'active' }), true);
  assert.equal(payoutIsUsable(undefined), false);
});

test('this origin refuses to hold a bank number', () => {
  // If one ever arrives, something upstream started collecting it, and refusing
  // the write is a better outcome than storing it and filing a ticket.
  const smuggled = { reference: 'acct_1', status: 'active', accountNumber: '123456789' } as unknown as PayoutAccount;
  assert.ok(payoutBlockersFor(smuggled).some((item) => item.includes('must never reach this origin')));

  const disguised = { reference: '000123456789', status: 'active' } as PayoutAccount;
  assert.ok(payoutBlockersFor(disguised).some((item) => item.includes('looks like a bank number')));

  // Spacing does not launder it.
  const spaced = { reference: '0001 2345 6789', status: 'active' } as PayoutAccount;
  assert.ok(payoutBlockersFor(spaced).some((item) => item.includes('looks like a bank number')));

  // But the four digits a processor hands back for display are fine.
  assert.deepEqual(payoutBlockersFor({ reference: 'acct_1', status: 'active', last4: '4242' }), []);
  assert.ok(payoutBlockersFor({ reference: 'acct_1', status: 'active', last4: '42' }).length > 0);
});

test('no payout field in the console is shaped like a bank detail', () => {
  // A structural check, because the type is only as good as what is declared on
  // it: a new field named accountNumber would type-check perfectly.
  //
  // Matched as a field being declared or read, not as a bare word, so the
  // detection pattern inside payoutBlockersFor does not trip its own guard.
  const asField = /(?:^|[.{,\s])(accountNumber|routingNumber|iban|sortCode|swift|cvv)\s*[?:.=);,]/im;
  for (const file of ['../profile.ts', '../setupTransport.ts', '../OnboardingView.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, asField, `${file} declares or reads a bank detail`);
  }

  // The check has to be able to fail, or it is decoration.
  assert.match('  accountNumber: string;', asField);
  assert.match('const n = payout.routingNumber;', asField);

  // The payout step must be a handoff, not a form: no text input on that path.
  const view = readFileSync(new URL('../OnboardingView.tsx', import.meta.url), 'utf8');
  const payoutField = view.slice(view.indexOf('function PayoutField'));
  assert.doesNotMatch(payoutField, /<input/, 'the payout step must not collect anything itself');
});

test('an edit is validated before it is written, never after', () => {
  assert.equal(applyProfileEdit(EMPTY_PROFILE, { field: 'legalName', value: '   ' }).ok, false);
  assert.equal(applyProfileEdit(EMPTY_PROFILE, { field: 'contactEmail', value: 'owner@' }).ok, false);

  const named = applyProfileEdit(EMPTY_PROFILE, { field: 'legalName', value: '  Midtown Table LLC ' });
  assert.equal(named.ok, true);
  if (named.ok) assert.equal(named.profile.legalName, 'Midtown Table LLC');

  // An incomplete location comes back with every reason, not just the first.
  const mobile = applyProfileEdit(EMPTY_PROFILE, {
    field: 'location',
    value: location({ kind: 'mobile', address: '', radiusMiles: undefined, lat: Number.NaN, lng: Number.NaN }),
  });
  assert.equal(mobile.ok, false);
  if (!mobile.ok) {
    assert.ok(mobile.blockers.length >= 3, `expected several reasons, got ${JSON.stringify(mobile.blockers)}`);
    assert.ok(mobile.blockers.some((item) => item.includes('travel radius')));
    assert.ok(mobile.blockers.some((item) => item.includes('pin')));
  }

  const { maxRadiusMiles } = getBookableLocations().defaults;
  const tooFar = applyProfileEdit(EMPTY_PROFILE, {
    field: 'location',
    value: location({ kind: 'visiting', address: undefined, radiusMiles: maxRadiusMiles + 1 }),
  });
  assert.equal(tooFar.ok, false);
});

test('saving the same location edits it rather than adding a second', () => {
  const first = applyProfileEdit(EMPTY_PROFILE, { field: 'location', value: location() });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = applyProfileEdit(first.profile, { field: 'location', value: location({ label: 'Midtown Annex' }) });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.profile.locations.length, 1);
  assert.equal(second.profile.locations[0].label, 'Midtown Annex');
});

test('setup and publish read the same location rules', () => {
  // Split apart so setup can check a location before a domain exists. Duplicated
  // rules are how the two would come to disagree, so publish delegates.
  const incomplete = location({ kind: 'mobile', radiusMiles: undefined });
  for (const blocker of locationSetupBlockers(incomplete)) {
    assert.ok(
      locationPublishBlockers(incomplete, 'dining').includes(blocker),
      `publish lost the setup rule: ${blocker}`,
    );
  }
  // And publish still adds what only it knows about.
  assert.ok(locationPublishBlockers(location({ state: 'PAUSED' }), 'dining').some((item) => item.includes('not active')));
  assert.deepEqual(locationSetupBlockers(location()), []);
});
