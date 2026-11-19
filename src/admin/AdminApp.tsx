import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { API_BASE_URL, trpc } from '../utils/trpc';
import { BOOKING_PROVIDERS, BOOKING_PROVIDER_IDS, tableBookingFrom, type BookingProvider, type TableBooking } from '../utils/tableBooking';
import { DISCOVERY_ALSO_ON, DISCOVERY_RAIL_LABELS, DISCOVERY_RAIL_TOKENS } from '../utils/discoveryRails';
import { pitchMessage, type PitchLink } from './pitchMessage.ts';
import { GrowthTab } from './GrowthTab.tsx';
import { Chips, LetterBar, Pager, SearchBox, SortSelect, useDebounced, type Option } from './ListControls.tsx';
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
/** Filed under, grouped by the Discover pill each lands on. Matches the API's LISTED_CATEGORY_RAILS. */
const CATEGORY_RAILS = [
  { rail: 'eat_drink', options: [['restaurant', 'Restaurant'], ['cafe', 'Café'], ['coffee', 'Coffee'], ['market', 'Food hall / market'], ['catering', 'Catering']] },
  { rail: 'nightlife', options: [['bar', 'Bar'], ['club', 'Club']] },
  { rail: 'events', options: [['event', 'Event venue'], ['music', 'Live music'], ['entertainment', 'Theater / cinema / comedy']] },
  { rail: 'experience', options: [['attraction', 'Attraction'], ['museum', 'Museum / gallery'], ['tour', 'Tour'], ['park', 'Park'], ['outdoor', 'Outdoors'], ['sports', 'Sports']] },
  { rail: 'wellness', options: [['spa', 'Spa'], ['gym', 'Gym'], ['fitness', 'Fitness / yoga'], ['recovery', 'Recovery']] },
  { rail: 'shop_style', options: [['retail', 'Shop'], ['fashion', 'Fashion'], ['styling', 'Salon / barber']] },
  { rail: 'create_learn', options: [['class', 'Class'], ['workshop', 'Workshop'], ['studio', 'Studio']] },
  { rail: 'social', options: [['community', 'Community space'], ['meetup', 'Meetup']] },
  { rail: 'stay', options: [['hotel', 'Hotel'], ['lodging', 'Lodging'], ['cabin', 'Cabin / glamping'], ['retreat', 'Retreat']] },
  { rail: 'move', options: [['transport', 'Airport / transit'], ['parking', 'Parking'], ['automotive', 'Car rental / auto']] },
  { rail: 'celebrate', options: [['celebration', 'Party venue'], ['wedding', 'Wedding venue']] },
  { rail: 'services', options: [['service', 'Local service']] },
] as const;
const CATEGORIES = CATEGORY_RAILS.flatMap((group) => group.options.map(([id, label]) => ({ id, label, rail: group.rail })));
type Category = (typeof CATEGORY_RAILS)[number]['options'][number][0];
const railLabel = (rail: string) => DISCOVERY_RAIL_LABELS[DISCOVERY_RAIL_TOKENS.indexOf(rail)] ?? rail;
const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id);
const pillsLine = (id: string) => {
  const pills = [categoryOf(id)?.rail ?? 'eat_drink', ...(DISCOVERY_ALSO_ON[id] ?? [])].map(railLabel);
  return pills.length > 1 ? `Shows on the ${pills.join(' and ')} pills in Discover.` : `Shows on the ${pills[0]} pill in Discover.`;
};
type Provider = BookingProvider;

type Count = { total: number; last30: number };
type Recheck = { venueId: string; status: 'due_soon' | 'stale' | 'expired'; dueAt: string | null };
type PlaceFilters = { rail: string | null; provider: string | null; status: string | null; letter: string | null; sort: string; offset: number };
const NO_PLACE_FILTERS: PlaceFilters = { rail: null, provider: null, status: null, letter: null, sort: 'newest', offset: 0 };
type PlacesAttention = { linksDue: number; hidden: number; toPitch: { venueId: string; name: string; taps: number }[] };
const PILL_OPTIONS: Option[] = DISCOVERY_RAIL_TOKENS.filter((t) => t !== 'explore').map((id) => ({ id, label: railLabel(id) }));
const PROVIDER_OPTIONS: Option[] = [...BOOKING_PROVIDER_IDS.map((id) => ({ id, label: BOOKING_PROVIDERS[id].label })), { id: 'none', label: 'No link' }];
const PLACE_STATUS_OPTIONS: Option[] = [{ id: 'live', label: 'Live' }, { id: 'hidden', label: 'Hidden' }, { id: 'link_due', label: 'Link due' }, { id: 'no_link', label: 'No link' }];
const PLACE_SORT_OPTIONS: Option[] = [
  { id: 'newest', label: 'Newest listed' }, { id: 'az', label: 'A–Z' }, { id: 'taps', label: 'Most booking taps (30 days)' },
  { id: 'checkins', label: 'Most check-ins (30 days)' }, { id: 'due', label: 'Link due soonest' },
];

