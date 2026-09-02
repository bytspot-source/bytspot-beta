import { useMemo, useState } from 'react';
import {
  availabilityDefaultsFor,
  canSetSlotQuantity,
  listBookableDomains,
  listBookableTemplates,
} from '../utils/bookableTemplates';
import {
  applyAvailabilityOperation,
  availabilityOperationsFor,
  buildAvailabilityGrid,
  formatSlotTime,
  printableSkuCount,
  sellableSlots,
  WEEKDAY_LABELS,
  type AvailabilityWindow,
  type SlotCommitments,
} from './availability';
import { authorizeAvailability, canSeeBookable, type VendorSession } from './seller';

const HORIZON_DAYS = 14;

// Stands in for bookings the API has not been wired up to yet, so the grid
// shows what a partly sold week actually looks like.
const DEMO_COMMITMENTS: SlotCommitments = {};

interface AvailabilityGridProps {
  session: VendorSession;
}

export function AvailabilityGrid({ session }: AvailabilityGridProps) {
  const all = useMemo(() => listBookableTemplates(), []);
  // An assigned seat schedules only its own work, so the picker is scoped first.
  const templates = useMemo(
    () => (session.scope === 'all' ? all : all.filter((item) => canSeeBookable(session, item.id))),
    [all, session],
  );
  const [templateId, setTemplateId] = useState('dining.table-for-4');
  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const defaults = availabilityDefaultsFor(template.domain);
  // The catalog's own label, never the domain id: a vendor should not be shown
  // "stall" when they run a car park.
  const domainLabel =
    listBookableDomains().find((item) => item.id === template.domain)?.label ?? template.domain;

  const [window, setWindow] = useState<AvailabilityWindow>({
    weekdays: [5, 6],
    openMins: 19 * 60,
    closeMins: 24 * 60,
    quantity: 5,
  });
  const [commitments, setCommitments] = useState<SlotCommitments>(DEMO_COMMITMENTS);

  const slots = useMemo(
    () =>
      buildAvailabilityGrid({
        domain: template.domain,
        window,
        days: HORIZON_DAYS,
        commitments,
      }),
    [template.domain, window, commitments],
  );
  const sellable = useMemo(() => sellableSlots(slots, template.domain), [slots, template.domain]);

  const byDay = useMemo(() => {
    const groups = new Map<string, typeof slots>();
    for (const slot of slots) {
      const key = slot.startsAt.toDateString();
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots]);

  const toggleWeekday = (day: number) =>
    setWindow((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((item) => item !== day)
        : [...current.weekdays, day].sort(),
    }));

  const cycleSlot = (slotId: string) => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return;
    const next = slot.state === 'BLOCKED' ? 'OPEN_SLOT' : 'BLOCK_SLOT';
    if (!authorizeAvailability(session, next, slot.state, template.id).ok) return;
    const applied = applyAvailabilityOperation(commitments, slot, session.seat.role, next);
    if (applied) setCommitments(applied);
  };

  const setQuantity = (next: number) => {
    // Quantity lives on the window, so the floor is the busiest slot already sold.
    const busiest = slots.reduce((max, slot) => Math.max(max, slot.committed), 0);
    if (!canSetSlotQuantity({ quantity: window.quantity, committed: busiest }, next)) return;
    setWindow((current) => ({ ...current, quantity: next }));
  };

  return (
    <>
      <section>
        <h2 className="vendor-section-title">Which service?</h2>
        <nav className="vendor-filters" aria-label="Your services">
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === template.id ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => setTemplateId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <p className="vendor-muted vendor-question">
          {domainLabel} runs in {defaults.slotMinutes}-minute slots, needs {defaults.leadTimeMins} minutes notice, and
          guests can book up to {defaults.horizonDays} days ahead.
        </p>
      </section>

      <section className="vendor-card">
        <h2 className="vendor-section-title">When?</h2>
        <nav className="vendor-filters" aria-label="Days open">
          {WEEKDAY_LABELS.map((label, day) => (
            <button
              key={label}
              type="button"
              className={window.weekdays.includes(day) ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => toggleWeekday(day)}
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
              value={`${String(Math.floor(window.openMins / 60)).padStart(2, '0')}:${String(window.openMins % 60).padStart(2, '0')}`}
              onChange={(event) => {
                const [hours, mins] = event.target.value.split(':').map(Number);
                setWindow((current) => ({ ...current, openMins: hours * 60 + mins }));
              }}
            />
          </label>
          <label>
            Closes
            <input
              type="time"
              value={`${String(Math.floor((window.closeMins % 1440) / 60)).padStart(2, '0')}:${String(window.closeMins % 60).padStart(2, '0')}`}
              onChange={(event) => {
                const [hours, mins] = event.target.value.split(':').map(Number);
                const value = hours * 60 + mins;
                setWindow((current) => ({ ...current, closeMins: value <= current.openMins ? 1440 : value }));
              }}
            />
          </label>
          <label>
            How many?
            <span className="vendor-stepper">
              <button type="button" onClick={() => setQuantity(window.quantity - 1)} aria-label="Fewer">
                −
              </button>
              <strong>{window.quantity}</strong>
              <button type="button" onClick={() => setQuantity(window.quantity + 1)} aria-label="More">
                +
              </button>
            </span>
          </label>
        </div>
      </section>

      <section className="vendor-card">
        <div className="vendor-card-top">
          <h2 className="vendor-section-title">{printableSkuCount(slots)} openings for guests to book</h2>
        </div>
        <p className="vendor-muted">
          {slots.length} slots over {HORIZON_DAYS} days · {sellable.length} bookable right now · the rest are held by
          notice time, time off or bookings already taken.
        </p>

        {byDay.length === 0 ? (
          <p className="vendor-muted">No days selected, so nothing is on sale.</p>
        ) : (
          <ul className="vendor-days">
            {byDay.map(([day, daySlots]) => (
              <li key={day}>
                <h3 className="vendor-day-label">{day}</h3>
                <div className="vendor-slot-row">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={`vendor-slot vendor-slot-${slot.state.toLowerCase()}`}
                      onClick={() => cycleSlot(slot.id)}
                      disabled={!availabilityOperationsFor(session.seat.role, slot.state).length}
                      title={`${slot.state} · ${slot.remaining} of ${slot.quantity} left`}
                    >
                      <span>{formatSlotTime(slot.startMins)}</span>
                      <small>{slot.state === 'PASSED' ? '—' : `${slot.remaining}/${slot.quantity}`}</small>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
