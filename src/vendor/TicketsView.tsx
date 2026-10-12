import { useEffect, useState } from 'react';
import { ticketDraftProblems, type ConsoleTransport, type TicketDraft, type TicketState, type VendorTicket } from './consoleTransport';
import type { VendorLocation } from './locations';

const STATE_LABELS: Record<TicketState, string> = {
  on_sale: 'On sale',
  sold_out: 'Sold out',
  stopped: 'Stopped selling',
  ended: 'Ended',
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function when(ticket: VendorTicket): string {
  const zone = { timeZone: ticket.timezone };
  const day = ticket.startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...zone });
  const time = (at: Date) => at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...zone });
  return `${day}, ${time(ticket.startsAt)} to ${time(ticket.endsAt)}`;
}

function TicketRow({
  ticket,
  busy,
  onSave,
  onStop,
}: {
  ticket: VendorTicket;
  busy: boolean;
  onSave: (edit: { title: string; price: string; quantity: string }) => Promise<boolean>;
  onStop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [price, setPrice] = useState((ticket.priceCents / 100).toFixed(2));
  const [quantity, setQuantity] = useState(String(ticket.quantity));
  const [note, setNote] = useState('');
  const live = ticket.state === 'on_sale' || ticket.state === 'sold_out';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.url);
      setNote('Link copied. Share it, or put it on a patch or your website.');
    } catch {
      setNote('Copy did not work. Select the link and copy it instead.');
    }
  };

  return (
    <li className="vendor-card">
      <div className="vendor-card-top">
        <strong>{ticket.title}</strong>
        <span className="vendor-muted">{STATE_LABELS[ticket.state]}</span>
      </div>
      <p className="vendor-muted">
        {when(ticket)} · {ticket.place}
      </p>
      <p className="vendor-muted">
        {dollars(ticket.priceCents)} · {ticket.sold} of {ticket.quantity} sold
      </p>
      {live ? (
        <p className="vendor-muted">
          <a href={ticket.url} target="_blank" rel="noreferrer">
            {ticket.url}
          </a>
        </p>
      ) : null}
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSave({ title, price, quantity }).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          <label className="vendor-field">
            <span>Name</span>
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="vendor-field">
            <span>Price in dollars</span>
            <input type="number" inputMode="decimal" min="1" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <label className="vendor-field">
            <span>How many to sell</span>
            <input type="number" inputMode="numeric" min={Math.max(1, ticket.sold)} max="2000" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <p className="vendor-muted">A new price applies to the next guest. Tickets already bought keep what was paid.</p>
          <div className="vendor-demand-actions">
            <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="vendor-chip" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : live ? (
        <div className="vendor-demand-actions">
          <button type="button" className="vendor-chip" onClick={() => void copy()}>
            Copy link
          </button>
          <button type="button" className="vendor-chip" onClick={() => setEditing(true)}>
            Change
          </button>
          <button type="button" className="vendor-chip" disabled={busy} onClick={onStop}>
            Stop selling
          </button>
        </div>
      ) : null}
      {note ? <p className="vendor-muted">{note}</p> : null}
    </li>
  );
}

