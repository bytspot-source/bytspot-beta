import { useCallback, useEffect, useRef, useState } from 'react';
import type { VendorMediaItem } from './media.ts';
import type { AuthorizedFetch } from './setupTransport.ts';
import {
  fetchMenuSource, MENU_ALIAS_NOTICE, MENU_REVIEW_NOTICE, menuDishesTransport, menuErrorText,
  menuReviewLabel, submissionProblem, type MenuDish, type MenuDishList,
} from './menuDishes.ts';

/** Private menus use authenticated bytes, never a raw URL or an unauthenticated fallback. */
interface MenuSourcePreviewProps {
  authorizedFetch: AuthorizedFetch; sourceUrl: string; mediaId: string; sourceVersion?: string;
  onReadyChange?: (ready: boolean) => void;
}
export function MenuSourcePreview(props: MenuSourcePreviewProps) {
  return <ScopedMenuSourcePreview key={JSON.stringify([props.sourceUrl, props.mediaId, props.sourceVersion])} {...props} />;
}
function ScopedMenuSourcePreview({ authorizedFetch, sourceUrl, mediaId, onReadyChange }: MenuSourcePreviewProps) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    onReadyChange?.(false);
    setError(false); setPreview(null);
    if (!attempt) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetchMenuSource(authorizedFetch, sourceUrl, mediaId, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, pdf: blob.type === 'application/pdf' });
      onReadyChange?.(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attempt, authorizedFetch, sourceUrl, mediaId, onReadyChange]);
  return <div>
    <button type="button" onClick={() => {
      onReadyChange?.(false); setPreview(null); setError(false); setAttempt((v) => v + 1);
    }} disabled={attempt > 0 && !preview && !error}>
      {error ? 'Retry menu preview' : preview ? 'Reload menu preview' : attempt ? 'Loading menu…' : 'Inspect source menu'}
    </button>
    {error && <p role="alert">Could not preview this menu. Try again.</p>}
    {preview && (preview.pdf
      ? <a href={preview.url} target="_blank" rel="noopener noreferrer">Open source menu PDF</a>
      : <a href={preview.url} target="_blank" rel="noopener noreferrer"><img src={preview.url} onError={() => { setError(true); setPreview(null); onReadyChange?.(false); }} alt="Source menu; open full size to inspect dish names" style={{ maxWidth: '100%', maxHeight: 420 }} /></a>)}
  </div>;
}

