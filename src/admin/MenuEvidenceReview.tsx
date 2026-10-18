import { useCallback, useEffect, useRef, useState } from 'react';
import { MenuSourcePreview } from '../vendor/MenuDishEditor.tsx';
import {
  MENU_ALIAS_NOTICE, MENU_REVIEW_NOTICE, menuErrorText, menuReviewInput, parseMenuQueue, parseMenuVenues,
  assertMenuBindingReply, assertMenuReviewReply, canApproveMenuDish, menuReviewLabel, menuVenueBindingInput,
  type MenuQueueDish, type MenuReviewStatus, type MenuVenue,
} from '../vendor/menuDishes.ts';
import type { AuthorizedFetch } from '../vendor/setupTransport.ts';

type ReviewInput = ReturnType<typeof menuReviewInput>;
interface MenuAdminApi {
  menuQueue: { query: (input: { reviewStatus: MenuReviewStatus }, options?: { signal: AbortSignal }) => Promise<unknown> };
  menuVenues: { query: (input: { query: string }, options?: { signal: AbortSignal }) => Promise<unknown> };
  linkMenuVenue: { mutate: (input: { locationId: string; venueId: string | null; expectedVenueId: string | null }) => Promise<unknown> };
  reviewMenuDish: { mutate: (input: ReviewInput) => Promise<unknown> };
}

export function MenuEvidenceReview({ api, authorizedFetch }: { api: MenuAdminApi; authorizedFetch: AuthorizedFetch }) {
  const [filter, setFilter] = useState<MenuReviewStatus>('pending');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const changed = useCallback(() => setRevision((n) => n + 1), []);
  return <section className="admin-card" aria-label="Menu evidence review">
    <h2>Menu evidence</h2>
    <p className="admin-muted">{MENU_REVIEW_NOTICE}</p>
    <p className="admin-muted">{MENU_ALIAS_NOTICE}</p>
    <p className="admin-muted">Source-media approval is separate: use Vendor photos and videos above, then reload here. Changing or unlinking a venue invalidates every dish review at that location.</p>
    <div className="admin-inline">
      <label>Review status <select className="admin-select" disabled={busy} value={filter} onChange={(e) => setFilter(e.target.value as MenuReviewStatus)}>
        <option value="pending">Pending</option><option value="approved">Approved — revoke or re-review</option><option value="rejected">Rejected</option>
      </select></label>
      <button type="button" className="admin-button" disabled={busy} onClick={() => setRevision((n) => n + 1)}>Reload menu queue</button>
    </div>
    <p className="admin-small">At most 200 dishes per status, oldest submissions first. This is not the entire inventory when the limit is reached.</p>
    <MenuQueue key={`${filter}:${revision}`} api={api} authorizedFetch={authorizedFetch} filter={filter} onBusy={setBusy} onChanged={changed} />
  </section>;
}

function MenuQueue({ api, authorizedFetch, filter, onBusy, onChanged }: {
  api: MenuAdminApi; authorizedFetch: AuthorizedFetch; filter: MenuReviewStatus;
  onBusy: (busy: boolean) => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<MenuQueueDish[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lifecycle = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    const active = new AbortController(); lifecycle.current = active;
    locked.current = false; setRows(null); setError(''); setBusy(false); onBusy(false);
    void Promise.resolve().then(() => {
      active.signal.throwIfAborted();
      return api.menuQueue.query({ reviewStatus: filter }, { signal: active.signal });
    }).then((result) => {
      const next = parseMenuQueue(result);
      if (next.some((dish) => dish.reviewStatus !== filter)) throw new Error('Wrong queue status');
      if (!active.signal.aborted) setRows(next);
    }).catch((e: unknown) => { if (!active.signal.aborted) setError(menuErrorText(e)); });
    return () => { active.abort(); onBusy(false); };
  }, [api, filter, authorizedFetch, onBusy]);
  const run = async (mutation: () => Promise<unknown>) => {
    const active = lifecycle.current;
    if (!active || active.signal.aborted || locked.current || !rows) return;
    locked.current = true; setBusy(true); onBusy(true); setError('');
    try {
      // Mutations are never retried. Aborting a view cannot undo a committed decision.
      await mutation();
      if (!active.signal.aborted) { setRows(null); onChanged(); }
    } catch (e) {
      if (!active.signal.aborted) { setError(menuErrorText(e)); setRows(null); }
    } finally {
      if (!active.signal.aborted) { locked.current = false; setBusy(false); onBusy(false); }
    }
  };
  return <div aria-busy={busy}>
    {error && <p className="admin-warn" role="alert">{error} Use Reload menu queue to read fresh versions before making another decision.</p>}
    {!rows && !error && <p role="status">Loading menu evidence…</p>}
    {busy && <p role="status">Saving decision…</p>}
    {rows?.length === 0 && <p>No {filter} menu dishes.</p>}
    {rows && <ul className="admin-list">{rows.map((dish) => <li key={JSON.stringify(dish)}>
      <MenuReviewRow dish={dish} api={api} authorizedFetch={authorizedFetch} busy={busy} run={run} />
    </li>)}</ul>}
  </div>;
}

