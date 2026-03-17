/**
 * Bytspot Geofencing Service
 * 
 * Provides advanced geofencing capabilities using:
 * - Bluetooth Low Energy (BLE) beacons for indoor/precise zones
 * - WiFi network detection for area-based zones
 * - GPS for outdoor/large zones
 * 
 * Features:
 * - Multi-sensor fusion for accurate enter/exit detection
 * - Zone priority system (parking spots, saved locations, valet areas)
 * - Battery-efficient monitoring with adaptive polling
 * - Offline support with cached zone data
 */

import { useState, useEffect } from 'react';

export interface GeofenceZone {
  id: string;
  name: string;
  type: 'parking' | 'valet' | 'saved' | 'venue' | 'custom';
  priority: number; // 1-10, higher = more important
  
  // Location-based geofence (GPS)
  location?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  
  // Bluetooth-based geofence (BLE beacons)
  bluetooth?: {
    beaconUUIDs: string[]; // iBeacon UUIDs to detect
    triggerDistance: number; // meters
  };
  
  // WiFi-based geofence (network detection)
  wifi?: {
    networkSSIDs: string[]; // WiFi SSIDs to detect
    signalThreshold?: number; // minimum signal strength (dBm)
  };
  
  // Metadata
  metadata?: {
    address?: string;
    notes?: string;
    spotNumber?: string;
    price?: number;
  };
}

export interface GeofenceEvent {
  zoneId: string;
  zoneName: string;
  type: 'enter' | 'exit';
  timestamp: Date;
  method: 'gps' | 'bluetooth' | 'wifi' | 'fused';
  accuracy: number; // meters
  confidence: number; // 0-1
}

type GeofenceListener = (event: GeofenceEvent) => void;

export class GeofencingService {
  private static instance: GeofencingService;
  private zones: Map<string, GeofenceZone> = new Map();
  private activeZones: Set<string> = new Set(); // Currently inside these zones
  private listeners: Set<GeofenceListener> = new Set();
  private monitoringInterval?: number;
  private isMonitoring = false;
  
  // Current sensor data (from SensorManager) — starts at 0,0 until updateLocation() is called
  private currentLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  private currentBleBeacons: string[] = [];
  private currentWifiNetworks: string[] = [];
  
  // Configuration
  private config = {
    pollIntervalMs: 2000, // Check every 2 seconds
    batterySaverIntervalMs: 5000, // Check every 5 seconds in battery saver mode
    dwellTimeMs: 3000, // Must be in zone for 3 seconds before triggering entry
    exitTimeMs: 5000, // Must be out of zone for 5 seconds before triggering exit
  };
  
  // Dwell time tracking
  private zoneDwellTimers: Map<string, { enterTime: number; exitTime: number }> = new Map();
  
  private constructor() {
    this.loadZones();
    this.loadActiveZones();
    
    // Make available for debugging in browser console
    if (typeof window !== 'undefined') {
      (window as any).GeofencingService = GeofencingService;
    }
  }
  
  public static getInstance(): GeofencingService {
    if (!GeofencingService.instance) {
      GeofencingService.instance = new GeofencingService();
    }
    return GeofencingService.instance;
  }
  
  // Zone Management
  public addZone(zone: GeofenceZone): void {
    this.zones.set(zone.id, zone);
    this.saveZones();
  }
  
  public removeZone(zoneId: string): void {
    this.zones.delete(zoneId);
    this.activeZones.delete(zoneId);
    this.zoneDwellTimers.delete(zoneId);
    this.saveZones();
    this.saveActiveZones();
  }
  
  public getZone(zoneId: string): GeofenceZone | undefined {
    return this.zones.get(zoneId);
  }
  
  public getAllZones(): GeofenceZone[] {
    return Array.from(this.zones.values());
  }
  
  public getActiveZones(): GeofenceZone[] {
    return Array.from(this.activeZones)
      .map(id => this.zones.get(id))
      .filter((zone): zone is GeofenceZone => zone !== undefined);
  }
  
  // Monitoring Control
  public startMonitoring(batteryMode: boolean = false): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    const interval = batteryMode ? this.config.batterySaverIntervalMs : this.config.pollIntervalMs;
    
    this.monitoringInterval = window.setInterval(() => {
      this.checkGeofences();
    }, interval);
    
