import webhookContract from '../../contracts/vendor-webhooks.json' with { type: 'json' };
import {
  getBookableAvailability,
  getAvailabilityOperation,
  getBookableCatalog,
  getBookableDemand,
  getBookableLocations,
  staffRoleCan,
  type BookableAvailabilityOperationId,
  type BookableCapabilityId,
  type BookableDemandOperationId,
  type BookableStaffRoleId,
} from '../utils/bookableTemplates.ts';

export type VendorWebhookSource = 'sku' | 'slot' | 'demand' | 'location';

export interface VendorWebhookOutboundEvent {
  id: string;
  source: VendorWebhookSource;
  state: string;
  summary: string;
}

export interface VendorWebhookInboundEvent {
  id: string;
  operation: BookableAvailabilityOperationId | BookableDemandOperationId;
  machine: 'availability' | 'demand';
  summary: string;
}

export interface VendorWebhookScope {
  id: string;
  requiresCapability: BookableCapabilityId;
  events: string[];
}

export interface VendorWebhookContract {
  id: string;
  version: number;
  transport: {
    method: string;
    contentType: string;
    signatureHeader: string;
    timestampHeader: string;
    eventIdHeader: string;
    signatureScheme: string;
    signedPayloadFormat: string;
    signaturePrefix: string;
    toleranceSecs: number;
    delivery: string;
    maxBodyBytes: number;
  };
  retry: {
    maxAttempts: number;
    backoffSecs: number[];
    retryOnStatus: number[];
    successStatus: number[];
    disableAfterConsecutiveFailures: number;
  };
  outbound: VendorWebhookOutboundEvent[];
  inbound: VendorWebhookInboundEvent[];
  scopes: VendorWebhookScope[];
}

export const VENDOR_WEBHOOKS = webhookContract as unknown as VendorWebhookContract;

/** The envelope every delivery carries. Small on purpose. */
export interface VendorWebhookEnvelope<T = Record<string, unknown>> {
  eventId: string;
  event: string;
  version: number;
  occurredAt: string;
  sellerId: string;
  data: T;
}

export function listOutboundEvents(): VendorWebhookOutboundEvent[] {
  return VENDOR_WEBHOOKS.outbound;
}

export function listInboundEvents(): VendorWebhookInboundEvent[] {
  return VENDOR_WEBHOOKS.inbound;
}

export function outboundEvent(id: string): VendorWebhookOutboundEvent | undefined {
  return VENDOR_WEBHOOKS.outbound.find((event) => event.id === id);
}

export function inboundEvent(id: string): VendorWebhookInboundEvent | undefined {
  return VENDOR_WEBHOOKS.inbound.find((event) => event.id === id);
}

/**
 * A scope is a property of the endpoint, not of the event, so a door seat
 * cannot subscribe an endpoint to bookings or payouts.
 */
export function scopesForRole(role: BookableStaffRoleId): VendorWebhookScope[] {
  return VENDOR_WEBHOOKS.scopes.filter((scope) => staffRoleCan(role, scope.requiresCapability));
}

export function eventsForRole(role: BookableStaffRoleId): string[] {
  return [...new Set(scopesForRole(role).flatMap((scope) => scope.events))];
}

export function canSubscribeToEvent(role: BookableStaffRoleId, eventId: string): boolean {
  return eventsForRole(role).includes(eventId);
}

export function buildEnvelope<T extends Record<string, unknown>>(options: {
  eventId: string;
  event: string;
  sellerId: string;
  data: T;
  occurredAt?: Date;
}): VendorWebhookEnvelope<T> {
  return {
    eventId: options.eventId,
    event: options.event,
    version: VENDOR_WEBHOOKS.version,
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    sellerId: options.sellerId,
    data: options.data,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The signed payload is timestamp-bound so a captured body cannot be replayed later. */
export function signedPayload(timestampSecs: number, body: string): string {
  return VENDOR_WEBHOOKS.transport.signedPayloadFormat
    .replace('{timestamp}', String(timestampSecs))
    .replace('{body}', body);
}

/**
 * HMAC-SHA256 over "{timestamp}.{body}". The secret is passed in and never
 * logged, returned, or embedded in the envelope.
 */
export async function signWebhook(secret: string, timestampSecs: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload(timestampSecs, body)));
  return `${VENDOR_WEBHOOKS.transport.signaturePrefix}${toHex(mac)}`;
}

