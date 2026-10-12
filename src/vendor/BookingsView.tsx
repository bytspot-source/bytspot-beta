import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BAND_TIERS,
  bandFormLabel,
  formatCents,
  readBandSerial,
  readPassCode,
  sameLocalDay,
  type Band,
  type Booking,
  type BookingMoveId,
  type BookingsWhen,
  type ConsoleTransport,
  type MemberVisits,
} from './consoleTransport';
import type { VendorSession } from './seller';

function timeLabel(booking: Booking): string {
  return booking.startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: booking.timezone });
}

function dayLabel(booking: Booking): string {
  return booking.startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: booking.timezone });
}

function guestsLabel(booking: Booking): string {
  const party = `${booking.partySize} ${booking.partySize === 1 ? 'guest' : 'guests'}`;
  return booking.guestName ? `${booking.guestName} · ${party}` : party;
}

function paidLabel(booking: Booking): string {
  if (booking.paid === 'paid') return 'Paid in the app';
  if (booking.paid === 'refunded') return 'Refunded';
  return `${formatCents(booking.priceCents)} at the venue`;
}

const STATE_LABELS: Record<Booking['state'], string> = {
  upcoming: 'Expected',
  checked_in: 'Checked in',
  no_show: 'No-show',
  past: 'Not checked in',
};

function useBookings(transport: ConsoleTransport, when: BookingsWhen) {
  const [rows, setRows] = useState<Booking[] | undefined>(undefined);
  const [problem, setProblem] = useState('');

  const load = useCallback(async () => {
    const result = await transport.bookings(when);
    if (result.value) {
      setRows(result.value);
      setProblem('');
    } else setProblem(result.blockers?.[0] ?? 'That did not load. Try again');
  }, [transport, when]);

  useEffect(() => {
    setRows(undefined);
    void load();
  }, [load]);

  return { rows, setRows, problem, setProblem, reload: load };
}

