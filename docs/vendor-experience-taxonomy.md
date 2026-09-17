# Vendor experience: native Discover and capability taxonomy

## Scope

Refactor the native Discover → Venue → Book → Arrival experience using the premium venue preview's visual hierarchy. Broni Home Taste Restaurant is the first restaurant partner designated by the product owner; that identity alone does not establish technical fulfillment readiness, verified restaurant facts, or rights to sample media.

This change is not a backend launch. It adds no booking/order endpoint, payment integration, inventory allocation, migration, or new dependency. The earlier 14-rail/HOST PR is not a prerequisite and is not included wholesale.

## Names and ownership

| Previous name | New name | Responsibility |
|---|---|---|
| `src/utils/vendorServiceCards.ts` | `src/utils/vendorExperienceCards.ts` | Existing vendor recommendation adapters and provenance-preserving source normalization |
| `src/utils/__tests__/vendorServiceCards.test.ts` | `src/utils/__tests__/vendorExperienceCards.test.ts` | Adapter regression tests, including sample restaurant identity isolation |
| `ios/App/App/NativeVenueDetailPresentation.swift` | `ios/App/App/NativeVendorExperience.swift` | Shared native place/action policies and Booking/Ordering/Requesting taxonomy |

The TypeScript module keeps its existing function exports. Runtime and type-only imports are updated; no compatibility shim or parallel old implementation is needed. The reference module is not embedded in the native application. The native implementation continues using Swift value models and existing API contracts. Existing public Swift policy names can remain stable inside the renamed file.

The standalone premium venue preview artifact is a design reference, not a production route. Its stage selector, local confirmations, generated media and fixture inventory must not be imported into the release application.

## Five independent concepts

1. **Category** answers where to browse: dining, coffee, events, and other existing categories.
2. **Intent** answers what a person wants to do: Booking, Ordering, or Requesting.
3. **Provenance and identity** establish where the data came from and which exact entity it describes.
4. **Executable capability** establishes whether this application has a supported action for that exact supply, with the current user's authorization.
5. **Transaction state** describes an actual backend result—not a selected pill, Plan attachment, or optimistic UI toggle.

Do not infer any of the last three from a category or restaurant name. A verification badge is not inventory; a menu URL is not an ordering endpoint; an accepted Plan invitation is not restaurant admission.

## Capability taxonomy

| Intent | User goal | Prerequisite | Honest result | Unsupported behavior |
|---|---|---|---|---|
| **Booking** | Reserve capacity at a specified time | Exact inventory-backed offering, supported booking path and explicit consent | Confirmed only from the authoritative booking result | Show a clear availability/integration explanation; do not synthesize time slots, holds or a confirmation |
| **Ordering** | Purchase menu items for a fulfillment method | Published item identity, quantities, fulfillment terms, supported order path and explicit consent | Order accepted only from the authoritative order result | A menu remains a menu; never substitute generic checkout or mark local selections ordered |
| **Requesting** | Ask a provider to consider a time, capacity or service | Supported request path for the exact supply and authorization | Submitted/pending until accepted; not booked or ordered | Unsupported restaurant requests must not reuse the coffee endpoint |

The current native generic restaurant Booking and Ordering paths are not mounted. The existing canonical coffee request is supported; parties continue through their separate RSVP/ticket/pass path. Do not turn the global settlement flag on as part of a visual refactor.

External provider actions identify the destination and remain handoffs. A handoff is neither a Bytspot order nor a confirmed ride. Add to Plan remains available under its own contract and does not make any fulfillment request.

## Four surfaces, one experience

### Discover — choose

- The main-branch baseline has no demo HOST pill rail. This refactor deliberately does not import the separate 14-rail/HOST prototype; real Host Studio creation and real party access are not removed.
- Preserve legitimate category browsing. The Discover reference filter rejects the known `coverage-`, `starter-`, and `companion-` IDs minted by synthetic category-filler generators. Surviving references gain no new authority.
- Use source-backed restaurant identity, one dominant next action and an independent Plan action.
- Keep unavailable price, distance, rating, hours and inventory absent or explicitly unknown.
- Use the premium hero/material language without converting sample media into venue photography.

### Venue — understand

