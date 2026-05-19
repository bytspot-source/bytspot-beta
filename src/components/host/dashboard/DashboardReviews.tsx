import { motion } from 'motion/react';
import { Flag, MessageSquare, Reply, ShieldCheck, Star } from 'lucide-react';
import { type ProviderDashboardAccess } from './providerDashboardAccess';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';

interface DashboardReviewsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

// Provider-side moderation list. Backend aggregate query for provider reviews
// is not yet wired (existing trpc.reviews.* endpoints are venue-keyed); when
// the aggregate query lands, this array is the only thing that needs to be
// populated and the rest of the surface — counts, guidance, CTA gating —
// already reacts to its contents.
type ProviderReviewSummary = {
  id: string;
  guestName: string;
  serviceTitle: string;
  stars: number;
  comment: string;
  createdAt: string;
  needsResponse: boolean;
};

export function DashboardReviews({ isDarkMode, access }: DashboardReviewsProps) {
  void isDarkMode;
  const data = useProviderDashboardData();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const reviews: ProviderReviewSummary[] = [];
  const totalReviews = reviews.length;
  const needsResponseCount = reviews.filter((review) => review.needsResponse).length;
  const averageRatingDisplay = totalReviews === 0
    ? '—'
    : (reviews.reduce((acc, review) => acc + review.stars, 0) / totalReviews).toFixed(1);

  // Role-aware moderation matrix. Owners moderate everything; managers reply
  // (escalation/flagging stays owner-only); staff are read-only on this surface.
  const canReply = access.role === 'owner' || access.role === 'manager';
  const canFlag = access.role === 'owner';
  const canResolve = access.role === 'owner';
  const moderationGuidance = access.role === 'staff'
    ? 'Staff mode shows guest reviews for context. Replies, flags, and escalations are reserved for managers and owners.'
    : access.role === 'manager'
      ? 'Manager mode replies to reviews and tracks response time. Flagging and resolution stay owner-only to keep escalation paths clean.'
      : 'Owner mode can reply, flag inappropriate content, and mark threads resolved. Response time directly impacts marketplace ranking.';

  const emptyStateCopy = !data.authenticated
    ? 'Sign in to load guest reviews tied to your services.'
    : data.error
      ? data.error
      : data.loading
        ? 'Loading reviews from your services…'
        : data.totalServices === 0
          ? 'Publish your first marketplace service so guests can leave reviews here.'
          : 'Guest reviews appear here after completed bookings. Reply directly from this view to keep your response time strong.';
  const emptyStateHeading = data.loading ? 'Loading reviews…' : 'No reviews yet';

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Reviews
        </h1>
        <p className="text-[17px] text-slate-100" style={{ fontWeight: 500 }}>
          See what guests are saying
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="provider-reviews-stats">
        <motion.div
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
          data-testid="provider-reviews-stat-rating"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-500 bg-slate-700">
            <Star className="h-6 w-6 text-slate-100" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {averageRatingDisplay}
          </div>
          <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
            Average Rating
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
          data-testid="provider-reviews-stat-total"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-500 bg-slate-700">
            <MessageSquare className="h-6 w-6 text-slate-100" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {totalReviews}
          </div>
          <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
            Total Reviews
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
          data-testid="provider-reviews-stat-needs-response"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-500 bg-slate-700">
            <MessageSquare className="h-6 w-6 text-slate-100" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {needsResponseCount}
          </div>
          <div className="text-[13px] text-slate-100" style={{ fontWeight: 600 }}>
            Needs Response
          </div>
        </motion.div>
      </div>

      {/* Moderation guidance + role-aware actions */}
      <motion.div
        className="rounded-[22px] border border-slate-500 bg-slate-800 p-5 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.25 }}
        data-testid="provider-reviews-moderation"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-cyan-200" strokeWidth={2.5} />
          <p className="text-[13px] uppercase tracking-[0.18em] text-slate-200" style={{ fontWeight: 850 }}>
            Moderation
          </p>
        </div>
        <p className="mt-2 text-[14px] leading-6 text-slate-100" data-testid="provider-reviews-moderation-guidance">
          {moderationGuidance}
        </p>
        {access.role !== 'staff' && (
          <div className="mt-4 grid gap-2 md:grid-cols-3" data-testid="provider-reviews-moderation-actions">
            <button
              type="button"
              disabled={!canReply || totalReviews === 0}
              data-testid="provider-reviews-moderation-cta-reply"
              className="flex items-center justify-center gap-2 rounded-[14px] border border-slate-500 bg-slate-700 px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              <Reply className="h-4 w-4" /> Reply
            </button>
            <button
              type="button"
              disabled={!canFlag || totalReviews === 0}
              data-testid="provider-reviews-moderation-cta-flag"
              className="flex items-center justify-center gap-2 rounded-[14px] border border-slate-500 bg-slate-700 px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              <Flag className="h-4 w-4" /> Flag
            </button>
            <button
              type="button"
              disabled={!canResolve || totalReviews === 0}
              data-testid="provider-reviews-moderation-cta-resolve"
              className="flex items-center justify-center gap-2 rounded-[14px] border border-slate-500 bg-slate-700 px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" /> Mark Resolved
            </button>
          </div>
        )}
      </motion.div>

      {/* Reviews empty state */}
      {totalReviews === 0 && (
        <motion.div
          className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-12 text-center shadow-xl shadow-black/45"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
          data-testid="provider-reviews-empty"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-500 bg-slate-700">
            <Star className="h-7 w-7 text-slate-100" strokeWidth={2.5} />
          </div>
          <p className="text-[17px] text-white" style={{ fontWeight: 700 }}>
            {emptyStateHeading}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-slate-100" style={{ fontWeight: 500 }}>
            {emptyStateCopy}
          </p>
        </motion.div>
      )}
    </div>
  );
}
