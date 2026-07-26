#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

UDID="${UDID:-054C674B-01A4-428F-A036-68A4899B9BAC}"
BUNDLE_ID="${BUNDLE_ID:-com.bytspot.app}"
CONFIGURATION="${CONFIGURATION:-Debug}"
DERIVED_DATA="${DERIVED_DATA:-ios/App/build/NativeRootSmoke}"
APP="$PWD/$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/App.app"
OUT="${OUT:-$PWD/.dev-screenshots/native-root-smoke}"
mkdir -p "$OUT"

cat >/tmp/bytspot_native_root_ocr.swift <<'SWIFT'
import Foundation
import Vision
import AppKit
let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(2) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
print((request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
SWIFT

cat >/tmp/bytspot_native_root_luma.swift <<'SWIFT'
import Foundation
import AppKit
let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path), let data = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: data) else { exit(2) }
var total = 0.0
var count = 0.0
let step = max(1, min(rep.pixelsWide, rep.pixelsHigh) / 120)
for y in stride(from: 0, to: rep.pixelsHigh, by: step) {
  for x in stride(from: 0, to: rep.pixelsWide, by: step) {
    guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
    total += 0.2126 * c.redComponent + 0.7152 * c.greenComponent + 0.0722 * c.blueComponent
    count += 1
  }
}
print(String(format: "%.3f", total / max(count, 1)))
SWIFT

source_guards() {
  ! grep -R "section: \\.social\|NativeProfileMenuSectionKind\\.social\|p1RichPanels" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  ! grep -R "appearanceRaw = previewOverride" ios/App/App/BytspotNativeAppRoot.swift
  grep -q "No card numbers" ios/App/App/NativeShellView.swift
  grep -q "user.profile.get" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "user.vehicles.list" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "payments.setupSession" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_PROFILE_DATA_FIXTURES" ios/App/App/BytspotAPIClient.swift ios/App/App/NativeShellView.swift
  grep -q "VibePreferences.tsx" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "ParkingPreferences.tsx" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "user.preferences.update" ios/App/App/BytspotAPIClient.swift ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "user.notifications.updatePrefs" ios/App/App/BytspotAPIClient.swift ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "push.reservations" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "Primary Location Permission" ios/App/App/NativeShellView.swift docs/native-profile-product-wireframe-contract.md
  grep -q "SplashScreen.tsx" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "App.tsx onboarding quiz" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "AuthenticationFlow.tsx" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "auth.signup" ios/App/App/BytspotAPIClient.swift ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_PREVIEW_AUTH" ios/App/App/BytspotNativeAppRoot.swift scripts/native-root-smoke.sh docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_PREVIEW_PERSONALIZATION" ios/App/App/BytspotNativeAppRoot.swift scripts/native-root-smoke.sh docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_LAUNCH_AUTORUN" ios/App/App/BytspotNativeAppRoot.swift scripts/native-root-smoke.sh docs/native-profile-product-wireframe-contract.md
  grep -q "bytspot_native_launch_vibe" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "Sign in to save these picks" ios/App/App/BytspotNativeAppRoot.swift scripts/native-root-smoke.sh docs/native-profile-product-wireframe-contract.md
  grep -q "at least 8 characters" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "Native Fallback Audit" docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_SUPPRESS_LOCATION_PROMPT" ios/App/App/NativeShellView.swift scripts/native-root-smoke.sh
  grep -q "bytspot_saved_spots_planned_ids" ios/App/App/NativeShellView.swift
  grep -q "bytspot_places_visited_favorite_ids" ios/App/App/NativeShellView.swift
}

build_app() {
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration "$CONFIGURATION" \
    -destination "id=$UDID" -derivedDataPath "$DERIVED_DATA" CODE_SIGNING_ALLOWED=NO build
}

capture() {
  local name="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  env SIMCTL_CHILD_BYT_NATIVE_ROOT=1 SIMCTL_CHILD_BYT_NATIVE_APPEARANCE=light SIMCTL_CHILD_BYT_NATIVE_SUPPRESS_LOCATION_PROMPT=1 SIMCTL_CHILD_BYT_NATIVE_MAP_PROXIMITY_METERS=80 "$@" \
    xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" >/dev/null
  sleep "${SMOKE_SLEEP:-10}"
  local shot="$OUT/$name.png"
  xcrun simctl io "$UDID" screenshot "$shot" >/dev/null
  local luma
  luma=$(swift /tmp/bytspot_native_root_luma.swift "$shot")
  echo "$name luma=$luma" | tee "$OUT/$name.luma.txt"
}

