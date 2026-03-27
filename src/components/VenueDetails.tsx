import { motion, AnimatePresence } from 'motion/react';
import { X, Navigation, Phone, MessageCircle, Car, Heart, Share2, MapPin, Clock, Star, Users, Zap, ChevronLeft, ChevronRight, ExternalLink, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { saveSpot, isSpotSaved, removeSavedSpot } from '../utils/savedSpots';
import { addPoints } from '../utils/gamification';
import { trpc } from '../utils/trpc';
import { toast } from 'sonner@2.0.3';
import { recordTrendingCheckin, getOpenStatusText } from '../utils/venueHours';
import { saveCheckinRecord } from '../utils/checkinHistory';
import { broadcastOwnCheckin } from '../utils/social';
import { getVenuePhotos, resolveVenuePhotos } from '../utils/venuePhoto';
import { getVenueReviews, saveVenueReview, getAverageRating, type VenueReview } from '../utils/venueReviews';

interface VenueDetailsProps {
  venue: any;
  isDarkMode: boolean;
  onClose: () => void;
  onOpenConcierge?: () => void;
  onNavigateToMap?: () => void;
  onBookRide?: () => void;
  isOpen?: boolean;
}

const sampleReviews = [
  {
    id: 1,
    user: 'Sarah M.',
    avatar: 'https://i.pravatar.cc/150?img=1',
    rating: 5,
    vibe: 9,
    date: '2 days ago',
    comment: 'Amazing atmosphere! The rooftop views are absolutely stunning, especially at sunset. Great cocktails too!',
    images: ['https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=400'],
  },
  {
    id: 2,
    user: 'Mike R.',
    avatar: 'https://i.pravatar.cc/150?img=2',
    rating: 5,
    vibe: 8,
    date: '1 week ago',
    comment: 'Perfect spot for a date night. Live DJ on weekends adds great energy. Service is top-notch.',
    images: [],
  },
  {
    id: 3,
    user: 'Jessica L.',
    avatar: 'https://i.pravatar.cc/150?img=3',
    rating: 4,
    vibe: 9,
    date: '2 weeks ago',
    comment: 'The vibe here is incredible! Gets pretty crowded on weekends but worth it. Make a reservation!',
    images: ['https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=400'],
  },
];

// galleryImages now computed per-venue inside the component

const menuItems = [
  { name: 'Signature Cocktails', price: '$14-18', available: true },
  { name: 'Premium Spirits', price: '$12-25', available: true },
  { name: 'Small Plates', price: '$10-16', available: true },
  { name: 'Craft Beer', price: '$8-12', available: true },
];

/**
 * Generate estimated crowd history based on venue category and current crowd level.
 * Uses typical patterns: restaurants peak at lunch/dinner, bars peak late evening, etc.
 */
function generateEstimatedCrowdHistory(category: string, currentCrowd: string | null) {
  const labels: Record<number, string> = { 1: 'Chill', 2: 'Active', 3: 'Busy', 4: 'Packed' };
  const cat = category.toLowerCase();
  // Typical hourly patterns (12 data points = last 24h in 2h intervals)
  let pattern: number[];
  if (cat.includes('bar') || cat.includes('club') || cat.includes('lounge') || cat.includes('night')) {
    pattern = [1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 3, 2]; // peaks late evening
  } else if (cat.includes('restaurant') || cat.includes('food') || cat.includes('dining')) {
    pattern = [1, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1]; // lunch + dinner peaks
  } else if (cat.includes('coffee') || cat.includes('cafe') || cat.includes('bakery')) {
    pattern = [1, 2, 3, 4, 3, 2, 2, 2, 1, 1, 1, 1]; // morning peak
  } else if (cat.includes('park') || cat.includes('outdoor') || cat.includes('garden')) {
    pattern = [1, 1, 2, 3, 3, 4, 3, 3, 2, 1, 1, 1]; // afternoon peak
  } else {
    pattern = [1, 1, 2, 2, 3, 3, 3, 4, 3, 2, 2, 1]; // generic
  }
  // Adjust based on current crowd level
  const currentLevel = currentCrowd === 'Packed' ? 4 : currentCrowd === 'Busy' ? 3 : currentCrowd === 'Active' ? 2 : 1;
  const patternMax = Math.max(...pattern);
  const scale = currentLevel / patternMax;
  const now = new Date();
  return pattern.map((level, i) => {
    const adjusted = Math.max(1, Math.min(4, Math.round(level * scale + (Math.random() * 0.6 - 0.3))));
    const time = new Date(now.getTime() - (pattern.length - 1 - i) * 2 * 60 * 60 * 1000);
    return { level: adjusted, label: labels[adjusted], recordedAt: time.toISOString() };
  });
}

export function VenueDetails({ venue, isDarkMode, onClose, onOpenConcierge, onNavigateToMap, onBookRide }: VenueDetailsProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  // Dynamic gallery — prefer Google Places photos, fall back to Unsplash
  const venueCategory = venue.category || venue.type || 'venue';
  const galleryImages = resolveVenuePhotos({
    photoUrls: venue.photoUrls,
    imageUrl: venue.image || venue.imageUrl,
    category: venueCategory,
    name: venue.name,
    count: 4,
  });

  // Use real API crowd data from venue prop
  const liveVibe = venue.vibe ?? 7;
  const crowdLevel = venue.availability && venue.availability !== 'Unknown' ? venue.availability : null;
  const openStatus = getOpenStatusText(venue.category || venue.type || 'default');

  // Check-in state — 1-hour cooldown per venue
  const checkInKey = `bytspot_checkin_${venue.id || venue.name}`;
  const lastCheckIn = parseInt(localStorage.getItem(checkInKey) || '0', 10);
  const [checkedIn, setCheckedIn] = useState(Date.now() - lastCheckIn < 3600_000);

  // Review state — ensure venueKey is always a string for tRPC compatibility
  const venueKey = String(venue.id || venue.name);
  const [userReviews, setUserReviews] = useState<VenueReview[]>(() => getVenueReviews(venueKey));
  const avgRating = getAverageRating(venueKey);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewVibe, setReviewVibe] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Venue check-in activity feed
  const [venueCheckins, setVenueCheckins] = useState<Array<{ id: string; userId: string; userName: string; crowdLevel: number; crowdLabel: string; timestamp: string }>>([]);
  useEffect(() => {
    if (venueKey) {
      trpc.social.venueCheckins.query({ venueId: venueKey, limit: 8 }).then((res) => {
        setVenueCheckins(res.items);
      }).catch(() => {});
    }
  }, [venueKey]);

  // Crowd history for trend chart
  const [crowdHistory, setCrowdHistory] = useState<Array<{ level: number; label: string; recordedAt: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    if (venue.slug) {
      trpc.venues.getBySlug.query({ slug: venue.slug }).then((result) => {
        if (cancelled) return;
        if (result?.crowd?.history?.length) {
          setCrowdHistory(
            result.crowd.history
              .filter((h) => typeof h.level === 'number' && typeof h.label === 'string' && typeof h.recordedAt === 'string')
              .map((h) => ({ level: h.level, label: h.label, recordedAt: h.recordedAt }))
          );
          return;
        }
        // Generate estimated popular times when no real history exists
        setCrowdHistory(generateEstimatedCrowdHistory(venue.category || venue.type || 'default', crowdLevel));
      }).catch(() => {
        if (!cancelled) {
          setCrowdHistory(generateEstimatedCrowdHistory(venue.category || venue.type || 'default', crowdLevel));
        }
      });
    } else {
      // No slug — still show estimated data
      setCrowdHistory(generateEstimatedCrowdHistory(venue.category || venue.type || 'default', crowdLevel));
    }
    return () => { cancelled = true; };
  }, [venue.slug, venue.category, venue.type, crowdLevel]);

  // Similar venues
  const [similarVenues, setSimilarVenues] = useState<Array<{ id: string; name: string; slug: string; category: string; similarity: number }>>([]);
  useEffect(() => {
    if (venue.slug) {
      trpc.venues.getSimilar.query({ slug: venue.slug, limit: 4 }).then((result) => {
        if (result?.similar?.length) {
          setSimilarVenues(result.similar);
        }
      }).catch(() => {});
    }
  }, [venue.slug]);

  const handleCheckIn = async () => {
    if (checkedIn) return;
    // Generate idempotency key once per tap — retries on this key are no-ops
    const idempotencyKey = crypto.randomUUID();
    localStorage.setItem(checkInKey, String(Date.now()));
    setCheckedIn(true);
    addPoints('VENUE_CHECKIN');
    recordTrendingCheckin(venue.id || venue.name, venue.name);
    const currentLevel = venue.crowd?.level ?? (crowdLevel === 'Packed' ? 4 : crowdLevel === 'Busy' ? 3 : crowdLevel === 'Active' ? 2 : 1);
    const currentLabel = venue.crowd?.label ?? crowdLevel ?? 'Unknown';
    try {
      const venueId = venue.id || venue.apiId;
      if (venueId) {
        const result = await trpc.venues.checkin.mutate({ venueId, idempotencyKey });
        const lvl = result?.newCrowdLevel ?? null;
        const lvlLabels: Record<number, string> = { 1: 'Chill', 2: 'Active', 3: 'Busy', 4: 'Packed' };
        const finalLevel = lvl ?? currentLevel;
        const finalLabel = lvl ? (lvlLabels[lvl] ?? currentLabel) : currentLabel;
        // Save to history
        saveCheckinRecord({
          venueId: venueId,
          venueName: venue.name,
          venueCategory: venue.category || venue.type || 'venue',
          timestamp: new Date().toISOString(),
          crowdLevel: finalLevel,
          crowdLabel: finalLabel,
          pointsEarned: 10,
        });
        broadcastOwnCheckin(venue.name, venueId, finalLevel, finalLabel);
        toast.success(`Checked in at ${venue.name}! +10 pts 🎉`, {
          description: lvl ? `Crowd now: ${lvlLabels[lvl] ?? lvl}` : undefined,
          duration: 3000,
        });
      } else {
        saveCheckinRecord({
          venueId: venue.name,
          venueName: venue.name,
          venueCategory: venue.category || venue.type || 'venue',
          timestamp: new Date().toISOString(),
          crowdLevel: currentLevel,
          crowdLabel: currentLabel,
          pointsEarned: 10,
        });
        broadcastOwnCheckin(venue.name, venueId, currentLevel, currentLabel);
        toast.success(`Checked in at ${venue.name}! +10 pts 🎉`, { duration: 3000 });
      }
    } catch {
      broadcastOwnCheckin(venue.name, venue.id, currentLevel, currentLabel);
      toast.success(`Checked in at ${venue.name}! +10 pts 🎉`, { duration: 3000 });
    }
  };
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleNavigate = () => {
    // Prefer in-app map routing when available
    if (onNavigateToMap) {
      onNavigateToMap();
      return;
    }
    // Fallback: open external maps app
    const lat = venue._lat ?? venue.lat ?? 33.7866;
    const lng = venue._lng ?? venue.lng ?? -84.3833;
    const name = encodeURIComponent(venue.name || 'Venue');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, '_self');
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${name}&travelmode=driving`,
        '_blank'
      );
    }
  };

  const handleCall = () => {
    const phone = venue.phone || venue.phoneNumber;
    if (phone) {
      const clean = String(phone).replace(/[^\d+]/g, '');
      window.open(`tel:${clean}`, '_self');
    } else {
      // Search Google for the venue's contact info
      const q = encodeURIComponent(`${venue.name} Atlanta phone number`);
      window.open(`https://www.google.com/search?q=${q}`, '_blank');
      toast.info('Phone not in system', { description: 'Opening Google search', duration: 2500 });
    }
  };

  const handleBookValet = () => {
    if (onBookRide) {
      onBookRide();
    } else {
      toast('Ride booking coming soon!');
    }
  };

  const handleShare = async () => {
    const slug = venue._slug || venue.slug;
    const venueUrl = slug
      ? `https://beta.bytspot.com/v/${slug}`
      : 'https://beta.bytspot.com';
    const crowdEmoji = crowdLevel === 'Packed' ? '🔴' : crowdLevel === 'Busy' ? '🟠' : crowdLevel === 'Active' ? '🟡' : crowdLevel === 'Chill' ? '🟢' : '';
    const crowdText = crowdLevel ? ` ${crowdEmoji} ${crowdLevel} right now` : '';
    const shareText = `${venue.name}${crowdText} — check it out on Bytspot!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: venue.name, text: shareText, url: venueUrl });
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${venueUrl}`);
        toast.success('Link copied!', { description: venueUrl, duration: 3000 });
      } catch {
        toast.success(`Share: ${venueUrl}`, { duration: 4000 });
      }
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[#000000]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={springConfig}
    >
      <div className="h-full overflow-y-auto scrollbar-hide">
        {/* Image Gallery */}
        <div className="relative h-80 bg-black">
          <AnimatePresence mode="wait">
            <motion.img
              key={currentImageIndex}
              src={galleryImages[currentImageIndex]}
              alt={venue.name}
              className="w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          </AnimatePresence>

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

          {/* Close Button */}
          <motion.button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-black/70 backdrop-blur-xl border-2 border-white/40 shadow-xl tap-target z-10"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <X className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>

          {/* Gallery Navigation */}
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 px-4">
            <button
              onClick={prevImage}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/70 backdrop-blur-xl border border-white/40"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>

            <div className="flex gap-1.5">
              {galleryImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === currentImageIndex
                      ? 'w-6 bg-white'
                      : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextImage}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/70 backdrop-blur-xl border border-white/40"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Image Counter */}
          <div className="absolute top-4 left-4">
            <div className="px-3 py-1.5 rounded-full text-[13px] backdrop-blur-xl border-2 bg-black/70 border-white/40 text-white shadow-lg" style={{ fontWeight: 600 }}>
              {currentImageIndex + 1} / {galleryImages.length}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[393px] mx-auto px-4 pb-24">
          {/* Header */}
          <motion.div
            className="pt-6 pb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h1 className="text-large-title mb-2 text-white">
                  {venue.name}
                </h1>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      {venue.rating || '4.9'}
                    </span>
                  </div>
                  <span className="text-white/50">•</span>
                  <span className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    1.2k reviews
                  </span>
                  <span className="text-white/50">•</span>
                  <span className={`text-[14px] ${openStatus.color}`} style={{ fontWeight: 600 }}>
                    {openStatus.label}
                  </span>
                </div>
                {venue.description && (
                  <p className="text-[15px] text-white/90 mb-3" style={{ fontWeight: 400 }}>
                    {venue.description}
                  </p>
                )}
              </div>

              {/* Favorite Button */}
              <motion.button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 flex-shrink-0 ml-3 ${
                  isFavorite
                    ? 'bg-pink-500/20 border-pink-400'
                    : 'bg-white/10 border-white/30'
                }`}
                whileTap={{ scale: 0.9 }}
              >
                <Heart
                  className={`w-6 h-6 ${isFavorite ? 'fill-pink-400 text-pink-400' : 'text-white'}`}
                  strokeWidth={2}
                />
              </motion.button>
            </div>

            {/* Live Vibe Badge */}
            {crowdLevel && (
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex-1 rounded-[16px] p-4 border-2 backdrop-blur-xl ${
                  crowdLevel === 'Packed' ? 'border-red-400/50 bg-gradient-to-br from-red-500/20 to-orange-500/20' :
                  crowdLevel === 'Busy'   ? 'border-orange-400/50 bg-gradient-to-br from-orange-500/20 to-yellow-500/20' :
                  crowdLevel === 'Active' ? 'border-yellow-400/50 bg-gradient-to-br from-yellow-500/20 to-amber-500/20' :
                                           'border-green-400/50 bg-gradient-to-br from-green-500/20 to-emerald-500/20'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2 h-2 rounded-full bg-green-400"
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>LIVE</span>
                    </div>
                    <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>Updated just now</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-purple-400" />
                      <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                        Vibe {liveVibe}/10
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-white/70" />
                      <span className={`text-[15px] font-semibold ${
                        crowdLevel === 'Packed' ? 'text-red-400' :
                        crowdLevel === 'Busy'   ? 'text-orange-400' :
                        crowdLevel === 'Active' ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {crowdLevel === 'Chill' ? '🟢' : crowdLevel === 'Active' ? '🟡' : crowdLevel === 'Busy' ? '🟠' : '🔴'} {crowdLevel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Essential Info */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-[20px] mb-3 text-white" style={{ fontWeight: 600 }}>
              Essential Info
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-[12px] bg-[#1C1C1E]/80 border border-white/30">
                <Clock className="w-5 h-5 text-cyan-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                    Hours
                  </p>
                  <p className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    Mon-Thu: 5pm - 12am
                  </p>
                  <p className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    Fri-Sat: 5pm - 2am • <span className="text-green-400">Open Now</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-[12px] bg-[#1C1C1E]/80 border border-white/30">
                <MapPin className="w-5 h-5 text-orange-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>Location</p>
                  <p className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
                    {venue.location || venue.description || 'Atlanta Midtown'}
                  </p>
                  {venue.distance && venue.distance !== '—' && (
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>{venue.distance} away</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Crowd Trend Chart */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <h3 className="text-[20px] mb-3 text-white" style={{ fontWeight: 600 }}>When to Go</h3>
            <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border border-white/30">
              {crowdHistory.length > 0 ? (
                <>
                  <div className="flex items-end justify-between gap-1" style={{ height: 80 }}>
                    {crowdHistory.slice(0, 12).reverse().map((reading, i) => {
                      const heightPct = (reading.level / 4) * 100;
                      const color =
                        reading.level === 1 ? '#10b981' :
                        reading.level === 2 ? '#eab308' :
                        reading.level === 3 ? '#f97316' : '#ef4444';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t-[3px]"
                            style={{ height: `${heightPct}%`, background: color, minHeight: 4 }}
                          />
                          <span className="text-[9px] text-white/40">{(crowdHistory.slice(0, 12).length - 1 - i) * 2}h</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /><span className="text-[11px] text-white/60">Chill</span></div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /><span className="text-[11px] text-white/60">Active</span></div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /><span className="text-[11px] text-white/60">Busy</span></div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /><span className="text-[11px] text-white/60">Packed</span></div>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-white/40 text-center py-4">Crowd data coming soon</p>
              )}
            </div>
          </motion.div>

          {/* Menu Preview */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[20px] text-white" style={{ fontWeight: 600 }}>
                Menu Preview
              </h3>
              <button className="text-[15px] text-cyan-400" style={{ fontWeight: 600 }}>
                View Full Menu
              </button>
            </div>
            <div className="space-y-2">
              {menuItems.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-3 rounded-[12px] bg-[#1C1C1E]/80 border border-white/30"
                >
                  <div className="flex-1">
                    <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {item.name}
                    </p>
                    {item.available && (
                      <span className="text-[13px] text-green-400" style={{ fontWeight: 500 }}>
                        Available
                      </span>
                    )}
                  </div>
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {item.price}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-[20px] mb-3 text-white" style={{ fontWeight: 600 }}>
              Friends Who've Been Here
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-[12px] bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-white/30">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <img
                    key={i}
                    src={`https://i.pravatar.cc/150?img=${i + 10}`}
                    alt="Friend"
                    className="w-8 h-8 rounded-full border-2 border-[#000000]"
                  />
                ))}
              </div>
              <div className="flex-1">
                <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  4 friends visited
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  Last visit: 2 days ago
                </p>
              </div>
            </div>
          </motion.div>

          {/* Recent Check-ins at This Venue */}
          {venueCheckins.length > 0 && (
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <h3 className="text-[20px] text-white mb-3" style={{ fontWeight: 600 }}>Recent Check-ins</h3>
              <div className="space-y-2">
                {venueCheckins.map((c) => {
                  const crowdCol = c.crowdLevel === 1 ? 'text-green-400' : c.crowdLevel === 2 ? 'text-yellow-400' : c.crowdLevel === 3 ? 'text-orange-400' : 'text-red-400';
                  const crowdIcon = c.crowdLevel === 1 ? '🟢' : c.crowdLevel === 2 ? '🟡' : c.crowdLevel === 3 ? '🟠' : '🔴';
                  const mins = Math.floor((Date.now() - new Date(c.timestamp).getTime()) / 60000);
                  const ago = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-[14px] p-3 bg-[#1C1C1E]/80 border border-white/10">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30 flex items-center justify-center">
                        <Users className="w-4 h-4 text-white/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white truncate" style={{ fontWeight: 600 }}>{c.userName}</p>
                        <p className={`text-[12px] ${crowdCol}`} style={{ fontWeight: 500 }}>{crowdIcon} {c.crowdLabel}</p>
                      </div>
                      <span className="text-[11px] text-white/30 shrink-0">{ago}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Reviews */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[20px] text-white" style={{ fontWeight: 600 }}>Reviews</h3>
                {avgRating && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(avgRating.stars) ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'}`} />
                      ))}
                    </div>
                    <span className="text-[13px] text-white/60">{avgRating.stars.toFixed(1)} · {avgRating.count} review{avgRating.count !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
              {checkedIn && !userReviews.find(r => r.venueId === venueKey) && (
                <motion.button
                  className="text-[13px] text-cyan-400 font-semibold px-3 py-1.5 rounded-full border border-cyan-400/40"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowReviewForm(v => !v)}
                >
                  {showReviewForm ? 'Cancel' : '+ Review'}
                </motion.button>
              )}
            </div>

            {/* Review write form */}
            <AnimatePresence>
              {showReviewForm && !reviewSubmitted && (
                <motion.div
                  className="mb-4 p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/20"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                >
                  <p className="text-[14px] text-white/80 mb-3 font-semibold">How was {venue.name}?</p>
                  {/* Stars */}
                  <div className="flex gap-2 mb-3">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} onClick={() => setReviewStars(s)}>
                        <Star className={`w-7 h-7 transition-all ${s <= reviewStars ? 'fill-yellow-400 text-yellow-400 scale-110' : 'text-white/30'}`} />
                      </button>
                    ))}
                  </div>
                  {/* Vibe slider */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[12px] text-white/50 mb-1">
                      <span>Vibe score</span><span className="text-cyan-400 font-bold">{reviewVibe}/10</span>
                    </div>
                    <input type="range" min={1} max={10} value={reviewVibe}
                      onChange={e => setReviewVibe(Number(e.target.value))}
                      className="w-full accent-cyan-400" />
                  </div>
                  {/* Comment */}
                  <textarea
                    className="w-full rounded-[12px] bg-white/8 border border-white/20 text-white text-[13px] p-2.5 resize-none placeholder:text-white/30 outline-none focus:border-cyan-400/60"
                    rows={2} placeholder="Anything to add? (optional)"
                    value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  />
                  <motion.button
                    className="mt-3 w-full py-3 rounded-[12px] text-white text-[14px] font-semibold disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#00BFFF,#7c3aed)' }}
                    whileTap={{ scale: 0.97 }} disabled={reviewStars === 0}
                    onClick={() => {
                      const rev: VenueReview = {
                        venueId: venueKey,
                        venueName: venue.name,
                        stars: reviewStars,
                        vibe: reviewVibe,
                        comment: reviewComment.trim(),
                        createdAt: new Date().toISOString(),
                      };
                      saveVenueReview(rev);
                      setUserReviews(getVenueReviews(venueKey));
                      setReviewSubmitted(true);
                      setShowReviewForm(false);
                      toast.success('Review saved! Thanks 🙌', { duration: 2500 });
                    }}
                  >Submit Review</motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              {/* User-written reviews first */}
              {userReviews.map((review, idx) => (
                <div key={idx} className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border border-cyan-400/30">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-white text-[13px] font-bold">You</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= review.stars ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'}`} />)}</div>
                        <span className="text-[11px] text-white/40">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-[12px] text-purple-300 font-semibold">Vibe {review.vibe}/10</span>
                    </div>
                  </div>
                  {review.comment && <p className="text-[14px] text-white/80">{review.comment}</p>}
                </div>
              ))}
              {/* Sample/seed reviews */}
              {sampleReviews.map((review) => (
                <div key={review.id} className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border border-white/30">
                  <div className="flex items-start gap-3 mb-3">
                    <img src={review.avatar} alt={review.user} className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>{review.user}</p>
                        <span className="text-[13px] text-white/70">{review.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-[13px] text-white font-semibold">{review.rating}.0</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-[13px] text-white font-semibold">Vibe {review.vibe}/10</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[15px] text-white/90">{review.comment}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Similar Venues */}
          {similarVenues.length > 0 && (
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <h3 className="text-[20px] mb-3 text-white" style={{ fontWeight: 600 }}>Similar Venues</h3>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {similarVenues.map((v) => {
                  const thumb = getVenuePhotos(v.category, v.name, 1)[0];
                  return (
                    <div
                      key={v.id}
                      className="flex-shrink-0 w-[140px] rounded-[16px] overflow-hidden bg-[#1C1C1E]/80 border border-white/10"
                    >
                      <div className="relative h-[90px]">
                        {thumb ? (
                          <img src={thumb} alt={v.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <div className="p-2.5">
                        <p className="text-[13px] text-white leading-snug" style={{ fontWeight: 600 }}>{v.name}</p>
                        <p className="text-[11px] text-white/50 capitalize mt-0.5">{v.category}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* Fixed Action Menu */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#000000] border-t-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto p-4">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <motion.button
                onClick={handleNavigate}
                className="p-3 rounded-[12px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 flex flex-col items-center gap-1 shadow-lg"
                whileTap={{ scale: 0.95 }}
              >
                <Navigation className="w-4 h-4 text-white" />
                <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                  Navigate
                </span>
              </motion.button>

              <motion.button
                onClick={handleCall}
                className="p-3 rounded-[12px] bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30 flex flex-col items-center gap-1 shadow-lg"
                whileTap={{ scale: 0.95 }}
              >
                <Phone className="w-4 h-4 text-white" />
                <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                  Call
                </span>
              </motion.button>

              {onOpenConcierge && (
                <motion.button
                  onClick={onOpenConcierge}
                  className="p-3 rounded-[12px] bg-gradient-to-br from-purple-500 to-fuchsia-500 border-2 border-white/30 flex flex-col items-center gap-1 shadow-lg"
                  whileTap={{ scale: 0.95 }}
                >
                  <MessageCircle className="w-4 h-4 text-white" />
                  <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>Concierge</span>
                </motion.button>
              )}
            </div>

            {/* Check In CTA */}
            <motion.button
              onClick={handleCheckIn}
              disabled={checkedIn}
              className="w-full rounded-[16px] py-3.5 flex items-center justify-center gap-2 mb-3"
              style={{
                background: checkedIn
                  ? 'rgba(16,185,129,0.15)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                border: checkedIn ? '2px solid rgba(16,185,129,0.4)' : '2px solid transparent',
              }}
              whileTap={checkedIn ? {} : { scale: 0.97 }}
            >
              <CheckCircle className={`w-5 h-5 ${checkedIn ? 'text-emerald-400' : 'text-white'}`} strokeWidth={2.5} />
              <span className={`text-[15px] ${checkedIn ? 'text-emerald-400' : 'text-white'}`} style={{ fontWeight: 700 }}>
                {checkedIn ? 'Checked In ✓' : 'Check In · +10 pts'}
              </span>
            </motion.button>

            <div className="grid grid-cols-3 gap-2">
              <motion.button
                onClick={handleBookValet}
                className="p-3 rounded-[12px] bg-[#1C1C1E]/80 border-2 border-white/30 flex flex-col items-center gap-1"
                whileTap={{ scale: 0.95 }}
              >
                <Car className="w-4 h-4 text-white" />
                <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                  Book Ride
                </span>
              </motion.button>

              <motion.button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-3 rounded-[12px] border-2 flex flex-col items-center gap-1 ${
                  isFavorite
                    ? 'bg-pink-500/20 border-pink-400'
                    : 'bg-[#1C1C1E]/80 border-white/30'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <Heart
                  className={`w-4 h-4 ${isFavorite ? 'fill-pink-400 text-pink-400' : 'text-white'}`}
                />
                <span className={`text-[12px] ${isFavorite ? 'text-pink-400' : 'text-white'}`} style={{ fontWeight: 600 }}>
                  Favorite
                </span>
              </motion.button>

              <motion.button
                onClick={handleShare}
                className="p-3 rounded-[12px] bg-[#1C1C1E]/80 border-2 border-white/30 flex flex-col items-center gap-1"
                whileTap={{ scale: 0.95 }}
              >
                <Share2 className="w-4 h-4 text-white" />
                <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                  Share
                </span>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
