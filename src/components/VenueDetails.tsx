import { motion, AnimatePresence } from 'motion/react';
import { X, Navigation, Phone, MessageCircle, Car, Heart, Share2, MapPin, Clock, Star, Users, Zap, ChevronLeft, ChevronRight, ExternalLink, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { saveSpot, isSpotSaved, removeSavedSpot } from '../utils/savedSpots';
import { addPoints } from '../utils/gamification';
import { venuesApi } from '../utils/api';
import { toast } from 'sonner@2.0.3';

interface VenueDetailsProps {
  venue: any;
  isDarkMode: boolean;
  onClose: () => void;
  onOpenConcierge?: () => void;
  onNavigateToMap?: () => void;
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

const galleryImages = [
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
  'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=800',
  'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800',
  'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800',
];

const menuItems = [
  { name: 'Signature Cocktails', price: '$14-18', available: true },
  { name: 'Premium Spirits', price: '$12-25', available: true },
  { name: 'Small Plates', price: '$10-16', available: true },
  { name: 'Craft Beer', price: '$8-12', available: true },
];

export function VenueDetails({ venue, isDarkMode, onClose, onOpenConcierge, onNavigateToMap }: VenueDetailsProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  // Use real API crowd data from venue prop
  const liveVibe = venue.vibe ?? 7;
  const crowdLevel = venue.availability && venue.availability !== 'Unknown' ? venue.availability : null;

  // Check-in state — 1-hour cooldown per venue
  const checkInKey = `bytspot_checkin_${venue.id || venue.name}`;
  const lastCheckIn = parseInt(localStorage.getItem(checkInKey) || '0', 10);
  const [checkedIn, setCheckedIn] = useState(Date.now() - lastCheckIn < 3600_000);

  // Crowd history for trend chart
  const [crowdHistory, setCrowdHistory] = useState<Array<{ level: number; label: string; recordedAt: string }>>([]);
  useEffect(() => {
    if (venue.slug) {
      venuesApi.getBySlug(venue.slug).then((result) => {
        if (result.success && result.data?.crowd?.history?.length) {
          setCrowdHistory(result.data.crowd.history);
        }
      }).catch(() => {});
    }
  }, [venue.slug]);

  const handleCheckIn = async () => {
    if (checkedIn) return;
    localStorage.setItem(checkInKey, String(Date.now()));
    setCheckedIn(true);
    addPoints('VENUE_CHECKIN');
    try {
      const venueId = venue.id || venue.apiId;
      if (venueId) {
        const result = await venuesApi.checkin(venueId);
        const lvl = result.success ? result.data?.newCrowdLevel : null;
        const lvlLabels: Record<number, string> = { 1: 'Chill', 2: 'Active', 3: 'Busy', 4: 'Packed' };
        toast.success(`Checked in at ${venue.name}! +10 pts 🎉`, {
          description: lvl ? `Crowd now: ${lvlLabels[lvl] ?? lvl}` : undefined,
          duration: 3000,
        });
      } else {
        toast.success(`Checked in at ${venue.name}! +10 pts 🎉`, { duration: 3000 });
      }
    } catch {
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
    // Navigate to map tab in app
    if (onNavigateToMap) {
      onNavigateToMap();
      onClose();
    }
  };

  const handleCall = () => {
    window.open('tel:+14155551234', '_self');
  };

  const handleBookValet = () => {
    toast('Ride booking coming soon!');
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

          {/* Reviews */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[20px] text-white" style={{ fontWeight: 600 }}>
                Reviews
              </h3>
              <button className="text-[15px] text-cyan-400 flex items-center gap-1" style={{ fontWeight: 600 }}>
                See All
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {sampleReviews.map((review) => (
                <div
                  key={review.id}
                  className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border border-white/30"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <img
                      src={review.avatar}
                      alt={review.user}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                          {review.user}
                        </p>
                        <span className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                          {review.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                            {review.rating}.0
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                            Vibe {review.vibe}/10
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[15px] text-white/90 mb-3" style={{ fontWeight: 400 }}>
                    {review.comment}
                  </p>
                  {review.images.length > 0 && (
                    <div className="flex gap-2">
                      {review.images.map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt="Review"
                          className="w-20 h-20 rounded-[8px] object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
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