type ListedPlace = {
  venueId: string; name: string; address: string; category: string; placeId: string | null; hidden: boolean;
  booking: TableBooking | null; checkedAt: string | null; listedAt: string | null; bookingStale?: boolean; bookingDueAt?: string | null;
  expiresAt?: string | null; bookingExpired?: boolean;
  numbers: { checkIns: Count; bookingTaps: Count; planAdds: Count; bookedByGuests: Count };
};
type VenueControlRow = { venueId: string; name: string; address: string; category: string; control: 'bytspot' | 'listed'; controlledAt: string | null; placeId: string | null };
type Candidate = { placeId: string; name: string; address: string; suggestedCategory: Category; listed: boolean; venueName?: string | null };
type Draft = { placeId: string; name: string; address: string; provider: Provider | 'none'; url: string; category: Category; opened: boolean; tiedTo?: string | null;
  /** YYYY-MM-DD: the last day the link shows (an event's date). Empty: no end. */
  endsOn: string };

/** Providers whose links are usually for one event; same list as the API. */
const EVENT_PROVIDERS: readonly Provider[] = ['eventbrite', 'dice'];

/** The end of that day, on this computer's clock, as the API expects it. */
function endOfDay(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const end = new Date(`${day}T23:59:59`);
  return Number.isNaN(end.getTime()) ? null : end.toISOString();
}

function dayInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
type VendorFilters = { status: string | null; letter: string | null; sort: string; offset: number };
const NO_VENDOR_FILTERS: VendorFilters = { status: null, letter: null, sort: 'priority', offset: 0 };
type VendorsAttention = Record<'waiting' | 'invite_stale' | 'stuck' | 'paused', number>;
const VENDOR_ATTENTION: { id: keyof VendorsAttention; label: (n: number) => string }[] = [
  { id: 'waiting', label: (n) => `${n === 1 ? 'business is' : 'businesses are'} waiting for your approval.` },
  { id: 'invite_stale', label: (n) => `owner invite${n === 1 ? '' : 's'} not accepted after 7 days. Resend or follow up.` },
  { id: 'stuck', label: (n) => `${n === 1 ? 'business has' : 'businesses have'} been setting up for over 14 days.` },
  { id: 'paused', label: (n) => `paused ${n === 1 ? 'business' : 'businesses'}.` },
];
const VENDOR_STATUS_OPTIONS: Option[] = [
  { id: 'waiting', label: 'Waiting' }, { id: 'live', label: 'Live' }, { id: 'setup', label: 'Setting up' },
  { id: 'invite_stale', label: 'Invite not accepted' }, { id: 'stuck', label: 'Stuck in setup' }, { id: 'paused', label: 'Paused' },
];
const VENDOR_SORT_OPTIONS: Option[] = [{ id: 'priority', label: 'Waiting first' }, { id: 'az', label: 'A–Z' }, { id: 'newest', label: 'Newest' }];