- Reuse `NativeDeepSpaceGround` rather than layering another star field or filling the sheet with an unrelated opaque background.
- Cinematic hero, restrained vignette, readable identity and compact frosted Back/Save/Share controls.
- Call/Menu/Site utilities appear only for validated supplied destinations.
- Recorded Vibe is user-initiated and appears only when playable supplied media exists. Stop playback on dismissal/background; do not silently resume it.
- Check In remains visit validation, separate from booking control and Plan attachment.

### Book — review intent and capability

- Each Venue capability row is a real review button. `NativeVendorReviewSheet` uses the same venue identity and capability table as Discover/Venue; unsupported intents explain their limits instead of simulating completion.
- A supported request continues only after the review sheet dismisses. The parent re-resolves current capability and request status; account changes clear pending continuation, and existing requests cannot trigger another submission from the review.
- Distinguish Booking, Ordering and Requesting without introducing another demo host rail.
- Make missing fulfillment support explicit. A polished review surface does not need fake success to feel complete.
- Never display sample menu items, available slots, prices, cancellation terms or confirmation numbers as restaurant facts.
- Keep existing supported request routing and authentication handling intact; a restaurant's name never selects another provider's request endpoint.

### Arrival — get there

- One raised frosted container with distinct Drive and Ride branches.
- Retain valid-coordinate, location freshness and route-error behavior.
- Drive reviews a route. With no parking inventory connected, it cannot hold a space or promise a live count.
- Uber/Lyft remain neutral external handoffs unless a separately integrated provider contract says otherwise.
- Venue fulfillment, parking and ride state are independent. None can confirm the others.

## Luxury design patterns

- Existing deep-space material is the continuous stage; real venue media supplies visual richness.
- Use approximately 20-point gutters, 24-point section rhythm, continuous corners and generous readable typography instead of dense dashboard chrome.
- Minimum 44-point action targets; stack utility and action groups at accessibility text sizes.
- Cyan foreground emphasis expresses an executable capability, not partnership status. Listed and external states remain neutral.
- Respect Reduce Motion and Reduce Transparency. Use immediate restrained press feedback rather than perpetual glow or bouncing acquisition controls.
- Use system sheet/scroll interaction and explicit dismissal ownership to avoid competing global headers or multiple sheets.

## Restaurant partner data boundary

The premium preview's generated still/film, sample prices, opening times, parking options and local confirmation state are excluded from release. The partner restaurant's display name is not used as an authorization predicate. Production enrichment must identify the exact backend venue/vendor and supply each fact with its applicable provenance. If that integration is absent, preserve the complete visual hierarchy with honest unknown/unavailable states.

## Verification

Required regression coverage:

- Booking/Ordering/Requesting are distinct; unknown or missing supply never becomes executable.
- Restaurant name, partner context, curated flags and category labels cannot promote authority.
- Existing coffee requests and party admission remain separate from generic restaurant fulfillment.
- Add to Plan never means booked, ordered, requested or admitted.
- No dummy host/category coverage cards are added to Discover.
- Route and video lifecycle protections remain intact.
- Renamed imports and Xcode references resolve; no duplicate old implementation remains.

The adapter checks passed 406 JavaScript unit tests and TypeScript type checking. Native-root (32 checks) and App Clip packaging (45 checks) passed on the initial combined branch. The initial native commit was reported to pass its simulator build and 487 XCTest + 19 Swift Testing cases; **these results do not cover the subsequent review-sheet/accessibility correction**. A fresh macOS run and four-surface screenshots are required before final acceptance.

Validation results and any unverified device behavior will be recorded in the final PR/handoff. Simulator fixtures, if used for visual inspection, must be disclosed and must not be included in Release. This document describes the contract; it is not evidence of a live restaurant booking, order, payout, parking hold or dispatched ride.

## References

- [Discover card recommendation model](discover-card-recommendation-model.md)
- [Vendor experience adapters](../src/utils/vendorExperienceCards.ts)
- [Native vendor experience policy](../ios/App/App/NativeVendorExperience.swift)
- [Premium venue design direction](https://cosmos.augmentcode.com/files/broni-premium-venue-design-direction-2bd670a2848c46b7a95e9a069506a28b)
