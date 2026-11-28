import assert from 'node:assert/strict';
import test from 'node:test';
import { httpMediaTransport, reviveMediaList, type MediaTransport } from '../mediaTransport.ts';
import { demoMediaTransport } from '../mediaTransport.ts';
import { videoUnavailableNote } from '../media.ts';
import type { AuthorizedFetch } from '../setupTransport.ts';

function stubFetch(reply: (path: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const authorized: AuthorizedFetch = async (path, init) => {
    calls.push({ path, init });
    const { status, body } = reply(path, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { authorized, calls };
}

const cover = {
  id: 'media_1',
  kind: 'cover',
  position: 0,
  mimeType: 'image/jpeg',
  byteSize: 12,
  url: '/media/vendor/media_1',
};

test('a list hangs on /vendor/locations/:id/media, a window on /vendor/bookables/:id/media', async () => {
  const { authorized, calls } = stubFetch(() => ({ status: 200, body: { media: [cover], videoAvailable: true } }));
  const transport = httpMediaTransport(authorized);

  const place = await transport.list('location', 'loc_1');
  assert.equal(calls[0]?.path, '/vendor/locations/loc_1/media');
  assert.equal(place.value?.media[0]?.id, 'media_1');
  assert.equal(place.value?.videoAvailable, true);
  assert.equal(place.value?.videoUnavailableReason, null);

  await transport.list('bookable', 'win_1');
  assert.equal(calls[1]?.path, '/vendor/bookables/win_1/media');
});

test('an upload posts kind and dataUri, never a multipart body', async () => {
  const { authorized, calls } = stubFetch(() => ({ status: 201, body: { media: cover } }));
  const result = await httpMediaTransport(authorized).upload(
    'location',
    'loc_1',
    'cover',
    'data:image/jpeg;base64,AAAA',
  );
  assert.equal(result.status, 201);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal((calls[0]?.init?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).kind, 'cover');
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).dataUri.startsWith('data:image/jpeg'), true);
});

test('a row without a url is dropped rather than shown as a working photo', () => {
  const list = reviveMediaList({
    media: [cover, { id: 'media_2', kind: 'gallery', position: 0, mimeType: 'image/png', byteSize: 4 }],
  });
  assert.deepEqual(list.media.map((item) => item.id), ['media_1']);
});

test('each file carries the Bytspot review the vendor reads under it', () => {
  const list = reviveMediaList({
    media: [
      { ...cover, reviewStatus: 'pending' },
      { ...cover, id: 'media_2', kind: 'gallery', reviewStatus: 'rejected', reviewNote: 'Blurry' },
      { ...cover, id: 'media_3', kind: 'gallery', position: 1, reviewStatus: 'live' },
    ],
  });
  assert.deepEqual(list.media.map((item) => [item.reviewStatus, item.reviewNote]), [['pending', null], ['rejected', 'Blurry'], [undefined, undefined]]);
});

test('a video intent posts mime and size, never the file, then completes on the issued id', async () => {
  const intent = {
    mediaId: 'media_v1',
    mimeType: 'video/mp4',
    byteSize: 12,
    url: 'https://objects.example/put',
    method: 'PUT' as const,
    headers: { 'Content-Type': 'video/mp4' },
    expiresAt: '2026-09-21T12:15:00Z',
  };
  const { authorized, calls } = stubFetch((path) => {
    if (path.endsWith('/uploads')) return { status: 201, body: { upload: intent } };
    return { status: 201, body: { media: { ...cover, id: 'media_v1', kind: 'video', mimeType: 'video/mp4' } } };
  });
  const transport = httpMediaTransport(authorized);
  const started = await transport.startVideo('location', 'loc_1', 'video/mp4', 12);
  assert.equal(calls[0]?.path, '/vendor/locations/loc_1/media/uploads');
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).mimeType, 'video/mp4');
  assert.equal(started.value?.mediaId, 'media_v1');
  assert.equal(started.value?.url, 'https://objects.example/put');

  const finished = await transport.completeVideo('location', 'loc_1', 'media_v1', 'video/mp4', 12);
  assert.equal(calls[1]?.path, '/vendor/locations/loc_1/media/uploads/media_v1');
  assert.equal(finished.value?.kind, 'video');
});

test('the demo store keeps a cover unique and a gallery stacked', async () => {
  const transport: MediaTransport = demoMediaTransport();
  const first = await transport.upload('location', 'loc_1', 'cover', 'data:image/jpeg;base64,AAAA');
  const second = await transport.upload('location', 'loc_1', 'cover', 'data:image/jpeg;base64,BBBB');
  const gallery = await transport.upload('location', 'loc_1', 'gallery', 'data:image/png;base64,CCCC');
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  const listed = await transport.list('location', 'loc_1');
  assert.equal(listed.value?.media.filter((item) => item.kind === 'cover').length, 1);
  assert.equal(listed.value?.media.some((item) => item.id === gallery.value?.id), true);

  await transport.remove('location', 'loc_1', gallery.value!.id);
  const after = await transport.list('location', 'loc_1');
  assert.equal(after.value?.media.some((item) => item.kind === 'gallery'), false);
});

test('a refusal without a reason still tells the vendor what happened and what to do', async () => {
  const { refusalFor } = await import('../mediaTransport.ts');
  assert.deepEqual(refusalFor(413, { error: 'Could not save', blockers: ['That file is too large'] }), ['That file is too large'], 'the API reason wins');
  assert.match(refusalFor(401, { error: 'Invalid or expired token' })[0], /sign-in has expired/);
  assert.match(refusalFor(403, { error: 'This business is closed' })[0], /business is closed/);
  assert.match(refusalFor(403, { error: 'No seat at this business' })[0], /no longer on this business/);
  assert.match(refusalFor(404, { error: 'Not found' })[0], /no longer exists/);
  assert.match(refusalFor(413, {})[0], /under 2 MB/);
  assert.match(refusalFor(500, { error: 'Internal server error' })[0], /problem on our side/);
  assert.equal(refusalFor(500, { error: 'Internal server error' })[0].includes('Internal'), false, 'no server wording leaks');
});

test('the media list says why video is off, so storage is not blamed on video hosting', async () => {
  for (const [body, reason] of [
    [{ media: [], videoAvailable: false, videoUnavailableReason: 'storage' }, 'storage'],
    [{ media: [], videoAvailable: false, videoUnavailableReason: 'hosting' }, 'hosting'],
    [{ media: [], videoAvailable: false }, 'hosting'],
  ] as const) {
    const { authorized } = stubFetch(() => ({ status: 200, body }));
    const result = await httpMediaTransport(authorized).list('location', 'loc_1');
    assert.equal(result.value?.videoUnavailableReason, reason);
  }
  assert.match(videoUnavailableNote('storage') ?? '', /video storage/);
  assert.match(videoUnavailableNote('hosting') ?? '', /premium/);
  assert.equal(videoUnavailableNote(null), null);
});
