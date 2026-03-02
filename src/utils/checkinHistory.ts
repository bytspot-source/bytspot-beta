/**
 * checkinHistory — persists user venue check-in records to localStorage
 * Key: bytspot_checkin_history  (max 50 entries, newest first)
 */

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

export function getCheckinHistory(): CheckInRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCheckinRecord(record: Omit<CheckInRecord, 'id'>): void {
  const history = getCheckinHistory();
  const entry: CheckInRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...record };
  history.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX)));
}

export function getCheckinCount(): number {
  return getCheckinHistory().length;
}

