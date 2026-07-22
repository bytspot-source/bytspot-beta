# Bytspot — App Review Notes

Copy/paste these notes into App Store Connect for the current submission build.

## Review Notes

Thank you for reviewing Bytspot.

- No special demo account is required.
- Launch the app, tap **Get Started**, then tap **Continue as Guest** to enter the core experience immediately.
- The tab bar is **Home · Discover · Map · Concierge**. Profile is opened from the Home screen (avatar/profile entry), not from the tab bar.
- The main reviewable flows for this build are:
  - Home feed / tiered member experience cards
  - Discover cards and filters (swipeable card deck)
  - Map view
  - Concierge chat (AI answers require a signed-in account; guest sessions receive on-device help responses labeled "Local help")
  - Profile, legal links, and saved content (from Home)
  - Parking reservation preview flow

## Review-Build Notes

- This submission build is focused on the Bytspot consumer experience. Non-consumer business tools and operations utilities are not available in the review build.
- The iOS App target is pure native SwiftUI. It does not launch, embed, or package a Capacitor/React webview, web bundle, Cordova config, or Capacitor SwiftPM bridge.
- The repository root still contains Capacitor npm packages for the separate React web beta only. Those packages are not linked into the iOS App target or bundled in the App Store submission.
- Bytspot Home shows consumer-facing Explorer, My Access, and VIP experience cards only. Internal prioritization metrics are not exposed in the app.
- Location permission is optional. The app can still be reviewed without granting location access.
- The full App target does not request notification permission. The App Clip may request ephemeral notification authorization for invite follow-up, as declared in the App Clip plist.
- The app does **not** use background location.
- Any parking/access confirmation previews shown in this build are in-app preview flows only. No external payment is processed in this submission build.

## Suggested Quick Path

1. Open the app
2. Tap **Get Started**
3. Tap **Continue as Guest**
4. Review the **Home**, **Discover**, **Map**, and **Concierge** tabs
5. From **Home**, open **Profile** to review account, legal links, and saved content
6. Open a parking flow to confirm the in-app reservation preview behavior

## App Clip

- The App Clip is invoked from Bytspot group-event invite links hosted at `https://bytspot.app` (registered App Clip experience).
- It presents the event invite with RSVP (join / decline) in a single screen; joining does not require the full app.
- It may request ephemeral notification authorization so invite follow-up can be shown during the App Clip session.
- A "Get the full app" handoff opens the App Store product page; state is shared with the full app via an App Group.

## Support

- Support URL: https://bytspot.com/support
- Privacy Policy: https://bytspot.com/privacy
- Terms: https://bytspot.com/terms
