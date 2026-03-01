/**
 * Bytspot Gamification & Loyalty System
 * Manages points, achievements, and membership tiers
 */

export interface UserPoints {
  total: number;
  lifetime: number; // Total earned over all time
  pending: number; // Points being processed
  lastUpdated: Date;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'discovery' | 'engagement' | 'social' | 'valet' | 'host' | 'premium';
  requirement: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: Date;
  reward: number; // Bonus points for unlocking
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface PointTransaction {
  id: string;
  type: 'earn' | 'spend' | 'bonus';
  amount: number;
  description: string;
  timestamp: Date;
  category: string;
}

export type MembershipTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierInfo {
  name: string;
  level: MembershipTier;
  minPoints: number;
  maxPoints: number | null;
  color: string;
  gradient: string;
  icon: string;
  benefits: string[];
  discount: number; // Percentage discount on services
}

// Tier definitions
export const TIERS: Record<MembershipTier, TierInfo> = {
  bronze: {
    name: 'Bronze',
    level: 'bronze',
    minPoints: 0,
    maxPoints: 499,
    color: '#CD7F32',
    gradient: 'from-amber-600 to-orange-700',
    icon: '🥉',
    benefits: [
      'Basic feature access',
      'Standard recommendations',
      'Community support',
    ],
    discount: 0,
  },
  silver: {
    name: 'Silver',
    level: 'silver',
    minPoints: 500,
    maxPoints: 1499,
    color: '#C0C0C0',
    gradient: 'from-gray-400 to-gray-500',
    icon: '🥈',
    benefits: [
      'Enhanced AI recommendations (+15% accuracy)',
      '5% discount on valet services',
      'Priority customer support',
      'Early access to new features',
    ],
    discount: 5,
  },
  gold: {
    name: 'Gold',
    level: 'gold',
    minPoints: 1500,
    maxPoints: 4999,
    color: '#FFD700',
    gradient: 'from-yellow-400 to-amber-500',
    icon: '🥇',
    benefits: [
      'Premium feature unlocks',
      'Priority booking access',
      '10% discount on all services',
      'Premium parking spots',
      'Dedicated support line',
      'Monthly bonus points',
    ],
    discount: 10,
  },
  platinum: {
    name: 'Platinum',
    level: 'platinum',
    minPoints: 5000,
    maxPoints: null,
    color: '#E5E4E2',
    gradient: 'from-slate-300 to-zinc-400',
    icon: '💎',
    benefits: [
      'VIP experiences & exclusive venues',
      '15% discount on all services',
      'Dedicated concierge service',
      'Free service upgrades',
      'Exclusive events & previews',
      'Personal account manager',
      'Custom recommendations AI',
    ],
    discount: 15,
  },
};

// Point earning actions
export const POINT_ACTIONS = {
  WELCOME_BONUS: { points: 100, description: 'Welcome to Bytspot!', oneTime: true },
  VENUE_CHECKIN: { points: 10, description: 'Venue check-in', limit: null },
  PHOTO_REVIEW: { points: 25, description: 'Photo review submission', limit: null },
  VALET_COMPLETION: { points: 50, description: 'Valet service completed', limit: null },
  FRIEND_REFERRAL: { points: 100, description: 'Successful friend referral', limit: null },
  HOST_ONBOARDING: { points: 500, description: 'Host onboarding completed', oneTime: true },
  SOCIAL_SHARE: { points: 5, description: 'Social sharing', limit: 3 }, // Max 3 per day
  PARKING_BOOKING: { points: 15, description: 'Parking spot booking', limit: null },
  FIRST_BOOKING: { points: 50, description: 'First booking bonus', oneTime: true },
  REVIEW_SUBMITTED: { points: 20, description: 'Review submitted', limit: null },
  PROFILE_COMPLETE: { points: 30, description: 'Complete your profile', oneTime: true },
  PREFERENCES_SET: { points: 20, description: 'Set your preferences', oneTime: true },
};

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-discovery',
    name: 'First Discovery',
    description: 'Complete initial venue search and preference setup',
    icon: '🎯',
    category: 'discovery',
    requirement: 1,
    progress: 0,
    unlocked: false,
    reward: 50,
    rarity: 'common',
  },
  {
    id: 'valet-vip',
    name: 'Valet VIP',
    description: 'Complete 5 valet service bookings with 4+ star ratings',
    icon: '🚗',
    category: 'valet',
    requirement: 5,
    progress: 0,
    unlocked: false,
    reward: 100,
    rarity: 'rare',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Visit 10 unique venues across different categories',
    icon: '📍',
    category: 'discovery',
    requirement: 10,
    progress: 0,
    unlocked: false,
    reward: 75,
    rarity: 'rare',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Submit 25 reviews with ratings and photos',
    icon: '⭐',
    category: 'engagement',
    requirement: 25,
    progress: 0,
    unlocked: false,
    reward: 150,
    rarity: 'epic',
  },
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Successfully invite 5 friends who complete onboarding',
    icon: '👥',
    category: 'social',
    requirement: 5,
    progress: 0,
    unlocked: false,
    reward: 200,
    rarity: 'epic',
  },
  {
    id: 'parking-pro',
    name: 'Parking Pro',
    description: 'Book 20 parking spots with perfect attendance record',
    icon: '🅿️',
    category: 'engagement',
    requirement: 20,
    progress: 0,
    unlocked: false,
    reward: 100,
    rarity: 'rare',
  },
  {
    id: 'premium-member',
    name: 'Premium Member',
    description: 'Maintain Gold tier status for 6 consecutive months',
    icon: '💎',
    category: 'premium',
    requirement: 6,
    progress: 0,
    unlocked: false,
    reward: 500,
    rarity: 'legendary',
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Book parking before 7 AM, 10 times',
    icon: '🌅',
    category: 'engagement',
    requirement: 10,
    progress: 0,
    unlocked: false,
    reward: 75,
    rarity: 'rare',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Book parking after 10 PM, 10 times',
    icon: '🦉',
    category: 'engagement',
    requirement: 10,
    progress: 0,
    unlocked: false,
    reward: 75,
    rarity: 'rare',
  },
  {
    id: 'sustainability-champion',
    name: 'Sustainability Champion',
    description: 'Use EV charging spots 15 times',
    icon: '⚡',
    category: 'discovery',
    requirement: 15,
    progress: 0,
    unlocked: false,
    reward: 125,
    rarity: 'epic',
  },
];

