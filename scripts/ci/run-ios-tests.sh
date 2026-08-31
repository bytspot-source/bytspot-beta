#!/usr/bin/env bash
# Runs the App scheme's test action on the newest iPhone simulator the runner
# has. Shared by the iOS Tests workflow and the TestFlight job so a release
# cannot ship a suite the pull request gate never ran.
set -euo pipefail

cd "$(dirname "$0")/../.."

RESULT_BUNDLE="${1:-${RUNNER_TEMP:-/tmp}/AppTests.xcresult}"
rm -rf "$RESULT_BUNDLE"

# Runner images change simulator names between Xcode releases, so the device is
# resolved by UDID rather than pinned by name.
SIM_INFO=$(xcrun simctl list devices available --json | python3 - <<'PY'
import json, re, sys

devices = json.load(sys.stdin)['devices']

def version(key):
    match = re.search(r'SimRuntime\.iOS-([0-9-]+)$', key)
    return tuple(int(part) for part in match.group(1).split('-')) if match else ()

for runtime in sorted((key for key in devices if 'SimRuntime.iOS-' in key), key=version, reverse=True):
    for device in devices[runtime]:
        if device['name'].startswith('iPhone'):
            print(device['udid'])
            print(device['name'])
            sys.exit(0)

sys.exit('No iPhone simulator is available on this runner.')
PY
)

SIMULATOR_UDID=$(printf '%s\n' "$SIM_INFO" | sed -n 1p)
SIMULATOR_NAME=$(printf '%s\n' "$SIM_INFO" | sed -n 2p)
echo "Simulator: $SIMULATOR_NAME ($SIMULATOR_UDID)"

# Simulator builds are never signed, and pull requests do not have the
# distribution certificate available.
NSUnbufferedIO=YES xcodebuild test \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -resultBundlePath "$RESULT_BUNDLE" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=
