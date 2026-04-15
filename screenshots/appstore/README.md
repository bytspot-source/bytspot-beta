# App Store Screenshot Upload Guide

Use this folder as the final staging area for App Store Connect screenshot uploads.

## Preferred 6.7-inch Set

These existing captures already match the correct 6.7-inch upload size (`1290x2796`):

1. `../6.7inch_01_landing.png` — branded welcome / first impression
2. `../6.7inch_03_home.png` — main personalized home experience
3. `../6.7inch_04_venues.png` — venue feed / live discovery
4. `../6.7inch_05_discover.png` — swipeable discover cards

## Recommended Additional Captures Before Final Upload

Capture these at the same 6.7-inch size before final App Store submission if you want a stronger 5–7 screenshot set:

- Map view with live venue markers
- Parking reservation flow
- Venue detail sheet
- Profile / saved spots / access wallet

## Important

- Do **not** mix the 6.7-inch set with smaller screenshots such as `1170x2532` or `780x1688`.
- `screenshots/vibe-map/*` and `screenshots/reservation/*` are useful references, but several of those files are not the same App Store upload size.
- If you re-capture, use `scripts/capture-screenshots.mjs` and keep the final upload set visually consistent.

## Suggested Upload Order

1. Welcome / brand
2. Home feed
3. Venue feed
4. Discover cards
5. Map or parking flow
6. Venue details
7. Profile / saved spots
