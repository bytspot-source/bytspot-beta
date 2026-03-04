import { motion } from 'motion/react';
import { User, Settings, Bell, CreditCard, MapPin, Award, LogOut, ChevronRight, Sparkles, Car, Heart, Crown, Share2, Clock, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { PersonalInfoEdit } from './PersonalInfoEdit';
import { VehicleManagement } from './VehicleManagement';
import { PaymentMethods } from './PaymentMethods';
import { NotificationSettings } from './NotificationSettings';
import { ParkingPreferences } from './ParkingPreferences';
import { LocationSettings } from './LocationSettings';
import { VibePreferences } from './VibePreferences';
import { SavedSpotsSection } from './SavedSpotsSection';
import { BytspotPoints } from './BytspotPoints';
import { getSavedSpotsStats } from '../utils/savedSpots';
import { getUserPoints, getUserTier, getAchievementStats } from '../utils/gamification';
import { getCheckinHistory, type CheckInRecord } from '../utils/checkinHistory';
import { getFollowedUsers, getSocialFeed, unfollowUser, type SocialFeedEvent, type FollowedUser } from '../utils/social';

interface ProfileSectionProps {
  isDarkMode: boolean;
  onBecomeHost?: () => void;
  onBecomeValet?: () => void;
  onLogout?: () => void;
}

type ProfileScreen = 'main' | 'personal-info' | 'vehicles' | 'payment' | 'notifications' | 'parking-preferences' | 'vibe-preferences' | 'location-settings' | 'saved-spots' | 'points' | 'checkin-history' | 'friends';

export function ProfileSection({ isDarkMode, onBecomeHost, onBecomeValet, onLogout }: ProfileSectionProps) {
  const [currentScreen, setCurrentScreen] = useState<ProfileScreen>('main');
  const savedSpotsStats = getSavedSpotsStats();
  const checkinHistory = getCheckinHistory();
  // Read real user data from localStorage
  const userName = (() => {
    const name = localStorage.getItem('bytspot_user_name');
    if (name) return name;
    try {
      const user = JSON.parse(localStorage.getItem('bytspot_user') || '{}');
      return user?.name?.split(' ')[0] || 'Guest';
    } catch { return 'Guest'; }
  })();
  const userPoints = getUserPoints();
  const userTier = getUserTier(userPoints.total);
  const achievementStats = getAchievementStats();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const menuSections = [
    {
      title: 'Account',
      items: [
        { icon: <User className="w-5 h-5" />, label: 'Personal Information', badge: null, screen: 'personal-info' as ProfileScreen },
        { icon: <Car className="w-5 h-5" />, label: 'My Vehicles', badge: '2', screen: 'vehicles' as ProfileScreen },
        { icon: <CreditCard className="w-5 h-5" />, label: 'Payment Methods', badge: '2', screen: 'payment' as ProfileScreen },
        { icon: <Heart className="w-5 h-5" />, label: 'Saved Spots', badge: savedSpotsStats.total > 0 ? savedSpotsStats.total.toString() : null, screen: 'saved-spots' as ProfileScreen },
        { icon: <Clock className="w-5 h-5" />, label: 'Places I\'ve Been', badge: checkinHistory.length > 0 ? checkinHistory.length.toString() : null, screen: 'checkin-history' as ProfileScreen },
        { icon: <Users className="w-5 h-5" />, label: 'Friends', badge: (() => { const f = getFollowedUsers().length; return f > 0 ? f.toString() : null; })(), screen: 'friends' as ProfileScreen },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: <Sparkles className="w-5 h-5" />, label: 'Vibe Preferences', badge: null, screen: 'vibe-preferences' as ProfileScreen },
        { icon: <Car className="w-5 h-5" />, label: 'Parking Preferences', badge: null, screen: 'parking-preferences' as ProfileScreen },
        { icon: <Bell className="w-5 h-5" />, label: 'Notifications', badge: null, screen: 'notifications' as ProfileScreen },
      ],
    },
    {
      title: 'App Settings',
      items: [
        { icon: <MapPin className="w-5 h-5" />, label: 'Location & Privacy', badge: null, screen: 'location-settings' as ProfileScreen },
        { icon: <Settings className="w-5 h-5" />, label: 'General', badge: null, screen: null },
      ],
    },
  ];

  // Show sub-screens
  if (currentScreen === 'personal-info') {
    return <PersonalInfoEdit isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'vehicles') {
    return <VehicleManagement isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'payment') {
    return <PaymentMethods isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'notifications') {
    return <NotificationSettings isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'parking-preferences') {
    return <ParkingPreferences isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }
  
  if (currentScreen === 'vibe-preferences') {
    return <VibePreferences isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'location-settings') {
    return <LocationSettings isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} userRole="parker" />;
  }

  if (currentScreen === 'saved-spots') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <motion.button
            onClick={() => setCurrentScreen('main')}
            className="flex items-center gap-2 text-white mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SavedSpotsSection isDarkMode={isDarkMode} />
        </div>
      </div>
    );
  }

  if (currentScreen === 'points') {
    return <BytspotPoints isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'friends') {
    const followed = getFollowedUsers();
    const feed = getSocialFeed();
    const crowdColor = (lvl: number) =>
      lvl === 1 ? 'text-green-400' : lvl === 2 ? 'text-yellow-400' : lvl === 3 ? 'text-orange-400' : 'text-red-400';
    const crowdEmoji = (lvl: number) => lvl === 1 ? '🟢' : lvl === 2 ? '🟡' : lvl === 3 ? '🟠' : '🔴';
    const formatTime = (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    };
    // Filter feed to only show followed users + own check-ins
    const followedIds = new Set(followed.map((u: FollowedUser) => u.userId));
    const myId = (() => { try { return JSON.parse(localStorage.getItem('bytspot_user') || '{}')?.id || 'me'; } catch { return 'me'; } })();
    const visibleFeed = feed.filter((e: SocialFeedEvent) => followedIds.has(e.userId) || e.userId === myId);
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => setCurrentScreen('main')} className="flex items-center gap-2 text-white" whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className="text-[20px] text-white ml-1" style={{ fontWeight: 700 }}>Friends</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4 mt-2">
          {/* Following list */}
          {followed.length > 0 && (
            <div>
              <p className="text-[12px] text-white/40 mb-2" style={{ fontWeight: 700 }}>FOLLOWING ({followed.length})</p>
              <div className="flex flex-wrap gap-2">
                {followed.map((u: FollowedUser) => (
                  <div key={u.userId} className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#1C1C1E]/80 border border-white/20">
                    <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>{u.userName}</span>
                    <motion.button onClick={() => { unfollowUser(u.userId); setCurrentScreen('main'); setTimeout(() => setCurrentScreen('friends'), 10); }}
                      className="text-white/40 hover:text-red-400 text-[11px]" whileTap={{ scale: 0.88 }}>✕</motion.button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Activity feed */}
          <div>
            <p className="text-[12px] text-white/40 mb-2" style={{ fontWeight: 700 }}>FRIEND ACTIVITY</p>
            {visibleFeed.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-[15px]" style={{ fontWeight: 600 }}>No activity yet</p>
                <p className="text-[13px] mt-1">Follow people on the Leaderboard to see where they're going</p>
              </div>
            ) : visibleFeed.map((event: SocialFeedEvent) => (
              <motion.div key={event.id} className="rounded-[16px] p-4 bg-[#1C1C1E]/80 border border-white/10 mb-3"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-[14px] text-white/80" style={{ fontWeight: 600 }}>
                      <span className="text-white">{event.userId === myId ? 'You' : event.userName}</span>
                      {' '}checked in at{' '}
                      <span className="text-purple-300">{event.venueName}</span>
                    </p>
                    <p className={`text-[13px] mt-1 ${crowdColor(event.crowdLevel)}`} style={{ fontWeight: 500 }}>
                      {crowdEmoji(event.crowdLevel)} {event.crowdLabel}
                    </p>
                  </div>
                  <span className="text-[12px] text-white/30 ml-3 shrink-0">{formatTime(event.timestamp)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'checkin-history') {
    const crowdColor = (lvl: number) =>
      lvl === 1 ? 'text-green-400' : lvl === 2 ? 'text-yellow-400' : lvl === 3 ? 'text-orange-400' : 'text-red-400';
    const crowdBg = (lvl: number) =>
      lvl === 1 ? 'bg-green-500/20 border-green-500/30' : lvl === 2 ? 'bg-yellow-500/20 border-yellow-500/30' : lvl === 3 ? 'bg-orange-500/20 border-orange-500/30' : 'bg-red-500/20 border-red-500/30';
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => setCurrentScreen('main')} className="flex items-center gap-2 text-white" whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className="text-[20px] text-white ml-1" style={{ fontWeight: 700 }}>Places I've Been</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 mt-2">
          {checkinHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <Clock className="w-8 h-8 text-white/40" strokeWidth={1.5} />
              </div>
              <p className="text-white/50 text-[15px]" style={{ fontWeight: 500 }}>No check-ins yet</p>
              <p className="text-white/30 text-[13px] text-center">Check in at venues to track where you've been</p>
            </div>
          ) : checkinHistory.map((record: CheckInRecord) => {
            const d = new Date(record.timestamp);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return (
              <motion.div key={record.id} className="rounded-[16px] p-4 bg-[#1C1C1E]/80 border border-white/15 backdrop-blur-xl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-purple-400" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-[15px] truncate" style={{ fontWeight: 600 }}>{record.venueName}</p>
                      <p className="text-white/50 text-[12px] mt-0.5">{dateStr} · {timeStr}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${crowdBg(record.crowdLevel)} ${crowdColor(record.crowdLevel)}`} style={{ fontWeight: 600 }}>
                      {record.crowdLabel}
                    </span>
                    <span className="text-purple-400 text-[12px]" style={{ fontWeight: 600 }}>+{record.pointsEarned} pts</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Profile Header */}
      <motion.div
        className="px-4 pt-4 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <User className="w-10 h-10 text-white" strokeWidth={2} />
              </div>
              {/* Membership Badge */}
              <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br ${userTier.gradient} border-2 border-white flex items-center justify-center shadow-lg`}>
                <span className="text-[16px]">{userTier.icon}</span>
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h2 className="text-[22px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {userName}
              </h2>
              <div className="flex items-center gap-2">
                <div className={`px-2.5 py-1 rounded-full text-[12px] bg-gradient-to-br ${userTier.gradient}/30 border-2 border-white/30`} style={{ fontWeight: 600 }}>
                  <span className="text-white">{userTier.icon} {userTier.name} Member</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/20">
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                47
              </p>
              <p className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                Bookings
              </p>
            </div>
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {userPoints.total >= 1000 ? `${(userPoints.total / 1000).toFixed(1)}K` : userPoints.total.toLocaleString()}
              </p>
              <p className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                Points
              </p>
            </div>
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {achievementStats.unlocked}
              </p>
              <p className="text-[12px] text-white/80" style={{ fontWeight: 400 }}>
                Badges
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Points & Rewards Quick Access */}
      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <motion.button
          onClick={() => setCurrentScreen('points')}
          className="w-full rounded-[24px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl shadow-xl relative overflow-hidden tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <p className="text-[13px] text-purple-200 mb-0.5" style={{ fontWeight: 600 }}>
                  YOUR REWARDS
                </p>
                <p className="text-[24px] text-white" style={{ fontWeight: 700 }}>
                  {userPoints.total.toLocaleString()} points
                </p>
              </div>
            </div>
            <div>
              <ChevronRight className="w-6 h-6 text-white/60" strokeWidth={2.5} />
            </div>
          </div>

          <div className="relative mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-white/80" strokeWidth={2.5} />
              <span className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                {userTier.name} ({userTier.discount}% off)
              </span>
            </div>
            <div className="w-px h-4 bg-white/30" />
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-white/80" strokeWidth={2.5} />
              <span className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                {achievementStats.unlocked}/{achievementStats.total} badges
              </span>
            </div>
          </div>
        </motion.button>
      </motion.div>

      {/* Invite a Friend — referral card */}
      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.15 }}
      >
        {(() => {
          // Build personal referral link from stored user ID
          const userId = (() => {
            try { return JSON.parse(localStorage.getItem('bytspot_user') || '{}').id || 'guest'; }
            catch { return 'guest'; }
          })();
          const referralUrl = `https://beta.bytspot.com?ref=${userId}`;

          const handleShare = async () => {
            if (navigator.share) {
              try {
                await navigator.share({
                  title: 'Join me on Bytspot',
                  text: '🔥 I\'m using Bytspot to navigate Atlanta Midtown like a local — crowd levels, parking, everything. Try it:',
                  url: referralUrl,
                });
              } catch { /* user cancelled */ }
            } else {
              navigator.clipboard.writeText(referralUrl).then(() =>
                toast.success('Link copied!', { description: referralUrl })
              );
            }
          };

          return (
            <div className="rounded-[24px] p-5 border-2 border-white/30 bg-gradient-to-br from-fuchsia-500/15 to-cyan-500/15 backdrop-blur-xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Invite a Friend</p>
                  <p className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>Share your personal Bytspot link</p>
                </div>
              </div>

              {/* Referral URL pill */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-[14px] bg-black/30 border border-white/20">
                <p className="flex-1 text-[12px] text-white/70 truncate" style={{ fontFamily: 'monospace' }}>
                  {referralUrl}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(referralUrl);
                    toast.success('Copied!');
                  }}
                  className="shrink-0 text-[11px] text-fuchsia-300 border border-fuchsia-500/40 rounded-full px-2.5 py-1 tap-target"
                  style={{ fontWeight: 600 }}
                >
                  Copy
                </button>
              </div>

              <motion.button
                onClick={handleShare}
                className="w-full py-3 rounded-[16px] bg-gradient-to-r from-fuchsia-600 to-cyan-600 flex items-center justify-center gap-2 shadow-lg tap-target"
                whileTap={{ scale: 0.97 }}
                transition={springConfig}
              >
                <Share2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>Share Invite Link</span>
              </motion.button>
            </div>
          );
        })()}
      </motion.div>

      {/* Menu Sections */}
      <div className="px-4 space-y-6">
        {menuSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 + sectionIndex * 0.05 }}
          >
            <h3 className="text-[13px] mb-3 px-2 text-white/80" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {section.title}
            </h3>
            <div className="rounded-[20px] overflow-hidden border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
              {section.items.map((item, index) => (
                <motion.button
                  key={item.label}
                  onClick={() => {
                    if (item.screen) {
                      setCurrentScreen(item.screen);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-4 ${
                    index !== section.items.length - 1 
                      ? 'border-b border-white/20'
                      : ''
                  } hover:bg-white/5`}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/15 text-white">
                    {item.icon}
                  </div>
                  <span className="flex-1 text-left text-[15px] text-white" style={{ fontWeight: 500 }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <div className="px-2.5 py-1 rounded-full text-[12px] bg-purple-500/40 text-purple-200 border border-purple-400/30" style={{ fontWeight: 600 }}>
                      {item.badge}
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2} />
                </motion.button>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Become a Host Button */}
        {onBecomeHost && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.25 }}
          >
            <motion.button
              onClick={() => {
                // Check if already a host
                const hostProfile = localStorage.getItem('bytspot_host_profile');
                if (hostProfile) {
                  // Already a host - go to dashboard
                  onBecomeHost();
                } else {
                  // New host - clear any partial onboarding and start fresh
                  localStorage.removeItem('bytspot_host_onboarding');
                  onBecomeHost();
                }
              }}
              className="w-full rounded-[20px] p-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-r from-purple-500/30 to-cyan-500/30 hover:from-purple-500/40 hover:to-cyan-500/40 shadow-xl"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
              <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                {localStorage.getItem('bytspot_host_profile') ? 'Host Dashboard' : 'Become a Host'}
              </span>
            </motion.button>
          </motion.div>
        )}

        {/* Valet Driver App Button */}
        {onBecomeValet && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.28 }}
          >
            <motion.button
              onClick={onBecomeValet}
              className="w-full rounded-[20px] p-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 hover:from-cyan-500/40 hover:to-blue-500/40 shadow-xl"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <Car className="w-5 h-5 text-white" strokeWidth={2.5} />
              <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Valet Driver App
              </span>
            </motion.button>
          </motion.div>
        )}

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <motion.button
            className="w-full rounded-[20px] p-4 flex items-center justify-center gap-2 border-2 bg-red-600/30 border-red-500/50 text-red-200 hover:bg-red-600/40 shadow-xl"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            onClick={() => {
              localStorage.removeItem('bytspot_auth_token');
              localStorage.removeItem('bytspot_user');
              localStorage.removeItem('bytspot_user_name');
              onLogout?.();
            }}
          >
            <LogOut className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[15px]" style={{ fontWeight: 600 }}>
              Log Out
            </span>
          </motion.button>
        </motion.div>

        {/* App Version */}
        <div className="text-center pb-4">
          <p className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>
            Bytspot v1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}
