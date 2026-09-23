import { getBookableStaffRole } from '../utils/bookableTemplates.ts';
import type { VendorSession } from './seller.ts';

/**
 * Attachments on a PIN or a window. Kind is a tag, not a noun: a menu is
 * display on the place, and anything that sells is a window (what the console
 * still calls a bookable) with its own cover.
 *
 * Kept in lockstep with the API's `src/vendor/media.ts`. The server is the
 * authority; this copy exists so the picker can refuse before a round trip,
 * and so a button that would 409 is not offered.
 */
export const MEDIA_KINDS = ['cover', 'gallery', 'video', 'menu'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaParent = 'location' | 'bookable';

export const MEDIA_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MEDIA_MENU_MIME = [...MEDIA_IMAGE_MIME, 'application/pdf'] as const;
export const MEDIA_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const MEDIA_CAPS = {
  cover: { location: 1, bookable: 1 },
  gallery: { location: 8, bookable: 3 },
  menu: { location: 3, bookable: 0 },
  video: { location: 1, bookable: 0 },
} as const;

export const MEDIA_MAX_IMAGE_BYTES = 2_000_000;
export const MEDIA_MAX_MENU_BYTES = 8_000_000;
export const MEDIA_MAX_VIDEO_BYTES = 80_000_000;
/** The API's JSON body ceiling. A larger file is refused here, not mid-POST. */
export const MEDIA_MAX_DATA_URI_CHARS = 4_000_000;

export type MediaRefusal =
  | 'forbidden'
  | 'unknown-kind'
  | 'kind-not-on-parent'
  | 'video-unavailable'
  | 'bad-payload'
  | 'too-large'
  | 'at-capacity'
  | 'cover-has-no-index';

export interface VendorMediaItem {
  id: string;
  kind: MediaKind;
  position: number;
  mimeType: string;
  byteSize: number;
  url: string;
}

export const MEDIA_REFUSALS: Record<MediaRefusal, string> = {
  forbidden: 'Your role cannot do that',
  'unknown-kind': 'Unknown media kind',
  'kind-not-on-parent': 'That file does not belong on this',
  'video-unavailable': 'Video uploads are not available yet',
  'bad-payload': 'Use a JPEG, PNG, WebP, PDF, MP4, WebM, or MOV',
  'too-large': 'That file is too large',
  'at-capacity': 'This already has as many files as it can hold',
  'cover-has-no-index': 'A cover cannot specify a slot',
};

export function isMediaKind(value: string): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value);
}

export function kindAllowedOn(parent: MediaParent, kind: MediaKind): boolean {
  return MEDIA_CAPS[kind][parent] > 0;
}

export function capFor(parent: MediaParent, kind: MediaKind): number {
  return MEDIA_CAPS[kind][parent];
}

export function kindsFor(parent: MediaParent, storeConfigured = false): MediaKind[] {
  const kinds: MediaKind[] = ['cover', 'gallery', 'menu', 'video'];
  return kinds.filter((kind) => {
    if (!kindAllowedOn(parent, kind)) return false;
    if (kind === 'video' && !storeConfigured) return false;
    return true;
  });
}

export function nextPosition(kind: MediaKind, occupied: number[]): number {
  if (kind === 'cover' || kind === 'video') return 0;
  const taken = new Set(occupied);
  const cap = Math.max(...Object.values(MEDIA_CAPS[kind]), 0);
  for (let position = 0; position < cap; position += 1) {
    if (!taken.has(position)) return position;
  }
  return occupied.length;
}

export type UploadPlan =
  | { ok: true; kind: MediaKind; position: number; replace: boolean }
  | { ok: false; reason: MediaRefusal };

/**
 * Decides whether this upload fits the parent. Counting happens with the
 * already-shown rows so a button that would 409 is not offered.
 */
export function planUpload(options: {
  parent: MediaParent;
  kind: string;
  position?: number;
  existing: { kind: string; position: number }[];
  storeConfigured?: boolean;
}): UploadPlan {
  if (!isMediaKind(options.kind)) return { ok: false, reason: 'unknown-kind' };
  const kind = options.kind;

  if (!kindAllowedOn(options.parent, kind)) return { ok: false, reason: 'kind-not-on-parent' };
  if (kind === 'video' && !options.storeConfigured) return { ok: false, reason: 'video-unavailable' };

  if (kind === 'cover' || kind === 'video') {
    if (options.position !== undefined && options.position !== 0) return { ok: false, reason: 'cover-has-no-index' };
    return { ok: true, kind, position: 0, replace: options.existing.some((row) => row.kind === kind) };
  }

  const ofKind = options.existing.filter((row) => row.kind === kind);
  const cap = capFor(options.parent, kind);
  if (options.position === undefined) {
    if (ofKind.length >= cap) return { ok: false, reason: 'at-capacity' };
    return { ok: true, kind, position: nextPosition(kind, ofKind.map((row) => row.position)), replace: false };
  }

  if (!Number.isInteger(options.position) || options.position < 0 || options.position >= cap) {
    return { ok: false, reason: 'at-capacity' };
  }
  const occupied = ofKind.find((row) => row.position === options.position);
  if (occupied) return { ok: true, kind, position: options.position, replace: true };
  if (ofKind.length >= cap) return { ok: false, reason: 'at-capacity' };
  return { ok: true, kind, position: options.position, replace: false };
}

