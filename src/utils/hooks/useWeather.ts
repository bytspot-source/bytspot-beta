import { useCallback, useEffect, useMemo, useState } from 'react';

export interface WeatherCoords { lat: number; lng: number }

export interface WeatherSnapshot {
  temperatureF: number;
  feelsLikeF: number;
  humidity: number;
  windMph: number;
  precipitationIn: number;
  weatherCode: number;
  isDay: boolean;
  updatedAt: string;
  source: 'live' | 'cached' | 'fallback';
}

export interface WeatherState {
  current: WeatherSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_COORDS = { lat: 33.7866, lng: -84.3833 };
const CACHE_TTL_MS = 10 * 60 * 1000;

const fallbackWeather = (): WeatherSnapshot => ({
  temperatureF: 72,
  feelsLikeF: 72,
  humidity: 58,
  windMph: 6,
  precipitationIn: 0,
  weatherCode: 1,
  isDay: true,
  updatedAt: new Date().toISOString(),
  source: 'fallback',
});

const cacheKeyFor = (coords: WeatherCoords) =>
  `bytspot_weather_${coords.lat.toFixed(2)}_${coords.lng.toFixed(2)}`;

function readCache(coords: WeatherCoords): WeatherSnapshot | null {
  try {
    const raw = sessionStorage.getItem(cacheKeyFor(coords));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    if (Date.now() - new Date(parsed.updatedAt).getTime() > CACHE_TTL_MS) return null;
    return { ...parsed, source: 'cached' };
  } catch {
    return null;
  }
}

function writeCache(coords: WeatherCoords, snapshot: WeatherSnapshot) {
  try { sessionStorage.setItem(cacheKeyFor(coords), JSON.stringify(snapshot)); } catch { /* ignore */ }
}

export function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain nearby';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'Snowy';
  if (code >= 95) return 'Storm watch';
  return 'Updated';
}

export function getWeatherEmoji(snapshot: WeatherSnapshot): string {
  if (snapshot.weatherCode >= 95) return '⛈️';
  if ((snapshot.weatherCode >= 51 && snapshot.weatherCode <= 67) || snapshot.weatherCode >= 80) return '🌧️';
  if (snapshot.weatherCode >= 45 && snapshot.weatherCode <= 48) return '🌫️';
  if (snapshot.weatherCode >= 3) return '☁️';
  return snapshot.isDay ? '☀️' : '🌙';
}

export function getWeatherTip(snapshot: WeatherSnapshot): string {
  const wet = snapshot.precipitationIn > 0 || snapshot.weatherCode >= 51;
  if (snapshot.weatherCode >= 95) return 'Storms possible — prioritize valet or covered parking.';
  if (wet) return 'Rain in the mix — look for covered parking and shorter walks.';
  if (snapshot.temperatureF >= 88) return 'Hot out — choose shaded parking and quick indoor stops.';
  if (snapshot.temperatureF <= 42) return 'Cold conditions — keep walks short and routes direct.';
  if (snapshot.windMph >= 18) return 'Windy right now — secure light gear before you park.';
  return 'Good conditions for parking, walking, and exploring nearby.';
}

async function fetchWeather(coords: WeatherCoords, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lng),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error('Weather unavailable');
  const data = await res.json();
  const current = data?.current ?? {};
  return {
    temperatureF: Number(current.temperature_2m ?? 72),
    feelsLikeF: Number(current.apparent_temperature ?? current.temperature_2m ?? 72),
    humidity: Number(current.relative_humidity_2m ?? 0),
    windMph: Number(current.wind_speed_10m ?? 0),
    precipitationIn: Number(current.precipitation ?? 0),
    weatherCode: Number(current.weather_code ?? 1),
    isDay: Boolean(current.is_day ?? true),
    updatedAt: new Date().toISOString(),
    source: 'live',
  };
}

export function useWeather(coords?: WeatherCoords | null): WeatherState {
  const resolvedCoords = useMemo(() => coords ?? DEFAULT_COORDS, [coords?.lat, coords?.lng]);
  const [current, setCurrent] = useState<WeatherSnapshot>(() => readCache(resolvedCoords) ?? fallbackWeather());
  const [loading, setLoading] = useState(current.source === 'fallback');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await fetchWeather(resolvedCoords, signal);
      writeCache(resolvedCoords, next);
      setCurrent(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Weather unavailable');
      setCurrent(readCache(resolvedCoords) ?? fallbackWeather());
    } finally {
      setLoading(false);
    }
  }, [resolvedCoords]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { current, loading, error, refresh: () => refresh() };
}