/** Length-independent compare, so a mismatch leaks no position information. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export type WebhookVerdict =
  | { ok: true }
  | { ok: false; reason: 'body-too-large' | 'stale-timestamp' | 'bad-signature' | 'malformed' };

/**
 * Verification is three checks in a fixed order: size, freshness, then
 * signature. Freshness comes before the signature so a replayed body cannot be
 * accepted just because it was validly signed at the time.
 */
export async function verifyWebhook(options: {
  secret: string;
  body: string;
  signature: string;
  timestampSecs: number;
  nowSecs?: number;
}): Promise<WebhookVerdict> {
  const { transport } = VENDOR_WEBHOOKS;
  const now = options.nowSecs ?? Math.floor(Date.now() / 1000);

  if (new TextEncoder().encode(options.body).byteLength > transport.maxBodyBytes) {
    return { ok: false, reason: 'body-too-large' };
  }
  if (!Number.isFinite(options.timestampSecs) || !options.signature.startsWith(transport.signaturePrefix)) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(now - options.timestampSecs) > transport.toleranceSecs) {
    return { ok: false, reason: 'stale-timestamp' };
  }

  const expected = await signWebhook(options.secret, options.timestampSecs, options.body);
  return constantTimeEqual(expected, options.signature) ? { ok: true } : { ok: false, reason: 'bad-signature' };
}

/**
 * Delivery is at-least-once, so the event id is the dedupe key and the receiver
 * is expected to be idempotent. A retry reuses the id; a new event never does.
 */
export function isDuplicateDelivery(seenEventIds: Set<string>, eventId: string): boolean {
  return seenEventIds.has(eventId);
}

export function shouldRetry(status: number, attempt: number): boolean {
  const { retry } = VENDOR_WEBHOOKS;
  if (attempt >= retry.maxAttempts) return false;
  return retry.retryOnStatus.includes(status);
}

/** null once the schedule is exhausted, which is how a dead endpoint stops. */
export function retryDelaySecs(attempt: number): number | null {
  return VENDOR_WEBHOOKS.retry.backoffSecs[attempt] ?? null;
}

export function isDeliverySuccess(status: number): boolean {
  return VENDOR_WEBHOOKS.retry.successStatus.includes(status);
}

export function shouldDisableEndpoint(consecutiveFailures: number): boolean {
  return consecutiveFailures >= VENDOR_WEBHOOKS.retry.disableAfterConsecutiveFailures;
}

/**
 * Every event must name a state the ontology actually has, and every inbound
 * event must map onto an operation that already exists. Checked at build time
 * rather than trusted, because a webhook for a state nobody can reach is a
 * promise to a vendor we would never keep.
 */
