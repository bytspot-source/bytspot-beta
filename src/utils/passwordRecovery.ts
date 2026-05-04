const viteEnv = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env;

export const PASSWORD_RECOVERY_API_BASE_URL = viteEnv?.VITE_API_URL || 'https://bytspot-api.onrender.com';

export type PasswordRecoveryLocation = Pick<Location, 'search' | 'hash'>;

async function postJson<TBody>(path: string, body: TBody): Promise<unknown> {
  const response = await fetch(`${PASSWORD_RECOVERY_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // no-op: backend currently returns JSON, but keep this robust.
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : 'Request failed. Please try again.';
    throw new Error(message);
  }

  return payload;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await postJson('/auth/forgot', { email: email.trim() });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await postJson('/auth/reset', { token: token.trim(), password });
}

export function getPasswordResetTokenFromLocation(location: PasswordRecoveryLocation): string {
  const searchToken = new URLSearchParams(location.search).get('token');
  if (searchToken) return searchToken;

  const hash = location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    const hashToken = new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
    if (hashToken) return hashToken;
  }

  if (hash.startsWith('#token=')) {
    return new URLSearchParams(hash.slice(1)).get('token') || '';
  }

  return '';
}

export function getPasswordRecoveryRoute(location: Pick<Location, 'pathname' | 'hash'>): 'forgot' | 'reset' | null {
  const path = location.pathname.replace(/\/+/g, '/');
  const hashPath = location.hash.startsWith('#/')
    ? location.hash.slice(1).split('?')[0]
    : '';

  if (path === '/forgot-password' || hashPath === '/forgot-password') return 'forgot';
  if (path === '/reset-password' || hashPath === '/reset-password') return 'reset';
  return null;
}
