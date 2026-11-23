import { MEDIA_IMAGE_MIME, MEDIA_MAX_IMAGE_BYTES } from './media.ts';

/** The API refuses a photo wider or taller than this. */
export const PHOTO_SERVER_MAX_SIDE = 4096;
/** The long side a photo is first redrawn at when it has to be redrawn. */
export const PHOTO_MAX_SIDE = 2560;
/** Tried in order until the photo fits under the API's photo limit. */
export const PHOTO_ATTEMPTS: readonly { side: number; quality: number }[] = [
  { side: 2560, quality: 0.85 }, { side: 2560, quality: 0.72 }, { side: 2048, quality: 0.72 },
  { side: 1600, quality: 0.7 }, { side: 1280, quality: 0.65 }, { side: 1024, quality: 0.6 },
];
/** An SVG has no pixels of its own; it is drawn at this long side. */
export const SVG_DRAW_SIDE = 2048;
/** What a phone, camera or design tool may hand the picker that a browser can usually open. */
export const PHOTO_PICK_MIME = [...MEDIA_IMAGE_MIME, 'image/heic', 'image/heif', 'image/svg+xml'] as const;

const HEIC_NAME = /\.(heic|heif)$/i;
const SVG_NAME = /\.svg$/i;

export function isPhotoFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || HEIC_NAME.test(file.name) || SVG_NAME.test(file.name);
}

export function isSvg(file: { type: string; name: string }): boolean {
  return file.type === 'image/svg+xml' || SVG_NAME.test(file.name);
}

/** A file goes up as picked only when it is already a type, size and shape the API takes. */
export function photoNeedsPreparing(file: { type: string; size: number }, dimensions: { width: number; height: number } | null): boolean {
  if (!(MEDIA_IMAGE_MIME as readonly string[]).includes(file.type)) return true;
  if (file.size > MEDIA_MAX_IMAGE_BYTES) return true;
  return dimensions !== null && Math.max(dimensions.width, dimensions.height) > PHOTO_SERVER_MAX_SIDE;
}

/** The size to draw at: the long side capped at `side`, never enlarged. */
export function scaledSize(width: number, height: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True when any pixel is not fully opaque. `rgba` is canvas ImageData.data. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

/**
 * Formats to try, best first. A logo with a see-through background keeps it:
 * WebP, then PNG where a browser cannot write WebP. Everything else is JPEG.
 */
export function outputTypes(transparent: boolean): readonly ('image/webp' | 'image/png' | 'image/jpeg')[] {
  return transparent ? ['image/webp', 'image/png'] : ['image/jpeg'];
}

export type PreparedPhoto =
  | { ok: true; file: File; changed: boolean }
  | { ok: false; reason: 'unreadable' | 'too-large' };

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Drawable | null> {
  if (!isSvg(file)) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* an <img> decodes some formats createImageBitmap does not */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    if (isSvg(file)) {
      const sized = scaledSize(width || SVG_DRAW_SIDE, height || SVG_DRAW_SIDE, SVG_DRAW_SIDE);
      const scale = SVG_DRAW_SIDE / Math.max(sized.width, sized.height);
      width = Math.round(sized.width * scale);
      height = Math.round(sized.height * scale);
    }
    if (!width || !height) return null;
    return { source: image, width, height, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function sourceIsTransparent(drawable: Drawable): boolean {
  const probe = document.createElement('canvas');
  const size = scaledSize(drawable.width, drawable.height, 256);
  probe.width = size.width;
  probe.height = size.height;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(drawable.source, 0, 0, size.width, size.height);
  try {
    return hasTransparency(context.getImageData(0, 0, size.width, size.height).data);
  } catch {
    return false;
  }
}

/**
 * Turns whatever the vendor picked (a 5 MB iPhone photo, a HEIC, a
 * 48-megapixel image, an SVG logo) into a file the API accepts. A photo
 * that already fits is sent unchanged; a logo with a see-through background
 * stays see-through.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const drawable = await decode(file);
  if (!drawable) {
    return (MEDIA_IMAGE_MIME as readonly string[]).includes(file.type) && file.size <= MEDIA_MAX_IMAGE_BYTES
      ? { ok: true, file, changed: false }
      : { ok: false, reason: 'unreadable' };
  }
  try {
    if (!photoNeedsPreparing(file, { width: drawable.width, height: drawable.height })) return { ok: true, file, changed: false };
    const transparent = file.type !== 'image/jpeg' && sourceIsTransparent(drawable);
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    for (const attempt of PHOTO_ATTEMPTS) {
      const size = scaledSize(drawable.width, drawable.height, attempt.side);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return { ok: false, reason: 'unreadable' };
      if (!transparent) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, size.width, size.height);
      }
      context.drawImage(drawable.source, 0, 0, size.width, size.height);
      for (const type of outputTypes(transparent)) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, attempt.quality));
        // A browser that cannot write the type returns PNG instead; that is still accepted.
        if (!blob || !(MEDIA_IMAGE_MIME as readonly string[]).includes(blob.type) || blob.size > MEDIA_MAX_IMAGE_BYTES) continue;
        const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.slice('image/'.length);
        return { ok: true, file: new File([blob], `${name}.${extension}`, { type: blob.type }), changed: true };
      }
    }
    return { ok: false, reason: 'too-large' };
  } finally {
    drawable.close();
  }
}