export function assertVendorWebhookContract(
  input: VendorWebhookContract = VENDOR_WEBHOOKS,
): string[] {
  const errors: string[] = [];
  const states: Record<VendorWebhookSource, string[]> = {
    sku: getBookableCatalog().skuStates,
    slot: getBookableAvailability().slotStates,
    demand: getBookableDemand().states,
    location: getBookableLocations().states,
  };

  const seenOutbound = new Set<string>();
  for (const event of input.outbound) {
    if (seenOutbound.has(event.id)) errors.push(`duplicate outbound event ${event.id}`);
    seenOutbound.add(event.id);
    const machine = states[event.source];
    if (!machine) errors.push(`outbound event ${event.id} names unknown source ${event.source}`);
    else if (!machine.includes(event.state)) {
      errors.push(`outbound event ${event.id} reports ${event.state}, which is not a ${event.source} state`);
    }
    if (!event.summary.trim()) errors.push(`outbound event ${event.id} needs a summary a vendor can read`);
  }

  const availabilityOperations = new Set(getBookableAvailability().operations.map((item) => item.id));
  const demandOperations = new Set(getBookableDemand().operations.map((item) => item.id));
  const seenInbound = new Set<string>();
  for (const event of input.inbound) {
    if (seenInbound.has(event.id)) errors.push(`duplicate inbound event ${event.id}`);
    seenInbound.add(event.id);
    const known =
      event.machine === 'availability'
        ? availabilityOperations.has(event.operation as BookableAvailabilityOperationId)
        : demandOperations.has(event.operation as BookableDemandOperationId);
    if (!known) {
      errors.push(`inbound event ${event.id} maps to ${event.operation}, which is not a ${event.machine} operation`);
    }
  }

  const declaredEvents = new Set(input.outbound.map((event) => event.id));
  const scopedEvents = new Set<string>();
  for (const scope of input.scopes) {
    for (const event of scope.events) {
      if (!declaredEvents.has(event)) errors.push(`scope ${scope.id} names undeclared event ${event}`);
      // Two scopes for one event would make the capability check ambiguous.
      if (scopedEvents.has(event)) errors.push(`event ${event} appears in more than one scope`);
      scopedEvents.add(event);
    }
  }
  for (const event of declaredEvents) {
    // An unscoped event has no capability gate, so it would leak to any seat.
    if (!scopedEvents.has(event)) errors.push(`outbound event ${event} is not covered by any scope`);
  }

  const { transport, retry } = input;
  if (transport.signatureScheme !== 'HMAC-SHA256') errors.push('the signature scheme must stay HMAC-SHA256');
  if (!transport.signedPayloadFormat.includes('{timestamp}')) {
    errors.push('the signed payload must bind the timestamp or a captured body can be replayed');
  }
  if (!transport.signedPayloadFormat.includes('{body}')) errors.push('the signed payload must cover the body');
  if (transport.toleranceSecs < 1) errors.push('the timestamp tolerance must be positive');
  if (transport.delivery !== 'at-least-once') errors.push('delivery must stay at-least-once so the event id is a dedupe key');
  if (retry.backoffSecs.length !== retry.maxAttempts) {
    errors.push('the backoff schedule must have one entry per attempt');
  }
  for (let index = 1; index < retry.backoffSecs.length; index += 1) {
    if (retry.backoffSecs[index] <= retry.backoffSecs[index - 1]) errors.push('the backoff schedule must increase');
  }
  if (retry.successStatus.some((status) => retry.retryOnStatus.includes(status))) {
    errors.push('a status cannot be both success and retryable');
  }
  return errors;
}

export type InboundVerdict =
  | { ok: true; operation: BookableAvailabilityOperationId | BookableDemandOperationId }
  | { ok: false; reason: 'unknown-event' | 'unknown-operation' | 'forbidden' | 'illegal-state' };

/**
 * The inbound half is narrow by design: it can only reach operations the
 * ontology already defines, and it runs the same capability and state checks the
 * console does, so an integration can never do more than the seat behind it.
 */
export function authorizeInbound(options: {
  eventId: string;
  role: BookableStaffRoleId;
  state: string;
}): InboundVerdict {
  const event = inboundEvent(options.eventId);
  if (!event) return { ok: false, reason: 'unknown-event' };

  if (event.machine === 'availability') {
    const operation = getAvailabilityOperation(event.operation as BookableAvailabilityOperationId);
    if (!operation) return { ok: false, reason: 'unknown-operation' };
    if (!staffRoleCan(options.role, operation.requiresCapability)) return { ok: false, reason: 'forbidden' };
    if (!operation.from.includes(options.state as never)) return { ok: false, reason: 'illegal-state' };
    return { ok: true, operation: operation.id };
  }

  const operation = getBookableDemand().operations.find((item) => item.id === event.operation);
  if (!operation) return { ok: false, reason: 'unknown-operation' };
  if (!staffRoleCan(options.role, operation.requiresCapability)) return { ok: false, reason: 'forbidden' };
  if (!operation.from.includes(options.state as never)) return { ok: false, reason: 'illegal-state' };
  return { ok: true, operation: operation.id };
}
