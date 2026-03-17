/**
 * useCity — Reverse-geocodes the user's GPS position into a city name.
 *
 * Flow: navigator.geolocation → Nominatim → city string
 *
 * Uses the free OpenStreetMap Nominatim API (no API key required).
 * Falls back to 'Atlanta' when location is unavailable or permission is denied.
 *
 * Usage:
 *   const { city, coords, loading, error } = useCity();
 */

import { useState, useEffect, useRef } from 'react';

export interface CityState {
  /** Human-friendly city name, e.g. "Atlanta" or "Miami" */
  city: string;
  /** Raw GPS coords from the device, null until granted */
  coords: { lat: number; lng: number } | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_CITY = 'Atlanta';
const DEFAULT_COORDS = { lat: 33.7866, lng: -84.3833 };

/** Cache key — reuse result across remounts within same session */
const CACHE_KEY = 'bytspot_city_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  city: string;
  coords: { lat: number; lng: number };
  ts: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* storage full — ignore */ }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error('Nominatim request failed');
  const data = await res.json();
  // Nominatim returns city, town, or village in address object
  const addr = data?.address ?? {};
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.county ||
    DEFAULT_CITY
  );
}

export function useCity(): CityState {
  const cached = readCache();
  const [city, setCity] = useState<string>(cached?.city ?? DEFAULT_CITY);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    cached?.coords ?? null
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(!!cached);

  useEffect(() => {
    if (resolvedRef.current) return; // already have a cached result

    if (!navigator.geolocation) {
      setLoading(false);
      setError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(userCoords);
        try {
          const detectedCity = await reverseGeocode(userCoords.lat, userCoords.lng);
          setCity(detectedCity);
          writeCache({ city: detectedCity, coords: userCoords, ts: Date.now() });
          resolvedRef.current = true;
        } catch (err) {
          // Geocoding failed — keep default city but use real coords
          setError('Could not detect city name');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        // Permission denied or timeout — use defaults silently
        setLoading(false);
        if (err.code !== err.PERMISSION_DENIED) {
          setError('Location unavailable');
        }
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: CACHE_TTL_MS }
    );
  }, []);

  return { city, coords, loading, error };
}

