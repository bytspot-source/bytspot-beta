import { useEffect, useState } from 'react';

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

export type Option = { id: string; label: string };

/** Waits for typing to pause before the search is sent. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input className="admin-input" type="search" value={value} placeholder={placeholder} aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  );
}

/** One choice from a row of chips; tapping the chosen one again clears it. */
export function Chips({ label, options, value, onChange }: { label: string; options: Option[]; value: string | null; onChange: (value: string | null) => void }) {
  return (
    <div className="admin-chips" role="group" aria-label={label}>
      <span className="admin-chips-label">{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" className={`admin-chip ${value === o.id ? 'on' : ''}`} aria-pressed={value === o.id}
          onClick={() => onChange(value === o.id ? null : o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function SortSelect({ options, value, onChange }: { options: Option[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="admin-muted">
      Sort{' '}
      <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** A-Z jump bar. Letters with nothing under the current filters are greyed out. */
export function LetterBar({ available, value, onChange }: { available: string[]; value: string | null; onChange: (value: string | null) => void }) {
  return (
    <div className="admin-letters" role="group" aria-label="Jump to letter">
      <button type="button" className={`admin-letter ${value === null ? 'on' : ''}`} onClick={() => onChange(null)}>All</button>
      {LETTERS.map((letter) => (
        <button key={letter} type="button" disabled={!available.includes(letter)} aria-pressed={value === letter}
          className={`admin-letter ${value === letter ? 'on' : ''}`} onClick={() => onChange(value === letter ? null : letter)}>{letter}</button>
      ))}
    </div>
  );
}

/** "Showing 1-50 of 1,240" and the page buttons. */
export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total === 0) return null;
  const last = Math.min(offset + limit, total);
  return (
    <div className="admin-row" style={{ alignItems: 'center' }}>
      <p className="admin-muted">Showing {offset + 1}–{last} of {total.toLocaleString()}</p>
      <div className="admin-inline">
        <button type="button" className="admin-button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
        <button type="button" className="admin-button" disabled={last >= total} onClick={() => onChange(offset + limit)}>Next</button>
      </div>
    </div>
  );
}
