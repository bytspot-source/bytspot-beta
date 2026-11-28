import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookableLocationKindId, BookableLocationOperationId } from '../utils/bookableTemplates.ts';
import type { GeocodeCandidate } from './geocoding.ts';
import {
  applyProfileEdit,
  EMPTY_PROFILE,
  PAYOUT_BOUNCED_NOTE,
  payoutRetryAction,
  reconcileSeller,
  type ProfileEdit,
  type VendorProfile,
} from './profile.ts';
import type { Seller } from './seller.ts';
import type { SetupTransport } from './setupTransport.ts';

export interface VendorSetupState {
  profile: VendorProfile;
  /** The seller with `satisfied` recomputed from the records it actually holds. */
  seller: Seller;
  blockers: string[];
  busy: boolean;
  /** False until the first profile read lands, so screens do not act on an empty one. */
  loaded: boolean;
}

export interface VendorSetupActions {
  edit: (edit: ProfileEdit) => Promise<void>;
  startPayout: () => Promise<void>;
  move: (id: string, operation: BookableLocationOperationId) => Promise<void>;
  geocode: (query: string, kind: BookableLocationKindId) => Promise<GeocodeCandidate[]>;
  reload: () => Promise<void>;
}

/**
 * Owns the writable half of a business.
 *
 * `satisfied` is recomputed from the records on every change rather than being
 * appended to as forms are submitted. A list that is appended to can outlive its
 * reason: a business whose only location closed would still be carrying the tick
 * that said it had one, and would then fail to publish with nothing on screen
 * explaining why.
 */
export function useVendorSetup(
  opened: Seller,
  transport: SetupTransport,
): VendorSetupState & VendorSetupActions {
  const [profile, setProfile] = useState<VendorProfile>(EMPTY_PROFILE);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const result = await transport.loadProfile();
      if (result.value) setProfile(result.value);
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  }, [transport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Stripe's form opens in another tab. Coming back to this one, or landing on
  // Stripe's return link, reloads the profile, which asks Stripe for the
  // payout's status and takes the business live if it now qualifies.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const retry = payoutRetryAction(window.location.pathname, readRetryAt(), Date.now());
    if (/^\/payout\/(done|retry)\/?$/.test(window.location.pathname)) window.history.replaceState(null, '', '/');
    if (retry === 'explain') setBlockers([PAYOUT_BOUNCED_NOTE]);
    if (retry === 'retry') {
      writeRetryAt(Date.now());
      // This tab is already Stripe's; reopen the form here with a fresh link.
      void transport.startPayoutOnboarding().then((handoff) => {
        if (handoff.value?.url) window.location.assign(handoff.value.url);
        else setBlockers(handoff.blockers ?? [PAYOUT_BOUNCED_NOTE]);
      });
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload, transport]);

  const edit = useCallback(
    async (next: ProfileEdit) => {
      // Validated before the write, so a rejected edit never reaches the API and
      // never half-updates what the vendor is looking at.
      const verdict = applyProfileEdit(profile, next);
      if (!verdict.ok) {
        setBlockers(verdict.blockers);
        return;
      }

      setBlockers([]);
      setBusy(true);
      try {
        const result =
          next.field === 'location'
            ? await transport.saveLocation(next.value)
            : next.field === 'payout'
              ? undefined
              : await transport.saveField(next.field, next.value);

        // The server's copy wins when it sends one: it may have normalised the
        // address or rejected part of the write.
        if (result?.value) setProfile(result.value);
        else if (result?.blockers?.length) setBlockers(result.blockers);
        else if (result && !result.value) setBlockers(['Could not save that. Try again.']);
        else setProfile(verdict.profile);
      } finally {
        setBusy(false);
      }
    },
    [profile, transport],
  );

  /**
   * Payout status is never written by this origin. We ask the processor for a
   * handoff, send the vendor there, and read back what it decided; a status we
   * set ourselves would be a claim we are not in a position to make.
   */
  const startPayout = useCallback(async () => {
    setBusy(true);
    // Opened during the tap: Safari blocks a tab opened after a network wait.
    // A new tab rather than an iframe: the provider's form must not render
    // inside a page that also shows vendor-supplied strings.
    const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      const handoff = await transport.startPayoutOnboarding();
      if (!handoff.value?.url) {
        tab?.close();
        setBlockers(handoff.blockers ?? ['Could not reach the payment provider.']);
        return;
      }
      if (tab) tab.location.href = handoff.value.url;
      else if (typeof window !== 'undefined') window.location.assign(handoff.value.url);
      const payout = await transport.readPayout();
      if (payout.value) setProfile((current) => ({ ...current, payout: payout.value }));
    } finally {
      setBusy(false);
    }
  }, [transport]);

  /**
   * Until the profile has loaded, the server's own list stands. Reconciling
   * against an empty profile would blank every tick for a moment and flash a
   * finished business back through setup.
   */
  const seller = useMemo(
    () => (loaded ? reconcileSeller(opened, profile) : opened),
    [loaded, opened, profile],
  );

  /**
   * Deliberately not marked busy: the address lookup has its own inline state,
   * and blanking the form around it would take the field the vendor is typing
   * in out from under them.
   */
  const geocode = useCallback(
    async (query: string, kind: BookableLocationKindId) => {
      const result = await transport.geocode(query, kind);
      if (result.blockers?.length) setBlockers(result.blockers);
      else setBlockers([]);
      return result.value ?? [];
    },
    [transport],
  );

  /**
   * Pausing a place can take the last one that satisfied `activeLocation`, so
   * the profile the server returns is what decides. Applying the new state
   * locally would tick a requirement the records no longer support.
   */
  const move = useCallback(
    async (id: string, operation: BookableLocationOperationId) => {
      setBlockers([]);
      setBusy(true);
      try {
        const result = await transport.moveLocation(id, operation);
        if (result.value) setProfile(result.value);
        else setBlockers(result.blockers ?? ['Could not change that. Try again.']);
      } finally {
        setBusy(false);
      }
    },
    [transport],
  );

  return { profile, seller, blockers, busy, loaded, edit, startPayout, move, geocode, reload };
}

const RETRY_KEY = 'bytspot.vendor.payoutRetryAt';

function readRetryAt(): number | null {
  try {
    const value = Number(window.sessionStorage.getItem(RETRY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    // Without storage a retry cannot be remembered, so explain instead of retrying.
    return Date.now();
  }
}

function writeRetryAt(at: number): void {
  try {
    window.sessionStorage.setItem(RETRY_KEY, String(at));
  } catch {
    // Read back as just retried, so the next bounce is explained.
  }
}
