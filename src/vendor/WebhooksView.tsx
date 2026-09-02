import { useMemo, useRef, useState } from 'react';
import {
  grantableScopes,
  moveEndpoint,
  registerEndpoint,
  webhookUrlRefusal,
  type DrainReport,
  type RegisterRefusal,
  type WebhookEndpoint,
} from './webhookWorker.ts';
import { VENDOR_WEBHOOKS } from './webhooks.ts';
import { vendorWebhookUiContract } from './vendorConsole.ts';
import type { VendorSession } from './seller.ts';

const REFUSALS: Record<RegisterRefusal, string> = {
  forbidden: 'This seat cannot subscribe to those events.',
  'insecure-url': 'The URL must be https and carry no credentials.',
  'unroutable-url': 'That address only resolves inside a private network.',
  'unknown-scope': 'Unknown event group.',
  'no-scopes': 'Choose at least one event group.',
  'duplicate-url': 'That URL is already registered.',
};

/** Stands in until endpoints come from the API. */
const SEED: WebhookEndpoint[] = [];

/**
 * A one-shot reveal. The secret is rendered from state that is cleared as soon
 * as it is dismissed, and it is never written to storage or into the endpoint
 * record, which is why rotation is the only way to see one again.
 */
function SecretReveal({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  return (
    <section className="vendor-card">
      <h2 className="vendor-section-title">Copy this now</h2>
      <p className="vendor-muted">
        This is the only time it is shown. Sign every incoming request with it and compare against{' '}
        <code>{VENDOR_WEBHOOKS.transport.signatureHeader}</code>.
      </p>
      <code className="vendor-secret">{secret}</code>
      <button type="button" className="vendor-chip vendor-chip-on" onClick={onDismiss}>
        I have saved it
      </button>
    </section>
  );
}

interface WebhooksViewProps {
  session: VendorSession;
  /**
   * Delivery happens server-side, so the console is shown the last pass rather
   * than running one. A browser cannot be the sender: a receiver will not send
   * CORS headers for our origin, and connect-src would have to allow every URL
   * a vendor ever types, which is the opposite of a useful CSP.
   */
  lastPass?: DrainReport;
}

export function WebhooksView({ session, lastPass }: WebhooksViewProps) {
  const [endpoints, setEndpoints] = useState(SEED);
  const [url, setUrl] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [refusal, setRefusal] = useState('');
  const [revealed, setRevealed] = useState<string | undefined>(undefined);

  const grantable = useMemo(() => new Set(grantableScopes(session)), [session]);
  const ui = vendorWebhookUiContract();

  /**
   * A freshly minted secret, held outside React state and only until it is
   * dismissed. A ref is not captured in a devtools snapshot and never becomes a
   * DOM attribute, and nothing here writes it to storage.
   */
  const pendingSecret = useRef<string | undefined>(undefined);

  const toggleScope = (scope: string) =>
    setScopes((current) => (current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]));

  const add = () => {
    const verdict = registerEndpoint(session, { id: `whe_${endpoints.length + 1}`, url, scopes }, endpoints);
    if (!verdict.ok) {
      setRefusal(REFUSALS[verdict.reason]);
      return;
    }
    const secret = mintSecret();
    pendingSecret.current = secret;
    setEndpoints((current) => [...current, verdict.endpoint]);
    setRevealed(secret);
    setRefusal('');
    setUrl('');
    setScopes([]);
  };

  const dismissSecret = () => {
    pendingSecret.current = undefined;
    setRevealed(undefined);
  };

  const move = (endpoint: WebhookEndpoint, operation: 'PAUSE' | 'RESUME' | 'ROTATE') => {
    const verdict = moveEndpoint(session, endpoint, operation);
    if (!verdict.ok) {
      setRefusal(verdict.reason === 'forbidden' ? REFUSALS.forbidden : 'That endpoint is not in a state for this.');
      return;
    }
    if (operation === 'ROTATE') {
      const secret = mintSecret();
      pendingSecret.current = secret;
      setRevealed(secret);
    }
    setRefusal('');
    setEndpoints((current) => current.map((item) => (item.id === endpoint.id ? verdict.endpoint : item)));
  };

  const urlProblem = url ? webhookUrlRefusal(url) : null;

  return (
    <>
      {revealed ? <SecretReveal secret={revealed} onDismiss={dismissSecret} /> : null}

      <section className="vendor-card">
        <h2 className="vendor-section-title">Add an endpoint</h2>
        <label className="vendor-field">
          <span>Receiver URL</span>
          <input
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://your-system.example.com/bytspot"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {urlProblem ? <p className="vendor-muted vendor-reason-fixable">{REFUSALS[urlProblem]}</p> : null}

        <p className="vendor-muted vendor-question">
          You can only subscribe to what your seat can already do, so this list is shorter than the full set of events.
        </p>
        <div className="vendor-demand-actions">
          {VENDOR_WEBHOOKS.scopes.map((scope) => {
            const allowed = grantable.has(scope.id);
            return (
              <button
                key={scope.id}
                type="button"
                className={scopes.includes(scope.id) ? 'vendor-chip vendor-chip-on' : 'vendor-chip'}
                disabled={!allowed}
                title={allowed ? scope.events.join(', ') : `Needs ${scope.requiresCapability}`}
                onClick={() => toggleScope(scope.id)}
              >
                {scope.id} ({scope.events.length})
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="vendor-chip vendor-chip-on"
          disabled={!url || Boolean(urlProblem) || scopes.length === 0}
          onClick={add}
        >
          Add endpoint
        </button>
        {refusal ? <p className="vendor-muted vendor-reason-fixable">{refusal}</p> : null}
      </section>

      <section>
        <h2 className="vendor-section-title">Endpoints ({endpoints.length})</h2>
        {lastPass ? (
          <p className="vendor-muted">
            Last pass: {lastPass.delivered} delivered, {lastPass.retried} retrying, {lastPass.exhausted} gave up
            {lastPass.disabled.length ? `, ${lastPass.disabled.length} disabled` : ''}.
          </p>
        ) : (
          <p className="vendor-muted">No deliveries yet.</p>
        )}
        <p className="vendor-muted vendor-question">
          Deliveries are sent by the server, retried on a fixed backoff of{' '}
          {VENDOR_WEBHOOKS.retry.backoffSecs.length} attempts, and an endpoint that fails{' '}
          {VENDOR_WEBHOOKS.retry.disableAfterConsecutiveFailures} times in a row is disabled.
        </p>
        <ul className="vendor-demand-list">
          {endpoints.map((endpoint) => (
            <li key={endpoint.id} className="vendor-card">
              <div className="vendor-card-top">
                <strong>{endpoint.url}</strong>
                <span className="vendor-muted">{endpoint.state}</span>
              </div>
              <p className="vendor-muted">{endpoint.scopes.join(' · ')}</p>
              {endpoint.state === 'DISABLED' ? (
                <p className="vendor-question">
                  Disabled after {endpoint.consecutiveFailures} failures in a row. Fix the receiver, then resume.
                </p>
              ) : null}
              <div className="vendor-demand-actions">
                {ui.operations
                  .filter((operation) => operation.id !== 'REGISTER')
                  .filter((operation) => moveEndpoint(session, endpoint, operation.id as 'PAUSE').ok)
                  .map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      className="vendor-chip"
                      onClick={() => move(endpoint, operation.id as 'PAUSE')}
                    >
                      {operation.label}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * Placeholder until the API mints these. The real secret is generated where the
 * sender runs and travels through the browser exactly once, on this screen,
 * which is what the one-shot reveal is for.
 */
function mintSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
