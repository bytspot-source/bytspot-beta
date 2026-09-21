import {
  isMediaKind,
  mediaItemPath,
  mediaPath,
  mediaUploadPath,
  type MediaKind,
  type MediaParent,
  type VendorMediaItem,
} from './media.ts';
import type { AuthorizedFetch, SetupResult } from './setupTransport.ts';

export interface MediaList {
  media: VendorMediaItem[];
  videoAvailable: boolean;
}

export interface VideoUploadIntent {
  mediaId: string;
  mimeType: string;
  byteSize: number;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface MediaTransport {
  list: (parent: MediaParent, parentId: string) => Promise<SetupResult<MediaList>>;
  upload: (
    parent: MediaParent,
    parentId: string,
    kind: MediaKind,
    dataUri: string,
  ) => Promise<SetupResult<VendorMediaItem>>;
  startVideo: (
    parent: MediaParent,
    parentId: string,
    mimeType: string,
    byteSize: number,
  ) => Promise<SetupResult<VideoUploadIntent>>;
  completeVideo: (
    parent: MediaParent,
    parentId: string,
    mediaId: string,
    mimeType: string,
    byteSize: number,
  ) => Promise<SetupResult<VendorMediaItem>>;
  putVideo: (intent: VideoUploadIntent, file: File) => Promise<SetupResult<void>>;
  remove: (parent: MediaParent, parentId: string, mediaId: string) => Promise<SetupResult<MediaList>>;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function blockersFrom(json: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(json.blockers)) return undefined;
  return json.blockers.filter((item): item is string => typeof item === 'string');
}

function reviveItem(raw: unknown): VendorMediaItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== 'string' || typeof entry.url !== 'string') return undefined;
  if (typeof entry.kind !== 'string' || !isMediaKind(entry.kind)) return undefined;
  if (typeof entry.mimeType !== 'string') return undefined;
  return {
    id: entry.id,
    kind: entry.kind,
    position: Number(entry.position),
    mimeType: entry.mimeType,
    byteSize: Number(entry.byteSize),
    url: entry.url,
  };
}

export function reviveMediaList(json: Record<string, unknown>): MediaList {
  const rows = Array.isArray(json.media) ? json.media : [];
  return {
    // An entry we cannot read is dropped rather than coerced. A cover whose
    // url did not parse would render a broken image that looks like a working
    // one, so it is not shown.
    media: rows.map(reviveItem).filter((item): item is VendorMediaItem => item !== undefined),
    videoAvailable: json.videoAvailable === true,
  };
}

export function reviveVideoIntent(json: Record<string, unknown>): VideoUploadIntent | undefined {
  const raw = json.upload;
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.mediaId !== 'string' || typeof entry.url !== 'string') return undefined;
  if (typeof entry.mimeType !== 'string' || typeof entry.expiresAt !== 'string') return undefined;
  if (entry.method !== 'PUT') return undefined;
  const headers =
    entry.headers && typeof entry.headers === 'object' && !Array.isArray(entry.headers)
      ? Object.fromEntries(
          Object.entries(entry.headers as Record<string, unknown>).filter(
            (pair): pair is [string, string] => typeof pair[1] === 'string',
          ),
        )
      : {};
  return {
    mediaId: entry.mediaId,
    mimeType: entry.mimeType,
    byteSize: Number(entry.byteSize),
    url: entry.url,
    method: 'PUT',
    headers,
    expiresAt: entry.expiresAt,
  };
}

