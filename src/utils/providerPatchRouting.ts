import { trpc } from './trpc';
import { type BytspotPatchTier } from './patchTiers';
import type { VirtualPatchContext } from './virtualPatch';

export const PROVIDER_PATCH_FOCUS_KEY = 'bytspot_provider_patch_focus';

type PatchLike = { id?: unknown; uid?: unknown };

export function getPatchIdFromContext(context: VirtualPatchContext | null | undefined): string | null {
  const patchId = context?.patchId;
  return typeof patchId === 'string' && patchId.trim() ? patchId.trim() : null;
}

export function providerPatchPath(patchId: string): string {
  return `/vendor/station/${encodeURIComponent(patchId)}`;
}

export function consumerPatchPath(
  patchId: string,
  tier?: BytspotPatchTier | null,
  options: { venueName?: string | null; serviceId?: string | null } = {},
): string {
  const path = `/p/${encodeURIComponent(patchId)}`;
  const params = new URLSearchParams({ patch: patchId });
  if (options.venueName?.trim()) params.set('venue', options.venueName.trim());
  if (tier) params.set('tier', tier);
  if (options.serviceId?.trim()) params.set('service', options.serviceId.trim());
  return `${path}?${params.toString()}`;
}

export function readProviderPatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:provider|vendor)\/(?:patch|station)\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function focusProviderPatch(patchId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = patchId?.trim();
  if (!normalized) return;
  window.localStorage.setItem(PROVIDER_PATCH_FOCUS_KEY, normalized);
}

export async function isLoggedInProviderPatchOwner(patchId: string | null | undefined): Promise<boolean> {
  const normalized = patchId?.trim();
  if (!normalized || typeof window === 'undefined') return false;

  const token = window.localStorage.getItem('bytspot_auth_token');
  if (!token || token === 'guest_session') return false;

  try {
    const resolved = await trpc.patch.resolve.query({ patchId: normalized });
    if (resolved?.type === 'VENDOR_STATION') return true;
    if (resolved?.type === 'CONSUMER_ACCESS') return false;
  } catch {
    // Fall back to the older provider patch list while the API rollout completes.
  }

  try {
    const result = await trpc.vendors.listPatches.query({ limit: 100 });
    const patches = Array.isArray(result?.patches) ? result.patches as PatchLike[] : [];
    return patches.some((patch) => patch.id === normalized || patch.uid === normalized);
  } catch {
    return false;
  }
}