/** Dates this business sells tickets for itself. Guests pay through Stripe and show a pass at the door. */
export function TicketsView({ transport, locations }: { transport: ConsoleTransport; locations: VendorLocation[] }) {
  const places = locations.filter((location) => location.state !== 'CLOSED');
  const [rows, setRows] = useState<VendorTicket[] | undefined>(undefined);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ locationId: places[0]?.id ?? '', title: '', details: '', date: '', startTime: '', endTime: '', price: '', quantity: '' });

  useEffect(() => {
    let live = true;
    void transport.tickets().then((result) => {
      if (!live) return;
      if (result.value) setRows(result.value);
      else setProblems(result.blockers ?? ['That did not load. Try again']);
    });
    return () => {
      live = false;
    };
  }, [transport]);

  const replace = (ticket: VendorTicket) => setRows((current) => current?.map((row) => (row.id === ticket.id ? ticket : row)));

  const create = async () => {
    const ticket: TicketDraft = {
      locationId: draft.locationId,
      title: draft.title,
      details: draft.details,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      priceCents: toCents(draft.price),
      quantity: Number(draft.quantity),
    };
    const local = ticketDraftProblems(ticket);
    if (local.length) {
      setProblems(local);
      return;
    }
    setBusy(true);
    const result = await transport.createTicket(ticket);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      setNote('');
      return;
    }
    const created = result.value;
    setRows((current) => [created, ...(current ?? [])]);
    setProblems([]);
    setNote(`${created.title} is on sale. Copy its link to share it.`);
    setDraft((current) => ({ ...current, title: '', details: '', date: '' }));
  };

  const save = async (ticket: VendorTicket, edit: { title: string; price: string; quantity: string }): Promise<boolean> => {
    const priceCents = toCents(edit.price);
    const quantity = Number(edit.quantity);
    const local: string[] = [];
    if (!edit.title.trim()) local.push('Name the date, like Sunday buffet');
    if (!Number.isInteger(priceCents) || priceCents < 100) local.push('Charge at least $1');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) local.push('Sell between 1 and 2000');
    if (local.length) {
      setProblems(local);
      return false;
    }
    setBusy(true);
    const result = await transport.editTicket(ticket.id, { title: edit.title, priceCents, quantity });
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      return false;
    }
    replace(result.value);
    setProblems([]);
    setNote(`${result.value.title} saved.`);
    return true;
  };

  const stop = async (ticket: VendorTicket) => {
    if (!window.confirm(`Stop selling ${ticket.title}? Guests who already bought keep their tickets.`)) return;
    setBusy(true);
    const result = await transport.withdrawTicket(ticket.id);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not go through. Try again']);
      return;
    }
    replace(result.value);
    setProblems([]);
    setNote(`${ticket.title} stopped selling.`);
  };

  return (
    <>
      <section className="vendor-card">
        <p className="vendor-muted">
          Sell tickets for a date, like a Sunday buffet. Guests pay through Stripe and get a pass to show at the door.
          Scan it under Pass scanner. Bookings lists everyone who bought.
        </p>
        {places.length === 0 ? (
          <p className="vendor-muted">Add a place first, under Locations.</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <h2 className="vendor-section-title">Put a date on sale</h2>
            <label className="vendor-field">
              <span>Place</span>
              <select value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="vendor-field">
              <span>Name guests see</span>
              <input value={draft.title} maxLength={80} placeholder="Sunday buffet" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="vendor-field">
              <span>Details (optional)</span>
              <textarea value={draft.details} maxLength={500} rows={2} placeholder="What is included" onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
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
              <span>Price in dollars</span>
              <input type="number" inputMode="decimal" min="1" step="0.01" value={draft.price} placeholder="45.00" onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
            </label>
            <label className="vendor-field">
              <span>How many to sell</span>
              <input type="number" inputMode="numeric" min="1" max="2000" value={draft.quantity} placeholder="80" onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
            </label>
            <p className="vendor-muted">Times are at the place. An end before the start means the next day.</p>
            <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy}>
              {busy ? 'Saving…' : 'Put on sale'}
            </button>
          </form>
        )}
        {note ? <p className="vendor-muted">{note}</p> : null}
        {problems.length ? (
          <ul className="vendor-reasons">
            {problems.map((problem) => (
              <li key={problem} className="vendor-reason-fixable">
                {problem}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {!rows && !problems.length ? <p className="vendor-muted">Loading…</p> : null}
      {rows && rows.length === 0 ? <p className="vendor-muted">No dates on sale yet.</p> : null}
      {rows?.length ? (
        <ul className="vendor-demand-list">
          {rows.map((row) => (
            <TicketRow key={`${row.id}-${row.state}`} ticket={row} busy={busy} onSave={(edit) => save(row, edit)} onStop={() => void stop(row)} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
