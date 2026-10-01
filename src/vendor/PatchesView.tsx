import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { formatCents, patchDraftProblems, type ConsoleTransport, type Patch, type PatchDraft, type PatchKind } from './consoleTransport';
import type { VendorLocation } from './locations';
import type { VendorWindow, WindowsTransport } from './setupTransport';

const COPY: Record<PatchKind, { intro: string; add: string; label: string; labelHint: string; empty: string }> = {
  patch: {
    intro:
      'Put a QR code or an NFC tag where guests see it: a door, a table, a menu. Scanning it opens your place in Bytspot so they can send you a request.',
    add: 'New patch',
    label: 'Where it goes',
    labelHint: 'Front door',
    empty: 'No patches yet.',
  },
  partner: {
    intro:
      'Give a business that sends you guests, like a hotel front desk or a concierge, its own link and QR code. Bytspot counts the scans, requests and bookings that come through it, so you can settle whatever you agreed with them. No money moves through Bytspot.',
    add: 'New partner',
    label: 'Where they will use it',
    labelHint: 'Front desk',
    empty: 'No partners yet.',
  },
};

interface NdefWriter {
  write: (message: { records: { recordType: string; data: string }[] }) => Promise<void>;
}

function ndefWriter(): NdefWriter | undefined {
  const Ctor = (window as unknown as { NDEFReader?: new () => NdefWriter }).NDEFReader;
  return Ctor ? new Ctor() : undefined;
}

function PatchCard({
  patch,
  busy,
  onArchive,
}: {
  patch: Patch;
  busy: boolean;
  onArchive: () => void;
}) {
  const [note, setNote] = useState('');
  const canvasId = `patch-qr-${patch.id}`;
  const canWriteTag = typeof window !== 'undefined' && 'NDEFReader' in window;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(patch.url);
      setNote('Link copied.');
    } catch {
      setNote('Copy did not work. Select the link and copy it instead.');
    }
  };

  const download = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `bytspot-${patch.code}.png`;
    link.click();
  };

  const writeTag = async () => {
    const writer = ndefWriter();
    if (!writer) return;
    setNote('Hold the tag against the back of your phone.');
    try {
      await writer.write({ records: [{ recordType: 'url', data: patch.url }] });
      setNote('Tag written. Tap it with a phone to check.');
    } catch {
      setNote('The tag was not written. Allow NFC and try again.');
    }
  };

  const target = patch.service ? `${patch.place} · ${patch.service}` : patch.place;

  return (
    <li className="vendor-card">
      <div className="vendor-card-top">
        <strong>{patch.partnerName ? `${patch.partnerName} · ${patch.label}` : patch.label}</strong>
        <span className="vendor-muted">{patch.code}</span>
      </div>
      <p className="vendor-muted">Opens {target}</p>
      <div className="vendor-patch-qr">
        <QRCodeCanvas id={canvasId} value={patch.url} size={160} level="M" marginSize={2} aria-label={`QR code for ${patch.label}`} />
      </div>
      <p className="vendor-muted vendor-patch-url">{patch.url}</p>
      <p className="vendor-muted">
        {patch.scans} {patch.scans === 1 ? 'scan' : 'scans'} · {patch.asks} {patch.asks === 1 ? 'request' : 'requests'} ·{' '}
        {patch.bookings} {patch.bookings === 1 ? 'booking' : 'bookings'}
        {patch.bookedCents ? ` · ${formatCents(patch.bookedCents)} booked` : ''}
      </p>
      <div className="vendor-demand-actions">
        <button type="button" className="vendor-chip" onClick={() => void copy()}>
          Copy link
        </button>
        <button type="button" className="vendor-chip" onClick={download}>
          Download QR code
        </button>
        {canWriteTag ? (
          <button type="button" className="vendor-chip" onClick={() => void writeTag()}>
            Write NFC tag
          </button>
        ) : null}
        <button type="button" className="vendor-chip" disabled={busy} onClick={onArchive}>
          Retire
        </button>
      </div>
      {note ? <p className="vendor-muted">{note}</p> : null}
    </li>
  );
}

