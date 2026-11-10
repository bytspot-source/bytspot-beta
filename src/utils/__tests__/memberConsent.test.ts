import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptTermsInput,
  isBirthDateFormat,
  pendingConsentGates,
  setAgeInput,
  setAiConsentInput,
  type ConsentStatus,
} from '../memberConsent.ts';

const status = (over: Partial<ConsentStatus> = {}): ConsentStatus => ({
  terms: { currentVersion: '2026-10-10', acceptedVersion: '2026-10-10', acceptedAt: '2026-10-10T00:00:00Z', needsAcceptance: false },
  age: { hasBirthDate: false, confirmed18: false, canEnter21Plus: false },
  ai: { provider: 'OpenAI', consentedAt: null, required: false },
  ...over,
  terms: { currentVersion: '2026-10-10', acceptedVersion: '2026-10-10', acceptedAt: '2026-10-10T00:00:00Z', needsAcceptance: false, ...(over.terms ?? {}) },
  age: { hasBirthDate: false, confirmed18: false, canEnter21Plus: false, ...(over.age ?? {}) },
  ai: { provider: 'OpenAI', consentedAt: null, required: false, ...(over.ai ?? {}) },
});

test('a complete member has no pending gates', () => {
  assert.deepEqual(pendingConsentGates(status({
    age: { hasBirthDate: true, confirmed18: true, canEnter21Plus: true },
    ai: { provider: 'OpenAI', consentedAt: '2026-11-10T00:00:00Z', required: true },
  })), []);
});

test('terms, 18+ confirmation and required AI consent each open a gate', () => {
  assert.deepEqual(
    pendingConsentGates(status({
      terms: { currentVersion: '2026-11-10', acceptedVersion: null, acceptedAt: null, needsAcceptance: true },
      ai: { provider: 'OpenAI', consentedAt: null, required: true },
    })),
    ['terms', 'age18', 'ai'],
  );
});

test('21+ needs a birth date even if the member already confirmed 18', () => {
  assert.deepEqual(
    pendingConsentGates(status({ age: { hasBirthDate: false, confirmed18: true, canEnter21Plus: false } }), { need21Plus: true }),
    ['age21'],
  );
  assert.deepEqual(
    pendingConsentGates(status({ age: { hasBirthDate: true, confirmed18: true, canEnter21Plus: true } }), { need21Plus: true }),
    [],
  );
});

test('AI consent is only required when the server flag is on', () => {
  assert.deepEqual(pendingConsentGates(status({
    age: { hasBirthDate: true, confirmed18: true, canEnter21Plus: true },
    ai: { provider: 'OpenAI', consentedAt: null, required: false },
  })), []);
});

test('mutation payloads match the consent.* input shapes', () => {
  assert.deepEqual(acceptTermsInput(status({ terms: { currentVersion: '2026-11-10', acceptedVersion: null, acceptedAt: null, needsAcceptance: true } })), { version: '2026-11-10' });
  assert.deepEqual(setAgeInput({ birthDate: '2000-02-29', confirm18: true }), { birthDate: '2000-02-29', confirm18: true });
  assert.deepEqual(setAgeInput({ confirm18: true }), { confirm18: true });
  assert.deepEqual(setAiConsentInput(true), { consent: true });
  assert.deepEqual(setAiConsentInput(false), { consent: false });
});

test('birth dates are validated before they are sent', () => {
  assert.equal(isBirthDateFormat('2000-02-29'), true);
  assert.equal(isBirthDateFormat('2001-02-29'), false);
  assert.equal(isBirthDateFormat('02/29/2000'), false);
  assert.throws(() => setAgeInput({ birthDate: '02/29/2000' }), /YYYY-MM-DD/);
  assert.throws(() => setAgeInput({}), /date of birth or confirm/);
});
