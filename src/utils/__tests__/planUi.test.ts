import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// SSR coverage without a browser, network, or additional test dependencies.
// This hook is scoped to this Node test process and deregistered after tests.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      for (const extension of ['', '.tsx', '.ts']) {
        const candidate = new URL(url.href + extension);
        if (/\.(tsx?|css)$/.test(candidate.pathname) && existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    if (url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    };
    return next(url, context);
  },
});
const { DeepSpaceSurface, DeepSpaceGroundContext } = await import('../../components/DeepSpaceGround.tsx');
const { PlanSection } = await import('../../components/PlanSection.tsx');
const { BottomNav } = await import('../../components/BottomNav.tsx');
test.after(() => hooks.deregister());

const noNetwork = () => { throw new Error('SSR must not make API requests'); };
const api = { list: noNetwork, get: noNetwork, create: noNetwork, confirm: noNetwork, cancel: noNetwork, respond: noNetwork };
const props = { api, authenticated: false, onSignIn: () => {}, onExploreNeed: () => {} };

test('Standalone Plan renders one ground, ideas, sign-in and honest booking copy', () => {
  const html = renderToStaticMarkup(createElement(PlanSection, props));
  assert.equal((html.match(/data-testid="deep-space-ground"/g) ?? []).length, 1);
  assert.match(html, /Start a Plan/);
  assert.match(html, /Sign in to create a plan/);
  assert.match(html, /Creating a plan does not book anything/);
  assert.match(html, /Coffee catch-up/);
  assert.doesNotMatch(html, /No plans yet/);
});

test('Authenticated overview initially announces loading, not a false empty state', () => {
  const html = renderToStaticMarkup(createElement(PlanSection, { ...props, authenticated: true }));
  assert.match(html, /Loading your plans/);
  assert.doesNotMatch(html, /No plans yet/);
});

test('Nested surfaces never double-ground; explicit parent flag also suppresses it', () => {
  const nested = renderToStaticMarkup(createElement(DeepSpaceSurface, { children: createElement(PlanSection, props) }));
  assert.equal((nested.match(/data-testid="deep-space-ground"/g) ?? []).length, 1);
  const inherited = renderToStaticMarkup(createElement(DeepSpaceGroundContext.Provider, { value: true, children: createElement(PlanSection, props) }));
  assert.doesNotMatch(inherited, /data-testid="deep-space-ground"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(PlanSection, { ...props, groundDrawn: true })), /data-testid="deep-space-ground"/);
});

test('BottomNav puts Plan directly after Home and marks the active destination', () => {
  const html = renderToStaticMarkup(createElement(BottomNav, { activeTab: 'plan', setActiveTab: () => {}, isDarkMode: true }));
  const labels = [...html.matchAll(/aria-label="([^"]+ tab)"/g)].map(match => match[1]);
  assert.deepEqual(labels, ['Home tab', 'Plan tab', 'Discover tab', 'Map tab', 'Concierge tab']);
  assert.match(html, /aria-label="Plan tab"[^>]*aria-selected="true"/);
});

test('App wires typed Plan navigation, shared ground and unchanged native-only entry', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /export type Tab = 'home' \| 'plan'/);
  assert.match(app, /activeTab === 'plan'/);
  assert.match(app, /<DeepSpaceGroundContext.Provider value=\{true\}>/);
  assert.match(app, /createPlanApi\(trpc\)/);
  const entry = readFileSync(new URL('../../main.tsx', import.meta.url), 'utf8');
  assert.match(entry, /if \(!renderNativeHandoffOnly\(\)\)/);
});

test('Plan stylesheet uses token gutters, readable glass and accessible targets', () => {
  const css = readFileSync(new URL('../../styles/plan.css', import.meta.url), 'utf8');
  assert.match(css, /padding: var\(--spacing-2\)/);
  assert.match(css, /min-height: 44px; min-width: 44px/);
  assert.match(css, /backdrop-filter: blur\(20px\)/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
});