// Storage keys
const STORAGE_KEYS = {
  POINTS: 'bytspot_user_points',
  ACHIEVEMENTS: 'bytspot_achievements',
  TRANSACTIONS: 'bytspot_point_transactions',
  TIER: 'bytspot_membership_tier',
  ONE_TIME_ACTIONS: 'bytspot_one_time_actions',
  DAILY_LIMITS: 'bytspot_daily_limits',
};

/**
 * Get user's current tier based on points
 */
export function getUserTier(points: number): TierInfo {
  if (points >= TIERS.platinum.minPoints) return TIERS.platinum;
  if (points >= TIERS.gold.minPoints) return TIERS.gold;
  if (points >= TIERS.silver.minPoints) return TIERS.silver;
  return TIERS.bronze;
}

/**
 * Get next tier and progress
 */
export function getNextTierInfo(currentPoints: number): {
  currentTier: TierInfo;
  nextTier: TierInfo | null;
  progress: number;
  pointsToNext: number;
} {
  const currentTier = getUserTier(currentPoints);
  
  let nextTier: TierInfo | null = null;
  if (currentTier.level === 'bronze') nextTier = TIERS.silver;
  else if (currentTier.level === 'silver') nextTier = TIERS.gold;
  else if (currentTier.level === 'gold') nextTier = TIERS.platinum;
  
  const pointsToNext = nextTier ? nextTier.minPoints - currentPoints : 0;
  const progress = nextTier 
    ? ((currentPoints - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100
    : 100;
  
  return {
    currentTier,
    nextTier,
    progress: Math.min(Math.max(progress, 0), 100),
    pointsToNext: Math.max(pointsToNext, 0),
  };
}

/**
 * Get user's current points
 */
export function getUserPoints(): UserPoints {
  const stored = localStorage.getItem(STORAGE_KEYS.POINTS);
  if (stored) {
    const data = JSON.parse(stored);
    return {
      ...data,
      lastUpdated: new Date(data.lastUpdated),
    };
  }
  
  // Initialize with welcome bonus
  const initialPoints: UserPoints = {
    total: 100,
    lifetime: 100,
    pending: 0,
    lastUpdated: new Date(),
  };
  
  localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(initialPoints));
  
  // Record welcome bonus transaction
  addPointTransaction({
    type: 'earn',
    amount: 100,
    description: POINT_ACTIONS.WELCOME_BONUS.description,
    category: 'bonus',
  });
  
  return initialPoints;
}

/**
 * Add points to user's account
 */
export function addPoints(action: keyof typeof POINT_ACTIONS, bonus: number = 0): boolean {
  const actionConfig = POINT_ACTIONS[action];
  
  // Check if one-time action already completed
  if (actionConfig.oneTime) {
    const completedActions = JSON.parse(localStorage.getItem(STORAGE_KEYS.ONE_TIME_ACTIONS) || '[]');
    if (completedActions.includes(action)) {
      return false; // Already claimed
    }
    completedActions.push(action);
    localStorage.setItem(STORAGE_KEYS.ONE_TIME_ACTIONS, JSON.stringify(completedActions));
  }
  
  // Check daily limits
  if (actionConfig.limit) {
    const today = new Date().toDateString();
    const dailyLimits = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_LIMITS) || '{}');
    
    if (!dailyLimits[today]) {
      dailyLimits[today] = {};
    }
    
    const currentCount = dailyLimits[today][action] || 0;
    if (currentCount >= actionConfig.limit) {
      return false; // Daily limit reached
    }
    
    dailyLimits[today][action] = currentCount + 1;
    localStorage.setItem(STORAGE_KEYS.DAILY_LIMITS, JSON.stringify(dailyLimits));
  }
  
  // Add points
  const points = getUserPoints();
  const totalPoints = actionConfig.points + bonus;
  
  points.total += totalPoints;
  points.lifetime += totalPoints;
  points.lastUpdated = new Date();
  
  localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(points));
  
  // Record transaction
  addPointTransaction({
    type: 'earn',
    amount: totalPoints,
    description: actionConfig.description + (bonus > 0 ? ` (+${bonus} bonus)` : ''),
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
 * Get point transaction history
 */
export function getPointTransactions(): PointTransaction[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
  if (!stored) return [];
  
  const data = JSON.parse(stored);
  return data.map((txn: any) => ({
    ...txn,
    timestamp: new Date(txn.timestamp),
  }));
}

/**
 * Get user's achievements
 */
export function getUserAchievements(): Achievement[] {
  const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
  if (stored) {
    const data = JSON.parse(stored);
    return data.map((achievement: any) => ({
      ...achievement,
      unlockedAt: achievement.unlockedAt ? new Date(achievement.unlockedAt) : undefined,
    }));
  }
  
  // Initialize with default achievements
  localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(ACHIEVEMENTS));
  return ACHIEVEMENTS;
}

/**
 * Update achievement progress
 */
export function updateAchievementProgress(achievementId: string, progress: number): boolean {
  const achievements = getUserAchievements();
  const achievement = achievements.find(a => a.id === achievementId);
  
  if (!achievement) return false;
  
  achievement.progress = Math.min(progress, achievement.requirement);
  
  // Check if newly unlocked
  if (!achievement.unlocked && achievement.progress >= achievement.requirement) {
    achievement.unlocked = true;
    achievement.unlockedAt = new Date();
    
    // Award bonus points
    const points = getUserPoints();
    points.total += achievement.reward;
    points.lifetime += achievement.reward;
    points.lastUpdated = new Date();
    localStorage.setItem(STORAGE_KEYS.POINTS, JSON.stringify(points));
    
    // Record transaction
    addPointTransaction({
      type: 'bonus',
      amount: achievement.reward,
      description: `Achievement unlocked: ${achievement.name}`,
      category: 'achievement',
    });
  }
  
  localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(achievements));
  
  return achievement.unlocked;
}

