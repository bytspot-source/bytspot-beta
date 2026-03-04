import { motion, PanInfo, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, forwardRef } from 'react';
import { MapPin, Star, Shield, Battery, RefreshCw, Sparkles, Heart } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { VenueDetails } from './VenueDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
import { ValetFlow } from './ValetFlow';
import { discoverCards, type DiscoverCard, type CardType } from '../utils/mockData';
import { saveSpot, isSpotSaved, removeSavedSpot, getSavedSpots, type SpotType } from '../utils/savedSpots';
import { useVenues } from '../utils/hooks/useVenues';


// Pure helper — no state deps, safe at module level
function getTypeColor(type: CardType): string {
  switch (type) {
    case 'parking': return 'from-cyan-500 to-blue-500';
    case 'venue': return 'from-purple-500 to-fuchsia-500';
    case 'valet': return 'from-orange-500 to-amber-500';
    case 'coffee': return 'from-amber-600 to-yellow-500';
    case 'dining': return 'from-red-500 to-pink-500';
    case 'shopping': return 'from-indigo-500 to-purple-500';
    case 'nightlife': return 'from-fuchsia-600 to-pink-500';
    case 'entertainment': return 'from-violet-500 to-purple-500';
    case 'fitness': return 'from-green-500 to-emerald-500';
    default: return 'from-gray-500 to-gray-600';
  }
}

interface SwipeableCardProps {
  card: DiscoverCard;
  onSwipe: (direction: 'left' | 'right') => void;
  onShowBottomNav?: () => void;
  onTouch?: () => void;
  onSaveSpot: (card: DiscoverCard) => void;
}


