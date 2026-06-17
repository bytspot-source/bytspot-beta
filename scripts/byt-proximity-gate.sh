#!/usr/bin/env bash
# Bytspot native Trust Ladder L2 · 120 m proximity gate screenshot sweep.
#
# Launches the native map (BYT_NATIVE_ROOT) with the Map Functions sheet open and
# verifies the Tap/Scan CTA in-zone (<=120 m) vs out-of-zone. Two modes:
#
#   env  (default) — drives proximity via BYT_NATIVE_MAP_PROXIMITY_METERS (no GPS).
#   gps            — drives the *real* CoreLocation gate via `simctl location set`
#                    so headingProvider.userLocation (not the override) decides.
#                    Placed at the fallback verified pins (Colony Square / Arts
#                    Center) the native map renders when landing on the Map tab.
#
# Usage:   bash scripts/byt-proximity-gate.sh [env|gps]
# Output:  .dev-screenshots/native-proximity-gate/<state>.png
set -euo pipefail
MODE="${1:-env}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

APP="ios/App/build/NativeProximityGate/Build/Products/Debug-iphonesimulator/App.app"
BUNDLE="com.bytspot.app"
OUT=".dev-screenshots/native-proximity-gate"
mkdir -p "$OUT"

[ -d "$APP" ] || { echo "[gate] App build missing: $APP" >&2; exit 1; }

# Resolve a booted simulator; otherwise boot an iPhone 17 Pro (fallback: any iPhone).
UDID="$(xcrun simctl list devices booted -j | /usr/bin/python3 -c 'import json,sys;ds=json.load(sys.stdin)["devices"];print(next((d["udid"] for L in ds.values() for d in L if d.get("state")=="Booted"),""))')"
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl list devices available -j | /usr/bin/python3 -c 'import json,sys;ds=json.load(sys.stdin)["devices"];print(next((d["udid"] for L in ds.values() for d in L if "iPhone 17 Pro" in d.get("name","")), next((d["udid"] for L in ds.values() for d in L if "iPhone" in d.get("name","")),"")))')"
  echo "[gate] booting $UDID"
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b
fi
echo "[gate] sim=$UDID"
open -a Simulator >/dev/null 2>&1 || true

xcrun simctl install "$UDID" "$APP"

# env-override mode: BYT_NATIVE_MAP_PROXIMITY_METERS decides the gate (no GPS).
shoot_env() {
  meters="$1"; name="$2"
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 0.5
  SIMCTL_CHILD_BYT_NATIVE_ROOT=1 \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=map \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER=platinum \
  SIMCTL_CHILD_BYT_NATIVE_MAP_SHOW_FUNCTIONS=1 \
  SIMCTL_CHILD_BYT_NATIVE_MAP_PROXIMITY_METERS="$meters" \
    xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE" >/dev/null
  sleep 5
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
  ls -lh "$OUT/$name.png"
}

# real-GPS mode: the simulated device location drives headingProvider.userLocation,
# which feeds nearestVerifiedDistanceMeters. The proximity override is NOT set, so
# this proves the live CoreLocation path — not the env shortcut — gates the CTA.
shoot_gps() {
  lat="$1"; lon="$2"; name="$3"
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 0.5
  xcrun simctl location "$UDID" set "$lat,$lon"
  SIMCTL_CHILD_BYT_NATIVE_ROOT=1 \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=map \
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER=platinum \
  SIMCTL_CHILD_BYT_NATIVE_MAP_SHOW_FUNCTIONS=1 \
    xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE" >/dev/null
  sleep 3
  # Re-assert location after launch so the running CLLocationManager delivers it.
  xcrun simctl location "$UDID" set "$lat,$lon"
  sleep 5
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
  ls -lh "$OUT/$name.png"
}

if [ "$MODE" = "gps" ]; then
  echo "[gate] mode=gps (real CoreLocation drives the 120 m gate)"
  # Pre-grant location so launches never block on the system permission prompt.
  xcrun simctl privacy "$UDID" grant location "$BUNDLE" >/dev/null 2>&1 || true
  # In-zone: sit exactly on the Colony Square verified pin (distance ~0 m).
  shoot_gps 33.7878 -84.3832 "03-gps-in-zone-colony-square"
  # Out-of-zone: ~800 m north of Colony Square, well outside both verified pins.
  shoot_gps 33.7950 -84.3832 "04-gps-out-of-zone-800m"
  xcrun simctl location "$UDID" clear >/dev/null 2>&1 || true
else
  echo "[gate] mode=env (BYT_NATIVE_MAP_PROXIMITY_METERS drives the gate)"
  shoot_env 80  "01-in-zone-80m"
  shoot_env 500 "02-out-of-zone-500m"
fi
echo "[gate] done -> $OUT"
