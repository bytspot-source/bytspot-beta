# Native Shell Phase 1 Checkpoint

Last known green point for the opt-in SwiftUI main-app shell migration.

## Scope

- Native work remains gated by `BYT_NATIVE_ROOT=1` or `bytspot_native_root_enabled`.
- Default App Store launch path must remain the Capacitor/React webview.
- App Clip target remains independent and must continue to build.

## Primary files

- `ios/App/App/AppDelegate.swift`
- `ios/App/App/BytspotNativeAppRoot.swift`
- `ios/App/App/NativeMigrationCore.swift`
- `ios/App/App/BytspotNativeRouting.swift`
- `ios/App/App/NativeShellView.swift`
- `ios/App/App/BytspotAPIClient.swift`
- `ios/App/App/BytspotNativeAuth.swift`
- DEBUG self-tests under `ios/App/App/Native*SelfTests.swift`

## Last passing validation commands

Run from `bytspot-beta`:

```bash
git diff --check
node scripts/assert-ios-capacitor-root.mjs
node scripts/assert-ios-app-clip-packaging.mjs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/App/build/NativeShellPhase1 CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/App/App.xcodeproj -scheme Clip -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/App/build/NativeShellPhase1Clip CODE_SIGNING_ALLOWED=NO build
SIMCTL_CHILD_BYT_NATIVE_ROOT=1 SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER=green xcrun simctl launch --terminate-running-process booted com.bytspot.app
```

## Recovery steps if the app stops working

1. Confirm whether native mode is enabled. If shipping behavior is broken, unset `BYT_NATIVE_ROOT` and clear `bytspot_native_root_enabled` first.
2. Run `node scripts/assert-ios-capacitor-root.mjs`. If this fails, fix `AppDelegate.swift` before touching UI code.
3. Run `git diff --check`, then rebuild only the `App` scheme.
4. If `App` builds, run the `Clip` scheme to verify App Clip isolation.
5. If the failure appears only in native mode, launch with `BYT_NATIVE_ROOT=1`; DEBUG self-tests run from `BytspotNativeAppRoot.init()`.
6. For simulator launches, pass env through `SIMCTL_CHILD_*`; this local `simctl` does not accept `launch --env`.

## Known compatibility note

The native tab label intentionally avoids SwiftUI `tracking`/`kerning` because this project targets iOS 15.0 and the current SDK marks those modifiers iOS 16+ for this target.