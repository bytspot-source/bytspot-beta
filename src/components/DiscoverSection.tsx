import { motion, PanInfo, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, forwardRef, lazy, Suspense } from 'react';
import { MapPin, Star, Shield, Battery, RefreshCw, Sparkles, Heart } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { VenueDetails } from './VenueDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
const ValetFlow = lazy(() => import('./ValetFlow').then(m => ({ default: m.ValetFlow })));
import { type DiscoverCard, type CardType } from '../utils/mockData';
import { type AppEvent } from '../utils/events';
import { saveSpot, isSpotSaved, removeSavedSpot, getSavedSpots, type SpotType } from '../utils/savedSpots';
import { APPLE_REVIEW_HIDE_PROVIDER_AND_VALET } from '../utils/reviewBuild';


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

function normalizeCardType(type: string | null | undefined): CardType | null {
  const normalized = type?.trim().toLowerCase();
  if (!normalized) return null;

  const validTypes: CardType[] = [
    'parking',
    'venue',
    'valet',
    'coffee',
    'dining',
    'shopping',
    'nightlife',
    'entertainment',
    'fitness',
  ];

  return validTypes.includes(normalized as CardType)
    ? (normalized as CardType)
    : null;
}

function getEventCardId(event: AppEvent, index: number): number {
  const numeric = Number.parseInt(event.id.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(numeric) ? 10_000 + numeric : 10_000 + index;
}

function toEventDiscoverCard(event: AppEvent, index: number): DiscoverCard {
  const isFree = event.price.trim().toLowerCase() === 'free';
  return {
    id: getEventCardId(event, index),
    type: 'entertainment',
    name: event.title,
    image: event.image,
    distance: '0 mi',
    price: event.price,
    description: [event.date, event.time, event.venue].filter(Boolean).join(' · '),
    location: event.venue,
    features: [event.category, event.date].filter(Boolean),
    verified: true,
    entryType: isFree ? 'free' : 'paid',
    entryPrice: event.price,
    ticketUrl: event.url ?? null,
    eventName: event.title,
    eventDate: event.date,
    eventTime: event.time,
  };
}

interface SwipeableCardProps {
  card: DiscoverCard;
  onSwipe: (direction: 'left' | 'right') => void;
  onShowBottomNav?: () => void;
  onTouch?: () => void;
  onCardTap?: (card: DiscoverCard) => void;
  onSaveSpot: (card: DiscoverCard) => void;
}


const SwipeableCard = forwardRef<HTMLDivElement, SwipeableCardProps>(
  ({ card, onSwipe, onShowBottomNav, onTouch, onCardTap, onSaveSpot }, ref) => {
    const [dragX, setDragX] = useState(0);
    const [dragY, setDragY] = useState(0);
    const [exitX, setExitX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartTimeRef = useRef<number>(0);
    const hasDraggedRef = useRef<boolean>(false);
    const isEventCard = card.type === 'entertainment' && (!!card.eventDate || !!card.eventTime);

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
      // If onPanStart never fired (pure tap with no movement), dragStartTimeRef stays at 0.
      // In that case, treat it as a valid tap since no drag occurred.
      const isPureTap = dragStartTimeRef.current === 0;
      const tapDuration = Date.now() - dragStartTimeRef.current;
      if (!hasDraggedRef.current && (isPureTap || tapDuration < 300)) {
        onShowBottomNav?.();
        onTouch?.();
        onCardTap?.(card);
      }
    };

    const rotation = (exitX !== null ? exitX : dragX) / 20;
    const opacity = exitX !== null ? 0 : (Math.abs(dragX) > Math.abs(dragY) ? 1 - Math.abs(dragX) / 300 : 1);

    return (
      <motion.div
        ref={ref}
        className="absolute inset-4 cursor-grab active:cursor-grabbing"
        data-testid={`discover-swipe-card-${String(card.id)}`}
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
            <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
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
            <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
              <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${getTypeColor(card.type)} border-2 border-white/30 shadow-lg`}>
                <span className="text-[12px] text-white capitalize" style={{ fontWeight: 700 }}>{isEventCard ? 'event' : card.type}</span>
              </div>
              {/* Entry type badge — Free (green) or Paid (amber with price) */}
              {card.entryType === 'paid' ? (
                <div className="px-2.5 py-1 rounded-full bg-amber-500/90 border border-amber-300/50 shadow-lg">
                  <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>{card.entryPrice || 'Paid'}</span>
                </div>
              ) : card.entryType === 'free' ? (
                <div className="px-2.5 py-1 rounded-full bg-emerald-500/90 border border-emerald-300/50 shadow-lg">
                  <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>FREE</span>
                </div>
              ) : null}
            </div>
            <div className="absolute top-4 left-4">
              {isEventCard ? (
                <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 shadow-lg flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-300" strokeWidth={2.5} />
                  <span className="text-[12px] text-white" style={{ fontWeight: 700 }}>{card.eventDate || 'Tonight'}</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 shadow-lg flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2.5} />
                  <span className="text-[12px] text-white" style={{ fontWeight: 700 }}>{card.distance}</span>
                </div>
              )}
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
                {isEventCard ? (
                  <>
                    {card.eventTime && <span className="text-[15px] text-cyan-300" style={{ fontWeight: 700 }}>{card.eventTime}</span>}
                    {card.location && <span className="text-[13px] text-white/75" style={{ fontWeight: 500 }}>{card.location}</span>}
                  </>
                ) : (
                  <>
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
                  </>
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
  onNavigateToMap?: (venueName?: string) => void;
  onShowBottomNav?: () => void;
  onTouch?: () => void;
  onBookRide?: (venue?: { name: string; lat?: number; lng?: number }) => void;
  initialFilter?: CardType;
  apiCards: DiscoverCard[];
  events?: AppEvent[];
  loading: boolean;
  eventsLoading?: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshEvents?: () => Promise<void>;
  /** Google Places text search */
  searchPlaces?: (query: string) => Promise<DiscoverCard[]>;
  /** Google Places nearby search by type */
  searchNearby?: (type?: string) => Promise<DiscoverCard[]>;
  placesLoading?: boolean;
}

// Map CardType → Google Places API type string
const CARD_TYPE_TO_GOOGLE: Record<string, string> = {
  coffee: 'cafe',
  dining: 'restaurant',
  nightlife: 'night_club',
  shopping: 'shopping_mall',
  entertainment: 'movie_theater',
  fitness: 'gym',
  parking: 'parking',
};

export function DiscoverSection({ isDarkMode, onNavigateToMap, onShowBottomNav, onTouch, onBookRide, initialFilter, apiCards, events = [], loading, eventsLoading = false, error, refresh, refreshEvents, searchPlaces, searchNearby, placesLoading }: DiscoverSectionProps) {
  // Google Places results (populated on filter change)
  const [googleCards, setGoogleCards] = useState<DiscoverCard[]>([]);

  // Live API cards + event feed + Google Places only — no mock fallbacks
  const [currentIndex, setCurrentIndex] = useState(0);
  const [appliedFilter, setAppliedFilter] = useState<CardType | null>(null);
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'free' | 'paid'>('all');
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
  const eventCards = events.map(toEventDiscoverCard);
  const isEventSurface = appliedFilter === 'entertainment';
  const cards = [...eventCards, ...apiCards, ...googleCards].filter(card =>
    !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET || card.type !== 'valet'
  );
  const hasLiveVenueCards = cards.length > 0;
  const isSurfaceLoading = (isEventSurface && eventsLoading) || (!isEventSurface && loading);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleRefresh = async (showToast = false) => {
    if (isRefreshing) return;

    setIsRefreshing(true);

    if (showToast) {
      toast.success('Refreshing discover feed...', {
        description: 'Finding new spots for you',
        duration: 2000,
      });
    }

    try {
      const refreshTasks = [refresh()];
      if (refreshEvents) refreshTasks.push(refreshEvents());
      await Promise.all(refreshTasks);
      setCurrentIndex(0);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      setStartY(0);
    }
  };

  // 1. Category filter
  let filteredCards = isEventSurface
    ? eventCards
    : appliedFilter
      ? cards.filter(card => normalizeCardType(card.type) === appliedFilter)
      : cards;

  // 1b. Entry type filter (composable with category)
  if (entryTypeFilter !== 'all') {
    filteredCards = filteredCards.filter(card =>
      (card.entryType ?? 'free') === entryTypeFilter
    );
  }

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
  const safeCurrentIndex = filteredCards.length
    ? Math.min(currentIndex, filteredCards.length - 1)
    : 0;
  const currentCard = filteredCards[safeCurrentIndex] ?? null;
  const nextCard = filteredCards.length > 1
    ? filteredCards[(safeCurrentIndex + 1) % filteredCards.length]
    : null;

  const handleNext = () => {
    if (!filteredCards.length) return;
    setCurrentIndex(prev => (prev + 1) % filteredCards.length);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const card = currentCard;
    if (!card) return;
    
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
    setAppliedFilter(APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && initialFilter === 'valet' ? null : (initialFilter ?? null));
    setCurrentIndex(0);
  }, [initialFilter]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [appliedFilter, showSavedOnly]);

  // Fetch Google Places results when a category filter is applied
  useEffect(() => {
    if (!appliedFilter || appliedFilter === 'entertainment' || !searchNearby) {
      if (appliedFilter === 'entertainment') setGoogleCards([]);
      return;
    }
    // Only search for categories that map to Google types
    const googleType = CARD_TYPE_TO_GOOGLE[appliedFilter];
    if (!googleType) { setGoogleCards([]); return; }
    let cancelled = false;
    searchNearby(googleType).then((results) => {
      if (!cancelled) {
        setGoogleCards(results);
        setCurrentIndex(0);
      }
    });
    return () => { cancelled = true; };
  }, [appliedFilter, searchNearby]);

  useEffect(() => {
    if (!filteredCards.length) {
      setCurrentIndex(0);
      return;
    }

    if (currentIndex > filteredCards.length - 1) {
      setCurrentIndex(0);
    }
  }, [currentIndex, filteredCards.length]);

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
      void handleRefresh(true);
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
    } else if (!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && card.type === 'valet') {
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
      {isSurfaceLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <motion.div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="w-6 h-6 text-white" />
          </motion.div>
          <p className="text-white/60 text-sm">{isEventSurface ? 'Loading tonight’s events…' : 'Loading Atlanta venues…'}</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && !hasLiveVenueCards && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 px-6">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleRefresh();
            }}
            disabled={isRefreshing}
            className="px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-medium"
          >
            {isRefreshing ? 'Retrying…' : 'Retry'}
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
          ].filter(cat => !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET || cat.value !== 'valet') as { label: string; value: CardType | null }[]).map((cat) => {
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

        {/* Entry type pills — Free / Paid / All */}
        <div className="flex gap-1.5">
          {([
            { label: '🎟️ All', value: 'all' as const },
            { label: '✅ Free', value: 'free' as const },
            { label: '💰 Paid', value: 'paid' as const },
          ]).map((opt) => {
            const active = entryTypeFilter === opt.value;
            return (
              <motion.button
                key={opt.value}
                onClick={() => { setEntryTypeFilter(opt.value); setCurrentIndex(0); }}
                className="px-2.5 py-1 rounded-full text-[11px] transition-all"
                data-testid={`discover-entry-filter-${opt.value}`}
                style={{
                  background: active
                    ? opt.value === 'free' ? 'rgba(16,185,129,0.25)' : opt.value === 'paid' ? 'rgba(245,158,11,0.25)' : 'rgba(0,191,255,0.18)'
                    : 'rgba(255,255,255,0.06)',
                  border: active
                    ? opt.value === 'free' ? '1.5px solid rgba(16,185,129,0.7)' : opt.value === 'paid' ? '1.5px solid rgba(245,158,11,0.7)' : '1.5px solid rgba(0,191,255,0.5)'
                    : '1.5px solid rgba(255,255,255,0.12)',
                  color: active
                    ? opt.value === 'free' ? '#6ee7b7' : opt.value === 'paid' ? '#fcd34d' : '#67e8f9'
                    : 'rgba(255,255,255,0.45)',
                  fontWeight: active ? 700 : 500,
                }}
                whileTap={{ scale: 0.93 }}
              >
                {opt.label}
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

      {/* Empty state — filter returned zero results */}
      {!isSurfaceLoading && !showSavedOnly && filteredCards.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6">
          <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-1">
            {isEventSurface ? <Sparkles className="w-7 h-7 text-white/20" strokeWidth={1.5} /> : <MapPin className="w-7 h-7 text-white/20" strokeWidth={1.5} />}
          </div>
          <p className="text-white/50 text-[15px] text-center" style={{ fontWeight: 500 }}>
            {isEventSurface ? 'No events match this filter.' : 'No spots match this filter.'}<br />Try a different category.
          </p>
          <motion.button
            onClick={() => { setAppliedFilter(null); setCurrentIndex(0); }}
            className="px-5 py-2 rounded-full bg-cyan-600 text-white text-[14px]"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.96 }}
          >
            Show All
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
        {/* Background card — depth/stack effect */}
        {nextCard && (
          <div
            className="absolute inset-4 rounded-[32px] bg-[#1C1C1E] border-4 border-white/15 shadow-lg overflow-hidden"
            style={{ transform: 'scale(0.94) translateY(12px)', zIndex: 0, opacity: 0.6 }}
          >
            <img
              src={nextCard.image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              aria-hidden="true"
            />
          </div>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {currentCard && (
            <SwipeableCard
              key={`${appliedFilter ?? 'all'}-${currentCard.type}-${currentCard.id}-${safeCurrentIndex}`}
              card={currentCard}
              onSwipe={handleSwipe}
              onShowBottomNav={onShowBottomNav}
              onTouch={onTouch}
              onCardTap={handleCardClick}
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
            onNavigateToMap={() => {
              onNavigateToMap?.(selectedVenue?.name);
              setSelectedVenue(null);
            }}
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
            onClose={() => setSelectedParkingSpot(null)}
            isDarkMode={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && selectedValetService && (
          <Suspense fallback={null}>
            <ValetFlow
              service={selectedValetService}
              isDarkMode={true}
              onClose={() => setSelectedValetService(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

    </div>
  );
}
