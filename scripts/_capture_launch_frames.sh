#!/usr/bin/env bash
set -euo pipefail
UDID="054C674B-01A4-428F-A036-68A4899B9BAC"
BID="com.bytspot.app"
OUT=".dev-screenshots/native-shell-compare"
mkdir -p "$OUT"
xcrun simctl terminate "$UDID" "$BID" >/dev/null 2>&1 || true
SIMCTL_CHILD_BYT_NATIVE_ROOT=1 xcrun simctl launch "$UDID" "$BID" >/dev/null
sleep 1.2
xcrun simctl io "$UDID" screenshot "$OUT/current-splash.png"
sleep 3.2
xcrun simctl io "$UDID" screenshot "$OUT/current-landing.png"
shasum "$OUT/current-splash.png" "$OUT/current-landing.png"
