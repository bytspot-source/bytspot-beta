import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';

type Count = { total: number; last30: number };
type View = {
  name: string; address: string; bookingFeePercent: number; joinUrl: string;
  numbers: { checkIns: Count; bookingTaps: Count; planAdds: Count; bookedByGuests: Count };
};

const STATS: { key: keyof View['numbers']; label: string }[] = [
  { key: 'bookingTaps', label: 'tapped to book' },
  { key: 'planAdds', label: 'added you to a Plan' },
  { key: 'checkIns', label: 'checked in at your place' },
  { key: 'bookedByGuests', label: 'said they booked' },
];

const page: React.CSSProperties = { minHeight: '100vh', background: '#0b0b12', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '40px 20px', boxSizing: 'border-box' };
const card: React.CSSProperties = { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 };
const muted: React.CSSProperties = { color: 'rgba(255,255,255,.65)', fontSize: 15, lineHeight: 1.5, margin: 0 };

/** What an admin sends a listed place that is not on Bytspot yet: what Bytspot guests did there, and how to join. */
export function PitchPage({ code }: { code: string | null }) {
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(!code);

  useEffect(() => {
    if (!code) return;
    trpc.pitch.view.query({ code }).then((result: View) => setView(result)).catch(() => setMissing(true));
  }, [code]);

  if (missing) {
    return (
      <main style={page}><div style={card}>
        <h1 style={{ margin: 0 }}>This link isn't available</h1>
        <p style={muted}>It may have expired, or the place may already be on Bytspot. Ask whoever sent it for a new one.</p>
      </div></main>
    );
  }
  if (!view) return <main style={page}><div style={card}><p style={muted}>Loading…</p></div></main>;

  const shown = STATS.filter((s) => view.numbers[s.key].last30 > 0 || view.numbers[s.key].total > 0);
  return (
    <main style={page}><div style={card}>
      <p style={{ ...muted, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 12 }}>Bytspot for business</p>
      <div>
        <h1 style={{ margin: '0 0 6px' }}>{view.name}</h1>
        <p style={muted}>{view.address}</p>
      </div>
      <p style={{ ...muted, color: '#fff' }}>People already use Bytspot to find and plan nights out at your place.</p>
      {shown.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {shown.map((s) => (
            <li key={s.key} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '14px 16px' }}>
              <strong style={{ fontSize: 28 }}>{view.numbers[s.key].last30}</strong>
              <span style={{ marginLeft: 8 }}>{s.label} in the last 30 days</span>
              <p style={{ ...muted, fontSize: 13 }}>{view.numbers[s.key].total} in total</p>
            </li>
          ))}
        </ul>
      ) : (
        <p style={muted}>You're listed on Bytspot, so guests in Atlanta can find you and add you to their Plans.</p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ ...muted, color: '#fff', fontWeight: 600 }}>Join Bytspot to:</p>
        <p style={muted}>• take bookings directly in Bytspot instead of sending guests elsewhere</p>
        <p style={muted}>• be picked when guests make a Plan, and see who's planning to come</p>
        <p style={muted}>• get paid out to your bank through Stripe</p>
      </div>
      <p style={muted}>Bytspot keeps {view.bookingFeePercent}% of bookings made in Bytspot. There's no monthly fee.</p>
      <a href={view.joinUrl} style={{ background: '#fff', color: '#0b0b12', textAlign: 'center', padding: '14px 18px', borderRadius: 14, fontWeight: 700, textDecoration: 'none' }}>
        Join Bytspot for business
      </a>
      <p style={{ ...muted, fontSize: 13 }}>Counts are guests using Bytspot. Check-ins count only when the guest was at your place.</p>
    </div></main>
  );
}