function BookingCard({
  booking,
  canCheckIn,
  busy,
  onMove,
}: {
  booking: Booking;
  canCheckIn: boolean;
  busy: boolean;
  onMove?: (operation: BookingMoveId) => void;
}) {
  const open = booking.state === 'upcoming' || booking.state === 'past';
  const started = booking.startsAt.getTime() <= Date.now();
  return (
    <li className="vendor-card">
      <div className="vendor-card-top">
        <strong>
          {timeLabel(booking)} · {booking.title}
        </strong>
        <span className="vendor-muted">{STATE_LABELS[booking.state]}</span>
      </div>
      <p className="vendor-muted">
        {guestsLabel(booking)} · {booking.where} · {booking.durationMins} min · {paidLabel(booking)}
      </p>
      {booking.note ? <p className="vendor-muted">“{booking.note}”</p> : null}
      {canCheckIn && onMove && open ? (
        <div className="vendor-demand-actions">
          {booking.state === 'upcoming' ? (
            <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={() => onMove('CHECK_IN')}>
              Check in
            </button>
          ) : null}
          {started ? (
            <button type="button" className="vendor-chip" disabled={busy} onClick={() => onMove('NO_SHOW')}>
              Mark no-show
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Upcoming and recent bookings, grouped by day, with check-in. */
export function BookingsView({ session, transport }: { session: VendorSession; transport: ConsoleTransport }) {
  const [when, setWhen] = useState<BookingsWhen>('upcoming');
  const { rows, setRows, problem, setProblem } = useBookings(transport, when);
  const [busy, setBusy] = useState(false);
  const canCheckIn = session.capabilities.has('CHECK_IN');

  const move = async (id: string, operation: BookingMoveId) => {
    setBusy(true);
    const result = await transport.moveBooking(id, operation);
    setBusy(false);
    if (result.value) {
      setRows((current) => current?.map((row) => (row.id === id ? result.value : row)));
      setProblem('');
    } else setProblem(result.blockers?.[0] ?? 'That did not go through. Try again');
  };

  const days: { label: string; rows: Booking[] }[] = [];
  for (const row of rows ?? []) {
    const label = dayLabel(row);
    const last = days[days.length - 1];
    if (last?.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }

  return (
    <>
      <nav className="vendor-filters" aria-label="Which bookings">
        {(['upcoming', 'past'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={option === when ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
            onClick={() => setWhen(option)}
          >
            {option === 'upcoming' ? 'Upcoming' : 'Last 30 days'}
          </button>
        ))}
      </nav>
      {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}
      {!rows && !problem ? <p className="vendor-muted">Loading…</p> : null}
      {rows && rows.length === 0 ? (
        <section className="vendor-card">
          <p className="vendor-muted">
            {when === 'upcoming'
              ? 'No bookings coming up. When a guest accepts one of your offers it appears here.'
              : 'No bookings in the last 30 days.'}
          </p>
        </section>
      ) : null}
      {days.map((day) => (
        <section key={day.label}>
          <h2 className="vendor-section-title">{day.label}</h2>
          <ul className="vendor-demand-list">
            {day.rows.map((row) => (
              <BookingCard key={row.id} booking={row} canCheckIn={canCheckIn} busy={busy} onMove={(operation) => void move(row.id, operation)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const PASS_VERDICTS: Record<Booking['pass'], string> = {
  ISSUED: 'Valid pass',
  ADMITTED: 'Already checked in',
  EXPIRED: 'This booking has ended',
  REVOKED: 'Not valid: cancelled or marked as a no-show',
};

export interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
}

export function qrDetector(formats: string[] = ['qr_code']): Detector | undefined {
  const Ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
  return Ctor ? new Ctor({ formats }) : undefined;
}

/** The supplier prints a QR code or a barcode on a band; read either. */
export const BAND_CODE_FORMATS = ['qr_code', 'code_128', 'code_39', 'data_matrix'];

interface NdefRecord {
  recordType: string;
  data?: DataView;
}

export interface NdefReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: { message: { records: NdefRecord[] } }) => void) | null;
  onreadingerror: (() => void) | null;
}

/** Web NFC, where the browser has it (Chrome on Android). */
export function ndefReader(): NdefReader | undefined {
  const Ctor = (window as unknown as { NDEFReader?: new () => NdefReader }).NDEFReader;
  return Ctor ? new Ctor() : undefined;
}

function tierName(band: Band): string | undefined {
  return BAND_TIERS.find((entry) => entry.id === band.tier)?.label;
}

function formNoun(band: Band): string {
  return bandFormLabel(band.form).toLowerCase();
}

function shortDate(at: Date): string {
  return at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** What staff read off an item: its number, type, tier for a band, and who it is linked to. */
function bandLine(band: Band): string {
  return [
    band.serial,
    bandFormLabel(band.form),
    band.form === 'band' ? tierName(band) : undefined,
    band.form === 'epoxy' && band.vendorCode ? band.vendorCode : undefined,
    band.holder ? `Linked to ${band.holder}` : undefined,
    band.holder && band.linkedUntil ? `until ${shortDate(band.linkedUntil)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function DoorBooking({
  booking,
  band,
  canCheckIn,
  busy,
  onCheckIn,
  children,
}: {
  booking: Booking;
  band?: Band;
  canCheckIn: boolean;
  busy: boolean;
  onCheckIn: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className={booking.pass === 'ISSUED' ? 'vendor-card vendor-card-verified' : 'vendor-card'}>
      <h2 className="vendor-section-title">{PASS_VERDICTS[booking.pass]}</h2>
      <p>
        <strong>{guestsLabel(booking)}</strong>
      </p>
      {band ? <p className="vendor-muted">{bandLine(band)}</p> : null}
      <p className="vendor-muted">
        {dayLabel(booking)} · {timeLabel(booking)} · {booking.title} · {booking.where}
      </p>
      <p className="vendor-muted">{paidLabel(booking)}</p>
      {booking.note ? <p className="vendor-muted">“{booking.note}”</p> : null}
      {booking.pass === 'ADMITTED' && booking.checkedInAt ? (
        <p className="vendor-muted">
          Checked in at {booking.checkedInAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: booking.timezone })}.
        </p>
      ) : null}
      <div className="vendor-demand-actions">
        {booking.pass === 'ISSUED' && canCheckIn ? (
          <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={onCheckIn}>
            Check in
          </button>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/**
 * The door: reads a guest's pass, or a band, card, fob or table tag, by
 * camera, by tap or by typing, then checks them in. A paid ticket or a booking
 * read by its pass can have a carried item linked to it, so the guest only taps
 * next time. Either way each booking is checked in once.
 */
export function ScannerView({ session, transport }: { session: VendorSession; transport: ConsoleTransport }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Booking[]>([]);
  const [band, setBand] = useState<Band | undefined>(undefined);
  const [member, setMember] = useState<MemberVisits | undefined>(undefined);
  const [linking, setLinking] = useState(false);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tapping, setTapping] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canCheckIn = session.capabilities.has('CHECK_IN');
  const cameraSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  const tapSupported = typeof window !== 'undefined' && 'NDEFReader' in window;
  const linkFrom = !band && found.length === 1 ? found[0] : undefined;

  const check = useCallback(
    async (raw: string) => {
      setNote('');
      setMember(undefined);
      const pass = readPassCode(raw);
      const serial = pass ? undefined : readBandSerial(raw);
      if (!pass && !serial) {
        setFound([]);
        setBand(undefined);
        setProblem('That is not a Bytspot pass, band or tag. A pass code is 8 letters and numbers; a band or tag number looks like BYT424-0301.');
        return;
      }
      setBusy(true);
      if (pass) {
        const result = await transport.verifyPass(pass);
        setBusy(false);
        setBand(undefined);
        setFound(result.value ? [result.value] : []);
        setProblem(result.value ? '' : (result.blockers?.[0] ?? 'That did not load. Try again'));
        return;
      }
      const result = await transport.readBand(serial!);
      setBusy(false);
      setBand(result.value?.band);
      setFound(result.value?.bookings ?? []);
      setMember(result.value?.member);
      setProblem(result.value ? '' : (result.blockers?.[0] ?? 'That did not load. Try again'));
    },
    [transport],
  );

  const link = useCallback(
    async (raw: string) => {
      const serial = readBandSerial(raw);
      if (!serial || !linkFrom) {
        setProblem('That is not a Bytspot band, card or fob. Tap it again, scan its code or type its number, like BYT424-0301.');
        return;
      }
      setBusy(true);
      const result = await transport.linkBand(serial, linkFrom.id);
      setBusy(false);
      if (!result.value) {
        setProblem(result.blockers?.[0] ?? 'That did not go through. Try again');
        return;
      }
      setBand(result.value);
      setLinking(false);
      setCode('');
      setProblem('');
      setNote(`${serial} is linked to ${result.value.holder ?? 'this guest'}. Next time, tap the ${formNoun(result.value)}.`);
    },
    [transport, linkFrom],
  );

  const read = useCallback((raw: string) => (linking ? link(raw) : check(raw)), [linking, link, check]);

  useEffect(() => {
    if (!scanning) return undefined;
    let detector: Detector | undefined;
    try {
      detector = qrDetector(BAND_CODE_FORMATS);
    } catch {
      detector = qrDetector();
    }
    let stream: MediaStream | undefined;
    let frame = 0;
    let live = true;

    const tick = async () => {
      if (!live || !videoRef.current || !detector) return;
      try {
        const hit = (await detector.detect(videoRef.current)).find((row) => row.rawValue)?.rawValue;
        if (hit) {
          setScanning(false);
          setCode(readPassCode(hit) ?? readBandSerial(hit) ?? '');
          await read(hit);
          return;
        }
      } catch {
        // A frame that is not ready yet; try the next one.
      }
      frame = window.requestAnimationFrame(() => void tick());
    };

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (media) => {
        stream = media;
        if (!live || !videoRef.current) return;
        videoRef.current.srcObject = media;
        await videoRef.current.play();
        void tick();
      })
      .catch(() => {
        setScanning(false);
        setProblem('The camera did not open. Allow camera access, or type the code instead.');
      });

    return () => {
      live = false;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, read]);

  useEffect(() => {
    if (!tapping) return undefined;
    const reader = ndefReader();
    if (!reader) return undefined;
    const stop = new AbortController();
    reader.onreading = (event) => {
      const record = event.message.records.find((entry) => entry.recordType === 'url' && entry.data);
      const raw = record?.data ? new TextDecoder().decode(record.data) : '';
      setTapping(false);
      setCode(readBandSerial(raw) ?? '');
      void read(raw);
    };
    reader.onreadingerror = () => setProblem('It could not be read. Hold it still against the phone and try again.');
    reader.scan({ signal: stop.signal }).catch(() => {
      setTapping(false);
      setProblem('NFC did not start. Allow NFC, or type the number instead.');
    });
    return () => stop.abort();
  }, [tapping, read]);

  const checkIn = async (booking: Booking) => {
    setBusy(true);
    const result = await transport.moveBooking(booking.id, 'CHECK_IN');
    setBusy(false);
    if (result.value) {
      const moved = result.value;
      setFound((current) => current.map((row) => (row.id === moved.id ? moved : row)));
      setProblem('');
    } else setProblem(result.blockers?.[0] ?? 'That did not go through. Try again');
  };

  const logVisit = async () => {
    if (!band) return;
    setBusy(true);
    const result = await transport.logVisit(band.serial);
    setBusy(false);
    if (!result.value) {
      setProblem(result.blockers?.[0] ?? 'That did not go through. Try again');
      return;
    }
    setMember(result.value.member);
    setProblem('');
    setNote(result.value.alreadyLogged ? 'This visit was already logged.' : `Visit logged for ${band.holder ?? 'this member'}.`);
  };

  const reset = () => {
    setFound([]);
    setBand(undefined);
    setMember(undefined);
    setLinking(false);
    setCode('');
    setProblem('');
    setNote('');
  };

  const canLink = canCheckIn && !!linkFrom && linkFrom.paid !== 'refunded' && (linkFrom.pass === 'ISSUED' || linkFrom.pass === 'ADMITTED');

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">{linking ? 'Link a band, card or fob' : 'Check a pass, band or tag'}</h2>
        <p className="vendor-muted">
          {linking
            ? `Tap it, scan its code or type its number. It will find ${linkFrom?.guestName ?? 'this guest'}'s bookings from now on.`
            : 'Guests find their pass under My Requests in the Bytspot app. A guest with a linked band, card or fob can tap it instead.'}
        </p>
        {scanning ? <video ref={videoRef} className="vendor-scanner-video" muted playsInline /> : null}
        <div className="vendor-demand-actions">
          {cameraSupported ? (
            <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={() => setScanning((on) => !on)}>
              {scanning ? 'Stop camera' : 'Scan with camera'}
            </button>
          ) : null}
          {tapSupported ? (
            <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={() => setTapping((on) => !on)}>
              {tapping ? 'Stop' : 'Tap a band or tag'}
            </button>
          ) : null}
          {linking ? (
            <button type="button" className="vendor-chip" onClick={() => setLinking(false)}>
              Cancel
            </button>
          ) : null}
        </div>
        {tapping ? <p className="vendor-muted">Hold it against the back of the phone.</p> : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void read(code);
          }}
        >
          <label className="vendor-field">
            <span>{linking ? 'Band, card or fob number' : 'Pass code, or band or tag number'}</span>
            <input
              value={code}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={linking ? 60 : 300}
              placeholder={linking ? 'BYT424-0301' : 'ABCD-2345 or BYT424-0301'}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" className="vendor-chip" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : linking ? 'Link' : 'Check'}
          </button>
        </form>
        {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}
        {note ? <p className="vendor-muted">{note}</p> : null}
      </section>

      {band && member ? (
        <section className="vendor-card vendor-card-verified">
          <h2 className="vendor-section-title">Member {band.holder ?? ''}</h2>
          <p className="vendor-muted">{bandLine(band)}</p>
          <p className="vendor-muted">
            {member.visits === 1 ? '1 visit' : `${member.visits} visits`}
            {member.lastVisitAt ? ` · last ${shortDate(member.lastVisitAt)}` : ''}
            {band.linkedAt ? ` · member since ${band.linkedAt.toLocaleDateString()}` : ''}
          </p>
          <div className="vendor-demand-actions">
            {canCheckIn ? (
              <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={() => void logVisit()}>
                Log visit
              </button>
            ) : null}
            {found.length === 0 ? (
              <button type="button" className="vendor-chip" onClick={reset}>
                Next guest
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {band && !member && found.length === 0 ? (
        <section className="vendor-card">
          <h2 className="vendor-section-title">
            {band.form === 'epoxy'
              ? 'Table tag'
              : band.holder
                ? `No ticket or booking for ${band.holder} right now`
                : `${bandFormLabel(band.form)} not linked yet`}
          </h2>
          <p className="vendor-muted">{bandLine(band)}</p>
          <p className="vendor-muted">
            {band.form === 'epoxy'
              ? `It stays at its table${band.place ? ` at ${band.place}` : ''}. Diners tap it with their own phone to find their booking.`
              : band.holder
                ? `This ${formNoun(band)} finds a paid ticket or a booking for now at its place. Ask for the guest's pass, or they can book from your link.`
                : `Scan the guest's pass, then tap Link and tap this ${formNoun(band)}.`}
          </p>
          <div className="vendor-demand-actions">
            <button type="button" className="vendor-chip" onClick={reset}>
              Next guest
            </button>
          </div>
        </section>
      ) : null}

      {found.map((booking, index) => (
        <DoorBooking
          key={booking.id}
          booking={booking}
          band={index === 0 && !member ? band : undefined}
          canCheckIn={canCheckIn}
          busy={busy}
          onCheckIn={() => void checkIn(booking)}
        >
          {canLink && !linking && booking.id === linkFrom?.id ? (
            <button
              type="button"
              className="vendor-chip"
              disabled={busy}
              onClick={() => {
                setLinking(true);
                setCode('');
                setProblem('');
                setNote('');
              }}
            >
              Link a band, card or fob
            </button>
          ) : null}
          {index === found.length - 1 ? (
            <button type="button" className="vendor-chip" onClick={reset}>
              Next guest
            </button>
          ) : null}
        </DoorBooking>
      ))}
    </>
  );
}

/** Today at a glance, and the tabs that need attention. */
export function HomeView({
  session,
  transport,
  openRequests,
  shortcuts,
  onOpen,
}: {
  session: VendorSession;
  transport: ConsoleTransport;
  openRequests: number;
  /** The tabs this seat can open, by id and label. */
  shortcuts: { id: string; label: string }[];
  onOpen: (id: string) => void;
}) {
  const { rows, problem } = useBookings(transport, 'upcoming');
  const now = new Date();
  const today = (rows ?? []).filter((row) => sameLocalDay(row.startsAt, now, row.timezone));
  const expected = today.filter((row) => row.state === 'upcoming');
  const next = expected[0];
  const can = (id: string) => shortcuts.some((item) => item.id === id);

  return (
    <>
      <section className="vendor-stats">
        <div className="vendor-card">
          <strong>{rows ? String(today.length) : '…'}</strong>
          <p className="vendor-muted">Bookings today</p>
        </div>
        <div className="vendor-card">
          <strong>{rows ? String(expected.reduce((total, row) => total + row.partySize, 0)) : '…'}</strong>
          <p className="vendor-muted">Guests still expected today</p>
        </div>
        <div className="vendor-card">
          <strong>{rows ? String(today.filter((row) => row.state === 'checked_in').length) : '…'}</strong>
          <p className="vendor-muted">Checked in today</p>
        </div>
        {can('demand') ? (
          <div className="vendor-card">
            <strong>{String(openRequests)}</strong>
            <p className="vendor-muted">Guest requests waiting</p>
          </div>
        ) : null}
      </section>

      {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}

      <section className="vendor-card">
        <h2 className="vendor-section-title">Next up</h2>
        {!rows && !problem ? <p className="vendor-muted">Loading…</p> : null}
        {rows && !next ? <p className="vendor-muted">Nobody else is expected today.</p> : null}
        {next ? (
          <>
            <p>
              <strong>
                {timeLabel(next)} · {next.title}
              </strong>
            </p>
            <p className="vendor-muted">
              {guestsLabel(next)} · {next.where}
            </p>
          </>
        ) : null}
      </section>

      <section className="vendor-card">
        <h2 className="vendor-section-title">Go to</h2>
        <div className="vendor-demand-actions">
          {can('demand') && openRequests > 0 ? (
            <button type="button" className="vendor-chip vendor-chip-on" onClick={() => onOpen('demand')}>
              Answer {openRequests} {openRequests === 1 ? 'request' : 'requests'}
            </button>
          ) : null}
          {shortcuts
            .filter((item) => item.id !== 'home')
            .map((item) => (
              <button key={item.id} type="button" className="vendor-chip" onClick={() => onOpen(item.id)}>
                {item.label}
              </button>
            ))}
        </div>
        <p className="vendor-muted">Signed in to {session.seller.legalName}.</p>
      </section>
    </>
  );
}
