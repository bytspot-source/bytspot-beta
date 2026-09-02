import {
  isDeliverySuccess,
  retryDelaySecs,
  shouldDisableEndpoint,
  shouldRetry,
  signWebhook,
  VENDOR_WEBHOOKS,
  type VendorWebhookEnvelope,
} from './webhooks.ts';
import { openSession, sessionCan, type Seat, type Seller, type VendorSession } from './seller.ts';
import { vendorWebhookUiContract, type VendorWebhookUiOperationId } from './vendorConsole.ts';

export type EndpointState = 'ACTIVE' | 'PAUSED' | 'DISABLED';

/**
 * A registered receiver. It carries the seat that created it rather than a
 * standalone permission list, so a revoked seat silences its endpoints without
 * anyone remembering to go and delete them.
 */
export interface WebhookEndpoint {
  id: string;
  sellerId: string;
  seatId: string;
  url: string;
  scopes: string[];
  state: EndpointState;
  consecutiveFailures: number;
}

/** Resolves an endpoint's signing secret at send time. Never held in queue state. */
export type SecretResolver = (endpointId: string) => Promise<string | null>;

/** Scopes this session may put on an endpoint: it cannot subscribe past itself. */
export function grantableScopes(session: VendorSession): string[] {
  return VENDOR_WEBHOOKS.scopes
    .filter((scope) => sessionCan(session, scope.requiresCapability))
    .map((scope) => scope.id);
}

export type RegisterRefusal =
  | 'forbidden'
  | 'insecure-url'
  | 'unroutable-url'
  | 'unknown-scope'
  | 'no-scopes'
  | 'duplicate-url';

export type RegisterVerdict =
  | { ok: true; endpoint: WebhookEndpoint; reason?: never }
  | { ok: false; reason: RegisterRefusal };

const PRIVATE_HOST =
  /^(localhost$|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

/**
 * A receiver we will POST to on a schedule is a request our own infrastructure
 * makes, so an address that only resolves inside our network is refused: that is
 * the shape of a server-side request forgery.
 */
export function webhookUrlRefusal(url: string): RegisterRefusal | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'insecure-url';
  }
  if (parsed.protocol !== `${vendorWebhookUiContract().urlScheme}:`) return 'insecure-url';
  if (PRIVATE_HOST.test(parsed.hostname)) return 'unroutable-url';
  // Credentials in the URL would be logged with every delivery attempt.
  if (parsed.username || parsed.password) return 'insecure-url';
  return null;
}

/**
 * Registration applies the same rule the worker re-applies before every send:
 * an endpoint can never carry a scope its own seat does not hold. Checking it
 * here as well means a seat cannot create a row that would silently never fire.
 */
export function registerEndpoint(
  session: VendorSession,
  request: { id: string; url: string; scopes: string[] },
  existing: WebhookEndpoint[] = [],
): RegisterVerdict {
  if (session.seat.role !== 'owner') return { ok: false, reason: 'forbidden' };

  const urlRefusal = webhookUrlRefusal(request.url);
  if (urlRefusal) return { ok: false, reason: urlRefusal };

  if (request.scopes.length === 0) return { ok: false, reason: 'no-scopes' };
  const known = new Set(VENDOR_WEBHOOKS.scopes.map((scope) => scope.id));
  if (request.scopes.some((scope) => !known.has(scope))) return { ok: false, reason: 'unknown-scope' };

  const grantable = new Set(grantableScopes(session));
  if (request.scopes.some((scope) => !grantable.has(scope))) return { ok: false, reason: 'forbidden' };

  const duplicate = existing.some(
    (endpoint) =>
      endpoint.sellerId === session.seller.id &&
      endpoint.state !== 'DISABLED' &&
      endpoint.url === request.url,
  );
  if (duplicate) return { ok: false, reason: 'duplicate-url' };

  return {
    ok: true,
    endpoint: {
      id: request.id,
      sellerId: session.seller.id,
      seatId: session.seat.id,
      url: request.url,
      scopes: [...new Set(request.scopes)],
      state: 'ACTIVE',
      consecutiveFailures: 0,
    },
  };
}

export type EndpointMoveVerdict =
  | { ok: true; endpoint: WebhookEndpoint; reason?: never }
  | { ok: false; reason: 'forbidden' | 'illegal-state' };

/**
 * Resuming clears the failure count, because otherwise an endpoint disabled by
 * a bad afternoon would be disabled again by the next single failure.
 */
