import { useState, type ReactNode } from 'react';
import { isPlausibleEmail, isWellFormedCode, type AuthTransport } from './auth.ts';
import { useVendorAuth } from './useVendorAuth.ts';
import { staffRoleLabel, vendorAuthContract, vendorAuthMessage } from './vendorConsole.ts';
import { VENDOR_DEMO_MODE } from '@vendor-demo';
import type { AuthorizedFetch } from './setupTransport.ts';
import type { VendorSession } from './seller.ts';

/**
 * Reasons that are not sign-in refusals need their own wording: a seat that was
 * revoked this morning is not a failed sign-in, and telling a vendor to try
 * again would be wrong.
 */
function refusalMessage(refusal: string): string {
  if (refusal === 'wrong-person') return 'That seat belongs to someone else.';
  if (refusal === 'seat-not-granting') return 'Your seat here is not active. Ask an owner to reinstate it.';
  if (refusal === 'seller-closed') return 'This business is closed.';
  if (refusal === 'invite-expired') return 'Your invite expired. Ask an owner to send a new one.';
  if (refusal === 'wrong-seller') return 'That seat does not belong to this business.';
  return vendorAuthMessage(refusal as never);
}

interface AuthGateProps {
  transport: AuthTransport;
  /**
   * The console is handed a call that already carries the session, never the
   * token itself, so nothing behind the gate is in a position to copy the
   * credential somewhere it would outlive the tab.
   */
  children: (session: VendorSession, signOut: () => void, authorizedFetch: AuthorizedFetch) => ReactNode;
}

/**
 * Nothing renders behind this. The console is only reachable with a session
 * that a token proved and the seat's own rules allowed, so no screen inside has
 * to ask whether the viewer is real.
 */
export function AuthGate({ transport, children }: AuthGateProps) {
  const auth = useVendorAuth(transport);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const { code: codeRules, steps } = vendorAuthContract();
  const step = steps.find((item) => item.id === auth.step);

  if (auth.session) return <>{children(auth.session, () => void auth.signOut(), auth.authorizedFetch)}</>;

  return (
    <div className="vendor-shell">
      <header className="vendor-header">
        <p className="vendor-eyebrow">Bytspot vendor{VENDOR_DEMO_MODE ? ' · demo build' : ''}</p>
        <h1>{step?.title ?? 'Sign in'}</h1>
        {VENDOR_DEMO_MODE ? (
          <p className="vendor-muted">
            No API attached. Any email and any {codeRules.length}-digit code signs in; use 000000 to see a refusal.
          </p>
        ) : null}
      </header>

      <main className="vendor-main">
        {auth.step === 'email' ? (
          <form
            className="vendor-card"
            onSubmit={(event) => {
              event.preventDefault();
              void auth.requestCode(email);
            }}
          >
            <label className="vendor-field">
              <span>Work email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@yourbusiness.com"
              />
            </label>
            <p className="vendor-muted vendor-question">
              We send a {codeRules.length}-digit code instead of asking for a password. A console that stores no
              password cannot leak one.
            </p>
            <button type="submit" className="vendor-chip vendor-chip-on" disabled={auth.busy || !isPlausibleEmail(email)}>
              {auth.busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : null}

        {auth.step === 'code' ? (
          <form
            className="vendor-card"
            onSubmit={(event) => {
              event.preventDefault();
              void auth.submitCode(code);
            }}
          >
            <label className="vendor-field">
              <span>{codeRules.length}-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={codeRules.length}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <p className="vendor-muted">
              Sent to {email}. It expires in {Math.round(codeRules.ttlSecs / 60)} minutes and works once.
            </p>
            <div className="vendor-demand-actions">
              <button type="submit" className="vendor-chip vendor-chip-on" disabled={auth.busy || !isWellFormedCode(code)}>
                {auth.busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="vendor-chip"
                disabled={auth.resendAfterSecs > 0 || auth.busy}
                onClick={() => void auth.requestCode(email)}
              >
                {auth.resendAfterSecs > 0 ? `Resend in ${auth.resendAfterSecs}s` : 'Resend'}
              </button>
            </div>
          </form>
        ) : null}

        {auth.step === 'seat' ? (
          <section>
            <h2 className="vendor-section-title">Which business?</h2>
            <ul className="vendor-demand-list">
              {auth.memberships.map((membership) => (
                <li key={membership.seller.id} className="vendor-card">
                  <div className="vendor-card-top">
                    <strong>{membership.seller.legalName}</strong>
                    <span className="vendor-muted">{membership.seller.state}</span>
                  </div>
                  <p className="vendor-muted">{staffRoleLabel(membership.seat.role)}</p>
                  <button
                    type="button"
                    className="vendor-chip vendor-chip-on"
                    onClick={() => auth.chooseSeller(membership.seller.id)}
                  >
                    Open console
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {auth.refusal ? <p className="vendor-muted vendor-reason-fixable">{refusalMessage(auth.refusal)}</p> : null}

        {auth.principal ? (
          <button type="button" className="vendor-chip" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        ) : null}
      </main>
    </div>
  );
}