/**
 * Get achievement stats
 */
export function getAchievementStats(): {
  total: number;
  unlocked: number;
  progress: number;
  nextToUnlock: Achievement | null;
} {
  const achievements = getUserAchievements();
  const unlocked = achievements.filter(a => a.unlocked).length;
  const total = achievements.length;
  const progress = (unlocked / total) * 100;
  
  // Find next closest achievement
  const locked = achievements.filter(a => !a.unlocked);
  const nextToUnlock = locked.sort((a, b) => {
    const aPercent = (a.progress / a.requirement) * 100;
    const bPercent = (b.progress / b.requirement) * 100;
    return bPercent - aPercent;
  })[0] || null;
  
  return {
    total,
    unlocked,
    progress,
    nextToUnlock,
  };
}

/**
 * Get rarity color
 */
export function getRarityColor(rarity: Achievement['rarity']): string {
  switch (rarity) {
    case 'common': return 'from-gray-500 to-gray-600';
    case 'rare': return 'from-blue-500 to-cyan-500';
    case 'epic': return 'from-purple-500 to-fuchsia-500';
    case 'legendary': return 'from-yellow-400 to-orange-500';
  }
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  tier: MembershipTier;
  isCurrentUser?: boolean;
}

const MOCK_LEADERBOARD: Omit<LeaderboardEntry, 'rank'>[] = [
  { userId: '1', name: 'Alex M.', points: 8420, tier: 'platinum' },
  { userId: '2', name: 'Jordan K.', points: 6890, tier: 'platinum' },
  { userId: '3', name: 'Taylor S.', points: 5240, tier: 'platinum' },
  { userId: '4', name: 'Morgan R.', points: 3670, tier: 'gold' },
  { userId: '5', name: 'Casey L.', points: 2980, tier: 'gold' },
  { userId: '6', name: 'Riley P.', points: 2450, tier: 'gold' },
  { userId: '7', name: 'Avery T.', points: 1820, tier: 'silver' },
  { userId: '8', name: 'Quinn B.', points: 1560, tier: 'silver' },
  { userId: '9', name: 'Drew H.', points: 1290, tier: 'silver' },
  { userId: '10', name: 'Sam W.', points: 980, tier: 'silver' },
];