/**
 * Writes are inventory. The API lets a draft owner hang photos before going
 * live, and forbids a suspended business. That is not `sessionCan('PUBLISH')`:
 * a DRAFT seller's effective capabilities are only SCHEDULE, and using those
 * would hide the picker from the person who has to fill it in.
 */
export function vendorCanEditMedia(session: VendorSession): boolean {
  if (session.seller.state === 'SUSPENDED' || session.seller.state === 'CLOSED') return false;
  return getBookableStaffRole(session.seat.role)?.capabilities.includes('PUBLISH') ?? false;
}

export function maxBytesFor(kind: MediaKind, mimeType: string): number {
  if (kind === 'video') return MEDIA_MAX_VIDEO_BYTES;
  if (kind === 'menu' && mimeType === 'application/pdf') return MEDIA_MAX_MENU_BYTES;
  return MEDIA_MAX_IMAGE_BYTES;
}

export function allowedMimeFor(kind: MediaKind): readonly string[] {
  if (kind === 'video') return MEDIA_VIDEO_MIME;
  return kind === 'menu' ? MEDIA_MENU_MIME : MEDIA_IMAGE_MIME;
}

export function acceptFor(kind: MediaKind): string {
  return allowedMimeFor(kind).join(',');
}

export type EncodedFile =
  | { ok: true; dataUri: string; mimeType: string }
  | { ok: false; reason: Extract<MediaRefusal, 'bad-payload' | 'too-large' | 'video-unavailable'> };

/**
 * Turns a file the vendor picked into the data URI the API accepts.
 *
 * Size is checked on the bytes, then again on the encoded string, because the
 * JSON body has a tighter ceiling than the decoded-file cap for PDFs.
 */
export type PickedVideo =
  | { ok: true; mimeType: string; byteSize: number }
  | { ok: false; reason: Extract<MediaRefusal, 'bad-payload' | 'too-large' | 'video-unavailable'> };

/** Video never becomes a data URI. The file goes to the presigned PUT. */
export function planPickedVideo(file: File, storeConfigured: boolean): PickedVideo {
  if (!storeConfigured) return { ok: false, reason: 'video-unavailable' };
  if (!(MEDIA_VIDEO_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'bad-payload' };
  }
  if (file.size <= 0 || file.size > MEDIA_MAX_VIDEO_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  return { ok: true, mimeType: file.type, byteSize: file.size };
}

export function encodePickedFile(kind: MediaKind, file: File, dataUri: string): EncodedFile {
  if (kind === 'video' || file.type.startsWith('video/')) {
    return { ok: false, reason: 'video-unavailable' };
  }
  const mimeType = file.type;
  if (!(allowedMimeFor(kind) as readonly string[]).includes(mimeType)) {
    return { ok: false, reason: 'bad-payload' };
  }
  if (file.size <= 0 || file.size > maxBytesFor(kind, mimeType)) {
    return { ok: false, reason: 'too-large' };
  }
  if (!dataUri.startsWith(`data:${mimeType};base64,`) || dataUri.length > MEDIA_MAX_DATA_URI_CHARS) {
    return { ok: false, reason: dataUri.length > MEDIA_MAX_DATA_URI_CHARS ? 'too-large' : 'bad-payload' };
  }
  return { ok: true, dataUri, mimeType };
}

export function mediaPath(parent: MediaParent, parentId: string): string {
  const root = parent === 'location' ? 'locations' : 'bookables';
  return `/vendor/${root}/${encodeURIComponent(parentId)}/media`;
}

export function mediaItemPath(parent: MediaParent, parentId: string, mediaId: string): string {
  return `${mediaPath(parent, parentId)}/${encodeURIComponent(mediaId)}`;
}

export function mediaUploadPath(parent: MediaParent, parentId: string, mediaId?: string): string {
  const root = `${mediaPath(parent, parentId)}/uploads`;
  return mediaId ? `${root}/${encodeURIComponent(mediaId)}` : root;
}

export function kindLabel(kind: MediaKind): string {
  if (kind === 'cover') return 'Cover';
  if (kind === 'gallery') return 'Photos';
  if (kind === 'menu') return 'Menu';
  return 'Video';
}
