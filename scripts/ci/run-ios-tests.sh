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
SIM_INFO=$(xcrun simctl list devices available --json | python3 scripts/ci/select_ios_simulator.py)

SIMULATOR_UDID=$(printf '%s\n' "$SIM_INFO" | sed -n 1p)
SIMULATOR_NAME=$(printf '%s\n' "$SIM_INFO" | sed -n 2p)
echo "Simulator: $SIMULATOR_NAME ($SIMULATOR_UDID)"

# Signing is left at the project default. A simulator destination signs the app
# ad-hoc and needs no certificate, so overriding it buys nothing and costs the
# application-identifier entitlement that the Keychain session tests round-trip
# a token through.
NSUnbufferedIO=YES xcodebuild test \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -resultBundlePath "$RESULT_BUNDLE"
