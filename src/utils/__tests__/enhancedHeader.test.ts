import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { formatCityBadge } from '../cityBadge.ts';

test('formatCityBadge keeps home location labels compact and human-readable', () => {
  assert.equal(formatCityBadge('City of Atlanta'), 'Atlanta');
  assert.equal(formatCityBadge('Atlanta Metropolitan Area'), 'Atlanta');
  assert.equal(formatCityBadge('Atlanta, Georgia, United States'), 'Atlanta');
  assert.equal(formatCityBadge('Accra (Greater Accra)'), 'Accra');
  assert.equal(formatCityBadge('A very long city name'), 'A very long…');
  assert.equal(formatCityBadge(''), 'Nearby');
});

// Source/structure contracts: no browser or retired web entry point required.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const appText = source('../../App.tsx');
const app = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const css = source('../../styles/globals.css');

function elements(root: ts.Node): ts.JsxElement[] {
  const result: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}

function attribute(element: ts.JsxElement, name: string): string | undefined {
  const attr = element.openingElement.attributes.properties.find(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name,
  );
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer) return undefined;
  return ts.isStringLiteral(attr.initializer) ? attr.initializer.text : attr.initializer.getText();
}

function byTestId(id: string): ts.JsxElement {
  const matches = elements(app).filter((element) => attribute(element, 'data-testid') === id);
  assert.equal(matches.length, 1, `exactly one ${id}`);
  return matches[0];
}

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('navigation tokens match native geometry without baking in safe area', () => {
  assert.match(appText, /import '\.\/styles\/globals\.css'/, 'load navigation CSS without changing main.tsx');
  for (const [name, value] of Object.entries({
    'control-size': 44, 'horizontal-inset': 16, 'top-padding': 8, 'content-gap': 12,
  })) {
    assert.match(css, new RegExp(`--navigation-${name}: ${value}px;`));
  }
  assert.match(css, /--navigation-row-height: calc\(var\(--navigation-control-size\) \+ var\(--navigation-top-padding\) \+ var\(--navigation-content-gap\)\);/);
  const row = rule('.app-navigation-row');
  assert.match(row, /box-sizing: border-box/);
  assert.match(row, /flex: 0 0 var\(--navigation-row-height\)/);
  assert.match(row, /height: var\(--navigation-row-height\)/);
  assert.match(row, /padding: var\(--navigation-top-padding\) var\(--navigation-horizontal-inset\) var\(--navigation-content-gap\)/);
  assert.match(row, /justify-content: space-between/);
  assert.doesNotMatch(row, /safe-area|position:\s*(absolute|fixed)|row-reverse/);
  const control = rule('.app-navigation-control');
  assert.match(control, /width: var\(--navigation-control-size\)/);
  assert.match(control, /height: var\(--navigation-control-size\)/);
});

