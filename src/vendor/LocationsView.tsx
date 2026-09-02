import { useMemo, useState } from 'react';
import {
  getBookableLocations,
  listBookableDomains,
  locationKindsForDomain,
  type BookableDomainId,
  type BookableLocationOperationId,
} from '../utils/bookableTemplates';
import type { GeocodeCandidate } from './geocoding';
import { LocationForm } from './LocationForm';
import { fulfillmentFor, locationPublishBlockers, type VendorLocation } from './locations';
import type { ProfileEdit } from './profile';
import { authorizeLocation, canSeeLocation, publishBlockers, sessionCan, type VendorSession } from './seller';
import { locationStateCopy } from './vendorConsole';

export interface LocationsViewProps {
  session: VendorSession;
  locations: VendorLocation[];
  blockers: string[];
  busy: boolean;
  onEdit: (edit: ProfileEdit) => void;
  onMove: (id: string, operation: BookableLocationOperationId) => void;
  onGeocode: (query: string, kind: string) => Promise<GeocodeCandidate[]>;
}

/**
 * The places a business operates from.
 *
 * Reads the same profile the setup gate writes, so a place added during setup
 * appears here and a place paused here can take the requirement back off the
 * checklist. Two screens with their own copies of the list would let a business
 * be told it has a live place on one and not the other.
 */
export function LocationsView({
  session,
  locations: all,
  blockers,
  busy,
  onEdit,
  onMove,
  onGeocode,
}: LocationsViewProps) {
  const [domain, setDomain] = useState<BookableDomainId>('dining');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const contract = useMemo(() => getBookableLocations(), []);

  // An assigned seat sees only the places it works from, so the list is scoped
  // before render rather than filtered in the markup.
  const locations = useMemo(() => all.filter((item) => canSeeLocation(session, item.id)), [all, session]);
  const domains = useMemo(() => listBookableDomains(), []);
  const domainLabel = domains.find((item) => item.id === domain)?.label ?? domain;
  const editing = locations.find((item) => item.id === editingId);
  /**
   * Adding is a capability, not an operation on an existing place, so it is
   * checked against the seat rather than through authorizeLocation — which
   * needs a location id that by definition does not exist yet. An assigned seat
   * works from places it was given and does not create more.
   */
  const canAdd = sessionCan(session, 'SELL') && session.scope === 'all';

  return (
    <>
      <section>
        <h2 className="vendor-section-title">Where you work</h2>
        <p className="vendor-muted vendor-question">
          A place is the exact spot on the map a guest is sent to. Whether you go to them or they come to you decides
          what it needs: a travel radius, or an address.
        </p>

        {blockers.length > 0 ? (
          <ul className="vendor-reasons">
            {blockers.map((blocker) => (
              <li key={blocker} className="vendor-reason-fixable">
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}

        <nav className="vendor-filters" aria-label="Check against what you sell">
          {domains.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === domain ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => setDomain(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="vendor-muted">
          {domainLabel} works from:{' '}
          {locationKindsForDomain(domain)
            .map((kind) => `${kind.label.toLowerCase()} (${kind.fulfillment === 'vendorTravels' ? 'you travel' : 'guests come to you'})`)
            .join(', ')}
        </p>
      </section>

      {locations.length === 0 ? (
        <section className="vendor-card vendor-card-blank">
          <p className="vendor-muted">
            No places yet. Guests cannot book anything until there is at least one.
          </p>
        </section>
      ) : null}

      <ul className="vendor-demand-list">
        {locations.map((location) => {
          // Two kinds of blocker: the place itself, and who is asking.
          const reasons = [...locationPublishBlockers(location, domain), ...publishBlockers(session, location)];
          const operations = contract.operations.filter(
            (operation) => authorizeLocation(session, operation.id, location.state, location.id).ok,
          );
          const state = locationStateCopy(location.state);
          const kindLabel = contract.kinds.find((item) => item.id === location.kind)?.label ?? location.kind;

          return (
            <li key={location.id} className="vendor-card">
              <div className="vendor-card-top">
                <strong>{location.label}</strong>
                <span className="vendor-muted">{state.label}</span>
              </div>
              <p className="vendor-muted">{state.detail}</p>
              <p className="vendor-muted">
                {kindLabel} · {fulfillmentFor(location) === 'vendorTravels' ? 'you travel' : 'guests come to you'}
                {location.address ? ` · ${location.address}` : ''}
                {location.radiusMiles ? ` · travels up to ${location.radiusMiles} miles` : ''}
              </p>

              {reasons.length === 0 ? (
                <p className="vendor-question">Ready to take {domainLabel.toLowerCase()} bookings.</p>
              ) : (
                <ul className="vendor-reasons">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}

              {editingId === location.id ? (
                <LocationForm
                  session={session}
                  editing={location}
                  busy={busy}
                  onEdit={onEdit}
                  onGeocode={onGeocode}
                  onDone={() => setEditingId(undefined)}
                />
              ) : (
                <div className="vendor-demand-actions">
                  {canAdd ? (
                    <button type="button" className="vendor-chip" onClick={() => setEditingId(location.id)}>
                      Edit
                    </button>
                  ) : null}
                  {operations.map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      className="vendor-chip"
                      disabled={busy}
                      onClick={() => onMove(location.id, operation.id)}
                    >
                      {operation.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Adding is the same form the setup gate uses, so the pin rules cannot
          differ between the two screens. */}
      {canAdd ? (
        <section className="vendor-card">
          {adding ? (
            <>
              <h2 className="vendor-section-title">Add a place</h2>
              <LocationForm
                session={session}
                busy={busy}
                onEdit={onEdit}
                onGeocode={onGeocode}
                onDone={() => setAdding(false)}
              />
              <button type="button" className="vendor-chip" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="vendor-button" onClick={() => setAdding(true)}>
              Add a place
            </button>
          )}
        </section>
      ) : null}
    </>
  );
}
