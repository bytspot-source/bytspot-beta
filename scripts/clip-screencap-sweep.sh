#!/usr/bin/env bash
# Bytspot App Clip · TestFlight pre-flight screenshot sweep.
#
# Boots an iOS simulator, builds the App scheme (Debug), installs the embedded
# Clip.app, then walks the catalog -> vendors -> checkout -> success flow for
# each of the three tiers (Black / Platinum / Green) using the DEBUG-only
# `?step=` deep-link hook in ClipInvocationModel.handle(url:).
#
# Output: .dev-screenshots/clip-sweep-<UTC stamp>/<tier>-<step>.png
#
# Usage: scripts/clip-screencap-sweep.sh [simulator-udid]
#   Defaults to the currently booted simulator; falls back to the first
#   available iPhone 17 Pro if nothing is booted.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SIM_UDID="${1:-}"
if [[ -z "$SIM_UDID" ]]; then
    SIM_UDID="$(xcrun simctl list devices booted -j \
        | /usr/bin/python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; \
print(next((d["udid"] for ds_list in ds.values() for d in ds_list if d.get("state")=="Booted"), ""))')"
fi
if [[ -z "$SIM_UDID" ]]; then
    SIM_UDID="$(xcrun simctl list devices available -j \
        | /usr/bin/python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; \
print(next((d["udid"] for ds_list in ds.values() for d in ds_list if "iPhone 17 Pro" in d.get("name","")), ""))')"
    [[ -z "$SIM_UDID" ]] && { echo "[sweep] No booted sim and no iPhone 17 Pro found" >&2; exit 1; }
    echo "[sweep] Booting $SIM_UDID"
    xcrun simctl boot "$SIM_UDID" || true
fi
echo "[sweep] Using simulator: $SIM_UDID"

CLIP_APP="ios/App/build/SimDD/Build/Products/Debug-iphonesimulator/App.app/AppClips/Clip.app"
if [[ ! -d "$CLIP_APP" || "${REBUILD:-0}" == "1" ]]; then
    echo "[sweep] Building App scheme (Debug)"
    (cd ios/App && xcodebuild \
        -project App.xcodeproj \
        -scheme App \
        -configuration Debug \
        -destination "platform=iOS Simulator,id=$SIM_UDID" \
        -derivedDataPath build/SimDD \
        CODE_SIGNING_ALLOWED=NO \
        build 2>&1 | tail -3)
fi
[[ -d "$CLIP_APP" ]] || { echo "[sweep] Clip.app not found at $CLIP_APP" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR=".dev-screenshots/clip-sweep-$STAMP"
mkdir -p "$OUT_DIR"
echo "[sweep] Output: $OUT_DIR"

xcrun simctl install "$SIM_UDID" "$CLIP_APP"
open -a Simulator >/dev/null 2>&1 || true

shoot() {
    local tier="$1" step="$2" url="$3"
    xcrun simctl terminate "$SIM_UDID" com.bytspot.app.Clip >/dev/null 2>&1 || true
    xcrun simctl launch "$SIM_UDID" com.bytspot.app.Clip _XCAppClipURL "$url" >/dev/null
    sleep 3
    local out="$OUT_DIR/${tier}-${step}.png"
    xcrun simctl io "$SIM_UDID" screenshot "$out" 2>/dev/null
    printf "  [%-8s] %-9s -> %s\n" "$tier" "$step" "$out"
}

# Black tier · aviation patch (Stratos / Solitaire / Vector)
echo "[sweep] BLACK aviation"
shoot black catalog  "https://bytspot.app/p/black-aviation-001?tier=black&step=catalog"
shoot black vendors  "https://bytspot.app/p/black-aviation-001?tier=black&step=vendors"
shoot black checkout "https://bytspot.app/p/black-aviation-001?tier=black&step=checkout"
shoot black success  "https://bytspot.app/p/black-aviation-001?tier=black&step=success"

# Platinum tier · parking patch
echo "[sweep] PLATINUM parking"
shoot platinum catalog  "https://bytspot.app/p/platinum-parking-001?tier=platinum&step=catalog"
shoot platinum vendors  "https://bytspot.app/p/platinum-parking-001?tier=platinum&step=vendors"
shoot platinum checkout "https://bytspot.app/p/platinum-parking-001?tier=platinum&step=checkout"
shoot platinum success  "https://bytspot.app/p/platinum-parking-001?tier=platinum&step=success"

# Green tier · farm-stand patch
echo "[sweep] GREEN farm-stand"
shoot green catalog  "https://bytspot.app/p/green-farmstand-001?tier=green&step=catalog"
shoot green vendors  "https://bytspot.app/p/green-farmstand-001?tier=green&step=vendors"
shoot green checkout "https://bytspot.app/p/green-farmstand-001?tier=green&step=checkout"
shoot green success  "https://bytspot.app/p/green-farmstand-001?tier=green&step=success"

echo
echo "[sweep] Done. $(ls "$OUT_DIR" | wc -l | tr -d ' ') screenshots in $OUT_DIR"
open "$OUT_DIR" >/dev/null 2>&1 || true
