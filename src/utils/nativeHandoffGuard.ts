export type NativeHandoffKind = 'party' | 'group' | 'patch' | 'access' | 'app';

export type NativeHandoffContext = {
  kind: NativeHandoffKind;
  title: string;
  subtitle: string;
  appArgument: string;
  appSchemeURL: string;
};

const APP_HOSTS = new Set(['bytspot.app', 'www.bytspot.app', 'bytspot.com', 'www.bytspot.com']);
const PATCH_PATHS = new Set(['p', 'patch', 't']);
const PATCH_QUERY_KEYS = ['patchId', 'patch', 'p'];
const ACCESS_COMPATIBILITY_PATHS = new Set(['access', 'patch', 'clip']);
const LEGAL_PATHS = new Set(['privacy', 'terms', 'disclaimer', 'support']);

function isLikelyBytspotTag(value: string | undefined): boolean {
  return Boolean(value && /^BYT[A-Z0-9_-]{2,}$/i.test(value));
}

function cloneQuery(source: URL, target: URL): void {
  source.searchParams.forEach((value, key) => target.searchParams.set(key, value));
}

function pathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function patchIdFrom(url: URL, parts: string[]): string | null {
  for (const key of PATCH_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value) return value;
  }
  const [first, second] = parts;
  if (first && PATCH_PATHS.has(first.toLowerCase()) && second) return second;
  if (first?.toLowerCase() === 'access' && second) return second;
  if (isLikelyBytspotTag(first)) return first!;
  return null;
}

function isLegalWebPath(parts: string[]): boolean {
  return parts.length === 1 && LEGAL_PATHS.has(parts[0].toLowerCase());
}

export function nativeAppClipArgumentFor(rawUrl: string): string {
  try {
    const current = new URL(rawUrl);
    const parts = pathParts(current);
    const [first] = parts;
    if (first && ['party', 'group'].includes(first.toLowerCase())) return current.toString();
    const patchId = patchIdFrom(current, parts);
    if (!patchId) return current.toString();
    const next = new URL('https://bytspot.app/p/app-clip');
    next.searchParams.set('patchId', patchId);
    cloneQuery(current, next);
    next.searchParams.set('patchId', patchId);
    return next.toString();
  } catch {
    return rawUrl;
  }
}

export function nativeHandoffContext(rawUrl: string): NativeHandoffContext | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  if (url.hostname && !APP_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parts = pathParts(url);
  if (isLegalWebPath(parts)) return null;

  const first = parts[0]?.toLowerCase();
  const source = url.searchParams.get('source')?.toLowerCase();
  const isAppClipHandoff = source === 'app_clip' || url.searchParams.get('handoff') === '1';

  if (first === 'party' && parts[1]) {
    const nativeURL = new URL(`bytspot://party/${parts.slice(1).join('/')}`);
    cloneQuery(url, nativeURL);
    return {
      kind: 'party',
      title: 'Open this Party Pass in Bytspot',
      subtitle: 'This published Host Studio party opens in the native app or App Clip.',
      appArgument: url.toString(),
      appSchemeURL: nativeURL.toString(),
    };
  }

  if (first === 'group' && parts[1]) {
    const nativeURL = new URL(`bytspot://group/${parts.slice(1).join('/')}`);
    cloneQuery(url, nativeURL);
    return {
      kind: 'group',
      title: 'Open this invite in Bytspot',
      subtitle: 'This private group invite is native/App Clip only. The web app is not used for joins.',
      appArgument: url.toString(),
      appSchemeURL: nativeURL.toString(),
    };
  }

  const patchId = patchIdFrom(url, parts);
  if (patchId || isAppClipHandoff || (first && ACCESS_COMPATIBILITY_PATHS.has(first))) {
    const nativeURL = new URL(patchId ? `bytspot://access/${patchId}` : 'bytspot://access');
    cloneQuery(url, nativeURL);
    return {
      kind: patchId ? 'patch' : 'access',
      title: patchId ? 'Open this tap in Bytspot' : 'Open Bytspot Access',
      subtitle: 'NFC, QR, map, and App Clip taps go to the native app or App Clip — never the old web app.',
      appArgument: nativeAppClipArgumentFor(rawUrl),
      appSchemeURL: nativeURL.toString(),
    };
  }

  const nativeURL = new URL(first ? `bytspot://${parts.join('/')}` : 'bytspot://home');
  cloneQuery(url, nativeURL);
  return {
    kind: 'app',
    title: 'Open Bytspot',
    subtitle: 'Bytspot is a native iPhone app. This page does not load the old web app.',
    appArgument: url.toString(),
    appSchemeURL: nativeURL.toString(),
  };
}

export function shouldBlockLegacyPwaFallback(rawUrl: string): boolean {
  return nativeHandoffContext(rawUrl) !== null;
}
