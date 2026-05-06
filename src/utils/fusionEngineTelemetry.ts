export interface FusionDataPoint {
  timestamp: number;
  location: { lat: number; lng: number };
  accuracy: number;
  confidence: 'very-high' | 'high' | 'medium' | 'low';
  sources: {
    gps: { available: boolean; accuracy: number; weight: number };
    wifi: { available: boolean; accuracy: number; networks: number; weight: number };
    ble: { available: boolean; accuracy: number; beacons: number; weight: number };
    imu: { available: boolean; confidence: number; weight: number };
  };
  fusedAccuracy: number;
  speed: number;
  heading: number;
}

export interface GeofenceEvent {
  id: string;
  timestamp: number;
  type: 'enter' | 'exit';
  zoneName: string;
  zoneId: string;
  location: { lat: number; lng: number };
  accuracy: number;
  method: 'gps' | 'wifi' | 'ble' | 'fusion';
  confidence: number;
  userId: string;
  tripId?: string;
}

export interface TripData {
  id: string;
  userId: string;
  userRole: 'parker' | 'driver';
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'disputed';
  waypoints: FusionDataPoint[];
  geofenceEvents: GeofenceEvent[];
  totalDistance: number;
  averageAccuracy: number;
  averageConfidence: 'very-high' | 'high' | 'medium' | 'low';
  disputes?: string[];
}

export interface SystemHealth {
  timestamp: number;
  activeUsers: number;
  activeTrips: number;
  averageAccuracy: number;
  fusionEngineStatus: 'healthy' | 'degraded' | 'down';
  sensorAvailability: { gps: number; wifi: number; ble: number; imu: number };
  processingLatency: number;
}

export const EMPTY_SYSTEM_HEALTH: SystemHealth = {
  timestamp: Date.now(),
  activeUsers: 0,
  activeTrips: 0,
  averageAccuracy: 0,
  fusionEngineStatus: 'down',
  sensorAvailability: { gps: 0, wifi: 0, ble: 0, imu: 0 },
  processingLatency: 0,
};

export const liveActiveTrips: Partial<TripData>[] = [];
export const liveRecentGeofenceEvents: GeofenceEvent[] = [];