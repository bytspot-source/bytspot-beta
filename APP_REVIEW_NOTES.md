# Bytspot — App Review Notes

Copy/paste these notes into App Store Connect for the current submission build.
Demo account passwords belong in the App Store Connect sign-in fields, not in
this file or the repository.

## Demo Accounts

Two accounts are provided, because one of the reviewable flows deletes the
account it is testing.

| Account | Use |
| --- | --- |
| `appreview+1@bytspot.com` | General review — everything except account deletion |
| `appreview+2@bytspot.com` | Account deletion and restoration |

Deleting an account starts a 30-day grace period during which the address stays
reserved, so `appreview+2` cannot be signed up again immediately after the test.
Signing back in with the same credentials during the grace period cancels the
deletion and returns the account to normal — the app states this on screen when
it happens. Please use `appreview+1` for any review that follows the deletion
test.

## Review Notes

Thank you for reviewing Bytspot.

- Bytspot is an invitation and access app for parties and venues. A host
  publishes a Party, shares a link, and guests hold a pass to get in.
- The main reviewable flows for this build are:
  - **Party Pass** — open a party invitation, RSVP, and view the resulting pass
  - **Host Studio** — create and publish a Party, then share its link
  - **Party Control** — the host's view of their guest list, admissions, and
    share-link expiry
  - **Network** — find contacts already on Bytspot (requires Contacts access)
  - **Account deletion and restoration** — Profile → account settings
  - Home, Discover, Map, and Concierge browsing
- Profile is opened from the Home screen (avatar/profile entry), not from the
  tab bar.

## Account Deletion — Guideline 5.1.1(v)

- In-app deletion is at **Profile → account settings → Delete Account**.
- Confirming deletion signs the member out immediately and revokes the session.
- Deletion is soft for a fixed 30-day grace period, then the record is purged
  irreversibly. Identity hashes used for contact discovery are removed at the
  point of request rather than at purge.
- Signing in again within the grace period cancels the deletion, and the app
  reports the restoration rather than restoring silently.

## Permissions

- **Notifications** — the full app requests notification authorization only when
  the member turns alerts on in notification settings. It is never requested at
  launch. Alerts cover party activity (a guest RSVP reaching a host, a host's
  decision reaching that guest, and arrival at the door), reservations and
  reminders. The App Clip may request ephemeral authorization for invite
  follow-up during the Clip session, as declared in the App Clip plist.
- **Location** — optional. The app can be reviewed without granting it. The app
  does **not** use background location.
- **Contacts** — optional, and only requested from the Network screen. Contact
  discovery matches on salted hashes; raw contact details are not stored.

## Review-Build Notes

- The iOS App target is pure native SwiftUI. It does not launch, embed, or
  package a Capacitor/React webview, web bundle, Cordova config, or Capacitor
  SwiftPM bridge.
- The repository root still contains Capacitor npm packages for the separate
  React web beta only. Those packages are not linked into the iOS App target or
  bundled in the App Store submission.
- Occupancy and availability shown for venues is labelled by source. Anything
  described as typical is a historical pattern, not a live reading, and the app
  does not present the two as the same thing.
- Payment for paid tickets is processed in-app through the platform payment
  flow. Where a detector cannot settle a purchase, checkout is not offered.

## Suggested Quick Path

1. Open the app and sign in with `appreview+1@bytspot.com`
2. From **Home**, open **Host Studio** and publish a Party, then share its link
3. Open that link to see the Party Pass and RSVP flow
4. Open **Party Control** to review the guest list, admissions, and share-link
   expiry
5. Review **Home**, **Discover**, **Map**, and **Concierge**
6. From **Home**, open **Profile** for account settings and legal links
7. Sign out, sign in with `appreview+2@bytspot.com`, and test **Delete
   Account**; sign in again with the same credentials to see the restoration

## App Clip

- The App Clip is invoked from Bytspot party invitation links hosted at
  `https://bytspot.app/party/…` (registered App Clip experience).
- It presents the invitation with RSVP in a single screen; joining does not
  require the full app.
- It may request ephemeral notification authorization so invite follow-up can be
  shown during the App Clip session.
- A "Get the full app" handoff opens the App Store product page; state is shared
  with the full app via an App Group.
- Share links expire when the party ends. An expired link is indistinguishable
  from a party that never existed, by design. Guests who already hold a pass
  keep it after expiry.

## Support

- Privacy Policy: https://bytspot.app/privacy
- Terms: https://bytspot.app/terms
- Support URL: **not yet published.** `bytspot.com` does not serve these pages
  (all three return 404) and `bytspot.app/support` currently returns the app
  handoff page with no contact route. A real support page is required before
  submission.
