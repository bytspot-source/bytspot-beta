import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  acceptFor,
  encodePickedFile,
  kindLabel,
  kindsFor,
  MEDIA_REFUSALS,
  planPickedVideo,
  planUpload,
  vendorCanEditMedia,
  type MediaKind,
  type MediaParent,
  type VendorMediaItem,
} from './media.ts';
import type { MediaTransport } from './mediaTransport.ts';
import type { AuthorizedFetch } from './setupTransport.ts';
import type { VendorSession } from './seller.ts';

export interface MediaPickerProps {
  session: VendorSession;
  transport: MediaTransport;
  parent: MediaParent;
  parentId: string;
  /** Used to fetch unpublished bytes; an <img src> would 404 a draft cover. */
  authorizedFetch?: AuthorizedFetch;
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function isVideoItem(item: VendorMediaItem): boolean {
  return item.kind === 'video' || item.mimeType.startsWith('video/');
}

/**
 * Photos, menus, a cover, and one clip on a place.
 *
 * Video is offered only when the list says the object store is up. The file
 * never rides JSON: the picker PUTs to a presigned URL, then asks the API to
 * attach the object.
 */
export function MediaPicker({ session, transport, parent, parentId, authorizedFetch }: MediaPickerProps) {
  const [items, setItems] = useState<VendorMediaItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingKind, setPendingKind] = useState<MediaKind | undefined>(undefined);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const canEdit = vendorCanEditMedia(session);
  const kinds = useMemo(() => kindsFor(parent, videoAvailable), [parent, videoAvailable]);

