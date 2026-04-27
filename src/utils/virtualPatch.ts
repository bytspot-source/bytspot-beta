export const VIRTUAL_PATCH_CONTEXT_KEY = 'bytspot_virtual_patch_context';

export type VirtualPatchScanMethod = 'qr' | 'nfc';

export interface VirtualPatchScanVerification {
  method: VirtualPatchScanMethod;
  rawValue: string;
  patchId: string;
  uid: string | null;
  tokenJti: string;
  verifiedAt: string;
  binding: { type: string; id: string } | null;
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
  };
}

export interface ParsedVirtualPatchPayload {
  rawValue: string;
  patchId: string | null;
  uid: string | null;
  readCounter: number | null;
  token: string | null;
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

export function parseScannedPatchPayload(rawValue: string, fallbackPatchId?: string | null): ParsedVirtualPatchPayload {
  const trimmed = rawValue.trim();
  const base = { rawValue: trimmed, patchId: fallbackPatchId ?? null, uid: null, readCounter: null, token: null };

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
    };
  } catch {
    // fall through to URL parsing
  }

  try {
    const url = new URL(trimmed);
    return {
      rawValue: trimmed,
      patchId: url.searchParams.get('patchId') ?? url.searchParams.get('patch') ?? base.patchId,
      uid: normalizeMaybeUid(url.searchParams.get('uid')),
      readCounter: parseMaybeInt(url.searchParams.get('readCounter') ?? url.searchParams.get('counter')),
      token: url.searchParams.get('token'),
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
    },
  };
}