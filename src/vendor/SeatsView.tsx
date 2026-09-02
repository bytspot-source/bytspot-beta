import { useMemo, useState } from 'react';
import {
  getBookableSeller,
  getBookableStaffRole,
  type BookableSeatOperationId,
  type BookableStaffRoleId,
} from '../utils/bookableTemplates';
import {
  goLiveBlockers,
  invitableRoles,
  inviteSeat,
  moveSeat,
  moveSeller,
  type Seat,
  type VendorSession,
} from './seller';

const SEED: Seat[] = [
  { id: 'seat_1', sellerId: 'sel_1', personId: 'per_1', role: 'owner', state: 'ACTIVE', locationIds: [], bookableIds: [] },
  { id: 'seat_2', sellerId: 'sel_1', personId: 'per_2', role: 'manager', state: 'ACTIVE', locationIds: [], bookableIds: [] },
  { id: 'seat_3', sellerId: 'sel_1', personId: 'per_3', role: 'door', state: 'INVITED', locationIds: [], bookableIds: [], invitedAt: new Date() },
  { id: 'seat_4', sellerId: 'sel_1', personId: 'per_4', role: 'serviceProvider', state: 'ACTIVE', locationIds: ['loc_midtown'], bookableIds: ['bk_massage'] },
];

interface SeatsViewProps {
  session: VendorSession;
}

export function SeatsView({ session }: SeatsViewProps) {
  const [seats, setSeats] = useState(SEED);
  const contract = useMemo(() => getBookableSeller().seats, []);
  const canInvite = invitableRoles(session);
  const [pending, setPending] = useState<BookableStaffRoleId | ''>('');
  const [refusal, setRefusal] = useState('');

  const run = (target: Seat, operation: BookableSeatOperationId) => {
    const verdict = moveSeat(session, target, operation);
    if (!verdict.ok) {
      setRefusal(
        verdict.reason === 'unrevocable'
          ? 'The owner seat cannot be removed. Transfer ownership instead.'
          : `Refused: ${verdict.reason}`,
      );
      return;
    }
    setRefusal('');
    setSeats((current) => current.map((seat) => (seat.id === target.id ? { ...seat, state: verdict.state } : seat)));
  };

  const invite = () => {
    if (!pending) return;
    const scope = getBookableStaffRole(pending)?.scope;
    const verdict = inviteSeat(
      session,
      {
        id: `seat_${seats.length + 1}`,
        personId: `per_${seats.length + 1}`,
        role: pending,
        // An assigned seat must arrive with work, or it would see nothing.
        bookableIds: scope === 'assigned' ? session.seat.bookableIds : [],
        locationIds: scope === 'assigned' ? session.seat.locationIds : [],
      },
      seats,
    );
    if (!verdict.ok) {
      setRefusal(
        verdict.reason === 'sole-role'
          ? 'A business has exactly one owner.'
          : `Refused: ${verdict.reason}`,
      );
      return;
    }
    setRefusal('');
    setSeats((current) => [...current, verdict.seat]);
    setPending('');
  };

  const liveGap = goLiveBlockers(session.seller);
  const submit = moveSeller(session, 'SUBMIT_SELLER');

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">{session.seller.legalName}</h2>
        <p className="vendor-muted">
          Business is {session.seller.state.toLowerCase()}.
          {session.seller.state === 'ACTIVE' ? ' Inventory can go live.' : ''}
        </p>
        {liveGap.length > 0 ? (
          <ul className="vendor-reasons">
            {liveGap.map((requirement) => (
              <li key={requirement.id}>{requirement.label}</li>
            ))}
          </ul>
        ) : null}
        {submit.ok ? (
          <div className="vendor-demand-actions">
            <button type="button" className="vendor-chip vendor-chip-on">
              Submit for review
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="vendor-section-title">Seats ({seats.length})</h2>
        <p className="vendor-muted vendor-question">
          A seat is a capability subset of the business, never a superset. You can only hand out a seat below your own,
          which is why the list you can invite is shorter than the list that exists.
        </p>

        {canInvite.length > 0 ? (
          <div className="vendor-demand-actions">
            {canInvite.map((role) => (
              <button
                key={role}
                type="button"
                className={role === pending ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                onClick={() => setPending(role)}
              >
                {getBookableStaffRole(role)?.label ?? role}
              </button>
            ))}
            <button type="button" className="vendor-chip vendor-chip-on" disabled={!pending} onClick={invite}>
              Send invite
            </button>
          </div>
        ) : (
          <p className="vendor-muted">This seat cannot invite anyone.</p>
        )}
        {refusal ? <p className="vendor-muted vendor-reason-fixable">{refusal}</p> : null}
      </section>

      <ul className="vendor-demand-list">
        {seats.map((seat) => {
          const role = getBookableStaffRole(seat.role);
          const operations = contract.operations.filter(
            (operation) => operation.id !== 'INVITE_SEAT' && moveSeat(session, seat, operation.id).ok,
          );
          return (
            <li key={seat.id} className="vendor-card">
              <div className="vendor-card-top">
                <strong>{role?.label ?? seat.role}</strong>
                <span className="vendor-muted">{seat.state}</span>
              </div>
              <p className="vendor-muted">
                {role?.summary}
                {role?.scope === 'assigned'
                  ? ` · ${seat.bookableIds.length} bookable${seat.bookableIds.length === 1 ? '' : 's'} assigned`
                  : ''}
              </p>
              {seat.role === contract.unrevocableRole ? (
                <p className="vendor-question">Cannot be removed. Ownership moves by transfer.</p>
              ) : null}
              {operations.length > 0 ? (
                <div className="vendor-demand-actions">
                  {operations.map((operation) => (
                    <button key={operation.id} type="button" className="vendor-chip" onClick={() => run(seat, operation.id)}>
                      {operation.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
