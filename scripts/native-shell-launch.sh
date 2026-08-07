#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

UDID="${UDID:-054C674B-01A4-428F-A036-68A4899B9BAC}"
BUNDLE_ID="${BUNDLE_ID:-com.bytspot.app}"
CONFIGURATION="${CONFIGURATION:-Debug}"
DERIVED_DATA="${DERIVED_DATA:-ios/App/build/DerivedData}"
APP="$PWD/$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/App.app"

if [[ "${REBUILD:-0}" == "1" ]]; then
  echo "▶ Building App scheme for sim $UDID ($CONFIGURATION) …"
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration "$CONFIGURATION" \
    -destination "id=$UDID" -derivedDataPath "$DERIVED_DATA" \
    CODE_SIGNING_ALLOWED=NO build | tail -5
fi

if [[ "${REINSTALL:-0}" == "1" ]]; then
  echo "▶ Reinstalling $BUNDLE_ID on $UDID …"
  xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$UDID" "$APP"
fi

echo "▶ Launching $BUNDLE_ID with BYT_NATIVE_ROOT=1 …"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
SIMCTL_CHILD_BYT_NATIVE_ROOT=1 \
  xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID"
