import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertMenuBindingReply, assertMenuReviewReply, canApproveMenuDish, canManageMenuDishes,
  fetchMenuSource, MENU_REVIEW_MS, menuDishesTransport, menuErrorText, menuReviewInput,
  menuReviewLabel, menuSourcePath, menuVenueBindingInput, MenuRequestError,
  parseMenuDish, parseMenuList, parseMenuQueue, parseMenuVenues, submissionProblem, validDishText,
  type MenuDish, type MenuQueueDish, type MenuReviewChecks,
} from '../menuDishes.ts';
import type { AuthorizedFetch } from '../setupTransport.ts';
import type { VendorSession } from '../seller.ts';
import { VENDOR_API_BASE_URL } from '../authTransport.ts';

// Test fixtures only; production has no demo menu evidence transport or seeded dishes.
const VERSION = '2026-10-01T12:00:00.000Z';
const MEDIA_VERSION = '2026-09-30T12:00:00.000Z';
const MEDIA_REVISION = String(Date.parse(MEDIA_VERSION));
const SOURCE_PATH = `/media/menu-source/menu_1/${MEDIA_REVISION}`;
const API_ORIGIN = new URL(VENDOR_API_BASE_URL).origin;
const dish: MenuDish = {
  id: 'dish_1', mediaId: 'menu_1', dishName: 'Mushroom toast', aliases: ['Toast with mushrooms'],
  sourceUrl: SOURCE_PATH, reviewStatus: 'pending', reviewNote: null, reviewedAt: null,
  updatedAt: VERSION, mediaUpdatedAt: MEDIA_VERSION, mediaReviewStatus: 'approved',
};
const queued: MenuQueueDish = {
  ...dish, locationId: 'loc_1', locationLabel: 'Market kitchen', address: '10 Market Street',
  sellerId: 'seller_1', business: 'Kitchen', venueId: 'venue_1', venueName: 'Market kitchen',
  venueAddress: '10 Market Street', venueDiscoverable: true,
};
const checks: MenuReviewChecks = { previewReady: true, inspected: true, namesChecked: true, samePlace: true };
const list = { venueId: 'venue_1', dishes: [dish] };
const submission = { mediaId: dish.mediaId, dishName: dish.dishName, aliases: dish.aliases };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const statusIs = (status: number) => (error: unknown) => error instanceof MenuRequestError && error.status === status;

function recorder(reply: () => Response | Promise<Response> = () => json(list)) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const authorized: AuthorizedFetch = async (path, init) => { calls.push({ path, init }); return reply(); };
  return { calls, authorized, transport: menuDishesTransport(authorized, 'loc_1') };
}

test('transport sends exact list/create/update/withdraw contracts with explicit versions', async () => {
  const { transport, calls } = recorder();
  const controller = new AbortController();
  assert.deepEqual(await transport.list(controller.signal), list);
  await transport.save({ ...submission, dishName: '  Mushroom toast  ', aliases: [' Toast with mushrooms '] }, controller.signal);
  await transport.save({ ...submission, dishId: dish.id, expectedUpdatedAt: VERSION });
  await transport.withdraw(dish.id, VERSION);
  assert.deepEqual(calls.map((call) => call.path), [
    '/vendor/locations/loc_1/menu-dishes', '/vendor/locations/loc_1/menu-dishes',
    '/vendor/locations/loc_1/menu-dishes', '/vendor/locations/loc_1/menu-dishes/dish_1/withdraw',
  ]);
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[0].init?.signal, controller.signal);
  assert.equal(calls[0].init?.body, undefined);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), submission);
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { ...submission, dishId: dish.id, expectedUpdatedAt: VERSION });
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { expectedUpdatedAt: VERSION });
  for (const call of calls) {
    assert.equal(call.init?.cache, 'no-store');
    assert.equal(call.init?.redirect, 'error');
  }
  for (const call of calls.slice(1)) {
    assert.equal(call.init?.method, 'POST');
    assert.equal(new Headers(call.init?.headers).get('Content-Type'), 'application/json');
  }
});

