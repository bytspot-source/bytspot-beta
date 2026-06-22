# Bytspot Discover Card Recommendation Model

## Purpose

Bytspot Discover should not feel like a Google/Yelp directory. It should feel like a curated decision surface:

> Google helps users find places. Bytspot helps users choose experiences.

Every Discover card should answer four questions quickly:

1. **What is it?**
2. **Why should I care?**
3. **Can I act now?**
4. **What is the best next step?**

The card is the scan layer. The detail sheet is the action layer.

---

## Recommendation pipeline

```text
Provider data → Adapter → Match document → Simplex ranking → Recommendation card → Detail actions
```

### Providers

Provider APIs supply raw data only:

- Google Places: photos, hours, address, phone, rating, place ID.
- Yelp Fusion: categories, price, photos, reviews, phone, business ID.
- Bytspot vendors: menu, price, availability, patch ID, checkout, contact, media.
- Curated fixtures: editorial cards used as fallback or launch content.

Providers should never directly own card copy, ranking, CTA hierarchy, or Bytspot trust language.

### Adapter output

All sources should normalize into a Bytspot match document before ranking:

```ts
type BytspotVendorMatchDocument = {
  id: string;
  provider: 'bytspot' | 'google_places' | 'yelp_fusion' | 'curated';
  providerId?: string;
  name: string;
  description?: string;
  categories: string[];
  tags: string[];
  priceLabel?: string;
  rating?: number;
  reviewCount?: number;
  location?: { label?: string; address?: string; lat?: number; lng?: number };
  availability?: { label: string; opensAt?: string; closesAt?: string; status: 'open' | 'closing_soon' | 'opens_soon' | 'closed' | 'unknown' };
  media?: Array<{ url: string; kind: 'image' | 'video_thumbnail'; attribution?: string }>;
  trust: BytspotTrustModel;
};
```

---

## Patch-verified trust model

Patch verification is a Bytspot-native differentiator. It means the vendor, venue, or access point has a Bytspot trust relationship beyond generic provider metadata.

```ts
type BytspotTrustModel = {
  verified: boolean;
  patchVerified: boolean;
  patchId?: string;
  verificationLevel: 'none' | 'curated' | 'vendor_verified' | 'patch_verified';
  sourceConfidence: 'low' | 'medium' | 'high';
};
```

### Source priority

Recommendation confidence should generally rank sources like this:

1. Patch-verified Bytspot vendor
2. Bytspot vendor-verified / approved vendor
3. Internal curated Bytspot recommendation
4. Google/Yelp enriched place
5. Generic external result

### Simplex scoring implication

Patch verification should boost marketplace trust in the Simplex score:

```text
Es = Φ_EM + Φ_E + ΔD + f × λ_sim
```

Patch-verified vendors should receive a stronger `Φ_EM` trust boost because Bytspot can stand behind them more confidently than a generic provider listing.

---

## Discover card model

The UI should render from a recommendation-specific card model, not directly from provider data.

```ts
type BytspotRecommendationCard = {
  id: string;
  vendorId: string;
  sourceProvider: string;
  categoryLabel: string;
  trustBadge?: 'Patch verified' | 'Bytspot verified' | 'Curated';
  title: string;
  subtitle: string;
  heroMediaUrl?: string;
  priceLine?: string;
  highlightLine: string;
  availability: {
    label: string;
    tone: 'green' | 'amber' | 'cyan' | 'red' | 'gray';
  };
  locationContext: string;
  primaryCTA: string;
  matchReason?: string[];
};
```

### Card hierarchy

The front card should remain decision-first and avoid directory clutter.

```text
Category / trust badge
Title
Subtitle
Price line
Highlights
Availability + location context
Single primary CTA
```

The card should not show multiple competing CTAs. For example, avoid showing both `View Menu` and `Details` when both open the same sheet.

---

## Patch-verified card treatment

Patch verification should be visible but not noisy.

Recommended badge copy:

```text
Patch verified
```

or compact badge pairing:

```text
Dining · Patch verified
```

Patch verification should imply:

- Higher ranking confidence.
- More confident recommendation copy.
- Stronger trust badge.
- Better detail trust section.
- Eligibility for patch/proximity actions when trust gates pass.

It should not automatically unlock irreversible actions. Scan, redeem, burn, or checkout actions must still obey the Trust Ladder and proximity/auth gates.

---

## Example: Broni Home Taste

```text
Dining · Patch verified

Broni Home Taste
Ghanaian comfort food, ready for pickup or delivery.

From $21 · Available now
Jollof + chicken · Banku + tilapia
Open now · until 10pm · Atlanta area

View Menu →
```

If currently closed:

```text
Dining · Patch verified

Broni Home Taste
Ghanaian comfort food, ready for pickup or delivery.

From $21 · Available now
Jollof + chicken · Banku + tilapia
Opens soon · 11am · Atlanta area

View Menu →
```

---

## Detail sheet model

The detail sheet is where secondary actions belong.

```ts
type BytspotRecommendationDetail = {
  cardId: string;
  media: Array<{ url: string; kind: 'image' | 'video_thumbnail' }>;
  included: string[];
  availabilityDetail: string;
  locationDetail: string;
  trustExplanation?: string;
  actions: DetailAction[];
  providerAttribution?: string[];
};

type DetailAction =
  | 'view_menu'
  | 'contact'
  | 'directions'
  | 'save'
  | 'share'
  | 'concierge'
  | 'check_in'
  | 'scan_patch';
```

### Broni detail actions

```text
View Menu
Contact
Directions
Save
Share
Concierge
```

If patch/proximity trust gates pass, the detail sheet may additionally show:

```text
Check In
Scan Patch
Redeem
```

---

## Availability tones

Use availability as a decision signal, not a directory badge.

```text
Green  = Open now · until 10pm
Amber  = Closing soon · closes 10pm
Cyan   = Opens soon · 11am
Red    = Closed · opens 11am
Gray   = Hours pending · contact to confirm
```

If hours are not verified, prefer honest copy:

```text
Contact to confirm today
```

Do not invent hours for provider-enriched listings.

---

## Provider attribution

Google/Yelp attribution should live in details, not as the card identity.

Recommended detail copy:

```text
Place details may be enriched by Google/Yelp. Recommendation ranked by Bytspot.
```

The card identity should remain Bytspot-owned:

```text
Patch verified
Curated for you
Matched to your taste
```

---

## Implementation checklist

- Normalize every provider into `BytspotVendorMatchDocument`.
- Apply Simplex ranking before card rendering.
- Map ranked documents into `BytspotRecommendationCard`.
- Show one primary CTA on the card.
- Move all secondary actions into details.
- Show patch verification as a trust badge and ranking boost.
- Use availability color/tone as a decision signal.
- Keep provider attribution in details.
- Never fake phone, address, or hours.