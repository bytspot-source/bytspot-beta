import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasTransparency, isPhotoFile, isSvg, outputTypes, PHOTO_ATTEMPTS, PHOTO_PICK_MIME, PHOTO_SERVER_MAX_SIDE,
  photoNeedsPreparing, scaledSize,
} from '../photoPrep.ts';
import { MEDIA_MAX_IMAGE_BYTES } from '../media.ts';

test('only what the API would refuse is redrawn; everything else is sent as picked', () => {
  assert.equal(photoNeedsPreparing({ type: 'image/jpeg', size: 4_300_000 }, { width: 4032, height: 3024 }), true, 'an iPhone photo is over 2 MB');
  assert.equal(photoNeedsPreparing({ type: 'image/heic', size: 1_200_000 }, { width: 4032, height: 3024 }), true, 'HEIC is converted');
  assert.equal(photoNeedsPreparing({ type: 'image/svg+xml', size: 8_000 }, null), true, 'SVG is converted');
  assert.equal(photoNeedsPreparing({ type: 'image/jpeg', size: 900_000 }, { width: 8064, height: 6048 }), true, '48 MP is too wide');
  assert.equal(photoNeedsPreparing({ type: 'image/png', size: 600_000 }, { width: 3000, height: 3000 }), false, 'a 3000 px logo the API takes is left alone');
  assert.equal(photoNeedsPreparing({ type: 'image/png', size: MEDIA_MAX_IMAGE_BYTES }, { width: PHOTO_SERVER_MAX_SIDE, height: 10 }), false);
});

test('a see-through logo stays see-through; a photo becomes JPEG', () => {
  assert.deepEqual(outputTypes(true), ['image/webp', 'image/png']);
  assert.deepEqual(outputTypes(false), ['image/jpeg']);
  assert.equal(hasTransparency([255, 255, 255, 255, 0, 0, 0, 255]), false);
  assert.equal(hasTransparency([255, 255, 255, 255, 0, 0, 0, 0]), true);
  assert.equal(hasTransparency([10, 20, 30, 254]), true, 'half-transparent edges count');
});

test('the long side is capped and the shape kept; small images are never enlarged', () => {
  assert.deepEqual(scaledSize(4032, 3024, 2560), { width: 2560, height: 1920 });
  assert.deepEqual(scaledSize(3024, 4032, 2560), { width: 1920, height: 2560 });
  assert.deepEqual(scaledSize(800, 600, 2560), { width: 800, height: 600 });
  assert.ok(PHOTO_ATTEMPTS.every((a) => a.side < PHOTO_SERVER_MAX_SIDE));
  assert.ok(PHOTO_ATTEMPTS.every((a, i) => i === 0 || a.side <= PHOTO_ATTEMPTS[i - 1].side), 'each attempt is no larger than the last');
});

test('HEIC and SVG files can be picked and are recognised by name when the type is missing', () => {
  for (const type of ['image/heic', 'image/svg+xml']) assert.ok((PHOTO_PICK_MIME as readonly string[]).includes(type));
  assert.equal(isPhotoFile({ type: '', name: 'IMG_0421.HEIC' }), true);
  assert.equal(isPhotoFile({ type: '', name: 'logo.svg' }), true);
  assert.equal(isSvg({ type: '', name: 'Logo.SVG' }), true);
  assert.equal(isSvg({ type: 'image/png', name: 'logo.png' }), false);
  assert.equal(isPhotoFile({ type: 'application/pdf', name: 'menu.pdf' }), false);
});
