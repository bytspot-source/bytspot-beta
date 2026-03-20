/**
 * Bytspot Social Utility
 * v2 — API-first: calls tRPC social.* endpoints, falls back to localStorage.
 */
import { trpc } from './trpc';

export interface SocialFeedEvent {
  id: string;
  userId: string;
  userName: string;
  venueName: string;
  venueId?: string;
  crowdLevel: number;
  crowdLabel: string;
  timestamp: string; // ISO
}

const FOLLOWED_KEY = 'bytspot_followed_users';
const FEED_KEY = 'bytspot_social_feed';
const MAX_FEED = 50;

function isAuthenticated(): boolean {
  return !!localStorage.getItem('bytspot_auth_token');
}

// ── Follow / Unfollow ──────────────────────────────────────────────────────

export interface FollowedUser { userId: string; userName: string; tier: string; }

/** Sync localStorage read */
export function getFollowedUsers(): FollowedUser[] {
  try { return JSON.parse(localStorage.getItem(FOLLOWED_KEY) || '[]'); }
  catch { return []; }
}

/** API-first followed users list */
export async function getFollowedUsersAsync(): Promise<FollowedUser[]> {
  if (!isAuthenticated()) return getFollowedUsers();
  try {
    const rows = await trpc.social.following.query();
    const mapped: FollowedUser[] = rows.map((r: any) => ({ userId: r.userId, userName: r.name ?? 'Anonymous', tier: '' }));
    localStorage.setItem(FOLLOWED_KEY, JSON.stringify(mapped));
    return mapped;
  } catch { return getFollowedUsers(); }
}

export function isFollowing(userId: string): boolean {
  return getFollowedUsers().some((u) => u.userId === userId);
}

export async function isFollowingAsync(userId: string): Promise<boolean> {
  if (!isAuthenticated()) return isFollowing(userId);
  try {
    const res = await trpc.social.isFollowing.query({ userId });
    return res.following;
  } catch { return isFollowing(userId); }
}

export function followUser(userId: string, userName: string, tier: string): void {
  // Optimistic local update
  if (!isFollowing(userId)) {
    const list = getFollowedUsers();
    list.push({ userId, userName, tier });
    localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
  }
  // Fire-and-forget API call
  if (isAuthenticated()) {
    trpc.social.follow.mutate({ userId }).catch(() => {});
  } else {
    seedFriendActivity(userId, userName);
  }
}

export function unfollowUser(userId: string): void {
  const list = getFollowedUsers().filter((u) => u.userId !== userId);
  localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
  if (isAuthenticated()) {
    trpc.social.unfollow.mutate({ userId }).catch(() => {});
  }
}

// ── Feed ──────────────────────────────────────────────────────────────────

/** Sync localStorage feed */
export function getSocialFeed(): SocialFeedEvent[] {
  try { return JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); }
  catch { return []; }
}

/** API-first social feed */
export async function getSocialFeedAsync(): Promise<SocialFeedEvent[]> {
  if (!isAuthenticated()) return getSocialFeed();
  try {
    const res = await trpc.social.feed.query({ limit: 20 });
    const mapped: SocialFeedEvent[] = res.items.map((item: any) => ({
      id: item.id,
      userId: item.userId,
      userName: item.userName,
      venueName: item.venueName,
      venueId: item.venueId,
      crowdLevel: item.crowdLevel,
      crowdLabel: item.crowdLabel,
      timestamp: item.timestamp,
    }));
    localStorage.setItem(FEED_KEY, JSON.stringify(mapped));
    return mapped;
  } catch { return getSocialFeed(); }
}

export function postToFeed(event: Omit<SocialFeedEvent, 'id'>): void {
  const feed = getSocialFeed();
  const entry: SocialFeedEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...event };
  feed.unshift(entry);
  localStorage.setItem(FEED_KEY, JSON.stringify(feed.slice(0, MAX_FEED)));
}

/** Called from VenueDetails when current user checks in — the backend records the check-in in the feed automatically via venues.checkin. This is a local fallback only. */
export function broadcastOwnCheckin(venueName: string, venueId: string | undefined, crowdLevel: number, crowdLabel: string): void {
  // When authenticated, the backend records the check-in; skip local broadcast to avoid duplicates
  if (isAuthenticated()) return;
  const rawUser = localStorage.getItem('bytspot_user');
  const userName = localStorage.getItem('bytspot_user_name') || 'You';
  const userId = rawUser ? (JSON.parse(rawUser)?.id || 'me') : 'me';
  postToFeed({ userId, userName, venueName, venueId, crowdLevel, crowdLabel, timestamp: new Date().toISOString() });
}

const MOCK_VENUES = [
  { name: 'Ponce City Market', id: 'ponce-city-market', level: 3, label: 'Busy' },
  { name: 'The Painted Pin', id: 'the-painted-pin', level: 2, label: 'Active' },
  { name: 'Ladybird Grove', id: 'ladybird-grove', level: 2, label: 'Active' },
  { name: 'Bully Boy Bar', id: 'bully-boy-bar', level: 4, label: 'Packed' },
  { name: 'Orpheum', id: 'orpheum', level: 3, label: 'Busy' },
  { name: 'Joystick Gamebar', id: 'joystick-gamebar', level: 2, label: 'Active' },
  { name: 'Jeni\'s Ice Cream', id: 'jenis-ice-cream', level: 1, label: 'Chill' },
];

function seedFriendActivity(userId: string, userName: string): void {
  const now = Date.now();
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const venue = MOCK_VENUES[Math.floor(Math.random() * MOCK_VENUES.length)];
    const msAgo = (i + 1) * (30 + Math.floor(Math.random() * 60)) * 60 * 1000;
    postToFeed({
      userId, userName,
      venueName: venue.name, venueId: venue.id,
      crowdLevel: venue.level, crowdLabel: venue.label,
      timestamp: new Date(now - msAgo).toISOString(),
    });
  }
}

