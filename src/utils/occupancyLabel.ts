/** Honest occupancy copy. Live is only a door, a host, or a sensor, and only while that reading is still fresh. */

export const LIVE_OCCUPANCY_SOURCES = ['bytspot', 'user_report', 'sensor'] as const;

/** A live reading older than this is typical, not live. */
export const LIVE_OCCUPANCY_MAX_AGE_MS = 30 * 60 * 1000;

const CROWD_LEVEL_LABELS = ['', 'Chill', 'Active', 'Busy', 'Packed'] as const;

export function isLiveOccupancySource(source: string | null | undefined): boolean {
  return LIVE_OCCUPANCY_SOURCES.includes(source as (typeof LIVE_OCCUPANCY_SOURCES)[number]);
}

export function occupancyRecordedAt(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

/** Timestamp fields a crowd payload may use. Missing or unreadable means not fresh. */
export function crowdRecordedAt(crowd: {
  recordedAt?: unknown;
  updatedAt?: unknown;
  observedAt?: unknown;
} | null | undefined): string | number | Date | null | undefined {
  if (!crowd) return undefined;
  const value = crowd.recordedAt ?? crowd.updatedAt ?? crowd.observedAt;
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value;
  return undefined;
}

export function isFreshOccupancyReading(
  recordedAt: string | number | Date | null | undefined,
  now = Date.now(),
): boolean {
  const time = occupancyRecordedAt(recordedAt);
  if (time == null) return false;
  const age = now - time;
  return age >= 0 && age <= LIVE_OCCUPANCY_MAX_AGE_MS;
}

export function isLiveOccupancyReading(opts: {
  source?: string | null;
  recordedAt?: string | number | Date | null;
  now?: number;
}): boolean {
  return isLiveOccupancySource(opts.source) && isFreshOccupancyReading(opts.recordedAt, opts.now ?? Date.now());
}

export function occupancyKindLabel(
  source: string | null | undefined,
  recordedAt?: string | number | Date | null,
  now?: number,
): 'Live' | 'Typical' {
  return isLiveOccupancyReading({ source, recordedAt, now }) ? 'Live' : 'Typical';
}

export function venueAvailabilityLabel(opts: {
  source?: string | null;
  waitMins?: number | null;
  level?: number | null;
  availability?: string | null;
  recordedAt?: string | number | Date | null;
  now?: number;
}): string {
  const live = isLiveOccupancyReading(opts);
  if (opts.waitMins) return live ? `~${opts.waitMins}m wait` : `typically ~${opts.waitMins}m wait`;
  if (opts.availability) return String(opts.availability);
  if ((opts.level ?? 1) >= 4) return live ? 'High activity' : 'Typically high activity';
  return live ? 'Live availability' : 'Typical now';
}

export function venueCrowdFallbackLabel(
  source?: string | null,
  recordedAt?: string | number | Date | null,
  now?: number,
): string {
  return occupancyKindLabel(source, recordedAt, now);
}

export function venueWaitFallbackLabel(
  source?: string | null,
  recordedAt?: string | number | Date | null,
  now?: number,
): string {
  return isLiveOccupancyReading({ source, recordedAt, now }) ? 'Live wait' : 'Typical wait';
}

export interface TypicalCrowdPoint {
  level: number;
  label: string;
}

/**
 * A typical-by-hour series from the venue payload. Past `history` is not a
 * typical curve, and nothing here is invented.
 */
export function typicalCrowdCurve(payload: unknown): TypicalCrowdPoint[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const crowd = root.crowd && typeof root.crowd === 'object' ? root.crowd as Record<string, unknown> : null;
  const raw = crowd?.typicalCurve ?? crowd?.typicalByHour ?? crowd?.typical ?? root.typicalCurve;
  if (!Array.isArray(raw)) return [];
  const points: TypicalCrowdPoint[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && item >= 1 && item <= 4) {
      const level = Math.round(item);
      points.push({ level, label: CROWD_LEVEL_LABELS[level] });
      continue;
    }
    if (!item || typeof item !== 'object' || typeof (item as { level?: unknown }).level !== 'number') continue;
    const level = Math.max(1, Math.min(4, Math.round((item as { level: number }).level)));
    const given = (item as { label?: unknown }).label;
    const label = typeof given === 'string' && given.trim() ? given.trim() : CROWD_LEVEL_LABELS[level];
    points.push({ level, label });
  }
  return points;
}
