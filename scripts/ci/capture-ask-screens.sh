#!/usr/bin/env bash
# Screenshots the native Discover Ask flow on a simulator, from the Debug build
# the test step leaves in DerivedData. Sample data via BYT_NATIVE_ASK_PREVIEW;
# BYT_NATIVE_PREVIEW_TAB skips the first-run welcome flow.
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT="${1:-${RUNNER_TEMP:-/tmp}/ask-screens}"
mkdir -p "$OUT"

APP_PATH=$(find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 -type d -path '*/Build/Products/Debug-iphonesimulator/App.app' | head -1)
[ -n "$APP_PATH" ] || { echo "No Debug simulator App.app in DerivedData" >&2; exit 1; }
BUNDLE_ID=com.bytspot.app

SIM_INFO=$(xcrun simctl list devices available --json | python3 scripts/ci/select_ios_simulator.py)
UDID=$(printf '%s\n' "$SIM_INFO" | sed -n 1p)
echo "Simulator: $(printf '%s\n' "$SIM_INFO" | sed -n 2p) ($UDID)"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 || true
xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl privacy "$UDID" grant location-always "$BUNDLE_ID" || true
xcrun simctl location "$UDID" set 33.7866,-84.3833 || true

for mode in rail ask offered offers pay booked requests; do
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=discover \
  SIMCTL_CHILD_BYT_NATIVE_ASK_PREVIEW="$mode" \
  SIMCTL_CHILD_BYT_NATIVE_AUTH_AUTORUN=apple \
  SIMCTL_CHILD_BYT_NATIVE_AUTH_MOCK=success \
    xcrun simctl launch "$UDID" "$BUNDLE_ID"
  sleep 9
  xcrun simctl io "$UDID" screenshot "$OUT/ask-$mode.png"
done

# The seller's side is a push. A banner shows only if the app was granted
# notifications, so this frame may show the Home Screen alone.
xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
cat > "$OUT/vendor-booked.apns" <<JSON
{"Simulator Target Bundle": "$BUNDLE_ID", "aps": {"alert": {"title": "Booked at Midtown", "body": "2 guests, Thu, Sep 24, 7:30 PM · \$45. The guest accepted your offer."}, "sound": "default"}, "category": "reservations", "url": "https://bytspot.app/discover"}
JSON
xcrun simctl push "$UDID" "$BUNDLE_ID" "$OUT/vendor-booked.apns" || true
sleep 3
xcrun simctl io "$UDID" screenshot "$OUT/vendor-booked-push.png"

ls -l "$OUT"
