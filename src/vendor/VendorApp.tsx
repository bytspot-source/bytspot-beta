import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatBookablePrice } from '../utils/bookableTemplates';
import {
  blankOnlyVariants,
  discoverCategoriesForBookableType,
  listVendorBookableTypes,
  staffRoleLabel,
  templatesForBookableType,
  vendorLandingView,
  vendorPrimaryNav,
  vendorSecondaryNav,
  VENDOR_CONSOLE,
  type VendorViewer,
} from './vendorConsole';
import { InstallCard } from './InstallCard';
import { AvailabilityGrid } from './AvailabilityGrid';
import { DemandFeed } from './DemandFeed';
import { LocationsView } from './LocationsView';
import { SeatsView } from './SeatsView';
import { WebhooksView } from './WebhooksView';
import { AuthGate } from './AuthGate';
import { httpAuthTransport } from './authTransport';
import {
  demoAuthTransport,
  demoDemandTransport,
  demoMediaTransport,
  demoSetupTransport,
  demoWindowsTransport,
  VENDOR_DEMO_MODE,
} from '@vendor-demo';
import { httpDemandTransport, type DemandTransport } from './demandTransport';
import { httpMediaTransport, type MediaTransport } from './mediaTransport';
import { useVendorDemand } from './useVendorDemand';
import { payoutIsUsable } from './profile';
import { OnboardingView } from './OnboardingView';
import { gateReplacesConsole, justVerified, shouldShowOnboarding, verifiedLabel } from './onboarding';
import {
  httpSetupTransport,
  httpWindowsTransport,
  windowDraftProblems,
  type AuthorizedFetch,
  type SetupTransport,
  type VendorWindow,
  type WindowDraft,
  type WindowsTransport,
} from './setupTransport';
import { MediaPicker } from './MediaPicker';
import type { VendorLocation } from './locations';
import { useVendorSetup } from './useVendorSetup';
import { effectiveSeatCapabilities } from '../utils/bookableTemplates';
import { withheldBySellerState, type VendorSession } from './seller';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toClock(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function fromClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export interface BookablesProps {
  session: VendorSession;
  locations: VendorLocation[];
  windows: WindowsTransport;
  media: MediaTransport;
  authorizedFetch: AuthorizedFetch;
}

/**
 * Drafting a window from a template, then publishing it. A draft is invisible
 * to guests and to the demand feed; publishing is refused by the API until the
 * business is approved and the place is active, and the console shows why.
 */
function useWindows(transport: WindowsTransport) {
  const [windows, setWindows] = useState<VendorWindow[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void transport.list().then((result) => {
      if (live && result.value) setWindows(result.value);
    });
    return () => {
      live = false;
    };
  }, [transport]);

  const replace = (row: VendorWindow) =>
    setWindows((current) => (current.some((entry) => entry.id === row.id) ? current.map((entry) => (entry.id === row.id ? row : entry)) : [...current, row]));

  const create = useCallback(
    async (draft: WindowDraft): Promise<boolean> => {
      const problems = windowDraftProblems(draft);
      if (problems.length) {
        setBlockers(problems);
        return false;
      }
      setBusy(true);
      const result = await transport.create(draft);
      setBusy(false);
      if (!result.value) {
        setBlockers(result.blockers ?? ['That did not save. Try again']);
        return false;
      }
      setBlockers([]);
      replace(result.value);
      return true;
    },
    [transport],
  );

  const setPublished = useCallback(
    async (id: string, published: boolean) => {
      setBusy(true);
      const result = await transport.setPublished(id, published);
      setBusy(false);
      if (!result.value) {
        setBlockers(result.blockers ?? ['That did not save. Try again']);
        return;
      }
      setBlockers([]);
      replace(result.value);
    },
    [transport],
  );

  return { windows, blockers, busy, create, setPublished };
}

