import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCheckoutRedirectUrl } from '../checkoutRedirect.ts';

describe('checkoutRedirect', () => {
  it('accepts Stripe test checkout URLs', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_profile_insider_direct_123';
    assert.equal(getCheckoutRedirectUrl({ url }), url);
  });

  it('accepts Stripe live checkout URLs', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_live_profile_insider_direct_123';
    assert.equal(getCheckoutRedirectUrl({ url }), url);
  });

  it('rejects missing or unsafe redirect values', () => {
    assert.equal(getCheckoutRedirectUrl({ url: '' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'javascript:alert(1)' }), null);
    assert.equal(getCheckoutRedirectUrl(null), null);
  });
});