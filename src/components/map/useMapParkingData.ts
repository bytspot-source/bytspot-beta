import { useEffect, useState } from 'react';
import { trpc, type ApiVenue } from '../../utils/trpc';
import {
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
  const [parkingData, setParkingData] = useState<MapParkingSpot[]>([]);

  useEffect(() => {
    let cancelled = false;
    const center = userCoords ?? { lat: fallbackCenter[0], lng: fallbackCenter[1] };
    const venueProvided = apiVenues
      .map(venueToParkingSpot)
      .filter((spot): spot is MapParkingSpot => spot !== null);

    trpc.places.nearbySearch.query({ lat: center.lat, lng: center.lng, type: 'parking', maxResults: 12 })
      .then((res: { places?: Array<{ placeId: string; name: string; lat: number; lng: number }> }) => {
        if (cancelled) return;
        const places = (res.places ?? []).map(placeToParkingSpot);
        setParkingData(mergeParkingSources({ vendor: venueProvided, places }));
      })
      .catch(() => {
        if (cancelled) return;
        setParkingData(mergeParkingSources({ vendor: venueProvided, places: [] }));
      });

    return () => { cancelled = true; };
  }, [apiVenues, fallbackCenter, userCoords]);

  return parkingData;
}