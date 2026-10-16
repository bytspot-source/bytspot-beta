export const PARKING_RESERVATIONS_EVENT = 'bytspot:parking-reservations-updated';

const RESERVATIONS_KEY = 'bytspot_parking_reservations';

export interface ParkingReservationDraft {
  spotId: string;
  spotName: string;
  address: string;
  durationHours: number;
  totalCost: number;
}

export interface ParkingReservationRecord extends ParkingReservationDraft {
  id: string;
  reservationCode: string;
  createdAt: string;
  startTime: string;
  endTime: string;
  status: 'active' | 'confirmed';
  source: 'stripe';
  sessionId?: string | null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getParkingReservations(): ParkingReservationRecord[] {
  return readJson<ParkingReservationRecord[]>(RESERVATIONS_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