/** QR / NFC patches, and the same links handed to partners. */
export function PatchesView({
  kind,
  transport,
  windows,
  locations,
}: {
  kind: PatchKind;
  transport: ConsoleTransport;
  windows: WindowsTransport;
  locations: VendorLocation[];
}) {
  const places = locations.filter((location) => location.state !== 'CLOSED');
  const copy = COPY[kind];
  const [rows, setRows] = useState<Patch[] | undefined>(undefined);
  const [services, setServices] = useState<VendorWindow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PatchDraft>({ kind, locationId: places[0]?.id ?? '', label: '' });

  useEffect(() => {
    let live = true;
    void transport.patches(kind).then((result) => {
      if (!live) return;
      if (result.value) setRows(result.value);
      else setProblems(result.blockers ?? ['That did not load. Try again']);
    });
    void windows.list().then((result) => {
      if (live && result.value) setServices(result.value);
    });
    return () => {
      live = false;
    };
  }, [transport, windows, kind]);

  const atPlace = services.filter((service) => service.locationId === draft.locationId);

  const create = async () => {
    const local = patchDraftProblems(draft);
    if (local.length) {
      setProblems(local);
      return;
    }
    setBusy(true);
    const result = await transport.createPatch(draft);
    setBusy(false);
    if (!result.value) {
      setProblems(result.blockers ?? ['That did not save. Try again']);
      return;
    }
    const created = result.value;
    setProblems([]);
    setRows((current) => [created, ...(current ?? [])]);
    setDraft({ kind, locationId: draft.locationId, label: '' });
    setAdding(false);
  };

  const archive = async (id: string) => {
    setBusy(true);
    const result = await transport.archivePatch(id, kind);
    setBusy(false);
    if (result.value) {
      setRows((current) => current?.filter((row) => row.id !== id));
      setProblems([]);
    } else setProblems(result.blockers ?? ['That did not go through. Try again']);
  };

  return (
    <>
      <section className="vendor-card">
        <p className="vendor-muted">{copy.intro}</p>
        {places.length === 0 ? (
          <p className="vendor-muted">Add a place first, under Locations.</p>
        ) : adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            {kind === 'partner' ? (
              <label className="vendor-field">
                <span>Partner</span>
                <input
                  value={draft.partnerName ?? ''}
                  maxLength={80}
                  placeholder="Hotel Indigo"
                  onChange={(event) => setDraft({ ...draft, partnerName: event.target.value })}
                />
              </label>
            ) : null}
            <label className="vendor-field">
              <span>{copy.label}</span>
              <input
                value={draft.label}
                maxLength={60}
                placeholder={copy.labelHint}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            </label>
            <label className="vendor-field">
              <span>Opens</span>
              <select
                value={draft.locationId}
                onChange={(event) => setDraft({ ...draft, locationId: event.target.value, windowId: undefined })}
              >
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </select>
            </label>
            {atPlace.length ? (
              <label className="vendor-field">
                <span>Show first</span>
                <select
                  value={draft.windowId ?? ''}
                  onChange={(event) => setDraft({ ...draft, windowId: event.target.value || undefined })}
                >
                  <option value="">Everything at this place</option>
                  {atPlace.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="vendor-demand-actions">
              <button type="submit" className="vendor-chip vendor-chip-on" disabled={busy}>
                {busy ? 'Saving…' : 'Create'}
              </button>
              <button type="button" className="vendor-chip" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="vendor-chip vendor-chip-on" onClick={() => setAdding(true)}>
            {copy.add}
          </button>
        )}
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
      {rows && rows.length === 0 ? <p className="vendor-muted">{copy.empty}</p> : null}
      {rows?.length ? (
        <ul className="vendor-demand-list">
          {rows.map((row) => (
            <PatchCard key={row.id} patch={row} busy={busy} onArchive={() => void archive(row.id)} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
