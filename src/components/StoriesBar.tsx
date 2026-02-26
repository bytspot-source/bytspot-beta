import { motion } from 'motion/react';
import { Plus, User } from 'lucide-react';
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

interface StoriesBarProps {
  storyGroups: StoryGroup[];
  onStoryClick: (index: number) => void;
  onCreateStory: () => void;
  isDarkMode: boolean;
}

export function StoriesBar({ storyGroups, onStoryClick, onCreateStory, isDarkMode }: StoriesBarProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  return (
    <div className="px-4 pb-2">
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
        <div className="flex gap-3 pb-1">
          {/* Create Story Button */}
          <motion.button
            onClick={() => {
              triggerHaptic();
              onCreateStory();
            }}
            className="flex-shrink-0 flex flex-col items-center gap-2"
            whileTap={{ scale: 0.95 }}
            transition={springConfig}
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-dashed border-purple-400/60 flex items-center justify-center">
                <Plus className="w-6 h-6 text-purple-400" strokeWidth={2.5} />
              </div>
            </div>
            <span className="text-[11px] text-white/80 max-w-[68px] truncate" style={{ fontWeight: 500 }}>
              Your Story
            </span>
          </motion.button>

          {/* Story Groups */}
          {storyGroups.map((group, index) => (
            <motion.button
              key={group.id}
              onClick={() => {
                triggerHaptic();
                onStoryClick(index);
              }}
              className="flex-shrink-0 flex flex-col items-center gap-2"
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
            >
              <div className="relative">
                {/* Gradient Ring for Unviewed */}
                {group.hasUnviewed && (
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-[2.5px]">
                    <div className="w-full h-full rounded-full bg-black" />
                  </div>
                )}
                
                {/* Avatar */}
                <div className={`relative w-16 h-16 rounded-full overflow-hidden ${group.hasUnviewed ? 'ring-2 ring-transparent' : 'border-2 border-white/30'}`}>
                  <div className="absolute inset-0.5 rounded-full overflow-hidden">
                    {group.avatar ? (
                      <ImageWithFallback
                        src={group.avatar}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <User className="w-7 h-7 text-white" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Host Badge */}
                {group.isHost && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2">
                    <div className="px-1.5 py-0.5 rounded-full bg-purple-500 border border-black">
                      <span className="text-[8px] text-white" style={{ fontWeight: 700 }}>
                        HOST
                      </span>
                    </div>
                  </div>
                )}

                {/* Story Count Badge */}
                {group.stories.length > 1 && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-black flex items-center justify-center">
                      <span className="text-[10px] text-white" style={{ fontWeight: 700 }}>
                        {group.stories.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Name */}
              <span className="text-[11px] text-white/80 max-w-[68px] truncate" style={{ fontWeight: 500 }}>
                {group.name}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
