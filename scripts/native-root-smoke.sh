#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

UDID="${UDID:-054C674B-01A4-428F-A036-68A4899B9BAC}"
BUNDLE_ID="${BUNDLE_ID:-com.bytspot.app}"
CONFIGURATION="${CONFIGURATION:-Debug}"
DERIVED_DATA="${DERIVED_DATA:-ios/App/build/NativeRootSmoke}"
APP="$PWD/$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/App.app"
OUT="${OUT:-$PWD/.dev-screenshots/native-root-smoke}"
SMOKE_TMP="${TMPDIR:?TMPDIR must be set}/bytspot-native-root-smoke"
mkdir -p "$OUT" "$SMOKE_TMP"

cat >"$SMOKE_TMP/ocr.swift" <<'SWIFT'
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

cat >"$SMOKE_TMP/luma.swift" <<'SWIFT'
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
  grep -q "BYT_NATIVE_PREVIEW_AUTH" ios/App/App/BytspotNativeAppRoot.swift && grep -q "BYT_NATIVE_PREVIEW_AUTH" scripts/native-root-smoke.sh && grep -q "BYT_NATIVE_PREVIEW_AUTH" docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_PREVIEW_LOCATION" ios/App/App/BytspotNativeAppRoot.swift && grep -q "BYT_NATIVE_PREVIEW_LOCATION" scripts/native-root-smoke.sh && grep -q "BYT_NATIVE_PREVIEW_LOCATION" docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_PREVIEW_PERSONALIZATION" ios/App/App/BytspotNativeAppRoot.swift && grep -q "BYT_NATIVE_PREVIEW_PERSONALIZATION" scripts/native-root-smoke.sh && grep -q "BYT_NATIVE_PREVIEW_PERSONALIZATION" docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_LAUNCH_AUTORUN" ios/App/App/BytspotNativeAppRoot.swift && grep -q "BYT_NATIVE_LAUNCH_AUTORUN" scripts/native-root-smoke.sh && grep -q "BYT_NATIVE_LAUNCH_AUTORUN" docs/native-profile-product-wireframe-contract.md
  grep -q "bytspot_native_launch_vibe" ios/App/App/BytspotNativeAppRoot.swift ios/App/App/NativeAuthSeamSelfTests.swift docs/native-profile-product-wireframe-contract.md
  grep -q "Sign in to save your experience" ios/App/App/BytspotNativeAppRoot.swift && grep -q "Sign in to save your experience" scripts/native-root-smoke.sh && grep -q "Sign in to save your experience" docs/native-profile-product-wireframe-contract.md
  grep -q "at least 6 characters" ios/App/App/BytspotNativeAppRoot.swift && grep -q "at least 6 characters" ios/App/App/NativeAuthSeamSelfTests.swift && grep -q "at least 6 characters" docs/native-profile-product-wireframe-contract.md
  ! grep -Eq "Let's Go|Sign in to save these picks|at least 8 characters|Atlanta picks|Personalization → Atlanta" docs/native-profile-product-wireframe-contract.md
  grep -q "Native Fallback Audit" docs/native-profile-product-wireframe-contract.md
  grep -q "BYT_NATIVE_SUPPRESS_LOCATION_PROMPT" ios/App/App/NativeShellView.swift scripts/native-root-smoke.sh
  ! grep -q "bytspot_saved_spots_planned_ids" ios/App/App/NativeShellView.swift
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
  luma=$(swift "$SMOKE_TMP/luma.swift" "$shot")
  echo "$name luma=$luma" | tee "$OUT/$name.luma.txt"
}

