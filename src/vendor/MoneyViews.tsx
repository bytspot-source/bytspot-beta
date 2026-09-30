import { useEffect, useState } from 'react';
import type { PayoutAccount } from './profile';
import { formatCents, type Analytics, type ConsoleTransport, type Payouts } from './consoleTransport';

const RANGES = [7, 30, 90] as const;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="vendor-card">
      <strong>{value}</strong>
      <p className="vendor-muted">{label}</p>
    </div>
  );
}

/** What guests asked for, what the business offered, and what sold. */
export function AnalyticsView({ transport }: { transport: ConsoleTransport }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | undefined>(undefined);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    setData(undefined);
    void transport.analytics(days).then((result) => {
      if (!live) return;
      if (result.value) {
        setData(result.value);
        setProblem('');
      } else setProblem(result.blockers?.[0] ?? 'That did not load. Try again');
    });
    return () => {
      live = false;
    };
  }, [transport, days]);

  return (
    <>
      <nav className="vendor-filters" aria-label="Range">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className={range === days ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
            onClick={() => setDays(range)}
          >
            Last {range} days
          </button>
        ))}
      </nav>
      {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}
      {!data && !problem ? <p className="vendor-muted">Loading…</p> : null}
      {data ? (
        <>
          <section className="vendor-stats">
            <Tile label="Guest requests you were shown" value={String(data.requests)} />
            <Tile label="Offers you sent" value={String(data.offers)} />
            <Tile label="Bookings" value={String(data.booked)} />
            <Tile label="Offers that booked" value={data.winRate === null ? '—' : `${data.winRate}%`} />
            <Tile label="Paid in the app" value={formatCents(data.paidCents)} />
            <Tile label="You receive" value={formatCents(data.netCents)} />
            <Tile label="To collect at the venue" value={formatCents(data.payAtVenueCents)} />
            <Tile label="Refunds" value={String(data.refunds)} />
          </section>
          <section className="vendor-card">
            <h2 className="vendor-section-title">What sold</h2>
            {data.top.length === 0 ? (
              <p className="vendor-muted">No bookings in this range yet.</p>
            ) : (
              <ul className="vendor-reasons">
                {data.top.map((row) => (
                  <li key={row.windowId}>
                    {row.title}: {row.booked} booked · {formatCents(row.valueCents)}
                  </li>
                ))}
              </ul>
            )}
            <p className="vendor-muted">Declined requests: {data.declined}.</p>
          </section>
        </>
      ) : null}
    </>
  );
}

function payoutLine(payout?: PayoutAccount): string {
  if (!payout) return 'Not set up yet. Guests can only pay at the venue until you connect a payout account.';
  if (payout.status === 'active') return `Active${payout.last4 ? `, paying out to the account ending ${payout.last4}` : ''}.`;
  if (payout.status === 'restricted') return 'Paused by the processor. Finish the steps it asks for.';
  return 'Being reviewed by the processor.';
}

/** Where the money goes: the payout account and every paid booking. */
export function PayoutsView({
  transport,
  busy,
  onStartPayout,
}: {
  transport: ConsoleTransport;
  busy: boolean;
  onStartPayout: () => void;
}) {
  const [data, setData] = useState<Payouts | undefined>(undefined);
  const [problem, setProblem] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    void transport.payouts().then((result) => {
      if (!live) return;
      if (result.value) setData(result.value);
      else setProblem(result.blockers?.[0] ?? 'That did not load. Try again');
    });
    return () => {
      live = false;
    };
  }, [transport]);

  const openDashboard = async () => {
    setOpening(true);
    const result = await transport.payoutDashboard();
    setOpening(false);
    if (result.value) window.open(result.value, '_blank', 'noopener,noreferrer');
    else setProblem(result.blockers?.[0] ?? 'That did not open. Try again');
  };

  const payout = data?.payout;

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">Payout account</h2>
        {!data && !problem ? <p className="vendor-muted">Loading…</p> : null}
        {data ? <p className="vendor-muted">{payoutLine(payout)}</p> : null}
        {payout?.detail ? <p className="vendor-muted">{payout.detail}</p> : null}
        <div className="vendor-demand-actions">
          {data && payout?.status !== 'active' ? (
            <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={onStartPayout}>
              {payout ? 'Continue setup' : 'Set up payouts'}
            </button>
          ) : null}
          {payout?.status === 'active' ? (
            <button type="button" className="vendor-chip" disabled={opening} onClick={() => void openDashboard()}>
              {opening ? 'Opening…' : 'Open Stripe dashboard ↗'}
            </button>
          ) : null}
        </div>
        {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}
      </section>

      {data ? (
        <>
          <section className="vendor-stats">
            <Tile label="You received" value={formatCents(data.totals.netCents)} />
            <Tile label="Bytspot fee" value={formatCents(data.totals.feeCents)} />
            <Tile label="Paid bookings" value={String(data.totals.bookings)} />
            <Tile label="Refunded" value={String(data.totals.refunds)} />
          </section>
          <section className="vendor-card">
            <h2 className="vendor-section-title">Paid bookings</h2>
            {data.lines.length === 0 ? (
              <p className="vendor-muted">No bookings paid in the app yet. Bookings paid at the venue do not show here.</p>
            ) : (
              <ul className="vendor-demand-list">
                {data.lines.map((line) => (
                  <li key={line.id} className="vendor-card">
                    <div className="vendor-card-top">
                      <strong>{line.title}</strong>
                      <span className="vendor-muted">{line.status === 'refunded' ? 'Refunded' : formatCents(line.netCents, line.currency)}</span>
                    </div>
                    <p className="vendor-muted">
                      {line.paidAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · guest paid{' '}
                      {formatCents(line.amountCents, line.currency)} · fee {formatCents(line.feeCents, line.currency)}
                      {line.refundReason ? ` · ${line.refundReason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="vendor-muted">Stripe sends the money to your bank on its own schedule. The Stripe dashboard shows each transfer.</p>
          </section>
        </>
      ) : null}
    </>
  );
}
