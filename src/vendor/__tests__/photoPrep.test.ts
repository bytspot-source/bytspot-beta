import assert from 'node:assert/strict';
import test from 'node:test';
import { isPhotoFile, PHOTO_ATTEMPTS, PHOTO_MAX_SIDE, PHOTO_PICK_MIME, photoNeedsPreparing, scaledSize } from '../photoPrep.ts';
import { MEDIA_MAX_IMAGE_BYTES } from '../media.ts';

test('a phone photo is shrunk; one that already fits is sent as picked', () => {
  const iphone = { type: 'image/jpeg', size: 4_300_000 };
  assert.equal(photoNeedsPreparing(iphone, { width: 4032, height: 3024 }), true, 'over 2 MB');
  assert.equal(photoNeedsPreparing({ type: 'image/heic', size: 1_200_000 }, { width: 4032, height: 3024 }), true, 'HEIC is converted');
  assert.equal(photoNeedsPreparing({ type: 'image/jpeg', size: 900_000 }, { width: 8064, height: 6048 }), true, '48 MP is too wide');
  assert.equal(photoNeedsPreparing({ type: 'image/jpeg', size: 900_000 }, { width: 2000, height: 1500 }), false);
  assert.equal(photoNeedsPreparing({ type: 'image/png', size: MEDIA_MAX_IMAGE_BYTES }, null), false);
});

test('the long side is capped and the shape kept; small photos are never enlarged', () => {
  assert.deepEqual(scaledSize(4032, 3024, 2560), { width: 2560, height: 1920 });
  assert.deepEqual(scaledSize(3024, 4032, 2560), { width: 1920, height: 2560 });
  assert.deepEqual(scaledSize(800, 600, 2560), { width: 800, height: 600 });
  assert.ok(PHOTO_ATTEMPTS.every((a) => a.side <= PHOTO_MAX_SIDE && a.side < 4096));
  assert.ok(PHOTO_ATTEMPTS.every((a, i) => i === 0 || a.side <= PHOTO_ATTEMPTS[i - 1].side), 'each attempt is no larger than the last');
});

test('HEIC photos can be picked and are recognised by name when the type is missing', () => {
  assert.ok(PHOTO_PICK_MIME.includes('image/heic'));
  assert.equal(isPhotoFile({ type: '', name: 'IMG_0421.HEIC' }), true);
  assert.equal(isPhotoFile({ type: 'image/jpeg', name: 'a.jpg' }), true);
  assert.equal(isPhotoFile({ type: 'application/pdf', name: 'menu.pdf' }), false);
});
