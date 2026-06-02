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