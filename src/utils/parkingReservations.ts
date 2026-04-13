export const PARKING_RESERVATIONS_EVENT = 'bytspot:parking-reservations-updated';

const RESERVATIONS_KEY = 'bytspot_parking_reservations';
const PENDING_CHECKOUT_KEY = 'bytspot_pending_parking_checkout';
const MAX_RESERVATIONS = 12;

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
  source: 'demo' | 'stripe';
  sessionId?: string | null;
}

function emitReservationsUpdate(): void {
  window.dispatchEvent(new Event(PARKING_RESERVATIONS_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeReservations(reservations: ParkingReservationRecord[]): void {
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations.slice(0, MAX_RESERVATIONS)));
}

function createReservationRecord(draft: ParkingReservationDraft, source: ParkingReservationRecord['source'], sessionId?: string | null): ParkingReservationRecord {
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + draft.durationHours * 60 * 60 * 1000);
  return {
    ...draft,
    id: `parking-${Date.now()}`,
    reservationCode: `BYT${Date.now().toString().slice(-6)}`,
    createdAt: startTime.toISOString(),
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    status: 'active',
    source,
    sessionId: sessionId ?? null,
  };
}

export function getParkingReservations(): ParkingReservationRecord[] {
  return readJson<ParkingReservationRecord[]>(RESERVATIONS_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function savePendingParkingCheckout(draft: ParkingReservationDraft): void {
  localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(draft));
}

export function clearPendingParkingCheckout(): void {
  localStorage.removeItem(PENDING_CHECKOUT_KEY);
}

export function createDemoParkingReservation(draft: ParkingReservationDraft): ParkingReservationRecord {
  const reservation = createReservationRecord(draft, 'demo');
  writeReservations([reservation, ...getParkingReservations()]);
  clearPendingParkingCheckout();
  emitReservationsUpdate();
  return reservation;
}

export function finalizePendingParkingCheckout(sessionId?: string | null): ParkingReservationRecord | null {
  const draft = readJson<ParkingReservationDraft | null>(PENDING_CHECKOUT_KEY, null);
  if (!draft) return null;

  const reservation = createReservationRecord(draft, 'stripe', sessionId);
  writeReservations([reservation, ...getParkingReservations()]);
  clearPendingParkingCheckout();
  emitReservationsUpdate();
  return reservation;
}