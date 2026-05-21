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
});