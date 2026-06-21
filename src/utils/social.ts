/**
 * Bytspot Social Utility
 * v2 — API-first: calls tRPC social.* endpoints, falls back to localStorage.
 */
import { trpc } from './trpc.ts';
import { pickAndHashContacts, isContactPickerSupported } from './contactHash.ts';

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

function seedFriendActivity(userId: string, userName: string): void {
  void userId;
  void userName;
}

// ── Contact graph (WS-Social Phase 1) ───────────────────────────────────────

/** A contact-graph friend suggestion surfaced by social.suggestions. Mirrors
 * the server item shape and the native NativeFriendSuggestion. */
export interface FriendSuggestion {
  userId: string;
  name: string;
  profileImage: string | null;
  source: string;
  mutual: boolean;
  mutualContacts: number;
  sharedVerifiedVenues: number;
}

/** Result of a syncCloudContact mutation. */
export interface ContactSyncResult {
  source: string;
  degraded: boolean;
  scanned: number;
  matched: number;
  mutual: number;
}

/** Human reason string, ranked the same way the server sorts suggestions. */
export function suggestionReason(s: FriendSuggestion): string {
  if (s.mutual) return 'Mutual contact';
  if (s.mutualContacts > 0) return `${s.mutualContacts} contact${s.mutualContacts === 1 ? '' : 's'} in common`;
  if (s.sharedVerifiedVenues > 0) return `${s.sharedVerifiedVenues} shared verified spot${s.sharedVerifiedVenues === 1 ? '' : 's'}`;
  return s.source === 'google' ? 'From your Google contacts' : 'From your contacts';
}

/** Deterministic client mirror of the server suggestion ordering contract. */
export function rankFriendSuggestions(suggestions: FriendSuggestion[]): FriendSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const mutualDelta = Number(b.mutual) - Number(a.mutual);
    if (mutualDelta !== 0) return mutualDelta;
    const contactsDelta = b.mutualContacts - a.mutualContacts;
    if (contactsDelta !== 0) return contactsDelta;
    const venuesDelta = b.sharedVerifiedVenues - a.sharedVerifiedVenues;
    if (venuesDelta !== 0) return venuesDelta;
    return a.name.localeCompare(b.name);
  });
}

/** Fetch ranked friend suggestions from the contact graph. Fails safe to []. */
export async function getSuggestions(limit = 20): Promise<FriendSuggestion[]> {
  if (!isAuthenticated()) return [];
  try {
    const res = await trpc.social.suggestions.query({ limit });
    return rankFriendSuggestions((res?.items ?? []).map((item: Record<string, unknown>) => ({
      userId: String(item.userId),
      name: (item.name as string) ?? 'Bytspot member',
      profileImage: (item.profileImage as string | null) ?? null,
      source: (item.source as string) ?? 'apple',
      mutual: Boolean(item.mutual),
      mutualContacts: Number(item.mutualContacts ?? 0),
      sharedVerifiedVenues: Number(item.sharedVerifiedVenues ?? 0),
    })));
  } catch {
    return [];
  }
}

/** Sync salted contact hashes into the contact graph (Apple/device source). */
export async function syncCloudContact(hashes: string[]): Promise<ContactSyncResult | null> {
  if (!isAuthenticated()) return null;
  try {
    return await trpc.social.syncCloudContact.mutate({ source: 'apple', hashes });
  } catch {
    return null;
  }
}

/** True when this browser exposes the Web Contact Picker API (Android Chrome). */
export { isContactPickerSupported };

/**
 * Open the Web Contact Picker, hash the chosen contacts on-device, and sync
 * the hashes. Returns the sync result, or null when unsupported/cancelled.
 * Raw contacts never leave the device.
 */
export async function syncDeviceContactsViaPicker(): Promise<ContactSyncResult | null> {
  const hashes = await pickAndHashContacts();
  if (hashes === null) return null;
  return syncCloudContact(hashes);
}

