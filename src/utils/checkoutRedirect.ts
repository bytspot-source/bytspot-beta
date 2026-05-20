export type CheckoutRedirectResponse = { url?: string | null } | null | undefined;

export function getCheckoutRedirectUrl(result: CheckoutRedirectResponse): string | null {
  const candidate = typeof result?.url === 'string' ? result.url.trim() : '';
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}