import type { AuthTransport, VendorMembership } from './auth.ts';

const viteEnv = (import.meta as { env?: Record<string, string> }).env;

export const VENDOR_API_BASE_URL = viteEnv?.VITE_API_URL || 'https://bytspot-api.onrender.com';

/**
 * Dates arrive as strings, and a Seat's invite expiry is compared against a
 * clock, so they are revived here rather than at every comparison.
 */
function reviveMemberships(raw: unknown): VendorMembership[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const membership = entry as VendorMembership;
    const invitedAt = (membership.seat as { invitedAt?: unknown }).invitedAt;
    return {
      seller: membership.seller,
      seat: {
        ...membership.seat,
        locationIds: membership.seat.locationIds ?? [],
        bookableIds: membership.seat.bookableIds ?? [],
        invitedAt: typeof invitedAt === 'string' ? new Date(invitedAt) : undefined,
      },
    };
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    // A non-JSON body is not an error worth surfacing: the status already said
    // what happened, and the caller only maps statuses to refusals.
    return {};
  }
}

/**
 * The live transport. Every call sends credentials, because the refresh token is
 * an httpOnly cookie on this origin and is the only thing that keeps a console
 * signed in; nothing here ever reads or writes that cookie directly.
 */
export function httpAuthTransport(baseUrl: string = VENDOR_API_BASE_URL): AuthTransport {
  const post = (path: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return {
    requestCode: async (email) => {
      const response = await post('/vendor/auth/code', { email });
      const json = await readJson(response);
      return {
        status: response.status,
        challengeId: typeof json.challengeId === 'string' ? json.challengeId : undefined,
        // Honour the server's own cooldown when it sends one.
        retryAfterSecs: Number(response.headers.get('Retry-After')) || undefined,
      };
    },

    submitCode: async ({ challengeId, code }) => {
      // The code goes in the body, never the URL: a query string lands in
      // server logs and in the browser's history.
      const response = await post('/vendor/auth/session', { challengeId, code });
      const json = await readJson(response);
      return {
        status: response.status,
        accessToken: typeof json.accessToken === 'string' ? json.accessToken : undefined,
        expiresInSecs: typeof json.expiresInSecs === 'number' ? json.expiresInSecs : undefined,
        person: json.person as { id: string; email: string } | undefined,
        memberships: reviveMemberships(json.memberships),
      };
    },

    refresh: async () => {
      const response = await post('/vendor/auth/refresh');
      const json = await readJson(response);
      return {
        status: response.status,
        accessToken: typeof json.accessToken === 'string' ? json.accessToken : undefined,
        expiresInSecs: typeof json.expiresInSecs === 'number' ? json.expiresInSecs : undefined,
      };
    },

    signOut: async () => {
      // Only the server can clear an httpOnly cookie, so sign-out is a request
      // rather than a local delete. A failure is ignored: the in-memory token is
      // already gone by the time this runs.
      try {
        await post('/vendor/auth/sign-out');
      } catch {
        return;
      }
    },
  };
}
