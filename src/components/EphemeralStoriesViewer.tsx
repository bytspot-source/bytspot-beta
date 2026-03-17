import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Heart, Send, MoreVertical, Volume2, VolumeX,
  Play, Pause, ChevronLeft, ChevronRight, MapPin,
  User, Clock, Eye, MessageCircle
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Story {
  id: number;
  type: 'photo' | 'video';
  url: string;
  thumbnail?: string;
  caption?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
    isHost: boolean;
  };
  venue?: {
    id: number;
    name: string;
  };
  stickers?: string[];
  views?: number;
  expiresAt: string;
}

interface StoryGroup {
  id: number;
  name: string;
  avatar?: string;
  isHost: boolean;
  venueId?: number;
  stories: Story[];
  hasUnviewed: boolean;
}

interface EphemeralStoriesViewerProps {
  storyGroups: StoryGroup[];
  initialGroupIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export function EphemeralStoriesViewer({
  storyGroups,
  initialGroupIndex = 0,
  isOpen,
  onClose,
  isDarkMode,
}: EphemeralStoriesViewerProps) {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(initialGroupIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const currentGroup = storyGroups[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex];
  const STORY_DURATION = 5000; // 5 seconds for photos

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  // Auto-advance stories
  useEffect(() => {
    if (!isOpen || isPaused || !currentStory) return;

    setProgress(0);

    if (currentStory.type === 'photo') {
      // Photo story - use timer
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + (100 / (STORY_DURATION / 50));
          if (newProgress >= 100) {
            goToNextStory();
            return 0;
          }
          return newProgress;
        });
      }, 50);

      progressIntervalRef.current = interval;
      return () => clearInterval(interval);
    } else {
      // Video story - sync with video duration
      const video = videoRef.current;
      if (!video) return;

      const updateProgress = () => {
        if (video.duration) {
          const newProgress = (video.currentTime / video.duration) * 100;
          setProgress(newProgress);
        }
      };

      const handleVideoEnd = () => {
        goToNextStory();
      };

      video.addEventListener('timeupdate', updateProgress);
      video.addEventListener('ended', handleVideoEnd);

      return () => {
        video.removeEventListener('timeupdate', updateProgress);
        video.removeEventListener('ended', handleVideoEnd);
      };
    }
  }, [isOpen, currentGroupIndex, currentStoryIndex, isPaused]);

  // Reset when group/story changes
  useEffect(() => {
    setProgress(0);
    setIsPaused(false);
    
    if (videoRef.current && currentStory?.type === 'video') {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [currentGroupIndex, currentStoryIndex]);

  const goToNextStory = () => {
    if (!currentGroup) return;

    if (currentStoryIndex < currentGroup.stories.length - 1) {
      // Next story in same group
      setCurrentStoryIndex(prev => prev + 1);
    } else if (currentGroupIndex < storyGroups.length - 1) {
      // Next group
      setCurrentGroupIndex(prev => prev + 1);
      setCurrentStoryIndex(0);
    } else {
      // End of all stories - defer to avoid setState during render
      setTimeout(() => {
        onClose();
      }, 0);
    }
  };

  const goToPreviousStory = () => {
    if (currentStoryIndex > 0) {
      // Previous story in same group
      setCurrentStoryIndex(prev => prev - 1);
    } else if (currentGroupIndex > 0) {
      // Previous group
      const prevGroupIndex = currentGroupIndex - 1;
      setCurrentGroupIndex(prevGroupIndex);
      setCurrentStoryIndex(storyGroups[prevGroupIndex].stories.length - 1);
    }
  };

  const handleTapLeft = () => {
    triggerHaptic();
    goToPreviousStory();
  };

  const handleTapRight = () => {
    triggerHaptic();
    goToNextStory();
  };

  const handleLongPressStart = () => {
    setIsPaused(true);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const handleLongPressEnd = () => {
    setIsPaused(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleLike = () => {
    triggerHaptic();
    toast.success('Liked!', {
      description: `You liked ${currentStory.author.name}'s story`,
      duration: 2000,
    });
  };

  const handleReply = () => {
    if (!replyText.trim()) return;
    
    triggerHaptic();
    toast.success('Reply Sent!', {
      description: `Sent to ${currentStory.author.name}`,
      duration: 2000,
    });
    setReplyText('');
    setShowReply(false);
  };

  const toggleMute = () => {
    triggerHaptic();
    setIsMuted(!isMuted);
  };

  if (!isOpen || !currentGroup || !currentStory) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Story Content */}
          <div className="relative w-full h-full">
            {/* Media */}
            <div className="absolute inset-0">
              {currentStory.type === 'photo' ? (
                <ImageWithFallback
                  src={currentStory.url}
                  alt={currentStory.caption || 'Story'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  src={currentStory.url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop={false}
                  muted={isMuted}
                  playsInline
                />
              )}
            </div>

            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />

            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 z-10 px-2 pt-4 flex gap-1">
              {currentGroup.stories.map((_, index) => (
                <div
                  key={index}
                  className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
                >
                  <motion.div
                    className="h-full bg-white rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        index < currentStoryIndex
                          ? '100%'
                          : index === currentStoryIndex
                          ? `${progress}%`
                          : '0%',
                    }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              ))}
            </div>

            {/* Top Bar */}
            <div className="absolute top-8 left-0 right-0 z-10 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Author Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white">
                    {currentStory.author.avatar ? (
                      <ImageWithFallback
                        src={currentStory.author.avatar}
                        alt={currentStory.author.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>

                  {/* Author Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] text-white truncate" style={{ fontWeight: 700 }}>
                        {currentStory.author.name}
                      </h3>
                      {currentStory.author.isHost && (
                        <div className="px-2 py-0.5 rounded-full bg-purple-500/80 border border-purple-400">
                          <span className="text-[9px] text-white" style={{ fontWeight: 700 }}>
                            HOST
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {currentStory.venue && (
                        <>
                          <MapPin className="w-3 h-3 text-white/80" strokeWidth={2.5} />
                          <span className="text-[12px] text-white/80 truncate" style={{ fontWeight: 500 }}>
                            {currentStory.venue.name}
                          </span>
                          <span className="text-white/60">•</span>
                        </>
                      )}
                      <Clock className="w-3 h-3 text-white/80" strokeWidth={2.5} />
                      <span className="text-[12px] text-white/80" style={{ fontWeight: 500 }}>
                        {currentStory.timestamp}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  {currentStory.type === 'video' && (
                    <motion.button
                      onClick={toggleMute}
                      className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/30 flex items-center justify-center"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                    >
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-white" strokeWidth={2.5} />
                      ) : (
                        <Volume2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                      )}
                    </motion.button>
                  )}

                  <motion.button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/30 flex items-center justify-center"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Tap Areas for Navigation */}
            <div className="absolute inset-0 z-[5] flex">
              {/* Left tap area */}
              <div
                className="flex-1"
                onClick={handleTapLeft}
                onTouchStart={handleLongPressStart}
                onTouchEnd={handleLongPressEnd}
                onMouseDown={handleLongPressStart}
                onMouseUp={handleLongPressEnd}
              />
              {/* Right tap area */}
              <div
                className="flex-1"
                onClick={handleTapRight}
                onTouchStart={handleLongPressStart}
                onTouchEnd={handleLongPressEnd}
                onMouseDown={handleLongPressStart}
                onMouseUp={handleLongPressEnd}
              />
            </div>

            {/* Caption & Stickers */}
            {(currentStory.caption || (currentStory.stickers && currentStory.stickers.length > 0)) && (
              <div className="absolute bottom-32 left-0 right-0 z-10 px-4">
                {currentStory.caption && (
                  <div className="mb-3">
                    <p className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                      {currentStory.caption}
                    </p>
                  </div>
                )}
                
                {currentStory.stickers && currentStory.stickers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {currentStory.stickers.map((sticker, index) => (
                      <div
                        key={index}
                        className="px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-xl border border-white/40"
                      >
                        <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                          {sticker}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions */}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-8">
              <div className="flex items-center gap-3">
                {/* Reply Input */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => {
                      setShowReply(true);
                      setIsPaused(true);
                      if (videoRef.current) videoRef.current.pause();
                    }}
                    onBlur={() => {
                      if (!replyText) {
                        setShowReply(false);
                        setIsPaused(false);
                        if (videoRef.current) videoRef.current.play();
                      }
                    }}
                    placeholder={`Reply to ${currentStory.author.name}...`}
                    className="w-full px-4 py-3 rounded-full bg-black/40 backdrop-blur-xl border-2 border-white/30 text-white placeholder:text-white/60 text-[14px] outline-none"
                    style={{ fontWeight: 500 }}
                  />
                  {replyText && (
                    <motion.button
                      onClick={handleReply}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </div>

                {/* Like Button */}
                <motion.button
                  onClick={handleLike}
                  className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center flex-shrink-0"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Heart className="w-5 h-5 text-white" strokeWidth={2.5} />
                </motion.button>

                {/* Share Button */}
                <motion.button
                  onClick={() => {
                    triggerHaptic();
                    toast.success('Link Copied', {
                      description: 'Story link copied to clipboard',
                      duration: 2000,
                    });
                  }}
                  className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-xl border-2 border-white/30 flex items-center justify-center flex-shrink-0"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Send className="w-5 h-5 text-white" strokeWidth={2.5} />
                </motion.button>
              </div>

              {/* Views Counter */}
              {currentStory.views && (
                <div className="flex items-center gap-1.5 mt-3 justify-center">
                  <Eye className="w-4 h-4 text-white/70" strokeWidth={2.5} />
                  <span className="text-[12px] text-white/70" style={{ fontWeight: 500 }}>
                    {currentStory.views} views
                  </span>
                </div>
              )}
            </div>

            {/* Pause Indicator */}
            <AnimatePresence>
              {isPaused && (
                <motion.div
                  className="absolute inset-0 z-[6] flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-xl border-2 border-white/40 flex items-center justify-center">
                    <Pause className="w-8 h-8 text-white" strokeWidth={2.5} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
