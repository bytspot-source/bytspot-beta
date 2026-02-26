# Bytspot Location Service Documentation

## Overview

Bytspot's location service provides **industry-leading positioning accuracy** through multi-sensor fusion, combining GPS, Bluetooth Low Energy (BLE) beacons, WiFi network triangulation, and Inertial Measurement Unit (IMU) sensors. This creates a comprehensive geofencing and location tracking system optimized for parking and urban mobility applications.

## Core Components

### 1. LocationPermissionFlow Component
**Path:** `/components/LocationPermissionFlow.tsx`

iOS-style permission dialogs that request user consent for:
- **Location Access** (Always, While Using App, Don't Allow)
- **Bluetooth Scanning** (for BLE beacon detection)
- **WiFi Scanning** (for network-based positioning)

**Features:**
- Beautiful glassmorphism UI matching iOS design language
- Educational content explaining why each permission is needed
- Privacy-focused messaging with encryption guarantees
- Permission state persistence in localStorage
- Integration with attached image assets for authentic iOS appearance

**Usage:**
```tsx
import { LocationPermissionFlow, useLocationPermissions } from './components/LocationPermissionFlow';

// Show permission flow
<LocationPermissionFlow
  isDarkMode={true}
  onComplete={(permissions) => {
    console.log('Permissions granted:', permissions);
  }}
  autoStart={true}
/>

// Check permission status
const { permissions, hasAllPermissions, needsPermissions } = useLocationPermissions();
```

### 2. GeofencingService
**Path:** `/utils/geofencing.ts`

Enterprise-grade geofencing service with multi-sensor fusion.

**Key Features:**
- **GPS Geofencing:** Traditional lat/lng circular zones (50-500m radius)
- **Bluetooth Geofencing:** iBeacon-based proximity detection (1-20m accuracy)
- **WiFi Geofencing:** Network SSID-based area detection (10-50m accuracy)
- **Sensor Fusion:** Intelligent combination of all methods for best accuracy
- **Dwell Time:** Prevents false triggers with configurable entry/exit delays
- **Battery Optimization:** Adaptive polling intervals (2s normal, 5s battery saver)
- **Zone Priority:** 1-10 scale for importance-based processing
- **Event History:** Last 50 geofence events stored locally

**Zone Types:**
- `parking` - Parking spots and garages
- `valet` - Valet service locations
- `saved` - User-saved favorite locations
- `venue` - Points of interest
- `custom` - User-defined zones

**Example Usage:**
```typescript
import { GeofencingService } from './utils/geofencing';

const service = GeofencingService.getInstance();

// Create a parking zone
const zoneId = service.createParkingZone(
  'Downtown Plaza Garage',
  37.7749,  // latitude
  -122.4194, // longitude
  100,       // radius in meters
  ['f7826da6-4fa2-4e98-8024-bc5b71e0893e'], // BLE beacon UUIDs
  ['BytspotParking-5G', 'Downtown-Plaza-WiFi'] // WiFi SSIDs
);

// Start monitoring
service.startMonitoring(false); // false = normal mode, true = battery saver

// Subscribe to events
const unsubscribe = service.subscribe((event) => {
  if (event.type === 'enter') {
    console.log(`Entered ${event.zoneName}!`);
    console.log(`Detection method: ${event.method}`);
    console.log(`Accuracy: ±${event.accuracy}m`);
  }
});

// Update sensor data (automatically done by SensorManager)
service.updateLocation(37.7749, -122.4194);
service.updateBluetoothBeacons(['uuid1', 'uuid2']);
service.updateWifiNetworks(['SSID1', 'SSID2']);
```

### 3. SensorManager Updates
**Path:** `/components/SensorManager.tsx`

Enhanced sensor manager now automatically feeds data to the geofencing service.

**New Integration:**
- Automatic geofencing updates every 100ms
- BLE beacon UUID extraction from scan results
- WiFi network SSID extraction from scan results
- Seamless multi-sensor fusion

**Sensor Data Structure:**
```typescript
interface SensorData {
  // GPS
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  
  // WiFi
  wifiEnabled: boolean;
  wifiNetworks: WifiNetwork[];
  wifiAccuracy?: number;
  
  // Bluetooth
  bleEnabled: boolean;
  bleBeacons: BleBeacon[];
  bleAccuracy?: number;
  
  // IMU (motion sensors)
  imuEnabled: boolean;
  acceleration?: { x, y, z };
  rotation?: { alpha, beta, gamma };
  magnetometer?: { heading, accuracy };
  
  // Fused results
  fusedAccuracy: number;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very-high';
  indoorDetected: boolean;
  movementDetected: boolean;
}
```

### 4. GeofenceMonitor Component
**Path:** `/components/GeofenceMonitor.tsx`

Visual display for active geofences and recent events.

**Features:**
- Real-time active zone display
- Event history with timestamps
- Sensor method badges (GPS/BLE/WiFi)
- Compact and full view modes
- Animated entry/exit indicators

**Usage:**
```tsx
import { GeofenceMonitor } from './components/GeofenceMonitor';

// Full display
<GeofenceMonitor isDarkMode={true} />

// Compact badge
<GeofenceMonitor isDarkMode={true} compact={true} />
```

### 5. GeofenceOverlay Component
**Path:** `/components/GeofenceOverlay.tsx`

Map overlay visualization for geofence zones.

**Features:**
- Circular zone boundaries
- Active zone pulsing animation
- Sensor capability badges (BLE/WiFi icons)
- Zone labels with names
- Color-coded by zone type

## Multi-Sensor Fusion Algorithm

### How It Works

1. **GPS Layer** (Outdoor, 5-50m accuracy)
   - Standard satellite positioning
   - Best for outdoor, open sky environments
   - Degrades in urban canyons and indoors

2. **WiFi Layer** (Indoor/Urban, 5-20m accuracy)
   - Scans nearby WiFi networks
   - Matches SSIDs to known locations
   - Excellent for indoor positioning
   - No connection required, just scanning

3. **Bluetooth Layer** (Precision, 1-5m accuracy)
   - Detects BLE iBeacons
   - Uses RSSI (signal strength) for distance
   - Best accuracy for indoor navigation
   - Specific to equipped parking garages

4. **IMU Layer** (Motion detection)
   - Accelerometer detects movement
   - Gyroscope tracks rotation
   - Magnetometer provides compass heading
   - Improves accuracy when stationary

### Fusion Logic

The system intelligently combines all sensors:

```typescript
// Outdoor scenario: GPS is king
if (!indoorDetected && gpsAccuracy < 15) {
  return GPS_RESULT;
}

// Indoor scenario: BLE > WiFi > GPS
if (indoorDetected) {
  if (bleBeaconsFound) return BLE_RESULT;      // ±2m
  if (wifiNetworksFound) return WIFI_RESULT;   // ±10m
  return GPS_RESULT;                            // ±30m (degraded)
}

// Moving vs Stationary
if (movementDetected) {
  // Increase polling, prefer GPS
  fusedAccuracy *= 1.2;
} else {
  // Stationary = more accurate
  fusedAccuracy *= 0.8;
}
```

## Configuration & Settings

### SensorSettings Component
**Path:** `/components/SensorSettings.tsx`

Comprehensive settings UI for location services:

**GPS Settings:**
- Enable/disable GPS
- High accuracy mode
- Current accuracy display

**WiFi Settings:**
- WiFi scanning toggle
- Indoor positioning toggle
- Network count display

**Bluetooth Settings:**
- BLE scanning toggle
- Nearby beacons list
- Signal strength indicators

**Geofence Settings:**
- Enable/disable geofencing
- Alert radius (50-500m)
- Active zones monitor

**Power Management:**
- Battery saver mode
- Adaptive polling intervals

## Integration with App Flow

### Onboarding Sequence

1. **Data Consent** → User agrees to data collection
2. **Authentication** → User signs in
3. **Profile Setup** → Basic user info
4. **Interest Preferences** → User selects interests
5. **Location Permissions** ← **NEW STEP**
   - Location (Always/While Using/Deny)
   - Bluetooth (Allow/Deny)
   - WiFi (Enable/GPS Only)
6. **Spot Discovery** → AI curates initial spots
7. **Main App** → Full experience unlocked

### Real-Time Notifications

The app automatically shows toast notifications when:
- Entering a parking zone
- Exiting a parking zone
- Arriving at a saved spot
- Approaching a valet location

```typescript
// Automatic in App.tsx
useEffect(() => {
  const service = GeofencingService.getInstance();
  const unsubscribe = service.subscribe((event) => {
    if (event.type === 'enter') {
      toast.success(`Arrived at ${event.zoneName}`);
    } else {
      toast.info(`Left ${event.zoneName}`);
    }
  });
  return () => unsubscribe();
}, []);
```

## Privacy & Security

### Data Handling

**What We Collect:**
- GPS coordinates (encrypted at rest)
- BLE beacon UUIDs (anonymous hardware IDs)
- WiFi SSIDs (network names only, no passwords)
- Motion sensor data (device orientation/movement)

**What We DON'T Collect:**
- WiFi passwords
- Connected network traffic
- Personal browsing history
- Contacts or other app data

### Storage

- All location data encrypted in localStorage
- Geofence zones stored locally (no cloud sync)
- Event history limited to 50 most recent
- Automatic cleanup of old events

### Permissions

Users have granular control:
- Can grant/deny each permission independently
- Can change settings anytime in Settings
- App degrades gracefully with limited permissions
- Clear explanation of why each permission is needed

## Best Practices

### For Parking Operators

1. **Deploy BLE Beacons:**
   - Place iBeacons at garage entrances
   - One beacon per parking level
   - Broadcast UUID in Bytspot format
   - Recommended: Estimote or Kontakt.io beacons

2. **Configure WiFi:**
   - Ensure WiFi coverage throughout garage
   - Use consistent SSID naming
   - Register SSIDs with Bytspot network database

3. **Set Up Geofences:**
   ```typescript
   service.createParkingZone(
     'Your Garage Name',
     latitude,
     longitude,
     100, // radius
     ['beacon-uuid-1', 'beacon-uuid-2'],
     ['YourGarage-WiFi', 'YourGarage-5G']
   );
   ```

### For Developers

1. **Battery Optimization:**
   - Use battery saver mode when app is backgrounded
   - Increase polling intervals during low activity
   - Stop monitoring when not needed

2. **Accuracy Tuning:**
   - Adjust dwell times based on use case
   - Larger zones = longer dwell time needed
   - Smaller zones = shorter dwell time acceptable

3. **Testing:**
   - Test in both outdoor and indoor environments
   - Verify all three detection methods work
   - Check notification timing and accuracy

## Troubleshooting

### "Location not updating"
- Check browser permissions (allow location)
- Ensure GPS is enabled on device
- Try refreshing the page
- Check Settings → Sensor Settings → GPS Enabled

### "No Bluetooth beacons found"
- Ensure Bluetooth permission granted
- Check that beacons are powered on
- Verify beacon UUIDs match configuration
- BLE requires HTTPS or localhost

### "WiFi networks not detected"
- Ensure WiFi scanning enabled in settings
- Browser API limitations (may not work in all browsers)
- Some browsers block WiFi scanning for privacy

### "Geofence not triggering"
- Check zone is properly configured
- Verify dwell time settings (default 3s entry, 5s exit)
- Ensure monitoring is started
- Check that you're within zone radius

## Performance Metrics

Expected accuracy by method:

| Method | Accuracy | Update Rate | Power Usage |
|--------|----------|-------------|-------------|
| GPS | ±5-50m | 1 Hz | High |
| WiFi | ±5-20m | 0.5 Hz | Low |
| Bluetooth | ±1-5m | 2 Hz | Medium |
| Fused | ±2-10m | 10 Hz | Optimized |

## Future Enhancements

Planned improvements:
- [ ] Ultra-Wideband (UWB) support for sub-meter accuracy
- [ ] Machine learning for better sensor fusion
- [ ] Predictive geofencing (enter before you arrive)
- [ ] Shared geofence zones (community-contributed)
- [ ] Background geofencing (with proper iOS/Android permissions)
- [ ] Geofence analytics dashboard
- [ ] Custom zone shapes (polygons, not just circles)

## Support

For issues or questions:
- Check the troubleshooting section above
- Review component source code in `/components` and `/utils`
- Test in Settings → Sensor Settings → Location Sensors
- Enable battery saver mode if experiencing performance issues

---

**Last Updated:** December 2024
**Version:** 1.0.0
**Status:** Production Ready ✅
