import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeWeatherCode, getWeatherEmoji, getWeatherTip, type WeatherSnapshot } from '../hooks/useWeather.ts';

const snapshot = (overrides: Partial<WeatherSnapshot>): WeatherSnapshot => ({
  temperatureF: 72,
  feelsLikeF: 72,
  humidity: 55,
  windMph: 6,
  precipitationIn: 0,
  weatherCode: 1,
  isDay: true,
  updatedAt: new Date('2026-04-29T12:00:00Z').toISOString(),
  source: 'live',
  ...overrides,
});

test('describeWeatherCode maps severe and wet conditions to user-friendly labels', () => {
  assert.equal(describeWeatherCode(0), 'Clear');
  assert.equal(describeWeatherCode(61), 'Rain nearby');
  assert.equal(describeWeatherCode(95), 'Storm watch');
});

test('getWeatherEmoji uses day/night and precipitation context', () => {
  assert.equal(getWeatherEmoji(snapshot({ weatherCode: 0, isDay: true })), '☀️');
  assert.equal(getWeatherEmoji(snapshot({ weatherCode: 0, isDay: false })), '🌙');
  assert.equal(getWeatherEmoji(snapshot({ weatherCode: 80 })), '🌧️');
});

test('getWeatherTip prioritizes action-oriented parking guidance', () => {
  assert.match(getWeatherTip(snapshot({ weatherCode: 95 })), /valet|covered parking/i);
  assert.match(getWeatherTip(snapshot({ weatherCode: 61, precipitationIn: 0.05 })), /covered parking/i);
  assert.match(getWeatherTip(snapshot({ temperatureF: 91 })), /shaded parking/i);
  assert.match(getWeatherTip(snapshot({ windMph: 20 })), /Windy/i);
});