export type MobilityProvider = 'elife' | 'uber' | 'lyft' | 'bytspot' | (string & {});

export type NormalizedMobilityStatus =
  | 'draft'
  | 'quoted'
  | 'pending'
  | 'confirmed'
  | 'driver_matching'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export interface NormalizedMobilityQuote {
  id: string;
  provider: MobilityProvider;
  providerQuoteId?: string;
  serviceClass?: string;
  serviceTitle?: string;
  priceLabel?: string;
  etaLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  cancellationLabel?: string;
  providerBookingMode: 'bytspot_reservation' | 'third_party_handoff';
  requiresAccountLink?: boolean;
  currency?: string;
  expiresAt?: string;
}

export interface NormalizedMobilityRide {
  id: string;
  provider: MobilityProvider;
  providerReservationId?: string;
  status: NormalizedMobilityStatus;
  serviceClass?: string;
  serviceTitle?: string;
  priceLabel?: string;
  etaLabel?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  driverName?: string;
  vehicleMakeModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
  trackingUrl?: string;
  cancellationLabel?: string;
  createdAt?: string;
  updatedAt?: string;
}

type AnyRecord = Record<string, unknown>;

const clean = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const nested = (raw: unknown, key: string): AnyRecord | undefined =>
  raw && typeof raw === 'object' && key in raw && typeof (raw as AnyRecord)[key] === 'object'
    ? ((raw as AnyRecord)[key] as AnyRecord)
    : undefined;

const first = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const result = clean(value);
    if (result) return result;
  }
  return undefined;
};

export function normalizeMobilityStatus(value: unknown): NormalizedMobilityStatus {
  const status = clean(value)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (status === 'matching' || status === 'driver_matching') return 'driver_matching';
  if (status === 'enroute' || status === 'en_route') return 'en_route';
  if (status && ['draft', 'quoted', 'pending', 'confirmed', 'assigned', 'arrived', 'completed', 'cancelled'].includes(status)) {
    return status as NormalizedMobilityStatus;
  }
  return 'pending';
}

export function normalizeMobilityRide(raw: AnyRecord): NormalizedMobilityRide {
  const driver = nested(raw, 'driver') ?? nested(raw, 'assignedDriver') ?? nested(raw, 'vendorDriver');
  const vehicle = nested(raw, 'vehicle') ?? nested(raw, 'car');
  const template = nested(raw, 'template');
  const templateDriver = nested(template, 'driver');
  const templateVehicle = nested(template, 'vehicle');
  const tracking = nested(raw, 'tracking');
  const providerReservationId = first(
    raw.providerReservationId,
    raw.providerBookingId,
    raw.externalReservationId,
    raw.reservationReference,
    raw.reservationCode,
    raw.bookingReference,
    template?.providerReservationId,
  );
  return {
    id: first(raw.id, providerReservationId) ?? `byt-ride-${Date.now()}`,
    provider: first(raw.provider) ?? 'bytspot',
    providerReservationId,
    status: normalizeMobilityStatus(raw.status),
    serviceClass: first(raw.serviceClass),
    serviceTitle: first(raw.serviceTitle),
    priceLabel: first(raw.priceLabel),
    etaLabel: first(raw.etaLabel),
    pickupLabel: first(raw.pickupLabel),
    dropoffLabel: first(raw.dropoffLabel),
    driverName: first(raw.driverName, raw.driverLabel, driver?.name, driver?.displayName, template?.driverName, templateDriver?.name),
    vehicleMakeModel: first(raw.vehicleMakeModel, raw.vehicleName, raw.vehicleLabel, vehicle?.makeModel, vehicle?.label, vehicle?.name, template?.vehicleMakeModel, templateVehicle?.makeModel),
    vehicleColor: first(raw.vehicleColor, vehicle?.color, templateVehicle?.color),
    vehiclePlate: first(raw.vehiclePlate, raw.licensePlate, raw.plateLabel, raw.plate, vehicle?.licensePlate, vehicle?.plate, template?.vehiclePlate, templateVehicle?.licensePlate),
    trackingUrl: first(raw.trackingUrl, raw.trackingURL, raw.trackingLink, tracking?.url, template?.trackingUrl),
    cancellationLabel: first(raw.cancellationLabel),
    createdAt: first(raw.createdAt),
    updatedAt: first(raw.updatedAt),
  };
}

export const MOBILITY_NORMALIZED_CONTRACT_FIELDS = [
  'providerReservationId',
  'status',
  'driverName',
  'vehicleMakeModel',
  'vehicleColor',
  'vehiclePlate',
  'trackingUrl',
] as const;
