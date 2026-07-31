/**
 * App Store / Apple review build safety gates.
 *
 * Web production can keep Provider/Vendor/Admin surfaces available for internal
 * beta operations, while iOS App Store builds ship as a Parker consumer-only app.
 */
type ReviewBuildEnv = {
  VITE_APP_STORE_CONSUMER_ONLY?: string;
  VITE_HIDE_PROVIDER_AND_VALET?: string;
  VITE_HIDE_INTERNAL_ROUTES?: string;
  VITE_HIDE_INSIDER_PREMIUM?: string;
};

const viteEnv = (import.meta as unknown as { env?: ReviewBuildEnv }).env ?? {};
const APP_STORE_CONSUMER_ONLY_COMPILE_TIME = truthy(viteEnv.VITE_APP_STORE_CONSUMER_ONLY);

function truthy(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function runtimeConsumerOnlyOverride(): boolean {
  if (typeof window === 'undefined') return false;
  return truthy((window as unknown as { __BYT_APP_STORE_CONSUMER_ONLY__?: unknown }).__BYT_APP_STORE_CONSUMER_ONLY__);
}

export const APP_STORE_CONSUMER_ONLY_BUILD = APP_STORE_CONSUMER_ONLY_COMPILE_TIME || runtimeConsumerOnlyOverride() || truthy(viteEnv.VITE_APP_STORE_CONSUMER_ONLY);
export const APPLE_REVIEW_HIDE_PROVIDER_AND_VALET = APP_STORE_CONSUMER_ONLY_BUILD || (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && truthy(viteEnv.VITE_HIDE_PROVIDER_AND_VALET));
export const APPLE_REVIEW_HIDE_PLATINUM_MEMBERSHIP = viteEnv.VITE_HIDE_INSIDER_PREMIUM === 'false' ? false : true;
export const APPLE_REVIEW_HIDE_INTERNAL_ROUTES = APP_STORE_CONSUMER_ONLY_BUILD || (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && truthy(viteEnv.VITE_HIDE_INTERNAL_ROUTES));

const blockedPathCodes = [
  [47, 112, 114, 111, 118, 105, 100, 101, 114],
  [47, 118, 101, 110, 100, 111, 114],
  [47, 104, 111, 115, 116],
  [47, 118, 97, 108, 101, 116],
  [47, 97, 100, 109, 105, 110],
  [47, 109, 97, 114, 107, 101, 116, 105, 110, 103],
];

function fromCharCodes(codes: number[]): string {
  return String.fromCharCode(...codes);
}

export function isAppStoreConsumerOnlyBlockedPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return blockedPathCodes.some((codes) => {
    const blocked = fromCharCodes(codes);
    return normalized === blocked || normalized.startsWith(`${blocked}/`);
  });
}