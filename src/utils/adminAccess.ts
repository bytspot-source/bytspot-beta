export const ADMIN_APPROVAL_GROUPS = ['BYTSPOT_ADMIN', 'INTERNAL_OPS'] as const;

export type AdminApprovalAccess = {
  allowed: boolean;
  email?: string;
  groups: string[];
  reason?: string;
};

type JwtPayload = {
  email?: string;
  groups?: unknown;
  exp?: number;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

export function getAdminApprovalAccessFromToken(token: string | null, nowMs = Date.now()): AdminApprovalAccess {
  if (!token || token === 'beta_guest') {
    return { allowed: false, groups: [], reason: 'Sign in with an internal operations account to review provider approvals.' };
  }
  const payload = decodeJwtPayload(token);
  if (!payload) return { allowed: false, groups: [], reason: 'The saved session token could not be read. Sign in again.' };
  if (payload.exp && payload.exp * 1000 <= nowMs) {
    return { allowed: false, email: payload.email, groups: [], reason: 'Your admin session has expired. Sign in again.' };
  }
  const groups = Array.isArray(payload.groups) ? payload.groups.map(String) : [];
  const normalized = new Set(groups.map((group) => group.trim().toUpperCase()));
  const allowed = ADMIN_APPROVAL_GROUPS.some((group) => normalized.has(group));
  return {
    allowed,
    email: payload.email,
    groups,
    reason: allowed ? undefined : 'This account is missing BYTSPOT_ADMIN or INTERNAL_OPS group claims.',
  };
}