import { motion, PanInfo, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, forwardRef, lazy, Suspense } from 'react';
import { MapPin, Star, Shield, Battery, RefreshCw, Sparkles, Heart, Ticket, CreditCard } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { VenueDetails } from './VenueDetails';
import { ParkingReservationFlow } from './ParkingReservationFlow';
import { type DiscoverCard, type CardType } from '../utils/mockData';
import { type AppEvent } from '../utils/events';
import { saveSpot, isSpotSaved, removeSavedSpot, getSavedSpots, type SpotType } from '../utils/savedSpots';
import { APPLE_REVIEW_HIDE_PROVIDER_AND_VALET } from '../utils/reviewBuild';
import { trpc } from '../utils/trpc';

const APP_STORE_CONSUMER_ONLY_COMPILE_TIME = import.meta.env.VITE_APP_STORE_CONSUMER_ONLY === 'true';
function AppStoreUnavailableFlow() { return null; }
const ValetFlow = APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? AppStoreUnavailableFlow : lazy(() => import('./ValetFlow').then(m => ({ default: m.ValetFlow })));
const decodeKey = (value: string) => atob(value);
const serviceIdKey = decodeKey('dmVuZG9yU2VydmljZUlk');
const serviceStatusKey = decodeKey('dmVuZG9yU2VydmljZVN0YXR1cw==');
const serviceOwnerIdKey = decodeKey('dmVuZG9ySWQ=');
const servicePayoutKey = decodeKey('cHJvdmlkZXJQYXlvdXRFc3RpbWF0ZUNlbnRz');
const DISCOVER_SERVICE_HIGHLIGHT_KEY = 'bytspot_discover_highlight_service_card';
function cardField<T = unknown>(card: DiscoverCard, key: string): T | undefined {
  return (card as unknown as Record<string, unknown>)[key] as T | undefined;
}

function getServiceFocusId(card: DiscoverCard): string {
  return cardField<string>(card, serviceIdKey) ?? String(card.id);
}

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
    case 'service': return 'from-cyan-400 to-violet-500';
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
    'service',
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

function isVendorServiceCard(card: DiscoverCard): boolean {
  if (APP_STORE_CONSUMER_ONLY_COMPILE_TIME) return false;
  const status = cardField<string>(card, serviceStatusKey);
  return Boolean(cardField<string>(card, serviceIdKey) && status !== 'draft' && status !== 'archived');
}

