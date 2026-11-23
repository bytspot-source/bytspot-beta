import { MEDIA_IMAGE_MIME, MEDIA_MAX_IMAGE_BYTES } from './media.ts';

/** The API refuses a photo wider or taller than 4,096 px; this leaves room. */
export const PHOTO_MAX_SIDE = 2560;
/** Tried in order until the photo fits under the API's photo limit. */
export const PHOTO_ATTEMPTS: readonly { side: number; quality: number }[] = [
  { side: 2560, quality: 0.85 }, { side: 2560, quality: 0.72 }, { side: 2048, quality: 0.72 },
  { side: 1600, quality: 0.7 }, { side: 1280, quality: 0.65 },
];
/** What a phone or camera may hand the picker that a browser can usually decode. */
export const PHOTO_PICK_MIME = [...MEDIA_IMAGE_MIME, 'image/heic', 'image/heif'] as const;

const HEIC_NAME = /\.(heic|heif)$/i;

export function isPhotoFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || HEIC_NAME.test(file.name);
}

/** A photo goes up as picked only when it is already a type, size and shape the API takes. */
export function photoNeedsPreparing(file: { type: string; size: number }, dimensions: { width: number; height: number } | null): boolean {
  if (!(MEDIA_IMAGE_MIME as readonly string[]).includes(file.type)) return true;
  if (file.size > MEDIA_MAX_IMAGE_BYTES) return true;
  return dimensions !== null && Math.max(dimensions.width, dimensions.height) > PHOTO_MAX_SIDE;
}

/** The size to draw at: the long side capped at `side`, never enlarged. */
export function scaledSize(width: number, height: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type PreparedPhoto =
  | { ok: true; file: File; changed: boolean }
  | { ok: false; reason: 'unreadable' | 'too-large' };

/**
 * Turns whatever photo the vendor picked (a 5 MB iPhone shot, a HEIC, a
 * 48-megapixel image) into a JPEG the API accepts, following the photo's
 * orientation. A photo that already fits is sent unchanged.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    return (MEDIA_IMAGE_MIME as readonly string[]).includes(file.type) && file.size <= MEDIA_MAX_IMAGE_BYTES
      ? { ok: true, file, changed: false }
      : { ok: false, reason: 'unreadable' };
  }
  try {
    if (!photoNeedsPreparing(file, { width: bitmap.width, height: bitmap.height })) return { ok: true, file, changed: false };
    for (const attempt of PHOTO_ATTEMPTS) {
      const size = scaledSize(bitmap.width, bitmap.height, attempt.side);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return { ok: false, reason: 'unreadable' };
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', attempt.quality));
      if (blob && blob.size <= MEDIA_MAX_IMAGE_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
        return { ok: true, file: new File([blob], `${name}.jpg`, { type: 'image/jpeg' }), changed: true };
      }
    }
    return { ok: false, reason: 'too-large' };
  } finally {
    bitmap.close();
  }
}
