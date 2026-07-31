/**
 * Bytspot Points
 *
 * Points are a single check-in-earned balance. They never determine Bytspot
 * Green, Platinum, or Black membership.
 */
import { trpc } from './trpc.ts';

/** Returns true when a JWT is present (user is logged in). */
function isAuthenticated(): boolean {
  return !!localStorage.getItem('bytspot_auth_token');
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

// Storage keys
const STORAGE_KEYS = {
  POINTS: 'bytspot_user_points',
  TRANSACTIONS: 'bytspot_point_transactions',
};

/**
 * Get user's current points — sync localStorage fallback
 */
export function getUserPointsLocal(): UserPoints {
  const stored = localStorage.getItem(STORAGE_KEYS.POINTS);
  if (stored) {
    const data = JSON.parse(stored);
    return { ...data, lastUpdated: new Date(data.lastUpdated) };
  }
  const initialPoints: UserPoints = { total: 0, lifetime: 0, pending: 0, lastUpdated: new Date() };
  localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(initialPoints));
  return initialPoints;
}

/** @deprecated Use getUserPointsAsync instead */
export const getUserPoints = getUserPointsLocal;

/**
 * Get user's current points — API-first, localStorage fallback
 */
export async function getUserPointsAsync(): Promise<UserPoints> {
  if (!isAuthenticated()) return getUserPointsLocal();
  try {
    const res = await trpc.user.points.get.query();
    const pts: UserPoints = { total: res.total, lifetime: res.lifetime, pending: 0, lastUpdated: new Date() };
    // Sync to localStorage for offline access
    localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(pts));
    return pts;
  } catch {
    return getUserPointsLocal();
  }
}

/**
 * Add points to user's account (localStorage only — offline fallback).
 * NOTE: When authenticated, points are awarded server-side by the venues.checkin procedure.
 * This function should only be called as a local fallback when not authenticated.
 */
export function addPoints(action: keyof typeof POINT_ACTIONS): boolean {
  // When authenticated, the backend awards points during check-in; skip local bookkeeping
  if (isAuthenticated()) return true;

  const actionConfig = POINT_ACTIONS[action];

  const points = getUserPointsLocal();
  const totalPoints = actionConfig.points;
  points.total += totalPoints;
  points.lifetime += totalPoints;
  points.lastUpdated = new Date();
  localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(points));

  addPointTransaction({
    type: 'earn',
    amount: totalPoints,
    description: actionConfig.description,
    category: action.toLowerCase(),
  });

  return true;
}

/**
 * Spend points
 */
export function spendPoints(amount: number, description: string): boolean {
  const points = getUserPoints();
  
  if (points.total < amount) {
    return false; // Insufficient points
  }
  
  points.total -= amount;
  points.lastUpdated = new Date();
  
  localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(points));
  
  // Record transaction
  addPointTransaction({
    type: 'spend',
    amount,
    description,
    category: 'redemption',
  });
  
  return true;
}

/**
 * Add point transaction to history
 */
function addPointTransaction(transaction: Omit<PointTransaction, 'id' | 'timestamp'>): void {
  const transactions = getPointTransactions();
  
  const newTransaction: PointTransaction = {
    ...transaction,
    id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
  };
  
  transactions.unshift(newTransaction);
  
  // Keep last 100 transactions
  const trimmed = transactions.slice(0, 100);
  
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(trimmed));
}

/**
 * Get point transaction history — localStorage fallback
 */
export function getPointTransactions(): PointTransaction[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
  if (!stored) return [];
  const data = JSON.parse(stored);
  return data.map((txn: any) => ({ ...txn, timestamp: new Date(txn.timestamp) }));
}

/**
 * Get point transaction history — API-first
 */
export async function getPointTransactionsAsync(): Promise<PointTransaction[]> {
  if (!isAuthenticated()) return getPointTransactions();
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
    return getPointTransactions();
  }
}
