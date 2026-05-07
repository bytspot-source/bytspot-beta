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

function truthy(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function runtimeConsumerOnlyOverride(): boolean {
  if (typeof window === 'undefined') return false;
  return truthy((window as unknown as { __BYT_APP_STORE_CONSUMER_ONLY__?: unknown }).__BYT_APP_STORE_CONSUMER_ONLY__);
}

export const APP_STORE_CONSUMER_ONLY_BUILD = runtimeConsumerOnlyOverride() || truthy(viteEnv.VITE_APP_STORE_CONSUMER_ONLY);
export const APPLE_REVIEW_HIDE_PROVIDER_AND_VALET = APP_STORE_CONSUMER_ONLY_BUILD || truthy(viteEnv.VITE_HIDE_PROVIDER_AND_VALET);
export const APPLE_REVIEW_HIDE_INSIDER_PREMIUM = viteEnv.VITE_HIDE_INSIDER_PREMIUM === 'false' ? false : true;
export const APPLE_REVIEW_HIDE_INTERNAL_ROUTES = APP_STORE_CONSUMER_ONLY_BUILD || truthy(viteEnv.VITE_HIDE_INTERNAL_ROUTES);

export function isAppStoreConsumerOnlyBlockedPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return (
    normalized === '/provider' ||
    normalized.startsWith('/provider/') ||
    normalized === '/vendor' ||
    normalized.startsWith('/vendor/') ||
    normalized === '/host' ||
    normalized.startsWith('/host/') ||
    normalized === '/valet' ||
    normalized.startsWith('/valet/') ||
    normalized === '/admin' ||
    normalized.startsWith('/admin/') ||
    normalized === '/marketing'
  );
}