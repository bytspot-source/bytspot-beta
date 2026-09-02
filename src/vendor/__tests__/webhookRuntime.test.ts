import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

const VENDOR_DIR = new URL('../', import.meta.url);

function sources(filter: (name: string) => boolean): { name: string; source: string }[] {
  return readdirSync(VENDOR_DIR)
    .filter(filter)
    .map((name) => ({ name, source: readFileSync(new URL(name, VENDOR_DIR), 'utf8') }));
}

/**
 * The scheduler is deliberately unstarted in this repo.
 *
 * `createScheduler` and `drainQueue` are complete and tested, and the obvious
 * next step looks like calling `start()` from the console. It cannot be done
 * here, for three separate reasons, any one of which is disqualifying:
 *
 *  1. Signing needs the endpoint's HMAC secret. In a browser that puts the
 *     secret in the client, where the vendor — and anything injected into the
 *     page — can read it. The signature then proves nothing, which is the one
 *     job it has.
 *  2. Delivery is a cross-origin POST to a URL the vendor chose. Receivers do
 *     not send CORS headers for our origin, so the request is unsendable from a
 *     page regardless of the secret.
 *  3. A tab is not a runtime. Deliveries would stop when the vendor closed the
 *     console, and "at-least-once" would mean "at-most-once, while watching".
 *
 * So the modules stay as executable reference for the API to port, and these
 * tests keep the browser from acquiring a sender.
 */
test('no browser entrypoint can start the scheduler', () => {
  const views = sources((name) => name.endsWith('.tsx') || name === 'main.tsx');

  for (const { name, source } of views) {
    assert.doesNotMatch(source, /from '\.\/webhookScheduler/, `${name} must not import the scheduler`);
    assert.doesNotMatch(source, /createScheduler|timerSleep/, `${name} must not construct a delivery loop`);
    // drainQueue is the one-pass form. A view calling it directly is the same
    // mistake without the timer.
    assert.doesNotMatch(source, /\bdrainQueue\b/, `${name} must not drain the queue`);
  }
});

test('the console can reveal a secret but never store or use one', () => {
  const view = readFileSync(new URL('../WebhooksView.tsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../webhookWorker.ts', import.meta.url), 'utf8');

  // Signing happens where the sender runs, which is not here.
  assert.doesNotMatch(view, /signWebhook|crypto\.subtle/);
  // No persistence: a revealed secret survives only as long as the reveal.
  assert.doesNotMatch(view, /localStorage|sessionStorage|indexedDB/);

  // The endpoint record is the thing that gets listed, filtered and re-rendered,
  // so a secret field on it would end up everywhere the record goes. It is
  // resolved at send time instead.
  const record = worker.slice(worker.indexOf('export interface WebhookEndpoint'));
  assert.doesNotMatch(record.slice(0, record.indexOf('}')), /secret/i);
  assert.match(worker, /Never held in queue state/);
});

test('the worker stays free of browser and node specifics, so the API can port it', () => {
  const worker = readFileSync(new URL('../webhookWorker.ts', import.meta.url), 'utf8');
  const scheduler = readFileSync(new URL('../webhookScheduler.ts', import.meta.url), 'utf8');

  // Time, randomness, the network and the secrets are all injected. That is
  // what makes the logic testable here and liftable there.
  for (const source of [worker, scheduler]) {
    assert.doesNotMatch(source, /\bDate\.now\b/, 'time must come from the injected clock');
    assert.doesNotMatch(source, /\bfetch\(/, 'the network must come from the injected transport');
    assert.doesNotMatch(source, /window\.|document\./);
    assert.doesNotMatch(source, /process\.env/);
  }

  // Math.random and setTimeout are permitted in exactly one place each, as the
  // default the caller overrides.
  assert.match(scheduler, /options\.random \?\? Math\.random/);
  assert.match(scheduler, /export function timerSleep/);
  assert.doesNotMatch(worker, /Math\.random|setTimeout/);
});
