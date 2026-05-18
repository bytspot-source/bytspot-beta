export const VIRTUAL_PATCH_CONTEXT_KEY = 'bytspot_virtual_patch_context';

export type VirtualPatchScanMethod = 'qr' | 'nfc';

/**
 * Vendor observation surface — EO 14365 / FCC uniform reporting readiness.
 *
 * Stored alongside every verified scan so that Bytspot can demonstrate the
 * record is **observational** about an operational moment, not an automated
 * decision about a person. The `decidesService: false` literal is a type-level
 * invariant: any code that consumes this record cannot accidentally treat it
 * as a service-denial signal without explicitly typing around the constraint.
 */
export interface VirtualPatchVendorObservation {
  /** Per-vendor numeric score, vendor-private, never cross-vendor pooled. */
  score: number;
  /** Feature vector that produced the score. Stored for explainability. */
  inputs: Record<string, number>;
  /** Per-feature weights at the time this observation was computed. */
  weights: Record<string, number>;
  /** Plain-English explanation surfaceable to the customer on request. */
  explanation: string;
  /** Type-level invariant: this record never decides service. Staff decide. */
  decidesService: false;
}

export interface VirtualPatchScanVerification {
  method: VirtualPatchScanMethod;
  rawValue: string;
  patchId: string;
  uid: string | null;
  tokenJti: string;
  verifiedAt: string;
  binding: { type: string; id: string } | null;
  /** Tenant isolation — which vendor's patch was tapped (NIST PR.AC-1). */
  vendorId?: string | null;
  /**
   * Per-vendor key signature returned by the verification API. Lets the
   * scanner confirm this token came from the expected tenant before it is
   * surfaced to the wallet (NIST PR.AC tenant boundary).
   */
  vendorKeySig?: string | null;
  /** Optional vendor observation record — see {@link VirtualPatchVendorObservation}. */
  vendorObservation?: VirtualPatchVendorObservation;
}

export type VirtualPatchServiceRequestKind = 'venue-service' | 'vendor-request' | 'booking' | 'check-in' | 'call';

export interface VirtualPatchSavedServiceRequest {
  id: string;
  kind: VirtualPatchServiceRequestKind;
  vendorId?: string | null;
  vendorName: string;
  vendorCategory?: string | null;
  vendorPhoto?: string | null;
  serviceName: string;
  actionLabel: string;
  status: 'requested' | 'booked' | 'check-in' | 'called';
  requestedAt: string;
  venueId?: string | null;
  venueName?: string | null;
  source?: string | null;
  rating?: string | null;
  distance?: string | null;
  eta?: string | null;
  availability?: string | null;
  signedIn?: boolean;
  booking?: {
    time?: string;
    partySize?: string;
    contactMethod?: string;
  };
}

export interface VirtualPatchContext {
  source?: string;
  mode?: string;
  initiatedAt?: string;
  venueId?: string | null;
  venueName?: string | null;
  patchId?: string | null;
  distanceMeters?: number | null;
  capabilities?: { qr?: boolean; nfc?: boolean };
  scan?: {
    type?: VirtualPatchScanMethod;
    rawValue?: string;
    uid?: string | null;
    tokenJti?: string;
    verifiedAt?: string;
    binding?: { type: string; id: string } | null;
    vendorId?: string | null;
    vendorKeySig?: string | null;
    vendorObservation?: VirtualPatchVendorObservation;
  };
  serviceRequests?: VirtualPatchSavedServiceRequest[];
}

export interface ParsedVirtualPatchPayload {
  rawValue: string;
  patchId: string | null;
  uid: string | null;
  readCounter: number | null;
  token: string | null;
  customerId: string | null;
}

interface NativeNdefRecordLike {
  payload: number[];
  type: number[];
}

interface NativeNfcEventLike {
  tag?: {
    id?: number[];
    ndefMessage?: NativeNdefRecordLike[] | null;
  };
}

const URI_PREFIXES = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://',
  'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:', 'tftp:',
  'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
] as const;

function normalizeMaybeUid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function parseMaybeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function normalizeMaybeReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidTagId(slug: string | undefined): slug is string {
  if (!slug) return false;
  return (
    slug.length >= 8 &&
    slug.length <= 64 &&
    /^[A-Za-z0-9]/.test(slug) &&
    /^[A-Za-z0-9._-]+$/.test(slug) &&
    /[0-9]/.test(slug) &&
    slug.toUpperCase().startsWith('BYT')
  );
}