function WindowForm({
  skuTemplateId,
  locations,
  busy,
  onCreate,
  onCancel,
}: {
  skuTemplateId: string;
  locations: VendorLocation[];
  busy: boolean;
  onCreate: (draft: WindowDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const open = locations.filter((location) => location.state !== 'CLOSED');
  const [draft, setDraft] = useState<WindowDraft>({
    skuTemplateId,
    locationId: open[0]?.id ?? '',
    weekdays: [1, 2, 3, 4, 5],
    openMins: 17 * 60,
    closeMins: 22 * 60,
    quantity: 1,
  });

  const toggleDay = (day: number) =>
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((entry) => entry !== day)
        : [...current.weekdays, day].sort((a, b) => a - b),
    }));

  if (!open.length) return <p className="vendor-muted">Add a place first, so guests know where this happens.</p>;

  return (
    <form
      className="vendor-card"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate(draft).then((saved) => {
          if (saved) onCancel();
        });
      }}
    >
      <label className="vendor-field">
        Where
        <select value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}>
          {open.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label}
            </option>
          ))}
        </select>
      </label>
      <nav className="vendor-filters" aria-label="Days">
        {WEEKDAYS.map((label, day) => (
          <button
            key={label}
            type="button"
            className={draft.weekdays.includes(day) ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
            onClick={() => toggleDay(day)}
          >
            {label}
          </button>
        ))}
      </nav>
      <label className="vendor-field">
        Opens
        <input type="time" value={toClock(draft.openMins)} onChange={(event) => setDraft({ ...draft, openMins: fromClock(event.target.value) })} />
      </label>
      <label className="vendor-field">
        Closes
        <input type="time" value={toClock(draft.closeMins)} onChange={(event) => setDraft({ ...draft, closeMins: fromClock(event.target.value) })} />
      </label>
      <label className="vendor-field">
        How many per slot
        <input
          type="number"
          min={1}
          value={draft.quantity}
          onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })}
        />
      </label>
      <button type="submit" className="vendor-button" disabled={busy}>
        Save as draft
      </button>
      <button type="button" className="vendor-chip" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function BookablesView({ viewer, session, locations, windows: transport, media, authorizedFetch }: { viewer: VendorViewer } & BookablesProps) {
  const types = useMemo(() => listVendorBookableTypes(viewer.businessMode), [viewer.businessMode]);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [drafting, setDrafting] = useState<string | undefined>(undefined);
  const owned = useWindows(transport);
  const canDraft = session.capabilities.has('SCHEDULE') && session.scope !== 'assigned';
  const canPublish = session.capabilities.has('PUBLISH');
  const placeLabel = (id: string) => locations.find((location) => location.id === id)?.label ?? 'A place';

  const type = types.find((item) => item.id === typeId);
  const presets = useMemo(() => templatesForBookableType(typeId), [typeId]);
  const blankOnly = useMemo(() => blankOnlyVariants(typeId), [typeId]);
  const rails = useMemo(() => discoverCategoriesForBookableType(typeId), [typeId]);

  return (
    <>
      <section>
        <h2 className="vendor-section-title">{VENDOR_CONSOLE.createBookableSteps[0].title}</h2>
        <nav className="vendor-filters" aria-label="What you are selling">
          {types.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === typeId ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => setTypeId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {type ? <p className="vendor-muted vendor-question">{type.question}</p> : null}
        {rails.length ? (
          <p className="vendor-muted vendor-question">
            Consumers find this under {rails.map((rail) => `${rail.emoji} ${rail.label}`).join(' and ')}.
          </p>
        ) : null}
      </section>

      <ul className="vendor-grid">
        {presets.map((template) => (
          <li key={template.id} className="vendor-card">
            <div className="vendor-card-top">
              <h3>{template.title}</h3>
              <span className={`vendor-tier vendor-tier-${template.tier}`}>{template.tier}</span>
            </div>
            <p className="vendor-muted">{template.description}</p>
            <dl className="vendor-meta">
              <div>
                <dt>Price</dt>
                <dd>{formatBookablePrice(template.priceCents)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{template.durationMins} min</dd>
              </div>
              <div>
                <dt>Timing</dt>
                <dd>{template.timing.etaLabel || 'No dispatch'}</dd>
              </div>
            </dl>
            {canDraft && drafting !== template.id ? (
              <button type="button" className="vendor-chip" onClick={() => setDrafting(template.id)}>
                Sell this
              </button>
            ) : null}
            {drafting === template.id ? (
              <WindowForm
                skuTemplateId={template.id}
                locations={locations}
                busy={owned.busy}
                onCreate={owned.create}
                onCancel={() => setDrafting(undefined)}
              />
            ) : null}
          </li>
        ))}

        {blankOnly.map((variant) => (
          <li key={variant} className="vendor-card vendor-card-blank">
            <div className="vendor-card-top">
              <h3>{variant.replace(/-/g, ' ')}</h3>
              <span className="vendor-tier vendor-tier-blank">Blank</span>
            </div>
            <p className="vendor-muted">No preset yet. Start blank and set price, duration and rules yourself.</p>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="vendor-section-title">What you sell</h2>
        {owned.blockers.length ? (
          <ul className="vendor-reasons">
            {owned.blockers.map((blocker) => (
              <li key={blocker} className="vendor-reason-fixable">
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}
        {owned.windows.length === 0 ? <p className="vendor-muted">Nothing yet. Pick a preset above and press Sell this.</p> : null}
        <ul className="vendor-grid">
          {owned.windows.map((window) => (
            <li key={window.id} className="vendor-card">
              <div className="vendor-card-top">
                <h3>{window.title}</h3>
                <span className={`vendor-tier vendor-tier-${window.published ? 'green' : 'blank'}`}>
                  {window.published ? 'Live' : 'Draft'}
                </span>
              </div>
              <p className="vendor-muted">
                {placeLabel(window.locationId)} · {window.weekdays.map((day) => WEEKDAYS[day]).join(' ')} ·{' '}
                {toClock(window.openMins)}–{toClock(window.closeMins)} · {window.quantity} per slot ·{' '}
                {formatBookablePrice(window.priceCents)}
              </p>
              {canPublish ? (
                <button
                  type="button"
                  className={window.published ? 'vendor-chip' : 'vendor-chip vendor-chip-on'}
                  disabled={owned.busy}
                  onClick={() => void owned.setPublished(window.id, !window.published)}
                >
                  {window.published ? 'Take down' : 'Publish'}
                </button>
              ) : null}
              <MediaPicker session={session} transport={media} parent="bookable" parentId={window.id} authorizedFetch={authorizedFetch} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function PlaceholderView({ id, label }: { id: string; label: string }) {
  const step = VENDOR_CONSOLE.model.chain.join(' → ');
  return (
    <section className="vendor-card">
      <h2 className="vendor-section-title">{label}</h2>
      <p className="vendor-muted">
        Not built yet. This tab is declared in the console contract as <code>{id}</code>, so navigation and permissions
        already work; the screen behind it is the next piece.
      </p>
      <p className="vendor-muted vendor-chain">{step}</p>
    </section>
  );
}

/**
 * One transport for the life of the tab. Rebuilding it on render would restart
 * the refresh loop that keeps a console signed in.
 *
 * The demo transport is selected at build time, never at runtime: a bypass that
 * engages when the API is unreachable would engage in production the first time
 * the API had an outage.
 */
const TRANSPORT = VENDOR_DEMO_MODE ? demoAuthTransport() : httpAuthTransport();

/**
 * The console begins after a session exists. Nothing inside has to ask whether
 * the viewer is real, because there is no path to a screen without a seat that a
 * token proved and the ontology allowed.
 */
export function VendorApp() {
  return (
    <AuthGate transport={TRANSPORT}>
      {(session, signOut, authorizedFetch) => (
        <VendorConsole session={session} onSignOut={signOut} authorizedFetch={authorizedFetch} />
      )}
    </AuthGate>
  );
}

function VendorConsole({
  session: opened,
  onSignOut,
  authorizedFetch,
}: {
  session: VendorSession;
  onSignOut: () => void;
  authorizedFetch: AuthorizedFetch;
}) {
  const transport = useMemo<SetupTransport>(
    () => (VENDOR_DEMO_MODE ? demoSetupTransport(opened.seller) : httpSetupTransport(authorizedFetch)),
    [authorizedFetch, opened.seller],
  );
  const setup = useVendorSetup(opened.seller, transport);

  const demandTransport = useMemo<DemandTransport>(
    () => (VENDOR_DEMO_MODE ? demoDemandTransport(opened.seller) : httpDemandTransport(authorizedFetch)),
    [authorizedFetch, opened.seller],
  );
  const feed = useVendorDemand(demandTransport);
  const media = useMemo<MediaTransport>(
    () => (VENDOR_DEMO_MODE ? demoMediaTransport() : httpMediaTransport(authorizedFetch)),
    [authorizedFetch],
  );
  const windows = useMemo<WindowsTransport>(
    () => (VENDOR_DEMO_MODE ? demoWindowsTransport() : httpWindowsTransport(authorizedFetch)),
    [authorizedFetch],
  );

  /**
   * The state is the one the server reported with the profile, so a business
   * that went live on this write can sell without signing in again. Only the
   * server moves it, which is why capabilities may be recomputed from it.
   */
  const seller = setup.seller;
  const session = useMemo<VendorSession>(
    () =>
      seller.state === opened.seller.state
        ? { ...opened, seller }
        : {
            ...opened,
            seller,
            capabilities: new Set(effectiveSeatCapabilities(opened.seat.role, opened.seat.state, seller.state)),
          },
    [opened, seller],
  );

  return (
    <ConsoleShell
      session={session}
      onSignOut={onSignOut}
      gate={
        shouldShowOnboarding(seller) ? (
          <OnboardingView
            session={session}
            profile={setup.profile}
            blockers={setup.blockers}
            busy={setup.busy}
            onEdit={(edit) => void setup.edit(edit)}
            onStartPayout={() => void setup.startPayout()}
            onGeocode={setup.geocode}
            media={media}
            authorizedFetch={authorizedFetch}
          />
        ) : null
      }
      /**
       * A business with nothing but SCHEDULE allowed has no guests to admit and
       * no money to read, so the gate is the whole console. One that is live but
       * has fallen out of compliance keeps its tabs and is told what broke.
       */
      gateReplacesConsole={gateReplacesConsole(seller)}
      places={
        <LocationsView
          session={session}
          locations={setup.profile.locations}
          blockers={setup.blockers}
          busy={setup.busy}
          onEdit={(edit) => void setup.edit(edit)}
          onMove={(id, operation) => void setup.move(id, operation)}
          onGeocode={setup.geocode}
          media={media}
          authorizedFetch={authorizedFetch}
        />
      }
      bookables={{ session, locations: setup.profile.locations, windows, media, authorizedFetch }}
      demand={
        <DemandFeed
          session={session}
          demands={feed.demand}
          owned={feed.supply}
          blockers={feed.blockers}
          busy={feed.busy}
          loading={feed.loading}
          onRespond={(demandId, bookableId, operation, payAt) => void feed.respond(demandId, bookableId, operation, payAt)}
          canTakePayment={payoutIsUsable(setup.profile.payout)}
          media={media}
          authorizedFetch={authorizedFetch}
        />
      }
    />
  );
}

function ConsoleShell({
  session,
  onSignOut,
  gate,
  gateReplacesConsole,
  places,
  bookables,
  demand,
}: {
  session: VendorSession;
  onSignOut: () => void;
  gate: React.ReactNode;
  gateReplacesConsole: boolean;
  /** Rendered by the caller, which owns the profile these places live in. */
  places: React.ReactNode;
  bookables: BookablesProps;
  /** Likewise: the feed is a read the caller owns, not shell state. */
  demand: React.ReactNode;
}) {
  // Nav reads the session's effective capabilities, so suspending the business
  // removes the tab rather than leaving a screen that refuses every action.
  const viewer: VendorViewer = useMemo(
    () => ({
      role: session.seat.role,
      businessMode: session.seller.businessMode,
      capabilities: session.capabilities,
    }),
    [session]
  );
  const primary = useMemo(() => vendorPrimaryNav(viewer), [viewer]);
  const secondary = useMemo(() => vendorSecondaryNav(viewer), [viewer]);
  const [view, setView] = useState(() => vendorLandingView(viewer));
  const withheld = useMemo(() => withheldBySellerState(session), [session]);
  const verified = verifiedLabel(session.seller);
  const [verifiedSeen, setVerifiedSeen] = useState(false);

  const visible = [...primary, ...secondary];
  const active = visible.find((item) => item.id === view);
  // A seat that loses a tab is moved off it rather than left on a blank screen.
  const current = active ? view : vendorLandingView(viewer);

  return (
    <div className="vendor-shell">
      <header className="vendor-header">
        <p className="vendor-eyebrow">Bytspot vendor{VENDOR_DEMO_MODE ? ' · demo build' : ''}</p>
        <h1>{visible.find((item) => item.id === current)?.label ?? 'Home'}</h1>
        <p className="vendor-muted">
          {session.seller.legalName} · {staffRoleLabel(session.seat.role)}
          {session.scope === 'assigned' ? ' · assigned work only' : ''}
        </p>
        {verified ? <p className="vendor-verified">✓ {verified}</p> : null}
        <button type="button" className="vendor-chip" onClick={onSignOut}>
          Sign out
        </button>
        {withheld.length > 0 ? (
          <p className="vendor-muted">
            Business is {session.seller.state.toLowerCase()}, so this seat cannot {withheld.join(', ').toLowerCase()}.
          </p>
        ) : null}
      </header>

      {gateReplacesConsole ? null : (
        <nav className="vendor-tabs" aria-label="Primary">
          {primary.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === current ? 'vendor-tab vendor-tab-on' : 'vendor-tab'}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <main className="vendor-main">
        <InstallCard />
        {justVerified(session.seller) && !verifiedSeen ? (
          <section className="vendor-card vendor-card-verified">
            <h2 className="vendor-section-title">✓ You are verified</h2>
            <p className="vendor-muted">
              {session.seller.legalName} passed every check: business name, contact email, a live location and a payout
              account. You can now publish times and take bookings.
            </p>
            <button type="button" className="vendor-chip" onClick={() => setVerifiedSeen(true)}>
              Got it
            </button>
          </section>
        ) : null}
        {gate}
        {gateReplacesConsole ? null : (
          <>
            {current === 'bookables' ? <BookablesView viewer={viewer} {...bookables} session={session} /> : null}
            {current === 'availability' ? <AvailabilityGrid session={session} /> : null}
            {current === 'demand' ? demand : null}
            {current === 'locations' ? places : null}
            {current === 'staff' ? <SeatsView session={session} /> : null}
            {current === 'webhooks' ? <WebhooksView session={session} /> : null}
            {!['bookables', 'availability', 'demand', 'locations', 'staff', 'webhooks'].includes(current) ? (
              <PlaceholderView id={current} label={active?.label ?? current} />
            ) : null}
          </>
        )}
      </main>

      {gateReplacesConsole ? null : (
        <footer className="vendor-more">
          <h2 className="vendor-section-title">More</h2>
          <nav className="vendor-filters" aria-label="Secondary">
            {secondary.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === current ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </footer>
      )}
    </div>
  );
}
