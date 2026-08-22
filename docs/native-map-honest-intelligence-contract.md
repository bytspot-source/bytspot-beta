# Native Map — Honest Intelligence Contract

Status: **draft for review**. Nothing below is implemented except where marked
`SLICE 0`.

The Map is the only Bytspot surface that currently states things Bytspot cannot
know. This contract defines what the Map is allowed to say, what it must delete,
and what replaces it.

---

## 1. The invariant

> A Map claim must be falsifiable and must declare its source.

Corollary: **if Bytspot cannot be wrong about a number, it is not a signal — it
is decoration.** Decoration is removed, not relabelled.

---

## 2. The truth ladder

Every rendered claim carries exactly one tier. The tier is part of the data, not
part of the copy.

| Tier | Name | Source | Decays? | Example phrasing |
|---|---|---|---|---|
| 0 | **Fact** | geography, posted rules, computed route, traffic ETA | no (rules: on survey expiry) | "12 min drive · 4 min walk" |
| 1 | **Typical** | historical curve by hour/day/category | no | "usually busy after 10pm" |
| 2 | **Evidenced** | guest list, RSVPs, host run of show | no | "14 confirmed · doors 9:40" |
| 3 | **Live** | verified check-ins clearing quorum | yes (freshness) | "verified busy · 20 min ago" |

Attributed third-party live data (Apple traffic ETA, Google opening hours) is
Tier 0 **when attributed**. Unattributed, it is not renderable.

**Tier 3 does not exist on the Map until check-in quorum exists.** No copy may
imply it.

---

## 3. What is deleted

These are removed outright. None are relabelled, because each is a claim with no
possible source.

| Item | Location | Why |
|---|---|---|
| `ParkingSpot.available` | API schema, `venues.ts`, seed | Nothing in the codebase ever writes it. The number a user sees is a constant from seed time. |
| "Available spots with listed pricing" | Map function row | States availability. Unknowable without a feed. |
| **"LIVE" badge** on the Smart Parking rail | `smartParkingRail` | Hardcoded. Sits above static seeded pins. |
| "Live Venue Data" | Map function row | Backed by `typicalLevel` + jitter. |
| "Real-time crowd momentum & arrivals" | Trending Hotspots row | Same simulated curve. |
| **Heatmap** toggle | Intelligence Filters | `showHeatmap` is never read by any rendering code. Tapping it does nothing. |
| **Paid** toggle | Intelligence Filters | Map-local `entryFilter` is read only by the chip's own highlight. Filters nothing. |
| `totalAvailable` spot counts | Home Trending cards | Same false availability number. |

A heatmap over simulated data is a *more* convincing untruth than a label, so it
is deleted rather than wired.

---

## 4. Parking becomes a zone, never a space

Bytspot never claims a count. It claims **where you may legally leave a car, and
what the posted rules were on a stated date.**

Every zone carries provenance:

- geometry and name
- rule text as posted
- hours / restriction window
- `surveyedAt` (date a human read the sign)
- `source` (OSM candidate + human survey)
- `expiresAt` — **rules stop rendering when stale**, exactly like share links

Rendering rules:

- Displayed as **"Posted rules as of 14 Mar — verify signage"**. Never "free".
- A zone with no human survey is **not rendered**, regardless of OSM tags.
- Absence of an OSM `fee` tag never implies free.
- Ambiguous zones are omitted, not guessed.

---

## 5. OpenStreetMap is a candidate generator, not a source of truth

Pipeline is one-time extraction, not a runtime dependency:

1. Geofabrik Georgia extract (or Overpass for a corridor bbox) — one-shot only.
2. Filter `amenity=parking` with explicit `fee=no` / `access=yes`, plus tagged
   street segments, inside the corridor.
3. **Human survey pass** — walk it, read signage, record rules and date.
4. Seed into Bytspot Postgres as a first-class table.
5. App reads Bytspot's DB. Never OSM at runtime.

### Licensing — unresolved

OSM is **ODbL 1.0**. Attribution ("© OpenStreetMap contributors") is mandatory
and must be visible on the Map surface. Share-alike may attach to a derived
database.

The human-verified layer is arguably Bytspot's own data rather than a
derivative — but that is a legal question, not an engineering one. **Treated as
a live constraint until counsel says otherwise.** Publishing verified zones back
to OSM is a purpose decision worth taking deliberately rather than by default.

---

## 6. The pre-handoff card replaces the function sheet

Tapping a place shows this before leaving the app:

> **12 min drive**, traffic now · park on **5th St NW**, posted rules as of 14 Mar
> · **4 min walk** to the door · open until 2am

Every value is Tier 0. No partner required. This card is the collapse thesis —
hang + stall — rendered from public data.

The 13 existing controls (3 layer toggles × 4 modes × 6 chips) collapse. Chips
become **explanation, not input**: they state why the map looks as it does. A
chip that explains cannot be dead, because it either has something to say or it
is not rendered.

### Map states

