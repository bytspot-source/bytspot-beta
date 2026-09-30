import { useCallback, useEffect, useMemo, useState } from 'react';
import { availabilityDefaultsFor, listBookableDomains, type BookableDomainId } from '../utils/bookableTemplates';
import { availabilityOperationsFor, formatSlotTime, WEEKDAY_LABELS } from './availability';
import type { ConsoleTransport, LiveSlot, ScheduleDraft, SlotMoveId, WindowSlots } from './consoleTransport';
import type { VendorWindow, WindowsTransport } from './setupTransport';
import { sessionCan, type VendorSession } from './seller';

interface AvailabilityGridProps {
  session: VendorSession;
  transport: ConsoleTransport;
  windows: WindowsTransport;
}

const SLOT_MOVES: SlotMoveId[] = ['OPEN_SLOT', 'CLOSE_SLOT', 'BLOCK_SLOT'];

function toClock(mins: number): string {
  const wrapped = mins % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function fromClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function dayKey(slot: LiveSlot, timeZone?: string): string {
  return slot.startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone });
}

/**
 * Real slots for one bookable, from the API. Tapping a slot offers only the
 * moves the contract allows from its state, and the server checks them again.
 */
export function AvailabilityGrid({ session, transport, windows }: AvailabilityGridProps) {
  const [bookables, setBookables] = useState<VendorWindow[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState<WindowSlots | undefined>(undefined);
  const [schedule, setSchedule] = useState<ScheduleDraft | undefined>(undefined);
  const [picked, setPicked] = useState<LiveSlot | undefined>(undefined);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const canSchedule = sessionCan(session, 'SCHEDULE');

  useEffect(() => {
    let live = true;
    void windows.list().then((result) => {
      if (!live) return;
      const rows = result.value ?? [];
      setBookables(rows);
      setSelectedId((current) => current || rows[0]?.id || '');
    });
    return () => {
      live = false;
    };
  }, [windows]);

  const land = useCallback((result: Awaited<ReturnType<ConsoleTransport['slots']>>) => {
    if (!result.value) {
      setBlockers(result.blockers ?? ['That did not load. Try again']);
      return false;
    }
    setBlockers([]);
    setData(result.value);
    const { weekdays, openMins, closeMins, quantity } = result.value.window;
    setSchedule({ weekdays, openMins, closeMins, quantity });
    return true;
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    setData(undefined);
    setPicked(undefined);
    void transport.slots(selectedId).then((result) => {
      if (live) land(result);
    });
    return () => {
      live = false;
    };
  }, [selectedId, transport, land]);

  const run = async (call: () => ReturnType<ConsoleTransport['slots']>) => {
    setBusy(true);
    const ok = land(await call());
    setBusy(false);
    if (ok) setPicked(undefined);
  };

  const byDay = useMemo(() => {
    const groups = new Map<string, LiveSlot[]>();
    for (const slot of data?.slots ?? []) {
      const key = dayKey(slot, data?.timezone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [data]);

  const domain = data?.window.domain as BookableDomainId | undefined;
  const defaults = domain ? availabilityDefaultsFor(domain) : undefined;
  const domainLabel = domain ? listBookableDomains().find((item) => item.id === domain)?.label ?? domain : '';
  const dirty =
    Boolean(data && schedule) &&
    JSON.stringify(schedule) !==
      JSON.stringify({
        weekdays: data!.window.weekdays,
        openMins: data!.window.openMins,
        closeMins: data!.window.closeMins,
        quantity: data!.window.quantity,
      });
  const moves = picked ? availabilityOperationsFor(session.seat.role, picked.state).filter((move) => SLOT_MOVES.includes(move.id as SlotMoveId)) : [];

  if (bookables === undefined) return <p className="vendor-muted">Loading…</p>;
  if (bookables.length === 0) {
    return (
      <section className="vendor-card">
        <h2 className="vendor-section-title">No services yet</h2>
        <p className="vendor-muted">Create one in Bookables first. Its days, hours and slots show up here.</p>
      </section>
    );
  }

  return (
    <>
      <section>
        <h2 className="vendor-section-title">Which service?</h2>
        <nav className="vendor-filters" aria-label="Your services">
          {bookables.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedId ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => setSelectedId(item.id)}
            >
              {item.title}
              {item.published ? '' : ' (draft)'}
            </button>
          ))}
        </nav>
        {defaults ? (
          <p className="vendor-muted vendor-question">
            {domainLabel} runs in {defaults.slotMinutes}-minute slots, needs {defaults.leadTimeMins} minutes notice, and
            guests can book up to {defaults.horizonDays} days ahead.
          </p>
        ) : null}
      </section>

      {schedule ? (
        <section className="vendor-card">
          <h2 className="vendor-section-title">When?</h2>
          <nav className="vendor-filters" aria-label="Days open">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                disabled={!canSchedule}
                className={schedule.weekdays.includes(day) ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                onClick={() =>
                  setSchedule((current) =>
                    current && {
                      ...current,
                      weekdays: current.weekdays.includes(day)
                        ? current.weekdays.filter((item) => item !== day)
                        : [...current.weekdays, day].sort(),
                    },
                  )
                }
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="vendor-window-row">
            <label>
              Opens
              <input
                type="time"
                disabled={!canSchedule}
                value={toClock(schedule.openMins)}
                onChange={(event) => setSchedule((current) => current && { ...current, openMins: fromClock(event.target.value) })}
              />
            </label>
            <label>
              Closes
              <input
                type="time"
                disabled={!canSchedule}
                value={toClock(schedule.closeMins)}
                onChange={(event) => {
                  const value = fromClock(event.target.value);
                  setSchedule((current) => current && { ...current, closeMins: value <= current.openMins ? 1440 : value });
                }}
              />
            </label>
            <label>
              How many?
              <span className="vendor-stepper">
                <button
                  type="button"
                  disabled={!canSchedule}
                  aria-label="Fewer"
                  onClick={() => setSchedule((current) => current && { ...current, quantity: Math.max(1, current.quantity - 1) })}
                >
                  −
                </button>
                <strong>{schedule.quantity}</strong>
                <button
                  type="button"
                  disabled={!canSchedule}
                  aria-label="More"
                  onClick={() => setSchedule((current) => current && { ...current, quantity: current.quantity + 1 })}
                >
                  +
                </button>
              </span>
            </label>
          </div>
          {canSchedule ? (
            <button
              type="button"
              className="vendor-chip vendor-chip-on"
              disabled={!dirty || busy || schedule.weekdays.length === 0}
              onClick={() => void run(() => transport.saveSchedule(selectedId, schedule))}
            >
              {busy ? 'Saving…' : 'Save hours'}
            </button>
          ) : null}
        </section>
      ) : null}

      {blockers.length ? (
        <ul className="vendor-reasons">
          {blockers.map((reason) => (
            <li key={reason} className="vendor-reason-fixable">{reason}</li>
          ))}
        </ul>
      ) : null}

      {picked ? (
        <section className="vendor-card">
          <h2 className="vendor-section-title">
            {dayKey(picked, data?.timezone)} · {formatSlotTime(picked.startMins)}
          </h2>
          <p className="vendor-muted">
            {picked.state.toLowerCase()} · {picked.remaining} of {picked.quantity} left
            {picked.committed ? ` · ${picked.committed} booked stay booked` : ''}
          </p>
          <div className="vendor-demand-actions">
            {moves.map((move) => (
              <button
                key={move.id}
                type="button"
                className="vendor-chip"
                disabled={busy}
                onClick={() => void run(() => transport.moveSlot(selectedId, picked.startsAt, move.id as SlotMoveId))}
              >
                {move.label}
              </button>
            ))}
            <button type="button" className="vendor-chip" onClick={() => setPicked(undefined)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="vendor-card">
        {!data ? (
          <p className="vendor-muted">Loading slots…</p>
        ) : !data.timezone ? (
          <p className="vendor-muted">This place has no time zone yet, so no slots can be shown. Publish the service to set it.</p>
        ) : byDay.length === 0 ? (
          <p className="vendor-muted">No days selected, so nothing is on sale.</p>
        ) : (
          <>
            <h2 className="vendor-section-title">
              {data.slots.filter((slot) => slot.state === 'OPEN').reduce((total, slot) => total + slot.remaining, 0)}{' '}
              openings for guests to book
            </h2>
            <p className="vendor-muted">Times are shown in {data.timezone}. Tap a slot to open, close or block it.</p>
            <ul className="vendor-days">
              {byDay.map(([day, slots]) => (
                <li key={day}>
                  <h3 className="vendor-day-label">{day}</h3>
                  <div className="vendor-slot-row">
                    {slots.map((slot) => (
                      <button
                        key={slot.startsAt.toISOString()}
                        type="button"
                        className={`vendor-slot vendor-slot-${slot.state.toLowerCase()}`}
                        disabled={!canSchedule || slot.state === 'PASSED'}
                        title={`${slot.state} · ${slot.remaining} of ${slot.quantity} left`}
                        onClick={() => setPicked(slot)}
                      >
                        <span>{formatSlotTime(slot.startMins)}</span>
                        <small>{slot.state === 'PASSED' ? '—' : `${slot.remaining}/${slot.quantity}`}</small>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