test('input schema refuses markup, contact details, invalid aliases and partial update versions locally', async () => {
  for (const value of ['', ' ', '<b>toast</b>', 'a@b', 'https://example.org', 'www.example.org',
    'example.org', 'tel:123', 'data:text/plain,toast', '123-456-7890', 'toast\nwith eggs', 'toast\u200b', 'x'.repeat(121)]) {
    assert.equal(validDishText(value), false, value);
  }
  for (const value of ['Crème brûlée', '豆腐汤', 'Toast & eggs', 'Soup (small)']) assert.equal(validDishText(value), true);
  const { transport, calls } = recorder();
  for (const input of [
    { ...submission, aliases: Array(6).fill('Toast') }, { ...submission, aliases: [''] },
    { ...submission, dishId: dish.id }, { ...submission, expectedUpdatedAt: VERSION },
    { ...submission, dishId: dish.id, expectedUpdatedAt: '2026-02-30T12:00:00Z' },
    { ...submission, dishId: dish.id, expectedUpdatedAt: '2026-10-01T24:00:00Z' },
    { ...submission, mediaId: '../menu_1' },
  ]) {
    assert.ok(submissionProblem(input));
    await assert.rejects(transport.save(input), statusIs(400));
  }
  await assert.rejects(transport.withdraw(dish.id, ''), statusIs(400));
  assert.equal(calls.length, 0);
  assert.throws(() => menuDishesTransport(async () => json(list), '../loc_1'));
});

test('response parsing requires complete typed data, bounded lists and unique dishes', () => {
  assert.deepEqual(parseMenuList(list), list);
  assert.deepEqual(parseMenuQueue({ dishes: [queued] }), [queued]);
  assert.deepEqual(parseMenuList({ venueId: null, dishes: [] }), { venueId: null, dishes: [] });
  assert.equal(parseMenuDish({ ...dish, reviewedAt: VERSION }).reviewedAt, VERSION);
  assert.deepEqual(parseMenuQueue({ dishes: [{ ...queued, venueId: null }] }), [{ ...queued, venueId: null }]);
  for (const raw of [null, {}, [], { dishes: [] }, { venueId: null, dishes: null },
    { ...list, venueId: undefined }, { ...list, venueId: 3 }, { ...list, venueId: {} },
    { ...list, dishes: [dish, dish] }, { ...list, dishes: Array(101).fill(dish) }]) assert.throws(() => parseMenuList(raw));
  for (const patch of [
    { id: '' }, { aliases: null }, { aliases: ['https://example.org'] }, { dishName: '<img>' },
    { updatedAt: 123 }, { updatedAt: '2026-02-29T00:00:00Z' }, { mediaUpdatedAt: undefined },
    { reviewStatus: 'APPROVED' }, { mediaReviewStatus: true }, { reviewNote: undefined },
    { reviewNote: 'x'.repeat(281) }, { reviewedAt: '' }, { reviewedAt: undefined }, { reviewedAt: 3 },
    { sourceUrl: `/media/menu-source/other_menu/${MEDIA_REVISION}` }, { sourceUrl: null }, { sourceUrl: {} },
  ]) assert.throws(() => parseMenuDish({ ...dish, ...patch }));
  for (const patch of [{ venueDiscoverable: 'true' }, { venueId: undefined }, { venueId: 3 }, { venueId: {} }, { address: 3 }, { sellerId: null }]) {
    assert.throws(() => parseMenuQueue({ dishes: [{ ...queued, ...patch }] }));
  }
  assert.throws(() => parseMenuQueue({ dishes: [queued, queued] }));
  assert.throws(() => parseMenuQueue({ dishes: Array(201).fill(queued) }));
  const venue = { venueId: 'venue_1', name: 'Kitchen', address: '10 Market Street' };
  assert.deepEqual(parseMenuVenues({ venues: [venue] }), [venue]);
  assert.throws(() => parseMenuVenues({ venues: [{ ...venue, address: null }] }));
  assert.throws(() => parseMenuVenues({ venues: Array(21).fill(venue) }));
  assert.throws(() => parseMenuVenues({ venues: [venue, venue] }));
  assert.equal(parseMenuDish({ ...dish, updatedAt: '2024-02-29T12:00:00+02:00' }).updatedAt, '2024-02-29T12:00:00+02:00');
});

