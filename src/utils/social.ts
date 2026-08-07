/** People and relationship utilities for the Network hub. */
import { trpc } from './trpc.ts';
import { pickAndHashContacts, isContactPickerSupported } from './contactHash.ts';
import type { RelationshipStatus } from './primaryEventSocialRpc.ts';

function isAuthenticated(): boolean {
  return !!localStorage.getItem('bytspot_auth_token');
}

export interface NetworkPerson {
  userId: string;
  name: string;
  profileImage: string | null;
  relationshipStatus: RelationshipStatus;
  circleIds: string[];
}

export type FriendSuggestion = NetworkPerson;

/** Result of a syncCloudContact mutation. */
export interface ContactSyncResult {
  source: string;
  degraded: boolean;
  scanned: number;
  matched: number;
  mutual: number;
}

export function suggestionReason(s: FriendSuggestion): string {
  if (s.relationshipStatus === 'connected') return 'Connected';
  if (s.relationshipStatus === 'invite_sent') return 'Invite sent';
  if (s.relationshipStatus === 'invite_received') return 'Invited you';
  return 'Suggested from your contacts';
}

export function rankFriendSuggestions(suggestions: FriendSuggestion[]): FriendSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const priority: Record<RelationshipStatus, number> = { invite_received: 0, connected: 1, suggested: 2, invite_sent: 3 };
    const relationshipDelta = priority[a.relationshipStatus] - priority[b.relationshipStatus];
    if (relationshipDelta !== 0) return relationshipDelta;
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
      relationshipStatus: (['connected', 'invite_sent', 'invite_received'].includes(String(item.relationshipStatus)) ? item.relationshipStatus : 'suggested') as RelationshipStatus,
      circleIds: Array.isArray(item.circleIds) ? item.circleIds.map(String) : [],
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

