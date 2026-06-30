import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILITY_NORMALIZED_CONTRACT_FIELDS,
  normalizeMobilityRide,
  normalizeMobilityStatus,
} from '../mobilityNormalized.ts';

test('normalizes nested provider driver vehicle plate and tracking fields', () => {
  const ride = normalizeMobilityRide({
    id: 'ride_1',
    provider: 'elife',
    providerBookingId: 'ELF-123',
    status: 'driver-matching',
    driver: { displayName: 'Kwame Mensah' },
    vehicle: { color: 'Black', makeModel: 'Tesla Model Y', licensePlate: 'ATL-4821' },
    tracking: { url: 'https://track.example/ELF-123' },
  });

  assert.equal(ride.providerReservationId, 'ELF-123');
  assert.equal(ride.status, 'driver_matching');
  assert.equal(ride.driverName, 'Kwame Mensah');
  assert.equal(ride.vehicleMakeModel, 'Tesla Model Y');
  assert.equal(ride.vehicleColor, 'Black');
  assert.equal(ride.vehiclePlate, 'ATL-4821');
  assert.equal(ride.trackingUrl, 'https://track.example/ELF-123');
});

test('normalizes template shape used by Bytspot adapters', () => {
  const ride = normalizeMobilityRide({
    reservationReference: 'BYT-456',
    template: {
      driver: { name: 'Avery Johnson' },
      vehicle: { color: 'Silver', makeModel: 'Cadillac Escalade', licensePlate: 'BYT-456' },
      trackingUrl: 'https://bytspot.app/rides/BYT-456',
    },
  });

  assert.equal(ride.id, 'BYT-456');
  assert.equal(ride.providerReservationId, 'BYT-456');
  assert.equal(ride.status, 'pending');
  assert.equal(ride.driverName, 'Avery Johnson');
  assert.equal(ride.vehiclePlate, 'BYT-456');
  assert.equal(ride.trackingUrl, 'https://bytspot.app/rides/BYT-456');
});

test('declares backend contract fields required by native confirmed ride UI', () => {
  assert.deepEqual([...MOBILITY_NORMALIZED_CONTRACT_FIELDS], [
    'providerReservationId',
    'status',
    'driverName',
    'vehicleMakeModel',
    'vehicleColor',
    'vehiclePlate',
    'trackingUrl',
  ]);
  assert.equal(normalizeMobilityStatus('en route'), 'en_route');
});
