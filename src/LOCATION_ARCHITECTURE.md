# Bytspot Location Service Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       BYTSPOT LOCATION SERVICE                   │
│                  Multi-Sensor Geofencing Platform                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Permission Flow  │  │ Geofence Monitor │  │ Map Overlay   │ │
│  │ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌───────────┐ │ │
│  │ │  Location    │ │  │ │ Active Zones │ │  │ │   Zones   │ │ │
│  │ │  Bluetooth   │ │  │ │ Event History│ │  │ │  Circles  │ │ │
│  │ │  WiFi        │ │  │ │ Accuracy     │ │  │ │  Labels   │ │ │
│  │ └──────────────┘ │  │ └──────────────┘ │  │ └───────────┘ │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      REACT HOOKS LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  useGeofencing()  │  useLocationPermissions()  │  useSensorData()│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE / MANAGER LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────┐  ┌─────────────────────────────┐│
│  │   GeofencingService       │  │     SensorManager           ││
│  │  ┌─────────────────────┐  │  │  ┌───────────────────────┐ ││
│  │  │ Zone Management     │  │  │  │ GPS Tracking          │ ││
│  │  │ Monitoring Loop     │  │  │  │ BLE Scanning          │ ││
│  │  │ Event Dispatch      │  │  │  │ WiFi Scanning         │ ││
│  │  │ Dwell Time Logic    │  │  │  │ IMU Sensors           │ ││
│  │  │ Sensor Fusion       │  │  │  │ Sensor Fusion         │ ││
│  │  └─────────────────────┘  │  │  └───────────────────────┘ ││
│  └───────────────────────────┘  └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BROWSER APIs LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  Geolocation API  │  Bluetooth API  │  DeviceMotion  │  DeviceOrientation │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      HARDWARE SENSORS                            │
├─────────────────────────────────────────────────────────────────┤
│    GPS Chip    │   BLE Radio    │   WiFi Radio   │   IMU Chip   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
USER GRANTS PERMISSIONS
        │
        ├─→ Location (Always/While Using/Deny)
        ├─→ Bluetooth (Allow/Deny)
        └─→ WiFi (Enable/GPS Only)
        │
        ↓
PERMISSIONS STORED IN localStorage
        │
        ↓
SENSOR MANAGER INITIALIZES
        │
        ├─→ GPS Watch Position (1 Hz)
        ├─→ BLE Beacon Scan (2 Hz)
        ├─→ WiFi Network Scan (0.5 Hz)
        └─→ IMU Sensor Listen (10 Hz)
        │
        ↓
SENSOR DATA COLLECTED
        │
        ├─→ latitude, longitude, accuracy
        ├─→ BLE beacon UUIDs, RSSI, distance
        ├─→ WiFi SSIDs, signal strength
        └─→ acceleration, rotation, heading
        │
        ↓
SENSOR FUSION ALGORITHM
        │
        ├─→ Indoor Detection (BLE beacons present?)
        ├─→ Movement Detection (IMU data > threshold?)
        ├─→ Weighted Accuracy Calculation
        └─→ Confidence Level Assignment
        │
        ↓
UPDATE GEOFENCING SERVICE
        │
        ├─→ service.updateLocation(lat, lng)
        ├─→ service.updateBluetoothBeacons([UUIDs])
        └─→ service.updateWifiNetworks([SSIDs])
        │
        ↓
GEOFENCE CHECK LOOP (every 2s)
        │
        ├─→ For each zone:
        │   ├─→ Check GPS distance
        │   ├─→ Check BLE beacon match
        │   ├─→ Check WiFi SSID match
        │   └─→ Fusion: ANY method = in zone
        │
        ├─→ Dwell Time Filter:
        │   ├─→ Entry: must be in zone 3+ seconds
        │   └─→ Exit: must be out of zone 5+ seconds
        │
        └─→ Trigger Events:
            ├─→ ENTER event → activeZones.add(zoneId)
            └─→ EXIT event → activeZones.delete(zoneId)
        │
        ↓
EVENT DISPATCH
        │
        ├─→ All subscribed listeners called
        ├─→ Event added to history (max 50)
        └─→ UI components updated
        │
        ↓
USER SEES NOTIFICATION
        │
        └─→ Toast: "Arrived at Downtown Plaza Garage"
            "BLE positioning • ±2m accuracy"