export function moveEndpoint(
  session: VendorSession,
  endpoint: WebhookEndpoint,
  operation: Exclude<VendorWebhookUiOperationId, 'REGISTER'>,
): EndpointMoveVerdict {
  if (session.seat.role !== 'owner') return { ok: false, reason: 'forbidden' };
  if (endpoint.sellerId !== session.seller.id) return { ok: false, reason: 'forbidden' };

  const move = vendorWebhookUiContract().operations.find((item) => item.id === operation);
  if (!move) return { ok: false, reason: 'forbidden' };
  if (!move.from.includes(endpoint.state)) return { ok: false, reason: 'illegal-state' };

  const state = move.to as EndpointState;
  return {
    ok: true,
    endpoint: {
      ...endpoint,
      state,
      consecutiveFailures: state === 'ACTIVE' ? 0 : endpoint.consecutiveFailures,
      // Rotation reassigns the endpoint to the seat that rotated it, so the
      // entitlement check tracks whoever currently owns the credential.
      seatId: operation === 'ROTATE' ? session.seat.id : endpoint.seatId,
    },
  };
}

export interface TransportRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** Injected so the worker is testable without a network, and swappable in a VM. */
export type Transport = (request: TransportRequest) => Promise<{ status: number }>;

export interface DeliveryAttempt {
  id: string;
  endpointId: string;
  eventId: string;
  event: string;
  body: string;
  attempt: number;
  nextAttemptAtSecs: number;
}

export type DeliveryOutcome =
  | { kind: 'delivered'; status: number }
  | { kind: 'retry'; status: number; nextAttemptAtSecs: number; attempt: number }
  | { kind: 'exhausted'; status: number }
  | { kind: 'dropped'; reason: 'no-secret' | 'endpoint-inactive' | 'body-too-large' | 'transport-error' };

export interface WorkerClock {
  nowSecs: () => number;
}

/**
 * Which endpoints an event is owed to. Three filters, and each one is a real
 * boundary: the event never leaves its own seller, an endpoint only carries what
 * its scopes name, and a paused or disabled endpoint receives nothing.
 */
export function routeEvent(
  endpoints: WebhookEndpoint[],
  envelope: VendorWebhookEnvelope,
): WebhookEndpoint[] {
  const scopesByEvent = new Map<string, string[]>();
  for (const scope of VENDOR_WEBHOOKS.scopes) {
    for (const event of scope.events) {
      scopesByEvent.set(event, [...(scopesByEvent.get(event) ?? []), scope.id]);
    }
  }
  const carrying = scopesByEvent.get(envelope.event) ?? [];
  if (carrying.length === 0) return [];

  return endpoints.filter(
    (endpoint) =>
      endpoint.sellerId === envelope.sellerId &&
      endpoint.state === 'ACTIVE' &&
      endpoint.scopes.some((scope) => carrying.includes(scope)),
  );
}

/**
 * An endpoint is only as entitled as the seat behind it, re-checked at send time
 * rather than at creation. Suspending the business or revoking the seat stops
 * delivery on the very next event, with no endpoint record touched.
 */
export function endpointStillEntitled(
  endpoint: WebhookEndpoint,
  seller: Seller,
  seat: Seat | undefined,
  now: Date,
): boolean {
  if (!seat || seat.id !== endpoint.seatId) return false;
  const session = openSession(seller, seat, now);
  if (!session.ok) return false;
  // The session's effective capabilities, not the raw role, so suspending the
  // business stops a bookings endpoint even though the seat is still an owner.
  // This is the same set registration is checked against, on purpose.
  const allowed = new Set(grantableScopes(session.session));
  return endpoint.scopes.every((scope) => allowed.has(scope));
}

export function scheduleFirstAttempt(
  endpoint: WebhookEndpoint,
  envelope: VendorWebhookEnvelope,
  nowSecs: number,
): DeliveryAttempt {
  return {
    id: `${endpoint.id}:${envelope.eventId}`,
    endpointId: endpoint.id,
    eventId: envelope.eventId,
    event: envelope.event,
    body: JSON.stringify(envelope),
    attempt: 0,
    nextAttemptAtSecs: nowSecs + (retryDelaySecs(0) ?? 0),
  };
}

/** Attempts whose backoff has elapsed. Nothing is sent before it is due. */
export function dueAttempts(queue: DeliveryAttempt[], nowSecs: number): DeliveryAttempt[] {
  return queue.filter((item) => item.nextAttemptAtSecs <= nowSecs);
}

/**
 * One attempt. The signature is computed here and the secret is never returned,
 * logged or written into the attempt record, so a persisted queue holds nothing
 * worth stealing.
 */