function MenuReviewRow({ dish, api, authorizedFetch, busy, run }: {
  dish: MenuQueueDish; api: MenuAdminApi; authorizedFetch: AuthorizedFetch; busy: boolean;
  run: (mutation: () => Promise<unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [venues, setVenues] = useState<MenuVenue[] | null>(null);
  const [selected, setSelected] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [note, setNote] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [namesChecked, setNamesChecked] = useState(false);
  const [samePlace, setSamePlace] = useState(false);
  const searchGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  useEffect(() => () => { searchGeneration.current += 1; searchController.current?.abort(); }, []);
  const ready = useCallback((value: boolean) => {
    setPreviewReady(value);
    if (!value) { setInspected(false); setNamesChecked(false); setSamePlace(false); }
  }, []);
  const candidate = venues?.find((venue) => venue.venueId === selected);
  const checks = { previewReady, inspected, namesChecked, samePlace };
  const canApprove = canApproveMenuDish(dish, checks);
  const search = async () => {
    if (busy || query.trim().length < 2 || query.trim().length > 100) return;
    const request = ++searchGeneration.current;
    searchController.current?.abort();
    const active = new AbortController(); searchController.current = active;
    setSearching(true); setSearchError(''); setSelected(''); setVenues(null);
    try {
      const results = parseMenuVenues(await api.menuVenues.query({ query: query.trim() }, { signal: active.signal }));
      if (request === searchGeneration.current) setVenues(results);
    } catch (e) { if (request === searchGeneration.current) setSearchError(menuErrorText(e)); }
    finally { if (request === searchGeneration.current) setSearching(false); }
  };
  const bind = (venue: MenuVenue | null) => {
    if (busy || (venue && venue.venueId === dish.venueId)) return;
    const message = venue ? `Bind ${dish.locationLabel} (${dish.address ?? 'No address'}) to ${venue.name} (${venue.address})? All dish reviews for this location will be invalidated.`
      : `Unlink the venue from ${dish.locationLabel}? All dish reviews for this location will be invalidated.`;
    if (!window.confirm(message)) return;
    ready(false);
    void run(async () => {
      const input = menuVenueBindingInput(dish, venue?.venueId ?? null);
      assertMenuBindingReply(await api.linkMenuVenue.mutate(input), input.venueId);
    });
  };
  return <div className="admin-stack">
    <h3>{dish.dishName} <span className="admin-tag">{menuReviewLabel(dish)}</span></h3>
    <p>{dish.business} · {dish.locationLabel} · {dish.address || 'No location address'}</p>
    <p>Aliases: {dish.aliases.join(', ') || 'None'}</p>
    <p>Source media: {dish.mediaReviewStatus}. {dish.mediaReviewStatus !== 'approved' && 'Approve the source separately before approving this dish.'}</p>
    {dish.reviewNote && <p>Review note: {dish.reviewNote}</p>}
    {dish.reviewedAt && <p>Last reviewed: {new Date(dish.reviewedAt).toLocaleString()} · Review expires: {new Date(Date.parse(dish.reviewedAt) + 30 * 86400000).toLocaleString()}</p>}
    <MenuSourcePreview authorizedFetch={authorizedFetch} sourceUrl={dish.sourceUrl} mediaId={dish.mediaId} sourceVersion={dish.mediaUpdatedAt} onReadyChange={ready} />
    <p><strong>Current venue binding:</strong> {dish.venueId
      ? `${dish.venueName ?? 'Unnamed venue'} · ${dish.venueAddress ?? 'No address'} (${dish.venueId})${dish.venueDiscoverable ? '' : ' — not discoverable'}`
      : 'Needs admin venue binding'}</p>
    <form onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <fieldset disabled={busy}>
        <legend>Find the actual same place</legend>
        <label>Venue name or address<input className="admin-input" required minLength={2} maxLength={100} value={query} onChange={(e) => {
          searchGeneration.current += 1; searchController.current?.abort(); setQuery(e.target.value); setSelected(''); setVenues(null); setSearching(false); setSearchError('');
        }} /></label>
        <button className="admin-button" type="submit" disabled={searching || query.trim().length < 2}>{searching ? 'Searching…' : 'Search venues'}</button>
        {searchError && <p role="alert">{searchError}</p>}
        {venues && <>
          <p>Up to 20 results. Select by name and address; no automatic match is made.</p>
          {!venues.length && <p>No venues found. Try a different name or address.</p>}
          {venues.map((venue) => <label className="admin-check" key={venue.venueId}>
            <input type="radio" name={`menu-venue-${dish.id}`} value={venue.venueId} checked={selected === venue.venueId} onChange={() => setSelected(venue.venueId)} />
            {venue.name} · {venue.address}
          </label>)}
          <button className="admin-button" type="button" disabled={!candidate || selected === dish.venueId} onClick={() => candidate && bind(candidate)}>Confirm selected venue binding</button>
        </>}
        {dish.venueId && <button className="admin-button" type="button" onClick={() => bind(null)}>Unlink venue…</button>}
      </fieldset>
    </form>
    <form onSubmit={(e) => {
      e.preventDefault();
      if (canApprove && !busy) void run(async () => {
        assertMenuReviewReply(await api.reviewMenuDish.mutate(menuReviewInput(dish, true, note, checks)), true);
      });
    }}>
      <fieldset disabled={busy}>
        <legend>Review evidence</legend>
        <label className="admin-check"><input type="checkbox" checked={inspected} disabled={!previewReady} onChange={(e) => setInspected(e.target.checked)} />I opened and inspected the source menu.</label>
        <label className="admin-check"><input type="checkbox" checked={namesChecked} disabled={!previewReady} onChange={(e) => setNamesChecked(e.target.checked)} />I checked this dish name and every alias against the menu.</label>
        <label className="admin-check"><input type="checkbox" checked={samePlace} disabled={!previewReady} onChange={(e) => setSamePlace(e.target.checked)} />The menu, vendor location and bound venue are the actual same physical place.</label>
        <label>Review note (required to reject or revoke; vendor can read it)<textarea className="admin-input" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="admin-inline">
          <button className="admin-button primary" type="submit" disabled={!canApprove}>{dish.reviewStatus === 'approved' ? 'Re-review and renew for 30 days' : 'Approve menu listing for 30 days'}</button>
          <button className="admin-button" type="button" disabled={!note.trim()} onClick={() => {
            if (note.trim() && (dish.reviewStatus !== 'approved' || window.confirm(`Revoke the menu listing for “${dish.dishName}”?`))) {
              void run(async () => {
                assertMenuReviewReply(await api.reviewMenuDish.mutate(menuReviewInput(dish, false, note)), false);
              });
            }
          }}>{dish.reviewStatus === 'approved' ? 'Revoke approval' : 'Reject with note'}</button>
        </div>
      </fieldset>
    </form>
  </div>;
}
