/**
 * Bytspot Points
 *
 * Points are a single check-in-earned balance. They never determine Bytspot
 * Green, Platinum, or Black membership.
 */
import { trpc } from './trpc.ts';

/** Returns true when a JWT is present (user is logged in). */
function isAuthenticated(): boolean {
  const token = localStorage.getItem('bytspot_auth_token');
  return Boolean(token && token !== 'guest_session');
}

export interface UserPoints {
  total: number;
  lifetime: number; // Total earned over all time
  pending: number; // Points being processed
  lastUpdated: Date;
}

export interface PointTransaction {
  id: string;
  type: 'earn' | 'spend' | 'bonus';
  amount: number;
  description: string;
  timestamp: Date;
  category: string;
}

export const POINT_ACTIONS = {
  VENUE_CHECKIN: { points: 10, description: 'Verified check-in' },
} as const;

/**
 * Get the backend-authoritative Points balance. Guests and failures expose no
 * balance rather than trusting client-controlled storage.
 */
export async function getUserPointsAsync(): Promise<UserPoints | null> {
  if (!isAuthenticated()) return null;
  try {
    const res = await trpc.user.points.get.query();
    return { total: res.total, lifetime: res.lifetime, pending: 0, lastUpdated: new Date() };
  } catch {
    return null;
  }
}

/**
 * Get backend-verified Points history. Client storage is never rendered as an
 * account ledger.
 */
export async function getPointTransactionsAsync(): Promise<PointTransaction[] | null> {
  if (!isAuthenticated()) return null;
  try {
    const res = await trpc.user.points.history.query({ limit: 50 });
    return res.items.map((t: any) => ({
      id: t.id,
      type: t.type as PointTransaction['type'],
      amount: t.amount,
      description: t.description ?? '',
      timestamp: new Date(t.createdAt),
      category: t.category ?? '',
    }));
  } catch {
    return null;
  }
}