ocr() {
  local name="$1"
  swift /tmp/bytspot_native_root_ocr.swift "$OUT/$name.png" | tee "$OUT/$name.ocr.txt"
}

expect_ocr() {
  local name="$1"
  local pattern="$2"
  grep -Eiq "$pattern" "$OUT/$name.ocr.txt"
  ! grep -Eiq "Back to native" "$OUT/$name.ocr.txt"
}

check_luma() {
  awk -F= '{ if ($2 + 0 < 0.70) exit 1 }' \
    "$OUT/profile.luma.txt" \
    "$OUT/home.luma.txt" \
    "$OUT/discover.luma.txt" \
    "$OUT/concierge.luma.txt" \
    "$OUT/map.luma.txt"
}

run_panel() {
  local panel="$1"
  local name="$2"
  local pattern="$3"
  if [[ "$panel" == "locationPrivacy" ]]; then
    SMOKE_SLEEP="${SMOKE_LOCATION_PRIVACY_SLEEP:-20}" capture "$name" SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION=guest SIMCTL_CHILD_BYT_NATIVE_PROFILE_PANEL_SMOKE="$panel"
  else
    capture "$name" SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION=guest SIMCTL_CHILD_BYT_NATIVE_PROFILE_PANEL_SMOKE="$panel"
  fi
  ocr "$name"
  expect_ocr "$name" "$pattern"
}

run_auth_fixture_panel() {
  local panel="$1"
  local name="$2"
  local pattern="$3"
  capture "$name" \
    SIMCTL_CHILD_BYT_NATIVE_PROFILE_PANEL_SMOKE="$panel" \
    SIMCTL_CHILD_BYT_NATIVE_AUTH_MOCK=success \
    SIMCTL_CHILD_BYT_NATIVE_AUTH_AUTORUN=apple \
    SIMCTL_CHILD_BYT_NATIVE_PROFILE_DATA_FIXTURES=authenticated
  ocr "$name"
  expect_ocr "$name" "$pattern"
}

run_live_auth_panel() {
  local panel="$1"
  local name="$2"
  local pattern="$3"
  capture "$name" SIMCTL_CHILD_BYT_NATIVE_PROFILE_PANEL_SMOKE="$panel"
  ocr "$name"
  expect_ocr "$name" "$pattern"
}

tap_launch_journey() {
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  env SIMCTL_CHILD_BYT_NATIVE_ROOT=1 SIMCTL_CHILD_BYT_NATIVE_APPEARANCE=light SIMCTL_CHILD_BYT_NATIVE_SUPPRESS_LOCATION_PROMPT=1 SIMCTL_CHILD_BYT_NATIVE_PREVIEW_LANDING=1 SIMCTL_CHILD_BYT_NATIVE_LAUNCH_AUTORUN=1 \
    xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" >/dev/null
  sleep "${SMOKE_TAP_SLEEP:-12}"
  xcrun simctl io "$UDID" screenshot "$OUT/tapthrough-main.png" >/dev/null
  local luma
  luma=$(swift /tmp/bytspot_native_root_luma.swift "$OUT/tapthrough-main.png")
  echo "tapthrough-main luma=$luma" | tee "$OUT/tapthrough-main.luma.txt"
  swift /tmp/bytspot_native_root_ocr.swift "$OUT/tapthrough-main.png" | tee "$OUT/tapthrough-main.ocr.txt"
  ! grep -Eiq "Back to native" "$OUT/tapthrough-main.ocr.txt"
  grep -Eiq "YOUR PICKS ARE READY|Home|Recommended for you|Explore These Spots" "$OUT/tapthrough-main.ocr.txt"
}

run_launch_visual_captures() {
  capture native-splash SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SPLASH=1
  ocr native-splash
  expect_ocr native-splash "BYTSPOT|Your perfect spot awaits|AI-Powered"

  capture native-landing SIMCTL_CHILD_BYT_NATIVE_PREVIEW_LANDING=1
  ocr native-landing
  expect_ocr native-landing "Know Before You Go|Let's Go|Terms & Privacy"

  capture native-personalization-vibe SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=vibe
  ocr native-personalization-vibe
  expect_ocr native-personalization-vibe "What are you looking|Coffee|Food|Parking"

  capture native-personalization-walk SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=walk
  ocr native-personalization-walk
  expect_ocr native-personalization-walk "What kind of stay|Boutique hotel|Apartment stay|Short stay"

  capture native-personalization-atlanta SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=atlanta
  ocr native-personalization-atlanta
  expect_ocr native-personalization-atlanta "Recommended for you|Midtown Smart Parking|Colony Square|Arts Center Access|Sign in to save these picks"

  tap_launch_journey

  capture native-auth-signup SIMCTL_CHILD_BYT_NATIVE_PREVIEW_AUTH=signup
  ocr native-auth-signup
  expect_ocr native-auth-signup "Welcome to Bytspot|Sign Up|Continue with Apple|Invite code"

  capture native-auth-login SIMCTL_CHILD_BYT_NATIVE_PREVIEW_AUTH=login
  ocr native-auth-login
  expect_ocr native-auth-login "Welcome to Bytspot|Log In|Forgot password|Continue with Google"
}

