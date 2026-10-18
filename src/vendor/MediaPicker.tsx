import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  acceptFor,
  encodePickedFile,
  kindLabel,
  kindsFor,
  MEDIA_REFUSALS,
  planPickedVideo,
  planUpload,
  reviewLabel,
  vendorCanEditMedia,
  VIDEO_HOSTING_NOTE,
  type MediaKind,
  type MediaParent,
  type VendorMediaItem,
} from './media.ts';
import type { MediaTransport } from './mediaTransport.ts';
import type { AuthorizedFetch } from './setupTransport.ts';
import { canSeeBookable, canSeeLocation, type VendorSession } from './seller.ts';
import { MenuDishEditor, MenuSourcePreview } from './MenuDishEditor.tsx';
import { canManageMenuDishes } from './menuDishes.ts';

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
export function MediaPicker(props: MediaPickerProps) {
  const { session, parent, parentId } = props;
  const inScope = parent === 'location' ? canSeeLocation(session, parentId) : canSeeBookable(session, parentId);
  if (!inScope) return null;
  // Account/place/authority changes destroy old forms and pending preview work.
  const scopeKey = JSON.stringify([session.seller.id, session.seller.state, session.seat.id, session.seat.personId,
    session.seat.role, session.seat.state, session.seat.sellerId, session.scope, [...session.capabilities].sort(),
    session.seat.locationIds, session.seat.bookableIds, parent, parentId]);
  return <ScopedMediaPicker key={scopeKey} {...props} />;
}

