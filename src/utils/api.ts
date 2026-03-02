/**
 * API Integration Layer
 * Central hub for all API calls with error handling, retry logic, and offline detection
 * 
 * REAL-WORLD READINESS: Clear integration points for backend services
 */

import { toast } from 'sonner@2.0.3';

// API Configuration — points to live Render backend
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bytspot-api.onrender.com';
const API_TIMEOUT = 15000; // 15 seconds (Render cold-starts can be slow)

export interface ApiError {
  message: string;
  code: string;
  status: number;
  retryable: boolean;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: ApiError;
}

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * Check if error is retryable
 */
function isRetryableError(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Wait for specified duration
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = API_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Generic API request with retry logic
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<ApiResponse<T>> {
  // Check offline status
  if (!navigator.onLine) {
    return {
      data: null as any,
      success: false,
      error: {
        message: 'No internet connection. Please check your network.',
        code: 'OFFLINE',
        status: 0,
        retryable: true,
      },
    };
  }

  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    // Get auth token from storage
    const authToken = localStorage.getItem('bytspot_auth_token');
    
    // Set default headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
      ...options.headers,
    };

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const apiError: ApiError = {
        message: errorData.message || `Request failed with status ${response.status}`,
        code: errorData.code || 'API_ERROR',
        status: response.status,
        retryable: isRetryableError(response.status),
      };

      // Retry if retryable and not exceeded max attempts
      if (apiError.retryable && retryCount < RETRY_CONFIG.maxAttempts) {
        const delay = RETRY_CONFIG.delayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
        await wait(delay);
        return apiRequest<T>(endpoint, options, retryCount + 1);
      }

      return {
        data: null as any,
        success: false,
        error: apiError,
      };
    }

    const data = await response.json();
    
    return {
      data,
      success: true,
    };
  } catch (error: any) {
    // Handle network errors
    if (error.name === 'AbortError') {
      return {
        data: null as any,
        success: false,
        error: {
          message: 'Request timeout. Please try again.',
          code: 'TIMEOUT',
          status: 408,
          retryable: true,
        },
      };
    }

    // Retry network errors
    if (retryCount < RETRY_CONFIG.maxAttempts) {
      const delay = RETRY_CONFIG.delayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
      await wait(delay);
      return apiRequest<T>(endpoint, options, retryCount + 1);
    }

    return {
      data: null as any,
      success: false,
      error: {
        message: error.message || 'An unexpected error occurred',
        code: 'NETWORK_ERROR',
        status: 0,
        retryable: true,
      },
    };
  }
}

/**
 * API Endpoints — wired to live bytspot-api.onrender.com
 */

// ── Venue types matching API response ──
export interface ApiVenue {
  id: string;
  name: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  imageUrl: string | null;
  crowd: {
    level: number;
    label: string;
    waitMins: number;
    recordedAt: string;
  } | null;
  parking: {
    totalAvailable: number;
    spots: Array<{
      name: string;
      type: string;
      available: number;
      total: number;
      pricePerHr: number;
    }>;
  };
}

export interface ApiVenueDetail {
  id: string;
  name: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  imageUrl: string | null;
  crowd: {
    current: { level: number; label: string; waitMins: number; recordedAt: string } | null;
    history: Array<{ level: number; label: string; waitMins: number; recordedAt: string }>;
  };
  parking: Array<{
    name: string;
    type: string;
    available: number;
    total: number;
    pricePerHr: number;
  }>;
}

export interface ApiNearbyVenue {
  id: string;
  name: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  imageUrl: string | null;
  distanceMeters: number;
}

export interface ApiRidesResponse {
  location: { lat: number; lng: number };
  timestamp: string;
  providers: Array<{
    name: string;
    products: Array<{
      type: string;
      etaMinutes: number;
      priceEstimate: string;
      surgeMultiplier: number;
    }>;
  }>;
}

// VENUES
export const venuesApi = {
  /** GET /venues — all venues with crowd + parking */
  getAll: () =>
    apiRequest<{ venues: ApiVenue[] }>('/venues'),

  /** GET /venues/nearby — geospatial query */
  getNearby: (lat: number, lng: number, radius = 2000) =>
    apiRequest<{ venues: ApiNearbyVenue[] }>(`/venues/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),

  /** GET /venues/:slug — single venue detail */
  getBySlug: (slug: string) =>
    apiRequest<ApiVenueDetail>(`/venues/${slug}`),

  /** GET /venues/:slug/similar — AI similarity */
  getSimilar: (slug: string, limit = 5) =>
    apiRequest<{ similar: Array<{ id: string; name: string; slug: string; category: string; similarity: number }> }>(
      `/venues/${slug}/similar?limit=${limit}`
    ),

  /** POST /venues/:id/checkin — idempotent user check-in */
  checkin: (venueId: string, idempotencyKey?: string) =>
    apiRequest<{ success: boolean; newCrowdLevel: number }>(`/venues/${venueId}/checkin`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
};

// RIDES
export const ridesApi = {
  /** GET /rides?lat=&lng= — Uber/Lyft comparison */
  get: (lat: number, lng: number) =>
    apiRequest<ApiRidesResponse>(`/rides?lat=${lat}&lng=${lng}`),
};

// AUTH
export const authApi = {
  signup: (email: string, password: string, name: string) =>
    apiRequest<{ token: string; user: any }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};

// HEALTH
export const healthApi = {
  check: () => apiRequest<{ status: string; uptime: number }>('/health'),
};

// PAYMENTS (Stripe)
export const paymentsApi = {
  /** POST /payments/checkout — creates a Stripe Checkout session for parking */
  createCheckout: (params: {
    spotId: string;
    spotName: string;
    address: string;
    duration: number;
    totalCost: number;
  }) =>
    apiRequest<{ url: string | null; demoMode?: boolean; message?: string }>('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};

/**
 * Error handling helper
 */
export function handleApiError(error: ApiError, showToast = true): void {
  if (showToast) {
    if (error.code === 'OFFLINE') {
      toast.error('No Connection', {
        description: 'You are offline. Some features may be limited.',
        duration: 4000,
      });
    } else if (error.retryable) {
      toast.error('Request Failed', {
        description: 'We\'re having trouble connecting. Please try again.',
        duration: 4000,
      });
    } else {
      toast.error('Error', {
        description: error.message,
        duration: 4000,
      });
    }
  }
}