test('source URL validation reconstructs only our revisioned API path, never a provider origin', async () => {
  const path = SOURCE_PATH;
  assert.equal(menuSourcePath(path, dish.mediaId), path);
  assert.equal(menuSourcePath(`${API_ORIGIN}${path}`, dish.mediaId), path);
  assert.equal(parseMenuDish({ ...dish, sourceUrl: `${API_ORIGIN}${path}` }).sourceUrl, path);
  const invalid = [
    `//untrusted.example${path}`, 'javascript:alert(1)', 'data:application/pdf,menu',
    'blob:https://example.org/id', 'https://example.org/private/menu.pdf',
    `https://untrusted.example${path}`, `${API_ORIGIN}${path}?download=1`, `${API_ORIGIN}${path}#page=1`,
    `${API_ORIGIN.replace('://', '://user@')}${path}`,
    `${API_ORIGIN}/media/menu-source/other/${MEDIA_REVISION}`,
    `${API_ORIGIN}/media/menu-source/%6denu_1/${MEDIA_REVISION}`,
    `${API_ORIGIN}/media/menu-source/x/../menu_1/${MEDIA_REVISION}`,
    `${API_ORIGIN}${path}/`, ` ${API_ORIGIN}${path}`, `${API_ORIGIN}${path}\n`,
    `http://public.example${path}`, `${path}?download=1`, `${path}#page=1`,
    '/media/vendor/menu_1', `${API_ORIGIN}/media/vendor/menu_1`,
  ];
  const { authorized, calls } = recorder(() => new Response(new Blob(['pdf'], { type: 'application/pdf' })));
  await fetchMenuSource(authorized, `${API_ORIGIN}${path}`, dish.mediaId);
  assert.equal(calls[0].path, path);
  assert.equal(calls[0].init?.redirect, 'error');
  assert.equal(calls[0].init?.cache, 'no-store');
  for (const raw of invalid) {
    assert.equal(menuSourcePath(raw, dish.mediaId), undefined, raw);
    assert.throws(() => parseMenuDish({ ...dish, sourceUrl: raw }));
    await assert.rejects(fetchMenuSource(authorized, raw, dish.mediaId), statusIs(0));
  }
  assert.equal(calls.length, 1);
});

test('source revisions must be canonical positive integers and match mediaUpdatedAt milliseconds exactly', async () => {
  assert.equal(menuSourcePath(SOURCE_PATH, dish.mediaId, MEDIA_REVISION), SOURCE_PATH);
  for (const value of ['', '0', '-1', '+1', '01', `0${MEDIA_REVISION}`, '1.0', '1e3', ' 1', '1 ',
    '1\n', '%31', '1/extra', '9007199254740992']) {
    const path = `/media/menu-source/menu_1/${value}`;
    assert.equal(menuSourcePath(path, dish.mediaId), undefined, value);
    assert.equal(menuSourcePath(SOURCE_PATH, dish.mediaId, value), undefined, value);
    assert.throws(() => parseMenuDish({ ...dish, sourceUrl: path }));
    const { authorized, calls } = recorder();
    await assert.rejects(fetchMenuSource(authorized, path, dish.mediaId), statusIs(0));
    assert.equal(calls.length, 0);
  }
  for (const raw of [null, undefined, 123, {}, []]) assert.equal(menuSourcePath(raw, dish.mediaId), undefined);
  assert.equal(menuSourcePath(SOURCE_PATH, '../menu_1'), undefined);
  const nextRevision = String(Date.parse(MEDIA_VERSION) + 1);
  const nextPath = `/media/menu-source/menu_1/${nextRevision}`;
  assert.equal(menuSourcePath(nextPath, dish.mediaId), nextPath);
  assert.equal(menuSourcePath(nextPath, dish.mediaId, MEDIA_REVISION), undefined);
  assert.throws(() => parseMenuDish({ ...dish, sourceUrl: nextPath }));
  assert.throws(() => parseMenuDish({ ...dish, mediaUpdatedAt: '2026-09-30T12:00:00.001Z' }));
  assert.equal(parseMenuDish({ ...dish, sourceUrl: nextPath, mediaUpdatedAt: '2026-09-30T12:00:00.001Z' }).sourceUrl, nextPath);
  assert.equal(parseMenuDish({ ...dish, mediaUpdatedAt: '2026-09-30T14:00:00+02:00' }).sourceUrl, SOURCE_PATH);
  for (const mediaUpdatedAt of ['1970-01-01T00:00:00.000Z', '1969-12-31T23:59:59.999Z']) {
    assert.throws(() => parseMenuDish({ ...dish, mediaUpdatedAt,
      sourceUrl: `/media/menu-source/menu_1/${Date.parse(mediaUpdatedAt)}` }));
  }
});

