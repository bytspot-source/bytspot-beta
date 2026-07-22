import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAppStoreConsumerOnlyBlockedPath } from '../reviewBuild.ts';

describe('App Store consumer-only route gate', () => {
  it('blocks Provider, Vendor, Host legacy, Valet, Admin, and Marketing routes', () => {
    for (const path of [
      '/provider', '/provider/onboarding', '/provider/connect/return',
      '/vendor', '/vendor/onboarding', '/host', '/host/onboarding',
      '/valet', '/admin', '/admin/approvals', '/marketing',
    ]) {
      assert.equal(isAppStoreConsumerOnlyBlockedPath(path), true, `${path} should be hidden in App Store builds`);
    }
  });

  it('keeps consumer routes available', () => {
    for (const path of ['/', '/privacy', '/terms', '/disclaimer', '/forgot-password', '/reset-password', '/booking/success', '/parking/success']) {
      assert.equal(isAppStoreConsumerOnlyBlockedPath(path), false, `${path} should remain available`);
    }
  });
});