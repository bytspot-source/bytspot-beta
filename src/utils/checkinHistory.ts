/**
 * checkinHistory — persists user venue check-in records
 * v2 — API-first: calls tRPC user.checkins.*, falls back to localStorage.
 */
import { trpc } from './trpc';

export interface CheckInRecord {
  id: string;
  venueId: string;
  venueName: string;
  venueCategory: string;
  timestamp: string; // ISO
  crowdLevel: number;
  crowdLabel: string;
  pointsEarned: number;
}

const KEY = 'bytspot_checkin_history';
const MAX = 50;

function isAuthenticated(): boolean {
  return !!localStorage.getItem('bytspot_auth_token');
}

/** Sync localStorage read */
export function getCheckinHistory(): CheckInRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

/** API-first check-in history */
export async function getCheckinHistoryAsync(): Promise<CheckInRecord[]> {
  if (!isAuthenticated()) return getCheckinHistory();
  try {
    const res = await trpc.user.checkins.list.query({ limit: MAX });
    const items = (res as any).items ?? res;
    const mapped: CheckInRecord[] = (items as any[]).map((c: any) => ({
      id: c.id,
      venueId: c.venueId ?? c.venue?.id ?? '',
      venueName: c.venue?.name ?? '',
      venueCategory: c.venue?.category ?? '',
      timestamp: c.createdAt ?? c.timestamp,
      crowdLevel: c.crowdLevel ?? 0,
      crowdLabel: c.crowdLabel ?? '',
      pointsEarned: 10,
    }));
    localStorage.setItem(KEY, JSON.stringify(mapped));
    return mapped;
  } catch { return getCheckinHistory(); }
}

/**
 * Save a check-in record locally.
 * NOTE: When authenticated, the backend records the check-in via venues.checkin;
 * this local write is for offline/instant UI.
 */
export function saveCheckinRecord(record: Omit<CheckInRecord, 'id'>): void {
  const history = getCheckinHistory();
  const entry: CheckInRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...record };
  history.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX)));
}

export function getCheckinCount(): number {
  return getCheckinHistory().length;
}

/** API-first check-in count */
export async function getCheckinCountAsync(): Promise<number> {
  if (!isAuthenticated()) return getCheckinCount();
  try {
    const res = await trpc.user.checkins.count.query();
    return typeof res === 'number' ? res : (res as any).count;
  } catch { return getCheckinCount(); }
}