function ScopedMediaPicker({ session, transport, parent, parentId, authorizedFetch }: MediaPickerProps) {
  const [items, setItems] = useState<VendorMediaItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingKind, setPendingKind] = useState<MediaKind | undefined>(undefined);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const lifecycle = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const previewUrls = useRef<Record<string, string>>({});
  const canEdit = session.seat.state === 'ACTIVE' && session.seat.sellerId === session.seller.id && vendorCanEditMedia(session);
  const canManageDishes = parent === 'location' && canManageMenuDishes(session, parentId);
  const kinds = useMemo(() => kindsFor(parent, videoAvailable), [parent, videoAvailable]);

  const revoke = useCallback((urls: Record<string, string>) => {
    for (const url of Object.values(urls)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }, []);

  const previewFor = useCallback(
    async (item: VendorMediaItem, signal?: AbortSignal): Promise<string> => {
      // Menus are inspected on demand through MenuSourcePreview, never raw provider URLs.
      if (item.kind === 'menu') return '';
      if (item.url.startsWith('data:') || item.url.startsWith('blob:') || item.url.startsWith('memory:')) return item.url;
      if (!authorizedFetch) return item.url;
      try {
        const path = item.url.startsWith('http') ? new URL(item.url).pathname : item.url;
        const response = await authorizedFetch(path, { signal });
        if (!response.ok) return item.url;
        const blob = await response.blob();
        if (signal?.aborted) return '';
        return URL.createObjectURL(blob);
      } catch {
        return item.url;
      }
    },
    [authorizedFetch],
  );

  const show = useCallback(
    async (next: VendorMediaItem[], expectedGeneration = generation.current) => {
      const urls: Record<string, string> = {};
      for (const item of next) {
        if (expectedGeneration !== generation.current) { revoke(urls); return; }
        urls[item.id] = await previewFor(item, lifecycle.current?.signal);
      }
      if (expectedGeneration !== generation.current) { revoke(urls); return; }
      revoke(previewUrls.current);
      previewUrls.current = urls;
      setPreviews(urls);
      setItems(next);
      setLoaded(true);
      setMediaRevision((value) => value + 1);
    },
    [previewFor, revoke],
  );

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoaded(false);
    try {
      const result = await transport.list(parent, parentId);
      if (current !== generation.current) return;
      if (result.value) {
        setBlockers([]);
        setVideoAvailable(result.value.videoAvailable);
        await show(result.value.media, current);
        return;
      }
      setBlockers(result.blockers ?? ['Could not load photos. Try again.']);
    } catch { if (current === generation.current) setBlockers(['Could not load photos. Try again.']); }
  }, [parent, parentId, show, transport]);

  useEffect(() => {
    generation.current += 1;
    const active = new AbortController(); lifecycle.current = active;
    locked.current = false; setBusy(false); setLoaded(false); setPendingKind(undefined);
    setItems([]); setPreviews({});
    void reload();
    return () => {
      active.abort();
      generation.current += 1;
      revoke(previewUrls.current);
      previewUrls.current = {};
    };
  }, [reload, revoke]);

  const pick = (kind: MediaKind) => {
    if (!canEdit || busy || !loaded || locked.current) return;
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
    const active = lifecycle.current;
    if (!file || !kind || !canEdit || busy || !loaded || locked.current || !active || active.signal.aborted) return;
    const stillActive = () => !active.signal.aborted;

    const plan = planUpload({ parent, kind, existing: items, storeConfigured: videoAvailable });
    if (plan.ok === false) {
      setBlockers([MEDIA_REFUSALS[plan.reason]]);
      return;
    }

    locked.current = true; setBusy(true); setMediaRevision((value) => value + 1);
    try {
      if (kind === 'video') {
        const picked = planPickedVideo(file, videoAvailable);
        if (picked.ok === false) {
          setBlockers([MEDIA_REFUSALS[picked.reason]]);
          return;
        }
        const started = await transport.startVideo(parent, parentId, picked.mimeType, picked.byteSize);
        if (!stillActive()) return;
        if (!started.value) {
          setBlockers(started.blockers ?? ['Could not start that clip. Try again.']);
          return;
        }
        const sent = await transport.putVideo(started.value, file);
        if (!stillActive()) return;
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
        if (!stillActive()) return;
        if (finished.value) {
          setBlockers([]);
          await reload();
        } else {
          setBlockers(finished.blockers ?? ['Could not save that clip. Try again.']);
        }
        return;
      }

      const encoded = encodePickedFile(kind, file, await readAsDataUri(file));
      if (!stillActive()) return;
      if (encoded.ok === false) {
        setBlockers([MEDIA_REFUSALS[encoded.reason]]);
        return;
      }
      const result = await transport.upload(parent, parentId, kind, encoded.dataUri);
      if (!stillActive()) return;
      if (result.value) {
        setBlockers([]);
        await reload();
      } else {
        setLoaded(false); setBlockers(result.blockers ?? ['Could not save that file. Reload before trying again.']);
      }
    } catch {
      if (stillActive()) { setLoaded(false); setBlockers(['Could not save that file. Reload before trying again.']); }
    } finally {
      if (stillActive()) { locked.current = false; setBusy(false); }
    }
  };

  const remove = async (item: VendorMediaItem) => {
    const active = lifecycle.current;
    if (!canEdit || busy || !loaded || locked.current || !active || active.signal.aborted) return;
    const current = ++generation.current;
    locked.current = true; setBusy(true); setMediaRevision((value) => value + 1);
    try {
      const result = await transport.remove(parent, parentId, item.id);
      if (active.signal.aborted || current !== generation.current) return;
      if (result.value) {
        setBlockers([]);
        setVideoAvailable(result.value.videoAvailable);
        await show(result.value.media, current);
      } else {
        setLoaded(false); setBlockers(result.blockers ?? ['Could not remove that. Reload before trying again.']);
      }
    } catch {
      if (!active.signal.aborted) { setLoaded(false); setBlockers(['Could not remove that. Reload before trying again.']); }
    } finally {
      if (!active.signal.aborted) { locked.current = false; setBusy(false); }
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
                  disabled={busy || !loaded}
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
                    {item.kind === 'menu' ? (
                      authorizedFetch && loaded && !busy
                        ? <MenuSourcePreview key={`${item.id}:${mediaRevision}`} authorizedFetch={authorizedFetch} sourceUrl={item.url} mediaId={item.id} />
                        : <p className="vendor-muted">Menu preview unavailable{!authorizedFetch ? ' without an authenticated connection' : ' while media is being refreshed'}.</p>
                    ) : item.mimeType === 'application/pdf' ? (
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
                    {reviewLabel(item) ? <p className="vendor-muted">{reviewLabel(item)}</p> : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="vendor-chip"
                        disabled={busy || !loaded}
                        onClick={() => void remove(item)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {kind === 'menu' && parent === 'location' && (
              !canManageDishes ? <p className="vendor-muted">Menu evidence requires an active seat with Publish permission for this place.</p>
                : !authorizedFetch ? <p className="vendor-muted">Optional menu evidence is unavailable without an authenticated connection. No sample dishes are shown.</p>
                  : loaded && !busy ? <MenuDishEditor key={mediaRevision} authorizedFetch={authorizedFetch} locationId={parentId} media={items} mediaBusy={busy} />
                    : <p className="vendor-muted">Menu evidence is unavailable until current media has loaded.</p>
            )}
          </section>
        );
      })}

      <button type="button" className="vendor-chip" disabled={busy} onClick={() => void reload()}>Reload media</button>
      {!videoAvailable ? <p className="vendor-muted">{VIDEO_HOSTING_NOTE}</p> : null}
      <p className="vendor-muted">Bytspot reviews every new photo, menu and video before guests see it.</p>

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