/**
 * Get Top 10 leaderboard entries (mock for now — will use real API data later).
 * Inserts the current user into the list if they rank in the top 10.
 */
export function getLeaderboard(): { entries: LeaderboardEntry[]; userRank: number; userPoints: number } {
  const currentPoints = getUserPoints().total;
  const userName = (() => {
    try {
      const stored = localStorage.getItem('bytspot_user_name');
      if (stored) return stored;
      const user = JSON.parse(localStorage.getItem('bytspot_user') || '{}');
      return user?.name?.split(' ')[0] || 'You';
    } catch { return 'You'; }
  })();

  // Build full list including current user and sort
  const allEntries = [
    ...MOCK_LEADERBOARD,
    { userId: 'me', name: userName, points: currentPoints, tier: getUserTier(currentPoints).level as MembershipTier },
  ].sort((a, b) => b.points - a.points);

  const userRank = allEntries.findIndex(e => e.userId === 'me') + 1;
  const top10 = allEntries.slice(0, 10).map((e, i) => ({
    ...e,
    rank: i + 1,
    isCurrentUser: e.userId === 'me',
  }));

  return { entries: top10, userRank, userPoints: currentPoints };
}

/**
 * Reset daily limits (call this at midnight or on app load)
 */
export function cleanupDailyLimits(): void {
  const today = new Date().toDateString();
  const dailyLimits = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_LIMITS) || '{}');
  
  // Remove old dates
  const cleaned: any = {};
  Object.keys(dailyLimits).forEach(date => {
    if (date === today) {
      cleaned[date] = dailyLimits[date];
    }
  });
  
  localStorage.setItem(STORAGE_KEYS.DAILY_LIMITS, JSON.stringify(cleaned));
}
