import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateProviderApplication } from '../providerApproval.ts';

const baseApplication = {
  businessInfo: {
    legalName: 'Bytspot Events LLC',
    taxId: '38-1234567',
    address: { street: '100 Festival Way', city: 'Detroit', state: 'MI', zipCode: '48226' },
  },
  listing: {
    location: { address: '100 Festival Way Lot B', coordinates: { lat: 42.3314, lng: -83.0458 } },
  },
  payout: {
    stripeConnect: { status: 'active', onboardingStarted: true },
  },
};

describe('provider approval metadata review', () => {
  it('approves a complete metadata profile with active Stripe Connect', () => {
    const result = evaluateProviderApplication(baseApplication, new Date('2026-05-04T00:00:00Z'));
    assert.equal(result.status, 'approved');
    assert.equal(result.label, 'Approved');
    assert.deepEqual(result.reasons, []);
  });

  it('flags pending Stripe Connect for manual verification', () => {
    const result = evaluateProviderApplication({
      ...baseApplication,
      payout: { stripeConnect: { status: 'pending', onboardingStarted: true } },
    });
    assert.equal(result.status, 'manual_verification');
    assert.ok(result.reasons.some((reason) => reason.includes('Stripe Connect')));
  });

  it('flags missing legal and tax metadata for manual verification', () => {
    const result = evaluateProviderApplication({
      ...baseApplication,
      businessInfo: { ...baseApplication.businessInfo, legalName: '', taxId: '123' },
    });
    assert.equal(result.status, 'manual_verification');
    assert.equal(result.checks.businessLegalName, false);
    assert.equal(result.checks.taxId, false);
  });
});