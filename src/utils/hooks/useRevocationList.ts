/**
 * Revocation-list bootstrap — NIST RS.MI-1 (containment).
 *
 * Fetches the active set of revoked patch IDs for the current vendor scope on
 * boot and on a recurring interval, then loads them into the in-memory
 * revocation cache used by `isPatchRevoked` (consumed by the scanner pre-flight
 * check). The server endpoint (`patch.revocations.list`) is implemented in the
 * bytspot-api repo. If the endpoint is unavailable, the cache simply stays at
 * its current state and the hook retries on the next tick — verification still
 * proceeds against the server, which is the authoritative gate.
 */
import { useEffect, useRef } from 'react';
import { trpc } from '../trpc';
import { loadRevocationList } from '../virtualPatch';

const DEFAULT_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

export interface UseRevocationListOptions {
  /** Vendor scope. When null, the server returns the platform-wide active set. */
  vendorId?: string | null;
  /** Refresh cadence. Defaults to 10 minutes. */
  refreshMs?: number;
  /** Disable the hook (useful for tests or kill-switch). */
  enabled?: boolean;
}

interface RevocationListResponse {
  revokedIds: string[];
  fetchedAt?: string;
}

export function useRevocationList(options: UseRevocationListOptions = {}): void {
  const { vendorId = null, refreshMs = DEFAULT_REFRESH_MS, enabled = true } = options;
  const sinceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const result = (await trpc.patch.revocations.list.query({
          vendorId,
          since: sinceRef.current ?? undefined,
        })) as RevocationListResponse | null | undefined;
        if (cancelled) return;
        if (result && Array.isArray(result.revokedIds)) {
          // Server returns the full active list — replace cache atomically.
          loadRevocationList(result.revokedIds);
        }
        if (result && typeof result.fetchedAt === 'string') {
          sinceRef.current = result.fetchedAt;
        }
      } catch {
        // Endpoint unavailable / network blip — leave cache as-is; next tick retries.
      }
    };

    void refresh();
    const id = window.setInterval(() => { void refresh(); }, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, refreshMs, vendorId]);
}
