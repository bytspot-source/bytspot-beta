import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getBookableLocations, fulfillmentForLocationKind } from '../../utils/bookableTemplates.ts';
import {
  acceptableCandidates,
  autoApplicable,
  candidateBlockers,
  pinFrom,
  precisionSufficientFor,
  requiredPrecisionFor,
  reviveCandidates,
  type GeocodeCandidate,
} from '../geocoding.ts';
import { applyProfileEdit, EMPTY_PROFILE } from '../profile.ts';
import { locationSetupBlockers, type VendorLocation } from '../locations.ts';

const rooftop: GeocodeCandidate = {
  formatted: '1 Peachtree St NE, Atlanta, GA 30303',
  lat: 33.7866,
  lng: -84.3833,
  precision: 'rooftop',
  timezone: 'America/New_York',
};
const centroid: GeocodeCandidate = { formatted: 'Atlanta, GA', lat: 33.749, lng: -84.388, precision: 'locality' };

test('a town centroid cannot be a place guests navigate to', () => {
  // The failure this exists to stop: providers answer almost any input with
  // *something*, and a missing street silently becomes the middle of the town.
  // Stored as a restaurant's pin, that is a mile from the door and nothing
  // downstream can tell it is wrong.
  assert.deepEqual(acceptableCandidates('fixed', [centroid]), []);
  assert.ok(candidateBlockers('fixed', centroid)[0].includes('street address'));
  assert.deepEqual(acceptableCandidates('zone', [centroid]), []);

  // But when the vendor travels, the pin is only the centre of a radius, so a
  // centroid is a legitimate answer rather than a degraded one.
  assert.deepEqual(acceptableCandidates('mobile', [centroid]), [centroid]);
  assert.deepEqual(acceptableCandidates('visiting', [centroid]), [centroid]);

  // A region centroid is too broad even to centre a radius on.
  const region: GeocodeCandidate = { formatted: 'Georgia', lat: 32.6, lng: -83.4, precision: 'region' };
  assert.deepEqual(acceptableCandidates('visiting', [region]), []);
});

test('the precision rule follows fulfillment for every kind in the contract', () => {
  // Asserted against the catalog rather than a list here, so a new kind cannot
  // be added without this rule being decided for it.
  for (const kind of getBookableLocations().kinds) {
    const expected = fulfillmentForLocationKind(kind.id) === 'vendorTravels' ? 'locality' : 'street';
    assert.equal(requiredPrecisionFor(kind.id), expected, `${kind.id} got the wrong precision floor`);
    assert.equal(precisionSufficientFor(kind.id, 'rooftop'), true);
    assert.equal(precisionSufficientFor(kind.id, 'region'), false);
  }
});

test('an empty result dressed as a coordinate is refused', () => {
  // Null Island. Every provider emits it eventually, always for a lookup that
  // failed without saying so.
  const nullIsland: GeocodeCandidate = { formatted: 'Somewhere', lat: 0, lng: 0, precision: 'rooftop' };
  assert.ok(candidateBlockers('fixed', nullIsland)[0].includes('came back empty'));

  const offGlobe: GeocodeCandidate = { ...rooftop, lat: 91 };
  assert.ok(candidateBlockers('fixed', offGlobe)[0].includes('not a real coordinate'));

  const missing: GeocodeCandidate = { ...rooftop, lng: Number.NaN };
  assert.ok(candidateBlockers('fixed', missing)[0].includes('no usable coordinate'));
});

test('only one exact match applies itself; anything else is a question', () => {
  assert.equal(autoApplicable('fixed', [rooftop]), rooftop);

  // Two results means the provider guessed, so the vendor picks.
  const a: GeocodeCandidate = { formatted: '100 Main St E', lat: 33.75, lng: -84.39, precision: 'street' };
  const b: GeocodeCandidate = { formatted: '100 Main St W', lat: 33.77, lng: -84.4, precision: 'street' };
  assert.equal(autoApplicable('fixed', [a, b]), undefined);

  // A street-level match on its own is often the road rather than the building,
  // so it is offered rather than assumed.
  assert.equal(autoApplicable('fixed', [a]), undefined);
  assert.deepEqual(acceptableCandidates('fixed', [a]), [a]);

  assert.equal(autoApplicable('mobile', [centroid]), undefined);
});

