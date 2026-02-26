import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, Star, Navigation, Clock, Users, Music, 
  TrendingUp, Instagram, Sparkles, Info, Eye, Camera,
  Zap, Coffee, Wine, Utensils, ThumbsUp, MessageCircle,
  Share2, Heart, Phone, DollarSign, Shield, CheckCircle,
  Activity, Flame, TrendingDown, AlertCircle, Play, Image as ImageIcon,
  ChevronLeft, ChevronRight, Volume2, VolumeX
} from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { EphemeralPostCreator } from './EphemeralPostCreator';

type EnergyLevel = 'chill' | 'social' | 'energetic' | 'peak';
type VenueCategory = 'bar' | 'nightclub' | 'restaurant' | 'lounge' | 'cafe';
type PredictionTrend = 'busier' | 'quieter' | 'same';
type MediaType = 'image' | 'video';

interface MediaItem {
  id: number;
  type: MediaType;
  url: string;
  thumbnail?: string;
  caption?: string;
  timestamp: string;
  uploadedBy: 'host' | 'user';
}

interface VenueInsiderData {
  id: number;
  name: string;
  category: VenueCategory;
  distance: number;
  rating: number;
  currentCapacity: number;
  maxCapacity: number;
  energyLevel: EnergyLevel;
  crowdDemographics: {
    ageRange: string;
    groupTypes: string[];
    vibe: string;
  };
  staffReports: {
    dj: string;
    musicGenre: string;
    specialEvents: string[];
    kitchenStatus: 'normal' | 'busy' | 'delayed';
    bartenderRecommendations: string[];
    lastUpdate: string;
  };
  socialBuzz: {
    instagramMentions: number;
    tiktokViews: number;
    currentHashtags: string[];
    influencerPresence: boolean;
    trendingScore: number;
  };
  predictions: {
    peakTime: string;
    nextHour: PredictionTrend;
    bestTimeToArrive: string;
    waitTimeEstimate: number;
  };
  insiderTips: string[];
  staffPicks: string[];
  hiddenMenu: string[];
  media?: MediaItem[];
}

interface VenueInsiderDetailsProps {
  venue: VenueInsiderData | null;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export function VenueInsiderDetails({ venue, isOpen, onClose, isDarkMode }: VenueInsiderDetailsProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showPostCreator, setShowPostCreator] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  if (!venue) return null;

  const capacityPercentage = Math.round((venue.currentCapacity / venue.maxCapacity) * 100);

  const getEnergyInfo = (level: EnergyLevel) => {
    switch (level) {
      case 'chill':
        return { color: '#3B82F6', label: 'Chill Vibes', icon: Coffee };
      case 'social':
        return { color: '#10B981', label: 'Social Scene', icon: Users };
      case 'energetic':
        return { color: '#F59E0B', label: 'High Energy', icon: Zap };
      case 'peak':
        return { color: '#EF4444', label: 'Peak Crowd', icon: Flame };
    }
  };

  const energyInfo = getEnergyInfo(venue.energyLevel);
  const EnergyIcon = energyInfo.icon;

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleFavorite = () => {
    triggerHaptic();
    setIsFavorite(!isFavorite);
    toast.success(isFavorite ? 'Removed from Favorites' : 'Added to Favorites', {
      description: venue.name,
      duration: 2000,
    });
  };

  const handleShare = () => {
    triggerHaptic();
    toast.success('Link Copied', {
      description: 'Venue link copied to clipboard',
      duration: 2000,
    });
  };