export function parseScannedPatchPayload(rawValue: string, fallbackPatchId?: string | null): ParsedVirtualPatchPayload {
  const trimmed = rawValue.trim();
  const base = { rawValue: trimmed, patchId: fallbackPatchId ?? null, uid: null, readCounter: null, token: null, customerId: null };

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return { ...base, token: trimmed };
  if (/^[0-9A-F]{14}$/i.test(trimmed)) return { ...base, uid: trimmed.toUpperCase() };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      rawValue: trimmed,
      patchId: typeof parsed.patchId === 'string' ? parsed.patchId : base.patchId,
      uid: normalizeMaybeUid(parsed.uid),
      readCounter: parseMaybeInt(parsed.readCounter),
      token: typeof parsed.token === 'string' ? parsed.token : null,
      customerId: normalizeMaybeReference(parsed.customerId ?? parsed.customer ?? parsed.c),
    };
  } catch {
    // fall through to URL parsing
  }

  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const explicitPatchFromPath = ['p', 'patch', 'verify'].includes(pathParts[0] ?? '')
      ? pathParts[1]
      : pathParts[0] === 't' && isValidTagId(pathParts[1])
        ? pathParts[1]
        : null;
    const rootPatchFromPath = pathParts.length === 1 && isValidTagId(pathParts[0]) ? pathParts[0] : null;
    const patchFromPath = explicitPatchFromPath ?? rootPatchFromPath;

    return {
      rawValue: trimmed,
      patchId: url.searchParams.get('patchId') ?? url.searchParams.get('patch') ?? patchFromPath ?? base.patchId,
      uid: normalizeMaybeUid(url.searchParams.get('uid')),
      readCounter: parseMaybeInt(url.searchParams.get('readCounter') ?? url.searchParams.get('counter')),
      token: url.searchParams.get('token') ?? url.searchParams.get('t'),
      customerId: normalizeMaybeReference(url.searchParams.get('customerId') ?? url.searchParams.get('customer') ?? url.searchParams.get('c')),
    };
  } catch {
    return base;
  }
}

export function decodeNativeNdefRecord(record: Pick<NativeNdefRecordLike, 'payload' | 'type'> | null | undefined): string | null {
  if (!record?.payload?.length) return null;

  const payload = Uint8Array.from(record.payload);
  const type = record.type?.length ? new TextDecoder('utf-8').decode(Uint8Array.from(record.type)) : '';

  if (type === 'T') {
    const languageLength = payload[0] & 0x3f;
    return new TextDecoder('utf-8').decode(payload.slice(1 + languageLength)).trim();
  }

  if (type === 'U') {
    const prefix = URI_PREFIXES[payload[0] ?? 0] ?? '';
    return `${prefix}${new TextDecoder('utf-8').decode(payload.slice(1))}`.trim();
  }

  return new TextDecoder('utf-8').decode(payload).trim();
}

