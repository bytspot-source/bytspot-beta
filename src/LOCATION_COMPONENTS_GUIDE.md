# Bytspot Location Components Quick Reference

## 🎯 Overview

This guide provides a quick reference for all location service components in Bytspot.

## 📦 Components

### 1. LocationPermissionFlow
**Path:** `/components/LocationPermissionFlow.tsx`  
**Purpose:** iOS-style permission request dialogs  
**When to use:** During onboarding or when requesting new permissions

```tsx
import { LocationPermissionFlow } from './components/LocationPermissionFlow';

<LocationPermissionFlow
  isDarkMode={true}
  onComplete={(permissions) => {
    // permissions.location: 'always' | 'whenInUse' | 'denied'
    // permissions.bluetooth: boolean
    // permissions.wifi: boolean
  }}
  autoStart={true}
/>
```

**Features:**
- Three beautiful permission dialogs (Location, Bluetooth, WiFi)
- Uses real iOS-style images from Figma assets
- Educational content explaining each permission
- Privacy-focused messaging
- Automatic progression through all permissions

---

### 2. GeofenceMonitor
**Path:** `/components/GeofenceMonitor.tsx`  
**Purpose:** Display active geofences and recent events  
**When to use:** In settings or as a status indicator

```tsx
import { GeofenceMonitor } from './components/GeofenceMonitor';

// Full view with event history
<GeofenceMonitor isDarkMode={true} />

// Compact badge view
<GeofenceMonitor isDarkMode={true} compact={true} />
```

**Features:**
- Shows currently active zones
- Event history with timestamps
- Sensor method badges (GPS/BLE/WiFi)
- Animated entry/exit indicators
- Two display modes: full and compact

---

### 3. GeofenceOverlay
**Path:** `/components/GeofenceOverlay.tsx`  
**Purpose:** Visualize geofence zones on a map  
**When to use:** On the map view to show zone boundaries

```tsx
import { GeofenceOverlay } from './components/GeofenceOverlay';

<GeofenceOverlay 
  isDarkMode={true} 
  showLabels={true} 
/>
```

**Features:**
- Circular zone boundaries
- Pulsing animations for active zones
- Color-coded by zone type
- Sensor capability indicators
- Zone labels and metadata

---

### 4. SensorSettings (Updated)
**Path:** `/components/SensorSettings.tsx`  
**Purpose:** Comprehensive sensor and geofence configuration  
**When to use:** In app settings menu

```tsx
import { SensorSettings } from './components/SensorSettings';

<SensorSettings
  isDarkMode={true}
  onBack={() => {}}
/>
```

**Features:**
- Permission status display
- GPS, WiFi, Bluetooth toggles
- Geofence radius configuration
- Live geofence monitor
- Battery saver mode
- Sensor calibration

---

## 🔧 Utilities

### GeofencingService
**Path:** `/utils/geofencing.ts`  
**Purpose:** Core geofencing engine  
**When to use:** To create zones or monitor geofence events

```tsx
import { GeofencingService } from './utils/geofencing';

const service = GeofencingService.getInstance();

// Create a zone
service.createParkingZone(
  'Garage Name',
  37.7749,  // lat
  -122.4194, // lng
  100,       // radius (m)
  ['beacon-uuid'], // optional
  ['WiFi-SSID']    // optional
);

// Start monitoring
service.startMonitoring();

// Subscribe to events
const unsubscribe = service.subscribe((event) => {
  console.log(event.type); // 'enter' or 'exit'
  console.log(event.zoneName);
  console.log(event.accuracy);
});

// Stop monitoring
service.stopMonitoring();
unsubscribe();
```

**Key Methods:**
- `createParkingZone()` - Quick parking zone creation
- `createValetZone()` - Quick valet zone creation
- `addZone()` - Full custom zone
- `removeZone()` - Delete a zone
- `startMonitoring()` - Begin geofence checks
- `stopMonitoring()` - Stop geofence checks
- `subscribe()` - Listen for events
- `getActiveZones()` - Get currently active zones
- `getAllZones()` - Get all configured zones

---

### useGeofencing Hook
**Path:** `/utils/geofencing.ts`  
**Purpose:** React hook for geofencing in components  
**When to use:** When you need geofence state in a React component

```tsx
import { useGeofencing } from './utils/geofencing';

function MyComponent() {
  const { activeZones, recentEvents, service } = useGeofencing(true);
  
  return (
    <div>
      <p>Active Zones: {activeZones.length}</p>
      <p>Recent Events: {recentEvents.length}</p>
    </div>
  );
}
```

**Returns:**
- `activeZones` - Array of currently active GeofenceZone objects
- `recentEvents` - Array of recent GeofenceEvent objects
- `service` - GeofencingService instance for manual control

---

### useLocationPermissions Hook
**Path:** `/components/LocationPermissionFlow.tsx`  
**Purpose:** Check location permission status  
**When to use:** To conditionally show features based on permissions

```tsx
import { useLocationPermissions } from './components/LocationPermissionFlow';

function MyComponent() {
  const { permissions, hasAllPermissions, needsPermissions } = useLocationPermissions();
  
  if (needsPermissions()) {
    return <PermissionPrompt />;
  }
  
  return <FullFeatures />;
}
```

