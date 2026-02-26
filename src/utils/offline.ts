/**
 * Offline Detection and Management
 * Monitors network connectivity and manages offline state
 * 
 * REAL-WORLD READINESS: Graceful degradation for offline scenarios
 */

import { toast } from 'sonner@2.0.3';

export type ConnectionType = 'wifi' | '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

export interface ConnectionInfo {
  isOnline: boolean;
  type: ConnectionType;
  effectiveType?: ConnectionType;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// Connection change listeners
let onlineListeners: (() => void)[] = [];
let offlineListeners: (() => void)[] = [];

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Get connection information
 */
export function getConnectionInfo(): ConnectionInfo {
  const connection = (navigator as any).connection || 
                    (navigator as any).mozConnection || 
                    (navigator as any).webkitConnection;
  
  if (!connection) {
    return {
      isOnline: navigator.onLine,
      type: 'unknown',
    };
  }
  
  return {
    isOnline: navigator.onLine,
    type: connection.type || 'unknown',
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
  };
}

/**
 * Check if connection is slow
 */
export function isSlowConnection(): boolean {
  const info = getConnectionInfo();
  
  if (!info.effectiveType) {
    return false;
  }
  
  return info.effectiveType === 'slow-2g' || 
         info.effectiveType === '2g' || 
         (info.rtt && info.rtt > 1000);
}

/**
 * Setup offline detection
 */
export function setupOfflineDetection(
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  const handleOnline = () => {
    if (onOnline) {
      onOnline();
    }
    
    onlineListeners.forEach(listener => listener());
    
    // Show reconnection toast
    toast.success('Back Online', {
      description: 'Your connection has been restored',
      duration: 3000,
    });
  };
  
  const handleOffline = () => {
    if (onOffline) {
      onOffline();
    }
    
    offlineListeners.forEach(listener => listener());
    
    // Show offline toast
    toast.error('No Connection', {
      description: 'You are offline. Some features may be limited.',
      duration: 5000,
    });
  };
  
  // Add event listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Monitor connection changes (if supported)
  const connection = (navigator as any).connection || 
                    (navigator as any).mozConnection || 
                    (navigator as any).webkitConnection;
  
  if (connection) {
    const handleConnectionChange = () => {
      const info = getConnectionInfo();
      
      if (isSlowConnection()) {
        toast.warning('Slow Connection', {
          description: 'You may experience slower performance',
          duration: 3000,
        });
      }
    };
    
    connection.addEventListener('change', handleConnectionChange);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection.removeEventListener('change', handleConnectionChange);
    };
  }
  
  // Return cleanup function without connection listener
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Add online listener
 */
export function addOnlineListener(listener: () => void): void {
  onlineListeners.push(listener);
}

/**
 * Add offline listener
 */
export function addOfflineListener(listener: () => void): void {
  offlineListeners.push(listener);
}

/**
 * Remove online listener
 */
export function removeOnlineListener(listener: () => void): void {
  onlineListeners = onlineListeners.filter(l => l !== listener);
}

/**
 * Remove offline listener
 */
export function removeOfflineListener(listener: () => void): void {
  offlineListeners = offlineListeners.filter(l => l !== listener);
}

/**
 * Wait for online status
 */
export function waitForOnline(timeout?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (navigator.onLine) {
      resolve();
      return;
    }
    
    const handleOnline = () => {
      cleanup();
      resolve();
    };
    
    const cleanup = () => {
      window.removeEventListener('online', handleOnline);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for online status'));
      }, timeout);
    }
  });
}

/**
 * Cache data for offline use
 */
export function cacheData(key: string, data: any): void {
  try {
    localStorage.setItem(`bytspot_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Failed to cache data:', error);
  }
}

/**
 * Get cached data
 */
export function getCachedData<T>(key: string, maxAge?: number): T | null {
  try {
    const cached = localStorage.getItem(`bytspot_cache_${key}`);
    if (!cached) {
      return null;
    }
    
    const { data, timestamp } = JSON.parse(cached);
    
    if (maxAge && Date.now() - timestamp > maxAge) {
      // Cache expired
      localStorage.removeItem(`bytspot_cache_${key}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to get cached data:', error);
    return null;
  }
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('bytspot_cache_')) {
      localStorage.removeItem(key);
    }
  });
}

/**
 * Prefetch important data for offline use
 */
export async function prefetchOfflineData(): Promise<void> {
  if (!navigator.onLine) {
    return;
  }
  
  try {
    // Prefetch user preferences
    const preferences = localStorage.getItem('bytspot_preferences');
    if (preferences) {
      cacheData('preferences', JSON.parse(preferences));
    }
    
    // Prefetch saved spots
    const savedSpots = localStorage.getItem('bytspot_saved_spots');
    if (savedSpots) {
      cacheData('saved_spots', JSON.parse(savedSpots));
    }
    
    // Prefetch user behavior
    const behavior = localStorage.getItem('bytspot_user_behavior');
    if (behavior) {
      cacheData('user_behavior', JSON.parse(behavior));
    }
  } catch (error) {
    console.error('Failed to prefetch offline data:', error);
  }
}

/**
 * Check if feature requires internet
 */
export function requiresOnline(featureName: string): boolean {
  const onlineFeatures = [
    'valet-service',
    'parking-reservation',
    'payment',
    'live-venue-data',
    'traffic-intelligence',
    'trending-hotspots',
  ];
  
  return onlineFeatures.includes(featureName);
}

/**
 * Show offline warning for feature
 */
export function showOfflineWarning(featureName: string): void {
  toast.warning('Feature Unavailable', {
    description: `${featureName} requires an internet connection`,
    duration: 4000,
  });
}
