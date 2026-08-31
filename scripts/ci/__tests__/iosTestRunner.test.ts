// The iOS test gate shipped two defects that a Mac caught and Linux could
// have: the simulator JSON never reached the selector, and disabling code
// signing broke the Keychain tests. Both are cheap to pin with stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = process.cwd();
const selector = join(repoRoot, 'scripts/ci/select_ios_simulator.py');
const runner = join(repoRoot, 'scripts/ci/run-ios-tests.sh');

function selectSimulator(devices: unknown) {
  return spawnSync('python3', [selector], { input: JSON.stringify({ devices }), encoding: 'utf8' });
}

// A PATH where xcrun serves fixture JSON and xcodebuild only records its
// arguments, so the runner can be exercised without Xcode.
function stubbedRun(devices: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'ios-gate-'));
  const argsFile = join(dir, 'xcodebuild-args');
  writeFileSync(join(dir, 'xcrun'), `#!/usr/bin/env bash\n[ "$1" = simctl ] && { cat <<'JSON'\n${JSON.stringify({ devices })}\nJSON\nexit 0; }\nexit 1\n`);
  writeFileSync(join(dir, 'xcodebuild'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > ${argsFile}\nexit 0\n`);
  chmodSync(join(dir, 'xcrun'), 0o755);
  chmodSync(join(dir, 'xcodebuild'), 0o755);

  const result = spawnSync('bash', [runner, join(dir, 'result.xcresult')], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  return { ...result, xcodebuildArgs: existsSync(argsFile) ? readFileSync(argsFile, 'utf8').trim() : null };
}

const iPhoneOnNewestRuntime = {
  'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [{ name: 'iPad Air', udid: 'IPAD' }, { name: 'iPhone 16', udid: 'OLD-IPHONE' }],
  'com.apple.CoreSimulator.SimRuntime.iOS-18-10': [{ name: 'iPhone 17 Pro', udid: 'NEW-IPHONE' }],
  'com.apple.CoreSimulator.SimRuntime.watchOS-11-0': [{ name: 'Apple Watch', udid: 'WATCH' }],
};

test('Simulator selection prefers the newest iOS runtime and ignores other device families', () => {
  const result = selectSimulator(iPhoneOnNewestRuntime);
  assert.equal(result.status, 0);
  // 18-10 is newer than 18-2, which a string sort gets backwards.
  assert.deepEqual(result.stdout.trim().split('\n'), ['NEW-IPHONE', 'iPhone 17 Pro']);
});

test('Simulator selection fails loudly when the runner has no iPhone', () => {
  const result = selectSimulator({ 'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [{ name: 'iPad Air', udid: 'IPAD' }] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No iPhone simulator is available/);
});

test('The iOS test runner reaches xcodebuild with the resolved simulator', () => {
  const result = stubbedRun(iPhoneOnNewestRuntime);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Simulator: iPhone 17 Pro \(NEW-IPHONE\)/);
  // Pins the defect where the heredoc took stdin from the simctl pipe, so the
  // selector read an empty stream and xcodebuild was never invoked.
  assert.notEqual(result.xcodebuildArgs, null, 'xcodebuild was never invoked');
  assert.match(result.xcodebuildArgs!, /-destination platform=iOS Simulator,id=NEW-IPHONE/);
  assert.match(result.xcodebuildArgs!, /-scheme App/);
});

test('The iOS test runner leaves code signing alone', () => {
  // Overriding it strips the application-identifier entitlement, and the auth
  // session tests that round-trip a token through the Keychain then fail.
  const { xcodebuildArgs } = stubbedRun(iPhoneOnNewestRuntime);
  assert.doesNotMatch(xcodebuildArgs!, /CODE_SIGNING_ALLOWED|CODE_SIGNING_REQUIRED|CODE_SIGN_IDENTITY/);
});

test('The iOS test runner does not build when no simulator can be resolved', () => {
  const result = stubbedRun({ 'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [{ name: 'iPad Air', udid: 'IPAD' }] });
  assert.equal(result.status, 1);
  assert.equal(result.xcodebuildArgs, null, 'xcodebuild ran despite having no simulator');
});

test('Both CI entry points call the shared runner so they cannot drift', () => {
  const workflow = readFileSync(join(repoRoot, '.github/workflows/ios-tests.yml'), 'utf8');
  assert.match(workflow, /scripts\/ci\/run-ios-tests\.sh/);
  // Executable bit: the workflow invokes the script directly.
  assert.doesNotThrow(() => execFileSync('test', ['-x', runner]));
});