  const revoke = useCallback((urls: Record<string, string>) => {
    for (const url of Object.values(urls)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }, []);

  const previewFor = useCallback(
    async (item: VendorMediaItem): Promise<string> => {
      if (item.url.startsWith('data:') || item.url.startsWith('blob:') || item.url.startsWith('memory:')) return item.url;
      if (!authorizedFetch) return item.url;
      try {
        const path = item.url.startsWith('http') ? new URL(item.url).pathname : item.url;
        const response = await authorizedFetch(path);
        if (!response.ok) return item.url;
        return URL.createObjectURL(await response.blob());
      } catch {
        return item.url;
      }
    },
    [authorizedFetch],
  );

  const show = useCallback(
    async (next: VendorMediaItem[]) => {
      const urls: Record<string, string> = {};
      for (const item of next) {
        urls[item.id] = await previewFor(item);
      }
      setPreviews((current) => {
        revoke(current);
        return urls;
      });
      setItems(next);
    },
    [previewFor, revoke],
  );

  const reload = useCallback(async () => {
    const result = await transport.list(parent, parentId);
    if (result.value) {
      setBlockers([]);
      setVideoAvailable(result.value.videoAvailable);
      await show(result.value.media);
      return;
    }
    setBlockers(result.blockers ?? ['Could not load photos. Try again.']);
  }, [parent, parentId, show, transport]);

  useEffect(() => {
    void reload();
    return () => {
      setPreviews((current) => {
        revoke(current);
        return {};
      });
    };
  }, [reload, revoke]);

  const pick = (kind: MediaKind) => {
    setPendingKind(kind);
    setBlockers([]);
    const input = fileInput.current;
    if (!input) return;
    input.accept = acceptFor(kind);
    input.click();
  };

  const onFile = async (file: File | undefined) => {
    const kind = pendingKind;
    setPendingKind(undefined);
    if (fileInput.current) fileInput.current.value = '';
    if (!file || !kind) return;

    const plan = planUpload({ parent, kind, existing: items, storeConfigured: videoAvailable });
    if (plan.ok === false) {
      setBlockers([MEDIA_REFUSALS[plan.reason]]);
      return;
    }

    setBusy(true);
    try {
      if (kind === 'video') {
        const picked = planPickedVideo(file, videoAvailable);
        if (picked.ok === false) {
          setBlockers([MEDIA_REFUSALS[picked.reason]]);
          return;
        }
        const started = await transport.startVideo(parent, parentId, picked.mimeType, picked.byteSize);
        if (!started.value) {
          setBlockers(started.blockers ?? ['Could not start that clip. Try again.']);
          return;
        }
        const sent = await transport.putVideo(started.value, file);
        if (sent.status >= 400) {
          setBlockers(sent.blockers ?? ['Could not send that clip. Try again.']);
          return;
        }
        const finished = await transport.completeVideo(
          parent,
          parentId,
          started.value.mediaId,
          picked.mimeType,
          picked.byteSize,
        );
        if (finished.value) {
          setBlockers([]);
          await reload();
        } else {
          setBlockers(finished.blockers ?? ['Could not save that clip. Try again.']);
        }
        return;
      }

      const encoded = encodePickedFile(kind, file, await readAsDataUri(file));
      if (encoded.ok === false) {
        setBlockers([MEDIA_REFUSALS[encoded.reason]]);
        return;
      }
      const result = await transport.upload(parent, parentId, kind, encoded.dataUri);
      if (result.value) {
        setBlockers([]);
        await reload();
      } else {
        setBlockers(result.blockers ?? ['Could not save that file. Try again.']);
      }
    } catch {
      setBlockers(['Could not read that file. Try another.']);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: VendorMediaItem) => {
    setBusy(true);
    try {
      const result = await transport.remove(parent, parentId, item.id);
      if (result.value) {
        setBlockers([]);
        setVideoAvailable(result.value.videoAvailable);
        await show(result.value.media);
      } else {
        setBlockers(result.blockers ?? ['Could not remove that. Try again.']);
      }
    } finally {
      setBusy(false);
    }
  };

  const byKind = (kind: MediaKind) => items.filter((item) => item.kind === kind);

  return (
    <div className="vendor-media">
      <input
        ref={fileInput}
        id={inputId}
        type="file"
        hidden
        onChange={(event) => void onFile(event.target.files?.[0])}
      />

      {kinds.map((kind) => {
        const held = byKind(kind);
        const plan = planUpload({ parent, kind, existing: items, storeConfigured: videoAvailable });
        const canAdd =
          canEdit && (plan.ok || ((kind === 'cover' || kind === 'video') && held.length > 0));

        return (
          <section key={kind} className="vendor-media-kind">
            <div className="vendor-card-top">
              <h3 className="vendor-media-label">{kindLabel(kind)}</h3>
              {canAdd ? (
                <button
                  type="button"
                  className="vendor-chip"
                  disabled={busy}
                  onClick={() => pick(kind)}
                >
                  {(kind === 'cover' || kind === 'video') && held.length > 0 ? 'Replace' : 'Add'}
                </button>
              ) : null}
            </div>

            {held.length === 0 ? (
              <p className="vendor-muted">
                {kind === 'cover'
                  ? 'Guests see this first.'
                  : kind === 'menu'
                    ? 'A photo or a PDF of what you serve.'
                    : kind === 'video'
                      ? 'One clip of this place. MP4, WebM, or MOV, under 80 MB.'
                      : 'More photos of this place.'}
              </p>
            ) : (
              <ul className="vendor-media-row">
                {held.map((item) => (
                  <li key={item.id} className="vendor-media-item">
                    {item.mimeType === 'application/pdf' ? (
                      <a className="vendor-media-file" href={previews[item.id] ?? item.url} target="_blank" rel="noreferrer">
                        Menu PDF
                      </a>
                    ) : isVideoItem(item) ? (
                      <video className="vendor-media-thumb" src={previews[item.id] ?? item.url} controls playsInline />
                    ) : (
                      <img
                        className="vendor-media-thumb"
                        src={previews[item.id] ?? item.url}
                        alt=""
                      />
                    )}
                    {canEdit ? (
                      <button
                        type="button"
                        className="vendor-chip"
                        disabled={busy}
                        onClick={() => void remove(item)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {blockers.length > 0 ? (
        <ul className="vendor-reasons">
          {blockers.map((blocker) => (
            <li key={blocker} className="vendor-reason-fixable">
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
