import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, MapPin, Users, Calendar,
  Sparkles, TrendingUp, Eye, Clock,
  ChevronRight, Play, Heart, Zap,
  Music, Coffee, Activity, AlertCircle,
  Star, DollarSign, TrendingDown
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { storyGroups, type StoryGroup, type Story } from '../utils/mockData/stories';
import { EphemeralStoriesViewer } from './EphemeralStoriesViewer';
import { EphemeralPostCreator } from './EphemeralPostCreator';
import { VenueInsiderDetails } from './VenueInsiderDetails';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { toast } from 'sonner@2.0.3';

type EnergyLevel = 'chill' | 'social' | 'energetic' | 'peak';
type VenueCategory = 'bar' | 'nightclub' | 'restaurant' | 'lounge' | 'cafe';
type PredictionTrend = 'busier' | 'quieter' | 'same';

interface VenueInsiderData {
  id: number;
  name: string;
  category: VenueCategory;
  distance: number;
  rating: number;
  
  // Real-Time Crowd Intelligence
  currentCapacity: number;
  maxCapacity: number;
  energyLevel: EnergyLevel;
  crowdDemographics: {
    ageRange: string;
    groupTypes: string[];
    vibe: string;
  };
  
  // Staff Insider Intel
  staffReports: {
    dj: string;
    musicGenre: string;
    specialEvents: string[];
    kitchenStatus: 'normal' | 'busy' | 'delayed';
    bartenderRecommendations: string[];
    lastUpdate: string;
  };
  
  // Social Intelligence
  socialBuzz: {
    instagramMentions: number;
    tiktokViews: number;
    currentHashtags: string[];
    influencerPresence: boolean;
    trendingScore: number;
  };
  
  // Predictive Analytics
  predictions: {
    peakTime: string;
    nextHour: PredictionTrend;
    bestTimeToArrive: string;
    waitTimeEstimate: number;
  };
  
  // Insider Tips
  insiderTips: string[];
  staffPicks: string[];
  hiddenMenu: string[];
}

// Sample venue intelligence data
const VENUE_INTELLIGENCE: VenueInsiderData[] = [
  {
    id: 1,
    name: 'The Rooftop',
    category: 'bar',
    distance: 0.4,
    rating: 4.8,
    currentCapacity: 78,
    maxCapacity: 120,
    energyLevel: 'energetic',
    crowdDemographics: {
      ageRange: '25-35',
      groupTypes: ['couples', 'small groups'],
      vibe: 'upscale social',
    },
    staffReports: {
      dj: 'DJ Marcus',
      musicGenre: 'Deep House',
      specialEvents: ['Happy Hour 2-for-1'],
      kitchenStatus: 'normal',
      bartenderRecommendations: ['Spicy Margarita', 'Craft Old Fashioned'],
      lastUpdate: '2 min ago',
    },
    socialBuzz: {
      instagramMentions: 47,
      tiktokViews: 12400,
      currentHashtags: ['#RooftopVibes', '#SFNightlife', '#HappyHour'],
      influencerPresence: true,
      trendingScore: 92,
    },
    predictions: {
      peakTime: '9:30 PM',
      nextHour: 'busier',
      bestTimeToArrive: 'Now - Beat the rush',
      waitTimeEstimate: 15,
    },
    insiderTips: [
      'Request the corner table for best city views',
      'Ask for David - he makes the best cocktails',
      'Skip the regular menu, ask for seasonal specials',
    ],
    staffPicks: ['Spicy Margarita', 'Truffle Fries', 'Seasonal Sunset Cocktail'],
    hiddenMenu: ['Secret Garden Spritz', 'Rooftop Old Fashioned'],
  },
  {
    id: 2,
    name: 'Neon District',
    category: 'nightclub',
    distance: 0.6,
    rating: 4.7,
    currentCapacity: 245,
    maxCapacity: 350,
    energyLevel: 'peak',
    crowdDemographics: {
      ageRange: '21-30',
      groupTypes: ['large groups', 'party crowds'],
      vibe: 'high energy dance',
    },
    staffReports: {
      dj: 'DJ Neon',
      musicGenre: 'EDM/House',
      specialEvents: ['Late Night Set @ 11pm', 'Guest DJ Performance'],
      kitchenStatus: 'busy',
      bartenderRecommendations: ['Neon Bomb Shot', 'Electric Blue'],
      lastUpdate: 'Live now',
    },
    socialBuzz: {
      instagramMentions: 156,
      tiktokViews: 45600,
      currentHashtags: ['#NeonNights', '#EDMLife', '#DanceFloor'],
      influencerPresence: true,
      trendingScore: 98,
    },
    predictions: {
      peakTime: '11:00 PM',
      nextHour: 'same',
      bestTimeToArrive: '10:30 PM for best spot',
      waitTimeEstimate: 25,
    },
    insiderTips: [
      'VIP section available - ask for Mike',
      'Dance floor gets packed after 11pm',
      'Coat check fills up fast',
    ],
    staffPicks: ['Neon Bomb', 'VIP Bottle Service', 'Premium Well Drinks'],
    hiddenMenu: ['Backstage Pass Shot', 'DJ Special'],
  },
];

