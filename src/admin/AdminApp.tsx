import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { API_BASE_URL, trpc } from '../utils/trpc';
import { tableBookingFrom, type TableBooking } from '../utils/tableBooking';
import './admin.css';
import { MenuEvidenceReview } from './MenuEvidenceReview.tsx';
import { MenuSourcePreview } from '../vendor/MenuDishEditor.tsx';
import { assertMenuReviewReply, menuSourcePath } from '../vendor/menuDishes.ts';

const menuAdminApi = trpc.admin.vendors;

/**
 * Bytspot Admin: the back office only accounts on the API's admin list can
 * open. Every call is authorized by the API; this page only arranges them.
 */

const TOKEN_KEY = 'bytspot_auth_token';
const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'bar', label: 'Bar' },
  { id: 'club', label: 'Club' },
  { id: 'cafe', label: 'Café' },
] as const;
type Category = (typeof CATEGORIES)[number]['id'];
type Provider = 'opentable' | 'resy';

type Count = { total: number; last30: number };
type ListedPlace = {
  venueId: string; name: string; address: string; category: string; placeId: string | null; hidden: boolean;
  booking: TableBooking | null; checkedAt: string | null; listedAt: string | null;
  numbers: { checkIns: Count; bookingTaps: Count; planAdds: Count; bookedByGuests: Count };
};
type VenueControlRow = { venueId: string; name: string; address: string; category: string; control: 'bytspot' | 'listed'; controlledAt: string | null; placeId: string | null };
type Candidate = { placeId: string; name: string; address: string; suggestedCategory: Category; listed: boolean };
type Draft = { placeId: string; name: string; address: string; provider: Provider; url: string; category: Category; opened: boolean };
type Vendor = {
  sellerId: string; legalName: string; contactEmail: string | null; businessKind: string | null; state: string;
  awaitingApproval: boolean; approvedAt: string | null; createdAt: string; missing: string[];
  locations: { label: string; address: string | null; state: string }[];
  videoHostingAt: string | null;
  bands?: { total: number; active: number; lost: number; ranges: string[] };
};
type VenueMediaItem = { id: string; kind: 'cover' | 'gallery' | 'video'; position: number; mimeType: string; url: string };
type VenueMediaList = { media: VenueMediaItem[]; videoAvailable: boolean; galleryCap: number };
type QueuedMedia = {
  mediaId: string; kind: string; mimeType: string; url: string; createdAt: string;
  business: string; place: string | null; offering: string | null; videoHosting: boolean;
};
type Stats = { totalUsers: number; newSignupsToday: number; totalCheckins: number; betaLeadCount: number };
type FeeScope = 'party-ticket' | 'vendor-booking';
type FeeRate = {
  scope: FeeScope; currentFeeBps: number; defaultFeeBps: number; maxFeeBps: number;
  history: { feeBps: number; note: string | null; setByUserId: string | null; createdAt: string }[];
};

const FEE_SCOPES: { scope: FeeScope; title: string; appliesTo: string }[] = [
  { scope: 'party-ticket', title: 'Party tickets and tables', appliesTo: 'Applies to parties published after the change. A live party keeps the rate its host was shown.' },
  { scope: 'vendor-booking', title: 'Business tickets', appliesTo: 'Applies to checkouts started after the change. Tickets already bought keep their split.' },
];

/** "12.5" → 1250. Null when it is not a percentage the API would accept. */
function percentToBps(value: string, maxBps: number): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) return null;
  const bps = Math.round(Number(trimmed) * 100);
  return bps >= 0 && bps <= maxBps ? bps : null;
}

function percentLabel(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
type ReportKind = 'user' | 'party' | 'review' | 'sale';
type ReportedItem = {
  kind: ReportKind; targetId: string; snapshot: Record<string, unknown> | null; firstReportedAt: string; status: string;
  decidedAt: string | null; reporterCount: number; hidden: boolean;
  owner: { userId: string; name: string | null; email: string | null; memberSince: string | null; suspendedAt: string | null; reportsAgainst: number; actedOn: number };
  reports: { reason: string; note: string | null; createdAt: string }[];
};

const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam or scam', harassment: 'Harassment or bullying', sexual: 'Nudity or sexual content',
  violence: 'Violence or threats', impersonation: 'Pretending to be someone', other: 'Something else',
};
const REPORT_KINDS: Record<ReportKind, string> = { user: 'Member', party: 'Party', review: 'Review', sale: 'Private Sale' };
const DAY_MS = 24 * 60 * 60 * 1000;

const MISSING_LABELS: Record<string, string> = {
  legalName: 'Business name', contactEmail: 'Contact email', activeLocation: 'A live place', payoutAccount: 'Payout account',
};

