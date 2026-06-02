#!/usr/bin/env bash
# Targeted App Clip smoke test for the Platinum GH Akwaaba digital pass flow.
# Builds/installs Clip.app, launches the explicit GH/FIFA success hook, auto-opens the
# in-Clip Safari digital pass sheet, then captures a screenshot artifact.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SIM_UDID="${1:-}"
if [[ -z "$SIM_UDID" ]]; then
  SIM_UDID="$(xcrun simctl list devices booted -j \
    | /usr/bin/python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; print(next((d["udid"] for xs in ds.values() for d in xs if d.get("state")=="Booted"), ""))')"
fi
if [[ -z "$SIM_UDID" ]]; then
  SIM_UDID="$(xcrun simctl list devices available -j \
    | /usr/bin/python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; print(next((d["udid"] for xs in ds.values() for d in xs if "iPhone 17 Pro" in d.get("name", "")), ""))')"
  [[ -z "$SIM_UDID" ]] && { echo "[platinum-pass] No simulator found" >&2; exit 1; }
  xcrun simctl boot "$SIM_UDID" || true
fi

echo "[platinum-pass] Using simulator: $SIM_UDID"
CLIP_APP="ios/App/build/Build/Products/Debug-iphonesimulator/Clip.app"
if [[ ! -d "$CLIP_APP" || "${REBUILD:-0}" == "1" ]]; then
  echo "[platinum-pass] Building Clip scheme"
  (cd ios/App && xcodebuild \
    -project App.xcodeproj \
    -scheme Clip \
    -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIM_UDID" \
    -derivedDataPath build \
    build 2>&1 | tail -25)
fi
[[ -d "$CLIP_APP" ]] || { echo "[platinum-pass] Clip.app not found at $CLIP_APP" >&2; exit 1; }

OUT_DIR=".dev-screenshots"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/clip-platinum-digital-pass-sheet.png"

URL="https://bytspot.app/p/PATCH-FIFA-001?tier=platinum&step=success_gh_akwaaba&autoOpenPass=1&ticketUrl=https%3A%2F%2Fexample.com%2Fbytspot-gh-akwaaba-pass"

xcrun simctl install "$SIM_UDID" "$CLIP_APP"
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl terminate "$SIM_UDID" com.bytspot.app.Clip >/dev/null 2>&1 || true
xcrun simctl launch "$SIM_UDID" com.bytspot.app.Clip _XCAppClipURL "$URL" >/dev/null
sleep 5
xcrun simctl io "$SIM_UDID" screenshot "$OUT" >/dev/null

echo "[platinum-pass] Captured $OUT"
echo "[platinum-pass] Expected visible labels: GH AKWAABA PASS, GH Akwaaba Pass, Save to Wallet in Bytspot"