interface InsiderStoriesHubProps {
  isDarkMode: boolean;
}

export function InsiderStoriesHub({ isDarkMode }: InsiderStoriesHubProps) {
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [selectedVenue, setSelectedVenue] = useState<VenueInsiderData | null>(null);
  const [showVenueDetails, setShowVenueDetails] = useState(false);
  const [venues, setVenues] = useState<VenueInsiderData[]>(VENUE_INTELLIGENCE);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setVenues(prev => prev.map(venue => ({
        ...venue,
        currentCapacity: Math.max(
          10, 
          Math.min(
            venue.maxCapacity, 
            venue.currentCapacity + Math.floor(Math.random() * 11) - 5
          )
        ),
        socialBuzz: {
          ...venue.socialBuzz,
          instagramMentions: venue.socialBuzz.instagramMentions + Math.floor(Math.random() * 3),
          tiktokViews: venue.socialBuzz.tiktokViews + Math.floor(Math.random() * 100),
        },
      })));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Categorize stories
  const trendingStories = storyGroups
    .filter(group => group.stories.some(s => (s.views || 0) > 300))
    .slice(0, 5);

  const nearbyVenueStories = storyGroups
    .filter(group => group.isHost && group.venueId)
    .slice(0, 6);

  const peopleYouFollow = storyGroups
    .filter(group => !group.isHost)
    .slice(0, 5);

  const eventStories = storyGroups
    .filter(group => group.stories.some(s => 
      s.caption?.toLowerCase().includes('event') || 
      s.caption?.toLowerCase().includes('special') ||
      s.caption?.toLowerCase().includes('dj') ||
      s.caption?.toLowerCase().includes('live')
    ))
    .slice(0, 4);

  const handleStoryClick = (index: number) => {
    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    setSelectedStoryIndex(index);
    setShowStoriesViewer(true);
    
    toast.success('Opening story...', {
      duration: 1000,
    });
  };

  const handleCreateStory = () => {
    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    setShowStoryCreator(true);
    
    toast.success('Create your story', {
      description: 'Share your experience',
      duration: 2000,
    });
  };

  const handleVenueClick = (venue: VenueInsiderData) => {
    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    setSelectedVenue(venue);
    setShowVenueDetails(true);
    
    toast.success(`Opening ${venue.name}`, {
      description: 'Loading venue intelligence...',
      duration: 1500,
    });
  };

  // Get energy level info
  const getEnergyInfo = (level: EnergyLevel) => {
    switch (level) {
      case 'chill':
        return { 
          color: 'from-blue-500 to-cyan-500', 
          bg: 'bg-blue-500/20',
          border: 'border-blue-400',
          text: 'Chill Vibes',
          icon: Coffee,
        };
      case 'social':
        return { 
          color: 'from-green-500 to-emerald-500', 
          bg: 'bg-green-500/20',
          border: 'border-green-400',
          text: 'Social Scene',
          icon: Users,
        };
      case 'energetic':
        return { 
          color: 'from-orange-500 to-amber-500', 
          bg: 'bg-orange-500/20',
          border: 'border-orange-400',
          text: 'High Energy',
          icon: Zap,
        };
      case 'peak':
        return { 
          color: 'from-red-500 to-pink-500', 
          bg: 'bg-red-500/20',
          border: 'border-red-400',
          text: 'Peak Crowd',
          icon: Flame,
        };
    }
  };

  // Get capacity percentage
  const getCapacityPercentage = (venue: VenueInsiderData) => {
    return Math.round((venue.currentCapacity / venue.maxCapacity) * 100);
  };

  // Get capacity status
  const getCapacityStatus = (percentage: number) => {
    if (percentage < 50) return { text: 'Plenty of Space', color: 'text-green-400' };
    if (percentage < 75) return { text: 'Getting Busy', color: 'text-yellow-400' };
    if (percentage < 90) return { text: 'Very Busy', color: 'text-orange-400' };
    return { text: 'At Capacity', color: 'text-red-400' };
  };

  // Get prediction trend icon
  const getPredictionIcon = (trend: PredictionTrend) => {
    if (trend === 'busier') return TrendingUp;
    if (trend === 'quieter') return TrendingDown;
    return Activity;
  };

  return (
    <>
      <div className="px-4 pb-6">
        {/* Header */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-title-2 text-white mb-1">
                Insider Intelligence
              </h2>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                Real-time venue insights & stories
              </p>
            </div>

            {/* Create Story Button */}
            <motion.button
              onClick={handleCreateStory}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center gap-2 shadow-lg"
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
            >
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
              <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                Create
              </span>
            </motion.button>
          </div>

          {/* Live Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-red-500/20 to-pink-500/20 border border-red-400/40 w-fit mb-4">
            <motion.div
              className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[11px] text-red-300" style={{ fontWeight: 700 }}>
              LIVE UPDATES ACTIVE
            </span>
          </div>
        </motion.div>

        {/* 🔥 Trending Now - Stories + Intelligence */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-red-500/30 flex items-center justify-center">
                <Flame className="w-4 h-4 text-orange-400" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                Trending Now
              </h3>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/15 border border-orange-400/30">
              <TrendingUp className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
              <span className="text-[10px] text-orange-300" style={{ fontWeight: 700 }}>
                HOT
              </span>
            </div>
          </div>

          {/* Trending Stories Carousel */}
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 mb-4">
            {trendingStories.map((group, index) => (
              <motion.button
                key={group.id}
                onClick={() => handleStoryClick(storyGroups.findIndex(g => g.id === group.id))}
                className="flex-shrink-0 relative"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <div className="w-[120px] h-[200px] rounded-[16px] overflow-hidden relative">
                  <ImageWithFallback
                    src={group.stories[0].url}
                    alt={group.name}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
                  
                  {/* Unviewed Ring */}
                  {group.hasUnviewed && (
                    <div className="absolute inset-0 rounded-[16px] p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500">
                      <div className="w-full h-full rounded-[14px] bg-transparent" />
                    </div>
                  )}
                  
                  {/* Views Badge */}
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
                    <Eye className="w-3 h-3 text-white" strokeWidth={2.5} />
                    <span className="text-[10px] text-white" style={{ fontWeight: 700 }}>
                      {group.stories[0].views || 0}
                    </span>
                  </div>
                  
                  {/* Video Play Icon */}
                  {group.stories[0].type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                        <Play className="w-6 h-6 text-white fill-white" strokeWidth={2.5} />
                      </div>
                    </div>
                  )}
                  
                  {/* Author Info */}
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-white/40">
                        {group.avatar ? (
                          <ImageWithFallback
                            src={group.avatar}
                            alt={group.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500" />
                        )}
                      </div>
                      <span className="text-[11px] text-white flex-1 truncate" style={{ fontWeight: 600 }}>
                        {group.name}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Trending Venue Intelligence Cards */}
          <div className="space-y-3">
            {venues.slice(0, 2).map((venue, index) => {
              const energyInfo = getEnergyInfo(venue.energyLevel);
              const EnergyIcon = energyInfo.icon;
              const capacityPercentage = getCapacityPercentage(venue);
              const capacityStatus = getCapacityStatus(capacityPercentage);
              const PredictionIcon = getPredictionIcon(venue.predictions.nextHour);

              return (
                <motion.button
                  key={venue.id}
                  onClick={() => handleVenueClick(venue)}
                  className="w-full rounded-[16px] p-4 bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/20 shadow-xl text-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springConfig, delay: 0.2 + index * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Venue Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                        {venue.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[13px]">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2.5} />
                        <span className="text-white/80" style={{ fontWeight: 500 }}>
                          {venue.distance} mi
                        </span>
                        <span className="text-white/40">•</span>
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-white/80" style={{ fontWeight: 500 }}>
                          {venue.rating}
                        </span>
                      </div>
                    </div>

                    {/* Trending Score */}
                    {venue.socialBuzz.trendingScore > 85 && (
                      <div className="px-2 py-1 rounded-full bg-orange-500/20 border border-orange-400/40">
                        <span className="text-[10px] text-orange-400" style={{ fontWeight: 700 }}>
                          🔥 {venue.socialBuzz.trendingScore}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Live Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {/* Capacity */}
                    <div className="px-3 py-2 rounded-[12px] bg-white/5 border border-white/10">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users className="w-3.5 h-3.5 text-white/70" strokeWidth={2.5} />
                        <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                          Capacity
                        </span>
                      </div>
                      <p className={`text-[15px] ${capacityStatus.color}`} style={{ fontWeight: 600 }}>
                        {capacityPercentage}%
                      </p>
                      <p className="text-[10px] text-white/60" style={{ fontWeight: 500 }}>
                        {venue.currentCapacity}/{venue.maxCapacity}
                      </p>
                    </div>

                    {/* Energy Level */}
                    <div className={`px-3 py-2 rounded-[12px] ${energyInfo.bg} border ${energyInfo.border}/40`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <EnergyIcon className="w-3.5 h-3.5 text-white/70" strokeWidth={2.5} />
                        <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                          Vibe
                        </span>
                      </div>
                      <p className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                        {energyInfo.text}
                      </p>
                    </div>
                  </div>

                  {/* Now Playing */}
                  {venue.staffReports.dj && (
                    <div className="px-3 py-2 rounded-[12px] bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-400/30 mb-3">
                      <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-purple-300 mb-0.5" style={{ fontWeight: 500 }}>
                            Now Playing
                          </p>
                          <p className="text-[13px] text-white truncate" style={{ fontWeight: 600 }}>
                            {venue.staffReports.musicGenre} • {venue.staffReports.dj}
                          </p>
                        </div>
                        <motion.div
                          className="w-1.5 h-1.5 rounded-full bg-green-400"
                          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Insider Intel Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Social Buzz */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500/15 border border-pink-400/30">
                        <Eye className="w-3 h-3 text-pink-400" strokeWidth={2.5} />
                        <span className="text-[10px] text-pink-300" style={{ fontWeight: 600 }}>
                          {venue.socialBuzz.instagramMentions}
                        </span>
                      </div>

                      {/* Prediction */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30">
                        <PredictionIcon className="w-3 h-3 text-cyan-400" strokeWidth={2.5} />
                        <span className="text-[10px] text-cyan-300 capitalize" style={{ fontWeight: 600 }}>
                          {venue.predictions.nextHour}
                        </span>
                      </div>
                    </div>

                    {/* See More */}
                    <div className="flex items-center gap-1 text-purple-400">
                      <span className="text-[12px]" style={{ fontWeight: 600 }}>
                        See Intel
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </div>
                  </div>

                  {/* Special Events Banner */}
                  {venue.staffReports.specialEvents.length > 0 && (
                    <div className="mt-3 px-3 py-2 rounded-[10px] bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/40">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-orange-400" strokeWidth={2.5} />
                        <p className="text-[12px] text-orange-200" style={{ fontWeight: 600 }}>
                          {venue.staffReports.specialEvents[0]}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        {/* 📍 Nearby Venue Stories */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                Nearby Venues
              </h3>
            </div>
            <button className="flex items-center gap-1">
              <span className="text-[13px] text-cyan-400" style={{ fontWeight: 600 }}>
                See All
              </span>
              <ChevronRight className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {nearbyVenueStories.map((group, index) => (
              <motion.button
                key={group.id}
                onClick={() => handleStoryClick(storyGroups.findIndex(g => g.id === group.id))}
                className="relative aspect-[3/4] rounded-[12px] overflow-hidden"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <ImageWithFallback
                  src={group.stories[0].url}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
                
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                
                {group.hasUnviewed && (
                  <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500 border-2 border-white" />
                )}
                
                <div className="absolute bottom-1.5 left-1.5 right-1.5">
                  <p className="text-[10px] text-white truncate" style={{ fontWeight: 600 }}>
                    {group.name}
                  </p>
                  {group.venue && (
                    <p className="text-[8px] text-white/80" style={{ fontWeight: 500 }}>
                      {group.stories.length} {group.stories.length === 1 ? 'story' : 'stories'}
                    </p>
                  )}
                </div>

                {group.isHost && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-purple-500/90 backdrop-blur-sm border border-white/20">
                    <span className="text-[8px] text-white" style={{ fontWeight: 700 }}>
                      HOST
                    </span>
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* 👥 People You Follow */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                People You Follow
              </h3>
            </div>
            <button className="flex items-center gap-1">
              <span className="text-[13px] text-purple-400" style={{ fontWeight: 600 }}>
                See All
              </span>
              <ChevronRight className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
            </button>
          </div>

          <div className="space-y-3">
            {peopleYouFollow.map((group, index) => (
              <motion.button
                key={group.id}
                onClick={() => handleStoryClick(storyGroups.findIndex(g => g.id === group.id))}
                className="w-full flex items-center gap-3 p-3 rounded-[16px] bg-[#1C1C1E]/60 backdrop-blur-xl border-2 border-white/20"
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className="relative flex-shrink-0">
                  {group.hasUnviewed && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-[2px]">
                      <div className="w-full h-full rounded-full bg-black" />
                    </div>
                  )}
                  <div className={`relative w-14 h-14 rounded-full overflow-hidden ${group.hasUnviewed ? '' : 'border-2 border-white/30'}`}>
                    <div className="absolute inset-0.5 rounded-full overflow-hidden">
                      {group.avatar ? (
                        <ImageWithFallback
                          src={group.avatar}
                          alt={group.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                          <span className="text-white text-[18px]" style={{ fontWeight: 700 }}>
                            {group.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 text-left">
                  <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {group.name}
                  </p>
                  <div className="flex items-center gap-2 text-[12px] text-white/70">
                    <Clock className="w-3 h-3" strokeWidth={2.5} />
                    <span style={{ fontWeight: 500 }}>
                      {group.stories[0].timestamp}
                    </span>
                    {group.stories[0].venue && (
                      <>
                        <span>•</span>
                        <MapPin className="w-3 h-3" strokeWidth={2.5} />
                        <span className="truncate" style={{ fontWeight: 500 }}>
                          {group.stories[0].venue.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 border border-white/20">
                  <ImageWithFallback
                    src={group.stories[0].thumbnail || group.stories[0].url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* 🎉 Events & Happenings */}
        <motion.section
          className="mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500/30 to-orange-500/30 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-pink-400" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                Events & Happenings
              </h3>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500/15 border border-pink-400/30">
              <Sparkles className="w-3 h-3 text-pink-400" strokeWidth={2.5} />
              <span className="text-[10px] text-pink-300" style={{ fontWeight: 700 }}>
                LIVE
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {eventStories.map((group, index) => (
              <motion.button
                key={group.id}
                onClick={() => handleStoryClick(storyGroups.findIndex(g => g.id === group.id))}
                className="relative aspect-[4/5] rounded-[14px] overflow-hidden"
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <ImageWithFallback
                  src={group.stories[0].url}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
                
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80" />
                
                <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-red-500/90 backdrop-blur-sm flex items-center gap-1.5 border border-white/20">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-white"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-[9px] text-white" style={{ fontWeight: 700 }}>
                    LIVE
                  </span>
                </div>
                
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <div className="px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
                    <Eye className="w-3 h-3 text-white" strokeWidth={2.5} />
                    <span className="text-[9px] text-white" style={{ fontWeight: 700 }}>
                      {group.stories[0].views || 0}
                    </span>
                  </div>
                  <div className="px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-400" strokeWidth={2.5} />
                    <span className="text-[9px] text-white" style={{ fontWeight: 700 }}>
                      {Math.floor((group.stories[0].views || 0) * 0.3)}
                    </span>
                  </div>
                </div>
                
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-[12px] text-white mb-1 line-clamp-2" style={{ fontWeight: 600 }}>
                    {group.stories[0].caption}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white/40">
                      {group.avatar ? (
                        <ImageWithFallback
                          src={group.avatar}
                          alt={group.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-pink-500 to-orange-500" />
                      )}
                    </div>
                    <span className="text-[10px] text-white/90 truncate" style={{ fontWeight: 600 }}>
                      {group.name}
                    </span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.section>
      </div>

      {/* Stories Viewer Modal */}
      <AnimatePresence>
        {showStoriesViewer && (
          <EphemeralStoriesViewer
            key="stories-viewer"
            storyGroups={storyGroups}
            initialGroupIndex={selectedStoryIndex}
            isOpen={showStoriesViewer}
            onClose={() => setShowStoriesViewer(false)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* Story Creator Modal */}
      <AnimatePresence>
        {showStoryCreator && (
          <EphemeralPostCreator
            key="story-creator"
            isOpen={showStoryCreator}
            isDarkMode={isDarkMode}
            onClose={() => setShowStoryCreator(false)}
            onPostCreated={(storyData) => {
              setShowStoryCreator(false);
              toast.success('Story created!', {
                description: 'Your story will expire in 24 hours',
                duration: 2000,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Venue Details Modal */}
      <AnimatePresence>
        {showVenueDetails && selectedVenue && (
          <VenueInsiderDetails
            key="venue-details"
            venue={selectedVenue}
            isOpen={showVenueDetails}
            onClose={() => {
              setShowVenueDetails(false);
              setSelectedVenue(null);
            }}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>
    </>
  );
}
