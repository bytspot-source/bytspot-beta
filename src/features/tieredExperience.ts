export type ConsumerExperienceTier = 'explorer' | 'insider' | 'vip';

export interface TierProgressInput {
  bookingCount: number;
  activityPoints: number;
  checkinCount?: number;
  hasInsiderMembership?: boolean;
  vipOverride?: boolean;
}

export interface ConsumerTierProfile {
  tier: ConsumerExperienceTier;
  name: string;
  eyebrow: string;
  heroLabel: string;
  priorityRailLabel: string;
  cardStyleLabel: string;
  accessLevel: string;
  patchVerifiedLabel: string;
  benefits: string[];
  accentClass: string;
}

export interface ConsumerTierProgress {
  currentTier: ConsumerExperienceTier;
  nextTier: ConsumerExperienceTier | null;
  bookingCount: number;
  bookingsNeeded: number;
  progressPercent: number;
  label: string;
}

export interface TieredHomeCard {
  id: 'hero-chef-dinner' | 'premium-valet' | 'cottage-massage';
  title: string;
  subtitle: string;
  priceLine: string;
  availabilityLine: string;
  badge: string;
  tierBadge: string;
  ctaLabel: string;
  imageCue: string;
  accentClass: string;
  cardStyleLabel: string;
}

export const TIERED_EXPERIENCE_PROFILES: Record<ConsumerExperienceTier, ConsumerTierProfile> = {
  explorer: {
    tier: 'explorer',
    name: 'Parker',
    eyebrow: '',
    heroLabel: 'General trending experiences',
    priorityRailLabel: 'Recommended near you',
    cardStyleLabel: '',
    accessLevel: 'Flexible same-day options',
    patchVerifiedLabel: 'Patch Verified',
    benefits: ['Local discovery', 'Clear pricing', 'Same-day options when available'],
    accentClass: 'from-cyan-500/22 via-slate-500/14 to-blue-500/18 border-cyan-300/25',
  },
  insider: {
    tier: 'insider',
    name: 'Parker',
    eyebrow: '',
    heroLabel: 'Personalized picks',
    priorityRailLabel: 'Recommended for You',
    cardStyleLabel: '',
    accessLevel: 'More availability and better pricing',
    patchVerifiedLabel: 'Patch Verified',
    benefits: ['Better recommendations', 'Occasional early access', 'Booking rewards'],
    accentClass: 'from-purple-500/24 via-cyan-500/16 to-fuchsia-500/20 border-fuchsia-300/30',
  },
  vip: {
    tier: 'vip',
    name: 'Parker',
    eyebrow: '',
    heroLabel: 'Priority experiences',
    priorityRailLabel: 'Curated for You',
    cardStyleLabel: '',
    accessLevel: 'Priority booking and dedicated valet slots',
    patchVerifiedLabel: 'Patch Verified',
    benefits: ['Priority booking', 'Dedicated support', 'Curated experiences', 'Valet credits', 'Passport wristband'],
    accentClass: 'from-amber-400/26 via-yellow-500/18 to-orange-500/22 border-amber-200/45',
  },
};

export function deriveConsumerExperienceTier(input: TierProgressInput): ConsumerExperienceTier {
  const bookings = Math.max(0, input.bookingCount);
  const points = Math.max(0, input.activityPoints);
  const checkins = Math.max(0, input.checkinCount ?? 0);

  if (input.vipOverride || bookings >= 8 || points >= 3000 || checkins >= 12) return 'vip';
  if (input.hasInsiderMembership || bookings >= 3 || points >= 800 || checkins >= 5) return 'insider';
  return 'explorer';
}

export function getConsumerTierProgress(input: TierProgressInput): ConsumerTierProgress {
  const currentTier = deriveConsumerExperienceTier(input);
  const bookingCount = Math.max(0, input.bookingCount);
  const nextTier = currentTier === 'explorer' ? 'insider' : currentTier === 'insider' ? 'vip' : null;
  const targetBookings = nextTier === 'insider' ? 3 : nextTier === 'vip' ? 8 : bookingCount;
  const bookingsNeeded = nextTier ? Math.max(0, targetBookings - bookingCount) : 0;
  const progressPercent = nextTier ? Math.min(100, Math.round((bookingCount / targetBookings) * 100)) : 100;

  return {
    currentTier,
    nextTier,
    bookingCount,
    bookingsNeeded,
    progressPercent,
    label: nextTier ? `${bookingsNeeded} more booking${bookingsNeeded === 1 ? '' : 's'} to unlock more Parker benefits` : 'Parker benefits active',
  };
}

export function getTieredHomeCards(tier: ConsumerExperienceTier): TieredHomeCard[] {
  const profile = TIERED_EXPERIENCE_PROFILES[tier];
  const isVip = tier === 'vip';
  const isInsider = tier === 'insider';

  return [
    {
      id: 'hero-chef-dinner',
      title: 'Private 5-Course Chef Dinner at Home',
      subtitle: 'Chef Maria · 4.98 ★ · 87 bookings',
      priceLine: isVip ? '$285 · early access' : isInsider ? '$271 · preferred price' : '$285 · 2.5 hrs',
      availabilityLine: isVip ? 'Tonight 7:30 PM · priority window' : isInsider ? 'Tonight 7:30 PM · better availability' : 'Tonight 7:30 PM',
      badge: profile.patchVerifiedLabel,
      tierBadge: isVip ? 'Priority' : isInsider ? 'Recommended' : 'Trending',
      ctaLabel: isVip ? 'Priority Book' : 'Book Now',
      imageCue: '🍽️',
      accentClass: profile.accentClass,
      cardStyleLabel: profile.cardStyleLabel,
    },
    {
      id: 'premium-valet',
      title: 'Valet Pickup & Dropoff',
      subtitle: isVip ? 'Dedicated Driver · arrives in 18 min' : 'Driver arrives in 18 min',
      priceLine: isInsider ? '$90 · preferred pricing' : '$95',
      availabilityLine: isVip ? 'Dedicated valet slot held' : isInsider ? 'More arrival windows' : 'Standard availability',
      badge: profile.patchVerifiedLabel,
      tierBadge: isVip ? 'Dedicated Driver' : isInsider ? 'Recommended' : 'Valet',
      ctaLabel: 'Book Valet',
      imageCue: '🚘',
      accentClass: isVip ? TIERED_EXPERIENCE_PROFILES.vip.accentClass : profile.accentClass,
      cardStyleLabel: profile.cardStyleLabel,
    },
    {
      id: 'cottage-massage',
      title: 'In-Home Deep Tissue Massage',
      subtitle: 'Trending Cottage Experience',
      priceLine: isInsider ? '$114 · 60 min' : '$120 · 60 min',
      availabilityLine: isVip ? 'Multiple slots today · first choice' : 'Multiple slots today',
      badge: profile.patchVerifiedLabel,
      tierBadge: isVip ? 'Curated' : isInsider ? 'Recommended for You' : 'Cottage',
      ctaLabel: 'View Options',
      imageCue: '🌿',
      accentClass: profile.accentClass,
      cardStyleLabel: profile.cardStyleLabel,
    },
  ];
}