type Vendor = {
  sellerId: string; legalName: string; contactEmail: string | null; businessKind: string | null; state: string;
  awaitingApproval: boolean; approvedAt: string | null; createdAt: string; missing: string[];
  locations: VendorLocationRow[];
  videoHostingAt: string | null;
  pausedAt?: string | null; pausedReason?: string | null; ownerInvitePending?: boolean;
  bands?: { total: number; active: number; lost: number; ranges: string[] };
};
type VendorLocationRow = {
  id?: string; label: string; address: string | null; state: string;
  venueId?: string | null; venueName?: string | null; venueAddress?: string | null;
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

const FEE_SCOPES: { scope: FeeScope; title: string; appliesTo: string; bytspotPaysCardFee?: boolean }[] = [
  { scope: 'party-ticket', title: 'Party tickets and tables', appliesTo: 'Applies to parties published after the change. A live party keeps the rate its host was shown.', bytspotPaysCardFee: true },
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

const EXAMPLE_TICKET_CENTS = 2000;
/** Stripe's standard US card rate, 2.9% + 30¢. Bytspot pays it out of its share. */
const cardFeeCents = (cents: number) => Math.round(cents * 0.029) + 30;
const dollarLabel = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Null when the rate covers the card fee on an example ticket; otherwise what to say. */
function cardFeeWarning(feeBps: number): string | null {
  const kept = Math.round(EXAMPLE_TICKET_CENTS * feeBps / 10_000);
  const cost = cardFeeCents(EXAMPLE_TICKET_CENTS);
  if (kept >= cost) return null;
  return `At ${percentLabel(feeBps)}, Bytspot keeps ${dollarLabel(kept)} on a ${dollarLabel(EXAMPLE_TICKET_CENTS)} ticket, but pays Stripe's card fee of about ${dollarLabel(cost)} on it, so each paid ticket loses about ${dollarLabel(cost - kept)}. Cheaper tickets lose more.`;
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

/** Same rule as the API: ignores case, extra spaces and curly or straight apostrophes. */
export function sameBusinessName(typed: string, name: string): boolean {
  const plain = (value: string) => value.normalize('NFKC').replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
  return plain(typed) === plain(name);
}

function errorText(error: unknown): string {
  const code = (error as { data?: { code?: string } })?.data?.code;
  if (code === 'UNAUTHORIZED') return 'Sign in again.';
  if (code === 'FORBIDDEN') return 'This account is not a Bytspot admin.';
  return (error as { message?: string })?.message || 'That did not go through. Try again.';
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

/** The Bytspot venue a Google match already belongs to, when its name is not the one Google shows. */
function tiedToOther(c: Candidate): string | null {
  const own = c.venueName?.trim();
  if (!own) return null;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const a = norm(own); const b = norm(c.name);
  return a && b && (a.includes(b) || b.includes(a)) ? null : own;
}

/** The same check the API makes, so a bad link is caught before it is sent. */
function linkProblem(provider: Provider, url: string): string | null {
  if (!url.trim()) return 'Paste the booking link.';
  const host = (() => { try { return new URL(url.trim()).hostname; } catch { return ''; } })();
  if (SHARE_HOSTS[host]) {
    return `That is a ${SHARE_HOSTS[host]} share link. Open it in a browser and copy the full ${BOOKING_PROVIDERS[provider].hosts[0]} address from the address bar.`;
  }
  return tableBookingFrom({ provider, url: url.trim() }) ? null : `That is not an https link on ${BOOKING_PROVIDERS[provider].hosts[0]}.`;
}

/** Short share hosts that hide the real page; the API refuses them too. */
const SHARE_HOSTS: Record<string, string> = { 'abnb.me': 'Airbnb', 'airbnb.app.link': 'Airbnb', 'booking.page.link': 'Booking.com' };
/** The API keeps only the listing's page for these, so dates and tracking in a pasted link are dropped. */
const PATH_ONLY_PROVIDERS = new Set<string>(['airbnb', 'hipcamp', 'bookingcom', 'bookretreats']);

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
  const noLink = draft.provider === 'none';
  const problem = draft.provider === 'none' ? null : linkProblem(draft.provider, draft.url);
  const ready = !problem && (noLink || draft.opened);
  const isEvent = draft.provider !== 'none' && EVENT_PROVIDERS.includes(draft.provider);

  const save = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      await trpc.admin.places.save.mutate(noLink
        ? { placeId: draft.placeId, provider: null, url: null, category: draft.category }
        : { placeId: draft.placeId, provider: draft.provider, url: draft.url.trim(), category: draft.category, expiresAt: endOfDay(draft.endsOn) });
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
      {draft.tiedTo && (
        <p className="admin-warn">
          This Google place is linked to {draft.tiedTo} in Bytspot. Saving changes {draft.tiedTo}, not a new place.
          To list {draft.name} on its own, first give {draft.tiedTo} its correct Google place in the venues list below.
        </p>
      )}
      <div className="admin-inline">
        <label className="admin-muted">
          Booking site{' '}
          <select className="admin-select" value={draft.provider}
            onChange={(e) => {
              const value = e.target.value as Provider | 'none';
              onChange(value === 'none' ? { ...draft, provider: 'none', url: '', opened: false } : { ...draft, provider: value, opened: false });
            }}>
            {BOOKING_PROVIDER_IDS.map((id) => <option key={id} value={id}>{BOOKING_PROVIDERS[id].label}</option>)}
            <option value="none">No booking link</option>
          </select>
        </label>
      </div>
      {noLink ? (
        <p className="admin-muted">Listed without a booking button. Guests still see the place and can save, plan and get directions.</p>
      ) : (
        <>
          <input className={input} placeholder={draft.provider === 'none' ? '' : BOOKING_PROVIDERS[draft.provider].example}
            value={draft.url} onChange={(e) => onChange({ ...draft, url: e.target.value, opened: false })} />
          {draft.url && problem && <p className="admin-warn">{problem}</p>}
          {!problem && draft.url.trim().length > 120 && (
            <p className="admin-muted">
              {PATH_ONLY_PROVIDERS.has(draft.provider)
                ? 'Long link: when you save, only the listing\u2019s page is kept. Dates, guests and tracking are dropped.'
                : 'Long link: when you save, tracking parts (like utm_ and fbclid) are dropped. The page it opens stays the same.'}
            </p>
          )}
          {!problem && (
            <a href={draft.url.trim()} target="_blank" rel="noopener noreferrer" className="admin-link">Open the link to check it ↗</a>
          )}
          <label className="admin-muted">
            {isEvent ? 'Event date (link stops showing after this day)' : 'Stop showing after (optional)'}{' '}
            <input type="date" className="admin-select" value={draft.endsOn}
              onChange={(e) => onChange({ ...draft, endsOn: e.target.value })} />
          </label>
          {isEvent && !draft.endsOn && (
            <p className="admin-muted">Set the event's date for a single event. Leave it empty for a venue's or organizer's page.</p>
          )}
        </>
      )}
      <label className="admin-muted">
        Filed under{' '}
        <select className="admin-select" value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value as Category })}>
          {CATEGORY_RAILS.map((group) => (
            <optgroup key={group.rail} label={railLabel(group.rail)}>
              {group.options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="admin-muted">{pillsLine(draft.category)}</p>
      {!noLink && (
        <label className="admin-check">
          <input type="checkbox" checked={draft.opened} onChange={(e) => onChange({ ...draft, opened: e.target.checked })} />
          I opened this link and it books this place.
        </label>
      )}
      {error && <p className="admin-warn">{error}</p>}
      <div className="admin-inline">
        <Button onClick={save} disabled={busy || !ready}>{busy ? 'Saving…' : 'Save and list'}</Button>
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
  const [pitch, setPitch] = useState<{ venueId: string; url: string; message: string; copied: boolean } | null>(null);
  const [filters, setFilters] = useState<PlaceFilters>(NO_PLACE_FILTERS);
  const [listQuery, setListQuery] = useState('');
  const searched = useDebounced(listQuery.trim());
  const [page, setPage] = useState<{ total: number; limit: number; letters: string[]; attention: PlacesAttention | null }>(
    { total: 0, limit: 50, letters: [], attention: null });
  const setFilter = (change: Partial<PlaceFilters>) => setFilters((current) => ({ ...current, offset: 0, ...change }));

  const makePitch = async (p: { venueId: string; name: string }) => {
    setError(null);
    try {
      const result: PitchLink = await trpc.admin.places.pitchLink.mutate({ venueId: p.venueId });
      const message = pitchMessage(p.name, result);
      const copied = await navigator.clipboard?.writeText(message).then(() => true, () => false) ?? false;
      setPitch({ venueId: p.venueId, url: result.url, message, copied });
    } catch (err) {
      setError(errorText(err));
    }
  };

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.places.list.query({
        ...(searched ? { query: searched } : {}),
        ...(filters.rail ? { rail: filters.rail } : {}),
        ...(filters.provider ? { provider: filters.provider } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.letter ? { letter: filters.letter } : {}),
        sort: filters.sort, offset: filters.offset,
      });
      setPlaces(result.places);
      setPage({ total: result.total ?? result.places.length, limit: result.limit ?? 50, letters: result.letters ?? [], attention: result.attention ?? null });
    } catch (err) {
      setError(errorText(err));
    }
  }, [searched, filters]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setFilters((current) => (current.offset === 0 ? current : { ...current, offset: 0 })); }, [searched]);

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

  const pick = (c: Candidate) => setDraft({
    placeId: c.placeId, name: c.name, address: c.address, provider: 'opentable', url: '', category: c.suggestedCategory, opened: false,
    tiedTo: tiedToOther(c), endsOn: '',
  });
  const edit = (p: ListedPlace) => p.placeId && setDraft({
    placeId: p.placeId, name: p.name, address: p.address, provider: p.booking?.provider ?? 'none',
    url: p.booking?.url ?? '', category: (categoryOf(p.category) ? p.category : 'restaurant') as Category, opened: false,
    endsOn: p.bookingExpired ? '' : dayInput(p.expiresAt),
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
                  {tiedToOther(c) && <p className="admin-warn">Linked to {tiedToOther(c)} in Bytspot</p>}
                </div>
                <Button kind="quiet" onClick={() => pick(c)}>{c.listed ? 'Edit' : 'Pick'}</Button>
              </li>
            ))}
          </ul>
        )}
        {draft && <PlaceForm draft={draft} onChange={setDraft} onSaved={saved} onCancel={() => setDraft(null)} />}
      </Card>

      {error && <p className="admin-warn">{error}</p>}

      {page.attention && (page.attention.linksDue > 0 || page.attention.hidden > 0 || page.attention.toPitch.length > 0) && (
        <Card>
          <div className="admin-stack admin-attention" style={{ gap: 10 }}>
            <h2>Needs attention</h2>
            {page.attention.linksDue > 0 && (
              <div className="admin-attention-item">
                <p>{page.attention.linksDue} booking link{page.attention.linksDue === 1 ? '' : 's'} to re-check: hidden from guests soon or already. Open each, then Edit and Save. A list is also emailed every Monday.</p>
                <Button kind="quiet" onClick={() => setFilter({ status: 'link_due', sort: 'due', letter: null })}>Show</Button>
              </div>
            )}
            {page.attention.toPitch.map((t) => (
              <div key={t.venueId} className="admin-attention-item">
                <p>{t.name}: {t.taps} booking taps in 30 days and not on Bytspot yet.</p>
                <Button kind="quiet" onClick={() => makePitch(t)}>Pitch link</Button>
              </div>
            ))}
            {page.attention.hidden > 0 && (
              <div className="admin-attention-item">
                <p>{page.attention.hidden} hidden place{page.attention.hidden === 1 ? '' : 's'}.</p>
                <Button kind="quiet" onClick={() => setFilter({ status: 'hidden', letter: null })}>Show</Button>
              </div>
            )}
            {pitch && page.attention.toPitch.some((t) => t.venueId === pitch.venueId) && (
              <div className="admin-stack" style={{ gap: 8 }}>
                <p className="admin-muted">{pitch.copied ? 'Message copied. Paste it into an email or DM to the business.' : 'Copy this message and send it to the business:'}</p>
                <textarea className="admin-input" readOnly rows={4} value={pitch.message} onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <h2>Listed places</h2>
        <p className="admin-muted">Last 30 days / all time. Check-ins count only when the guest was at the place.</p>
        <SearchBox value={listQuery} onChange={setListQuery} placeholder="Search listed places by name or address" />
        <Chips label="Pill" options={PILL_OPTIONS} value={filters.rail} onChange={(rail) => setFilter({ rail })} />
        <Chips label="Booking" options={PROVIDER_OPTIONS} value={filters.provider} onChange={(provider) => setFilter({ provider })} />
        <Chips label="Status" options={PLACE_STATUS_OPTIONS} value={filters.status} onChange={(status) => setFilter({ status })} />
        <div className="admin-row" style={{ alignItems: 'center' }}>
          <SortSelect options={PLACE_SORT_OPTIONS} value={filters.sort} onChange={(sort) => setFilter({ sort })} />
          {(searched || filters.rail || filters.provider || filters.status || filters.letter) && (
            <Button kind="quiet" onClick={() => { setListQuery(''); setFilters(NO_PLACE_FILTERS); }}>Clear filters</Button>
          )}
        </div>
        <LetterBar available={page.letters} value={filters.letter} onChange={(letter) => setFilter({ letter })} />
        {places === null ? <p className="admin-muted">Loading…</p> : places.length === 0 ? (
          <p className="admin-muted">{page.total === 0 && !searched && !filters.rail && !filters.provider && !filters.status && !filters.letter ? 'Nothing listed yet.' : 'No places match. Try fewer filters.'}</p>
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
                    {categoryOf(p.category) && (
                      <span className="admin-tag">{railLabel(categoryOf(p.category)!.rail)} · {categoryOf(p.category)!.label}</span>
                    )}
                    <span className="admin-tag">{p.booking ? `checked ${dateLabel(p.checkedAt)}` : 'no booking link'}</span>
                    {p.booking && p.expiresAt && (
                      <span className={p.bookingExpired ? 'admin-tag admin-warn' : 'admin-tag'}>
                        {p.bookingExpired ? `ended ${dateLabel(p.expiresAt)}` : `shows until ${dateLabel(p.expiresAt)}`}
                      </span>
                    )}
                    {p.bookingStale && (
                      <span className="admin-tag admin-warn">Not checked in 90 days: hidden from guests. Edit and save to check it again.</span>
                    )}
                  </div>
                  <div className="admin-inline">
                    <Button kind="quiet" onClick={() => edit(p)}>Edit</Button>
                    <Button kind="quiet" onClick={() => setHidden(p, !p.hidden)}>{p.hidden ? 'Show' : 'Hide'}</Button>
                    <Button kind="quiet" onClick={() => makePitch(p)}>Pitch link</Button>
                  </div>
                </div>
                {pitch?.venueId === p.venueId && (
                  <div className="admin-stack" style={{ gap: 8 }}>
                    <p className="admin-muted">{pitch.copied ? 'Message copied. Paste it into an email or DM to the business.' : 'Copy this message and send it to the business:'}</p>
                    <textarea className="admin-input" readOnly rows={4} value={pitch.message} onFocus={(e) => e.currentTarget.select()} />
                    <p className="admin-muted">The link shows their numbers and how to join. It works for 60 days. <a className="admin-link" href={pitch.url} target="_blank" rel="noopener noreferrer">Open it ↗</a></p>
                  </div>
                )}
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
        {places && places.length > 0 && (
          <Pager offset={filters.offset} limit={page.limit} total={page.total} onChange={(offset) => setFilters((current) => ({ ...current, offset }))} />
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

/** A business created here starts as a draft; its owner finishes setup from the emailed invite. */
function NewVendorForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || !email.trim()) { setError('Enter the business name and the owner\'s email.'); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      await trpc.admin.vendors.create.mutate({ legalName: name.trim(), email: email.trim() });
      setNote(`Invite sent to ${email.trim()}. They sign in with that email to finish setting up.`);
      setName(''); setEmail('');
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-stack">
      <p className="admin-strong">Add a vendor</p>
      <div className="admin-inline">
        <input className={input} placeholder="Business name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} type="email" placeholder="Owner's email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button disabled={busy} onClick={create}>{busy ? 'Sending…' : 'Create and invite'}</Button>
      </div>
      <p className="admin-small">They add their own payout and ID details. It still needs your approval to go live.</p>
      {note && <p className="admin-small">{note}</p>}
      {error && <p className="admin-warn">{error}</p>}
    </div>
  );
}

/** Attaches one vendor location to a listed place, so its bookables show on that place's page. */
function VendorPlaceLink({ location, onChanged }: { location: VendorLocationRow; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ venueId: string; name: string; address: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!location.id) return null;
  const locationId = location.id;

  const search = async () => {
    if (query.trim().length < 2) { setError('Type at least 2 letters of the place name.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await trpc.admin.vendors.menuVenues.query({ query: query.trim() });
      setResults(result.venues);
      if (result.venues.length === 0) setError('No listed place matches. List it in the Places tab first.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const attach = async (venueId: string | null) => {
    setBusy(true); setError(null);
    try {
      await trpc.admin.vendors.linkMenuVenue.mutate({ locationId, venueId, expectedVenueId: location.venueId ?? null });
      setOpen(false); setQuery(''); setResults([]);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (location.state !== 'ACTIVE') {
    return location.venueName
      ? <p className="admin-small">On place: {location.venueName}</p>
      : <p className="admin-small">Can be added to a place once this location is live.</p>;
  }
  return (
    <div className="admin-stack">
      <div className="admin-inline">
        <p className="admin-small">{location.venueName ? `On place: ${location.venueName}${location.venueAddress ? ` · ${location.venueAddress}` : ''}` : 'Not on a listed place'}</p>
        <Button kind="quiet" disabled={busy} onClick={() => setOpen(!open)}>{location.venueName ? 'Change place' : 'Add to place'}</Button>
        {location.venueId && <Button kind="quiet" disabled={busy} onClick={() => attach(null)}>Remove from place</Button>}
      </div>
      {open && (
        <div className="admin-stack">
          <div className="admin-inline">
            <input className={input} placeholder="Search listed places" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} />
            <Button kind="quiet" disabled={busy} onClick={search}>Search</Button>
          </div>
          {results.map((r) => (
            <div key={r.venueId} className="admin-inline">
              <p className="admin-small">{r.name}{r.address ? ` · ${r.address}` : ''}</p>
              <Button kind="quiet" disabled={busy || r.venueId === location.venueId} onClick={() => attach(r.venueId)}>
                {r.venueId === location.venueId ? 'Attached' : 'Attach'}
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="admin-warn">{error}</p>}
    </div>
  );
}

/** Disapprove, restore, resend the owner invite, or close a business for good. */
function VendorDecisions({ vendor, onChanged, onRemoved }: { vendor: Vendor; onChanged: () => Promise<void>; onRemoved: (message: string) => void }) {
  const [mode, setMode] = useState<'none' | 'pause' | 'close'>('none');
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paused = vendor.state === 'SUSPENDED';
  const canPause = vendor.state === 'ACTIVE' || ((vendor.state === 'DRAFT' || vendor.state === 'PENDING') && Boolean(vendor.approvedAt));

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setNote(null);
    try { await action(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const pause = () => run(async () => {
    await trpc.admin.vendors.pause.mutate({ sellerId: vendor.sellerId, reason: reason.trim() || undefined });
    setMode('none'); setReason('');
    await onChanged();
  });
  const restore = () => run(async () => {
    await trpc.admin.vendors.restore.mutate({ sellerId: vendor.sellerId });
    await onChanged();
  });
  const resend = () => run(async () => {
    await trpc.admin.vendors.resendInvite.mutate({ sellerId: vendor.sellerId });
    setNote(`Invite sent again to ${vendor.contactEmail ?? 'the owner'}.`);
  });
  const close = () => run(async () => {
    const result = await trpc.admin.vendors.close.mutate({ sellerId: vendor.sellerId, confirmName });
    if (!result.closed) { setBlockers(result.blockers); return; }
    setMode('none'); setConfirmName(''); setBlockers([]);
    onRemoved(result.deleted
      ? `${vendor.legalName} was deleted. It had no bookings or payments, so nothing was kept.`
      : `${vendor.legalName} was closed. Its past bookings and payouts are kept.`);
    await onChanged();
  });

  return (
    <div className="admin-stack">
      <div className="admin-inline">
        {paused && <Button disabled={busy} onClick={restore}>Restore</Button>}
        {canPause && <Button kind="quiet" disabled={busy} onClick={() => setMode(mode === 'pause' ? 'none' : 'pause')}>Disapprove</Button>}
        {vendor.ownerInvitePending && <Button kind="quiet" disabled={busy} onClick={resend}>Resend invite</Button>}
        <Button kind="quiet" disabled={busy} onClick={() => { setMode(mode === 'close' ? 'none' : 'close'); setBlockers([]); }}>Delete</Button>
      </div>
      {mode === 'pause' && (
        <div className="admin-stack">
          <p className="admin-small">
            {vendor.state === 'ACTIVE'
              ? 'Takes this business off guest screens now. Guests who already paid can still be admitted.'
              : 'Withdraws your approval, so it will not go live when it finishes setting up.'}
          </p>
          <div className="admin-inline">
            <input className={input} maxLength={500} placeholder="Reason (optional, shown to the vendor)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button disabled={busy} onClick={pause}>{busy ? 'Saving…' : 'Disapprove and email'}</Button>
          </div>
        </div>
      )}
      {mode === 'close' && (
        <div className="admin-stack">
          <p className="admin-warn">Removes {vendor.legalName} from guests and from this list, and its sign-in stops working. If it never had a booking, ticket or payment, it is deleted completely and the owner can be invited again. Otherwise it is closed and its past bookings and payouts are kept. This cannot be undone.</p>
          <div className="admin-inline">
            <input className={input} placeholder={`Type ${vendor.legalName} to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <Button disabled={busy || !sameBusinessName(confirmName, vendor.legalName)} onClick={close}>{busy ? 'Deleting…' : 'Delete for good'}</Button>
          </div>
          {blockers.length > 0 && <p className="admin-warn">Can't close yet. Still open: {blockers.join(', ')}.</p>}
        </div>
      )}
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
  const [removed, setRemoved] = useState<string | null>(null);
  const [filters, setFilters] = useState<VendorFilters>(NO_VENDOR_FILTERS);
  const [listQuery, setListQuery] = useState('');
  const searched = useDebounced(listQuery.trim());
  const [page, setPage] = useState<{ total: number; limit: number; letters: string[]; attention: VendorsAttention | null }>(
    { total: 0, limit: 50, letters: [], attention: null });
  const setFilter = (change: Partial<VendorFilters>) => setFilters((current) => ({ ...current, offset: 0, ...change }));

  const load = useCallback(async () => {
    try {
      const result = await trpc.admin.vendors.list.query({
        ...(searched ? { query: searched } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.letter ? { letter: filters.letter } : {}),
        sort: filters.sort, offset: filters.offset,
      });
      setVendors(result.sellers);
      setPage({ total: result.total ?? result.sellers.length, limit: result.limit ?? 50, letters: result.letters ?? [], attention: result.attention ?? null });
      onCount(result.awaiting);
    } catch (err) {
      setError(errorText(err));
    }
  }, [onCount, searched, filters]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setFilters((current) => (current.offset === 0 ? current : { ...current, offset: 0 })); }, [searched]);
  const attentionItems = page.attention ? VENDOR_ATTENTION.filter((a) => page.attention![a.id] > 0) : [];

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
      <NewVendorForm onCreated={load} />
      {error && <p className="admin-warn">{error}</p>}
      {removed && <p className="admin-small">{removed}</p>}
      {attentionItems.length > 0 && (
        <div className="admin-stack admin-attention" style={{ gap: 8 }}>
          <p className="admin-strong">Needs attention</p>
          {attentionItems.map((a) => (
            <div key={a.id} className="admin-attention-item">
              <p>{page.attention![a.id]} {a.label(page.attention![a.id])}</p>
              <Button kind="quiet" onClick={() => setFilter({ status: a.id, letter: null })}>Show</Button>
            </div>
          ))}
        </div>
      )}
      <SearchBox value={listQuery} onChange={setListQuery} placeholder="Search businesses by name, email or address" />
      <Chips label="Status" options={VENDOR_STATUS_OPTIONS} value={filters.status} onChange={(status) => setFilter({ status })} />
      <div className="admin-row" style={{ alignItems: 'center' }}>
        <SortSelect options={VENDOR_SORT_OPTIONS} value={filters.sort} onChange={(sort) => setFilter({ sort })} />
        {(searched || filters.status || filters.letter) && (
          <Button kind="quiet" onClick={() => { setListQuery(''); setFilters(NO_VENDOR_FILTERS); }}>Clear filters</Button>
        )}
      </div>
      <LetterBar available={page.letters} value={filters.letter} onChange={(letter) => setFilter({ letter })} />
      {vendors === null ? <p className="admin-muted">Loading…</p> : vendors.length === 0 ? (
        <p className="admin-muted">{searched || filters.status || filters.letter ? 'No businesses match. Try fewer filters.' : 'No businesses yet.'}</p>
      ) : (
        <ul className="admin-list">
          {vendors.map((v) => (
            <li key={v.sellerId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="admin-strong">
                  {v.legalName}
                  {v.awaitingApproval && <span className="admin-badge">Waiting for you</span>}
                  <span className="admin-tag">{v.state === 'SUSPENDED' ? 'paused' : v.state.toLowerCase()}</span>
                  {v.ownerInvitePending && <span className="admin-tag">invite sent</span>}
                </p>
                <p className="admin-muted">{[v.contactEmail, v.businessKind].filter(Boolean).join(' · ') || 'No contact yet'}</p>
                {v.pausedAt && <p className="admin-warn">Disapproved {dateLabel(v.pausedAt)}{v.pausedReason ? `: ${v.pausedReason}` : ''}</p>}
                {v.locations.map((l) => (
                  <div key={l.id ?? l.label} className="admin-stack">
                    <p className="admin-small">{l.label}{l.address ? ` · ${l.address}` : ''}</p>
                    <VendorPlaceLink location={l} onChanged={load} />
                  </div>
                ))}
                {v.missing.length > 0 && (
                  <p className="admin-warn">Still missing: {v.missing.map((m) => MISSING_LABELS[m] ?? m).join(', ')}</p>
                )}
                <p className="admin-small">Joined {dateLabel(v.createdAt)}{v.approvedAt ? ` · Approved ${dateLabel(v.approvedAt)}` : ''}</p>
                <p className="admin-small">{v.videoHostingAt ? `Premium video hosting since ${dateLabel(v.videoHostingAt)}` : 'No premium video hosting'}</p>
                <VendorBands vendor={v} onChanged={load} />
                <VendorDecisions vendor={v} onChanged={load} onRemoved={setRemoved} />
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
      {vendors && vendors.length > 0 && (
        <Pager offset={filters.offset} limit={page.limit} total={page.total} onChange={(offset) => setFilters((current) => ({ ...current, offset }))} />
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

function FeeRateCard({ scope, title, appliesTo, bytspotPaysCardFee }: { scope: FeeScope; title: string; appliesTo: string; bytspotPaysCardFee?: boolean }) {
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
    const loss = bytspotPaysCardFee ? cardFeeWarning(feeBps) : null;
    if (!window.confirm(`Change ${title.toLowerCase()} from ${percentLabel(rate.currentFeeBps)} to ${percentLabel(feeBps)}? ${appliesTo}${loss ? `\n\n${loss}` : ''}`)) return;
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
          {bytspotPaysCardFee && cardFeeWarning(rate.currentFeeBps) && <p className="admin-warn">{cardFeeWarning(rate.currentFeeBps)}</p>}
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
  const [tab, setTab] = useState<'places' | 'vendors' | 'reports' | 'fees' | 'growth'>('places');
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
                <Button kind={tab === 'growth' ? 'primary' : 'quiet'} onClick={() => setTab('growth')}>Growth</Button>
              </nav>
              {tab === 'places' ? <PlacesTab /> : tab === 'vendors' ? <VendorsTab onCount={setAwaiting} />
                : tab === 'reports' ? <ReportsTab onCount={setOpenReports} /> : tab === 'growth' ? <GrowthTab /> : <FeesTab />}
            </>
          )}
        </div>
      )}
    </main>
  );
}
