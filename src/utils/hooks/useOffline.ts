/**
 * useOffline Hook
 * React hook for monitoring online/offline status
 */

import { useState, useEffect } from 'react';
import { setupOfflineDetection, isOnline as checkOnline } from '../offline';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(checkOnline());

  useEffect(() => {
    const cleanup = setupOfflineDetection(
      () => setIsOnline(true),
      () => setIsOnline(false)
    );

    return cleanup;
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
  };
}
