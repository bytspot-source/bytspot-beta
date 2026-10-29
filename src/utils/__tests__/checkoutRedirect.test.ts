import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCheckoutRedirectUrl, getConnectRedirectUrl } from '../checkoutRedirect.ts';

describe('checkoutRedirect', () => {
  it('accepts Stripe test checkout URLs', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_profile_insider_direct_123';
    assert.equal(getCheckoutRedirectUrl({ url }), url);
  });

  it('accepts Stripe live checkout URLs', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_live_profile_insider_direct_123';
    assert.equal(getCheckoutRedirectUrl({ url }), url);
  });

  it('accepts nested and alternate checkout URL response shapes', () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_nested_response_123';
    assert.equal(getCheckoutRedirectUrl({ checkoutUrl: url }), url);
    assert.equal(getCheckoutRedirectUrl({ session: { url } }), url);
    assert.equal(getCheckoutRedirectUrl({ checkout: { url } }), url);
    assert.equal(getCheckoutRedirectUrl({ data: { checkoutSession: { url } } }), url);
    assert.equal(getCheckoutRedirectUrl({ result: { data: { json: { checkout: { url } } } } }), url);
  });

  it('converts Stripe test and live session IDs into hosted checkout URLs', () => {
    assert.equal(getCheckoutRedirectUrl({ sessionId: 'cs_test_direct_session_123' }), 'https://checkout.stripe.com/c/pay/cs_test_direct_session_123');
    assert.equal(getCheckoutRedirectUrl({ sessionId: 'cs_live_direct_session_123' }), 'https://checkout.stripe.com/c/pay/cs_live_direct_session_123');
    assert.equal(getCheckoutRedirectUrl({ session: { id: 'cs_test_nested_id_123' } }), 'https://checkout.stripe.com/c/pay/cs_test_nested_id_123');
    assert.equal(getCheckoutRedirectUrl({ result: { data: { checkoutSessionId: 'cs_test_trpc_session_123' } } }), 'https://checkout.stripe.com/c/pay/cs_test_trpc_session_123');
    assert.equal(getCheckoutRedirectUrl({ result: { data: { booking: { id: 'booking-1' }, session: { id: 'cs_test_after_booking_123' } } } }), 'https://checkout.stripe.com/c/pay/cs_test_after_booking_123');
  });

  it('rejects missing or unsafe redirect values', () => {
    assert.equal(getCheckoutRedirectUrl({ url: '' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'javascript:alert(1)' }), null);
    assert.equal(getCheckoutRedirectUrl({ sessionId: 'sk_test_secret_key_should_not_redirect' }), null);
    assert.equal(getCheckoutRedirectUrl(null), null);
  });

  it('follows only Stripe-hosted Checkout pages', () => {
    assert.equal(getCheckoutRedirectUrl({ url: 'https://evil.example/c/pay/cs_test_1' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'http://checkout.stripe.com/c/pay/cs_test_1' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'https://checkout.stripe.com.evil.example/c/pay/cs_test_1' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'https://user@checkout.stripe.com/c/pay/cs_test_1' }), null);
    assert.equal(getCheckoutRedirectUrl({ url: 'https://connect.stripe.com/setup/e/acct_1/abc' }), null);
  });

  it('follows only Stripe Connect onboarding links for payouts', () => {
    const url = 'https://connect.stripe.com/setup/e/acct_1/abc';
    assert.equal(getConnectRedirectUrl(url), url);
    assert.equal(getConnectRedirectUrl(` ${url} `), url);
    assert.equal(getConnectRedirectUrl('https://checkout.stripe.com/c/pay/cs_test_1'), null);
    assert.equal(getConnectRedirectUrl('https://connect.stripe.com.evil.example/setup'), null);
    assert.equal(getConnectRedirectUrl('javascript:alert(1)'), null);
    assert.equal(getConnectRedirectUrl(undefined), null);
  });
});