test('absolute source URLs require the configured HTTPS or safe local HTTP API origin', () => {
  for (const base of ['https://api.example', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal(menuSourcePath(`${base}${SOURCE_PATH}`, dish.mediaId, MEDIA_REVISION, base), SOURCE_PATH);
    assert.equal(menuSourcePath(`${base}${SOURCE_PATH}`, dish.mediaId, MEDIA_REVISION, 'https://other.example'), undefined);
  }
  for (const base of ['http://public.example', 'http://localhost.evil.example', 'http://localhost:3000/api', 'http://user@localhost:3000']) {
    assert.equal(menuSourcePath(`${base}${SOURCE_PATH}`, dish.mediaId, MEDIA_REVISION, base), undefined);
  }
  assert.equal(menuSourcePath(`http://localhost:3001${SOURCE_PATH}`, dish.mediaId, MEDIA_REVISION, 'http://localhost:3000'), undefined);
});

test('source preview accepts only bounded nonempty JPEG PNG WebP PDF blobs and preserves authorization failures', async () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
    const { authorized } = recorder(() => new Response(new Blob(['bytes'], { type: mime })));
    assert.equal((await fetchMenuSource(authorized, dish.sourceUrl, dish.mediaId)).type, mime);
  }
  for (const blob of [
    new Blob(['<svg/>'], { type: 'image/svg+xml' }), new Blob(['<html/>'], { type: 'text/html' }),
    new Blob(['bytes']), new Blob(['bytes'], { type: 'video/mp4' }), new Blob([], { type: 'application/pdf' }),
    new Blob([new Uint8Array(8_000_001)], { type: 'application/pdf' }),
    new Blob([new Uint8Array(2_000_001)], { type: 'image/png' }),
  ]) {
    const { authorized } = recorder(() => new Response(blob));
    await assert.rejects(fetchMenuSource(authorized, dish.sourceUrl, dish.mediaId), statusIs(0));
  }
  for (const code of [401, 403, 404, 500]) {
    const { authorized } = recorder(() => json({}, code));
    await assert.rejects(fetchMenuSource(authorized, dish.sourceUrl, dish.mediaId), statusIs(code));
  }
});

test('failed and malformed replies never fabricate dishes or approvals, and conflicts are never automatically retried', async () => {
  for (const code of [400, 401, 403, 404, 409, 500]) {
    const { transport, calls } = recorder(() => json({ error: 'untrusted diagnostic' }, code));
    await assert.rejects(transport.save({ ...submission, dishId: dish.id, expectedUpdatedAt: VERSION }), statusIs(code));
    assert.equal(calls.length, 1);
    assert.ok(!menuErrorText(new MenuRequestError(code)).includes('untrusted diagnostic'));
  }
  for (const reply of [() => json({}), () => json({ ...list, dishes: [{ ...dish, reviewStatus: 'invented' }] }),
    () => new Response('<html>not JSON</html>'), () => Promise.reject(new Error('offline'))]) {
    const { transport, calls } = recorder(reply);
    await assert.rejects(transport.list(), statusIs(0));
    assert.equal(calls.length, 1);
  }
  assert.match(menuErrorText(409), /Nothing was retried automatically/);
  assert.match(menuErrorText({ data: { code: 'CONFLICT' } }), /Reload/);
});

