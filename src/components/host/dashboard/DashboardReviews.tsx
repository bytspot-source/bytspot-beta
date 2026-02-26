import { motion } from 'motion/react';
import { Star, MessageSquare, TrendingUp } from 'lucide-react';
import { mockReviews, mockListings } from '../../../utils/hostMockData';
import { useState } from 'react';

interface DashboardReviewsProps {
  isDarkMode: boolean;
}

export function DashboardReviews({ isDarkMode }: DashboardReviewsProps) {
  const [responseText, setResponseText] = useState<Record<string, string>>({});

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const averageRating = mockListings.reduce((sum, l) => sum + l.rating, 0) / mockListings.length;
  const totalReviews = mockListings.reduce((sum, l) => sum + l.reviewCount, 0);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'}`}
        strokeWidth={2.5}
      />
    ));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          See what guests are saying
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-yellow-500/30 to-orange-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center">
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20">
              <TrendingUp className="w-3 h-3 text-green-400" strokeWidth={2.5} />
              <span className="text-[11px] text-green-400" style={{ fontWeight: 600 }}>
                +0.2
              </span>
            </div>
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {averageRating.toFixed(1)}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Average Rating
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6 text-purple-400" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {totalReviews}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Total Reviews
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E]/60 border-2 border-white/30 flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6 text-cyan-400" strokeWidth={2.5} />
          </div>
          <div className="text-[32px] text-white mb-1" style={{ fontWeight: 700 }}>
            {mockReviews.filter(r => !r.response).length}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
            Needs Response
          </div>
        </motion.div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {mockReviews.map((review, index) => (
          <motion.div
            key={review.id}
            className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.3 + index * 0.05 }}
          >
            {/* Review Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center">
                  <span className="text-[18px] text-white" style={{ fontWeight: 700 }}>
                    {review.guestName.charAt(0)}
                  </span>
                </div>

                <div>
                  <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {review.guestName}
                  </h3>
                  <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                    {review.listingTitle}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">{renderStars(review.rating)}</div>
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      {formatDate(review.date)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Review Comment */}
            <div className="rounded-xl p-4 bg-[#2C2C2E]/60 border-2 border-white/10 mb-4">
              <p className="text-[15px] text-white/90" style={{ fontWeight: 400, lineHeight: '1.6' }}>
                {review.comment}
              </p>
            </div>

            {/* Host Response or Input */}
            {review.response ? (
              <div className="rounded-xl p-4 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border-2 border-purple-400/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[13px] text-purple-400" style={{ fontWeight: 600 }}>
                    Your Response
                  </div>
                </div>
                <p className="text-[15px] text-white/90" style={{ fontWeight: 400, lineHeight: '1.6' }}>
                  {review.response}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  placeholder="Write a response to this review..."
                  value={responseText[review.id] || ''}
                  onChange={(e) =>
                    setResponseText({ ...responseText, [review.id]: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/20 text-white text-[15px] placeholder:text-white/50 outline-none focus:border-purple-400/50 resize-none"
                  rows={3}
                  style={{ fontWeight: 400 }}
                />
                <div className="flex justify-end gap-2">
                  <motion.button
                    className="px-6 py-2.5 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/20"
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 600 }}>
                      Cancel
                    </span>
                  </motion.button>
                  <motion.button
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30"
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                      Submit Response
                    </span>
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