export function MenuDishEditor({ authorizedFetch, locationId, media, mediaBusy }: {
  authorizedFetch: AuthorizedFetch; locationId: string; media: VendorMediaItem[]; mediaBusy: boolean;
}) {
  const [list, setList] = useState<MenuDishList | null>(null);
  const [editing, setEditing] = useState<MenuDish | null>(null);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [mediaId, setMediaId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mustReload, setMustReload] = useState(false);
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const menus = media.filter((item) => item.kind === 'menu');
  const menuRevision = JSON.stringify(menus.map((item) => [item.id, item.reviewStatus, item.url]));
  const clearForm = useCallback(() => { setEditing(null); setName(''); setAliases([]); setMediaId(''); }, []);
  useEffect(() => {
    const active = new AbortController(); controller.current = active;
    locked.current = true;
    setBusy(true); setList(null); setError(''); setMustReload(true); clearForm();
    void Promise.resolve().then(() => menuDishesTransport(authorizedFetch, locationId).list(active.signal)).then((next) => {
      if (!active.signal.aborted) { setList(next); setMustReload(false); }
    }).catch((e: unknown) => { if (!active.signal.aborted) setError(menuErrorText(e)); })
      .finally(() => { if (!active.signal.aborted) { locked.current = false; setBusy(false); } });
    return () => active.abort();
  }, [authorizedFetch, locationId, revision, menuRevision, clearForm]);

  const run = async (withdraw?: MenuDish) => {
    const active = controller.current;
    if (!active || active.signal.aborted || locked.current || busy || mediaBusy || mustReload || !list) return;
    const transport = menuDishesTransport(authorizedFetch, locationId);
    const input = { mediaId, dishName: name, aliases,
      ...(editing ? { dishId: editing.id, expectedUpdatedAt: editing.updatedAt } : {}) };
    if (!withdraw) {
      const problem = submissionProblem(input);
      if (problem || !menus.some((m) => m.id === mediaId)) { setError(problem ?? 'Choose a current menu file.'); return; }
    } else if (!window.confirm(`Withdraw “${withdraw.dishName}” from menu evidence?`)) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const next = withdraw ? await transport.withdraw(withdraw.id, withdraw.updatedAt, active.signal) : await transport.save(input, active.signal);
      if (!active.signal.aborted) { setList(next); clearForm(); }
    } catch (e) {
      if (!active.signal.aborted) { setError(menuErrorText(e)); setMustReload(true); }
    } finally { if (!active.signal.aborted) { locked.current = false; setBusy(false); } }
  };
  const disabled = busy || mediaBusy || mustReload || !list;
  const source = menus.find((m) => m.id === mediaId);
  return <section className="vendor-media-kind" aria-label="Menu dish evidence" aria-busy={busy}>
    <h3>Menu dishes</h3>
    <p className="vendor-muted">{MENU_REVIEW_NOTICE}</p>
    <p className="vendor-muted">{MENU_ALIAS_NOTICE}</p>
    <p>Editing a dish or its aliases resets approval and requires a new review.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="vendor-chip" disabled={busy || mediaBusy} onClick={() => setRevision((v) => v + 1)}>Reload menu dishes</button>
    {busy && <p role="status">Loading or saving menu dishes…</p>}
    {list && <>
      <p>{list.venueId ? `Venue binding: ${list.venueId}` : 'Needs admin venue binding before any dish can be approved.'}</p>
      {!menus.some((m) => m.reviewStatus === 'approved') && <p>No approved menu yet. Upload a menu above and wait for separate source-media approval. You can submit dishes for review now.</p>}
      {!list.dishes.length && <p>No menu dishes submitted yet.</p>}
      <ul className="vendor-demand-list">{list.dishes.map((dish) => <li key={dish.id}>
        <strong>{dish.dishName}</strong>
        <p>Aliases: {dish.aliases.join(', ') || 'None'}</p>
        <p>Dish review: {menuReviewLabel(dish)} · Source menu: {dish.mediaReviewStatus}</p>
        {dish.reviewNote && <p>Review note: {dish.reviewNote}</p>}
        {dish.reviewedAt && <p>Review expires: {new Date(Date.parse(dish.reviewedAt) + 30 * 86400000).toLocaleString()}</p>}
        <MenuSourcePreview key={`${dish.mediaId}:${dish.mediaUpdatedAt}`} authorizedFetch={authorizedFetch} sourceUrl={dish.sourceUrl} mediaId={dish.mediaId} />
        <button type="button" className="vendor-chip" disabled={disabled} onClick={() => {
          setEditing(dish); setName(dish.dishName); setAliases([...dish.aliases]); setMediaId(dish.mediaId); setError('');
        }}>Edit {dish.dishName}</button>
        <button type="button" className="vendor-chip" disabled={disabled} onClick={() => void run(dish)}>Withdraw {dish.dishName}</button>
      </li>)}</ul>
      <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <fieldset disabled={disabled}>
          <legend>{editing ? `Edit ${editing.dishName}` : 'Submit a menu dish'}</legend>
          <label className="vendor-field">Source menu
            <select required value={mediaId} onChange={(e) => setMediaId(e.target.value)}>
              <option value="">Choose an uploaded menu</option>
              {menus.map((m, i) => <option key={m.id} value={m.id}>Menu {i + 1} · {m.mimeType === 'application/pdf' ? 'PDF' : 'Image'} · {m.reviewStatus ?? 'pending'}</option>)}
            </select>
          </label>
          {source && <MenuSourcePreview key={source.id} authorizedFetch={authorizedFetch} sourceUrl={source.url} mediaId={source.id} />}
          <label className="vendor-field">Dish name (1–120 characters)<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
          {aliases.map((alias, i) => <div key={i}>
            <label className="vendor-field">Alias {i + 1}<input required maxLength={120} value={alias} onChange={(e) => setAliases((rows) => rows.map((a, n) => n === i ? e.target.value : a))} /></label>
            <button type="button" onClick={() => setAliases((rows) => rows.filter((_, n) => n !== i))}>Remove alias {i + 1}</button>
          </div>)}
          <button type="button" disabled={aliases.length >= 5} onClick={() => setAliases((rows) => [...rows, ''])}>Add alias (up to 5)</button>
          <button type="submit" disabled={!menus.length || (!editing && list.dishes.length >= 100)}>{editing ? 'Save and request new review' : 'Submit for review'}</button>
          {editing && <button type="button" onClick={clearForm}>Cancel edit</button>}
        </fieldset>
      </form>
      <p className="vendor-muted">Up to 100 dishes per place.</p>
    </>}
  </section>;
}
