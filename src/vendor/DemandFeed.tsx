import { useMemo } from 'react';
import { formatSlotTime } from './availability';
import {
  demandLostToCapacity,
  matchDemand,
  unmetDemand,
  type Demand,
  type DemandSupply,
} from './demand';
import { authorizeDemand, visibleByBookable, type VendorSession } from './seller';

export interface DemandFeedProps {
  session: VendorSession;
  demands: Demand[];
  owned: DemandSupply[];
  blockers: string[];
  busy: boolean;
  loading: boolean;
  onRespond: (demandId: string, bookableId: string, operation: 'OFFER' | 'DECLINE') => void;
}

export function DemandFeed({ session, demands, owned, blockers, busy, loading, onRespond }: DemandFeedProps) {
  const now = useMemo(() => new Date(), []);

  // Demand is only answerable from capacity this seat can actually see.
  const supply = useMemo(() => visibleByBookable(session, owned), [owned, session]);

  const matches = useMemo(() => matchDemand(demands, supply, now), [demands, supply, now]);
  const unmet = useMemo(() => unmetDemand(demands, supply, now), [demands, supply, now]);
  const fixable = useMemo(() => demandLostToCapacity(demands, supply, now), [demands, supply, now]);

  // Checked here as well as on the server: the button should not be offered to
  // a seat that cannot use it, and the server is what actually decides.
  const respond = (demand: Demand, bookableId: string, operation: 'OFFER' | 'DECLINE') => {
    if (!authorizeDemand(session, operation, 'MATCHED', bookableId).ok) return;
    onRespond(demand.id, bookableId, operation);
  };

  if (loading) {
    return (
      <section className="vendor-card">
        <p className="vendor-muted">Loading requests…</p>
      </section>
    );
  }

  return (
    <>
      {blockers.length > 0 ? (
        <ul className="vendor-reasons">
          {blockers.map((blocker) => (
            <li key={blocker} className="vendor-reason-fixable">
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="vendor-card">
        <h2 className="vendor-section-title">
          {fixable.length > 0
            ? `${fixable.length} you could have taken`
            : 'Nothing lost to capacity right now'}
        </h2>
        <p className="vendor-muted">
          {fixable.length > 0
            ? 'These matched everything except a free slot. Opening capacity is all that stands between you and them.'
            : 'Every unanswered request failed on something other than your calendar.'}
        </p>
      </section>

      <section>
        <h2 className="vendor-section-title">Can answer now ({matches.length})</h2>
        {matches.length === 0 ? (
          <p className="vendor-muted">No open request matches a sellable slot.</p>
        ) : (
          <ul className="vendor-demand-list">
            {matches.map((match) => (
              <li key={`${match.demand.id}-${match.bookableId}`} className="vendor-card">
                <div className="vendor-card-top">
                  <strong>
                    Party of {match.demand.partySize} · {match.demand.earliest.toDateString().slice(0, 10)}
                  </strong>
                  <span className="vendor-muted">{match.distanceMiles} mi</span>
                </div>
                {match.demand.note ? <p className="vendor-muted">{match.demand.note}</p> : null}
                <p className="vendor-question">
                  {match.title} · {match.slots.length} slot{match.slots.length === 1 ? '' : 's'} fit, soonest{' '}
                  {formatSlotTime(match.slots[0].startMins)}
                </p>
                {match.demand.state === 'OFFERED' ? (
                  <p className="vendor-muted">Offered. Waiting on them.</p>
                ) : (
                  <div className="vendor-demand-actions">
                    <button
                      type="button"
                      className="vendor-chip vendor-chip-on"
                      disabled={busy || !authorizeDemand(session, 'OFFER', 'MATCHED', match.bookableId).ok}
                      onClick={() => respond(match.demand, match.bookableId, 'OFFER')}
                    >
                      Offer {formatSlotTime(match.slots[0].startMins)}
                    </button>
                    <button
                      type="button"
                      className="vendor-chip"
                      disabled={busy || !authorizeDemand(session, 'DECLINE', 'MATCHED', match.bookableId).ok}
                      onClick={() => respond(match.demand, match.bookableId, 'DECLINE')}
                    >
                      Pass
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="vendor-section-title">Could not answer ({unmet.length})</h2>
        <p className="vendor-muted">Kept with the reason, because this is what tells you what to change.</p>
        <ul className="vendor-demand-list">
          {unmet.map((item) => (
            <li key={item.demand.id} className="vendor-card vendor-card-blank">
              <div className="vendor-card-top">
                <strong>
                  Party of {item.demand.partySize} · {item.demand.earliest.toDateString().slice(0, 10)}
                </strong>
                <span className="vendor-muted">{item.demand.note}</span>
              </div>
              <ul className="vendor-reasons">
                {item.reasons.map((reason) => (
                  <li key={reason.rule} className={reason.rule === 'capacity' ? 'vendor-reason-fixable' : undefined}>
                    {reason.reason}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