source_guards
if [[ "${BUILD_NATIVE_ROOT_SMOKE:-1}" != "0" ]]; then build_app; fi

xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl ui "$UDID" appearance light >/dev/null 2>&1 || true
if [[ "${LIVE_AUTH_SMOKE:-0}" != "1" && "${RESET_NATIVE_ROOT_SMOKE:-1}" != "0" ]]; then
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
fi
xcrun simctl install "$UDID" "$APP" >/dev/null
xcrun simctl privacy "$UDID" grant location "$BUNDLE_ID" >/dev/null 2>&1 || true

if [[ "${LAUNCH_VISUAL_ONLY:-0}" == "1" ]]; then
  run_launch_visual_captures
  echo "Native launch visual smoke passed. Artifacts: $OUT"
  exit 0
fi

capture profile SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION=guest SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PROFILE=1
ocr profile
expect_ocr profile "ACCOUNT CENTER|Quick actions|Wallet"

capture home SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=home
ocr home
expect_ocr home "YOUR PICKS ARE READY|Book Ride|Home"
capture discover SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=discover
ocr discover
expect_ocr discover "Places, stays, rides, services, and parking|Discover"
capture concierge SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=concierge
ocr concierge
expect_ocr concierge "Concierge|Ask|Show on Map"
capture map SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TAB=map
ocr map
expect_ocr map "Reserve Parking|Map|Parking"
check_luma

run_launch_visual_captures

run_panel access access-panel "My Access|Verified patches|Digital passes"
run_panel reservations arrivals-panel "Arrivals|Parking bookings|Arrival windows"
run_panel rewards rewards-panel "Rewards|badges|Bronze rewards"
run_panel savedSpots saved-spots-panel "Saved Spots|Review|Plan visit"
run_panel placesVisited places-visited-panel "Places I've Been|Review|Mark favorite"
run_panel personalInformation personal-information-panel "Personal Information|Profile on this iPhone|Save on This iPhone"
run_panel vehicles vehicles-panel "My Vehicles|Vehicle details|No vehicle saved yet"
run_panel paymentMethods payment-methods-panel "Payment Methods|Payment security|Start Secure Setup|Sign in required"
run_panel vibePreferences vibe-preferences-panel "Vibe Preferences|Energy Level|Save on This iPhone"
run_panel parkingPreferences parking-preferences-panel "Parking Preferences|Covered Parking|Max Hourly Rate"
run_panel notifications notifications-panel "Push Notifications|Reservation Updates|SMS Notifications"
run_panel locationPrivacy location-privacy-panel "Primary Location Permission|Enhanced Indoor Accuracy|Venue Recommendations"
run_panel appearance appearance-panel "Appearance|Auto|Dark|Light"
run_panel deleteAccount delete-account-panel "DELETE|Safety gate"
run_panel privacyPolicy privacy-policy-panel "Privacy Policy|Information we collect"
run_panel termsOfService terms-panel "Terms of Service|License|User conduct"
run_panel disclaimer disclaimer-panel "Disclaimer|Accuracy of data|Parking information"

run_auth_fixture_panel personalInformation auth-personal-information-panel "Live profile sync|Avery Parker|member@example.com"
run_auth_fixture_panel vehicles auth-vehicles-panel "Live vehicle garage|Tesla|BYT-424"
run_auth_fixture_panel paymentMethods auth-payment-methods-panel "Visa|4242|Default"

if [[ "${LIVE_AUTH_SMOKE:-0}" == "1" ]]; then
  run_live_auth_panel personalInformation live-auth-personal-information-panel "Live profile sync|Profile loaded|Profile sync unavailable"
  run_live_auth_panel vehicles live-auth-vehicles-panel "Live vehicle garage|Garage loaded|Vehicle sync unavailable"
  run_live_auth_panel paymentMethods live-auth-payment-methods-panel "Production authorization|Payment methods loaded|Payment status unavailable"
fi

echo "Native root smoke passed. Artifacts: $OUT"