import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';

type Week = {
  weekStart: string; activeUsers: number; newUsers: number; newFromInvites: number; plansCreated: number;
  plansWithFriends: number; planJoins: number; partyJoins: number; shareViews: number; bookingTaps: number; checkIns: number;
};
type Cohort = { weekStart: string; signedUp: number; day1: number | null; week1: number | null; month1: number | null };
type Range = '8w' | '3m' | '6m' | '12m';
type Report = { generatedAt: string; bucket?: 'week' | 'month'; trackingSince: string | null; totalMembers: number; weeks: Week[]; retention: Cohort[] };

const RANGES: { id: Range; label: string }[] = [
  { id: '8w', label: '8 weeks' }, { id: '3m', label: '3 months' }, { id: '6m', label: '6 months' }, { id: '12m', label: '12 months' },
];

const ROWS: { key: keyof Week; label: string; hint: string }[] = [
  { key: 'activeUsers', label: 'Active members', hint: 'Used the signed-in app at least once that week' },
  { key: 'newUsers', label: 'New members', hint: 'Accounts created' },
  { key: 'newFromInvites', label: 'New from invites', hint: "Joined a friend's Plan or Party within a day of signing up, or used a member's invite code" },
  { key: 'shareViews', label: 'Share pages opened', hint: 'Plan and Party links opened in a browser (link previews and app opens not counted)' },
  { key: 'planJoins', label: 'Friends joined Plans', hint: "People who joined someone's Plan" },
  { key: 'partyJoins', label: 'Party RSVPs', hint: 'Requests and RSVPs to Parties' },
  { key: 'plansCreated', label: 'Plans made', hint: 'Plans created' },
  { key: 'plansWithFriends', label: 'Plans with friends', hint: 'Plans made that week that at least one friend joined' },
  { key: 'bookingTaps', label: 'Booking taps', hint: 'Taps on a Book on … button' },
  { key: 'checkIns', label: 'Check-ins at the place', hint: 'Check-ins made at the place, not from home' },
];

const weekLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const percent = (value: number | null) => (value === null ? '—' : `${value}%`);

/** Weekly use, invites and whether people come back. Counts only; no member is named. */
export function GrowthTab() {
  const [range, setRange] = useState<Range>('8w');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setReport(null); setError(null);
    trpc.admin.growth.report.query({ range })
      .then((result: Report) => { if (current) setReport(result); })
      .catch((err: unknown) => { if (current) setError((err as { message?: string })?.message || 'That did not load. Try again.'); });
    return () => { current = false; };
  }, [range]);

  const picker = (
    <div className="admin-inline" role="group" aria-label="Range">
      {RANGES.map((r) => (
        <button key={r.id} type="button" className={`admin-button ${range === r.id ? 'primary' : ''}`}
          aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
      ))}
    </div>
  );

  if (error) return <section className="admin-card">{picker}<p className="admin-warn">{error}</p></section>;
  if (!report) return <section className="admin-card">{picker}<p className="admin-muted">Loading…</p></section>;

  const monthly = report.bucket === 'month';
  const columnLabel = monthly ? monthLabel : weekLabel;

  return (
    <>
      <section className="admin-card">
        <h2>Growth, by {monthly ? 'month' : 'week'}</h2>
        {picker}
        <p className="admin-muted">
          {monthly ? 'Calendar months (UTC).' : 'Weeks start on Monday (UTC).'} {report.totalMembers} members in total.{' '}
          {report.trackingSince ? `Active members are counted from ${weekLabel(report.trackingSince)}.` : 'Active members are counted from the first signed-in visit after this update.'}
        </p>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr><th />{report.weeks.map((w) => <th key={w.weekStart}>{columnLabel(w.weekStart)}</th>)}</tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th title={row.hint}>{row.label}</th>
                  {report.weeks.map((w) => <td key={w.weekStart}>{w[row.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-card">
        <h2>Coming back</h2>
        <p className="admin-muted">
          Of the members who signed up each {monthly ? 'month' : 'week'}: who used the app again the next day, within 7 days, and between day 8 and day 30.
          A dash means that window has not passed yet. Only members who signed up after active-member counting began are included.
        </p>
        {report.retention.length === 0 ? <p className="admin-muted">No sign-ups to show yet.</p> : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Signed up</th><th>Members</th><th>Next day</th><th>Within 7 days</th><th>Days 8–30</th></tr></thead>
              <tbody>
                {report.retention.map((c) => (
                  <tr key={c.weekStart}>
                    <th>{monthly ? monthLabel(c.weekStart) : `Week of ${weekLabel(c.weekStart)}`}</th><td>{c.signedUp}</td>
                    <td>{percent(c.day1)}</td><td>{percent(c.week1)}</td><td>{percent(c.month1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
