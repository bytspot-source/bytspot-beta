import { useEffect, useState } from 'react';
import {
  formatCents,
  partyTableDraftProblems,
  type BottleTerms,
  type ConsoleTransport,
  type PartyInvite,
  type PartyTable,
  type PartyTableKind,
} from './consoleTransport';

function partyWhen(invite: PartyInvite): string {
  const day = invite.party.startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const time = invite.party.startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

function tableWhen(table: PartyTable): string {
  const time = (at: Date) => at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${table.startsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time(table.startsAt)} to ${time(table.endsAt)}`;
}

function Problems({ problems }: { problems: string[] }) {
  return problems.length ? (
    <ul className="vendor-reasons">
      {problems.map((problem) => (
        <li key={problem} className="vendor-reason-fixable">
          {problem}
        </li>
      ))}
    </ul>
  ) : null;
}

/** The tables this business sells on one Party it accepted. */
function PartyTables({ invite, transport, onChanged }: { invite: PartyInvite; transport: ConsoleTransport; onChanged: (live: number) => void }) {
  const dayOf = invite.party.startsAt.toLocaleDateString('en-CA');
  const [rows, setRows] = useState<PartyTable[] | undefined>(undefined);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: '', kind: 'table' as PartyTableKind, date: dayOf, startTime: '', endTime: '',
    bottles: '0', bottleTerms: 'included' as BottleTerms, price: '', quantity: '1',
  });

  useEffect(() => {
    let live = true;
    void transport.partyTables(invite.party.id).then((result) => {
      if (!live) return;
      if (result.value) setRows(result.value);
      else setProblems(result.blockers ?? ['That did not load. Try again']);
    });
    return () => {
      live = false;
    };
  }, [transport, invite.party.id]);

  const add = async () => {
    const table = {
      name: draft.name, kind: draft.kind, date: draft.date, startTime: draft.startTime, endTime: draft.endTime,
      bottleCount: Number(draft.bottles), bottleTerms: draft.bottleTerms,
      priceCents: Math.round(Number(draft.price) * 100), quantity: Number(draft.quantity),
    };
    const local = partyTableDraftProblems(table);
    if (local.length) {
      setProblems(local);
      return;
    }
    setBusy(true);
    const result = await transport.addPartyTable(invite.party.id, table);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      setNote('');
      return;
    }
    const created = result.value;
    const next = [...(rows ?? []), created];
    setRows(next);
    onChanged(next.length);
    setProblems([]);
    setNote(`${created.name} is on sale at ${invite.party.title}.`);
    setDraft((current) => ({ ...current, name: '' }));
  };

  const withdraw = async (table: PartyTable) => {
    if (!window.confirm(`Stop selling ${table.name}? This is refused while a guest holds one.`)) return;
    setBusy(true);
    const result = await transport.withdrawPartyTable(table.id);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not go through. Try again']);
      return;
    }
    const next = (rows ?? []).filter((row) => row.id !== table.id);
    setRows(next);
    onChanged(next.length);
    setProblems([]);
    setNote(`${table.name} stopped selling.`);
  };

  return (
    <div>
      {!rows && !problems.length ? <p className="vendor-muted">Loading tables…</p> : null}
      {rows && rows.length === 0 ? <p className="vendor-muted">No tables on sale here yet.</p> : null}
      {rows?.length ? (
        <ul className="vendor-demand-list">
          {rows.map((table) => (
            <li key={table.id} className="vendor-card">
              <div className="vendor-card-top">
                <strong>{table.name}</strong>
                <span className="vendor-muted">{table.kind === 'after-hours' ? 'After-hours' : 'Table'}</span>
              </div>
              <p className="vendor-muted">
                {tableWhen(table)} · {table.venueName ?? 'At the party'}
              </p>
              <p className="vendor-muted">
                {formatCents(table.priceCents)} · {table.committed} of {table.quantity} sold ·{' '}
                {table.bottleTerms === 'minimum' ? `${table.bottleCount}-bottle minimum` : `${table.bottleCount} bottles included`}
              </p>
              <div className="vendor-demand-actions">
                <button type="button" className="vendor-chip" disabled={busy || invite.party.ended} onClick={() => void withdraw(table)}>
                  Stop selling
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {invite.party.ended ? null : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <h3 className="vendor-section-title">Add a table</h3>
          <label className="vendor-field">
            <span>Name guests see</span>
            <input value={draft.name} maxLength={80} placeholder="Front booth" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>Kind</span>
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as PartyTableKind })}>
              <option value="table">Table</option>
              <option value="after-hours">After-hours</option>
            </select>
          </label>
          <label className="vendor-field">
            <span>Date</span>
            <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>Starts</span>
            <input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>Ends</span>
            <input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>Bottles</span>
            <input type="number" inputMode="numeric" min="0" max="200" value={draft.bottles} onChange={(event) => setDraft({ ...draft, bottles: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>Bottle terms</span>
            <select value={draft.bottleTerms} onChange={(event) => setDraft({ ...draft, bottleTerms: event.target.value as BottleTerms })}>
              <option value="included">Included in the price</option>
              <option value="minimum">Minimum, bought on top</option>
            </select>
          </label>
          <label className="vendor-field">
            <span>Price in dollars</span>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.price} placeholder="400.00" onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
          </label>
          <label className="vendor-field">
            <span>How many to sell</span>
            <input type="number" inputMode="numeric" min="1" max="500" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
          </label>
          <p className="vendor-muted">Times are in your time zone. An end before the start means the next day. Tables are held at the party venue.</p>
          <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy}>
            {busy ? 'Saving…' : 'Put on sale'}
          </button>
        </form>
      )}
      {note ? <p className="vendor-muted">{note}</p> : null}
      <Problems problems={problems} />
    </div>
  );
}

/** Hosts asking this business to sell tables at their Party. */
export function PartiesView({ transport }: { transport: ConsoleTransport }) {
  const [rows, setRows] = useState<PartyInvite[] | undefined>(undefined);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void transport.partyInvites().then((result) => {
      if (!live) return;
      if (result.value) setRows(result.value);
      else setProblems(result.blockers ?? ['That did not load. Try again']);
    });
    return () => {
      live = false;
    };
  }, [transport]);

  const answer = async (invite: PartyInvite, kind: 'accept' | 'decline') => {
    if (kind === 'decline' && !window.confirm(`Decline ${invite.party.title}? ${invite.party.hostName} cannot ask again for this party.`)) return;
    setBusy(true);
    const result = await transport.answerPartyInvite(invite.id, kind);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not go through. Try again']);
      return;
    }
    const state = result.value;
    setRows((current) =>
      state === 'DECLINED'
        ? current?.filter((row) => row.id !== invite.id)
        : current?.map((row) => (row.id === invite.id ? { ...row, state } : row)),
    );
    setProblems([]);
    setNote(state === 'DECLINED' ? `Declined ${invite.party.title}.` : `Accepted. Add your tables to ${invite.party.title} below.`);
  };

  const pending = rows?.filter((row) => row.state === 'PENDING') ?? [];
  const accepted = rows?.filter((row) => row.state === 'ACCEPTED') ?? [];

  return (
    <>
      <section className="vendor-card">
        <p className="vendor-muted">
          Hosts can ask your business to sell tables at their party. Accept to add tables with your own prices; guests buy them with the party.
          Table sales are owed to your business after the Bytspot fee, and are paid out separately from your bookings.
        </p>
        {note ? <p className="vendor-muted">{note}</p> : null}
        <Problems problems={problems} />
      </section>

      {!rows && !problems.length ? <p className="vendor-muted">Loading…</p> : null}
      {rows && rows.length === 0 ? <p className="vendor-muted">No party requests right now.</p> : null}

      {pending.length ? (
        <>
          <h2 className="vendor-section-title">Asking you</h2>
          <ul className="vendor-demand-list">
            {pending.map((invite) => (
              <li key={invite.id} className="vendor-card">
                <div className="vendor-card-top">
                  <strong>{invite.party.title}</strong>
                  <span className="vendor-muted">{invite.party.ended ? 'Ended' : 'Waiting for you'}</span>
                </div>
                <p className="vendor-muted">
                  {partyWhen(invite)} · {invite.party.venueName} · hosted by {invite.party.hostName}
                </p>
                {invite.note ? <p>“{invite.note}”</p> : null}
                <div className="vendor-demand-actions">
                  <button type="button" className="vendor-chip vendor-chip-on" disabled={busy || invite.party.ended} onClick={() => void answer(invite, 'accept')}>
                    Accept
                  </button>
                  <button type="button" className="vendor-chip" disabled={busy} onClick={() => void answer(invite, 'decline')}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {accepted.length ? (
        <>
          <h2 className="vendor-section-title">Selling at</h2>
          <ul className="vendor-demand-list">
            {accepted.map((invite) => (
              <li key={invite.id} className="vendor-card">
                <div className="vendor-card-top">
                  <strong>{invite.party.title}</strong>
                  <span className="vendor-muted">{invite.party.ended ? 'Ended' : `${invite.liveSessions} on sale`}</span>
                </div>
                <p className="vendor-muted">
                  {partyWhen(invite)} · {invite.party.venueName} · hosted by {invite.party.hostName}
                </p>
                <p className="vendor-muted">Owed to you so far: {formatCents(invite.owedCents)}</p>
                <PartyTables
                  invite={invite}
                  transport={transport}
                  onChanged={(live) => setRows((current) => current?.map((row) => (row.id === invite.id ? { ...row, liveSessions: live } : row)))}
                />
                {invite.liveSessions === 0 && !invite.party.ended ? (
                  <div className="vendor-demand-actions">
                    <button type="button" className="vendor-chip" disabled={busy} onClick={() => void answer(invite, 'decline')}>
                      Leave this party
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
