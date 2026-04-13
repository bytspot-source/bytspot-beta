import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Star, Award, TrendingUp, Zap, Gift,
  ChevronRight, Lock, Check, Trophy, Crown, Sparkles,
  Clock, Calendar, Target, Users, MapPin, Camera, UserPlus, UserCheck
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { isFollowing, followUser, unfollowUser, getFollowedUsers } from '../utils/social';
import {
  getUserPoints,
  getUserTier,
  getNextTierInfo,
  getUserAchievements,
  getAchievementStats,
  getPointTransactions,
  getLeaderboard,
  getRarityColor,
  TIERS,
  type Achievement,
  type PointTransaction,
  type MembershipTier,
  type LeaderboardEntry,
} from '../utils/gamification';

interface BytspotPointsProps {
  isDarkMode: boolean;
  onBack: () => void;
}

type ViewMode = 'overview' | 'achievements' | 'history' | 'rewards' | 'leaderboard';

export function BytspotPoints({ isDarkMode, onBack }: BytspotPointsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [points, setPoints] = useState(getUserPoints());
  const [tierInfo, setTierInfo] = useState(getNextTierInfo(points.total));
  const [achievements, setAchievements] = useState(getUserAchievements());
  const [achievementStats, setAchievementStats] = useState(getAchievementStats());
  const [transactions, setTransactions] = useState(getPointTransactions());
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  useEffect(() => {
    // Refresh data when view changes
    setPoints(getUserPoints());
    setTierInfo(getNextTierInfo(getUserPoints().total));
    setAchievements(getUserAchievements());
    setAchievementStats(getAchievementStats());
    setTransactions(getPointTransactions());
  }, [viewMode]);

  const getTierIcon = (tier: MembershipTier) => {
    return TIERS[tier].icon;
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderOverview = () => (
    <div className="px-4 space-y-6">
      {/* Points Balance Card */}
      <motion.div
        className="rounded-[24px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl shadow-xl relative overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            <span className="text-[13px] text-purple-200" style={{ fontWeight: 600 }}>
              YOUR BALANCE
            </span>
          </div>
          
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-[48px] text-white" style={{ fontWeight: 700 }}>
              {points.total.toLocaleString()}
            </span>
            <span className="text-[20px] text-white/80" style={{ fontWeight: 600 }}>
              points
            </span>
          </div>

          {points.pending > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-400/30 w-fit">
              <Clock className="w-3.5 h-3.5 text-yellow-400" strokeWidth={2.5} />
              <span className="text-[12px] text-yellow-200" style={{ fontWeight: 600 }}>
                {points.pending} pending
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Current Tier Card */}
      <motion.div
        className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${tierInfo.currentTier.gradient} flex items-center justify-center text-[24px]`}>
              {getTierIcon(tierInfo.currentTier.level)}
            </div>
            <div>
              <h3 className="text-[20px] text-white" style={{ fontWeight: 700 }}>
                {tierInfo.currentTier.name} Member
              </h3>
              <p className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                {tierInfo.currentTier.discount}% discount on all services
              </p>
            </div>
          </div>
          <Crown className="w-6 h-6 text-white/40" strokeWidth={2.5} />
        </div>

        {tierInfo.nextTier && (
          <>
            <div className="mb-3">
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  Progress to {tierInfo.nextTier.name}
                </span>
                <span className="text-white" style={{ fontWeight: 700 }}>
                  {tierInfo.pointsToNext.toLocaleString()} points needed
                </span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full bg-gradient-to-r ${tierInfo.nextTier.gradient}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${tierInfo.progress}%` }}
                  transition={{ ...springConfig, delay: 0.3 }}
                />
              </div>
            </div>

            <div className="p-3 rounded-[12px] bg-white/5 border border-white/10">
              <p className="text-[12px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
                Next tier unlocks:
              </p>
              <div className="space-y-1">
                {tierInfo.nextTier.benefits.slice(0, 2).map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-cyan-400" strokeWidth={2.5} />
                    <span className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.2 }}
      >
        <div className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-yellow-400" strokeWidth={2.5} />
            <span className="text-[11px] text-white/60" style={{ fontWeight: 600 }}>
              ACHIEVEMENTS
            </span>
          </div>
          <p className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            {achievementStats.unlocked}/{achievementStats.total}
          </p>
        </div>

        <div className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400" strokeWidth={2.5} />
            <span className="text-[11px] text-white/60" style={{ fontWeight: 600 }}>
              LIFETIME
            </span>
          </div>
          <p className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            {points.lifetime.toLocaleString()}
          </p>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        className="space-y-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.25 }}
      >
        <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
          Explore
        </h3>

        <motion.button
          onClick={() => setViewMode('achievements')}
          className="w-full rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl flex items-center justify-between tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/40 to-fuchsia-500/40 border-2 border-purple-400/30 flex items-center justify-center">
              <Award className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                View Achievements
              </p>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {Math.round(achievementStats.progress)}% complete
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2.5} />
        </motion.button>

        <motion.button
          onClick={() => setViewMode('history')}
          className="w-full rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl flex items-center justify-between tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Points History
              </p>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {transactions.length} transactions
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2.5} />
        </motion.button>

        <motion.button
          onClick={() => setViewMode('rewards')}
          className="w-full rounded-[20px] p-4 border-2 border-white/30 bg-gradient-to-br from-orange-500/20 to-pink-500/20 backdrop-blur-xl shadow-xl flex items-center justify-between tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/60 to-pink-500/60 border-2 border-orange-400/30 flex items-center justify-center">
              <Gift className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Redeem Rewards
              </p>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Special offers available
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2.5} />
        </motion.button>

        <motion.button
          onClick={() => setViewMode('leaderboard')}
          className="w-full rounded-[20px] p-4 border-2 border-white/30 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 backdrop-blur-xl shadow-xl flex items-center justify-between tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500/60 to-amber-500/60 border-2 border-yellow-400/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                Leaderboard
              </p>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                See how you rank this week
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2.5} />
        </motion.button>
      </motion.div>
    </div>
  );

  const renderAchievements = () => (
    <div className="px-4 space-y-6">
      {/* Stats Overview */}
      <motion.div
        className="rounded-[20px] p-4 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-purple-200 mb-1" style={{ fontWeight: 600 }}>
              ACHIEVEMENTS
            </p>
            <p className="text-[28px] text-white" style={{ fontWeight: 700 }}>
              {achievementStats.unlocked}/{achievementStats.total}
            </p>
          </div>
          <div className="text-right">
            <div className="w-16 h-16 rounded-full bg-white/10 border-4 border-white/20 flex items-center justify-center mb-1">
              <span className="text-[16px] text-white" style={{ fontWeight: 700 }}>
                {Math.round(achievementStats.progress)}%
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-2 gap-3">
        {achievements.map((achievement, index) => (
          <motion.button
            key={achievement.id}
            onClick={() => setSelectedAchievement(achievement)}
            className={`rounded-[20px] p-4 border-2 backdrop-blur-xl shadow-xl relative overflow-hidden ${
              achievement.unlocked
                ? 'border-white/30 bg-[#1C1C1E]/80'
                : 'border-white/20 bg-[#1C1C1E]/40'
            }`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springConfig, delay: 0.1 + index * 0.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {achievement.unlocked && (
              <div className="absolute top-2 right-2">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
              </div>
            )}

            <div className="text-[32px] mb-2 opacity-90">
              {achievement.unlocked ? achievement.icon : '🔒'}
            </div>

            <h4 className={`text-[14px] mb-1 ${achievement.unlocked ? 'text-white' : 'text-white/50'}`} style={{ fontWeight: 600 }}>
              {achievement.name}
            </h4>

            <div className={`flex items-center gap-1.5 mb-2 ${achievement.unlocked ? 'text-white/70' : 'text-white/40'}`}>
              <Target className="w-3 h-3" strokeWidth={2.5} />
              <span className="text-[11px]" style={{ fontWeight: 500 }}>
                {achievement.progress}/{achievement.requirement}
              </span>
            </div>

            <div className={`px-2 py-0.5 rounded-full text-[10px] inline-block bg-gradient-to-r ${getRarityColor(achievement.rarity)}`} style={{ fontWeight: 600 }}>
              {achievement.rarity}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="px-4 space-y-4">
      <motion.div
        className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <p className="text-[13px] text-white/60 mb-1" style={{ fontWeight: 600 }}>
          LAST 30 DAYS
        </p>
        <p className="text-[24px] text-white" style={{ fontWeight: 700 }}>
          +{transactions.slice(0, 30).reduce((sum, txn) => sum + (txn.type === 'earn' || txn.type === 'bonus' ? txn.amount : 0), 0).toLocaleString()} points
        </p>
      </motion.div>

      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-white/40 mx-auto mb-3" strokeWidth={2} />
            <p className="text-[15px] text-white/60" style={{ fontWeight: 500 }}>
              No transactions yet
            </p>
          </div>
        ) : (
          transactions.map((txn, index) => (
            <motion.div
              key={txn.id}
              className="rounded-[16px] p-4 border-2 border-white/20 bg-[#1C1C1E]/60 backdrop-blur-xl"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springConfig, delay: 0.1 + index * 0.03 }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {txn.description}
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    {formatDate(txn.timestamp)}
                  </p>
                </div>
                <div className={`text-[17px] ${
                  txn.type === 'spend' ? 'text-red-400' : txn.type === 'bonus' ? 'text-purple-400' : 'text-green-400'
                }`} style={{ fontWeight: 700 }}>
                  {txn.type === 'spend' ? '-' : '+'}{txn.amount}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );

  const renderRewards = () => (
    <div className="px-4 space-y-4">
      <motion.div
        className="rounded-[20px] p-4 border-2 border-white/30 bg-gradient-to-br from-orange-500/20 to-pink-500/20 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Gift className="w-5 h-5 text-orange-400" strokeWidth={2.5} />
          <span className="text-[13px] text-orange-200" style={{ fontWeight: 600 }}>
            AVAILABLE BALANCE
          </span>
        </div>
        <p className="text-[32px] text-white" style={{ fontWeight: 700 }}>
          {points.total.toLocaleString()} pts
        </p>
      </motion.div>

      {/* Reward options */}
      <div className="space-y-3">
        {[
          { name: '$5 Parking Credit', points: 500, icon: MapPin, color: 'from-cyan-500 to-blue-500' },
          { name: '$10 Valet Discount', points: 1000, icon: Star, color: 'from-purple-500 to-fuchsia-500' },
          { name: 'Free Premium Upgrade', points: 1500, icon: Crown, color: 'from-yellow-400 to-orange-500' },
          { name: '$25 Service Credit', points: 2500, icon: Zap, color: 'from-green-500 to-emerald-500' },
        ].map((reward, index) => {
          const canAfford = points.total >= reward.points;
          const Icon = reward.icon;

          return (
            <motion.button
              key={reward.name}
              onClick={() => {
                if (canAfford) {
                  toast.success('Reward Selected!', {
                    description: 'Reward redemption is being processed',
                  });
                } else {
                  toast.error('Insufficient Points', {
                    description: `You need ${(reward.points - points.total).toLocaleString()} more points`,
                  });
                }
              }}
              className={`w-full rounded-[20px] p-4 border-2 backdrop-blur-xl shadow-xl ${
                canAfford
                  ? 'border-white/30 bg-[#1C1C1E]/80'
                  : 'border-white/20 bg-[#1C1C1E]/40 opacity-60'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.15 + index * 0.05 }}
              whileTap={canAfford ? { scale: 0.98 } : {}}
              disabled={!canAfford}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${reward.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="text-left">
                    <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {reward.name}
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      {reward.points.toLocaleString()} points
                    </p>
                  </div>
                </div>
                {canAfford ? (
                  <ChevronRight className="w-5 h-5 text-white/60" strokeWidth={2.5} />
                ) : (
                  <Lock className="w-5 h-5 text-white/40" strokeWidth={2.5} />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="rounded-[16px] p-4 bg-purple-500/10 border border-purple-400/30">
        <p className="text-[13px] text-purple-200 text-center" style={{ fontWeight: 500 }}>
          💡 Earn more points by checking in, reviewing venues, and referring friends!
        </p>
      </div>
    </div>
  );

  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(getFollowedUsers().map((u) => u.userId))
  );

  const handleToggleFollow = (userId: string, name: string, tier: string) => {
    if (isFollowing(userId)) {
      unfollowUser(userId);
      setFollowedIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      toast(`Unfollowed ${name}`);
    } else {
      followUser(userId, name, tier);
      setFollowedIds((prev) => new Set([...prev, userId]));
      toast.success(`Following ${name} — their check-ins now show in your Friends feed`);
    }
  };

  const renderLeaderboard = () => {
    const { entries, userRank, userPoints: myPoints } = getLeaderboard();
    const medalColors: Record<number, string> = { 1: 'text-yellow-400', 2: 'text-gray-300', 3: 'text-amber-600' };
    return (
      <div className="px-4 space-y-4">
        {/* Your rank banner */}
        <motion.div
          className="rounded-[20px] p-4 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.05 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-white/60 mb-1" style={{ fontWeight: 600 }}>YOUR RANK THIS WEEK</p>
              <p className="text-[36px] text-white" style={{ fontWeight: 700 }}>#{userRank}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-white/60 mb-1" style={{ fontWeight: 600 }}>YOUR POINTS</p>
              <p className="text-[28px] text-white" style={{ fontWeight: 700 }}>{myPoints.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        {/* Top 10 */}
        <div className="rounded-[20px] border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-[13px] text-white/60" style={{ fontWeight: 700 }}>🏆 TOP 10 THIS WEEK</p>
          </div>
          {entries.map((entry, i) => {
            const followed = followedIds.has(entry.userId);
            return (
              <motion.div
                key={entry.userId}
                className={`flex items-center gap-3 px-4 py-3 ${entry.isCurrentUser ? 'bg-purple-500/20 border-l-4 border-purple-400' : ''} ${i < entries.length - 1 ? 'border-b border-white/10' : ''}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springConfig, delay: 0.05 + i * 0.04 }}
              >
                {/* Rank */}
                <div className="w-8 text-center">
                  {entry.rank <= 3
                    ? <span className={`text-[20px] ${medalColors[entry.rank]}`}>{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</span>
                    : <span className="text-[14px] text-white/50" style={{ fontWeight: 700 }}>#{entry.rank}</span>
                  }
                </div>
                {/* Name */}
                <div className="flex-1">
                  <p className={`text-[15px] ${entry.isCurrentUser ? 'text-purple-300' : 'text-white'}`} style={{ fontWeight: entry.isCurrentUser ? 700 : 600 }}>
                    {entry.name}{entry.isCurrentUser ? ' (You)' : ''}
                  </p>
                </div>
                {/* Tier badge */}
                <span className="text-[18px]">{TIERS[entry.tier].icon}</span>
                {/* Points */}
                <p className="text-[14px] text-white/80 w-14 text-right" style={{ fontWeight: 700 }}>
                  {entry.points.toLocaleString()}
                </p>
                {/* Follow button — skip for current user */}
                {!entry.isCurrentUser && (
                  <motion.button
                    onClick={() => handleToggleFollow(entry.userId, entry.name, entry.tier)}
                    className={`ml-1 w-8 h-8 rounded-full flex items-center justify-center border-2 tap-target ${followed ? 'bg-purple-500/30 border-purple-400/60' : 'bg-white/10 border-white/20'}`}
                    whileTap={{ scale: 0.88 }}
                    transition={springConfig}
                    title={followed ? `Unfollow ${entry.name}` : `Follow ${entry.name}`}
                  >
                    {followed
                      ? <UserCheck className="w-4 h-4 text-purple-300" strokeWidth={2.5} />
                      : <UserPlus className="w-4 h-4 text-white/60" strokeWidth={2.5} />
                    }
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>
        <p className="text-[12px] text-white/30 text-center pb-2">Leaderboard resets every Monday</p>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.button
          onClick={viewMode === 'overview' ? onBack : () => setViewMode('overview')}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">
          {viewMode === 'overview' && 'Bytspot Points'}
          {viewMode === 'achievements' && 'Achievements'}
          {viewMode === 'history' && 'Points History'}
          {viewMode === 'rewards' && 'Redeem Rewards'}
          {viewMode === 'leaderboard' && 'Leaderboard'}
        </h1>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {viewMode === 'overview' && renderOverview()}
          {viewMode === 'achievements' && renderAchievements()}
          {viewMode === 'history' && renderHistory()}
          {viewMode === 'rewards' && renderRewards()}
          {viewMode === 'leaderboard' && renderLeaderboard()}
        </motion.div>
      </AnimatePresence>

      {/* Achievement Detail Modal */}
      <AnimatePresence>
        {selectedAchievement && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAchievement(null)}
            />
            
            <motion.div
              className="fixed inset-x-0 bottom-0 max-w-[393px] mx-auto bg-[#1C1C1E] rounded-t-[28px] p-6 z-50 border-t-2 border-white/30"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springConfig}
            >
              <div className="text-center mb-4">
                <div className="text-[64px] mb-3">
                  {selectedAchievement.unlocked ? selectedAchievement.icon : '🔒'}
                </div>
                <h3 className="text-[22px] text-white mb-2" style={{ fontWeight: 700 }}>
                  {selectedAchievement.name}
                </h3>
                <p className="text-[15px] text-white/70 mb-4" style={{ fontWeight: 400 }}>
                  {selectedAchievement.description}
                </p>

                <div className={`inline-block px-3 py-1.5 rounded-full text-[12px] bg-gradient-to-r ${getRarityColor(selectedAchievement.rarity)} mb-4`} style={{ fontWeight: 700 }}>
                  {selectedAchievement.rarity.toUpperCase()}
                </div>

                <div className="rounded-[16px] p-4 bg-white/5 border border-white/10 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      Progress
                    </span>
                    <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                      {selectedAchievement.progress}/{selectedAchievement.requirement}
                    </span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r ${getRarityColor(selectedAchievement.rarity)}`}
                      style={{ width: `${(selectedAchievement.progress / selectedAchievement.requirement) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-yellow-400">
                  <Star className="w-5 h-5 fill-yellow-400" strokeWidth={2.5} />
                  <span className="text-[17px]" style={{ fontWeight: 700 }}>
                    {selectedAchievement.reward} points reward
                  </span>
                </div>
              </div>

              <motion.button
                onClick={() => setSelectedAchievement(null)}
                className="w-full rounded-[16px] px-6 py-4 bg-white/10 border-2 border-white/20 text-white tap-target"
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <span className="text-[17px]" style={{ fontWeight: 600 }}>
                  Close
                </span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