function encodeNativeTagUid(id: number[] | undefined): string | null {
  if (!Array.isArray(id) || id.length === 0) return null;
  return id.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function getNativeNfcRawValue(event: NativeNfcEventLike): string | null {
  const rawFromNdef = event.tag?.ndefMessage
    ?.map((record) => decodeNativeNdefRecord(record))
    .find((value): value is string => Boolean(value?.trim()));

  return rawFromNdef ?? encodeNativeTagUid(event.tag?.id);
}

export function buildVerifiedVirtualPatchContext(
  verification: VirtualPatchScanVerification,
  options: Omit<VirtualPatchContext, 'mode' | 'scan'> = {},
): VirtualPatchContext {
  return {
    source: options.source ?? 'map',
    mode: verification.method === 'nfc' ? 'tap-verified' : 'qr-verified',
    initiatedAt: options.initiatedAt ?? new Date().toISOString(),
    venueId: options.venueId ?? null,
    venueName: options.venueName ?? null,
    patchId: options.patchId ?? verification.patchId ?? null,
    distanceMeters: options.distanceMeters ?? null,
    capabilities: options.capabilities,
    scan: {
      type: verification.method,
      rawValue: verification.rawValue,
      uid: verification.uid,
      tokenJti: verification.tokenJti,
      verifiedAt: verification.verifiedAt,
      binding: verification.binding,
      vendorId: verification.vendorId ?? null,
      vendorKeySig: verification.vendorKeySig ?? null,
      // Only include vendorObservation when actually present so the in-memory
      // shape matches what survives JSON round-trip (localStorage drops keys
      // whose values are undefined).
      ...(verification.vendorObservation !== undefined
        ? { vendorObservation: verification.vendorObservation }
        : {}),
    },
  };
}

/**
 * Audit event surface — NIST PR.PT-1 (audit/log records).
 *
 * Emitted on every verification attempt, success and failure alike. The shape
 * is intentionally serializable: the same payload can be persisted client-side
 * (offline buffer), shipped to a SIEM, or echoed to console in development
 * without transformation.
 */
export type VirtualPatchAuditOutcome = 'success' | 'failure' | 'revoked' | 'consent_denied';

export interface VirtualPatchAuditEvent {
  /** ISO-8601 timestamp of the attempt. */
  at: string;
  /** Outcome bucket — drives downstream alert thresholds. */
  outcome: VirtualPatchAuditOutcome;
  /** Scan method used. */
  method: VirtualPatchScanMethod;
  /** Vendor scope (tenant boundary). May be null until verification resolves. */
  vendorId: string | null;
  /** Patch ID if known at time of event. */
  patchId: string | null;
  /** Patch UID if known at time of event. */
  uid: string | null;
  /** Token JTI for successful verifications, null otherwise. */
  tokenJti: string | null;
  /** Venue scope. */
  venueId: string | null;
  /** Free-text reason for failure / revocation; never includes PII. */
  reason?: string;
}

export function createAuditEvent(partial: Partial<VirtualPatchAuditEvent> & { outcome: VirtualPatchAuditOutcome; method: VirtualPatchScanMethod }): VirtualPatchAuditEvent {
  return {
    at: partial.at ?? new Date().toISOString(),
    outcome: partial.outcome,
    method: partial.method,
    vendorId: partial.vendorId ?? null,
    patchId: partial.patchId ?? null,
    uid: partial.uid ?? null,
    tokenJti: partial.tokenJti ?? null,
    venueId: partial.venueId ?? null,
    reason: partial.reason,
  };
}

/**
 * Client-side revocation cache — NIST RS.MI-1 (containment).
 *
 * Source of truth lives server-side; this in-memory cache lets the scanner
 * short-circuit a network round-trip when a known-bad patch ID is tapped, and
 * gives the verification call a lightweight pre-flight to fail fast before
 * surfacing any UI state that suggests success.
 */
const revokedPatchIds = new Set<string>();

export function markPatchRevoked(patchId: string): void {
  if (patchId) revokedPatchIds.add(patchId);
}

export function isPatchRevoked(patchId: string | null | undefined): boolean {
  return Boolean(patchId && revokedPatchIds.has(patchId));
}

export function loadRevocationList(patchIds: readonly string[]): void {
  revokedPatchIds.clear();
  for (const id of patchIds) if (id) revokedPatchIds.add(id);
}

/**
 * Persist a verified virtual-patch context to localStorage so the access
 * wallet (and any tab opened from a deep-link) can render the just-verified
 * binding without re-issuing the verification call. Only sheet-level scope
 * is written — no raw GPS, no biometrics. Read with loadVirtualPatchContext.
 */
export function saveVirtualPatchContext(context: VirtualPatchContext): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(VIRTUAL_PATCH_CONTEXT_KEY, JSON.stringify(context));
    window.dispatchEvent(new CustomEvent('bytspot:virtual-patch-context-updated', { detail: context }));
  } catch {
    // Quota or sandboxed storage — best-effort persistence, never crash the scanner.
  }
}

export function loadVirtualPatchContext(): VirtualPatchContext | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(VIRTUAL_PATCH_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as VirtualPatchContext) : null;
  } catch {
    return null;
  }
}

export function appendVirtualPatchServiceRequest(
  request: Omit<VirtualPatchSavedServiceRequest, 'id' | 'requestedAt'> & Partial<Pick<VirtualPatchSavedServiceRequest, 'id' | 'requestedAt'>>,
  options: Partial<VirtualPatchContext> = {},
): VirtualPatchContext {
  const existing = loadVirtualPatchContext();
  const requestedAt = request.requestedAt ?? new Date().toISOString();
  const id = request.id ?? `${request.kind}:${request.vendorId ?? 'venue'}:${request.serviceName}:${requestedAt}`;
  const previousRequests = Array.isArray(existing?.serviceRequests) ? existing.serviceRequests : [];
  const nextContext: VirtualPatchContext = {
    ...(existing ?? {}),
    ...options,
    source: existing?.source ?? options.source ?? 'scanner',
    mode: existing?.mode ?? options.mode ?? 'service-request',
    initiatedAt: existing?.initiatedAt ?? options.initiatedAt ?? requestedAt,
    venueId: existing?.venueId ?? options.venueId ?? request.venueId ?? null,
    venueName: existing?.venueName ?? options.venueName ?? request.venueName ?? null,
    serviceRequests: [
      ...previousRequests,
      { ...request, id, requestedAt },
    ].slice(-20),
  };
  saveVirtualPatchContext(nextContext);
  return nextContext;
}

export function clearVirtualPatchContext(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.removeItem(VIRTUAL_PATCH_CONTEXT_KEY); } catch { /* ignore */ }
}