function errorText(error: unknown): string {
  const code = (error as { data?: { code?: string } })?.data?.code;
  if (code === 'UNAUTHORIZED') return 'Sign in again.';
  if (code === 'FORBIDDEN') return 'This account is not a Bytspot admin.';
  return (error as { message?: string })?.message || 'That did not go through. Try again.';
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

/** The same check the API makes, so a bad link is caught before it is sent. */
function linkProblem(provider: Provider, url: string): string | null {
  if (!url.trim()) return 'Paste the booking link.';
  return tableBookingFrom({ provider, url: url.trim() }) ? null : `That is not an https link on ${provider === 'opentable' ? 'opentable.com' : 'resy.com'}.`;
}

function Card({ children }: { children: ReactNode }) {
  return <section className="admin-card">{children}</section>;
}

function Button({ children, onClick, disabled, kind = 'primary', type = 'button' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'primary' | 'quiet'; type?: 'button' | 'submit';
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`admin-button ${kind === 'primary' ? 'primary' : ''}`}>
      {children}
    </button>
  );
}

const input = 'admin-input';

/** REST calls for media, which is too large for the tRPC body limit. */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
}

async function readReply<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.blockers?.[0] ?? body?.error ?? 'Something went wrong. Try again.');
  return body as T;
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await trpc.auth.login.mutate({ email: email.trim(), password });
      localStorage.setItem(TOKEN_KEY, result.token);
      onSignedIn();
    } catch (err) {
      setError((err as { data?: { code?: string } })?.data?.code === 'UNAUTHORIZED' ? 'Email or password is wrong.' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="admin-signin">
      <h1>Bytspot Admin</h1>
      <p className="admin-muted">Sign in with your Bytspot account.</p>
      <input className={input} type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={input} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="admin-warn">{error}</p>}
      <Button type="submit" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

function PlaceForm({ draft, onChange, onSaved, onCancel }: {
  draft: Draft; onChange: (draft: Draft) => void; onSaved: () => void; onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = linkProblem(draft.provider, draft.url);

  const save = async () => {
    if (problem || !draft.opened) return;
    setBusy(true); setError(null);
    try {
      await trpc.admin.places.save.mutate({ placeId: draft.placeId, provider: draft.provider, url: draft.url.trim(), category: draft.category });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-form">
      <div>
        <p className="admin-strong">{draft.name}</p>
        <p className="admin-muted">{draft.address}</p>
      </div>
      <div className="admin-inline">
        {(['opentable', 'resy'] as const).map((provider) => (
          <Button key={provider} kind={draft.provider === provider ? 'primary' : 'quiet'} onClick={() => onChange({ ...draft, provider })}>
            {provider === 'opentable' ? 'OpenTable' : 'Resy'}
          </Button>
        ))}
      </div>
      <input className={input} placeholder={draft.provider === 'opentable' ? 'https://www.opentable.com/r/…' : 'https://resy.com/cities/…'}
        value={draft.url} onChange={(e) => onChange({ ...draft, url: e.target.value, opened: false })} />
      {draft.url && problem && <p className="admin-warn">{problem}</p>}
      {!problem && (
        <a href={draft.url.trim()} target="_blank" rel="noopener noreferrer" className="admin-link">Open the link to check it ↗</a>
      )}
      <label className="admin-muted">
        Filed under{' '}
        <select className="admin-select" value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value as Category })}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="admin-check">
        <input type="checkbox" checked={draft.opened} onChange={(e) => onChange({ ...draft, opened: e.target.checked })} />
        I opened this link and it books this restaurant.
      </label>
      {error && <p className="admin-warn">{error}</p>}
      <div className="admin-inline">
        <Button onClick={save} disabled={busy || Boolean(problem) || !draft.opened}>{busy ? 'Saving…' : 'Save and list'}</Button>
        <Button kind="quiet" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function Numbers({ label, count }: { label: string; count: Count }) {
  return (
    <div>
      <p className="admin-number">{count.last30}<span className="admin-small"> / {count.total}</span></p>
      <p className="admin-small">{label}</p>
    </div>
  );
}

type SearchResult = { placeId: string; name: string; address: string; venueId: string | null };

/** The admin finds the venue on Google and confirms it; guests then see its Google photos and details. */
function GoogleLink({ venue, onLinked, onCancel }: { venue: VenueControlRow; onLinked: () => void; onCancel: () => void }) {
  const [query, setQuery] = useState(`${venue.name} ${venue.address}`);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true); setError(null);
    try {
      const result = await trpc.admin.places.search.query({ query: query.trim() });
      setResults(result.places);
      if (result.source === 'unavailable') setError('Google search is unavailable right now. Try again shortly.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const link = async (placeId: string) => {
    setBusy(true); setError(null);
    try {
      await trpc.admin.places.linkGoogle.mutate({ venueId: venue.venueId, placeId });
      onLinked();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-stack">
      <form onSubmit={search} className="admin-inline" style={{ flexWrap: 'nowrap' }}>
        <input className={input} placeholder="Name and address on Google" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" disabled={busy || query.trim().length < 2}>Search Google</Button>
        <Button kind="quiet" onClick={onCancel}>Cancel</Button>
      </form>
      {error && <p className="admin-warn">{error}</p>}
      {results && (
        <ul className="admin-list">
          {results.length === 0 && <li className="admin-muted">No matches. Try the name as Google shows it.</li>}
          {results.map((r) => {
            const elsewhere = r.venueId !== null && r.venueId !== venue.venueId;
            return (
              <li key={r.placeId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="admin-strong">{r.name}</p>
                  <p className="admin-muted">{r.address}</p>
                </div>
                {elsewhere ? <span className="admin-tag">Linked to another venue</span> : (
                  <Button disabled={busy || r.placeId === venue.placeId} onClick={() => link(r.placeId)}>
                    {r.placeId === venue.placeId ? 'Linked' : 'This is the place'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bytspot-curated cover, gallery and video. Guests see them only while the venue is Bytspot-controlled. */
function VenueMedia({ venue }: { venue: VenueControlRow }) {
  const [list, setList] = useState<VenueMediaList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/admin/venues/${encodeURIComponent(venue.venueId)}/media`;

  const load = useCallback(async () => {
    try {
      setList(await readReply<VenueMediaList>(await adminFetch(base)));
    } catch (err) {
      setError(errorText(err));
    }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (kind: VenueMediaItem['kind'], file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      if (kind === 'video') {
        const intent = JSON.stringify({ mimeType: file.type, byteSize: file.size });
        const { upload: ticket } = await readReply<{ upload: { mediaId: string; url: string; method: string; headers: Record<string, string> } }>(
          await adminFetch(`${base}/uploads`, { method: 'POST', body: intent }),
        );
        const sent = await fetch(ticket.url, { method: ticket.method, headers: ticket.headers, body: file });
        if (!sent.ok) throw new Error('Could not send that clip. Try again.');
        setList(await readReply<VenueMediaList>(await adminFetch(`${base}/uploads/${encodeURIComponent(ticket.mediaId)}`, { method: 'POST', body: intent })));
      } else {
        const body = JSON.stringify({ kind, dataUri: await readAsDataUri(file) });
        setList(await readReply<VenueMediaList>(await adminFetch(base, { method: 'POST', body })));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: VenueMediaItem) => {
    setBusy(true); setError(null);
    try {
      setList(await readReply<VenueMediaList>(await adminFetch(`${base}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!list) return error ? <p className="admin-warn">{error}</p> : <p className="admin-muted">Loading photos…</p>;
  const of = (kind: VenueMediaItem['kind']) => list.media.filter((m) => m.kind === kind);
  const sections: { kind: VenueMediaItem['kind']; label: string; accept: string; full: boolean }[] = [
    { kind: 'cover', label: 'Cover', accept: 'image/jpeg,image/png,image/webp', full: false },
    { kind: 'gallery', label: `Gallery (up to ${list.galleryCap})`, accept: 'image/jpeg,image/png,image/webp', full: of('gallery').length >= list.galleryCap },
    ...(list.videoAvailable ? [{ kind: 'video' as const, label: 'Video (MP4, WebM or MOV, under 80 MB)', accept: 'video/mp4,video/webm,video/quicktime', full: false }] : []),
  ];

  return (
    <div className="admin-stack">
      <p className="admin-muted">
        {venue.control === 'bytspot' ? 'Guests see these now.' : 'Guests see these once the venue is approved as Bytspot-controlled.'}
        {' '}Photos: JPEG, PNG or WebP under 2 MB.{list.videoAvailable ? '' : ' Video needs media storage set up on the server.'}
      </p>
      {sections.map(({ kind, label, accept, full }) => (
        <div key={kind}>
          <div className="admin-row">
            <p className="admin-strong">{label}</p>
            {!full && (
              <label className="admin-inline">
                <input type="file" accept={accept} disabled={busy} style={{ display: 'none' }}
                  onChange={(e) => { void upload(kind, e.target.files?.[0]); e.target.value = ''; }} />
                <span className="admin-tag" style={{ cursor: 'pointer' }}>{of(kind).length && kind !== 'gallery' ? 'Replace' : 'Add'}</span>
              </label>
            )}
          </div>
          <div className="admin-inline">
            {of(kind).map((m) => (
              <div key={m.id} className="admin-stack" style={{ width: 140 }}>
                {m.kind === 'video'
                  ? <video src={m.url} controls playsInline style={{ width: 140, borderRadius: 8 }} />
                  : <img src={m.url} alt="" style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8 }} />}
                <Button kind="quiet" disabled={busy} onClick={() => remove(m)}>Remove</Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {busy && <p className="admin-muted">Saving…</p>}
      {error && <p className="admin-warn">{error}</p>}
    </div>
  );
}

/** The team's approval: only a controlled venue gets the Bytspot display and curated media. */
function ControlledVenues() {
  const [venues, setVenues] = useState<VenueControlRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [curating, setCurating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.places.venues.query();
      setVenues(result.venues);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setControlled = async (v: VenueControlRow, controlled: boolean) => {
    setBusy(v.venueId); setError(null);
    try {
      await trpc.admin.places.setControlled.mutate({ venueId: v.venueId, controlled });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (v: VenueControlRow) => {
    setBusy(v.venueId); setError(null);
    try {
      await trpc.admin.places.linkGoogle.mutate({ venueId: v.venueId, placeId: null });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <h2>Bytspot-controlled venues</h2>
      <p className="admin-muted">Approved venues show only Bytspot photos, videos and details. Everything else is listed and shows Google details, once it is linked to its Google place.</p>
      {error && <p className="admin-warn">{error}</p>}
      {venues === null ? <p className="admin-muted">Loading…</p> : venues.length === 0 ? (
        <p className="admin-muted">No venues yet.</p>
      ) : (
        <ul className="admin-list">
          {venues.map((v) => (
            <li key={v.venueId}>
              <div className="admin-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <p className="admin-strong">
                    {v.name}
                    <span className="admin-tag">{v.control === 'bytspot' ? `Bytspot-controlled since ${dateLabel(v.controlledAt)}` : 'Listed'}</span>
                  </p>
                  <p className="admin-muted">{v.address}</p>
                  <p className="admin-muted">{v.placeId ? 'Google place linked' : 'Not linked to Google: guests see no Google photos or details'}</p>
                </div>
                <div className="admin-inline">
                  <Button kind="quiet" disabled={busy === v.venueId} onClick={() => setLinking(linking === v.venueId ? null : v.venueId)}>
                    {v.placeId ? 'Change Google place' : 'Link Google place'}
                  </Button>
                  {v.placeId && <Button kind="quiet" disabled={busy === v.venueId} onClick={() => unlink(v)}>Unlink</Button>}
                  <Button kind="quiet" onClick={() => setCurating(curating === v.venueId ? null : v.venueId)}>Photos &amp; video</Button>
                  <Button kind={v.control === 'bytspot' ? 'quiet' : 'primary'} disabled={busy === v.venueId}
                    onClick={() => setControlled(v, v.control !== 'bytspot')}>
                    {v.control === 'bytspot' ? 'Return to listed' : 'Approve as Bytspot-controlled'}
                  </Button>
                </div>
              </div>
              {linking === v.venueId && (
                <GoogleLink venue={v} onCancel={() => setLinking(null)} onLinked={() => { setLinking(null); void load(); }} />
              )}
              {curating === v.venueId && <VenueMedia venue={v} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PlacesTab() {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [places, setPlaces] = useState<ListedPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.places.list.query();
      setPlaces(result.places);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true); setError(null); setDraft(null);
    try {
      const result = await trpc.admin.places.search.query({ query: query.trim() });
      setCandidates(result.places);
      if (result.source === 'unavailable') setError('Google search is unavailable right now. Try again shortly.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSearching(false);
    }
  };

  const pick = (c: Candidate) => setDraft({ placeId: c.placeId, name: c.name, address: c.address, provider: 'opentable', url: '', category: c.suggestedCategory, opened: false });
  const edit = (p: ListedPlace) => p.placeId && setDraft({
    placeId: p.placeId, name: p.name, address: p.address, provider: p.booking?.provider ?? 'opentable',
    url: p.booking?.url ?? '', category: (CATEGORIES.some((c) => c.id === p.category) ? p.category : 'restaurant') as Category, opened: false,
  });
  const saved = () => { setDraft(null); setCandidates(null); setQuery(''); void load(); };

  const setHidden = async (p: ListedPlace, hidden: boolean) => {
    try {
      await trpc.admin.places.setHidden.mutate({ venueId: p.venueId, hidden });
      void load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="admin-stack">
      <Card>
        <h2>List a place</h2>
        <p className="admin-muted">Guests see it in Discover with Book ↗, directions, and check-in for points.</p>
        <form onSubmit={search} className="admin-inline" style={{ flexWrap: 'nowrap' }}>
          <input className={input} placeholder="Restaurant name" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" disabled={searching || query.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</Button>
        </form>
        {candidates && !draft && (
          <ul className="admin-list">
            {candidates.length === 0 && <li className="admin-muted">No matches. Try the name as Google shows it.</li>}
            {candidates.map((c) => (
              <li key={c.placeId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="admin-strong">{c.name}</p>
                  <p className="admin-muted">{c.address}</p>
                </div>
                <Button kind="quiet" onClick={() => pick(c)}>{c.listed ? 'Edit' : 'Pick'}</Button>
              </li>
            ))}
          </ul>
        )}
        {draft && <PlaceForm draft={draft} onChange={setDraft} onSaved={saved} onCancel={() => setDraft(null)} />}
      </Card>

      {error && <p className="admin-warn">{error}</p>}

      <Card>
        <h2>Listed places</h2>
        <p className="admin-muted">Last 30 days / all time. Check-ins count only when the guest was at the place.</p>
        {places === null ? <p className="admin-muted">Loading…</p> : places.length === 0 ? (
          <p className="admin-muted">Nothing listed yet.</p>
        ) : (
          <ul className="admin-list">
            {places.map((p) => (
              <li key={p.venueId} className={p.hidden ? 'admin-hidden' : ''}>
                <div className="admin-row" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <p className="admin-strong">{p.name}{p.hidden && <span className="admin-tag">Hidden</span>}</p>
                    <p className="admin-muted">{p.address}</p>
                    {p.booking && (
                      <a href={p.booking.url} target="_blank" rel="noopener noreferrer" className="admin-link">
                        {p.booking.label} ↗
                      </a>
                    )}
                    <span className="admin-tag">checked {dateLabel(p.checkedAt)}</span>
                  </div>
                  <div className="admin-inline">
                    <Button kind="quiet" onClick={() => edit(p)}>Edit</Button>
                    <Button kind="quiet" onClick={() => setHidden(p, !p.hidden)}>{p.hidden ? 'Show' : 'Hide'}</Button>
                  </div>
                </div>
                <div className="admin-numbers">
                  <Numbers label="Check-ins" count={p.numbers.checkIns} />
                  <Numbers label="Booking taps" count={p.numbers.bookingTaps} />
                  <Numbers label="Added to Plans" count={p.numbers.planAdds} />
                  <Numbers label="Said they booked" count={p.numbers.bookedByGuests} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ControlledVenues />
    </div>
  );
}

/** A pending file needs the admin's token to load, so it is fetched rather than linked. */
function QueuedPreview({ item }: { item: QueuedMedia }) {
  if (item.kind === 'menu') return <MenuSourcePreview authorizedFetch={adminFetch} sourceUrl={item.url} mediaId={item.mediaId} />;
  return <QueuedOtherPreview key={`${item.mediaId}:${item.url}`} item={item} />;
}
function QueuedOtherPreview({ item }: { item: QueuedMedia }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    const active = new AbortController();
    const path = menuSourcePath(item.url, item.mediaId, API_BASE_URL);
    if (!path) return;
    void adminFetch(path, { signal: active.signal, cache: 'no-store', redirect: 'error' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !active.signal.aborted) { url = URL.createObjectURL(blob); setSrc(url); }
      }).catch(() => undefined);
    return () => { active.abort(); if (url) URL.revokeObjectURL(url); };
  }, [item.url, item.mediaId]);
  if (!src) return <p className="admin-muted">Loading…</p>;
  if (item.mimeType.startsWith('video/')) return <video src={src} controls playsInline style={{ width: 220, borderRadius: 8 }} />;
  if (item.mimeType === 'application/pdf') return <a href={src} target="_blank" rel="noreferrer">Open menu PDF</a>;
  return <img src={src} alt="" style={{ width: 220, height: 150, objectFit: 'cover', borderRadius: 8 }} />;
}

/** Nothing a vendor uploads reaches guests until the team approves it here. */
function MediaReview({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [queue, setQueue] = useState<QueuedMedia[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lifecycle = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const load = useCallback(async (active: AbortController) => {
    try {
      const result = await trpc.admin.vendors.mediaQueue.query(undefined, { signal: active.signal });
      if (!active.signal.aborted) setQueue(result.media);
    } catch (err) {
      if (!active.signal.aborted) setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    const active = new AbortController(); lifecycle.current = active;
    void load(active);
    return () => { active.abort(); onBusy(false); };
  }, [load, onBusy]);

  const review = async (item: QueuedMedia, approve: boolean) => {
    const active = lifecycle.current;
    if (!active || active.signal.aborted || locked.current) return;
    locked.current = true; setBusy(item.mediaId); setError(null); onBusy(true);
    try {
      const result: unknown = await trpc.admin.vendors.reviewMedia.mutate({ mediaId: item.mediaId, approve, note: notes[item.mediaId]?.trim() || undefined });
      assertMenuReviewReply(result, approve);
      if (!active.signal.aborted) await load(active);
    } catch (err) {
      if (!active.signal.aborted) setError(errorText(err));
    } finally {
      if (!active.signal.aborted) { locked.current = false; setBusy(null); onBusy(false); }
    }
  };

  return (
    <Card>
      <h2>Vendor photos and videos{queue?.length ? ` (${queue.length} waiting)` : ''}</h2>
      <p className="admin-muted">Guests see a vendor's new or replaced photo, menu or video only after you approve it.</p>
      {error && <p className="admin-warn">{error}</p>}
      {queue === null ? <p className="admin-muted">Loading…</p> : queue.length === 0 ? (
        <p className="admin-muted">Nothing waiting.</p>
      ) : (
        <ul className="admin-list">
          {queue.map((item) => (
            <li key={item.mediaId} style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <QueuedPreview item={item} />
              <div className="admin-stack" style={{ flex: 1 }}>
                <p className="admin-strong">{item.business}<span className="admin-tag">{item.kind}</span></p>
                <p className="admin-muted">{[item.place, item.offering].filter(Boolean).join(' · ') || 'No place'} · {dateLabel(item.createdAt)}</p>
                {item.kind === 'video' && !item.videoHosting && <p className="admin-warn">This business doesn't have premium video hosting, so guests won't see it even if approved.</p>}
                <input className={input} placeholder="Reason, if not approving (the vendor sees this)" value={notes[item.mediaId] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [item.mediaId]: e.target.value })} />
                <div className="admin-inline">
                  <Button disabled={busy !== null} onClick={() => review(item, true)}>Approve</Button>
                  <Button kind="quiet" disabled={busy !== null} onClick={() => review(item, false)}>Don't approve</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Gives a business a range of Bytspot bands, or takes back the ones it never activated. */
function VendorBands({ vendor, onChanged }: { vendor: Vendor; onChanged: () => Promise<void> }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bands = vendor.bands ?? { total: 0, active: 0, lost: 0, ranges: [] };

  const run = async (release: boolean) => {
    const range = { sellerId: vendor.sellerId, from: from.trim(), to: (to.trim() || from.trim()) };
    if (!range.from) { setError('Enter the first band number, like BYT424-0301.'); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      if (release) {
        const result = await trpc.admin.vendors.releaseBands.mutate(range);
        setNote(`Took back ${result.released}.${result.kept ? ` ${result.kept} already activated or lost, so kept.` : ''}`);
      } else {
        const result = await trpc.admin.vendors.assignBands.mutate(range);
        setNote(`Assigned ${result.added}.${result.alreadyHere ? ` ${result.alreadyHere} were already theirs.` : ''}`);
      }
      setFrom(''); setTo('');
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-stack">
      <p className="admin-small">
        {bands.total ? `Bands: ${bands.total} (${bands.active} active, ${bands.lost} lost) · ${bands.ranges.join(', ')}` : 'No bands'}
      </p>
      <div className="admin-inline">
        <input className={input} placeholder="First band, e.g. BYT424-0301" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className={input} placeholder="Last band, e.g. BYT424-0400" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button kind="quiet" disabled={busy} onClick={() => run(false)}>Assign bands</Button>
        <Button kind="quiet" disabled={busy} onClick={() => run(true)}>Take back</Button>
      </div>
      {note && <p className="admin-small">{note}</p>}
      {error && <p className="admin-warn">{error}</p>}
    </div>
  );
}

function VendorsTab({ onCount }: { onCount: (awaiting: number) => void }) {
  const [menuMediaBusy, setMenuMediaBusy] = useState(false);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.vendors.list.query();
      setVendors(result.sellers);
      onCount(result.awaiting);
    } catch (err) {
      setError(errorText(err));
    }
  }, [onCount]);
  useEffect(() => { void load(); }, [load]);

  const approve = async (v: Vendor) => {
    setBusy(v.sellerId); setError(null);
    try {
      await trpc.admin.vendors.approve.mutate({ sellerId: v.sellerId });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const setVideoHosting = async (v: Vendor, enabled: boolean) => {
    setBusy(v.sellerId); setError(null);
    try {
      await trpc.admin.vendors.setVideoHosting.mutate({ sellerId: v.sellerId, enabled });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <MediaReview onBusy={setMenuMediaBusy} />
    {menuMediaBusy ? <p className="admin-muted">Menu evidence review is unavailable while source-media review changes. Reloading current evidence afterwards…</p>
      : <MenuEvidenceReview api={menuAdminApi} authorizedFetch={adminFetch} />}
    <Card>
      <h2>Vendors</h2>
      <p className="admin-muted">A business goes live only after you approve it. Approving early lets it go live the moment it finishes setting up.</p>
      {error && <p className="admin-warn">{error}</p>}
      {vendors === null ? <p className="admin-muted">Loading…</p> : vendors.length === 0 ? (
        <p className="admin-muted">No businesses yet.</p>
      ) : (
        <ul className="admin-list">
          {vendors.map((v) => (
            <li key={v.sellerId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="admin-strong">
                  {v.legalName}
                  {v.awaitingApproval && <span className="admin-badge">Waiting for you</span>}
                  <span className="admin-tag">{v.state.toLowerCase()}</span>
                </p>
                <p className="admin-muted">{[v.contactEmail, v.businessKind].filter(Boolean).join(' · ') || 'No contact yet'}</p>
                {v.locations.map((l) => <p key={l.label} className="admin-small">{l.label}{l.address ? ` · ${l.address}` : ''}</p>)}
                {v.missing.length > 0 && (
                  <p className="admin-warn">Still missing: {v.missing.map((m) => MISSING_LABELS[m] ?? m).join(', ')}</p>
                )}
                <p className="admin-small">Joined {dateLabel(v.createdAt)}{v.approvedAt ? ` · Approved ${dateLabel(v.approvedAt)}` : ''}</p>
                <p className="admin-small">{v.videoHostingAt ? `Premium video hosting since ${dateLabel(v.videoHostingAt)}` : 'No premium video hosting'}</p>
                <VendorBands vendor={v} onChanged={load} />
              </div>
              <div className="admin-inline">
                {!v.approvedAt && (
                  <Button onClick={() => approve(v)} disabled={busy === v.sellerId}>{busy === v.sellerId ? 'Approving…' : 'Approve'}</Button>
                )}
                <Button kind="quiet" disabled={busy === v.sellerId} onClick={() => setVideoHosting(v, !v.videoHostingAt)}>
                  {v.videoHostingAt ? 'Turn off video hosting' : 'Turn on video hosting'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </>
  );
}

/** What the reported item said when it was reported, so a later edit can't hide it. */
function reportedSummary(item: ReportedItem): string {
  const s = item.snapshot ?? {};
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
  switch (item.kind) {
    case 'user': return text(s.name) || 'No name';
    case 'party': return [text(s.title), text(s.venueName)].filter(Boolean).join(' · ') || 'Untitled party';
    case 'review': return `${text(s.venueName)}: ${text(s.comment) || `${String(s.stars ?? '?')} stars, no comment`}`;
    case 'sale': return [text(s.title), text(s.areaLabel)].filter(Boolean).join(' · ') || 'Untitled sale';
  }
}

/** Apple expects action on reports within 24 hours; the oldest are listed first. */
function ReportsTab({ onCount }: { onCount: (open: number) => void }) {
  const [items, setItems] = useState<ReportedItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.safety.reports.query({ status: 'open' });
      setItems(result.items);
      onCount(result.items.length);
    } catch (err) {
      setError(errorText(err));
    }
  }, [onCount]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (item: ReportedItem, action: 'dismiss' | 'remove' | 'suspend') => {
    if (action === 'suspend' && !window.confirm(`Suspend ${item.owner.name || 'this member'}? They are signed out everywhere and can't sign in until reinstated.`)) return;
    setBusy(`${item.kind}:${item.targetId}`); setError(null);
    try {
      await trpc.admin.safety.decide.mutate({ kind: item.kind, targetId: item.targetId, action });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const reinstate = async (item: ReportedItem) => {
    setBusy(`${item.kind}:${item.targetId}`); setError(null);
    try {
      await trpc.admin.safety.reinstate.mutate({ userId: item.owner.userId });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <h2>Reports{items?.length ? ` (${items.length} open)` : ''}</h2>
      <p className="admin-muted">
        Decide each within 24 hours. Dismiss shows the item again. Remove keeps it hidden. Suspend also signs its owner out and keeps them out.
      </p>
      {error && <p className="admin-warn">{error}</p>}
      {items === null ? <p className="admin-muted">Loading…</p> : items.length === 0 ? (
        <p className="admin-muted">No open reports.</p>
      ) : (
        <ul className="admin-list">
          {items.map((item) => {
            const key = `${item.kind}:${item.targetId}`;
            const overdue = Date.now() - new Date(item.firstReportedAt).getTime() > DAY_MS;
            return (
              <li key={key}>
                <div className="admin-row" style={{ alignItems: 'flex-start' }}>
                  <div className="admin-stack">
                    <p className="admin-strong">
                      {reportedSummary(item)}
                      <span className="admin-tag">{REPORT_KINDS[item.kind]}</span>
                      {item.hidden && <span className="admin-tag">Hidden</span>}
                      {overdue && <span className="admin-badge">Over 24 hours</span>}
                    </p>
                    <p className="admin-muted">
                      {item.reporterCount} {item.reporterCount === 1 ? 'report' : 'reports'} · first {dateLabel(item.firstReportedAt)}
                    </p>
                    {item.reports.map((r, index) => (
                      <p key={index} className="admin-small">{REPORT_REASONS[r.reason] ?? r.reason}{r.note ? `: "${r.note}"` : ''}</p>
                    ))}
                    <p className="admin-small">
                      Owner: {item.owner.name || 'No name'}{item.owner.email ? ` · ${item.owner.email}` : ''} · joined {dateLabel(item.owner.memberSince)}
                      {' '}· {item.owner.reportsAgainst} reports against, {item.owner.actedOn} acted on
                      {item.owner.suspendedAt ? ` · suspended ${dateLabel(item.owner.suspendedAt)}` : ''}
                    </p>
                  </div>
                  <div className="admin-inline">
                    <Button kind="quiet" disabled={busy === key} onClick={() => decide(item, 'dismiss')}>Dismiss</Button>
                    {item.kind !== 'user' && <Button disabled={busy === key} onClick={() => decide(item, 'remove')}>Remove</Button>}
                    {item.owner.suspendedAt
                      ? <Button kind="quiet" disabled={busy === key} onClick={() => reinstate(item)}>Reinstate owner</Button>
                      : <Button kind="quiet" disabled={busy === key} onClick={() => decide(item, 'suspend')}>Suspend owner</Button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function FeeRateCard({ scope, title, appliesTo }: { scope: FeeScope; title: string; appliesTo: string }) {
  const [rate, setRate] = useState<FeeRate | null>(null);
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRate(await trpc.admin.platformFee.query({ scope }));
    } catch (err) {
      setError(errorText(err));
    }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!rate) return;
    const feeBps = percentToBps(percent, rate.maxFeeBps);
    if (feeBps === null) { setError(`Enter a percentage from 0 to ${percentLabel(rate.maxFeeBps)}, up to two decimals.`); return; }
    if (feeBps === rate.currentFeeBps) { setError('That is already the rate.'); return; }
    if (!window.confirm(`Change ${title.toLowerCase()} from ${percentLabel(rate.currentFeeBps)} to ${percentLabel(feeBps)}? ${appliesTo}`)) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      const result = await trpc.admin.setPlatformFee.mutate({ scope, feeBps, note: note.trim() || undefined });
      setSaved(`Now ${percentLabel(result.currentFeeBps)}, for ${result.appliesTo}.`);
      setPercent(''); setNote('');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2>{title}</h2>
      {rate === null ? <p className="admin-muted">{error ?? 'Loading…'}</p> : (
        <>
          <p className="admin-big">{percentLabel(rate.currentFeeBps)}</p>
          <p className="admin-muted">
            {rate.history.length === 0 ? `Default rate. No admin has set one yet.` : `Set ${dateLabel(rate.history[0].createdAt)}.`} {appliesTo}
          </p>
          <form className="admin-form" onSubmit={save}>
            <label className="admin-small">New rate (%)
              <input className={input} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder={`0 to ${rate.maxFeeBps / 100}`} />
            </label>
            <label className="admin-small">Reason (kept with the change)
              <input className={input} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </label>
            <Button type="submit" disabled={busy || !percent.trim()}>{busy ? 'Saving…' : 'Change rate'}</Button>
          </form>
          {error && <p className="admin-warn">{error}</p>}
          {saved && <p className="admin-muted">{saved}</p>}
          {rate.history.length > 0 && (
            <ul className="admin-list">
              {rate.history.map((row, index) => (
                <li key={`${row.createdAt}-${index}`}>
                  <p className="admin-strong">{percentLabel(row.feeBps)} <span className="admin-tag">{dateLabel(row.createdAt)}</span></p>
                  {row.note && <p className="admin-small">{row.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function FeesTab() {
  return (
    <div className="admin-stack">
      {FEE_SCOPES.map((item) => <FeeRateCard key={item.scope} {...item} />)}
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    trpc.admin.stats.query().then(setStats).catch(() => setStats(null));
  }, []);
  if (!stats) return null;
  const tiles: [string, number][] = [
    ['Guests', stats.totalUsers], ['New today', stats.newSignupsToday], ['Check-ins', stats.totalCheckins], ['Beta signups', stats.betaLeadCount],
  ];
  return (
    <div className="admin-tiles">
      {tiles.map(([label, value]) => (
        <div key={label} className="admin-tile">
          <p className="admin-big">{value}</p>
          <p className="admin-small">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default function AdminApp() {
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [access, setAccess] = useState<'checking' | 'ok' | string>('checking');
  const [tab, setTab] = useState<'places' | 'vendors' | 'reports' | 'fees'>('places');
  const [awaiting, setAwaiting] = useState(0);
  const [openReports, setOpenReports] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    setAccess('checking');
    trpc.admin.vendors.list.query()
      .then((result: { awaiting: number }) => {
        setAwaiting(result.awaiting);
        setAccess('ok');
        trpc.admin.safety.reports.query({ status: 'open' })
          .then((reports: { items: unknown[] }) => setOpenReports(reports.items.length))
          .catch(() => undefined);
      })
      .catch((err: unknown) => {
        if ((err as { data?: { code?: string } })?.data?.code === 'UNAUTHORIZED') {
          localStorage.removeItem(TOKEN_KEY);
          setSignedIn(false);
          return;
        }
        setAccess(errorText(err));
      });
  }, [signedIn]);

  const signOut = () => { localStorage.removeItem(TOKEN_KEY); setSignedIn(false); };

  return (
    <main className="admin">
      {!signedIn ? <SignIn onSignedIn={() => setSignedIn(true)} /> : (
        <div className="admin-shell">
          <header className="admin-row">
            <h1>Bytspot Admin</h1>
            <Button kind="quiet" onClick={signOut}>Sign out</Button>
          </header>
          {access === 'checking' ? <p className="admin-muted">Checking access…</p> : access !== 'ok' ? (
            <Card><p className="admin-warn">{access}</p></Card>
          ) : (
            <>
              <Dashboard />
              <nav className="admin-inline">
                <Button kind={tab === 'places' ? 'primary' : 'quiet'} onClick={() => setTab('places')}>Places</Button>
                <Button kind={tab === 'vendors' ? 'primary' : 'quiet'} onClick={() => setTab('vendors')}>
                  Vendors{awaiting > 0 ? ` (${awaiting} waiting)` : ''}
                </Button>
                <Button kind={tab === 'reports' ? 'primary' : 'quiet'} onClick={() => setTab('reports')}>
                  Reports{openReports > 0 ? ` (${openReports} open)` : ''}
                </Button>
                <Button kind={tab === 'fees' ? 'primary' : 'quiet'} onClick={() => setTab('fees')}>Fees</Button>
              </nav>
              {tab === 'places' ? <PlacesTab /> : tab === 'vendors' ? <VendorsTab onCount={setAwaiting} />
                : tab === 'reports' ? <ReportsTab onCount={setOpenReports} /> : <FeesTab />}
            </>
          )}
        </div>
      )}
    </main>
  );
}