**Returns:**
- `permissions` - Object with location, bluetooth, wifi permission states
- `hasAllPermissions()` - Boolean function
- `needsPermissions()` - Boolean function

---

## 📊 Data Types

### GeofenceZone
```typescript
interface GeofenceZone {
  id: string;
  name: string;
  type: 'parking' | 'valet' | 'saved' | 'venue' | 'custom';
  priority: number; // 1-10
  
  location?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  
  bluetooth?: {
    beaconUUIDs: string[];
    triggerDistance: number;
  };
  
  wifi?: {
    networkSSIDs: string[];
    signalThreshold?: number;
  };
  
  metadata?: {
    address?: string;
    notes?: string;
    spotNumber?: string;
    price?: number;
  };
}
```

### GeofenceEvent
```typescript
interface GeofenceEvent {
  zoneId: string;
  zoneName: string;
  type: 'enter' | 'exit';
  timestamp: Date;
  method: 'gps' | 'bluetooth' | 'wifi' | 'fused';
  accuracy: number; // meters
  confidence: number; // 0-1
}
```

### LocationPermissions
```typescript
interface LocationPermissions {
  location: 'always' | 'whenInUse' | 'denied' | null;
  bluetooth: boolean | null;
  wifi: boolean | null;
}
```

---

## 🎨 Styling Guidelines

All location components follow Bytspot's design system:

### Colors by Zone Type
- **Parking:** Blue to Cyan (`from-blue-500 to-cyan-500`)
- **Valet:** Purple to Pink (`from-purple-500 to-pink-500`)
- **Saved:** Green to Emerald (`from-green-500 to-emerald-500`)
- **Venue:** Orange to Red (`from-orange-500 to-red-500`)

### Glassmorphism
```css
border: 2px solid rgba(255, 255, 255, 0.3);
background: rgba(28, 28, 30, 0.8);
backdrop-filter: blur(20px);
```

### Motion
All animations use iOS spring physics:
```typescript
const springConfig = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};
```

---

## 🔄 Integration Checklist

When adding location features to a new screen:

- [ ] Import required components
- [ ] Check permissions with `useLocationPermissions()`
- [ ] Show `LocationPermissionFlow` if needed
- [ ] Use `useGeofencing()` for real-time data
- [ ] Subscribe to geofence events if needed
- [ ] Display `GeofenceMonitor` for status
- [ ] Add `GeofenceOverlay` to maps
- [ ] Handle permission denial gracefully
- [ ] Test with different permission combinations
- [ ] Verify battery impact

---

## 🧪 Testing Components

### LocationPermissionFlow
1. Clear localStorage: `localStorage.clear()`
2. Reload app
3. Go through onboarding
4. Verify all 3 permission dialogs appear
5. Test each permission option
6. Check localStorage for saved state

### GeofenceMonitor
1. Navigate to Settings → Sensor Settings
2. Verify monitor shows default zones
3. Enable all sensors
4. Wait for zone entry (if in range)
5. Check that active zones display
6. Verify event history populates

### GeofencingService
1. Open browser console
2. Run:
```javascript
const service = window.GeofencingService.getInstance();
service.createParkingZone('Test Zone', 37.7749, -122.4194, 50);
service.startMonitoring();
service.subscribe(e => console.log('Geofence event:', e));
```
3. Verify zone created
4. Check monitoring started
5. Wait for events

---

## 📱 Mobile Considerations

### iOS Safari
- Requires HTTPS for geolocation
- Bluetooth API may be limited
- WiFi scanning not available
- Use GPS fallback

### Android Chrome
- Full geolocation support
- Bluetooth Web API supported
- WiFi scanning limited
- Better overall sensor access

### Desktop Browsers
- Geolocation via IP or WiFi
- Bluetooth available on Chrome
- Limited accuracy (50-500m)
- Use for development/testing

---

## 🚨 Common Issues

### "Permission denied"
**Solution:** User must manually grant permission. Show `LocationPermissionFlow` component.

### "Geofence not triggering"
**Solution:** Check dwell time (default 3s). Zone may be too small or accuracy too low.

### "No Bluetooth beacons found"
**Solution:** Ensure BLE permission granted and beacons are powered on with correct UUIDs.

### "WiFi networks not detected"
**Solution:** Browser limitation. WiFi API not widely supported. Use GPS fallback.

### "High battery drain"
**Solution:** Enable battery saver mode or increase polling interval.

---

## 📚 Further Reading

- `/LOCATION_SERVICE.md` - Full technical documentation
- `/LOCATION_IMPLEMENTATION_SUMMARY.md` - Implementation overview
- `/components/SensorManager.tsx` - Core sensor code
- `/utils/geofencing.ts` - Geofencing engine

---

**Quick Start:**
1. Add `<LocationPermissionFlow />` to onboarding
2. Use `useGeofencing()` in components
3. Create zones with `GeofencingService`
4. Display with `<GeofenceMonitor />`
5. Done! 🎉