const SwipeableCard = forwardRef<HTMLDivElement, SwipeableCardProps>(
  ({ card, onSwipe, onShowBottomNav, onTouch, onSaveSpot }, ref) => {
    const [dragX, setDragX] = useState(0);
    const [dragY, setDragY] = useState(0);
    const [exitX, setExitX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartTimeRef = useRef<number>(0);
    const hasDraggedRef = useRef<boolean>(false);

    const handlePan = (_event: any, info: PanInfo) => {
      if (exitX !== null) return;
      setDragX(info.offset.x);
      setDragY(info.offset.y);
      if (Math.abs(info.offset.x) > 5 || Math.abs(info.offset.y) > 5) {
        setIsDragging(true);
        hasDraggedRef.current = true;
      }
    };

    const handlePanStart = () => {
      dragStartTimeRef.current = Date.now();
      hasDraggedRef.current = false;
    };

    const handlePanEnd = (_event: any, info: PanInfo) => {
      const horizontalThreshold = 80;
      const verticalThreshold = 80;
      if (info.offset.y < -verticalThreshold && Math.abs(info.offset.x) < 50) {
        onSaveSpot(card);
        setDragX(0); setDragY(0); setIsDragging(false);
      } else if (Math.abs(info.offset.x) > horizontalThreshold) {
        const direction = info.offset.x > 0 ? 'right' : 'left';
        setExitX(direction === 'right' ? 1000 : -1000);
        setTimeout(() => { onSwipe(direction); }, 50);
      } else {
        setDragX(0); setDragY(0); setIsDragging(false);
      }
    };

    const handleCardTap = () => {
      const tapDuration = Date.now() - dragStartTimeRef.current;
      if (!hasDraggedRef.current && tapDuration < 300) {
        onShowBottomNav?.();
        onTouch?.();
      }
    };

    const rotation = (exitX !== null ? exitX : dragX) / 20;
    const opacity = exitX !== null ? 0 : (Math.abs(dragX) > Math.abs(dragY) ? 1 - Math.abs(dragX) / 300 : 1);

    return (
      <motion.div
        ref={ref}
        className="absolute inset-4 cursor-grab active:cursor-grabbing"
        drag={exitX === null}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onPan={handlePan}
        onPanStart={handlePanStart}
        onPanEnd={handlePanEnd}
        animate={{ x: exitX !== null ? exitX : dragX, y: dragY, rotate: rotation, opacity, scale: exitX !== null ? 0.9 : 1 }}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        exit={{ x: exitX !== null ? exitX : (dragX > 0 ? 1000 : -1000), opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={{ touchAction: 'none' }}
      >
        <motion.div
          className="w-full h-full rounded-[32px] overflow-hidden border-4 border-white/30 shadow-2xl bg-[#1C1C1E] flex flex-col"
          onClick={handleCardTap}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative flex-shrink-0" style={{ height: '240px' }}>
            <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
            <AnimatePresence>
              {isDragging && (Math.abs(dragX) > 30 || Math.abs(dragY) > 30) && (
                <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                  {dragY < -30 && Math.abs(dragX) < Math.abs(dragY) && (
                    <div className="px-6 py-3 rounded-full backdrop-blur-xl border-2 shadow-2xl bg-pink-500/80 border-pink-400/50">
                      <div className="flex items-center gap-2">
                        <Heart className="w-5 h-5 text-white fill-white" strokeWidth={2.5} />
                        <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>Save</span>
                      </div>
                    </div>
                  )}
                  {dragX > 30 && Math.abs(dragX) > Math.abs(dragY) && (
                    <div className="px-6 py-3 rounded-full backdrop-blur-xl border-2 shadow-2xl bg-green-500/80 border-green-400/50">
                      <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>→ Open</span>
                    </div>
                  )}
                  {dragX < -30 && Math.abs(dragX) > Math.abs(dragY) && (
                    <div className="px-6 py-3 rounded-full backdrop-blur-xl border-2 shadow-2xl bg-red-500/80 border-red-400/50">
                      <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>← Skip</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="absolute top-4 right-4">
              <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${getTypeColor(card.type)} border-2 border-white/30 shadow-lg`}>
                <span className="text-[12px] text-white capitalize" style={{ fontWeight: 700 }}>{card.type}</span>
              </div>
            </div>
            <div className="absolute top-4 left-4">
              <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 shadow-lg flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2.5} />
                <span className="text-[12px] text-white" style={{ fontWeight: 700 }}>{card.distance}</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-title-2 text-white drop-shadow-lg">{card.name}</h2>
                {card.verified && (
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 border-2 border-white">
                    <Shield className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-white/90 drop-shadow-md flex-wrap">
                {card.rating && (<div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2} /><span className="text-[15px]" style={{ fontWeight: 600 }}>{card.rating.toFixed(1)}</span></div>)}
                {card.price && (<span className="text-[15px]" style={{ fontWeight: 600 }}>{card.price}</span>)}
                {card.spots && (<div className="flex items-center gap-1"><Shield className="w-4 h-4 text-green-400" strokeWidth={2.5} /><span className="text-[15px]" style={{ fontWeight: 600 }}>{card.spots} spots</span></div>)}
                {card.availability && card.availability !== 'Unknown' && (
                  <div className={`px-2.5 py-0.5 rounded-full text-[12px] border ${
                    card.availability === 'Chill'   ? 'bg-green-500/40 border-green-400/60 text-green-200' :
                    card.availability === 'Active'  ? 'bg-yellow-500/40 border-yellow-400/60 text-yellow-200' :
                    card.availability === 'Busy'    ? 'bg-orange-500/40 border-orange-400/60 text-orange-200' :
                    card.availability === 'Packed'  ? 'bg-red-500/40 border-red-400/60 text-red-200' :
                    'bg-white/20 border-white/30 text-white/80'
                  }`} style={{ fontWeight: 700 }}>
                    {card.availability === 'Chill'  ? '🟢' :
                     card.availability === 'Active' ? '🟡' :
                     card.availability === 'Busy'   ? '🟠' :
                     card.availability === 'Packed' ? '🔴' : '⚪'} {card.availability}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col p-4 bg-[#1C1C1E] gap-2">
            {card.description && (<p className="text-[13px] text-white/80 line-clamp-2 flex-shrink-0" style={{ fontWeight: 400 }}>{card.description}</p>)}
            {card.features && card.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                {card.features.slice(0, 4).map((feature, idx) => (
                  <div key={idx} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                    <span className="text-[11px] text-white/90 whitespace-nowrap" style={{ fontWeight: 500 }}>{feature}</span>
                  </div>
                ))}
                {card.features.length > 4 && (
                  <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                    <span className="text-[11px] text-white/60 whitespace-nowrap" style={{ fontWeight: 500 }}>+{card.features.length - 4}</span>
                  </div>
                )}
              </div>
            )}
            {card.vibe && (
              <div className="mt-auto pt-1 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-white/70" style={{ fontWeight: 500 }}>Vibe Score</span>
                  <span className="text-[14px] text-white" style={{ fontWeight: 700 }}>{card.vibe}/10</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full" style={{ width: `${card.vibe * 10}%` }} />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }
);

SwipeableCard.displayName = 'SwipeableCard';

interface DiscoverSectionProps {
  isDarkMode: boolean;
  onNavigateToMap?: () => void;
  onShowBottomNav?: () => void;
  onTouch?: () => void;
  onBookRide?: (venue?: { name: string; lat?: number; lng?: number }) => void;
  initialFilter?: CardType;
}

export function DiscoverSection({ isDarkMode, onShowBottomNav, onTouch, onBookRide, initialFilter }: DiscoverSectionProps) {
  // Beta MVP: Live API data merged with mock parking + valet cards
  const { cards: apiCards, loading, error, refresh } = useVenues();
  // Parking and valet services don't come from the venue API — inject the
  // curated mock entries so those filter tabs always show results.
  const mockStaticCards = discoverCards.filter(c => c.type === 'parking' || c.type === 'valet');
  const cards = [...apiCards, ...mockStaticCards];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [appliedFilter, setAppliedFilter] = useState<CardType | null>(null);
  const [sortBy, setSortBy] = useState<'crowd' | 'rating' | 'distance'>('crowd');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<DiscoverCard | null>(null);
  const [selectedParkingSpot, setSelectedParkingSpot] = useState<any>(null);
  const [selectedValetService, setSelectedValetService] = useState<any>(null);
  const [showHint, setShowHint] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // 1. Category filter
  let filteredCards = appliedFilter
    ? cards.filter(card => card.type === appliedFilter)
    : cards;

  // 2. Saved-only filter
  if (showSavedOnly) {
    const savedIds = new Set(getSavedSpots().map(s => s.id));
    filteredCards = filteredCards.filter(card => {
      const spotId = card.name.toLowerCase().replace(/\s+/g, '-');
      return savedIds.has(spotId);
    });
  }

  // 3. Sort
  filteredCards = [...filteredCards].sort((a, b) => {
    if (sortBy === 'crowd') {
      // vibe is inverse of crowd: high vibe = chill, low vibe = packed
      // Sort hottest first (Packed first = low vibe first)
      return (a.vibe ?? 5) - (b.vibe ?? 5);
    }
    if (sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortBy === 'distance') {
      const da = parseFloat(a.distance.replace(' mi', '')) || 99;
      const db = parseFloat(b.distance.replace(' mi', '')) || 99;
      return da - db;
    }
    return 0;
  });

  // Use filtered cards for current card display
  const currentCard = filteredCards[currentIndex % Math.max(filteredCards.length, 1)];

  const handleNext = () => {
    if (currentIndex < filteredCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const card = currentCard;
    
    if (direction === 'right') {
      // Swipe right - open card details
      handleCardClick(card);
    } else {
      // Swipe left - pass
      handleNext();
    }
  };

  const handleSaveSpot = (card: DiscoverCard) => {
    const spotData = {
      id: card.name.toLowerCase().replace(/\s+/g, '-'),
      type: card.type as SpotType,
      name: card.name,
      address: card.location || 'Atlanta, GA',
      distance: card.distance,
      rating: card.rating,
      imageUrl: card.image,
      spots: card.spots,
      price: card.price,
      features: card.features,
    };

    if (isSpotSaved(spotData.id)) {
      removeSavedSpot(spotData.id);
      toast.success(`Removed ${card.name}`, {
        description: 'Removed from saved spots',
        duration: 2000,
      });
    } else {
      saveSpot(spotData);
      toast.success(`Saved ${card.name}`, {
        description: 'Added to your favorites',
        duration: 2000,
      });
    }
  };

  // Sync initial filter from props
  useEffect(() => {
    if (initialFilter) {
      setAppliedFilter(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    // Show hint for 3 seconds
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  // Pull to refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0 && startY > 0) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, Math.min(currentY - startY, 100));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      toast.success('Refreshing discover feed...', {
        description: 'Finding new spots for you',
        duration: 2000,
      });
      
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
        setStartY(0);
        setCurrentIndex(0);
      }, 1500);
    } else {
      setPullDistance(0);
      setStartY(0);
    }
  };

  const handleCardClick = (card: DiscoverCard) => {
    if (card.type === 'parking') {
      // Convert DiscoverCard to ParkingSpot format
      const parkingSpot = {
        id: card.id.toString(),
        name: card.name,
        address: card.location || 'Atlanta, GA',
        distance: parseFloat(card.distance.replace(' mi', '')),
        walkTime: Math.ceil(parseFloat(card.distance.replace(' mi', '')) * 15), // Estimate walk time
        price: parseInt(card.price?.replace('$', '').replace('/hr', '') || '0'),
        availability: card.spots || 0,
        total: card.spots ? Math.ceil(card.spots * 1.5) : 50, // Estimate total spots
        securityRating: card.rating ? card.rating : 4.5,
        rating: card.rating || 4.5,
        reviews: Math.floor(Math.random() * 500) + 100, // Random reviews count
        features: card.features || [],
        iotEnabled: card.features?.some(f => f.includes('EV') || f.includes('Security')) || false,
        lastUpdate: new Date(),
      };
      setSelectedParkingSpot(parkingSpot);
    } else if (card.type === 'valet') {
      // Convert DiscoverCard to ValetService format
      const baseRate = parseInt(
        (card.price || '$25/hour').replace('$', '').replace(/\/hour.*/, '').replace(/\/hr.*/, '').trim()
      ) || 25;
      const valetService = {
        id: card.id.toString(),
        name: card.name,
        photo: card.image,
        rating: card.rating || 4.7,
        totalServices: card.totalServices || card.reviews || 100,
        baseRate,
        responseTime: card.response || card.responseTime || '< 5 min',
        serviceArea: card.serviceArea || card.location || 'Midtown Atlanta',
        certifications: card.certifications || card.features || [],
        bio: card.bio || card.description || 'Professional valet service provider.',
      };
      setSelectedValetService(valetService);
    } else if (card.type === 'venue' || card.type === 'coffee' || card.type === 'dining' ||
               card.type === 'shopping' || card.type === 'nightlife' || card.type === 'entertainment' ||
               card.type === 'fitness') {
      // Show venue details
      setSelectedVenue(card);
    }
  };


  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto flex flex-col pb-24"
      onTouchStart={(e) => {
        handleTouchStart(e);
        onTouch?.();
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => onTouch?.()}
    >
      {/* Pull to Refresh Indicator */}
      <AnimatePresence>
        {pullDistance > 0 && (
          <motion.div
            className="flex justify-center py-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{
              opacity: pullDistance / 60,
              y: pullDistance - 20,
            }}
          >
            <motion.div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 border-2 border-white/30 flex items-center justify-center shadow-lg"
              animate={{
                rotate: isRefreshing ? 360 : pullDistance * 3,
              }}
              transition={{
                rotate: {
                  duration: isRefreshing ? 1 : 0,
                  repeat: isRefreshing ? Infinity : 0,
                  ease: "linear",
                },
              }}
            >
              <RefreshCw className="w-5 h-5 text-white" strokeWidth={2.5} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <motion.div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="w-6 h-6 text-white" />
          </motion.div>
          <p className="text-white/60 text-sm">Loading Atlanta venues…</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 px-6">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 flex flex-col gap-2 sticky top-0 z-10"
        style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(18px)' }}>
        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {([
            { label: 'All',    value: null },
            { label: '🍸 Nightlife',    value: 'nightlife' },
            { label: '🍽️ Dining',       value: 'dining' },
            { label: '☕ Coffee',        value: 'coffee' },
            { label: '🛍️ Shopping',     value: 'shopping' },
            { label: '🎭 Events',        value: 'entertainment' },
            { label: '💪 Fitness',       value: 'fitness' },
            { label: '🚕 Valet',          value: 'valet' },
            { label: '🅿️ Parking',      value: 'parking' },
          ] as { label: string; value: CardType | null }[]).map((cat) => {
            const active = appliedFilter === cat.value;
            return (
              <motion.button
                key={cat.label}
                onClick={() => { setAppliedFilter(cat.value); setCurrentIndex(0); }}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] transition-all"
                style={{
                  background: active ? '#00BFFF' : 'rgba(255,255,255,0.08)',
                  border: active ? '1.5px solid #00BFFF' : '1.5px solid rgba(255,255,255,0.14)',
                  color: active ? '#000' : '#fff',
                  fontWeight: active ? 700 : 500,
                }}
                whileTap={{ scale: 0.93 }}
              >
                {cat.label}
              </motion.button>
            );
          })}
        </div>

        {/* Sort + Saved row */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-1">
            {([
              ['crowd',    '🔥 Buzzing'],
              ['rating',   '⭐ Rating'],
              ['distance', '📍 Distance'],
            ] as [typeof sortBy, string][]).map(([val, label]) => (
              <motion.button
                key={val}
                onClick={() => setSortBy(val)}
                className="px-2.5 py-1 rounded-full text-[11px] transition-all"
                style={{
                  background: sortBy === val ? 'rgba(124,58,237,0.28)' : 'rgba(255,255,255,0.06)',
                  border: sortBy === val ? '1.5px solid rgba(124,58,237,0.7)' : '1.5px solid rgba(255,255,255,0.12)',
                  color: sortBy === val ? '#c084fc' : 'rgba(255,255,255,0.45)',
                  fontWeight: sortBy === val ? 700 : 500,
                }}
                whileTap={{ scale: 0.93 }}
              >
                {label}
              </motion.button>
            ))}
          </div>
          <motion.button
            onClick={() => { setShowSavedOnly(s => !s); setCurrentIndex(0); }}
            className="px-3 py-1 rounded-full text-[11px] flex items-center gap-1 transition-all"
            style={{
              background: showSavedOnly ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
              border: showSavedOnly ? '1.5px solid rgba(239,68,68,0.55)' : '1.5px solid rgba(255,255,255,0.12)',
              color: showSavedOnly ? '#f87171' : 'rgba(255,255,255,0.45)',
              fontWeight: showSavedOnly ? 700 : 500,
            }}
            whileTap={{ scale: 0.93 }}
          >
            <Heart className="w-3 h-3" fill={showSavedOnly ? '#f87171' : 'none'} strokeWidth={2.5} />
            <span>Saved</span>
          </motion.button>
        </div>
      </div>

      {/* Empty saved state */}
      {showSavedOnly && filteredCards.length === 0 && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6">
          <Heart className="w-10 h-10 text-white/20" strokeWidth={1.5} />
          <p className="text-white/50 text-[15px] text-center" style={{ fontWeight: 500 }}>
            No saved spots yet.<br />Swipe up on a card to save it.
          </p>
          <motion.button
            onClick={() => { setShowSavedOnly(false); setCurrentIndex(0); }}
            className="px-5 py-2 rounded-full bg-purple-600 text-white text-[14px]"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.96 }}
          >
            Browse All
          </motion.button>
        </div>
      )}

      {/* Swipeable Cards */}
      <div 
        className="relative flex-shrink-0" 
        style={{ 
          minHeight: '480px',
          maxHeight: 'calc(100vh - 280px)',
          height: 'auto'
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredCards.length > 0 && (
            <SwipeableCard
              key={currentCard.id}
              card={currentCard}
              onSwipe={handleSwipe}
              onShowBottomNav={onShowBottomNav}
              onTouch={onTouch}
              onSaveSpot={handleSaveSpot}
            />
          )}
        </AnimatePresence>

        {/* Swipe Hint */}
        <AnimatePresence>
          {showHint && (
            <motion.div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-[85%]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.5 }}
            >
              <div className="px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-xl border-2 border-white/30 shadow-2xl">
                <span className="text-[12px] text-white text-center" style={{ fontWeight: 600 }}>
                  Swipe → to open • ↑ to save • Tap for menu
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedVenue && (
          <VenueDetails
            venue={selectedVenue}
            onClose={() => setSelectedVenue(null)}
            onBookRide={() => onBookRide?.({
              name: selectedVenue?.name,
              lat: selectedVenue?._lat,
              lng: selectedVenue?._lng,
            })}
            isDarkMode={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedParkingSpot && (
          <ParkingReservationFlow
            spot={selectedParkingSpot}
            isOpen={!!selectedParkingSpot}
            onClose={() => setSelectedParkingSpot(null)}
            isDarkMode={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedValetService && (
          <ValetFlow
            service={selectedValetService}
            isDarkMode={true}
            onClose={() => setSelectedValetService(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