export function httpMediaTransport(authorized: AuthorizedFetch): MediaTransport {
  const send = async <T,>(
    path: string,
    init: RequestInit,
    map: (json: Record<string, unknown>) => T,
  ): Promise<SetupResult<T>> => {
    const response = await authorized(path, init);
    const json = await readJson(response);
    if (!response.ok) return { status: response.status, blockers: blockersFrom(json) };
    return { status: response.status, value: map(json) };
  };

  return {
    list: (parent, parentId) => send(mediaPath(parent, parentId), { method: 'GET' }, reviveMediaList),
    upload: (parent, parentId, kind, dataUri) =>
      send(
        mediaPath(parent, parentId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, dataUri }),
        },
        (json) => {
          const item = reviveItem(json.media);
          if (!item) {
            throw new Error('media response missing item');
          }
          return item;
        },
      ).catch(() => ({ status: 500, blockers: ['Could not save that file. Try again.'] })),
    startVideo: (parent, parentId, mimeType, byteSize) =>
      send(
        mediaUploadPath(parent, parentId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType, byteSize }),
        },
        (json) => {
          const intent = reviveVideoIntent(json);
          if (!intent) throw new Error('media response missing upload');
          return intent;
        },
      ).catch(() => ({ status: 500, blockers: ['Could not start that clip. Try again.'] })),
    completeVideo: (parent, parentId, mediaId, mimeType, byteSize) =>
      send(
        mediaUploadPath(parent, parentId, mediaId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType, byteSize }),
        },
        (json) => {
          const item = reviveItem(json.media);
          if (!item) throw new Error('media response missing item');
          return item;
        },
      ).catch(() => ({ status: 500, blockers: ['Could not save that clip. Try again.'] })),
    putVideo: async (intent, file) => {
      try {
        const response = await fetch(intent.url, {
          method: intent.method,
          headers: intent.headers,
          body: file,
        });
        if (!response.ok) return { status: response.status, blockers: ['Could not send that clip. Try again.'] };
        return { status: response.status, value: undefined };
      } catch {
        return { status: 500, blockers: ['Could not send that clip. Try again.'] };
      }
    },
    remove: (parent, parentId, mediaId) =>
      send(mediaItemPath(parent, parentId, mediaId), { method: 'DELETE' }, reviveMediaList),
  };
}

/**
 * In-memory store for the demo build. Object URLs stand in for `/media/vendor/:id`
 * so a photo the vendor just picked is visible without a server.
 */
export function demoMediaTransport(): MediaTransport {
  const byParent = new Map<string, VendorMediaItem[]>();
  const pending = new Map<string, { mimeType: string; byteSize: number; bytes?: ArrayBuffer }>();
  let issued = 0;

  const keyFor = (parent: MediaParent, parentId: string) => `${parent}:${parentId}`;
  const rows = (parent: MediaParent, parentId: string) => byParent.get(keyFor(parent, parentId)) ?? [];

  return {
    list: async (parent, parentId) => ({
      status: 200,
      value: { media: [...rows(parent, parentId)], videoAvailable: true },
    }),
    upload: async (parent, parentId, kind, dataUri) => {
      const list = [...rows(parent, parentId)];
      const ofKind = list.filter((item) => item.kind === kind);
      const id = `media_demo_${(issued += 1)}`;
      const mimeType = dataUri.startsWith('data:') ? dataUri.slice(5, dataUri.indexOf(';')) : 'image/jpeg';
      const next: VendorMediaItem = {
        id,
        kind,
        position: kind === 'cover' ? 0 : ofKind.length,
        mimeType,
        byteSize: Math.max(0, Math.floor((dataUri.length * 3) / 4)),
        url: dataUri,
      };
      const replaced = kind === 'cover' ? list.filter((item) => item.kind !== 'cover') : list;
      byParent.set(keyFor(parent, parentId), [...replaced, next]);
      return { status: kind === 'cover' && ofKind.length ? 200 : 201, value: next };
    },
    startVideo: async (_parent, _parentId, mimeType, byteSize) => {
      const mediaId = `media_demo_${(issued += 1)}`;
      pending.set(mediaId, { mimeType, byteSize });
      return {
        status: 201,
        value: {
          mediaId,
          mimeType,
          byteSize,
          url: `memory://video/${mediaId}`,
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        },
      };
    },
    putVideo: async (intent, file) => {
      const hold = pending.get(intent.mediaId);
      if (!hold) return { status: 409, blockers: ['That clip never arrived. Try again.'] };
      hold.bytes = await file.arrayBuffer();
      pending.set(intent.mediaId, hold);
      return { status: 200, value: undefined };
    },
    completeVideo: async (parent, parentId, mediaId, mimeType, byteSize) => {
      const hold = pending.get(mediaId);
      if (!hold?.bytes) return { status: 409, blockers: ['That clip never arrived. Try again.'] };
      pending.delete(mediaId);
      const list = [...rows(parent, parentId)];
      const next: VendorMediaItem = {
        id: mediaId,
        kind: 'video',
        position: 0,
        mimeType,
        byteSize,
        url: URL.createObjectURL(new Blob([hold.bytes], { type: mimeType })),
      };
      byParent.set(
        keyFor(parent, parentId),
        [...list.filter((item) => item.kind !== 'video'), next],
      );
      return { status: list.some((item) => item.kind === 'video') ? 200 : 201, value: next };
    },
    remove: async (parent, parentId, mediaId) => {
      const remaining = rows(parent, parentId).filter((item) => item.id !== mediaId);
      byParent.set(keyFor(parent, parentId), remaining);
      return { status: 200, value: { media: remaining, videoAvailable: true } };
    },
  };
}
