import { useMemo, useState } from 'react';
import {
  getBookableLocations,
  getLocationKind,
  type BookableLocationKindId,
} from '../utils/bookableTemplates.ts';
import {
  acceptableCandidates,
  autoApplicable,
  candidateBlockers,
  pinFrom,
  type GeocodeCandidate,
} from './geocoding.ts';
import type { VendorLocation } from './locations.ts';
import type { ProfileEdit } from './profile.ts';
import type { VendorSession } from './seller.ts';

export interface LocationFormProps {
  session: VendorSession;
  /**
   * Forced when a business mode only permits one kind. A cottage business has no
   * Places tab, so the gate is the only screen it can ever add one from, and the
   * kind comes from the contract rather than a picker it cannot reach.
   */
  cottageKind?: BookableLocationKindId;
  /** Supplied when editing. The pin must be re-confirmed, never inherited. */
  editing?: VendorLocation;
  busy: boolean;
  onEdit: (edit: ProfileEdit) => void;
  onGeocode: (query: string, kind: BookableLocationKindId) => Promise<GeocodeCandidate[]>;
  onDone?: () => void;
}

/**
 * One form, used by the setup gate and the Places tab.
 *
 * Shared rather than copied because the pin rules are the interesting part: a
 * second implementation would be the one that forgets to check precision, and
 * the wrong pin it produced would look exactly like a right one.
 */
export function LocationForm({
  session,
  cottageKind,
  editing,
  busy,
  onEdit,
  onGeocode,
  onDone,
}: LocationFormProps) {
  const isCottage = session.seller.businessMode === 'cottage';
  const fixedKind = isCottage ? cottageKind : undefined;
  const [kind, setKind] = useState<BookableLocationKindId>(
    editing?.kind ?? fixedKind ?? getBookableLocations().defaults.kind,
  );
  const [label, setLabel] = useState(editing?.label ?? '');
  const [query, setQuery] = useState(editing?.address ?? '');
  const [radius, setRadius] = useState(editing?.radiusMiles ? String(editing.radiusMiles) : '');
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [pinned, setPinned] = useState<GeocodeCandidate | undefined>(undefined);
  const [looking, setLooking] = useState(false);
  const [searched, setSearched] = useState(false);

  const activeKind = fixedKind ?? kind;
  const chosen = getLocationKind(activeKind);
  const { maxRadiusMiles } = getBookableLocations().defaults;
  const usable = useMemo(() => acceptableCandidates(activeKind, candidates), [activeKind, candidates]);
  const rejected = useMemo(
    () => candidates.filter((candidate) => !usable.includes(candidate)),
    [candidates, usable],
  );

  /**
   * Changing the kind changes what counts as an acceptable pin, so a pin chosen
   * under the old kind cannot be carried over. A town centroid that was fine
   * for a travelling vendor is wrong for a place guests drive to.
   */
  const chooseKind = (next: BookableLocationKindId) => {
    setKind(next);
    setPinned(undefined);
  };

  const look = async () => {
    setLooking(true);
    setPinned(undefined);
    try {
      const found = await onGeocode(query, activeKind);
      setCandidates(found);
      setSearched(true);
      // One exact match needs no question asked. Anything less exact does.
      const auto = autoApplicable(activeKind, found);
      if (auto) setPinned(auto);
    } finally {
      setLooking(false);
    }
  };

  const submit = () => {
    if (!pinned) return;
    const pin = pinFrom(activeKind, pinned);
    const location: VendorLocation = {
      // Reusing the id is what makes this an edit rather than a second place.
      id: editing?.id ?? `loc_${Date.now()}`,
      label: label.trim() || session.seller.legalName,
      kind: activeKind,
      // A new place is created live: an inactive one satisfies nothing, so a
      // draft would leave the requirement unmet with no sign of why. An edit
      // keeps whatever state it already had.
      state: editing?.state ?? 'ACTIVE',
      ...pin,
      radiusMiles: radius ? Number(radius) : undefined,
    };
    onEdit({ field: 'location', value: location });
    onDone?.();
  };

  return (
    <>
      {fixedKind ? (
        <p className="vendor-muted">
          Set up as “{chosen?.label}”, which is what a {session.seller.businessMode} business gets.
        </p>
      ) : (
        <nav className="vendor-filters" aria-label="Location kind">
          {getBookableLocations().kinds.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === kind ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
              onClick={() => chooseKind(option.id)}
            >
              {option.label}
            </button>
          ))}
        </nav>
      )}

      {chosen ? <p className="vendor-muted vendor-question">{chosen.question}</p> : null}

      <label className="vendor-field">
        <span>label</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} type="text" />
      </label>

      <label className="vendor-field">
        {/* A visiting provider is placed but not published, so the ask is
            different from the one a storefront gets. */}
        <span>{chosen?.requiresAddress ? 'address' : 'where you set out from'}</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // The pin belongs to the text that produced it.
            setPinned(undefined);
            setSearched(false);
          }}
          type="text"
          autoComplete="street-address"
        />
      </label>
      {!chosen?.requiresAddress ? (
        <p className="vendor-muted">Used to measure your radius. It is not shown to guests.</p>
      ) : null}

      <button type="button" className="vendor-button" disabled={looking || !query.trim()} onClick={() => void look()}>
        {looking ? 'Looking…' : 'Find this address'}
      </button>

      {searched && usable.length > 0 ? (
        <fieldset className="vendor-field">
          <legend>{usable.length === 1 ? 'Is this it?' : 'Which one?'}</legend>
          {usable.map((candidate) => (
            <label key={`${candidate.lat},${candidate.lng}`} className="vendor-choice">
              <input
                type="radio"
                name="pin"
                checked={pinned === candidate}
                onChange={() => setPinned(candidate)}
              />
              <span>{candidate.formatted}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {/* A refused result is shown with its reason. Hiding it looks like the
          address does not exist, and the vendor retypes it forever. */}
      {searched && usable.length === 0 ? (
        <ul className="vendor-reasons">
          {rejected.length === 0 ? (
            <li className="vendor-reason-fixable">We could not find that address</li>
          ) : (
            rejected.map((candidate) => (
              <li key={candidate.formatted} className="vendor-reason-fixable">
                {candidate.formatted} — {candidateBlockers(activeKind, candidate)[0]}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {chosen?.requiresRadius ? (
        <label className="vendor-field">
          <span>radius in miles (max {maxRadiusMiles})</span>
          <input
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxRadiusMiles}
          />
        </label>
      ) : null}

      {/* No pin, no save. The alternative is a location that looks saved and
          cannot be published, with the reason two screens away. */}
      <button type="button" className="vendor-button" disabled={busy || !pinned} onClick={submit}>
        Save
      </button>
    </>
  );
}