test('a result we cannot grade is dropped, never defaulted', () => {
  // Defaulting high would accept a vague result as exact; defaulting low would
  // hide a good one. Neither is recoverable once it is a stored pin.
  const revived = reviveCandidates([
    { formatted: 'A', lat: 1, lng: 2, precision: 'ish' },
    { formatted: 'B', lat: 1, lng: 2 },
    { formatted: 'C', lat: 'x', lng: 2, precision: 'rooftop' },
    { lat: 1, lng: 2, precision: 'rooftop' },
    null,
    { formatted: 'D', lat: '33.75', lng: '-84.39', precision: 'street' },
  ]);
  assert.deepEqual(revived.map((item) => item.formatted), ['D']);
  // Strings that are numbers become numbers, or the distance maths concatenates.
  assert.equal(typeof revived[0].lat, 'number');

  // Best first, so the vendor's eye lands on the most exact match.
  const sorted = reviveCandidates([centroid, rooftop]);
  assert.deepEqual(sorted.map((item) => item.precision), ['rooftop', 'locality']);
});

test('a visiting provider is placed without being published', () => {
  // They usually work from home. The radius needs the pin; nobody needs the
  // street, and publishing it is a harm the booking does not require.
  const visiting = pinFrom('visiting', rooftop);
  assert.equal(visiting.address, undefined);
  assert.equal(visiting.lat, rooftop.lat);
  assert.equal(visiting.timezone, 'America/New_York');

  // A storefront stores the provider's formatted address, not what was typed,
  // or the label and the coordinate can describe different places.
  const fixed = pinFrom('fixed', rooftop);
  assert.equal(fixed.address, rooftop.formatted);
});

test('a geocoded pin is one the location rules already accept', () => {
  // The two checks have to agree, or the form offers a candidate that the save
  // path then refuses with no way forward.
  const build = (kind: VendorLocation['kind'], candidate: GeocodeCandidate): VendorLocation => ({
    id: 'loc_1',
    label: 'Midtown',
    kind,
    state: 'ACTIVE',
    radiusMiles: kind === 'mobile' || kind === 'visiting' ? 10 : undefined,
    ...pinFrom(kind, candidate),
    lat: pinFrom(kind, candidate).lat,
    lng: pinFrom(kind, candidate).lng,
  });

  assert.deepEqual(locationSetupBlockers(build('fixed', rooftop)), []);
  assert.deepEqual(locationSetupBlockers(build('visiting', centroid)), []);
  assert.equal(applyProfileEdit(EMPTY_PROFILE, { field: 'location', value: build('fixed', rooftop) }).ok, true);
  assert.equal(applyProfileEdit(EMPTY_PROFILE, { field: 'location', value: build('mobile', centroid) }).ok, true);
});

test('the console never geocodes from the browser and never saves without a pin', () => {
  const transport = readFileSync(new URL('../setupTransport.ts', import.meta.url), 'utf8');
  // A provider key in a static bundle is a public key. Proxying is the only
  // reason this route exists rather than a direct call.
  assert.match(transport, /'\/vendor\/geocode'/);
  assert.doesNotMatch(transport, /googleapis|mapbox|nominatim|opencage/i);
  // POST, so an address still being typed does not land in access logs.
  assert.match(transport, /geocode: \(query, kind\) =>\s*send\('\/vendor\/geocode', write\(/);

  // One form, shared by the setup gate and the Places tab. A second copy would
  // be the one that forgot to check precision.
  const field = readFileSync(new URL('../LocationForm.tsx', import.meta.url), 'utf8');
  // Save is impossible without a chosen pin. Otherwise a location looks saved
  // and cannot be published, with the reason two screens away.
  assert.match(field, /disabled=\{busy \|\| !pinned\}/);
  // And no coordinate is ever typed or invented.
  assert.doesNotMatch(field, /Number\.NaN/);
  assert.doesNotMatch(field, /name="lat"|setLat|setLng/);
});