```

## Component Interaction Flow

```
App.tsx (Root)
   │
   ├─→ ONBOARDING FLOW
   │   │
   │   ├─→ SplashScreen
   │   ├─→ LandingPage
   │   ├─→ DataConsentFlow
   │   ├─→ AuthenticationFlow
   │   ├─→ ProfileSetup
   │   ├─→ InterestPreferences
   │   ├─→ LocationPermissionFlow ◄── NEW STEP
   │   │   │
   │   │   ├─→ Location Permission Dialog
   │   │   ├─→ Bluetooth Permission Dialog
   │   │   └─→ WiFi Permission Dialog
   │   │
   │   └─→ SpotDiscoveryCurating
   │
   ├─→ MAIN APP
   │   │
   │   ├─→ Initialize GeofencingService
   │   │   └─→ Subscribe to events
   │   │       └─→ Show toast notifications
   │   │
   │   ├─→ Home Tab
   │   │   └─→ Quick Actions (Find Parking, etc.)
   │   │
   │   ├─→ Discover Tab
   │   │   └─→ Swipe cards with locations
   │   │
   │   ├─→ Map Tab
   │   │   └─→ GeofenceOverlay ◄── Shows zone circles
   │   │
   │   ├─→ Insider Tab
   │   │
   │   └─→ Concierge Tab
   │
   └─→ SETTINGS (Profile Menu)
       │
       └─→ SensorSettings
           │
           ├─→ Permission Status Display
           ├─→ GeofenceMonitor ◄── Shows active zones
           ├─→ GPS Settings
           ├─→ WiFi Settings
           ├─→ Bluetooth Settings
           ├─→ Geofence Radius Config
           └─→ Battery Saver Toggle
```

## State Management

```
┌─────────────────────────────────────────────────────────┐
│                   PERSISTENT STATE                       │
│                    (localStorage)                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  bytspot_location_permissions                           │
│  ├─ location: 'always' | 'whenInUse' | 'denied'        │
│  ├─ bluetooth: boolean                                  │
│  └─ wifi: boolean                                       │
│                                                          │
│  bytspot_geofence_zones                                 │
│  └─ [GeofenceZone, GeofenceZone, ...]                  │
│                                                          │
│  bytspot_active_geofence_zones                          │
│  └─ ['zone-id-1', 'zone-id-2', ...]                    │
│                                                          │
│  bytspot_geofence_events                                │
│  └─ [GeofenceEvent, GeofenceEvent, ...] (last 50)      │
│                                                          │
│  bytspot_sensor_settings                                │
│  ├─ gpsEnabled: boolean                                 │
│  ├─ wifiScanningEnabled: boolean                        │
│  ├─ bleScanningEnabled: boolean                         │
│  ├─ imuEnabled: boolean                                 │
│  ├─ highAccuracyMode: boolean                           │
│  └─ batterySaverMode: boolean                           │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    RUNTIME STATE                         │
│                  (Singleton Services)                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  SensorManager Instance                                 │
│  ├─ sensorData: SensorData                             │
│  ├─ listeners: Set<callback>                           │
│  └─ updateInterval: NodeJS.Timer                       │
│                                                          │
│  GeofencingService Instance                             │
│  ├─ zones: Map<id, GeofenceZone>                       │
│  ├─ activeZones: Set<id>                               │
│  ├─ listeners: Set<callback>                           │
│  ├─ zoneDwellTimers: Map<id, timers>                   │
│  └─ monitoringInterval: NodeJS.Timer                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Sensor Fusion Algorithm

```
FUSION ALGORITHM
─────────────────

INPUT:
  • GPS: latitude, longitude, accuracy (5-50m)
  • BLE: beacon UUIDs, RSSI values (1-5m)
  • WiFi: network SSIDs, signal strength (5-20m)
  • IMU: movement detected, heading

STEP 1: Indoor Detection
  ─────────────────────
  IF (BLE beacons found AND distance < 20m)
    → indoorDetected = true
  ELSE IF (GPS accuracy > 30m)
    → indoorDetected = likely
  ELSE
    → indoorDetected = false

STEP 2: Accuracy Weighting
  ────────────────────────
  IF (indoorDetected)
    • BLE weight = 0.2 (highest priority)
    • WiFi weight = 0.3
    • GPS weight = 0.5 (lowest priority)
  ELSE
    • GPS weight = 1.0 (highest priority)
    • WiFi weight = 0.5
    • BLE weight = 0.8

STEP 3: Movement Adjustment
  ──────────────────────────
  IF (movement detected)
    • Increase accuracy radius by 20%
    • Prefer GPS over BLE/WiFi
  ELSE
    • Decrease accuracy radius by 20%
    • Trust BLE/WiFi more

STEP 4: Confidence Calculation
  ─────────────────────────────
  fusedAccuracy = Σ(sensorAccuracy × weight) / count
  
  IF (fusedAccuracy < 3m)
    → confidence = 'very-high'
  ELSE IF (fusedAccuracy < 8m)
    → confidence = 'high'
  ELSE IF (fusedAccuracy < 15m)
    → confidence = 'medium'
  ELSE
    → confidence = 'low'

OUTPUT:
  • fusedAccuracy: number (meters)
  • confidenceLevel: string
  • indoorDetected: boolean
  • movementDetected: boolean
```

## Geofence Detection Logic

