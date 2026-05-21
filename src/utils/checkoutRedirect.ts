export type CheckoutRedirectResponse = Record<string, unknown> | null | undefined;

const URL_KEYS = ['url', 'checkoutUrl', 'stripeCheckoutUrl', 'redirectUrl', 'sessionUrl', 'paymentUrl', 'checkout_url'];
const SESSION_ID_KEYS = ['sessionId', 'checkoutSessionId', 'stripeSessionId', 'session_id'];

function readCandidates(result: unknown, allowIdKey = false, depth = 0): string[] {
  if (!result || typeof result !== 'object') return [];
  if (depth > 8) return [];

  const candidates: string[] = [];
  const record = result as Record<string, unknown>;
  for (const key of URL_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
  }

  for (const key of SESSION_ID_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
  }

  if (allowIdKey && typeof record.id === 'string' && record.id.trim()) candidates.push(record.id.trim());

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object') continue;
    const nestedLooksLikeCheckout = /checkout|session|stripe|data|result|json|response/i.test(key);
    candidates.push(...readCandidates(value, allowIdKey || nestedLooksLikeCheckout, depth + 1));
  }

  return candidates;
}

function normalizeCheckoutCandidate(candidate: string): string | null {
  // Stripe Checkout test/live session IDs are safe to route to the hosted
  // checkout path. Never treat secret keys (sk_test/sk_live) as URLs.
  if (/^cs_(test|live)_[A-Za-z0-9_]+$/.test(candidate)) {
    return `https://checkout.stripe.com/c/pay/${candidate}`;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function getCheckoutRedirectUrl(result: CheckoutRedirectResponse): string | null {
  const candidates = readCandidates(result);
  for (const candidate of candidates) {
    const checkoutUrl = normalizeCheckoutCandidate(candidate);
    if (checkoutUrl) return checkoutUrl;
  }
  return null;
}