ocr() {
  local name="$1"
  swift "$SMOKE_TMP/ocr.swift" "$OUT/$name.png" | tee "$OUT/$name.ocr.txt"
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
  env SIMCTL_CHILD_BYT_NATIVE_ROOT=1 SIMCTL_CHILD_BYT_NATIVE_APPEARANCE=light SIMCTL_CHILD_BYT_NATIVE_SUPPRESS_LOCATION_PROMPT=1 SIMCTL_CHILD_BYT_NATIVE_LAUNCH_AUTORUN=1 \
    xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" >/dev/null
  sleep "${SMOKE_TAP_SLEEP:-12}"
  xcrun simctl io "$UDID" screenshot "$OUT/tapthrough-main.png" >/dev/null
  local luma
  luma=$(swift "$SMOKE_TMP/luma.swift" "$OUT/tapthrough-main.png")
  echo "tapthrough-main luma=$luma" | tee "$OUT/tapthrough-main.luma.txt"
  swift "$SMOKE_TMP/ocr.swift" "$OUT/tapthrough-main.png" | tee "$OUT/tapthrough-main.ocr.txt"
  ! grep -Eiq "Back to native" "$OUT/tapthrough-main.ocr.txt"
  expect_ocr tapthrough-main "Home"
  expect_ocr tapthrough-main "Local picks are updating"
  expect_ocr tapthrough-main "Open Discover"
  expect_ocr tapthrough-main "Map near me"
  if grep -Eiq "YOUR BYTSPOT IS READY|YOUR PICKS ARE READY|Start Exploring" "$OUT/tapthrough-main.ocr.txt"; then
    echo "Autorun remained on a Ready screen instead of reaching Home" >&2
    exit 1
  fi
}

run_launch_visual_captures() {
  capture native-splash SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SPLASH=1
  ocr native-splash
  expect_ocr native-splash "BYTSPOT"
  expect_ocr native-splash "Your perfect spot awaits"
  expect_ocr native-splash "A(I|l)-Powered"

  capture native-landing SIMCTL_CHILD_BYT_NATIVE_PREVIEW_LANDING=1
  ocr native-landing
  expect_ocr native-landing "Know Before You Go"
  expect_ocr native-landing "Get Started"
  expect_ocr native-landing "Terms & Privacy"

  xcrun simctl privacy "$UDID" reset location "$BUNDLE_ID" >/dev/null 2>&1 || true
  capture native-location SIMCTL_CHILD_BYT_NATIVE_PREVIEW_LOCATION=1
  ocr native-location
  expect_ocr native-location "Find what fits"
  expect_ocr native-location "Use My Location"
  expect_ocr native-location "Not Now"

  capture native-personalization-vibe SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=vibe
  ocr native-personalization-vibe
  expect_ocr native-personalization-vibe "What would make|What kind of night"
  expect_ocr native-personalization-vibe "coffee|Dinner|Keep the night"
  expect_ocr native-personalization-vibe "meal|good drink|Something goo"
  expect_ocr native-personalization-vibe "quiet place|happening|comfortable"
  expect_ocr native-personalization-vibe "Easy arrival|Date-night|smooth ride"

  capture native-personalization-walk SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=walk
  ocr native-personalization-walk
  expect_ocr native-personalization-walk "comfortable going"
  expect_ocr native-personalization-walk "Right nearby"
  expect_ocr native-personalization-walk "short walk"
  expect_ocr native-personalization-walk "Easy arrival"

  capture native-personalization-crew SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=crew
  ocr native-personalization-crew
  expect_ocr native-personalization-crew "Who.?s coming"
  expect_ocr native-personalization-crew "Just me"
  expect_ocr native-personalization-crew "A group"
  expect_ocr native-personalization-crew "Work or client"

  capture native-personalization-ready SIMCTL_CHILD_BYT_NATIVE_PREVIEW_PERSONALIZATION=recommendations
  ocr native-personalization-ready
  expect_ocr native-personalization-ready "Your Bytspot is ready"
  expect_ocr native-personalization-ready "Discover with context"
  expect_ocr native-personalization-ready "Simplify your arrival"
  expect_ocr native-personalization-ready "Start Exploring"
  expect_ocr native-personalization-ready "Sign in to save your experience"

  tap_launch_journey

  capture native-auth-signup SIMCTL_CHILD_BYT_NATIVE_PREVIEW_AUTH=signup
  ocr native-auth-signup
  expect_ocr native-auth-signup "Welcome"
  expect_ocr native-auth-signup "to Bytspot"
  expect_ocr native-auth-signup "Sign Up"
  expect_ocr native-auth-signup "Continue with Apple"
  expect_ocr native-auth-signup "Invite code"

  capture native-auth-login SIMCTL_CHILD_BYT_NATIVE_PREVIEW_AUTH=login
  ocr native-auth-login
  expect_ocr native-auth-login "Welcome"
  expect_ocr native-auth-login "to Bytspot"
  expect_ocr native-auth-login "Log In"
  expect_ocr native-auth-login "Forgot password"
  expect_ocr native-auth-login "Continue with Google"
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
expect_ocr home "Home"
expect_ocr home "Start here"
expect_ocr home "Coffee"
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
run_panel savedSpots saved-spots-panel "Saved Spots|Review|View Details"
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