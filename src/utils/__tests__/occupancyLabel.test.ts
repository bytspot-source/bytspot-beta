import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isLiveOccupancySource,
  occupancyKindLabel,
  venueAvailabilityLabel,
  venueWaitFallbackLabel,
} from '../occupancyLabel.ts';

test('treats only door / report / sensor as live', () => {
  assert.equal(isLiveOccupancySource('bytspot'), true);
  assert.equal(isLiveOccupancySource('user_report'), true);
  assert.equal(isLiveOccupancySource('sensor'), true);
  assert.equal(isLiveOccupancySource('typical'), false);
  assert.equal(isLiveOccupancySource('simulation'), false);
  assert.equal(isLiveOccupancySource('manual'), false);
  assert.equal(isLiveOccupancySource(undefined), false);
});

test('never labels a catalog row Live', () => {
  assert.equal(occupancyKindLabel('typical'), 'Typical');
  assert.equal(occupancyKindLabel(undefined), 'Typical');
  assert.equal(venueAvailabilityLabel({ source: 'typical', level: 2 }), 'Typical now');
  assert.equal(venueWaitFallbackLabel('typical'), 'Typical wait');
});

test('keeps Live wording for a real report', () => {
  assert.equal(occupancyKindLabel('user_report'), 'Live');
  assert.equal(venueAvailabilityLabel({ source: 'bytspot', level: 2 }), 'Live availability');
  assert.equal(venueWaitFallbackLabel('sensor'), 'Live wait');
});
