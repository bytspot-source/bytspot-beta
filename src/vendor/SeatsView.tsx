import { useCallback, useEffect, useState } from 'react';
import { getBookableStaffRole, type BookableStaffRoleId } from '../utils/bookableTemplates';
import type { ConsoleTransport, SeatMoveId, Team, TeamSeat } from './consoleTransport';
import type { VendorWindow, WindowsTransport } from './setupTransport';
import type { VendorSession } from './seller';

interface SeatsViewProps {
  session: VendorSession;
  transport: ConsoleTransport;
  windows: WindowsTransport;
}

const MOVES: Record<string, { id: SeatMoveId; label: string }[]> = {
  INVITED: [{ id: 'REVOKE_SEAT', label: 'Cancel invite' }],
  ACTIVE: [
    { id: 'SUSPEND_SEAT', label: 'Suspend' },
    { id: 'REVOKE_SEAT', label: 'Remove' },
  ],
  SUSPENDED: [
    { id: 'RESTORE_SEAT', label: 'Restore' },
    { id: 'REVOKE_SEAT', label: 'Remove' },
  ],
};

function stateLabel(seat: TeamSeat): string {
  if (seat.state === 'INVITED') return seat.inviteExpired ? 'Invite expired' : 'Invited';
  if (seat.state === 'SUSPENDED') return 'Suspended';
  return 'Active';
}

/**
 * The people who work the business. The server decides who may hand out which
 * seat; the list of roles here is the one it sent back.
 */
export function SeatsView({ session, transport, windows }: SeatsViewProps) {
  const [team, setTeam] = useState<Team | undefined>(undefined);
  const [bookables, setBookables] = useState<VendorWindow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BookableStaffRoleId | ''>('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void transport.team().then((result) => {
      if (!live) return;
      if (result.value) setTeam(result.value);
      else setBlockers(result.blockers ?? ['Your team did not load. Try again']);
    });
    void windows.list().then((result) => {
      if (live && result.value) setBookables(result.value);
    });
    return () => {
      live = false;
    };
  }, [transport, windows]);

  const apply = useCallback(async (run: () => ReturnType<ConsoleTransport['team']>): Promise<boolean> => {
    setBusy(true);
    const result = await run();
    setBusy(false);
    if (!result.value) {
      setBlockers(result.blockers ?? ['That did not save. Try again']);
      return false;
    }
    setBlockers([]);
    setTeam(result.value);
    return true;
  }, []);

  const scope = role ? getBookableStaffRole(role)?.scope : undefined;
  const ready = email.includes('@') && Boolean(role) && (scope !== 'assigned' || assigned.length > 0);

  const invite = async () => {
    if (!role) return;
    const ok = await apply(() =>
      transport.invite({ email: email.trim(), role, locationIds: [], bookableIds: scope === 'assigned' ? assigned : [] }),
    );
    if (ok) {
      setEmail('');
      setRole('');
      setAssigned([]);
    }
  };

  const canChange = (seat: TeamSeat) => !seat.you && Boolean(team?.canInvite.includes(seat.role));

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">Add someone</h2>
        {team && team.canInvite.length === 0 ? (
          <p className="vendor-muted">Your role cannot add people.</p>
        ) : (
          <>
            <label className="vendor-field">
              <span>Their email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                maxLength={320}
                placeholder="name@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <p className="vendor-muted vendor-question">Role</p>
            <div className="vendor-demand-actions">
              {(team?.canInvite ?? []).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={id === role ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                  title={getBookableStaffRole(id)?.summary}
                  onClick={() => setRole(id)}
                >
                  {getBookableStaffRole(id)?.label ?? id}
                </button>
              ))}
            </div>
            {role ? <p className="vendor-muted">{getBookableStaffRole(role)?.summary}</p> : null}
            {scope === 'assigned' ? (
              <>
                <p className="vendor-muted vendor-question">What they work on</p>
                {bookables.length === 0 ? (
                  <p className="vendor-muted">Create a service first, then assign it here.</p>
                ) : (
                  <div className="vendor-demand-actions">
                    {bookables.map((bookable) => (
                      <button
                        key={bookable.id}
                        type="button"
                        className={assigned.includes(bookable.id) ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                        onClick={() =>
                          setAssigned((current) =>
                            current.includes(bookable.id) ? current.filter((id) => id !== bookable.id) : [...current, bookable.id],
                          )
                        }
                      >
                        {bookable.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            <button type="button" className="vendor-chip vendor-chip-on" disabled={!ready || busy} onClick={() => void invite()}>
              {busy ? 'Sending…' : 'Send invite'}
            </button>
            <p className="vendor-muted">They sign in to this console with that email. Signing in accepts the invite.</p>
          </>
        )}
        {blockers.length ? (
          <ul className="vendor-reasons">
            {blockers.map((reason) => (
              <li key={reason} className="vendor-reason-fixable">{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="vendor-section-title">Team{team ? ` (${team.seats.length})` : ''}</h2>
        {!team ? <p className="vendor-muted">Loading…</p> : null}
        <ul className="vendor-demand-list">
          {(team?.seats ?? []).map((seat) => {
            const info = getBookableStaffRole(seat.role);
            const titles = seat.bookableIds.map((id) => bookables.find((bookable) => bookable.id === id)?.title ?? 'A service');
            return (
              <li key={seat.id} className="vendor-card">
                <div className="vendor-card-top">
                  <strong>{seat.name || seat.email}{seat.you ? ' (you)' : ''}</strong>
                  <span className="vendor-muted">{stateLabel(seat)}</span>
                </div>
                <p className="vendor-muted">
                  {info?.label ?? seat.role}
                  {seat.name ? ` · ${seat.email}` : ''}
                  {info?.scope === 'assigned' ? ` · ${titles.join(', ') || 'nothing assigned'}` : ''}
                </p>
                {session.seat.id !== seat.id && canChange(seat) ? (
                  <div className="vendor-demand-actions">
                    {(MOVES[seat.state] ?? []).map((move) => (
                      <button
                        key={move.id}
                        type="button"
                        className="vendor-chip"
                        disabled={busy}
                        onClick={() => void apply(() => transport.moveSeat(seat.id, move.id))}
                      >
                        {move.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
