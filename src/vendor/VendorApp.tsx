import { useMemo, useState } from 'react';
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
import { demoAuthTransport, demoDemandTransport, demoSetupTransport, VENDOR_DEMO_MODE } from '@vendor-demo';
import { httpDemandTransport, type DemandTransport } from './demandTransport';
import { useVendorDemand } from './useVendorDemand';
import { OnboardingView } from './OnboardingView';
import { gateReplacesConsole, shouldShowOnboarding } from './onboarding';
import { httpSetupTransport, type AuthorizedFetch, type SetupTransport } from './setupTransport';
import { useVendorSetup } from './useVendorSetup';
import type { BookableSellerState } from '../utils/bookableTemplates';
import { withheldBySellerState, type Seller, type VendorSession } from './seller';

function BookablesView({ viewer }: { viewer: VendorViewer }) {
  const types = useMemo(() => listVendorBookableTypes(viewer.businessMode), [viewer.businessMode]);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');

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

  /**
   * The state a vendor can move themselves, kept beside the reconciled seller.
   * Capabilities are not recomputed from it: only the platform moves a business
   * to ACTIVE, so nothing a vendor supplies can widen what its own seat may do.
   */
  const [movedTo, setMovedTo] = useState<BookableSellerState | undefined>(undefined);
  const seller = useMemo<Seller>(
    () => (movedTo ? { ...setup.seller, state: movedTo } : setup.seller),
    [setup.seller, movedTo],
  );
  const session = useMemo<VendorSession>(() => ({ ...opened, seller }), [opened, seller]);

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
            onMove={(operation) => setMovedTo(operation === 'SUBMIT_SELLER' ? 'PENDING' : 'DRAFT')}
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
        />
      }
      demand={
        <DemandFeed
          session={session}
          demands={feed.demand}
          owned={feed.supply}
          blockers={feed.blockers}
          busy={feed.busy}
          loading={feed.loading}
          onRespond={(demandId, bookableId, operation) => void feed.respond(demandId, bookableId, operation)}
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
  demand,
}: {
  session: VendorSession;
  onSignOut: () => void;
  gate: React.ReactNode;
  gateReplacesConsole: boolean;
  /** Rendered by the caller, which owns the profile these places live in. */
  places: React.ReactNode;
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
        {gate}
        {gateReplacesConsole ? null : (
          <>
            {current === 'bookables' ? <BookablesView viewer={viewer} /> : null}
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