export async function deliverOnce(options: {
  endpoint: WebhookEndpoint;
  attempt: DeliveryAttempt;
  secrets: SecretResolver;
  transport: Transport;
  clock: WorkerClock;
}): Promise<DeliveryOutcome> {
  const { endpoint, attempt, transport, clock } = options;
  const { transport: wire } = VENDOR_WEBHOOKS;

  if (endpoint.state !== 'ACTIVE') return { kind: 'dropped', reason: 'endpoint-inactive' };
  if (new TextEncoder().encode(attempt.body).byteLength > wire.maxBodyBytes) {
    return { kind: 'dropped', reason: 'body-too-large' };
  }

  const secret = await options.secrets(endpoint.id);
  if (!secret) return { kind: 'dropped', reason: 'no-secret' };

  const sentAtSecs = clock.nowSecs();
  const signature = await signWebhook(secret, sentAtSecs, attempt.body);

  let status: number;
  try {
    ({ status } = await transport({
      url: endpoint.url,
      body: attempt.body,
      headers: {
        'Content-Type': wire.contentType,
        [wire.signatureHeader]: signature,
        [wire.timestampHeader]: String(sentAtSecs),
        [wire.eventIdHeader]: attempt.eventId,
      },
    }));
  } catch {
    // A refused connection is retried on the same schedule as a 503.
    status = 503;
  }

  if (isDeliverySuccess(status)) return { kind: 'delivered', status };

  const next = attempt.attempt + 1;
  if (!shouldRetry(status, next)) return { kind: 'exhausted', status };
  const delay = retryDelaySecs(next);
  if (delay === null) return { kind: 'exhausted', status };
  return { kind: 'retry', status, attempt: next, nextAttemptAtSecs: sentAtSecs + delay };
}

/**
 * A success clears the failure count, so an endpoint that recovers is not
 * disabled by history. A run of failures disables it, because a receiver that
 * has been down for a day is our backlog, not their problem.
 */
export function applyOutcome(
  endpoint: WebhookEndpoint,
  outcome: DeliveryOutcome,
): WebhookEndpoint {
  if (outcome.kind === 'delivered') return { ...endpoint, consecutiveFailures: 0 };
  if (outcome.kind === 'dropped') return endpoint;
  if (outcome.kind === 'retry') return endpoint;

  const consecutiveFailures = endpoint.consecutiveFailures + 1;
  return {
    ...endpoint,
    consecutiveFailures,
    state: shouldDisableEndpoint(consecutiveFailures) ? 'DISABLED' : endpoint.state,
  };
}

export interface WorkerState {
  endpoints: WebhookEndpoint[];
  queue: DeliveryAttempt[];
}

export interface DrainReport {
  delivered: number;
  retried: number;
  exhausted: number;
  dropped: number;
  disabled: string[];
}

/**
 * One pass over everything that is due. A retry goes back on the queue with its
 * next backoff, so the same event id is reused and the receiver can dedupe.
 */
export async function drainQueue(
  state: WorkerState,
  options: { secrets: SecretResolver; transport: Transport; clock: WorkerClock },
): Promise<{ state: WorkerState; report: DrainReport }> {
  const nowSecs = options.clock.nowSecs();
  const report: DrainReport = { delivered: 0, retried: 0, exhausted: 0, dropped: 0, disabled: [] };

  let endpoints = state.endpoints;
  const remaining: DeliveryAttempt[] = [];

  for (const attempt of state.queue) {
    if (attempt.nextAttemptAtSecs > nowSecs) {
      remaining.push(attempt);
      continue;
    }
    const endpoint = endpoints.find((item) => item.id === attempt.endpointId);
    if (!endpoint) {
      report.dropped += 1;
      continue;
    }

    const outcome = await deliverOnce({ endpoint, attempt, ...options });
    const updated = applyOutcome(endpoint, outcome);
    if (updated !== endpoint) {
      endpoints = endpoints.map((item) => (item.id === endpoint.id ? updated : item));
      if (updated.state === 'DISABLED' && endpoint.state !== 'DISABLED') report.disabled.push(endpoint.id);
    }

    if (outcome.kind === 'delivered') report.delivered += 1;
    else if (outcome.kind === 'exhausted') report.exhausted += 1;
    else if (outcome.kind === 'dropped') report.dropped += 1;
    else {
      report.retried += 1;
      remaining.push({ ...attempt, attempt: outcome.attempt, nextAttemptAtSecs: outcome.nextAttemptAtSecs });
    }
  }

  return { state: { endpoints, queue: remaining }, report };
}

/**
 * Fan an event out to every endpoint that is owed it and still entitled to it.
 * Entitlement is re-derived from the seat here rather than trusted from the
 * endpoint record, which is what makes seat revocation take effect immediately.
 */
export function enqueueEvent(
  state: WorkerState,
  envelope: VendorWebhookEnvelope,
  context: { seller: Seller; seats: Seat[]; nowSecs: number },
): WorkerState {
  const now = new Date(context.nowSecs * 1000);
  const targets = routeEvent(state.endpoints, envelope).filter((endpoint) =>
    endpointStillEntitled(
      endpoint,
      context.seller,
      context.seats.find((seat) => seat.id === endpoint.seatId),
      now,
    ),
  );

  const queued = new Set(state.queue.map((item) => item.id));
  const additions = targets
    .map((endpoint) => scheduleFirstAttempt(endpoint, envelope, context.nowSecs))
    // At-least-once is about retries, not about queueing the same event twice.
    .filter((attempt) => !queued.has(attempt.id));

  return { ...state, queue: [...state.queue, ...additions] };
}
