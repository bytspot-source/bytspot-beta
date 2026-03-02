/**
 * Bytspot Social Utility (localStorage-based for beta)
 * Follow friends from the leaderboard and see their check-in activity.
 */

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

// ── Follow / Unfollow ──────────────────────────────────────────────────────

export interface FollowedUser { userId: string; userName: string; tier: string; }

export function getFollowedUsers(): FollowedUser[] {
  try { return JSON.parse(localStorage.getItem(FOLLOWED_KEY) || '[]'); }
  catch { return []; }
}

export function isFollowing(userId: string): boolean {
  return getFollowedUsers().some((u) => u.userId === userId);
}

export function followUser(userId: string, userName: string, tier: string): void {
  if (isFollowing(userId)) return;
  const list = getFollowedUsers();
  list.push({ userId, userName, tier });
  localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
  // Seed a few synthetic past check-ins for this user so the feed isn't empty
  seedFriendActivity(userId, userName);
}

export function unfollowUser(userId: string): void {
  const list = getFollowedUsers().filter((u) => u.userId !== userId);
  localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
}

// ── Feed ──────────────────────────────────────────────────────────────────

export function getSocialFeed(): SocialFeedEvent[] {
  try { return JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); }
  catch { return []; }
}

export function postToFeed(event: Omit<SocialFeedEvent, 'id'>): void {
  const feed = getSocialFeed();
  const entry: SocialFeedEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...event };
  feed.unshift(entry);
  localStorage.setItem(FEED_KEY, JSON.stringify(feed.slice(0, MAX_FEED)));
}

/** Called from VenueDetails when current user checks in — shares to social feed */
export function broadcastOwnCheckin(venueName: string, venueId: string | undefined, crowdLevel: number, crowdLabel: string): void {
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
  // 2-3 past synthetic events spread over last 4 hours
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

