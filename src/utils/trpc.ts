/**
 * tRPC Client — end-to-end type-safe API calls
 *
 * Usage:
 *   import { trpc } from '../utils/trpc';
 *   const me = await trpc.auth.me.query();
 *   const health = await trpc.health.check.query();
 */
import { createTRPCClient, httpLink } from '@trpc/client';

// NOTE:
// The production frontend lives in a separate repo from bytspot-api during CI.
// Keep this client permissive so GitHub Actions can build the iOS app without
// needing the sibling backend router types checked out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppRouter = any;

/** API base URL — single source of truth (also used for SSE stream) */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bytspot-api.onrender.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc: any = createTRPCClient<any>({
  links: [
    httpLink({
      url: `${API_BASE_URL}/trpc`,
      async headers() {
        const token = localStorage.getItem('bytspot_auth_token');
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

/** Frontend-safe fallback types when backend router types are unavailable in CI */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiVenue = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRidesResponse = any;

