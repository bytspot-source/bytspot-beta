#!/bin/bash
# Captures non-partner verdict card + partner-card-paired regression
# using the BYT_NATIVE_MAP_SELECT_PIN preview hook.
set -u
DEVICE="054C674B-01A4-428F-A036-68A4899B9BAC"
APP_PATH="/Users/bytspotapp/Library/Developer/Xcode/DerivedData/App-euimiodwveomjkdnlccaiswvhubd/Build/Products/Debug-iphonesimulator/App.app"
mkdir -p .dev-screenshots
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl install "$DEVICE" "$APP_PATH" 2>&1 | tail -2

shoot() {
  local OUT="$1"; local TIER="$2"; local SELECT="$3"; local PAIRED="$4"
  xcrun simctl terminate "$DEVICE" com.bytspot.app 2>/dev/null || true
  sleep 0.6
  SIMCTL_CHILD_BYT_NATIVE_ROOT=1 \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=map \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER="$TIER" \
  SIMCTL_CHILD_BYT_NATIVE_MAP_SELECT_PIN="$SELECT" \
  SIMCTL_CHILD_BYT_NATIVE_MAP_PATCH_PAIRED="$PAIRED" \
  SIMCTL_CHILD_BYT_NATIVE_AUTH_AUTORUN=apple \
  SIMCTL_CHILD_BYT_NATIVE_AUTH_MOCK=success \
    xcrun simctl launch "$DEVICE" com.bytspot.app 2>&1
  sleep 6
  xcrun simctl io "$DEVICE" screenshot "$OUT" 2>&1
  ls -lh "$OUT"
}

echo "=== 1. Non-partner: parking pin (lean verdict card) ==="
shoot .dev-screenshots/sim-map-nonpartner-card-parking.png platinum parking ""
echo
echo "=== 2. Non-partner: unverified access pin ==="
shoot .dev-screenshots/sim-map-nonpartner-card-access.png platinum access ""
echo
echo "=== 3. Partner: partner-colony paired (regression w/ new env hook) ==="
shoot .dev-screenshots/sim-map-partner-card-paired-v3.png platinum partner partner-colony
echo
echo "=== process status ==="
xcrun simctl spawn "$DEVICE" launchctl list 2>/dev/null | grep -i bytspot || echo "no bytspot process listed"
