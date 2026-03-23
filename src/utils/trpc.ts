/**
 * tRPC Client — end-to-end type-safe API calls
 *
 * Usage:
 *   import { trpc } from '../utils/trpc';
 *   const me = await trpc.auth.me.query();    // fully typed!
 *   const health = await trpc.health.check.query();
 */
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '@bytspot-api/trpc/router';
import type { inferRouterOutputs } from '@trpc/server';

/** API base URL — single source of truth (also used for SSE stream) */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bytspot-api.onrender.com';

export const trpc = createTRPCClient<AppRouter>({
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

/** Re-export the AppRouter type so other files can reference it */
export type { AppRouter };

/** Inferred output types from the tRPC router */
type RouterOutputs = inferRouterOutputs<AppRouter>;

/** A single venue from venues.list */
export type ApiVenue = RouterOutputs['venues']['list']['venues'][number];

/** Response shape from rides.get */
export type ApiRidesResponse = RouterOutputs['rides']['get'];

