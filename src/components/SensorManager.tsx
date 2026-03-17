import { useState, useEffect, useCallback } from 'react';

export interface SensorData {
  // Location data
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  altitude?: number;
  
  // WiFi data
  wifiEnabled: boolean;
  wifiNetworks: WifiNetwork[];
  wifiAccuracy?: number;
  
  // BLE data
  bleEnabled: boolean;
  bleBeacons: BleBeacon[];
  bleAccuracy?: number;
  
  // IMU data
  imuEnabled: boolean;
  acceleration?: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    alpha: number; // Z-axis rotation
    beta: number;  // X-axis rotation
    gamma: number; // Y-axis rotation
  };
  magnetometer?: {
    heading: number;
    accuracy: number;
  };
  
  // Fused data
  fusedAccuracy: number;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very-high';
  indoorDetected: boolean;
  movementDetected: boolean;
}

interface WifiNetwork {
  ssid: string;
  bssid: string;
  signalStrength: number; // dBm
  frequency: number; // MHz
  estimatedDistance?: number; // meters
}

interface BleBeacon {
  uuid: string;
  major: number;
  minor: number;
  rssi: number; // signal strength
  distance: number; // meters
  accuracy: number;
  name?: string;
}

export interface SensorSettings {
  gpsEnabled: boolean;
  wifiScanningEnabled: boolean;
  bleScanningEnabled: boolean;
  imuEnabled: boolean;
  highAccuracyMode: boolean;
  batterySaverMode: boolean;
  indoorPositioningEnabled: boolean;
}

const DEFAULT_SETTINGS: SensorSettings = {
  gpsEnabled: true,
  wifiScanningEnabled: true,
  bleScanningEnabled: true,
  imuEnabled: true,
  highAccuracyMode: false,
  batterySaverMode: false,
  indoorPositioningEnabled: true,
};

export class SensorManager {
  private static instance: SensorManager;
  private settings: SensorSettings;
  private sensorData: SensorData;
  private listeners: Set<(data: SensorData) => void> = new Set();
  private updateInterval?: number;
  private watchId?: number;
  private isRestarting: boolean = false;
  private restartTimeout?: number;
  
  // Simulated sensor data for demo
  private wifiNetworks: WifiNetwork[] = [
    { ssid: 'BytspotParking-5G', bssid: '00:11:22:33:44:55', signalStrength: -45, frequency: 5180, estimatedDistance: 5 },
    { ssid: 'Downtown-Plaza-WiFi', bssid: '00:11:22:33:44:66', signalStrength: -62, frequency: 2437, estimatedDistance: 15 },
    { ssid: 'CityParking-Mesh', bssid: '00:11:22:33:44:77', signalStrength: -55, frequency: 5240, estimatedDistance: 10 },
  ];
  
