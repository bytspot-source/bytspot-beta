import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../utils/trpc';
import { passLabel, passQrValue } from '../utils/guestAsk';
import { ticketRefund, ticketsTransport, ticketWhen, type MyTicket, type TicketsClient } from '../utils/guestTickets';

const POLL_MS = 15_000;

/** Tickets the guest bought from a business, each with the pass shown at the door. Hidden when there are none. */
export function GuestTickets() {
  const transport = useMemo(() => ticketsTransport(trpc as unknown as TicketsClient), []);
  const [rows, setRows] = useState<MyTicket[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ orderId: string; text: string } | null>(null);

  const cancel = async (row: MyTicket) => {
    if (cancelling) return;
    if (!window.confirm(`Cancel ${row.title} and get $${(row.priceCents / 100).toFixed(2)} back? Your pass stops working.`)) return;
    setCancelling(row.orderId);
    setProblem(null);
    try {
      await transport.cancel(row.orderId);
      setRows(await transport.mine());
    } catch (error) {
      setProblem({ orderId: row.orderId, text: error instanceof Error && error.message ? error.message : 'Could not cancel. Try again.' });
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    let live = true;
    const load = () =>
      transport
        .mine()
        .then((next) => live && setRows(next))
        .catch(() => {
          /* signed out or offline; the next tick retries */
        });
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [transport]);

  if (!rows.length) return null;

  return (
    <div className="space-y-3" data-testid="guest-tickets">
      <p className="text-[13px] text-slate-300" style={{ fontWeight: 700 }}>TICKETS</p>
      {rows.map((row) => (
        <div key={row.orderId} className="rounded-[16px] border border-slate-600 bg-slate-950 p-4 text-white">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[16px]" style={{ fontWeight: 700 }}>{row.title}</p>
            <span className="text-[12px] text-cyan-300" style={{ fontWeight: 700 }}>
              {row.payment === 'paid' ? (row.checkedIn ? 'Checked in' : 'Paid') : row.payment === 'refunded' ? 'Refunded' : 'Confirming'}
            </span>
          </div>
          <p className="text-[13px] text-slate-300">
            {row.sellerName} · {row.place}
          </p>
          <p className="text-[13px] text-slate-300">{ticketWhen(row)} · ${(row.priceCents / 100).toFixed(2)}</p>
          {row.pass ? (
            <div className="mt-3 flex items-center gap-3 rounded-[10px] bg-white p-3 text-slate-950" data-testid="ticket-pass">
              <QRCodeSVG value={passQrValue(row.pass)} size={96} level="M" aria-label="Ticket QR code" />
              <div>
                <p className="text-[12px] text-slate-600">{row.checkedIn ? 'Checked in' : 'Show this at the door'}</p>
                <p className="font-mono text-[20px] tracking-wider" style={{ fontWeight: 700 }}>{passLabel(row.pass)}</p>
              </div>
            </div>
          ) : null}
          {(() => {
            const refund = ticketRefund(row);
            if (!refund.line) return null;
            return (
              <div className="mt-2 space-y-2">
                <p className="text-[12px] text-slate-400">{refund.line}</p>
                {refund.canCancel ? (
                  <button
                    type="button"
                    onClick={() => void cancel(row)}
                    disabled={cancelling !== null}
                    className="rounded-full border border-slate-500 px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    style={{ fontWeight: 700 }}
                    data-testid="ticket-cancel"
                  >
                    {cancelling === row.orderId ? 'Cancelling…' : 'Cancel & refund'}
                  </button>
                ) : null}
                {problem?.orderId === row.orderId ? (
                  <p className="text-[12px]" style={{ color: '#fda4af' }} role="alert">{problem.text}</p>
                ) : null}
              </div>
            );
          })()}
          {row.payment === 'paying' ? (
            <p className="mt-1 text-[12px] text-slate-400">Waiting for Stripe to confirm the payment. Your pass appears here.</p>
          ) : null}
          {row.payment === 'refunded' ? (
            <p className="mt-1 text-[12px]" style={{ color: '#fda4af' }}>
              Refunded{row.refundReason ? `: ${row.refundReason}` : ''}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
