import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeSignIn,
  currentAuthStep,
  openVerifiedSession,
  preferredMembership,
  recallSeller,
  refreshAccess,
  rememberSeller,
  startSignIn,
  tokenNeedsRefresh,
  type AccessToken,
  type AuthRefusal,
  type AuthTransport,
  type VendorMembership,
  type VendorPrincipal,
  type VerifiedSessionRefusal,
} from './auth.ts';
import { VENDOR_API_BASE_URL } from './authTransport.ts';
import type { AuthorizedFetch } from './setupTransport.ts';
import { vendorAuthContract, type VendorAuthStepId } from './vendorConsole.ts';
import type { VendorSession } from './seller.ts';

const nowSecs = () => Math.floor(Date.now() / 1000);

export interface VendorAuthState {
  step: VendorAuthStepId;
  principal?: VendorPrincipal;
  memberships: VendorMembership[];
  session?: VendorSession;
  /** A sign-in refusal or the reason the chosen seat would not open. */
  refusal?: AuthRefusal | VerifiedSessionRefusal;
  busy: boolean;
  resendAfterSecs: number;
}

export interface VendorAuthActions {
  requestCode: (email: string) => Promise<void>;
  submitCode: (code: string) => Promise<void>;
  chooseSeller: (sellerId: string) => void;
  signOut: () => Promise<void>;
  /**
   * A call that already carries the session. Handed out instead of the token
   * itself, so a screen that needs to reach the API cannot also copy the
   * credential into state, a log line or a DOM attribute.
   */
  authorizedFetch: AuthorizedFetch;
}

/**
 * Holds the access token in a ref rather than in state, deliberately. A ref is
 * not serialised into a React devtools snapshot or an error boundary's props,
 * and it never triggers a render that could put the value into a DOM attribute.
 */
export function useVendorAuth(transport: AuthTransport): VendorAuthState & VendorAuthActions {
  const token = useRef<AccessToken | undefined>(undefined);
  const challengeId = useRef<string | undefined>(undefined);

  // Mirrors whether a challenge is outstanding. The handle itself stays in a
  // ref; only its presence drives which screen renders.
  const [codeSent, setCodeSent] = useState(false);
  const [principal, setPrincipal] = useState<VendorPrincipal | undefined>(undefined);
  const [memberships, setMemberships] = useState<VendorMembership[]>([]);
  const [sellerId, setSellerId] = useState<string | undefined>(undefined);
  // Mirrored into a ref because authorizedFetch is built once and would
  // otherwise close over the seller chosen at mount, quietly writing every
  // later edit to the business the vendor switched away from.
  const activeSeller = useRef<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<AuthRefusal | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [resendAfterSecs, setResendAfterSecs] = useState(0);

  const forget = useCallback(() => {
    token.current = undefined;
    challengeId.current = undefined;
    setCodeSent(false);
    setPrincipal(undefined);
    setMemberships([]);
    setSellerId(undefined);
    activeSeller.current = undefined;
  }, []);

  const requestCode = useCallback(
    async (email: string) => {
      setBusy(true);
      setRefusal(undefined);
      const result = await startSignIn(email, transport);
      setBusy(false);
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
      challengeId.current = result.started.challengeId;
      setCodeSent(true);
      setResendAfterSecs(result.started.resendAfterSecs);
    },
    [transport],
  );

  const submitCode = useCallback(
    async (code: string) => {
      const challenge = challengeId.current;
      if (!challenge) return;
      setBusy(true);
      setRefusal(undefined);
      const result = await completeSignIn({ challengeId: challenge, code }, transport, { nowSecs });
      setBusy(false);
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
      // The code is spent either way, so the handle is dropped on success too.
      challengeId.current = undefined;
      setCodeSent(false);
      token.current = result.token;
      setPrincipal(result.principal);
      setMemberships(result.memberships);

      const remembered = typeof localStorage === 'undefined' ? undefined : recallSeller(localStorage);
      const preferred = preferredMembership(result.principal, result.memberships, nowSecs(), remembered);
      if (!preferred) {
        setRefusal('no-seats');
        return;
      }
      setSellerId(preferred.seller.id);
      activeSeller.current = preferred.seller.id;
    },
    [transport],
  );

  const chooseSeller = useCallback((next: string) => {
    setSellerId(next);
    activeSeller.current = next;
    setRefusal(undefined);
    if (typeof localStorage !== 'undefined') rememberSeller(next, localStorage);
  }, []);

  const authorizedFetch = useCallback<AuthorizedFetch>(
    (path, init) => {
      const headers = new Headers(init?.headers);
      // Bearer, never a cookie: the refresh cookie is Path-scoped to the auth
      // routes precisely so it is not attached to ordinary calls.
      if (token.current) headers.set('Authorization', `Bearer ${token.current}`);
      // Names which business this edit is for. The server still checks the
      // caller holds a seat there — this says which one, it does not grant it.
      if (activeSeller.current) headers.set('X-Bytspot-Seller', activeSeller.current);
      return fetch(`${VENDOR_API_BASE_URL}${path}`, { ...init, headers, credentials: 'omit' });
    },
    [],
  );

  const signOut = useCallback(async () => {
    forget();
    setRefusal(undefined);
    // The refresh cookie is httpOnly, so only the server can clear it.
    await transport.signOut();
  }, [forget, transport]);

  const opened = useMemo(() => {
    if (!principal || !sellerId) return undefined;
    const membership = memberships.find((item) => item.seller.id === sellerId);
    if (!membership) return undefined;
    return openVerifiedSession(principal, membership, nowSecs());
  }, [principal, memberships, sellerId]);

  /**
   * Refreshes ahead of expiry rather than reacting to a 401, so a vendor never
   * loses a half-typed form to a token that ran out mid-edit. A failed refresh
   * drops everything: there is no useful degraded console.
   */
  useEffect(() => {
    if (!principal) return;
    const { accessTtlSecs, refreshBeforeExpirySecs } = vendorAuthContract().token;
    const tick = async () => {
      const current = token.current;
      if (!current || !tokenNeedsRefresh(current, nowSecs())) return;
      const result = await refreshAccess(transport, { nowSecs });
      if (!result.ok) {
        forget();
        setRefusal('expired-session');
        return;
      }
      token.current = result.token;
      setPrincipal((previous) =>
        previous ? { ...previous, expiresAtSecs: result.token.expiresAtSecs } : previous,
      );
    };
    const everySecs = Math.max(30, Math.min(refreshBeforeExpirySecs, accessTtlSecs) / 2);
    const timer = setInterval(tick, everySecs * 1000);
    void tick();
    return () => clearInterval(timer);
  }, [principal, transport, forget]);

  useEffect(() => {
    if (resendAfterSecs <= 0) return;
    const timer = setInterval(() => setResendAfterSecs((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendAfterSecs]);

  const session = opened?.ok ? opened.session : undefined;
  const step = currentAuthStep({ principal, challengeId: codeSent ? 'pending' : undefined, session });

  return {
    step,
    principal,
    memberships,
    session,
    refusal: refusal ?? (opened && !opened.ok ? opened.reason : undefined),
    busy,
    resendAfterSecs,
    requestCode,
    submitCode,
    chooseSeller,
    signOut,
    authorizedFetch,
  };
}