    // Initial check
    this.checkGeofences();
  }
  
  public stopMonitoring(): void {
    if (this.monitoringInterval !== undefined) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
  }
  
  // Update current position/sensors
  public updateLocation(lat: number, lng: number): void {
    this.currentLocation = { lat, lng };
  }
  
  public updateBluetoothBeacons(beaconUUIDs: string[]): void {
    this.currentBleBeacons = beaconUUIDs;
  }
  
  public updateWifiNetworks(networkSSIDs: string[]): void {
    this.currentWifiNetworks = networkSSIDs;
  }
  
  // Event Listening
  public subscribe(listener: GeofenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  private notifyListeners(event: GeofenceEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
  
  // Core Geofencing Logic
  private checkGeofences(): void {
    const now = Date.now();
    
    // Check each zone
    this.zones.forEach((zone) => {
      const isInZone = this.checkZone(zone);
      const wasInZone = this.activeZones.has(zone.id);
      
      // Get or create dwell timer
      if (!this.zoneDwellTimers.has(zone.id)) {
        this.zoneDwellTimers.set(zone.id, { enterTime: 0, exitTime: 0 });
      }
      const dwellTimer = this.zoneDwellTimers.get(zone.id)!;
      
      if (isInZone && !wasInZone) {
        // Potentially entering zone
        if (dwellTimer.enterTime === 0) {
          dwellTimer.enterTime = now;
        } else if (now - dwellTimer.enterTime >= this.config.dwellTimeMs) {
          // Dwell time met - trigger entry
          this.handleZoneEntry(zone);
          dwellTimer.enterTime = 0;
          dwellTimer.exitTime = 0;
        }
      } else if (!isInZone && wasInZone) {
        // Potentially exiting zone
        if (dwellTimer.exitTime === 0) {
          dwellTimer.exitTime = now;
        } else if (now - dwellTimer.exitTime >= this.config.exitTimeMs) {
          // Dwell time met - trigger exit
          this.handleZoneExit(zone);
          dwellTimer.enterTime = 0;
          dwellTimer.exitTime = 0;
        }
      } else {
        // Reset timers if state hasn't changed
        if (isInZone === wasInZone) {
          dwellTimer.enterTime = 0;
          dwellTimer.exitTime = 0;
        }
      }
    });
  }
  
  private checkZone(zone: GeofenceZone): boolean {
    const results: { inZone: boolean; method: string; accuracy: number; confidence: number }[] = [];
    
    // Check GPS-based geofence
    if (zone.location) {
      const distance = this.calculateDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        zone.location.latitude,
        zone.location.longitude
      );
      const inZone = distance <= zone.location.radiusMeters;
      results.push({
        inZone,
        method: 'gps',
        accuracy: Math.abs(distance - zone.location.radiusMeters),
        confidence: inZone ? Math.max(0, 1 - (distance / zone.location.radiusMeters)) : 0,
      });
    }
    
    // Check Bluetooth-based geofence
    if (zone.bluetooth && zone.bluetooth.beaconUUIDs.length > 0) {
      const hasMatchingBeacon = zone.bluetooth.beaconUUIDs.some(uuid => 
        this.currentBleBeacons.includes(uuid)
      );
      results.push({
        inZone: hasMatchingBeacon,
        method: 'bluetooth',
        accuracy: zone.bluetooth.triggerDistance,
        confidence: hasMatchingBeacon ? 0.9 : 0, // High confidence for BLE
      });
    }
    
    // Check WiFi-based geofence
    if (zone.wifi && zone.wifi.networkSSIDs.length > 0) {
      const hasMatchingNetwork = zone.wifi.networkSSIDs.some(ssid => 
        this.currentWifiNetworks.includes(ssid)
      );
      results.push({
        inZone: hasMatchingNetwork,
        method: 'wifi',
        accuracy: 20, // WiFi typically ~20m accuracy
        confidence: hasMatchingNetwork ? 0.7 : 0, // Medium-high confidence for WiFi
      });
    }
    
    // Fusion logic: if any method says we're in zone with high confidence, we're in zone
    // Prioritize BLE > WiFi > GPS for indoor areas
    const sortedResults = results.sort((a, b) => b.confidence - a.confidence);
    return sortedResults.length > 0 && sortedResults[0].inZone;
  }
  
  private handleZoneEntry(zone: GeofenceZone): void {
    this.activeZones.add(zone.id);
    this.saveActiveZones();
    
    const event: GeofenceEvent = {
      zoneId: zone.id,
      zoneName: zone.name,
      type: 'enter',
      timestamp: new Date(),
      method: 'fused',
      accuracy: 5, // Fused accuracy
      confidence: 0.9,
    };
    
    this.notifyListeners(event);
    
    // Store event history
    this.addEventToHistory(event);
  }
  
  private handleZoneExit(zone: GeofenceZone): void {
    this.activeZones.delete(zone.id);
    this.saveActiveZones();
    
    const event: GeofenceEvent = {
      zoneId: zone.id,
      zoneName: zone.name,
      type: 'exit',
      timestamp: new Date(),
      method: 'fused',
      accuracy: 5,
      confidence: 0.9,
    };
    
    this.notifyListeners(event);
    
    // Store event history
    this.addEventToHistory(event);
  }
  
  // Utilities
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
  
  // Persistence
  private saveZones(): void {
    const zonesArray = Array.from(this.zones.values());
    localStorage.setItem('bytspot_geofence_zones', JSON.stringify(zonesArray));
  }
  
  private loadZones(): void {
    const stored = localStorage.getItem('bytspot_geofence_zones');
    if (stored) {
      const zonesArray = JSON.parse(stored) as GeofenceZone[];
      this.zones = new Map(zonesArray.map(z => [z.id, z]));
    } else {
      // Load default zones
      this.loadDefaultZones();
    }
  }
  
  private saveActiveZones(): void {
    const activeArray = Array.from(this.activeZones);
    localStorage.setItem('bytspot_active_geofence_zones', JSON.stringify(activeArray));
  }
  
  private loadActiveZones(): void {
    const stored = localStorage.getItem('bytspot_active_geofence_zones');
    if (stored) {
      const activeArray = JSON.parse(stored) as string[];
      this.activeZones = new Set(activeArray);
    }
  }
  
  private addEventToHistory(event: GeofenceEvent): void {
    const history = this.getEventHistory();
    history.unshift(event);
    
    // Keep last 50 events
    const trimmed = history.slice(0, 50);
    localStorage.setItem('bytspot_geofence_events', JSON.stringify(trimmed));
  }
  
  public getEventHistory(): GeofenceEvent[] {
    const stored = localStorage.getItem('bytspot_geofence_events');
    if (stored) {
      const events = JSON.parse(stored);
      // Parse dates
      return events.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
    }
    return [];
  }
  
  private loadDefaultZones(): void {
    // No default zones — users create real zones via the app.
    // Previously contained hardcoded San Francisco demo data.
  }
  
  // Quick zone creation helpers
  public createParkingZone(
    name: string,
    lat: number,
    lng: number,
    radiusMeters: number = 50,
    beaconUUIDs?: string[],
    wifiSSIDs?: string[]
  ): string {
    const id = `parking-${Date.now()}`;
    this.addZone({
      id,
      name,
      type: 'parking',
      priority: 7,
      location: { latitude: lat, longitude: lng, radiusMeters },
      ...(beaconUUIDs && { bluetooth: { beaconUUIDs, triggerDistance: 20 } }),
      ...(wifiSSIDs && { wifi: { networkSSIDs: wifiSSIDs } }),
    });
    return id;
  }
  
  public createValetZone(
    name: string,
    lat: number,
    lng: number,
    beaconUUIDs?: string[]
  ): string {
    const id = `valet-${Date.now()}`;
    this.addZone({
      id,
      name,
      type: 'valet',
      priority: 10,
      location: { latitude: lat, longitude: lng, radiusMeters: 30 },
      ...(beaconUUIDs && { bluetooth: { beaconUUIDs, triggerDistance: 15 } }),
    });
    return id;
  }
}

// React hook for geofencing
export function useGeofencing(autoStart: boolean = true) {
  const [activeZones, setActiveZones] = useState<GeofenceZone[]>([]);
  const [recentEvents, setRecentEvents] = useState<GeofenceEvent[]>([]);
  
  useEffect(() => {
    const service = GeofencingService.getInstance();
    
    if (autoStart) {
      service.startMonitoring();
    }
    
    // Subscribe to events
    const unsubscribe = service.subscribe((event) => {
      setRecentEvents(prev => [event, ...prev.slice(0, 9)]);
      
      // Update active zones
      setActiveZones(service.getActiveZones());
    });
    
    // Initial state
    setActiveZones(service.getActiveZones());
    setRecentEvents(service.getEventHistory().slice(0, 10));
    
    return () => {
      unsubscribe();
      if (autoStart) {
        service.stopMonitoring();
      }
    };
  }, [autoStart]);
  
  return {
    activeZones,
    recentEvents,
    service: GeofencingService.getInstance(),
  };
}
