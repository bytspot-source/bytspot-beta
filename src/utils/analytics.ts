/**
 * Analytics Tracking System
 * Event tracking hooks for user behavior analysis
 * 
 * REAL-WORLD READINESS: Ready for integration with analytics services
 * (Google Analytics, Mixpanel, Amplitude, etc.)
 */

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp: number;
  userId?: string;
  sessionId: string;
}

export interface AnalyticsConfig {
  enabled: boolean;
  debug: boolean;
  batchSize: number;
  flushInterval: number;
}

// Default configuration
const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: true,
  debug: false, // Set to true in development to see console logs
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
};

// Event queue for batching
let eventQueue: AnalyticsEvent[] = [];
let sessionId: string = generateSessionId();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get user ID from storage
 */
function getUserId(): string | undefined {
  const authToken = localStorage.getItem('bytspot_auth_token');
  if (authToken) {
    // In production, decode JWT to get user ID
    return 'user_' + authToken.substring(0, 8);
  }
  return undefined;
}

/**
 * Initialize analytics system
 */
export function initAnalytics(config: Partial<AnalyticsConfig> = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (finalConfig.debug) {
    console.log('[Analytics] Initialized with session:', sessionId);
  }
  
  // Set up flush interval
  if (flushTimer) {
    clearInterval(flushTimer);
  }
  
  if (finalConfig.enabled) {
    flushTimer = setInterval(() => {
      flushEvents(finalConfig.debug);
    }, finalConfig.flushInterval);
  }
  
  // Flush events before page unload
  window.addEventListener('beforeunload', () => {
    flushEvents(finalConfig.debug, true);
  });
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  const event: AnalyticsEvent = {
    name: eventName,
    properties,
    timestamp: Date.now(),
    userId: getUserId(),
    sessionId,
  };
  
  eventQueue.push(event);
  
  if (DEFAULT_CONFIG.debug) {
    console.log('[Analytics] Event tracked:', event);
  }
  
  // Flush if queue is full
  if (eventQueue.length >= DEFAULT_CONFIG.batchSize) {
    flushEvents(DEFAULT_CONFIG.debug);
  }
  
  // Store in local storage for offline tracking
  storeEventLocally(event);
}

/**
 * Track screen view
 */
export function trackScreenView(screenName: string, properties?: Record<string, any>): void {
  trackEvent('screen_view', {
    screen_name: screenName,
    ...properties,
  });
}

/**
 * Track user action
 */
export function trackUserAction(
  action: string,
  category: string,
  label?: string,
  value?: number
): void {
  trackEvent('user_action', {
    action,
    category,
    label,
    value,
  });
}

/**
 * Track search query
 */
export function trackSearch(query: string, category?: string, results?: number): void {
  trackEvent('search', {
    query,
    category,
    results,
  });
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(
  featureName: string,
  action: 'activated' | 'deactivated' | 'used',
  metadata?: Record<string, any>
): void {
  trackEvent('feature_usage', {
    feature: featureName,
    action,
    ...metadata,
  });
}

/**
 * Track error
 */
export function trackError(
  errorName: string,
  errorMessage: string,
  errorStack?: string,
  metadata?: Record<string, any>
): void {
  trackEvent('error', {
    error_name: errorName,
    error_message: errorMessage,
    error_stack: errorStack,
    ...metadata,
  });
}

/**
 * Track timing (performance metrics)
 */
export function trackTiming(
  category: string,
  variable: string,
  time: number,
  label?: string
): void {
  trackEvent('timing', {
    category,
    variable,
    time,
    label,
  });
}

/**
 * Flush events to analytics service
 */
function flushEvents(debug: boolean = false, sync: boolean = false): void {
  if (eventQueue.length === 0) return;
  
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  
  if (debug) {
    console.log('[Analytics] Flushing events:', eventsToSend);
  }
  
  // In production, send to analytics service
  // Example integrations:
  
  // Google Analytics 4
  if (typeof window !== 'undefined' && (window as any).gtag) {
    eventsToSend.forEach(event => {
      (window as any).gtag('event', event.name, {
        ...event.properties,
        user_id: event.userId,
        session_id: event.sessionId,
      });
    });
  }
  
  // Mixpanel
  if (typeof window !== 'undefined' && (window as any).mixpanel) {
    eventsToSend.forEach(event => {
      (window as any).mixpanel.track(event.name, {
        ...event.properties,
        session_id: event.sessionId,
      });
    });
  }
  
  // Custom API endpoint
  const apiEndpoint = '/api/analytics/events';
  
  if (sync) {
    // Use sendBeacon for page unload
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(eventsToSend)], { type: 'application/json' });
      navigator.sendBeacon(apiEndpoint, blob);
    }
  } else {
    // Use fetch for regular flushes
    fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventsToSend),
    }).catch(error => {
      if (debug) {
        console.error('[Analytics] Failed to send events:', error);
      }
    });
  }
}

/**
 * Store event locally for offline tracking
 */
function storeEventLocally(event: AnalyticsEvent): void {
  try {
    const key = 'bytspot_analytics_offline';
    const stored = localStorage.getItem(key);
    const events: AnalyticsEvent[] = stored ? JSON.parse(stored) : [];
    
    events.push(event);
    
    // Keep only last 100 events
    const recentEvents = events.slice(-100);
    localStorage.setItem(key, JSON.stringify(recentEvents));
  } catch (error) {
    // Silently fail if localStorage is full
  }
}

/**
 * Get offline events
 */
export function getOfflineEvents(): AnalyticsEvent[] {
  try {
    const key = 'bytspot_analytics_offline';
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Clear offline events
 */
export function clearOfflineEvents(): void {
  localStorage.removeItem('bytspot_analytics_offline');
}

/**
 * Set user properties
 */
export function setUserProperties(properties: Record<string, any>): void {
  if (DEFAULT_CONFIG.debug) {
    console.log('[Analytics] User properties set:', properties);
  }
  
  // Google Analytics
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('set', 'user_properties', properties);
  }
  
  // Mixpanel
  if (typeof window !== 'undefined' && (window as any).mixpanel) {
    (window as any).mixpanel.people.set(properties);
  }
}

/**
 * Identify user
 */
export function identifyUser(userId: string, traits?: Record<string, any>): void {
  if (DEFAULT_CONFIG.debug) {
    console.log('[Analytics] User identified:', userId, traits);
  }
  
  // Google Analytics
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('config', 'GA_MEASUREMENT_ID', {
      user_id: userId,
    });
  }
  
  // Mixpanel
  if (typeof window !== 'undefined' && (window as any).mixpanel) {
    (window as any).mixpanel.identify(userId);
    if (traits) {
      (window as any).mixpanel.people.set(traits);
    }
  }
  
  // Segment
  if (typeof window !== 'undefined' && (window as any).analytics) {
    (window as any).analytics.identify(userId, traits);
  }
}

/**
 * Reset analytics (e.g., on logout)
 */
export function resetAnalytics(): void {
  sessionId = generateSessionId();
  eventQueue = [];
  
  if (DEFAULT_CONFIG.debug) {
    console.log('[Analytics] Reset with new session:', sessionId);
  }
  
  // Google Analytics
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('config', 'GA_MEASUREMENT_ID', {
      user_id: undefined,
    });
  }
  
  // Mixpanel
  if (typeof window !== 'undefined' && (window as any).mixpanel) {
    (window as any).mixpanel.reset();
  }
}
