# GH Akwaaba Pass · FIFA Matchday Platinum Patch Integration

GH Akwaaba Pass brokers FIFA ticket access through the Platinum event flow.

## 1. Register the service

Call `vendors.createService` with `buildGhAkwaabaFifaServicePayload()`:

```json
{
  "title": "FIFA Matchday Pass",
  "description": "Premium FIFA event access brokered by GH Akwaaba Pass with Bytspot Platinum concierge support.",
  "category": "events",
  "tier": "platinum",
  "tagline": "Premium Event Access & Concierge",
  "etaLabel": "Digital pass ready",
  "includedHighlights": ["Fast-track entry", "VIP Lounge access", "Digital pass delivery", "On-site host support"],
  "priceCents": 5000,
  "durationMins": 240,
  "maxGuests": 4,
  "patchRequired": true,
  "status": "active"
}
```

## 2. Create the patch

Call `vendors.createPatch`:

```json
{
  "label": "FIFA Matchday Entry",
  "serviceId": "<SERVICE_ID>"
}
```

## 3. Encode the patch link

Use `buildGhAkwaabaPassPatchUrl({ patchId, serviceId })`:

```text
https://bytspot.app/p/<PATCH_ID>?patch=<PATCH_ID>&venue=GH%20Akwaaba%20Pass&tier=platinum&service=<SERVICE_ID>
```

Short Ghanaian FIFA sale link for marketing, NFC/QR testing, and App Clip Advanced Experience setup:

```text
https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass
```

Thumbnail/header creative:

```text
https://bytspot.app/media/gh-akwaaba-fifa-ghana-thumbnail.png
```

Use this 1800×1200 PNG for the App Store Connect Advanced App Clip Experience header image.

## 4. App Clip search calls on tap

Service catalog resolution:

```json
{ "patchId": "<PATCH_ID>", "tier": "platinum", "limit": 24 }
```

Vendor details for the selected FIFA service:

```json
{ "patchId": "<PATCH_ID>", "serviceId": "<SERVICE_ID>", "tier": "platinum", "limit": 6 }
```

## 5. Success handoff

The App Clip Platinum event success flow opens the main app with:

```text
context=platinum_event_pass&destination=digital_pass&view=event_pass&intent=view_digital_pass
```

This surfaces the `View Digital Pass` and `Request Platinum Ride` logistics panel.

## 6. App Clip card / ASDErrorDomain 507 checklist

If iOS shows the App Clip card but opening fails with `ASDErrorDomain error 507`, verify:

- App Store Connect has an Advanced App Clip Experience for the exact URL prefix `/p/gh-akwaaba-fifa-ghana`.
- The header image uses `public/media/gh-akwaaba-fifa-ghana-thumbnail.png`.
- `apple-app-site-association` includes `/p/*` and the compatibility `/patch` path.
- `index.html` Smart App Banner default `app-argument` points to an AASA-matched `/p/...` URL, not bare `/patch`.
- The Clip entitlement includes `appclips:bytspot.app` and `appclips:bytspot.com`.

## 7. Simulator video hero preview

The App Clip DEBUG build uses `ClipVendor.fallbacks` → `previewMedia(...)` to attach a sample looping video to the first fallback vendor. For GH Akwaaba/FIFA, the video poster now falls back to the GH Akwaaba thumbnail.

Launch the checkout hero directly:

```bash
xcrun simctl launch <SIM_UDID> com.bytspot.app.Clip _XCAppClipURL \
  'https://bytspot.app/p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass&step=checkout'
```

Expected visual state:

- hero surface uses `ClipAutoLoopingPlayer`
- video autoplays muted/looping in DEBUG
- poster/thumbnail resolves to `https://bytspot.app/media/gh-akwaaba-fifa-ghana-thumbnail.png`
- service title is `GH Akwaaba Pass`