  private bleBeacons: BleBeacon[] = [
    { uuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', major: 100, minor: 1, rssi: -65, distance: 8.5, accuracy: 2.0, name: 'Entrance' },
    { uuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', major: 100, minor: 2, rssi: -58, distance: 5.2, accuracy: 1.5, name: 'Level 1' },
    { uuid: 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', major: 100, minor: 3, rssi: -72, distance: 12.3, accuracy: 3.0, name: 'Level 2' },
  ];
  
  private constructor() {
    this.settings = this.loadSettings();
    this.sensorData = this.getInitialSensorData();
    this.startSensors();
  }
  
  public static getInstance(): SensorManager {
    if (!SensorManager.instance) {
      SensorManager.instance = new SensorManager();
    }
    return SensorManager.instance;
  }
  
  private loadSettings(): SensorSettings {
    const stored = localStorage.getItem('bytspot_sensor_settings');
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  }
  
  public saveSettings(settings: SensorSettings): void {
    this.settings = settings;
    localStorage.setItem('bytspot_sensor_settings', JSON.stringify(settings));
    
    // Debounce restart to prevent rapid toggling
    if (this.restartTimeout !== undefined) {
      clearTimeout(this.restartTimeout);
    }
    
    this.restartTimeout = window.setTimeout(() => {
      this.restartSensors();
      this.restartTimeout = undefined;
    }, 300); // Wait 300ms before restarting
  }
  
  public getSettings(): SensorSettings {
    return { ...this.settings };
  }
  
  private getInitialSensorData(): SensorData {
    return {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
      wifiEnabled: false,
      wifiNetworks: [],
      bleEnabled: false,
      bleBeacons: [],
      imuEnabled: false,
      fusedAccuracy: 10,
      confidenceLevel: 'medium',
      indoorDetected: false,
      movementDetected: false,
    };
  }
  
  private startSensors(): void {
    // Start GPS
    if (this.settings.gpsEnabled && 'geolocation' in navigator) {
      try {
        this.watchId = navigator.geolocation.watchPosition(
          this.handleLocationUpdate.bind(this),
          this.handleLocationError.bind(this),
          {
            enableHighAccuracy: this.settings.highAccuracyMode,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      } catch (error) {
        // Geolocation API not supported or blocked
        if (import.meta.env.DEV) {
          console.debug('Geolocation not available, using default location');
        }
      }
    }
    
    // Start WiFi scanning (simulated)
    if (this.settings.wifiScanningEnabled) {
      this.startWifiScanning();
    }
    
    // Start BLE scanning (simulated)
    if (this.settings.bleScanningEnabled) {
      this.startBleScanning();
    }
    
    // Start IMU sensors
    if (this.settings.imuEnabled) {
      this.startImuSensors();
    }
    
    // Start fusion algorithm
    this.startSensorFusion();
  }
  
  private restartSensors(): void {
    // Set restarting flag to prevent notifications during restart
    this.isRestarting = true;
    
    this.stopSensors();
    
    // Small delay to allow cleanup
    setTimeout(() => {
      this.startSensors();
      
      // Clear restarting flag after sensors are started
      setTimeout(() => {
        this.isRestarting = false;
      }, 100);
    }, 50);
  }
  
  private stopSensors(): void {
    if (this.watchId !== undefined) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = undefined;
    }
    
    if (this.updateInterval !== undefined) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    // Clear any pending restart timeout
    if (this.restartTimeout !== undefined) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = undefined;
    }
  }
  
  private handleLocationUpdate(position: GeolocationPosition): void {
    this.sensorData.latitude = position.coords.latitude;
    this.sensorData.longitude = position.coords.longitude;
    this.sensorData.accuracy = position.coords.accuracy;
    this.sensorData.altitude = position.coords.altitude || undefined;
    this.notifyListeners();
  }
  
  private handleLocationError(error: GeolocationPositionError): void {
    // Silently handle location errors - this is expected when location is disabled or denied
    // We fall back to default location (San Francisco)
    const errorMessages: Record<number, string> = {
      1: 'Location permission denied',
      2: 'Location unavailable',
      3: 'Location request timeout'
    };
    
    // Only log in development, not in production
    if (import.meta.env.DEV) {
      console.debug('Location service:', errorMessages[error.code] || 'Unknown error');
    }
    
    // Use default location if geolocation fails
    this.sensorData.latitude = 37.7749;
    this.sensorData.longitude = -122.4194;
    this.sensorData.accuracy = 50; // Lower accuracy for default location
  }
  
  private startWifiScanning(): void {
    this.sensorData.wifiEnabled = true;
    this.sensorData.wifiNetworks = this.wifiNetworks;
    
    // Calculate WiFi-based accuracy (stronger signal = better accuracy)
    const avgSignal = this.wifiNetworks.reduce((sum, net) => sum + net.signalStrength, 0) / this.wifiNetworks.length;
    this.sensorData.wifiAccuracy = Math.max(2, Math.min(20, (-avgSignal - 30) / 2));
  }
  
  private startBleScanning(): void {
    this.sensorData.bleEnabled = true;
    this.sensorData.bleBeacons = this.bleBeacons;
    
    // Calculate BLE-based accuracy (closest beacon)
    const closestBeacon = this.bleBeacons.reduce((prev, curr) => 
      curr.distance < prev.distance ? curr : prev
    );
    this.sensorData.bleAccuracy = closestBeacon.accuracy;
    
    // Detect indoor based on BLE beacons
    this.sensorData.indoorDetected = this.bleBeacons.some(b => b.distance < 20);
  }
  
  private startImuSensors(): void {
    this.sensorData.imuEnabled = true;
    
    // DeviceMotion API (accelerometer + gyroscope)
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', this.handleDeviceMotion.bind(this));
    }
    
    // DeviceOrientation API (magnetometer)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
    }
  }
  
  private handleDeviceMotion(event: DeviceMotionEvent): void {
    if (event.acceleration) {
      this.sensorData.acceleration = {
        x: event.acceleration.x || 0,
        y: event.acceleration.y || 0,
        z: event.acceleration.z || 0,
      };
      
      // Detect movement (any acceleration > threshold)
      const totalAccel = Math.sqrt(
        Math.pow(event.acceleration.x || 0, 2) +
        Math.pow(event.acceleration.y || 0, 2) +
        Math.pow(event.acceleration.z || 0, 2)
      );
      this.sensorData.movementDetected = totalAccel > 0.5;
    }
  }
  
  private handleDeviceOrientation(event: DeviceOrientationEvent): void {
    this.sensorData.rotation = {
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
    };
    
    if (event.absolute && event.alpha !== null) {
      this.sensorData.magnetometer = {
        heading: event.alpha,
        accuracy: event.absolute ? 5 : 15,
      };
    }
  }
  
  private startSensorFusion(): void {
    // Run fusion algorithm every 100ms
    this.updateInterval = window.setInterval(() => {
      this.fuseSensorData();
      this.updateGeofencingService();
      this.notifyListeners();
    }, 100);
  }
  
  private updateGeofencingService(): void {
    // Update geofencing service with current sensor data
    if (typeof window !== 'undefined') {
      // Dynamically import to avoid circular dependencies
      import('../utils/geofencing').then(({ GeofencingService }) => {
        const service = GeofencingService.getInstance();
        
        // Update location
        service.updateLocation(this.sensorData.latitude, this.sensorData.longitude);
        
        // Update Bluetooth beacons (extract UUIDs)
        const beaconUUIDs = this.sensorData.bleBeacons.map(b => b.uuid);
        service.updateBluetoothBeacons(beaconUUIDs);
        
        // Update WiFi networks (extract SSIDs)
        const wifiSSIDs = this.sensorData.wifiNetworks.map(n => n.ssid);
        service.updateWifiNetworks(wifiSSIDs);
      }).catch(() => {
        // Geofencing service not available, skip update
      });
    }
  }
  
  private fuseSensorData(): void {
    const accuracies: number[] = [];
    
    // GPS accuracy
    if (this.settings.gpsEnabled && this.sensorData.accuracy) {
      accuracies.push(this.sensorData.accuracy);
    }
    
    // WiFi accuracy (high weight indoors)
    if (this.settings.wifiScanningEnabled && this.sensorData.wifiAccuracy) {
      const weight = this.sensorData.indoorDetected ? 0.3 : 0.5;
      accuracies.push(this.sensorData.wifiAccuracy * weight);
    }
    
    // BLE accuracy (highest weight indoors)
    if (this.settings.bleScanningEnabled && this.sensorData.bleAccuracy) {
      const weight = this.sensorData.indoorDetected ? 0.2 : 0.8;
      accuracies.push(this.sensorData.bleAccuracy * weight);
    }
    
    // IMU improves accuracy if stationary
    if (this.settings.imuEnabled && !this.sensorData.movementDetected) {
      accuracies.push(1); // Very accurate if not moving
    }
    
    // Calculate fused accuracy (weighted average)
    if (accuracies.length > 0) {
      this.sensorData.fusedAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    }
    
    // Determine confidence level
    if (this.sensorData.fusedAccuracy < 3) {
      this.sensorData.confidenceLevel = 'very-high';
    } else if (this.sensorData.fusedAccuracy < 8) {
      this.sensorData.confidenceLevel = 'high';
    } else if (this.sensorData.fusedAccuracy < 15) {
      this.sensorData.confidenceLevel = 'medium';
    } else {
      this.sensorData.confidenceLevel = 'low';
    }
  }
  
  public subscribe(callback: (data: SensorData) => void): () => void {
    this.listeners.add(callback);
    // Immediately call with current data
    callback(this.sensorData);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  private notifyListeners(): void {
    // Don't notify during restart to prevent flickering
    if (this.isRestarting) {
      return;
    }
    
    this.listeners.forEach(callback => callback({ ...this.sensorData }));
  }
  
  public getCurrentData(): SensorData {
    return { ...this.sensorData };
  }
  
  public requestPermissions(): Promise<boolean> {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { enableHighAccuracy: true }
        );
      } else {
        resolve(false);
      }
    });
  }
  
  public destroy(): void {
    this.stopSensors();
    this.listeners.clear();
    this.isRestarting = false;
  }
}

// React hook for using sensor data
export function useSensorData(): SensorData {
  const [data, setData] = useState<SensorData>(() => 
    SensorManager.getInstance().getCurrentData()
  );
  
  useEffect(() => {
    const unsubscribe = SensorManager.getInstance().subscribe(setData);
    return unsubscribe;
  }, []);
  
  return data;
}

// React hook for sensor settings
export function useSensorSettings(): [SensorSettings, (settings: SensorSettings) => void] {
  const [settings, setSettings] = useState<SensorSettings>(() => 
    SensorManager.getInstance().getSettings()
  );
  
  const updateSettings = useCallback((newSettings: SensorSettings) => {
    // Check if settings actually changed to prevent unnecessary updates
    const currentSettings = SensorManager.getInstance().getSettings();
    const hasChanged = Object.keys(newSettings).some(
      key => currentSettings[key as keyof SensorSettings] !== newSettings[key as keyof SensorSettings]
    );
    
    if (!hasChanged) {
      return; // No changes, skip update
    }
    
    // Update state immediately for UI responsiveness
    setSettings(newSettings);
    
    // Update sensor manager (debounced internally)
    SensorManager.getInstance().saveSettings(newSettings);
  }, []);
  
  return [settings, updateSettings];
}
