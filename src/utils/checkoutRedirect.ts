export type CheckoutRedirectResponse = Record<string, unknown> | null | undefined;

function readCandidate(result: CheckoutRedirectResponse): string {
  if (!result || typeof result !== 'object') return '';

  const directKeys = ['url', 'checkoutUrl', 'stripeCheckoutUrl', 'redirectUrl', 'sessionUrl', 'sessionId'];
  for (const key of directKeys) {
    const value = result[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const nested = [result.session, result.checkoutSession, result.data];
  for (const value of nested) {
    const nestedCandidate = readCandidate(value as CheckoutRedirectResponse);
    if (nestedCandidate) return nestedCandidate;
  }

  return '';
}

export function getCheckoutRedirectUrl(result: CheckoutRedirectResponse): string | null {
  const candidate = readCandidate(result);
  if (!candidate) return null;

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