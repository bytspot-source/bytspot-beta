/**
 * Mock data for Fusion Engine Diagnostics
 * Simulates backend sensor fusion outputs for visualization
 */

export interface FusionDataPoint {
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  };
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
  location: {
    lat: number;
    lng: number;
  };
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
  sensorAvailability: {
    gps: number; // percentage
    wifi: number;
    ble: number;
    imu: number;
  };
  processingLatency: number; // ms
}

// Generate mock trip with realistic sensor fusion data
export function generateMockTrip(): TripData {
  const startTime = Date.now() - (30 * 60 * 1000); // 30 minutes ago
  const waypoints: FusionDataPoint[] = [];
  const geofenceEvents: GeofenceEvent[] = [];
  
  // Simulate a trip from start location to destination
  const startLat = 37.7749;
  const startLng = -122.4194;
  
  // Generate waypoints (one per 30 seconds)
  for (let i = 0; i < 60; i++) {
    const timestamp = startTime + (i * 30 * 1000);
    
    // Simulate movement
    const lat = startLat + (i * 0.0001);
    const lng = startLng + (i * 0.0001);
    
    // Vary accuracy based on environment (worse in urban canyons)
    const isUrbanCanyon = i > 15 && i < 25;
    const hasIndoorSection = i > 35 && i < 45;
    
    let gpsAccuracy = 5 + Math.random() * 10;
    let wifiNetworks = Math.floor(3 + Math.random() * 5);
    let bleBeacons = Math.floor(2 + Math.random() * 4);
    
    if (isUrbanCanyon) {
      gpsAccuracy = 25 + Math.random() * 20;
      wifiNetworks = Math.floor(1 + Math.random() * 2);
    }
    
    if (hasIndoorSection) {
      gpsAccuracy = 50 + Math.random() * 30;
      wifiNetworks = Math.floor(5 + Math.random() * 8);
      bleBeacons = Math.floor(4 + Math.random() * 6);
    }
    
    const wifiAccuracy = 8 + Math.random() * 8;
    const bleAccuracy = 2 + Math.random() * 3;
    
    // Calculate weighted fusion accuracy
    const gpsWeight = Math.min(1, 30 / gpsAccuracy);
    const wifiWeight = hasIndoorSection ? 0.8 : 0.3;
    const bleWeight = hasIndoorSection ? 0.9 : 0.2;
    const imuWeight = 0.1;
    
    const totalWeight = gpsWeight + wifiWeight + bleWeight + imuWeight;
    const fusedAccuracy = (
      (gpsAccuracy * gpsWeight) +
      (wifiAccuracy * wifiWeight) +
      (bleAccuracy * bleWeight) +
      (5 * imuWeight)
    ) / totalWeight;
    
    const confidence = fusedAccuracy < 5 ? 'very-high' : 
                      fusedAccuracy < 12 ? 'high' : 
                      fusedAccuracy < 25 ? 'medium' : 'low';
    
    waypoints.push({
      timestamp,
      location: { lat, lng },
      accuracy: gpsAccuracy,
      confidence,
      sources: {
        gps: { available: true, accuracy: gpsAccuracy, weight: gpsWeight },
        wifi: { available: wifiNetworks > 0, accuracy: wifiAccuracy, networks: wifiNetworks, weight: wifiWeight },
        ble: { available: bleBeacons > 0, accuracy: bleAccuracy, beacons: bleBeacons, weight: bleWeight },
        imu: { available: true, confidence: 0.85 + Math.random() * 0.15, weight: imuWeight },
      },
      fusedAccuracy,
      speed: 5 + Math.random() * 10,
      heading: 45 + Math.random() * 10,
    });
    
    // Add geofence events
    if (i === 5) {
      geofenceEvents.push({
        id: `gf-${Date.now()}-1`,
        timestamp,
        type: 'enter',
        zoneName: 'Downtown Plaza Garage',
        zoneId: 'zone-001',
        location: { lat, lng },
        accuracy: fusedAccuracy,
        method: 'fusion',
        confidence: 0.95,
        userId: 'user-123',
        tripId: `trip-${Date.now()}`,
      });
    }
    
    if (i === 55) {
      geofenceEvents.push({
        id: `gf-${Date.now()}-2`,
        timestamp,
        type: 'exit',
        zoneName: 'Downtown Plaza Garage',
        zoneId: 'zone-001',
        location: { lat, lng },
        accuracy: fusedAccuracy,
        method: 'fusion',
        confidence: 0.92,
        userId: 'user-123',
        tripId: `trip-${Date.now()}`,
      });
    }
  }
  
  return {
    id: `trip-${Date.now()}`,
    userId: 'user-123',
    userRole: 'driver',
    startTime,
    endTime: Date.now(),
    status: 'completed',
    waypoints,
    geofenceEvents,
    totalDistance: 3.2,
    averageAccuracy: waypoints.reduce((sum, w) => sum + w.fusedAccuracy, 0) / waypoints.length,
    averageConfidence: 'high',
  };
}

export function generateMockSystemHealth(): SystemHealth {
  return {
    timestamp: Date.now(),
    activeUsers: 247,
    activeTrips: 18,
    averageAccuracy: 4.2,
    fusionEngineStatus: 'healthy',
    sensorAvailability: {
      gps: 98.5,
      wifi: 87.3,
      ble: 76.8,
      imu: 99.2,
    },
    processingLatency: 85,
  };
}

export function generateMockRecentEvents(): GeofenceEvent[] {
  const events: GeofenceEvent[] = [];
  const zones = [
    'Downtown Plaza Garage',
    'Marina Bay Parking',
    'Tech Campus Lot A',
    'Airport Terminal 2',
    'Shopping Mall West',
  ];
  
  for (let i = 0; i < 15; i++) {
    const timestamp = Date.now() - (i * 5 * 60 * 1000);
    const zone = zones[Math.floor(Math.random() * zones.length)];
    
    events.push({
      id: `gf-${timestamp}-${i}`,
      timestamp,
      type: Math.random() > 0.5 ? 'enter' : 'exit',
      zoneName: zone,
      zoneId: `zone-${Math.floor(Math.random() * 100)}`,
      location: {
        lat: 37.7749 + (Math.random() - 0.5) * 0.1,
        lng: -122.4194 + (Math.random() - 0.5) * 0.1,
      },
      accuracy: 2 + Math.random() * 8,
      method: ['gps', 'wifi', 'ble', 'fusion'][Math.floor(Math.random() * 4)] as any,
      confidence: 0.75 + Math.random() * 0.25,
      userId: `user-${Math.floor(Math.random() * 500)}`,
      tripId: `trip-${timestamp}`,
    });
  }
  
  return events;
}

export const mockActiveTrips: Partial<TripData>[] = [
  {
    id: 'trip-active-1',
    userId: 'driver-042',
    userRole: 'driver',
    startTime: Date.now() - 12 * 60 * 1000,
    status: 'active',
    totalDistance: 1.8,
    averageAccuracy: 3.5,
    averageConfidence: 'very-high',
  },
  {
    id: 'trip-active-2',
    userId: 'driver-089',
    userRole: 'driver',
    startTime: Date.now() - 25 * 60 * 1000,
    status: 'active',
    totalDistance: 4.2,
    averageAccuracy: 5.8,
    averageConfidence: 'high',
  },
  {
    id: 'trip-active-3',
    userId: 'parker-156',
    userRole: 'parker',
    startTime: Date.now() - 8 * 60 * 1000,
    status: 'active',
    totalDistance: 0.6,
    averageAccuracy: 12.3,
    averageConfidence: 'medium',
  },
];
