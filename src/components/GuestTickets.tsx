import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { trpc } from '../utils/trpc';
import { passLabel, passQrValue } from '../utils/guestAsk';
import { ticketsTransport, ticketWhen, type MyTicket, type TicketsClient } from '../utils/guestTickets';

const POLL_MS = 15_000;

/** Tickets the guest bought from a business, each with the pass shown at the door. Hidden when there are none. */
export function GuestTickets() {
  const transport = useMemo(() => ticketsTransport(trpc as unknown as TicketsClient), []);
  const [rows, setRows] = useState<MyTicket[]>([]);

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