| State | Shows |
|---|---|
| No place selected | corridor, doors, surveyed zones, OSM attribution |
| Place selected | the pre-handoff card |
| Active pass | your door and your stall only |

---

## 7. Real-life situations

Including the ones where this design fails.

| # | Situation | Contract behaviour | Bad outcome if ignored |
|---|---|---|---|
| 1 | Zone verified in March, sign changed in July | Rules expire and stop rendering | **User is towed. Concrete financial harm, attributable to Bytspot.** |
| 2 | OSM has `amenity=parking`, no `fee` tag | Not rendered | Inferring "free" tows someone |
| 3 | Lot is `access=customers` | Not rendered as public | User parks, is booted, blames the app |
| 4 | Event night — street closed, zone suspended | Zone hidden when a party at that venue is live and host flags closure | User circles the block the app told them to use |
| 5 | No surveyed zone near the door | Card omits the stall line entirely | Fabricating a zone is the worst possible failure |
| 6 | Traffic ETA unavailable (no network) | Distance only, no ETA | A stale ETA is a lie with a number on it |
| 7 | Venue closed at arrival | "Open until" from Places, attributed | User drives to a locked door |
| 8 | Accessible parking needed | Out of scope v1, and **stated as out of scope** | Silent omission implies none exists |
| 9 | User arrives, stall is full | Bytspot never claimed a space, only a zone | Claiming a count creates a promise that breaks |
| 10 | Rain / late night safety | Walk time shown, no route safety claim | Implying a route is safe is unfalsifiable |

Situation 1 is the defining risk of this contract. **Being wrong here costs a
user real money**, which makes survey expiry a hard requirement, not a polish
item.

---

## 8. Five-layer scoring

Each decision scored against **coherent : alignment : resonance : meaning :
purpose**.

| Decision | Coherent | Alignment | Resonance | Meaning | Purpose |
|---|---|---|---|---|---|
| Delete `available` count | ✅ removes false artifact | ✅ stops profiting from a fake number | ➖ loses a satisfying digit | ✅ prevents wasted trips | ✅ first real refusal |
| Delete Heatmap / Paid | ✅ ends dead controls | ➖ neutral | ➖ fewer things to press | ➖ neutral | ✅ refuses theatre |
| Zone, not space | ✅ claim matches capability | ✅ no promise that can break | ✅ certainty beats urgency | ✅ user actually parks | ✅ honest by construction |
| Survey expiry | ✅ enforced, not intended | ✅ user protected over coverage | ➖ shrinks the map over time | ✅ prevents towing | ✅ costs coverage on purpose |
| Pre-handoff card | ✅ one state, one story | ✅ value before the handoff | ✅ **the resonant moment** | ✅ leaves home with a plan | ✅ collapse thesis realised |
| Tier 0 floor before Tier 3 | ✅ ladder honest at every rung | ✅ no borrowed credibility | ➖ quieter than competitors | ✅ true today | ✅ patience as principle |

**Resonance is the weak column, and that is expected.** The honest substitute
for urgency is *certainty* — a scarcer emotion, and one unavailable to anyone
who inflated their numbers earlier.

### Bad directions this contract rejects

| Rejected | Why | Layer that vetoes it |
|---|---|---|
| Wire the heatmap to simulated data | A prettier lie is still a lie | Alignment |
| Infer "free" from missing OSM tags | Tows people | Purpose |
| Keep "LIVE" badge, add small print | Small print does not make a claim true | Coherence |
| Buy a parking availability feed now | Pre-growth spend on a promise still unearned | Meaning |
| Let hosts tune their own vibe or zone | Turns a signal into advertising | Alignment |
| Ship coverage beyond the survey | Coverage is not the product; being right is | Purpose |

---

## 9. Guards and tests

Enforced in code, per the contract → guard → test pattern:

1. No Map string may contain "Live", "Real-time", or "Now" over Tier 0/1 data.
2. Every rendered zone must have a non-nil `surveyedAt` within the expiry window.
3. Every filter chip must be read by a filter function — a chip whose state is
   never consumed fails the build.
4. OSM attribution must be present whenever zone geometry renders.
5. `ParkingSpot.available` must not exist in schema or response payloads.

Guard 3 is the general fix for the Heatmap/Paid class of defect, and the same
species as the Passport wireframe guard.

---

## 10. Non-goals (v1)

- Live occupancy of any kind
- Paid parking, reservations, or valet settlement
- Accessible / EV parking (stated as out of scope, not silently omitted)
- Coverage beyond the surveyed corridor
- Route safety claims

---

## 11. Slice 0 — approved scope

Look-only, reversible, no schema change, no new rails:

- Delete the "LIVE" badge from the Smart Parking rail
- Delete the Heatmap and Paid chips
- Relabel "Live Venue Data" and "Real-time crowd momentum" to Typical-honest copy
- Remove availability counts from Map and Home cards
- Update the parity self-tests that pin the old strings

Everything else in this contract awaits review.