function isCottageServiceFallbackCard(card: DiscoverCard): boolean {
  if (isVendorServiceCard(card)) return false;
  const type = normalizeCardType(card.type);
  if (type === 'dining' || type === 'fitness' || type === 'entertainment') return true;

  const searchable = [card.name, card.description, card.location, ...(card.features ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return ['chef', 'massage', 'wellness', 'service', 'private', 'cottage'].some((term) => searchable.includes(term));
}

function getServiceMetricLine(card: DiscoverCard): string {
  return [
    card.rating ? `${card.rating.toFixed(2)} ★${card.bookingCount ? ` (${card.bookingCount} bookings)` : ''}` : null,
    card.price ?? card.entryPrice,
    card.availability,
  ].filter(Boolean).join(' • ');
}

function calculateSimplexScore(card: DiscoverCard, preferredCategory = 'service'): number {
  const numericDistance = Number.parseFloat(card.distance || '999');
  const safeDistance = Number.isFinite(numericDistance) && numericDistance > 0 ? numericDistance : 999;
  const scarcityBoost = card.availableSpots && card.availableSpots <= 4 ? 15 : 0;
  const bookingBoost = Math.min((card.bookingCount ?? 0) / 6, 18);
  const phiEm = (card.rating ?? 4.5) * 0.4 + scarcityBoost + bookingBoost;
  const phiE = 10 * (1 / safeDistance) + (card.etaMinutes ? Math.max(0, 12 - card.etaMinutes / 5) : 0);
  const deltaD = card.price || card.entryPrice ? 10 : 5;
  const lambdaSim = card.serviceCategory?.toLowerCase().includes(preferredCategory) || card.type === 'service' ? 25 : 0;
  const f = 1;
  return phiEm + phiE + deltaD + f * lambdaSim;
}

function hasCheckoutAuth(): boolean {
  const token = localStorage.getItem('bytspot_auth_token');
  return Boolean(token && token !== 'guest_session');
}

function savePendingBookingCard(card: DiscoverCard | null) {
  const serviceId = card ? cardField<string>(card, serviceIdKey) : undefined;
  if (!serviceId) return;
  localStorage.setItem('bytspot_pending_booking_service', serviceId);
  localStorage.setItem('bytspot_pending_booking_card', JSON.stringify(card));
}

function consumePendingBookingCard(): DiscoverCard | null {
  const raw = localStorage.getItem('bytspot_pending_booking_card');
  localStorage.removeItem('bytspot_pending_booking_service');
  localStorage.removeItem('bytspot_pending_booking_card');
  if (!raw) return null;
  try {
    const card = JSON.parse(raw) as DiscoverCard;
    return cardField<string>(card, serviceIdKey) ? card : null;
  } catch {
    return null;
  }
}

interface SwipeableCardProps {
  card: DiscoverCard;
  isHighlighted?: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  onShowBottomNav?: () => void;
  onTouch?: () => void;
  onCardTap?: (card: DiscoverCard) => void;
  onServiceCta?: (card: DiscoverCard) => void;
  onSaveSpot: (card: DiscoverCard) => void;
}


const SwipeableCard = forwardRef<HTMLDivElement, SwipeableCardProps>(
  ({ card, isHighlighted = false, onSwipe, onShowBottomNav, onTouch, onCardTap, onServiceCta, onSaveSpot }, ref) => {
    const [dragX, setDragX] = useState(0);
    const [dragY, setDragY] = useState(0);
    const [exitX, setExitX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartTimeRef = useRef<number>(0);
    const hasDraggedRef = useRef<boolean>(false);
    const isEventCard = card.type === 'entertainment' && (!!card.eventDate || !!card.eventTime);
    const isServiceCard = isVendorServiceCard(card);
    const serviceFocusId = isServiceCard ? getServiceFocusId(card) : undefined;
    const serviceMetricLine = isServiceCard ? getServiceMetricLine(card) : '';

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
        className="absolute inset-4 cursor-grab select-none text-white active:cursor-grabbing"
        data-testid={`discover-swipe-card-${String(card.id)}`}
        data-service-focus-id={serviceFocusId}
        drag={exitX === null}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onPan={handlePan}
        onPanStart={handlePanStart}
        onPanEnd={handlePanEnd}
        animate={{ x: exitX !== null ? exitX : dragX, y: dragY, rotate: rotation, opacity, scale: exitX !== null ? 0.9 : 1 }}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        exit={{ x: exitX !== null ? exitX : (dragX > 0 ? 1000 : -1000), opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <motion.div
          className={`w-full h-full select-none rounded-[32px] overflow-hidden border-4 shadow-2xl bg-[#1C1C1E] text-white flex flex-col ${isServiceCard ? 'border-cyan-300/70 shadow-cyan-500/20' : 'border-white/30'} ${isHighlighted ? 'ring-4 ring-cyan-200/70' : ''}`}
          onClick={handleCardTap}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative flex-shrink-0" style={{ height: isServiceCard ? '205px' : '240px' }}>
            <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
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
                  <span className="text-[12px] text-white capitalize" style={{ fontWeight: 700 }}>{isServiceCard ? 'service' : isEventCard ? 'event' : card.type}</span>
              </div>
              {/* Entry type badge — Free (green) or Paid entry (amber with price) */}
              {card.entryType === 'paid' ? (
                <div className={`px-2.5 py-1 rounded-full border shadow-lg ${isServiceCard ? 'border-cyan-200/50 bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-950/30' : 'bg-amber-500/90 border-amber-300/50'}`}>
                  <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>{card.entryPrice || 'Paid entry'}</span>
                </div>
              ) : card.entryType === 'free' ? (
                <div className="px-2.5 py-1 rounded-full bg-emerald-500/90 border border-emerald-300/50 shadow-lg">
                  <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>FREE ENTRY</span>
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
            <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent ${isServiceCard ? 'p-4 pt-12 text-white' : 'p-5 pt-16'}`}>
              <div className={isServiceCard ? 'select-none rounded-3xl border border-white/20 bg-black/55 p-2.5 text-white shadow-2xl shadow-black/40 backdrop-blur-md' : ''}>
		              <div className="flex items-center gap-2 mb-1.5">
		                <h2 className={`${isServiceCard ? 'line-clamp-1 text-[16px] leading-5' : 'text-title-2'} text-white drop-shadow-sm shadow-black`}>{isServiceCard ? card.location ?? card.name : card.name}</h2>
                {card.verified && (
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 border-2 border-white">
                    <Shield className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              {isServiceCard && (
		                <>
		                  <p className="mb-1 line-clamp-2 text-[17px] leading-5 text-white drop-shadow-sm shadow-black" style={{ fontWeight: 950 }}>{card.name}</p>
		                  <p className="mb-2 line-clamp-1 text-[12px] text-white/90 drop-shadow-sm shadow-black" style={{ fontWeight: 750 }}>{card.serviceSubtitle ?? card.description}</p>
		                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-200/60 bg-gradient-to-r from-cyan-500 to-blue-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-cyan-950/25">
		                    <CreditCard className="h-3 w-3" strokeWidth={2.6} /> Ready to book
		                  </div>
		                </>
              )}
              <div className="flex items-center gap-3 text-white/90 drop-shadow-md flex-wrap">
                {isEventCard ? (
                  <>
                    {card.eventTime && <span className="text-[15px] text-white drop-shadow-sm shadow-black" style={{ fontWeight: 700 }}>{card.eventTime}</span>}
                    {card.location && <span className="text-[13px] text-white drop-shadow-sm shadow-black" style={{ fontWeight: 500 }}>{card.location}</span>}
                  </>
                ) : (
                  <>
		                    {card.rating && (<div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2} /><span className="text-[15px]" style={{ fontWeight: 600 }}>{card.rating.toFixed(2)}</span></div>)}
		                    {isServiceCard && card.bookingCount && (<span className="text-[13px]" style={{ fontWeight: 700 }}>{card.bookingCount} bookings</span>)}
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
          </div>
          <div className={`flex-1 min-h-0 flex flex-col bg-gradient-to-t from-black/90 via-[#14141A] to-[#1C1C1E] text-white ${isServiceCard ? 'gap-2 overflow-hidden p-3' : 'gap-2 p-4'}`}>
            {isServiceCard ? (
              <>
                {card.description && (
                  <p className="line-clamp-2 flex-shrink-0 text-[12px] leading-4 text-white/90 drop-shadow-sm shadow-black" style={{ fontWeight: 650 }}>
                    {card.description}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-2.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/70" style={{ fontWeight: 850 }}>Rating</p>
                    <p className="text-[12px] text-white" style={{ fontWeight: 900 }}>{card.rating ? `${card.rating.toFixed(2)} ★` : 'Verified'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-2.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/70" style={{ fontWeight: 850 }}>Demand</p>
                    <p className="line-clamp-1 text-[12px] text-white" style={{ fontWeight: 900 }}>{card.bookingCount ? `${card.bookingCount} bookings` : card.availability ?? 'Available'}</p>
                  </div>
                </div>
                <div className="flex max-h-[34px] flex-wrap gap-1.5 overflow-hidden flex-shrink-0">
                  {[card.serviceCategory, card.availableSpots ? `${card.availableSpots} spots left` : null, card.etaMinutes ? `${card.etaMinutes} min` : null, card.price ?? card.entryPrice]
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((feature, idx) => (
                      <div key={`${feature}-${idx}`} className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-2.5 py-1">
                        <span className="text-[10px] whitespace-nowrap text-white drop-shadow-sm shadow-black" style={{ fontWeight: 800 }}>{feature}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-auto flex-shrink-0 rounded-[22px] border border-cyan-200/25 bg-cyan-300/10 p-2.5 shadow-[0_16px_32px_rgba(0,0,0,0.28)]">
                  <p className="mb-2 line-clamp-1 text-[11px] text-white/90" style={{ fontWeight: 780 }}>{serviceMetricLine}</p>
                  <button
                    type="button"
                    data-testid="service-card-cta"
                    className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 px-4 py-3 text-center text-[14px] text-white shadow-[0_12px_30px_rgba(8,145,178,0.36)] ring-1 ring-white/30 transition-transform active:scale-[0.98]"
                    style={{ fontWeight: 950 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onServiceCta?.(card);
                    }}
                  >
                    {card.ctaText ?? `Book Now • ${card.price ?? card.entryPrice ?? 'View'}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {card.description && (<p className="text-[13px] line-clamp-2 flex-shrink-0 text-white drop-shadow-sm shadow-black" style={{ fontWeight: 500 }}>{card.description}</p>)}
                {card.entryType === 'paid' && (
                  <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                    <div className="px-2.5 py-1 rounded-full border bg-amber-500/10 border-amber-400/25">
                      <span className="text-[11px] whitespace-nowrap text-amber-200" style={{ fontWeight: 800 }}>Paid entry</span>
                    </div>
                    <div className="px-2.5 py-1 rounded-full border flex items-center gap-1.5 bg-fuchsia-500/10 border-fuchsia-400/25">
                      <Ticket className="w-3 h-3 text-fuchsia-300" strokeWidth={2.4} />
                      <span className="text-[11px] whitespace-nowrap text-white drop-shadow-sm shadow-black" style={{ fontWeight: 700 }}>My Access ready</span>
                    </div>
                  </div>
                )}
                {card.features && card.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                    {card.features.slice(0, 4).map((feature, idx) => (
                      <div key={idx} className="px-2.5 py-1 rounded-full border bg-white/10 border-white/20">
                        <span className="text-[11px] whitespace-nowrap text-white drop-shadow-sm shadow-black" style={{ fontWeight: 500 }}>{feature}</span>
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
		                    <span className="text-[12px] text-white drop-shadow-sm shadow-black" style={{ fontWeight: 500 }}>Vibe Score</span>
                      <span className="text-[14px] text-white" style={{ fontWeight: 700 }}>{card.vibe}/10</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full" style={{ width: `${card.vibe * 10}%` }} />
                    </div>
                  </div>
                )}
              </>
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
  onOpenAccessWallet?: () => void;
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

export function DiscoverSection({ isDarkMode, onNavigateToMap, onShowBottomNav, onTouch, onBookRide, onOpenAccessWallet, initialFilter, apiCards, events = [], loading, eventsLoading = false, error, refresh, refreshEvents, searchPlaces, searchNearby, placesLoading }: DiscoverSectionProps) {
  // Google Places results (populated on filter change)
  const [googleCards, setGoogleCards] = useState<DiscoverCard[]>([]);

  // Live API cards + event feed + Google Places only.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [appliedFilter, setAppliedFilter] = useState<CardType | null>(null);
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'crowd' | 'rating' | 'distance'>('crowd');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<DiscoverCard | null>(null);
  const [selectedVendorService, setSelectedVendorService] = useState<DiscoverCard | null>(null);
  const [selectedParkingSpot, setSelectedParkingSpot] = useState<any>(null);
  const [selectedValetService, setSelectedValetService] = useState<any>(null);
  const [isBookingService, setIsBookingService] = useState(false);
  const [bookingServiceMessage, setBookingServiceMessage] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [prioritizedServiceFocusId, setPrioritizedServiceFocusId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(DISCOVER_SERVICE_HIGHLIGHT_KEY);
  });
  const [highlightedServiceFocusId, setHighlightedServiceFocusId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(DISCOVER_SERVICE_HIGHLIGHT_KEY);
  });
  const eventCards = events.map(toEventDiscoverCard);
  const isEventSurface = appliedFilter === 'entertainment';
  const cards = [...apiCards, ...googleCards].filter(card =>
    !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET || card.type !== 'valet'
  );
  const serviceDiscoveryHidden = APP_STORE_CONSUMER_ONLY_COMPILE_TIME || APPLE_REVIEW_HIDE_PROVIDER_AND_VALET;
  const vendorServiceCards = serviceDiscoveryHidden ? [] : cards.filter(isVendorServiceCard);
  const standardDeckCards = serviceDiscoveryHidden ? cards.filter(card => card.type !== 'service') : cards.filter(card => !isVendorServiceCard(card));
  const cottageServiceFallbackCards = appliedFilter === 'service' && vendorServiceCards.length === 0
    ? standardDeckCards.filter(isCottageServiceFallbackCard).slice(0, 8)
    : [];
  const defaultDeckCards = standardDeckCards;
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
    : appliedFilter === 'service'
      ? vendorServiceCards.length > 0 ? vendorServiceCards : cottageServiceFallbackCards
    : appliedFilter
      ? standardDeckCards.filter(card => normalizeCardType(card.type) === appliedFilter)
      : defaultDeckCards;

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
    if (appliedFilter === 'service' && prioritizedServiceFocusId) {
      const aFocused = getServiceFocusId(a) === prioritizedServiceFocusId;
      const bFocused = getServiceFocusId(b) === prioritizedServiceFocusId;
      if (aFocused !== bFocused) return aFocused ? -1 : 1;
    }

    if (appliedFilter === 'service') {
      // Simplex service ranking: Es = Φ_EM + Φ_E + ΔD + f × λ_sim
      return calculateSimplexScore(b) - calculateSimplexScore(a);
    }

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

  useEffect(() => {
    if (appliedFilter !== 'service') {
      setPrioritizedServiceFocusId(null);
      setHighlightedServiceFocusId(null);
      return;
    }

    const focusId = sessionStorage.getItem(DISCOVER_SERVICE_HIGHLIGHT_KEY);
    if (!focusId) return;

    setPrioritizedServiceFocusId(focusId);
    setHighlightedServiceFocusId(focusId);
    setCurrentIndex(0);
    sessionStorage.removeItem(DISCOVER_SERVICE_HIGHLIGHT_KEY);

    const highlightTimeout = window.setTimeout(() => setHighlightedServiceFocusId(null), 2200);
    return () => window.clearTimeout(highlightTimeout);
  }, [appliedFilter, vendorServiceCards.length]);

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

  useEffect(() => {
    if (!hasCheckoutAuth() || selectedVendorService) return;
    const pendingCard = consumePendingBookingCard();
    if (!pendingCard) return;
    setBookingServiceMessage('You are signed in. Confirm this service to continue to Stripe Checkout.');
    setSelectedVendorService(pendingCard);
  }, [selectedVendorService]);

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
    if (isVendorServiceCard(card)) {
      setBookingServiceMessage(null);
      setSelectedVendorService(card);
    } else if (card.type === 'parking') {
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
    } else if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && card.type === 'valet') {
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
        bio: card.bio || card.description || 'Professional arrival support.',
      };
      setSelectedValetService(valetService);
    } else if (card.type === 'venue' || card.type === 'coffee' || card.type === 'dining' ||
               card.type === 'shopping' || card.type === 'nightlife' || card.type === 'entertainment' ||
               card.type === 'fitness') {
      // Show venue details
      setSelectedVenue(card);
    }
  };

  const handleVendorServiceCheckout = async (serviceCard = selectedVendorService) => {
    if (!serviceCard) return;
    const serviceId = cardField<string>(serviceCard, serviceIdKey);
    if (!serviceId || isBookingService) return;
    if (!hasCheckoutAuth()) {
      const message = 'Create an account or sign in before booking a paid service.';
      setBookingServiceMessage(message);
      toast.info('Sign in required', { description: message });
      return;
    }
    setIsBookingService(true);
    setBookingServiceMessage(null);
    try {
      const result = await trpc.booking.createCheckout.mutate({
        serviceId,
        usePoints: false,
        successPath: '/booking/success',
        cancelPath: '/booking/cancelled',
        metadata: {
          source: 'discover.service_card',
          cardName: serviceCard.name,
          [serviceOwnerIdKey]: cardField<string>(serviceCard, serviceOwnerIdKey) ?? null,
          patchId: serviceCard.patchId ?? null,
          patchUid: serviceCard.patchUid ?? null,
        },
      });

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      const message = result?.message ?? 'Checkout is not available yet for this service.';
      setBookingServiceMessage(message);
      toast.info('Checkout not started', { description: message });
    } catch (err: any) {
      const message = err?.message ?? 'Unable to start booking checkout.';
      setBookingServiceMessage(message);
      toast.error('Booking checkout failed', { description: message });
    } finally {
      setIsBookingService(false);
    }
  };

  const handleRequireAuthForBooking = () => {
    savePendingBookingCard(selectedVendorService);
    window.dispatchEvent(new CustomEvent('bytspot:require-auth', { detail: { reason: 'service-booking' } }));
  };

  const handleServiceCardCta = (card: DiscoverCard) => {
    setBookingServiceMessage(null);
    if (hasCheckoutAuth()) {
      void handleVendorServiceCheckout(card);
      return;
    }
    savePendingBookingCard(card);
    window.dispatchEvent(new CustomEvent('bytspot:require-auth', { detail: { reason: 'service-booking' } }));
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
          <p className="text-white/70 text-sm" style={{ fontWeight: 650 }}>{appliedFilter === 'service' ? 'Loading local services from providers and venues…' : isEventSurface ? 'Loading tonight’s events…' : 'Loading Atlanta venues…'}</p>
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
            { label: '🛎 Services',      value: 'service' },
            { label: '💪 Fitness',       value: 'fitness' },
            ...(!APP_STORE_CONSUMER_ONLY_COMPILE_TIME ? [{ label: '🚕 Valet', value: 'valet' as CardType }] : []),
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

        {/* Entry type pills — All / Free / Paid entry */}
        <div className="flex gap-1.5">
          {([
            { label: '🎟️ All access', value: 'all' as const },
            { label: '✅ Free', value: 'free' as const },
            { label: '💳 Paid entry', value: 'paid' as const },
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
            {appliedFilter === 'service' ? 'No local services or nearby providers loaded yet.' : isEventSurface ? 'No events match this filter.' : 'No spots match this filter.'}<br />{appliedFilter === 'service' ? 'Refresh to pull the latest provider and venue data.' : 'Try a different category.'}
          </p>
          <motion.button
            onClick={() => {
              if (appliedFilter === 'service') {
                void handleRefresh(true);
                return;
              }
              setAppliedFilter(null);
              setCurrentIndex(0);
            }}
            className="px-5 py-2 rounded-full bg-cyan-600 text-white text-[14px]"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.96 }}
          >
            {appliedFilter === 'service' ? 'Refresh Services' : 'Show All'}
          </motion.button>
        </div>
      )}

      {/* Swipeable Cards */}
      <div
        className="relative flex-shrink-0"
        style={{
          minHeight: currentCard && isVendorServiceCard(currentCard) ? '540px' : '480px',
          maxHeight: currentCard && isVendorServiceCard(currentCard) ? 'calc(100vh - 220px)' : 'calc(100vh - 280px)',
          height: currentCard && isVendorServiceCard(currentCard) ? 'min(640px, calc(100vh - 220px))' : 'auto',
          marginBottom: currentCard && isVendorServiceCard(currentCard) ? '72px' : undefined,
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
              isHighlighted={isVendorServiceCard(currentCard) && getServiceFocusId(currentCard) === highlightedServiceFocusId}
              onSwipe={handleSwipe}
              onShowBottomNav={onShowBottomNav}
              onTouch={onTouch}
              onCardTap={handleCardClick}
              onServiceCta={handleServiceCardCta}
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
        {!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && selectedVendorService && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-md px-4 pb-4"
            role="dialog"
            aria-label="Book service"
            data-testid="service-booking-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isBookingService && setSelectedVendorService(null)}
          >
            <motion.div
              className="w-full max-w-md rounded-[28px] border border-cyan-200/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5 text-white shadow-[0_26px_90px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
              initial={{ y: 36, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 36, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.2em] text-cyan-200" style={{ fontWeight: 850 }}>Service details</p>
                  <h3 className="mt-1 text-[22px] leading-tight text-white" style={{ fontWeight: 800 }}>{selectedVendorService.name}</h3>
                  <p className="mt-1 text-[13px] text-slate-200/90" style={{ fontWeight: 650 }}>{selectedVendorService.location || 'Experienced professional'}</p>
                </div>
                <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-right shadow-lg shadow-cyan-950/30">
                  <p className="text-[11px] text-white/80" style={{ fontWeight: 800 }}>Price</p>
                  <p className="text-[16px] text-white" style={{ fontWeight: 900 }}>{selectedVendorService.entryPrice || selectedVendorService.price}</p>
                </div>
              </div>

              {selectedVendorService.description && (
                <p className="mt-4 text-[14px] leading-6 text-slate-100/90" style={{ fontWeight: 600 }}>{selectedVendorService.description}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {(selectedVendorService.features ?? []).slice(0, 5).map((feature) => (
                  <span key={feature} className="rounded-full border border-cyan-100/20 bg-white/10 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-black/20" style={{ fontWeight: 750 }}>{feature}</span>
                ))}
              </div>

              {typeof selectedVendorService.platformFeeCents === 'number' && (
                <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-3 text-[12px] leading-5 text-slate-100/90 shadow-inner shadow-cyan-950/20" style={{ fontWeight: 650 }}>
                  Transaction metadata is recalculated server-side before checkout. Estimated professional payout: ${((cardField<number>(selectedVendorService, servicePayoutKey) ?? 0) / 100).toFixed(2)}.
                </div>
              )}

              {bookingServiceMessage && (
                <p className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-[12px] text-amber-50" style={{ fontWeight: 700 }}>{bookingServiceMessage}</p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-[14px] text-white shadow-lg shadow-black/20"
                  style={{ fontWeight: 850 }}
                  disabled={isBookingService}
                  onClick={() => setSelectedVendorService(null)}
                >
                  Not now
                </button>
                <button
                  type="button"
                  data-testid="service-checkout-cta"
                  className="flex-[1.4] rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 px-4 py-3 text-[14px] text-white shadow-xl shadow-cyan-950/30 ring-1 ring-white/30 disabled:opacity-60"
                  style={{ fontWeight: 950 }}
                  disabled={isBookingService}
                  onClick={() => hasCheckoutAuth() ? void handleVendorServiceCheckout() : handleRequireAuthForBooking()}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {isBookingService ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {isBookingService ? 'Starting…' : hasCheckoutAuth() ? 'Book with Stripe' : 'Sign in to book'}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedVenue && (
          <VenueDetails
            venue={selectedVenue}
            onClose={() => setSelectedVenue(null)}
            onOpenAccessWallet={onOpenAccessWallet}
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
        {!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && !APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && selectedValetService && (
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