test('one safe-area shell reserves navigation above a clipped sibling viewport', () => {
  const shell = byTestId('app-navigation-shell');
  const nav = byTestId('app-navigation-row');
  const viewport = byTestId('app-tab-viewport');
  assert.equal(nav.parent, shell);
  assert.equal(viewport.parent, shell);
  assert.ok(nav.end < viewport.pos);
  const shellRule = rule('.app-navigation-shell');
  assert.match(shellRule, /height: 100dvh/);
  assert.match(shellRule, /box-sizing: border-box/);
  assert.match(shellRule, /padding-top: var\(--safe-area-top, 0px\)/);
  assert.match(shellRule, /flex-direction: column/);
  const viewportRule = rule('.app-tab-viewport');
  assert.match(viewportRule, /position: relative/);
  assert.match(viewportRule, /flex: 1 1 0%/);
  assert.match(viewportRule, /min-height: 0/);
  assert.match(viewportRule, /overflow: hidden/);
  assert.doesNotMatch(viewportRule, /padding-top|navigation-row-height|safe-area-top/);
  assert.doesNotMatch(appText, /max\(3rem, var\(--safe-area-top|Status Bar Space/);
  assert.doesNotMatch(shell.getText(), /--safe-area-top|paddingTop/);
  for (const tab of ['home', 'discover', 'map', 'concierge', 'profile']) {
    assert.ok(elements(viewport).some((element) => attribute(element, 'key') === tab));
  }
});

test('Profile is first/left and Map or map return is second/right, with working handlers', () => {
  const nav = byTestId('app-navigation-row');
  const profile = byTestId('open-profile-button');
  const back = byTestId('map-back-button');
  const map = byTestId('open-map-button');
  assert.equal(profile.parent, nav);
  assert.equal(attribute(profile, 'onClick'), '{openProfileMain}');
  const branch = nav.children.find((node) => ts.isJsxExpression(node) && node.expression);
  assert.ok(branch && ts.isJsxExpression(branch) && branch.expression);
  assert.ok(ts.isConditionalExpression(branch.expression));
  assert.equal(branch.expression.condition.getText(), "activeTab === 'map'");
  assert.ok(branch.expression.whenTrue.getText().includes('map-back-button'));
  assert.ok(branch.expression.whenFalse.getText().includes('open-map-button'));
  assert.ok(profile.end < branch.pos);
  assert.equal(attribute(map, 'onClick'), "{() => setActiveTab('map')}");
  assert.match(attribute(back, 'onClick')!, /setActiveTab\('home'\)/);
  assert.match(attribute(back, 'onClick')!, /setSelectedDestination\(undefined\)/);
  assert.match(attribute(back, 'onClick')!, /setSelectedMapFunction\(undefined\)/);
  for (const button of [profile, back, map]) {
    assert.equal(attribute(button, 'type'), 'button');
    assert.ok(attribute(button, 'aria-label'));
    assert.match(attribute(button, 'className')!, /app-navigation-control/);
  }
});

test('home stats no longer own navigation and scroll below the shell row', () => {
  const header = source('../../components/EnhancedHeader.tsx');
  assert.doesNotMatch(header, /onProfileClick|open-profile-button|open-map-button|map-back-button/);
  const homeScroll = elements(byTestId('app-tab-viewport')).find(
    (element) => attribute(element, 'ref') === '{homeScrollRef}',
  );
  assert.ok(homeScroll);
  assert.match(homeScroll.getText(), /<EnhancedHeader/);
  assert.match(homeScroll.getText(), /<SmartSearchBar/);
  assert.equal((appText.match(/<EnhancedHeader\b/g) ?? []).length, 1);
});

test('map search starts below shell navigation without a duplicate row or spacer', () => {
  const map = source('../../components/MapSection.tsx');
  const search = source('../../components/map/MapSearchBar.tsx');
  assert.doesNotMatch(map, /onBackToHome|open-profile-button|open-map-button|map-back-button|--navigation-row-height|--safe-area-top/);
  assert.equal((map.match(/<MapSearchBar\b/g) ?? []).length, 1);
  assert.match(search, /className="map-search-row z-\[1000\]"/);
  assert.match(search, /aria-label="Search destination or service type"/);
  assert.doesNotMatch(search, /top-4|right-20|--safe-area-top|--navigation-row-height|y: -10/);
  const searchRule = rule('.map-search-row');
  assert.match(searchRule, /top: 0/);
  assert.match(searchRule, /left: var\(--navigation-horizontal-inset\)/);
  assert.match(searchRule, /right: var\(--navigation-horizontal-inset\)/);
});

test('native and web share navigation geometry and keep scroll content out of the header', () => {
  const design = source('../../../ios/App/App/NativeShellDesignSystem.swift');
  const shell = source('../../../ios/App/App/NativeShellView.swift');
  for (const [native, web, value] of [
    ['controlSize', 'control-size', 44], ['horizontalInset', 'horizontal-inset', 16],
    ['topPadding', 'top-padding', 8], ['contentGap', 'content-gap', 12],
  ] as const) {
    assert.ok(design.includes(`static let ${native}: CGFloat = ${value}`));
    assert.ok(css.includes(`--navigation-${web}: ${value}px`));
  }
  assert.match(shell, /shellNavigationRow\s+Group\s*\{\s*switch selectedTab/);
  assert.match(shell, /\.clipped\(\) \/\/ Scroll content cannot paint over the navigation row/);
  const row = shell.slice(shell.indexOf('@ViewBuilder private var shellNavigationRow'), shell.indexOf('static func showsGlobalHeaderControls'));
  assert.ok(row.indexOf('native-global-profile-avatar') < row.indexOf('Spacer('));
  assert.ok(row.indexOf('native-map-back-button') > row.indexOf('Spacer('));
  assert.ok(row.indexOf('native-global-map-button') > row.indexOf('Spacer('));
  assert.match(row, /\.padding\(\.bottom, NativeNavigationLayout.contentGap\)/);
  assert.doesNotMatch(row, /ignoresSafeArea/);
  assert.match(shell, /mapSearchTopInset: CGFloat = 0/);
});

test('Profile Plans register per-row automatic swipe actions with server permission and refresh', () => {
  const plans = source('../../../ios/App/App/NativePlansPanel.swift');
  const shell = source('../../../ios/App/App/NativeShellView.swift');
  const rows = plans.slice(plans.indexOf('ForEach(plans)'), plans.indexOf('.listStyle(.plain)', plans.indexOf('ForEach(plans)')));
  assert.match(rows, /if NativePlanDisplay.canDelete\(plan, userID: sessionStore.authenticatedUserID\)/);
  assert.match(rows, /planRow\(plan\)\s+\.swipeActions\(edge: .trailing, allowsFullSwipe: false\)/);
  assert.match(rows, /\.buttonStyle\(.automatic\)/);
  assert.match(rows, /\.accessibilityAction\(named: Text\("Delete Plan"\)\)/);
  assert.match(plans, /return plan.canDelete == true/);
  assert.match(plans, /\.refreshable \{ await reload\(\) \}/);
  assert.match(plans, /reloadGeneration == generation/);
  const panel = shell.slice(shell.indexOf('private struct NativeProfilePanelSheet'), shell.indexOf('private var panelHeading', shell.indexOf('private struct NativeProfilePanelSheet')));
  assert.match(panel, /if panel == .plans \{[^}]*panelContent\s*\} else \{\s*ScrollView/s);
});

test('web entry remains native-handoff-first, with React reserved for legal pages', () => {
  const main = source('../../main.tsx');
  assert.match(main, /if \(isLegalWebPath\(\)\) return false/);
  assert.match(main, /if \(!renderNativeHandoffOnly\(\)\)\s*\{\s*void bootLegalPages\(\)/);
  assert.doesNotMatch(main, /^import App from/m);
});