  const handleNavigate = () => {
    triggerHaptic();
    toast.success('Navigation Started', {
      description: `Navigating to ${venue.name}`,
      duration: 2000,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Details Panel */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] max-w-[393px] mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springConfig}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <motion.div
                className="w-12 h-1.5 rounded-full bg-white/40"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
                transition={springConfig}
              />
            </div>

            {/* Content */}
            <div className="bg-[#1C1C1E]/98 backdrop-blur-2xl border-t-2 border-white/30 rounded-t-[28px] overflow-hidden shadow-2xl max-h-[88vh] overflow-y-auto scrollbar-hide">
              {/* Header */}
              <div className="sticky top-0 bg-[#1C1C1E]/98 backdrop-blur-2xl border-b border-white/20 z-10">
                <div className="px-6 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <motion.button
                      onClick={onClose}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                    >
                      <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </motion.button>

                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={() => {
                          triggerHaptic();
                          setShowPostCreator(true);
                        }}
                        className="px-3 py-2 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-2 border-purple-400 flex items-center gap-1.5"
                        whileTap={{ scale: 0.95 }}
                        transition={springConfig}
                      >
                        <Camera className="w-4 h-4 text-purple-300" strokeWidth={2.5} />
                        <span className="text-[13px] text-white" style={{ fontWeight: 700 }}>
                          SHARE STORY
                        </span>
                      </motion.button>

                      <motion.button
                        onClick={handleShare}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30"
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                      >
                        <Share2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                      </motion.button>

                      <motion.button
                        onClick={handleFavorite}
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                          isFavorite 
                            ? 'bg-pink-500/20 border-pink-400' 
                            : 'bg-white/10 border-white/30'
                        }`}
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                      >
                        <Heart 
                          className={`w-5 h-5 ${isFavorite ? 'text-pink-400 fill-pink-400' : 'text-white'}`} 
                          strokeWidth={2.5} 
                        />
                      </motion.button>
                    </div>
                  </div>

                  <h2 className="text-[24px] text-white mb-2" style={{ fontWeight: 700 }}>
                    {venue.name}
                  </h2>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                        {venue.rating}
                      </span>
                    </div>
                    <span className="text-white/70">•</span>
                    <MapPin className="w-4 h-4 text-cyan-400" strokeWidth={2} />
                    <span className="text-[15px] text-white/90" style={{ fontWeight: 500 }}>
                      {venue.distance} mi away
                    </span>
                    {venue.socialBuzz.influencerPresence && (
                      <>
                        <span className="text-white/70">•</span>
                        <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-400/40">
                          <span className="text-[11px] text-pink-300" style={{ fontWeight: 700 }}>
                            VIP SPOTTED
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Energy Badge */}
                  <div 
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full border-2"
                    style={{ 
                      backgroundColor: `${energyInfo.color}20`,
                      borderColor: energyInfo.color,
                    }}
                  >
                    <EnergyIcon 
                      className="w-4 h-4"
                      style={{ color: energyInfo.color }}
                      strokeWidth={2.5}
                    />
                    <span 
                      className="text-[13px]"
                      style={{ 
                        fontWeight: 700,
                        color: energyInfo.color,
                      }}
                    >
                      {energyInfo.label.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Media Gallery */}
              {venue.media && venue.media.length > 0 && (
                <div className="px-6 py-5 border-b border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Camera className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
                      <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                        Live from Venue
                      </h3>
                      <motion.div
                        className="w-2 h-2 rounded-full bg-red-500"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      {venue.media.length} {venue.media.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <div className="relative">
                    <div className="overflow-x-auto scrollbar-hide -mx-6 px-6">
                      <div className="flex gap-3 pb-2">
                        {venue.media.map((item, index) => (
                          <motion.div
                            key={item.id}
                            className="relative flex-shrink-0 w-32 h-32 rounded-[16px] overflow-hidden cursor-pointer"
                            whileTap={{ scale: 0.95 }}
                            transition={springConfig}
                            onClick={() => {
                              triggerHaptic();
                              setSelectedMediaIndex(index);
                              setShowMediaViewer(true);
                            }}
                          >
                            {item.type === 'image' ? (
                              <>
                                <ImageWithFallback
                                  src={item.url}
                                  alt={item.caption || 'Venue photo'}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                <div className="absolute top-2 right-2">
                                  <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center">
                                    <ImageIcon className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <ImageWithFallback
                                  src={item.thumbnail || item.url}
                                  alt={item.caption || 'Venue video'}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md border-2 border-white/60 flex items-center justify-center">
                                    <Play className="w-5 h-5 text-white ml-0.5" strokeWidth={2.5} fill="white" />
                                  </div>
                                </div>
                                <div className="absolute top-2 left-2">
                                  <div className="px-2 py-0.5 rounded-full bg-red-500/80 backdrop-blur-md border border-red-400">
                                    <span className="text-[10px] text-white" style={{ fontWeight: 700 }}>
                                      VIDEO
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
                            
                            {item.uploadedBy === 'host' && (
                              <div className="absolute bottom-2 left-2">
                                <div className="px-2 py-0.5 rounded-full bg-purple-500/80 backdrop-blur-md border border-purple-400">
                                  <span className="text-[9px] text-white" style={{ fontWeight: 700 }}>
                                    HOST
                                  </span>
                                </div>
                              </div>
                            )}

                            {item.caption && (
                              <div className="absolute bottom-2 right-2 left-2">
                                <p className="text-[10px] text-white line-clamp-2" style={{ fontWeight: 500 }}>
                                  {item.caption}
                                </p>
                              </div>
                            )}

                            <div className="absolute bottom-2 right-2">
                              <span className="text-[9px] text-white/80" style={{ fontWeight: 500 }}>
                                {item.timestamp}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Metrics */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    Live Venue Pulse
                  </h3>
                  <motion.div
                    className="w-2 h-2 rounded-full bg-red-500"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-[14px] bg-white/5 border border-white/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
                      <span className="text-[12px] text-white/70" style={{ fontWeight: 600 }}>
                        CROWD LEVEL
                      </span>
                    </div>
                    <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
                      {capacityPercentage}%
                    </div>
                    <div className="text-[12px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                      {venue.currentCapacity} / {venue.maxCapacity} people
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: energyInfo.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${capacityPercentage}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-[14px] bg-white/5 border border-white/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
                      <span className="text-[12px] text-white/70" style={{ fontWeight: 600 }}>
                        WAIT TIME
                      </span>
                    </div>
                    <div className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
                      {venue.predictions.waitTimeEstimate}m
                    </div>
                    <div className="text-[12px] text-white/70" style={{ fontWeight: 500 }}>
                      {venue.predictions.bestTimeToArrive}
                    </div>
                  </div>
                </div>
              </div>

              {/* Crowd Demographics */}
              <div className="px-6 py-5 border-b border-white/10">
                <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
                  Crowd Composition
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20">
                    <span className="text-[14px] text-white/80" style={{ fontWeight: 500 }}>
                      Age Range
                    </span>
                    <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                      {venue.crowdDemographics.ageRange}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20">
                    <span className="text-[14px] text-white/80" style={{ fontWeight: 500 }}>
                      Typical Groups
                    </span>
                    <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                      {venue.crowdDemographics.groupTypes.join(', ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20">
                    <span className="text-[14px] text-white/80" style={{ fontWeight: 500 }}>
                      Current Vibe
                    </span>
                    <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                      {venue.crowdDemographics.vibe}
                    </span>
                  </div>
                </div>
              </div>

              {/* Music & Entertainment */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Music className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    Music & Entertainment
                  </h3>
                  <span className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
                    Updated {venue.staffReports.lastUpdate}
                  </span>
                </div>

                <div className="p-4 rounded-[14px] bg-gradient-to-r from-purple-500/15 to-pink-500/15 border-2 border-purple-400/30 mb-3">
                  <div className="text-[16px] text-white mb-2" style={{ fontWeight: 700 }}>
                    {venue.staffReports.dj}
                  </div>
                  <div className="text-[14px] text-white/90 mb-3" style={{ fontWeight: 500 }}>
                    Playing: {venue.staffReports.musicGenre}
                  </div>

                  {venue.staffReports.specialEvents.length > 0 && (
                    <div className="space-y-2">
                      {venue.staffReports.specialEvents.map((event, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-yellow-400" strokeWidth={2.5} />
                          <span className="text-[13px] text-yellow-300" style={{ fontWeight: 600 }}>
                            {event}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Social Buzz */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    Social Buzz
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-[14px] bg-gradient-to-br from-pink-500/15 to-purple-500/15 border border-pink-400/30">
                    <Instagram className="w-5 h-5 text-pink-400 mb-2" strokeWidth={2.5} />
                    <div className="text-[20px] text-white mb-1" style={{ fontWeight: 700 }}>
                      {venue.socialBuzz.instagramMentions}
                    </div>
                    <div className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                      Instagram mentions
                    </div>
                  </div>

                  <div className="p-3 rounded-[14px] bg-gradient-to-br from-cyan-500/15 to-blue-500/15 border border-cyan-400/30">
                    <Eye className="w-5 h-5 text-cyan-400 mb-2" strokeWidth={2.5} />
                    <div className="text-[20px] text-white mb-1" style={{ fontWeight: 700 }}>
                      {(venue.socialBuzz.tiktokViews / 1000).toFixed(1)}k
                    </div>
                    <div className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                      TikTok views
                    </div>
                  </div>
                </div>

                {venue.socialBuzz.currentHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {venue.socialBuzz.currentHashtags.map((tag, index) => (
                      <div 
                        key={index}
                        className="px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/40"
                      >
                        <span className="text-[12px] text-cyan-300" style={{ fontWeight: 600 }}>
                          {tag}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 p-3 rounded-[14px] bg-white/5 border border-white/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-white/80" style={{ fontWeight: 500 }}>
                      Trending Score
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-white/20 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${venue.socialBuzz.trendingScore}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-[16px] text-white" style={{ fontWeight: 700 }}>
                        {venue.socialBuzz.trendingScore}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Predictions */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-yellow-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    AI Predictions
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-[14px] bg-gradient-to-r from-yellow-500/15 to-orange-500/15 border-2 border-yellow-400/30">
                    <div className="flex items-center gap-2 mb-2">
                      {venue.predictions.nextHour === 'busier' && (
                        <>
                          <TrendingUp className="w-5 h-5 text-orange-400" strokeWidth={2.5} />
                          <span className="text-[14px] text-orange-300" style={{ fontWeight: 700 }}>
                            GETTING BUSIER
                          </span>
                        </>
                      )}
                      {venue.predictions.nextHour === 'quieter' && (
                        <>
                          <TrendingDown className="w-5 h-5 text-green-400" strokeWidth={2.5} />
                          <span className="text-[14px] text-green-300" style={{ fontWeight: 700 }}>
                            QUIETING DOWN
                          </span>
                        </>
                      )}
                      {venue.predictions.nextHour === 'same' && (
                        <>
                          <Activity className="w-5 h-5 text-blue-400" strokeWidth={2.5} />
                          <span className="text-[14px] text-blue-300" style={{ fontWeight: 700 }}>
                            STEADY CROWD
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[13px] text-white/90" style={{ fontWeight: 500 }}>
                      Peak expected at {venue.predictions.peakTime}
                    </div>
                  </div>
                </div>
              </div>

              {/* Staff Picks */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <ThumbsUp className="w-5 h-5 text-green-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    Staff Recommendations
                  </h3>
                </div>

                <div className="space-y-2">
                  {venue.staffReports.bartenderRecommendations.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-[14px] bg-white/5 border border-white/20"
                    >
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" strokeWidth={2.5} />
                      <span className="text-[14px] text-white/90" style={{ fontWeight: 500 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insider Tips */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
                  <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                    Insider Tips
                  </h3>
                </div>

                <div className="space-y-3">
                  {venue.insiderTips.map((tip, index) => (
                    <div 
                      key={index}
                      className="p-3 rounded-[14px] bg-cyan-500/10 border border-cyan-400/30"
                    >
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <span className="text-[13px] text-white/90" style={{ fontWeight: 500 }}>
                          {tip}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hidden Menu */}
              {venue.hiddenMenu.length > 0 && (
                <div className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Eye className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
                    <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      Secret Menu Items
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {venue.hiddenMenu.map((item, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-3 rounded-[14px] bg-gradient-to-r from-purple-500/15 to-pink-500/15 border border-purple-400/30"
                      >
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          {item}
                        </span>
                        <div className="px-2 py-1 rounded-full bg-purple-500/30">
                          <span className="text-[10px] text-purple-200" style={{ fontWeight: 700 }}>
                            ASK STAFF
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="sticky bottom-0 px-6 py-4 bg-[#1C1C1E]/98 backdrop-blur-2xl border-t border-white/20">
                <motion.button
                  onClick={handleNavigate}
                  className="w-full py-4 rounded-[14px] bg-gradient-to-r from-purple-500 to-cyan-500 border-2 border-white/30 flex items-center justify-center gap-2"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                    Navigate to Venue
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Fullscreen Media Viewer */}
          <AnimatePresence>
            {showMediaViewer && venue.media && venue.media.length > 0 && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black z-[80]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />

                {/* Media Container */}
                <motion.div
                  className="fixed inset-0 z-[90] flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Close Button */}
                  <div className="absolute top-6 right-6 z-10">
                    <motion.button
                      onClick={() => {
                        triggerHaptic();
                        setShowMediaViewer(false);
                        setIsPlaying(false);
                        if (videoRef.current) {
                          videoRef.current.pause();
                        }
                      }}
                      className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                    >
                      <X className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </motion.button>
                  </div>

                  {/* Counter */}
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/30">
                      <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                        {selectedMediaIndex + 1} / {venue.media.length}
                      </span>
                    </div>
                  </div>

                  {/* Navigation Arrows */}
                  {selectedMediaIndex > 0 && (
                    <div className="absolute left-6 z-10">
                      <motion.button
                        onClick={() => {
                          triggerHaptic();
                          setSelectedMediaIndex(prev => prev - 1);
                          setIsPlaying(false);
                          if (videoRef.current) {
                            videoRef.current.pause();
                          }
                        }}
                        className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center"
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                      >
                        <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.5} />
                      </motion.button>
                    </div>
                  )}

                  {selectedMediaIndex < venue.media.length - 1 && (
                    <div className="absolute right-6 z-10">
                      <motion.button
                        onClick={() => {
                          triggerHaptic();
                          setSelectedMediaIndex(prev => prev + 1);
                          setIsPlaying(false);
                          if (videoRef.current) {
                            videoRef.current.pause();
                          }
                        }}
                        className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center"
                        whileTap={{ scale: 0.9 }}
                        transition={springConfig}
                      >
                        <ChevronRight className="w-6 h-6 text-white" strokeWidth={2.5} />
                      </motion.button>
                    </div>
                  )}

                  {/* Media Content */}
                  <div className="w-full h-full flex items-center justify-center p-6">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedMediaIndex}
                        className="relative max-w-full max-h-full"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                      >
                        {venue.media[selectedMediaIndex].type === 'image' ? (
                          <ImageWithFallback
                            src={venue.media[selectedMediaIndex].url}
                            alt={venue.media[selectedMediaIndex].caption || 'Venue media'}
                            className="max-w-full max-h-[80vh] rounded-[20px] object-contain"
                          />
                        ) : (
                          <div className="relative">
                            <video
                              ref={videoRef}
                              src={venue.media[selectedMediaIndex].url}
                              className="max-w-full max-h-[80vh] rounded-[20px] object-contain"
                              loop
                              muted={isMuted}
                              playsInline
                              onPlay={() => setIsPlaying(true)}
                              onPause={() => setIsPlaying(false)}
                            />
                            
                            {/* Video Controls */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                              <motion.button
                                onClick={() => {
                                  triggerHaptic();
                                  if (videoRef.current) {
                                    if (isPlaying) {
                                      videoRef.current.pause();
                                    } else {
                                      videoRef.current.play();
                                    }
                                  }
                                }}
                                className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-xl border-2 border-white/60 flex items-center justify-center"
                                whileTap={{ scale: 0.9 }}
                                transition={springConfig}
                              >
                                {isPlaying ? (
                                  <div className="w-5 h-5 flex items-center justify-center">
                                    <div className="flex gap-1">
                                      <div className="w-1.5 h-5 bg-black rounded-sm" />
                                      <div className="w-1.5 h-5 bg-black rounded-sm" />
                                    </div>
                                  </div>
                                ) : (
                                  <Play className="w-6 h-6 text-black ml-1" strokeWidth={2.5} fill="black" />
                                )}
                              </motion.button>

                              <motion.button
                                onClick={() => {
                                  triggerHaptic();
                                  setIsMuted(!isMuted);
                                }}
                                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center"
                                whileTap={{ scale: 0.9 }}
                                transition={springConfig}
                              >
                                {isMuted ? (
                                  <VolumeX className="w-5 h-5 text-white" strokeWidth={2.5} />
                                ) : (
                                  <Volume2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                                )}
                              </motion.button>
                            </div>
                          </div>
                        )}

                        {/* Caption & Info */}
                        {venue.media[selectedMediaIndex].caption && (
                          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-[20px]">
                            <p className="text-[15px] text-white mb-1" style={{ fontWeight: 500 }}>
                              {venue.media[selectedMediaIndex].caption}
                            </p>
                            <div className="flex items-center gap-2">
                              {venue.media[selectedMediaIndex].uploadedBy === 'host' && (
                                <div className="px-2 py-0.5 rounded-full bg-purple-500/80 border border-purple-400">
                                  <span className="text-[10px] text-white" style={{ fontWeight: 700 }}>
                                    HOST
                                  </span>
                                </div>
                              )}
                              <span className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                                {venue.media[selectedMediaIndex].timestamp}
                              </span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Ephemeral Post Creator */}
          <EphemeralPostCreator
            isOpen={showPostCreator}
            onClose={() => setShowPostCreator(false)}
            venueName={venue.name}
            venueId={venue.id}
            isDarkMode={isDarkMode}
            onPostCreated={(post) => {
              // Add post to venue media
              if (venue.media) {
                venue.media.unshift(post);
              }
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}
