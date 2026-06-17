#!/bin/bash
set -u
DEVICE="054C674B-01A4-428F-A036-68A4899B9BAC"
APP_PATH="/Users/bytspotapp/Library/Developer/Xcode/DerivedData/App-euimiodwveomjkdnlccaiswvhubd/Build/Products/Debug-iphonesimulator/App.app"
SMOKE_URL="bytspot://p/BYT424?t=tok&tier=platinum&venue=partner-colony"

mkdir -p .dev-screenshots
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl install "$DEVICE" "$APP_PATH" 2>&1 | tail -2

xcrun simctl terminate "$DEVICE" com.bytspot.app 2>/dev/null || true
sleep 0.6

SIMCTL_CHILD_BYT_NATIVE_ROOT=1 \
SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=map \
SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER=platinum \
SIMCTL_CHILD_BYT_NATIVE_MAP_SELECT_PIN=partner \
SIMCTL_CHILD_BYT_NATIVE_AUTH_AUTORUN=apple \
SIMCTL_CHILD_BYT_NATIVE_AUTH_MOCK=success \
SIMCTL_CHILD_BYT_NATIVE_BRIDGE_SMOKE_URL="$SMOKE_URL" \
  xcrun simctl launch "$DEVICE" com.bytspot.app 2>&1

# 3.5s smoke delay + 1.5s for UI to react + 1s headroom
sleep 7

xcrun simctl io "$DEVICE" screenshot .dev-screenshots/sim-map-bridge-smoke-paired.png 2>&1
ls -lh .dev-screenshots/sim-map-bridge-smoke-paired.png

echo "--- launchctl ---"
xcrun simctl spawn "$DEVICE" launchctl list 2>/dev/null | grep -i bytspot || echo "no bytspot proc listed"
