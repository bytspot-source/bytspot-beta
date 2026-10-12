import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BAND_CODE_FORMATS, ndefReader, qrDetector } from './BookingsView';
import {
  BAND_FORMS,
  BAND_TIERS,
  bandActivationProblems,
  bandFormLabel,
  readBandSerial,
  type Band,
  type BandActivation,
  type BandForm,
  type BandState,
  type BandTier,
  type ConsoleTransport,
} from './consoleTransport';
import type { VendorLocation } from './locations';

const STATE_LABELS: Record<BandState, string> = {
  assigned: 'Not activated',
  active: 'Active',
  lost: 'Lost',
};

const FILTERS: { id: BandState | 'all'; label: string }[] = [
  { id: 'assigned', label: 'Not activated' },
  { id: 'active', label: 'Active' },
  { id: 'lost', label: 'Lost' },
  { id: 'all', label: 'All' },
];

/** How many bands are drawn at once; searching narrows the rest. */
const SHOWN = 100;

function tierLabel(tier?: BandTier): string {
  return BAND_TIERS.find((entry) => entry.id === tier)?.label ?? 'No tier';
}

interface BandSave {
  form: BandForm;
  locationId: string;
  tier: BandTier;
  vendorCode: string;
}

function FormSelect({ value, onChange }: { value: BandForm; onChange: (form: BandForm) => void }) {
  return (
    <label className="vendor-field">
      <span>Type</span>
      <select value={value} onChange={(event) => onChange(event.target.value as BandForm)}>
        {BAND_FORMS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <small className="vendor-muted">{BAND_FORMS.find((entry) => entry.id === value)?.hint}</small>
    </label>
  );
}

function BandRow({
  band,
  places,
  busy,
  onActivate,
  onSave,
  onLost,
}: {
  band: Band;
  places: VendorLocation[];
  busy: boolean;
  onActivate: () => void;
  onSave: (edit: BandSave) => Promise<boolean>;
  onLost: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BandForm>(band.form);
  const [locationId, setLocationId] = useState(band.locationId ?? places[0]?.id ?? '');
  const [tier, setTier] = useState<BandTier>(band.tier ?? 'green');
  const [vendorCode, setVendorCode] = useState(band.vendorCode ?? '');

  const details = [
    bandFormLabel(band.form),
    band.form === 'band' || band.tier ? tierLabel(band.tier) : undefined,
    band.place,
    band.vendorCode ? `Your code ${band.vendorCode}` : undefined,
    band.holder ? `Linked to ${band.holder}` : undefined,
    band.holder && band.linkedUntil ? `until ${band.linkedUntil.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : undefined,
  ].filter(Boolean);

  return (
    <li className="vendor-card">
      <div className="vendor-card-top">
        <strong>{band.serial}</strong>
        <span className="vendor-muted">{STATE_LABELS[band.state]}</span>
      </div>
      {band.state === 'assigned' ? (
        <p className="vendor-muted">Opens nothing until you activate it.</p>
      ) : (
        <p className="vendor-muted">{details.join(' · ')}</p>
      )}
      {band.state === 'lost' && band.lostAt ? (
        <p className="vendor-muted">Marked lost on {band.lostAt.toLocaleDateString()}. It no longer opens anything.</p>
      ) : null}
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSave({ form, locationId, tier, vendorCode }).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          <FormSelect value={form} onChange={setForm} />
          <label className="vendor-field">
            <span>Place</span>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.label}
                </option>
              ))}
            </select>
          </label>
          {form === 'band' ? (
            <label className="vendor-field">
              <span>Tier</span>
              <select value={tier} onChange={(event) => setTier(event.target.value as BandTier)}>
                {BAND_TIERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="vendor-field">
            <span>{form === 'epoxy' ? 'Table (optional)' : 'Your code (optional)'}</span>
            <input
              value={vendorCode}
              maxLength={40}
              placeholder={form === 'epoxy' ? 'Table 4' : 'VIP-017'}
              onChange={(event) => setVendorCode(event.target.value)}
            />
          </label>
          <div className="vendor-demand-actions">
            <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="vendor-chip" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : band.state === 'lost' ? null : (
        <div className="vendor-demand-actions">
          {band.state === 'assigned' ? (
            <button type="button" className="vendor-chip vendor-chip-on" onClick={onActivate}>
              Activate
            </button>
          ) : (
            <button type="button" className="vendor-chip" onClick={() => setEditing(true)}>
              Change
            </button>
          )}
          <button type="button" className="vendor-chip" disabled={busy} onClick={onLost}>
            Mark lost
          </button>
        </div>
      )}
    </li>
  );
}

/** The bands, cards, fobs and table tags this business holds: activate them, change them, mark them lost. */
export function BandsView({ transport, locations }: { transport: ConsoleTransport; locations: VendorLocation[] }) {
  const places = locations.filter((location) => location.state !== 'CLOSED');
  const [rows, setRows] = useState<Band[] | undefined>(undefined);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<BandState | 'all'>('assigned');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BandActivation>({ band: '', form: 'band', locationId: places[0]?.id ?? '', tier: 'green' });
  const [scanning, setScanning] = useState(false);
  const [tapping, setTapping] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bandInputRef = useRef<HTMLInputElement>(null);
  const cameraSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  const tapSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  useEffect(() => {
    let live = true;
    void transport.bands().then((result) => {
      if (!live) return;
      if (result.value) setRows(result.value);
      else setProblems(result.blockers ?? ['That did not load. Try again']);
    });
    return () => {
      live = false;
    };
  }, [transport]);

  const replace = (band: Band) => setRows((current) => current?.map((row) => (row.id === band.id ? band : row)));

  const read = useCallback((raw: string) => {
    const serial = readBandSerial(raw);
    setDraft((current) => ({ ...current, band: serial ?? raw }));
    setProblems(serial ? [] : ['That is not a Bytspot band or tag. Try again, or type its number.']);
  }, [setDraft, setProblems]);

  useEffect(() => {
    if (!scanning) return undefined;
    let detector: ReturnType<typeof qrDetector>;
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
        const hit = (await detector.detect(videoRef.current)).find((code) => code.rawValue)?.rawValue;
        if (hit) {
          setScanning(false);
          read(hit);
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
        setProblems(['The camera did not open. Allow camera access, or type the band number instead.']);
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
      setTapping(false);
      read(record?.data ? new TextDecoder().decode(record.data) : '');
    };
    reader.onreadingerror = () => setProblems(['The band could not be read. Hold it still against the phone and try again.']);
    reader.scan({ signal: stop.signal }).catch(() => {
      setTapping(false);
      setProblems(['NFC did not start. Allow NFC, or type the band number instead.']);
    });
    return () => stop.abort();
  }, [tapping, read]);

  const activate = async () => {
    const sent = { ...draft, tier: draft.form === 'band' ? draft.tier : undefined };
    const local = bandActivationProblems(sent);
    if (local.length) {
      setProblems(local);
      return;
    }
    setBusy(true);
    const result = await transport.activateBand(sent);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      setNote('');
      return;
    }
    const { band, alreadyActive } = result.value;
    replace(band);
    setProblems([]);
    setNote(alreadyActive ? `${band.serial} was already active.` : `${band.serial} is active.`);
    setDraft((current) => ({ ...current, band: '', vendorCode: '' }));
    bandInputRef.current?.focus();
  };

  const save = async (band: Band, edit: BandSave): Promise<boolean> => {
    setBusy(true);
    const result = await transport.editBand(band.id, {
      ...(edit.form !== band.form ? { form: edit.form } : {}),
      locationId: edit.locationId,
      ...(edit.form === 'band' ? { tier: edit.tier } : {}),
      vendorCode: edit.vendorCode.trim() || null,
    });
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      return false;
    }
    replace(result.value);
    setProblems([]);
    setNote(`${band.serial} saved.`);
    return true;
  };

  const markLost = async (band: Band) => {
    if (!window.confirm(`Mark ${band.serial} as lost? It stops opening anything, and this cannot be undone.`)) return;
    setBusy(true);
    const result = await transport.markBandLost(band.id);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not go through. Try again']);
      return;
    }
    replace(result.value);
    setProblems([]);
    setNote(`${band.serial} is marked lost.`);
  };

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      assigned: all.filter((row) => row.state === 'assigned').length,
      active: all.filter((row) => row.state === 'active').length,
      lost: all.filter((row) => row.state === 'lost').length,
      all: all.length,
    };
  }, [rows]);

  const matching = useMemo(() => {
    const query = search.trim().toUpperCase();
    return (rows ?? []).filter(
      (row) =>
        (filter === 'all' || row.state === filter) &&
        (!query || row.serial.includes(query) || (row.vendorCode ?? '').toUpperCase().includes(query)),
    );
  }, [rows, filter, search]);

  return (
    <>
      <section className="vendor-card">
        <p className="vendor-muted">
          Bytspot gives your business bands, cards, fobs and table tags. Activate each one before use: choose its type and
          the place it lets guests into, and a tier for a band. One that is not active opens nothing.
        </p>
        {places.length === 0 ? (
          <p className="vendor-muted">Add a place first, under Locations.</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void activate();
            }}
          >
            <h2 className="vendor-section-title">Activate a band, card, fob or tag</h2>
            {scanning ? <video ref={videoRef} className="vendor-scanner-video" muted playsInline /> : null}
            {cameraSupported || tapSupported ? (
              <div className="vendor-demand-actions">
                {cameraSupported ? (
                  <button type="button" className="vendor-chip" disabled={busy} onClick={() => setScanning((on) => !on)}>
                    {scanning ? 'Stop camera' : 'Scan its code'}
                  </button>
                ) : null}
                {tapSupported ? (
                  <button type="button" className="vendor-chip" disabled={busy} onClick={() => setTapping((on) => !on)}>
                    {tapping ? 'Stop' : 'Tap it'}
                  </button>
                ) : null}
              </div>
            ) : null}
            {tapping ? <p className="vendor-muted">Hold it against the back of your phone.</p> : null}
            <label className="vendor-field">
              <span>Number</span>
              <input
                ref={bandInputRef}
                value={draft.band}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={300}
                placeholder="BYT424-0301"
                onChange={(event) => setDraft({ ...draft, band: event.target.value })}
              />
            </label>
            <FormSelect value={draft.form} onChange={(form) => setDraft({ ...draft, form })} />
            <label className="vendor-field">
              <span>Lets them into</span>
              <select value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </select>
            </label>
            {draft.form === 'band' ? (
              <label className="vendor-field">
                <span>Tier</span>
                <select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: event.target.value as BandTier })}>
                  {BAND_TIERS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="vendor-field">
              <span>{draft.form === 'epoxy' ? 'Table (optional)' : 'Your code (optional)'}</span>
              <input
                value={draft.vendorCode ?? ''}
                maxLength={40}
                placeholder={draft.form === 'epoxy' ? 'Table 4' : 'VIP-017'}
                onChange={(event) => setDraft({ ...draft, vendorCode: event.target.value })}
              />
            </label>
            <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy || !draft.band.trim()}>
              {busy ? 'Activating…' : 'Activate'}
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
      {rows && rows.length === 0 ? (
        <p className="vendor-muted">None yet. Ask Bytspot to assign bands, cards, fobs or table tags to your business.</p>
      ) : null}
      {rows?.length ? (
        <>
          <nav className="vendor-filters" aria-label="Band state">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === filter ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label} ({counts[entry.id]})
              </button>
            ))}
          </nav>
          <label className="vendor-field">
            <span>Find one</span>
            <input value={search} maxLength={40} placeholder="0301 or your code" onChange={(event) => setSearch(event.target.value)} />
          </label>
          {matching.length === 0 ? <p className="vendor-muted">Nothing matches.</p> : null}
          <ul className="vendor-demand-list">
            {matching.slice(0, SHOWN).map((row) => (
              <BandRow
                key={`${row.id}-${row.state}`}
                band={row}
                places={places}
                busy={busy}
                onActivate={() => {
                  setDraft((current) => ({ ...current, band: row.serial }));
                  bandInputRef.current?.focus();
                }}
                onSave={(edit) => save(row, edit)}
                onLost={() => void markLost(row)}
              />
            ))}
          </ul>
          {matching.length > SHOWN ? (
            <p className="vendor-muted">
              Showing {SHOWN} of {matching.length}. Search to find the rest.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