test('abort prevents calls and discards late transport and source bytes even when fetch ignores cancellation', async () => {
  const aborted = new AbortController(); aborted.abort();
  const { transport, authorized, calls } = recorder();
  await assert.rejects(transport.list(aborted.signal), { name: 'AbortError' });
  await assert.rejects(fetchMenuSource(authorized, dish.sourceUrl, dish.mediaId, aborted.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  for (const source of [false, true]) {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const delayed = recorder(() => pending);
    const active = new AbortController();
    const work = source ? fetchMenuSource(delayed.authorized, dish.sourceUrl, dish.mediaId, active.signal)
      : delayed.transport.list(active.signal);
    active.abort();
    resolve(source ? new Response(new Blob(['pdf'], { type: 'application/pdf' })) : json(list));
    await assert.rejects(work, { name: 'AbortError' });
    assert.equal(delayed.calls.length, 1);
    assert.equal(delayed.calls[0].init?.signal, active.signal);
  }
});

test('admin review and binding send exact compare-and-swap versions, including nullable expected binding', () => {
  assert.deepEqual(menuReviewInput(queued, true, '  Read source  ', checks), {
    dishId: dish.id, approve: true, expectedUpdatedAt: VERSION, expectedMediaUpdatedAt: MEDIA_VERSION,
    expectedVenueId: 'venue_1', note: 'Read source',
  });
  assert.deepEqual(menuReviewInput({ ...queued, venueId: null }, false, 'Wrong place'), {
    dishId: dish.id, approve: false, expectedUpdatedAt: VERSION, expectedMediaUpdatedAt: MEDIA_VERSION,
    expectedVenueId: null, note: 'Wrong place',
  });
  assert.deepEqual(menuVenueBindingInput(queued, null), { locationId: 'loc_1', venueId: null, expectedVenueId: 'venue_1' });
  assert.deepEqual(menuVenueBindingInput({ ...queued, venueId: null }, 'venue_2'), { locationId: 'loc_1', venueId: 'venue_2', expectedVenueId: null });
  assert.throws(() => menuReviewInput(queued, false, '  '));
  assert.throws(() => menuReviewInput(queued, true, 'x'.repeat(281), checks));
  assert.throws(() => menuReviewInput({ ...queued, mediaUpdatedAt: '' }, true, '', checks));
  assert.throws(() => menuReviewInput({ ...queued, updatedAt: '' }, false, 'Reject'));
  assert.throws(() => menuVenueBindingInput(queued, '../venue'));
});

test('approval requires preview plus every explicit check and an approved source with discoverable bound venue', () => {
  assert.equal(canApproveMenuDish(queued, checks), true);
  assert.throws(() => menuReviewInput(queued, true, ''));
  for (const key of Object.keys(checks) as (keyof MenuReviewChecks)[]) {
    const missing = { ...checks, [key]: false };
    assert.equal(canApproveMenuDish(queued, missing), false, key);
    assert.throws(() => menuReviewInput(queued, true, '', missing));
  }
  for (const patch of [{ mediaReviewStatus: 'pending' as const }, { mediaReviewStatus: 'rejected' as const },
    { venueId: null }, { venueDiscoverable: false }]) {
    assert.equal(canApproveMenuDish({ ...queued, ...patch }, checks), false);
    assert.throws(() => menuReviewInput({ ...queued, ...patch }, true, '', checks));
  }
  assert.doesNotThrow(() => assertMenuReviewReply({ reviewStatus: 'approved' }, true));
  assert.doesNotThrow(() => assertMenuReviewReply({ reviewStatus: 'rejected' }, false));
  for (const raw of [null, {}, { reviewStatus: 'pending' }, { reviewStatus: 'rejected' }, { ok: true }]) {
    assert.throws(() => assertMenuReviewReply(raw, true));
  }
  assert.doesNotThrow(() => assertMenuBindingReply({ venueId: null }, null));
  assert.throws(() => assertMenuBindingReply({}, null));
  assert.throws(() => assertMenuBindingReply({ venueId: 'other' }, 'venue_1'));
});

test('approved records expire at 30 days and never imply current evidence from a legacy DTO', () => {
  const reviewed = { ...dish, reviewStatus: 'approved' as const, reviewedAt: VERSION };
  const now = Date.parse(VERSION);
  assert.match(menuReviewLabel(reviewed, now + MENU_REVIEW_MS - 1), /eligibility is not verified/);
  assert.match(menuReviewLabel(reviewed, now + MENU_REVIEW_MS), /Expired/);
  assert.match(menuReviewLabel({ ...reviewed, mediaUpdatedAt: '2026-10-02T00:00:00Z' }, now + 86400000), /source changed/);
  assert.match(menuReviewLabel({ ...reviewed, mediaReviewStatus: 'rejected' }, now), /source changed/);
  assert.match(menuReviewLabel({ ...reviewed, reviewedAt: null }, now), /needs re-review/);
  assert.match(menuReviewLabel(reviewed, now - 1), /needs re-review/);
  assert.equal(menuReviewLabel(dish, now), 'pending');
});

test('menu management requires an active matching seat, role PUBLISH and location scope, including draft setup', () => {
  const session: VendorSession = {
    seller: { id: 'seller_1', legalName: 'Kitchen', state: 'DRAFT', businessMode: 'standard', satisfied: [] },
    seat: { id: 'seat_1', sellerId: 'seller_1', personId: 'person_1', role: 'owner', state: 'ACTIVE', locationIds: ['loc_1'], bookableIds: [] },
    scope: 'assigned', capabilities: new Set(),
  };
  assert.equal(canManageMenuDishes(session, 'loc_1'), true);
  assert.equal(canManageMenuDishes(session, 'loc_2'), false);
  assert.equal(canManageMenuDishes({ ...session, seat: { ...session.seat, role: 'door' } }, 'loc_1'), false);
  assert.equal(canManageMenuDishes({ ...session, seat: { ...session.seat, state: 'INVITED' } }, 'loc_1'), false);
  assert.equal(canManageMenuDishes({ ...session, seat: { ...session.seat, sellerId: 'other' } }, 'loc_1'), false);
  for (const state of ['SUSPENDED', 'CLOSED'] as const) {
    assert.equal(canManageMenuDishes({ ...session, seller: { ...session.seller, state } }, 'loc_1'), false);
  }
});

test('UI wiring keeps failed mutations locked for reload, resets source checks and has no raw menu fallback', () => {
  // Source-level wiring checks complement the executable transport/policy tests; not a browser test.
  const editor = readFileSync(new URL('../MenuDishEditor.tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../admin/MenuEvidenceReview.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../MediaPicker.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../../admin/AdminApp.tsx', import.meta.url), 'utf8');
  assert.match(editor, /controller\.abort\(\); if \(objectUrl\) URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(editor, /onReadyChange\?\.\(false\); setPreview\(null\)/);
  assert.match(editor, /setError\(menuErrorText\(e\)\); setMustReload\(true\)/);
  assert.match(review, /if \(!value\) \{ setInspected\(false\); setNamesChecked\(false\); setSamePlace\(false\); \}/);
  assert.match(review, /key=\{JSON\.stringify\(dish\)\}/);
  assert.match(review, /sourceVersion=\{dish\.mediaUpdatedAt\}/);
  assert.match(review, /menuReviewInput\(dish, true, note, checks\)/);
  assert.match(review, /setError\(menuErrorText\(e\)\); setRows\(null\)/);
  assert.match(picker, /Optional menu evidence is unavailable without an authenticated connection/);
  assert.match(picker, /if \(item\.kind === 'menu'\) return ''/);
  assert.match(picker, /canManageMenuDishes\(session, parentId\)/);
  assert.match(admin, /menuMediaBusy \?/);
  assert.ok(!editor.includes('href={sourceUrl}') && !editor.includes('src={sourceUrl}'));
});
