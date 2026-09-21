import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  encodePickedFile,
  kindsFor,
  MEDIA_CAPS,
  MEDIA_REFUSALS,
  planPickedVideo,
  planUpload,
  vendorCanEditMedia,
} from '../media.ts';
import { openSession, type Seat, type Seller, type VendorSession } from '../seller.ts';

const NOW = new Date('2026-09-04T12:00:00Z');

function session(sellerOver: Partial<Seller> = {}, seatOver: Partial<Seat> = {}): VendorSession {
  const result = openSession(
    {
      id: 'sel_1',
      legalName: 'Midtown Table',
      state: 'ACTIVE',
      businessMode: 'standard',
      satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'],
      ...sellerOver,
    },
    {
      id: 'seat_1',
      sellerId: 'sel_1',
      personId: 'per_1',
      role: 'owner',
      state: 'ACTIVE',
      locationIds: [],
      bookableIds: [],
      ...seatOver,
    },
    NOW,
  );
  assert.equal(result.ok, true);
  return (result as { ok: true; session: VendorSession }).session;
}

test('a menu belongs on a place, not a window, and video is offered only when the store is up', () => {
  assert.deepEqual(kindsFor('location'), ['cover', 'gallery', 'menu']);
  assert.deepEqual(kindsFor('location', true), ['cover', 'gallery', 'menu', 'video']);
  assert.deepEqual(kindsFor('bookable', true), ['cover', 'gallery']);
  assert.equal(planUpload({ parent: 'bookable', kind: 'menu', existing: [] }).ok, false);
  const closed = planUpload({ parent: 'location', kind: 'video', existing: [] });
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(MEDIA_REFUSALS[closed.reason], 'Video uploads are not available yet');
  assert.deepEqual(planUpload({ parent: 'location', kind: 'video', existing: [], storeConfigured: true }), {
    ok: true,
    kind: 'video',
    position: 0,
    replace: false,
  });
});

test('a second cover replaces the first rather than stacking', () => {
  assert.deepEqual(planUpload({ parent: 'location', kind: 'cover', existing: [] }), {
    ok: true,
    kind: 'cover',
    position: 0,
    replace: false,
  });
  assert.deepEqual(
    planUpload({ parent: 'location', kind: 'cover', existing: [{ kind: 'cover', position: 0 }] }),
    { ok: true, kind: 'cover', position: 0, replace: true },
  );
});

test('a place gallery stops at eight and a window gallery at three', () => {
  const fullPlace = Array.from({ length: MEDIA_CAPS.gallery.location }, (_, position) => ({
    kind: 'gallery' as const,
    position,
  }));
  const place = planUpload({ parent: 'location', kind: 'gallery', existing: fullPlace });
  assert.equal(place.ok, false);
  if (!place.ok) assert.equal(place.reason, 'at-capacity');

  const fullWindow = Array.from({ length: MEDIA_CAPS.gallery.bookable }, (_, position) => ({
    kind: 'gallery' as const,
    position,
  }));
  const window = planUpload({ parent: 'bookable', kind: 'gallery', existing: fullWindow });
  assert.equal(window.ok, false);
  if (!window.ok) assert.equal(window.reason, 'at-capacity');
});

test('a draft owner can hang photos, a door cannot, and a suspended business cannot', () => {
  // sessionCan('PUBLISH') is false on DRAFT, and that is the wrong check: the
  // person filling in the gate is the one who has to attach a cover.
  assert.equal(vendorCanEditMedia(session({ state: 'DRAFT' })), true);
  assert.equal(vendorCanEditMedia(session({ state: 'PENDING' })), true);
  assert.equal(vendorCanEditMedia(session({}, { role: 'door' })), false);
  assert.equal(vendorCanEditMedia(session({}, { role: 'staff' })), false);
  assert.equal(vendorCanEditMedia(session({ state: 'SUSPENDED' })), false);
});

test('a video file is never a data URI, and a stills encoder still refuses one', () => {
  const file = { type: 'video/mp4', size: 12 } as File;
  const encoded = encodePickedFile('cover', file, 'data:video/mp4;base64,AAAA');
  assert.equal(encoded.ok, false);
  if (!encoded.ok) assert.equal(encoded.reason, 'video-unavailable');
  assert.equal(planPickedVideo(file, false).ok, false);
  assert.deepEqual(planPickedVideo(file, true), { ok: true, mimeType: 'video/mp4', byteSize: 12 });
});

test('the picker hangs on a real place id and a window id from demand supply', () => {
  const places = readFileSync(new URL('../LocationsView.tsx', import.meta.url), 'utf8');
  assert.match(places, /parent="location"/);
  assert.match(places, /parentId=\{location\.id\}/);

  const feed = readFileSync(new URL('../DemandFeed.tsx', import.meta.url), 'utf8');
  assert.match(feed, /parent="bookable"/);
  assert.match(feed, /parentId=\{item\.bookableId\}/);

  // Cottage sellers never see the Places tab, so the same picker has to live
  // on the gate once a place exists.
  const gate = readFileSync(new URL('../OnboardingView.tsx', import.meta.url), 'utf8');
  assert.match(gate, /parent="location"/);
  assert.match(gate, /parentId=\{location\.id\}/);

  // Availability is still a local template grid, so it must not invent an id
  // to POST against. Demand supply is the live window id.
  const grid = readFileSync(new URL('../AvailabilityGrid.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(grid, /MediaPicker/);
});
