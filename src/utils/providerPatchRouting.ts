import { trpc } from './trpc';
import type { VirtualPatchContext } from './virtualPatch';

export const PROVIDER_PATCH_FOCUS_KEY = 'bytspot_provider_patch_focus';

type PatchLike = { id?: unknown; uid?: unknown };

export function getPatchIdFromContext(context: VirtualPatchContext | null | undefined): string | null {
  const patchId = context?.patchId;
  return typeof patchId === 'string' && patchId.trim() ? patchId.trim() : null;
}

export function providerPatchPath(patchId: string): string {
  return `/provider/patch/${encodeURIComponent(patchId)}`;
}

export function readProviderPatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:provider|vendor)\/patch\/([^/?#]+)/);
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
    const result = await trpc.vendors.listPatches.query({ limit: 100 });
    const patches = Array.isArray(result?.patches) ? result.patches as PatchLike[] : [];
    return patches.some((patch) => patch.id === normalized || patch.uid === normalized);
  } catch {
    return false;
  }
}