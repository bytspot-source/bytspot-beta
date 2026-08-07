#!/usr/bin/env bash
# Relaunch the native root and OCR-verify the Private Airport Transfer polish
# (route map preview, fare breakdown, driver-vendor card) on the iPhone 17 sim.
set -euo pipefail

UDID="054C674B-01A4-428F-A036-68A4899B9BAC"
BUNDLE_ID="com.bytspot.app"
APP="ios/App/build/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
SCRATCH_DIR="${TMPDIR:-/tmp}"
OCR="${SCRATCH_DIR%/}/bytspot_native_root_ocr.swift"
OUT="$PWD/.dev-screenshots/private-airport-transfer-polish"
mkdir -p "$OUT"
trap 'rm -f "$OCR"' EXIT
cat > "$OCR" <<'SWIFT'
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cgImage = bitmap.cgImage else { exit(1) }

let request = VNRecognizeTextRequest { request, _ in
  let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
  for observation in observations {
    if let text = observation.topCandidates(1).first?.string { print(text) }
  }
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
try? VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
SWIFT

base_env=(
  SIMCTL_CHILD_BYT_NATIVE_ROOT=1
  SIMCTL_CHILD_BYT_NATIVE_SUPPRESS_LOCATION_PROMPT=1
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TOKEN=review_session_token
  SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=discover
)

detail_env=(
  "${base_env[@]}"
  SIMCTL_CHILD_BYT_NATIVE_DISCOVER_DETAIL=service-valet-ride
)

direct_env=(
  "${base_env[@]}"
  SIMCTL_CHILD_BYT_NATIVE_VALET_PREVIEW=1
)

open -a Simulator || true
xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP" >/dev/null

capture() {
  local path="$1" mode="$2" name="$3" sleep_s="$4" expect="$5"
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  if [ "$path" = "detail" ]; then
    env "${detail_env[@]}" "SIMCTL_CHILD_BYT_NATIVE_VALET_AUTORUN=$mode" \
      xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" \
      --byt-native-preview-tab=discover --byt-native-discover-detail=service-valet-ride >/dev/null
  else
    env "${direct_env[@]}" "SIMCTL_CHILD_BYT_NATIVE_VALET_AUTORUN=$mode" \
      xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" \
      --byt-native-valet-preview=1 >/dev/null
  fi
  sleep "$sleep_s"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null
  swift "$OCR" "$OUT/$name.png" > "$OUT/$name.ocr.txt" 2>/dev/null || true
  if ! grep -Eiq "$expect" "$OUT/$name.ocr.txt"; then
    echo "OCR_UNEXPECTED:$name"
    cat "$OUT/$name.ocr.txt"
    exit 1
  fi
  echo "OK:$name"
}

capture direct entry 01-trip-entry 6 "Itinerary|Vehicle preference|Check Availability"
capture direct quote 02-quote-ready 12 "Route preview|Est. ride|Authorization estimate"
capture direct confirm 03-confirmed 16 "Request Received|Pending Authorization|REQUEST RECEIVED"

echo "WALKTHROUGH_PASS artifacts=$OUT"
echo "===== 01-trip-entry ====="
cat "$OUT/01-trip-entry.ocr.txt"
echo "===== 02-quote-ready ====="
cat "$OUT/02-quote-ready.ocr.txt"
echo "===== 03-confirmed ====="
cat "$OUT/03-confirmed.ocr.txt"
