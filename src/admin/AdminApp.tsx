import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { trpc } from '../utils/trpc';
import { tableBookingFrom, type TableBooking } from '../utils/tableBooking';
import './admin.css';

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
type Candidate = { placeId: string; name: string; address: string; suggestedCategory: Category; listed: boolean };
type Draft = { placeId: string; name: string; address: string; provider: Provider; url: string; category: Category; opened: boolean };
type Vendor = {
  sellerId: string; legalName: string; contactEmail: string | null; businessKind: string | null; state: string;
  awaitingApproval: boolean; approvedAt: string | null; createdAt: string; missing: string[];
  locations: { label: string; address: string | null; state: string }[];
};
type Stats = { totalUsers: number; newSignupsToday: number; totalCheckins: number; betaLeadCount: number };

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
    </div>
  );
}

function VendorsTab({ onCount }: { onCount: (awaiting: number) => void }) {
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

  return (
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
              </div>
              {!v.approvedAt && (
                <Button onClick={() => approve(v)} disabled={busy === v.sellerId}>{busy === v.sellerId ? 'Approving…' : 'Approve'}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
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
  const [tab, setTab] = useState<'places' | 'vendors'>('places');
  const [awaiting, setAwaiting] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    setAccess('checking');
    trpc.admin.vendors.list.query()
      .then((result: { awaiting: number }) => { setAwaiting(result.awaiting); setAccess('ok'); })
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
              </nav>
              {tab === 'places' ? <PlacesTab /> : <VendorsTab onCount={setAwaiting} />}
            </>
          )}
        </div>
      )}
    </main>
  );
}
