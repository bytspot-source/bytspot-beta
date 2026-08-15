/** Honest occupancy copy. Live is only a door, a host, or a user report. */

export const LIVE_OCCUPANCY_SOURCES = ['bytspot', 'user_report', 'sensor'] as const;

export function isLiveOccupancySource(source: string | null | undefined): boolean {
  return LIVE_OCCUPANCY_SOURCES.includes(source as (typeof LIVE_OCCUPANCY_SOURCES)[number]);
}

export function occupancyKindLabel(source: string | null | undefined): 'Live' | 'Typical' {
  return isLiveOccupancySource(source) ? 'Live' : 'Typical';
}

export function venueAvailabilityLabel(opts: {
  source?: string | null;
  waitMins?: number | null;
  level?: number | null;
  availability?: string | null;
}): string {
  if (opts.waitMins) return `~${opts.waitMins}m wait`;
  if (opts.availability) return String(opts.availability);
  if ((opts.level ?? 1) >= 4) return 'High activity';
  return isLiveOccupancySource(opts.source) ? 'Live availability' : 'Typical now';
}

export function venueCrowdFallbackLabel(source?: string | null): string {
  return occupancyKindLabel(source);
}

export function venueWaitFallbackLabel(source?: string | null): string {
  return isLiveOccupancySource(source) ? 'Live wait' : 'Typical wait';
}
