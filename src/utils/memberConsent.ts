/**
 * What a signed-in web member still needs to tell Bytspot (age, terms, AI
 * consent), and the payloads for the consent.* procedures. Pure, so the
 * screens can be wired later without guessing shapes.
 *
 * Procedures (all require a session):
 *   consent.status        query, no input
 *   consent.acceptTerms   { version: string }  — must equal terms.currentVersion
 *   consent.setAge        { birthDate?: "YYYY-MM-DD", confirm18?: true }
 *                         at least one of birthDate or confirm18; birth date
 *                         can only be set once
 *   consent.setAiConsent  { consent: boolean }
 *
 * Server flags (off until these screens ship):
 *   AGE_GATE_ENFORCED, SIGNUP_REQUIRE_AGE_AND_TERMS, CONCIERGE_REQUIRE_AI_CONSENT
 */

export const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ConsentStatus {
  terms: {
    currentVersion: string;
    acceptedVersion: string | null;
    acceptedAt: string | null;
    needsAcceptance: boolean;
  };
  age: {
    hasBirthDate: boolean;
    confirmed18: boolean;
    canEnter21Plus: boolean;
  };
  ai: {
    provider: string;
    consentedAt: string | null;
    required: boolean;
  };
}

export type ConsentGate = 'terms' | 'age18' | 'age21' | 'ai';

export function pendingConsentGates(status: ConsentStatus, opts: { need21Plus?: boolean } = {}): ConsentGate[] {
  const gates: ConsentGate[] = [];
  if (status.terms.needsAcceptance) gates.push('terms');
  if (opts.need21Plus) {
    if (!status.age.canEnter21Plus) gates.push('age21');
  } else if (!status.age.confirmed18 && !status.age.hasBirthDate) {
    gates.push('age18');
  }
  if (status.ai.required && !status.ai.consentedAt) gates.push('ai');
  return gates;
}

export function isBirthDateFormat(value: string): boolean {
  if (!BIRTH_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function acceptTermsInput(status: ConsentStatus): { version: string } {
  return { version: status.terms.currentVersion };
}

export function setAgeInput(opts: { birthDate?: string; confirm18?: boolean }): { birthDate?: string; confirm18?: true } {
  const input: { birthDate?: string; confirm18?: true } = {};
  if (opts.birthDate) {
    if (!isBirthDateFormat(opts.birthDate)) throw new Error('Use the format YYYY-MM-DD.');
    input.birthDate = opts.birthDate;
  }
  if (opts.confirm18) input.confirm18 = true;
  if (!input.birthDate && !input.confirm18) throw new Error('Give a date of birth or confirm you are 18 or older.');
  return input;
}

export function setAiConsentInput(consent: boolean): { consent: boolean } {
  return { consent };
}
