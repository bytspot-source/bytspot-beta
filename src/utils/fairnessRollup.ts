/**
 * fairnessRollup — Pillar II algorithmic-fairness audit (EU AI Act / OSTP).
 *
 * Bytspot's ranking weights verified-venue presence and engagement signals.
 * Without an audit pass, those weights can quietly under-surface vendors in
 * specific neighborhoods — the digital analogue of redlining. This module
 * buckets venues into coarse spatial cells and reports cells whose verified
 * coverage falls meaningfully below the population median, so the operations
 * team can investigate before a regulator does.
 *
 * Pure, dependency-free, runs server-side from a cron or locally from a test.
 *
 * Threshold defaults are intentionally conservative — surface more, decide
 * less. The output is investigative, not punitive.
 */

export interface FairnessVenueInput {
  id: string;
  lat: number;
  lng: number;
  /** True when the venue carries a verified hardware patch. */
  verified: boolean;
}

export interface FairnessCellSummary {
  /** Cell key in the form "lat-bucket:lng-bucket" — coarse, not reversible to a person. */
  cellKey: string;
  /** Cell centroid (lat/lng of the bucket centre). */
  centroid: { lat: number; lng: number };
  /** Total venues placed in this cell. */
  total: number;
  /** Verified venues in this cell. */
  verified: number;
  /** verified / total — null if total is 0. */
  verifiedRatio: number | null;
  /** True when this cell falls below the configured suspicion threshold. */
  suspect: boolean;
}

export interface FairnessRollupOptions {
  /**
   * Cell size in degrees. 0.05 ≈ 5.5 km of latitude — coarse enough to keep
   * cell counts statistically meaningful, fine enough to catch a redlined
   * neighborhood. Defaults to 0.05.
   */
  cellSizeDeg?: number;
  /**
   * A cell is flagged when its verifiedRatio is below
   *   max(absoluteFloor, populationMedian * relativeFactor)
   * AND the cell has at least `minVenues` venues (so a single-venue cell
   * can't masquerade as a coverage gap).
   */
  absoluteFloor?: number;
  relativeFactor?: number;
  minVenues?: number;
}

const DEFAULT_OPTIONS: Required<FairnessRollupOptions> = {
  cellSizeDeg: 0.05,
  absoluteFloor: 0.1,
  relativeFactor: 0.5,
  minVenues: 3,
};

function bucket(value: number, size: number): number {
  return Math.floor(value / size);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface FairnessRollupReport {
  cells: FairnessCellSummary[];
  suspectCells: FairnessCellSummary[];
  /** Median verifiedRatio across all populated cells (NaN-safe — 0 when empty). */
  medianRatio: number;
  /** The threshold below which a cell was flagged. */
  threshold: number;
  generatedAt: string;
}

/**
 * Compute a per-cell verified-coverage rollup. The function is deterministic
 * and side-effect-free; callers pass the venue snapshot they want audited.
 */
export function computeFairnessRollup(
  venues: ReadonlyArray<FairnessVenueInput>,
  options: FairnessRollupOptions = {},
): FairnessRollupReport {
  const opts: Required<FairnessRollupOptions> = { ...DEFAULT_OPTIONS, ...options };
  const buckets = new Map<string, { total: number; verified: number; latSum: number; lngSum: number }>();

  for (const venue of venues) {
    if (!Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) continue;
    const latIdx = bucket(venue.lat, opts.cellSizeDeg);
    const lngIdx = bucket(venue.lng, opts.cellSizeDeg);
    const key = `${latIdx}:${lngIdx}`;
    const slot = buckets.get(key) ?? { total: 0, verified: 0, latSum: 0, lngSum: 0 };
    slot.total += 1;
    if (venue.verified) slot.verified += 1;
    slot.latSum += venue.lat;
    slot.lngSum += venue.lng;
    buckets.set(key, slot);
  }

  const cells: FairnessCellSummary[] = [];
  const ratios: number[] = [];

  for (const [cellKey, slot] of buckets.entries()) {
    const verifiedRatio = slot.total > 0 ? slot.verified / slot.total : null;
    if (verifiedRatio !== null) ratios.push(verifiedRatio);
    cells.push({
      cellKey,
      centroid: { lat: slot.latSum / slot.total, lng: slot.lngSum / slot.total },
      total: slot.total,
      verified: slot.verified,
      verifiedRatio,
      suspect: false,
    });
  }

  const medianRatio = median(ratios);
  const threshold = Math.max(opts.absoluteFloor, medianRatio * opts.relativeFactor);

  for (const cell of cells) {
    if (cell.total < opts.minVenues) continue;
    if (cell.verifiedRatio === null) continue;
    if (cell.verifiedRatio < threshold) cell.suspect = true;
  }

  const suspectCells = cells.filter((cell) => cell.suspect);

  return {
    cells,
    suspectCells,
    medianRatio,
    threshold,
    generatedAt: new Date().toISOString(),
  };
}
