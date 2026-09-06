import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capabilityFromVerbs,
  coffeeToBookable,
  controlFromCapability,
  deepLinkToBookable,
  isPrimePathEligible,
  isReference,
  partyTierToBookable,
  primaryCTA,
  tableSlotToBookable,
  templateToBookablePreview,
  type Bookable,
} from '../bookableProjection.ts';
import type { NormalizedTableSlot } from '../orderingRpc.ts';
import { listBookableTemplates } from '../bookableTemplates.ts';

test('control is a pure derivation of capability — book/request are vendor, redirect/details are local', () => {
  assert.equal(controlFromCapability('book'), 'vendor');
  assert.equal(controlFromCapability('request'), 'vendor');
  assert.equal(controlFromCapability('redirect'), 'local');
  assert.equal(controlFromCapability('details'), 'local');
});

test('only redirect and details are excluded from Prime Path candidacy', () => {
  assert.equal(isPrimePathEligible('book'), true);
  assert.equal(isPrimePathEligible('request'), true);
  assert.equal(isPrimePathEligible('redirect'), false);
  assert.equal(isPrimePathEligible('details'), false);
});

test('capabilityFromVerbs maps settlement verbs to book, RSVP to request, rest to details', () => {
  assert.equal(capabilityFromVerbs(['BOOK', 'PAY', 'CANCEL']), 'book');
  assert.equal(capabilityFromVerbs(['RESERVE', 'CANCEL']), 'book');
  assert.equal(capabilityFromVerbs(['RSVP', 'SHARE']), 'request');
  assert.equal(capabilityFromVerbs(['CHECK_IN', 'VERIFY']), 'details');
});

test('primaryCTA is honest: redirect names the provider, details has no CTA', () => {
  const book = partyTierToBookable({ partyId: 'p1', tier: { name: 'GA', priceCents: 2500, capacity: 40, membershipFloor: 'green' } });
  assert.equal(primaryCTA(book), 'Book');
  assert.equal(isReference(book), false);

  const rsvp = partyTierToBookable({ partyId: 'p1', tier: { name: 'RSVP', priceCents: 0, capacity: 40, membershipFloor: null }, rsvp: true });
  assert.equal(primaryCTA(rsvp), 'Request');

  const redirect = deepLinkToBookable({ title: 'Dinner', provider: 'OpenTable', url: 'https://opentable.com/x' });
  assert.equal(primaryCTA(redirect), 'Book on OpenTable ↗');

  const coffee = coffeeToBookable({ reservationId: 'c1', title: 'Pour-over' });
  assert.equal(coffee.capability, 'request');
  assert.equal(primaryCTA(coffee), 'Request');
});

test('paid party tier books on our rails; RSVP holds and carries no price', () => {
  const paid = partyTierToBookable({ partyId: 'p1', tier: { name: 'First Drop', priceCents: 2500, capacity: 40, membershipFloor: 'green' } });
  assert.equal(paid.capability, 'book');
  assert.equal(paid.control, 'vendor');
  assert.equal(paid.provider, null);
  assert.equal(paid.tier.priceCents, 2500);
  assert.equal(paid.primePathEligible, true);
  assert.deepEqual(paid.fulfillment, { partyId: 'p1', ticketTierName: 'First Drop' });

  const rsvp = partyTierToBookable({ partyId: 'p1', tier: { name: 'GA', priceCents: 2500, capacity: 40, membershipFloor: null }, rsvp: true });
  assert.equal(rsvp.capability, 'request');
  assert.equal(rsvp.tier.priceCents, 0);
});

test('table slot: own inventory books, third-party redirects to the named provider', () => {
  const slot: NormalizedTableSlot = { id: 's2', provider: 'opentable', timeLabel: '8:00 PM', partySize: 4, deeplinkUrl: 'https://opentable.com/r/1' };

  const own = tableSlotToBookable(slot, { ownInventory: true });
  assert.equal(own.capability, 'book');
  assert.equal(own.control, 'vendor');
  assert.equal(own.provider, null);
  assert.equal(own.tier.capacity, 4);

  const thirdParty = tableSlotToBookable(slot, { ownInventory: false });
  assert.equal(thirdParty.capability, 'redirect');
  assert.equal(thirdParty.control, 'local');
  assert.equal(thirdParty.provider, 'opentable');
  assert.equal(thirdParty.primePathEligible, false);
  assert.equal(primaryCTA(thirdParty), 'Book on opentable ↗');
});

test('a deep link exits before Booking: redirect, local, never Prime Path', () => {
  const link = deepLinkToBookable({ title: 'Rooftop', provider: 'Resy', url: 'https://resy.com/x', capacity: 2 });
  assert.equal(link.capability, 'redirect');
  assert.equal(link.control, 'local');
  assert.equal(link.primePathEligible, false);
});

test('a redirect can never be constructed without a named provider', () => {
  // deepLinkToBookable requires provider by type; force the guard via a bad table
  // slot whose provider is empty while claiming a third-party hand-off.
  const slot: NormalizedTableSlot = { id: 's9', provider: '' as NormalizedTableSlot['provider'], timeLabel: '9:00 PM', partySize: 2 };
  assert.throws(() => tableSlotToBookable(slot, { ownInventory: false }), /requires a named provider/);
});

test('canonical id is BYT-prefixed, deterministic, and never embeds upstream ids or URLs', () => {
  const a = deepLinkToBookable({ title: 'X', provider: 'Resy', url: 'https://resy.com/venue-12345' });
  const b = deepLinkToBookable({ title: 'X', provider: 'Resy', url: 'https://resy.com/venue-12345' });
  assert.match(a.id, /^BYT-deep_link-/);
  assert.equal(a.id, b.id);
  assert.ok(!a.id.includes('resy.com'));
  assert.ok(!a.id.includes('12345'));

  const table = tableSlotToBookable({ id: 'slot-abc', provider: 'opentable', timeLabel: '7 PM', partySize: 2 }, { ownInventory: true });
  assert.match(table.id, /^BYT-table-/);
  assert.ok(!table.id.includes('slot-abc'));
});

test('an authored template projects to a Bookable preview with a derived capability', () => {
  const template = listBookableTemplates()[0];
  const preview: Bookable = templateToBookablePreview(template);
  assert.match(preview.id, /^BYT-party_ticket-/);
  assert.equal(preview.capability, capabilityFromVerbs(template.capabilities));
  assert.equal(preview.control, controlFromCapability(preview.capability));
  assert.equal(preview.tier.priceCents, template.priceCents);
  assert.equal(preview.tier.membershipFloor, template.tier);
});
