import { useEffect, useState } from 'react';
import { trpc, type ApiVenue } from '../../utils/trpc';
import {
  FALLBACK_ATLANTA_PARKING,
  mergeParkingSources,
  placeToParkingSpot,
  venueToParkingSpot,
  type MapParkingSpot,
} from '../../utils/mapParking';

type Coordinates = { lat: number; lng: number };

export function useMapParkingData(options: {
  apiVenues: ApiVenue[];
  userCoords?: Coordinates;
  fallbackCenter: readonly [number, number];
}): MapParkingSpot[] {
  const { apiVenues, userCoords, fallbackCenter } = options;
  const [parkingData, setParkingData] = useState<MapParkingSpot[]>(FALLBACK_ATLANTA_PARKING);

  useEffect(() => {
    let cancelled = false;
    const center = userCoords ?? { lat: fallbackCenter[0], lng: fallbackCenter[1] };
    const vendor = apiVenues
      .map(venueToParkingSpot)
      .filter((spot): spot is MapParkingSpot => spot !== null);

    trpc.places.nearbySearch.query({ lat: center.lat, lng: center.lng, type: 'parking', maxResults: 12 })
      .then((res: { places?: Array<{ placeId: string; name: string; lat: number; lng: number }> }) => {
        if (cancelled) return;
        const places = (res.places ?? []).map(placeToParkingSpot);
        setParkingData(mergeParkingSources({ vendor, places, fallback: FALLBACK_ATLANTA_PARKING }));
      })
      .catch(() => {
        if (cancelled) return;
        setParkingData(mergeParkingSources({ vendor, places: [], fallback: FALLBACK_ATLANTA_PARKING }));
      });

    return () => { cancelled = true; };
  }, [apiVenues, fallbackCenter, userCoords]);

  return parkingData;
}