```
ZONE CHECK ALGORITHM
────────────────────

FOR EACH zone IN zones:

  STEP 1: Check All Methods
    ──────────────────────
    gpsMatch = (distance to zone.location < zone.radius)
    bleMatch = (any beacon UUID matches zone.bluetooth.beaconUUIDs)
    wifiMatch = (any network SSID matches zone.wifi.networkSSIDs)

  STEP 2: Fusion Decision
    ─────────────────────
    isInZone = (gpsMatch OR bleMatch OR wifiMatch)
    
    // Priority: BLE > WiFi > GPS for indoor
    // Priority: GPS > BLE > WiFi for outdoor

  STEP 3: Dwell Time Filter
    ────────────────────────
    IF (isInZone AND NOT wasInZone):
      IF (dwellTimer.enterTime == 0):
        dwellTimer.enterTime = now
      ELSE IF (now - dwellTimer.enterTime >= 3000ms):
        → TRIGGER ENTRY EVENT
        
    ELSE IF (NOT isInZone AND wasInZone):
      IF (dwellTimer.exitTime == 0):
        dwellTimer.exitTime = now
      ELSE IF (now - dwellTimer.exitTime >= 5000ms):
        → TRIGGER EXIT EVENT

  STEP 4: Event Creation
    ────────────────────
    event = {
      zoneId: zone.id,
      zoneName: zone.name,
      type: 'enter' | 'exit',
      timestamp: new Date(),
      method: 'fused',
      accuracy: fusedAccuracy,
      confidence: 0.9
    }
```

## Performance Characteristics

```
┌──────────────────────────────────────────────────────┐
│              POLLING & UPDATE RATES                   │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Sensor Update Rates:                                │
│  ├─ GPS: 1 Hz (every 1000ms)                        │
│  ├─ BLE: 2 Hz (every 500ms)                         │
│  ├─ WiFi: 0.5 Hz (every 2000ms)                     │
│  └─ IMU: 10 Hz (every 100ms)                        │
│                                                       │
│  Fusion Update Rate:                                 │
│  └─ 10 Hz (every 100ms)                             │
│                                                       │
│  Geofence Check Rate:                                │
│  ├─ Normal: 0.5 Hz (every 2000ms)                   │
│  └─ Battery Saver: 0.2 Hz (every 5000ms)            │
│                                                       │
│  UI Update Rate:                                     │
│  └─ On sensor data change (reactive)                │
│                                                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│               ACCURACY EXPECTATIONS                   │
├──────────────────────────────────────────────────────┤
│                                                       │
│  GPS Only:          ±5-50m  (outdoor)                │
│  WiFi Only:         ±5-20m  (indoor/urban)           │
│  BLE Only:          ±1-5m   (beacon proximity)       │
│  Fused (all):       ±2-10m  (optimal)                │
│                                                       │
│  Confidence Levels:                                  │
│  ├─ Very High: ±2-3m   (BLE + WiFi + GPS)           │
│  ├─ High:      ±3-8m   (2+ sensors active)          │
│  ├─ Medium:    ±8-15m  (1 sensor or low signal)     │
│  └─ Low:       ±15-50m (GPS only, poor signal)      │
│                                                       │
└──────────────────────────────────────────────────────┘
```

## File Structure Summary

```
/
├── components/
│   ├── LocationPermissionFlow.tsx    ← Permission dialogs
│   ├── GeofenceMonitor.tsx          ← Zone status display
│   ├── GeofenceOverlay.tsx          ← Map visualization
│   ├── SensorManager.tsx            ← Core sensor engine
│   ├── SensorSettings.tsx           ← Settings UI
│   └── LocationAccuracy.tsx         ← Accuracy widget
│
├── utils/
│   └── geofencing.ts                ← Geofencing service
│
├── App.tsx                          ← Main app (integration)
│
└── Documentation/
    ├── LOCATION_SERVICE.md          ← Technical docs
    ├── LOCATION_IMPLEMENTATION_SUMMARY.md
    ├── LOCATION_COMPONENTS_GUIDE.md
    └── LOCATION_ARCHITECTURE.md     ← This file
```

## Security & Privacy Flow

```
USER DATA FLOW
──────────────

Permissions Requested
        │
        ├─→ User Reviews Privacy Info
        ├─→ User Makes Decision
        └─→ Permission State Saved Locally
        │
        ↓
Sensors Activated
        │
        ├─→ GPS: Encrypted coordinates
        ├─→ BLE: Anonymous beacon UUIDs
        └─→ WiFi: Network names only (no passwords)
        │
        ↓
Data Processed Locally
        │
        ├─→ No cloud sync
        ├─→ No third-party sharing
        └─→ localStorage encryption
        │
        ↓
User Controls
        │
        ├─→ Can disable anytime
        ├─→ Can clear data
        └─→ Can review event history
```

---

This architecture provides:
✅ Sub-10 meter accuracy with sensor fusion  
✅ Battery-efficient operation  
✅ Privacy-preserving local-first design  
✅ Graceful degradation with limited permissions  
✅ Real-time geofence monitoring  
✅ Comprehensive event logging  
✅ Beautiful iOS-style UX
